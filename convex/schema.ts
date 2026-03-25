import { defineSchema, defineTable } from "convex/server"
import { Project } from "./schema/folders"
import { ImportJob, ImportJobSource, ImportJobThread } from "./schema/import_job"
import { Message } from "./schema/message"
import { UserSettings } from "./schema/settings"
import { ResumableStream } from "./schema/streams"
import { SharedThread, Thread } from "./schema/thread"
import { UsageEvent } from "./schema/usage"

export {
    Thread,
    Message,
    SharedThread,
    UsageEvent,
    UserSettings,
    Project,
    ImportJob,
    ImportJobSource,
    ImportJobThread
}

export default defineSchema({
    threads: defineTable(Thread)
        .index("byAuthor", ["authorId"])
        .index("byAuthorUpdatedAt", ["authorId", "updatedAt"])
        .index("byProject", ["projectId"])
        .index("byAuthorAndProject", ["authorId", "projectId"])
        .index("byAuthorAndProjectUpdatedAt", ["authorId", "projectId", "updatedAt"])
        .searchIndex("search_title", {
            searchField: "title",
            filterFields: ["authorId"]
        }),

    messages: defineTable(Message)
        .index("byThreadId", ["threadId"])
        .index("byMessageId", ["messageId"]),

    sharedThreads: defineTable(SharedThread).index("byAuthorId", ["authorId"]),
    streams: defineTable(ResumableStream).index("byThreadId", ["threadId"]),
    // apiKeys: defineTable(ApiKey)
    //     .index("byUser", ["userId"])
    //     .index("byUserProvider", ["userId", "provider"]),
    settings: defineTable(UserSettings).index("byUser", ["userId"]),

    usageEvents: defineTable(UsageEvent).index("byUserDay", ["userId", "daysSinceEpoch"]),

    projects: defineTable(Project)
        .index("byAuthor", ["authorId"])
        .searchIndex("search_name", {
            searchField: "name",
            filterFields: ["authorId"]
        }),

    importJobs: defineTable(ImportJob)
        .index("byAuthorUpdatedAt", ["authorId", "updatedAt"])
        .index("byAuthorStatusUpdatedAt", ["authorId", "status", "updatedAt"]),

    importJobSources: defineTable(ImportJobSource)
        .index("byJobId", ["jobId"])
        .index("byJobIdAndClientSourceId", ["jobId", "clientSourceId"]),

    importJobThreads: defineTable(ImportJobThread)
        .index("byJobId", ["jobId"])
        .index("byJobIdAndStatus", ["jobId", "status"])
        .index("byJobIdAndDocumentKey", ["jobId", "documentKey"])
})
