// @vitest-environment jsdom

import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { type AutoResumeProps, useAutoResume } from "@/hooks/use-auto-resume"
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

const liveThread = {
    isLive: true,
    currentStreamId: "stream-1"
} as NonNullable<AutoResumeProps["thread"]>

describe("useAutoResume", () => {
    beforeEach(() => {
        resetChatStore()
        vi.useFakeTimers()
        vi.spyOn(console, "log").mockImplementation(() => {})
    })

    it("retries resumable live streams up to the capped attempt count", () => {
        const experimentalResume = vi.fn()

        renderHook(() =>
            useAutoResume({
                autoResume: true,
                threadId: "thread-1",
                thread: liveThread,
                experimental_resume: experimentalResume,
                status: "idle",
                threadMessages: [{ _id: "message-1" }]
            })
        )

        vi.advanceTimersByTime(149)
        expect(experimentalResume).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)
        expect(experimentalResume).toHaveBeenCalledTimes(1)

        vi.advanceTimersByTime(5_000)
        expect(experimentalResume).toHaveBeenCalledTimes(5)
    })

    it("does not resume while the store still marks the thread as pending", () => {
        useChatStore.getState().setPendingStream("thread-1", true)
        const experimentalResume = vi.fn()

        renderHook(() =>
            useAutoResume({
                autoResume: true,
                threadId: "thread-1",
                thread: liveThread,
                experimental_resume: experimentalResume,
                status: "idle",
                threadMessages: [{ _id: "message-1" }]
            })
        )

        vi.advanceTimersByTime(5_000)

        expect(experimentalResume).not.toHaveBeenCalled()
    })

    it("waits for resolved thread messages before attempting a resume", () => {
        const experimentalResume = vi.fn()
        const { rerender } = renderHook(
            (props: { threadMessages?: unknown }) =>
                useAutoResume({
                    autoResume: true,
                    threadId: "thread-1",
                    thread: liveThread,
                    experimental_resume: experimentalResume,
                    status: "idle",
                    threadMessages: props.threadMessages
                }),
            {
                initialProps: {
                    threadMessages: undefined
                }
            }
        )

        vi.advanceTimersByTime(2_000)
        expect(experimentalResume).not.toHaveBeenCalled()

        rerender({
            threadMessages: [{ _id: "message-1" }]
        })

        vi.advanceTimersByTime(150)
        expect(experimentalResume).toHaveBeenCalledTimes(1)
    })
})
