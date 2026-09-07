import { ChatError } from "@/lib/errors"
import { MAX_ATTACHMENTS_PER_THREAD } from "@/lib/file_constants"
import type { ModelMessage } from "ai"
import {
    type FieldPaths,
    type FilterBuilder,
    type GenericTableInfo,
    type PaginationResult,
    paginationOptsValidator
} from "convex/server"
import { type Infer, v } from "convex/values"
import { nanoid } from "nanoid"
import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
    type MutationCtx,
    action,
    internalMutation,
    internalQuery,
    mutation,
    query
} from "./_generated/server"
import { aggregrateThreadsByFolder } from "./aggregates"
import { generateShareQuestion, generateThreadName } from "./chat_http/generate_thread_name"
import { assertAccountNotDeletingForAction } from "./lib/account_deletion_gate"
import { assertAccountNotDeleting } from "./lib/account_deletion_status"
import { dbMessagesToCore } from "./lib/db_to_core_messages"
import { getUserIdentity } from "./lib/identity"
import type { Thread } from "./schema"
import { HTTPAIMessage, ImportedMessageMetadata, type Message } from "./schema/message"
import { MessagePart } from "./schema/parts"
import { ThreadPersonaSnapshotInput } from "./schema/persona"

type ThreadDoc = Infer<typeof Thread>

const normalizeThreadTitle = (title: string) =>
    title
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100)

const getInitialThreadTitle = (userMessage: Infer<typeof HTTPAIMessage>) => {
    const firstTextPart = userMessage.parts.find(
        (part): part is Extract<(typeof userMessage.parts)[number], { type: "text" }> =>
            part.type === "text"
    )

    const normalized = normalizeThreadTitle(firstTextPart?.text ?? "")
    if (!normalized) return "New Chat"

    return normalizeThreadTitle(normalized.split(" ").slice(0, 6).join(" "))
}

const compareMessagesChronologically = (
    left: { createdAt: number; _creationTime?: number },
    right: { createdAt: number; _creationTime?: number }
) => (left.createdAt || left._creationTime || 0) - (right.createdAt || right._creationTime || 0)

const countMirroredAttachmentsInMessages = (
    messages: Array<{
        parts: Array<Infer<typeof MessagePart>>
    }>
) =>
    messages.reduce(
        (count, message) =>
            count +
            message.parts.reduce(
                (partCount, part) =>
                    partCount +
                    (part.type === "file" &&
                    !part.data.startsWith("http://") &&
                    !part.data.startsWith("https://") &&
                    !part.data.startsWith("data:")
                        ? 1
                        : 0),
                0
            ),
        0
    )

const ImportedMessage = v.object({
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    createdAt: v.optional(v.number()),
    parts: v.array(MessagePart),
    metadata: v.optional(ImportedMessageMetadata)
})

