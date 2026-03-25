import { v } from "convex/values"

export const ImportJobAttachmentMode = v.union(
    v.literal("mirror"),
    v.literal("external"),
    v.literal("skip")
)

export const ImportJobStatus = v.union(
    v.literal("queued"),
    v.literal("preparing"),
    v.literal("importing"),
    v.literal("completed"),
    v.literal("completed_with_errors"),
    v.literal("failed")
)

export const ImportJobSourceStatus = v.union(
    v.literal("queued"),
    v.literal("prepared"),
    v.literal("error")
)

export const ImportJobThreadStatus = v.union(
    v.literal("pending"),
    v.literal("importing"),
    v.literal("imported"),
    v.literal("failed")
)

export const ImportJobMessageMetadata = v.object({
    modelName: v.optional(v.string())
})

export const ImportJobAttachmentReference = v.object({
    type: v.union(v.literal("file"), v.literal("image")),
    url: v.string(),
    filename: v.string()
})

export const ImportJobParsedMessage = v.object({
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    text: v.string(),
    attachments: v.array(ImportJobAttachmentReference),
    metadata: v.optional(ImportJobMessageMetadata)
})

export const ImportJob = v.object({
    authorId: v.string(),
    status: ImportJobStatus,
    attachmentMode: ImportJobAttachmentMode,
    projectId: v.optional(v.id("projects")),
    createdAt: v.number(),
    updatedAt: v.number(),
    totalSourceFiles: v.number(),
    preparedSourceFiles: v.number(),
    totalThreads: v.number(),
    processedThreads: v.number(),
    importedThreads: v.number(),
    failedThreads: v.number(),
    warningCount: v.number(),
    errorCount: v.number(),
    recentWarnings: v.array(v.string()),
    recentErrors: v.array(v.string()),
    completedAt: v.optional(v.number())
})

export const ImportJobSource = v.object({
    jobId: v.id("importJobs"),
    authorId: v.string(),
    clientSourceId: v.string(),
    storageKey: v.string(),
    fileName: v.string(),
    mimeType: v.optional(v.string()),
    size: v.number(),
    selectedDocumentKeys: v.array(v.string()),
    status: ImportJobSourceStatus,
    preparedDocumentCount: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    error: v.optional(v.string())
})

export const ImportJobThread = v.object({
    jobId: v.id("importJobs"),
    sourceId: v.id("importJobSources"),
    authorId: v.string(),
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
    }),
    status: ImportJobThreadStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
    warning: v.optional(v.string()),
    error: v.optional(v.string()),
    importedThreadId: v.optional(v.id("threads"))
})
