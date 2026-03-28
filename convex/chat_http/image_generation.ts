import { createOpenAI } from "@ai-sdk/openai"
import type { ImageModelV3 } from "@ai-sdk/provider"
import { generateImage, generateText } from "ai"
import type { GenericActionCtx } from "convex/server"
import type { DataModel, Id } from "../_generated/dataModel"
import { r2 } from "../attachments"
import { getGoogleAccessToken } from "../lib/google_auth"
import { getGoogleAuthMode, getGoogleVertexConfig } from "../lib/google_provider"
import { type ImageResolution, type ImageSize, MODELS_SHARED } from "../lib/models"

const GOOGLE_MINIMUM_SAFETY_SETTINGS = [
    {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "OFF"
    },
    {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "OFF"
    },
    {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "OFF"
    },
    {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "OFF"
    },
    {
        category: "HARM_CATEGORY_CIVIC_INTEGRITY",
        threshold: "OFF"
    }
] as const

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

function uint8ArrayToBase64(bytes: Uint8Array | ArrayBuffer): string {
    const uint8 = new Uint8Array(bytes)
    let binary = ""
    for (let i = 0; i < uint8.byteLength; i++) {
        binary += String.fromCharCode(uint8[i])
    }
    return btoa(binary)
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

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)
    const digest = await crypto.subtle.digest("SHA-256", buffer)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function dedupeImagePayloads(
    images: { mediaType: string; uint8Array: Uint8Array }[]
): Promise<{ mediaType: string; uint8Array: Uint8Array }[]> {
    const seen = new Set<string>()
    const deduped: { mediaType: string; uint8Array: Uint8Array }[] = []

    for (const image of images) {
        const digest = await sha256Hex(image.uint8Array)
        const key = `${image.mediaType}:${image.uint8Array.byteLength}:${digest}`

        if (seen.has(key)) {
            continue
        }

        seen.add(key)
        deduped.push(image)
    }

    return deduped
}

export async function generateAndStoreImage({
    prompt,
    imageSize: requestedImageSize,
    imageResolution,
    imageModel,
    modelId,
    userId,
    threadId,
    actionCtx,
    referenceImageKeys,
    maxAssets
}: {
    prompt: string
    imageSize: ImageSize
    imageResolution?: ImageResolution
    imageModel: ImageModelV3
    modelId: string
    userId: string
    threadId?: Id<"threads">
    actionCtx: GenericActionCtx<DataModel>
    referenceImageKeys?: string[]
    maxAssets?: number
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

    let requestedImageResolution = imageResolution
    if (
        requestedImageResolution &&
        sharedModel.supportedImageResolutions?.length &&
        !sharedModel.supportedImageResolutions.includes(requestedImageResolution)
    ) {
        console.warn("[cvx][image_generation] Unsupported image resolution, using default")
        requestedImageResolution = sharedModel.supportedImageResolutions[0]
    }

    const imageSize = requestedImageSize
    const hasReferenceImages = (referenceImageKeys?.length ?? 0) > 0

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
            { imageSize, aspectRatio, size, imageResolution: requestedImageResolution }
        )

        let imagesData: { mediaType: string; uint8Array: Uint8Array }[] = []

        const authMode = getGoogleAuthMode("internal")
        const isVertex = authMode === "vertex" && imageModel.provider?.includes("google")

        if (hasReferenceImages && !isVertex) {
            throw new Error(
                "Reference images are currently supported only for Google Vertex image models"
            )
        }

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

            const referenceParts =
                referenceImageKeys && referenceImageKeys.length > 0
                    ? await Promise.all(
                          referenceImageKeys.map(async (key) => {
                              const metadata = await r2.getMetadata(actionCtx, key)
                              if (!metadata) {
                                  throw new Error(`Reference image not found: ${key}`)
                              }
                              if (metadata.authorId && metadata.authorId !== userId) {
                                  throw new Error(
                                      "Reference image does not belong to the current user"
                                  )
                              }

                              const fileUrl = await r2.getUrl(key)
                              const response = await fetch(fileUrl)
                              if (!response.ok) {
                                  throw new Error(
                                      `Failed to fetch reference image (${response.status})`
                                  )
                              }

                              const mimeType = response.headers.get("content-type") || "image/png"
                              if (!mimeType.startsWith("image/")) {
                                  throw new Error("Reference attachment must be an image")
                              }

                              const arrayBuffer = await response.arrayBuffer()
                              return {
                                  inlineData: {
                                      mimeType,
                                      data: uint8ArrayToBase64(arrayBuffer)
                                  }
                              }
                          })
                      )
                    : []

            const body = {
                contents: [
                    {
                        role: "user",
                        parts: [
                            ...referenceParts,
                            {
                                text: prompt
                            }
                        ]
                    }
                ],
                generationConfig: {
                    responseModalities: ["TEXT", "IMAGE"],
                    imageConfig: {
                        aspectRatio: aspectRatio || "auto",
                        imageSize: requestedImageResolution || "1K",
                        imageOutputOptions: {
                            mimeType: "image/png"
                        }
                    }
                },
                safetySettings: GOOGLE_MINIMUM_SAFETY_SETTINGS
            }

            console.log("[cvx][image_generation] Vertex generationConfig", body.generationConfig)

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

            imagesData = await dedupeImagePayloads(imagesData)

            if (imagesData.length === 0) {
                throw new Error("No valid images returned from Vertex API")
            }
        } else if (imageModel.provider?.includes("openai") && modelId.startsWith("gpt-5-image")) {
            // GPT-5 image models use the Responses API with the image_generation tool,
            // NOT the /images/generations endpoint.
            // OpenAI model names are gpt-5-mini / gpt-5, not gpt-5-image-mini / gpt-5-image.
            const openaiModelId = modelId.replace("-image", "")
            console.log(
                `[cvx][image_generation] Using OpenAI Responses API: ${modelId} → ${openaiModelId}`
            )
            const openAiApiKey = process.env.OPENAI_API_KEY
            if (!openAiApiKey) {
                throw new Error("Internal OpenAI API key not found for image model")
            }

            const openai = createOpenAI({ apiKey: openAiApiKey })
            const result = await generateText({
                model: openai.responses(openaiModelId),
                prompt,
                tools: {
                    image_generation: openai.tools.imageGeneration({
                        ...(size
                            ? { size: size as "1024x1024" | "1024x1536" | "1536x1024" | "auto" }
                            : {})
                    })
                }
            })

            for (const toolResult of result.staticToolResults) {
                if (toolResult.toolName === "image_generation" && toolResult.output?.result) {
                    imagesData.push({
                        mediaType: "image/png",
                        uint8Array: base64ToUint8Array(toolResult.output.result)
                    })
                }
            }

            if (imagesData.length === 0) {
                throw new Error("No images returned from GPT-5 image generation")
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

        if (typeof maxAssets === "number" && maxAssets > 0 && imagesData.length > maxAssets) {
            console.warn(
                `[cvx][image_generation] Truncating ${imagesData.length} generated image payloads to ${maxAssets}`
            )
            imagesData = [...imagesData]
                .sort((a, b) => b.uint8Array.byteLength - a.uint8Array.byteLength)
                .slice(0, maxAssets)
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
