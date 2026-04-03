import type { useChatIntegration } from "@/hooks/use-chat-integration"
import { browserEnv } from "@/lib/browser-env"
import { useChatStore } from "@/lib/chat-store"
import { getChatWidthClass, useChatWidthStore } from "@/lib/chat-width-store"
import { getFileTypeInfo } from "@/lib/file_constants"
import { getMessageReasoningDetails } from "@/lib/message-reasoning"
import { useModelStore } from "@/lib/model-store"
import { useSharedModels } from "@/lib/shared-models"
import { cn } from "@/lib/utils"
import { useLocation } from "@tanstack/react-router"
import type { FileUIPart, UIMessage, UIToolInvocation } from "ai"
import { Code, FileType, FileType2, Image as ImageIcon, RotateCcw, Trash2, X } from "lucide-react"
import { ArrowUp, MoreHorizontal } from "lucide-react"
import { memo, useState } from "react"
import { useMemo } from "react"
import type { useStickToBottom } from "use-stick-to-bottom"
import { ChatActions } from "./chat-actions"
import { MemoizedMarkdown } from "./memoized-markdown"
import { ModelSelector } from "./model-selector"
import {
    AspectRatioSelector,
    ImageResolutionSelector,
    ReasoningEffortSelector
} from "./multimodal-input"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "./reasoning"
import { GenericToolRenderer } from "./renderers/generic-tool"
import { ImageGenerationToolRenderer } from "./renderers/image-generation-ui"
import { WebSearchToolRenderer } from "./renderers/web-search-ui"
import { ToolSelectorPopover } from "./tool-selector-popover"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "./ui/dropdown-menu"
import { Loader } from "./ui/loader"
import { Textarea } from "./ui/textarea"

const extractFileName = (url: string) => {
    if (url.startsWith("data:")) return "Inline file"

    const match = url.match(/[?&]key=([^&]+)/)
    const key = match?.[1] ? decodeURIComponent(match[1]) : url
    const extracted = key.startsWith("attachments/")
        ? (key.split("/").pop() ?? "")
        : (key.split("/").pop() ?? "")
    return extracted.length > 51 ? extracted.slice(51) : extracted
}

const getFileIcon = (part: { url: string; filename?: string; mediaType?: string }) => {
    const resolvedFileName = part.filename || extractFileName(part.url)
    const { isImage, isCode, isPdf } = getFileTypeInfo(resolvedFileName, part.mediaType)

    if (isImage) return <ImageIcon className="size-4 text-blue-500" />
    if (isCode) return <Code className="size-4 text-green-500" />
    if (isPdf) return <FileType2 className="size-4 text-gray-500" />
    return <FileType className="size-4 text-gray-500" />
}

const FileAttachment = memo(
    ({
        part,
        onPreview
    }: {
        part: { url: string; filename?: string; mediaType?: string }
        onPreview?: () => void
    }) => {
        const extractedFileName = extractFileName(part.url)
        const fileName = part.filename || extractedFileName
        const { isImage } = getFileTypeInfo(fileName, part.mediaType)
        const [imageError, setImageError] = useState(false)

        const handleInteraction = () => {
            if (onPreview) {
                onPreview()
            }
        }

        const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                handleInteraction()
            }
        }

        const handleImageError = () => {
            setImageError(true)
        }

        if (isImage) {
            if (imageError) {
                return (
                    <div className="group relative flex w-full max-w-md items-center justify-center rounded-lg border border-destructive/50 bg-destructive/10 p-8 transition-colors">
                        <div className="text-center">
                            <ImageIcon className="mx-auto mb-2 h-12 w-12 text-destructive/70" />
                            <p className="font-medium text-destructive text-sm">
                                Image unavailable
                            </p>
                            <p className="mt-1 text-muted-foreground text-xs">
                                File may have been deleted
                            </p>
                            {fileName !== "Unknown file" && (
                                <p className="mt-1 text-muted-foreground text-xs">{fileName}</p>
                            )}
                        </div>
                    </div>
                )
            }

            return (
                <img
                    src={
                        part.url.startsWith("http") || part.url.startsWith("data:")
                            ? part.url
                            : `${browserEnv("VITE_CONVEX_API_URL")}${part.url}`
                    }
                    alt={fileName}
                    className="w-full max-w-md cursor-pointer rounded-lg object-contain transition-opacity hover:opacity-90"
                    onClick={handleInteraction}
                    onKeyDown={handleKeyDown}
                    onError={handleImageError}
                    tabIndex={onPreview ? 0 : -1}
                    role={onPreview ? "button" : undefined}
                />
            )
        }

        return (
            <div
                className="group relative inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-secondary/50 p-3 transition-colors hover:bg-secondary/80"
                onClick={handleInteraction}
                onKeyDown={handleKeyDown}
                tabIndex={onPreview ? 0 : -1}
                role={onPreview ? "button" : undefined}
            >
                <div className="flex items-center gap-2">
                    {getFileIcon(part)}
                    <div className="flex flex-col">
                        <span className="font-medium text-sm">{fileName}</span>
                        <span className="text-muted-foreground text-xs">File</span>
                    </div>
                </div>
            </div>
        )
    }
)
FileAttachment.displayName = "FileAttachment"

