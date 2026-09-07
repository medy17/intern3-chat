import {
    buildModelPickerSections,
    isLegacyModel,
    isOpenRouterOnlySharedModel,
    getModelProviderId,
    getModelSectionId,
    getProviderSectionLabel
} from "@/lib/model-picker-data"
import { useModelFavorites } from "@/hooks/use-model-favorites"
import { getProviderIcon, getProviderSectionIcon } from "./model-picker-icons"
export { getProviderIcon, getProviderSectionIcon } from "./model-picker-icons"
import { ModelCostIndicator } from "@/components/model-cost-indicator"
import { useCreditAccess } from "@/components/credits/credit-access-runtime"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Input } from "@/components/ui/input"
import {
    ResponsivePopover,
    ResponsivePopoverContent,
    ResponsivePopoverTrigger
} from "@/components/ui/responsive-popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import type { SharedModel } from "@/convex/lib/models"
import { useSession } from "@/hooks/auth-hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import { modelSupportsNativePdf } from "@/lib/attachment-support"
import { DefaultSettings } from "@/lib/default-user-settings"
import { OPEN_MODEL_PICKER_SHORTCUT_EVENT } from "@/lib/keyboard-shortcuts"
import type { ModelBenchmarkPayload } from "@/lib/model-benchmarks"
import { FAVORITES_SECTION_ID, getFavoriteToggleAction } from "@/lib/model-favorites"
import { isNewModelRelease } from "@/lib/model-release"
import { type ReasoningEffort, useModelStore } from "@/lib/model-store"
import {
    type DisplayModel,
    getAbilityIcon,
    getAbilityLabel,
    getAllowedReasoningEffortsForModel,
    getModelDescription,
    getModelShortDescription,
    getProviderDisplayName,
    getReasoningEffortForPlan,
    getReasoningEffortIcon,
    getRequiredPlanToPickModel,
    hasBuiltInOpenRouterProvider,
    isAdminOnlyModel,
    isImageGenerationCapableModel,
    isSupportedCustomModelCoreProvider,
    useAvailableModels
} from "@/lib/models-providers-shared"
import { useSharedModels } from "@/lib/shared-models"
import { captureBrowserEvent } from "@/lib/telemetry/browser"
import { TELEMETRY_EVENTS } from "@/lib/telemetry/events"
import { cn } from "@/lib/utils"
import { useConvexAuth } from "@convex-dev/react-query"
import { Link } from "@tanstack/react-router"
import {
    Archive,
    Calculator,
    CheckCircle,
    ChevronDown,
    ChevronUp,
    CircleHelp,
    ExternalLink,
    Globe,
    GraduationCap,
    Image,
    Key,
    Search,
    Sparkle,
    Star,
    Terminal,
    Trophy
} from "lucide-react"
import * as React from "react"
import { LayoutGroup, motion } from "motion/react"
import { toast } from "sonner"
import "./model-selector.css"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

const getGrokModeIcon = (model: SharedModel, reasoningEffort: ReasoningEffort) => {
    const isToggleOnlyReasoningModel =
        model.customIcon === "xai" &&
        model.abilities.includes("reasoning") &&
        model.supportsDisablingReasoning === true &&
        !model.abilities.includes("effort_control")

    if (!isToggleOnlyReasoningModel) return null

    const ReasoningIcon = getReasoningEffortIcon(reasoningEffort, model)
    return <ReasoningIcon className="size-4" />
}

type ProviderSection = {
    id: string
    label: string
    models: DisplayModel[]
    icon: React.ReactNode
}

const getActiveRuntimeProvider = (
    model: DisplayModel,
    currentProviders: ReturnType<typeof useAvailableModels>["currentProviders"],
    sharedModels: SharedModel[]
): { isByok: boolean; label: string } | null => {
    if ("isCustom" in model && model.isCustom) {
        const providerId = model.providerId

        if (
            isSupportedCustomModelCoreProvider(providerId) &&
            currentProviders.core.openrouter?.enabled
        ) {
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
        if (
            providerId === "openrouter" &&
            currentProviders.core.openrouter?.enabled &&
            currentProviders.core.openrouter?.usageMode === "priority"
        ) {
            return {
                isByok: true,
                label: getProviderDisplayName(providerId, currentProviders)
            }
        }
    }

    if (isOpenRouterOnlySharedModel(sharedModel) && hasBuiltInOpenRouterProvider(sharedModel)) {
        return { isByok: false, label: "Built-in" }
    }

    if (isOpenRouterOnlySharedModel(sharedModel) && currentProviders.core.openrouter?.enabled) {
        return {
            isByok: true,
            label: getProviderDisplayName("openrouter", currentProviders)
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

const FEATURE_COLORS: Record<string, string> = {
    vision: "var(--chart-2, var(--primary))",
    reasoning: "var(--chart-3, var(--primary))",
    effort_control: "var(--chart-4, var(--primary))",
    function_calling: "var(--chart-1, var(--primary))",
    native_pdf: "var(--chart-5, var(--primary))",
    image_generation: "var(--chart-2, var(--primary))",
    web_search: "var(--chart-4, var(--primary))"
}

const CapabilityPill = ({ ability }: { ability: string }) => {
    const featureColor = FEATURE_COLORS[ability] ?? "var(--primary)"

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div
                    className="flex size-7 items-center justify-center rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--feature-color)_28%,transparent)] bg-[color-mix(in_oklab,var(--feature-color)_12%,transparent)] text-[color-mix(in_oklab,var(--feature-color)_72%,var(--foreground))]"
                    style={{ "--feature-color": featureColor } as React.CSSProperties}
                >
                    {renderAbilityIcon(ability, "size-4")}
                </div>
            </TooltipTrigger>
            <TooltipContent>{getAbilityTooltip(ability)}</TooltipContent>
        </Tooltip>
    )
}

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

const getAbilityDisplayRank = (ability: string) => {
    switch (ability) {
        case "vision":
            return 0
        case "reasoning":
            return 1
        case "function_calling":
            return 2
        case "native_pdf":
            return 4
        default:
            return 3
    }
}

const getModelAbilities = (model: DisplayModel) => {
    const abilities = isImageGenerationCapableModel(model)
        ? ["image_generation", ...model.abilities]
        : model.abilities.filter((ability) => ability !== "effort_control")

    return abilities
        .map((ability, index) => ({ ability, index }))
        .sort(
            (left, right) =>
                getAbilityDisplayRank(left.ability) - getAbilityDisplayRank(right.ability) ||
                left.index - right.index
        )
        .map(({ ability }) => ability)
}

const FeatureBadge = ({ ability }: { ability: string }) => {
    const featureColor = FEATURE_COLORS[ability] ?? "var(--primary)"

    return (
        <div
            className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--feature-color)_28%,transparent)] bg-[color-mix(in_oklab,var(--feature-color)_12%,transparent)] px-3 py-1.5 text-[color-mix(in_oklab,var(--feature-color)_72%,var(--foreground))] text-sm"
            style={{ "--feature-color": featureColor } as React.CSSProperties}
        >
            {renderAbilityIcon(ability, "size-4")}
            <span>{getAbilityTooltip(ability)}</span>
        </div>
    )
}

