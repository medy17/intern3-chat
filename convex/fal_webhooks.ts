import { saveFalImages, getExtensionFromContentType } from "./lib/image_generation/save_fal_images"
export { downloadFalImage } from "./lib/image_generation/save_fal_images"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { type ActionCtx, httpAction } from "./_generated/server"
import { r2 } from "./attachments"
import {
    FAL_R2_INGEST_SIGNATURE_HEADER,
    FAL_R2_INGEST_TIMESTAMP_HEADER,
    FAL_R2_INGEST_VERSION,
    type FalR2IngestTask,
    signFalR2IngestBody
} from "./lib/fal_r2_ingest"
import { getVariantIndexFromClientRequestId } from "./lib/image_generation/shared"
import {
    type FalGeneratedImage,
    doesFalModelSettleAfterSafetyRejection,
    parseFalImagePayload
} from "./lib/models/fal"

const FAL_JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json"
const FAL_JWKS_CACHE_MS = 24 * 60 * 60 * 1000
const FAL_WEBHOOK_TIMESTAMP_LEEWAY_SECONDS = 5 * 60

let falJwksCache: { keys: string[]; expiresAt: number } | null = null

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json"
        }
    })

const asObject = (value: unknown): Record<string, unknown> | null =>
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null

const getString = (value: unknown) => (typeof value === "string" ? value : undefined)

const bytesToHex = (bytes: ArrayBuffer) =>
    Array.from(new Uint8Array(bytes))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")

const hexToBytes = (hex: string) => {
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null

    const bytes = new Uint8Array(hex.length / 2)
    for (let index = 0; index < hex.length; index += 2) {
        bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16)
    }
    return bytes
}

const base64UrlToBytes = (value: string) => {
    const padded = value
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "=")
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

const getFalJwksKeys = async () => {
    const now = Date.now()
    if (falJwksCache && falJwksCache.expiresAt > now) {
        return falJwksCache.keys
    }

    const response = await fetch(FAL_JWKS_URL)
    if (!response.ok) {
        throw new Error(`Failed to fetch fal JWKS (${response.status})`)
    }

    const payload = asObject(await response.json())
    const keys = Array.isArray(payload?.keys)
        ? payload.keys
              .map((key) => getString(asObject(key)?.x))
              .filter((key): key is string => Boolean(key))
        : []
    falJwksCache = {
        keys,
        expiresAt: now + FAL_JWKS_CACHE_MS
    }
    return keys
}

export const clearFalWebhookJwksCacheForTests = () => {
    falJwksCache = null
}

export const verifyFalWebhookSignature = async ({
    rawBody,
    headers,
    getJwksKeys = getFalJwksKeys
}: {
    rawBody: string
    headers: Headers
    getJwksKeys?: () => Promise<string[]>
}) => {
    const requestId = headers.get("X-Fal-Webhook-Request-Id")
    const userId = headers.get("X-Fal-Webhook-User-Id")
    const timestamp = headers.get("X-Fal-Webhook-Timestamp")
    const signature = headers.get("X-Fal-Webhook-Signature")
    if (!requestId || !userId || !timestamp || !signature) return false

    const timestampSeconds = Number.parseInt(timestamp, 10)
    const nowSeconds = Math.floor(Date.now() / 1000)
    if (
        !Number.isFinite(timestampSeconds) ||
        Math.abs(nowSeconds - timestampSeconds) > FAL_WEBHOOK_TIMESTAMP_LEEWAY_SECONDS
    ) {
        return false
    }

    const signatureBytes = hexToBytes(signature)
    if (!signatureBytes) return false

    const encoder = new TextEncoder()
    const bodyHash = await crypto.subtle.digest("SHA-256", encoder.encode(rawBody))
    const message = encoder.encode([requestId, userId, timestamp, bytesToHex(bodyHash)].join("\n"))
    const keys = await getJwksKeys()

    for (const key of keys) {
        try {
            const publicKey = await crypto.subtle.importKey(
                "raw",
                base64UrlToBytes(key),
                "Ed25519",
                false,
                ["verify"]
            )
            if (await crypto.subtle.verify("Ed25519", publicKey, signatureBytes, message)) {
                return true
            }
        } catch {
            // Try the next JWKS key.
        }
    }

    return false
}

const getFalRequestId = (payload: unknown) => {
    const root = asObject(payload)
    return (
        getString(root?.request_id) ??
        getString(root?.requestId) ??
        getString(asObject(root?.payload)?.request_id) ??
        getString(asObject(root?.data)?.request_id)
    )
}

export const getFalNonImageBillingDisposition = (
    kind: "refusal" | "error" | "unknown",
    appModelId: string
): {
    status: "failed" | "refunded" | "unknown"
    shouldReconcileUsage: boolean
} => {
    if (kind === "refusal") {
        return doesFalModelSettleAfterSafetyRejection(appModelId)
            ? { status: "failed", shouldReconcileUsage: true }
            : { status: "refunded", shouldReconcileUsage: false }
    }

    return {
        status: kind === "error" ? "failed" : "unknown",
        shouldReconcileUsage: false
    }
}

