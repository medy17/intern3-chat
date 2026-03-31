import { beforeEach, describe, expect, it, vi } from "vitest"

const { aggregateInsertMock, nanoidMock } = vi.hoisted(() => ({
    aggregateInsertMock: vi.fn(),
    nanoidMock: vi.fn()
}))

vi.mock("convex/values", () => {
    const passthrough = () => ({})
    return {
        v: new Proxy(
            {},
            {
                get: () => passthrough
            }
        )
    }
})

vi.mock("convex/server", () => ({
    paginationOptsValidator: {}
}))

vi.mock("../../convex/_generated/server", () => ({
    action: (config: unknown) => config,
    internalMutation: (config: unknown) => config,
    internalQuery: (config: unknown) => config,
    mutation: (config: unknown) => config,
    query: (config: unknown) => config
}))

vi.mock("../../convex/_generated/api", () => ({
    api: {},
    internal: {}
}))

vi.mock("../../convex/aggregates", () => ({
    aggregrateThreadsByFolder: {
        insert: aggregateInsertMock
    }
}))

vi.mock("nanoid", () => ({
    nanoid: nanoidMock
}))

vi.mock("../../convex/chat_http/generate_thread_name", () => ({
    generateThreadName: vi.fn()
}))

vi.mock("../../convex/lib/db_to_core_messages", () => ({
    dbMessagesToCore: vi.fn()
}))

vi.mock("../../convex/lib/identity", () => ({
    getUserIdentity: vi.fn()
}))

vi.mock("../../convex/schema", () => ({
    Thread: {}
}))

vi.mock("../../convex/schema/message", () => ({
    HTTPAIMessage: {},
    Message: {}
}))

vi.mock("../../convex/schema/parts", () => ({
    MessagePart: {}
}))

import { ChatError } from "@/lib/errors"
import { createThreadOrInsertMessages } from "../../convex/threads"

type ThreadDoc = Record<string, unknown>
type MessageDoc = Record<string, unknown>
type ThreadsCtx = Parameters<typeof createThreadOrInsertMessages.handler>[0]

const createMessageQuery = (messages: MessageDoc[]) => ({
    withIndex: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
            collect: vi.fn().mockResolvedValue(messages)
        })
    })
})

const createCtx = (options?: {
    thread?: ThreadDoc
    messages?: MessageDoc[]
    inserts?: string[]
}) => {
    const insertValues = [...(options?.inserts ?? [])]
    return {
        db: {
            insert: vi.fn().mockImplementation(async () => insertValues.shift() ?? "inserted-id"),
            get: vi.fn().mockImplementation(async () => options?.thread ?? null),
            patch: vi.fn(),
            delete: vi.fn(),
            query: vi.fn().mockImplementation(() => createMessageQuery(options?.messages ?? []))
        }
    } as ThreadsCtx
}

