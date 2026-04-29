import { createOpenAI } from "@ai-sdk/openai"
import type { ImageModelV3 } from "@ai-sdk/provider"
import { generateImage, generateText } from "ai"
import type { GenericActionCtx } from "convex/server"
import type { DataModel, Id } from "../_generated/dataModel"
import { r2 } from "../attachments"
import { getGoogleAccessToken } from "../lib/google_auth"
import { getGoogleAuthMode, getGoogleVertexConfig } from "../lib/google_provider"
import {
    type ImageQuality,
    type ImageResolution,
    type ImageSize,
    MODELS_SHARED
} from "../lib/models"

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

type ImageBinaryPayload = {
    mediaType: string
    uint8Array: Uint8Array
}

type ImageExecutionPath =
    | "vertex-direct"
    | "openai-responses"
    | "openai-responses-image-tool"
    | "openai-direct"
    | "ai-sdk-generate-image-gateway"
    | "ai-sdk-generate-image-openrouter"
    | "ai-sdk-generate-image-google-openai-compatible"
    | "xai-direct"
    | "ai-sdk-generate-image-generic"

type OpenRouterImageRequestOptions = {
    modalities?: Array<"image" | "text">
    image_config?: {
        aspect_ratio?: `${number}:${number}`
        image_size?: ImageResolution
        quality?: ImageQuality
    }
    provider?: {
        only?: string[]
        allow_fallbacks?: boolean
        require_parameters?: boolean
    }
    safetySettings?: typeof GOOGLE_MINIMUM_SAFETY_SETTINGS
}

function buildOpenRouterImageRequestOptions(
    appModelId: string,
    modalities?: Array<"image" | "text">,
    aspectRatio?: `${number}:${number}`,
    imageResolution?: ImageResolution,
    imageQuality?: ImageQuality
): OpenRouterImageRequestOptions {
    const options: OpenRouterImageRequestOptions = {
        provider: {
            require_parameters: true
        },
        safetySettings: GOOGLE_MINIMUM_SAFETY_SETTINGS
    }

    if (modalities?.length) {
        options.modalities = [...modalities]
    }

    if (aspectRatio || imageResolution || imageQuality) {
        options.image_config = {
            ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
            ...(imageResolution ? { image_size: imageResolution } : {}),
            ...(imageQuality ? { quality: imageQuality } : {})
        }
    }

    // Prefer the model vendor's own OpenRouter endpoint when available.
    // This avoids load-balancing onto stricter third-party providers.
    if (appModelId === "seedream-4-5") {
        options.provider = {
            only: ["seed"],
            allow_fallbacks: false,
            require_parameters: true
        }
    } else if (appModelId === "flux-2-flex") {
        options.provider = {
            only: ["black-forest-labs"],
            allow_fallbacks: false,
            require_parameters: true
        }
    }

    return options
}

const OPENAI_DIRECT_IMAGE_SIZES: Record<
    ImageResolution,
    Partial<Record<ImageSize, `${number}x${number}`>>
> = {
    "1K": {
        "1:1": "1024x1024",
        "16:9": "1280x720",
        "9:16": "720x1280",
        "4:3": "1024x768",
        "3:4": "768x1024",
        "21:9": "1568x672"
    },
    "2K": {
        "1:1": "2048x2048",
        "16:9": "2048x1152",
        "9:16": "1152x2048",
        "4:3": "2048x1536",
        "3:4": "1536x2048",
        "21:9": "2240x960"
    },
    "4K": {
        "1:1": "2880x2880",
        "16:9": "3840x2160",
        "9:16": "2160x3840",
        "4:3": "3264x2448",
        "3:4": "2448x3264",
        "21:9": "3808x1632"
    }
}

const toOpenAIDirectImageSize = (
    imageSize: ImageSize,
    imageResolution?: ImageResolution
): `${number}x${number}` => {
    if (imageSize.includes("x")) {
        return imageSize as `${number}x${number}`
    }

    return OPENAI_DIRECT_IMAGE_SIZES[imageResolution ?? "1K"][imageSize] ?? "1024x1024"
}

const toOpenAIResponsesModelId = (appModelId: string) => {
    if (appModelId === "gpt-5.4-image-2") {
        return "gpt-5.4"
    }

    return appModelId.replace("-image", "")
}

const toXaiImageResolution = (resolution?: ImageResolution) => {
    switch (resolution) {
        case "1K":
            return "1k"
        case "2K":
            return "2k"
        default:
            return undefined
    }
}