const patchChatImageGenerationCard = async (
    ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
    {
        job,
        status,
        generatedImageIds,
        error
    }: {
        job: {
            source?: "library" | "chat"
            clientRequestId?: string
            sourceThreadId?: Id<"threads">
            sourceMessageId?: string
            sourceToolCallId?: string
            sourceCardId?: string
        }
        status: string
        generatedImageIds?: Id<"generatedImages">[]
        error?: string
    }
) => {
    if (
        job.source !== "chat" ||
        !job.sourceThreadId ||
        !job.sourceMessageId ||
        !job.sourceToolCallId ||
        !job.sourceCardId
    ) {
        return
    }

    const variantIndex = getVariantIndexFromClientRequestId(job.clientRequestId)
    const assets = await Promise.all(
        (generatedImageIds ?? []).map(async (generatedImageId) => {
            const image = (await ctx.runQuery(internal.images.getGeneratedImageInternal, {
                id: generatedImageId
            })) as { storageKey: string } | null
            if (!image) return null
            return {
                generatedImageId,
                storageKey: image.storageKey,
                imageUrl: image.storageKey,
                ...(variantIndex ? { variantIndex } : {})
            }
        })
    )

    await ctx.runMutation(internal.messages.patchPreparedImageGenerationToolResult, {
        threadId: job.sourceThreadId,
        messageId: job.sourceMessageId,
        toolCallId: job.sourceToolCallId,
        cardId: job.sourceCardId,
        update: {
            status,
            ...(generatedImageIds ? { generatedImageIds } : {}),
            ...(assets.filter(Boolean).length > 0 ? { assets: assets.filter(Boolean) } : {}),
            ...(error ? { error } : {})
        }
    })
}

const getFalR2IngestConfig = () => {
    const endpoint = process.env.FAL_R2_INGEST_URL?.trim()
    const secret = process.env.FAL_R2_INGEST_SECRET?.trim()
    return endpoint && secret ? { endpoint, secret } : null
}

export const createFalR2IngestTasks = ({
    jobId,
    userId,
    images
}: {
    jobId: Id<"imageGenerationJobs"> | string
    userId: string
    images: FalGeneratedImage[]
}): FalR2IngestTask[] =>
    images.map((image, index) => ({
        sourceUrl: image.url,
        storageKey: `generations/${userId}/${jobId}-${index + 1}-fal.${getExtensionFromContentType(image.contentType)}`,
        ...(image.contentType ? { contentType: image.contentType } : {})
    }))

export const ingestFalImagesViaWorker = async (
    tasks: FalR2IngestTask[],
    config = getFalR2IngestConfig()
) => {
    if (!config) throw new Error("Fal R2 ingest worker is not configured")

    const body = JSON.stringify({ version: FAL_R2_INGEST_VERSION, tasks })
    const signed = await signFalR2IngestBody(body, config.secret)
    const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            [FAL_R2_INGEST_SIGNATURE_HEADER]: signed.signature,
            [FAL_R2_INGEST_TIMESTAMP_HEADER]: signed.timestamp
        },
        body,
        signal: AbortSignal.timeout(130_000)
    })
    if (!response.ok) throw new Error(`Fal R2 ingest worker returned ${response.status}`)
}