const PartsRenderer = memo(
    ({
        part,
        markdown,
        id,
        onFilePreview,
        isStreaming
    }: {
        part: UIMessage["parts"][number]
        markdown: boolean
        id: string
        onFilePreview?: (part: { url: string; filename?: string; mediaType?: string }) => void
        isStreaming?: boolean
    }) => {
        switch (part.type) {
            case "text":
                return markdown ? (
                    <MemoizedMarkdown content={part.text} id={id} />
                ) : (
                    <div>
                        {part.text.split("\n").map((line, index) => (
                            <div key={index}>{line}</div>
                        ))}
                    </div>
                )
            case "reasoning": {
                const hasReasoningContent = part.text && part.text.trim() !== ""
                const isReasoningStreaming = isStreaming && part.state !== "done"

                return (
                    <Reasoning className="mb-6" isStreaming={isReasoningStreaming}>
                        <ReasoningTrigger className="mb-4">Reasoning</ReasoningTrigger>
                        <ReasoningContent
                            markdown={markdown}
                            className="rounded-lg border bg-muted/50"
                            contentClassName="prose prose-p:my-0 prose-pre:my-2 prose-ul:my-2 prose-li:mt-1 prose-li:mb-0 max-w-none prose-pre:bg-transparent p-4 prose-pre:p-0 font-claude-message prose-headings:font-semibold prose-strong:font-medium prose-pre:text-foreground leading-[1.65rem] [&>div>div>:is(p,blockquote,h1,h2,h3,h4,h5,h6)]:pl-2 [&>div>div>:is(p,blockquote,ul,ol,h1,h2,h3,h4,h5,h6)]:pr-8 [&_.ignore-pre-bg>div]:bg-transparent [&_pre>div]:border-0.5 [&_pre>div]:border-border [&_pre>div]:bg-background"
                        >
                            {hasReasoningContent ? part.text : ""}
                        </ReasoningContent>
                    </Reasoning>
                )
            }
            case "tool-web_search":
                return <WebSearchToolRenderer toolInvocation={part} />
            case "tool-image_generation":
                return <ImageGenerationToolRenderer toolInvocation={part} />
            case "dynamic-tool":
                return (
                    <GenericToolRenderer
                        toolInvocation={part as UIToolInvocation<unknown>}
                        toolName={part.toolName}
                    />
                )
            case "file":
                return <FileAttachment part={part} onPreview={() => onFilePreview?.(part)} />
        }
    }
)
PartsRenderer.displayName = "PartsRenderer"

