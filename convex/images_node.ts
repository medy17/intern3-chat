"use node"

import { buildGeneratedImageSearchText } from "@/lib/generated-image-search"
import { getLibraryPrivateBlurWidths, getPrivateBlurStorageKey } from "@/lib/private-blur-variants"
import { fal } from "@fal-ai/client"
import type { GenericActionCtx } from "convex/server"
import { ConvexError, v } from "convex/values"
import { internal } from "./_generated/api"
import type { DataModel, Id } from "./_generated/dataModel"
import { action } from "./_generated/server"
import { r2 } from "./attachments"
import { assertAccountNotDeletingForAction } from "./lib/account_deletion_gate"
import { resolveRequiredPlanForModelAccess } from "./lib/credits"
import { getUserIdentity } from "./lib/identity"
import { resolveFalReferenceImagesForProvider } from "./lib/image_generation/reference_images_node"
import {
    type ImageReferenceSource,
    createImageCreditEventKey,
    resolveGeneratedImageReferenceSource,
    validatePreparedImageRequest
} from "./lib/image_generation/shared"
import { MODELS_SHARED } from "./lib/models"
import {
    buildFalImageInput,
    getFalEndpointForRequest,
    normalizeFalImageErrorMessage
} from "./lib/models/fal"
import {
    getConfiguredFalReservationMicrousd,
    isFalPricingEstimateEnabled,
    resolveFalEstimateMicrousd,
    usdToMicrousd
} from "./lib/usage_metering"

const FAL_PRICING_ESTIMATE_URL = "https://api.fal.ai/v1/models/pricing/estimate"
const FAL_PRICING_CACHE_MS = 10 * 60 * 1000
const falPricingCache = new Map<string, { microusd: number; expiresAt: number }>()

