import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { action, internalMutation, internalQuery, query } from "./_generated/server"
import { saveFalImages } from "./lib/image_generation/save_fal_images"
import { assertAccountNotDeletingForAction } from "./lib/account_deletion_gate"
import { getUserIdentity } from "./lib/identity"
import { getVariantIndexFromClientRequestId } from "./lib/image_generation/shared"
import { ImageGenerationJobAsset, ImageGenerationJobStatus } from "./schema/image_generation_job"

const TERMINAL_JOB_STATUSES = new Set(["completed", "partial", "refunded", "failed", "unknown"])
const WEBHOOK_PROCESSING_LEASE_MS = 2 * 60 * 1000

// User-requested asset refetches are rate limited per job so a struggling
// upstream is not hammered. Arbitrary but bounded.
const MAX_ASSET_FETCH_ATTEMPTS = 5
const ASSET_FETCH_COOLDOWN_MS = 15_000

const isChatImageAsset = (
    asset: {
        generatedImageId: Id<"generatedImages">
        storageKey: string
        imageUrl: string
        variantIndex?: number
    } | null
): asset is {
    generatedImageId: Id<"generatedImages">
    storageKey: string
    imageUrl: string
    variantIndex?: number
} => asset !== null

export const listActiveImageGenerationJobs = query({
    args: {},
    handler: async (ctx) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) return []

        const jobs = await ctx.db
            .query("imageGenerationJobs")
            .withIndex("byUserIdAndCreatedAt", (q) => q.eq("userId", user.id))
            .order("desc")
            .take(50)

        return jobs.filter(
            (job) =>
                job.status === "submitted" ||
                job.status === "submitting" ||
                job.status === "processing" ||
                job.status === "storing_failed"
        )
    }
})

export const getImageGenerationJobByFalRequestId = internalQuery({
    args: {
        falRequestId: v.string()
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("imageGenerationJobs")
            .withIndex("byFalRequestId", (q) => q.eq("falRequestId", args.falRequestId))
            .first()
    }
})

export const getImageGenerationJobInternal = internalQuery({
    args: {
        jobId: v.id("imageGenerationJobs")
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.jobId)
    }
})

export const createImageGenerationJob = internalMutation({
    args: {
        userId: v.string(),
        clientRequestId: v.optional(v.string()),
        source: v.optional(v.union(v.literal("library"), v.literal("chat"))),
        sourceThreadId: v.optional(v.id("threads")),
        sourceMessageId: v.optional(v.string()),
        sourceToolCallId: v.optional(v.string()),
        sourceCardId: v.optional(v.string()),
        appModelId: v.string(),
        falEndpoint: v.string(),
        prompt: v.string(),
        aspectRatio: v.string(),
        resolution: v.optional(v.string()),
        referenceImageKeys: v.array(v.string()),
        creditEventKey: v.string()
    },
    handler: async (ctx, args) => {
        const now = Date.now()
        return await ctx.db.insert("imageGenerationJobs", {
            ...args,
            status: "submitting",
            createdAt: now,
            updatedAt: now
        })
    }
})

export const attachFalRequestToImageGenerationJob = internalMutation({
    args: {
        jobId: v.id("imageGenerationJobs"),
        falRequestId: v.string(),
        falGatewayRequestId: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const job = await ctx.db.get(args.jobId)
        if (!job) return null
        if (TERMINAL_JOB_STATUSES.has(job.status)) return job._id

        await ctx.db.patch(job._id, {
            falRequestId: args.falRequestId,
            falGatewayRequestId: args.falGatewayRequestId,
            status: job.status === "submitting" ? "submitted" : job.status,
            updatedAt: Date.now()
        })
        return job._id
    }
})

export const markImageGenerationJobFailed = internalMutation({
    args: {
        jobId: v.id("imageGenerationJobs"),
        status: v.union(v.literal("failed"), v.literal("refunded")),
        error: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const job = await ctx.db.get(args.jobId)
        if (!job) return null
        if (TERMINAL_JOB_STATUSES.has(job.status)) return job._id

        await ctx.db.patch(job._id, {
            status: args.status,
            error: args.error,
            completedAt: Date.now(),
            updatedAt: Date.now()
        })
        return job._id
    }
})

