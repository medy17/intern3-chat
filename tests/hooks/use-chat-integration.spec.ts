// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
    backendToUiMessagesMock,
    browserEnvMock,
    nanoidMock,
    resolveJwtTokenMock,
    useAutoResumeMock,
    useChatMock,
    useConvexQueryMock,
    useTokenMock
} = vi.hoisted(() => ({
    backendToUiMessagesMock: vi.fn(),
    browserEnvMock: vi.fn(),
    nanoidMock: vi.fn(),
    resolveJwtTokenMock: vi.fn(),
    useAutoResumeMock: vi.fn(),
    useChatMock: vi.fn(),
    useConvexQueryMock: vi.fn(),
    useTokenMock: vi.fn()
}))

type TransportConfig = {
    prepareSendMessagesRequest: (request: {
        body: Record<string, unknown>
        messages: Array<Record<string, unknown>>
    }) => Promise<unknown>
    prepareReconnectToStreamRequest: (request: {
        api: string
        id: string
    }) => Promise<unknown>
}
type UseChatOptions = {
    id?: string
    transport?: TransportConfig
    onFinish?: () => void
    generateId?: () => string
}
type AutoResumeInvocation = {
    autoResume?: boolean
    threadId?: string
    experimental_resume?: () => Promise<void> | void
}

const transportConfigs: TransportConfig[] = []
let latestUseChatOptions: UseChatOptions | undefined
let latestAutoResumeProps: AutoResumeInvocation | undefined

vi.mock("@/convex/_generated/api", () => ({
    api: {
        threads: {
            getThread: "getThread",
            getThreadMessages: "getThreadMessages",
            getSharedThread: "getSharedThread"
        }
    }
}))

vi.mock("@/convex/lib/backend_to_ui_messages", () => ({
    backendToUiMessages: backendToUiMessagesMock
}))

vi.mock("@/hooks/auth-hooks", () => ({
    useToken: useTokenMock
}))

vi.mock("@/hooks/use-auto-resume", () => ({
    useAutoResume: useAutoResumeMock
}))

vi.mock("@/lib/auth-token", () => ({
    resolveJwtToken: resolveJwtTokenMock
}))

vi.mock("@/lib/browser-env", () => ({
    browserEnv: browserEnvMock,
    optionalBrowserEnv: vi.fn(() => undefined)
}))

vi.mock("@ai-sdk/react", () => ({
    useChat: useChatMock
}))

vi.mock("ai", () => ({
    DefaultChatTransport: class {
        constructor(config: TransportConfig) {
            transportConfigs.push(config)
        }
    }
}))

vi.mock("convex-helpers/react/cache", () => ({
    useQuery: useConvexQueryMock
}))

vi.mock("nanoid", () => ({
    nanoid: nanoidMock
}))

import { useChatIntegration } from "@/hooks/use-chat-integration"
import { useChatStore } from "@/lib/chat-store"
import { type ModelStore, useModelStore } from "@/lib/model-store"

type IntegrationProps = Parameters<typeof useChatIntegration>[0]

const resetChatStore = () => {
    useChatStore.setState({
        threadId: undefined,
        uploadedFiles: [],
        rerenderTrigger: "rerender-1",
        lastProcessedDataIndex: -1,
        shouldUpdateQuery: false,
        skipNextDataCheck: true,
        attachedStreamIds: {},
        pendingStreams: {},
        targetFromMessageId: undefined,
        targetMode: "normal",
        uploading: false
    })
}

const resetModelStore = () => {
    useModelStore.setState({
        selectedModel: "model-default",
        enabledTools: ["web_search"] as ModelStore["enabledTools"],
        selectedImageSize: "1024x1024" as ModelStore["selectedImageSize"],
        selectedImageResolution: "high" as ModelStore["selectedImageResolution"],
        reasoningEffort: "high",
        mcpOverrides: {},
        defaultMcpOverrides: {}
    })
}

