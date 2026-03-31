import { beforeEach, describe, expect, it, vi } from "vitest"

const { getUserIdentityMock, getModelMock } = vi.hoisted(() => ({
    getUserIdentityMock: vi.fn(),
    getModelMock: vi.fn()
}))

vi.mock("ai", () => ({
    JsonToSseTransformStream: class {},
    UI_MESSAGE_STREAM_HEADERS: {},
    createUIMessageStream: vi.fn(),
    smoothStream: vi.fn(),
    stepCountIs: vi.fn(),
    streamText: vi.fn()
}))

vi.mock("../../convex/_generated/server", () => ({
    httpAction: (handler: unknown) => handler
}))

vi.mock("../../convex/_generated/api", () => ({
    internal: {
        threads: {
            createThreadOrInsertMessages: "createThreadOrInsertMessages"
        }
    }
}))

vi.mock("../../convex/lib/identity", () => ({
    getUserIdentity: getUserIdentityMock
}))

vi.mock("../../convex/chat_http/get_model", () => ({
    getModel: getModelMock
}))

vi.mock("../../convex/lib/resumable_stream_context", () => ({
    getResumableStreamContext: vi.fn()
}))

vi.mock("../../convex/lib/db_to_core_messages", () => ({
    dbMessagesToCore: vi.fn()
}))

vi.mock("../../convex/lib/toolkit", () => ({
    getToolkit: vi.fn()
}))

vi.mock("../../convex/chat_http/generate_thread_name", () => ({
    generateThreadName: vi.fn()
}))

vi.mock("../../convex/chat_http/image_generation", () => ({
    generateAndStoreImage: vi.fn()
}))

vi.mock("../../convex/chat_http/manual_stream_transform", () => ({
    manualStreamTransform: vi.fn()
}))

vi.mock("../../convex/chat_http/prompt", () => ({
    buildPrompt: vi.fn()
}))

vi.mock("../../convex/lib/google_provider", () => ({
    getGoogleAuthMode: vi.fn()
}))

vi.mock("../../convex/lib/models", () => ({
    MODELS_SHARED: []
}))

import { ChatError } from "@/lib/errors"
import { chatPOST } from "../../convex/chat_http/post.route"

type ChatPostCtx = Parameters<typeof chatPOST>[0]

const createRequest = (body: unknown) =>
    new Request("https://example.com/chat", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body)
    })

const createCtx = () =>
    ({
        auth: {},
        runMutation: vi.fn(),
        runQuery: vi.fn()
    }) as ChatPostCtx

describe("chatPOST", () => {
    beforeEach(() => {
        getUserIdentityMock.mockReset()
        getModelMock.mockReset()
        vi.spyOn(console, "error").mockImplementation(() => {})
    })

    it("rejects an empty request body", async () => {
        const response = await chatPOST(
            createCtx(),
            new Request("https://example.com/chat", {
                method: "POST",
                body: "   "
            })
        )

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
            code: "bad_request:chat"
        })
    })

    it("rejects invalid JSON payloads", async () => {
        const response = await chatPOST(createCtx(), createRequest("{not-json"))

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
            code: "bad_request:chat"
        })
    })

    it("rejects missing required fields", async () => {
        const response = await chatPOST(createCtx(), createRequest({ model: "shared-text" }))

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
            code: "bad_request:chat"
        })
    })

    it("rejects edit/retry requests without a thread id", async () => {
        const response = await chatPOST(
            createCtx(),
            createRequest({
                model: "shared-text",
                proposedNewAssistantId: "assistant-1",
                message: {
                    role: "user",
                    parts: [{ type: "text", text: "hello" }]
                },
                enabledTools: [],
                targetFromMessageId: "msg-1"
            })
        )

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
            code: "bad_request:chat"
        })
    })

    it("rejects unauthorized users before model resolution", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ error: "Unauthorized" })

        const response = await chatPOST(
            createCtx(),
            createRequest({
                model: "shared-text",
                proposedNewAssistantId: "assistant-1",
                message: {
                    role: "user",
                    parts: [{ type: "text", text: "hello" }]
                },
                enabledTools: []
            })
        )

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toMatchObject({
            code: "unauthorized:chat"
        })
        expect(getModelMock).not.toHaveBeenCalled()
    })

    it("forwards model-resolution errors", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1", creditPlan: "pro" })
        getModelMock.mockResolvedValueOnce(new ChatError("bad_model:api"))

        const response = await chatPOST(
            createCtx(),
            createRequest({
                model: "missing-model",
                proposedNewAssistantId: "assistant-1",
                message: {
                    role: "user",
                    parts: [{ type: "text", text: "hello" }]
                },
                enabledTools: []
            })
        )

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toMatchObject({
            code: "bad_model:api"
        })
    })

    it("rejects free users when the selected model requires pro", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1", creditPlan: "free" })
        getModelMock.mockResolvedValueOnce({
            model: { modelType: "text" },
            modelName: "Shared Text",
            providerSource: "internal",
            registry: {
                models: {
                    "shared-text": {}
                }
            },
            prototypeCreditTier: "basic",
            prototypeCreditTierWithReasoning: "pro"
        })

        const response = await chatPOST(
            createCtx(),
            createRequest({
                model: "shared-text",
                proposedNewAssistantId: "assistant-1",
                message: {
                    role: "user",
                    parts: [{ type: "text", text: "hello" }]
                },
                enabledTools: []
            })
        )

        expect(response.status).toBe(403)
        await expect(response.json()).resolves.toMatchObject({
            code: "forbidden:chat",
            cause: "Pro plan required for the selected model."
        })
    })

    it("returns bad_request when message creation fails before streaming begins", async () => {
        const ctx = createCtx()
        ctx.runMutation.mockRejectedValueOnce(new Error("db failure"))

        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1", creditPlan: "pro" })
        getModelMock.mockResolvedValueOnce({
            model: { modelType: "text" },
            modelName: "Shared Text",
            providerSource: "internal",
            registry: {
                models: {
                    "shared-text": {}
                }
            },
            prototypeCreditTier: "basic",
            prototypeCreditTierWithReasoning: undefined
        })

        const response = await chatPOST(
            ctx,
            createRequest({
                model: "shared-text",
                proposedNewAssistantId: "assistant-1",
                message: {
                    role: "user",
                    parts: [{ type: "text", text: "hello" }]
                },
                enabledTools: []
            })
        )

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
            code: "bad_request:chat"
        })
    })
})