const AdminOnlyModelBadge = ({ className }: { className?: string }) => (
    <Badge
        variant="secondary"
        className={cn("border border-border/70 text-[0.625rem] uppercase tracking-wide", className)}
    >
        Admin
    </Badge>
)

const NewModelBadge = () => (
    <Badge
        variant="secondary"
        className="shrink-0 border border-border/70 text-[0.625rem] uppercase tracking-wide"
    >
        New
    </Badge>
)

const BENCHMARK_CATEGORY_COLORS: Record<string, string> = {
    intelligence: "var(--chart-2)",
    coding: "var(--chart-1)",
    math: "var(--chart-3)"
}

const BenchmarkProgress = ({ value, label }: { value: number; label: string }) => {
    const normalizedValue = Math.max(0, Math.min(value, 100))
    const radius = 26
    const circumference = 2 * Math.PI * radius
    const strokeOffset = circumference * (1 - normalizedValue / 100)

    return (
        <div className="relative size-14 shrink-0 text-[var(--benchmark-color)]">
            <svg className="size-full -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
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
            <div className="absolute inset-0 flex items-center justify-center font-semibold text-[0.725rem]">
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
    const categoryColor = BENCHMARK_CATEGORY_COLORS[card.key] ?? "var(--primary)"

    return (
        <div
            className="min-w-0 rounded-[var(--radius-xl)] border border-[color-mix(in_oklab,var(--benchmark-color)_32%,var(--border))] bg-background/40 p-3"
            style={{ "--benchmark-color": categoryColor } as React.CSSProperties}
        >
            <div className="flex items-start justify-between gap-3">
                {icon ? (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--benchmark-color)_24%,transparent)] bg-[color-mix(in_oklab,var(--benchmark-color)_12%,transparent)] text-[var(--benchmark-color)]">
                        {icon}
                    </div>
                ) : (
                    <div />
                )}
                {showRing ? (
                    <BenchmarkProgress value={card.value} label={card.displayValue} />
                ) : (
                    <div className="shrink-0 rounded-full border border-[color-mix(in_oklab,var(--benchmark-color)_24%,transparent)] bg-[color-mix(in_oklab,var(--benchmark-color)_12%,transparent)] px-3 py-2 font-semibold text-[var(--benchmark-color)] text-sm">
                        {card.displayValue}
                    </div>
                )}
            </div>
            <div className="mt-3 min-w-0">
                <p className="font-medium text-sm">{card.title}</p>
                {card.subtitle ? (
                    <p className="mt-1 text-muted-foreground text-xs">{card.subtitle}</p>
                ) : null}
            </div>
            {(card.breakdownLabel || card.breakdownValue) && (
                <div className="mt-3 flex items-center justify-between gap-3 border-border/70 border-t pt-3 text-xs">
                    <span className="min-w-0 text-muted-foreground">
                        {card.breakdownLabel ?? "Benchmark"}
                    </span>
                    <span className="shrink-0 font-medium text-[var(--benchmark-color)]">
                        {card.breakdownValue}
                    </span>
                </div>
            )}
        </div>
    )
}

