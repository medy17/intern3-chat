import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { backendToUiMessages } from "@/convex/lib/backend_to_ui_messages"
import type { SharedThread, Thread } from "@/convex/schema"
import { useToken } from "@/hooks/auth-hooks"
import { useAutoResume } from "@/hooks/use-auto-resume"
import { resolveJwtToken } from "@/lib/auth-token"
import { browserEnv } from "@/lib/browser-env"
import { useChatStore } from "@/lib/chat-store"
import { type ReasoningEffort, useModelStore } from "@/lib/model-store"
import { extractR2KeyFromUrl } from "@/lib/r2-public-url"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useQuery as useConvexQuery } from "convex-helpers/react/cache"
import type { Infer } from "convex/values"
import { nanoid } from "nanoid"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type BackendMessagePart =
    | { type: "text"; text: string }
    | { type: "file"; data: string; filename?: string; mimeType?: string }

const extractAttachmentData = (url: string) => {
    if (url.startsWith("data:")) return url

    return extractR2KeyFromUrl(url) || url
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

const getMessageContentScore = (message: UIMessage | undefined) => {
    if (!message?.parts?.length) return 0

    return message.parts.reduce((score, part) => {
        switch (part.type) {
            case "text":
                return score + part.text.length
            case "reasoning":
                return score + part.text.length
            case "file":
                return score + 500
            case "dynamic-tool":
                return score + 250
            default:
                return part.type.startsWith("tool-") ? score + 250 : score
        }
    }, 0)
}

const getPartFingerprint = (part: UIMessage["parts"][number]) => {
    switch (part.type) {
        case "text":
            return `text:${part.text}`
        case "reasoning":
            return `reasoning:${part.text}`
        case "file":
            return `file:${part.mediaType ?? ""}:${part.filename ?? ""}:${part.url}`
        case "dynamic-tool":
            return `dynamic-tool:${part.toolName}:${JSON.stringify("input" in part ? part.input : null)}:${JSON.stringify("output" in part ? part.output : null)}`
        default:
            if (part.type.startsWith("tool-")) {
                return `${part.type}:${JSON.stringify("input" in part ? part.input : null)}:${JSON.stringify("output" in part ? part.output : null)}:${"state" in part ? part.state : ""}`
            }
            return part.type
    }
}

const getMessagesIdentityFingerprint = (messages: UIMessage[]) =>
    messages.map((message) => `${message.role}:${message.id}`).join("|")

const getMessagesContentFingerprint = (messages: UIMessage[]) =>
    messages
        .map(
            (message) =>
                `${message.role}:${message.id}:${message.parts?.map(getPartFingerprint).join("~") ?? ""}`
        )
        .join("|")

const getLatestAssistantMessage = (messages: UIMessage[]) =>
    [...messages].reverse().find((message) => message.role === "assistant")

const getAssistantMessageById = (messages: UIMessage[], messageId: string | null) => {
    if (!messageId) {
        return undefined
    }

    return messages.find((message) => message.id === messageId && message.role === "assistant")
}

const shouldAdoptBackendMessages = ({
    currentMessages,
    backendMessages,
    status,
    hasActiveStream
}: {
    currentMessages: UIMessage[]
    backendMessages: UIMessage[]
    status?: string
    hasActiveStream?: boolean
}) => {
    if (backendMessages.length === 0) return false
    if (currentMessages.length === 0) return true

    const currentIdentity = getMessagesIdentityFingerprint(currentMessages)
    const backendIdentity = getMessagesIdentityFingerprint(backendMessages)
    const isLocallyMutating =
        hasActiveStream === true || status === "streaming" || status === "submitted"

    if (currentIdentity !== backendIdentity) {
        return !isLocallyMutating
    }

    const currentContent = getMessagesContentFingerprint(currentMessages)
    const backendContent = getMessagesContentFingerprint(backendMessages)

    if (currentContent === backendContent) {
        return false
    }

    const currentAssistant = getLatestAssistantMessage(currentMessages)
    const backendAssistant = getLatestAssistantMessage(backendMessages)
    const currentAssistantScore = getMessageContentScore(currentAssistant)
    const backendAssistantScore = getMessageContentScore(backendAssistant)

    if (isLocallyMutating) {
        return currentAssistantScore === 0 && backendAssistantScore > 0
    }

    if (backendAssistantScore > currentAssistantScore) {
        return true
    }

    return true
}

const hasMeaningfulAssistantContent = (messages: UIMessage[]) =>
    getMessageContentScore(getLatestAssistantMessage(messages)) > 0

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
    type ChatMessage = UIMessage<{
        modelId?: string
        modelName?: string
        displayProvider?: string
        runtimeProvider?: string
        reasoningEffort?: ReasoningEffort
        promptTokens?: number
        completionTokens?: number
        reasoningTokens?: number
        totalTokens?: number
        estimatedCostUsd?: number
        estimatedPromptCostUsd?: number
        estimatedCompletionCostUsd?: number
        serverDurationMs?: number
        timeToFirstVisibleMs?: number
        threadId?: string
        streamId?: string
        modelIdOverride?: string
    }>
    type StreamRenderPhase = "idle" | "pre-first-paint" | "post-first-paint"

    const tokenData = useToken()
    const { rerenderTrigger, shouldUpdateQuery, setShouldUpdateQuery } = useChatStore()
    const hasPendingLocalStream = useChatStore((state) =>
        threadId ? state.pendingStreams[threadId] === true : false
    )
    const seededNextId = useRef<string | null>(null)
    const activeStreamingAssistantIdRef = useRef<string | null>(null)
    const hydratedThreadIdRef = useRef<string | undefined>(undefined)
    const latestRequestContextRef = useRef({
        folderId,
        threadId,
        token: tokenData.token
    })
    const [streamRenderPhase, setStreamRenderPhase] = useState<StreamRenderPhase>("idle")
    const lastLocalMutationAt = useChatStore((state) => state.lastLocalMutationAt)
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
    const messageThrottle =
        streamRenderPhase === "pre-first-paint"
            ? undefined
            : streamRenderPhase === "post-first-paint"
              ? 100
              : 50

    const chatHelpers = useChat({
        id: isShared ? `shared_${sharedThreadId}` : rerenderTrigger,
        // Keep the first streamed write synchronous so retry/edit/truncate flows
        // paint immediately, then re-enable throttling for the rest of the stream.
        experimental_throttle: messageThrottle,
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
                      const { selectedPersona } = useChatStore.getState()
                      const jwt = await resolveJwtToken(currentContext.token, {
                          forceRefresh: true
                      })
                      if (!jwt) {
                          throw new Error("Authentication token unavailable")
                      }

                      if (currentContext.threadId) {
                          useChatStore
                              .getState()
                              .setManuallyStoppedThread(currentContext.threadId, false)
                          useChatStore.getState().setPendingStream(currentContext.threadId, true)
                      }

                      const proposedNewAssistantId = nanoid()
                      seededNextId.current = proposedNewAssistantId
                      activeStreamingAssistantIdRef.current = proposedNewAssistantId
                      setStreamRenderPhase("pre-first-paint")

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
                              mcpOverrides,
                              personaSelection: currentContext.threadId
                                  ? undefined
                                  : selectedPersona
                          }
                      }
                  },
                  async prepareReconnectToStreamRequest({ api, id }) {
                      const currentContext = latestRequestContextRef.current
                      const jwt = await resolveJwtToken(currentContext.token, {
                          forceRefresh: true
                      })
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
            const currentThreadId = latestRequestContextRef.current.threadId
            if (currentThreadId) {
                useChatStore.getState().setPendingStream(currentThreadId, false)
            }
            activeStreamingAssistantIdRef.current = null
            setStreamRenderPhase("idle")
            if (!isShared && shouldUpdateQuery) {
                setShouldUpdateQuery(false)
            }
        },
        onError: () => {
            const currentThreadId = latestRequestContextRef.current.threadId
            if (currentThreadId) {
                useChatStore.getState().setPendingStream(currentThreadId, false)
            }
            activeStreamingAssistantIdRef.current = null
            setStreamRenderPhase("idle")
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
    const hasActiveThreadStream =
        chatHelpers.status === "streaming" ||
        chatHelpers.status === "submitted" ||
        hasPendingLocalStream ||
        (thread && "isLive" in thread && thread.isLive === true && Boolean(thread.currentStreamId))

    useEffect(() => {
        activeStreamingAssistantIdRef.current = null
        setStreamRenderPhase("idle")
    }, [threadId])

    useEffect(() => {
        if (!hasActiveThreadStream) {
            if (streamRenderPhase !== "idle") {
                setStreamRenderPhase("idle")
            }
            activeStreamingAssistantIdRef.current = null
            return
        }

        if (streamRenderPhase === "idle") {
            setStreamRenderPhase("pre-first-paint")
            return
        }

        if (streamRenderPhase === "post-first-paint") {
            return
        }

        const streamingAssistant =
            getAssistantMessageById(chatHelpers.messages, activeStreamingAssistantIdRef.current) ??
            getLatestAssistantMessage(chatHelpers.messages)

        if (getMessageContentScore(streamingAssistant) > 0) {
            setStreamRenderPhase("post-first-paint")
        }
    }, [chatHelpers.messages, hasActiveThreadStream, streamRenderPhase])

    useEffect(() => {
        if (isShared) return

        if (!threadId) {
            hydratedThreadIdRef.current = undefined
            return
        }

        if (!threadMessages || "error" in threadMessages) return

        if (hydratedThreadIdRef.current !== threadId) {
            hydratedThreadIdRef.current = threadId

            if (!hasActiveThreadStream) {
                chatHelpers.setMessages(initialMessages)
                return
            }

            if (hasPendingLocalStream) {
                return
            }

            if (!hasMeaningfulAssistantContent(chatHelpers.messages)) {
                chatHelpers.setMessages(initialMessages)
            }
        }
    }, [
        isShared,
        threadId,
        threadMessages,
        initialMessages,
        chatHelpers.messages,
        hasActiveThreadStream,
        hasPendingLocalStream,
        chatHelpers.setMessages
    ])

    useEffect(() => {
        if (isShared) return
        if (!threadId) return
        if (!threadMessages || "error" in threadMessages) return
        if (hasPendingLocalStream) return

        if (Date.now() - lastLocalMutationAt < 2000) {
            console.log("[UCI] Ignoring backend messages because of recent local mutation")
            return
        }

        if (
            shouldAdoptBackendMessages({
                currentMessages: chatHelpers.messages,
                backendMessages: initialMessages,
                status: chatHelpers.status,
                hasActiveStream: hasActiveThreadStream
            })
        ) {
            chatHelpers.setMessages(initialMessages)
        }
    }, [
        isShared,
        threadId,
        threadMessages,
        initialMessages,
        chatHelpers.messages,
        chatHelpers.status,
        hasActiveThreadStream,
        hasPendingLocalStream,
        lastLocalMutationAt,
        chatHelpers.setMessages
    ])

    const customResume = useCallback(() => {
        const effectiveMessages =
            chatHelpers.messages.length === 0 && initialMessages.length > 0
                ? initialMessages
                : chatHelpers.messages

        console.log("[UCI:custom_resume]", {
            threadId: threadId?.slice(0, 8),
            backendMsgs: threadMessages && !("error" in threadMessages) ? threadMessages.length : 0,
            currentUIMsgs: chatHelpers.messages.length,
            initialMsgs: initialMessages.length,
            hasPersistedAssistantContent: hasMeaningfulAssistantContent(effectiveMessages)
        })

        if (chatHelpers.messages.length === 0 && initialMessages.length > 0) {
            chatHelpers.setMessages(initialMessages)
            console.log("[UCI:messages_restored]", { count: initialMessages.length })
        }

        if (hasMeaningfulAssistantContent(effectiveMessages)) {
            return
        }

        void chatHelpers.resumeStream()
    }, [
        chatHelpers.setMessages,
        chatHelpers.resumeStream,
        chatHelpers.messages,
        initialMessages,
        threadMessages,
        threadId
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
