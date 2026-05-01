import { MAX_ATTACHMENTS_PER_THREAD } from "@/lib/file_constants"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import {
    type MutationCtx,
    internalMutation,
    internalQuery,
    mutation,
    query
} from "./_generated/server"
import { getUserIdentity } from "./lib/identity"
import { ImportJobAttachmentMode, ImportJobParsedMessage } from "./schema/import_job"

const MAX_RECENT_JOB_MESSAGES = 5
const MAX_RECENT_JOB_MESSAGE_LENGTH = 220
const STALE_ACTIVE_IMPORT_JOB_MS = 2 * 60 * 60 * 1000
const FAILED_IMPORT_JOB_THREAD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const CLEANUP_BATCH_SIZE = 100

const ImportJobSourceInput = v.object({
    clientSourceId: v.string(),
    storageKey: v.string(),
    fileName: v.string(),
    mimeType: v.optional(v.string()),
    size: v.number(),
    selectedDocumentKeys: v.array(v.string())
})

const truncateJobMessage = (value: string) => {
    const normalized = value.replace(/\s+/g, " ").trim()
    if (normalized.length <= MAX_RECENT_JOB_MESSAGE_LENGTH) {
        return normalized
    }

    return `${normalized.slice(0, MAX_RECENT_JOB_MESSAGE_LENGTH - 1)}…`
}

const appendRecentJobMessages = (existing: string[], additions: string[]) =>
    [...existing, ...additions.map(truncateJobMessage).filter(Boolean)].slice(
        -MAX_RECENT_JOB_MESSAGES
    )

const resolveCompletedImportJobStatus = ({
    warningCount,
    errorCount,
    failedThreads
}: {
    warningCount: number
    errorCount: number
    failedThreads: number
}) => {
    if (errorCount > 0 || failedThreads > 0 || warningCount > 0) {
        return "completed_with_errors" as const
    }

    return "completed" as const
}

const patchCompletedImportJobStatus = async ({
    db,
    job,
    processedThreads,
    importedThreads,
    failedThreads,
    warningCount,
    errorCount,
    recentWarnings,
    recentErrors
}: {
    db: MutationCtx["db"]
    job: Doc<"importJobs">
    processedThreads: number
    importedThreads: number
    failedThreads: number
    warningCount: number
    errorCount: number
    recentWarnings: string[]
    recentErrors: string[]
}) => {
    const isCompleted = job.totalThreads > 0 && processedThreads >= job.totalThreads
    await db.patch(job._id, {
        processedThreads,
        importedThreads,
        failedThreads,
        warningCount,
        errorCount,
        recentWarnings,
        recentErrors,
        updatedAt: Date.now(),
        ...(isCompleted
            ? {
                  status: resolveCompletedImportJobStatus({
                      warningCount,
                      errorCount,
                      failedThreads
                  }),
                  completedAt: Date.now()
              }
            : {})
    })
}

const patchImportJobFailure = async ({
    db,
    job,
    error
}: {
    db: MutationCtx["db"]
    job: Doc<"importJobs">
    error: string
}) => {
    await db.patch(job._id, {
        status: "failed",
        errorCount: job.errorCount + 1,
        recentErrors: appendRecentJobMessages(job.recentErrors, [error]),
        updatedAt: Date.now(),
        completedAt: Date.now()
    })
}

const failImportJobThreadRecord = async ({
    db,
    importJobThread,
    error,
    warning
}: {
    db: MutationCtx["db"]
    importJobThread: Doc<"importJobThreads">
    error: string
    warning?: string
}) => {
    const job = await db.get(importJobThread.jobId)
    if (!job) return

    await db.patch(importJobThread._id, {
        status: "failed",
        error: truncateJobMessage(error),
        warning,
        updatedAt: Date.now()
    })

    const warningMessages = warning ? [warning] : []
    await patchCompletedImportJobStatus({
        db,
        job,
        processedThreads: job.processedThreads + 1,
        importedThreads: job.importedThreads,
        failedThreads: job.failedThreads + 1,
        warningCount: job.warningCount + warningMessages.length,
        errorCount: job.errorCount + 1,
        recentWarnings: appendRecentJobMessages(job.recentWarnings, warningMessages),
        recentErrors: appendRecentJobMessages(job.recentErrors, [error])
    })
}

