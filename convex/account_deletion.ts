import type { BetterAuthOptions } from "better-auth"
import {
    type GenericActionCtx,
    type GenericDataModel,
    paginationOptsValidator
} from "convex/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Id, TableNames } from "./_generated/dataModel"
import {
    action,
    internalAction,
    internalMutation,
    internalQuery,
    mutation,
    query
} from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { aggregrateThreadsByFolder } from "./aggregates"
import { r2 } from "./attachments"
import { authComponent } from "./auth"
import { getUserCreditPeriod } from "./credits"
import {
    chooseCanonicalSuppression,
    fingerprintAccountIdentity,
    mergeSuppressionSnapshots
} from "./lib/account_deletion"
import {
    ACTIVE_DELETION_STATUSES,
    getAccountDeletionJob,
    getActiveAccountDeletionJob
} from "./lib/account_deletion_status"
import { getUserIdentity } from "./lib/identity"
import { deleteSupermemoryContainer } from "./lib/supermemory_api"

type AccountDeletionPurgeResult = {
    completed: boolean
    phase: string
    deletedCount: number
}
import { selectEffectiveSubscription } from "./lib/lemon_squeezy"

export const ACCOUNT_DELETION_CONFIRMATION_PHRASE = "Delete my account"

const ACCOUNT_DELETION_RETRY_DELAY_MS = 60_000
const ACCOUNT_DELETION_BATCH_SIZE = 100
const ACCOUNT_DELETION_MAX_RETRIES = 5
const ACCOUNT_DELETION_SWEEP_LIMIT = 10
const LEGACY_AUTH_USER_SCAN_LIMIT = 10_000
const PRO_SUBSCRIPTION_STATUSES = new Set(["active", "cancelled", "on_trial", "paused"])
const internalApi = internal as typeof internal & {
    account_deletion: {
        processAccountDeletionJob: typeof processAccountDeletionJob
        continueAccountDeletionPurge: typeof continueAccountDeletionPurge
    }
}

const scheduleDeletionJob = async (ctx: MutationCtx, userId: string, delayMs = 0) => {
    await ctx.scheduler.runAfter(delayMs, internalApi.account_deletion.processAccountDeletionJob, {
        userId
    })
}

const schedulePurgeContinuation = async (
    ctx: MutationCtx,
    userId: string,
    authId: string | undefined
) => {
    await ctx.scheduler.runAfter(0, internalApi.account_deletion.continueAccountDeletionPurge, {
        userId,
        authId
    })
}

export const getMyAccountDeletionRequest = query({
    args: {},
    handler: async (ctx) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) return null

        const job = await getAccountDeletionJob(ctx, user.id)
        if (!job) return null

        return {
            status: job.status,
            phase: job.phase,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            consentAcceptedAt: job.consentAcceptedAt
        }
    }
})

export const getAccountDeletionBlockerInternal = internalQuery({
    args: { userId: v.string() },
    handler: async (ctx, { userId }) => {
        const job = await getActiveAccountDeletionJob(ctx, userId)
        if (!job) return null

        return {
            status: job.status,
            phase: job.phase
        }
    }
})

export const getAccountDeletionJobInternal = internalQuery({
    args: { userId: v.string() },
    handler: async (ctx, { userId }) => {
        const job = await getAccountDeletionJob(ctx, userId)
        if (!job) return null

        return {
            userId: job.userId,
            authId: job.authId,
            status: job.status,
            phase: job.phase
        }
    }
})

export const requestMyAccountDeletion = mutation({
    args: {
        confirmationPhrase: v.string(),
        consentPermanentErasureAccepted: v.boolean(),
        consentFraudPreventionRetentionAccepted: v.boolean()
    },
    handler: async (ctx, args) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) {
            throw new Error("Unauthorized")
        }

        if (args.confirmationPhrase !== ACCOUNT_DELETION_CONFIRMATION_PHRASE) {
            throw new Error("Confirmation phrase does not match")
        }

        if (
            !args.consentPermanentErasureAccepted ||
            !args.consentFraudPreventionRetentionAccepted
        ) {
            throw new Error("Required deletion consent was not accepted")
        }

        const now = Date.now()
        const existingJob = await getAccountDeletionJob(ctx, user.id)
        if (existingJob && ACTIVE_DELETION_STATUSES.has(existingJob.status)) {
            throw new Error("Account deletion is already in progress")
        }
        const nextJob = {
            userId: user.id,
            authId: user.authId,
            status: "pending" as const,
            phase: "user_confirmed",
            error: undefined,
            suppressionId:
                existingJob?.status === "failed" ? undefined : existingJob?.suppressionId,
            confirmationPhrase: args.confirmationPhrase,
            consentPermanentErasureAccepted: args.consentPermanentErasureAccepted,
            consentFraudPreventionRetentionAccepted: args.consentFraudPreventionRetentionAccepted,
            consentAcceptedAt: now,
            retryCount: 0,
            lastAttemptAt: undefined,
            nextRetryAt: undefined,
            cancelledAt: undefined,
            createdAt: existingJob?.createdAt ?? now,
            updatedAt: now
        }

        if (existingJob?._id) {
            await ctx.db.patch(existingJob._id, nextJob)
        } else {
            await ctx.db.insert("accountDeletionJobs", nextJob)
        }

        await scheduleDeletionJob(ctx, user.id)

        return {
            status: nextJob.status,
            phase: nextJob.phase,
            consentAcceptedAt: nextJob.consentAcceptedAt
        }
    }
})