const EditableMessage = memo(
    ({
        message,
        onSave,
        onCancel
    }: {
        message: UIMessage
        onSave: (
            newContent: string,
            remainingFileParts?: FileUIPart[],
            deletedUrls?: string[]
        ) => void
        onCancel: () => void
    }) => {
        const location = useLocation()
        const threadId = location.pathname.includes("/thread/")
            ? location.pathname.split("/thread/")[1]?.split("/")[0]
            : undefined

        const { selectedModel, setSelectedModel, enabledTools, setEnabledTools } = useModelStore()
        const { models: sharedModels } = useSharedModels()

        const [
            modelSupportsFunctionCalling,
            isImageModel,
            modelSupportsImageSizing,
            modelSupportsImageResolution
        ] = useMemo(() => {
            if (!selectedModel) return [false, false, false, false]
            const model = sharedModels.find((m) => m.id === selectedModel)
            return [
                model?.abilities.includes("function_calling") ?? false,
                model?.mode === "image",
                (model?.supportedImageSizes?.length ?? 0) > 0,
                (model?.supportedImageResolutions?.length ?? 0) > 0
            ]
        }, [selectedModel, sharedModels])

        const textContent = message.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n")

        const fileParts = message.parts.filter((p): p is FileUIPart => p.type === "file")

        const [editedContent, setEditedContent] = useState(textContent)
        const [deletedUrls, setDeletedUrls] = useState<string[]>([])

        const handleSave = () => {
            const remainingFileParts = fileParts.filter((p) => !deletedUrls.includes(p.url))
            onSave(
                editedContent,
                remainingFileParts.length > 0 ? remainingFileParts : undefined,
                deletedUrls.length > 0 ? deletedUrls : undefined
            )
        }

        const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSave()
            }
            if (e.key === "Escape") {
                onCancel()
            }
        }

        return (
            <div className="rounded-2xl bg-primary">
                <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className=" my-12 w-full resize-none border-none bg-transparent p-4 pb-2 text-primary-foreground shadow-none outline-none placeholder:text-muted-foreground focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />

                {fileParts.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-4 pb-2">
                        {fileParts.map((part, index) => {
                            const { isImage } = getFileTypeInfo(
                                part.filename || extractFileName(part.url),
                                part.mediaType
                            )
                            const isRemoved = deletedUrls.includes(part.url)
                            const isMultiFile = fileParts.length > 1

                            const handleToggleRemove = () => {
                                setDeletedUrls((prev) =>
                                    prev.includes(part.url)
                                        ? prev.filter((url) => url !== part.url)
                                        : [...prev, part.url]
                                )
                            }

                            return (
                                <div
                                    key={index}
                                    className={cn(
                                        "group relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary-foreground/20 bg-primary-foreground/10",
                                        isMultiFile || !isImage
                                            ? "h-14 w-auto min-w-14 pr-3"
                                            : "h-auto max-h-64 w-auto max-w-full",
                                        !isImage && !isMultiFile && "w-auto px-3",
                                        isImage && isMultiFile && "w-16 pr-0",
                                        isRemoved && "opacity-50 grayscale-[50%]"
                                    )}
                                >
                                    {isImage ? (
                                        <img
                                            src={
                                                part.url.startsWith("http") ||
                                                part.url.startsWith("data:")
                                                    ? part.url
                                                    : `${browserEnv("VITE_CONVEX_API_URL")}${part.url}`
                                            }
                                            alt="Attachment"
                                            className={cn(
                                                "object-cover",
                                                isMultiFile
                                                    ? "h-full w-full"
                                                    : "h-auto max-h-64 w-auto"
                                            )}
                                        />
                                    ) : (
                                        <div className="flex items-center gap-2 pl-2 text-primary-foreground">
                                            {getFileIcon(part)}
                                            <div className="flex min-w-0 flex-col">
                                                <span className="max-w-[100px] truncate font-medium text-xs">
                                                    {extractFileName(part.url)}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {isRemoved && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-background/20 backdrop-blur-[1px]">
                                            <Trash2 className="size-6 text-destructive drop-shadow-md" />
                                        </div>
                                    )}

                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="icon"
                                        onClick={handleToggleRemove}
                                        title={
                                            isRemoved
                                                ? "Restore attachment"
                                                : "Remove attachment from message"
                                        }
                                        className={cn(
                                            "absolute h-6 w-6 rounded-full opacity-0 transition-opacity group-hover:opacity-100",
                                            isRemoved
                                                ? "top-1 right-1 bg-background/80 text-foreground"
                                                : "bg-background/50 text-foreground hover:bg-destructive hover:text-destructive-foreground",
                                            !isRemoved &&
                                                (!isMultiFile && !isImage
                                                    ? "-translate-y-1/2 top-1/2 right-2"
                                                    : "top-1 right-1")
                                        )}
                                    >
                                        {isRemoved ? (
                                            <RotateCcw className="size-3.5" />
                                        ) : (
                                            <X className="size-3.5" />
                                        )}
                                    </Button>
                                </div>
                            )
                        })}
                    </div>
                )}

                <div className="flex items-center justify-between px-4 pb-3">
                    <div className="flex flex-wrap items-center gap-2 opacity-80 transition-opacity hover:opacity-100">
                        {selectedModel && (
                            <ModelSelector
                                selectedModel={selectedModel}
                                onModelChange={setSelectedModel}
                                side="top"
                                tone="on-primary"
                                className="border-none bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
                            />
                        )}

                        {modelSupportsImageSizing && (
                            <AspectRatioSelector selectedModel={selectedModel} />
                        )}

                        {modelSupportsImageResolution && (
                            <ImageResolutionSelector selectedModel={selectedModel} />
                        )}

                        {!isImageModel && (
                            <>
                                <ToolSelectorPopover
                                    threadId={threadId}
                                    enabledTools={enabledTools}
                                    onEnabledToolsChange={setEnabledTools}
                                    modelSupportsFunctionCalling={modelSupportsFunctionCalling}
                                    tone="on-primary"
                                />
                                <ReasoningEffortSelector
                                    selectedModel={selectedModel}
                                    tone="on-primary"
                                />
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                                    title="More options"
                                >
                                    <MoreHorizontal className="size-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onClick={onCancel}
                                    className="cursor-pointer text-destructive"
                                >
                                    <X className="mr-2 size-4" /> Cancel Edit
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                            size="icon"
                            className="size-8 shrink-0 rounded-md bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                            onClick={handleSave}
                            title="Send"
                        >
                            <ArrowUp className="size-5" />
                        </Button>
                    </div>
                </div>
            </div>
        )
    }
)
EditableMessage.displayName = "EditableMessage"

