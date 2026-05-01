import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("convex/server", () => ({
    paginationOptsValidator: {}
}))

vi.mock("convex/values", () => ({
    v: new Proxy(
        {},
        {
            get: () => () => ({})
        }
    )
}))

vi.mock("../../convex/_generated/api", () => ({
    internal: {
        import_jobs_node: {
            prepareImportJob: "prepareImportJob"
        }
    }
}))

vi.mock("../../convex/_generated/server", () => ({
    mutation: (config: unknown) => config,
    query: (config: unknown) => config,
    internalMutation: (config: unknown) => config,
    internalQuery: (config: unknown) => config
}))

vi.mock("../../convex/lib/identity", () => ({
    getUserIdentity: vi.fn()
}))

import {
    cleanupStaleImportData,
    completeImportJobThread,
    failImportJobThread
} from "../../convex/import_jobs"

const completeImportJobThreadHandler = completeImportJobThread as unknown as {
    handler: (ctx: any, args: any) => Promise<void>
}

const failImportJobThreadHandler = failImportJobThread as unknown as {
    handler: (ctx: any, args: any) => Promise<void>
}

const cleanupStaleImportDataHandler = cleanupStaleImportData as unknown as {
    handler: (ctx: any, args: any) => Promise<void>
}

const createCtx = ({
    importJobThread,
    job
}: {
    importJobThread: Record<string, unknown>
    job: Record<string, unknown>
}) => {
    const getMock = vi.fn(async (id: string) => {
        if (id === importJobThread._id) {
            return importJobThread
        }

        if (id === importJobThread.jobId) {
            return job
        }

        return null
    })

    return {
        db: {
            get: getMock,
            patch: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn().mockResolvedValue(undefined)
        }
    }
}

const createCleanupCtx = ({
    importJobs,
    importJobThreads
}: {
    importJobs: Array<Record<string, any>>
    importJobThreads: Array<Record<string, any>>
}) => {
    const jobsStore = new Map(importJobs.map((job) => [job._id, { ...job }]))
    const threadsStore = new Map(importJobThreads.map((thread) => [thread._id, { ...thread }]))

    const applyPatch = (record: Record<string, any>, value: Record<string, any>) => {
        for (const [key, nextValue] of Object.entries(value)) {
            if (nextValue === undefined) {
                delete record[key]
            } else {
                record[key] = nextValue
            }
        }
    }

    const buildQuery = (tableName: "importJobs" | "importJobThreads") => ({
        withIndex: (
            _indexName: string,
            buildFilter: (query: {
                eq: (field: string, value: unknown) => any
                lt: (field: string, value: unknown) => any
            }) => any
        ) => {
            const filters: Array<{ type: "eq" | "lt"; field: string; value: unknown }> = []
            const queryBuilder = {
                eq(field: string, value: unknown) {
                    filters.push({ type: "eq", field, value })
                    return queryBuilder
                },
                lt(field: string, value: unknown) {
                    filters.push({ type: "lt", field, value })
                    return queryBuilder
                }
            }

            buildFilter(queryBuilder)

            const source =
                tableName === "importJobs"
                    ? Array.from(jobsStore.values())
                    : Array.from(threadsStore.values())

            const filtered = source.filter((record) =>
                filters.every((filter) =>
                    filter.type === "eq"
                        ? record[filter.field] === filter.value
                        : Number(record[filter.field]) < Number(filter.value)
                )
            )

            return {
                take: async (count: number) => filtered.slice(0, count)
            }
        }
    })

    return {
        db: {
            get: vi.fn(async (id: string) => jobsStore.get(id) ?? threadsStore.get(id) ?? null),
            patch: vi.fn(async (id: string, value: Record<string, any>) => {
                const record = jobsStore.get(id) ?? threadsStore.get(id)
                if (record) {
                    applyPatch(record, value)
                }
            }),
            delete: vi.fn(async (id: string) => {
                jobsStore.delete(id)
                threadsStore.delete(id)
            }),
            query: vi.fn((tableName: "importJobs" | "importJobThreads") => buildQuery(tableName))
        },
        stores: {
            jobsStore,
            threadsStore
        }
    }
}