export const cancelMyFailedAccountDeletion = mutation({
    args: {},
    handler: async (ctx) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) {
            throw new Error("Unauthorized")
        }

        const job = await getAccountDeletionJob(ctx, user.id)
        if (!job || job.status !== "failed") {
            throw new Error("No failed account deletion request to cancel")
        }

        const now = Date.now()
        await ctx.db.patch(job._id, {
            status: "cancelled",
            phase: "cancelled",
            error: undefined,
            nextRetryAt: undefined,
            cancelledAt: now,
            updatedAt: now
        })

        return { status: "cancelled" as const, cancelledAt: now }
    }
})

const getFingerprintPepper = () =>
    process.env.IDENTITY_FINGERPRINT_PEPPER?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    "silkchat-local-account-deletion-pepper"

const parseTimestamp = (value: string | undefined) => {
    if (!value) return undefined
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : undefined
}

const getLatestSubscription = async (ctx: QueryCtx | MutationCtx, userId: string) => {
    const subscriptions = await ctx.db
        .query("lemonSqueezySubscriptions")
        .withIndex("byUser", (q) => q.eq("userId", userId))
        .collect()

    return selectEffectiveSubscription(subscriptions)
}

const getCreditAccount = async (ctx: QueryCtx | MutationCtx, userId: string) => {
    return await ctx.db
        .query("prototypeCreditAccounts")
        .withIndex("byUser", (q) => q.eq("userId", userId))
        .first()
}

const upsertBillingSubscriptionLink = async ({
    ctx,
    suppressionId,
    subscription
}: {
    ctx: MutationCtx
    suppressionId: Id<"identitySuppressions">
    subscription: NonNullable<Awaited<ReturnType<typeof getLatestSubscription>>>
}) => {
    const existing = await ctx.db
        .query("billingSubscriptionLinks")
        .withIndex("bySubscriptionId", (q) =>
            q.eq("lemonSqueezySubscriptionId", subscription.lemonSqueezySubscriptionId)
        )
        .first()
    const nextLink = {
        lemonSqueezySubscriptionId: subscription.lemonSqueezySubscriptionId,
        lemonSqueezyCustomerId: subscription.lemonSqueezyCustomerId,
        liveUserId: undefined,
        suppressionId,
        status: subscription.status,
        plan: subscription.plan,
        renewsAt: subscription.renewsAt,
        endsAt: subscription.endsAt,
        trialEndsAt: subscription.trialEndsAt,
        lastEventId: subscription.lastEventId,
        updatedAt: Date.now()
    }

    if (existing?._id) {
        await ctx.db.patch(existing._id, nextLink)
    } else {
        await ctx.db.insert("billingSubscriptionLinks", nextLink)
    }
}

const deletionCreditSnapshotValidator = v.object({
    anchorAt: v.number(),
    periodKey: v.string(),
    periodStartsAt: v.number(),
    periodEndsAt: v.number(),
    consumedUsageMicrousd: v.number(),
    carriedUsageMicrousd: v.number()
})

type DeletionCreditSnapshot = {
    anchorAt: number
    periodKey: string
    periodStartsAt: number
    periodEndsAt: number
    consumedUsageMicrousd: number
    carriedUsageMicrousd: number
}

export const getAccountDeletionCreditPeriodInternal = internalQuery({
    args: { userId: v.string(), timestamp: v.number() },
    handler: async (ctx, { userId, timestamp }) => {
        const account = await getCreditAccount(ctx, userId)
        const period = await getUserCreditPeriod(ctx, userId, account, timestamp)
        const anchorAt = account?.creditPeriodAnchorAt ?? account?._creationTime ?? period.startsAt
        const carriedUsageMicrousd =
            account?.carriedForPeriodKey === period.periodKey
                ? (account.carriedUsageMicrousd ?? 0)
                : 0

        return {
            anchorAt,
            periodKey: period.periodKey,
            periodStartsAt: period.startsAt,
            periodEndsAt: period.endsAt,
            carriedUsageMicrousd
        }
    }
})

export const listAccountDeletionCreditEventsPage = internalQuery({
    args: {
        userId: v.string(),
        periodKey: v.string(),
        paginationOpts: paginationOptsValidator
    },
    handler: async (ctx, { userId, periodKey, paginationOpts }) => {
        return await ctx.db
            .query("prototypeCreditEvents")
            .withIndex("byUserPeriod", (q) => q.eq("userId", userId).eq("periodKey", periodKey))
            .paginate(paginationOpts)
    }
})

export const listAccountDeletionCreditReservationsPage = internalQuery({
    args: {
        userId: v.string(),
        periodKey: v.string(),
        paginationOpts: paginationOptsValidator
    },
    handler: async (ctx, { userId, periodKey, paginationOpts }) => {
        return await ctx.db
            .query("prototypeCreditReservations")
            .withIndex("byUserPeriod", (q) => q.eq("userId", userId).eq("periodKey", periodKey))
            .paginate(paginationOpts)
    }
})

export const listAccountDeletionToolReservationsPage = internalQuery({
    args: {
        userId: v.string(),
        periodKey: v.string(),
        paginationOpts: paginationOptsValidator
    },
    handler: async (ctx, { userId, periodKey, paginationOpts }) => {
        return await ctx.db
            .query("prototypeToolCallReservations")
            .withIndex("byUserPeriod", (q) => q.eq("userId", userId).eq("periodKey", periodKey))
            .paginate(paginationOpts)
    }
})

