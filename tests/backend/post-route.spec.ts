import { beforeEach, describe, expect, it, vi } from "vitest"

const {
    buildPromptMock,
    createUIMessageStreamMock,
    dbMessagesToCoreMock,
    generateAndStoreImageMock,
    generateThreadNameMock,
    getGoogleAuthModeMock,
    getModelMock,
    getResumableStreamContextMock,
    getToolkitMock,
    getUserIdentityMock,
    manualStreamTransformMock,
    smoothStreamMock,
    stepCountIsMock,
    streamTextMock
} = vi.hoisted(() => ({
    buildPromptMock: vi.fn(),
    createUIMessageStreamMock: vi.fn(),
    dbMessagesToCoreMock: vi.fn(),
    generateAndStoreImageMock: vi.fn(),
    generateThreadNameMock: vi.fn(),
    getGoogleAuthModeMock: vi.fn(),
    getUserIdentityMock: vi.fn(),
    getModelMock: vi.fn(),
    getResumableStreamContextMock: vi.fn(),
    getToolkitMock: vi.fn(),
    manualStreamTransformMock: vi.fn(),
    smoothStreamMock: vi.fn(),
    stepCountIsMock: vi.fn(),
    streamTextMock: vi.fn()
}))

vi.mock("ai", () => ({
    JsonToSseTransformStream: class {
        readable: ReadableStream<string>
        writable: WritableStream<unknown>

        constructor() {
            const stream = new TransformStream<unknown, string>({
                transform(chunk, controller) {
                    controller.enqueue(`${JSON.stringify(chunk)}\n`)
                }
            })

            this.readable = stream.readable
            this.writable = stream.writable
        }
    },
    UI_MESSAGE_STREAM_HEADERS: {},
    createUIMessageStream: createUIMessageStreamMock,
    smoothStream: smoothStreamMock,
    stepCountIs: stepCountIsMock,
    streamText: streamTextMock
}))

vi.mock("../../convex/_generated/server", () => ({
    action: (config: unknown) => config,
    httpAction: (handler: unknown) => handler,
    internalMutation: (config: unknown) => config,
    internalQuery: (config: unknown) => config,
    mutation: (config: unknown) => config,
    query: (config: unknown) => config
}))

vi.mock("../../convex/_generated/api", () => ({
    internal: {
        credits: {
            recordCreditEventForMessage: "recordCreditEventForMessage"
        },
        messages: {
            getMessagesByThreadId: "getMessagesByThreadId",
            patchMessage: "patchMessage"
        },
        settings: {
            getUserSettingsInternal: "getUserSettingsInternal"
        },
        personas: {
            getThreadPersonaSnapshotInternal: "getThreadPersonaSnapshotInternal"
        },
        streams: {
            appendStreamId: "appendStreamId"
        },
        threads: {
            createThreadOrInsertMessages: "createThreadOrInsertMessages",
            updateThreadStreamingState: "updateThreadStreamingState"
        }
    }
}))

vi.mock("../../convex/attachments", () => ({
    r2: {
        getUrl: vi.fn()
    }
}))

vi.mock("../../convex/lib/identity", () => ({
    getUserIdentity: getUserIdentityMock
}))

vi.mock("../../convex/chat_http/get_model", () => ({
    getModel: getModelMock
}))

vi.mock("../../convex/lib/resumable_stream_context", () => ({
    getResumableStreamContext: getResumableStreamContextMock
}))

vi.mock("../../convex/lib/db_to_core_messages", () => ({
    dbMessagesToCore: dbMessagesToCoreMock
}))

vi.mock("../../convex/lib/toolkit", () => ({
    getToolkit: getToolkitMock
}))

vi.mock("../../convex/chat_http/generate_thread_name", () => ({
    generateThreadName: generateThreadNameMock
}))

vi.mock("../../convex/chat_http/image_generation", () => ({
    generateAndStoreImage: generateAndStoreImageMock
}))

vi.mock("../../convex/chat_http/manual_stream_transform", () => ({
    manualStreamTransform: manualStreamTransformMock
}))

vi.mock("../../convex/chat_http/prompt", () => ({
    buildPrompt: buildPromptMock
}))

vi.mock("../../convex/lib/google_provider", () => ({
    getGoogleAuthMode: getGoogleAuthModeMock
}))

