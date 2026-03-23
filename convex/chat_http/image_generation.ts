import type { ImageModelV3 } from "@ai-sdk/provider"
import { generateImage } from "ai"
import type { GenericActionCtx } from "convex/server"
import type { DataModel, Id } from "../_generated/dataModel"
import { r2 } from "../attachments"
import { getGoogleAccessToken } from "../lib/google_auth"
import { getGoogleAuthMode, getGoogleVertexConfig } from "../lib/google_provider"
import { type ImageSize, MODELS_SHARED } from "../lib/models"

const b64Lookup = new Uint8Array(256).fill(255)
const b64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
for (let i = 0; i < b64Chars.length; i++) {
    b64Lookup[b64Chars.charCodeAt(i)] = i
}

function base64ToUint8Array(base64: string): Uint8Array {
    let bufferLength = base64.length * 0.75
    if (base64[base64.length - 1] === "=") bufferLength--
    if (base64[base64.length - 2] === "=") bufferLength--

    const bytes = new Uint8Array(bufferLength)
    let p = 0
    for (let i = 0; i < base64.length; i += 4) {
        const encoded1 = b64Lookup[base64.charCodeAt(i)]
        const encoded2 = b64Lookup[base64.charCodeAt(i + 1)]
        const encoded3 = b64Lookup[base64.charCodeAt(i + 2)]
        const encoded4 = b64Lookup[base64.charCodeAt(i + 3)]

        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4)
        if (encoded3 !== 255) bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2)
        if (encoded4 !== 255) bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63)
    }
    return bytes
}

export interface ImageGenerationResult {
    assets: {
        imageUrl: string
        imageSize: ImageSize
        mimeType: string
    }[]
    prompt: string
    modelId: string
}

