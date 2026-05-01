import { SupermemoryIcon } from "@/components/brand-icons"
import { ModelSelector } from "@/components/model-selector"
import { PersonaSelector } from "@/components/persona-selector"
import {
    PromptInput,
    PromptInputAction,
    PromptInputActions,
    type PromptInputRef,
    PromptInputTextarea
} from "@/components/prompt-kit/prompt-input"
import { ToolSelectorPopover } from "@/components/tool-selector-popover"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { VoiceRecorder } from "@/components/voice-recorder"
import { api } from "@/convex/_generated/api"
import type { ImageResolution, ImageSize, SharedModel } from "@/convex/lib/models"
import { useSession, useToken } from "@/hooks/auth-hooks"
import { useVoiceRecorder } from "@/hooks/use-voice-recorder"
import { resolveJwtToken } from "@/lib/auth-token"
import { browserEnv, optionalBrowserEnv } from "@/lib/browser-env"
import { type UploadedFile, useChatStore } from "@/lib/chat-store"
import { getChatWidthClass, useChatWidthStore } from "@/lib/chat-width-store"
import { useDiskCachedQuery } from "@/lib/convex-cached-query"
import { DefaultSettings } from "@/lib/default-user-settings"
import {
    MAX_FILE_SIZE,
    MAX_TOKENS_PER_FILE,
    estimateTokenCount,
    getFileAcceptAttribute,
    getFileTypeInfo,
    isImageMimeType,
    isSupportedFile,
    isSvgExtension,
    isSvgMimeType,
    isTextMimeType
} from "@/lib/file_constants"
import { useModelStore } from "@/lib/model-store"
import {
    getAllowedReasoningEffortsForModel,
    getPrototypeCreditTierForModel,
    getReasoningEffortForPlan,
    getReasoningEffortLabelForModel,
    getRequiredPlanToPickModel
} from "@/lib/models-providers-shared"
import { resolveMultimodalSubmitAction } from "@/lib/multimodal-submit-action"
import { useSharedModels } from "@/lib/shared-models"
import type { AbilityId } from "@/lib/tool-abilities"
import { cn } from "@/lib/utils"
import type { useChat } from "@ai-sdk/react"
import { useConvexAuth } from "convex/react"
import {
    ArrowUp,
    Brain,
    Check,
    ChevronDown,
    ChevronUp,
    Code,
    Crown,
    FileType,
    Globe,
    Image as ImageIcon,
    Loader2,
    Mic,
    MoreHorizontal,
    Paperclip,
    Square,
    X,
    Zap
} from "lucide-react"
import { motion } from "motion/react"
import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState
} from "react"
import { toast } from "sonner"

interface ExtendedUploadedFile extends UploadedFile {
    file?: File
}

interface LocalUploadingFile {
    id: string
    file: File
    progress: number
    status: "uploading" | "success" | "error"
    previewUrl?: string
    error?: string
}

const IMAGE_COMPRESSION_CUTOFF_BYTES = 25 * 1024 * 1024
const IMAGE_COMPRESSION_STEPS = [
    { quality: 0.86, maxDimension: 4096 },
    { quality: 0.78, maxDimension: 3072 },
    { quality: 0.68, maxDimension: 2560 },
    { quality: 0.56, maxDimension: 2048 }
] as const