describe("import_jobs", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"))
    })

    it("deletes completed staged thread rows after rolling up job counters", async () => {
        const importJobThread = {
            _id: "import-thread-1",
            jobId: "job-1"
        }
        const job = {
            _id: "job-1",
            totalThreads: 2,
            processedThreads: 0,
            importedThreads: 0,
            failedThreads: 0,
            warningCount: 0,
            errorCount: 0,
            recentWarnings: [],
            recentErrors: []
        }
        const ctx = createCtx({ importJobThread, job })

        await completeImportJobThreadHandler.handler(ctx, {
            importJobThreadId: importJobThread._id,
            importedThreadId: "thread-1",
            warning: "Attachment skipped"
        })

        expect(ctx.db.patch).toHaveBeenCalledWith(
            "job-1",
            expect.objectContaining({
                processedThreads: 1,
                importedThreads: 1,
                failedThreads: 0,
                warningCount: 1,
                errorCount: 0,
                recentWarnings: ["Attachment skipped"],
                recentErrors: []
            })
        )
        expect(ctx.db.delete).toHaveBeenCalledWith("import-thread-1")
    })

    it("retains failed staged thread rows with failure details", async () => {
        const importJobThread = {
            _id: "import-thread-2",
            jobId: "job-2"
        }
        const job = {
            _id: "job-2",
            totalThreads: 2,
            processedThreads: 0,
            importedThreads: 0,
            failedThreads: 0,
            warningCount: 0,
            errorCount: 0,
            recentWarnings: [],
            recentErrors: []
        }
        const ctx = createCtx({ importJobThread, job })

        await failImportJobThreadHandler.handler(ctx, {
            importJobThreadId: importJobThread._id,
            error: "Import failed",
            warning: "Companion markdown missing"
        })

        expect(ctx.db.patch).toHaveBeenCalledWith(
            "import-thread-2",
            expect.objectContaining({
                status: "failed",
                error: "Import failed",
                warning: "Companion markdown missing"
            })
        )
        expect(ctx.db.delete).not.toHaveBeenCalled()
    })

    it("fails stale active imports and purges expired failed staging rows", async () => {
        const staleTime = new Date("2026-05-02T09:30:00.000Z").getTime()
        const expiredFailureTime = new Date("2026-04-20T12:00:00.000Z").getTime()
        const ctx = createCleanupCtx({
            importJobs: [
                {
                    _id: "job-queued",
                    status: "queued",
                    updatedAt: staleTime,
                    errorCount: 0,
                    recentErrors: []
                },
                {
                    _id: "job-importing",
                    status: "importing",
                    updatedAt: staleTime,
                    totalThreads: 1,
                    processedThreads: 0,
                    importedThreads: 0,
                    failedThreads: 0,
                    warningCount: 0,
                    errorCount: 0,
                    recentWarnings: [],
                    recentErrors: []
                }
            ],
            importJobThreads: [
                {
                    _id: "thread-pending",
                    jobId: "job-importing",
                    status: "pending",
                    updatedAt: staleTime
                },
                {
                    _id: "thread-failed-expired",
                    jobId: "job-importing",
                    status: "failed",
                    updatedAt: expiredFailureTime
                }
            ]
        })

        await cleanupStaleImportDataHandler.handler(ctx, {})

        expect(ctx.stores.jobsStore.get("job-queued")).toMatchObject({
            status: "failed",
            errorCount: 1
        })
        expect(ctx.stores.jobsStore.get("job-importing")).toMatchObject({
            status: "completed_with_errors",
            processedThreads: 1,
            failedThreads: 1,
            errorCount: 1
        })
        expect(ctx.stores.threadsStore.get("thread-pending")).toMatchObject({
            status: "failed"
        })
        expect(ctx.stores.threadsStore.has("thread-failed-expired")).toBe(false)
    })
})