export const prepareAccountDeletion = internalMutation({
    args: {
        userId: v.string(),
        creditSnapshot: v.optional(deletionCreditSnapshotValidator),
        auth: v.optional(
            v.object({
                authId: v.string(),
                email: v.string(),
                googleSub: v.optional(v.string())
            })
        )
    },
    handler: async (ctx, { userId, auth, creditSnapshot }) => {
        const job = await getAccountDeletionJob(ctx, userId)
        if (!job) {
            throw new Error("Account deletion job not found")
        }
        if (!ACTIVE_DELETION_STATUSES.has(job.status)) {
            throw new Error("Account deletion job is not processable")
        }

        const now = Date.now()
        const subscription = await getLatestSubscription(ctx, userId)

        let suppressionId = job.suppressionId
        if (!suppressionId) {
            if (!auth?.email) {
                throw new Error("Cannot prepare account deletion without auth identity snapshot")
            }
            if (!creditSnapshot) {
                throw new Error("Cannot prepare account deletion without credit usage snapshot")
            }

            const fingerprint = await fingerprintAccountIdentity({
                pepper: getFingerprintPepper(),
                email: auth.email,
                googleSub: auth.googleSub
            })
            const freePeriod = {
                periodKey: creditSnapshot.periodKey,
                startsAt: creditSnapshot.periodStartsAt,
                endsAt: creditSnapshot.periodEndsAt
            }
            const consumedUsageMicrousd =
                creditSnapshot.consumedUsageMicrousd + creditSnapshot.carriedUsageMicrousd
            const emailMatches = await ctx.db
                .query("identitySuppressions")
                .withIndex("byEmailHash", (q) => q.eq("emailHash", fingerprint.emailHash))
                .collect()
            const googleMatches = fingerprint.googleSubHash
                ? await ctx.db
                      .query("identitySuppressions")
                      .withIndex("byGoogleSubHash", (q) =>
                          q.eq("googleSubHash", fingerprint.googleSubHash)
                      )
                      .collect()
                : []
            const matches = [...googleMatches, ...emailMatches].filter(
                (match, index, all) => all.findIndex((other) => other._id === match._id) === index
            )
            const canonical = chooseCanonicalSuppression({
                matches: matches.map((match) => ({
                    _id: String(match._id),
                    googleSubHash: match.googleSubHash,
                    emailHash: match.emailHash,
                    freePeriodKey: match.freePeriodKey,
                    freeConsumedBasicUnits: match.freeConsumedBasicUnits,
                    proEntitlementEndsAt: match.proEntitlementEndsAt,
                    refundCount: match.refundCount,
                    firstDeletedAt: match.firstDeletedAt,
                    lastDeletedAt: match.lastDeletedAt
                })),
                googleSubHash: fingerprint.googleSubHash
            })
            const canonicalDoc = canonical
                ? matches.find((match) => String(match._id) === canonical._id)
                : null
            const merged = mergeSuppressionSnapshots({
                matches: matches.map((match) => ({
                    _id: String(match._id),
                    googleSubHash: match.googleSubHash,
                    emailHash: match.emailHash,
                    freePeriodKey: match.freePeriodKey,
                    freeConsumedBasicUnits: match.freeConsumedBasicUnits,
                    proEntitlementEndsAt: match.proEntitlementEndsAt,
                    refundCount: match.refundCount,
                    firstDeletedAt: match.firstDeletedAt,
                    lastDeletedAt: match.lastDeletedAt
                })),
                freePeriodKey: freePeriod.periodKey
            })
            const proEntitlementEndsAt =
                parseTimestamp(subscription?.endsAt) ??
                parseTimestamp(subscription?.trialEndsAt) ??
                parseTimestamp(subscription?.renewsAt)
            const everWasPro =
                subscription?.plan === "pro" ||
                (subscription?.status
                    ? PRO_SUBSCRIPTION_STATUSES.has(subscription.status)
                    : false) ||
                canonicalDoc?.everWasPro === true
            const nextSuppression = {
                googleSubHash: fingerprint.googleSubHash ?? canonicalDoc?.googleSubHash,
                emailHash: fingerprint.emailHash,
                freeAnchorAt: creditSnapshot.anchorAt,
                freePeriodKey: canonicalDoc?.freePeriodKey ?? freePeriod.periodKey,
                freePeriodEndsAt: canonicalDoc?.freePeriodEndsAt ?? freePeriod.endsAt,
                freeConsumedBasicUnits: canonicalDoc?.freeConsumedBasicUnits ?? 0,
                usagePeriodKey: freePeriod.periodKey,
                consumedUsageMicrousd:
                    canonicalDoc?.usagePeriodKey === freePeriod.periodKey
                        ? Math.max(consumedUsageMicrousd, canonicalDoc.consumedUsageMicrousd ?? 0)
                        : consumedUsageMicrousd,
                everWasPro,
                proEntitlementEndsAt:
                    proEntitlementEndsAt ??
                    canonicalDoc?.proEntitlementEndsAt ??
                    merged?.proEntitlementEndsAt,
                proPeriodKey: canonicalDoc?.proPeriodKey,
                proConsumedBasicUnits: canonicalDoc?.proConsumedBasicUnits,
                proConsumedProUnits: canonicalDoc?.proConsumedProUnits,
                lemonSqueezyCustomerId:
                    subscription?.lemonSqueezyCustomerId ?? canonicalDoc?.lemonSqueezyCustomerId,
                lemonSqueezySubscriptionId:
                    subscription?.lemonSqueezySubscriptionId ??
                    canonicalDoc?.lemonSqueezySubscriptionId,
                refundCount: Math.max(canonicalDoc?.refundCount ?? 0, merged?.refundCount ?? 0),
                relinkedToUserId: undefined,
                priorDeletions: (canonicalDoc?.priorDeletions ?? 0) + 1,
                firstDeletedAt: canonicalDoc?.firstDeletedAt ?? merged?.firstDeletedAt ?? now,
                lastDeletedAt: now,
                supersededBy: undefined
            }

            if (canonicalDoc?._id) {
                suppressionId = canonicalDoc._id
                await ctx.db.patch(canonicalDoc._id, nextSuppression)
                for (const duplicate of matches) {
                    if (duplicate._id !== canonicalDoc._id) {
                        await ctx.db.patch(duplicate._id, { supersededBy: canonicalDoc._id })
                    }
                }
            } else {
                suppressionId = await ctx.db.insert("identitySuppressions", nextSuppression)
            }
        }

        if (subscription && suppressionId) {
            await upsertBillingSubscriptionLink({ ctx, suppressionId, subscription })
        }

        await ctx.db.patch(job._id, {
            status: "purging",
            authId: auth?.authId ?? job.authId,
            suppressionId,
            phase: "prepared",
            error: undefined,
            updatedAt: now
        })

        return {
            authId: auth?.authId,
            subscriptionId: subscription?.lemonSqueezySubscriptionId,
            subscriptionStatus: subscription?.status,
            knownR2Keys: []
        }
    }
})