export const startImportJob = mutation({
    args: {
        attachmentMode: ImportJobAttachmentMode,
        projectId: v.optional(v.id("projects")),
        sourceFiles: v.array(ImportJobSourceInput)
    },
    handler: async (ctx, { attachmentMode, projectId, sourceFiles }) => {
        const user = await getUserIdentity(ctx.auth, {
            allowAnons: false
        })

        if ("error" in user) {
            return { error: user.error }
        }

        const hasSelectedDocuments = sourceFiles.some(
            (source) => source.selectedDocumentKeys.length > 0
        )
        if (!hasSelectedDocuments || sourceFiles.length === 0) {
            return { error: "No selected import sources found" }
        }

        const now = Date.now()
        const jobId = await ctx.db.insert("importJobs", {
            authorId: user.id,
            status: "queued",
            attachmentMode,
            projectId,
            createdAt: now,
            updatedAt: now,
            totalSourceFiles: sourceFiles.length,
            preparedSourceFiles: 0,
            totalThreads: 0,
            processedThreads: 0,
            importedThreads: 0,
            failedThreads: 0,
            warningCount: 0,
            errorCount: 0,
            recentWarnings: [],
            recentErrors: []
        })

        for (const source of sourceFiles) {
            await ctx.db.insert("importJobSources", {
                jobId,
                authorId: user.id,
                clientSourceId: source.clientSourceId,
                storageKey: source.storageKey,
                fileName: source.fileName,
                mimeType: source.mimeType,
                size: source.size,
                selectedDocumentKeys: source.selectedDocumentKeys,
                status: "queued",
                createdAt: now,
                updatedAt: now
            })
        }

        // biome-ignore lint/complexity/useLiteralKeys: generated internal types do not surface this node module reliably.
        await ctx.scheduler.runAfter(0, internal["import_jobs_node"].prepareImportJob, {
            jobId
        })

        return { jobId }
    }
})

export const listImportJobs = query({
    args: {
        limit: v.optional(v.number())
    },
    handler: async (ctx, { limit }) => {
        const user = await getUserIdentity(ctx.auth, {
            allowAnons: false
        })

        if ("error" in user) {
            return []
        }

        return await ctx.db
            .query("importJobs")
            .withIndex("byAuthorUpdatedAt", (q) => q.eq("authorId", user.id))
            .order("desc")
            .take(Math.min(limit ?? 6, 20))
    }
})

export const deleteImportJob = mutation({
    args: { jobId: v.id("importJobs") },
    handler: async (ctx, { jobId }) => {
        const user = await getUserIdentity(ctx.auth, {
            allowAnons: false
        })

        if ("error" in user) {
            return { error: user.error }
        }

        const job = await ctx.db.get(jobId)
        if (!job || job.authorId !== user.id) {
            return { error: "Import job not found" }
        }

        let hasMore = true
        while (hasMore) {
            const batch = await ctx.db
                .query("importJobThreads")
                .withIndex("byJobId", (q) => q.eq("jobId", jobId))
                .take(CLEANUP_BATCH_SIZE)
            for (const row of batch) {
                await ctx.db.delete(row._id)
            }
            hasMore = batch.length === CLEANUP_BATCH_SIZE
        }

        hasMore = true
        while (hasMore) {
            const batch = await ctx.db
                .query("importJobSources")
                .withIndex("byJobId", (q) => q.eq("jobId", jobId))
                .take(CLEANUP_BATCH_SIZE)
            for (const row of batch) {
                await ctx.db.delete(row._id)
            }
            hasMore = batch.length === CLEANUP_BATCH_SIZE
        }

        await ctx.db.delete(jobId)

        return { success: true }
    }
})

