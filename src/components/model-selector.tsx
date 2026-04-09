import {
    BlackForestLabsIcon,
    ClaudeIcon,
    FalAIIcon,
    GeminiIcon,
    GroqIcon,
    MetaIcon,
    OpenAIIcon,
    OpenRouterIcon,
    StabilityIcon,
    XAIIcon
} from "@/components/brand-icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Input } from "@/components/ui/input"
import {
    ResponsivePopover,
    ResponsivePopoverContent,
    ResponsivePopoverTrigger
} from "@/components/ui/responsive-popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import type { SharedModel } from "@/convex/lib/models"
import { useSession } from "@/hooks/auth-hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import { useDiskCachedQuery } from "@/lib/convex-cached-query"
import { DefaultSettings } from "@/lib/default-user-settings"
import { OPEN_MODEL_PICKER_SHORTCUT_EVENT } from "@/lib/keyboard-shortcuts"
import type { ModelBenchmarkPayload } from "@/lib/model-benchmarks"
import { useModelStore } from "@/lib/model-store"
import {
    type DisplayModel,
    getAbilityIcon,
    getAbilityLabel,
    getModelDescription,
    getModelShortDescription,
    getPrototypeCreditTierForModel,
    getProviderDisplayName,
    isImageGenerationCapableModel,
    useAvailableModels
} from "@/lib/models-providers-shared"
import { useSharedModels } from "@/lib/shared-models"
import { cn } from "@/lib/utils"
import { useConvexAuth } from "@convex-dev/react-query"
import {
    Calculator,
    Check,
    ChevronDown,
    CircleHelp,
    ExternalLink,
    Globe,
    GraduationCap,
    Image,
    KeyRound,
    Search,
    Terminal,
    Trophy,
    X
} from "lucide-react"
import * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

export const getProviderIcon = (model: DisplayModel, isCustom: boolean) => {
    if (isCustom) {
        return <Badge className="text-xs">Custom</Badge>
    }

    const sharedModel = model as SharedModel
    if (sharedModel.customIcon || sharedModel.adapters) {
        const firstAdapter = sharedModel.adapters?.[0]
        const icon = sharedModel.customIcon ?? firstAdapter?.split(":")[0]

        switch (icon) {
            case "i3-openai":
            case "openai":
                return <OpenAIIcon className="size-4" />
            case "i3-anthropic":
            case "anthropic":
                return <ClaudeIcon className="size-4" />
            case "i3-google":
            case "google":
                return <GeminiIcon className="size-4" />
            case "i3-xai":
            case "xai":
                return <XAIIcon className="size-4" />
            case "i3-groq":
            case "groq":
                return <GroqIcon className="size-4" />
            case "i3-fal":
            case "fal":
                return <FalAIIcon className="size-4" />
            case "openrouter":
                return <OpenRouterIcon className="size-4" />
            case "bflabs":
                return <BlackForestLabsIcon className="size-4" />
            case "stability-ai":
                return <StabilityIcon className="size-4" />
            case "meta":
                return <MetaIcon className="size-4" />
            default:
                return <Badge className="text-xs">Built-in</Badge>
        }
    }

    return <Badge className="text-xs">Built-in</Badge>
}

type ProviderSection = {
    id: string
    label: string
    compactLabel: string
    models: DisplayModel[]
    icon: React.ReactNode
}

const PROVIDER_ORDER = ["openai", "anthropic", "google", "xai", "groq", "fal", "openrouter"]
const getModelReleaseOrder = (model: DisplayModel) =>
    "isCustom" in model && model.isCustom ? 0 : ((model as SharedModel).releaseOrder ?? 0)

const normalizeProviderId = (providerId: string) =>
    providerId.startsWith("i3-") ? providerId.slice(3) : providerId

const getModelProviderId = (model: DisplayModel) => {
    if ("isCustom" in model && model.isCustom) {
        return normalizeProviderId(model.providerId)
    }

    const sharedModel = model as SharedModel
    const adapters = sharedModel.adapters ?? []
    const preferredAdapter =
        adapters.find((adapter) => !adapter.startsWith("openrouter:")) ?? adapters[0]

    return normalizeProviderId(preferredAdapter?.split(":")[0] ?? "unknown")
}