export const AspectRatioSelector = ({ selectedModel }: { selectedModel: string | null }) => {
    const { selectedImageSize, setSelectedImageSize } = useModelStore()
    const { models: sharedModels } = useSharedModels()

    const supportedImageSizes = useMemo(() => {
        if (!selectedModel) return []
        const model = sharedModels.find((m) => m.id === selectedModel)
        return model?.supportedImageSizes || []
    }, [selectedModel, sharedModels])

    // Auto-select a valid image size when the model changes
    useEffect(() => {
        if (supportedImageSizes.length > 0) {
            // Check if current selection is supported
            if (!supportedImageSizes.includes(selectedImageSize)) {
                // Try "1:1" first, otherwise pick the first supported size
                const defaultSize = supportedImageSizes.includes("1:1" as ImageSize)
                    ? ("1:1" as ImageSize)
                    : supportedImageSizes[0]
                setSelectedImageSize(defaultSize)
            }
        }
    }, [supportedImageSizes, selectedImageSize, setSelectedImageSize])

    const formatImageSizeForDisplay = (size: string) => {
        // Convert resolution format (1024x1024) to aspect ratio (1:1)
        if (size.includes("x")) {
            const [width, height] = size.split("x").map(Number)
            const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
            const divisor = gcd(width, height)
            return `${width / divisor}:${height / divisor}`
        }

        // Handle HD variants
        if (size.endsWith("-hd")) {
            return size.replace("-hd", " (HD)")
        }

        return size
    }

    if (supportedImageSizes.length === 0) return null

    return (
        <PromptInputAction tooltip="Select aspect ratio">
            <Select value={selectedImageSize} onValueChange={setSelectedImageSize}>
                <SelectTrigger className="!h-8 w-auto min-w-[80px] border bg-secondary/70 font-normal text-xs backdrop-blur-lg hover:bg-secondary/80 sm:text-sm">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {supportedImageSizes.map((size) => (
                        <SelectItem key={size} value={size} className="text-xs sm:text-sm">
                            {formatImageSizeForDisplay(size)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </PromptInputAction>
    )
}

export const ImageResolutionSelector = ({ selectedModel }: { selectedModel: string | null }) => {
    const { selectedImageResolution, setSelectedImageResolution } = useModelStore()
    const { models: sharedModels } = useSharedModels()

    const supportedImageResolutions = useMemo(() => {
        if (!selectedModel) return []
        const model = sharedModels.find((m) => m.id === selectedModel)
        return model?.supportedImageResolutions || []
    }, [selectedModel, sharedModels])

    useEffect(() => {
        if (supportedImageResolutions.length === 0) return
        if (!supportedImageResolutions.includes(selectedImageResolution)) {
            setSelectedImageResolution(
                (supportedImageResolutions.includes("1K" as ImageResolution)
                    ? "1K"
                    : supportedImageResolutions[0]) as ImageResolution
            )
        }
    }, [selectedImageResolution, setSelectedImageResolution, supportedImageResolutions])

    if (supportedImageResolutions.length === 0) return null

    return (
        <PromptInputAction tooltip="Select output resolution">
            <Select value={selectedImageResolution} onValueChange={setSelectedImageResolution}>
                <SelectTrigger className="!h-8 w-auto min-w-[76px] border bg-secondary/70 font-normal text-xs backdrop-blur-lg hover:bg-secondary/80 sm:text-sm">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {supportedImageResolutions.map((resolution) => (
                        <SelectItem
                            key={resolution}
                            value={resolution}
                            className="text-xs sm:text-sm"
                        >
                            {resolution}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </PromptInputAction>
    )
}

export const ReasoningEffortSelector = ({
    selectedModel,
    tone = "default",
    creditPlan
}: {
    selectedModel: string | null
    tone?: "default" | "on-primary"
    creditPlan?: CreditPlan | null
}) => {
    const { reasoningEffort, setReasoningEffort } = useModelStore()
    const { models: sharedModels } = useSharedModels()
    const loadedCreditPlan = usePrototypeCreditPlan(creditPlan === undefined)
    const resolvedCreditPlan = creditPlan === undefined ? loadedCreditPlan : creditPlan

    const selectedSharedModel = useMemo(
        () => sharedModels.find((model) => model.id === selectedModel),
        [selectedModel, sharedModels]
    )
    const allowedEfforts = useMemo(
        () => getAllowedReasoningEffortsForModel(selectedSharedModel),
        [selectedSharedModel]
    )
    const modelSupportsReasoningControl = allowedEfforts.length > 0

    useEffect(() => {
        if (!modelSupportsReasoningControl) return
        const resolvedEffort = getReasoningEffortForPlan(
            selectedSharedModel,
            reasoningEffort,
            resolvedCreditPlan
        )
        if (resolvedEffort && resolvedEffort !== reasoningEffort) {
            setReasoningEffort(resolvedEffort)
        }
    }, [
        modelSupportsReasoningControl,
        reasoningEffort,
        resolvedCreditPlan,
        selectedSharedModel,
        setReasoningEffort
    ])
    const isReasoningOff = reasoningEffort === "off"
    const selectedModelBaseUsesProCredits =
        selectedSharedModel !== undefined &&
        getPrototypeCreditTierForModel(selectedSharedModel, "off") === "pro"
    const selectedEffortUsesProCredits =
        resolvedCreditPlan === "pro" &&
        selectedSharedModel !== undefined &&
        !selectedModelBaseUsesProCredits &&
        getPrototypeCreditTierForModel(selectedSharedModel, reasoningEffort) === "pro"
    const reasoningLabel = getReasoningEffortLabelForModel(selectedSharedModel, reasoningEffort)

    if (!modelSupportsReasoningControl) return null

    return (
        <PromptInputAction tooltip="Select reasoning effort">
            <Select value={reasoningEffort} onValueChange={setReasoningEffort}>
                <SelectTrigger
                    className={cn(
                        "!h-8 w-auto gap-0.5 px-1.5 font-normal text-xs transition-colors sm:text-sm",
                        tone === "on-primary"
                            ? isReasoningOff
                                ? "border border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
                                : "border border-primary-foreground/20 bg-primary-foreground text-primary hover:bg-primary-foreground/90 hover:text-primary"
                            : "border-0 bg-secondary/70 backdrop-blur-lg hover:bg-accent"
                    )}
                >
                    <div className="hidden items-center gap-1.5 sm:flex">
                        {isReasoningOff ? <Zap className="size-4" /> : <Brain className="size-4" />}
                        {selectedEffortUsesProCredits && (
                            <Crown className="size-3.5 shrink-0" aria-label="Uses Pro credits" />
                        )}
                        <span>{reasoningLabel}</span>
                    </div>
                    <span className="flex items-center gap-1 sm:hidden">
                        {isReasoningOff ? <Zap className="size-4" /> : <Brain className="size-4" />}
                        {selectedEffortUsesProCredits && (
                            <Crown className="size-2.5 shrink-0" aria-label="Uses Pro credits" />
                        )}
                    </span>
                </SelectTrigger>
                <SelectContent>
                    {allowedEfforts.map((effort) => {
                        const isEffortLocked =
                            resolvedCreditPlan === "free" &&
                            selectedSharedModel !== undefined &&
                            getRequiredPlanToPickModel(selectedSharedModel, effort) === "pro"
                        const effortUsesProCredits =
                            resolvedCreditPlan === "pro" &&
                            selectedSharedModel !== undefined &&
                            !selectedModelBaseUsesProCredits &&
                            getPrototypeCreditTierForModel(selectedSharedModel, effort) === "pro"

                        return (
                            <SelectItem
                                key={effort}
                                value={effort}
                                disabled={isEffortLocked}
                                className="text-xs sm:text-sm"
                            >
                                <span className="flex w-full items-center justify-between gap-3">
                                    <span>
                                        {getReasoningEffortLabelForModel(
                                            selectedSharedModel,
                                            effort
                                        )}
                                    </span>
                                    {isEffortLocked && (
                                        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-[10px] text-primary uppercase">
                                            Pro
                                        </span>
                                    )}
                                    {effortUsesProCredits && (
                                        <Crown
                                            className="size-3.5 shrink-0"
                                            aria-label="Uses Pro credits"
                                        />
                                    )}
                                </span>
                            </SelectItem>
                        )
                    })}
                </SelectContent>
            </Select>
        </PromptInputAction>
    )
}

export interface MultimodalInputRef {
    handleFileUpload: (files: File[]) => Promise<void>
    setValue: (value: string) => void
}

const mobileMenuRowClassName =
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent/60"

type CreditPlan = "free" | "pro"

const usePrototypeCreditPlan = (enabled = true) => {
    const session = useSession()
    const auth = useConvexAuth()
    const [creditPlan, setCreditPlan] = useState<CreditPlan | null>(null)

    useEffect(() => {
        if (!enabled || !session.user?.id || auth.isLoading) {
            setCreditPlan(null)
            return
        }

        let cancelled = false

        const loadCreditPlan = async () => {
            try {
                const response = await fetch("/api/credit-summary", {
                    credentials: "include"
                })

                if (!response.ok) {
                    throw new Error("Failed to load credit summary")
                }

                const data = (await response.json()) as { plan?: CreditPlan }
                if (!cancelled) {
                    setCreditPlan(data.plan === "pro" ? "pro" : "free")
                }
            } catch {
                if (!cancelled) {
                    setCreditPlan("free")
                }
            }
        }

        void loadCreditPlan()

        return () => {
            cancelled = true
        }
    }, [auth.isLoading, enabled, session.user?.id])

    return creditPlan
}

function MobileMenuIcon({
    slashed = false,
    children
}: {
    slashed?: boolean
    children: React.ReactNode
}) {
    return (
        <span className="relative flex size-4 shrink-0 items-center justify-center">
            {children}
            {slashed && (
                <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 h-px w-[1.15rem] rotate-[-42deg] bg-current" />
            )}
        </span>
    )
}

function MobileOverflowMenu({
    open,
    onOpenChange,
    selectedModel,
    modelSupportsFunctionCalling,
    modelSupportsReasoningControl,
    isImageModel,
    modelSupportsImageSizing,
    modelSupportsImageResolution,
    allowedReasoningEfforts,
    selectedSharedModel,
    creditPlan,
    webSearchAvailable,
    hasSupermemory,
    mcpServers,
    currentMcpOverrides,
    onToggleTool,
    onToggleMcpServer,
    onAttachClick
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    selectedModel: string | null
    modelSupportsFunctionCalling: boolean
    modelSupportsReasoningControl: boolean
    isImageModel: boolean
    modelSupportsImageSizing: boolean
    modelSupportsImageResolution: boolean
    allowedReasoningEfforts: ReturnType<typeof getAllowedReasoningEffortsForModel>
    selectedSharedModel?: SharedModel
    creditPlan: CreditPlan | null
    webSearchAvailable: boolean
    hasSupermemory: boolean
    mcpServers: Array<{ name: string }>
    currentMcpOverrides: Record<string, boolean>
    onToggleTool: (tool: AbilityId) => void
    onToggleMcpServer: (serverName: string) => void
    onAttachClick: () => void
}) {
    const { enabledTools, reasoningEffort, setReasoningEffort } = useModelStore()
    const [reasoningExpanded, setReasoningExpanded] = useState(false)
    const reasoningLabel = getReasoningEffortLabelForModel(selectedSharedModel, reasoningEffort)
    const selectedModelBaseUsesProCredits =
        selectedSharedModel !== undefined &&
        getPrototypeCreditTierForModel(selectedSharedModel, "off") === "pro"
    const selectedEffortUsesProCredits =
        creditPlan === "pro" &&
        selectedSharedModel !== undefined &&
        !selectedModelBaseUsesProCredits &&
        getPrototypeCreditTierForModel(selectedSharedModel, reasoningEffort) === "pro"
    const webSearchEnabled = enabledTools.includes("web_search")
    const supermemoryEnabled = enabledTools.includes("supermemory")
    const hasMcpServers = mcpServers.length > 0

    useEffect(() => {
        if (!open) {
            setReasoningExpanded(false)
        }
    }, [open])

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-md bg-secondary/70 text-foreground backdrop-blur-lg hover:bg-secondary/80"
                >
                    <MoreHorizontal className="size-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                side="top"
                sideOffset={8}
                className="w-[min(14rem,calc(100vw-1rem))] rounded-lg border-border/70 bg-popover p-1.5 shadow-lg"
            >
                <div className="space-y-1">
                    {(modelSupportsImageSizing || modelSupportsImageResolution) && (
                        <div className="flex flex-wrap gap-2 border-border/60 border-b px-1.5 pb-2.5">
                            {modelSupportsImageSizing && (
                                <AspectRatioSelector selectedModel={selectedModel} />
                            )}
                            {modelSupportsImageResolution && (
                                <ImageResolutionSelector selectedModel={selectedModel} />
                            )}
                        </div>
                    )}

                    {modelSupportsReasoningControl && (
                        <>
                            <button
                                type="button"
                                className={mobileMenuRowClassName}
                                onClick={() => setReasoningExpanded((expanded) => !expanded)}
                            >
                                {reasoningEffort === "off" ? (
                                    <Zap className="size-4 shrink-0" />
                                ) : (
                                    <Brain className="size-4 shrink-0" />
                                )}
                                {selectedEffortUsesProCredits && (
                                    <Crown
                                        className="size-3.5 shrink-0"
                                        aria-label="Uses Pro credits"
                                    />
                                )}
                                <span className="min-w-0 flex-1 truncate">
                                    Reasoning: {reasoningLabel}
                                </span>
                                {reasoningExpanded ? (
                                    <ChevronUp className="size-4 shrink-0" />
                                ) : (
                                    <ChevronDown className="size-4 shrink-0" />
                                )}
                            </button>
                            {reasoningExpanded && (
                                <div className="space-y-1 px-2 pb-1">
                                    {allowedReasoningEfforts.map((effort) => {
                                        const effortLabel = getReasoningEffortLabelForModel(
                                            selectedSharedModel,
                                            effort
                                        )
                                        const isSelected = reasoningEffort === effort
                                        const isEffortLocked =
                                            creditPlan === "free" &&
                                            selectedSharedModel !== undefined &&
                                            getRequiredPlanToPickModel(
                                                selectedSharedModel,
                                                effort
                                            ) === "pro"
                                        const effortUsesProCredits =
                                            creditPlan === "pro" &&
                                            selectedSharedModel !== undefined &&
                                            !selectedModelBaseUsesProCredits &&
                                            getPrototypeCreditTierForModel(
                                                selectedSharedModel,
                                                effort
                                            ) === "pro"

                                        return (
                                            <button
                                                key={effort}
                                                type="button"
                                                className={cn(
                                                    "flex w-full items-center gap-2 rounded-md px-9 py-2 text-left text-sm transition-colors hover:bg-accent/60",
                                                    isSelected && "bg-accent/50 text-primary",
                                                    isEffortLocked &&
                                                        "cursor-not-allowed opacity-50 hover:bg-transparent"
                                                )}
                                                disabled={isEffortLocked}
                                                onClick={() => setReasoningEffort(effort)}
                                            >
                                                <span className="min-w-0 flex-1 truncate">
                                                    {effortLabel}
                                                </span>
                                                {isEffortLocked && (
                                                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-[10px] text-primary uppercase">
                                                        Pro
                                                    </span>
                                                )}
                                                {effortUsesProCredits && (
                                                    <Crown
                                                        className="size-3.5 shrink-0"
                                                        aria-label="Uses Pro credits"
                                                    />
                                                )}
                                                {isSelected && (
                                                    <Check className="size-4 shrink-0" />
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    )}

                    {!isImageModel && (
                        <button
                            type="button"
                            className={cn(
                                mobileMenuRowClassName,
                                (!modelSupportsFunctionCalling || !webSearchAvailable) &&
                                    "cursor-not-allowed opacity-50"
                            )}
                            disabled={!modelSupportsFunctionCalling || !webSearchAvailable}
                            onClick={() => onToggleTool("web_search")}
                        >
                            <MobileMenuIcon slashed={!webSearchEnabled}>
                                <Globe className="size-4" />
                            </MobileMenuIcon>
                            <span className="min-w-0 flex-1 truncate">
                                Search {webSearchEnabled ? "enabled" : "disabled"}
                            </span>
                        </button>
                    )}

                    {!isImageModel && (
                        <button
                            type="button"
                            className={cn(
                                mobileMenuRowClassName,
                                !hasSupermemory && "cursor-not-allowed opacity-50"
                            )}
                            disabled={!hasSupermemory}
                            onClick={() => onToggleTool("supermemory")}
                        >
                            <MobileMenuIcon slashed={!supermemoryEnabled}>
                                <SupermemoryIcon />
                            </MobileMenuIcon>
                            <span className="min-w-0 flex-1 truncate">
                                Supermemory {supermemoryEnabled ? "enabled" : "disabled"}
                            </span>
                        </button>
                    )}

                    {!isImageModel && (
                        <button
                            type="button"
                            className={mobileMenuRowClassName}
                            onClick={() => {
                                onOpenChange(false)
                                onAttachClick()
                            }}
                        >
                            <Paperclip className="size-4 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">Attach</span>
                        </button>
                    )}

                    {!isImageModel && (
                        <div className="border-border/60 border-t pt-2">
                            <p className="px-2.5 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
                                MCP Servers
                            </p>
                            <div className="space-y-1">
                                {hasMcpServers ? (
                                    mcpServers.map((server) => {
                                        const isEnabled = currentMcpOverrides[server.name] !== false

                                        return (
                                            <button
                                                key={server.name}
                                                type="button"
                                                className={mobileMenuRowClassName}
                                                onClick={() => onToggleMcpServer(server.name)}
                                            >
                                                <span className="min-w-0 flex-1 truncate">
                                                    {server.name}{" "}
                                                    {isEnabled ? "enabled" : "disabled"}
                                                </span>
                                            </button>
                                        )
                                    })
                                ) : (
                                    <button
                                        type="button"
                                        className={cn(
                                            mobileMenuRowClassName,
                                            "cursor-not-allowed opacity-50"
                                        )}
                                        disabled
                                    >
                                        <span className="min-w-0 flex-1 truncate">
                                            MCP Servers disabled
                                        </span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

export const MultimodalInput = forwardRef<
    MultimodalInputRef,
    {
        onSubmit: (input?: string, files?: UploadedFile[]) => void
        status: ReturnType<typeof useChat>["status"]
        threadId?: string
        isActive?: boolean
    }
>(function MultimodalInput({ onSubmit, status, threadId, isActive = true }, ref) {
    const { token } = useToken()
    const session = useSession()
    const auth = useConvexAuth()
    const { models: sharedModels } = useSharedModels()
    const creditPlan = usePrototypeCreditPlan()

    const {
        selectedModel,
        setSelectedModel,
        enabledTools,
        setEnabledTools,
        reasoningEffort,
        setReasoningEffort,
        mcpOverrides,
        defaultMcpOverrides,
        setMcpOverride,
        setDefaultMcpOverride
    } = useModelStore()
    const { uploadedFiles, addUploadedFile, removeUploadedFile, uploading, setUploading } =
        useChatStore()
    const { chatWidthState } = useChatWidthStore()

    const isLoading = status === "streaming"
    const uploadInputRef = useRef<HTMLInputElement>(null)
    const promptInputRef = useRef<PromptInputRef>(null)

    const [fileContents, setFileContents] = useState<Record<string, string>>({})
    const [localUploadingFiles, setLocalUploadingFiles] = useState<LocalUploadingFile[]>([])
    const [dialogFile, setDialogFile] = useState<{
        content: string
        fileName: string
        fileType: string
    } | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [extendedFiles, setExtendedFiles] = useState<ExtendedUploadedFile[]>([])
    const userSettings = useDiskCachedQuery(
        api.settings.getUserSettings,
        {
            key: "user-settings",
            default: DefaultSettings(session.user?.id ?? "CACHE"),
            forceCache: true
        },
        session.user?.id && !auth.isLoading ? {} : "skip"
    )
    const toolAvailability = useDiskCachedQuery(
        api.settings.getToolAvailability,
        {
            key: "tool-availability",
            default: null,
            forceCache: true
        },
        session.user?.id && !auth.isLoading ? {} : "skip"
    )
    // Voice recording state
    const {
        state: voiceState,
        startRecording,
        stopRecording
    } = useVoiceRecorder({
        onTranscript: (text: string) => {
            // Insert transcribed text into the input
            if (promptInputRef.current) {
                const currentValue = promptInputRef.current.getValue()
                const newValue = currentValue ? `${currentValue} ${text}` : text
                promptInputRef.current.setValue(newValue)
                // Save to localStorage like the existing system does
                localStorage.setItem("user-input", newValue)
                promptInputRef.current.focus()
                // Update our input value state
                setInputValue(newValue)
            }
        }
    })

    // Check if current model supports vision and is image model
    const selectedSharedModel = useMemo(
        () => sharedModels.find((model) => model.id === selectedModel),
        [selectedModel, sharedModels]
    )
    const allowedReasoningEfforts = useMemo(
        () => getAllowedReasoningEffortsForModel(selectedSharedModel),
        [selectedSharedModel]
    )
    const modelSupportsReasoningControl = allowedReasoningEfforts.length > 0

    const [
        modelSupportsVision,
        modelSupportsFunctionCalling,
        isImageModel,
        modelSupportsImageSizing,
        modelSupportsImageResolution
    ] = useMemo(() => {
        if (!selectedModel) return [false, false, false, false, false]
        const model = sharedModels.find((m) => m.id === selectedModel)
        return [
            model?.abilities.includes("vision") ?? false,
            model?.abilities.includes("function_calling") ?? false,
            model?.mode === "image",
            (model?.supportedImageSizes?.length ?? 0) > 0,
            (model?.supportedImageResolutions?.length ?? 0) > 0
        ]
    }, [selectedModel, sharedModels])

    useEffect(() => {
        if (!modelSupportsReasoningControl && reasoningEffort !== "off") {
            setReasoningEffort("off")
        }
    }, [modelSupportsReasoningControl, reasoningEffort, setReasoningEffort])

    useEffect(() => {
        setExtendedFiles(uploadedFiles.map((file) => ({ ...file })))
    }, [uploadedFiles])

    const webSearchAvailable = Boolean(toolAvailability?.web_search.enabled)
    const hasSupermemory = Boolean(toolAvailability?.supermemory.enabled)
    const mcpServers = (userSettings.mcpServers || []).filter((server) => server.enabled !== false)
    const hasMcpServers = mcpServers.length > 0

    useEffect(() => {
        const unavailableTools = new Set<AbilityId>()
        if (!modelSupportsFunctionCalling || !webSearchAvailable) unavailableTools.add("web_search")
        if (!hasSupermemory) unavailableTools.add("supermemory")
        if (!hasMcpServers) unavailableTools.add("mcp")

        const nextEnabledTools = enabledTools.filter((tool) => !unavailableTools.has(tool))
        if (nextEnabledTools.length !== enabledTools.length) {
            setEnabledTools(nextEnabledTools)
        }
    }, [
        modelSupportsFunctionCalling,
        webSearchAvailable,
        hasSupermemory,
        hasMcpServers,
        enabledTools,
        setEnabledTools
    ])

    const currentMcpOverrides = threadId
        ? { ...defaultMcpOverrides, ...(mcpOverrides[threadId] || {}) }
        : { ...defaultMcpOverrides }

    const handleToolToggle = (tool: AbilityId) => {
        if (tool === "web_search" && (!modelSupportsFunctionCalling || !webSearchAvailable)) return
        if (tool === "supermemory" && !hasSupermemory) return
        if (tool === "mcp" && !hasMcpServers) return

        setEnabledTools(
            enabledTools.includes(tool)
                ? enabledTools.filter((enabledTool) => enabledTool !== tool)
                : [...enabledTools, tool]
        )
    }

    const handleMcpServerToggle = (serverName: string) => {
        const isEnabled = currentMcpOverrides[serverName] !== false

        if (threadId) {
            setMcpOverride(threadId, serverName, !isEnabled)
            return
        }

        setDefaultMcpOverride(serverName, !isEnabled)
    }

    const handleSubmit = async () => {
        const inputValue = promptInputRef.current?.getValue() || ""
        const submitAction = resolveMultimodalSubmitAction(status, inputValue)

        if (submitAction === "stop") {
            onSubmit()
            return
        }

        if (submitAction === "focus") {
            promptInputRef.current?.focus()
            return
        }

        promptInputRef.current?.clear()
        localStorage.removeItem("user-input")
        setInputValue("") // Update our state too
        onSubmit(inputValue, uploadedFiles)
    }

    // Check if input is empty for mic button display
    const [inputValue, setInputValue] = useState("")
    const isInputEmpty = !inputValue.trim()
    const voiceInputEnabled = optionalBrowserEnv("VITE_ENABLE_VOICE_INPUT") === "true"

    // Listen to input changes by checking the prompt input value periodically
    // This is simpler and avoids accessing internal refs
    useEffect(() => {
        const checkInputValue = () => {
            const value = promptInputRef.current?.getValue() || ""
            setInputValue(value)
        }

        // Check initial value from localStorage
        const initialValue = localStorage.getItem("user-input") || ""
        setInputValue(initialValue)

        // Check periodically for changes
        const interval = setInterval(checkInputValue, 200)
        return () => clearInterval(interval)
    }, [])

    const handleVoiceButtonClick = () => {
        if (voiceState.isRecording) {
            stopRecording()
        } else if (!voiceInputEnabled) {
            handleSubmit()
        } else if (isInputEmpty && !isLoading) {
            startRecording()
        } else {
            handleSubmit()
        }
    }

    const readFileContent = useCallback(async (file: File): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader()
            reader.onload = (e) => {
                const result = e.target?.result as string
                resolve(result)
            }
            reader.onerror = () => resolve("Error reading file")

            if (isSvgMimeType(file.type) || isSvgExtension(file.name)) {
                reader.readAsText(file)
            } else if (isImageMimeType(file.type)) {
                reader.readAsDataURL(file)
            } else if (isTextMimeType(file.type) || getFileTypeInfo(file.name, file.type).isText) {
                reader.readAsText(file)
            } else {
                resolve(`Binary file: ${file.name}`)
            }
        })
    }, [])

    const compressImageIfNeeded = useCallback(async (file: File): Promise<File> => {
        const isSvg = isSvgMimeType(file.type) || isSvgExtension(file.name)
        const isRasterImage = isImageMimeType(file.type) && !isSvg

        if (!isRasterImage || file.size <= MAX_FILE_SIZE) {
            return file
        }

        if (file.size > IMAGE_COMPRESSION_CUTOFF_BYTES) {
            throw new Error(`${file.name}: Image exceeds 25MB limit`)
        }

        const objectUrl = URL.createObjectURL(file)

        try {
            const sourceImage = await new Promise<HTMLImageElement>((resolve, reject) => {
                const image = new Image()
                image.onload = () => resolve(image)
                image.onerror = () => reject(new Error("Failed to decode image"))
                image.src = objectUrl
            })

            for (const step of IMAGE_COMPRESSION_STEPS) {
                const largestSide = Math.max(sourceImage.width, sourceImage.height)
                const scale = Math.min(1, step.maxDimension / largestSide)
                const targetWidth = Math.max(1, Math.floor(sourceImage.width * scale))
                const targetHeight = Math.max(1, Math.floor(sourceImage.height * scale))

                const canvas = document.createElement("canvas")
                canvas.width = targetWidth
                canvas.height = targetHeight

                const context = canvas.getContext("2d")
                if (!context) {
                    throw new Error("Image compression unavailable in this browser")
                }

                context.clearRect(0, 0, targetWidth, targetHeight)
                context.drawImage(sourceImage, 0, 0, targetWidth, targetHeight)

                const compressedBlob = await new Promise<Blob | null>((resolve) => {
                    canvas.toBlob((blob) => resolve(blob), "image/webp", step.quality)
                })

                if (!compressedBlob) {
                    continue
                }

                const compressedName = file.name.replace(/\.[^.]+$/, "") || file.name
                const compressedFile = new File([compressedBlob], `${compressedName}.webp`, {
                    type: "image/webp",
                    lastModified: file.lastModified
                })

                if (compressedFile.size < MAX_FILE_SIZE) {
                    return compressedFile
                }
            }

            throw new Error(`${file.name}: Could not compress image below 5MB after 4 attempts`)
        } finally {
            URL.revokeObjectURL(objectUrl)
        }
    }, [])

    const uploadFileWithProgress = useCallback(
        async (
            file: File,
            onProgress: (progress: number) => void
        ): Promise<ExtendedUploadedFile> => {
            const jwt = await resolveJwtToken(token)
            if (!jwt) {
                throw new Error("Authentication token unavailable")
            }

            const formData = new FormData()
            formData.append("file", file)
            formData.append("fileName", file.name)

            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest()
                xhr.open("POST", `${browserEnv("VITE_CONVEX_API_URL")}/upload`)
                xhr.setRequestHeader("Authorization", `Bearer ${jwt}`)

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const progress = Math.round((event.loaded / event.total) * 100)
                        onProgress(progress)
                    }
                }

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const result = JSON.parse(xhr.responseText)
                            resolve({
                                ...result,
                                file
                            })
                        } catch (error) {
                            reject(new Error("Invalid response from server"))
                        }
                    } else {
                        try {
                            const errorData = JSON.parse(xhr.responseText)
                            reject(new Error(errorData.error || "Upload failed"))
                        } catch (error) {
                            reject(new Error("Upload failed"))
                        }
                    }
                }

                xhr.onerror = () => {
                    reject(new Error("Upload failed due to a network error"))
                }

                xhr.send(formData)
            })
        },
        [token]
    )

    const handleFileUpload = useCallback(
        async (filesToUpload: File[]) => {
            if (filesToUpload.length === 0) return

            // Validate files before uploading
            const validFiles: File[] = []
            const errors: string[] = []

            for (const file of filesToUpload) {
                // Check if file type is supported
                if (!isSupportedFile(file.name, file.type)) {
                    errors.push(`${file.name}: Unsupported file type`)
                    continue
                }

                const fileTypeInfo = getFileTypeInfo(file.name, file.type)
                let fileToUpload = file

                // Raster images require a vision-capable model. SVGs are handled as text.
                if (fileTypeInfo.isVisionImage && !modelSupportsVision) {
                    errors.push(`${file.name}: Current model doesn't support image files`)
                    continue
                }

                if (fileTypeInfo.isVisionImage && file.size > MAX_FILE_SIZE) {
                    try {
                        fileToUpload = await compressImageIfNeeded(file)
                    } catch (error) {
                        errors.push(
                            error instanceof Error
                                ? error.message
                                : `${file.name}: Failed to compress image`
                        )
                        continue
                    }
                }

                // Regular attachments keep the 5MB limit.
                if (fileToUpload.size > MAX_FILE_SIZE) {
                    errors.push(`${file.name}: File size exceeds 5MB limit`)
                    continue
                }

                // For text files, check token count
                if (fileTypeInfo.isText && (!fileTypeInfo.isImage || fileTypeInfo.isSvg)) {
                    try {
                        const content = await readFileContent(fileToUpload)
                        const tokenCount = estimateTokenCount(content)
                        if (tokenCount > MAX_TOKENS_PER_FILE) {
                            errors.push(
                                `${file.name}: File exceeds ${MAX_TOKENS_PER_FILE.toLocaleString()} token limit`
                            )
                            continue
                        }
                    } catch (error) {
                        errors.push(`${file.name}: Error reading file content`)
                        continue
                    }
                }

                validFiles.push(fileToUpload)
            }

            // Show validation errors
            if (errors.length > 0) {
                toast.error(`File validation failed:\n${errors.join("\n")}`)
                if (validFiles.length === 0) return
            }

            // Create local state entries for valid files
            const newLocalFiles: LocalUploadingFile[] = await Promise.all(
                validFiles.map(async (file) => {
                    const id = Math.random().toString(36).substring(7)
                    let previewUrl: string | undefined

                    if (
                        isImageMimeType(file.type) &&
                        !isSvgMimeType(file.type) &&
                        !isSvgExtension(file.name)
                    ) {
                        previewUrl = URL.createObjectURL(file)
                    }

                    return {
                        id,
                        file,
                        progress: 0,
                        status: "uploading" as const,
                        previewUrl
                    }
                })
            )

            setLocalUploadingFiles((prev) => [...prev, ...newLocalFiles])
            setUploading(true)

            // Start uploads concurrently
            validFiles.forEach(async (file, index) => {
                const localFile = newLocalFiles[index]

                try {
                    const result = await uploadFileWithProgress(file, (progress) => {
                        setLocalUploadingFiles((prev) =>
                            prev.map((f) => (f.id === localFile.id ? { ...f, progress } : f))
                        )
                    })

                    // Mark as success and show checkmark
                    setLocalUploadingFiles((prev) =>
                        prev.map((f) =>
                            f.id === localFile.id ? { ...f, status: "success", progress: 100 } : f
                        )
                    )

                    // Read content for preview if needed
                    if (result.file) {
                        const content = await readFileContent(result.file)
                        setFileContents((prev) => ({
                            ...prev,
                            [result.key]: content
                        }))
                    }

                    // Add a small delay so the user sees the checkmark state
                    setTimeout(() => {
                        addUploadedFile(result)
                        // Clean up object url
                        if (localFile.previewUrl) {
                            URL.revokeObjectURL(localFile.previewUrl)
                        }
                        // Remove from local uploading state
                        setLocalUploadingFiles((prev) => prev.filter((f) => f.id !== localFile.id))

                        // If this was the last file to finish uploading, we can clear the uploading status
                        setLocalUploadingFiles((prev) => {
                            if (prev.length === 0) {
                                setUploading(false)
                            }
                            return prev
                        })
                    }, 500)
                } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Upload failed")

                    setLocalUploadingFiles((prev) =>
                        prev.map((f) =>
                            f.id === localFile.id
                                ? {
                                      ...f,
                                      status: "error",
                                      error:
                                          error instanceof Error ? error.message : "Upload failed"
                                  }
                                : f
                        )
                    )

                    // Remove failed uploads after a longer delay
                    setTimeout(() => {
                        if (localFile.previewUrl) {
                            URL.revokeObjectURL(localFile.previewUrl)
                        }
                        setLocalUploadingFiles((prev) => prev.filter((f) => f.id !== localFile.id))

                        setLocalUploadingFiles((prev) => {
                            if (prev.length === 0) {
                                setUploading(false)
                            }
                            return prev
                        })
                    }, 2000)
                }
            })

            if (uploadInputRef.current) {
                uploadInputRef.current.value = ""
            }
        },
        [
            uploadFileWithProgress,
            addUploadedFile,
            setUploading,
            readFileContent,
            modelSupportsVision,
            compressImageIfNeeded
        ]
    )

    useImperativeHandle(
        ref,
        () => ({
            handleFileUpload,
            setValue: (value: string) => {
                promptInputRef.current?.setValue(value)
                localStorage.setItem("user-input", value)
                setInputValue(value)
            }
        }),
        [handleFileUpload]
    )

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            const newFiles = Array.from(event.target.files)
            handleFileUpload(newFiles)
        }
    }

    const handleRemoveFile = (key: string) => {
        removeUploadedFile(key)
        setFileContents((prev) => {
            const newContents = { ...prev }
            delete newContents[key]
            return newContents
        })
    }

    const handlePaste = useCallback(
        async (e: ClipboardEvent) => {
            const items = Array.from(e.clipboardData?.items || [])
            const files: File[] = []
            let hasText = false

            for (const item of items) {
                if (item.kind === "file") {
                    const file = item.getAsFile()
                    if (file) {
                        files.push(file)
                        e.preventDefault()
                    }
                } else if (item.kind === "string" && item.type === "text/plain") {
                    hasText = true
                }
            }

            if (files.length > 0) {
                await handleFileUpload(files)
            }

            if (!hasText && files.length === 0) {
                e.preventDefault()
            }
        },
        [handleFileUpload]
    )

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return "0 Bytes"
        const k = 1024
        const sizes = ["Bytes", "KB", "MB", "GB"]
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
    }

    const getFileType = (
        uploadedFile: ExtendedUploadedFile
    ): { isImage: boolean; isCode: boolean; isText: boolean } => {
        const fileType = uploadedFile.file?.type || uploadedFile.fileType
        return getFileTypeInfo(uploadedFile.fileName, fileType)
    }

    const getFileIcon = (uploadedFile: ExtendedUploadedFile) => {
        const { isImage, isCode } = getFileType(uploadedFile)

        if (isImage) return <ImageIcon className="size-4 text-blue-500" />
        if (isCode) return <Code className="size-4 text-green-500" />
        return <FileType className="size-4 text-gray-500" />
    }

    const renderLocalUploadingFile = (localFile: LocalUploadingFile) => {
        const { isImage, isCode } = getFileTypeInfo(localFile.file.name, localFile.file.type)

        return (
            <div key={localFile.id} className="group relative">
                <div
                    className={cn(
                        "relative flex h-12 items-center justify-center overflow-hidden border-2 border-border bg-secondary/50 transition-colors",
                        isImage && "w-12"
                    )}
                    style={{ borderRadius: "var(--radius)" }}
                >
                    {isImage && localFile.previewUrl ? (
                        <>
                            <img
                                src={localFile.previewUrl}
                                alt=""
                                className={cn(
                                    "h-full w-full object-cover transition-all",
                                    localFile.status === "uploading" && "opacity-40 blur-[2px]"
                                )}
                                style={{ borderRadius: "calc(var(--radius) - 2px)" }}
                            />
                            {localFile.status === "uploading" && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/20">
                                    <span className="font-semibold text-[10px] text-white drop-shadow-md">
                                        {localFile.progress}%
                                    </span>
                                    <div
                                        className="h-1 w-8 overflow-hidden bg-white/30"
                                        style={{ borderRadius: "var(--radius)" }}
                                    >
                                        <div
                                            className="h-full bg-white transition-all duration-200"
                                            style={{ width: `${localFile.progress}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                            {localFile.status === "success" && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/90 text-primary-foreground">
                                        <Check className="size-3" />
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex w-full items-center justify-center gap-2 px-2 font-medium text-sm">
                            {isCode ? (
                                <Code className="size-4 text-green-500" />
                            ) : (
                                <FileType className="size-4 text-gray-500" />
                            )}
                            <div className="flex w-full flex-col items-start overflow-hidden">
                                <span className="w-full truncate text-ellipsis">
                                    {localFile.file.name}
                                </span>
                                {localFile.status === "uploading" ? (
                                    <div className="mt-1 flex w-full items-center gap-2">
                                        <div
                                            className="h-1 flex-1 overflow-hidden bg-border"
                                            style={{ borderRadius: "var(--radius)" }}
                                        >
                                            <div
                                                className="h-full bg-primary transition-all duration-200"
                                                style={{ width: `${localFile.progress}%` }}
                                            />
                                        </div>
                                        <span className="text-[10px] text-muted-foreground">
                                            {localFile.progress}%
                                        </span>
                                    </div>
                                ) : localFile.status === "success" ? (
                                    <div className="mt-0.5 flex items-center gap-1 text-primary text-xs">
                                        <Check className="size-3" />
                                        <span>Uploaded</span>
                                    </div>
                                ) : (
                                    <span className="text-destructive text-xs">Error</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    const renderFilePreview = (uploadedFile: ExtendedUploadedFile) => {
        const content = fileContents[uploadedFile.key]
        const { isImage, isText } = getFileType(uploadedFile)

        return (
            <div key={uploadedFile.key} className="group relative">
                <button
                    type="button"
                    onClick={() => {
                        setDialogFile({
                            content,
                            fileName: uploadedFile.fileName,
                            fileType: uploadedFile.fileType
                        })
                        setDialogOpen(true)
                    }}
                    className={cn(
                        "relative flex h-12 items-center justify-center overflow-hidden border-2 border-border bg-secondary/50 transition-colors hover:bg-secondary/80",
                        isImage && "w-12"
                    )}
                    style={{ borderRadius: "var(--radius)" }}
                >
                    {content && isImage ? (
                        <img
                            src={content}
                            alt=""
                            className="h-full w-full object-cover"
                            style={{ borderRadius: "calc(var(--radius) - 2px)" }}
                        />
                    ) : (
                        <div className="flex items-center justify-center gap-2 px-2 font-medium text-sm">
                            {getFileIcon(uploadedFile)}
                            <div className="flex flex-col items-start">
                                <span className="truncate text-ellipsis">
                                    {uploadedFile.fileName}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                    {formatFileSize(uploadedFile.fileSize)}
                                </span>
                            </div>
                        </div>
                    )}
                </button>

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveFile(uploadedFile.key)
                    }}
                    className="-top-2 -right-2 absolute h-5 w-5 rounded-full bg-destructive p-0 text-destructive-foreground opacity-0 transition-opacity hover:bg-destructive/80 group-hover:opacity-100"
                >
                    <X className="size-3" />
                </Button>
            </div>
        )
    }

    const renderDialogContent = () => {
        if (!dialogFile) return null

        const fileTypeInfo = getFileTypeInfo(dialogFile.fileName, dialogFile.fileType)
        const isImage = fileTypeInfo.isImage
        const isText = fileTypeInfo.isText

        return (
            <div className="max-h-[70dvh] w-full overflow-auto">
                {isImage ? (
                    <img
                        src={dialogFile.content}
                        alt={dialogFile.fileName}
                        className="h-auto w-full rounded object-contain"
                    />
                ) : isText ? (
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted p-4 text-sm">
                        {dialogFile.content}
                    </pre>
                ) : (
                    <div className="flex items-center justify-center p-8 text-muted-foreground">
                        <div className="text-center">
                            <FileType className="mx-auto mb-2 size-12" />
                            <p>Binary file: {dialogFile.fileName}</p>
                            <p className="mt-1 text-xs">Preview not available</p>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    const [isClient, setIsClient] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    useEffect(() => {
        setIsClient(true)
    }, [])

    useEffect(() => {
        if (!isActive) {
            return
        }

        const handleGlobalPaste = (e: ClipboardEvent) => {
            if (
                document.activeElement?.tagName === "TEXTAREA" ||
                document.activeElement?.tagName === "INPUT"
            ) {
                handlePaste(e)
            }
        }

        document.addEventListener("paste", handleGlobalPaste)
        return () => document.removeEventListener("paste", handleGlobalPaste)
    }, [handlePaste, isActive])

    if (!isClient) return null

    return (
        <>
            {voiceInputEnabled && (voiceState.isRecording || voiceState.isTranscribing) && (
                <div className="@container w-full md:px-2">
                    <VoiceRecorder
                        state={voiceState}
                        onStop={stopRecording}
                        className={cn(
                            "mx-auto w-full",
                            getChatWidthClass(chatWidthState.chatWidth)
                        )}
                    />
                </div>
            )}

            <div
                className={cn(
                    "@container w-full px-1",
                    (voiceState.isRecording || voiceState.isTranscribing) && "hidden"
                )}
            >
                <PromptInput
                    ref={promptInputRef}
                    onSubmit={handleSubmit}
                    className={cn("mx-auto w-full", getChatWidthClass(chatWidthState.chatWidth))}
                >
                    {(extendedFiles.length > 0 || localUploadingFiles.length > 0) && (
                        <div className="flex flex-wrap gap-2 pb-3">
                            {extendedFiles.map(renderFilePreview)}
                            {localUploadingFiles.map(renderLocalUploadingFile)}
                        </div>
                    )}
                    <PromptInputTextarea
                        placeholder={
                            isImageModel
                                ? "Describe the image you want to generate..."
                                : "Ask me anything..."
                        }
                    />

                    <PromptInputActions className="flex items-center gap-2 pt-2">
                        <motion.div
                            layout
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:gap-2"
                        >
                            {selectedModel && (
                                <motion.div
                                    layout
                                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                    className="shrink-0"
                                >
                                    <ModelSelector
                                        selectedModel={selectedModel}
                                        onModelChange={setSelectedModel}
                                        shortcutTarget="composer"
                                    />
                                </motion.div>
                            )}
                            <PersonaSelector threadId={threadId} />

                            {/* Desktop: Show everything inline */}
                            <motion.div
                                layout
                                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                className="hidden items-center gap-2 sm:flex"
                            >
                                {modelSupportsImageSizing && (
                                    <AspectRatioSelector selectedModel={selectedModel} />
                                )}

                                {modelSupportsImageResolution && (
                                    <ImageResolutionSelector selectedModel={selectedModel} />
                                )}

                                {isImageModel ? null : (
                                    <>
                                        <PromptInputAction tooltip="Attach files">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => uploadInputRef.current?.click()}
                                                className={cn(
                                                    "flex size-8 cursor-pointer items-center justify-center gap-1 rounded-md bg-secondary/70 text-foreground backdrop-blur-lg hover:bg-secondary/80"
                                                )}
                                            >
                                                <input
                                                    type="file"
                                                    multiple
                                                    onChange={handleFileChange}
                                                    className="hidden"
                                                    ref={uploadInputRef}
                                                    accept={getFileAcceptAttribute(
                                                        modelSupportsVision
                                                    )}
                                                />
                                                {uploading ? (
                                                    <Loader2 className="size-4 animate-spin" />
                                                ) : (
                                                    <Paperclip className="-rotate-45 size-4 hover:text-primary" />
                                                )}
                                            </Button>
                                        </PromptInputAction>

                                        <PromptInputAction tooltip="Tools">
                                            <ToolSelectorPopover
                                                threadId={threadId}
                                                enabledTools={enabledTools}
                                                onEnabledToolsChange={setEnabledTools}
                                                modelSupportsFunctionCalling={
                                                    modelSupportsFunctionCalling
                                                }
                                            />
                                        </PromptInputAction>

                                        <ReasoningEffortSelector
                                            selectedModel={selectedModel}
                                            creditPlan={creditPlan}
                                        />
                                    </>
                                )}
                            </motion.div>
                        </motion.div>

                        {/* Mobile-only overflow actions stay on the right edge to keep menu content on-screen. */}
                        {(modelSupportsImageSizing ||
                            modelSupportsImageResolution ||
                            !isImageModel ||
                            modelSupportsReasoningControl) && (
                            <div className="shrink-0 sm:hidden">
                                <MobileOverflowMenu
                                    open={mobileMenuOpen}
                                    onOpenChange={setMobileMenuOpen}
                                    selectedModel={selectedModel}
                                    modelSupportsFunctionCalling={modelSupportsFunctionCalling}
                                    modelSupportsReasoningControl={modelSupportsReasoningControl}
                                    isImageModel={isImageModel}
                                    modelSupportsImageSizing={modelSupportsImageSizing}
                                    modelSupportsImageResolution={modelSupportsImageResolution}
                                    allowedReasoningEfforts={allowedReasoningEfforts}
                                    selectedSharedModel={selectedSharedModel}
                                    creditPlan={creditPlan}
                                    webSearchAvailable={webSearchAvailable}
                                    hasSupermemory={hasSupermemory}
                                    mcpServers={mcpServers}
                                    currentMcpOverrides={currentMcpOverrides}
                                    onToggleTool={handleToolToggle}
                                    onToggleMcpServer={handleMcpServerToggle}
                                    onAttachClick={() => uploadInputRef.current?.click()}
                                />
                            </div>
                        )}

                        <PromptInputAction
                            tooltip={
                                voiceInputEnabled && isInputEmpty && !isLoading
                                    ? "Voice input"
                                    : isLoading
                                      ? "Stop generation"
                                      : "Send message"
                            }
                        >
                            <Button
                                variant="default"
                                size="icon"
                                className="size-8 shrink-0 rounded-md"
                                disabled={status === "submitted" || uploading}
                                onClick={handleVoiceButtonClick}
                                type="submit"
                            >
                                {isLoading ? (
                                    <Square className="size-5 fill-current" />
                                ) : status === "submitted" ? (
                                    <Loader2 className="size-5 animate-spin" />
                                ) : voiceInputEnabled && isInputEmpty ? (
                                    <Mic className="size-5" />
                                ) : (
                                    <ArrowUp className="size-5" />
                                )}
                            </Button>
                        </PromptInputAction>
                    </PromptInputActions>
                </PromptInput>
            </div>

            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open)
                    if (!open) {
                        setTimeout(() => setDialogFile(null), 150)
                    }
                }}
            >
                <DialogContent className="md:!max-w-[min(90vw,60rem)] max-h-[90dvh] max-w-full">
                    {dialogFile && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    {getFileIcon({
                                        fileName: dialogFile.fileName,
                                        fileType: dialogFile.fileType
                                    } as ExtendedUploadedFile)}
                                    {dialogFile.fileName}
                                </DialogTitle>
                            </DialogHeader>
                            {renderDialogContent()}
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
})
