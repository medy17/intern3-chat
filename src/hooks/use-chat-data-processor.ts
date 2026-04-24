import { useChatStore } from "@/lib/chat-store"
import { useNavigate } from "@tanstack/react-router"
import type { UIMessage } from "ai"
import { useEffect } from "react"

interface UseChatDataProcessorProps {
    messages: UIMessage<{
        threadId?: string
        streamId?: string
    }>[]
    status: "submitted" | "streaming" | "ready" | "error" | string
}

export function useChatDataProcessor({ messages, status }: UseChatDataProcessorProps) {
    const {
        setThreadId,
        setShouldUpdateQuery,
        setAttachedStreamId,
        threadId,
        setPendingStream,
        shouldUpdateQuery,
        attachedStreamIds,
        pendingStreams
    } = useChatStore()
    const navigate = useNavigate()

    useEffect(() => {
        const latestAssistant = [...messages]
            .reverse()
            .find((message) => message.role === "assistant")
        if (!latestAssistant?.metadata) return

        if (latestAssistant.metadata.threadId) {
            if (threadId !== latestAssistant.metadata.threadId) {
                setThreadId(latestAssistant.metadata.threadId)
            }
            if (
                status !== "submitted" &&
                status !== "streaming" &&
                typeof window !== "undefined" &&
                window.location.pathname !== "/" &&
                window.location.pathname !== `/thread/${latestAssistant.metadata.threadId}`
            ) {
                void navigate({
                    to: "/thread/$threadId",
                    params: { threadId: latestAssistant.metadata.threadId },
                    replace: true
                })
            }
            if (!shouldUpdateQuery) {
                setShouldUpdateQuery(true)
            }
        }

        if (threadId) {
            const currentKnownStreams = attachedStreamIds[threadId] || []
            const newStreamsFound: string[] = []

            for (const message of messages) {
                if (message.role === "assistant" && message.metadata?.streamId) {
                    const streamId = message.metadata.streamId as string
                    if (
                        !currentKnownStreams.includes(streamId) &&
                        !newStreamsFound.includes(streamId)
                    ) {
                        newStreamsFound.push(streamId)
                    }
                }
            }

            if (newStreamsFound.length > 0) {
                newStreamsFound.forEach((streamId) => {
                    setAttachedStreamId(threadId, streamId)
                })
            }

            if (latestAssistant.metadata.streamId) {
                const effectiveThreadId = latestAssistant.metadata.threadId ?? threadId
                if (effectiveThreadId) {
                    const currentStreams = attachedStreamIds[effectiveThreadId] || []
                    const latestStreamId = latestAssistant.metadata.streamId as string
                    // Only clear pendingStream if this streamId was not in the existing attached array
                    // (Meaning it's a completely new chunk/stream from the backend)
                    if (!currentStreams.includes(latestStreamId)) {
                        if (pendingStreams[effectiveThreadId] !== false) {
                            setPendingStream(effectiveThreadId, false)
                        }
                    }
                }
            }
        }
    }, [
        messages,
        setThreadId,
        setShouldUpdateQuery,
        setAttachedStreamId,
        threadId,
        setPendingStream,
        shouldUpdateQuery,
        attachedStreamIds,
        pendingStreams,
        status,
        navigate
    ])
}