export const claimImageGenerationJobForWebhook = internalMutation({
    args: {
        falRequestId: v.string(),
        jobId: v.optional(v.id("imageGenerationJobs"))
    },
    handler: async (ctx, args) => {
        const jobByRequestId = await ctx.db
            .query("imageGenerationJobs")
            .withIndex("byFalRequestId", (q) => q.eq("falRequestId", args.falRequestId))
            .first()
        const job = jobByRequestId ?? (args.jobId ? await ctx.db.get(args.jobId) : null)
        if (!job) {
            return { claimed: false, status: "missing" as const }
        }

        if (TERMINAL_JOB_STATUSES.has(job.status)) {
            return { claimed: false, status: job.status }
        }

        const now = Date.now()
        if (
            job.status === "processing" &&
            typeof job.processingStartedAt === "number" &&
            now - job.processingStartedAt < WEBHOOK_PROCESSING_LEASE_MS
        ) {
            return { claimed: false, status: job.status }
        }

        await ctx.db.patch(job._id, {
            falRequestId: job.falRequestId ?? args.falRequestId,
            status: "processing",
            processingStartedAt: now,
            updatedAt: now
        })
        return { claimed: true, status: "processing" as const, jobId: job._id }
    }
})

export const finalizeImageGenerationJob = internalMutation({
    args: {
        falRequestId: v.string(),
        status: ImageGenerationJobStatus,
        generatedImageIds: v.optional(v.array(v.id("generatedImages"))),
        error: v.optional(v.string()),
        webhookPayload: v.optional(v.any())
    },
    handler: async (ctx, args) => {
        const job = await ctx.db
            .query("imageGenerationJobs")
            .withIndex("byFalRequestId", (q) => q.eq("falRequestId", args.falRequestId))
            .first()
        if (!job) return null

        if (TERMINAL_JOB_STATUSES.has(job.status)) {
            return job._id
        }

        await ctx.db.patch(job._id, {
            status: args.status,
            generatedImageIds: args.generatedImageIds,
            error: args.error,
            webhookPayload: args.webhookPayload,
            processingStartedAt: undefined,
            completedAt: Date.now(),
            updatedAt: Date.now()
        })
        return job._id
    }
})

// Generation succeeded at fal but the asset could not be materialized into R2.
// Non-terminal: the persisted asset URLs let a user-requested refetch recover it.
export const markImageGenerationJobStoringFailed = internalMutation({
    args: {
        jobId: v.id("imageGenerationJobs"),
        assetUrls: v.optional(v.array(ImageGenerationJobAsset)),
        error: v.optional(v.string()),
        webhookPayload: v.optional(v.any())
    },
    handler: async (ctx, args) => {
        const job = await ctx.db.get(args.jobId)
        if (!job) return null
        // Never clobber an already-materialized success.
        if (job.status === "completed" || job.status === "partial") return job._id

        await ctx.db.patch(job._id, {
            status: "storing_failed",
            ...(args.assetUrls ? { assetUrls: args.assetUrls } : {}),
            ...(args.webhookPayload ? { webhookPayload: args.webhookPayload } : {}),
            error: args.error,
            processingStartedAt: undefined,
            updatedAt: Date.now()
        })
        return job._id
    }
})

// Atomically claim a user-requested asset retry: serializes concurrent clicks,
// enforces the per-job attempt cap and cooldown, and flips to processing so a
// duplicate request can't run the fetch twice.
export const claimImageGenerationJobAssetRetry = internalMutation({
    args: {
        jobId: v.id("imageGenerationJobs"),
        userId: v.string()
    },
    handler: async (ctx, args) => {
        const job = await ctx.db.get(args.jobId)
        if (!job || job.userId !== args.userId) {
            return { claimed: false as const, reason: "not_found" as const }
        }
        if (job.status === "completed" || job.status === "partial") {
            return { claimed: false as const, reason: "already_stored" as const }
        }
        if (job.status !== "storing_failed") {
            return {
                claimed: false as const,
                reason: "not_retryable" as const,
                message: "This generation is not awaiting an image retry."
            }
        }
        if (!job.falRequestId) {
            return {
                claimed: false as const,
                reason: "not_retryable" as const,
                message: "This generation is missing its provider request identifier."
            }
        }

        const attempts = job.assetFetchAttempts ?? 0
        if (attempts >= MAX_ASSET_FETCH_ATTEMPTS) {
            return {
                claimed: false as const,
                reason: "limit" as const,
                message: "Retry limit reached for this image. Try regenerating."
            }
        }

        const now = Date.now()
        if (
            typeof job.lastAssetFetchAttemptAt === "number" &&
            now - job.lastAssetFetchAttemptAt < ASSET_FETCH_COOLDOWN_MS
        ) {
            return {
                claimed: false as const,
                reason: "cooldown" as const,
                message: "Please wait a moment before retrying."
            }
        }

        await ctx.db.patch(job._id, {
            status: "processing",
            assetFetchAttempts: attempts + 1,
            lastAssetFetchAttemptAt: now,
            processingStartedAt: now,
            updatedAt: now
        })

        return {
            claimed: true as const,
            userId: job.userId,
            falRequestId: job.falRequestId,
            prompt: job.prompt,
            appModelId: job.appModelId,
            aspectRatio: job.aspectRatio,
            resolution: job.resolution,
            referenceImageKeys: job.referenceImageKeys,
            source: job.source,
            sourceThreadId: job.sourceThreadId,
            sourceMessageId: job.sourceMessageId,
            sourceToolCallId: job.sourceToolCallId,
            sourceCardId: job.sourceCardId,
            clientRequestId: job.clientRequestId,
            assetUrls: job.assetUrls ?? []
        }
    }
})

