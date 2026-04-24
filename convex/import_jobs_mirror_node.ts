"use node"

import {
    MAX_FILE_SIZE,
    MAX_TOKENS_PER_FILE,
    estimateTokenCount,
    getCorrectMimeType,
    getFileTypeInfo,
    isImageMimeType,
    isSupportedFile
} from "@/lib/file_constants"
import type { ActionCtx } from "./_generated/server"
import { r2 } from "./attachments"
import { ensureAttachmentFilename } from "./lib/thread_import_core"

const sanitizeKeySegment = (name: string) =>
    name
        .normalize("NFD")
        .replace(
            /\u0300|\u0301|\u0302|\u0303|\u0304|\u0305|\u0306|\u0307|\u0308|\u0309|\u030A|\u030B|\u030C|\u030D|\u030E|\u030F|\u0310|\u0311|\u0312|\u0313|\u0314|\u0315|\u0316|\u0317|\u0318|\u0319|\u031A|\u031B|\u031C|\u031D|\u031E|\u031F|\u0320|\u0321|\u0322|\u0323|\u0324|\u0325|\u0326|\u0327|\u0328|\u0329|\u032A|\u032B|\u032C|\u032D|\u032E|\u032F|\u0330|\u0331|\u0332|\u0333|\u0334|\u0335|\u0336|\u0337|\u0338|\u0339|\u033A|\u033B|\u033C|\u033D|\u033E|\u033F|\u0340|\u0341|\u0342|\u0343|\u0344|\u0345|\u0346|\u0347|\u0348|\u0349|\u034A|\u034B|\u034C|\u034D|\u034E|\u034F|\u0350|\u0351|\u0352|\u0353|\u0354|\u0355|\u0356|\u0357|\u0358|\u0359|\u035A|\u035B|\u035C|\u035D|\u035E|\u035F|\u0360|\u0361|\u0362|\u0363|\u0364|\u0365|\u0366|\u0367|\u0368|\u0369|\u036A|\u036B|\u036C|\u036D|\u036E|\u036F/g,
            ""
        )
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 120) || "file"

const IMAGE_COMPRESSION_CUTOFF_BYTES = 25 * 1024 * 1024
const IMAGE_COMPRESSION_STEPS = [
    { quality: 86, maxDimension: 4096 },
    { quality: 78, maxDimension: 3072 },
    { quality: 68, maxDimension: 2560 },
    { quality: 56, maxDimension: 2048 }
] as const

let sharpPromise: Promise<typeof import("sharp")> | null = null

const getSharp = () => {
    if (!sharpPromise) {
        const resolved = import.meta.resolve?.("sharp")
        sharpPromise = resolved
            ? (import(resolved) as Promise<typeof import("sharp")>)
            : (Function("return import('sharp')")() as Promise<typeof import("sharp")>)
    }

    return sharpPromise
}

const compressImageToLimit = async ({
    bytes,
    fileName
}: {
    bytes: Uint8Array
    fileName: string
}) => {
    const sharp = await getSharp()
    const metadata = await sharp(bytes, { failOn: "none" }).metadata()
    const width = metadata.width ?? 0
    const height = metadata.height ?? 0
    const largestSide = Math.max(width, height)

    for (const step of IMAGE_COMPRESSION_STEPS) {
        const resize =
            largestSide > 0
                ? {
                      width:
                          width > height
                              ? Math.max(1, Math.floor(width * (step.maxDimension / largestSide)))
                              : undefined,
                      height:
                          height >= width
                              ? Math.max(1, Math.floor(height * (step.maxDimension / largestSide)))
                              : undefined,
                      fit: "inside" as const,
                      withoutEnlargement: true
                  }
                : undefined

        const compressed = await sharp(bytes, { failOn: "none" })
            .rotate()
            .resize(resize)
            .webp({ quality: step.quality })
            .toBuffer()

        if (compressed.byteLength <= MAX_FILE_SIZE) {
            const fileNameBase = fileName.replace(/\.[^.]+$/, "") || "attachment"
            return {
                bytes: new Uint8Array(compressed),
                fileName: `${fileNameBase}.webp`,
                mimeType: "image/webp"
            }
        }
    }

    throw new Error("Could not compress image below 5MB")
}

const prepareImportedAttachmentForUpload = async ({
    bytes,
    fileName,
    mimeType
}: {
    bytes: Uint8Array
    fileName: string
    mimeType?: string
}) => {
    if (!isSupportedFile(fileName, mimeType)) {
        throw new Error(`Unsupported file type: ${fileName}`)
    }

    const fileTypeInfo = getFileTypeInfo(fileName, mimeType)
    let preparedBytes = bytes
    let preparedFileName = fileName
    let preparedMimeType = getCorrectMimeType(fileName, mimeType)

    if (fileTypeInfo.isVisionImage && preparedBytes.byteLength > MAX_FILE_SIZE) {
        if (preparedBytes.byteLength > IMAGE_COMPRESSION_CUTOFF_BYTES) {
            throw new Error(`${fileName}: Image exceeds 25MB limit`)
        }

        if (!mimeType || !isImageMimeType(mimeType)) {
            throw new Error(`${fileName}: Unsupported image type`)
        }

        const compressed = await compressImageToLimit({
            bytes: preparedBytes,
            fileName
        })
        preparedBytes = compressed.bytes
        preparedFileName = compressed.fileName
        preparedMimeType = compressed.mimeType
    }

    if (preparedBytes.byteLength > MAX_FILE_SIZE) {
        throw new Error(`${preparedFileName}: File size exceeds 5MB limit`)
    }

    if (fileTypeInfo.isText && (!fileTypeInfo.isImage || fileTypeInfo.isSvg)) {
        const textContent = new TextDecoder().decode(preparedBytes)
        const tokenCount = estimateTokenCount(textContent)
        if (tokenCount > MAX_TOKENS_PER_FILE) {
            throw new Error(
                `${preparedFileName}: File exceeds ${MAX_TOKENS_PER_FILE.toLocaleString()} token limit`
            )
        }
    }

    return {
        bytes: preparedBytes,
        fileName: preparedFileName,
        mimeType: preparedMimeType
    }
}

export const mirrorRemoteAttachment = async ({
    ctx,
    authorId,
    url,
    filename
}: {
    ctx: Pick<ActionCtx, "runAction" | "runMutation" | "runQuery">
    authorId: string
    url: string
    filename: string
}) => {
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Failed to download attachment (${response.status})`)
    }

    const responseBytes = new Uint8Array(await response.arrayBuffer())
    const responseMimeType = response.headers.get("content-type") || undefined
    const resolvedFileName = ensureAttachmentFilename({
        fileNameHint: filename,
        url,
        mimeType: responseMimeType
    })
    const prepared = await prepareImportedAttachmentForUpload({
        bytes: responseBytes,
        fileName: resolvedFileName,
        mimeType: responseMimeType
    })
    const key = `attachments/${authorId}/${Date.now()}-${crypto.randomUUID()}-${sanitizeKeySegment(prepared.fileName)}`

    const storedKey = await r2.store(ctx, prepared.bytes, {
        authorId,
        key,
        type: prepared.mimeType
    })

    return {
        key: storedKey,
        fileName: prepared.fileName,
        fileType: prepared.mimeType
    }
}