const deleteDocs = async <T extends { _id: Id<TableNames> }>(ctx: MutationCtx, docs: T[]) => {
    for (const doc of docs) {
        await ctx.db.delete(doc._id)
    }
    return docs.length
}

const deleteBatch = async <T extends { _id: Id<TableNames> }>(
    ctx: MutationCtx,
    queryPromise: Promise<T[]>
) => deleteDocs(ctx, await queryPromise)

const deleteAuthDuplicateRowsBatch = async (
    ctx: MutationCtx,
    tableUserId: string,
    authId: string | undefined
): Promise<{ phase: string; deletedCount: number } | null> => {
    const ids = [...new Set([tableUserId, authId].filter(Boolean) as string[])]

    for (const id of ids) {
        const sessionCount = await deleteBatch(
            ctx,
            ctx.db
                .query("session")
                .withIndex("userId", (q) => q.eq("userId", id))
                .take(ACCOUNT_DELETION_BATCH_SIZE)
        )
        if (sessionCount > 0) return { phase: "purging_auth_sessions", deletedCount: sessionCount }

        const accountCount = await deleteBatch(
            ctx,
            ctx.db
                .query("account")
                .withIndex("userId", (q) => q.eq("userId", id))
                .take(ACCOUNT_DELETION_BATCH_SIZE)
        )
        if (accountCount > 0) return { phase: "purging_auth_accounts", deletedCount: accountCount }

        const twoFactorCount = await deleteBatch(
            ctx,
            ctx.db
                .query("twoFactor")
                .withIndex("userId", (q) => q.eq("userId", id))
                .take(ACCOUNT_DELETION_BATCH_SIZE)
        )
        if (twoFactorCount > 0) {
            return { phase: "purging_auth_two_factor", deletedCount: twoFactorCount }
        }

        const applicationCount = await deleteBatch(
            ctx,
            ctx.db
                .query("oauthApplication")
                .withIndex("userId", (q) => q.eq("userId", id))
                .take(ACCOUNT_DELETION_BATCH_SIZE)
        )
        if (applicationCount > 0) {
            return { phase: "purging_auth_oauth_applications", deletedCount: applicationCount }
        }

        const tokenCount = await deleteBatch(
            ctx,
            ctx.db
                .query("oauthAccessToken")
                .withIndex("userId", (q) => q.eq("userId", id))
                .take(ACCOUNT_DELETION_BATCH_SIZE)
        )
        if (tokenCount > 0) {
            return { phase: "purging_auth_oauth_tokens", deletedCount: tokenCount }
        }

        const consentCount = await deleteBatch(
            ctx,
            ctx.db
                .query("oauthConsent")
                .withIndex("userId", (q) => q.eq("userId", id))
                .take(ACCOUNT_DELETION_BATCH_SIZE)
        )
        if (consentCount > 0) {
            return { phase: "purging_auth_oauth_consents", deletedCount: consentCount }
        }
    }

    return null
}

const continuePurge = async (
    ctx: MutationCtx,
    jobId: Id<"accountDeletionJobs">,
    userId: string,
    authId: string | undefined,
    phase: string,
    deletedCount: number
) => {
    await ctx.db.patch(jobId, {
        status: "purging",
        phase,
        error: undefined,
        updatedAt: Date.now()
    })
    await schedulePurgeContinuation(ctx, userId, authId)
    return { completed: false, phase, deletedCount }
}

