import { beforeEach, describe, expect, it, vi } from "vitest"

const { createUIMessageStreamMock, getResumableStreamContextMock, getUserIdentityMock } =
    vi.hoisted(() => ({
        createUIMessageStreamMock: vi.fn(),
        getResumableStreamContextMock: vi.fn(),
        getUserIdentityMock: vi.fn()
    }))

vi.mock("ai", () => ({
    JsonToSseTransformStream: class extends TransformStream<string, string> {
        constructor() {
            super({
                transform(chunk, controller) {
                    controller.enqueue(chunk)
                }
            })
        }
    },
    UI_MESSAGE_STREAM_HEADERS: {
        "content-type": "text/event-stream"
    },
    createUIMessageStream: createUIMessageStreamMock
}))

vi.mock("../../convex/_generated/server", () => ({
    httpAction: (handler: unknown) => handler
}))

vi.mock("../../convex/_generated/api", () => ({
    internal: {
        messages: {
            getMessagesByThreadId: "getMessagesByThreadId"
        },
        streams: {
            getStreamsByThreadId: "getStreamsByThreadId"
        },
        threads: {
            getThreadById: "getThreadById"
        }
    }
}))

vi.mock("../../convex/lib/identity", () => ({
    getUserIdentity: getUserIdentityMock
}))

vi.mock("../../convex/lib/resumable_stream_context", () => ({
    getResumableStreamContext: getResumableStreamContextMock
}))

import { chatGET } from "../../convex/chat_http/get.route"

type ChatGetCtx = Parameters<typeof chatGET>[0]

const createCtx = () =>
    ({
        auth: {},
        runQuery: vi.fn()
    }) as ChatGetCtx

const makeTextStream = (text: string) =>
    new ReadableStream<string>({
        start(controller) {
            controller.enqueue(text)
            controller.close()
        }
    })

describe("chatGET", () => {
    beforeEach(() => {
        createUIMessageStreamMock.mockReset()
        getResumableStreamContextMock.mockReset()
        getUserIdentityMock.mockReset()

        createUIMessageStreamMock.mockImplementation(() => makeTextStream("empty-stream"))
    })

    it("returns 204 when resumable streams are unavailable", async () => {
        getResumableStreamContextMock.mockReturnValueOnce(null)

        const response = await chatGET(
            createCtx(),
            new Request("https://example.com/chat?chatId=thread-1")
        )

        expect(response.status).toBe(204)
    })

    it("rejects requests without a chat id", async () => {
        getResumableStreamContextMock.mockReturnValueOnce({})

        const response = await chatGET(createCtx(), new Request("https://example.com/chat"))

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
            code: "bad_request:api"
        })
    })

    it("rejects unauthorized users", async () => {
        getResumableStreamContextMock.mockReturnValueOnce({})
        getUserIdentityMock.mockResolvedValueOnce({ error: "Unauthorized" })

        const response = await chatGET(
            createCtx(),
            new Request("https://example.com/chat?chatId=thread-1")
        )

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toMatchObject({
            code: "unauthorized:chat"
        })
    })

    it("rejects users who do not own the thread", async () => {
        const ctx = createCtx()

        getResumableStreamContextMock.mockReturnValueOnce({})
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })
        ctx.runQuery.mockResolvedValueOnce({
            _id: "thread-1",
            authorId: "user-2"
        })

        const response = await chatGET(ctx, new Request("https://example.com/chat?chatId=thread-1"))

        expect(response.status).toBe(403)
        await expect(response.json()).resolves.toMatchObject({
            code: "forbidden:chat"
        })
    })

    it("returns 404 when a thread has no resumable streams", async () => {
        const ctx = createCtx()

        getResumableStreamContextMock.mockReturnValueOnce({})
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })
        ctx.runQuery
            .mockResolvedValueOnce({
                _id: "thread-1",
                authorId: "user-1"
            })
            .mockResolvedValueOnce([])

        const response = await chatGET(ctx, new Request("https://example.com/chat?chatId=thread-1"))

        expect(response.status).toBe(404)
        await expect(response.json()).resolves.toMatchObject({
            code: "not_found:stream"
        })
    })

    it("returns 204 when resumable stream recovery throws", async () => {
        const resumeExistingStream = vi.fn().mockRejectedValueOnce(new Error("stream failed"))
        const ctx = createCtx()

        vi.spyOn(console, "warn").mockImplementation(() => {})

        getResumableStreamContextMock.mockReturnValueOnce({
            resumeExistingStream
        })
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })
        ctx.runQuery
            .mockResolvedValueOnce({
                _id: "thread-1",
                authorId: "user-1"
            })
            .mockResolvedValueOnce([{ _id: "stream-1" }])

        const response = await chatGET(ctx, new Request("https://example.com/chat?chatId=thread-1"))

        expect(response.status).toBe(204)
        expect(resumeExistingStream).toHaveBeenCalledWith("stream-1")
    })

    it("returns an empty SSE stream when the resumable stream is already finished", async () => {
        const resumeExistingStream = vi.fn().mockResolvedValueOnce(null)
        const ctx = createCtx()

        getResumableStreamContextMock.mockReturnValueOnce({
            resumeExistingStream
        })
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })
        ctx.runQuery
            .mockResolvedValueOnce({
                _id: "thread-1",
                authorId: "user-1"
            })
            .mockResolvedValueOnce([{ _id: "stream-1" }])
            .mockResolvedValueOnce([
                {
                    _id: "message-1",
                    role: "assistant",
                    createdAt: new Date().toISOString()
                }
            ])

        const response = await chatGET(ctx, new Request("https://example.com/chat?chatId=thread-1"))

        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe("text/event-stream")
        await expect(response.text()).resolves.toBe("empty-stream")
    })

    it("returns the resumed stream when one is still available", async () => {
        const resumeExistingStream = vi.fn().mockResolvedValueOnce(makeTextStream("resumed-stream"))
        const ctx = createCtx()

        getResumableStreamContextMock.mockReturnValueOnce({
            resumeExistingStream
        })
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })
        ctx.runQuery
            .mockResolvedValueOnce({
                _id: "thread-1",
                authorId: "user-1"
            })
            .mockResolvedValueOnce([{ _id: "stream-1" }])

        const response = await chatGET(ctx, new Request("https://example.com/chat?chatId=thread-1"))

        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe("text/event-stream")
        await expect(response.text()).resolves.toBe("resumed-stream")
    })
})