export const falImageWebhook = httpAction(async (ctx, request) => {
    const rawBody = await request.text()
    const isVerified = await verifyFalWebhookSignature({
        rawBody,
        headers: request.headers
    })
    if (!isVerified) {
        return jsonResponse({ error: "Invalid fal webhook signature" }, 401)
    }

    let payload: unknown
    try {
        payload = JSON.parse(rawBody)
    } catch {
        return jsonResponse({ error: "Invalid JSON payload" }, 400)
    }

    const falRequestId = getFalRequestId(payload)
    if (!falRequestId) {
        return jsonResponse({ error: "Missing fal request id" }, 400)
    }

    const webhookJobId = new URL(request.url).searchParams.get(
        "jobId"
    ) as Id<"imageGenerationJobs"> | null
    const jobByRequestId = await ctx.runQuery(
        internal.image_generation_jobs.getImageGenerationJobByFalRequestId,
        {
            falRequestId
        }
    )
    const job =
        jobByRequestId ??
        (webhookJobId
            ? await ctx.runQuery(internal.image_generation_jobs.getImageGenerationJobInternal, {
                  jobId: webhookJobId
              })
            : null)
    if (!job) {
        return jsonResponse({ ok: true, ignored: true })
    }

    const claim = await ctx.runMutation(
        internal.image_generation_jobs.claimImageGenerationJobForWebhook,
        {
            falRequestId,
            ...(webhookJobId ? { jobId: webhookJobId } : {})
        }
    )
    if (!claim?.claimed) {
        return jsonResponse({ ok: true, idempotent: true, status: claim?.status ?? job.status })
    }

    const result = parseFalImagePayload(payload)
    if (result.kind !== "images") {
        const { status, shouldReconcileUsage } = getFalNonImageBillingDisposition(
            result.kind,
            job.appModelId
        )
        if (shouldReconcileUsage) {
            // fal bills some safety refusals (notably Grok image models) and adds
            // their cost metadata asynchronously, just as it does for successful
            // generations. Commit the reservation so reconciliation has an event
            // to settle, then poll for the provider-reported amount.
            await ctx.runMutation(internal.credits.commitReservedCreditForMessage, {
                userId: job.userId,
                messageKey: job.creditEventKey,
                providerRequestId: falRequestId
            })
            await ctx.scheduler.runAfter(0, internal.fal_billing_node.reconcileFalUsageCost, {
                userId: job.userId,
                messageKey: job.creditEventKey,
                requestId: falRequestId
            })
        } else {
            await ctx.runMutation(internal.credits.releaseReservedCreditForMessage, {
                userId: job.userId,
                messageKey: job.creditEventKey
            })
        }
        await ctx.runMutation(internal.image_generation_jobs.finalizeImageGenerationJob, {
            falRequestId,
            status,
            error: result.reason,
            webhookPayload: payload
        })
        await patchChatImageGenerationCard(ctx, {
            job,
            status,
            error: result.reason
        })
        return jsonResponse({ ok: true, status: result.kind })
    }

    // The generation succeeded at fal, so the credit is owed regardless of whether
    // we can materialize the asset right now. Commit once (idempotent); a later
    // storage failure is recoverable, not a refund event.
    await ctx.runMutation(internal.credits.commitReservedCreditForMessage, {
        userId: job.userId,
        messageKey: job.creditEventKey,
        providerRequestId: falRequestId
    })
    await ctx.scheduler.runAfter(0, internal.fal_billing_node.reconcileFalUsageCost, {
        userId: job.userId,
        messageKey: job.creditEventKey,
        requestId: falRequestId
    })

    const ingestConfig = getFalR2IngestConfig()
    let workerTasks: FalR2IngestTask[] | undefined
    if (ingestConfig) {
        try {
            const tasks = createFalR2IngestTasks({
                jobId: job._id,
                userId: job.userId,
                images: result.images
            })
            await ingestFalImagesViaWorker(tasks, ingestConfig)
            workerTasks = tasks
        } catch (error) {
            console.error("[fal webhook] Worker ingest failed; using Convex fallback", {
                falRequestId,
                jobId: job._id,
                error
            })
        }
    }

    const generatedImageIds: Id<"generatedImages">[] = []
    const failures: string[] = []

    if (workerTasks) {
        for (const task of workerTasks) {
            try {
                await r2.syncMetadata(ctx, task.storageKey, { authorId: job.userId })
                const id: Id<"generatedImages"> = await ctx.runMutation(
                    internal.images.insertGeneratedImage,
                    {
                        userId: job.userId,
                        storageKey: task.storageKey,
                        prompt: job.prompt,
                        modelId: job.appModelId,
                        aspectRatio: job.aspectRatio,
                        resolution: job.resolution,
                        referenceImageKeys: job.referenceImageKeys,
                        generationJobId: job._id,
                        falRequestId
                    }
                )
                generatedImageIds.push(id)
            } catch (error) {
                failures.push(
                    error instanceof Error ? error.message : "Unknown image metadata error"
                )
            }
        }
    } else {
        const saved = await saveFalImages(ctx, job, job._id, falRequestId, result.images)
        generatedImageIds.push(...saved.generatedImageIds)
        failures.push(...saved.failures)
    }

    if (generatedImageIds.length === 0) {
        const error = failures[0] ?? "fal returned images, but none could be stored"
        // Asset materialization failed after in-handler retries, but the generation
        // is real and billed. Persist the fal URLs so the user can retry the fetch;
        // do NOT refund or mark failed. Ack 200 so fal does not redeliver (which
        // would amplify load against an already-struggling upstream) — recovery is
        // user-driven via reprocessImageGenerationJobAsset. This needs an operator's
        // eyes if it recurs: the URLs are only good until fal expires them.
        console.error("[fal webhook] asset storage failed; job awaiting refetch", {
            falRequestId,
            jobId: job._id,
            error
        })
        await ctx.runMutation(internal.image_generation_jobs.markImageGenerationJobStoringFailed, {
            jobId: job._id,
            assetUrls: result.images.map((image) => ({
                url: image.url,
                contentType: image.contentType
            })),
            error,
            webhookPayload: payload
        })
        await patchChatImageGenerationCard(ctx, {
            job,
            status: "storing_failed",
            error
        })
        return jsonResponse({ ok: true, status: "storing_failed" })
    }

    const completedStatus = failures.length > 0 ? "partial" : "completed"
    await ctx.runMutation(internal.image_generation_jobs.finalizeImageGenerationJob, {
        falRequestId,
        status: completedStatus,
        generatedImageIds,
        error: failures.length > 0 ? failures.join("; ") : undefined,
        webhookPayload: payload
    })
    await patchChatImageGenerationCard(ctx, {
        job,
        status: completedStatus,
        generatedImageIds,
        error: failures.length > 0 ? failures.join("; ") : undefined
    })

    return jsonResponse({ ok: true, generatedImageIds })
})
