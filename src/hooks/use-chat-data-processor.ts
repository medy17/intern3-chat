import { useChatStore } from "@/lib/chat-store"
import type { UIMessage } from "ai"
import { useEffect } from "react"

interface UseChatDataProcessorProps {
    messages: UIMessage<{
        threadId?: string
        streamId?: string
    }>[]
}

export function useChatDataProcessor({ messages }: UseChatDataProcessorProps) {
    const { setThreadId, setShouldUpdateQuery, setAttachedStreamId, threadId, setPendingStream } =
        useChatStore()

    useEffect(() => {
        const latestAssistant = [...messages]
            .reverse()
            .find((message) => message.role === "assistant")
        if (!latestAssistant?.metadata) return

        if (latestAssistant.metadata.threadId) {
            setThreadId(latestAssistant.metadata.threadId)
            if (typeof window !== "undefined") {
                window.history.replaceState({}, "", `/thread/${latestAssistant.metadata.threadId}`)
            }
            setShouldUpdateQuery(true)
        }

        if (latestAssistant.metadata.streamId) {
            const effectiveThreadId = latestAssistant.metadata.threadId ?? threadId
            if (effectiveThreadId) {
                setAttachedStreamId(effectiveThreadId, latestAssistant.metadata.streamId)
                setPendingStream(effectiveThreadId, false)
            }
        }
    }, [
        messages,
        setThreadId,
        setShouldUpdateQuery,
        setAttachedStreamId,
        threadId,
        setPendingStream
    ])
}