export const getImportJob = query({
    args: { jobId: v.id("importJobs") },
    handler: async (ctx, { jobId }) => {
        const user = await getUserIdentity(ctx.auth, {
            allowAnons: false
        })

        if ("error" in user) {
            return null
        }

        const job = await ctx.db.get(jobId)
        if (!job || job.authorId !== user.id) {
            return null
        }

        const sources = await ctx.db
            .query("importJobSources")
            .withIndex("byJobId", (q) => q.eq("jobId", jobId))
            .collect()

        const recentFailures = await ctx.db
            .query("importJobThreads")
            .withIndex("byJobId", (q) => q.eq("jobId", jobId))
            .order("desc")
            .take(8)

        return {
            ...job,
            sources,
            recentFailures: recentFailures.filter((thread) =>
                Boolean(thread.error || thread.warning)
            )
        }
    }
})

export const getImportJobInternal = internalQuery({
    args: { jobId: v.id("importJobs") },
    handler: async (ctx, { jobId }) => {
        return await ctx.db.get(jobId)
    }
})

export const getImportJobSourcesInternal = internalQuery({
    args: { jobId: v.id("importJobs") },
    handler: async (ctx, { jobId }) => {
        return await ctx.db
            .query("importJobSources")
            .withIndex("byJobId", (q) => q.eq("jobId", jobId))
            .collect()
    }
})

export const markImportJobPreparing = internalMutation({
    args: { jobId: v.id("importJobs") },
    handler: async (ctx, { jobId }) => {
        const job = await ctx.db.get(jobId)
        if (!job) return

        await ctx.db.patch(jobId, {
            status: "preparing",
            updatedAt: Date.now()
        })
    }
})

export const markImportJobSourcePrepared = internalMutation({
    args: {
        sourceId: v.id("importJobSources"),
        preparedDocumentCount: v.number()
    },
    handler: async (ctx, { sourceId, preparedDocumentCount }) => {
        const source = await ctx.db.get(sourceId)
        if (!source) return

        const job = await ctx.db.get(source.jobId)
        if (!job) return

        await ctx.db.patch(sourceId, {
            status: "prepared",
            preparedDocumentCount,
            updatedAt: Date.now(),
            error: undefined
        })

        await ctx.db.patch(job._id, {
            preparedSourceFiles: Math.min(job.totalSourceFiles, job.preparedSourceFiles + 1),
            updatedAt: Date.now()
        })
    }
})

export const markImportJobSourceError = internalMutation({
    args: {
        sourceId: v.id("importJobSources"),
        error: v.string()
    },
    handler: async (ctx, { sourceId, error }) => {
        const source = await ctx.db.get(sourceId)
        if (!source) return

        const job = await ctx.db.get(source.jobId)
        if (!job) return

        await ctx.db.patch(sourceId, {
            status: "error",
            error: truncateJobMessage(error),
            updatedAt: Date.now()
        })

        await ctx.db.patch(job._id, {
            preparedSourceFiles: Math.min(job.totalSourceFiles, job.preparedSourceFiles + 1),
            errorCount: job.errorCount + 1,
            recentErrors: appendRecentJobMessages(job.recentErrors, [error]),
            updatedAt: Date.now()
        })
    }
})