const getActiveRuntimeProvider = (
    model: DisplayModel,
    currentProviders: ReturnType<typeof useAvailableModels>["currentProviders"],
    sharedModels: SharedModel[]
): { isByok: boolean; label: string } | null => {
    if ("isCustom" in model && model.isCustom) {
        const providerId = model.providerId

        if (currentProviders.core[providerId]?.enabled) {
            return {
                isByok: true,
                label: getProviderDisplayName(providerId, currentProviders)
            }
        }

        if (currentProviders.custom[providerId]?.enabled) {
            return {
                isByok: true,
                label: currentProviders.custom[providerId].name
            }
        }

        return null
    }

    const sharedModel =
        sharedModels.find((shared) => shared.id === model.id) ?? (model as SharedModel)

    for (const adapter of sharedModel.adapters) {
        const providerId = adapter.split(":")[0]
        if (providerId === "openrouter" && currentProviders.core.openrouter?.enabled) {
            return {
                isByok: true,
                label: getProviderDisplayName(providerId, currentProviders)
            }
        }
    }

    for (const adapter of sharedModel.adapters) {
        const providerId = adapter.split(":")[0]
        if (providerId.startsWith("i3-")) {
            return { isByok: false, label: "Built-in" }
        }
    }

    for (const adapter of sharedModel.adapters) {
        const providerId = adapter.split(":")[0]
        if (providerId === "openrouter" || providerId.startsWith("i3-")) {
            continue
        }

        if (currentProviders.core[providerId as keyof typeof currentProviders.core]?.enabled) {
            return {
                isByok: true,
                label: getProviderDisplayName(providerId, currentProviders)
            }
        }
    }

    return null
}

const getProviderSectionLabel = (
    providerId: string,
    currentProviders: ReturnType<typeof useAvailableModels>["currentProviders"]
) => {
    switch (providerId) {
        case "google":
            return "Gemini"
        case "xai":
            return "Grok"
        default:
            return getProviderDisplayName(providerId, currentProviders)
    }
}

const getProviderSectionIcon = (providerId: string) => {
    switch (providerId) {
        case "openai":
            return <OpenAIIcon className="size-4" />
        case "anthropic":
            return <ClaudeIcon className="size-4" />
        case "google":
            return <GeminiIcon className="size-4" />
        case "xai":
            return <XAIIcon className="size-4" />
        case "groq":
            return <GroqIcon className="size-4" />
        case "fal":
            return <FalAIIcon className="size-4" />
        case "openrouter":
            return <OpenRouterIcon className="size-4" />
        default:
            return <Badge className="h-5 px-1 text-[10px]">Custom</Badge>
    }
}

const getAbilityTooltip = (ability: string) => {
    switch (ability) {
        case "reasoning":
            return "Reasoning"
        case "vision":
            return "Vision"
        case "web_search":
            return "Web Search"
        case "image_generation":
            return "Image Generation"
        default:
            return getAbilityLabel(ability as Parameters<typeof getAbilityLabel>[0])
    }
}

const renderAbilityIcon = (ability: string, className: string) => {
    if (ability === "image_generation") {
        return <Image className={className} />
    }

    if (ability === "web_search") {
        return <Globe className={className} />
    }

    const AbilityIcon = getAbilityIcon(ability as Parameters<typeof getAbilityIcon>[0])
    return <AbilityIcon className={className} />
}

const CapabilityPill = ({
    ability,
    emphasized = false
}: {
    ability: string
    emphasized?: boolean
}) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <div
                className={cn(
                    "flex size-7 items-center justify-center rounded-md border text-muted-foreground",
                    emphasized && "border-transparent bg-accent text-accent-foreground"
                )}
            >
                {renderAbilityIcon(ability, "size-4")}
            </div>
        </TooltipTrigger>
        <TooltipContent>{getAbilityTooltip(ability)}</TooltipContent>
    </Tooltip>
)

type BenchmarkState =
    | {
          status: "loading"
      }
    | {
          status: "ready"
          payload: ModelBenchmarkPayload
      }

const unavailableBenchmarkPayload = (): ModelBenchmarkPayload => ({
    available: false,
    sourceLabel: "Artificial Analysis",
    sourceUrl: "https://artificialanalysis.ai/",
    fetchedAt: new Date().toISOString(),
    cards: []
})

const benchmarkStateCache = new Map<string, BenchmarkState>()
const benchmarkRequestCache = new Map<string, Promise<BenchmarkState>>()
const BENCHMARK_UI_VERSION = "3"
const getBenchmarkCacheKey = (modelId: string) => `${BENCHMARK_UI_VERSION}:${modelId}`
const shouldPersistBenchmarkState = (state: BenchmarkState) =>
    state.status === "ready" ? !state.payload.retryable : true

const loadBenchmarkState = async (modelId: string): Promise<BenchmarkState> => {
    const response = await fetch(
        `/api/model-benchmarks?modelId=${encodeURIComponent(modelId)}&v=${BENCHMARK_UI_VERSION}`,
        {
            cache: "no-store"
        }
    )

    if (!response.ok) {
        return {
            status: "ready",
            payload: unavailableBenchmarkPayload()
        }
    }

    const payload = (await response.json()) as ModelBenchmarkPayload
    return {
        status: "ready",
        payload
    }
}

