// @vitest-environment jsdom

import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { useNavigateMock } = vi.hoisted(() => ({
    useNavigateMock: vi.fn()
}))

vi.mock("@tanstack/react-router", () => ({
    useNavigate: useNavigateMock
}))

import { useChatDataProcessor } from "@/hooks/use-chat-data-processor"
import { useChatStore } from "@/lib/chat-store"

type ProcessorMessages = Parameters<typeof useChatDataProcessor>[0]["messages"]

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
        uploading: false,
        selectedPersona: { source: "default" }
    })
}

describe("useChatDataProcessor", () => {
    beforeEach(() => {
        resetChatStore()
        useNavigateMock.mockReset()
        vi.spyOn(console, "log").mockImplementation(() => {})
    })

    it("hydrates thread and stream metadata into the real chat store", () => {
        const navigate = vi.fn()
        useNavigateMock.mockReturnValue(navigate)

        Object.defineProperty(window, "location", {
            configurable: true,
            value: {
                pathname: "/thread/thread-1"
            }
        })

        renderHook(() =>
            useChatDataProcessor({
                status: "ready",
                messages: [
                    {
                        id: "assistant-1",
                        role: "assistant",
                        metadata: {
                            threadId: "thread-1",
                            streamId: "stream-1"
                        }
                    }
                ] as ProcessorMessages
            })
        )

        expect(useChatStore.getState().threadId).toBe("thread-1")
        expect(useChatStore.getState().shouldUpdateQuery).toBe(true)
        expect(useChatStore.getState().attachedStreamIds).toEqual({
            "thread-1": "stream-1"
        })
        expect(useChatStore.getState().pendingStreams).toEqual({
            "thread-1": false
        })
        expect(navigate).not.toHaveBeenCalled()
    })

    it("uses the existing store thread id when only stream metadata arrives", () => {
        const navigate = vi.fn()
        useNavigateMock.mockReturnValue(navigate)
        useChatStore.setState({
            threadId: "thread-9",
            pendingStreams: {
                "thread-9": true
            }
        })

        renderHook(() =>
            useChatDataProcessor({
                status: "ready",
                messages: [
                    {
                        id: "assistant-1",
                        role: "assistant",
                        metadata: {
                            streamId: "stream-9"
                        }
                    }
                ] as ProcessorMessages
            })
        )

        expect(useChatStore.getState().attachedStreamIds).toEqual({
            "thread-9": "stream-9"
        })
        expect(useChatStore.getState().pendingStreams).toEqual({
            "thread-9": false
        })
        expect(navigate).not.toHaveBeenCalled()
    })

    it("navigates only when ready metadata arrives off-thread, not while streaming", () => {
        const navigate = vi.fn()
        useNavigateMock.mockReturnValue(navigate)

        Object.defineProperty(window, "location", {
            configurable: true,
            value: {
                pathname: "/library"
            }
        })

        const { rerender } = renderHook(
            (status: string) =>
                useChatDataProcessor({
                    status,
                    messages: [
                        {
                            id: "assistant-1",
                            role: "assistant",
                            metadata: {
                                threadId: "thread-2"
                            }
                        }
                    ] as ProcessorMessages
                }),
            {
                initialProps: "streaming"
            }
        )

        expect(navigate).not.toHaveBeenCalled()

        rerender("ready")

        expect(navigate).toHaveBeenCalledWith({
            to: "/thread/$threadId",
            params: { threadId: "thread-2" },
            replace: true
        })
    })
})