export const savePreparedImportJobThreads = internalMutation({
    args: {
        jobId: v.id("importJobs"),
        threads: v.array(
            v.object({
                sourceId: v.id("importJobSources"),
                documentKey: v.string(),
                fileName: v.string(),
                title: v.string(),
                messages: v.array(ImportJobParsedMessage),
                parseWarnings: v.array(v.string()),
                sourceMetadata: v.object({
                    service: v.union(v.literal("t3chat"), v.literal("chatgptexporter")),
                    format: v.union(v.literal("markdown"), v.literal("json")),
                    conversationId: v.optional(v.string()),
                    createdAt: v.optional(v.number()),
                    updatedAt: v.optional(v.number())
                })
            })
        )
    },
    handler: async (ctx, { jobId, threads }) => {
        const job = await ctx.db.get(jobId)
        if (!job) return null

        const now = Date.now()
        for (const thread of threads) {
            await ctx.db.insert("importJobThreads", {
                jobId,
                sourceId: thread.sourceId,
                authorId: job.authorId,
                documentKey: thread.documentKey,
                fileName: thread.fileName,
                title: thread.title,
                messages: thread.messages,
                parseWarnings: thread.parseWarnings,
                sourceMetadata: thread.sourceMetadata,
                status: "pending",
                createdAt: now,
                updatedAt: now
            })
        }

        const addedWarningMessages = threads.flatMap((thread) => thread.parseWarnings)
        const nextWarningCount = job.warningCount + addedWarningMessages.length
        const nextStatus =
            threads.length === 0
                ? job.errorCount > 0 || nextWarningCount > 0
                    ? "failed"
                    : "completed"
                : "importing"

        await ctx.db.patch(jobId, {
            totalThreads: threads.length,
            warningCount: nextWarningCount,
            recentWarnings: appendRecentJobMessages(job.recentWarnings, addedWarningMessages),
            status: nextStatus,
            updatedAt: now,
            ...(threads.length === 0 ? { completedAt: now } : {})
        })

        return {
            totalThreads: threads.length,
            status: nextStatus
        }
    }
})

export const claimNextImportJobThread = internalMutation({
    args: { jobId: v.id("importJobs") },
    handler: async (ctx, { jobId }) => {
        const job = await ctx.db.get(jobId)
        if (!job || job.status !== "importing") {
            return null
        }

        const nextThread = (
            await ctx.db
                .query("importJobThreads")
                .withIndex("byJobIdAndStatus", (q) => q.eq("jobId", jobId).eq("status", "pending"))
                .order("asc")
                .take(1)
        )[0]

        if (!nextThread) {
            return null
        }

        await ctx.db.patch(nextThread._id, {
            status: "importing",
            updatedAt: Date.now()
        })

        return {
            ...nextThread,
            status: "importing" as const
        }
    }
})

export const completeImportJobThread = internalMutation({
    args: {
        importJobThreadId: v.id("importJobThreads"),
        importedThreadId: v.id("threads"),
        warning: v.optional(v.string())
    },
    handler: async (ctx, { importJobThreadId, importedThreadId, warning }) => {
        const importJobThread = await ctx.db.get(importJobThreadId)
        if (!importJobThread) return

        const job = await ctx.db.get(importJobThread.jobId)
        if (!job) return

        const warningMessages = warning ? [warning] : []
        await patchCompletedImportJobStatus({
            db: ctx.db,
            job,
            processedThreads: job.processedThreads + 1,
            importedThreads: job.importedThreads + 1,
            failedThreads: job.failedThreads,
            warningCount: job.warningCount + warningMessages.length,
            errorCount: job.errorCount,
            recentWarnings: appendRecentJobMessages(job.recentWarnings, warningMessages),
            recentErrors: job.recentErrors
        })

        await ctx.db.delete(importJobThreadId)
    }
})

export const failImportJobThread = internalMutation({
    args: {
        importJobThreadId: v.id("importJobThreads"),
        error: v.string(),
        warning: v.optional(v.string())
    },
    handler: async (ctx, { importJobThreadId, error, warning }) => {
        const importJobThread = await ctx.db.get(importJobThreadId)
        if (!importJobThread) return

        await failImportJobThreadRecord({
            db: ctx.db,
            importJobThread,
            error,
            warning
        })
    }
})

export const failImportJob = internalMutation({
    args: {
        jobId: v.id("importJobs"),
        error: v.string()
    },
    handler: async (ctx, { jobId, error }) => {
        const job = await ctx.db.get(jobId)
        if (!job) return

        await patchImportJobFailure({
            db: ctx.db,
            job,
            error
        })
    }
})

