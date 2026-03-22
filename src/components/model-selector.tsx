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
import { DefaultSettings } from "@/convex/settings"
import { useSession } from "@/hooks/auth-hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import { useDiskCachedQuery } from "@/lib/convex-cached-query"
import {
    type DisplayModel,
    getAbilityIcon,
    getAbilityLabel,
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
    onClose
}: {
    model: DisplayModel
    selectedModel: string
    onModelChange: (modelId: string) => void
    onClose: () => void
}) {
    const isSelected = model.id === selectedModel
    const isCustom = "isCustom" in model && model.isCustom
    const modelAbilities = isImageGenerationCapableModel(model)
        ? ["image_generation", ...model.abilities]
        : model.abilities.filter((ability) => ability !== "effort_control")

    return (
        <button
            type="button"
            onClick={() => {
                onModelChange(model.id)
                onClose()
            }}
            className={cn(
                "w-full rounded-xl border bg-background/60 p-3 text-left transition-colors",
                "hover:border-accent hover:bg-accent/10",
                isSelected && "border-accent bg-accent/10 shadow-sm"
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
                                {isSelected && <Check className="size-4 shrink-0 text-primary" />}
                            </div>
                            <p className="mt-1 line-clamp-2 text-muted-foreground text-xs sm:text-sm">
                                {buildModelSubtitle(model)}
                            </p>
                        </div>
                        {modelAbilities.length > 0 && (
                            <div className="flex shrink-0 flex-wrap justify-end gap-1">
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
            </div>
        </button>
    )
})

export function ModelSelector({
    selectedModel,
    onModelChange,
    className
}: {
    selectedModel: string
    onModelChange: (modelId: string) => void
    className?: string
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

    const { availableModels, currentProviders } = useAvailableModels(
        "error" in userSettings ? DefaultSettings(session.user?.id ?? "") : userSettings
    )
    const { models: sharedModels } = useSharedModels()

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
                className="w-[min(92vw,680px)] p-0 md:w-[680px]"
                align="start"
                alignOffset={desktopAlignOffset}
                style={
                    !isMobile && desktopPopoverWidth
                        ? {
                              width: `${desktopPopoverWidth}px`,
                              maxWidth: "92vw"
                          }
                        : undefined
                }
                title="Select Model"
                description="Choose a model for your conversation"
            >
                <div className="border-b p-3">
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
                                        "inline-flex min-w-fit items-center gap-2 rounded-full border px-3 py-1.5 font-medium text-xs transition-colors sm:text-sm",
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

                <div className="grid min-h-[420px] grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[76px_minmax(0,1fr)] md:grid-rows-1">
                    <div className="border-b p-2 md:border-r md:border-b-0 md:p-1.5">
                        <ScrollArea className="max-h-28 md:max-h-[420px]">
                            <div className="flex gap-2 md:flex-col">
                                {filteredSections.map((section) => {
                                    const isActive = section.id === visibleSection?.id

                                    const trigger = (
                                        <button
                                            key={section.id}
                                            type="button"
                                            onClick={() => setActiveProvider(section.id)}
                                            className={cn(
                                                "flex min-w-fit items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors md:min-w-0 md:flex-col md:justify-center md:gap-1 md:px-2 md:py-3",
                                                "hover:border-accent hover:bg-accent/10",
                                                isActive &&
                                                    "border-accent bg-accent/10 text-foreground"
                                            )}
                                            aria-label={section.label}
                                        >
                                            <div className="flex size-7 items-center justify-center rounded-md bg-secondary/70">
                                                {section.icon}
                                            </div>
                                            <div className="min-w-0 md:hidden">
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

                                    return (
                                        <Tooltip key={section.id}>
                                            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                                            <TooltipContent side="right">
                                                {section.label}
                                            </TooltipContent>
                                        </Tooltip>
                                    )
                                })}
                            </div>
                        </ScrollArea>
                    </div>

                    <div className="min-h-0 p-3">
                        {visibleSection ? (
                            <>
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-medium text-sm sm:text-base">
                                            {visibleSection.label}
                                        </h3>
                                        <p className="text-muted-foreground text-xs sm:text-sm">
                                            {visibleSection.models.length} available
                                        </p>
                                    </div>
                                </div>

                                <ScrollArea className="h-[320px] pr-1 md:h-[380px]">
                                    <div className="space-y-2">
                                        {visibleSection.models.map((model) => (
                                            <ModelCard
                                                key={model.id}
                                                model={model}
                                                selectedModel={selectedModel}
                                                onModelChange={onModelChange}
                                                onClose={() => setOpen(false)}
                                            />
                                        ))}
                                    </div>
                                </ScrollArea>
                            </>
                        ) : (
                            <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed text-center text-muted-foreground text-sm md:h-[380px]">
                                No models match your search.
                            </div>
                        )}
                    </div>
                </div>
            </ResponsivePopoverContent>
        </ResponsivePopover>
    )
}
