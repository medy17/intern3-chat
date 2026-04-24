// @vitest-environment jsdom

import { renderHook } from "@testing-library/react"
import type { FileUIPart, UIMessage } from "ai"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { browserEnvMock, deleteFileMutationMock, nanoidMock, useMutationMock } = vi.hoisted(() => ({
    browserEnvMock: vi.fn(),
    deleteFileMutationMock: vi.fn(),
    nanoidMock: vi.fn(),
    useMutationMock: vi.fn()
}))

vi.mock("convex/react", () => ({
    useMutation: useMutationMock
}))

vi.mock("nanoid", () => ({
    nanoid: nanoidMock
}))

vi.mock("@/convex/_generated/api", () => ({
    api: {
        attachments: {
            deleteFile: "deleteFile"
        }
    }
}))

vi.mock("@/lib/browser-env", () => ({
    browserEnv: browserEnvMock,
    optionalBrowserEnv: vi.fn(() => undefined)
}))

import { useChatActions } from "@/hooks/use-chat-actions"
import { useChatStore } from "@/lib/chat-store"

type TestMessage = UIMessage

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
        manuallyStoppedThreads: {},
        targetFromMessageId: undefined,
        targetMode: "normal",
        uploading: false
    })
}

describe("useChatActions", () => {
    beforeEach(() => {
        resetChatStore()
        browserEnvMock.mockReset()
        deleteFileMutationMock.mockReset()
        nanoidMock.mockReset()
        useMutationMock.mockReset()
        vi.spyOn(console, "error").mockImplementation(() => {})
        vi.spyOn(console, "log").mockImplementation(() => {})

        browserEnvMock.mockReturnValue("https://convex.example")
        nanoidMock.mockReturnValue("generated-message-id")
        useMutationMock.mockReturnValue(deleteFileMutationMock)
        deleteFileMutationMock.mockResolvedValue(undefined)
    })

    it("stops the active stream instead of sending a new message while streaming", () => {
        const sendMessage = vi.fn()
        const stop = vi.fn()

        const { result } = renderHook(() =>
            useChatActions({
                threadId: "thread-1",
                chat: {
                    status: "streaming",
                    sendMessage,
                    stop,
                    messages: [],
                    setMessages: vi.fn(),
                    regenerate: vi.fn()
                }
            })
        )

        result.current.handleInputSubmit("hello")

        expect(stop).toHaveBeenCalledTimes(1)
        expect(sendMessage).not.toHaveBeenCalled()
        expect(useChatStore.getState().pendingStreams["thread-1"]).toBe(false)
        expect(useChatStore.getState().manuallyStoppedThreads["thread-1"]).toBe(true)
    })

    it("sends trimmed input plus uploaded files and clears the store", () => {
        const sendMessage = vi.fn()

        useChatStore.getState().setUploadedFiles([
            {
                key: "file-1",
                fileName: "notes.txt",
                fileType: "text/plain",
                fileSize: 10,
                uploadedAt: 1
            }
        ])

        const { result } = renderHook(() =>
            useChatActions({
                threadId: "thread-1",
                chat: {
                    status: "idle",
                    sendMessage,
                    stop: vi.fn(),
                    messages: [],
                    setMessages: vi.fn(),
                    regenerate: vi.fn()
                }
            })
        )

        result.current.handleInputSubmit("  hello world  ")

        expect(sendMessage).toHaveBeenCalledWith({
            id: "generated-message-id",
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
                    text: "hello world"
                }
            ]
        })
        expect(useChatStore.getState().pendingStreams["thread-1"]).toBe(true)
        expect(useChatStore.getState().manuallyStoppedThreads["thread-1"]).toBe(false)
        expect(useChatStore.getState().uploadedFiles).toEqual([])
    })

    it("truncates messages and regenerates from the selected retry point", () => {
        const setMessages = vi.fn()
        const regenerate = vi.fn()
        const messages: TestMessage[] = [
            { id: "m1", role: "user", parts: [] },
            { id: "m2", role: "assistant", parts: [] },
            { id: "m3", role: "user", parts: [] }
        ]

        useChatStore.setState({
            targetFromMessageId: "old-target",
            targetMode: "edit"
        })

        const { result } = renderHook(() =>
            useChatActions({
                threadId: "thread-1",
                chat: {
                    status: "idle",
                    sendMessage: vi.fn(),
                    stop: vi.fn(),
                    messages,
                    setMessages,
                    regenerate
                }
            })
        )

        result.current.handleRetry(messages[1], "model-override")

        expect(setMessages).toHaveBeenCalledWith(messages.slice(0, 2))
        expect(useChatStore.getState().pendingStreams["thread-1"]).toBe(true)
        expect(useChatStore.getState().manuallyStoppedThreads["thread-1"]).toBe(false)
        expect(useChatStore.getState().targetFromMessageId).toBeUndefined()
        expect(useChatStore.getState().targetMode).toBe("normal")
        expect(regenerate).toHaveBeenCalledWith({
            messageId: "m2",
            body: {
                targetMode: "retry",
                targetFromMessageId: "m2",
                modelIdOverride: "model-override"
            }
        })
    })

    it("updates edited messages and deletes removed attachments before regenerating", async () => {
        const setMessages = vi.fn()
        const regenerate = vi.fn()
        const messages: TestMessage[] = [
            { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
            {
                id: "m2",
                role: "user",
                parts: [
                    {
                        type: "file",
                        url: "https://convex.example/r2?key=file-1",
                        mediaType: "text/plain",
                        filename: "notes.txt"
                    },
                    { type: "text", text: "before" }
                ]
            },
            { id: "m3", role: "assistant", parts: [{ type: "text", text: "after" }] }
        ]

        const remainingFileParts: FileUIPart[] = [
            {
                type: "file",
                url: "https://convex.example/r2?key=file-2",
                mediaType: "text/plain",
                filename: "kept.txt"
            }
        ]

        const { result } = renderHook(() =>
            useChatActions({
                threadId: "thread-1",
                chat: {
                    status: "idle",
                    sendMessage: vi.fn(),
                    stop: vi.fn(),
                    messages,
                    setMessages,
                    regenerate
                }
            })
        )

        result.current.handleEditAndRetry("m2", "after edit", remainingFileParts, [
            "https://convex.example/r2?key=file-1",
            "not-a-url"
        ])

        expect(deleteFileMutationMock).toHaveBeenCalledWith({
            key: "file-1"
        })
        expect(useChatStore.getState().pendingStreams["thread-1"]).toBe(true)
        expect(useChatStore.getState().manuallyStoppedThreads["thread-1"]).toBe(false)
        expect(setMessages).toHaveBeenCalledWith([
            messages[0],
            expect.objectContaining({
                parts: [
                    ...remainingFileParts,
                    {
                        type: "text",
                        text: "after edit"
                    }
                ]
            })
        ])
        expect(regenerate).toHaveBeenCalledWith({
            messageId: "m2",
            body: {
                targetMode: "edit",
                targetFromMessageId: "m2"
            }
        })
    })
})
