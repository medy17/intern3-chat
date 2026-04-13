import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useQuery as useConvexQuery } from "convex/react"
import { useEffect } from "react"

interface UseDynamicTitleProps {
    threadId: string | undefined
    enabled?: boolean
}

export function useDynamicTitle({ threadId, enabled = true }: UseDynamicTitleProps) {
    const thread = useConvexQuery(
        api.threads.getThread,
        threadId ? { threadId: threadId as Id<"threads"> } : "skip"
    )

    useEffect(() => {
        if (!enabled) {
            document.title = "SilkChat"
            return
        }

        if (threadId && thread && !("error" in thread)) {
            document.title = `${thread.title} - SilkChat`
        } else {
            document.title = "SilkChat"
        }
    }, [enabled, threadId, thread])
}
