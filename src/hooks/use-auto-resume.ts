"use client"

import type { Thread } from "@/convex/schema/thread"
import { useChatStore } from "@/lib/chat-store"
import type { Infer } from "convex/values"
import { useEffect, useRef } from "react"

export interface AutoResumeProps {
    autoResume: boolean
    thread?: Infer<typeof Thread>
    threadId?: string
    experimental_resume: () => void
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
    const resumedStreamIdRef = useRef<string | undefined>(undefined)

    useEffect(() => {
        resumedStreamIdRef.current = undefined
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

        if (resumedStreamIdRef.current === thread.currentStreamId) return

        resumedStreamIdRef.current = thread.currentStreamId
        console.log("[AR:resume]", {
            t: threadId,
            current: thread.currentStreamId.slice(0, 5),
            msgsCount: threadMessages.length,
            reason: "live_stream_for_mounted_chat"
        })
        experimental_resume()
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
