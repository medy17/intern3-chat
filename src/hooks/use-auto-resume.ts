"use client"

import type { Thread } from "@/convex/schema/thread"
import { useChatStore } from "@/lib/chat-store"
import type { Infer } from "convex/values"
import { useEffect, useRef } from "react"

export interface AutoResumeProps {
    autoResume: boolean
    thread?: Infer<typeof Thread>
    threadId?: string
    experimental_resume: () => Promise<void> | void
    status?: "idle" | "streaming" | "submitted" | string
    threadMessages?: any
}

export function useAutoResume({
    autoResume,
    thread,
    threadId,
    experimental_resume,
    status,
    threadMessages
}: AutoResumeProps) {
    const pending = useChatStore((s) => (threadId ? s.pendingStreams[threadId] : false))
    const resumeAttemptRef = useRef<{
        streamId?: string
        attempts: number
        lastAttemptAt: number
    }>({
        streamId: undefined,
        attempts: 0,
        lastAttemptAt: 0
    })

    useEffect(() => {
        resumeAttemptRef.current = {
            streamId: undefined,
            attempts: 0,
            lastAttemptAt: 0
        }
    }, [threadId])

    useEffect(() => {
        if (!autoResume) return
        if (!threadId) return
        if (!thread?.isLive || !thread.currentStreamId) return

        if (status === "streaming" || status === "submitted") return

        if (!threadMessages || "error" in threadMessages) {
            console.log("[AR:waiting_for_messages]", { threadId: threadId.slice(0, 8) })
            return
        }

        if (pending) return
        const currentStreamId = thread.currentStreamId

        const attempt = resumeAttemptRef.current

        if (attempt.streamId !== currentStreamId) {
            resumeAttemptRef.current = {
                streamId: currentStreamId,
                attempts: 0,
                lastAttemptAt: 0
            }
        }

        const attemptResume = () => {
            const currentAttempt = resumeAttemptRef.current

            if (currentAttempt.streamId !== currentStreamId) return
            if (currentAttempt.attempts >= 5) return

            const attemptNow = Date.now()
            if (attemptNow - currentAttempt.lastAttemptAt < 750) return

            resumeAttemptRef.current = {
                streamId: currentStreamId,
                attempts: currentAttempt.attempts + 1,
                lastAttemptAt: attemptNow
            }

            console.log("[AR:resume]", {
                t: threadId,
                current: currentStreamId.slice(0, 5),
                msgsCount: threadMessages.length,
                attempt: resumeAttemptRef.current.attempts,
                reason: "live_stream_for_mounted_chat"
            })

            void experimental_resume()
        }

        const initialDelay = resumeAttemptRef.current.attempts === 0 ? 150 : 0
        const timeout = window.setTimeout(() => {
            attemptResume()
        }, initialDelay)

        const interval = window.setInterval(() => {
            attemptResume()
        }, 900)

        return () => {
            window.clearTimeout(timeout)
            window.clearInterval(interval)
        }
    }, [
        autoResume,
        thread?.isLive,
        thread?.currentStreamId,
        threadId,
        pending,
        experimental_resume,
        status,
        threadMessages
    ])
}
