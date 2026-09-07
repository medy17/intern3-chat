import { type MessageScrollDirection, Messages, type MessagesHandle } from "@/components/messages"
import { PersonaAvatar } from "@/components/persona-avatar"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useSession } from "@/hooks/auth-hooks"
import { useChatActions } from "@/hooks/use-chat-actions"
import { useChatDataProcessor } from "@/hooks/use-chat-data-processor"
import { useChatIntegration } from "@/hooks/use-chat-integration"
import { useDynamicTitle } from "@/hooks/use-dynamic-title"
import {
    notifyModelReplacement,
    resolveAvailableModelReplacement,
    useSelectedModelLifecycleMigration
} from "@/hooks/use-model-lifecycle-migration"
import { useThreadComposerHydration } from "@/hooks/use-thread-composer-hydration"
import { useThreadSync } from "@/hooks/use-thread-sync"
import { hasPdfAttachmentInMessages } from "@/lib/attachment-support"
import { useChatHydrationStore } from "@/lib/chat-hydration-store"
import { type ChatMessage, type UploadedFile, useChatStore } from "@/lib/chat-store"
import { useDiskCachedQuery } from "@/lib/convex-cached-query"
import { DefaultSettings } from "@/lib/default-user-settings"
import { resolveDeferredChatMessages } from "@/lib/deferred-chat-messages"
import { type ThreadPersonaInfo, usePublishThreadDiagnostics } from "@/lib/dev-thread-diagnostics"
import { canUseDevTools } from "@/lib/dev-tools"
import {
    OPEN_MODEL_PICKER_SHORTCUT_EVENT,
    matchesOpenModelPickerShortcut
} from "@/lib/keyboard-shortcuts"
import { useModelStore } from "@/lib/model-store"
import { useAvailableModels, useDefaultModelId } from "@/lib/models-providers-shared"
import {
    clearPersonaOnboardingHandoff,
    peekPersonaOnboardingHandoff
} from "@/lib/persona-onboarding"
import { useSharedModels } from "@/lib/shared-models"
import { useThemeStore } from "@/lib/theme-store"
import { useQuery as useConvexQuery } from "convex-helpers/react/cache"
import { AnimatePresence, motion } from "motion/react"
import {
    useCallback,
    useDeferredValue,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from "react"
import { ChatMascot } from "./chat-mascot"
import { FullPageDropOverlay } from "./full-page-drop-overlay"
import { MultimodalInput, type MultimodalInputRef } from "./multimodal-input"
import { SignupMessagePrompt } from "./signup-message-prompt"
import { StickToBottomButton } from "./stick-to-bottom-button"

interface ChatProps {
    threadId: string | undefined
    folderId?: Id<"projects">
    isActiveRoute?: boolean
}

const ChatContent = ({ threadId: routeThreadId, folderId, isActiveRoute = true }: ChatProps) => {
    const { selectedModel, setSelectedModel, reasoningEffort, setReasoningEffort } = useModelStore()
    const { threadId } = useThreadSync({ routeThreadId })
    const messagesRef = useRef<MessagesHandle>(null)
    const [isAtBottom, setIsAtBottom] = useState(true)
    const [scrollDirection, setScrollDirection] = useState<MessageScrollDirection>("idle")
    const { themeState } = useThemeStore()
    const mode = themeState.currentMode
    const { data: session, isPending } = useSession()
    const defaultModelId = useDefaultModelId()
    const userSettings = useCurrentUserSettings(session?.user?.id, isPending)
    const resolvedUserSettings =
        "error" in userSettings ? DefaultSettings(session?.user?.id ?? "") : userSettings
    const { availableModels } = useAvailableModels(resolvedUserSettings)
    const { models: sharedModels } = useSharedModels()
    const multimodalInputRef = useRef<MultimodalInputRef>(null)
    const [isComposerActive, setIsComposerActive] = useState(false)

    useDynamicTitle({ threadId, enabled: isActiveRoute })

    useEffect(() => {
        if (!selectedModel && defaultModelId) {
            setSelectedModel(defaultModelId)
        }
    }, [defaultModelId, selectedModel, setSelectedModel])

    useSelectedModelLifecycleMigration({
        selectedModel,
        setSelectedModel,
        sharedModels,
        availableModels,
        fallbackModelId: defaultModelId
    })

    useThreadComposerHydration({
        threadId,
        sharedModels,
        availableModels,
        fallbackModelId: defaultModelId,
        selectedModel,
        reasoningEffort,
        setSelectedModel,
        setReasoningEffort
    })

    useEffect(() => {
        if (!isActiveRoute) {
            return
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (!matchesOpenModelPickerShortcut(event)) {
                return
            }

            event.preventDefault()
            document.dispatchEvent(new CustomEvent(OPEN_MODEL_PICKER_SHORTCUT_EVENT))
        }

        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [isActiveRoute])

    const projects = useDiskCachedQuery(
        api.folders.getUserProjects,
        {
            key: "projects",
            default: []
        },
        session?.user?.id ? {} : "skip"
    )
    const project =
        "error" in projects ? null : projects?.find((project) => project._id === folderId)

    const chat = useChatIntegration({
        threadId,
        folderId
    })
    const { status, composerStatus, messages, ...chatHelpers } = chat
    const {
        resetChat,
        selectedPersona,
        setSelectedPersona,
        pendingPersonaOpening,
        setPendingPersonaOpening
    } = useChatStore()
    const syntheticOpeningMessage = useMemo<ChatMessage | undefined>(() => {
        if (!pendingPersonaOpening || threadId) return undefined
        return {
            id: pendingPersonaOpening.messageId,
            role: "assistant",
            parts: [{ type: "text", text: pendingPersonaOpening.text }]
        }
    }, [pendingPersonaOpening, threadId])
    const displayMessages = useMemo(
        () =>
            syntheticOpeningMessage
                ? [
                      syntheticOpeningMessage,
                      ...messages.filter((message) => message.id !== syntheticOpeningMessage.id)
                  ]
                : messages,
        [messages, syntheticOpeningMessage]
    )
    const deferredMessageCandidate = useDeferredValue(displayMessages)
    const isLiveMessageStream =
        status === "submitted" ||
        status === "streaming" ||
        Boolean(chat.thread && "isLive" in chat.thread && chat.thread.isLive === true)
    const deferredMessages = isLiveMessageStream
        ? displayMessages
        : resolveDeferredChatMessages(displayMessages, deferredMessageCandidate)
    const messageRenderStatus = isLiveMessageStream ? "streaming" : status
    // Signal the route-transition overlay once the deferred message render has
    // caught up with the live list for this chat. Keyed off the route props so it
    // matches the key `_chat.tsx` derives from the current route target.
    const hydrationKey = routeThreadId ?? folderId?.toString() ?? "chat"
    const isHydrationSettled = deferredMessages === displayMessages
    useEffect(() => {
        useChatHydrationStore
            .getState()
            .setHydratedChatKey(isHydrationSettled ? hydrationKey : null)
    }, [hydrationKey, isHydrationSettled])
    const threadHasPdfAttachments = useMemo(() => hasPdfAttachmentInMessages(messages), [messages])
    const setMessagesRef = useRef(chatHelpers.setMessages)

    const { handleInputSubmit, handleRetry, handleEditAndRetry, handleBranch } = useChatActions({
        threadId,
        folderId,
        sharedModels,
        availableModels,
        fallbackModelId: defaultModelId,
        chat
    })

    const pendingBranchRetry = useChatStore((state) => state.pendingBranchRetry)
    const setPendingBranchRetry = useChatStore((state) => state.setPendingBranchRetry)
    const pendingBranchHydration = useChatStore((state) => state.pendingBranchHydration)
    const setPendingBranchHydration = useChatStore((state) => state.setPendingBranchHydration)

    useLayoutEffect(() => {
        if (!pendingBranchHydration || pendingBranchHydration.threadId !== threadId) return

        chatHelpers.setMessages(pendingBranchHydration.messages)
        setPendingBranchHydration(undefined)
    }, [chatHelpers.setMessages, pendingBranchHydration, setPendingBranchHydration, threadId])

    useEffect(() => {
        if (!pendingBranchRetry || pendingBranchRetry.threadId !== threadId) return
        if (status !== "ready") return

        const targetMessage = messages.find(
            (message) => message.id === pendingBranchRetry.messageId && message.role === "user"
        )
        if (!targetMessage) return

        setPendingBranchRetry(undefined)
        handleRetry(targetMessage)
    }, [handleRetry, messages, pendingBranchRetry, setPendingBranchRetry, status, threadId])

    useChatDataProcessor({ messages, status, clientId: chat.clientId, folderId })

    const handleInputSubmitWithScroll = (inputValue?: string, fileValues?: UploadedFile[]) => {
        handleInputSubmit(inputValue, fileValues)
        messagesRef.current?.scrollToBottom("smooth")
    }

    // The opening is display-only until the user replies. The first send carries
    // its authoritative id to the server, which persists it with the reply.
    const awaitingFirstReply =
        Boolean(pendingPersonaOpening) && !threadId && messages.length === 0 && status === "ready"
    const suggestedReplies = awaitingFirstReply
        ? (pendingPersonaOpening?.suggestedReplies ?? [])
        : []

    const handleFileDrop = useCallback((files: File[]) => {
        multimodalInputRef.current?.handleFileUpload(files)
    }, [])

    const handleQuoteSelection = useCallback((selection: string) => {
        multimodalInputRef.current?.insertQuote(selection)
    }, [])

    const isEmpty = displayMessages.length === 0 && !threadId
    const personaOptions = useDiskCachedQuery(
        api.personas.listPersonaPickerOptions,
        {
            key: "persona-picker-options",
            default: { builtIns: [], userPersonas: [] }
        },
        session?.user?.id ? {} : "skip"
    )

    const userName =
        session?.user?.name ?? (isPending ? localStorage.getItem("DISK_CACHE:user-name") : null)

    useEffect(() => {
        if (!session?.user?.name || isPending) return
        localStorage.setItem("DISK_CACHE:user-name", session.user.name)
    }, [session?.user?.name, isPending])

    // Handoff from /personas/start. Re-applied (not one-shot) because resetChat
    // wipes selectedPersona on any ChatContent remount; it stays active until a
    // thread starts, the user picks a persona manually, or it expires. Waits for
    // the model list so the persona's default model can be applied like the
    // persona selector does.
    useEffect(() => {
        if (!isActiveRoute || !session?.user?.id) return
        if (availableModels.length === 0) return
        const handoff = peekPersonaOnboardingHandoff()
        if (!handoff) return

        if (threadId) {
            clearPersonaOnboardingHandoff()
        } else {
            if (selectedPersona.source !== handoff.source || selectedPersona.id !== handoff.id) {
                setSelectedPersona({ source: handoff.source, id: handoff.id })
            }
            setPendingPersonaOpening({
                source: handoff.source,
                personaId: handoff.id,
                openingId: handoff.opening.id,
                messageId: handoff.opening.messageId,
                text: handoff.opening.text,
                suggestedReplies: handoff.opening.suggestedReplies
            })
        }

        if (!handoff.defaultModelId) return
        const availableModelIds = new Set(availableModels.map((model) => model.id))
        const replacement = resolveAvailableModelReplacement({
            modelId: handoff.defaultModelId,
            sharedModels,
            availableModels
        })
        const targetModelId = availableModelIds.has(handoff.defaultModelId)
            ? handoff.defaultModelId
            : replacement.replacementId

        if (targetModelId && availableModelIds.has(targetModelId)) {
            setSelectedModel(targetModelId)
            if (
                targetModelId !== handoff.defaultModelId &&
                replacement.originalModel &&
                replacement.replacement
            ) {
                notifyModelReplacement(replacement.originalModel, replacement.replacement)
            }
        }
    }, [
        isActiveRoute,
        threadId,
        session?.user?.id,
        selectedPersona,
        setSelectedPersona,
        setPendingPersonaOpening,
        availableModels,
        sharedModels,
        setSelectedModel
    ])

    useEffect(() => {
        if (!threadId) return
        clearPersonaOnboardingHandoff()
        setPendingPersonaOpening(undefined)
    }, [setPendingPersonaOpening, threadId])
    const selectedPersonaOption =
        selectedPersona.source === "default" || "error" in personaOptions
            ? null
            : ([...personaOptions.builtIns, ...personaOptions.userPersonas].find(
                  (persona) =>
                      persona.source === selectedPersona.source && persona.id === selectedPersona.id
              ) ?? null)
    const hasSelectedPersonaAvatar = Boolean(
        selectedPersonaOption?.avatarKind && selectedPersonaOption.avatarValue
    )

    // Dev-only: publish thread diagnostics (persona, attachments, token/cost stats) for the dock.
    // Both queries are skipped entirely outside local dev builds.
    const devEnabled = canUseDevTools()
    const devThreadDoc = useConvexQuery(
        api.threads.getThread,
        devEnabled && threadId ? { threadId: threadId as Id<"threads"> } : "skip"
    )
    const devModelLimits = useConvexQuery(
        api.settings.getDevModelContextLimits,
        devEnabled && selectedModel ? { modelId: selectedModel } : "skip"
    )
    const personaDiagnostics = useMemo<ThreadPersonaInfo>(() => {
        const options =
            "error" in personaOptions
                ? []
                : [...personaOptions.builtIns, ...personaOptions.userPersonas]

        // Existing thread: trust the persona snapshot stored on the thread, not the composer.
        if (devThreadDoc?.personaSource) {
            const option = options.find(
                (persona) =>
                    persona.source === devThreadDoc.personaSource &&
                    persona.id === devThreadDoc.personaSourceId
            )
            return {
                isPersonaThread: true,
                name: devThreadDoc.personaName ?? option?.name ?? null,
                kind: devThreadDoc.personaSource,
                defaultModelId: option?.defaultModelId ?? null,
                currentModelId: selectedModel ?? null,
                avatarKey: devThreadDoc.personaAvatarValue ?? option?.avatarValue ?? null,
                id: devThreadDoc.personaSourceId ?? null,
                description: option?.description ?? null
            }
        }

        // New/unsaved thread: fall back to the composer selection.
        return {
            isPersonaThread: selectedPersona.source !== "default",
            name: selectedPersonaOption?.name ?? null,
            kind: selectedPersonaOption?.source ?? null,
            defaultModelId: selectedPersonaOption?.defaultModelId ?? null,
            currentModelId: selectedModel ?? null,
            avatarKey: selectedPersonaOption?.avatarValue ?? null,
            id: selectedPersona.source === "default" ? null : (selectedPersona.id ?? null),
            description: selectedPersonaOption?.description ?? null
        }
    }, [devThreadDoc, personaOptions, selectedPersona, selectedPersonaOption, selectedModel])
    const diagnosticsContextModel = useMemo(() => {
        if (devModelLimits) {
            return {
                contextLength: devModelLimits.contextLength ?? undefined,
                maxTokens: devModelLimits.maxTokens ?? undefined,
                inputUsdPer1MTokens: devModelLimits.inputUsdPer1MTokens ?? undefined,
                hostedContextLength: devModelLimits.hostedContextLength ?? undefined
            }
        }
        return sharedModels.find((model) => model.id === selectedModel) ?? null
    }, [devModelLimits, sharedModels, selectedModel])
    usePublishThreadDiagnostics({
        threadId: threadId ?? null,
        messages: deferredMessages,
        persona: personaDiagnostics,
        contextModel: diagnosticsContextModel,
        hasPricing: Boolean(devModelLimits?.hasPricing)
    })

    useEffect(() => {
        setMessagesRef.current = chatHelpers.setMessages
    }, [chatHelpers.setMessages])

    const resetAll = useCallback(() => {
        console.log("[chat] resetAll")
        // A deliberate New Chat leaves persona onboarding behind. Clear the
        // durable handoff before resetting Zustand so the handoff effect cannot
        // immediately restore the synthetic opening.
        clearPersonaOnboardingHandoff()
        setMessagesRef.current([])
        resetChat()
    }, [resetChat])

    useEffect(() => {
        if (!isActiveRoute) {
            return
        }

        document.addEventListener("new_chat", resetAll)
        return () => {
            document.removeEventListener("new_chat", resetAll)
        }
    }, [isActiveRoute, resetAll])

    if (!session?.user && !isPending) {
        return (
            <div className="relative flex h-[calc(100dvh-var(--app-header-height))] items-center justify-center">
                <SignupMessagePrompt />
            </div>
        )
    }

    return (
        <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex h-[calc(100dvh-var(--app-header-height))] flex-col"
        >
            <FullPageDropOverlay onDrop={handleFileDrop} enabled={isActiveRoute} />

            <Messages
                ref={messagesRef}
                messages={deferredMessages}
                onRetry={handleRetry}
                onBranch={handleBranch}
                onEditAndRetry={handleEditAndRetry}
                onQuoteSelection={handleQuoteSelection}
                status={messageRenderStatus}
                error={chatHelpers.error}
                onBottomStateChange={setIsAtBottom}
                onScrollDirectionChange={setScrollDirection}
                threadKey={threadId ?? routeThreadId ?? folderId?.toString() ?? "chat"}
                threadId={threadId ?? routeThreadId}
            />

            <motion.div
                initial={false}
                className={
                    isEmpty
                        ? "scrollbar-hide absolute inset-0 z-[10] flex flex-col items-center gap-4 overflow-y-auto overscroll-contain px-4 py-3 [justify-content:safe_center] sm:gap-6 [@media(min-height:820px)]:gap-8"
                        : "pointer-events-none absolute inset-x-0 z-[10] flex flex-col items-center justify-center pb-6 md:-bottom-10"
                }
                style={
                    isEmpty
                        ? undefined
                        : {
                              bottom: "calc(-1 * var(--chat-composer-overlap))"
                          }
                }
            >
                <AnimatePresence initial={false} mode="sync">
                    {isEmpty ? (
                        <motion.div
                            key="composer-hero"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="flex flex-col items-center"
                        >
                            {hasSelectedPersonaAvatar && selectedPersonaOption ? (
                                <PersonaAvatar
                                    name={selectedPersonaOption.name}
                                    avatarKind={selectedPersonaOption.avatarKind}
                                    avatarValue={selectedPersonaOption.avatarValue}
                                    className="mb-6 size-16 border-2 border-border shadow-sm"
                                    rounded="full"
                                />
                            ) : (
                                <>
                                    <ChatMascot
                                        isCurious={isComposerActive}
                                        className="mb-3 size-24 sm:mb-5 sm:size-28 [@media(max-height:620px)]:hidden [@media(min-height:820px)]:size-32"
                                    />
                                    <ChatMascot
                                        variant="face"
                                        isCurious={isComposerActive}
                                        className="mb-1 hidden size-14 [@media(max-height:480px)]:hidden [@media(max-height:620px)]:block"
                                    />
                                </>
                            )}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                className="text-center [@media(max-height:480px)]:hidden"
                            >
                                {!selectedPersonaOption && (
                                    <h1 className="px-4 font-medium text-3xl text-foreground">
                                        {userName
                                            ? `What's up, ${userName?.split(" ")[0]}?`
                                            : "What do you want to explore?"}
                                    </h1>
                                )}
                                {selectedPersonaOption && (
                                    <div className="mt-4 space-y-4 px-4">
                                        <div className="mx-auto max-w-2xl space-y-1">
                                            <p className="font-medium text-lg">
                                                {selectedPersonaOption.name}
                                            </p>
                                            <p className="text-muted-foreground text-sm">
                                                {selectedPersonaOption.description}
                                            </p>
                                        </div>
                                        {selectedPersonaOption.conversationStarters.length > 0 && (
                                            <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2">
                                                {selectedPersonaOption.conversationStarters.map(
                                                    (starter) => (
                                                        <button
                                                            key={starter}
                                                            type="button"
                                                            className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                                                            onClick={() => {
                                                                multimodalInputRef.current?.setValue(
                                                                    starter
                                                                )
                                                            }}
                                                        >
                                                            {starter}
                                                        </button>
                                                    )
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="bottom-controls"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="pointer-events-none absolute inset-x-0 bottom-full mb-2 flex flex-col items-center gap-2"
                        >
                            {suggestedReplies.length > 0 && (
                                <div className="pointer-events-auto flex max-w-3xl flex-wrap justify-center gap-2 px-4">
                                    {suggestedReplies.map((reply) => (
                                        <button
                                            key={reply}
                                            type="button"
                                            className="rounded-[var(--radius-xl)] border border-border bg-background/70 px-3 py-1.5 text-left text-sm backdrop-blur transition-colors hover:bg-accent"
                                            onClick={() => handleInputSubmitWithScroll(reply, [])}
                                        >
                                            {reply}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="pointer-events-auto">
                                <StickToBottomButton
                                    isAtBottom={isAtBottom}
                                    scrollDirection={scrollDirection}
                                    scrollToBottom={() =>
                                        messagesRef.current?.scrollToBottom("smooth")
                                    }
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className={isEmpty ? "w-full max-w-4xl" : "relative z-10 w-full"}>
                    <MultimodalInput
                        ref={multimodalInputRef}
                        onSubmit={handleInputSubmitWithScroll}
                        status={composerStatus}
                        threadId={threadId}
                        folderId={folderId}
                        isActive={isActiveRoute}
                        showIntentShortcuts={isEmpty && selectedPersona.source === "default"}
                        threadHasPdfAttachments={threadHasPdfAttachments}
                        messages={deferredMessages}
                        onInputActivityChange={setIsComposerActive}
                    />
                </div>
                {!isEmpty && (
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 top-1/2 bottom-0 z-0 bg-sidebar/45 backdrop-blur-md [mask-image:linear-gradient(to_bottom,transparent_0%,black_100%)]"
                    />
                )}
            </motion.div>
        </motion.div>
    )
}

export const Chat = ({ threadId, folderId, isActiveRoute = true }: ChatProps) => {
    return <ChatContent threadId={threadId} folderId={folderId} isActiveRoute={isActiveRoute} />
}
import { useCurrentUserSettings } from "@/hooks/use-current-user-settings"