const BenchmarkSection = ({ benchmarkState }: { benchmarkState?: BenchmarkState }) => {
    if (!benchmarkState || benchmarkState.status === "loading") {
        return (
            <div className="grid max-w-96 grid-cols-2 gap-2">
                <Skeleton className="h-40 rounded-[var(--radius-xl)]" />
                <Skeleton className="h-40 rounded-[var(--radius-xl)]" />
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
        <div className="max-w-96">
            <div className="grid grid-cols-2 gap-2">
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
    benchmarkState
}: {
    model: DisplayModel
    currentProviders: ReturnType<typeof useAvailableModels>["currentProviders"]
    benchmarkState?: BenchmarkState
}) => {
    const isMobile = useIsMobile()
    const isCustom = "isCustom" in model && model.isCustom
    const modelAbilities = getModelAbilities(model)
    const sharedModel = !isCustom ? (model as SharedModel) : null
    const providerLabel = getProviderSectionLabel(getModelProviderId(model), currentProviders)
    const developerLabel =
        sharedModel?.developer?.trim() ||
        (isCustom ? getProviderDisplayName(model.providerId, currentProviders) : providerLabel)
    const headerIcon = getProviderSectionIcon(getModelSectionId(model), [model], "size-12")

    return (
        <div className="flex h-full min-h-0 flex-col bg-background">
            {isMobile ? (
                <DrawerHeader className="shrink-0 pb-0 text-left">
                    <div className="flex items-stretch gap-4">
                        <div className="flex w-12 shrink-0 items-center justify-center text-foreground">
                            {headerIcon}
                        </div>
                        <div className="min-w-0">
                            <DrawerTitle className="truncate text-lg">{model.name}</DrawerTitle>
                            <p className="mt-1 text-muted-foreground text-sm">
                                {getModelShortDescription(model)}
                            </p>
                        </div>
                    </div>
                </DrawerHeader>
            ) : (
                <div className="p-4 pb-0 md:p-5 md:pb-0">
                    <div className="mb-5 flex items-stretch gap-4">
                        <div className="flex w-12 shrink-0 items-center justify-center text-foreground">
                            {headerIcon}
                        </div>
                        <div className="min-w-0">
                            <h3 className="truncate font-semibold text-lg">{model.name}</h3>
                            <p className="mt-1 text-muted-foreground text-sm">
                                {getModelShortDescription(model)}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <ScrollArea className="min-h-0 flex-1">
                <div className={cn("space-y-6", isMobile ? "px-4 pt-5 pb-4" : "px-4 pb-2 md:px-5")}>
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

                    <section className="grid grid-cols-2 gap-x-4 gap-y-5">
                        <div>
                            <h4 className="font-semibold text-base">Provider</h4>
                            <p className="mt-2 text-muted-foreground text-sm">{providerLabel}</p>
                        </div>
                        <div>
                            <h4 className="font-semibold text-base">Developer</h4>
                            <p className="mt-2 text-muted-foreground text-sm">{developerLabel}</p>
                        </div>
                        <div>
                            <h4 className="font-semibold text-base">Knowledge Cutoff</h4>
                            <p className="mt-2 text-muted-foreground text-sm">
                                {sharedModel?.knowledgeCutoff ?? "Not specified"}
                            </p>
                        </div>
                        <div>
                            <h4 className="font-semibold text-base">Added On</h4>
                            <p className="mt-2 text-muted-foreground text-sm">
                                {sharedModel?.addedOn ?? "Not specified"}
                            </p>
                        </div>
                    </section>

                    <section>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <h4 className="font-semibold text-base">Benchmark Performance</h4>
                            {benchmarkState?.status === "ready" &&
                                benchmarkState.payload.available && (
                                    <a
                                        href={benchmarkState.payload.sourceUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
                                    >
                                        via {benchmarkState.payload.sourceLabel}
                                        <ExternalLink className="size-3" />
                                    </a>
                                )}
                        </div>
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
    const triggerRef = React.useRef<HTMLButtonElement>(null)
    const wasOpenRef = React.useRef(false)
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

    React.useEffect(() => {
        if (!isMobile) {
            wasOpenRef.current = open
            return
        }

        if (wasOpenRef.current && !open) {
            requestAnimationFrame(() => {
                triggerRef.current?.focus({ preventScroll: true })
            })
        }

        wasOpenRef.current = open
    }, [isMobile, open])

    const trigger = (
        <button
            ref={triggerRef}
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
            <ResponsivePopover open={open} onOpenChange={setOpen} nested>
                <ResponsivePopoverTrigger asChild>{trigger}</ResponsivePopoverTrigger>
                <ResponsivePopoverContent
                    className="z-[91] h-[75dvh] min-h-0 w-full max-w-full overflow-hidden bg-background p-0"
                    overlayClassName="z-[90]"
                    showCloseButton={false}
                >
                    <div className="flex h-full min-h-0 flex-col overflow-hidden">
                        <ModelDetailPanel
                            model={model}
                            currentProviders={currentProviders}
                            benchmarkState={benchmarkState}
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

const FavoriteToggle = ({
    model,
    isFavorite,
    onToggleFavorite,
    useToastConfirmation = false
}: {
    model: DisplayModel
    isFavorite: boolean
    onToggleFavorite: (modelId: string) => void
    useToastConfirmation?: boolean
}) => {
    const [isRemovalArmed, setIsRemovalArmed] = React.useState(false)
    const [tooltipOpen, setTooltipOpen] = React.useState(false)
    const resetTimerRef = React.useRef<number | null>(null)
    const confirmationToastId = `favorite-removal:${model.id}`

    const clearRemovalTimer = React.useCallback(() => {
        if (resetTimerRef.current !== null) {
            window.clearTimeout(resetTimerRef.current)
            resetTimerRef.current = null
        }
    }, [])

    const resetRemoval = React.useCallback(() => {
        clearRemovalTimer()
        setIsRemovalArmed(false)
        setTooltipOpen(false)
    }, [clearRemovalTimer])

    React.useEffect(() => clearRemovalTimer, [clearRemovalTimer])

    React.useEffect(() => {
        if (!isFavorite) resetRemoval()
    }, [isFavorite, resetRemoval])

    const handleToggle = () => {
        const action = getFavoriteToggleAction({ isFavorite, isRemovalArmed })
        if (action === "arm-removal") {
            setIsRemovalArmed(true)
            setTooltipOpen(true)
            if (useToastConfirmation) {
                toast("Tap again to remove from favorites", {
                    description: model.name,
                    duration: 2500,
                    id: confirmationToastId
                })
            }
            resetTimerRef.current = window.setTimeout(resetRemoval, 2500)
            return
        }

        if (useToastConfirmation) toast.dismiss(confirmationToastId)
        resetRemoval()
        onToggleFavorite(model.id)
    }

    return (
        <Tooltip
            open={tooltipOpen}
            onOpenChange={(nextOpen) => setTooltipOpen(isRemovalArmed ? true : nextOpen)}
        >
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                        "size-7 rounded-[var(--radius-md)] border text-muted-foreground",
                        isFavorite && "border-transparent bg-accent text-primary"
                    )}
                    aria-label={
                        isRemovalArmed
                            ? `Confirm removal of ${model.name} from favorites`
                            : isFavorite
                              ? `Remove ${model.name} from favorites`
                              : `Add ${model.name} to favorites`
                    }
                    aria-pressed={isFavorite}
                    onClick={handleToggle}
                >
                    <Star className={cn("size-4", isFavorite && "fill-primary text-primary")} />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
                {isRemovalArmed
                    ? "Click again to confirm"
                    : isFavorite
                      ? "Tap to Remove"
                      : "Add to favorites"}
            </TooltipContent>
        </Tooltip>
    )
}

const ModelCard = React.memo(function ModelCard({
    model,
    selectedModel,
    onModelChange,
    onManualSelection,
    onClose,
    currentProviders,
    disabled,
    disabledReason,
    isFavorite,
    onToggleFavorite,
    isNewRelease,
    badgeLabel,
    badgeVariant = "secondary",
    showProviderIcon = false,
    mobile,
    telemetrySurface
}: {
    model: DisplayModel
    selectedModel: string
    onModelChange: (modelId: string) => void
    onManualSelection: () => void
    onClose: () => void
    currentProviders: ReturnType<typeof useAvailableModels>["currentProviders"]
    disabled?: boolean
    disabledReason?: string
    isFavorite: boolean
    onToggleFavorite: (modelId: string) => void
    isNewRelease: boolean
    badgeLabel?: string
    badgeVariant?: "secondary" | "warning"
    showProviderIcon?: boolean
    mobile: boolean
    telemetrySurface: "composer" | "message_edit" | "persona_settings"
}) {
    const isSelected = model.id === selectedModel
    const cardRef = React.useRef<HTMLDivElement>(null)
    const [isSelectedVisible, setIsSelectedVisible] = React.useState(false)
    const modelAbilities = getModelAbilities(model)

    React.useEffect(() => {
        if (!isSelected) {
            setIsSelectedVisible(false)
            return
        }

        const card = cardRef.current
        if (!card || typeof IntersectionObserver === "undefined") {
            setIsSelectedVisible(true)
            return
        }

        const observer = new IntersectionObserver(
            ([entry]) => setIsSelectedVisible(entry.isIntersecting),
            { threshold: 0.35 }
        )
        observer.observe(card)

        return () => observer.disconnect()
    }, [isSelected])

    const selectModel = () => {
        if (disabled) return
        if (model.id !== selectedModel) {
            onManualSelection()
            captureBrowserEvent(TELEMETRY_EVENTS.modelManuallySelected, {
                previous_model_id: selectedModel,
                selected_model_id: model.id,
                surface: telemetrySurface
            })
        }
        onModelChange(model.id)
        onClose()
    }

    return (
        <div
            ref={cardRef}
            className={cn(
                "relative w-full rounded-[var(--radius-xl)] border bg-background/60 p-3 text-left transition-colors",
                mobile && "border-input",
                "hover:border-accent hover:bg-accent/10",
                isSelected &&
                    "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/10 ring-inset",
                disabled &&
                    "cursor-not-allowed border-border/60 bg-muted/30 text-muted-foreground hover:border-border/60 hover:bg-muted/30"
            )}
        >
            {isSelected && (
                <div
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--radius-xl)]"
                    data-selected-model-orbit-visible={isSelectedVisible}
                    aria-hidden="true"
                >
                    <div className="absolute inset-px overflow-hidden rounded-[calc(var(--radius-xl)-1px)]">
                        <div className="selected-model-orbit-laser" />
                        <div className="selected-model-orbit-laser selected-model-orbit-laser-mirror" />
                    </div>
                    <div className="absolute inset-1 rounded-[var(--radius-lg)] border border-primary/25" />
                </div>
            )}
            <button
                type="button"
                disabled={disabled}
                onClick={selectModel}
                aria-pressed={isSelected}
                className="relative z-10 block w-full text-left focus-visible:outline-none"
            >
                <div className="flex items-start">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-start">
                            <div className="min-w-0 pr-10">
                                <div className="flex items-center gap-2">
                                    {showProviderIcon && (
                                        <span
                                            className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"
                                            aria-hidden="true"
                                        >
                                            {getProviderIcon(
                                                model,
                                                "isCustom" in model && model.isCustom
                                            )}
                                        </span>
                                    )}
                                    <span className="truncate font-medium text-sm sm:text-base">
                                        {model.name}
                                    </span>
                                    {!("isCustom" in model && model.isCustom) && (
                                        <ModelCostIndicator model={model as SharedModel} />
                                    )}
                                    {badgeLabel && (
                                        <Badge
                                            variant={badgeVariant}
                                            className="text-[0.625rem] uppercase tracking-wide"
                                        >
                                            {badgeLabel}
                                        </Badge>
                                    )}
                                    {isNewRelease && <NewModelBadge />}
                                    {isAdminOnlyModel(model) && <AdminOnlyModelBadge />}
                                </div>
                                <p
                                    className={cn(
                                        "mt-1 line-clamp-2 text-muted-foreground text-xs sm:text-sm",
                                        showProviderIcon && "pl-7"
                                    )}
                                >
                                    {getModelShortDescription(model)}
                                </p>
                                {disabled && disabledReason && (
                                    <p
                                        className={cn(
                                            "mt-2 text-muted-foreground text-xs",
                                            showProviderIcon && "pl-7"
                                        )}
                                    >
                                        {disabledReason}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div
                            className={cn(
                                "mt-2 flex min-h-7 items-center gap-3 pr-20",
                                showProviderIcon && "pl-7"
                            )}
                        >
                            {modelAbilities.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {modelAbilities.slice(0, 4).map((ability) => (
                                        <CapabilityPill
                                            key={`${model.id}-${ability}`}
                                            ability={ability}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </button>
            {isSelected && (
                <div className="absolute top-3 right-3 z-10 flex size-7 items-center justify-center text-primary">
                    <CheckCircle className="size-4" />
                </div>
            )}
            <div className="absolute right-3 bottom-3 z-10 hidden items-center gap-1 sm:flex">
                <FavoriteToggle
                    model={model}
                    isFavorite={isFavorite}
                    onToggleFavorite={onToggleFavorite}
                />
                <ModelInfoFlyout model={model} currentProviders={currentProviders} />
            </div>
            <div className="absolute right-3 bottom-3 z-10 flex items-center gap-1 sm:hidden">
                <FavoriteToggle
                    model={model}
                    isFavorite={isFavorite}
                    onToggleFavorite={onToggleFavorite}
                    useToastConfirmation
                />
                <ModelInfoFlyout model={model} currentProviders={currentProviders} />
            </div>
        </div>
    )
})

export function ModelSelector({
    selectedModel,
    onModelChange,
    className,
    tooltip,
    suppressTooltip = false,
    triggerWrapperClassName,
    contentClassName,
    preferShortName = true,
    side = "bottom",
    align = "start",
    shortcutTarget = "none",
    tone = "default",
    modal = true,
    requiresNativePdf = false,
    byokContextHint,
    open: controlledOpen,
    onOpenChange,
    telemetrySurface
}: {
    selectedModel: string
    onModelChange: (modelId: string) => void
    className?: string
    tooltip?: React.ReactNode
    suppressTooltip?: boolean
    triggerWrapperClassName?: string
    contentClassName?: string
    preferShortName?: boolean
    side?: "top" | "right" | "bottom" | "left"
    align?: "start" | "center" | "end"
    shortcutTarget?: "composer" | "none"
    tone?: "default" | "on-primary"
    modal?: boolean
    requiresNativePdf?: boolean
    byokContextHint?: {
        tooltip: string
        ariaLabel: string
    }
    open?: boolean
    onOpenChange?: (open: boolean) => void
    telemetrySurface: "composer" | "message_edit" | "persona_settings"
}) {
    const auth = useConvexAuth()
    const session = useSession()
    const isMobile = useIsMobile()
    const userSettings = useCurrentUserSettings(session.user?.id, auth.isLoading)

    const [internalOpen, setOpenState] = React.useState(false)
    const open = controlledOpen ?? internalOpen
    const openRef = React.useRef(false)
    const selectorTelemetryRef = React.useRef({
        availableModelCount: 0,
        resultCount: 0,
        searchCharacterCount: 0,
        selectionMade: false
    })
    const setOpen = React.useCallback(
        (nextOpen: boolean) => {
            if (nextOpen === openRef.current) return
            openRef.current = nextOpen
            const metrics = selectorTelemetryRef.current
            if (nextOpen) {
                metrics.selectionMade = false
                captureBrowserEvent(TELEMETRY_EVENTS.modelSelectorOpened, {
                    surface: telemetrySurface,
                    presentation: isMobile ? "mobile" : "desktop",
                    available_model_count: metrics.availableModelCount
                })
            } else {
                captureBrowserEvent(TELEMETRY_EVENTS.modelSelectorClosed, {
                    surface: telemetrySurface,
                    presentation: isMobile ? "mobile" : "desktop",
                    selection_made: metrics.selectionMade,
                    search_used: metrics.searchCharacterCount > 0,
                    search_character_count: metrics.searchCharacterCount,
                    result_count: metrics.resultCount
                })
            }
            if (controlledOpen === undefined) setOpenState(nextOpen)
            onOpenChange?.(nextOpen)
        },
        [controlledOpen, isMobile, onOpenChange, telemetrySurface]
    )
    React.useEffect(() => {
        openRef.current = open
    }, [open])
    const [searchValue, setSearchValue] = React.useState("")
    const [expandedLegacySections, setExpandedLegacySections] = React.useState<
        Record<string, boolean>
    >({})
    const triggerRef = React.useRef<HTMLSpanElement>(null)
    const [desktopAlignOffset, setDesktopAlignOffset] = React.useState(0)
    const [desktopPopoverWidth, setDesktopPopoverWidth] = React.useState<number | null>(null)
    const reasoningEffort = useModelStore((state) => state.reasoningEffort)
    const setReasoningEffort = useModelStore((state) => state.setReasoningEffort)
    const creditPlan = useCreditAccess((state) => state.plan)
    const [canScrollUp, setCanScrollUp] = React.useState(false)
    const [canScrollDown, setCanScrollDown] = React.useState(false)
    const [newModelReferenceTime] = React.useState(() => Date.now())
    const leftPanelRef = React.useRef<HTMLDivElement>(null)

    const checkScroll = React.useCallback(() => {
        if (!leftPanelRef.current) return
        const { scrollTop, scrollHeight, clientHeight } = leftPanelRef.current
        setCanScrollUp(scrollTop > 0)
        setCanScrollDown(scrollTop + clientHeight < scrollHeight - 1)
    }, [])

    React.useEffect(() => {
        checkScroll()
        const current = leftPanelRef.current
        if (current) {
            const resizeObserver = new ResizeObserver(checkScroll)
            resizeObserver.observe(current)
            if (current.firstElementChild) {
                resizeObserver.observe(current.firstElementChild)
            }
            return () => resizeObserver.disconnect()
        }
    }, [checkScroll])

    const handleLeftPanelScroll = React.useCallback(() => {
        checkScroll()
    }, [checkScroll])

    const scrollPanel = React.useCallback((amount: number) => {
        if (leftPanelRef.current) {
            leftPanelRef.current.scrollBy({ top: amount, behavior: "smooth" })
        }
    }, [])

    const { availableModels, currentProviders } = useAvailableModels(
        "error" in userSettings ? DefaultSettings(session.user?.id ?? "") : userSettings
    )
    selectorTelemetryRef.current.availableModelCount = availableModels.length
    const { models: sharedModels } = useSharedModels()
    const newModelIds = React.useMemo(
        () =>
            new Set(
                availableModels
                    .filter((model) => isNewModelRelease(model, newModelReferenceTime))
                    .map((model) => model.id)
            ),
        [availableModels, newModelReferenceTime]
    )
    const { favoriteModelIds, toggleFavorite } = useModelFavorites(
        session.user?.id,
        availableModels,
        sharedModels
    )

    const providerSections = React.useMemo<ProviderSection[]>(
        () =>
            buildModelPickerSections(availableModels, currentProviders, favoriteModelIds).map(
                (section) => ({
                    ...section,
                    icon: getProviderSectionIcon(section.id, section.models)
                })
            ),
        [availableModels, currentProviders, favoriteModelIds]
    )

    const newProviderSectionIds = React.useMemo(
        () =>
            new Set(
                providerSections
                    .filter(
                        (section) =>
                            section.id !== FAVORITES_SECTION_ID &&
                            section.models.some((model) => newModelIds.has(model.id))
                    )
                    .map((section) => section.id)
            ),
        [newModelIds, providerSections]
    )

    const selectedModelData = React.useMemo(
        () => availableModels.find((model) => model.id === selectedModel),
        [availableModels, selectedModel]
    )

    const isModelLocked = React.useCallback(
        (model: DisplayModel) =>
            creditPlan === "free" && getRequiredPlanToPickModel(model, reasoningEffort) === "pro",
        [creditPlan, reasoningEffort]
    )

    const isModelDisabled = React.useCallback(
        (model: DisplayModel) =>
            isModelLocked(model) || (requiresNativePdf && !modelSupportsNativePdf(model)),
        [isModelLocked, requiresNativePdf]
    )

    const getModelDisabledReason = React.useCallback(
        (model: DisplayModel) => {
            if (requiresNativePdf && !modelSupportsNativePdf(model)) {
                return "This thread requires native PDF support."
            }

            if (isModelLocked(model)) {
                return "Requires Pro plan."
            }

            return undefined
        },
        [isModelLocked, requiresNativePdf]
    )

    const selectedSharedModel = React.useMemo(
        () => sharedModels.find((model) => model.id === selectedModel),
        [selectedModel, sharedModels]
    )

    const fallbackReasoningEffort = React.useMemo(() => {
        if (creditPlan !== "free" || !selectedSharedModel) return null
        if (!getAllowedReasoningEffortsForModel(selectedSharedModel).length) return null

        return getReasoningEffortForPlan(selectedSharedModel, reasoningEffort, creditPlan)
    }, [creditPlan, reasoningEffort, selectedSharedModel])

    const fallbackModelId = React.useMemo(
        () => availableModels.find((model) => !isModelDisabled(model))?.id,
        [availableModels, isModelDisabled]
    )

    React.useEffect(() => {
        if (!selectedModelData || !fallbackModelId) return
        if (!isModelDisabled(selectedModelData)) return
        if (
            isModelLocked(selectedModelData) &&
            fallbackReasoningEffort &&
            fallbackReasoningEffort !== reasoningEffort
        ) {
            setReasoningEffort(fallbackReasoningEffort)
            return
        }
        if (fallbackModelId === selectedModel) return

        onModelChange(fallbackModelId)
    }, [
        fallbackModelId,
        fallbackReasoningEffort,
        isModelDisabled,
        isModelLocked,
        onModelChange,
        reasoningEffort,
        selectedModel,
        selectedModelData,
        setReasoningEffort
    ])

    const [activeProvider, setActiveProvider] = React.useState<string | null>(FAVORITES_SECTION_ID)
    const providerRailLayoutGroupId = React.useId()

    React.useEffect(() => {
        if (!open) {
            setSearchValue("")
            setExpandedLegacySections({})
            setActiveProvider(FAVORITES_SECTION_ID)
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
    }, [setOpen, shortcutTarget])

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
    selectorTelemetryRef.current.searchCharacterCount = searchValue.trim().length
    selectorTelemetryRef.current.resultCount = filteredSections.reduce(
        (total, section) => total + section.models.length,
        0
    )

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
        if (!isCustom) {
            const grokModeIcon = getGrokModeIcon(selectedModelData as SharedModel, reasoningEffort)
            if (grokModeIcon) return grokModeIcon
        }
        return getProviderIcon(selectedModelData, isCustom)
    }, [reasoningEffort, selectedModelData, sharedModels])

    const activeRuntimeProvider = React.useMemo(
        () =>
            selectedModelData
                ? getActiveRuntimeProvider(selectedModelData, currentProviders, sharedModels)
                : null,
        [currentProviders, selectedModelData, sharedModels]
    )
    const showByokContextHint = Boolean(byokContextHint && !activeRuntimeProvider?.isByok)
    const visibleSectionModels = React.useMemo(() => {
        if (!visibleSection) return []
        if (expandedLegacySections[visibleSection.id]) return visibleSection.models

        const currentModels = visibleSection.models.filter((model) => !isLegacyModel(model))
        return currentModels.length > 0 ? currentModels : visibleSection.models.slice(0, 5)
    }, [expandedLegacySections, visibleSection])

    const hiddenLegacyCount = React.useMemo(() => {
        if (!visibleSection || expandedLegacySections[visibleSection.id]) return 0
        return visibleSection.models.length - visibleSectionModels.length
    }, [expandedLegacySections, visibleSection, visibleSectionModels.length])

    const modelList =
        visibleSection && visibleSectionModels.length > 0 ? (
            <div className="space-y-2 pb-3">
                {visibleSectionModels.map((model) => (
                    <ModelCard
                        key={model.id}
                        model={model}
                        selectedModel={selectedModel}
                        onModelChange={onModelChange}
                        onManualSelection={() => {
                            selectorTelemetryRef.current.selectionMade = true
                        }}
                        onClose={() => setOpen(false)}
                        currentProviders={currentProviders}
                        disabled={isModelDisabled(model)}
                        disabledReason={getModelDisabledReason(model)}
                        isFavorite={favoriteModelIds.includes(model.id)}
                        onToggleFavorite={toggleFavorite}
                        isNewRelease={newModelIds.has(model.id)}
                        showProviderIcon={visibleSection.id === FAVORITES_SECTION_ID}
                        mobile={isMobile}
                        telemetrySurface={telemetrySurface}
                        badgeLabel={
                            requiresNativePdf && !modelSupportsNativePdf(model)
                                ? "PDF Required"
                                : creditPlan === "free" &&
                                    getRequiredPlanToPickModel(model, reasoningEffort) === "pro"
                                  ? "Pro"
                                  : undefined
                        }
                        badgeVariant={
                            requiresNativePdf && !modelSupportsNativePdf(model)
                                ? "warning"
                                : "secondary"
                        }
                    />
                ))}
                {hiddenLegacyCount > 0 && (
                    <Button
                        type="button"
                        variant="ghost"
                        className="w-full justify-center gap-2 text-muted-foreground text-sm hover:text-foreground"
                        onClick={() =>
                            setExpandedLegacySections((prev) => ({
                                ...prev,
                                [visibleSection.id]: true
                            }))
                        }
                    >
                        <Archive className="size-4" />
                        Show legacy models
                    </Button>
                )}
            </div>
        ) : (
            <div className="flex flex-1 items-center justify-center rounded-[var(--radius-xl)] border border-dashed text-center text-muted-foreground text-sm">
                {visibleSection?.id === FAVORITES_SECTION_ID && !searchValue
                    ? "Favorite models to see them here."
                    : "No models match your search."}
            </div>
        )

    const triggerButton = (
        <Button
            type="button"
            variant="ghost"
            aria-expanded={open}
            onClick={() => {
                if (isMobile) {
                    setOpen(true)
                }
            }}
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
                        {preferShortName
                            ? (selectedModelData as SharedModel)?.shortName ||
                              selectedModelData.name
                            : selectedModelData.name}
                    </span>
                    <span className="hidden md:block">{selectedModelData.name}</span>
                    {selectedSharedModel && <ModelCostIndicator model={selectedSharedModel} />}
                    {showByokContextHint && byokContextHint && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span
                                    className={cn(
                                        "inline-flex text-muted-foreground",
                                        tone === "on-primary" && "text-primary-foreground"
                                    )}
                                    aria-label={byokContextHint.ariaLabel}
                                >
                                    <Key className="size-3.5" />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>{byokContextHint.tooltip}</TooltipContent>
                        </Tooltip>
                    )}
                    {activeRuntimeProvider?.isByok && byokContextHint && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span
                                    className={cn(
                                        "inline-flex text-muted-foreground",
                                        tone === "on-primary" && "text-primary-foreground"
                                    )}
                                    aria-label={byokContextHint.ariaLabel}
                                >
                                    <Key className="size-3.5" />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>{byokContextHint.tooltip}</TooltipContent>
                        </Tooltip>
                    )}
                </div>
            )}
            <ChevronDown className="ml-auto h-4 w-4" />
        </Button>
    )

    const trigger = (
        <span ref={triggerRef} className={cn("inline-flex", triggerWrapperClassName)}>
            {tooltip && !isMobile ? (
                <Tooltip open={suppressTooltip ? false : undefined} delayDuration={1_000}>
                    <TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
                    <TooltipContent side="top">{tooltip}</TooltipContent>
                </Tooltip>
            ) : (
                triggerButton
            )}
        </span>
    )

    const selectorContent = (
        <>
            {creditPlan === "free" && (
                <div className="flex shrink-0 items-center justify-between gap-4 border-primary/15 border-b bg-primary/10 px-4 py-3">
                    <div className="min-w-0">
                        <p className="truncate font-semibold text-sm">Unlock all models</p>
                        <p className="font-medium text-primary text-xs">$8.99/month</p>
                    </div>
                    <Button asChild size="sm" className="shrink-0 rounded-[var(--radius-md)]">
                        <Link to="/settings/billing" onClick={() => setOpen(false)}>
                            Upgrade
                        </Link>
                    </Button>
                </div>
            )}
            {isMobile ? (
                <div className="shrink-0 bg-background px-4 pt-3 pb-3">
                    <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchValue}
                            onChange={(event) => setSearchValue(event.target.value)}
                            placeholder="Search models..."
                            className="h-10 border-0 bg-secondary/60 pl-9 shadow-none focus-visible:ring-2"
                        />
                    </div>
                </div>
            ) : (
                <div className="shrink-0 bg-popover p-3 pb-2">
                    <div className="mb-3 px-1">
                        <h2 className="font-semibold text-lg sm:hidden">Select Model</h2>
                        <p className="text-muted-foreground text-sm sm:hidden">
                            Choose a model for your conversation
                        </p>
                    </div>
                    <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchValue}
                            onChange={(event) => setSearchValue(event.target.value)}
                            placeholder="Search models..."
                            className="h-10 border-0 bg-secondary/60 pl-9 shadow-none focus-visible:ring-2"
                        />
                    </div>
                </div>
            )}

            <div className="grid min-h-0 flex-1 grid-cols-[3.5rem_minmax(0,1fr)] grid-rows-1 overflow-hidden md:max-h-[25rem] md:grid-cols-[4rem_minmax(0,1fr)]">
                <div className="flex min-h-0 min-w-0 flex-col rounded-tr-[var(--radius-md)] border-t border-r bg-muted/50">
                    <div className="relative min-h-0 flex-1 overflow-hidden">
                        {canScrollUp && (
                            <div className="pointer-events-none absolute top-0 right-[1px] left-0 z-30 flex h-12 items-start justify-center bg-gradient-to-b from-muted/90 via-muted/50 to-transparent backdrop-blur-[2px] transition-opacity duration-300">
                                <button
                                    type="button"
                                    className="pointer-events-auto cursor-pointer pt-1 text-muted-foreground transition-colors hover:text-foreground"
                                    onClick={() => scrollPanel(-100)}
                                >
                                    <ChevronUp className="size-4 animate-bounce" />
                                </button>
                            </div>
                        )}
                        <div
                            ref={leftPanelRef}
                            onScroll={handleLeftPanelScroll}
                            className="scrollbar-none relative h-full overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        >
                            <LayoutGroup id={providerRailLayoutGroupId}>
                                <div
                                    className={cn(
                                        "relative flex flex-col items-center gap-1",
                                        isMobile ? "px-1 pt-3 pb-2" : "px-2 pt-3 pb-2"
                                    )}
                                >
                                    {filteredSections.map((section) => {
                                        const isActive = section.id === visibleSection?.id
                                        const hasNewModels = newProviderSectionIds.has(section.id)
                                        return (
                                            <Tooltip key={section.id}>
                                                <TooltipTrigger asChild>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setActiveProvider(section.id)
                                                        }
                                                        className={cn(
                                                            "relative isolate flex size-11 min-w-0 shrink-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border border-transparent bg-transparent p-0 text-left transition-colors",
                                                            isActive
                                                                ? "text-foreground"
                                                                : "text-muted-foreground hover:bg-muted/50"
                                                        )}
                                                        aria-label={section.label}
                                                    >
                                                        {isActive && (
                                                            <motion.span
                                                                aria-hidden="true"
                                                                data-slot="model-selector-provider-indicator"
                                                                layoutId="model-selector-provider-indicator"
                                                                className={cn(
                                                                    "pointer-events-none absolute inset-0 -z-10 rounded-[inherit] ring-1 ring-foreground/20 ring-inset",
                                                                    isMobile
                                                                        ? "bg-background"
                                                                        : "bg-popover"
                                                                )}
                                                                transition={{
                                                                    duration: 0.25,
                                                                    ease: [0.16, 1, 0.3, 1]
                                                                }}
                                                            />
                                                        )}
                                                        <div
                                                            className={cn(
                                                                "relative flex size-7 items-center justify-center rounded-[var(--radius-md)] bg-transparent",
                                                                hasNewModels && "overflow-hidden"
                                                            )}
                                                        >
                                                            <span
                                                                className={cn(
                                                                    "relative z-10 flex items-center justify-center",
                                                                    hasNewModels &&
                                                                        "new-model-provider-logo-glow"
                                                                )}
                                                            >
                                                                {section.icon}
                                                            </span>
                                                            {hasNewModels && (
                                                                <>
                                                                    <Sparkle className="new-model-provider-twinkle absolute top-0.5 right-0.5 z-20 size-2.5" />
                                                                    <Sparkle className="new-model-provider-twinkle new-model-provider-twinkle-b absolute bottom-0.5 left-0.5 z-20 size-2" />
                                                                </>
                                                            )}
                                                        </div>
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent side="left">
                                                    {section.label}
                                                </TooltipContent>
                                            </Tooltip>
                                        )
                                    })}
                                </div>
                            </LayoutGroup>
                        </div>
                        {canScrollDown && (
                            <div className="pointer-events-none absolute right-[1px] bottom-0 left-0 z-30 flex h-12 items-end justify-center bg-gradient-to-t from-muted/90 via-muted/50 to-transparent backdrop-blur-[2px] transition-opacity duration-300">
                                <button
                                    type="button"
                                    className="pointer-events-auto cursor-pointer pb-1 text-muted-foreground transition-colors hover:text-foreground"
                                    onClick={() => scrollPanel(100)}
                                >
                                    <ChevronDown className="size-4 animate-bounce" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div
                    className={cn(
                        "flex min-h-0 flex-col p-3",
                        isMobile ? "bg-background" : "bg-popover"
                    )}
                >
                    {isMobile ? (
                        <div
                            className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain pr-1"
                            onTouchMoveCapture={(event) => event.stopPropagation()}
                        >
                            {modelList}
                        </div>
                    ) : (
                        <ScrollArea className="min-h-0 flex-1 pr-1">{modelList}</ScrollArea>
                    )}
                </div>
            </div>
        </>
    )

    if (isMobile) {
        return (
            <>
                {trigger}
                <Drawer open={open} onOpenChange={setOpen} nested modal={modal}>
                    <DrawerContent
                        className={cn(
                            "z-[81] flex h-[85dvh] max-h-[85dvh] flex-col gap-0 overflow-hidden bg-background p-0",
                            contentClassName
                        )}
                        overlayClassName="z-[80]"
                    >
                        <DrawerTitle className="sr-only">Select Model</DrawerTitle>
                        <div className="flex min-h-0 flex-1 flex-col pt-2">{selectorContent}</div>
                    </DrawerContent>
                </Drawer>
            </>
        )
    }

    return (
        <ResponsivePopover open={open} onOpenChange={setOpen} modal={modal}>
            <ResponsivePopoverTrigger asChild>{trigger}</ResponsivePopoverTrigger>
            <ResponsivePopoverContent
                className={cn(
                    "flex w-[min(92vw,42.5rem)] flex-col overflow-hidden p-0 md:w-[42.5rem]",
                    contentClassName
                )}
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
                {selectorContent}
            </ResponsivePopoverContent>
        </ResponsivePopover>
    )
}
import { useCurrentUserSettings } from "@/hooks/use-current-user-settings"
