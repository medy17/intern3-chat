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
import { Input } from "@/components/ui/input"
import {
    ResponsivePopover,
    ResponsivePopoverContent,
    ResponsivePopoverTrigger
} from "@/components/ui/responsive-popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { api } from "@/convex/_generated/api"
import type { SharedModel } from "@/convex/lib/models"
import { useSession } from "@/hooks/auth-hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import { useDiskCachedQuery } from "@/lib/convex-cached-query"
import { DefaultSettings } from "@/lib/default-user-settings"
import { OPEN_MODEL_PICKER_SHORTCUT_EVENT } from "@/lib/keyboard-shortcuts"
import { useModelStore } from "@/lib/model-store"
import {
    type DisplayModel,
    getAbilityIcon,
    getAbilityLabel,
    getPrototypeCreditTierForModel,
    getProviderDisplayName,
    isImageGenerationCapableModel,
    useAvailableModels
} from "@/lib/models-providers-shared"
import { useSharedModels } from "@/lib/shared-models"
import { cn } from "@/lib/utils"
import { useConvexAuth } from "@convex-dev/react-query"
import {
    AudioLines,
    Check,
    ChevronDown,
    Globe,
    Image,
    MessageSquareText,
    Search
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

type SelectorCategory = "text" | "image" | "audio"

const PROVIDER_ORDER = ["openai", "anthropic", "google", "xai", "groq", "fal", "openrouter"]
const getModelReleaseOrder = (model: DisplayModel) =>
    "isCustom" in model && model.isCustom ? 0 : ((model as SharedModel).releaseOrder ?? 0)

const SELECTOR_CATEGORIES: Array<{
    id: SelectorCategory
    label: string
    compactLabel: string
    icon: React.ReactNode
}> = [
    {
        id: "text",
        label: "Text",
        compactLabel: "Text",
        icon: <MessageSquareText className="size-4" />
    },
    {
        id: "image",
        label: "Image",
        compactLabel: "Image",
        icon: <Image className="size-4" />
    },
    {
        id: "audio",
        label: "Audio",
        compactLabel: "Audio",
        icon: <AudioLines className="size-4" />
    }
]

const getSelectorCategory = (model?: DisplayModel): SelectorCategory => {
    if (!model) return "text"
    if (isImageGenerationCapableModel(model)) return "image"
    if (model.mode === "speech-to-text") return "audio"
    return "text"
}

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

const buildModelSubtitle = (model: DisplayModel) => {
    if (isImageGenerationCapableModel(model)) {
        return "Image generation"
    }

    if (model.mode === "speech-to-text") {
        return "Speech to text"
    }

    const abilityLabels = model.abilities
        .filter((ability) => ability !== "effort_control")
        .slice(0, 3)
        .map((ability) => getAbilityLabel(ability))

    return abilityLabels.length > 0 ? abilityLabels.join(" • ") : "General purpose chat"
}

const ModelCard = React.memo(function ModelCard({
    model,
    selectedModel,
    onModelChange,
    onClose,
    disabled,
    badgeLabel
}: {
    model: DisplayModel
    selectedModel: string
    onModelChange: (modelId: string) => void
    onClose: () => void
    disabled?: boolean
    badgeLabel?: string
}) {
    const isSelected = model.id === selectedModel
    const isCustom = "isCustom" in model && model.isCustom
    const modelAbilities = isImageGenerationCapableModel(model)
        ? ["image_generation", ...model.abilities]
        : model.abilities.filter((ability) => ability !== "effort_control")

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => {
                if (disabled) return
                onModelChange(model.id)
                onClose()
            }}
            className={cn(
                "w-full rounded-xl border bg-background/60 p-3 text-left transition-colors",
                "hover:border-accent hover:bg-accent/10",
                isSelected && "border-accent bg-accent/10 shadow-sm",
                disabled &&
                    "cursor-not-allowed border-border/60 bg-muted/30 text-muted-foreground hover:border-border/60 hover:bg-muted/30"
            )}
        >
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex shrink-0 items-center justify-center rounded-md border bg-secondary/60 p-2">
                    {getProviderIcon(model, isCustom)}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
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
                                {isSelected && <Check className="size-4 shrink-0 text-primary" />}
                            </div>
                            <p className="mt-1 line-clamp-2 text-muted-foreground text-xs sm:text-sm">
                                {buildModelSubtitle(model)}
                            </p>
                        </div>
                        {modelAbilities.length > 0 && (
                            <div className="hidden shrink-0 flex-wrap justify-end gap-1 sm:flex">
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
                    {modelAbilities.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1 sm:hidden">
                            {modelAbilities.slice(0, 4).map((ability) => (
                                <CapabilityPill
                                    key={`${model.id}-mobile-${ability}`}
                                    ability={ability}
                                    emphasized={isSelected}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </button>
    )
})

export function ModelSelector({
    selectedModel,
    onModelChange,
    className,
    side = "bottom",
    align = "start",
    shortcutTarget = "none"
}: {
    selectedModel: string
    onModelChange: (modelId: string) => void
    className?: string
    side?: "top" | "right" | "bottom" | "left"
    align?: "start" | "center" | "end"
    shortcutTarget?: "composer" | "none"
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
        const grouped = availableModels.reduce<Record<string, DisplayModel[]>>((acc, model) => {
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

    const selectedCategoryId = React.useMemo(
        () => getSelectorCategory(selectedModelData),
        [selectedModelData]
    )

    const [activeCategory, setActiveCategory] = React.useState<SelectorCategory>(selectedCategoryId)

    const [activeProvider, setActiveProvider] = React.useState<string | null>(null)

    React.useEffect(() => {
        setActiveCategory(selectedCategoryId)
    }, [selectedCategoryId])

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
        const categorySections = providerSections
            .map((section) => ({
                ...section,
                models: section.models.filter(
                    (model) => getSelectorCategory(model) === activeCategory
                )
            }))
            .filter((section) => section.models.length > 0)

        if (!query) return categorySections

        return categorySections
            .map((section) => ({
                ...section,
                models: section.models.filter((model) => {
                    const haystack = [
                        model.name,
                        model.id,
                        buildModelSubtitle(model),
                        section.label
                    ]
                        .join(" ")
                        .toLowerCase()

                    return haystack.includes(query)
                })
            }))
            .filter((section) => section.models.length > 0)
    }, [activeCategory, providerSections, searchValue])

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
                title="Select Model"
                description="Choose a model for your conversation"
            >
                <div className="shrink-0 border-b p-3">
                    <div className="relative">
                        <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
                        <Input
                            value={searchValue}
                            onChange={(event) => setSearchValue(event.target.value)}
                            placeholder="Search models..."
                            className="h-10 border-0 bg-secondary/60 pl-9 shadow-none focus-visible:ring-2"
                        />
                    </div>
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                        {SELECTOR_CATEGORIES.map((category) => {
                            const isActive = category.id === activeCategory

                            return (
                                <button
                                    key={category.id}
                                    type="button"
                                    onClick={() => setActiveCategory(category.id)}
                                    className={cn(
                                        "inline-flex min-w-fit items-center gap-2 rounded-lg border px-3 py-1.5 font-medium text-xs transition-colors sm:text-sm",
                                        "hover:border-accent hover:bg-accent/10",
                                        isActive && "border-accent bg-accent/10 text-foreground"
                                    )}
                                >
                                    {category.icon}
                                    <span className="sm:hidden">{category.compactLabel}</span>
                                    <span className="hidden sm:inline">{category.label}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div className="grid max-h-[50vh] min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:max-h-[400px] md:grid-cols-[76px_minmax(0,1fr)] md:grid-rows-1">
                    <div className="flex min-h-0 min-w-0 flex-col border-b p-2 md:border-r md:border-b-0 md:p-1.5">
                        <div className="scrollbar-none flex w-full gap-2 overflow-x-auto md:hidden">
                            {filteredSections.map((section) => {
                                const isActive = section.id === visibleSection?.id
                                return (
                                    <button
                                        key={section.id}
                                        type="button"
                                        onClick={() => setActiveProvider(section.id)}
                                        className={cn(
                                            "flex min-w-fit items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                                            "hover:border-accent hover:bg-accent/10",
                                            isActive && "border-accent bg-accent/10 text-foreground"
                                        )}
                                        aria-label={section.label}
                                    >
                                        <div className="flex size-7 items-center justify-center rounded-md bg-secondary/70">
                                            {section.icon}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="truncate font-medium text-sm">
                                                {section.compactLabel}
                                            </div>
                                            <div className="truncate text-muted-foreground text-xs">
                                                {section.models.length} model
                                                {section.models.length === 1 ? "" : "s"}
                                            </div>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                        <ScrollArea className="hidden flex-1 md:block">
                            <div className="flex flex-col gap-2">
                                {filteredSections.map((section) => {
                                    const isActive = section.id === visibleSection?.id
                                    return (
                                        <Tooltip key={section.id}>
                                            <TooltipTrigger asChild>
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveProvider(section.id)}
                                                    className={cn(
                                                        "flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-3 text-left transition-colors",
                                                        "hover:border-accent hover:bg-accent/10",
                                                        isActive &&
                                                            "border-accent bg-accent/10 text-foreground"
                                                    )}
                                                    aria-label={section.label}
                                                >
                                                    <div className="flex size-7 items-center justify-center rounded-md bg-secondary/70">
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

                    <div className="flex min-h-0 flex-col p-3">
                        {visibleSection ? (
                            <>
                                <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-medium text-sm sm:text-base">
                                            {visibleSection.label}
                                        </h3>
                                        <p className="text-muted-foreground text-xs sm:text-sm">
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