const CANONICAL_ASPECT_RATIOS = [
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
    "2:1",
    "1:2",
    "19.5:9",
    "9:19.5",
    "20:9",
    "9:20",
    "4:5",
    "5:4",
    "21:9"
] as const satisfies readonly `${number}:${number}`[]

const gcd = (left: number, right: number): number => {
    let a = Math.abs(left)
    let b = Math.abs(right)
    while (b !== 0) {
        const next = a % b
        a = b
        b = next
    }
    return a || 1
}

const findMatchingAspectRatio = (
    width: number,
    height: number,
    supportedSizes?: ImageSize[]
): ImageSize => {
    const exactSize = `${width}x${height}` as ImageSize
    if (supportedSizes?.includes(exactSize)) {
        return exactSize
    }

    const ratio = width / height
    const candidates = (supportedSizes?.filter((size) => size.includes(":")) as
        | `${number}:${number}`[]
        | undefined) ?? [...CANONICAL_ASPECT_RATIOS]

    let bestCandidate: `${number}:${number}` | undefined
    let bestDelta = Number.POSITIVE_INFINITY

    for (const candidate of candidates) {
        const [candidateWidth, candidateHeight] = candidate.split(":").map(Number)
        const delta = Math.abs(ratio - candidateWidth / candidateHeight)
        if (delta < bestDelta) {
            bestDelta = delta
            bestCandidate = candidate
        }
    }

    if (bestCandidate && bestDelta < 0.02) {
        return bestCandidate as ImageSize
    }

    const divisor = gcd(width, height)
    return `${width / divisor}:${height / divisor}` as ImageSize
}

const getPngDimensions = (bytes: Uint8Array) => {
    if (
        bytes.length >= 24 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
    ) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        return {
            width: view.getUint32(16, false),
            height: view.getUint32(20, false)
        }
    }

    return null
}

const getGifDimensions = (bytes: Uint8Array) => {
    if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        return {
            width: view.getUint16(6, true),
            height: view.getUint16(8, true)
        }
    }

    return null
}

const getWebpDimensions = (bytes: Uint8Array) => {
    if (
        bytes.length < 30 ||
        bytes[0] !== 0x52 ||
        bytes[1] !== 0x49 ||
        bytes[2] !== 0x46 ||
        bytes[3] !== 0x46 ||
        bytes[8] !== 0x57 ||
        bytes[9] !== 0x45 ||
        bytes[10] !== 0x42 ||
        bytes[11] !== 0x50
    ) {
        return null
    }

    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15])
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    if (chunk === "VP8X" && bytes.length >= 30) {
        const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)
        const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
        return { width, height }
    }

    if (chunk === "VP8L" && bytes.length >= 25) {
        const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
        const width = (bits & 0x3fff) + 1
        const height = ((bits >> 14) & 0x3fff) + 1
        return { width, height }
    }

    if (chunk === "VP8 " && bytes.length >= 30) {
        return {
            width: view.getUint16(26, true) & 0x3fff,
            height: view.getUint16(28, true) & 0x3fff
        }
    }

    return null
}

const getJpegDimensions = (bytes: Uint8Array) => {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        return null
    }

    let offset = 2
    while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) {
            offset++
            continue
        }

        let marker = bytes[offset + 1]
        while (marker === 0xff) {
            offset++
            marker = bytes[offset + 1]
        }

        if (marker === 0xd8 || marker === 0xd9) {
            offset += 2
            continue
        }

        if (offset + 4 > bytes.length) {
            break
        }

        const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3]
        if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) {
            break
        }

        const isStartOfFrame =
            (marker >= 0xc0 && marker <= 0xc3) ||
            (marker >= 0xc5 && marker <= 0xc7) ||
            (marker >= 0xc9 && marker <= 0xcb) ||
            (marker >= 0xcd && marker <= 0xcf)

        if (isStartOfFrame && offset + 9 < bytes.length) {
            return {
                height: (bytes[offset + 5] << 8) | bytes[offset + 6],
                width: (bytes[offset + 7] << 8) | bytes[offset + 8]
            }
        }

        offset += 2 + segmentLength
    }

    return null
}

const getImageDimensions = (bytes: Uint8Array) =>
    getPngDimensions(bytes) ??
    getJpegDimensions(bytes) ??
    getWebpDimensions(bytes) ??
    getGifDimensions(bytes)