const deleteThreadBatch = async (
    ctx: MutationCtx,
    userId: string
): Promise<{ phase: string; deletedCount: number } | null> => {
    const thread = await ctx.db
        .query("threads")
        .withIndex("byAuthor", (q) => q.eq("authorId", userId))
        .first()
    if (!thread) return null

    const messageCount = await deleteBatch(
        ctx,
        ctx.db
            .query("messages")
            .withIndex("byThreadId", (q) => q.eq("threadId", thread._id))
            .take(ACCOUNT_DELETION_BATCH_SIZE)
    )
    if (messageCount > 0) return { phase: "purging_thread_messages", deletedCount: messageCount }

    const streamCount = await deleteBatch(
        ctx,
        ctx.db
            .query("streams")
            .withIndex("byThreadId", (q) => q.eq("threadId", thread._id))
            .take(ACCOUNT_DELETION_BATCH_SIZE)
    )
    if (streamCount > 0) return { phase: "purging_thread_streams", deletedCount: streamCount }

    const snapshotCount = await deleteBatch(
        ctx,
        ctx.db
            .query("threadPersonaSnapshots")
            .withIndex("byThreadId", (q) => q.eq("threadId", thread._id))
            .take(ACCOUNT_DELETION_BATCH_SIZE)
    )
    if (snapshotCount > 0) {
        return { phase: "purging_thread_persona_snapshots", deletedCount: snapshotCount }
    }

    await ctx.db.delete(thread._id)
    await aggregrateThreadsByFolder.delete(ctx, thread)
    return { phase: "purging_threads", deletedCount: 1 }
}

const deleteImportJobBatch = async (
    ctx: MutationCtx,
    userId: string
): Promise<{ phase: string; deletedCount: number } | null> => {
    const importJob = await ctx.db
        .query("importJobs")
        .withIndex("byAuthorUpdatedAt", (q) => q.eq("authorId", userId))
        .first()
    if (!importJob) return null

    const sourceCount = await deleteBatch(
        ctx,
        ctx.db
            .query("importJobSources")
            .withIndex("byJobId", (q) => q.eq("jobId", importJob._id))
            .take(ACCOUNT_DELETION_BATCH_SIZE)
    )
    if (sourceCount > 0) return { phase: "purging_import_sources", deletedCount: sourceCount }

    const threadCount = await deleteBatch(
        ctx,
        ctx.db
            .query("importJobThreads")
            .withIndex("byJobId", (q) => q.eq("jobId", importJob._id))
            .take(ACCOUNT_DELETION_BATCH_SIZE)
    )
    if (threadCount > 0) return { phase: "purging_import_threads", deletedCount: threadCount }

    await ctx.db.delete(importJob._id)
    return { phase: "purging_import_jobs", deletedCount: 1 }
}