const estimateFalReservationMicrousd = async (endpoint: string, fallbackMicrousd: number) => {
    if (!isFalPricingEstimateEnabled()) {
        return fallbackMicrousd
    }

    const cached = falPricingCache.get(endpoint)
    if (cached && cached.expiresAt > Date.now()) return cached.microusd

    const key = process.env.FAL_KEY?.trim()
    if (!key) return fallbackMicrousd

    try {
        const response = await fetch(FAL_PRICING_ESTIMATE_URL, {
            method: "POST",
            headers: {
                Accept: "application/json",
                Authorization: key.startsWith("Key ") ? key : `Key ${key}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                estimate_type: "unit_price",
                endpoints: {
                    [endpoint]: { unit_quantity: 1 }
                }
            })
        })
        if (!response.ok) {
            throw new Error(`Fal pricing estimate failed: ${response.status}`)
        }
        const estimatedMicrousd = resolveFalEstimateMicrousd(await response.json())
        if (estimatedMicrousd !== undefined) {
            falPricingCache.set(endpoint, {
                microusd: estimatedMicrousd,
                expiresAt: Date.now() + FAL_PRICING_CACHE_MS
            })
            return estimatedMicrousd
        }
    } catch (error) {
        console.error("Failed to estimate Fal request cost; using configured fallback", {
            endpoint,
            error
        })
    }

    return fallbackMicrousd
}

const DEV_FAKE_PALETTES = [
    {
        backgroundStart: "#0f172a",
        backgroundEnd: "#1d4ed8",
        accent: "#38bdf8",
        accentSoft: "#93c5fd",
        text: "#f8fafc"
    },
    {
        backgroundStart: "#1f2937",
        backgroundEnd: "#7c2d12",
        accent: "#fb7185",
        accentSoft: "#fdba74",
        text: "#fff7ed"
    },
    {
        backgroundStart: "#111827",
        backgroundEnd: "#065f46",
        accent: "#34d399",
        accentSoft: "#a7f3d0",
        text: "#ecfdf5"
    },
    {
        backgroundStart: "#172554",
        backgroundEnd: "#581c87",
        accent: "#c084fc",
        accentSoft: "#e9d5ff",
        text: "#faf5ff"
    }
] as const

const clampAspectValue = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return 1
    return Math.min(24, Math.max(1, Math.round(value)))
}

const parseAspectRatio = (aspectRatio?: string) => {
    const normalized = aspectRatio?.replace("-hd", "") || "1:1"

    if (normalized.includes("x")) {
        const [width, height] = normalized.split("x").map((value) => Number.parseFloat(value))
        return {
            width: clampAspectValue(width),
            height: clampAspectValue(height)
        }
    }

    if (normalized.includes(":")) {
        const [width, height] = normalized.split(":").map((value) => Number.parseFloat(value))
        return {
            width: clampAspectValue(width),
            height: clampAspectValue(height)
        }
    }

    return { width: 1, height: 1 }
}

const escapeSvgText = (value: string) =>
    value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;")

const wrapSvgText = (value: string, maxLineLength = 38, maxLines = 3) => {
    const words = value.split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let currentLine = ""

    for (const word of words) {
        const nextLine = currentLine ? `${currentLine} ${word}` : word
        if (nextLine.length <= maxLineLength) {
            currentLine = nextLine
            continue
        }

        if (currentLine) {
            lines.push(currentLine)
        }
        currentLine = word

        if (lines.length === maxLines - 1) {
            break
        }
    }

    if (lines.length < maxLines && currentLine) {
        lines.push(currentLine)
    }

    const consumedWords = lines.join(" ").split(/\s+/).filter(Boolean).length
    const hasRemainingWords = consumedWords < words.length

    if (hasRemainingWords && lines.length > 0) {
        lines[lines.length - 1] = `${lines[lines.length - 1]}...`
    }

    return lines
}

const clampFakeResponseTimeSeconds = (value?: number) => {
    if (!Number.isFinite(value)) return 12
    return Math.max(5, Math.min(90, Math.round(value!)))
}

const buildDevFakeSvg = ({
    modelName,
    aspectRatio,
    resolution,
    prompt,
    variantIndex,
    referenceCount,
    responseTimeSeconds
}: {
    modelName: string
    aspectRatio: string
    resolution?: string
    prompt: string
    variantIndex?: number
    referenceCount: number
    responseTimeSeconds: number
}) => {
    const { width, height } = parseAspectRatio(aspectRatio)
    const canvasWidth = width * 160
    const canvasHeight = height * 160
    const palette =
        DEV_FAKE_PALETTES[Math.floor(Math.random() * DEV_FAKE_PALETTES.length)] ||
        DEV_FAKE_PALETTES[0]
    const lines = [
        modelName,
        `${aspectRatio}${resolution ? ` • ${resolution}` : ""}`,
        [
            variantIndex ? `fake generation #${variantIndex}` : "fake generation",
            `${responseTimeSeconds}s response`,
            `${referenceCount} ref${referenceCount === 1 ? "" : "s"}`
        ].join(" • "),
        ...wrapSvgText(prompt)
    ]
    const escapedLines = lines.map((line) => escapeSvgText(line))

    const gridStep = Math.max(28, Math.round(Math.min(canvasWidth, canvasHeight) / 8))
    const circleX = Math.round(canvasWidth * 0.76)
    const circleY = Math.round(canvasHeight * 0.28)
    const circleRadius = Math.round(Math.min(canvasWidth, canvasHeight) * 0.16)
    const frameX = Math.round(canvasWidth * 0.08)
    const frameY = Math.round(canvasHeight * 0.14)
    const frameWidth = Math.round(canvasWidth * 0.68)
    const frameHeight = Math.round(canvasHeight * 0.72)

    return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}" role="img" aria-label="Development fake generated image">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.backgroundStart}"/>
      <stop offset="100%" stop-color="${palette.backgroundEnd}"/>
    </linearGradient>
    <linearGradient id="beam" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${palette.accent}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${palette.accent}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${palette.accentSoft}" stop-opacity="0"/>
    </linearGradient>
    <pattern id="grid" width="${gridStep}" height="${gridStep}" patternUnits="userSpaceOnUse">
      <path d="M ${gridStep} 0 L 0 0 0 ${gridStep}" fill="none" stroke="${palette.text}" stroke-opacity="0.12" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${canvasWidth}" height="${canvasHeight}" fill="url(#bg)"/>
  <rect width="${canvasWidth}" height="${canvasHeight}" fill="url(#grid)"/>
  <circle cx="${circleX}" cy="${circleY}" r="${circleRadius}" fill="${palette.accentSoft}" fill-opacity="0.22"/>
  <rect x="${Math.round(canvasWidth * 0.12)}" y="${Math.round(canvasHeight * 0.18)}" width="${Math.round(canvasWidth * 0.82)}" height="${Math.round(canvasHeight * 0.06)}" rx="${Math.round(canvasHeight * 0.03)}" fill="url(#beam)" opacity="0.75" transform="rotate(-18 ${Math.round(canvasWidth * 0.53)} ${Math.round(canvasHeight * 0.21)})"/>
  <rect x="${frameX}" y="${frameY}" width="${frameWidth}" height="${frameHeight}" rx="${Math.round(Math.min(canvasWidth, canvasHeight) * 0.04)}" fill="#0b1220" fill-opacity="0.18" stroke="${palette.text}" stroke-opacity="0.35" stroke-width="2"/>
  <path d="M ${Math.round(canvasWidth * 0.18)} ${Math.round(canvasHeight * 0.68)} C ${Math.round(canvasWidth * 0.34)} ${Math.round(canvasHeight * 0.32)}, ${Math.round(canvasWidth * 0.46)} ${Math.round(canvasHeight * 0.92)}, ${Math.round(canvasWidth * 0.62)} ${Math.round(canvasHeight * 0.5)} S ${Math.round(canvasWidth * 0.86)} ${Math.round(canvasHeight * 0.38)}, ${Math.round(canvasWidth * 0.92)} ${Math.round(canvasHeight * 0.7)}" fill="none" stroke="${palette.accent}" stroke-width="8" stroke-linecap="round" stroke-opacity="0.9"/>
  <g fill="${palette.text}">
    <text x="${Math.round(canvasWidth * 0.12)}" y="${Math.round(canvasHeight * 0.2)}" font-size="${Math.max(20, Math.round(canvasHeight * 0.055))}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace" font-weight="700">${escapedLines[0]}</text>
    <text x="${Math.round(canvasWidth * 0.12)}" y="${Math.round(canvasHeight * 0.28)}" font-size="${Math.max(14, Math.round(canvasHeight * 0.03))}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace" opacity="0.88">${escapedLines[1]}</text>
    <text x="${Math.round(canvasWidth * 0.12)}" y="${Math.round(canvasHeight * 0.34)}" font-size="${Math.max(13, Math.round(canvasHeight * 0.028))}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace" opacity="0.78">${escapedLines[2]}</text>
    <text x="${Math.round(canvasWidth * 0.12)}" y="${Math.round(canvasHeight * 0.5)}" font-size="${Math.max(14, Math.round(canvasHeight * 0.028))}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace" opacity="0.92">${escapedLines[3] || ""}</text>
    <text x="${Math.round(canvasWidth * 0.12)}" y="${Math.round(canvasHeight * 0.56)}" font-size="${Math.max(14, Math.round(canvasHeight * 0.028))}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace" opacity="0.92">${escapedLines[4] || ""}</text>
    <text x="${Math.round(canvasWidth * 0.12)}" y="${Math.round(canvasHeight * 0.62)}" font-size="${Math.max(14, Math.round(canvasHeight * 0.028))}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace" opacity="0.92">${escapedLines[5] || ""}</text>
  </g>
</svg>`.trim()
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const enforceImageGenerationPlan = ({
    userCreditPlan,
    availableToPickFor
}: {
    userCreditPlan: "free" | "pro"
    availableToPickFor?: "free" | "pro"
}) => {
    const requiredPlan = resolveRequiredPlanForModelAccess({
        reasoningEffort: "off",
        availableToPickFor
    })

    if (requiredPlan === "pro" && userCreditPlan !== "pro") {
        throw new ConvexError("Pro plan required for image generation.")
    }
}

const getFalWebhookUrl = (jobId: Id<"imageGenerationJobs">) => {
    const siteUrl =
        process.env.CONVEX_SITE_URL ??
        process.env.VITE_CONVEX_SITE_URL ??
        process.env.VITE_CONVEX_API_URL

    if (!siteUrl) {
        throw new Error("CONVEX_SITE_URL is required for fal image webhooks.")
    }

    return `${siteUrl.replace(/\/+$/, "")}/webhooks/fal?jobId=${encodeURIComponent(jobId)}`
}

const getFalKey = () => {
    const key = process.env.FAL_KEY?.trim() || process.env.FAL_API_KEY?.trim()
    if (!key) {
        throw new Error("FAL_KEY is required for image generation.")
    }
    return key
}

const toReferenceSources = (keys: string[] = []): ImageReferenceSource[] =>
    keys.map((key) => ({
        key,
        source: key.startsWith("attachments/")
            ? "attachment"
            : key.startsWith("generations/")
              ? "generation"
              : "reference_upload"
    }))

const getImageCreditLimitMessage = (reservation: {
    reason?: string
    window?: "five_hour" | "monthly"
}) => {
    if (reservation.reason === "plan") {
        return "Pro plan required for image generation."
    }

    if (reservation.reason === "usage") {
        return reservation.window === "five_hour"
            ? "You've hit your 5-hour limit. It resets as recent usage rolls off."
            : "You've hit your monthly limit. It renews next billing period."
    }

    return "Usage limit reached for image generation."
}

const submitImageGenerationJob = async (
    ctx: GenericActionCtx<DataModel>,
    {
        userId,
        prompt,
        modelId,
        clientRequestId,
        aspectRatio,
        resolution,
        references,
        source,
        sourceThreadId,
        sourceMessageId,
        sourceToolCallId,
        sourceCardId,
        creditEventKey,
        reservedMicrousd: providedReservedMicrousd,
        quality
    }: {
        userId: string
        prompt: string
        modelId: string
        clientRequestId?: string
        aspectRatio?: string
        resolution?: string
        references?: ImageReferenceSource[]
        source?: "library" | "chat"
        sourceThreadId?: Id<"threads">
        sourceMessageId?: string
        sourceToolCallId?: string
        sourceCardId?: string
        creditEventKey?: string
        reservedMicrousd?: number
        quality?: "low" | "medium" | "high"
    }
) => {
    const referenceSources = references ?? []
    const validated = validatePreparedImageRequest({
        modelId,
        aspectRatio,
        resolution,
        variants: 1,
        referenceCount: referenceSources.length,
        quality
    })

    const imageCreditEventKey =
        creditEventKey ?? createImageCreditEventKey(source === "chat" ? "chat" : "standalone")
    const falEndpoint = getFalEndpointForRequest(validated.descriptor, referenceSources.length)
    const fallbackMicrousd = getConfiguredFalReservationMicrousd({
        modelId,
        resolution: validated.resolution
    })
    const localEstimateMicrousd =
        validated.creditEstimate.estimatedUsd === undefined
            ? undefined
            : usdToMicrousd(validated.creditEstimate.estimatedUsd)
    const reservedMicrousd =
        providedReservedMicrousd ??
        localEstimateMicrousd ??
        (await estimateFalReservationMicrousd(falEndpoint, fallbackMicrousd))
    const creditReservation = await ctx.runMutation(internal.credits.reserveCreditForMessage, {
        userId,
        messageId: imageCreditEventKey,
        messageKey: imageCreditEventKey,
        modelId,
        providerSource: "internal",
        feature: "image",
        counted: true,
        reservedMicrousd,
        pricingSource: "fal_manual",
        requiredPlan: validated.creditEstimate.requiredPlan
    })

    if (!creditReservation.allowed) {
        throw new ConvexError(getImageCreditLimitMessage(creditReservation))
    }

    let jobId: Id<"imageGenerationJobs"> | null = null

    try {
        fal.config({ credentials: getFalKey() })
        const referenceImages = await resolveFalReferenceImagesForProvider(
            ctx,
            userId,
            referenceSources
        )
        const input = buildFalImageInput(validated.descriptor, {
            prompt,
            imageSize: validated.aspectRatio,
            imageResolution: validated.resolution,
            referenceImages,
            maxAssets: 1,
            quality
        })
        const createdJobId: Id<"imageGenerationJobs"> = await ctx.runMutation(
            internal.image_generation_jobs.createImageGenerationJob,
            {
                userId,
                clientRequestId,
                ...(source ? { source } : {}),
                ...(sourceThreadId ? { sourceThreadId } : {}),
                ...(sourceMessageId ? { sourceMessageId } : {}),
                ...(sourceToolCallId ? { sourceToolCallId } : {}),
                ...(sourceCardId ? { sourceCardId } : {}),
                appModelId: modelId,
                falEndpoint,
                prompt,
                aspectRatio: validated.aspectRatio,
                resolution: validated.resolution,
                referenceImageKeys: referenceSources.map((reference) => reference.key),
                creditEventKey: imageCreditEventKey
            }
        )
        jobId = createdJobId
        const submitFalQueue = fal.queue.submit as (
            endpointId: string,
            options: { input: Record<string, unknown>; webhookUrl: string }
        ) => Promise<{ request_id?: string; gateway_request_id?: string }>
        const submission = await submitFalQueue(falEndpoint, {
            input,
            webhookUrl: getFalWebhookUrl(createdJobId)
        })
        const falRequestId = submission.request_id
        if (!falRequestId) {
            console.error("fal accepted image generation without returning a request id", {
                jobId: createdJobId,
                falEndpoint
            })
            return createdJobId
        }

        try {
            await ctx.runMutation(
                internal.image_generation_jobs.attachFalRequestToImageGenerationJob,
                {
                    jobId,
                    falRequestId,
                    falGatewayRequestId: submission.gateway_request_id
                }
            )
        } catch (error) {
            // The webhook URL carries jobId, so completion can still reconcile.
            console.error("Failed to attach fal request id to image generation job:", error)
        }

        return jobId
    } catch (error) {
        const message = normalizeFalImageErrorMessage(error)
        await ctx.runMutation(internal.credits.releaseReservedCreditForMessage, {
            userId,
            messageKey: imageCreditEventKey
        })
        if (jobId) {
            await ctx.runMutation(internal.image_generation_jobs.markImageGenerationJobFailed, {
                jobId,
                status: "refunded",
                error: message
            })
        }
        throw new ConvexError(message)
    }
}

export const generateStandaloneImage = action({
    args: {
        prompt: v.string(),
        modelId: v.string(),
        clientRequestId: v.optional(v.string()),
        aspectRatio: v.optional(v.string()),
        resolution: v.optional(v.string()),
        quality: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
        referenceImageIds: v.optional(v.array(v.string()))
    },
    handler: async (ctx, args) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new Error("unauthorized:chat")
        await assertAccountNotDeletingForAction(ctx, user.id)

        const isGptImage2QualityRequest =
            args.modelId === "gpt-5.4-image-2" && args.quality !== undefined
        const access = isGptImage2QualityRequest
            ? await ctx.runQuery(internal.credits.getUserCreditStateInternal, {
                  userId: user.id
              })
            : null
        const canOverrideGptImage2Quality =
            process.env.DEV_CREDIT_LAB_ENABLED === "1" || access?.isStaff === true

        const jobId = await submitImageGenerationJob(ctx, {
            userId: user.id,
            prompt: args.prompt,
            modelId: args.modelId,
            clientRequestId: args.clientRequestId,
            aspectRatio: args.aspectRatio,
            resolution: args.resolution,
            quality: canOverrideGptImage2Quality ? args.quality : undefined,
            references: toReferenceSources(args.referenceImageIds)
        })

        return [jobId]
    }
})

export const confirmPreparedChatImageGeneration = action({
    args: {
        threadId: v.id("threads"),
        assistantMessageId: v.string(),
        toolCallId: v.string(),
        cardId: v.string()
    },
    handler: async (ctx, args): Promise<Id<"imageGenerationJobs">[]> => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new Error("unauthorized:chat")
        await assertAccountNotDeletingForAction(ctx, user.id)

        const thread = await ctx.runQuery(internal.threads.getThreadById, {
            threadId: args.threadId
        })
        if (!thread || thread.authorId !== user.id) {
            throw new Error("Thread not found.")
        }

        // Atomically claim the card (pending_confirmation -> submitting) so concurrent
        // confirms (e.g. two tabs) can't both reserve credits and submit jobs.
        const claim = await ctx.runMutation(internal.messages.claimPreparedImageGenerationCard, {
            threadId: args.threadId,
            messageId: args.assistantMessageId,
            toolCallId: args.toolCallId,
            cardId: args.cardId
        })
        if (!claim.ok) {
            throw new Error("Image generation card is no longer confirmable.")
        }

        const result = claim.result as {
            success?: boolean
            cardId?: string
            prompt?: string
            modelId?: string
            aspectRatio?: string
            resolution?: string
            variants?: number
            referenceSources?: Array<{
                key?: string
                source?: ImageReferenceSource["source"]
                generatedImageId?: Id<"generatedImages">
            }>
        }

        // The card is already claimed (status "submitting"); from here, any failure must
        // move it to a terminal state so it never sticks in "submitting".
        const failCard = async (
            status: "failed" | "partial",
            error: string,
            jobIds: Id<"imageGenerationJobs">[] = []
        ) => {
            await ctx.runMutation(internal.messages.patchPreparedImageGenerationToolResult, {
                threadId: args.threadId,
                messageId: args.assistantMessageId,
                toolCallId: args.toolCallId,
                cardId: args.cardId,
                update: { status, jobIds, error }
            })
        }

        if (result.success !== true || !result.prompt || !result.modelId) {
            await failCard("failed", "Image generation card is no longer confirmable.")
            throw new Error("Image generation card is no longer confirmable.")
        }

        let validated: ReturnType<typeof validatePreparedImageRequest>
        const referenceSources: ImageReferenceSource[] = []
        try {
            for (const reference of result.referenceSources ?? []) {
                if (reference.generatedImageId) {
                    referenceSources.push(
                        await resolveGeneratedImageReferenceSource(
                            ctx,
                            user.id,
                            reference.generatedImageId
                        )
                    )
                    continue
                }
                if (!reference.key || !reference.source) {
                    throw new Error("Invalid reference image.")
                }
                referenceSources.push({
                    key: reference.key,
                    source: reference.source
                })
            }

            validated = validatePreparedImageRequest({
                modelId: result.modelId,
                aspectRatio: result.aspectRatio,
                resolution: result.resolution,
                variants: result.variants ?? 1,
                referenceCount: referenceSources.length
            })
        } catch (error) {
            const message = normalizeFalImageErrorMessage(error)
            await failCard("failed", message)
            throw new ConvexError(message)
        }

        const creditEventKeys = Array.from({ length: validated.variants }, () =>
            createImageCreditEventKey("chat")
        )
        const falEndpoint = getFalEndpointForRequest(validated.descriptor, referenceSources.length)
        const fallbackMicrousd = getConfiguredFalReservationMicrousd({
            modelId: result.modelId,
            resolution: validated.resolution
        })
        const localEstimatePerImageMicrousd =
            validated.creditEstimate.estimatedUsd === undefined
                ? undefined
                : usdToMicrousd(validated.creditEstimate.estimatedUsd / validated.variants)
        const reservedMicrousd =
            localEstimatePerImageMicrousd ??
            (await estimateFalReservationMicrousd(falEndpoint, fallbackMicrousd))

        for (let index = 0; index < creditEventKeys.length; index++) {
            const creditEventKey = creditEventKeys[index]
            const creditReservation = await ctx.runMutation(
                internal.credits.reserveCreditForMessage,
                {
                    userId: user.id,
                    messageId: creditEventKey,
                    messageKey: creditEventKey,
                    modelId: result.modelId,
                    providerSource: "internal",
                    feature: "image",
                    counted: true,
                    reservedMicrousd,
                    pricingSource: "fal_manual",
                    requiredPlan: validated.creditEstimate.requiredPlan
                }
            )

            if (!creditReservation.allowed) {
                await Promise.all(
                    creditEventKeys.slice(0, index).map((reservedKey) =>
                        ctx.runMutation(internal.credits.releaseReservedCreditForMessage, {
                            userId: user.id,
                            messageKey: reservedKey
                        })
                    )
                )
                const message = getImageCreditLimitMessage(creditReservation)
                await failCard("failed", message)
                throw new ConvexError(message)
            }
        }

        const jobIds: Id<"imageGenerationJobs">[] = []
        try {
            for (let index = 0; index < validated.variants; index++) {
                const jobId = await submitImageGenerationJob(ctx, {
                    userId: user.id,
                    prompt: result.prompt,
                    modelId: result.modelId,
                    clientRequestId: `${args.cardId}:${index + 1}`,
                    aspectRatio: validated.aspectRatio,
                    resolution: validated.resolution,
                    references: referenceSources,
                    source: "chat",
                    sourceThreadId: args.threadId,
                    sourceMessageId: args.assistantMessageId,
                    sourceToolCallId: args.toolCallId,
                    sourceCardId: args.cardId,
                    creditEventKey: creditEventKeys[index],
                    reservedMicrousd
                })
                jobIds.push(jobId)
            }
        } catch (error) {
            const message = normalizeFalImageErrorMessage(error)
            await Promise.all(
                creditEventKeys.slice(jobIds.length).map((reservedKey) =>
                    ctx.runMutation(internal.credits.releaseReservedCreditForMessage, {
                        userId: user.id,
                        messageKey: reservedKey
                    })
                )
            )
            await failCard(jobIds.length > 0 ? "partial" : "failed", message, jobIds)
            throw new ConvexError(message)
        }

        await ctx.runMutation(internal.messages.patchPreparedImageGenerationToolResult, {
            threadId: args.threadId,
            messageId: args.assistantMessageId,
            toolCallId: args.toolCallId,
            cardId: args.cardId,
            update: {
                status: "submitted",
                jobIds,
                generatedImageIds: []
            }
        })

        return jobIds
    }
})

export const generateFakeStandaloneImage = action({
    args: {
        prompt: v.string(),
        modelId: v.string(),
        aspectRatio: v.optional(v.string()),
        resolution: v.optional(v.string()),
        variantIndex: v.optional(v.number()),
        referenceImageIds: v.optional(v.array(v.string())),
        responseTimeSeconds: v.optional(v.number())
    },
    handler: async (ctx, args): Promise<Id<"generatedImages">[]> => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new Error("unauthorized:chat")
        await assertAccountNotDeletingForAction(ctx, user.id)

        const modelName =
            MODELS_SHARED.find((model) => model.id === args.modelId)?.name ?? args.modelId
        const sharedModel = MODELS_SHARED.find((model) => model.id === args.modelId)
        enforceImageGenerationPlan({
            userCreditPlan: await ctx.runQuery(internal.credits.getUserCreditPlanInternal, {
                userId: user.id
            }),
            availableToPickFor: sharedModel?.availableToPickFor
        })
        const aspectRatio = args.aspectRatio || "1:1"
        const responseTimeSeconds = clampFakeResponseTimeSeconds(args.responseTimeSeconds)
        const prompt = args.prompt.trim()
        const referenceCount = args.referenceImageIds?.length ?? 0

        await wait(responseTimeSeconds * 1000)

        const svg = buildDevFakeSvg({
            modelName,
            aspectRatio,
            resolution: args.resolution,
            prompt,
            variantIndex: args.variantIndex,
            referenceCount,
            responseTimeSeconds
        })
        const storageKey = await r2.store(ctx, new TextEncoder().encode(svg), {
            authorId: user.id,
            key: `generations/${user.id}/${Date.now()}-${crypto.randomUUID()}-dev-fake-generation.svg`,
            type: "image/svg+xml"
        })

        const insertedId: Id<"generatedImages"> = await ctx.runMutation(
            internal.images.insertGeneratedImage,
            {
                userId: user.id,
                storageKey,
                prompt,
                modelId: args.modelId,
                aspectRatio,
                resolution: args.resolution,
                referenceImageKeys: args.referenceImageIds
            }
        )

        return [insertedId]
    }
})

export const deleteGeneratedImage = action({
    args: { id: v.id("generatedImages") },
    handler: async (ctx, args) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new Error("unauthorized:chat")
        await assertAccountNotDeletingForAction(ctx, user.id)

        // Need internal query to get image to check ownership and storageKey
        const image = await ctx.runQuery(internal.images.getGeneratedImageInternal, { id: args.id })
        if (!image) throw new Error("Image not found")
        if (image.userId !== user.id) throw new Error("Unauthorized to delete this image")

        // Import r2 dynamically or statically
        const { r2 } = await import("./attachments")

        try {
            await r2.deleteObject(ctx, image.storageKey)
        } catch (error) {
            console.error("Failed to delete from R2:", error)
            throw new Error("Failed to delete image file from storage")
        }

        const blurredWidths = getLibraryPrivateBlurWidths(image.aspectRatio)
        for (const width of blurredWidths) {
            for (const format of ["avif", "webp"] as const) {
                const blurredKey = getPrivateBlurStorageKey({
                    storageKey: image.storageKey,
                    width,
                    format
                })

                try {
                    await r2.deleteObject(ctx, blurredKey)
                } catch {
                    // Ignore missing derivatives during cleanup.
                }
            }
        }

        await ctx.runMutation(internal.images.removeGeneratedImageInternal, { id: args.id })
    }
})

export const migrateUserImages = action({
    args: {},
    handler: async (ctx) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) return
        await assertAccountNotDeletingForAction(ctx, user.id)

        const { r2 } = await import("./attachments")
        const keyPrefix = `generations/${user.id}/`
        const pageSize = 200
        const files: { key: string; lastModified: string | number }[] = []
        for await (const page of iterateMetadataPages(
            (cursor) => r2.listMetadata(ctx, user.id, pageSize, cursor, keyPrefix),
            () => console.warn("[images.sync] Repeated pagination cursor detected")
        )) {
            files.push(...page)
        }

        // Get existing entries from DB
        const existingImages = await ctx.runQuery(internal.images.listGeneratedImagesInternal, {
            userId: user.id
        })
        const existingKeys = new Set(
            existingImages.map((img: { storageKey: string }) => img.storageKey)
        )

        const newFiles = files.filter((f) => !existingKeys.has(f.key))

        for (const file of newFiles) {
            await ctx.runMutation(internal.images.insertGeneratedImage, {
                userId: user.id,
                storageKey: file.key,
                createdAt: new Date(file.lastModified).getTime()
            })
        }

        for (const image of existingImages) {
            const searchText = buildGeneratedImageSearchText({
                prompt: image.prompt,
                modelId: image.modelId,
                aspectRatio: image.aspectRatio,
                resolution: image.resolution
            })

            if (image.searchText === searchText) {
                continue
            }

            await ctx.runMutation(internal.images.updateGeneratedImageSearchTextInternal, {
                id: image._id,
                searchText
            })
        }

        await ctx.runMutation(internal.images.rebuildGeneratedImageFacetsInternal, {
            userId: user.id
        })
    }
})
import { iterateMetadataPages } from "./lib/r2_pagination"
