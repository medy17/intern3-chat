// @vitest-environment jsdom

import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
    setAttachedStreamIdMock,
    setPendingStreamMock,
    setShouldUpdateQueryMock,
    setThreadIdMock,
    useChatStoreMock,
    useNavigateMock
} = vi.hoisted(() => ({
    setAttachedStreamIdMock: vi.fn(),
    setPendingStreamMock: vi.fn(),
    setShouldUpdateQueryMock: vi.fn(),
    setThreadIdMock: vi.fn(),
    useChatStoreMock: vi.fn(),
    useNavigateMock: vi.fn()
}))

vi.mock("@tanstack/react-router", () => ({
    useNavigate: useNavigateMock
}))

vi.mock("@/lib/chat-store", () => ({
    useChatStore: useChatStoreMock
}))

import { useChatDataProcessor } from "@/hooks/use-chat-data-processor"

type ProcessorMessages = Parameters<typeof useChatDataProcessor>[0]["messages"]

describe("useChatDataProcessor", () => {
    beforeEach(() => {
        setAttachedStreamIdMock.mockReset()
        setPendingStreamMock.mockReset()
        setShouldUpdateQueryMock.mockReset()
        setThreadIdMock.mockReset()
        useChatStoreMock.mockReset()
        useNavigateMock.mockReset()
        vi.spyOn(console, "log").mockImplementation(() => {})

        useChatStoreMock.mockReturnValue({
            setThreadId: setThreadIdMock,
            setShouldUpdateQuery: setShouldUpdateQueryMock,
            setAttachedStreamId: setAttachedStreamIdMock,
            threadId: undefined,
            setPendingStream: setPendingStreamMock
        })
    })

    it("hydrates thread and stream metadata into the store", () => {
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

        expect(setThreadIdMock).toHaveBeenCalledWith("thread-1")
        expect(setShouldUpdateQueryMock).toHaveBeenCalledWith(true)
        expect(setAttachedStreamIdMock).toHaveBeenCalledWith("thread-1", "stream-1")
        expect(setPendingStreamMock).toHaveBeenCalledWith("thread-1", false)
        expect(navigate).not.toHaveBeenCalled()
    })

    it("navigates to the assistant thread when metadata arrives off-thread", () => {
        const navigate = vi.fn()
        useNavigateMock.mockReturnValue(navigate)

        Object.defineProperty(window, "location", {
            configurable: true,
            value: {
                pathname: "/library"
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
                            threadId: "thread-2"
                        }
                    }
                ] as ProcessorMessages
            })
        )

        expect(navigate).toHaveBeenCalledWith({
            to: "/thread/$threadId",
            params: { threadId: "thread-2" },
            replace: true
        })
    })

    it("ignores assistant messages that do not carry metadata", () => {
        const navigate = vi.fn()
        useNavigateMock.mockReturnValue(navigate)

        renderHook(() =>
            useChatDataProcessor({
                status: "ready",
                messages: [
                    {
                        id: "assistant-1",
                        role: "assistant"
                    }
                ] as ProcessorMessages
            })
        )

        expect(setThreadIdMock).not.toHaveBeenCalled()
        expect(setShouldUpdateQueryMock).not.toHaveBeenCalled()
        expect(navigate).not.toHaveBeenCalled()
    })
})