export const purgeAccountData = internalMutation({
    args: {
        userId: v.string(),
        authId: v.optional(v.string())
    },
    handler: async (ctx, { userId, authId }) => {
        const job = await getAccountDeletionJob(ctx, userId)
        if (!job) throw new Error("Account deletion job not found")
        if (!ACTIVE_DELETION_STATUSES.has(job.status)) {
            return { completed: false, phase: job.phase ?? "not_processable", deletedCount: 0 }
        }

        await ctx.db.patch(job._id, {
            status: "purging",
            phase: "purging_db",
            error: undefined,
            updatedAt: Date.now()
        })

        const threadBatch = await deleteThreadBatch(ctx, userId)
        if (threadBatch) {
            return await continuePurge(
                ctx,
                job._id,
                userId,
                authId,
                threadBatch.phase,
                threadBatch.deletedCount
            )
        }

        const importJobBatch = await deleteImportJobBatch(ctx, userId)
        if (importJobBatch) {
            return await continuePurge(
                ctx,
                job._id,
                userId,
                authId,
                importJobBatch.phase,
                importJobBatch.deletedCount
            )
        }

        const deleteUserBatch = async (phase: string, deleteCount: Promise<number>) => {
            const deletedCount = await deleteCount
            if (deletedCount === 0) return null
            return await continuePurge(ctx, job._id, userId, authId, phase, deletedCount)
        }

        const sharedThreads = await deleteUserBatch(
            "purging_shared_threads",
            deleteBatch(
                ctx,
                ctx.db
                    .query("sharedThreads")
                    .withIndex("byAuthorId", (q) => q.eq("authorId", userId))
                    .take(ACCOUNT_DELETION_BATCH_SIZE)
            )
        )
        if (sharedThreads) return sharedThreads

        const personas = await deleteUserBatch(
            "purging_personas",
            deleteBatch(
                ctx,
                ctx.db
                    .query("userPersonas")
                    .withIndex("byAuthor", (q) => q.eq("authorId", userId))
                    .take(ACCOUNT_DELETION_BATCH_SIZE)
            )
        )
        if (personas) return personas

        const projects = await deleteUserBatch(
            "purging_projects",
            deleteBatch(
                ctx,
                ctx.db
                    .query("projects")
                    .withIndex("byAuthor", (q) => q.eq("authorId", userId))
                    .take(ACCOUNT_DELETION_BATCH_SIZE)
            )
        )
        if (projects) return projects

        const generatedImages = await deleteUserBatch(
            "purging_generated_images",
            deleteBatch(
                ctx,
                ctx.db
                    .query("generatedImages")
                    .withIndex("byUserIdAndCreatedAt", (q) => q.eq("userId", userId))
                    .take(ACCOUNT_DELETION_BATCH_SIZE)
            )
        )
        if (generatedImages) return generatedImages

        const generatedImageFacets = await deleteUserBatch(
            "purging_generated_image_facets",
            deleteBatch(
                ctx,
                ctx.db
                    .query("generatedImageFacets")
                    .withIndex("byUserId", (q) => q.eq("userId", userId))
                    .take(ACCOUNT_DELETION_BATCH_SIZE)
            )
        )
        if (generatedImageFacets) return generatedImageFacets

        const imageGenerationJobs = await deleteUserBatch(
            "purging_image_generation_jobs",
            deleteBatch(
                ctx,
                ctx.db
                    .query("imageGenerationJobs")
                    .withIndex("byUserIdAndCreatedAt", (q) => q.eq("userId", userId))
                    .take(ACCOUNT_DELETION_BATCH_SIZE)
            )
        )
        if (imageGenerationJobs) return imageGenerationJobs

        const settings = await deleteUserBatch(
            "purging_settings",
            deleteBatch(
                ctx,
                ctx.db
                    .query("settings")
                    .withIndex("byUser", (q) => q.eq("userId", userId))
                    .take(ACCOUNT_DELETION_BATCH_SIZE)
            )
        )
        if (settings) return settings

        const access = await deleteUserBatch(
            "purging_user_access",
            deleteBatch(
                ctx,
                ctx.db
                    .query("userAccess")
                    .withIndex("byUser", (q) => q.eq("userId", userId))
                    .take(ACCOUNT_DELETION_BATCH_SIZE)
            )
        )
        if (access) return access

        const usageEvents = await deleteUserBatch(
            "purging_usage_events",
            deleteBatch(
                ctx,
                ctx.db
                    .query("usageEvents")
                    .withIndex("byUserDay", (q) => q.eq("userId", userId))
                    .take(ACCOUNT_DELETION_BATCH_SIZE)
            )
        )
        if (usageEvents) return usageEvents

        const creditAccounts = await deleteUserBatch(
            "purging_credit_accounts",
            deleteBatch(
                ctx,
                ctx.db
                    .query("prototypeCreditAccounts")
                    .withIndex("byUser", (q) => q.eq("userId", userId))
                    .take(ACCOUNT_DELETION_BATCH_SIZE)
            )
        )
        if (creditAccounts) return creditAccounts

        const creditReservations = await deleteUserBatch(
            "purging_credit_reservations",
            deleteBatch(
                ctx,
                ctx.db
                    .query("prototypeCreditReservations")
                    .withIndex("byUserPeriod", (q) => q.eq("userId", userId))
                    .take(ACCOUNT_DELETION_BATCH_SIZE)
            )
        )
        if (creditReservations) return creditReservations

        const creditEvents = await deleteUserBatch(
            "purging_credit_events",
            deleteBatch(
                ctx,
                ctx.db
                    .query("prototypeCreditEvents")
                    .withIndex("byUserPeriod", (q) => q.eq("userId", userId))
                    .take(ACCOUNT_DELETION_BATCH_SIZE)
            )
        )
        if (creditEvents) return creditEvents

        const toolReservations = await deleteUserBatch(
            "purging_tool_reservations",
            deleteBatch(
                ctx,
                ctx.db
                    .query("prototypeToolCallReservations")
                    .withIndex("byUserPeriod", (q) => q.eq("userId", userId))
                    .take(ACCOUNT_DELETION_BATCH_SIZE)
            )
        )
        if (toolReservations) return toolReservations

        const subscriptions = await deleteUserBatch(
            "purging_subscriptions",
            deleteBatch(
                ctx,
                ctx.db
                    .query("lemonSqueezySubscriptions")
                    .withIndex("byUser", (q) => q.eq("userId", userId))
                    .take(ACCOUNT_DELETION_BATCH_SIZE)
            )
        )
        if (subscriptions) return subscriptions

        const accountExports = await deleteUserBatch(
            "purging_account_exports",
            deleteBatch(
                ctx,
                ctx.db
                    .query("accountExportJobs")
                    .withIndex("byUserCreatedAt", (q) => q.eq("userId", userId))
                    .take(ACCOUNT_DELETION_BATCH_SIZE)
            )
        )
        if (accountExports) return accountExports

        const authBatch = await deleteAuthDuplicateRowsBatch(ctx, userId, authId)
        if (authBatch) {
            return await continuePurge(
                ctx,
                job._id,
                userId,
                authId,
                authBatch.phase,
                authBatch.deletedCount
            )
        }

        await ctx.db.patch(job._id, {
            status: "completed",
            phase: "completed",
            error: undefined,
            updatedAt: Date.now()
        })

        return { completed: true, phase: "completed", deletedCount: 0 }
    }
})

export const markAccountDeletionFailed = internalMutation({
    args: {
        userId: v.string(),
        phase: v.string(),
        error: v.string()
    },
    handler: async (ctx, { userId, phase, error }) => {
        const job = await getAccountDeletionJob(ctx, userId)
        if (!job || !ACTIVE_DELETION_STATUSES.has(job.status)) return

        const now = Date.now()
        const retryCount = (job.retryCount ?? 0) + 1
        const exhaustedRetries = retryCount >= ACCOUNT_DELETION_MAX_RETRIES
        await ctx.db.patch(job._id, {
            status: exhaustedRetries ? "failed" : "retrying",
            phase,
            error: error.slice(0, 1000),
            retryCount,
            lastAttemptAt: now,
            nextRetryAt: exhaustedRetries ? undefined : now + ACCOUNT_DELETION_RETRY_DELAY_MS,
            updatedAt: now
        })

        if (exhaustedRetries) return
        await scheduleDeletionJob(ctx, userId, ACCOUNT_DELETION_RETRY_DELAY_MS)
    }
})

export const listProcessableAccountDeletionJobs = internalQuery({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, { limit }) => {
        const max = Math.max(1, Math.min(limit ?? ACCOUNT_DELETION_SWEEP_LIMIT, 50))
        const jobs = await Promise.all(
            [...ACTIVE_DELETION_STATUSES].map((status) =>
                ctx.db
                    .query("accountDeletionJobs")
                    .withIndex("byStatus", (q) =>
                        q.eq("status", status as "pending" | "purging" | "retrying")
                    )
                    .take(max)
            )
        )

        return jobs
            .flat()
            .sort((left, right) => left.updatedAt - right.updatedAt)
            .slice(0, max)
            .map((job) => ({ userId: job.userId }))
    }
})