describe("useChatIntegration", () => {
    beforeEach(() => {
        transportConfigs.length = 0
        latestUseChatOptions = undefined
        latestAutoResumeProps = undefined

        resetChatStore()
        resetModelStore()

        backendToUiMessagesMock.mockReset()
        browserEnvMock.mockReset()
        nanoidMock.mockReset()
        resolveJwtTokenMock.mockReset()
        useAutoResumeMock.mockReset()
        useChatMock.mockReset()
        useConvexQueryMock.mockReset()
        useTokenMock.mockReset()
        vi.spyOn(console, "log").mockImplementation(() => {})

        browserEnvMock.mockReturnValue("https://convex.example")
        resolveJwtTokenMock.mockResolvedValue("jwt-1")
        useTokenMock.mockReturnValue({ token: "token-1" })
        backendToUiMessagesMock.mockImplementation((messages: unknown) => messages)
        useAutoResumeMock.mockImplementation((props: AutoResumeInvocation) => {
            latestAutoResumeProps = props
        })
    })

    it("builds send and reconnect requests from the latest thread and model state", async () => {
        const chatHelpers = {
            status: "idle",
            messages: [],
            setMessages: vi.fn(),
            resumeStream: vi.fn()
        }
        const queryResults: Record<string, unknown> = {
            getThreadMessages: [
                {
                    id: "backend-message-1",
                    role: "user",
                    parts: [{ type: "text", text: "hi" }]
                }
            ],
            getThread: {
                _id: "thread-1",
                isLive: true,
                currentStreamId: "stream-1"
            }
        }

        useConvexQueryMock.mockImplementation((query: string) => queryResults[query])
        useChatMock.mockImplementation((options: UseChatOptions) => {
            latestUseChatOptions = options
            return chatHelpers
        })
        nanoidMock.mockReturnValueOnce("assistant-1").mockReturnValueOnce("generated-2")
        useModelStore.setState({
            selectedModel: "model-1",
            enabledTools: ["web_search", "mcp"] as ModelStore["enabledTools"],
            selectedImageSize: "1536x1024" as ModelStore["selectedImageSize"],
            selectedImageResolution: "medium" as ModelStore["selectedImageResolution"],
            reasoningEffort: "medium",
            defaultMcpOverrides: { alpha: true },
            mcpOverrides: {
                "thread-1": {
                    beta: false
                }
            }
        })
        useChatStore.setState({
            shouldUpdateQuery: true
        })

        renderHook(() =>
            useChatIntegration({
                threadId: "thread-1",
                folderId: "folder-1" as IntegrationProps["folderId"]
            })
        )

        const transport = transportConfigs[0]
        const sendRequest = await transport.prepareSendMessagesRequest({
            body: {
                customValue: true,
                modelIdOverride: "model-override"
            },
            messages: [
                {
                    id: "user-message-1",
                    role: "user",
                    parts: [
                        {
                            type: "file",
                            url: "https://convex.example/r2?key=file-1",
                            mediaType: "text/plain",
                            filename: "notes.txt"
                        },
                        {
                            type: "text",
                            text: "hello"
                        }
                    ]
                }
            ]
        })

        expect(sendRequest).toEqual({
            headers: {
                authorization: "Bearer jwt-1"
            },
            body: {
                customValue: true,
                modelIdOverride: "model-override",
                id: "thread-1",
                proposedNewAssistantId: "assistant-1",
                model: "model-override",
                message: {
                    parts: [
                        {
                            type: "file",
                            data: "file-1",
                            filename: "notes.txt",
                            mimeType: "text/plain"
                        },
                        {
                            type: "text",
                            text: "hello"
                        }
                    ],
                    role: "user",
                    messageId: "user-message-1"
                },
                enabledTools: ["web_search", "mcp"],
                imageSize: "1536x1024",
                imageResolution: "medium",
                folderId: "folder-1",
                reasoningEffort: "medium",
                mcpOverrides: {
                    alpha: true,
                    beta: false
                }
            }
        })
        expect(useChatStore.getState().pendingStreams["thread-1"]).toBe(true)
        expect(latestUseChatOptions?.generateId).toBeDefined()
        expect(latestUseChatOptions!.generateId!()).toBe("assistant-1")
        expect(latestUseChatOptions!.generateId!()).toBe("generated-2")

        const reconnectRequest = await transport.prepareReconnectToStreamRequest({
            api: "https://convex.example/chat",
            id: "fallback-thread"
        })

        expect(reconnectRequest).toEqual({
            api: "https://convex.example/chat?chatId=thread-1",
            headers: {
                authorization: "Bearer jwt-1"
            }
        })

        act(() => {
            latestUseChatOptions?.onFinish?.()
        })

        expect(useChatStore.getState().shouldUpdateQuery).toBe(false)
    })

    it("uses shared thread data without creating a transport", () => {
        const sharedThread = {
            _id: "shared-1",
            messages: [{ id: "backend-shared-1", role: "assistant", parts: [] }]
        }

        useConvexQueryMock.mockImplementation((query: string) => {
            if (query === "getSharedThread") return sharedThread
            return undefined
        })
        useChatMock.mockImplementation((options: UseChatOptions) => {
            latestUseChatOptions = options
            return {
                status: "idle",
                messages: [],
                setMessages: vi.fn(),
                resumeStream: vi.fn()
            }
        })

        const { result } = renderHook(() =>
            useChatIntegration({
                threadId: undefined,
                sharedThreadId: "shared-1",
                isShared: true
            })
        )

        expect(transportConfigs).toHaveLength(0)
        expect(backendToUiMessagesMock).toHaveBeenCalledWith([
            {
                id: "backend-shared-1",
                role: "assistant",
                parts: [],
                threadId: "shared-1"
            }
        ])
        expect(latestUseChatOptions?.id).toBe("shared_shared-1")
        expect(latestUseChatOptions?.transport).toBeUndefined()
        expect(latestAutoResumeProps).toMatchObject({
            autoResume: false,
            threadId: undefined
        })
        expect(result.current.thread).toEqual(sharedThread)
    })

    it("restores backend messages before resuming when the UI buffer is empty", async () => {
        const initialMessages = [
            {
                id: "ui-message-1",
                role: "assistant",
                parts: []
            }
        ]
        const setMessages = vi.fn()
        const resumeStream = vi.fn()

        backendToUiMessagesMock.mockReturnValue(initialMessages)
        useConvexQueryMock.mockImplementation((query: string) => {
            if (query === "getThreadMessages") {
                return [{ id: "backend-message-1", role: "assistant", parts: [] }]
            }

            if (query === "getThread") {
                return {
                    _id: "thread-1",
                    isLive: true,
                    currentStreamId: "stream-1"
                }
            }

            return undefined
        })
        useChatMock.mockImplementation(() => ({
            status: "idle",
            messages: [],
            setMessages,
            resumeStream
        }))

        renderHook(() =>
            useChatIntegration({
                threadId: "thread-1"
            })
        )

        setMessages.mockClear()

        await act(async () => {
            await latestAutoResumeProps?.experimental_resume?.()
        })

        expect(setMessages).toHaveBeenCalledWith(initialMessages)
        expect(resumeStream).toHaveBeenCalledTimes(1)
    })

    it("does not resume when persisted assistant content is already available", async () => {
        const initialMessages = [
            {
                id: "ui-message-1",
                role: "assistant",
                parts: [{ type: "text", text: "partial reply" }]
            }
        ]
        const setMessages = vi.fn()
        const resumeStream = vi.fn()

        backendToUiMessagesMock.mockReturnValue(initialMessages)
        useConvexQueryMock.mockImplementation((query: string) => {
            if (query === "getThreadMessages") {
                return [{ id: "backend-message-1", role: "assistant", parts: [] }]
            }

            if (query === "getThread") {
                return {
                    _id: "thread-1",
                    isLive: true,
                    currentStreamId: "stream-1"
                }
            }

            return undefined
        })
        useChatMock.mockImplementation(() => ({
            status: "idle",
            messages: [],
            setMessages,
            resumeStream
        }))

        renderHook(() =>
            useChatIntegration({
                threadId: "thread-1"
            })
        )

        setMessages.mockClear()

        await act(async () => {
            await latestAutoResumeProps?.experimental_resume?.()
        })

        expect(setMessages).toHaveBeenCalledWith(initialMessages)
        expect(resumeStream).not.toHaveBeenCalled()
    })

    it("hydrates newer persisted live assistant content into a stale local buffer", () => {
        const emptyAssistantMessage = [
            {
                id: "assistant-1",
                role: "assistant",
                parts: []
            }
        ]
        const partialAssistantMessage = [
            {
                id: "assistant-1",
                role: "assistant",
                parts: [{ type: "text", text: "Partial reply" }]
            }
        ]
        const setMessages = vi.fn()
        const queryResults: Record<string, unknown> = {
            getThreadMessages: [{ id: "backend-message-1", role: "assistant", parts: [] }],
            getThread: {
                _id: "thread-1",
                isLive: true,
                currentStreamId: "stream-1"
            }
        }

        backendToUiMessagesMock.mockImplementation((messages: unknown) => {
            const typedMessages = messages as Array<{ parts?: Array<{ text?: string }> }>
            return typedMessages[0]?.parts?.[0]?.text
                ? partialAssistantMessage
                : emptyAssistantMessage
        })
        useConvexQueryMock.mockImplementation((query: string) => queryResults[query])
        useChatMock.mockImplementation(() => ({
            status: "streaming",
            messages: emptyAssistantMessage,
            setMessages,
            resumeStream: vi.fn()
        }))

        const { rerender } = renderHook(() =>
            useChatIntegration({
                threadId: "thread-1"
            })
        )

        setMessages.mockClear()
        queryResults.getThreadMessages = [
            {
                id: "backend-message-1",
                role: "assistant",
                parts: [{ type: "text", text: "Partial reply" }]
            }
        ]

        rerender()

        expect(setMessages).toHaveBeenCalledWith(partialAssistantMessage)
    })

    it("adopts remote retry truncation when the backend thread diverges while idle", () => {
        const staleLocalMessages = [
            {
                id: "user-1",
                role: "user",
                parts: [{ type: "text", text: "before" }]
            },
            {
                id: "assistant-1",
                role: "assistant",
                parts: [{ type: "text", text: "old answer" }]
            },
            {
                id: "user-2",
                role: "user",
                parts: [{ type: "text", text: "later prompt" }]
            }
        ]
        const truncatedBackendMessages = [
            {
                id: "user-1",
                role: "user",
                parts: [{ type: "text", text: "before" }]
            },
            {
                id: "assistant-1",
                role: "assistant",
                parts: []
            }
        ]
        const setMessages = vi.fn()
        const queryResults: Record<string, unknown> = {
            getThreadMessages: [
                { id: "backend-user-1", role: "user", parts: [{ type: "text", text: "before" }] },
                { id: "backend-assistant-1", role: "assistant", parts: [] }
            ],
            getThread: {
                _id: "thread-1",
                isLive: false,
                currentStreamId: undefined
            }
        }

        backendToUiMessagesMock.mockReturnValue(truncatedBackendMessages)
        useConvexQueryMock.mockImplementation((query: string) => queryResults[query])
        useChatMock.mockImplementation(() => ({
            status: "idle",
            messages: staleLocalMessages,
            setMessages,
            resumeStream: vi.fn()
        }))

        renderHook(() =>
            useChatIntegration({
                threadId: "thread-1"
            })
        )

        expect(setMessages).toHaveBeenCalledWith(truncatedBackendMessages)
    })

    it("does not overwrite locally submitted messages with an older backend snapshot", () => {
        const localPendingMessages = [
            {
                id: "user-1",
                role: "user",
                parts: [{ type: "text", text: "new prompt" }]
            }
        ]
        const olderBackendMessages = [
            {
                id: "assistant-old",
                role: "assistant",
                parts: [{ type: "text", text: "older answer" }]
            }
        ]
        const setMessages = vi.fn()
        const queryResults: Record<string, unknown> = {
            getThreadMessages: [{ id: "backend-old", role: "assistant", parts: [] }],
            getThread: {
                _id: "thread-1",
                isLive: true,
                currentStreamId: "stream-1"
            }
        }

        backendToUiMessagesMock.mockReturnValue(olderBackendMessages)
        useConvexQueryMock.mockImplementation((query: string) => queryResults[query])
        useChatMock.mockImplementation(() => ({
            status: "submitted",
            messages: localPendingMessages,
            setMessages,
            resumeStream: vi.fn()
        }))

        const { rerender } = renderHook(() =>
            useChatIntegration({
                threadId: "thread-1"
            })
        )

        setMessages.mockClear()
        queryResults.getThreadMessages = [{ id: "backend-older", role: "assistant", parts: [] }]
        rerender()

        expect(setMessages).not.toHaveBeenCalledWith(olderBackendMessages)
    })
})