const getActualImageSize = (
    image: ImageBinaryPayload,
    fallbackSize: ImageSize,
    supportedSizes?: ImageSize[]
) => {
    try {
        const dimensions = getImageDimensions(image.uint8Array)
        if (!dimensions?.width || !dimensions.height) {
            return fallbackSize
        }

        return findMatchingAspectRatio(dimensions.width, dimensions.height, supportedSizes)
    } catch (error) {
        console.warn("[cvx][image_generation] Failed to inspect image dimensions", error)
        return fallbackSize
    }
}

const detectImageMimeType = (bytes: Uint8Array) => {
    if (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    ) {
        return "image/png"
    }

    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return "image/jpeg"
    }

    if (
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    ) {
        return "image/webp"
    }

    return "image/png"
}

async function fetchXaiImageResponse({
    apiKey,
    prompt,
    modelId,
    aspectRatio,
    imageResolution,
    referenceImages,
    maxAssets
}: {
    apiKey: string
    prompt: string
    modelId: string
    aspectRatio?: `${number}:${number}`
    imageResolution?: ImageResolution
    referenceImages: Awaited<ReturnType<typeof loadReferenceImages>>
    maxAssets?: number
}): Promise<ImageBinaryPayload[]> {
    const desiredImageCount =
        typeof maxAssets === "number" && maxAssets > 0 ? Math.min(maxAssets, 10) : 1
    const endpoint =
        referenceImages.length > 0
            ? "https://api.x.ai/v1/images/edits"
            : "https://api.x.ai/v1/images/generations"
    const resolution = toXaiImageResolution(imageResolution)

    const body: Record<string, unknown> = {
        model: modelId,
        prompt,
        response_format: "b64_json",
        ...(desiredImageCount > 1 ? { n: desiredImageCount } : {}),
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(resolution ? { resolution } : {})
    }

    if (referenceImages.length === 1) {
        body.image = {
            type: "image_url",
            url: referenceImages[0].dataUrl
        }
    } else if (referenceImages.length > 1) {
        body.images = referenceImages.map((image) => ({
            type: "image_url",
            url: image.dataUrl
        }))
    }

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    })

    if (!response.ok) {
        throw new Error(`xAI image API error: ${response.status} ${await response.text()}`)
    }

    const payload = (await response.json()) as {
        data?: Array<{
            b64_json?: string | null
            url?: string | null
            mime_type?: string | null
        }>
    }

    const images: ImageBinaryPayload[] = []
    for (const item of payload.data ?? []) {
        if (item.b64_json) {
            const uint8Array = base64ToUint8Array(item.b64_json)
            images.push({
                mediaType: item.mime_type || detectImageMimeType(uint8Array),
                uint8Array
            })
            continue
        }

        if (item.url) {
            const imageResponse = await fetch(item.url)
            if (!imageResponse.ok) {
                throw new Error(`Failed to download xAI image asset (${imageResponse.status})`)
            }

            const uint8Array = new Uint8Array(await imageResponse.arrayBuffer())
            images.push({
                mediaType:
                    imageResponse.headers.get("content-type") ||
                    item.mime_type ||
                    detectImageMimeType(uint8Array),
                uint8Array
            })
        }
    }

    if (images.length === 0) {
        throw new Error("No images returned from xAI image API")
    }

    return images
}

async function fetchOpenAiResponsesImageToolResponse({
    apiKey,
    prompt,
    responsesModelId,
    imageToolModelId,
    size,
    imageQuality,
    referenceImages
}: {
    apiKey: string
    prompt: string
    responsesModelId: string
    imageToolModelId: string
    size: `${number}x${number}`
    imageQuality?: ImageQuality
    referenceImages: Awaited<ReturnType<typeof loadReferenceImages>>
}): Promise<ImageBinaryPayload[]> {
    const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: responsesModelId,
            input: [
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: prompt },
                        ...referenceImages.map((image) => ({
                            type: "input_image",
                            image_url: image.dataUrl,
                            detail: "low"
                        }))
                    ]
                }
            ],
            tools: [
                {
                    type: "image_generation",
                    model: imageToolModelId,
                    moderation: "low",
                    quality: imageQuality,
                    size
                }
            ],
            tool_choice: { type: "image_generation" }
        })
    })

    if (!response.ok) {
        throw new Error(
            `OpenAI Responses image API error: ${response.status} ${await response.text()}`
        )
    }

    const payload = (await response.json()) as {
        output?: Array<{
            type?: string
            result?: string | null
        }>
    }

    const images: ImageBinaryPayload[] = []
    for (const item of payload.output ?? []) {
        if (item.type === "image_generation_call" && item.result) {
            const uint8Array = base64ToUint8Array(item.result)
            images.push({
                mediaType: detectImageMimeType(uint8Array),
                uint8Array
            })
        }
    }

    if (images.length === 0) {
        throw new Error("No images returned from OpenAI Responses image generation")
    }

    return images
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