const getAuthAdapter = <DataModel extends GenericDataModel>(ctx: GenericActionCtx<DataModel>) =>
    authComponent.adapter(ctx as never)({} as BetterAuthOptions)

const getAuthSnapshot = async <DataModel extends GenericDataModel>(
    ctx: GenericActionCtx<DataModel>,
    userId: string,
    authId: string | undefined
) => {
    const adapter = getAuthAdapter(ctx)
    let authUser: Record<string, unknown> | null = null

    if (authId) {
        authUser = await adapter.findOne({
            model: "user",
            where: [{ field: "id", value: authId }]
        })
    }

    if (!authUser) {
        authUser = await adapter.findOne({
            model: "user",
            where: [{ field: "id", value: userId }]
        })
    }

    if (!authUser && !authId) {
        const users = (await adapter.findMany({
            model: "user",
            limit: LEGACY_AUTH_USER_SCAN_LIMIT
        })) as Array<Record<string, unknown>>
        authUser =
            users.find(
                (user) =>
                    typeof user.userId === "string" &&
                    user.userId.trim().length > 0 &&
                    user.userId === userId
            ) ?? null
    }

    const resolvedAuthId = typeof authUser?.id === "string" ? authUser.id : undefined
    const email = typeof authUser?.email === "string" ? authUser.email : undefined
    if (!resolvedAuthId || !email) return undefined

    const accounts = (await adapter.findMany({
        model: "account",
        where: [{ field: "userId", value: resolvedAuthId }]
    })) as Array<Record<string, unknown>>
    const googleAccount = accounts.find((account) => account.providerId === "google")

    return {
        authId: resolvedAuthId,
        email,
        googleSub:
            typeof googleAccount?.accountId === "string" ? googleAccount.accountId : undefined
    }
}

const deleteAuthUser = async <DataModel extends GenericDataModel>(
    ctx: GenericActionCtx<DataModel>,
    authId: string | undefined
) => {
    if (!authId) return

    const adapter = getAuthAdapter(ctx)
    const deleteOptionalAuthModelRows = async (
        model: "twoFactor" | "oauthApplication" | "oauthAccessToken" | "oauthConsent"
    ) => {
        try {
            await adapter.deleteMany({ model, where: [{ field: "userId", value: authId }] })
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            if (message !== `Model "${model}" not found in schema`) {
                throw error
            }
        }
    }

    await Promise.all([
        adapter.deleteMany({ model: "session", where: [{ field: "userId", value: authId }] }),
        adapter.deleteMany({ model: "account", where: [{ field: "userId", value: authId }] })
    ])
    await Promise.all([
        deleteOptionalAuthModelRows("twoFactor"),
        deleteOptionalAuthModelRows("oauthApplication"),
        deleteOptionalAuthModelRows("oauthAccessToken"),
        deleteOptionalAuthModelRows("oauthConsent")
    ])
    await adapter.delete({ model: "user", where: [{ field: "id", value: authId }] })
}

const cancelLemonSqueezySubscription = async (subscriptionId: string | undefined) => {
    if (!subscriptionId) return { skipped: true as const }

    const apiKey = process.env.LEMONSQUEEZY_API_KEY?.trim()
    if (!apiKey) return { skipped: true as const }

    const response = await fetch(
        `https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`,
        {
            method: "PATCH",
            headers: {
                Accept: "application/vnd.api+json",
                "Content-Type": "application/vnd.api+json",
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                data: {
                    type: "subscriptions",
                    id: subscriptionId,
                    attributes: {
                        cancelled: true
                    }
                }
            })
        }
    )

    if (!response.ok) {
        throw new Error(`Lemon Squeezy cancellation failed: ${response.status}`)
    }

    return { cancelled: true as const }
}

const deleteR2Key = async <DataModel extends GenericDataModel>(
    ctx: GenericActionCtx<DataModel>,
    key: string
) => {
    try {
        await r2.deleteObject(ctx, key)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!/not found/i.test(message)) {
            throw error
        }
    }
}

const purgeR2ObjectsForUser = async <DataModel extends GenericDataModel>(
    ctx: GenericActionCtx<DataModel>,
    userId: string,
    knownKeys: string[]
) => {
    const seenKeys = new Set<string>()
    for (const key of knownKeys) {
        if (seenKeys.has(key)) continue
        seenKeys.add(key)
        await deleteR2Key(ctx, key)
    }

    for await (const page of iterateMetadataPages(
        (cursor) => r2.listMetadata(ctx, userId, 100, cursor),
        () => {
            throw new Error("R2 deletion pagination did not advance")
        }
    )) {
        for (const file of page) {
            if (seenKeys.has(file.key)) continue
            seenKeys.add(file.key)
            await deleteR2Key(ctx, file.key)
        }
    }
}

type PaginatedPage<T> = {
    page: T[]
    isDone: boolean
    continueCursor: string
}

