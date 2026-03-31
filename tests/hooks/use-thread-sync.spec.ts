// @vitest-environment jsdom

import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useThreadSync } from "@/hooks/use-thread-sync"
import { useChatStore } from "@/lib/chat-store"

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

describe("useThreadSync", () => {
    beforeEach(() => {
        resetChatStore()
        vi.spyOn(console, "log").mockImplementation(() => {})
    })

    it("resets chat state when there is no route thread id", () => {
        useChatStore.setState({
            threadId: "thread-1",
            uploadedFiles: [
                {
                    key: "file-1",
                    fileName: "notes.txt",
                    fileType: "text/plain",
                    fileSize: 10,
                    uploadedAt: 1
                }
            ],
            targetFromMessageId: "message-1",
            targetMode: "retry"
        })

        renderHook(() => useThreadSync({ routeThreadId: undefined }))

        expect(useChatStore.getState().threadId).toBeUndefined()
        expect(useChatStore.getState().uploadedFiles).toEqual([])
        expect(useChatStore.getState().targetMode).toBe("normal")
    })

    it("adopts a new route thread id and triggers a rerender when the store was on another thread", () => {
        useChatStore.setState({
            threadId: "thread-0",
            rerenderTrigger: "rerender-1"
        })

        const { result } = renderHook(() => useThreadSync({ routeThreadId: "thread-2" }))

        expect(result.current.threadId).toBe("thread-2")
        expect(useChatStore.getState().threadId).toBe("thread-2")
        expect(useChatStore.getState().rerenderTrigger).not.toBe("rerender-1")
    })

    it("does not trigger a rerender when the store is already on the requested route thread", () => {
        useChatStore.setState({
            threadId: "thread-2",
            rerenderTrigger: "rerender-1"
        })

        renderHook(() => useThreadSync({ routeThreadId: "thread-2" }))

        expect(useChatStore.getState().rerenderTrigger).toBe("rerender-1")
    })
})