export async function generateAndStoreImage({
    prompt,
    imageSize: requestedImageSize,
    imageModel,
    modelId,
    userId,
    threadId,
    actionCtx
}: {
    prompt: string
    imageSize: ImageSize
    imageModel: ImageModelV3
    modelId: string
    userId: string
    threadId: Id<"threads">
    actionCtx: GenericActionCtx<DataModel>
}): Promise<ImageGenerationResult> {
    console.log("[cvx][image_generation] Starting image generation")

    const sharedModel = MODELS_SHARED.find((m) => m.id === modelId)
    if (!sharedModel || sharedModel.mode !== "image") {
        throw new Error(`Model ${modelId} is not an image generation model`)
    }

    // Validate that the requested image size is supported by the model
    if (!sharedModel.supportedImageSizes?.includes(requestedImageSize)) {
        console.warn("[cvx][image_generation] Unsupported image size, using default")
        // Fall back to first supported size
        const fallbackSize = sharedModel.supportedImageSizes?.[0]
        if (!fallbackSize) {
            throw new Error(`Model ${modelId} has no supported image sizes configured`)
        }
        requestedImageSize = fallbackSize
    }

    const imageSize = requestedImageSize

    // Determine if this model needs resolution format (like GPT Image 1)
    const needsResolution = imageSize.includes("x")

    // For models that need aspect ratios, convert resolution format to aspect ratio
    let aspectRatio: `${number}:${number}` | undefined
    let size: `${number}x${number}` | undefined

    if (needsResolution) {
        // Use the resolution directly
        size = imageSize as `${number}x${number}`
    } else {
        // Convert to aspect ratio, handling HD variants
        const baseRatio = imageSize.replace("-hd", "")
        aspectRatio = baseRatio as `${number}:${number}`
    }

    try {
        console.log(
            `[cvx][image_generation] Generating image with model ${imageModel.provider}/${imageModel.modelId}`,
            { imageSize, aspectRatio, size }
        )

        let imagesData: { mediaType: string; uint8Array: Uint8Array }[] = []

        const authMode = getGoogleAuthMode("internal")
        const isVertex = authMode === "vertex" && imageModel.provider?.includes("google")

        if (isVertex) {
            console.log("[cvx][image_generation] Using direct Vertex API fetch to avoid ai-sdk OOM")
            // Fetch directly using REST API
            const vertexConfig = getGoogleVertexConfig("internal")
            const token = await getGoogleAccessToken(
                vertexConfig.credentials.client_email,
                vertexConfig.credentials.private_key
            )

            const location = /^gemini-3(\.|-)/.test(modelId) ? "global" : vertexConfig.location
            const baseUrl =
                location === "global"
                    ? "https://aiplatform.googleapis.com"
                    : `https://${location}-aiplatform.googleapis.com`

            // Gemini models use 'generateContent'
            const url = `${baseUrl}/v1/projects/${vertexConfig.project}/locations/${location}/publishers/google/models/${modelId}:generateContent`

            const body = {
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ],
                generationConfig: {
                    responseModalities: ["IMAGE"]
                    // We would ideally map aspectRatio here if Vertex supports it in generationConfig
                    // e.g., imageConfig: { aspectRatio } but for now let's just request the image.
                }
            }

            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            })

            if (!res.ok) {
                const errText = await res.text()
                throw new Error(`Vertex API error: ${res.status} ${errText}`)
            }

            // The response for generateContent with images:
            // { candidates: [ { content: { parts: [ { inlineData: { mimeType: "...", data: "..." } } ] } } ] }
            const data = (await res.json()) as {
                candidates?: Array<{
                    content?: {
                        parts?: Array<{
                            inlineData?: {
                                mimeType?: string
                                data?: string
                            }
                        }>
                    }
                }>
            }

            if (!data.candidates || data.candidates.length === 0) {
                throw new Error("No candidates returned from Vertex API")
            }

            for (const candidate of data.candidates) {
                const parts = candidate.content?.parts || []
                for (const part of parts) {
                    if (part.inlineData?.data) {
                        const b64 = part.inlineData.data
                        part.inlineData.data = "" // Free AST memory

                        imagesData.push({
                            mediaType: part.inlineData.mimeType || "image/png",
                            uint8Array: base64ToUint8Array(b64)
                        })
                    }
                }
            }

            if (imagesData.length === 0) {
                throw new Error("No valid images returned from Vertex API")
            }
        } else {
            console.log("[cvx][image_generation] Using ai-sdk generateImage fallback")
            const isGoogleOpenAIImageModel = imageModel.provider === "google.image"

            const { images } = await generateImage({
                model: imageModel,
                prompt,
                ...(isGoogleOpenAIImageModel
                    ? {
                          ...(size ? { size } : {}),
                          ...(aspectRatio
                              ? {
                                    providerOptions: {
                                        openai: {
                                            extra_body: {
                                                google: {
                                                    aspect_ratio: aspectRatio
                                                }
                                            }
                                        }
                                    }
                                }
                              : {})
                      }
                    : size
                      ? { size }
                      : { aspectRatio })
            })
            imagesData = images.map((img) => ({
                mediaType: img.mediaType,
                uint8Array: img.uint8Array
            }))
        }

        const assets: ImageGenerationResult["assets"] = []

        for (const image of imagesData) {
            const fileExtension = image.mediaType.split("/")[1] || "png"
            const key = `generations/${userId}/${Date.now()}-${crypto.randomUUID()}-gen.${fileExtension}`

            const storedKey = await r2.store(actionCtx, image.uint8Array, {
                authorId: userId,
                key,
                type: image.mediaType
            })

            console.log("[cvx][image_generation] Image stored to R2:", storedKey)

            assets.push({
                imageUrl: key,
                imageSize: requestedImageSize,
                mimeType: image.mediaType
            })
        }

        console.log("[cvx][image_generation] Image generation complete")

        return {
            assets,
            prompt,
            modelId
        }
    } catch (error) {
        console.error("[cvx][image_generation] Error generating image:", error)
        throw new Error(
            `Failed to generate image: ${error instanceof Error ? error.message : "Unknown error"}`
        )
    }
}
