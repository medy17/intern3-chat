import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { ActionCtx } from "../../_generated/server"
import { r2 } from "../../attachments"
import type { FalGeneratedImage } from "../models/fal"

export const getExtensionFromContentType = (contentType?: string) => {
    const normalized = contentType?.split(";")[0]?.trim().toLowerCase()
    switch (normalized) {
        case "image/jpeg":
        case "image/jpg":
            return "jpg"
        case "image/webp":
            return "webp"
        case "image/avif":
            return "avif"
        case "image/gif":
            return "gif"
        default:
            return "png"
    }
}

const FAL_IMAGE_DOWNLOAD_ATTEMPTS = 3
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const downloadFalImage = async (image: FalGeneratedImage) => {
    let lastError: unknown
    for (let attempt = 0; attempt < FAL_IMAGE_DOWNLOAD_ATTEMPTS; attempt++) {
        try {
            // Belt: Accept-Encoding: identity asks the CDN for uncompressed bytes,
            // shrinking the decode surface. The cause of the observed transient
            // failure was never pinned to compression, so we keep this mitigation
            // rather than remove it on a hunch.
            const response = await fetch(image.url, {
                headers: {
                    Accept: image.contentType ?? "image/*",
                    "Accept-Encoding": "identity"
                }
            })
            if (!response.ok) {
                throw new Error(`Failed to download fal image (${response.status})`)
            }

            const contentType =
                image.contentType ??
                response.headers.get("Content-Type")?.split(";")[0]?.trim() ??
                "image/png"
            // Read the body inside the retry so transient "error decoding response
            // body" failures (truncated transfers) re-attempt, not just non-200s.
            const arrayBuffer = await response.arrayBuffer()
            return {
                bytes: new Uint8Array(arrayBuffer),
                contentType,
                extension: getExtensionFromContentType(contentType)
            }
        } catch (error) {
            lastError = error
            if (attempt < FAL_IMAGE_DOWNLOAD_ATTEMPTS - 1) {
                await sleep(250 * 2 ** attempt)
            }
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error("Failed to download fal image after retries")
}

type ImageJob = Pick<
    Doc<"imageGenerationJobs">,
    "userId" | "prompt" | "appModelId" | "aspectRatio" | "resolution" | "referenceImageKeys"
>

export async function saveFalImages(
    ctx: ActionCtx,
    job: ImageJob,
    generationJobId: Id<"imageGenerationJobs">,
    falRequestId: string,
    images: FalGeneratedImage[]
) {
    const generatedImageIds: Id<"generatedImages">[] = []
    const failures: string[] = []
    for (const image of images) {
        try {
            const downloaded = await downloadFalImage(image)
            const storageKey = await r2.store(ctx, downloaded.bytes, {
                authorId: job.userId,
                key: `generations/${job.userId}/${Date.now()}-${crypto.randomUUID()}-fal.${downloaded.extension}`,
                type: downloaded.contentType
            })
            const id: Id<"generatedImages"> = await ctx.runMutation(
                internal.images.insertGeneratedImage,
                {
                    userId: job.userId,
                    storageKey,
                    prompt: job.prompt,
                    modelId: job.appModelId,
                    aspectRatio: job.aspectRatio,
                    resolution: job.resolution,
                    referenceImageKeys: job.referenceImageKeys,
                    generationJobId,
                    falRequestId
                }
            )
            generatedImageIds.push(id)
        } catch (error) {
            failures.push(error instanceof Error ? error.message : "Unknown image storage error")
        }
    }
    return { generatedImageIds, failures }
}