const normalizeImportedThreadTimestamps = ({
    sourceCreatedAt,
    sourceUpdatedAt,
    messageCreatedAts,
    fallback
}: {
    sourceCreatedAt?: number
    sourceUpdatedAt?: number
    messageCreatedAts: number[]
    fallback: number
}) => {
    const validSourceCreatedAt =
        typeof sourceCreatedAt === "number" &&
        Number.isFinite(sourceCreatedAt) &&
        sourceCreatedAt > 0
            ? Math.trunc(sourceCreatedAt)
            : undefined
    const validSourceUpdatedAt =
        typeof sourceUpdatedAt === "number" &&
        Number.isFinite(sourceUpdatedAt) &&
        sourceUpdatedAt > 0
            ? Math.trunc(sourceUpdatedAt)
            : undefined

    const createdAtCandidates = [
        validSourceCreatedAt,
        ...messageCreatedAts,
        validSourceUpdatedAt
    ].filter(
        (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0
    )

    const updatedAtCandidates = [
        validSourceUpdatedAt,
        ...messageCreatedAts,
        validSourceCreatedAt
    ].filter(
        (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0
    )

    const createdAt = createdAtCandidates.length > 0 ? Math.min(...createdAtCandidates) : fallback
    const updatedAtCandidate =
        updatedAtCandidates.length > 0 ? Math.max(...updatedAtCandidates) : createdAt

    return {
        createdAt,
        updatedAt: Math.max(createdAt, updatedAtCandidate)
    }
}

const performThreadImport = async (
    ctx: MutationCtx,
    {
        authorId,
        title,
        messages,
        projectId,
        sourceCreatedAt,
        sourceUpdatedAt,
        personaSnapshot
    }: {
        authorId: string
        title: string
        messages: Array<Infer<typeof ImportedMessage>>
        projectId?: Id<"projects">
        sourceCreatedAt?: number
        sourceUpdatedAt?: number
        personaSnapshot?: Infer<typeof ThreadPersonaSnapshotInput>
    }
) => {
    const sanitizedMessages = messages.filter((message) => message.parts.length > 0)
    if (sanitizedMessages.length === 0) {
        return { error: "No importable messages found" } as const
    }

    const mirroredAttachmentCount = countMirroredAttachmentsInMessages(sanitizedMessages)
    if (mirroredAttachmentCount > MAX_ATTACHMENTS_PER_THREAD) {
        return {
            error: `Thread exceeds the ${MAX_ATTACHMENTS_PER_THREAD} mirrored attachment limit`
        } as const
    }

    const now = Date.now()
    const messageCreatedAts = sanitizedMessages
        .map((message) =>
            typeof message.createdAt === "number" &&
            Number.isFinite(message.createdAt) &&
            message.createdAt > 0
                ? Math.trunc(message.createdAt)
                : undefined
        )
        .filter((value): value is number => typeof value === "number")
    const threadTimestamps = normalizeImportedThreadTimestamps({
        sourceCreatedAt,
        sourceUpdatedAt,
        messageCreatedAts,
        fallback: now
    })
    const normalizedTitle = normalizeThreadTitle(title)
    const threadId = await ctx.db.insert("threads", {
        authorId,
        title: normalizedTitle || "Imported Chat",
        createdAt: threadTimestamps.createdAt,
        updatedAt: threadTimestamps.updatedAt,
        projectId,
        personaSource: personaSnapshot?.source,
        personaSourceId: personaSnapshot?.sourceId,
        personaName: personaSnapshot?.name,
        personaAvatarKind: personaSnapshot?.avatarKind,
        personaAvatarValue: personaSnapshot?.avatarValue,
        personaAvatarMimeType: personaSnapshot?.avatarMimeType
    })

    const threadDoc = await ctx.db.get(threadId)
    if (threadDoc) {
        await aggregrateThreadsByFolder.insert(ctx, threadDoc)
    }

    if (personaSnapshot) {
        await ctx.db.insert("threadPersonaSnapshots", {
            threadId,
            ...personaSnapshot,
            createdAt: now
        })
    }

    let timestamp = threadTimestamps.createdAt
    for (const message of sanitizedMessages) {
        const requestedCreatedAt =
            typeof message.createdAt === "number" &&
            Number.isFinite(message.createdAt) &&
            message.createdAt > 0
                ? Math.trunc(message.createdAt)
                : undefined
        timestamp =
            requestedCreatedAt !== undefined
                ? Math.max(timestamp + 1, requestedCreatedAt)
                : timestamp + 1
        await ctx.db.insert("messages", {
            threadId,
            messageId: nanoid(),
            role: message.role,
            parts: message.parts,
            createdAt: timestamp,
            updatedAt: timestamp,
            metadata: message.metadata ?? {}
        })
    }

    if (timestamp > threadTimestamps.updatedAt) {
        await ctx.db.patch(threadId, {
            updatedAt: timestamp
        })
    }

    return {
        threadId,
        importedMessages: sanitizedMessages.length
    } as const
}

export const getThreadById = internalQuery({
    args: { threadId: v.id("threads") },
    handler: async ({ db }, { threadId }) => {
        const thread = await db.get(threadId)
        if (!thread) return null
        return thread
    }
})

export const createThreadOrInsertMessages = internalMutation({
    args: {
        threadId: v.optional(v.string()),
        authorId: v.string(),
        userMessage: v.optional(HTTPAIMessage),
        proposedNewAssistantId: v.string(),
        targetFromMessageId: v.optional(v.string()),
        targetMode: v.optional(v.union(v.literal("normal"), v.literal("edit"), v.literal("retry"))),
        folderId: v.optional(v.id("projects")),
        personaSnapshot: v.optional(ThreadPersonaSnapshotInput),
        openingMessage: v.optional(HTTPAIMessage)
    },
    handler: async (
        ctx,
        {
            threadId,
            authorId,
            userMessage,
            proposedNewAssistantId,
            targetFromMessageId,
            targetMode,
            folderId,
            personaSnapshot,
            openingMessage
        }
    ) => {
        if (!userMessage) return new ChatError("bad_request:chat")
        if (openingMessage && openingMessage.role !== "assistant") {
            return new ChatError("bad_request:chat")
        }

        const findExistingMessageById = async (
            messageId: string | undefined,
            role?: "user" | "assistant" | "system",
            expectedThreadId?: Id<"threads">
        ) => {
            if (!messageId) return null

            const matches = await ctx.db
                .query("messages")
                .withIndex("byMessageId", (q) => q.eq("messageId", messageId))
                .collect()

            return (
                matches.find(
                    (message) =>
                        (role ? message.role === role : true) &&
                        (expectedThreadId ? message.threadId === expectedThreadId : true)
                ) ?? null
            )
        }

        const touchThread = async (targetThreadId: Id<"threads">) => {
            await ctx.db.patch(targetThreadId, {
                updatedAt: Date.now()
            })
        }

        if (!targetFromMessageId) {
            const expectedThreadId = threadId as Id<"threads"> | undefined
            const existingUserMessage = await findExistingMessageById(
                userMessage.messageId,
                "user",
                expectedThreadId
            )
            const existingAssistantMessage = await findExistingMessageById(
                proposedNewAssistantId,
                "assistant",
                expectedThreadId
            )

            if (existingAssistantMessage) {
                return {
                    threadId: existingAssistantMessage.threadId,
                    userMessageId:
                        existingUserMessage?.messageId ??
                        userMessage.messageId ??
                        targetFromMessageId ??
                        proposedNewAssistantId,
                    assistantMessageId: existingAssistantMessage.messageId,
                    assistantMessageConvexId: existingAssistantMessage._id
                }
            }
        }

        if (!threadId) {
            const now = Date.now()
            const userMessageId_new = userMessage.messageId || nanoid()
            const newUserMessage_new = {
                messageId: userMessageId_new,
                createdAt: now + (openingMessage ? 1 : 0),
                updatedAt: now + (openingMessage ? 1 : 0),
                metadata: {},
                parts: userMessage.parts,
                role: userMessage.role
            }
            const newAssistantMessage_new = {
                messageId: proposedNewAssistantId,
                createdAt: now + (openingMessage ? 2 : 1),
                updatedAt: now + (openingMessage ? 2 : 1),
                metadata: {},
                parts: [],
                role: "assistant" as const
            }
            const initialTitle = openingMessage
                ? (personaSnapshot?.name ?? getInitialThreadTitle(userMessage))
                : getInitialThreadTitle(userMessage)

            const newId = await ctx.db.insert("threads", {
                authorId,
                title: initialTitle,
                createdAt: now,
                updatedAt: newAssistantMessage_new.updatedAt,
                projectId: folderId, // Set the project ID if creating from a folder
                personaSource: personaSnapshot?.source,
                personaSourceId: personaSnapshot?.sourceId,
                personaName: personaSnapshot?.name,
                personaAvatarKind: personaSnapshot?.avatarKind,
                personaAvatarValue: personaSnapshot?.avatarValue,
                personaAvatarMimeType: personaSnapshot?.avatarMimeType
            })
            const doc = await ctx.db.get(newId)
            await aggregrateThreadsByFolder.insert(ctx, doc!)

            if (personaSnapshot) {
                await ctx.db.insert("threadPersonaSnapshots", {
                    threadId: newId,
                    ...personaSnapshot,
                    createdAt: now
                })
            }

            // Thread count will be automatically updated by aggregate triggers

            if (openingMessage) {
                await ctx.db.insert("messages", {
                    threadId: newId,
                    messageId: openingMessage.messageId || nanoid(),
                    createdAt: now,
                    updatedAt: now,
                    metadata: {},
                    parts: openingMessage.parts,
                    role: "assistant"
                })
            }
            await ctx.db.insert("messages", {
                threadId: newId,
                ...newUserMessage_new
            })
            const assistantMessageConvexId = await ctx.db.insert("messages", {
                threadId: newId,
                ...newAssistantMessage_new
            })

            return {
                threadId: newId,
                userMessageId: userMessageId_new,
                assistantMessageId: proposedNewAssistantId,
                assistantMessageConvexId
            }
        }

        // new thread flow
        const thread = await ctx.db.get(threadId as Id<"threads">)
        if (!thread) {
            console.error("[cvx][createThreadOrInsertMessages] Thread not found", threadId)
            return undefined
        }

        // Handle edit mode - delete messages after the edited message
        let originalAssistantMessageId = proposedNewAssistantId
        if (targetFromMessageId) {
            const allMessages = await ctx.db
                .query("messages")
                .withIndex("byThreadId", (q) => q.eq("threadId", threadId as Id<"threads">))
                .order("asc")
                .collect()

            // Find the index of the message we're editing from
            const targetMessageIndex = allMessages.findIndex(
                (msg) => msg.messageId === targetFromMessageId
            )

            if (targetMessageIndex !== -1) {
                // Get the original assistant message ID before deleting (to reuse it)
                const messagesAfterTarget = allMessages.slice(targetMessageIndex + 1)
                const originalAssistantMessage = messagesAfterTarget.find(
                    (msg) => msg.role === "assistant"
                )
                if (originalAssistantMessage) {
                    originalAssistantMessageId = originalAssistantMessage.messageId
                }

                // Delete all messages after the edited message
                for (const msg of messagesAfterTarget) {
                    await ctx.db.delete(msg._id)
                }

                if (targetMode === "edit") {
                    // Update the edited message with new content
                    const editMessage = allMessages[targetMessageIndex]
                    if (editMessage) {
                        await ctx.db.patch(editMessage._id, {
                            parts: userMessage.parts,
                            updatedAt: Date.now()
                        })
                    }
                }
            }

            const newAssistantMessage_edit_or_retry = {
                messageId: originalAssistantMessageId, // Reuse the original assistant message ID
                createdAt: Date.now(),
                updatedAt: Date.now(),
                metadata: {},
                parts: [],
                role: "assistant" as const
            }

            const assistantMessageConvexId = await ctx.db.insert("messages", {
                threadId: threadId as Id<"threads">,
                ...newAssistantMessage_edit_or_retry
            })

            await touchThread(threadId as Id<"threads">)

            return {
                threadId: threadId as Id<"threads">,
                userMessageId: targetFromMessageId,
                assistantMessageId: originalAssistantMessageId, // Return the reused ID
                assistantMessageConvexId
            }
        }

        const userMessageId_existing = userMessage.messageId || nanoid()
        const newUserMessage_existing = {
            messageId: userMessageId_existing,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: {},
            parts: userMessage.parts,
            role: userMessage.role
        }
        const newAssistantMessage_existing = {
            messageId: proposedNewAssistantId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: {},
            parts: [],
            role: "assistant" as const
        }

        await ctx.db.insert("messages", {
            threadId: threadId as Id<"threads">,
            ...newUserMessage_existing
        })
        const assistantMessageConvexId = await ctx.db.insert("messages", {
            threadId: threadId as Id<"threads">,
            ...newAssistantMessage_existing
        })

        await touchThread(threadId as Id<"threads">)

        return {
            threadId: threadId as Id<"threads">,
            userMessageId: userMessageId_existing,
            assistantMessageId: proposedNewAssistantId,
            assistantMessageConvexId
        }
    }
})

// New query to fetch all messages for a thread (public)
export const getThreadMessages = query({
    args: { threadId: v.id("threads") },
    handler: async ({ db, auth }, { threadId }) => {
        const user = await getUserIdentity(auth, {
            allowAnons: true
        })

        if ("error" in user) return { error: user.error }

        const thread = await db.get(threadId)
        if (!thread || thread.authorId !== user.id) return { error: "Unauthorized" }

        const messages = await db
            .query("messages")
            .withIndex("byThreadId", (q) => q.eq("threadId", threadId))
            .collect()

        return messages.sort(compareMessagesChronologically)
    }
})

export const prepareThreadRetry = mutation({
    args: {
        threadId: v.id("threads"),
        targetFromMessageId: v.string()
    },
    handler: async (ctx, { threadId, targetFromMessageId }) => {
        const user = await getUserIdentity(ctx.auth, {
            allowAnons: true
        })

        if ("error" in user) return { error: user.error }
        await assertAccountNotDeleting(ctx, user.id)

        const thread = await ctx.db.get(threadId)
        if (!thread || thread.authorId !== user.id) return { error: "Unauthorized" }

        const messages = (
            await ctx.db
                .query("messages")
                .withIndex("byThreadId", (q) => q.eq("threadId", threadId))
                .collect()
        ).sort(compareMessagesChronologically)
        const targetMessageIndex = messages.findIndex(
            (message) => message.messageId === targetFromMessageId && message.role === "user"
        )

        if (targetMessageIndex === -1) return { error: "Message not found" }

        const messagesAfterTarget = messages.slice(targetMessageIndex + 1)
        const originalAssistantMessage = messagesAfterTarget.find(
            (message) => message.role === "assistant"
        )
        const assistantMessageId = originalAssistantMessage?.messageId ?? nanoid()

        for (const message of messagesAfterTarget) {
            await ctx.db.delete(message._id)
        }

        const now = Date.now()
        await ctx.db.insert("messages", {
            threadId,
            messageId: assistantMessageId,
            createdAt: now,
            updatedAt: now,
            metadata: {},
            parts: [],
            role: "assistant"
        })
        await ctx.db.patch(threadId, { updatedAt: now })

        return { assistantMessageId }
    }
})

// Paginated search query for command palette and search
export const searchUserThreads = query({
    args: {
        query: v.string(),
        paginationOpts: paginationOptsValidator
    },
    handler: async ({ db, auth }, { query, paginationOpts }) => {
        const user = await getUserIdentity(auth, {
            allowAnons: true
        })

        if ("error" in user) {
            return {
                page: [],
                isDone: true,
                continueCursor: ""
            }
        }

        if (!query.trim()) {
            // If no search query, return recent threads with pagination
            return await db
                .query("threads")
                .withIndex("byAuthorUpdatedAt", (q) => q.eq("authorId", user.id))
                .order("desc")
                .paginate(paginationOpts)
        }

        // Use search index for text search
        return await db
            .query("threads")
            .withSearchIndex("search_title", (q) =>
                q.search("title", query.trim()).eq("authorId", user.id)
            )
            .paginate(paginationOpts)
    }
})

const isEmpty = <A extends GenericTableInfo, B extends FieldPaths<A>>(
    q: FilterBuilder<A>,
    field: B
) =>
    q.or(
        q.eq(q.field(field), undefined),
        q.eq(q.field(field), null)
        // etc
    )

export const getUserThreadsPaginated = query({
    args: {
        paginationOpts: paginationOptsValidator,
        includeInFolder: v.optional(v.boolean())
    },
    handler: async ({ db, auth }, { paginationOpts, includeInFolder }) => {
        const user = await getUserIdentity(auth, {
            allowAnons: true
        })

        if ("error" in user) {
            // Return empty pagination result instead of error object
            return {
                page: [],
                isDone: true,
                continueCursor: ""
            }
        }

        // For the first page, include pinned threads at the top
        const isFirstPage = !paginationOpts.cursor

        if (isFirstPage) {
            const pinnedQuery = db
                .query("threads")
                .withIndex("byAuthorUpdatedAt", (q) => q.eq("authorId", user.id))
                .filter((q) => q.eq(q.field("pinned"), true))
                .order("desc")

            const regularQuery = db
                .query("threads")
                .withIndex("byAuthorUpdatedAt", (q) => q.eq("authorId", user.id))
                .filter((q) => q.neq(q.field("pinned"), true))
                .order("desc")

            const [pinnedThreads, regularThreadsResult] = await Promise.all([
                !includeInFolder
                    ? pinnedQuery.filter((q) => isEmpty(q, "projectId")).collect()
                    : pinnedQuery.collect(),
                !includeInFolder
                    ? regularQuery.filter((q) => isEmpty(q, "projectId")).paginate(paginationOpts)
                    : regularQuery.paginate(paginationOpts)
            ])

            const combinedPage = [...pinnedThreads, ...regularThreadsResult.page]
            const maxItems = paginationOpts.numItems

            if (combinedPage.length > maxItems) {
                return {
                    page: combinedPage.slice(0, maxItems),
                    isDone: false,
                    continueCursor: regularThreadsResult.continueCursor
                }
            }

            return {
                page: combinedPage,
                isDone: regularThreadsResult.isDone,
                continueCursor: regularThreadsResult.continueCursor
            }
        }

        const baseQuery = db
            .query("threads")
            .withIndex("byAuthorUpdatedAt", (q) => q.eq("authorId", user.id))
            .filter((q) => q.neq(q.field("pinned"), true))

        if (!includeInFolder) {
            return await baseQuery
                .filter((q) => isEmpty(q, "projectId"))
                .order("desc")
                .paginate(paginationOpts)
        }
        return await baseQuery.order("desc").paginate(paginationOpts)
    }
})

// Public version of getThreadById
export const getThread = query({
    args: { threadId: v.id("threads") },
    handler: async ({ db, auth }, { threadId }) => {
        const user = await getUserIdentity(auth, {
            allowAnons: true
        })

        if ("error" in user) return null

        const thread = await db.get(threadId)
        if (!thread || thread.authorId !== user.id) return null

        return thread
    }
})

export const updateThreadStreamingState = internalMutation({
    args: {
        threadId: v.id("threads"),
        isLive: v.boolean(),
        streamStartedAt: v.optional(v.number()),
        currentStreamId: v.optional(v.string()),
        currentStreamOwnerClientId: v.optional(v.string())
    },
    handler: async (
        { db },
        { threadId, isLive, streamStartedAt, currentStreamId, currentStreamOwnerClientId }
    ) => {
        const thread = await db.get(threadId)
        if (!thread) {
            console.error("[cvx][updateThreadStreamingState] Thread not found", threadId)
            return
        }

        await db.patch(threadId, {
            isLive,
            streamStartedAt: isLive ? streamStartedAt : undefined,
            currentStreamId: isLive ? currentStreamId : undefined,
            currentStreamOwnerClientId: isLive ? currentStreamOwnerClientId : undefined,
            updatedAt: Date.now()
        })
    }
})

export const updateThreadName = internalMutation({
    args: {
        threadId: v.id("threads"),
        name: v.string()
    },
    handler: async ({ db }, { threadId, name }) => {
        // Generated title updates are metadata-only and should not affect recency ordering.
        await db.patch(threadId, {
            title: name
        })
    }
})

// Internal mutations for shared thread operations
export const createSharedThread = internalMutation({
    args: {
        originalThreadId: v.id("threads"),
        authorId: v.string(),
        title: v.string(),
        shareQuestion: v.string(),
        sharerName: v.optional(v.string()),
        messages: v.array(v.any()),
        includeAttachments: v.boolean()
    },
    handler: async (
        { db },
        {
            originalThreadId,
            authorId,
            title,
            shareQuestion,
            sharerName,
            messages,
            includeAttachments
        }
    ) => {
        const sharedThreadId = await db.insert("sharedThreads", {
            originalThreadId,
            authorId,
            title,
            shareQuestion,
            sharerName,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages,
            includeAttachments
        })
        return { sharedThreadId }
    }
})

export const getSharedThread = query({
    args: { sharedThreadId: v.id("sharedThreads") },
    handler: async ({ db }, { sharedThreadId }) => {
        const sharedThread = await db.get(sharedThreadId)
        if (!sharedThread) return null

        return sharedThread
    }
})

// Shared Thread Functions
export const shareThread = action({
    args: {
        threadId: v.id("threads"),
        includeAttachments: v.optional(v.boolean())
    },
    handler: async (ctx, { threadId, includeAttachments = false }) => {
        const user = await getUserIdentity(ctx.auth, {
            allowAnons: true
        })

        if ("error" in user) return { error: user.error }
        await assertAccountNotDeletingForAction(ctx, user.id)

        // Get the original thread
        const thread: Infer<typeof Thread> | null = await ctx.runQuery(
            internal.threads.getThreadById,
            { threadId }
        )
        if (!thread || thread.authorId !== user.id) {
            return { error: "Unauthorized" }
        }

        // Get all messages for the thread
        const messages: Infer<typeof Message>[] = await ctx.runQuery(
            internal.messages.getMessagesByThreadId,
            { threadId }
        )

        // Convert messages to AIMessage format for shared thread
        const aiMessages = messages.map((msg) => ({
            messageId: msg.messageId,
            role: msg.role,
            parts: msg.parts,
            createdAt: msg.createdAt,
            updatedAt: msg.updatedAt,
            metadata: msg.metadata
        }))

        aiMessages.reverse()

        const settings = await ctx.runQuery(internal.settings.getUserSettingsInternal, {
            userId: user.id
        })
        const questionMessages: ModelMessage[] = aiMessages.map((message) => ({
            role: message.role,
            content: message.parts
                .map((part) => {
                    if (part.type === "text") return part.text
                    if (part.type === "file") return `[file: ${part.filename || "unknown"}]`
                    if (part.type === "image") return "[image]"
                    if (part.type === "reasoning") return `[reasoning: ${part.reasoning}]`
                    if (part.type === "tool-invocation") {
                        return `[tool: ${part.toolInvocation.toolName}]`
                    }
                    return ""
                })
                .filter(Boolean)
                .join(" ")
        }))
        const shareQuestion = await generateShareQuestion(
            ctx,
            questionMessages,
            user.id,
            settings,
            thread.title
        )
        const sharerName =
            !user.isAnonymous && typeof user.name === "string" && user.name.trim()
                ? user.name.trim().slice(0, 100)
                : undefined

        // Create shared thread
        const result: {
            sharedThreadId: Id<"sharedThreads">
        } = await ctx.runMutation(internal.threads.createSharedThread, {
            originalThreadId: threadId,
            authorId: user.id,
            title: thread.title,
            shareQuestion,
            sharerName,
            messages: aiMessages,
            includeAttachments
        })

        return result
    }
})

export const regenerateThreadTitle = action({
    args: { threadId: v.id("threads") },
    handler: async (ctx, { threadId }) => {
        const user = await getUserIdentity(ctx.auth, {
            allowAnons: false
        })

        if ("error" in user) return { error: user.error }
        await assertAccountNotDeletingForAction(ctx, user.id)

        const thread: Infer<typeof Thread> | null = await ctx.runQuery(
            internal.threads.getThreadById,
            { threadId }
        )
        if (!thread || thread.authorId !== user.id) {
            return { error: "Unauthorized" }
        }

        const dbMessages: Infer<typeof Message>[] = await ctx.runQuery(
            internal.messages.getMessagesByThreadId,
            { threadId }
        )

        if (dbMessages.length === 0) {
            return { error: "Thread has no messages" }
        }

        const settings = await ctx.runQuery(internal.settings.getUserSettingsInternal, {
            userId: user.id
        })
        const titleMessages = await dbMessagesToCore(dbMessages, [], {
            publicAssetBaseUrl: process.env.R2_PUBLIC_BASE_URL
        })

        const personaSnapshot = await ctx.runQuery(
            internal.personas.getThreadPersonaSnapshotInternal,
            { threadId }
        )
        const title = await generateThreadName(
            ctx,
            threadId,
            titleMessages,
            user.id,
            settings,
            personaSnapshot
        )

        return { success: true, title }
    }
})

export const forkSharedThread = mutation({
    args: { sharedThreadId: v.id("sharedThreads") },
    handler: async (ctx, { sharedThreadId }) => {
        const user = await getUserIdentity(ctx.auth, {
            allowAnons: true
        })

        if ("error" in user) return { error: user.error }
        await assertAccountNotDeleting(ctx, user.id)

        const sharedThread = await ctx.runQuery(api.threads.getSharedThread, { sharedThreadId })
        if (!sharedThread) return { error: "Shared thread not found" }

        // Create new thread for the user
        const newThreadId: Id<"threads"> = await ctx.db.insert("threads", {
            authorId: user.id,
            title: sharedThread.title,
            createdAt: Date.now(),
            updatedAt: Date.now()
        })
        const doc = await ctx.db.get(newThreadId)
        await aggregrateThreadsByFolder.insert(ctx, doc!)

        // Copy messages to new thread
        for (const message of sharedThread.messages) {
            await ctx.db.insert("messages", {
                threadId: newThreadId,
                messageId: message.messageId,
                role: message.role,
                parts: message.parts,
                createdAt: message.createdAt,
                updatedAt: message.updatedAt,
                metadata: message.metadata
            })
        }

        return { threadId: newThreadId }
    }
})

export const branchThread = mutation({
    args: {
        threadId: v.id("threads"),
        messageId: v.string()
    },
    handler: async (ctx, { threadId, messageId }) => {
        const user = await getUserIdentity(ctx.auth, {
            allowAnons: false
        })

        if ("error" in user) return { error: user.error }
        await assertAccountNotDeleting(ctx, user.id)

        const thread = await ctx.db.get(threadId)
        if (!thread || thread.authorId !== user.id) return { error: "Unauthorized" }

        const messages = (
            await ctx.db
                .query("messages")
                .withIndex("byThreadId", (q) => q.eq("threadId", threadId))
                .collect()
        ).sort(compareMessagesChronologically)
        const targetMessageIndex = messages.findIndex((message) => message.messageId === messageId)

        if (targetMessageIndex === -1) return { error: "Message not found" }

        const now = Date.now()
        const branchedMessages = messages.slice(0, targetMessageIndex + 1)
        const newThreadId = await ctx.db.insert("threads", {
            authorId: user.id,
            title: thread.title,
            createdAt: now,
            updatedAt: now,
            projectId: thread.projectId,
            isBranched: true,
            branchedFromThreadId: threadId,
            branchedFromMessageId: messageId,
            personaSource: thread.personaSource,
            personaSourceId: thread.personaSourceId,
            personaName: thread.personaName,
            personaAvatarKind: thread.personaAvatarKind,
            personaAvatarValue: thread.personaAvatarValue,
            personaAvatarMimeType: thread.personaAvatarMimeType
        })
        const newThread = await ctx.db.get(newThreadId)
        await aggregrateThreadsByFolder.insert(ctx, newThread!)

        let nextMessageCreatedAt = now
        for (const message of branchedMessages) {
            nextMessageCreatedAt += 1
            await ctx.db.insert("messages", {
                threadId: newThreadId,
                messageId: message.messageId,
                role: message.role,
                parts: message.parts,
                createdAt: nextMessageCreatedAt,
                updatedAt: nextMessageCreatedAt,
                metadata: message.metadata
            })
        }

        const personaSnapshot = await ctx.db
            .query("threadPersonaSnapshots")
            .withIndex("byThreadId", (q) => q.eq("threadId", threadId))
            .first()

        if (personaSnapshot) {
            await ctx.db.insert("threadPersonaSnapshots", {
                threadId: newThreadId,
                source: personaSnapshot.source,
                sourceId: personaSnapshot.sourceId,
                name: personaSnapshot.name,
                shortName: personaSnapshot.shortName,
                description: personaSnapshot.description,
                instructions: personaSnapshot.instructions,
                defaultModelId: personaSnapshot.defaultModelId,
                conversationStarters: personaSnapshot.conversationStarters,
                avatarKind: personaSnapshot.avatarKind,
                avatarValue: personaSnapshot.avatarValue,
                avatarMimeType: personaSnapshot.avatarMimeType,
                knowledgeDocs: personaSnapshot.knowledgeDocs,
                compiledPrompt: personaSnapshot.compiledPrompt,
                promptTokenEstimate: personaSnapshot.promptTokenEstimate,
                createdAt: now
            })
        }

        return {
            threadId: newThreadId,
            projectId: thread.projectId,
            targetRole: branchedMessages[branchedMessages.length - 1]?.role
        }
    }
})

export const togglePinThread = mutation({
    args: { threadId: v.id("threads") },
    handler: async (ctx, { threadId }) => {
        const user = await getUserIdentity(ctx.auth, {
            allowAnons: false
        })

        if ("error" in user) return { error: user.error }
        await assertAccountNotDeleting(ctx, user.id)

        const thread = await ctx.db.get(threadId)
        if (!thread || thread.authorId !== user.id) return { error: "Unauthorized" }

        await ctx.db.patch(threadId, {
            pinned: !thread.pinned
        })

        return { pinned: !thread.pinned }
    }
})

export const deleteThread = mutation({
    args: { threadId: v.id("threads") },
    handler: async (ctx, { threadId }) => {
        const user = await getUserIdentity(ctx.auth, {
            allowAnons: false
        })

        if ("error" in user) return { error: user.error }
        await assertAccountNotDeleting(ctx, user.id)

        const thread = await ctx.db.get(threadId)
        if (!thread || thread.authorId !== user.id) return { error: "Unauthorized" }

        // Thread count will be automatically updated by aggregate triggers

        await ctx.db.delete(threadId)
        await aggregrateThreadsByFolder.delete(ctx, thread)
    }
})

export const renameThread = mutation({
    args: {
        threadId: v.id("threads"),
        title: v.string()
    },
    handler: async (ctx, { threadId, title }) => {
        const user = await getUserIdentity(ctx.auth, {
            allowAnons: false
        })

        if ("error" in user) return { error: user.error }
        await assertAccountNotDeleting(ctx, user.id)

        const thread = await ctx.db.get(threadId)
        if (!thread || thread.authorId !== user.id) return { error: "Unauthorized" }

        // Validate title is not empty and reasonable length
        const trimmedTitle = title.trim()
        if (!trimmedTitle) return { error: "Title cannot be empty" }
        if (trimmedTitle.length > 100) return { error: "Title too long" }

        await ctx.db.patch(threadId, {
            title: trimmedTitle,
            updatedAt: Date.now()
        })

        return { success: true }
    }
})

export const importThread = mutation({
    args: {
        title: v.string(),
        messages: v.array(ImportedMessage),
        projectId: v.optional(v.id("projects")),
        sourceCreatedAt: v.optional(v.number()),
        sourceUpdatedAt: v.optional(v.number()),
        personaSnapshot: v.optional(ThreadPersonaSnapshotInput)
    },
    handler: async (
        ctx,
        { title, messages, projectId, sourceCreatedAt, sourceUpdatedAt, personaSnapshot }
    ) => {
        const user = await getUserIdentity(ctx.auth, {
            allowAnons: false
        })

        if ("error" in user) return { error: user.error }
        await assertAccountNotDeleting(ctx, user.id)

        return await performThreadImport(ctx, {
            authorId: user.id,
            title,
            messages,
            projectId,
            sourceCreatedAt,
            sourceUpdatedAt,
            personaSnapshot
        })
    }
})

export const importPreparedThread = internalMutation({
    args: {
        authorId: v.string(),
        title: v.string(),
        messages: v.array(ImportedMessage),
        projectId: v.optional(v.id("projects")),
        sourceCreatedAt: v.optional(v.number()),
        sourceUpdatedAt: v.optional(v.number()),
        personaSnapshot: v.optional(ThreadPersonaSnapshotInput)
    },
    handler: async (
        ctx,
        { authorId, title, messages, projectId, sourceCreatedAt, sourceUpdatedAt, personaSnapshot }
    ) => {
        return await performThreadImport(ctx, {
            authorId,
            title,
            messages,
            projectId,
            sourceCreatedAt,
            sourceUpdatedAt,
            personaSnapshot
        })
    }
})

// Get threads by project (or general threads if projectId is null)
export const getThreadsByProject = query({
    args: {
        projectId: v.optional(v.id("projects")),
        paginationOpts: paginationOptsValidator
    },
    handler: async ({ db, auth }, { projectId, paginationOpts }) => {
        const user = await getUserIdentity(auth, { allowAnons: true })

        if ("error" in user) {
            return {
                page: [],
                isDone: true,
                continueCursor: ""
            }
        }

        if (projectId) {
            // Get threads for specific project
            return await db
                .query("threads")
                .withIndex("byAuthorAndProjectUpdatedAt", (q) =>
                    q.eq("authorId", user.id).eq("projectId", projectId)
                )
                .order("desc")
                .paginate(paginationOpts)
        }

        // Get threads without project (General)
        return await db
            .query("threads")
            .withIndex("byAuthorUpdatedAt", (q) => q.eq("authorId", user.id))
            .filter((q) => q.eq(q.field("projectId"), undefined))
            .order("desc")
            .paginate(paginationOpts)
    }
})

export const getThreadIdsByProject = query({
    args: {
        projectId: v.id("projects")
    },
    handler: async ({ db, auth }, { projectId }) => {
        const user = await getUserIdentity(auth, { allowAnons: true })

        if ("error" in user) {
            return []
        }

        const threads = await db
            .query("threads")
            .withIndex("byAuthorAndProject", (q) =>
                q.eq("authorId", user.id).eq("projectId", projectId)
            )
            .collect()

        return threads.map((thread) => thread._id)
    }
})

export const getUserThreadsByIds = query({
    args: {
        threadIds: v.array(v.id("threads"))
    },
    handler: async ({ db, auth }, { threadIds }) => {
        const user = await getUserIdentity(auth, { allowAnons: true })

        if ("error" in user) {
            return []
        }

        const threads = await Promise.all(threadIds.map((threadId) => db.get(threadId)))

        return threads
            .filter((thread): thread is NonNullable<typeof thread> => Boolean(thread))
            .filter((thread) => thread.authorId === user.id)
    }
})

// Enhanced getUserThreadsPaginated with project filtering
export const getUserThreadsPaginatedByProject = query({
    args: {
        paginationOpts: paginationOptsValidator,
        projectId: v.optional(v.id("projects"))
    },
    handler: async ({ db, auth }, { paginationOpts, projectId }) => {
        const user = await getUserIdentity(auth, { allowAnons: true })

        if ("error" in user) {
            return {
                page: [],
                isDone: true,
                continueCursor: ""
            }
        }

        // For the first page, include pinned threads at the top
        const isFirstPage = !paginationOpts.cursor

        if (isFirstPage) {
            let pinnedThreads: ThreadDoc[] = []
            let regularThreadsResult: PaginationResult<ThreadDoc>

            if (projectId) {
                // Get pinned threads for specific project
                pinnedThreads = await db
                    .query("threads")
                    .withIndex("byAuthorAndProjectUpdatedAt", (q) =>
                        q.eq("authorId", user.id).eq("projectId", projectId)
                    )
                    .filter((q) => q.eq(q.field("pinned"), true))
                    .order("desc")
                    .collect()

                // Get regular threads (non-pinned) for specific project
                regularThreadsResult = await db
                    .query("threads")
                    .withIndex("byAuthorAndProjectUpdatedAt", (q) =>
                        q.eq("authorId", user.id).eq("projectId", projectId)
                    )
                    .filter((q) => q.neq(q.field("pinned"), true))
                    .order("desc")
                    .paginate(paginationOpts)
            } else {
                // Get pinned threads without project (General)
                pinnedThreads = await db
                    .query("threads")
                    .withIndex("byAuthorUpdatedAt", (q) => q.eq("authorId", user.id))
                    .filter((q) =>
                        q.and(q.eq(q.field("projectId"), undefined), q.eq(q.field("pinned"), true))
                    )
                    .order("desc")
                    .collect()

                // Get regular threads (non-pinned) without project
                regularThreadsResult = await db
                    .query("threads")
                    .withIndex("byAuthorUpdatedAt", (q) => q.eq("authorId", user.id))
                    .filter((q) =>
                        q.and(q.eq(q.field("projectId"), undefined), q.neq(q.field("pinned"), true))
                    )
                    .order("desc")
                    .paginate(paginationOpts)
            }

            // Combine pinned threads with regular threads
            const combinedPage = [...pinnedThreads, ...regularThreadsResult.page]

            // If we have too many threads, trim to the requested page size
            const maxItems = paginationOpts.numItems
            if (combinedPage.length > maxItems) {
                return {
                    page: combinedPage.slice(0, maxItems),
                    isDone: false,
                    continueCursor: regularThreadsResult.continueCursor
                }
            }

            return {
                page: combinedPage,
                isDone: regularThreadsResult.isDone,
                continueCursor: regularThreadsResult.continueCursor
            }
        }

        // For subsequent pages, only get regular threads (no pinned)
        if (projectId) {
            return await db
                .query("threads")
                .withIndex("byAuthorAndProjectUpdatedAt", (q) =>
                    q.eq("authorId", user.id).eq("projectId", projectId)
                )
                .filter((q) => q.neq(q.field("pinned"), true))
                .order("desc")
                .paginate(paginationOpts)
        }

        return await db
            .query("threads")
            .withIndex("byAuthorUpdatedAt", (q) => q.eq("authorId", user.id))
            .filter((q) =>
                q.and(q.eq(q.field("projectId"), undefined), q.neq(q.field("pinned"), true))
            )
            .order("desc")
            .paginate(paginationOpts)
    }
})