// User-triggered, idempotent recovery for a job stuck in storing_failed: refetch
// the persisted fal asset URLs into R2 and finalize. Credit was already committed
// at webhook time (the generation was real), so this only materializes the asset.
export const reprocessImageGenerationJobAsset = action({
    args: { jobId: v.id("imageGenerationJobs") },
    handler: async (
        ctx,
        args
    ): Promise<{
        status: "completed" | "partial"
        generatedImageIds?: Id<"generatedImages">[]
    }> => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new Error("unauthorized:chat")
        await assertAccountNotDeletingForAction(ctx, user.id)

        const claim = await ctx.runMutation(
            internal.image_generation_jobs.claimImageGenerationJobAssetRetry,
            { jobId: args.jobId, userId: user.id }
        )
        if (!claim.claimed) {
            if (claim.reason === "already_stored") {
                return { status: "completed" }
            }
            throw new Error(
                "message" in claim && claim.message
                    ? claim.message
                    : "This image can no longer be retried."
            )
        }

        const patchChatCard = async (update: {
            status: "processing" | "completed" | "partial" | "storing_failed"
            generatedImageIds?: Id<"generatedImages">[]
            assets?: Array<{
                generatedImageId: Id<"generatedImages">
                storageKey: string
                imageUrl: string
                variantIndex?: number
            }>
            error?: string
        }) => {
            if (
                claim.source !== "chat" ||
                !claim.sourceThreadId ||
                !claim.sourceMessageId ||
                !claim.sourceToolCallId ||
                !claim.sourceCardId
            ) {
                return
            }

            await ctx.runMutation(internal.messages.patchPreparedImageGenerationToolResult, {
                threadId: claim.sourceThreadId,
                messageId: claim.sourceMessageId,
                toolCallId: claim.sourceToolCallId,
                cardId: claim.sourceCardId,
                update
            })
        }

        await patchChatCard({ status: "processing" })

        try {
            if (claim.assetUrls.length === 0) {
                throw new Error("No stored image URL is available to retry.")
            }

            const generatedImageIds: Id<"generatedImages">[] = []
            const failures: string[] = []

            const saved = await saveFalImages(
                ctx,
                claim,
                args.jobId,
                claim.falRequestId,
                claim.assetUrls
            )
            generatedImageIds.push(...saved.generatedImageIds)
            failures.push(...saved.failures)

            if (generatedImageIds.length === 0) {
                throw new Error(failures[0] ?? "Could not fetch the image. Please try again.")
            }

            const status = failures.length > 0 ? "partial" : "completed"
            await ctx.runMutation(internal.image_generation_jobs.finalizeImageGenerationJob, {
                falRequestId: claim.falRequestId,
                status,
                generatedImageIds,
                error: failures.length > 0 ? failures.join("; ") : undefined
            })
            const assets = await Promise.all(
                generatedImageIds.map(async (generatedImageId) => {
                    const image = await ctx.runQuery(internal.images.getGeneratedImageInternal, {
                        id: generatedImageId
                    })
                    if (!image) return null
                    const variantIndex = getVariantIndexFromClientRequestId(claim.clientRequestId)
                    return {
                        generatedImageId,
                        storageKey: image.storageKey,
                        imageUrl: image.storageKey,
                        ...(variantIndex ? { variantIndex } : {})
                    }
                })
            )
            await patchChatCard({
                status,
                generatedImageIds,
                assets: assets.filter(isChatImageAsset),
                ...(failures.length > 0 ? { error: failures.join("; ") } : {})
            })
            return { status, generatedImageIds }
        } catch (error) {
            // Reset to storing_failed so the card keeps its retry affordance.
            const message = error instanceof Error ? error.message : "Image retry failed"
            await ctx.runMutation(
                internal.image_generation_jobs.markImageGenerationJobStoringFailed,
                {
                    jobId: args.jobId,
                    error: message
                }
            )
            await patchChatCard({ status: "storing_failed", error: message })
            throw error
        }
    }
})
