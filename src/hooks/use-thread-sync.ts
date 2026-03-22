import { useChatStore } from "@/lib/chat-store"
import { useEffect } from "react"

interface UseThreadSyncProps {
    routeThreadId: string | undefined
}

export function useThreadSync({ routeThreadId }: UseThreadSyncProps) {
    const { threadId, setThreadId, resetChat, triggerRerender } = useChatStore()

    useEffect(() => {
        if (routeThreadId === undefined) {
            console.log("[thread-sync] resetChat")
            resetChat()
        } else {
            const isSameThread = threadId === routeThreadId
            setThreadId(routeThreadId)

            // Avoid recreating the active chat instance when a brand-new chat
            // adopts its server-created thread id mid-stream.
            if (!isSameThread) {
                triggerRerender()
            }
        }
    }, [routeThreadId, threadId, setThreadId, resetChat, triggerRerender])

    return { threadId, setThreadId }
}