vi.mock("../../convex/lib/models", () => ({
    MODELS_SHARED: []
}))

import { ChatError } from "@/lib/errors"
import { chatPOST } from "../../convex/chat_http/post.route"

const chatPOSTHandler = chatPOST as unknown as (
    ctx: {
        auth: Record<string, never>
        runMutation: ReturnType<typeof vi.fn>
        runQuery: ReturnType<typeof vi.fn>
    },
    request: Request
) => Promise<Response>

type ChatPostCtx = Parameters<typeof chatPOSTHandler>[0]

const createObjectStream = (chunks: unknown[]) =>
    new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(chunk)
            }
            controller.close()
        }
    })

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
        buildPromptMock.mockReset().mockReturnValue("system prompt")
        createUIMessageStreamMock.mockReset().mockImplementation(
            ({
                execute,
                onError
            }: {
                execute: (args: { writer: unknown }) => Promise<void>
                onError?: (error: unknown) => string
            }) =>
                new ReadableStream({
                    async start(controller) {
                        const mergeTasks: Promise<void>[] = []
                        const writer = {
                            write(chunk: unknown) {
                                controller.enqueue(chunk)
                            },
                            merge(stream: ReadableStream<unknown>) {
                                const mergeTask = (async () => {
                                    const reader = stream.getReader()
                                    while (true) {
                                        const result = await reader.read()
                                        if (result.done) break
                                        controller.enqueue(result.value)
                                    }
                                })()
                                mergeTasks.push(mergeTask)
                            }
                        }

                        try {
                            await execute({ writer })
                            await Promise.all(mergeTasks)
                            controller.close()
                        } catch (error) {
                            const errorText = onError?.(error) ?? "Stream error occurred"
                            controller.enqueue({ type: "error", errorText })
                            controller.close()
                        }
                    }
                })
        )
        dbMessagesToCoreMock.mockReset().mockResolvedValue([
            {
                role: "user",
                content: "hello from the user"
            }
        ])
        generateAndStoreImageMock.mockReset()
        generateThreadNameMock.mockReset().mockResolvedValue("hello thread")
        getGoogleAuthModeMock.mockReset().mockReturnValue("ai-studio")
        getUserIdentityMock.mockReset()
        getModelMock.mockReset()
        getResumableStreamContextMock.mockReset().mockReturnValue(null)
        getToolkitMock.mockReset().mockResolvedValue({
            web_search: {
                description: "Search"
            }
        })
        manualStreamTransformMock.mockReset().mockImplementation(
            (
                parts: Array<{ type: string; text?: string }>,
                totalTokenUsage: {
                    promptTokens: number
                    completionTokens: number
                    reasoningTokens: number
                    totalTokens: number
                    estimatedCostUsd?: number
                    estimatedPromptCostUsd?: number
                    estimatedCompletionCostUsd?: number
                },
                _uploadPromises: Promise<void>[],
                _userId: string,
                _ctx: unknown,
                _streamMetrics?: { firstVisibleAtMs?: number },
                options?: { onPartsChanged?: () => void }
            ) =>
                new TransformStream({
                    transform(
                        chunk: {
                            type: string
                            text?: string
                            usage?: {
                                inputTokens?: number
                                outputTokens?: number
                                outputTokenDetails?: { reasoningTokens?: number }
                                totalTokens?: number
                                raw?: {
                                    cost_details?: {
                                        upstream_inference_cost?: number
                                        upstream_inference_prompt_cost?: number
                                        upstream_inference_completions_cost?: number
                                    }
                                }
                            }
                        },
                        controller
                    ) {
                        if (chunk.type === "text-delta" && chunk.text) {
                            parts.push({
                                type: "text",
                                text: chunk.text
                            })
                            options?.onPartsChanged?.()
                        }

                        if (chunk.type === "finish-step") {
                            totalTokenUsage.promptTokens += chunk.usage?.inputTokens ?? 0
                            totalTokenUsage.completionTokens += chunk.usage?.outputTokens ?? 0
                            totalTokenUsage.reasoningTokens +=
                                chunk.usage?.outputTokenDetails?.reasoningTokens ?? 0
                            totalTokenUsage.totalTokens +=
                                chunk.usage?.totalTokens ??
                                (chunk.usage?.inputTokens ?? 0) + (chunk.usage?.outputTokens ?? 0)
                            totalTokenUsage.estimatedCostUsd =
                                (totalTokenUsage.estimatedCostUsd ?? 0) +
                                (chunk.usage?.raw?.cost_details?.upstream_inference_cost ?? 0)
                            totalTokenUsage.estimatedPromptCostUsd =
                                (totalTokenUsage.estimatedPromptCostUsd ?? 0) +
                                (chunk.usage?.raw?.cost_details?.upstream_inference_prompt_cost ??
                                    0)
                            totalTokenUsage.estimatedCompletionCostUsd =
                                (totalTokenUsage.estimatedCompletionCostUsd ?? 0) +
                                (chunk.usage?.raw?.cost_details
                                    ?.upstream_inference_completions_cost ?? 0)
                        }

                        controller.enqueue(chunk)
                    }
                })
        )
        smoothStreamMock.mockReset().mockReturnValue("smooth-transform")
        stepCountIsMock.mockReset().mockReturnValue("stop-after-100")
        streamTextMock.mockReset()
        vi.spyOn(console, "error").mockImplementation(() => {})
    })

    it("rejects an empty request body", async () => {
        const response = await chatPOSTHandler(
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
        const response = await chatPOSTHandler(createCtx(), createRequest("{not-json"))

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
            code: "bad_request:chat"
        })
    })

    it("rejects missing required fields", async () => {
        const response = await chatPOSTHandler(createCtx(), createRequest({ model: "shared-text" }))

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
            code: "bad_request:chat"
        })
    })

    it("rejects edit/retry requests without a thread id", async () => {
        const response = await chatPOSTHandler(
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

        const response = await chatPOSTHandler(
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

        const response = await chatPOSTHandler(
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
            abilities: [],
            registry: {
                models: {
                    "shared-text": {}
                }
            },
            availableToPickFor: "pro",
            prototypeCreditTier: "basic",
            prototypeCreditTierWithReasoning: undefined
        })

        const response = await chatPOSTHandler(
            createCtx(),
            createRequest({
                model: "shared-text",
                proposedNewAssistantId: "assistant-1",
                message: {
                    role: "user",
                    parts: [{ type: "text", text: "hello" }]
                },
                enabledTools: [],
                reasoningEffort: "off"
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
            abilities: [],
            registry: {
                models: {
                    "shared-text": {}
                }
            },
            prototypeCreditTier: "basic",
            prototypeCreditTierWithReasoning: undefined
        })

        const response = await chatPOSTHandler(
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

    it("streams a text response, patches the assistant message, and records credits on the happy path", async () => {
        const ctx = createCtx()
        ctx.runMutation.mockImplementation(async (name: string) => {
            switch (name) {
                case "createThreadOrInsertMessages":
                    return {
                        threadId: "thread-1",
                        assistantMessageId: "assistant-1",
                        assistantMessageConvexId: 42
                    }
                case "appendStreamId":
                    return "stream-1"
                case "updateThreadStreamingState":
                case "patchMessage":
                case "recordCreditEventForMessage":
                    return null
                default:
                    throw new Error(`Unexpected mutation: ${name}`)
            }
        })
        ctx.runQuery.mockImplementation(async (name: string) => {
            switch (name) {
                case "getMessagesByThreadId":
                    return [{ _id: "db-message-1" }]
                case "getUserSettingsInternal":
                    return {
                        mcpServers: []
                    }
                case "getThreadPersonaSnapshotInternal":
                    return null
                default:
                    throw new Error(`Unexpected query: ${name}`)
            }
        })

        const runtimeModel = { provider: "runtime-openai", modelType: "text" }
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1", creditPlan: "pro" })
        getModelMock.mockResolvedValueOnce({
            model: runtimeModel,
            modelId: "gpt-5.4-mini",
            modelName: "GPT 5.4 Mini",
            runtimeProvider: "openai",
            providerSource: "internal",
            abilities: ["function_calling", "effort_control"],
            registry: {
                models: {
                    "shared-text": {
                        maxTokens: 2048
                    }
                }
            },
            prototypeCreditTier: "basic",
            prototypeCreditTierWithReasoning: "pro"
        })
        manualStreamTransformMock.mockImplementationOnce(
            (
                parts: Array<{ type: string; text?: string }>,
                totalTokenUsage: {
                    promptTokens: number
                    completionTokens: number
                    reasoningTokens: number
                    totalTokens: number
                    estimatedCostUsd?: number
                    estimatedPromptCostUsd?: number
                    estimatedCompletionCostUsd?: number
                },
                _uploadPromises: Promise<void>[],
                _userId: string,
                _ctx: unknown,
                streamMetrics?: {
                    firstVisibleAtMs?: number
                }
            ) => {
                parts.push({
                    type: "text",
                    text: "Hello world"
                })
                totalTokenUsage.promptTokens = 12
                totalTokenUsage.completionTokens = 34
                totalTokenUsage.reasoningTokens = 5
                totalTokenUsage.totalTokens = 46
                totalTokenUsage.estimatedCostUsd = 0.001552
                totalTokenUsage.estimatedPromptCostUsd = 0.000757
                totalTokenUsage.estimatedCompletionCostUsd = 0.000795
                if (streamMetrics) {
                    streamMetrics.firstVisibleAtMs = Date.now()
                }

                return new TransformStream()
            }
        )
        streamTextMock.mockReturnValueOnce({
            fullStream: createObjectStream([
                { type: "text-start", id: "text-1" },
                { type: "text-delta", id: "text-1", text: "Hello world" },
                {
                    type: "finish-step",
                    finishReason: "stop",
                    usage: {
                        inputTokens: 12,
                        outputTokens: 34,
                        outputTokenDetails: {
                            reasoningTokens: 5
                        }
                    }
                },
                { type: "text-end", id: "text-1" }
            ]),
            finishReason: Promise.resolve("stop")
        })

        const response = await chatPOSTHandler(
            ctx,
            createRequest({
                model: "shared-text",
                proposedNewAssistantId: "assistant-1",
                message: {
                    role: "user",
                    parts: [{ type: "text", text: "hello" }]
                },
                enabledTools: ["web_search"],
                reasoningEffort: "medium"
            })
        )

        expect(response.status).toBe(200)
        const responseText = await response.text()

        expect(generateThreadNameMock).toHaveBeenCalledTimes(1)
        expect(buildPromptMock).toHaveBeenCalledWith(
            ["web_search"],
            {
                mcpServers: []
            },
            undefined
        )
        expect(getToolkitMock).toHaveBeenCalledWith(ctx, ["web_search"], {
            mcpServers: []
        })
        expect(stepCountIsMock).toHaveBeenCalledWith(100)
        expect(smoothStreamMock).toHaveBeenCalledTimes(1)
        expect(streamTextMock).toHaveBeenCalledWith(
            expect.objectContaining({
                model: runtimeModel,
                maxOutputTokens: 2048,
                stopWhen: "stop-after-100",
                experimental_transform: "smooth-transform",
                tools: {
                    web_search: {
                        description: "Search"
                    }
                },
                messages: [
                    {
                        role: "system",
                        content: "system prompt"
                    },
                    {
                        role: "user",
                        content: "hello from the user"
                    }
                ]
            })
        )

        expect(ctx.runMutation).toHaveBeenCalledWith("updateThreadStreamingState", {
            threadId: "thread-1",
            isLive: true,
            streamStartedAt: expect.any(Number),
            currentStreamId: "stream-1"
        })
        expect(ctx.runMutation).toHaveBeenCalledWith("patchMessage", {
            threadId: "thread-1",
            messageId: "assistant-1",
            parts: [
                {
                    type: "text",
                    text: "Hello world"
                }
            ],
            metadata: expect.objectContaining({
                modelId: "shared-text",
                modelName: "GPT 5.4 Mini",
                promptTokens: 12,
                completionTokens: 34,
                reasoningTokens: 5,
                totalTokens: 46,
                estimatedCostUsd: 0.001552,
                estimatedPromptCostUsd: 0.000757,
                estimatedCompletionCostUsd: 0.000795,
                creditProviderSource: "internal",
                creditFeature: "tool",
                creditBucket: "pro",
                creditUnits: 1,
                creditCounted: true,
                timeToFirstVisibleMs: expect.any(Number)
            })
        })
        expect(responseText).toContain('"totalTokens":46')
        expect(responseText).toContain('"estimatedCostUsd":0.001552')
        expect(responseText).toMatch(/"timeToFirstVisibleMs":\d+/)
        expect(ctx.runMutation).toHaveBeenCalledWith("recordCreditEventForMessage", {
            userId: "user-1",
            threadId: "thread-1",
            messageId: "assistant-1",
            messageKey: "42",
            modelId: "shared-text",
            providerSource: "internal",
            feature: "tool",
            bucket: "pro",
            units: 1,
            counted: true
        })
        expect(ctx.runMutation).toHaveBeenCalledWith("updateThreadStreamingState", {
            threadId: "thread-1",
            isLive: false,
            currentStreamId: undefined
        })
    })

    it("persists partial assistant parts before the final stream patch", async () => {
        const ctx = createCtx()
        ctx.runMutation.mockImplementation(async (name: string) => {
            switch (name) {
                case "createThreadOrInsertMessages":
                    return {
                        threadId: "thread-1",
                        assistantMessageId: "assistant-1",
                        assistantMessageConvexId: 42
                    }
                case "appendStreamId":
                    return "stream-1"
                case "updateThreadStreamingState":
                case "patchMessage":
                case "recordCreditEventForMessage":
                    return null
                default:
                    throw new Error(`Unexpected mutation: ${name}`)
            }
        })
        ctx.runQuery.mockImplementation(async (name: string) => {
            switch (name) {
                case "getMessagesByThreadId":
                    return [{ _id: "db-message-1" }]
                case "getUserSettingsInternal":
                    return {
                        mcpServers: []
                    }
                case "getThreadPersonaSnapshotInternal":
                    return null
                default:
                    throw new Error(`Unexpected query: ${name}`)
            }
        })

        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1", creditPlan: "pro" })
        getModelMock.mockResolvedValueOnce({
            model: { modelType: "text" },
            modelId: "gpt-5.4-mini",
            modelName: "GPT 5.4 Mini",
            runtimeProvider: "openai",
            providerSource: "internal",
            abilities: [],
            registry: {
                models: {
                    "shared-text": {}
                }
            },
            prototypeCreditTier: "basic",
            prototypeCreditTierWithReasoning: undefined
        })

        streamTextMock.mockReturnValueOnce({
            fullStream: createObjectStream([
                { type: "text-start", id: "text-1" },
                { type: "text-delta", id: "text-1", text: "Hello" },
                { type: "text-end", id: "text-1" }
            ]),
            finishReason: Promise.resolve("stop")
        })

        const response = await chatPOSTHandler(
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

        expect(response.status).toBe(200)
        await response.text()

        const patchCalls = ctx.runMutation.mock.calls.filter(([name]) => name === "patchMessage")
        const patchPayloads = patchCalls.map(([, payload]) => payload)
        const livePatch = patchPayloads.find(
            (payload) =>
                !("modelId" in ((payload as { metadata?: Record<string, unknown> }).metadata ?? {}))
        )
        const finalPatch = patchPayloads.find(
            (payload) =>
                "modelId" in ((payload as { metadata?: Record<string, unknown> }).metadata ?? {})
        )

        expect(patchCalls).toHaveLength(2)
        expect(livePatch).toEqual({
            threadId: "thread-1",
            messageId: "assistant-1",
            parts: [
                {
                    type: "text",
                    text: "Hello"
                }
            ],
            metadata: expect.objectContaining({
                serverDurationMs: expect.any(Number)
            })
        })
        expect((finalPatch as { threadId?: string } | undefined)?.threadId).toBe("thread-1")
        expect((finalPatch as { messageId?: string } | undefined)?.messageId).toBe("assistant-1")
        expect(
            (finalPatch as { parts?: Array<{ type?: string; text?: string }> } | undefined)?.parts
        ).toContainEqual({
            type: "text",
            text: "Hello"
        })
        expect(
            (finalPatch as { metadata?: { modelId?: string } } | undefined)?.metadata?.modelId
        ).toBe("shared-text")
    })

    it("wraps resumable SSE sources so upstream stream errors become terminal error events", async () => {
        const ctx = createCtx()
        ctx.runMutation.mockImplementation(async (name: string) => {
            switch (name) {
                case "createThreadOrInsertMessages":
                    return {
                        threadId: "thread-1",
                        assistantMessageId: "assistant-1",
                        assistantMessageConvexId: 42
                    }
                case "appendStreamId":
                    return "stream-1"
                default:
                    throw new Error(`Unexpected mutation: ${name}`)
            }
        })
        ctx.runQuery.mockImplementation(async (name: string) => {
            switch (name) {
                case "getMessagesByThreadId":
                    return [{ _id: "db-message-1" }]
                case "getUserSettingsInternal":
                    return {
                        mcpServers: []
                    }
                case "getThreadPersonaSnapshotInternal":
                    return null
                default:
                    throw new Error(`Unexpected query: ${name}`)
            }
        })

        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1", creditPlan: "pro" })
        getModelMock.mockResolvedValueOnce({
            model: { modelType: "text" },
            modelId: "gpt-5.4-mini",
            modelName: "GPT 5.4 Mini",
            runtimeProvider: "openai",
            providerSource: "internal",
            abilities: [],
            registry: {
                models: {
                    "shared-text": {}
                }
            },
            prototypeCreditTier: "basic",
            prototypeCreditTierWithReasoning: undefined
        })
        getResumableStreamContextMock.mockReturnValueOnce({
            resumableStream: vi.fn(
                async (_streamId: string, makeStream: () => ReadableStream<string>) => makeStream()
            )
        })
        createUIMessageStreamMock.mockImplementationOnce(
            () =>
                new ReadableStream({
                    start(controller) {
                        controller.enqueue({
                            type: "start",
                            messageId: "assistant-1"
                        })
                        controller.error(new Error("upstream broke"))
                    }
                })
        )

        const response = await chatPOSTHandler(
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

        expect(response.status).toBe(200)
        await expect(response.text()).resolves.toContain(
            '"type":"error","errorText":"Stream error occurred"'
        )
    })

    it("enables OpenRouter reasoning for toggle-only models when thinking is selected", async () => {
        const ctx = createCtx()
        ctx.runMutation.mockImplementation(async (name: string) => {
            switch (name) {
                case "createThreadOrInsertMessages":
                    return {
                        threadId: "thread-1",
                        assistantMessageId: "assistant-1",
                        assistantMessageConvexId: 42
                    }
                case "appendStreamId":
                    return "stream-1"
                case "updateThreadStreamingState":
                case "patchMessage":
                case "recordCreditEventForMessage":
                    return null
                default:
                    throw new Error(`Unexpected mutation: ${name}`)
            }
        })
        ctx.runQuery.mockImplementation(async (name: string) => {
            switch (name) {
                case "getMessagesByThreadId":
                    return [{ _id: "db-message-1" }]
                case "getUserSettingsInternal":
                    return {
                        mcpServers: []
                    }
                case "getThreadPersonaSnapshotInternal":
                    return null
                default:
                    throw new Error(`Unexpected query: ${name}`)
            }
        })

        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1", creditPlan: "pro" })
        getModelMock.mockResolvedValueOnce({
            model: { provider: "runtime-openrouter", modelType: "text" },
            modelId: "deepseek-v3.2",
            modelName: "DeepSeek V3.2",
            runtimeProvider: "openrouter",
            providerSource: "openrouter",
            abilities: ["reasoning", "function_calling"],
            registry: {
                models: {
                    "deepseek-v3.2": {
                        abilities: ["reasoning", "function_calling"],
                        supportsDisablingReasoning: true
                    }
                }
            },
            prototypeCreditTier: "basic",
            prototypeCreditTierWithReasoning: undefined
        })
        manualStreamTransformMock.mockImplementationOnce(() => new TransformStream())
        streamTextMock.mockReturnValueOnce({
            fullStream: createObjectStream([]),
            finishReason: Promise.resolve("stop")
        })

        const response = await chatPOSTHandler(
            ctx,
            createRequest({
                model: "deepseek-v3.2",
                proposedNewAssistantId: "assistant-1",
                message: {
                    role: "user",
                    parts: [{ type: "text", text: "hello" }]
                },
                enabledTools: [],
                reasoningEffort: "medium"
            })
        )

        expect(response.status).toBe(200)
        await response.text()

        expect(streamTextMock).toHaveBeenCalledWith(
            expect.objectContaining({
                providerOptions: expect.objectContaining({
                    openrouter: expect.objectContaining({
                        reasoning: {
                            enabled: true
                        },
                        extraBody: expect.objectContaining({
                            include_reasoning: true
                        })
                    })
                })
            })
        )
    })
})