export const cleanupStaleImportData = internalMutation({
    args: {},
    handler: async (ctx) => {
        const now = Date.now()
        const staleCutoff = now - STALE_ACTIVE_IMPORT_JOB_MS
        const failedThreadRetentionCutoff = now - FAILED_IMPORT_JOB_THREAD_RETENTION_MS

        const staleQueuedJobs = await ctx.db
            .query("importJobs")
            .withIndex("byStatusUpdatedAt", (q) =>
                q.eq("status", "queued").lt("updatedAt", staleCutoff)
            )
            .take(CLEANUP_BATCH_SIZE)

        for (const job of staleQueuedJobs) {
            await patchImportJobFailure({
                db: ctx.db,
                job,
                error: "Import job became stale before preparation completed"
            })
        }

        const stalePreparingJobs = await ctx.db
            .query("importJobs")
            .withIndex("byStatusUpdatedAt", (q) =>
                q.eq("status", "preparing").lt("updatedAt", staleCutoff)
            )
            .take(CLEANUP_BATCH_SIZE)

        for (const job of stalePreparingJobs) {
            await patchImportJobFailure({
                db: ctx.db,
                job,
                error: "Import job became stale while preparing source files"
            })
        }

        const stalePendingThreads = await ctx.db
            .query("importJobThreads")
            .withIndex("byStatusUpdatedAt", (q) =>
                q.eq("status", "pending").lt("updatedAt", staleCutoff)
            )
            .take(CLEANUP_BATCH_SIZE)

        for (const thread of stalePendingThreads) {
            await failImportJobThreadRecord({
                db: ctx.db,
                importJobThread: thread,
                error: "Import thread became stale before processing started"
            })
        }

        const staleImportingThreads = await ctx.db
            .query("importJobThreads")
            .withIndex("byStatusUpdatedAt", (q) =>
                q.eq("status", "importing").lt("updatedAt", staleCutoff)
            )
            .take(CLEANUP_BATCH_SIZE)

        for (const thread of staleImportingThreads) {
            await failImportJobThreadRecord({
                db: ctx.db,
                importJobThread: thread,
                error: "Import thread became stale while processing"
            })
        }

        const staleImportingJobs = await ctx.db
            .query("importJobs")
            .withIndex("byStatusUpdatedAt", (q) =>
                q.eq("status", "importing").lt("updatedAt", staleCutoff)
            )
            .take(CLEANUP_BATCH_SIZE)

        for (const staleJob of staleImportingJobs) {
            const refreshedJob = await ctx.db.get(staleJob._id)
            if (!refreshedJob || refreshedJob.status !== "importing") {
                continue
            }

            await patchImportJobFailure({
                db: ctx.db,
                job: refreshedJob,
                error: "Import job became stale while processing threads"
            })
        }

        const expiredFailedThreads = await ctx.db
            .query("importJobThreads")
            .withIndex("byStatusUpdatedAt", (q) =>
                q.eq("status", "failed").lt("updatedAt", failedThreadRetentionCutoff)
            )
            .take(CLEANUP_BATCH_SIZE)

        for (const thread of expiredFailedThreads) {
            await ctx.db.delete(thread._id)
        }
    }
})

export const getImportJobOverview = query({
    args: {
        paginationOpts: paginationOptsValidator
    },
    handler: async (ctx, { paginationOpts }) => {
        const user = await getUserIdentity(ctx.auth, {
            allowAnons: false
        })

        if ("error" in user) {
            return {
                page: [],
                isDone: true,
                continueCursor: ""
            }
        }

        return await ctx.db
            .query("importJobs")
            .withIndex("byAuthorUpdatedAt", (q) => q.eq("authorId", user.id))
            .order("desc")
            .paginate(paginationOpts)
    }
})

export { MAX_ATTACHMENTS_PER_THREAD }