export function Messages({
    messages,
    onRetry,
    onEditAndRetry,
    status,
    contentRef,
    scrollRef
}: {
    messages: UIMessage[]
    onRetry?: (message: UIMessage, modelIdOverride?: string) => void
    onEditAndRetry?: (
        messageId: string,
        newContent: string,
        remainingFileParts?: FileUIPart[],
        deletedUrls?: string[]
    ) => void
    status: ReturnType<typeof useChatIntegration>["status"]
    contentRef: ReturnType<typeof useStickToBottom>["contentRef"]
    scrollRef: ReturnType<typeof useStickToBottom>["scrollRef"]
}) {
    const { setTargetFromMessageId, targetFromMessageId, setTargetMode, targetMode } =
        useChatStore()
    const { chatWidthState } = useChatWidthStore()

    const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
    const [previewFile, setPreviewFile] = useState<{
        url: string
        filename?: string
        mediaType?: string
    } | null>(null)

    const handleEdit = (message: UIMessage) => {
        setTargetFromMessageId(message.id)
        setTargetMode("edit")
    }

    const handleSaveEdit = (
        newContent: string,
        remainingFileParts?: FileUIPart[],
        deletedUrls?: string[]
    ) => {
        if (targetFromMessageId && onEditAndRetry) {
            onEditAndRetry(targetFromMessageId, newContent, remainingFileParts, deletedUrls)
        }
        setTargetFromMessageId(undefined)
        setTargetMode("normal")
    }

    const handleCancelEdit = () => {
        setTargetFromMessageId(undefined)
        setTargetMode("normal")
    }

    const handleFilePreview = (part: { url: string; filename?: string; mediaType?: string }) => {
        setPreviewFile(part)
        setPreviewDialogOpen(true)
    }

    const fileName = previewFile?.filename || extractFileName(previewFile?.url || "")

    const renderFilePreview = () => {
        if (!previewFile) return null

        const { isImage, isText, isPdf } = getFileTypeInfo(fileName, previewFile.mediaType)

        return (
            <div className="max-h-full overflow-auto">
                {isImage && (
                    <img
                        src={
                            previewFile.url.startsWith("http") ||
                            previewFile.url.startsWith("data:")
                                ? previewFile.url
                                : `${browserEnv("VITE_CONVEX_API_URL")}${previewFile.url}`
                        }
                        alt={fileName}
                        className="h-auto w-full rounded object-contain"
                        onError={(e) => {
                            const target = e.target as HTMLImageElement
                            target.style.display = "none"
                            const errorDiv = target.nextElementSibling as HTMLElement
                            if (errorDiv) errorDiv.style.display = "flex"
                        }}
                    />
                )}

                {(isText || isPdf) && (
                    <iframe
                        src={
                            previewFile.url.startsWith("http") ||
                            previewFile.url.startsWith("data:")
                                ? previewFile.url
                                : `${browserEnv("VITE_CONVEX_API_URL")}${previewFile.url}`
                        }
                        className="h-[69dvh] w-full rounded border-0"
                        title={fileName}
                    />
                )}
            </div>
        )
    }

    const lastMessage = messages[messages.length - 1]
    const lastMessageReasoning = lastMessage ? getMessageReasoningDetails(lastMessage) : null
    const isStreamingWithoutContent =
        status === "streaming" &&
        lastMessage?.role === "assistant" &&
        (!lastMessage.parts ||
            lastMessage.parts.length === 0 ||
            lastMessage.parts.every(
                (part) =>
                    (part.type === "text" && (!part.text || part.text.trim() === "")) ||
                    (part.type === "reasoning" && !lastMessageReasoning)
            ))

    const showTypingLoader = status === "submitted" || isStreamingWithoutContent

    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")

    return (
        <>
            <div className="min-h-[90dvh] overflow-y-auto p-4 pt-0" ref={scrollRef}>
                <div
                    ref={contentRef}
                    className={cn(
                        "mx-auto space-y-3 pb-16",
                        getChatWidthClass(chatWidthState.chatWidth)
                    )}
                >
                    {messages.map((message) =>
                        (() => {
                            const reasoning = getMessageReasoningDetails(message)
                            const inlineParts = message.parts.filter(
                                (part) => part.type !== "file" && part.type !== "reasoning"
                            )
                            const fileParts = message.parts.filter((part) => part.type === "file")

                            return (
                                <div
                                    key={message.id}
                                    className={cn(
                                        "prose relative prose-ol:my-2 prose-p:my-0 prose-pre:my-2 prose-ul:my-2 prose-li:mt-1 prose-li:mb-0 max-w-none prose-pre:bg-transparent prose-pre:p-0 font-claude-message prose-headings:font-semibold prose-strong:font-medium prose-pre:text-foreground leading-[1.65rem] [&>div>div>:is(p,blockquote,h1,h2,h3,h4,h5,h6)]:pl-2 [&>div>div>:is(p,blockquote,ul,ol,h1,h2,h3,h4,h5,h6)]:pr-8 [&_.ignore-pre-bg>div]:bg-transparent [&_pre>div]:border-0.5 [&_pre>div]:border-border [&_pre>div]:bg-background",
                                        "group prose-img:mx-auto prose-img:my-4 prose-pre:grid prose-code:before:hidden prose-code:after:hidden",
                                        "mb-8",
                                        message.role === "user" &&
                                            targetFromMessageId !== message.id &&
                                            "my-12 ml-auto w-fit max-w-md rounded-md border border-border bg-secondary/50 px-4 py-2 text-foreground"
                                    )}
                                >
                                    {targetFromMessageId === message.id && targetMode === "edit" ? (
                                        <EditableMessage
                                            message={message}
                                            onSave={handleSaveEdit}
                                            onCancel={handleCancelEdit}
                                        />
                                    ) : (
                                        <>
                                            <div className="prose-p:not-last:mb-4 max-w-[calc(100vw-2rem)] overflow-hidden">
                                                {reasoning && (
                                                    <Reasoning
                                                        className="mb-6"
                                                        isStreaming={
                                                            status === "streaming" &&
                                                            message === lastMessage &&
                                                            reasoning.isStreaming
                                                        }
                                                    >
                                                        <ReasoningTrigger className="mb-4">
                                                            Reasoning
                                                        </ReasoningTrigger>
                                                        <ReasoningContent
                                                            markdown={message.role === "assistant"}
                                                            className="rounded-lg border bg-muted/50"
                                                            contentClassName="prose prose-p:my-0 prose-pre:my-2 prose-ul:my-2 prose-li:mt-1 prose-li:mb-0 max-w-none prose-pre:bg-transparent p-4 prose-pre:p-0 font-claude-message prose-headings:font-semibold prose-strong:font-medium prose-pre:text-foreground leading-[1.65rem] [&>div>div>:is(p,blockquote,h1,h2,h3,h4,h5,h6)]:pl-2 [&>div>div>:is(p,blockquote,ul,ol,h1,h2,h3,h4,h5,h6)]:pr-8 [&_.ignore-pre-bg>div]:bg-transparent [&_pre>div]:border-0.5 [&_pre>div]:border-border [&_pre>div]:bg-background"
                                                        >
                                                            {reasoning.text}
                                                        </ReasoningContent>
                                                    </Reasoning>
                                                )}

                                                {inlineParts.map((part, index) => (
                                                    <PartsRenderer
                                                        key={`${message.id}-text-${index}`}
                                                        part={part}
                                                        markdown={message.role === "assistant"}
                                                        id={`${message.id}-text-${index}`}
                                                        onFilePreview={handleFilePreview}
                                                        isStreaming={
                                                            status === "streaming" &&
                                                            message === lastMessage
                                                        }
                                                    />
                                                ))}
                                            </div>

                                            {fileParts.length > 0 && (
                                                <div className="not-prose mt-3 flex flex-col justify-start space-y-3">
                                                    {fileParts.map((part, index) => (
                                                        <PartsRenderer
                                                            key={`${message.id}-file-${index}`}
                                                            part={part}
                                                            markdown={message.role === "assistant"}
                                                            id={`${message.id}-file-${index}`}
                                                            onFilePreview={handleFilePreview}
                                                            isStreaming={
                                                                status === "streaming" &&
                                                                message === lastMessage
                                                            }
                                                        />
                                                    ))}
                                                </div>
                                            )}

                                            {!targetFromMessageId && message.role === "user" ? (
                                                <ChatActions
                                                    role={message.role}
                                                    message={message}
                                                    onRetry={onRetry}
                                                    onEdit={handleEdit}
                                                />
                                            ) : !targetFromMessageId &&
                                              message.role === "assistant" ? (
                                                <ChatActions
                                                    role={message.role}
                                                    message={message}
                                                    onRetry={undefined}
                                                    onEdit={undefined}
                                                />
                                            ) : null}
                                        </>
                                    )}
                                </div>
                            )
                        })()
                    )}

                    {status === "error" && (
                        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive p-4">
                            <div className="flex w-full items-center justify-between">
                                <p className="text-destructive-foreground">
                                    Oops! Something went wrong.
                                </p>
                                {lastUserMessage && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => onRetry?.(lastUserMessage)}
                                        className="text-destructive-foreground hover:text-destructive-foreground/80"
                                    >
                                        <RotateCcw />
                                        Retry
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex min-h-[3rem] items-center gap-2 py-4">
                        {showTypingLoader && <Loader variant="typing" size="md" />}
                    </div>
                </div>
            </div>

            <Dialog
                open={previewDialogOpen}
                onOpenChange={(open) => {
                    setPreviewDialogOpen(open)
                    if (!open) {
                        setTimeout(() => setPreviewFile(null), 100)
                    }
                }}
            >
                <DialogContent className="md:!max-w-[min(90vw,60rem)] max-h-[90dvh]">
                    {previewFile && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    {getFileIcon(previewFile)}
                                    {fileName || "Unknown file"}
                                </DialogTitle>
                            </DialogHeader>
                            {renderFilePreview()}
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
