import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { backendToUiMessages } from "@/convex/lib/backend_to_ui_messages"
import type { SharedThread, Thread } from "@/convex/schema"
import { useToken } from "@/hooks/auth-hooks"
import { useAutoResume } from "@/hooks/use-auto-resume"
import { resolveJwtToken } from "@/lib/auth-token"
import { browserEnv } from "@/lib/browser-env"
import { useChatStore } from "@/lib/chat-store"
import { useModelStore } from "@/lib/model-store"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useQuery as useConvexQuery } from "convex-helpers/react/cache"
import type { Infer } from "convex/values"
import { nanoid } from "nanoid"
import { useCallback, useEffect, useMemo, useRef } from "react"

type BackendMessagePart =
    | { type: "text"; text: string }
    | { type: "file"; data: string; filename?: string; mimeType?: string }

const extractAttachmentData = (url: string) => {
    if (url.startsWith("data:")) return url

    try {
        const parsed = new URL(url, browserEnv("VITE_CONVEX_API_URL"))
        const key = parsed.searchParams.get("key")
        return key || url
    } catch {
        return url
    }
}

const normalizeUserMessageParts = (
    parts: UIMessage["parts"] | undefined
): BackendMessagePart[] | undefined => {
    if (!parts) return undefined

    return parts.reduce<BackendMessagePart[]>((normalizedParts, part) => {
        if (part.type === "text") {
            normalizedParts.push({ type: "text", text: part.text })
            return normalizedParts
        }

        if (part.type === "file") {
            normalizedParts.push({
                type: "file",
                data: extractAttachmentData(part.url),
                filename: part.filename,
                mimeType: part.mediaType
            })
        }

        return normalizedParts
    }, [])
}

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
    const { rerenderTrigger, shouldUpdateQuery, setShouldUpdateQuery } = useChatStore()
    const seededNextId = useRef<string | null>(null)
    const hydratedThreadIdRef = useRef<string | undefined>(undefined)
    const latestRequestContextRef = useRef({
        folderId,
        threadId,
        token: tokenData.token
    })
    latestRequestContextRef.current = {
        folderId,
        threadId,
        token: tokenData.token
    }

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
        modelIdOverride?: string
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
        id: isShared ? `shared_${sharedThreadId}` : rerenderTrigger,
        experimental_throttle: 50,
        transport: isShared
            ? undefined
            : new DefaultChatTransport<ChatMessage>({
                  api: `${browserEnv("VITE_CONVEX_API_URL")}/chat`,
                  async prepareSendMessagesRequest({ body, messages }) {
                      const currentContext = latestRequestContextRef.current
                      const {
                          selectedModel,
                          enabledTools,
                          selectedImageSize,
                          selectedImageResolution,
                          reasoningEffort,
                          getEffectiveMcpOverrides
                      } = useModelStore.getState()
                      const jwt = await resolveJwtToken(currentContext.token)
                      if (!jwt) {
                          throw new Error("Authentication token unavailable")
                      }

                      if (currentContext.threadId) {
                          useChatStore.getState().setPendingStream(currentContext.threadId, true)
                      }

                      const proposedNewAssistantId = nanoid()
                      seededNextId.current = proposedNewAssistantId

                      const message = messages[messages.length - 1]
                      const mcpOverrides = getEffectiveMcpOverrides(currentContext.threadId)

                      const requestBody = body as Record<string, unknown> & {
                          modelIdOverride?: string
                      }

                      return {
                          headers: {
                              authorization: `Bearer ${jwt}`
                          },
                          body: {
                              ...requestBody,
                              id: currentContext.threadId,
                              proposedNewAssistantId,
                              model: requestBody.modelIdOverride ?? selectedModel,
                              message: {
                                  parts: normalizeUserMessageParts(message?.parts),
                                  role: message?.role,
                                  messageId: message?.id
                              },
                              enabledTools,
                              imageSize: selectedImageSize,
                              imageResolution: selectedImageResolution,
                              folderId: currentContext.folderId,
                              reasoningEffort,
                              mcpOverrides
                          }
                      }
                  },
                  async prepareReconnectToStreamRequest({ api, id }) {
                      const currentContext = latestRequestContextRef.current
                      const jwt = await resolveJwtToken(currentContext.token)
                      if (!jwt) {
                          throw new Error("Authentication token unavailable")
                      }

                      const reconnectThreadId = currentContext.threadId ?? id

                      return {
                          api: `${api}?chatId=${encodeURIComponent(reconnectThreadId)}`,
                          headers: {
                              authorization: `Bearer ${jwt}`
                          }
                      }
                  }
              }),
        messages: initialMessages,
        onFinish: () => {
            if (!isShared && shouldUpdateQuery) {
                setShouldUpdateQuery(false)
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

    useEffect(() => {
        if (isShared) return

        if (!threadId) {
            hydratedThreadIdRef.current = undefined
            return
        }

        if (!threadMessages || "error" in threadMessages) return

        if (hydratedThreadIdRef.current !== threadId) {
            chatHelpers.setMessages(initialMessages)
            hydratedThreadIdRef.current = threadId
        }
    }, [isShared, threadId, threadMessages, initialMessages, chatHelpers.setMessages])

    const customResume = useCallback(() => {
        console.log("[UCI:custom_resume]", {
            threadId: threadId?.slice(0, 8),
            backendMsgs: threadMessages && !("error" in threadMessages) ? threadMessages.length : 0,
            currentUIMsgs: chatHelpers.messages.length,
            initialMsgs: initialMessages.length
        })

        if (chatHelpers.messages.length === 0 && initialMessages.length > 0) {
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