async function loadReferenceImages(
    referenceImageKeys: string[],
    actionCtx: GenericActionCtx<DataModel>,
    userId: string
) {
    return await Promise.all(
        referenceImageKeys.map(async (key) => {
            const metadata = await r2.getMetadata(actionCtx, key)
            if (!metadata) {
                throw new Error(`Reference image not found: ${key}`)
            }
            if (metadata.authorId && metadata.authorId !== userId) {
                throw new Error("Reference image does not belong to the current user")
            }

            const fileUrl = await r2.getUrl(key)
            const response = await fetch(fileUrl)
            if (!response.ok) {
                throw new Error(`Failed to fetch reference image (${response.status})`)
            }

            const mimeType = response.headers.get("content-type") || "image/png"
            if (!mimeType.startsWith("image/")) {
                throw new Error("Reference attachment must be an image")
            }

            const uint8Array = new Uint8Array(await response.arrayBuffer())
            return {
                mimeType,
                uint8Array,
                dataUrl: `data:${mimeType};base64,${uint8ArrayToBase64(uint8Array)}`
            }
        })
    )
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
    maxAssets,
    runtimeApiKey
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
    runtimeApiKey?: string
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

        let imagesData: ImageBinaryPayload[] = []

        const authMode = getGoogleAuthMode("internal")
        const isVertex = authMode === "vertex" && imageModel.provider?.includes("google")
        const isOpenAiImageModel = imageModel.provider?.includes("openai") === true
        const isGatewayImageModel = imageModel.provider === "gateway"
        const isOpenRouterImageModel = imageModel.provider === "openrouter"
        const isGoogleOpenAIImageModel = imageModel.provider === "google.image"
        const isXaiImageModel = imageModel.provider?.startsWith("xai") === true
        const isOpenAiResponsesImageModel = isOpenAiImageModel && modelId.startsWith("gpt-5-image")
        const isOpenAiResponsesImageToolModel = isOpenAiImageModel && hasReferenceImages
        const gatewayOpenAiDirectSize =
            isGatewayImageModel && imageModel.modelId === "openai/gpt-image-2"
                ? toOpenAIDirectImageSize(imageSize, requestedImageResolution)
                : undefined
        const executionPath: ImageExecutionPath = isVertex
            ? "vertex-direct"
            : isOpenAiResponsesImageToolModel
              ? "openai-responses-image-tool"
              : isOpenAiResponsesImageModel
                ? "openai-responses"
                : isOpenAiImageModel
                  ? "openai-direct"
                  : isGatewayImageModel
                    ? "ai-sdk-generate-image-gateway"
                    : isOpenRouterImageModel
                      ? "ai-sdk-generate-image-openrouter"
                      : isGoogleOpenAIImageModel
                        ? "ai-sdk-generate-image-google-openai-compatible"
                        : isXaiImageModel
                          ? "xai-direct"
                          : "ai-sdk-generate-image-generic"

        if (hasReferenceImages && !sharedModel.supportsReferenceImages) {
            throw new Error(`Reference images are not supported for ${sharedModel.name}`)
        }

        const referenceImages = hasReferenceImages
            ? await loadReferenceImages(referenceImageKeys ?? [], actionCtx, userId)
            : []

        console.log("[cvx][image_generation] Execution path selected", {
            path: executionPath,
            provider: imageModel.provider,
            modelId: imageModel.modelId,
            attempt: 1,
            isRetry: false,
            referenceImages: referenceImages.length,
            maxAssets: maxAssets ?? null
        })

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

            const referenceParts = referenceImages.map((image) => ({
                inlineData: {
                    mimeType: image.mimeType,
                    data: uint8ArrayToBase64(image.uint8Array)
                }
            }))

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
        } else if (isOpenAiResponsesImageToolModel) {
            const openAiSize = toOpenAIDirectImageSize(imageSize, requestedImageResolution)
            const openAiApiKey = runtimeApiKey ?? process.env.OPENAI_API_KEY?.trim()
            if (!openAiApiKey) {
                throw new Error("OpenAI API key not found for image model")
            }

            const responsesModelId = toOpenAIResponsesModelId(modelId)
            console.log(
                `[cvx][image_generation] Using OpenAI Responses image tool: ${responsesModelId} / ${imageModel.modelId}`
            )

            imagesData = await fetchOpenAiResponsesImageToolResponse({
                apiKey: openAiApiKey,
                prompt,
                responsesModelId,
                imageToolModelId: imageModel.modelId,
                size: openAiSize,
                imageQuality: sharedModel.defaultImageQuality,
                referenceImages
            })
        } else if (isOpenAiResponsesImageModel) {
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
                        ...(sharedModel.defaultImageQuality
                            ? { quality: sharedModel.defaultImageQuality }
                            : {}),
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
        } else if (isOpenAiImageModel) {
            const openAiSize = toOpenAIDirectImageSize(imageSize, requestedImageResolution)
            const openAiApiKey = runtimeApiKey ?? process.env.OPENAI_API_KEY?.trim()
            if (!openAiApiKey) {
                throw new Error("OpenAI API key not found for image model")
            }

            console.log(
                `[cvx][image_generation] Using AI SDK generateImage for OpenAI image model ${imageModel.modelId}`
            )
            const { images } = await generateImage({
                model: imageModel,
                prompt,
                n: maxAssets,
                size: openAiSize,
                ...(sharedModel.defaultImageQuality
                    ? {
                          providerOptions: {
                              openai: {
                                  quality: sharedModel.defaultImageQuality
                              }
                          }
                      }
                    : {})
            })
            imagesData = images.map((img) => ({
                mediaType: img.mediaType,
                uint8Array: img.uint8Array
            }))
        } else if (isXaiImageModel) {
            if (!runtimeApiKey) {
                throw new Error("xAI API key not found for image model")
            }

            imagesData = await fetchXaiImageResponse({
                apiKey: runtimeApiKey,
                prompt,
                modelId: imageModel.modelId,
                aspectRatio,
                imageResolution: requestedImageResolution,
                referenceImages,
                maxAssets
            })
        } else {
            console.log("[cvx][image_generation] Using AI SDK generateImage path", {
                path: executionPath,
                provider: imageModel.provider,
                modelId: imageModel.modelId
            })

            const { images } = await generateImage({
                model: imageModel,
                prompt:
                    referenceImages.length > 0
                        ? {
                              text: prompt,
                              images: referenceImages.map((image) => image.dataUrl)
                          }
                        : prompt,
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
                    : {
                          ...(gatewayOpenAiDirectSize
                              ? { size: gatewayOpenAiDirectSize }
                              : size
                                ? { size }
                                : { aspectRatio }),
                          ...((isOpenRouterImageModel || isGatewayImageModel) &&
                          sharedModel.defaultImageQuality
                              ? {
                                    providerOptions: {
                                        ...(isOpenRouterImageModel
                                            ? {
                                                  openrouter: buildOpenRouterImageRequestOptions(
                                                      modelId,
                                                      sharedModel.openrouterImageModalities,
                                                      aspectRatio,
                                                      requestedImageResolution,
                                                      sharedModel.defaultImageQuality
                                                  )
                                              }
                                            : {}),
                                        ...(isGatewayImageModel &&
                                        imageModel.modelId.startsWith("openai/")
                                            ? {
                                                  openai: {
                                                      moderation: "low",
                                                      quality: sharedModel.defaultImageQuality
                                                  }
                                              }
                                            : {})
                                    }
                                }
                              : isOpenRouterImageModel
                                ? {
                                      providerOptions: {
                                          openrouter: buildOpenRouterImageRequestOptions(
                                              modelId,
                                              sharedModel.openrouterImageModalities,
                                              aspectRatio,
                                              requestedImageResolution,
                                              sharedModel.defaultImageQuality
                                          )
                                      }
                                  }
                                : {})
                      })
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
            const actualImageSize = await getActualImageSize(
                image,
                requestedImageSize,
                sharedModel.supportedImageSizes
            )

            const storedKey = await r2.store(actionCtx, image.uint8Array, {
                authorId: userId,
                key,
                type: image.mediaType
            })

            console.log("[cvx][image_generation] Image stored to R2:", storedKey)

            assets.push({
                imageUrl: key,
                imageSize: actualImageSize,
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
        console.error("[cvx][image_generation] Error generating image:", {
            provider: imageModel.provider,
            modelId: imageModel.modelId,
            error
        })
        throw new Error(
            `Failed to generate image: ${error instanceof Error ? error.message : "Unknown error"}`
        )
    }
}