const ensureBenchmarkState = (modelId: string): Promise<BenchmarkState> => {
    const cacheKey = getBenchmarkCacheKey(modelId)
    const cachedState = benchmarkStateCache.get(cacheKey)
    if (cachedState?.status === "ready") {
        return Promise.resolve(cachedState)
    }

    const inflightRequest = benchmarkRequestCache.get(cacheKey)
    if (inflightRequest) {
        return inflightRequest
    }

    const loadingState: BenchmarkState = {
        status: "loading"
    }
    benchmarkStateCache.set(cacheKey, loadingState)

    const request = loadBenchmarkState(modelId)
        .catch(
            () =>
                ({
                    status: "ready",
                    payload: {
                        ...unavailableBenchmarkPayload(),
                        retryable: true,
                        errorCode: "fetch_failed"
                    }
                }) satisfies BenchmarkState
        )
        .then((state) => {
            if (shouldPersistBenchmarkState(state)) {
                benchmarkStateCache.set(cacheKey, state)
            } else {
                benchmarkStateCache.delete(cacheKey)
            }
            benchmarkRequestCache.delete(cacheKey)
            return state
        })

    benchmarkRequestCache.set(cacheKey, request)
    return request
}

const getModelAbilities = (model: DisplayModel) =>
    isImageGenerationCapableModel(model)
        ? ["image_generation", ...model.abilities]
        : model.abilities.filter((ability) => ability !== "effort_control")

const FeatureBadge = ({ ability }: { ability: string }) => (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/50 px-3 py-1.5 text-sm">
        {renderAbilityIcon(ability, "size-4")}
        <span>{getAbilityTooltip(ability)}</span>
    </div>
)

const BenchmarkProgress = ({ value, label }: { value: number; label: string }) => {
    const normalizedValue = Math.max(0, Math.min(value, 100))
    const radius = 26
    const circumference = 2 * Math.PI * radius
    const strokeOffset = circumference * (1 - normalizedValue / 100)

    return (
        <div className="relative size-18 shrink-0">
            <svg className="-rotate-90 size-full" viewBox="0 0 64 64" aria-hidden="true">
                <circle
                    cx="32"
                    cy="32"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.12"
                    strokeWidth="5"
                />
                <circle
                    cx="32"
                    cy="32"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="5"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeOffset}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-semibold text-sm">
                {label}
            </div>
        </div>
    )
}

const BenchmarkCard = ({ card }: { card: ModelBenchmarkPayload["cards"][number] }) => {
    const icon =
        card.key === "intelligence" ? (
            <GraduationCap className="size-5" />
        ) : card.key === "coding" ? (
            <Terminal className="size-5" />
        ) : card.key === "math" ? (
            <Calculator className="size-5" />
        ) : null
    const showRing = card.value >= 0 && card.value <= 100 && icon !== null

    return (
        <div className="rounded-[var(--radius-xl)] border bg-background/40 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-3">
                        {icon ? (
                            <div className="flex size-9 items-center justify-center rounded-[var(--radius-lg)] border border-border/70 bg-secondary/40 text-muted-foreground">
                                {icon}
                            </div>
                        ) : null}
                        <div className="min-w-0">
                            <p className="font-medium text-sm">{card.title}</p>
                            {card.subtitle ? (
                                <p className="mt-1 text-muted-foreground text-xs">
                                    {card.subtitle}
                                </p>
                            ) : null}
                        </div>
                    </div>
                </div>
                {showRing ? (
                    <div className="self-center sm:self-start">
                        <BenchmarkProgress value={card.value} label={card.displayValue} />
                    </div>
                ) : (
                    <div className="shrink-0 self-start rounded-full border border-border/70 bg-secondary/40 px-3 py-2 font-semibold text-sm">
                        {card.displayValue}
                    </div>
                )}
            </div>
            {(card.breakdownLabel || card.breakdownValue) && (
                <div className="mt-4 flex items-center justify-between gap-3 border-border/70 border-t pt-4 text-sm">
                    <span className="min-w-0 text-muted-foreground">
                        {card.breakdownLabel ?? "Benchmark"}
                    </span>
                    <span className="shrink-0 font-medium">{card.breakdownValue}</span>
                </div>
            )}
        </div>
    )
}

