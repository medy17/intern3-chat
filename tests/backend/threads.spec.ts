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
import { createThreadOrInsertMessages, importPreparedThread } from "../../convex/threads"

type ThreadDoc = Record<string, unknown>
type MessageDoc = Record<string, unknown>
const createThreadOrInsertMessagesHandler = createThreadOrInsertMessages as unknown as {
    handler: (ctx: any, args: any) => Promise<any>
}
const importPreparedThreadHandler = importPreparedThread as unknown as {
    handler: (ctx: any, args: any) => Promise<any>
}
type ThreadsCtx = Parameters<typeof createThreadOrInsertMessagesHandler.handler>[0]

const createMessageQuery = (
    messages: MessageDoc[],
    messagesByMessageId?: Record<string, MessageDoc[]>
) => ({
    withIndex: vi
        .fn()
        .mockImplementation(
            (
                indexName: string,
                applyIndex: (q: { eq: (_field: string, value: string) => string }) => string
            ) => {
                const matchValue = applyIndex({
                    eq: (_field: string, value: string) => value
                })

                if (indexName === "byMessageId") {
                    return {
                        collect: vi
                            .fn()
                            .mockResolvedValue(
                                messagesByMessageId?.[matchValue] ??
                                    messages.filter((message) => message.messageId === matchValue)
                            )
                    }
                }

                const threadMessages = messages.filter((message) =>
                    "threadId" in message ? message.threadId === matchValue : true
                )

                return {
                    order: vi.fn().mockReturnValue({
                        collect: vi.fn().mockResolvedValue(threadMessages)
                    }),
                    collect: vi.fn().mockResolvedValue(threadMessages)
                }
            }
        )
})

const createCtx = (options?: {
    thread?: ThreadDoc
    messages?: MessageDoc[]
    messagesByMessageId?: Record<string, MessageDoc[]>
    inserts?: string[]
}) => {
    const insertValues = [...(options?.inserts ?? [])]
    return {
        db: {
            insert: vi.fn().mockImplementation(async () => insertValues.shift() ?? "inserted-id"),
            get: vi.fn().mockImplementation(async () => options?.thread ?? null),
            patch: vi.fn(),
            delete: vi.fn(),
            query: vi
                .fn()
                .mockImplementation(() =>
                    createMessageQuery(options?.messages ?? [], options?.messagesByMessageId)
                )
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
        const result = await createThreadOrInsertMessagesHandler.handler(createCtx(), {
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

        const result = await createThreadOrInsertMessagesHandler.handler(ctx, {
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

        const result = await createThreadOrInsertMessagesHandler.handler(ctx, {
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

    it("returns the existing assistant placeholder for duplicate sends on an existing thread", async () => {
        const ctx = createCtx({
            thread: { _id: "thread-1", authorId: "user-1" },
            messagesByMessageId: {
                "user-msg-2": [
                    {
                        _id: "user-doc-existing",
                        threadId: "thread-1",
                        messageId: "user-msg-2",
                        role: "user",
                        parts: [{ type: "text", text: "Next prompt" }]
                    }
                ],
                "assistant-2": [
                    {
                        _id: "assistant-doc-existing",
                        threadId: "thread-1",
                        messageId: "assistant-2",
                        role: "assistant",
                        parts: []
                    }
                ]
            }
        })

        const result = await createThreadOrInsertMessagesHandler.handler(ctx, {
            threadId: "thread-1",
            authorId: "user-1",
            proposedNewAssistantId: "assistant-2",
            userMessage: {
                messageId: "user-msg-2",
                role: "user",
                parts: [{ type: "text", text: "Next prompt" }]
            }
        })

        expect(ctx.db.insert).not.toHaveBeenCalled()
        expect(result).toEqual({
            threadId: "thread-1",
            userMessageId: "user-msg-2",
            assistantMessageId: "assistant-2",
            assistantMessageConvexId: "assistant-doc-existing"
        })
    })

    it("returns the existing assistant placeholder for duplicate new-thread sends", async () => {
        const ctx = createCtx({
            messagesByMessageId: {
                "user-msg-1": [
                    {
                        _id: "user-doc-existing",
                        threadId: "thread-1",
                        messageId: "user-msg-1",
                        role: "user",
                        parts: [{ type: "text", text: "Start thread" }]
                    }
                ],
                "assistant-1": [
                    {
                        _id: "assistant-doc-existing",
                        threadId: "thread-1",
                        messageId: "assistant-1",
                        role: "assistant",
                        parts: []
                    }
                ]
            }
        })

        const result = await createThreadOrInsertMessagesHandler.handler(ctx, {
            authorId: "user-1",
            proposedNewAssistantId: "assistant-1",
            userMessage: {
                messageId: "user-msg-1",
                role: "user",
                parts: [{ type: "text", text: "Start thread" }]
            }
        })

        expect(ctx.db.insert).not.toHaveBeenCalled()
        expect(result).toEqual({
            threadId: "thread-1",
            userMessageId: "user-msg-1",
            assistantMessageId: "assistant-1",
            assistantMessageConvexId: "assistant-doc-existing"
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

        const result = await createThreadOrInsertMessagesHandler.handler(ctx, {
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
        const result = await createThreadOrInsertMessagesHandler.handler(createCtx(), {
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

describe("importPreparedThread", () => {
    beforeEach(() => {
        aggregateInsertMock.mockReset().mockResolvedValue(undefined)
        nanoidMock.mockReset().mockReturnValue("generated-import-message-id")
    })

    it("preserves sane imported message timestamps while enforcing monotonic ordering", async () => {
        const ctx = createCtx({
            thread: { _id: "thread-import-1", authorId: "user-1" },
            inserts: ["thread-import-1", "msg-1", "msg-2", "msg-3"]
        })

        const result = await importPreparedThreadHandler.handler(ctx, {
            authorId: "user-1",
            title: "Imported Chat",
            messages: [
                {
                    role: "user",
                    createdAt: 3000,
                    parts: [{ type: "text", text: "First" }]
                },
                {
                    role: "assistant",
                    createdAt: 2000,
                    parts: [{ type: "text", text: "Second" }]
                },
                {
                    role: "user",
                    parts: [{ type: "text", text: "Third" }]
                }
            ],
            sourceCreatedAt: 1000
        })

        expect(ctx.db.insert).toHaveBeenNthCalledWith(
            1,
            "threads",
            expect.objectContaining({
                title: "Imported Chat",
                createdAt: 1000,
                updatedAt: 3000
            })
        )
        expect(ctx.db.insert).toHaveBeenNthCalledWith(
            2,
            "messages",
            expect.objectContaining({
                threadId: "thread-import-1",
                createdAt: 3000,
                updatedAt: 3000
            })
        )
        expect(ctx.db.insert).toHaveBeenNthCalledWith(
            3,
            "messages",
            expect.objectContaining({
                threadId: "thread-import-1",
                createdAt: 3001,
                updatedAt: 3001
            })
        )
        expect(ctx.db.insert).toHaveBeenNthCalledWith(
            4,
            "messages",
            expect.objectContaining({
                threadId: "thread-import-1",
                createdAt: 3002,
                updatedAt: 3002
            })
        )
        expect(ctx.db.patch).toHaveBeenCalledWith("thread-import-1", {
            updatedAt: 3002
        })
        expect(result).toEqual({
            threadId: "thread-import-1",
            importedMessages: 3
        })
    })
})
