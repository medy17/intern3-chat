import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { backendToUiMessages } from "@/convex/lib/backend_to_ui_messages"
import type { SharedThread, Thread } from "@/convex/schema"
import { useToken } from "@/hooks/auth-hooks"
import { useAutoResume } from "@/hooks/use-auto-resume"
import { browserEnv } from "@/lib/browser-env"
import { useChatStore } from "@/lib/chat-store"
import { useModelStore } from "@/lib/model-store"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useQuery as useConvexQuery } from "convex-helpers/react/cache"
import type { Infer } from "convex/values"
import { nanoid } from "nanoid"
import { useCallback, useMemo, useRef } from "react"

export function useChatIntegration<IsShared extends boolean>({
    threadId,
    sharedThreadId,
    isShared,
    folderId
}: {
    threadId: string | undefined
    sharedThreadId?: string | undefined
    isShared?: IsShared
    folderId?: Id<"projects">
}) {
    const tokenData = useToken()
    const {
        selectedModel,
        enabledTools,
        selectedImageSize,
        selectedImageResolution,
        reasoningEffort,
        getEffectiveMcpOverrides
    } = useModelStore()
    const { rerenderTrigger, shouldUpdateQuery, setShouldUpdateQuery, triggerRerender } =
        useChatStore()
    const seededNextId = useRef<string | null>(null)

    // For regular threads, use getThreadMessages
    const threadMessages = useConvexQuery(
        api.threads.getThreadMessages,
        !isShared && threadId ? { threadId: threadId as Id<"threads"> } : "skip"
    )

    // For shared threads, get the shared thread data
    const sharedThread = useConvexQuery(
        api.threads.getSharedThread,
        isShared && sharedThreadId
            ? { sharedThreadId: sharedThreadId as Id<"sharedThreads"> }
            : "skip"
    )

    const thread = useConvexQuery(
        api.threads.getThread,
        !isShared && threadId ? { threadId: threadId as Id<"threads"> } : "skip"
    )

    type ChatMessage = UIMessage<{
        modelId?: string
        modelName?: string
        promptTokens?: number
        completionTokens?: number
        reasoningTokens?: number
        serverDurationMs?: number
        threadId?: string
        streamId?: string
    }>

    const initialMessages = useMemo<ChatMessage[]>(() => {
        if (isShared) {
            if (!sharedThread?.messages) return []
            // Shared thread messages need threadId for compatibility
            return backendToUiMessages(
                sharedThread.messages.map((msg) => ({
                    ...msg,
                    threadId: sharedThreadId as Id<"threads">
                }))
            )
        }

        if (!threadMessages || "error" in threadMessages) return []
        return backendToUiMessages(threadMessages)
    }, [threadMessages, sharedThread, isShared, sharedThreadId])

    const chatHelpers = useChat({
        id: isShared
            ? `shared_${sharedThreadId}`
            : threadId === undefined
              ? `new_chat_${rerenderTrigger}`
              : threadId,
        experimental_throttle: 50,
        transport: isShared
            ? undefined
            : new DefaultChatTransport<ChatMessage>({
                  api: `${browserEnv("VITE_CONVEX_API_URL")}/chat`,
                  headers: {
                      authorization: `Bearer ${tokenData.token}`
                  },
                  prepareSendMessagesRequest(body) {
                      if (threadId) {
                          useChatStore.getState().setPendingStream(threadId, true)
                      }

                      const proposedNewAssistantId = nanoid()
                      seededNextId.current = proposedNewAssistantId

                      const message = body.messages[body.messages.length - 1]
                      const mcpOverrides = getEffectiveMcpOverrides(threadId)

                      return {
                          body: {
                              id: threadId,
                              proposedNewAssistantId,
                              model: selectedModel,
                              message: {
                                  parts: message?.parts,
                                  role: message?.role,
                                  messageId: message?.id
                              },
                              enabledTools,
                              imageSize: selectedImageSize,
                              imageResolution: selectedImageResolution,
                              folderId,
                              reasoningEffort,
                              mcpOverrides
                          }
                      }
                  },
                  prepareReconnectToStreamRequest({ api, id }) {
                      return {
                          api: `${api}?chatId=${encodeURIComponent(id)}`,
                          headers: {
                              authorization: `Bearer ${tokenData.token}`
                          }
                      }
                  }
              }),
        messages: initialMessages,
        onFinish: () => {
            if (!isShared && shouldUpdateQuery) {
                setShouldUpdateQuery(false)
                triggerRerender()
            }
        },
        generateId: () => {
            if (seededNextId.current) {
                const id = seededNextId.current
                seededNextId.current = null
                return id
            }
            return nanoid()
        }
    })

    const customResume = useCallback(() => {
        console.log("[UCI:custom_resume]", {
            threadId: threadId?.slice(0, 8),
            backendMsgs: threadMessages && !("error" in threadMessages) ? threadMessages.length : 0,
            currentUIMsgs: chatHelpers.messages.length,
            initialMsgs: initialMessages.length
        })

        if (initialMessages.length > 0) {
            chatHelpers.setMessages(initialMessages)
            console.log("[UCI:messages_restored]", { count: initialMessages.length })
        }

        void chatHelpers.resumeStream()
    }, [
        chatHelpers.setMessages,
        chatHelpers.resumeStream,
        initialMessages,
        threadMessages,
        threadId,
        chatHelpers.messages.length
    ])

    useAutoResume({
        autoResume: !isShared, // Skip auto resume for shared threads
        thread: thread || undefined,
        threadId,
        experimental_resume: customResume,
        status: chatHelpers.status,
        threadMessages
    })

    return {
        ...chatHelpers,
        seededNextId,
        thread: (thread || sharedThread) as unknown as IsShared extends true
            ? Infer<typeof SharedThread>
            : Infer<typeof Thread>
    }
}