const BenchmarkSection = ({
    benchmarkState
}: {
    benchmarkState?: BenchmarkState
}) => {
    if (!benchmarkState || benchmarkState.status === "loading") {
        return (
            <div className="space-y-3">
                <Skeleton className="h-28 rounded-[var(--radius-xl)]" />
                <Skeleton className="h-28 rounded-[var(--radius-xl)]" />
            </div>
        )
    }

    if (!benchmarkState.payload.available || benchmarkState.payload.cards.length === 0) {
        return (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-[var(--radius-xl)] border bg-background/30 px-6 py-8 text-center">
                <Trophy className="mb-4 size-8 text-muted-foreground" />
                <p className="font-medium text-base">Benchmarks unavailable for this model</p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-muted-foreground text-sm">
                    via {benchmarkState.payload.sourceLabel}
                </p>
                <a
                    href={benchmarkState.payload.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
                >
                    Source
                    <ExternalLink className="size-3" />
                </a>
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                {benchmarkState.payload.cards.map((card) => (
                    <BenchmarkCard key={card.key} card={card} />
                ))}
            </div>
        </div>
    )
}

const ModelDetailPanel = ({
    model,
    currentProviders,
    benchmarkState,
    onRequestClose
}: {
    model: DisplayModel
    currentProviders: ReturnType<typeof useAvailableModels>["currentProviders"]
    benchmarkState?: BenchmarkState
    onRequestClose?: () => void
}) => {
    const isCustom = "isCustom" in model && model.isCustom
    const modelAbilities = getModelAbilities(model)
    const sharedModel = !isCustom ? (model as SharedModel) : null
    const providerLabel = getProviderSectionLabel(getModelProviderId(model), currentProviders)
    const developerLabel =
        sharedModel?.developer?.trim() ||
        (isCustom ? getProviderDisplayName(model.providerId, currentProviders) : providerLabel)
    const closePanel = (
        event: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>
    ) => {
        event.preventDefault()
        event.stopPropagation()
        onRequestClose?.()
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-background/30 p-4 md:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border bg-secondary/60">
                        {getProviderIcon(model, isCustom)}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="truncate font-semibold text-lg">{model.name}</h3>
                        </div>
                        <p className="mt-1 text-muted-foreground text-sm">
                            {getModelShortDescription(model)}
                        </p>
                    </div>
                </div>
                {onRequestClose && (
                    <button
                        type="button"
                        aria-label={`Close details for ${model.name}`}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-secondary/50 text-muted-foreground transition-colors hover:text-foreground"
                        onPointerDown={closePanel}
                        onClick={closePanel}
                    >
                        <X className="size-4" />
                    </button>
                )}
            </div>

            <ScrollArea className="min-h-0 flex-1 pr-1">
                <div className="space-y-6 pb-2">
                    <section>
                        <h4 className="font-semibold text-base">Description</h4>
                        <p className="mt-2 text-muted-foreground text-sm leading-7">
                            {getModelDescription(model)}
                        </p>
                    </section>

                    {modelAbilities.length > 0 && (
                        <section>
                            <h4 className="font-semibold text-base">Features</h4>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {modelAbilities.map((ability) => (
                                    <FeatureBadge
                                        key={`${model.id}-feature-${ability}`}
                                        ability={ability}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <h4 className="font-semibold text-base">Provider</h4>
                            <p className="mt-2 text-muted-foreground text-sm">{providerLabel}</p>
                        </div>
                        <div>
                            <h4 className="font-semibold text-base">Developer</h4>
                            <p className="mt-2 text-muted-foreground text-sm">{developerLabel}</p>
                        </div>
                        {sharedModel?.knowledgeCutoff && (
                            <div>
                                <h4 className="font-semibold text-base">Knowledge Cutoff</h4>
                                <p className="mt-2 text-muted-foreground text-sm">
                                    {sharedModel.knowledgeCutoff}
                                </p>
                            </div>
                        )}
                        {sharedModel?.addedOn && (
                            <div>
                                <h4 className="font-semibold text-base">Added On</h4>
                                <p className="mt-2 text-muted-foreground text-sm">
                                    {sharedModel.addedOn}
                                </p>
                            </div>
                        )}
                    </section>

                    <section>
                        <h4 className="font-semibold text-base">Benchmark Performance</h4>
                        <div className="mt-3">
                            <BenchmarkSection benchmarkState={benchmarkState} />
                        </div>
                    </section>
                </div>
            </ScrollArea>
        </div>
    )
}

const ModelInfoFlyout = ({
    model,
    currentProviders
}: {
    model: DisplayModel
    currentProviders: ReturnType<typeof useAvailableModels>["currentProviders"]
}) => {
    const isMobile = useIsMobile()
    const [open, setOpen] = React.useState(false)
    const [benchmarkState, setBenchmarkState] = React.useState<BenchmarkState | undefined>(() =>
        benchmarkStateCache.get(getBenchmarkCacheKey(model.id))
    )
    const isMountedRef = React.useRef(true)

    React.useEffect(() => {
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
        }
    }, [])

    const primeBenchmarks = React.useCallback(() => {
        if ("isCustom" in model && model.isCustom) {
            return
        }

        const cachedState = benchmarkStateCache.get(getBenchmarkCacheKey(model.id))
        if (cachedState) {
            setBenchmarkState(cachedState)
            if (cachedState.status === "ready") {
                return
            }
        } else {
            setBenchmarkState({
                status: "loading"
            })
        }

        void ensureBenchmarkState(model.id).then((state) => {
            if (isMountedRef.current) {
                setBenchmarkState(state)
            }
        })
    }, [model])

    React.useEffect(() => {
        if (!open) {
            return
        }

        primeBenchmarks()
    }, [open, primeBenchmarks])

    const trigger = (
        <button
            type="button"
            aria-label={`Show details for ${model.name}`}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-secondary/50 text-muted-foreground transition-colors hover:text-foreground"
            onPointerDown={(event) => {
                event.stopPropagation()
            }}
            onMouseEnter={() => {
                if (!isMobile) {
                    primeBenchmarks()
                }
            }}
            onFocus={() => {
                primeBenchmarks()
            }}
            onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                primeBenchmarks()
                if (isMobile) {
                    setOpen(true)
                }
            }}
        >
            <CircleHelp className="size-4" />
        </button>
    )

    if (isMobile) {
        return (
            <ResponsivePopover open={open} onOpenChange={setOpen}>
                <ResponsivePopoverTrigger asChild>{trigger}</ResponsivePopoverTrigger>
                <ResponsivePopoverContent
                    className="w-full max-w-full overflow-hidden p-0"
                    showCloseButton={false}
                >
                    <div className="flex h-[min(75vh,42rem)] min-h-0 flex-col overflow-hidden">
                        <ModelDetailPanel
                            model={model}
                            currentProviders={currentProviders}
                            benchmarkState={benchmarkState}
                            onRequestClose={() => setOpen(false)}
                        />
                    </div>
                </ResponsivePopoverContent>
            </ResponsivePopover>
        )
    }

    return (
        <HoverCard openDelay={120} closeDelay={120} onOpenChange={setOpen}>
            <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
            <HoverCardContent
                align="end"
                side="right"
                sideOffset={12}
                className="w-[min(96vw,34rem)] overflow-hidden p-0 sm:w-[min(92vw,36rem)] lg:w-[min(46vw,40rem)]"
            >
                <div className="flex h-[min(70vh,40rem)] min-h-0 flex-col overflow-hidden">
                    <ModelDetailPanel
                        model={model}
                        currentProviders={currentProviders}
                        benchmarkState={benchmarkState}
                    />
                </div>
            </HoverCardContent>
        </HoverCard>
    )
}

const ModelCard = React.memo(function ModelCard({
    model,
    selectedModel,
    onModelChange,
    onClose,
    currentProviders,
    disabled,
    badgeLabel
}: {
    model: DisplayModel
    selectedModel: string
    onModelChange: (modelId: string) => void
    onClose: () => void
    currentProviders: ReturnType<typeof useAvailableModels>["currentProviders"]
    disabled?: boolean
    badgeLabel?: string
}) {
    const isSelected = model.id === selectedModel
    const isCustom = "isCustom" in model && model.isCustom
    const modelAbilities = getModelAbilities(model)

    return (
        <div
            className={cn(
                "relative w-full rounded-xl border bg-background/60 p-3 text-left transition-colors",
                "hover:border-accent hover:bg-accent/10",
                isSelected && "border-primary/50 bg-primary/5 shadow-sm ring-1 ring-primary/20",
                disabled &&
                    "cursor-not-allowed border-border/60 bg-muted/30 text-muted-foreground hover:border-border/60 hover:bg-muted/30"
            )}
        >
            <button
                type="button"
                disabled={disabled}
                onClick={() => {
                    if (disabled) return
                    onModelChange(model.id)
                    onClose()
                }}
                className="block w-full text-left focus-visible:outline-none"
            >
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex shrink-0 items-center justify-center rounded-md border bg-secondary/60 p-2">
                        {getProviderIcon(model, isCustom)}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 pr-10 sm:pr-0">
                                <div className="flex items-center gap-2">
                                    <span className="truncate font-medium text-sm sm:text-base">
                                        {model.name}
                                    </span>
                                    {badgeLabel && (
                                        <Badge
                                            variant="secondary"
                                            className="border border-border/70 text-[10px] uppercase tracking-wide"
                                        >
                                            {badgeLabel}
                                        </Badge>
                                    )}
                                    {isSelected && (
                                        <Check className="size-4 shrink-0 text-primary" />
                                    )}
                                </div>
                                <p className="mt-1 line-clamp-2 text-muted-foreground text-xs sm:text-sm">
                                    {getModelShortDescription(model)}
                                </p>
                            </div>
                            <div className="hidden shrink-0 flex-col items-end gap-2 pr-10 sm:flex">
                                {modelAbilities.length > 0 && (
                                    <div className="flex flex-wrap justify-end gap-1">
                                        {modelAbilities.slice(0, 4).map((ability) => (
                                            <CapabilityPill
                                                key={`${model.id}-${ability}`}
                                                ability={ability}
                                                emphasized={isSelected}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="mt-2 flex items-center gap-3 pr-10 sm:hidden">
                            {modelAbilities.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                    {modelAbilities.slice(0, 4).map((ability) => (
                                        <CapabilityPill
                                            key={`${model.id}-mobile-${ability}`}
                                            ability={ability}
                                            emphasized={isSelected}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div />
                            )}
                        </div>
                    </div>
                </div>
            </button>
            <div className="absolute top-3 right-3 hidden sm:block">
                <ModelInfoFlyout model={model} currentProviders={currentProviders} />
            </div>
            <div className="absolute right-3 bottom-3 sm:hidden">
                <ModelInfoFlyout model={model} currentProviders={currentProviders} />
            </div>
        </div>
    )
})

export function ModelSelector({
    selectedModel,
    onModelChange,
    className,
    side = "bottom",
    align = "start",
    shortcutTarget = "none",
    tone = "default"
}: {
    selectedModel: string
    onModelChange: (modelId: string) => void
    className?: string
    side?: "top" | "right" | "bottom" | "left"
    align?: "start" | "center" | "end"
    shortcutTarget?: "composer" | "none"
    tone?: "default" | "on-primary"
}) {
    const auth = useConvexAuth()
    const session = useSession()
    const userSettings = useDiskCachedQuery(
        api.settings.getUserSettings,
        {
            key: "user-settings",
            default: DefaultSettings(session.user?.id ?? "CACHE"),
            forceCache: true
        },
        session.user?.id && !auth.isLoading ? {} : "skip"
    )

    const [open, setOpen] = React.useState(false)
    const [searchValue, setSearchValue] = React.useState("")
    const triggerRef = React.useRef<HTMLSpanElement>(null)
    const [desktopAlignOffset, setDesktopAlignOffset] = React.useState(0)
    const [desktopPopoverWidth, setDesktopPopoverWidth] = React.useState<number | null>(null)
    const isMobile = useIsMobile()
    const reasoningEffort = useModelStore((state) => state.reasoningEffort)
    const [creditPlan, setCreditPlan] = React.useState<"free" | "pro" | null>(null)

    const { availableModels, currentProviders } = useAvailableModels(
        "error" in userSettings ? DefaultSettings(session.user?.id ?? "") : userSettings
    )
    const { models: sharedModels } = useSharedModels()

    React.useEffect(() => {
        if (!session.user?.id || auth.isLoading) {
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

                const data = (await response.json()) as { plan?: "free" | "pro" }
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
    }, [auth.isLoading, session.user?.id])

    const providerSections = React.useMemo<ProviderSection[]>(() => {
        const textModels = availableModels.filter(
            (model) => !isImageGenerationCapableModel(model) && model.mode !== "speech-to-text"
        )
        const grouped = textModels.reduce<Record<string, DisplayModel[]>>((acc, model) => {
            const providerId = getModelProviderId(model)
            if (!acc[providerId]) {
                acc[providerId] = []
            }
            acc[providerId].push(model)
            return acc
        }, {})

        return Object.entries(grouped)
            .sort(([leftId], [rightId]) => {
                const leftOrder = PROVIDER_ORDER.indexOf(leftId)
                const rightOrder = PROVIDER_ORDER.indexOf(rightId)
                const resolvedLeftOrder = leftOrder === -1 ? Number.MAX_SAFE_INTEGER : leftOrder
                const resolvedRightOrder = rightOrder === -1 ? Number.MAX_SAFE_INTEGER : rightOrder
                if (resolvedLeftOrder !== resolvedRightOrder) {
                    return resolvedLeftOrder - resolvedRightOrder
                }
                return leftId.localeCompare(rightId)
            })
            .map(([providerId, models]) => {
                const label = getProviderSectionLabel(providerId, currentProviders)
                return {
                    id: providerId,
                    label,
                    compactLabel: providerId === "google" ? "Gemini" : label,
                    models: [...models].sort((left, right) => {
                        const releaseDelta =
                            getModelReleaseOrder(right) - getModelReleaseOrder(left)
                        if (releaseDelta !== 0) {
                            return releaseDelta
                        }
                        return left.name.localeCompare(right.name)
                    }),
                    icon: getProviderSectionIcon(providerId)
                }
            })
    }, [availableModels, currentProviders])

    const selectedModelData = React.useMemo(
        () => availableModels.find((model) => model.id === selectedModel),
        [availableModels, selectedModel]
    )

    const isModelLocked = React.useCallback(
        (model: DisplayModel) =>
            creditPlan === "free" &&
            getPrototypeCreditTierForModel(model, reasoningEffort) === "pro",
        [creditPlan, reasoningEffort]
    )

    const fallbackModelId = React.useMemo(
        () => availableModels.find((model) => !isModelLocked(model))?.id,
        [availableModels, isModelLocked]
    )

    React.useEffect(() => {
        if (!selectedModelData || !fallbackModelId) return
        if (!isModelLocked(selectedModelData)) return
        if (fallbackModelId === selectedModel) return

        onModelChange(fallbackModelId)
    }, [fallbackModelId, isModelLocked, onModelChange, selectedModel, selectedModelData])

    const [activeProvider, setActiveProvider] = React.useState<string | null>(null)

    React.useEffect(() => {
        if (!open) {
            setSearchValue("")
        }
    }, [open])

    React.useEffect(() => {
        if (shortcutTarget !== "composer") {
            return
        }

        const handleOpenShortcut = () => {
            setOpen(true)
        }

        document.addEventListener(OPEN_MODEL_PICKER_SHORTCUT_EVENT, handleOpenShortcut)
        return () =>
            document.removeEventListener(OPEN_MODEL_PICKER_SHORTCUT_EVENT, handleOpenShortcut)
    }, [shortcutTarget])

    React.useLayoutEffect(() => {
        if (!open) return

        const updateOffset = () => {
            const trigger = triggerRef.current
            const composer = trigger?.closest(
                '[data-slot="prompt-input-root"]'
            ) as HTMLElement | null

            if (!trigger || !composer) {
                setDesktopAlignOffset(0)
                setDesktopPopoverWidth(null)
                return
            }

            const triggerRect = trigger.getBoundingClientRect()
            const composerRect = composer.getBoundingClientRect()
            setDesktopAlignOffset(Math.round(composerRect.left - triggerRect.left))
            setDesktopPopoverWidth(Math.round(composerRect.width))
        }

        updateOffset()

        const resizeObserver =
            typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateOffset) : null

        const trigger = triggerRef.current
        const composer = trigger?.closest('[data-slot="prompt-input-root"]') as HTMLElement | null

        if (resizeObserver) {
            if (trigger) resizeObserver.observe(trigger)
            if (composer) resizeObserver.observe(composer)
        }

        window.addEventListener("resize", updateOffset)
        window.addEventListener("scroll", updateOffset, true)

        return () => {
            resizeObserver?.disconnect()
            window.removeEventListener("resize", updateOffset)
            window.removeEventListener("scroll", updateOffset, true)
        }
    }, [open])

    const filteredSections = React.useMemo(() => {
        const query = searchValue.trim().toLowerCase()
        if (!query) return providerSections

        return providerSections
            .map((section) => ({
                ...section,
                models: section.models.filter((model) => {
                    const haystack = [
                        model.name,
                        model.id,
                        getModelShortDescription(model),
                        getModelDescription(model),
                        section.label
                    ]
                        .join(" ")
                        .toLowerCase()

                    return haystack.includes(query)
                })
            }))
            .filter((section) => section.models.length > 0)
    }, [providerSections, searchValue])

    const selectedProviderId = React.useMemo(
        () =>
            filteredSections.find((section) =>
                section.models.some((model) => model.id === selectedModel)
            )?.id,
        [filteredSections, selectedModel]
    )

    React.useEffect(() => {
        if (filteredSections.length === 0) {
            if (activeProvider !== null) {
                setActiveProvider(null)
            }
            return
        }

        if (activeProvider && filteredSections.some((section) => section.id === activeProvider)) {
            return
        }

        setActiveProvider(selectedProviderId ?? filteredSections[0].id)
    }, [activeProvider, filteredSections, selectedProviderId])

    const visibleSection =
        filteredSections.find((section) => section.id === activeProvider) ??
        filteredSections[0] ??
        null

    const selectedModelIcon = React.useMemo(() => {
        if (!selectedModelData) return null

        const isCustom = !sharedModels.some((model) => model.id === selectedModelData.id)
        return getProviderIcon(selectedModelData, isCustom)
    }, [selectedModelData, sharedModels])

    const activeRuntimeProvider = React.useMemo(
        () =>
            selectedModelData
                ? getActiveRuntimeProvider(selectedModelData, currentProviders, sharedModels)
                : null,
        [currentProviders, selectedModelData, sharedModels]
    )

    return (
        <ResponsivePopover open={open} onOpenChange={setOpen}>
            <ResponsivePopoverTrigger asChild>
                <span ref={triggerRef} className="inline-flex">
                    <Button
                        variant="ghost"
                        aria-expanded={open}
                        className={cn(
                            "h-8 bg-secondary/70 font-normal text-xs backdrop-blur-lg sm:text-sm md:rounded-md",
                            className,
                            "!px-1.5 min-[390px]:!px-2 gap-0.5 min-[390px]:gap-2"
                        )}
                    >
                        {selectedModelData && (
                            <div className="flex items-center gap-2">
                                <div className="block min-[390px]:hidden">{selectedModelIcon}</div>
                                <span className="hidden md:hidden min-[390px]:block">
                                    {(selectedModelData as SharedModel)?.shortName ||
                                        selectedModelData.name}
                                </span>
                                <span className="hidden md:block">{selectedModelData.name}</span>
                                {activeRuntimeProvider?.isByok && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span
                                                className={cn(
                                                    "inline-flex text-muted-foreground",
                                                    tone === "on-primary" &&
                                                        "text-primary-foreground"
                                                )}
                                            >
                                                <KeyRound className="size-3.5" />
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            Using your {activeRuntimeProvider.label} key
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                            </div>
                        )}
                        <ChevronDown className="ml-auto h-4 w-4" />
                    </Button>
                </span>
            </ResponsivePopoverTrigger>

            <ResponsivePopoverContent
                className="flex w-[min(92vw,680px)] flex-col overflow-hidden p-0 md:w-[680px]"
                align={align}
                side={side}
                alignOffset={desktopAlignOffset}
                style={{
                    ...(!isMobile && desktopPopoverWidth
                        ? {
                              width: `${desktopPopoverWidth}px`,
                              maxWidth: "92vw"
                          }
                        : {}),
                    maxHeight: "var(--radix-popover-content-available-height)"
                }}
            >
                <div className="shrink-0 rounded-t-lg bg-muted/50 p-3 pb-2 md:rounded-none">
                    <div className="mb-3 px-1">
                        <h2 className="font-semibold text-lg sm:hidden">Select Model</h2>
                        <p className="text-muted-foreground text-sm sm:hidden">
                            Choose a model for your conversation
                        </p>
                    </div>
                    <div className="relative">
                        <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
                        <Input
                            value={searchValue}
                            onChange={(event) => setSearchValue(event.target.value)}
                            placeholder="Search models..."
                            className="h-10 border-0 bg-secondary/60 pl-9 shadow-none focus-visible:ring-2"
                        />
                    </div>
                </div>

                <div className="grid max-h-[50vh] min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:max-h-[400px] md:grid-cols-[80px_minmax(0,1fr)] md:grid-rows-1">
                    <div className="flex min-h-0 min-w-0 flex-col bg-muted/50 md:border-r">
                        <div className="relative border-border border-b md:hidden">
                            <div className="scrollbar-none -mb-[1px] flex w-full gap-1 overflow-x-auto px-2 pt-2 pb-[1px]">
                                {filteredSections.map((section) => {
                                    const isActive = section.id === visibleSection?.id
                                    return (
                                        <button
                                            key={section.id}
                                            type="button"
                                            onClick={() => setActiveProvider(section.id)}
                                            className={cn(
                                                "relative flex min-w-fit items-center gap-2 rounded-t-xl border-x border-t px-3 py-2 text-left transition-colors",
                                                isActive
                                                    ? "-mb-[1px] z-10 border-border bg-popover text-foreground"
                                                    : "border-transparent bg-transparent text-muted-foreground hover:bg-muted/50"
                                            )}
                                            aria-label={section.label}
                                        >
                                            <div
                                                className={cn(
                                                    "flex size-7 items-center justify-center rounded-md",
                                                    isActive ? "bg-secondary/70" : "bg-transparent"
                                                )}
                                            >
                                                {section.icon}
                                            </div>
                                            <div className="min-w-0">
                                                <div
                                                    className={cn(
                                                        "truncate font-medium text-sm",
                                                        isActive ? "" : "opacity-80"
                                                    )}
                                                >
                                                    {section.compactLabel}
                                                </div>
                                                <div className="truncate text-xs opacity-70">
                                                    {section.models.length} model
                                                    {section.models.length === 1 ? "" : "s"}
                                                </div>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                        <ScrollArea className="-mr-[1px] hidden flex-1 md:block">
                            <div className="flex flex-col gap-1 py-2 pr-[1px] pl-2">
                                {filteredSections.map((section) => {
                                    const isActive = section.id === visibleSection?.id
                                    return (
                                        <Tooltip key={section.id}>
                                            <TooltipTrigger asChild>
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveProvider(section.id)}
                                                    className={cn(
                                                        "relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-l-xl border-y border-l px-2 py-3 text-left transition-colors",
                                                        isActive
                                                            ? "-mr-[1px] z-10 border-border bg-popover text-foreground"
                                                            : "border-transparent bg-transparent text-muted-foreground hover:bg-muted/50"
                                                    )}
                                                    aria-label={section.label}
                                                >
                                                    <div
                                                        className={cn(
                                                            "flex size-7 items-center justify-center rounded-md",
                                                            isActive
                                                                ? "bg-secondary/70"
                                                                : "bg-transparent"
                                                        )}
                                                    >
                                                        {section.icon}
                                                    </div>
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="right">
                                                {section.label}
                                            </TooltipContent>
                                        </Tooltip>
                                    )
                                })}
                            </div>
                        </ScrollArea>
                    </div>

                    <div className="flex min-h-0 flex-col bg-popover p-3">
                        {visibleSection ? (
                            <>
                                <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                                    <div>
                                        <h3 className="hidden font-medium text-sm md:block md:text-base">
                                            {visibleSection.label}
                                        </h3>
                                        <p className="hidden text-muted-foreground text-xs md:block md:text-sm">
                                            {visibleSection.models.length} available
                                        </p>
                                    </div>
                                </div>

                                <ScrollArea className="max-h-[40vh] min-h-0 flex-1 pr-1 md:max-h-full">
                                    <div className="space-y-2 pb-3">
                                        {visibleSection.models.map((model) => (
                                            <ModelCard
                                                key={model.id}
                                                model={model}
                                                selectedModel={selectedModel}
                                                onModelChange={onModelChange}
                                                onClose={() => setOpen(false)}
                                                currentProviders={currentProviders}
                                                disabled={isModelLocked(model)}
                                                badgeLabel={
                                                    getPrototypeCreditTierForModel(
                                                        model,
                                                        reasoningEffort
                                                    ) === "pro"
                                                        ? "Pro"
                                                        : undefined
                                                }
                                            />
                                        ))}
                                    </div>
                                </ScrollArea>
                            </>
                        ) : (
                            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed text-center text-muted-foreground text-sm">
                                No models match your search.
                            </div>
                        )}
                    </div>
                </div>
            </ResponsivePopoverContent>
        </ResponsivePopover>
    )
}
