import { defineSchema, defineTable } from "convex/server"
import { PrototypeCreditAccount, PrototypeCreditEvent } from "./schema/credits"
import { Project } from "./schema/folders"
import { GeneratedImage } from "./schema/generated_image"
import { ImportJob, ImportJobSource, ImportJobThread } from "./schema/import_job"
import { Message } from "./schema/message"
import { ThreadPersonaSnapshot, UserPersona } from "./schema/persona"
import { UserSettings } from "./schema/settings"
import { ResumableStream } from "./schema/streams"
import { SharedThread, Thread } from "./schema/thread"
import { UsageEvent } from "./schema/usage"

export {
    Thread,
    Message,
    SharedThread,
    UsageEvent,
    PrototypeCreditAccount,
    PrototypeCreditEvent,
    UserSettings,
    Project,
    UserPersona,
    ThreadPersonaSnapshot,
    ImportJob,
    ImportJobSource,
    ImportJobThread,
    GeneratedImage
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
    userPersonas: defineTable(UserPersona)
        .index("byAuthor", ["authorId"])
        .index("byAuthorUpdatedAt", ["authorId", "updatedAt"]),
    threadPersonaSnapshots: defineTable(ThreadPersonaSnapshot).index("byThreadId", ["threadId"]),

    sharedThreads: defineTable(SharedThread).index("byAuthorId", ["authorId"]),
    streams: defineTable(ResumableStream).index("byThreadId", ["threadId"]),
    // apiKeys: defineTable(ApiKey)
    //     .index("byUser", ["userId"])
    //     .index("byUserProvider", ["userId", "provider"]),
    settings: defineTable(UserSettings).index("byUser", ["userId"]),

    usageEvents: defineTable(UsageEvent).index("byUserDay", ["userId", "daysSinceEpoch"]),
    prototypeCreditAccounts: defineTable(PrototypeCreditAccount).index("byUser", ["userId"]),
    prototypeCreditEvents: defineTable(PrototypeCreditEvent)
        .index("byUserPeriod", ["userId", "periodKey"])
        .index("byUserMessageKey", ["userId", "messageKey"]),

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
        .index("byJobIdAndDocumentKey", ["jobId", "documentKey"]),

    generatedImages: defineTable(GeneratedImage)
        .index("byUserId", ["userId"])
        .index("byUserIdAndCreatedAt", ["userId", "createdAt"])
        .searchIndex("search_text", {
            searchField: "searchText",
            filterFields: ["userId"]
        })
})
