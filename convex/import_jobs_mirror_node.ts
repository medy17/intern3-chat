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
import { r2 } from "./attachments"
import { ensureAttachmentFilename } from "./lib/thread_import_core"

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
    ctx: Parameters<typeof r2.store>[0]
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
    const key = `attachments/${authorId}/${Date.now()}-${crypto.randomUUID()}-${prepared.fileName}`

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