describe("createThreadOrInsertMessages", () => {
    beforeEach(() => {
        aggregateInsertMock.mockReset().mockResolvedValue(undefined)
        nanoidMock.mockReset().mockReturnValue("generated-user-message-id")
        vi.spyOn(console, "error").mockImplementation(() => {})
    })

    it("returns a bad_request error when userMessage is missing", async () => {
        const result = await createThreadOrInsertMessages.handler(createCtx(), {
            authorId: "user-1",
            proposedNewAssistantId: "assistant-1"
        })

        expect(result).toBeInstanceOf(ChatError)
        expect((result as ChatError).type).toBe("bad_request")
    })

    it("creates a new thread with derived title and inserts user and assistant messages", async () => {
        const threadDoc = { _id: "thread-1", authorId: "user-1", projectId: "folder-1" }
        const ctx = createCtx({
            thread: threadDoc,
            inserts: ["thread-1", "user-msg-doc", "assistant-msg-doc"]
        })

        const result = await createThreadOrInsertMessages.handler(ctx, {
            authorId: "user-1",
            proposedNewAssistantId: "assistant-1",
            folderId: "folder-1",
            userMessage: {
                role: "user",
                parts: [{ type: "text", text: "Please review this project plan today" }]
            }
        })

        expect(ctx.db.insert).toHaveBeenNthCalledWith(
            1,
            "threads",
            expect.objectContaining({
                authorId: "user-1",
                title: "Please review this project plan today",
                projectId: "folder-1"
            })
        )
        expect(ctx.db.insert).toHaveBeenNthCalledWith(
            2,
            "messages",
            expect.objectContaining({
                threadId: "thread-1",
                messageId: "generated-user-message-id",
                role: "user"
            })
        )
        expect(ctx.db.insert).toHaveBeenNthCalledWith(
            3,
            "messages",
            expect.objectContaining({
                threadId: "thread-1",
                messageId: "assistant-1",
                role: "assistant",
                parts: []
            })
        )
        expect(aggregateInsertMock).toHaveBeenCalledWith(ctx, threadDoc)
        expect(result).toEqual({
            threadId: "thread-1",
            userMessageId: "generated-user-message-id",
            assistantMessageId: "assistant-1",
            assistantMessageConvexId: "assistant-msg-doc"
        })
    })

    it("appends a new user and assistant message to an existing thread and touches the thread", async () => {
        const ctx = createCtx({
            thread: { _id: "thread-1", authorId: "user-1" },
            inserts: ["user-msg-doc", "assistant-msg-doc"]
        })

        const result = await createThreadOrInsertMessages.handler(ctx, {
            threadId: "thread-1",
            authorId: "user-1",
            proposedNewAssistantId: "assistant-2",
            userMessage: {
                messageId: "user-msg-2",
                role: "user",
                parts: [{ type: "text", text: "Next prompt" }]
            }
        })

        expect(ctx.db.insert).toHaveBeenCalledTimes(2)
        expect(ctx.db.patch).toHaveBeenCalledWith(
            "thread-1",
            expect.objectContaining({ updatedAt: expect.any(Number) })
        )
        expect(result).toEqual({
            threadId: "thread-1",
            userMessageId: "user-msg-2",
            assistantMessageId: "assistant-2",
            assistantMessageConvexId: "assistant-msg-doc"
        })
    })

    it("reuses the original assistant id and truncates later messages during edit flow", async () => {
        const ctx = createCtx({
            thread: { _id: "thread-1", authorId: "user-1" },
            messages: [
                {
                    _id: "m1",
                    messageId: "user-original",
                    role: "user",
                    parts: [{ type: "text", text: "old" }]
                },
                { _id: "m2", messageId: "assistant-old", role: "assistant", parts: [] },
                {
                    _id: "m3",
                    messageId: "user-later",
                    role: "user",
                    parts: [{ type: "text", text: "later" }]
                }
            ],
            inserts: ["assistant-doc-new"]
        })

        const result = await createThreadOrInsertMessages.handler(ctx, {
            threadId: "thread-1",
            authorId: "user-1",
            proposedNewAssistantId: "assistant-proposed",
            targetFromMessageId: "user-original",
            targetMode: "edit",
            userMessage: {
                role: "user",
                parts: [{ type: "text", text: "edited content" }]
            }
        })

        expect(ctx.db.delete).toHaveBeenCalledTimes(2)
        expect(ctx.db.delete).toHaveBeenNthCalledWith(1, "m2")
        expect(ctx.db.delete).toHaveBeenNthCalledWith(2, "m3")
        expect(ctx.db.patch).toHaveBeenCalledWith(
            "m1",
            expect.objectContaining({
                parts: [{ type: "text", text: "edited content" }],
                updatedAt: expect.any(Number)
            })
        )
        expect(ctx.db.insert).toHaveBeenCalledWith(
            "messages",
            expect.objectContaining({
                threadId: "thread-1",
                messageId: "assistant-old",
                role: "assistant"
            })
        )
        expect(result).toEqual({
            threadId: "thread-1",
            userMessageId: "user-original",
            assistantMessageId: "assistant-old",
            assistantMessageConvexId: "assistant-doc-new"
        })
    })

    it("returns undefined when the target thread does not exist", async () => {
        const result = await createThreadOrInsertMessages.handler(createCtx(), {
            threadId: "missing-thread",
            authorId: "user-1",
            proposedNewAssistantId: "assistant-1",
            userMessage: {
                role: "user",
                parts: [{ type: "text", text: "Hello" }]
            }
        })

        expect(result).toBeUndefined()
    })
})
