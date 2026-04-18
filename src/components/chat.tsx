import { Messages, type MessagesHandle } from "@/components/messages"
import { PersonaAvatar } from "@/components/persona-avatar"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useSession } from "@/hooks/auth-hooks"
import { useChatActions } from "@/hooks/use-chat-actions"
import { useChatDataProcessor } from "@/hooks/use-chat-data-processor"
import { useChatIntegration } from "@/hooks/use-chat-integration"
import { useDynamicTitle } from "@/hooks/use-dynamic-title"
import { useThreadSync } from "@/hooks/use-thread-sync"
import { type UploadedFile, useChatStore } from "@/lib/chat-store"
import { useDiskCachedQuery } from "@/lib/convex-cached-query"
import {
    OPEN_MODEL_PICKER_SHORTCUT_EVENT,
    isShortcutModifierPressed
} from "@/lib/keyboard-shortcuts"
import { useModelStore } from "@/lib/model-store"
import { useDefaultModelId } from "@/lib/models-providers-shared"
import { useThemeStore } from "@/lib/theme-store"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { FullPageDropOverlay } from "./full-page-drop-overlay"
import { Logo } from "./logo"
import { MultimodalInput, type MultimodalInputRef } from "./multimodal-input"
import { SignupMessagePrompt } from "./signup-message-prompt"
import { StickToBottomButton } from "./stick-to-bottom-button"

interface ChatProps {
    threadId: string | undefined
    folderId?: Id<"projects">
    isActiveRoute?: boolean
}

const ChatContent = ({ threadId: routeThreadId, folderId, isActiveRoute = true }: ChatProps) => {
    const { selectedModel, setSelectedModel } = useModelStore()
    const { threadId } = useThreadSync({ routeThreadId })
    const messagesRef = useRef<MessagesHandle>(null)
    const [isAtBottom, setIsAtBottom] = useState(true)
    const { themeState } = useThemeStore()
    const mode = themeState.currentMode
    const { data: session, isPending } = useSession()
    const defaultModelId = useDefaultModelId()
    const multimodalInputRef = useRef<MultimodalInputRef>(null)

    useDynamicTitle({ threadId, enabled: isActiveRoute })

    useEffect(() => {
        if (!selectedModel && defaultModelId) {
            setSelectedModel(defaultModelId)
        }
    }, [defaultModelId, selectedModel, setSelectedModel])

    useEffect(() => {
        if (!isActiveRoute) {
            return
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (!isShortcutModifierPressed(event) || event.shiftKey || event.altKey) {
                return
            }

            if (event.key !== "/") {
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
    const { status, messages, ...chatHelpers } = chat
    const setMessagesRef = useRef(chatHelpers.setMessages)

    const { handleInputSubmit, handleRetry, handleEditAndRetry } = useChatActions({
        threadId,
        folderId,
        chat
    })

    useChatDataProcessor({ messages, status })

    const handleInputSubmitWithScroll = (inputValue?: string, fileValues?: UploadedFile[]) => {
        handleInputSubmit(inputValue, fileValues)
        messagesRef.current?.scrollToBottom("smooth")
    }

    const handleFileDrop = useCallback((files: File[]) => {
        multimodalInputRef.current?.handleFileUpload(files)
    }, [])

    const isEmpty = messages.length === 0 && !threadId
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

    const { resetChat, selectedPersona } = useChatStore()
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

    useEffect(() => {
        setMessagesRef.current = chatHelpers.setMessages
    }, [chatHelpers.setMessages])

    const resetAll = useCallback(() => {
        console.log("[chat] resetAll")
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
            <div className="relative flex h-[calc(100dvh-64px)] items-center justify-center">
                <SignupMessagePrompt />
            </div>
        )
    }

    return (
        <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex h-[calc(100dvh-64px)] flex-col"
        >
            <FullPageDropOverlay onDrop={handleFileDrop} enabled={isActiveRoute} />

            <Messages
                ref={messagesRef}
                messages={messages}
                onRetry={handleRetry}
                onEditAndRetry={handleEditAndRetry}
                status={status}
                onBottomStateChange={setIsAtBottom}
                threadKey={threadId ?? routeThreadId ?? folderId?.toString() ?? "chat"}
            />

            <motion.div
                initial={false}
                className={
                    isEmpty
                        ? "absolute inset-0 z-[10] flex flex-col items-center justify-center gap-8 px-4"
                        : "-bottom-[3.875rem] md:-bottom-10 absolute inset-x-0 z-[10] flex flex-col items-center justify-center"
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
                                <div className="mb-6 size-16 rounded-full border-2 opacity-80">
                                    <Logo />
                                </div>
                            )}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                className="text-center"
                            >
                                {!selectedPersonaOption && (
                                    <h1 className="px-4 font-medium text-3xl text-foreground">
                                        {userName
                                            ? `What do you want to explore, ${userName?.split(" ")[0]}?`
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
                            className="pointer-events-none absolute inset-x-0 bottom-full mb-2 flex justify-center"
                        >
                            <div className="pointer-events-auto">
                                <StickToBottomButton
                                    isAtBottom={isAtBottom}
                                    scrollToBottom={() =>
                                        messagesRef.current?.scrollToBottom("smooth")
                                    }
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className={isEmpty ? "w-full max-w-4xl" : "w-full"}>
                    <MultimodalInput
                        ref={multimodalInputRef}
                        onSubmit={handleInputSubmitWithScroll}
                        status={status}
                        threadId={threadId}
                        isActive={isActiveRoute}
                    />
                </div>
            </motion.div>
        </motion.div>
    )
}

export const Chat = ({ threadId, folderId, isActiveRoute = true }: ChatProps) => {
    return <ChatContent threadId={threadId} folderId={folderId} isActiveRoute={isActiveRoute} />
}