const getDeletionCreditSnapshot = async <DataModel extends GenericDataModel>(
    ctx: GenericActionCtx<DataModel>,
    userId: string,
    timestamp: number
): Promise<DeletionCreditSnapshot> => {
    const period = await ctx.runQuery(
        internal.account_deletion.getAccountDeletionCreditPeriodInternal,
        {
            userId,
            timestamp
        }
    )
    let consumedUsageMicrousd = 0

    let cursor: string | null = null
    while (true) {
        const result = (await ctx.runQuery(
            internal.account_deletion.listAccountDeletionCreditEventsPage,
            {
                userId,
                periodKey: period.periodKey,
                paginationOpts: { numItems: ACCOUNT_DELETION_BATCH_SIZE, cursor }
            }
        )) as PaginatedPage<{
            accountingKind?: "usage"
            reservedMicrousd?: number
            settledMicrousd?: number
        }>

        for (const event of result.page) {
            if (event.accountingKind === "usage") {
                consumedUsageMicrousd += Math.max(
                    0,
                    event.settledMicrousd ?? event.reservedMicrousd ?? 0
                )
            }
        }

        if (result.isDone) break
        cursor = result.continueCursor
    }

    cursor = null
    while (true) {
        const result = (await ctx.runQuery(
            internal.account_deletion.listAccountDeletionCreditReservationsPage,
            {
                userId,
                periodKey: period.periodKey,
                paginationOpts: { numItems: ACCOUNT_DELETION_BATCH_SIZE, cursor }
            }
        )) as PaginatedPage<{
            active: boolean
            accountingKind?: "usage"
            reservedMicrousd?: number
        }>

        for (const reservation of result.page) {
            if (!reservation.active) continue
            if (reservation.accountingKind === "usage") {
                consumedUsageMicrousd += Math.max(0, reservation.reservedMicrousd ?? 0)
            }
        }

        if (result.isDone) break
        cursor = result.continueCursor
    }

    cursor = null
    while (true) {
        const result = (await ctx.runQuery(
            internal.account_deletion.listAccountDeletionToolReservationsPage,
            {
                userId,
                periodKey: period.periodKey,
                paginationOpts: { numItems: ACCOUNT_DELETION_BATCH_SIZE, cursor }
            }
        )) as PaginatedPage<{
            active: boolean
            reservedMicrousd?: number
            consumedMicrousd?: number
        }>

        for (const reservation of result.page) {
            if (!reservation.active) continue
            consumedUsageMicrousd += Math.max(
                0,
                (reservation.reservedMicrousd ?? 0) - (reservation.consumedMicrousd ?? 0)
            )
        }

        if (result.isDone) break
        cursor = result.continueCursor
    }

    return {
        anchorAt: period.anchorAt,
        periodKey: period.periodKey,
        periodStartsAt: period.periodStartsAt,
        periodEndsAt: period.periodEndsAt,
        consumedUsageMicrousd,
        carriedUsageMicrousd: period.carriedUsageMicrousd
    }
}

export const continueAccountDeletionPurge = internalAction({
    args: { userId: v.string(), authId: v.optional(v.string()) },
    handler: async (ctx, { userId, authId }): Promise<AccountDeletionPurgeResult> => {
        try {
            return await ctx.runMutation(internal.account_deletion.purgeAccountData, {
                userId,
                authId
            })
        } catch (error) {
            await ctx.runMutation(internal.account_deletion.markAccountDeletionFailed, {
                userId,
                phase: "failed",
                error: error instanceof Error ? error.message : String(error)
            })
            return { completed: false, phase: "failed", deletedCount: 0 }
        }
    }
})

export const processAccountDeletionJob = internalAction({
    args: { userId: v.string() },
    handler: async (ctx, { userId }) => {
        try {
            const job = await ctx.runQuery(
                internal.account_deletion.getAccountDeletionJobInternal,
                {
                    userId
                }
            )
            const auth = await getAuthSnapshot(ctx, userId, job?.authId)
            const creditSnapshot = await getDeletionCreditSnapshot(ctx, userId, Date.now())
            const prepared = await ctx.runMutation(
                internal.account_deletion.prepareAccountDeletion,
                {
                    userId,
                    auth,
                    creditSnapshot
                }
            )

            await deleteSupermemoryContainer(userId)

            await deleteAuthUser(ctx, prepared.authId ?? auth?.authId)

            try {
                await cancelLemonSqueezySubscription(prepared.subscriptionId)
            } catch (error) {
                console.error("[account-deletion] Lemon Squeezy cancellation failed", {
                    userId,
                    error
                })
            }

            await purgeR2ObjectsForUser(ctx, userId, prepared.knownR2Keys)

            await ctx.runMutation(internal.account_deletion.purgeAccountData, {
                userId,
                authId: prepared.authId ?? auth?.authId
            })
        } catch (error) {
            await ctx.runMutation(internal.account_deletion.markAccountDeletionFailed, {
                userId,
                phase: "failed",
                error: error instanceof Error ? error.message : String(error)
            })
        }
    }
})

export const processPendingAccountDeletionJobs = internalAction({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, { limit }): Promise<{ processed: number }> => {
        const jobs = await ctx.runQuery(
            internal.account_deletion.listProcessableAccountDeletionJobs,
            {
                limit
            }
        )

        for (const job of jobs) {
            await ctx.runAction(internal.account_deletion.processAccountDeletionJob, {
                userId: job.userId
            })
        }

        return { processed: jobs.length }
    }
})

export const processMyPendingAccountDeletion = action({
    args: {},
    handler: async (ctx) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new Error("Unauthorized")

        await ctx.runAction(internal.account_deletion.processAccountDeletionJob, {
            userId: user.id
        })

        return { queued: true }
    }
})
import { iterateMetadataPages } from "./lib/r2_pagination"
