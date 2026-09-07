import { AttachmentTile } from "@/components/attachment-tile"
import { useCreditAccess } from "@/components/credits/credit-access-runtime"
import { IntentGuide } from "@/components/intent-guide"
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
import { TabularFilePreview } from "@/components/tabular-file-preview"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { VoiceRecorder } from "@/components/voice-recorder"
import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import type { SharedModel } from "@/convex/lib/models"
import { useSession, useToken } from "@/hooks/auth-hooks"
import { useIsTouchDevice } from "@/hooks/use-touch-device"
import { useUploadPolicy } from "@/hooks/use-upload-policy"
import { useVoiceRecorder } from "@/hooks/use-voice-recorder"
import {
    type AttachmentIngestResult,
    createInlineIngestedFile,
    finalizeIngestedUpload,
    ingestChatAttachment
} from "@/lib/attachment-ingest"
import {
    getAttachmentValidationError,
    hasPdfAttachmentInUploadedFiles
} from "@/lib/attachment-support"
import type { AttachmentTileKind } from "@/lib/attachment-tile"
import { resolveJwtToken } from "@/lib/auth-token"
import { browserEnv, optionalBrowserEnv } from "@/lib/browser-env"
import {
    type UploadedFileWithSource,
    prepareChatAttachmentForUpload,
    readChatAttachmentContent,
    uploadChatAttachment
} from "@/lib/chat-attachments"
import { type UploadedFile, useChatStore } from "@/lib/chat-store"
import { getChatWidthClass, useChatWidthStore } from "@/lib/chat-width-store"
import {
    COMPOSER_INTENT_PREFIXES,
    type ComposerIntentId,
    resolveIntentGuideStage
} from "@/lib/composer-intents"
import { isComposerPasteTarget } from "@/lib/composer-paste"
import { useDiskCachedQuery } from "@/lib/convex-cached-query"
import { DefaultSettings } from "@/lib/default-user-settings"
import {
    estimateTokenCount,
    getFileAcceptAttribute,
    getFileTypeInfo,
    isDocumentExtension,
    isImageMimeType
} from "@/lib/file_constants"
import { getFileThumbnailSources, getGeneratedImageDirectUrl } from "@/lib/generated-image-urls"
import {
    type WebTrendSuggestion,
    fetchWebTrendSuggestions,
    resolveGoogleTrendsGeo
} from "@/lib/google-trends"
import {
    IMAGE_RESOLUTION_OPTIONS,
    type ImageDefaultResolution,
    MAX_DEFAULT_VARIANTS
} from "@/lib/image-generation-defaults"
import { type ReasoningEffort, useModelStore } from "@/lib/model-store"
import {
    getAllowedReasoningEffortsForModel,
    getReasoningEffortForPlan,
    getReasoningEffortIcon,
    getReasoningEffortLabelForModel,
    getRequiredPlanToPickModel,
    isInstantReasoningEffortForModel,
    resolveSelectedDisplayModel
} from "@/lib/models-providers-shared"
import { resolveMultimodalSubmitAction } from "@/lib/multimodal-submit-action"
import {
    classifyPastedText,
    getEnabledToolsForPastedText,
    getPastedTextNames,
    mergePastedTextIntoDraft
} from "@/lib/pasted-text"
import { hasPendingImageGeneration } from "@/lib/pending-image-generation"
import { appendQuotedSelection } from "@/lib/quote-selection"
import { getPublicR2AssetUrl } from "@/lib/r2-public-url"
import { useSharedModels } from "@/lib/shared-models"
import { captureBrowserEvent } from "@/lib/telemetry/browser"
import { TELEMETRY_EVENTS, getErrorType } from "@/lib/telemetry/events"
import {
    TEXT_PREVIEW_MAX_CHARS,
    TEXT_PREVIEW_MAX_LINES,
    isTabularTextFile,
    truncateTextPreview
} from "@/lib/tabular-file-preview"
import {
    clearThreadDraft,
    getThreadDraftKey,
    loadThreadDraft,
    saveThreadDraft
} from "@/lib/thread-drafts"
import type { AbilityId } from "@/lib/tool-abilities"
import {
    DEFAULT_TOOL_CALL_LIMIT_PER_TURN,
    MAX_TOOL_CALL_LIMIT_PER_TURN,
    MIN_TOOL_CALL_LIMIT_PER_TURN,
    clampToolCallLimitPerTurn
} from "@/lib/tool-call-limit"
import { cn } from "@/lib/utils"
import { type ImageDimensions, estimateImageInputTokens } from "@/lib/vision-token-estimate"
import type { useChat } from "@ai-sdk/react"
import { useConvexMutation } from "@convex-dev/react-query"
import type { UIMessage } from "ai"
import { useAction, useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react"
import {
    ArrowUp,
    BrainCircuit,
    Check,
    ChevronDown,
    ChevronUp,
    Code,
    FileText,
    FileType,
    Globe,
    Image as ImageIcon,
    Loader2,
    Mic,
    Minus,
    MoreHorizontal,
    OctagonX,
    Paperclip,
    Plus,
    Sigma,
    Square,
    SquareTerminal,
    X
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
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

type ExtendedUploadedFile = UploadedFileWithSource
type ComposerOverlay = "model" | "persona" | "tools" | "reasoning" | "mobile-menu"

const DEFAULT_MODEL_CONTEXT_LENGTH = 128_000
const MAX_OUTPUT_CONTEXT_FRACTION = 0.25
const MAX_OUTPUT_TOKENS_CAP = 64_000
const DEFAULT_HOSTED_CONTEXT_MAX_INPUT_COST_USD = 0.75
const DEFAULT_HOSTED_CONTEXT_FALLBACK_INPUT_TOKENS = 32_000
const DEFAULT_HOSTED_CONTEXT_MAX_INPUT_TOKENS = 128_000
const DEFAULT_CONTEXT_FILE_REFERENCE_TOKENS = 256
const DEFAULT_MESSAGE_OVERHEAD_TOKENS = 4
const COMPOSER_CONTEXT_WARNING_CONFIDENCE_MULTIPLIER = 1.1
const COMPOSER_ACTION_TOOLTIP_DELAY_MS = 1_000

const getAttachmentTelemetryCategory = (file: Pick<File, "name" | "type">) => {
    const info = getFileTypeInfo(file.name, file.type)
    if (info.isImage) return "image" as const
    if (info.isPdf) return "pdf" as const
    if (info.isDocument) return "document" as const
    if (info.isCode) return "code" as const
    if (info.isText) return "text" as const
    return "other" as const
}

const getAttachmentSizeBucket = (size: number) => {
    if (size < 100 * 1024) return "under_100_kb" as const
    if (size < 1024 * 1024) return "100_kb_to_1_mb" as const
    if (size < 5 * 1024 * 1024) return "1_mb_to_5_mb" as const
    return "over_5_mb" as const
}

/**
 * Decide whether to surface the model-selector context hint for an approaching
 * overage. We only nudge about hosted/BYOK once the user's OpenRouter key is set
 * up — then the hint reassures them the long request will run on their key. With
 * no key we stay quiet and let the send fail with the actionable rejection
 * instead of pre-warning about a BYOK setup they haven't done. The model-limit
 * case is BYOK-independent (no key can fix it), so it always shows.
 */
const resolveByokContextHint = (
    routing: { exceedsModelLimit: boolean; openRouterByokEnabled: boolean } | null
): { tooltip: string; ariaLabel: string } | undefined => {
    if (!routing) return undefined
    if (routing.exceedsModelLimit) {
        return {
            tooltip:
                "This request may exceed the selected model's context limit. Shorten it or start a new chat.",
            ariaLabel: "May exceed the model's context limit"
        }
    }
    if (routing.openRouterByokEnabled) {
        return {
            tooltip: "This request exceeds hosted limits and will run on your OpenRouter key.",
            ariaLabel: "Will use your OpenRouter key"
        }
    }
    return undefined
}

interface LocalUploadingFile {
    id: string
    file: File
    startedAt: number
    progress: number
    status: "uploading" | "success" | "ready" | "error"
    previewUrl?: string
    error?: string
    abortController: AbortController
    tileKind: AttachmentTileKind
    largePasteContent?: string
    largePasteSource?: "pasted-text" | "document"
    displayName?: string
}

type LargePasteUploadSource = {
    content: string
    displayName: string
    source: "pasted-text" | "document"
    ingested?: AttachmentIngestResult
}

const isPositiveFiniteNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value > 0

const resolveComposerContextLimits = (model: SharedModel | undefined) => {
    const modelContextLength = isPositiveFiniteNumber(model?.contextLength)
        ? model.contextLength
        : DEFAULT_MODEL_CONTEXT_LENGTH
    const outputPolicyLimit = Math.min(
        Math.floor(modelContextLength * MAX_OUTPUT_CONTEXT_FRACTION),
        MAX_OUTPUT_TOKENS_CAP
    )
    const maxOutputTokens = isPositiveFiniteNumber(model?.maxTokens)
        ? Math.min(model.maxTokens, outputPolicyLimit)
        : outputPolicyLimit
    const safetyMarginTokens = Math.max(4_096, Math.ceil(modelContextLength * 0.05))
    const modelInputLimit = Math.max(
        1_024,
        modelContextLength - maxOutputTokens - safetyMarginTokens
    )
    const configuredHostedLimit = isPositiveFiniteNumber(model?.hostedContextLength)
        ? model.hostedContextLength
        : undefined
    const hostedMetadataLimit = configuredHostedLimit ?? DEFAULT_HOSTED_CONTEXT_MAX_INPUT_TOKENS
    const priceDerivedHostedLimit = isPositiveFiniteNumber(model?.inputUsdPer1MTokens)
        ? Math.floor(
              (DEFAULT_HOSTED_CONTEXT_MAX_INPUT_COST_USD * 1_000_000) / model.inputUsdPer1MTokens
          )
        : undefined
    const hostedInputLimit = Math.max(
        1_024,
        Math.min(
            modelInputLimit,
            hostedMetadataLimit,
            priceDerivedHostedLimit ??
                configuredHostedLimit ??
                DEFAULT_HOSTED_CONTEXT_FALLBACK_INPUT_TOKENS
        )
    )

    return { modelInputLimit, hostedInputLimit }
}

const estimateUiMessageTokens = (message: UIMessage) =>
    message.parts.reduce((total, part) => {
        if (part.type === "text") return total + estimateTokenCount(part.text)
        if (part.type === "reasoning") return total + estimateTokenCount(part.text ?? "")
        if (part.type === "file") {
            return (
                total +
                DEFAULT_CONTEXT_FILE_REFERENCE_TOKENS +
                estimateTokenCount(part.filename ?? "") +
                estimateTokenCount(part.mediaType ?? "")
            )
        }
        if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
            return total + estimateTokenCount(JSON.stringify(part))
        }
        return total
    }, DEFAULT_MESSAGE_OVERHEAD_TOKENS)

const estimateUploadedFileTokens = (
    file: UploadedFile,
    cachedContentTokens: number | undefined,
    imageDimensions: ImageDimensions | undefined,
    modelId: string | null
) => {
    const baseTokens =
        DEFAULT_CONTEXT_FILE_REFERENCE_TOKENS +
        estimateTokenCount(file.fileName) +
        estimateTokenCount(file.fileType)
    const fileTypeInfo = getFileTypeInfo(file.fileName, file.fileType)

    // Image bytes are sent as a model image reference, not prompt text. Counting a
    // cached data URL here turns Base64 size into a fictitious text-token estimate.
    if (fileTypeInfo.isImage) {
        return baseTokens + estimateImageInputTokens(imageDimensions, modelId ?? undefined)
    }

    if (cachedContentTokens !== undefined) {
        return baseTokens + cachedContentTokens
    }

    if (fileTypeInfo.isText) {
        return baseTokens + Math.ceil(file.fileSize / 4)
    }

    return baseTokens
}

export const ReasoningEffortSelector = ({
    selectedModel,
    tone = "default",
    creditPlan,
    open,
    onOpenChange,
    suppressTooltip = false
}: {
    selectedModel: string | null
    tone?: "default" | "on-primary"
    creditPlan?: CreditPlan | null
    open?: boolean
    onOpenChange?: (open: boolean) => void
    suppressTooltip?: boolean
}) => {
    const { reasoningEffort, setReasoningEffort } = useModelStore()
    const { models: sharedModels } = useSharedModels()
    const sharedCreditPlan = useCreditAccess((state) => state.plan)
    const resolvedCreditPlan = creditPlan === undefined ? sharedCreditPlan : creditPlan

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
    const isReasoningOff = isInstantReasoningEffortForModel(selectedSharedModel, reasoningEffort)
    const reasoningLabel = getReasoningEffortLabelForModel(selectedSharedModel, reasoningEffort)
    const ReasoningIcon = getReasoningEffortIcon(reasoningEffort, selectedSharedModel)

    if (!modelSupportsReasoningControl) return null

    return (
        <PromptInputAction
            tooltip="Select reasoning effort"
            side="right"
            delayDuration={COMPOSER_ACTION_TOOLTIP_DELAY_MS}
            open={suppressTooltip ? false : undefined}
        >
            <span className="inline-flex">
                <Select
                    open={open}
                    onOpenChange={onOpenChange}
                    value={reasoningEffort}
                    onValueChange={(effort) => {
                        const selectedEffort = effort as ReasoningEffort
                        if (selectedEffort !== reasoningEffort) {
                            captureBrowserEvent(TELEMETRY_EVENTS.reasoningEffortManuallySelected, {
                                model_id: selectedModel,
                                previous_effort: reasoningEffort,
                                selected_effort: selectedEffort,
                                surface: "composer_desktop"
                            })
                        }
                        setReasoningEffort(selectedEffort)
                    }}
                >
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
                            <ReasoningIcon className="size-4" />
                            <span>{reasoningLabel}</span>
                        </div>
                        <span className="flex items-center gap-1 sm:hidden">
                            <ReasoningIcon className="size-4" />
                        </span>
                    </SelectTrigger>
                    <SelectContent>
                        {allowedEfforts.map((effort) => {
                            const EffortIcon = getReasoningEffortIcon(effort, selectedSharedModel)
                            const isEffortLocked =
                                resolvedCreditPlan === "free" &&
                                selectedSharedModel !== undefined &&
                                getRequiredPlanToPickModel(selectedSharedModel, effort) === "pro"
                            return (
                                <SelectItem
                                    key={effort}
                                    value={effort}
                                    disabled={isEffortLocked}
                                    className="text-xs sm:text-sm"
                                >
                                    <span className="flex w-full items-center justify-between gap-3">
                                        <span className="flex items-center gap-2">
                                            <EffortIcon className="size-4 shrink-0" />
                                            <span>
                                                {getReasoningEffortLabelForModel(
                                                    selectedSharedModel,
                                                    effort
                                                )}
                                            </span>
                                        </span>
                                        {isEffortLocked && (
                                            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-[0.625rem] text-primary uppercase">
                                                Pro
                                            </span>
                                        )}
                                    </span>
                                </SelectItem>
                            )
                        })}
                    </SelectContent>
                </Select>
            </span>
        </PromptInputAction>
    )
}

export interface MultimodalInputRef {
    handleFileUpload: (files: File[]) => Promise<void>
    setValue: (value: string) => void
    insertQuote: (selection: string) => void
}

const mobileMenuRowClassName =
    "flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent/60"

type CreditPlan = "free" | "pro"

function MobileAvailabilityIndicator({
    label,
    description
}: {
    label: string
    description: string
}) {
    const isTouchDevice = useIsTouchDevice()
    const indicator = (
        <button
            type="button"
            aria-label={`Explain ${label} availability`}
            className="flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-xl)] border border-border bg-muted text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <X className="size-2.5" />
        </button>
    )

    if (!isTouchDevice) {
        return (
            <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>{indicator}</TooltipTrigger>
                <TooltipContent side="left" sideOffset={6}>
                    {description}
                </TooltipContent>
            </Tooltip>
        )
    }

    return (
        <Popover>
            <PopoverTrigger asChild>{indicator}</PopoverTrigger>
            <PopoverContent
                align="center"
                side="left"
                sideOffset={6}
                className="z-[60] w-56 p-2.5 text-muted-foreground text-xs"
                style={{ borderRadius: "var(--radius-md)" }}
            >
                {description}
            </PopoverContent>
        </Popover>
    )
}

function MobileToolRow({
    label,
    icon,
    enabled,
    available,
    onClick
}: {
    label: string
    icon: React.ReactNode
    enabled: boolean
    available: boolean
    onClick: () => void
}) {
    const content = (
        <>
            <span
                className={cn(
                    "flex size-4 shrink-0 items-center justify-center",
                    enabled && available ? "text-foreground" : "text-muted-foreground"
                )}
            >
                {icon}
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
        </>
    )

    if (!available) {
        return (
            <div className={cn(mobileMenuRowClassName, "cursor-default")}>
                {content}
                <MobileAvailabilityIndicator
                    label={label}
                    description={`${label} is unavailable with the selected model or current configuration.`}
                />
            </div>
        )
    }

    return (
        <div className={mobileMenuRowClassName}>
            {content}
            <Switch
                checked={enabled}
                aria-label={`${label}: ${enabled ? "On" : "Off"}`}
                onCheckedChange={onClick}
            />
        </div>
    )
}

function MobileOverflowMenu({
    open,
    onOpenChange,
    selectedModel,
    modelSupportsVision,
    modelSupportsFunctionCalling,
    modelSupportsReasoningControl,
    isImageModel,
    allowedReasoningEfforts,
    selectedSharedModel,
    creditPlan,
    webSearchAvailable,
    codeExecutionAvailable,
    mathematicalInstrumentsAvailable,
    memoryAvailable,
    toolCallLimitPerTurn,
    toolLimitInteractive,
    onSetToolCallLimit,
    imageDefaultResolution,
    imageDefaultVariants,
    onSetImageDefaults,
    onToggleTool,
    onAttachClick
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    selectedModel: string | null
    modelSupportsVision: boolean
    modelSupportsFunctionCalling: boolean
    modelSupportsReasoningControl: boolean
    isImageModel: boolean
    allowedReasoningEfforts: ReturnType<typeof getAllowedReasoningEffortsForModel>
    selectedSharedModel?: SharedModel
    creditPlan: CreditPlan | null
    webSearchAvailable: boolean
    codeExecutionAvailable: boolean
    mathematicalInstrumentsAvailable: boolean
    memoryAvailable: boolean
    toolCallLimitPerTurn: number
    toolLimitInteractive: boolean
    onSetToolCallLimit: (nextLimit: number) => void
    imageDefaultResolution: ImageDefaultResolution
    imageDefaultVariants: number
    onSetImageDefaults: (partial: {
        resolution?: ImageDefaultResolution
        variants?: number
    }) => void
    onToggleTool: (tool: AbilityId) => void
    onAttachClick: () => void
}) {
    const { enabledTools, reasoningEffort, setReasoningEffort } = useModelStore()
    const [reasoningExpanded, setReasoningExpanded] = useState(false)
    const reasoningLabel = getReasoningEffortLabelForModel(selectedSharedModel, reasoningEffort)
    const ReasoningIcon = getReasoningEffortIcon(reasoningEffort, selectedSharedModel)
    const webSearchEnabled = enabledTools.includes("web_search")
    const codeExecutionEnabled = enabledTools.includes("code_execution")
    const mathematicalInstrumentsEnabled = enabledTools.includes("mathematical_instruments")
    const memoryEnabled = enabledTools.includes("supermemory")

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
                className="max-h-[min(var(--radix-popover-content-available-height),calc(100dvh-1rem))] w-[min(16rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain border-border/70 bg-popover p-1.5 shadow-lg"
                style={{ borderRadius: "var(--radius-lg)" }}
            >
                <div className="space-y-1">
                    {modelSupportsReasoningControl && (
                        <>
                            <button
                                type="button"
                                className={mobileMenuRowClassName}
                                onClick={() => setReasoningExpanded((expanded) => !expanded)}
                            >
                                <ReasoningIcon className="size-4 shrink-0" />
                                <span className="min-w-0 flex-1 truncate">Reasoning</span>
                                <span className="shrink-0 rounded-[var(--radius-md)] border border-border/60 bg-muted/50 px-1.5 py-1 text-xs">
                                    {reasoningLabel}
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
                                        const EffortIcon = getReasoningEffortIcon(
                                            effort,
                                            selectedSharedModel
                                        )
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
                                                onClick={() => {
                                                    if (effort !== reasoningEffort) {
                                                        captureBrowserEvent(
                                                            TELEMETRY_EVENTS.reasoningEffortManuallySelected,
                                                            {
                                                                model_id:
                                                                    selectedSharedModel?.id ?? null,
                                                                previous_effort: reasoningEffort,
                                                                selected_effort: effort,
                                                                surface: "composer_mobile"
                                                            }
                                                        )
                                                    }
                                                    setReasoningEffort(effort)
                                                }}
                                            >
                                                <EffortIcon className="size-4 shrink-0" />
                                                <span className="min-w-0 flex-1 truncate">
                                                    {effortLabel}
                                                </span>
                                                {isEffortLocked && (
                                                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-[0.625rem] text-primary uppercase">
                                                        Pro
                                                    </span>
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
                        <MobileToolRow
                            label="Code execution"
                            icon={<SquareTerminal className="size-4" />}
                            enabled={codeExecutionEnabled}
                            available={modelSupportsFunctionCalling && codeExecutionAvailable}
                            onClick={() => onToggleTool("code_execution")}
                        />
                    )}

                    {!isImageModel && (
                        <MobileToolRow
                            label="Memory"
                            icon={<BrainCircuit className="size-4" />}
                            enabled={memoryEnabled}
                            available={modelSupportsFunctionCalling && memoryAvailable}
                            onClick={() => onToggleTool("supermemory")}
                        />
                    )}

                    {!isImageModel && (
                        <MobileToolRow
                            label="Math Kit"
                            icon={<Sigma className="size-4" />}
                            enabled={mathematicalInstrumentsEnabled}
                            available={
                                modelSupportsFunctionCalling && mathematicalInstrumentsAvailable
                            }
                            onClick={() => onToggleTool("mathematical_instruments")}
                        />
                    )}

                    {!isImageModel && (
                        <div
                            className={cn(
                                mobileMenuRowClassName,
                                (!modelSupportsVision || !modelSupportsFunctionCalling) &&
                                    "cursor-not-allowed"
                            )}
                        >
                            <ImageIcon
                                className={cn(
                                    "size-4 shrink-0",
                                    !(modelSupportsVision && modelSupportsFunctionCalling) &&
                                        "text-muted-foreground"
                                )}
                            />
                            <span className="min-w-0 flex-1 truncate text-foreground">
                                SilkScreen
                            </span>
                            {modelSupportsVision && modelSupportsFunctionCalling ? (
                                <span className="shrink-0 text-muted-foreground text-xs">Auto</span>
                            ) : (
                                <MobileAvailabilityIndicator
                                    label="SilkScreen"
                                    description="SilkScreen requires a model with vision and tool support."
                                />
                            )}
                        </div>
                    )}

                    {!isImageModel && (
                        <MobileToolRow
                            label="Search"
                            icon={<Globe className="size-4" />}
                            enabled={webSearchEnabled}
                            available={modelSupportsFunctionCalling && webSearchAvailable}
                            onClick={() => onToggleTool("web_search")}
                        />
                    )}

                    {!isImageModel && (
                        <div className="border-border/60 border-t pt-2">
                            <p className="px-2.5 pb-1 font-medium text-[0.6875rem] text-muted-foreground uppercase tracking-[0.16em]">
                                Image Defaults
                            </p>
                            <div
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm",
                                    !(modelSupportsVision && modelSupportsFunctionCalling) &&
                                        "cursor-not-allowed opacity-50"
                                )}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="truncate">Resolution</div>
                                </div>
                                <div className="flex items-center gap-1">
                                    {IMAGE_RESOLUTION_OPTIONS.map((option) => {
                                        const isActive = imageDefaultResolution === option
                                        return (
                                            <button
                                                key={option}
                                                type="button"
                                                disabled={
                                                    !(
                                                        modelSupportsVision &&
                                                        modelSupportsFunctionCalling
                                                    )
                                                }
                                                className={cn(
                                                    "flex h-6 min-w-9 items-center justify-center rounded border px-2 text-xs tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                                                    isActive
                                                        ? "border-primary bg-primary text-primary-foreground"
                                                        : "border-border/60 text-foreground hover:bg-muted/60"
                                                )}
                                                onClick={() =>
                                                    onSetImageDefaults({ resolution: option })
                                                }
                                            >
                                                {option}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                            <div
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm",
                                    !(modelSupportsVision && modelSupportsFunctionCalling) &&
                                        "cursor-not-allowed opacity-50"
                                )}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="truncate">Variants</div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        className="flex h-6 w-6 items-center justify-center rounded border border-border/60 text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
                                        disabled={
                                            !(
                                                modelSupportsVision && modelSupportsFunctionCalling
                                            ) || imageDefaultVariants <= 1
                                        }
                                        onClick={() =>
                                            onSetImageDefaults({
                                                variants: Math.max(1, imageDefaultVariants - 1)
                                            })
                                        }
                                    >
                                        <Minus className="h-3 w-3" />
                                    </button>
                                    <span className="min-w-8 text-center font-medium text-foreground text-xs">
                                        {imageDefaultVariants}
                                    </span>
                                    <button
                                        type="button"
                                        className="flex h-6 w-6 items-center justify-center rounded border border-border/60 text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
                                        disabled={
                                            !(
                                                modelSupportsVision && modelSupportsFunctionCalling
                                            ) || imageDefaultVariants >= MAX_DEFAULT_VARIANTS
                                        }
                                        onClick={() =>
                                            onSetImageDefaults({
                                                variants: Math.min(
                                                    MAX_DEFAULT_VARIANTS,
                                                    imageDefaultVariants + 1
                                                )
                                            })
                                        }
                                    >
                                        <Plus className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {!isImageModel && (
                        <div className="border-border/60 border-t pt-2">
                            <p className="px-2.5 pb-1 font-medium text-[0.6875rem] text-muted-foreground uppercase tracking-[0.16em]">
                                Limits
                            </p>
                            <div
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent/60",
                                    !toolLimitInteractive && "cursor-not-allowed opacity-50"
                                )}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="truncate">Tool Calls</div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        className="flex h-6 w-6 items-center justify-center rounded border border-border/60 text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
                                        disabled={
                                            !toolLimitInteractive ||
                                            toolCallLimitPerTurn <= MIN_TOOL_CALL_LIMIT_PER_TURN
                                        }
                                        onClick={() =>
                                            onSetToolCallLimit(
                                                Math.max(
                                                    MIN_TOOL_CALL_LIMIT_PER_TURN,
                                                    toolCallLimitPerTurn - 1
                                                )
                                            )
                                        }
                                    >
                                        <Minus className="h-3 w-3" />
                                    </button>
                                    <span className="min-w-8 text-center font-medium text-foreground text-xs">
                                        {toolCallLimitPerTurn || DEFAULT_TOOL_CALL_LIMIT_PER_TURN}
                                    </span>
                                    <button
                                        type="button"
                                        className="flex h-6 w-6 items-center justify-center rounded border border-border/60 text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
                                        disabled={
                                            !toolLimitInteractive ||
                                            toolCallLimitPerTurn >= MAX_TOOL_CALL_LIMIT_PER_TURN
                                        }
                                        onClick={() =>
                                            onSetToolCallLimit(
                                                Math.min(
                                                    MAX_TOOL_CALL_LIMIT_PER_TURN,
                                                    toolCallLimitPerTurn + 1
                                                )
                                            )
                                        }
                                    >
                                        <Plus className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

export function useComposerToolbarState() {
    const session = useSession()
    const auth = useConvexAuth()
    const { models: sharedModels } = useSharedModels()
    const creditPlan = useCreditAccess((state) => state.plan)
    const { selectedModel, enabledTools, setEnabledTools, reasoningEffort, setReasoningEffort } =
        useModelStore()

    const [pendingToolCallLimitPerTurn, setPendingToolCallLimitPerTurn] = useState<number | null>(
        null
    )

    const userSettings = useCurrentUserSettings(session.user?.id, auth.isLoading)
    const toolAvailability = useDiskCachedQuery(
        api.settings.getToolAvailability,
        {
            key: "tool-availability",
            default: null,
            forceCache: true
        },
        session.user?.id && !auth.isLoading ? {} : "skip"
    )
    const updateUserSettings = useConvexMutation(api.settings.updateUserSettingsPartial)
    const resolvedUserSettings =
        "error" in userSettings ? DefaultSettings(session.user?.id ?? "CACHE") : userSettings
    const resolvedToolAvailability =
        toolAvailability && !("error" in toolAvailability) ? toolAvailability : null

    const customModels = resolvedUserSettings.customModels
    const selectedDisplayModel = useMemo(
        () => resolveSelectedDisplayModel(selectedModel, sharedModels, customModels),
        [customModels, selectedModel, sharedModels]
    )
    const selectedSharedModel =
        selectedDisplayModel && !("isCustom" in selectedDisplayModel)
            ? selectedDisplayModel
            : undefined
    const allowedReasoningEfforts = useMemo(
        () => getAllowedReasoningEffortsForModel(selectedSharedModel),
        [selectedSharedModel]
    )
    const modelSupportsReasoningControl = allowedReasoningEfforts.length > 0

    const [
        modelSupportsVision,
        modelSupportsFunctionCalling,
        modelSupportsNativePdf,
        isImageModel
    ] = useMemo(() => {
        if (!selectedModel) return [false, false, false, false]
        return [
            selectedDisplayModel?.abilities.includes("vision") ?? false,
            selectedDisplayModel?.abilities.includes("function_calling") ?? false,
            selectedDisplayModel?.abilities.includes("native_pdf") ?? false,
            selectedDisplayModel?.mode === "image"
        ]
    }, [selectedDisplayModel, selectedModel])

    useEffect(() => {
        if (!modelSupportsReasoningControl && reasoningEffort !== "off") {
            setReasoningEffort("off")
        }
    }, [modelSupportsReasoningControl, reasoningEffort, setReasoningEffort])

    const webSearchAvailable = Boolean(resolvedToolAvailability?.web_search.enabled)
    const codeExecutionAvailable = Boolean(resolvedToolAvailability?.code_execution?.enabled)
    const mathematicalInstrumentsAvailable = Boolean(
        resolvedToolAvailability?.mathematical_instruments?.enabled
    )
    const hostedMemoryAvailable = Boolean(resolvedToolAvailability?.supermemory.enabled)
    const invertSendNewlineBehavior = resolvedUserSettings.invertSendNewlineBehavior === true

    useEffect(() => {
        const unavailableTools = new Set<AbilityId>()
        if (!modelSupportsFunctionCalling || !webSearchAvailable) unavailableTools.add("web_search")
        if (!modelSupportsFunctionCalling || !codeExecutionAvailable)
            unavailableTools.add("code_execution")
        if (!modelSupportsFunctionCalling || !mathematicalInstrumentsAvailable) {
            unavailableTools.add("mathematical_instruments")
        }
        const nextEnabledTools = enabledTools.filter((tool) => !unavailableTools.has(tool))
        if (nextEnabledTools.length !== enabledTools.length) {
            for (const tool of enabledTools) {
                if (!nextEnabledTools.includes(tool)) {
                    captureBrowserEvent(TELEMETRY_EVENTS.toolToggled, {
                        tool_id: tool,
                        enabled: false,
                        surface: "automatic",
                        model_id: selectedModel
                    })
                }
            }
            setEnabledTools(nextEnabledTools)
        }
    }, [
        modelSupportsFunctionCalling,
        webSearchAvailable,
        codeExecutionAvailable,
        mathematicalInstrumentsAvailable,
        enabledTools,
        selectedModel,
        setEnabledTools
    ])

    const activeToolCount = [
        webSearchAvailable && enabledTools.includes("web_search"),
        codeExecutionAvailable && enabledTools.includes("code_execution"),
        mathematicalInstrumentsAvailable && enabledTools.includes("mathematical_instruments"),
        modelSupportsFunctionCalling &&
            hostedMemoryAvailable &&
            enabledTools.includes("supermemory")
    ].filter(Boolean).length
    const toolLimitInteractive = activeToolCount > 0
    const effectiveToolCallLimitPerTurn = clampToolCallLimitPerTurn(
        resolvedUserSettings.toolCallLimitPerTurn,
        { hasEnabledTools: toolLimitInteractive }
    )
    const displayedToolCallLimitPerTurn =
        pendingToolCallLimitPerTurn ?? effectiveToolCallLimitPerTurn

    const handleToolToggle = (tool: AbilityId) => {
        if (tool === "web_search" && (!modelSupportsFunctionCalling || !webSearchAvailable)) return
        if (tool === "code_execution" && (!modelSupportsFunctionCalling || !codeExecutionAvailable))
            return
        if (
            tool === "mathematical_instruments" &&
            (!modelSupportsFunctionCalling || !mathematicalInstrumentsAvailable)
        ) {
            return
        }
        if (tool === "supermemory" && (!modelSupportsFunctionCalling || !hostedMemoryAvailable)) {
            return
        }

        const enabled = !enabledTools.includes(tool)
        captureBrowserEvent(TELEMETRY_EVENTS.toolToggled, {
            tool_id: tool,
            enabled,
            surface: "mobile_overflow",
            model_id: selectedModel
        })
        setEnabledTools(
            enabled
                ? [...enabledTools, tool]
                : enabledTools.filter((enabledTool) => enabledTool !== tool)
        )
    }

    useEffect(() => {
        if (
            pendingToolCallLimitPerTurn !== null &&
            pendingToolCallLimitPerTurn === effectiveToolCallLimitPerTurn
        ) {
            setPendingToolCallLimitPerTurn(null)
        }
    }, [effectiveToolCallLimitPerTurn, pendingToolCallLimitPerTurn])

    useEffect(() => {
        if (pendingToolCallLimitPerTurn === null) {
            return
        }

        const timeout = window.setTimeout(() => {
            void updateUserSettings({
                toolCallLimitPerTurn: pendingToolCallLimitPerTurn
            }).catch((error) => {
                setPendingToolCallLimitPerTurn(null)
                toast.error("Failed to update tool call limit")
                console.error(error)
            })
        }, 200)

        return () => window.clearTimeout(timeout)
    }, [pendingToolCallLimitPerTurn, updateUserSettings])

    const handleToolCallLimitUpdate = useCallback((nextLimit: number) => {
        setPendingToolCallLimitPerTurn(nextLimit)
    }, [])

    const imageDefaults = resolvedUserSettings.imageGenerationDefaults
    const imageDefaultResolution: ImageDefaultResolution =
        (imageDefaults?.resolution as ImageDefaultResolution | undefined) ?? "1K"
    const imageDefaultVariants = imageDefaults?.variants ?? 1
    const handleImageDefaultsUpdate = useCallback(
        (partial: { resolution?: ImageDefaultResolution; variants?: number }) => {
            void updateUserSettings({ imageGenerationDefaults: partial }).catch((error) => {
                toast.error("Failed to update image defaults")
                console.error(error)
            })
        },
        [updateUserSettings]
    )

    return {
        selectedModel,
        creditPlan,
        userSettings: resolvedUserSettings,
        selectedSharedModel,
        allowedReasoningEfforts,
        modelSupportsReasoningControl,
        modelSupportsVision,
        modelSupportsFunctionCalling,
        modelSupportsNativePdf,
        isImageModel,
        webSearchAvailable,
        codeExecutionAvailable,
        mathematicalInstrumentsAvailable,
        hostedMemoryAvailable,
        toolLimitInteractive,
        displayedToolCallLimitPerTurn,
        handleToolCallLimitUpdate,
        imageDefaultResolution,
        imageDefaultVariants,
        handleImageDefaultsUpdate,
        handleToolToggle,
        invertSendNewlineBehavior
    }
}

export type ComposerToolbarState = ReturnType<typeof useComposerToolbarState>

export function ComposerDesktopActions({
    state,
    threadId,
    uploading,
    onAttachClick,
    activeOverlay,
    onOverlayOpenChange
}: {
    state: ComposerToolbarState
    threadId?: string
    uploading: boolean
    onAttachClick: () => void
    activeOverlay?: ComposerOverlay | null
    onOverlayOpenChange?: (overlay: ComposerOverlay, open: boolean) => void
}) {
    const { enabledTools, setEnabledTools } = useModelStore()
    const suppressTooltips = activeOverlay !== null

    return (
        <motion.div
            layout
            transition={{
                duration: 0.2,
                ease: [0.16, 1, 0.3, 1]
            }}
            className="@3xl:flex hidden items-center gap-2"
        >
            {state.isImageModel ? null : (
                <>
                    <PromptInputAction
                        tooltip="Attach files"
                        delayDuration={COMPOSER_ACTION_TOOLTIP_DELAY_MS}
                        open={suppressTooltips ? false : undefined}
                    >
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onAttachClick}
                            disabled={uploading}
                            className="flex size-8 cursor-pointer items-center justify-center gap-1 bg-secondary/70 text-foreground backdrop-blur-lg hover:bg-secondary/80"
                            style={{ borderRadius: "var(--radius-md)" }}
                        >
                            {uploading ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Paperclip className="size-4 -rotate-45 hover:text-primary" />
                            )}
                        </Button>
                    </PromptInputAction>

                    <PromptInputAction
                        tooltip="Tools"
                        delayDuration={COMPOSER_ACTION_TOOLTIP_DELAY_MS}
                        open={suppressTooltips ? false : undefined}
                    >
                        <span className="inline-flex">
                            <ToolSelectorPopover
                                enabledTools={enabledTools}
                                onEnabledToolsChange={setEnabledTools}
                                modelSupportsFunctionCalling={state.modelSupportsFunctionCalling}
                                modelSupportsVision={state.modelSupportsVision}
                                selectedModel={state.selectedModel}
                                open={onOverlayOpenChange ? activeOverlay === "tools" : undefined}
                                onOpenChange={
                                    onOverlayOpenChange
                                        ? (open) => onOverlayOpenChange("tools", open)
                                        : undefined
                                }
                            />
                        </span>
                    </PromptInputAction>

                    <ReasoningEffortSelector
                        selectedModel={state.selectedModel}
                        creditPlan={state.creditPlan}
                        open={onOverlayOpenChange ? activeOverlay === "reasoning" : undefined}
                        onOpenChange={
                            onOverlayOpenChange
                                ? (open) => onOverlayOpenChange("reasoning", open)
                                : undefined
                        }
                        suppressTooltip={suppressTooltips}
                    />
                </>
            )}
        </motion.div>
    )
}

export function ComposerMobileMenu({
    state,
    onAttachClick,
    open: controlledOpen,
    onOpenChange
}: {
    state: ComposerToolbarState
    onAttachClick: () => void
    open?: boolean
    onOpenChange?: (open: boolean) => void
}) {
    const [internalOpen, setInternalOpen] = useState(false)
    const open = controlledOpen ?? internalOpen
    const enabledTools = useModelStore((modelState) => modelState.enabledTools)

    if (state.isImageModel && !state.modelSupportsReasoningControl) {
        return null
    }

    return (
        <div className="@3xl:hidden shrink-0">
            <MobileOverflowMenu
                open={open}
                onOpenChange={(nextOpen) => {
                    if (controlledOpen === undefined) setInternalOpen(nextOpen)
                    onOpenChange?.(nextOpen)
                    if (nextOpen) {
                        captureBrowserEvent(TELEMETRY_EVENTS.advancedOptionsOpened, {
                            surface: "mobile_overflow",
                            enabled_tool_ids: enabledTools
                        })
                    }
                }}
                selectedModel={state.selectedModel}
                modelSupportsVision={state.modelSupportsVision}
                modelSupportsFunctionCalling={state.modelSupportsFunctionCalling}
                modelSupportsReasoningControl={state.modelSupportsReasoningControl}
                isImageModel={state.isImageModel}
                allowedReasoningEfforts={state.allowedReasoningEfforts}
                selectedSharedModel={state.selectedSharedModel}
                creditPlan={state.creditPlan}
                webSearchAvailable={state.webSearchAvailable}
                codeExecutionAvailable={state.codeExecutionAvailable}
                mathematicalInstrumentsAvailable={state.mathematicalInstrumentsAvailable}
                memoryAvailable={state.hostedMemoryAvailable}
                toolCallLimitPerTurn={state.displayedToolCallLimitPerTurn}
                toolLimitInteractive={state.toolLimitInteractive}
                onSetToolCallLimit={state.handleToolCallLimitUpdate}
                imageDefaultResolution={state.imageDefaultResolution}
                imageDefaultVariants={state.imageDefaultVariants}
                onSetImageDefaults={state.handleImageDefaultsUpdate}
                onToggleTool={state.handleToolToggle}
                onAttachClick={onAttachClick}
            />
        </div>
    )
}

export const MultimodalInput = forwardRef<
    MultimodalInputRef,
    {
        onSubmit: (input?: string, files?: UploadedFile[]) => void
        status: ReturnType<typeof useChat>["status"]
        threadId?: string
        folderId?: string
        isActive?: boolean
        showIntentShortcuts?: boolean
        threadHasPdfAttachments?: boolean
        messages?: UIMessage[]
        onInputActivityChange?: (isActive: boolean) => void
    }
>(function MultimodalInput(
    {
        onSubmit,
        status,
        threadId,
        folderId,
        isActive = true,
        showIntentShortcuts = false,
        threadHasPdfAttachments = false,
        messages = [],
        onInputActivityChange
    },
    ref
) {
    const { token } = useToken()
    const session = useSession()
    const auth = useConvexAuth()
    const deleteFileMutation = useMutation(api.attachments.deleteFile)
    const killPersistentSandbox = useAction(api.persistent_sandboxes_node.killMyPersistentSandbox)
    const activePersistentSandbox = useQuery(
        api.persistent_sandboxes.getMyActivePersistentSandbox,
        session.user?.id && !auth.isLoading ? {} : "skip"
    )
    const { policy: uploadPolicy, policyVersion, invalidateUploadPolicy } = useUploadPolicy()
    const isTouchDevice = useIsTouchDevice()
    const composerToolbar = useComposerToolbarState()
    const {
        userSettings,
        selectedSharedModel,
        modelSupportsFunctionCalling,
        modelSupportsVision,
        modelSupportsNativePdf,
        codeExecutionAvailable,
        isImageModel,
        invertSendNewlineBehavior
    } = composerToolbar

    const { selectedModel, setSelectedModel, enabledTools, setEnabledTools } = useModelStore()
    const {
        uploadedFiles,
        setUploadedFiles,
        addUploadedFile,
        removeUploadedFile,
        uploading,
        setUploading
    } = useChatStore()
    const { chatWidthState } = useChatWidthStore()

    const isLoading = status === "streaming"
    const isImageGenerationPending = useMemo(() => hasPendingImageGeneration(messages), [messages])
    // One-shot escape hatch: "Send anyway" on the gate toast arms this for a single
    // submit so a generation stuck in a non-terminal status can never lock the thread.
    const imageGenerationGateBypassRef = useRef(false)
    const uploadInputRef = useRef<HTMLInputElement>(null)
    const promptInputRef = useRef<PromptInputRef>(null)
    const composerViewportRef = useRef<HTMLDivElement>(null)
    const pastedTextCounterRef = useRef(0)
    const largePasteUploadSourcesRef = useRef(new WeakMap<File, LargePasteUploadSource>())
    const draftScope = useMemo(() => ({ threadId, folderId }), [folderId, threadId])
    const draftKey = getThreadDraftKey(draftScope)

    const [fileContents, setFileContents] = useState<Record<string, string>>({})
    const [fileTokenCounts, setFileTokenCounts] = useState<Record<string, number>>({})
    const [fileImageDimensions, setFileImageDimensions] = useState<Record<string, ImageDimensions>>(
        {}
    )
    const [localUploadingFiles, setLocalUploadingFiles] = useState<LocalUploadingFile[]>([])
    const [documentConversionBatches, setDocumentConversionBatches] = useState(0)
    const attachmentsBusy =
        localUploadingFiles.some((file) => file.status !== "error") || documentConversionBatches > 0
    const [dialogFile, setDialogFile] = useState<{
        content?: string
        fileName: string
        fileType: string
        url: string
    } | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [extendedFiles, setExtendedFiles] = useState<ExtendedUploadedFile[]>([])
    const [isKillingPersistentSandbox, setIsKillingPersistentSandbox] = useState(false)

    const handleKillPersistentSandbox = async () => {
        if (!activePersistentSandbox) return
        setIsKillingPersistentSandbox(true)
        try {
            await killPersistentSandbox({ sandboxId: activePersistentSandbox._id })
            toast.success("Persistent sandbox killed")
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Failed to kill persistent sandbox"
            )
        } finally {
            setIsKillingPersistentSandbox(false)
        }
    }

    useEffect(() => {
        setUploading(attachmentsBusy)
    }, [attachmentsBusy, setUploading])

    const {
        state: voiceState,
        startRecording,
        stopRecording
    } = useVoiceRecorder({
        onTranscript: (text: string) => {
            if (promptInputRef.current) {
                const currentValue = promptInputRef.current.getValue()
                const newValue = currentValue ? `${currentValue} ${text}` : text
                promptInputRef.current.setValue(newValue)
                promptInputRef.current.focus()
                setInputValue(newValue)
            }
        }
    })

    useEffect(() => {
        setExtendedFiles(uploadedFiles.map((file) => ({ ...file })))
    }, [uploadedFiles])

    const requiresNativePdfForModelSelection = useMemo(
        () => threadHasPdfAttachments || hasPdfAttachmentInUploadedFiles(uploadedFiles),
        [threadHasPdfAttachments, uploadedFiles]
    )

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

        if (attachmentsBusy) return

        if (isImageGenerationPending && !imageGenerationGateBypassRef.current) {
            toast.warning("An image is still generating in this chat.", {
                action: {
                    label: "Send anyway",
                    onClick: () => {
                        imageGenerationGateBypassRef.current = true
                        void handleSubmit()
                    }
                }
            })
            return
        }
        imageGenerationGateBypassRef.current = false

        const attachmentValidationErrors = uploadedFiles
            .map((file) =>
                getAttachmentValidationError(
                    {
                        name: file.fileName,
                        mimeType: file.fileType,
                        size: file.fileSize
                    },
                    {
                        supportsVision: modelSupportsVision,
                        supportsNativePdf: modelSupportsNativePdf
                    },
                    uploadPolicy
                )
            )
            .filter((error): error is string => Boolean(error))

        if (attachmentValidationErrors.length > 0) {
            toast.error(`File validation failed:\n${attachmentValidationErrors.join("\n")}`)
            return
        }

        if (isTouchDevice) {
            promptInputRef.current?.getElement()?.blur()
            setIsInputFocused(false)
        }

        promptInputRef.current?.clear()
        setInputValue("")
        setActiveIntent(null)
        clearThreadDraft(draftScope)
        captureBrowserEvent(TELEMETRY_EVENTS.composerSubmitted, {
            model_id: selectedModel,
            thread_id: threadId ?? null,
            attachment_count: uploadedFiles.length,
            prompt_character_count: inputValue.trim().length,
            prompt_estimated_tokens: estimateTokenCount(inputValue.trim()),
            enabled_tool_count: enabledTools.length,
            enabled_tool_ids: enabledTools,
            existing_message_count: messages.length,
            is_new_thread: !threadId,
            intent: activeIntent
        })
        onSubmit(inputValue, uploadedFiles)
    }

    const [inputValue, setInputValue] = useState("")
    const [isInputFocused, setIsInputFocused] = useState(false)
    const [activeComposerOverlay, setActiveComposerOverlay] = useState<ComposerOverlay | null>(null)
    const handleComposerOverlayOpenChange = useCallback(
        (overlay: ComposerOverlay, open: boolean) => {
            setActiveComposerOverlay((currentOverlay) => {
                if (open) return overlay
                return currentOverlay === overlay ? null : currentOverlay
            })
        },
        []
    )
    const isModelSelectorOpen = activeComposerOverlay === "model"
    const [activeIntent, setActiveIntent] = useState<ComposerIntentId | null>(null)
    const [attachingImageKey, setAttachingImageKey] = useState<string>()
    const [webTrends, setWebTrends] = useState<WebTrendSuggestion[]>([])
    const [webTrendsLoading, setWebTrendsLoading] = useState(false)
    const [webTrendsLoaded, setWebTrendsLoaded] = useState(false)
    const [hydratedDraftKey, setHydratedDraftKey] = useState<string>()
    const [isClient, setIsClient] = useState(false)
    const isInputEmpty = !inputValue.trim()
    const activeComposerKey = isActive ? draftKey : null

    useEffect(() => {
        if (!isClient || !activeComposerKey || isTouchDevice) return

        promptInputRef.current?.focus()
    }, [activeComposerKey, isClient, isTouchDevice])

    const intentGuideStage = resolveIntentGuideStage({
        activeIntent,
        draft: inputValue,
        attachmentCount: uploadedFiles.length
    })
    const recentGeneratedImages = usePaginatedQuery(
        api.images.paginateGeneratedImages,
        showIntentShortcuts && activeIntent === "image" && session.user?.id
            ? { sortBy: "newest", view: "active" }
            : "skip",
        { initialNumItems: 6 }
    )
    const voiceInputEnabled = optionalBrowserEnv("VITE_ENABLE_VOICE_INPUT") === "true"
    const predictedByokContextRouting = useMemo(() => {
        if (!selectedSharedModel || isImageModel) return null
        if (!selectedSharedModel.adapters.some((adapter) => adapter.startsWith("openrouter:"))) {
            return null
        }
        const openRouterByokEnabled =
            "openrouter" in userSettings.coreAIProviders &&
            userSettings.coreAIProviders.openrouter?.enabled === true
        const { hostedInputLimit, modelInputLimit } =
            resolveComposerContextLimits(selectedSharedModel)
        const attachmentTokens = uploadedFiles.reduce((total, file) => {
            return (
                total +
                estimateUploadedFileTokens(
                    file,
                    fileTokenCounts[file.key],
                    fileImageDimensions[file.key],
                    selectedModel
                )
            )
        }, 0)
        const draftTokens =
            DEFAULT_MESSAGE_OVERHEAD_TOKENS + estimateTokenCount(inputValue) + attachmentTokens
        const threadTokens = messages.reduce(
            (total, message) => total + estimateUiMessageTokens(message),
            0
        )
        const prospectiveTokens = threadTokens + draftTokens
        const composerWarningThreshold =
            hostedInputLimit * COMPOSER_CONTEXT_WARNING_CONFIDENCE_MULTIPLIER

        if (draftTokens > composerWarningThreshold) {
            return {
                reason: "message" as const,
                estimatedTokens: draftTokens,
                limitTokens: hostedInputLimit,
                openRouterByokEnabled,
                exceedsModelLimit: draftTokens > modelInputLimit
            }
        }

        if (prospectiveTokens > composerWarningThreshold) {
            return {
                reason: "thread" as const,
                estimatedTokens: prospectiveTokens,
                limitTokens: hostedInputLimit,
                openRouterByokEnabled,
                exceedsModelLimit: prospectiveTokens > modelInputLimit
            }
        }

        return null
    }, [
        fileTokenCounts,
        fileImageDimensions,
        inputValue,
        isImageModel,
        messages,
        selectedModel,
        selectedSharedModel,
        uploadedFiles,
        userSettings
    ])

    useEffect(() => {
        if (!isClient) return

        const draft = loadThreadDraft(draftScope)
        const text = draft?.text ?? ""
        setActiveIntent(null)
        promptInputRef.current?.setValue(text)
        setInputValue(text)
        setUploadedFiles(draft?.attachments ?? [])
        pastedTextCounterRef.current = (draft?.attachments ?? []).filter(
            (file) => file.source === "pasted-text"
        ).length
        setHydratedDraftKey(draftKey)
    }, [draftKey, draftScope, isClient, setUploadedFiles])

    useEffect(() => {
        if (hydratedDraftKey !== draftKey) return

        const timeout = window.setTimeout(() => {
            saveThreadDraft({
                ...draftScope,
                key: draftKey,
                text: inputValue,
                attachments: uploadedFiles,
                updatedAt: Date.now()
            })
        }, 400)
        return () => window.clearTimeout(timeout)
    }, [draftKey, draftScope, hydratedDraftKey, inputValue, uploadedFiles])

    useEffect(() => {
        const checkInputValue = () => {
            const value = promptInputRef.current?.getValue() || ""
            setInputValue(value)
        }

        const interval = setInterval(checkInputValue, 200)
        return () => clearInterval(interval)
    }, [])

    useEffect(() => {
        onInputActivityChange?.(isInputFocused && !isInputEmpty)
    }, [isInputEmpty, isInputFocused, onInputActivityChange])

    useEffect(
        () => () => {
            onInputActivityChange?.(false)
        },
        [onInputActivityChange]
    )

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

    const showTextInComposer = useCallback((text: string) => {
        const currentValue = promptInputRef.current?.getValue() || ""
        const nextValue = mergePastedTextIntoDraft(currentValue, text)
        promptInputRef.current?.setValue(nextValue)
        promptInputRef.current?.focus()
        setInputValue(nextValue)
    }, [])

    const uploadFileWithProgress = useCallback(
        async (
            file: File,
            onProgress: (progress: number) => void,
            signal?: AbortSignal
        ): Promise<ExtendedUploadedFile> => {
            const jwt = await resolveJwtToken(token)
            if (!jwt) {
                throw new Error("Authentication token unavailable")
            }

            return uploadChatAttachment({
                file,
                jwt,
                uploadUrl: `${browserEnv("VITE_CONVEX_API_URL")}/upload`,
                policyVersion,
                onPolicyVersionMismatch: invalidateUploadPolicy,
                onProgress,
                signal
            })
        },
        [invalidateUploadPolicy, policyVersion, token]
    )

    const handleFileUpload = useCallback(
        async (filesToUpload: File[]) => {
            if (filesToUpload.length === 0) return

            const syncErrors: string[] = []
            const validFiles: File[] = []

            for (const file of filesToUpload) {
                const validationError = getAttachmentValidationError(
                    {
                        name: file.name,
                        mimeType: file.type,
                        size: file.size
                    },
                    {
                        supportsVision: modelSupportsVision,
                        supportsNativePdf: modelSupportsNativePdf
                    },
                    uploadPolicy
                )

                if (validationError) {
                    syncErrors.push(validationError)
                    captureBrowserEvent(TELEMETRY_EVENTS.attachmentProcessingFailed, {
                        category: getAttachmentTelemetryCategory(file),
                        size_bucket: getAttachmentSizeBucket(file.size),
                        duration_ms: 0,
                        stage: "validation",
                        error_type: "validation"
                    })
                    continue
                }

                validFiles.push(file)
            }

            if (syncErrors.length > 0) {
                toast.error(`File validation failed:\n${syncErrors.join("\n")}`)
            }

            if (validFiles.length === 0) return

            const filesReadyForUpload: File[] = []
            const hasDocuments = validFiles.some((file) => isDocumentExtension(file.name))
            if (hasDocuments) {
                setDocumentConversionBatches((current) => current + 1)
            }

            try {
                for (const file of validFiles) {
                    const processingStartedAt = Date.now()
                    if (!isDocumentExtension(file.name)) {
                        filesReadyForUpload.push(file)
                        continue
                    }

                    try {
                        const ingested = await ingestChatAttachment(file, {
                            canReferenceLongTextAttachments:
                                modelSupportsFunctionCalling && codeExecutionAvailable
                        })
                        const decision = ingested.decision
                        if (!decision || !ingested.content) continue

                        if (ingested.delivery === "inline") {
                            const inlineFile = createInlineIngestedFile(ingested)
                            setFileContents((current) => ({
                                ...current,
                                [inlineFile.key]: ingested.content!
                            }))
                            setFileTokenCounts((current) => ({
                                ...current,
                                [inlineFile.key]: estimateTokenCount(ingested.content!)
                            }))
                            addUploadedFile(inlineFile)
                            captureBrowserEvent(TELEMETRY_EVENTS.attachmentProcessingCompleted, {
                                category: getAttachmentTelemetryCategory(file),
                                size_bucket: getAttachmentSizeBucket(file.size),
                                duration_ms: Date.now() - processingStartedAt,
                                stage: "inline_ingest"
                            })
                            continue
                        }

                        const nextEnabledTools = getEnabledToolsForPastedText(
                            decision,
                            enabledTools
                        )
                        if (nextEnabledTools !== enabledTools) {
                            setEnabledTools(nextEnabledTools)
                            toast.info("Code execution enabled for this document")
                        }

                        largePasteUploadSourcesRef.current.set(ingested.file, {
                            content: ingested.content,
                            displayName: ingested.displayName,
                            source: "document",
                            ingested
                        })
                        filesReadyForUpload.push(ingested.file)
                    } catch (error) {
                        captureBrowserEvent(TELEMETRY_EVENTS.attachmentProcessingFailed, {
                            category: getAttachmentTelemetryCategory(file),
                            size_bucket: getAttachmentSizeBucket(file.size),
                            duration_ms: Date.now() - processingStartedAt,
                            stage: "conversion",
                            error_type: getErrorType(error)
                        })
                        toast.error(
                            error instanceof Error
                                ? error.message
                                : `${file.name}: Document conversion failed`
                        )
                    }
                }
            } finally {
                if (hasDocuments) {
                    setDocumentConversionBatches((current) => Math.max(0, current - 1))
                }
            }

            if (filesReadyForUpload.length === 0) {
                if (uploadInputRef.current) {
                    uploadInputRef.current.value = ""
                }
                return
            }

            const newLocalFiles = filesReadyForUpload.map<LocalUploadingFile>((file) => {
                const id = Math.random().toString(36).substring(7)
                const largePasteSource = largePasteUploadSourcesRef.current.get(file)
                let previewUrl: string | undefined

                if (getFileTypeInfo(file.name, file.type).isImage) {
                    previewUrl = URL.createObjectURL(file)
                }

                return {
                    id,
                    file,
                    startedAt: Date.now(),
                    progress: 0,
                    status: "uploading" as const,
                    previewUrl,
                    abortController: new AbortController(),
                    tileKind: largePasteSource ? "large-paste" : "attachment",
                    largePasteContent: largePasteSource?.content,
                    largePasteSource: largePasteSource?.source,
                    displayName: largePasteSource?.displayName
                }
            })

            setLocalUploadingFiles((prev) => [...prev, ...newLocalFiles])

            newLocalFiles.forEach(async (localFile) => {
                try {
                    const largePasteSource = largePasteUploadSourcesRef.current.get(localFile.file)
                    const fileToUpload = await prepareChatAttachmentForUpload(
                        localFile.file,
                        uploadPolicy
                    )

                    const result = await uploadFileWithProgress(
                        fileToUpload,
                        (progress) => {
                            setLocalUploadingFiles((prev) =>
                                prev.map((f) => (f.id === localFile.id ? { ...f, progress } : f))
                            )
                        },
                        localFile.abortController.signal
                    )

                    if (localFile.abortController.signal.aborted) {
                        await deleteFileMutation({ key: result.key }).catch(console.error)
                        setLocalUploadingFiles((prev) => {
                            return prev.filter((f) => f.id !== localFile.id)
                        })
                        return
                    }

                    setLocalUploadingFiles((prev) =>
                        prev.map((f) => (f.id === localFile.id ? { ...f, progress: 100 } : f))
                    )

                    if (result.file) {
                        const content =
                            largePasteSource?.content ??
                            (await readChatAttachmentContent(result.file))
                        setFileContents((prev) => ({
                            ...prev,
                            [result.key]: content
                        }))
                        if (!isImageMimeType(result.file.type)) {
                            setFileTokenCounts((prev) => ({
                                ...prev,
                                [result.key]: estimateTokenCount(content)
                            }))
                        }
                        if (isImageMimeType(result.file.type)) {
                            const image = new Image()
                            image.src = content
                            await image.decode().catch(() => undefined)
                            if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                                setFileImageDimensions((prev) => ({
                                    ...prev,
                                    [result.key]: {
                                        width: image.naturalWidth,
                                        height: image.naturalHeight
                                    }
                                }))
                            }
                        }
                    }

                    const minimumProgressDuration = 500
                    const remainingProgressDuration = Math.max(
                        0,
                        minimumProgressDuration - (Date.now() - localFile.startedAt)
                    )
                    if (remainingProgressDuration > 0) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, remainingProgressDuration)
                        )
                    }

                    setLocalUploadingFiles((prev) =>
                        prev.map((f) => (f.id === localFile.id ? { ...f, status: "success" } : f))
                    )

                    await new Promise((resolve) => setTimeout(resolve, 500))

                    setLocalUploadingFiles((prev) =>
                        prev.map((f) => (f.id === localFile.id ? { ...f, status: "ready" } : f))
                    )

                    await new Promise((resolve) => setTimeout(resolve, 200))

                    if (localFile.abortController.signal.aborted) {
                        await deleteFileMutation({ key: result.key }).catch(console.error)
                        setLocalUploadingFiles((prev) => {
                            return prev.filter((f) => f.id !== localFile.id)
                        })
                        return
                    }

                    const uploadedResult: ExtendedUploadedFile = largePasteSource?.ingested
                        ? finalizeIngestedUpload(result, largePasteSource.ingested)
                        : largePasteSource
                          ? {
                                ...result,
                                source: "pasted-text",
                                tileKind: "large-paste",
                                displayName: largePasteSource.displayName,
                                largePasteContent: largePasteSource.content
                            }
                          : { ...result, tileKind: "attachment" }

                    addUploadedFile(uploadedResult)
                    captureBrowserEvent(TELEMETRY_EVENTS.attachmentProcessingCompleted, {
                        category: getAttachmentTelemetryCategory(localFile.file),
                        size_bucket: getAttachmentSizeBucket(localFile.file.size),
                        duration_ms: Date.now() - localFile.startedAt,
                        stage: "upload"
                    })

                    if (localFile.previewUrl) {
                        URL.revokeObjectURL(localFile.previewUrl)
                    }

                    setLocalUploadingFiles((prev) => {
                        return prev.filter((f) => f.id !== localFile.id)
                    })
                } catch (error) {
                    if (error instanceof DOMException && error.name === "AbortError") {
                        setLocalUploadingFiles((prev) => {
                            return prev.filter((f) => f.id !== localFile.id)
                        })
                        return
                    }

                    const errorMessage = error instanceof Error ? error.message : "Upload failed"
                    captureBrowserEvent(TELEMETRY_EVENTS.attachmentProcessingFailed, {
                        category: getAttachmentTelemetryCategory(localFile.file),
                        size_bucket: getAttachmentSizeBucket(localFile.file.size),
                        duration_ms: Date.now() - localFile.startedAt,
                        stage: "upload",
                        error_type: getErrorType(error)
                    })
                    toast.error(errorMessage)

                    setLocalUploadingFiles((prev) =>
                        prev.map((f) =>
                            f.id === localFile.id
                                ? { ...f, status: "error", error: errorMessage }
                                : f
                        )
                    )
                }
            })

            if (uploadInputRef.current) {
                uploadInputRef.current.value = ""
            }
        },
        [
            uploadFileWithProgress,
            addUploadedFile,
            codeExecutionAvailable,
            deleteFileMutation,
            enabledTools,
            modelSupportsFunctionCalling,
            modelSupportsVision,
            modelSupportsNativePdf,
            setEnabledTools,
            uploadPolicy
        ]
    )

    useImperativeHandle(
        ref,
        () => ({
            handleFileUpload,
            setValue: (value: string) => {
                promptInputRef.current?.setValue(value)
                setInputValue(value)
            },
            insertQuote: (selection: string) => {
                const currentValue = promptInputRef.current?.getValue() || ""
                const nextValue = appendQuotedSelection(currentValue, selection)

                if (nextValue === currentValue) {
                    return
                }

                promptInputRef.current?.setValue(nextValue)
                promptInputRef.current?.focus()
                setInputValue(nextValue)
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
        setFileTokenCounts((prev) => {
            const next = { ...prev }
            delete next[key]
            return next
        })
        setFileImageDimensions((prev) => {
            const next = { ...prev }
            delete next[key]
            return next
        })
        if (key.startsWith("inline-document:")) {
            toast.success("Attachment deleted")
            return
        }

        deleteFileMutation({ key })
            .then((result) => {
                if (result.success) {
                    toast.success("Attachment deleted")
                } else if (result.error === "File not found") {
                    toast.info("Attachment was already deleted")
                } else {
                    toast.error(result.error || "Failed to delete attachment")
                }
            })
            .catch((error) => {
                toast.error(error instanceof Error ? error.message : "Failed to delete attachment")
            })
    }

    const handleRemoveUploadingFile = (localFile: LocalUploadingFile) => {
        localFile.abortController.abort()
        if (localFile.previewUrl) {
            URL.revokeObjectURL(localFile.previewUrl)
        }
        setLocalUploadingFiles((current) => current.filter((file) => file.id !== localFile.id))
    }

    const handleShowUploadingPastedText = (localFile: LocalUploadingFile) => {
        if (!localFile.largePasteContent || localFile.largePasteSource !== "pasted-text") return

        localFile.abortController.abort()
        setLocalUploadingFiles((prev) => {
            return prev.filter((file) => file.id !== localFile.id)
        })
        showTextInComposer(localFile.largePasteContent)
    }

    const handleShowUploadedPastedText = (uploadedFile: ExtendedUploadedFile) => {
        const pastedText = uploadedFile.largePasteContent
        if (!pastedText || uploadedFile.source !== "pasted-text") return

        handleRemoveFile(uploadedFile.key)
        showTextInComposer(pastedText)
    }

    const handlePaste = useCallback(
        async (e: ClipboardEvent) => {
            const items = Array.from(e.clipboardData?.items || [])
            const files: File[] = []
            const pastedText = e.clipboardData?.getData("text/plain") ?? ""

            for (const item of items) {
                if (item.kind === "file") {
                    const file = item.getAsFile()
                    if (file) {
                        files.push(file)
                        e.preventDefault()
                    }
                }
            }

            if (files.length > 0) {
                await handleFileUpload(files)
                return
            }

            if (!pastedText) {
                e.preventDefault()
                return
            }

            const decision = classifyPastedText(pastedText, {
                canReferenceLongTextAttachments:
                    modelSupportsFunctionCalling && codeExecutionAvailable
            })
            if (decision.disposition === "inline") return

            e.preventDefault()
            const nextEnabledTools = getEnabledToolsForPastedText(decision, enabledTools)
            if (nextEnabledTools !== enabledTools) {
                setEnabledTools(nextEnabledTools)
                toast.info("Code execution enabled for this long paste")
            }
            pastedTextCounterRef.current += 1
            const names = getPastedTextNames(pastedTextCounterRef.current)
            const pastedFile = new File([pastedText], names.fileName, { type: "text/plain" })
            largePasteUploadSourcesRef.current.set(pastedFile, {
                content: pastedText,
                displayName: names.displayName,
                source: "pasted-text"
            })
            await handleFileUpload([pastedFile])
        },
        [
            codeExecutionAvailable,
            enabledTools,
            handleFileUpload,
            modelSupportsFunctionCalling,
            setEnabledTools
        ]
    )

    const getFileType = (
        uploadedFile: ExtendedUploadedFile
    ): { isImage: boolean; isCode: boolean; isText: boolean } => {
        const fileType = uploadedFile.file?.type || uploadedFile.fileType
        return getFileTypeInfo(uploadedFile.fileName, fileType)
    }

    const getFileIcon = (uploadedFile: ExtendedUploadedFile) => {
        if (uploadedFile.tileKind === "large-paste") {
            return <FileText className="size-4 text-primary" />
        }

        const { isImage, isCode } = getFileType(uploadedFile)

        if (isImage) return <ImageIcon className="size-4 text-blue-500" />
        if (isCode) return <Code className="size-4 text-green-500" />
        return <FileType className="size-4 text-gray-500" />
    }

    const renderLocalUploadingFile = (localFile: LocalUploadingFile) => {
        const { isImage, isCode } = getFileTypeInfo(localFile.file.name, localFile.file.type)
        const actionLabel = localFile.status === "error" ? "Remove failed upload" : "Cancel upload"
        const icon =
            localFile.tileKind === "large-paste" ? (
                <FileText className="size-4 text-primary" />
            ) : isCode ? (
                <Code className="size-4 text-green-500" />
            ) : (
                <FileType className="size-4 text-gray-500" />
            )

        return (
            <div key={localFile.id} className="group relative">
                <AttachmentTile
                    fileName={localFile.displayName ?? localFile.file.name}
                    kind={localFile.tileKind}
                    icon={icon}
                    status={localFile.status}
                    progress={localFile.progress}
                    error={localFile.error}
                    previewUrl={isImage ? localFile.previewUrl : undefined}
                    secondaryAction={
                        localFile.largePasteSource === "pasted-text" &&
                        localFile.largePasteContent ? (
                            <button
                                type="button"
                                className="mt-0.5 truncate text-left text-primary text-xs hover:underline"
                                onClick={() => handleShowUploadingPastedText(localFile)}
                            >
                                Show as text
                            </button>
                        ) : undefined
                    }
                    className={cn(!isImage && "w-auto min-w-[5rem]")}
                />

                <Tooltip delayDuration={150}>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            onClick={() => handleRemoveUploadingFile(localFile)}
                            aria-label={actionLabel}
                            className="absolute -top-2 -right-2 h-8 w-8 bg-background/50 text-foreground opacity-100 shadow-sm transition-opacity hover:bg-destructive hover:text-destructive-foreground md:-top-1 md:-right-1 md:h-5 md:w-5 md:opacity-0 md:group-hover:opacity-100"
                            style={{ borderRadius: "var(--radius-xl)" }}
                        >
                            <X className="size-4 md:size-3" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                        <p>{actionLabel}</p>
                    </TooltipContent>
                </Tooltip>
            </div>
        )
    }

    const renderFilePreview = (uploadedFile: ExtendedUploadedFile) => {
        const content = fileContents[uploadedFile.key]
        const fileType = uploadedFile.file?.type || uploadedFile.fileType
        const { isImage, isSvg } = getFileTypeInfo(uploadedFile.fileName, fileType)
        const assetUrl = uploadedFile.inlineDataUrl ?? getPublicR2AssetUrl(uploadedFile.key)
        const publicUrl = isImage ? assetUrl : undefined
        const previewUrl = isImage
            ? isSvg
                ? publicUrl
                : (content ?? getFileThumbnailSources(uploadedFile.key).src)
            : undefined

        return (
            <div key={uploadedFile.key} className="group relative">
                <AttachmentTile
                    fileName={uploadedFile.displayName ?? uploadedFile.fileName}
                    kind={uploadedFile.tileKind ?? "attachment"}
                    icon={getFileIcon(uploadedFile)}
                    previewUrl={previewUrl}
                    onClick={() => {
                        setDialogFile({
                            content,
                            fileName: uploadedFile.fileName,
                            fileType: uploadedFile.fileType,
                            url: assetUrl
                        })
                        setDialogOpen(true)
                    }}
                    secondaryAction={
                        uploadedFile.source === "pasted-text" && uploadedFile.largePasteContent ? (
                            <button
                                type="button"
                                onClick={() => handleShowUploadedPastedText(uploadedFile)}
                                className="max-w-full truncate text-left text-primary text-xs hover:underline"
                            >
                                Show as text
                            </button>
                        ) : undefined
                    }
                    className={cn(!previewUrl && "w-auto min-w-[5rem]")}
                />

                <Tooltip delayDuration={150}>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleRemoveFile(uploadedFile.key)
                            }}
                            aria-label="Remove attachment"
                            className="absolute -top-2 -right-2 h-8 w-8 bg-background/50 text-foreground opacity-100 shadow-sm transition-opacity hover:bg-destructive hover:text-destructive-foreground md:-top-1 md:-right-1 md:h-5 md:w-5 md:opacity-0 md:group-hover:opacity-100"
                            style={{ borderRadius: "var(--radius-xl)" }}
                        >
                            <X className="size-4 md:size-3" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                        <p>Remove attachment</p>
                    </TooltipContent>
                </Tooltip>
            </div>
        )
    }

    const renderDialogContent = () => {
        if (!dialogFile) return null

        const fileTypeInfo = getFileTypeInfo(dialogFile.fileName, dialogFile.fileType)
        const isImage = fileTypeInfo.isImage
        const isText = fileTypeInfo.isText
        const isTabular = isTabularTextFile(dialogFile.fileName, dialogFile.fileType)
        const textPreview =
            isText && dialogFile.content !== undefined
                ? truncateTextPreview(dialogFile.content)
                : undefined

        return (
            <div className="max-h-[70dvh] w-full overflow-auto">
                {isImage ? (
                    <img
                        src={dialogFile.content ?? dialogFile.url}
                        alt={dialogFile.fileName}
                        className="h-auto w-full rounded object-contain"
                    />
                ) : isTabular ? (
                    <TabularFilePreview
                        url={dialogFile.url}
                        content={dialogFile.content}
                        filename={dialogFile.fileName}
                        mediaType={dialogFile.fileType}
                    />
                ) : isText ? (
                    textPreview ? (
                        <div className="space-y-2">
                            {textPreview.truncated && (
                                <p className="text-muted-foreground text-xs">
                                    Preview limited to {TEXT_PREVIEW_MAX_LINES} lines or{" "}
                                    {TEXT_PREVIEW_MAX_CHARS.toLocaleString()} characters. Download
                                    the file for the complete content.
                                </p>
                            )}
                            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-muted p-4 text-sm">
                                {textPreview.content}
                            </pre>
                        </div>
                    ) : (
                        <iframe
                            src={dialogFile.url}
                            className="h-[69dvh] w-full rounded-[var(--radius-md)] border-0"
                            title={dialogFile.fileName}
                        />
                    )
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

    const isNewChatComposer = !threadId && messages.length === 0
    const isCompactTouchComposer =
        isTouchDevice &&
        !isNewChatComposer &&
        !isInputFocused &&
        !isModelSelectorOpen &&
        !inputValue.trim() &&
        uploadedFiles.length === 0 &&
        localUploadingFiles.length === 0

    const loadWebTrends = useCallback(async () => {
        if (webTrendsLoaded || webTrendsLoading) return
        setWebTrendsLoading(true)

        try {
            const geo = resolveGoogleTrendsGeo(navigator.languages)
            const trends = await fetchWebTrendSuggestions(geo)
            setWebTrends(trends)
        } catch (error) {
            console.warn("[search-trends] Could not load live suggestions", error)
        } finally {
            setWebTrendsLoaded(true)
            setWebTrendsLoading(false)
        }
    }, [webTrendsLoaded, webTrendsLoading])

    const prepareIntent = useCallback(
        (intent: ComposerIntentId) => {
            const tool: AbilityId | undefined =
                intent === "web"
                    ? "web_search"
                    : intent === "analysis"
                      ? "code_execution"
                      : undefined
            if (tool && !enabledTools.includes(tool)) {
                setEnabledTools([...enabledTools, tool])
            }

            if (!promptInputRef.current?.getValue().trim()) {
                const prompt = COMPOSER_INTENT_PREFIXES[intent]
                promptInputRef.current?.setValue(prompt)
                setInputValue(prompt)
            }
            setActiveIntent(intent)
            if (intent === "web") void loadWebTrends()
            promptInputRef.current?.focus()
        },
        [enabledTools, loadWebTrends, setEnabledTools]
    )

    const clearIntent = useCallback(() => {
        if (activeIntent) {
            const value = promptInputRef.current?.getValue() ?? ""
            if (value.trim() === COMPOSER_INTENT_PREFIXES[activeIntent].trim()) {
                promptInputRef.current?.setValue("")
                setInputValue("")
            }
        }
        setActiveIntent(null)
    }, [activeIntent])

    const chooseIntentPrompt = useCallback((prompt: string) => {
        promptInputRef.current?.setValue(prompt)
        setInputValue(prompt)
        promptInputRef.current?.focus()
    }, [])

    const appendIntentPrompt = useCallback((text: string) => {
        const currentValue = promptInputRef.current?.getValue() ?? ""
        const nextValue = `${currentValue.trimEnd()}${text}`
        promptInputRef.current?.setValue(nextValue)
        setInputValue(nextValue)
        promptInputRef.current?.focus()
    }, [])

    const attachRecentGeneratedImage = useCallback(
        async (
            image: Pick<Doc<"generatedImages">, "_id" | "storageKey" | "prompt" | "aspectRatio">
        ) => {
            if (attachingImageKey) return
            setAttachingImageKey(image.storageKey)

            try {
                const response = await fetch(getGeneratedImageDirectUrl(image.storageKey))
                if (!response.ok) throw new Error("Could not load that image")

                const blob = await response.blob()
                const mimeType = blob.type || "image/png"
                const extension =
                    mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "png"
                const file = new File([blob], `silkscreen-reference-${Date.now()}.${extension}`, {
                    type: mimeType,
                    lastModified: Date.now()
                })

                await handleFileUpload([file])
                promptInputRef.current?.focus()
            } catch (error) {
                console.error("Failed to attach recent generated image:", error)
                toast.error(error instanceof Error ? error.message : "Failed to attach image")
            } finally {
                setAttachingImageKey(undefined)
            }
        },
        [attachingImageKey, handleFileUpload]
    )

    const handleIntentUpload = useCallback(() => {
        if (!activeIntent) {
            prepareIntent("analysis")
        }
        uploadInputRef.current?.click()
    }, [activeIntent, prepareIntent])

    useEffect(() => {
        setIsClient(true)
    }, [])

    useEffect(() => {
        if (!isActive) {
            return
        }

        const handleGlobalPaste = (e: ClipboardEvent) => {
            if (
                !isComposerPasteTarget(
                    document.activeElement,
                    promptInputRef.current?.getElement() ?? null
                )
            ) {
                return
            }
            handlePaste(e)
        }

        document.addEventListener("paste", handleGlobalPaste)
        return () => document.removeEventListener("paste", handleGlobalPaste)
    }, [handlePaste, isActive])

    if (!isClient) return null

    return (
        <>
            {voiceInputEnabled && (voiceState.isRecording || voiceState.isTranscribing) && (
                <div className="@container w-full px-1">
                    <VoiceRecorder
                        state={voiceState}
                        onStop={stopRecording}
                        className={cn(
                            "pointer-events-auto mx-auto w-full",
                            getChatWidthClass(chatWidthState.chatWidth)
                        )}
                    />
                </div>
            )}

            <div
                ref={composerViewportRef}
                onBlurCapture={(event) => {
                    const nextTarget =
                        event.relatedTarget instanceof Element ? event.relatedTarget : null

                    if (
                        (nextTarget && event.currentTarget.contains(nextTarget)) ||
                        nextTarget?.closest(
                            '[data-radix-popper-content-wrapper], [data-slot="drawer-content"], [data-slot="dialog-content"]'
                        )
                    ) {
                        return
                    }

                    setIsInputFocused(false)
                }}
                className={cn(
                    "@container w-full px-1",
                    (voiceState.isRecording || voiceState.isTranscribing) && "hidden"
                )}
            >
                <PromptInput
                    ref={promptInputRef}
                    onSubmit={handleSubmit}
                    disableKeyboardSubmit={isTouchDevice}
                    invertSendNewlineBehavior={invertSendNewlineBehavior}
                    maxHeight={240}
                    className={cn(
                        "pointer-events-auto mx-auto w-full transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                        isCompactTouchComposer && "p-2",
                        isNewChatComposer && "rounded-[var(--radius-lg)]",
                        getChatWidthClass(chatWidthState.chatWidth)
                    )}
                >
                    {(extendedFiles.length > 0 || localUploadingFiles.length > 0) && (
                        <div className="flex flex-wrap gap-2 pb-3">
                            {extendedFiles.map(renderFilePreview)}
                            {localUploadingFiles.map(renderLocalUploadingFile)}
                        </div>
                    )}

                    <input
                        type="file"
                        multiple
                        onChange={handleFileChange}
                        className="hidden"
                        ref={uploadInputRef}
                        accept={getFileAcceptAttribute(modelSupportsVision)}
                    />

                    <motion.div
                        layout
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className={cn("flex w-full items-start", isCompactTouchComposer && "gap-1")}
                    >
                        <AnimatePresence initial={false}>
                            {isCompactTouchComposer && !isImageModel && (
                                <motion.div
                                    key="compact-attach"
                                    initial={{ opacity: 0, scale: 0.9, width: 0 }}
                                    animate={{ opacity: 1, scale: 1, width: 44 }}
                                    exit={{ opacity: 0, scale: 0.94, width: 0 }}
                                    transition={{
                                        duration: 0.18,
                                        ease: [0.16, 1, 0.3, 1]
                                    }}
                                    className="shrink-0 overflow-hidden"
                                >
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Attach files"
                                        onClick={() => uploadInputRef.current?.click()}
                                        disabled={uploading}
                                        className="size-11 bg-secondary/70 text-foreground backdrop-blur-lg hover:bg-secondary/80"
                                        style={{ borderRadius: "var(--radius-md)" }}
                                    >
                                        {uploading ? (
                                            <Loader2 className="size-4 animate-spin" />
                                        ) : (
                                            <Paperclip className="size-4 -rotate-45" />
                                        )}
                                    </Button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <motion.div
                            layout
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            className="min-w-0 flex-1"
                        >
                            <PromptInputTextarea
                                placeholder={
                                    isImageModel
                                        ? "Describe the image you want to generate..."
                                        : "Ask me anything..."
                                }
                                onChange={(event) => setInputValue(event.currentTarget.value)}
                                onFocus={() => setIsInputFocused(true)}
                                className={cn(
                                    isCompactTouchComposer &&
                                        "!h-11 !min-h-11 overflow-hidden whitespace-nowrap"
                                )}
                            />
                        </motion.div>

                        <AnimatePresence initial={false} mode="popLayout">
                            {isCompactTouchComposer && (
                                <motion.div
                                    key="compact-submit"
                                    layout
                                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                    className="shrink-0"
                                >
                                    <motion.div
                                        layoutId="composer-primary-action"
                                        transition={{
                                            layout: {
                                                duration: 0.3,
                                                ease: [0.16, 1, 0.3, 1]
                                            }
                                        }}
                                    >
                                        <Button
                                            variant="default"
                                            size="icon"
                                            aria-label={
                                                isImageGenerationPending && !isLoading
                                                    ? "Wait for image generation to finish"
                                                    : voiceInputEnabled &&
                                                        isInputEmpty &&
                                                        !isLoading
                                                      ? "Voice input"
                                                      : isLoading
                                                        ? "Stop generation"
                                                        : "Send message"
                                            }
                                            className="size-11"
                                            style={{ borderRadius: "var(--radius-md)" }}
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
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    <AnimatePresence initial={false}>
                        {!isCompactTouchComposer && (
                            <motion.div
                                key="expanded-toolbar"
                                initial={{ height: 0, opacity: 0, y: 6 }}
                                animate={{ height: "auto", opacity: 1, y: 0 }}
                                exit={{ height: 0, opacity: 0, y: 4 }}
                                transition={{
                                    duration: 0.26,
                                    ease: [0.16, 1, 0.3, 1]
                                }}
                                className="overflow-hidden"
                            >
                                <PromptInputActions className="flex items-center gap-2 pt-2">
                                    <motion.div
                                        layout
                                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                        className="flex min-w-0 flex-1 items-center @3xl:gap-2 gap-1.5 overflow-hidden @3xl:overflow-visible"
                                    >
                                        {selectedModel && (
                                            <motion.div
                                                layout
                                                transition={{
                                                    duration: 0.2,
                                                    ease: [0.16, 1, 0.3, 1]
                                                }}
                                                className="shrink-0"
                                            >
                                                <ModelSelector
                                                    selectedModel={selectedModel}
                                                    onModelChange={setSelectedModel}
                                                    open={activeComposerOverlay === "model"}
                                                    onOpenChange={(open) =>
                                                        handleComposerOverlayOpenChange(
                                                            "model",
                                                            open
                                                        )
                                                    }
                                                    shortcutTarget="composer"
                                                    telemetrySurface="composer"
                                                    tooltip="Select model"
                                                    suppressTooltip={activeComposerOverlay !== null}
                                                    requiresNativePdf={
                                                        requiresNativePdfForModelSelection
                                                    }
                                                    byokContextHint={resolveByokContextHint(
                                                        predictedByokContextRouting
                                                    )}
                                                />
                                            </motion.div>
                                        )}
                                        <PersonaSelector
                                            threadId={threadId}
                                            open={activeComposerOverlay === "persona"}
                                            onOpenChange={(open) =>
                                                handleComposerOverlayOpenChange("persona", open)
                                            }
                                        />

                                        <ComposerDesktopActions
                                            state={composerToolbar}
                                            threadId={threadId}
                                            uploading={uploading}
                                            onAttachClick={() => uploadInputRef.current?.click()}
                                            activeOverlay={activeComposerOverlay}
                                            onOverlayOpenChange={handleComposerOverlayOpenChange}
                                        />
                                    </motion.div>

                                    <ComposerMobileMenu
                                        state={composerToolbar}
                                        onAttachClick={() => uploadInputRef.current?.click()}
                                        open={activeComposerOverlay === "mobile-menu"}
                                        onOpenChange={(open) =>
                                            handleComposerOverlayOpenChange("mobile-menu", open)
                                        }
                                    />

                                    {activePersistentSandbox && (
                                        <PromptInputAction tooltip="Kill persistent sandbox">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 shrink-0 gap-1.5 text-destructive hover:text-destructive"
                                                style={{ borderRadius: "var(--radius-md)" }}
                                                disabled={
                                                    isKillingPersistentSandbox ||
                                                    activePersistentSandbox.status === "stopping"
                                                }
                                                onClick={() => void handleKillPersistentSandbox()}
                                                type="button"
                                            >
                                                {isKillingPersistentSandbox ||
                                                activePersistentSandbox.status === "stopping" ? (
                                                    <Loader2
                                                        className="size-4 animate-spin"
                                                        aria-hidden="true"
                                                    />
                                                ) : (
                                                    <OctagonX
                                                        className="size-4"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                <span className="@4xl:inline hidden">
                                                    Kill sandbox
                                                </span>
                                            </Button>
                                        </PromptInputAction>
                                    )}

                                    <PromptInputAction
                                        tooltip={
                                            isImageGenerationPending && !isLoading
                                                ? "Wait for image generation to finish"
                                                : voiceInputEnabled && isInputEmpty && !isLoading
                                                  ? "Voice input"
                                                  : isLoading
                                                    ? "Stop generation"
                                                    : "Send message"
                                        }
                                    >
                                        <motion.div
                                            layoutId="composer-primary-action"
                                            transition={{
                                                layout: {
                                                    duration: 0.3,
                                                    ease: [0.16, 1, 0.3, 1]
                                                }
                                            }}
                                            className="shrink-0"
                                        >
                                            <Button
                                                variant="default"
                                                size="icon"
                                                className="size-8"
                                                style={{ borderRadius: "var(--radius-md)" }}
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
                                        </motion.div>
                                    </PromptInputAction>
                                </PromptInputActions>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </PromptInput>

                {showIntentShortcuts &&
                    isNewChatComposer &&
                    !isImageModel &&
                    (activeIntent !== null || isInputEmpty) && (
                        <div
                            className={cn(
                                "mx-auto w-full",
                                getChatWidthClass(chatWidthState.chatWidth)
                            )}
                        >
                            <IntentGuide
                                stage={intentGuideStage}
                                availability={{
                                    image: modelSupportsVision && modelSupportsFunctionCalling,
                                    web:
                                        modelSupportsFunctionCalling &&
                                        composerToolbar.webSearchAvailable,
                                    analysis: modelSupportsFunctionCalling && codeExecutionAvailable
                                }}
                                attachments={uploadedFiles}
                                recentImages={recentGeneratedImages.results.slice(0, 6)}
                                attachingImageKey={attachingImageKey}
                                webTrends={webTrends}
                                webTrendsLoading={webTrendsLoading}
                                onSelectIntent={prepareIntent}
                                onClearIntent={clearIntent}
                                onChoosePrompt={chooseIntentPrompt}
                                onAppendPrompt={appendIntentPrompt}
                                onUpload={handleIntentUpload}
                                onChooseRecentImage={attachRecentGeneratedImage}
                            />
                        </div>
                    )}
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
import { useCurrentUserSettings } from "@/hooks/use-current-user-settings"
