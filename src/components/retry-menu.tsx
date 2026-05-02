import { api } from "@/convex/_generated/api"
import type { SharedModel } from "@/convex/lib/models"
import { useSession } from "@/hooks/auth-hooks"
import { useDiskCachedQuery } from "@/lib/convex-cached-query"
import { DefaultSettings } from "@/lib/default-user-settings"
import { type ReasoningEffort, useModelStore } from "@/lib/model-store"
import {
    getAllowedReasoningEffortsForModel,
    getProviderDisplayName,
    getReasoningEffortLabelForModel,
    isImageGenerationCapableModel,
    useAvailableModels
} from "@/lib/models-providers-shared"
import type { DisplayModel } from "@/lib/models-providers-shared"
import { useConvexAuth } from "@convex-dev/react-query"
import { Archive, Brain, RotateCcw } from "lucide-react"
import * as React from "react"
import { getProviderSectionIcon } from "./model-selector"
import { Button } from "./ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuPortal,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger
} from "./ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

const PROVIDER_ORDER = ["openai", "anthropic", "google", "xai", "groq", "fal", "openrouter"]
const getModelReleaseOrder = (model: DisplayModel) =>
    "isCustom" in model && model.isCustom ? 0 : ((model as SharedModel).releaseOrder ?? 0)

const normalizeProviderId = (providerId: string) =>
    providerId.startsWith("i3-") ? providerId.slice(3) : providerId

const getOpenRouterDeveloperSectionId = (developer: string) =>
    `openrouter-developer:${developer
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}`

const isOpenRouterOnlySharedModel = (model: SharedModel) => {
    const adapters = model.adapters ?? []
    return adapters.length > 0 && adapters.every((adapter) => adapter.startsWith("openrouter:"))
}

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

const getModelSectionId = (model: DisplayModel) => {
    if ("isCustom" in model && model.isCustom) {
        return normalizeProviderId(model.providerId)
    }

    const sharedModel = model as SharedModel
    if (isOpenRouterOnlySharedModel(sharedModel) && sharedModel.developer?.trim()) {
        return getOpenRouterDeveloperSectionId(sharedModel.developer)
    }

    return getModelProviderId(model)
}

const getProviderSectionLabel = (
    providerId: string,
    currentProviders: ReturnType<typeof useAvailableModels>["currentProviders"],
    models?: DisplayModel[]
) => {
    if (providerId.startsWith("openrouter-developer:")) {
        const developer = models?.find((model) => !("isCustom" in model && model.isCustom)) as
            | SharedModel
            | undefined
        return developer?.developer?.trim() || "OpenRouter"
    }

    switch (providerId) {
        case "google":
            return "Gemini"
        case "xai":
            return "Grok"
        default:
            return getProviderDisplayName(providerId, currentProviders)
    }
}

export function RetryMenu({
    onRetry
}: {
    onRetry: (modelIdOverride?: string) => void
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

    const [expandedProviders, setExpandedProviders] = React.useState<Record<string, boolean>>({})

    const { setSelectedModel, setReasoningEffort } = useModelStore()

    const { availableModels, currentProviders } = useAvailableModels(
        "error" in userSettings ? DefaultSettings(session.user?.id ?? "") : userSettings
    )

    const providerSections = React.useMemo(() => {
        const textModels = availableModels.filter(
            (model) => !isImageGenerationCapableModel(model) && model.mode !== "speech-to-text"
        )
        const grouped = textModels.reduce<Record<string, DisplayModel[]>>((acc, model) => {
            const sectionId = getModelSectionId(model)
            if (!acc[sectionId]) {
                acc[sectionId] = []
            }
            acc[sectionId].push(model)
            return acc
        }, {})

        return Object.entries(grouped)
            .map(([providerId, models]) => {
                const label = getProviderSectionLabel(providerId, currentProviders, models)
                return {
                    id: providerId,
                    label,
                    models: [...models].sort((left, right) => {
                        const leftLegacy = "legacy" in left && left.legacy ? 1 : 0
                        const rightLegacy = "legacy" in right && right.legacy ? 1 : 0

                        if (leftLegacy !== rightLegacy) {
                            return leftLegacy - rightLegacy
                        }

                        const releaseDelta =
                            getModelReleaseOrder(right) - getModelReleaseOrder(left)
                        if (releaseDelta !== 0) {
                            return releaseDelta
                        }
                        return left.name.localeCompare(right.name)
                    })
                }
            })
            .sort((left, right) => {
                const leftId = left.id
                const rightId = right.id
                const leftOrder = PROVIDER_ORDER.indexOf(leftId)
                const rightOrder = PROVIDER_ORDER.indexOf(rightId)
                const resolvedLeftOrder = leftOrder === -1 ? Number.MAX_SAFE_INTEGER : leftOrder
                const resolvedRightOrder = rightOrder === -1 ? Number.MAX_SAFE_INTEGER : rightOrder
                if (resolvedLeftOrder !== resolvedRightOrder) {
                    return resolvedLeftOrder - resolvedRightOrder
                }
                return left.label.localeCompare(right.label)
            })
    }, [availableModels, currentProviders])

    return (
        <DropdownMenu
            onOpenChange={(open) => {
                if (!open) {
                    setTimeout(() => setExpandedProviders({}), 300)
                }
            }}
        >
            <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 border bg-background/80 text-foreground shadow-sm backdrop-blur-sm hover:bg-accent hover:text-primary"
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                    <p>Retry</p>
                </TooltipContent>
            </Tooltip>

            <DropdownMenuContent align="end" className="w-[12.5rem]">
                <DropdownMenuItem onClick={() => onRetry()} className="cursor-pointer gap-2">
                    <RotateCcw className="h-4 w-4" />
                    <span>Retry same</span>
                </DropdownMenuItem>

                <div className="flex items-center gap-2 px-2 py-1.5">
                    <div className="h-[0.0625rem] flex-1 bg-border" />
                    <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                        or switch model
                    </span>
                    <div className="h-[0.0625rem] flex-1 bg-border" />
                </div>

                {providerSections.map((section) => {
                    const isExpanded = expandedProviders[section.id]

                    let currentModels = section.models.filter((m) => !("legacy" in m && m.legacy))
                    if (currentModels.length === 0) {
                        currentModels = section.models.slice(0, 5)
                    }

                    const visibleModels = isExpanded ? section.models : currentModels
                    const hasMore = section.models.length > currentModels.length

                    return (
                        <DropdownMenuSub key={section.id}>
                            <DropdownMenuSubTrigger className="cursor-pointer gap-2.5 pr-2">
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border bg-secondary/50">
                                    {getProviderSectionIcon(section.id, section.models, "size-3.5")}
                                </div>
                                <span className="flex-1 truncate">{section.label}</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                                <DropdownMenuSubContent
                                    className="w-[15rem]"
                                    sideOffset={8}
                                    collisionPadding={16}
                                >
                                    {visibleModels.map((model) => {
                                        const handleSelect = (effort?: ReasoningEffort) => {
                                            setSelectedModel(model.id)
                                            if (effort) {
                                                setReasoningEffort(effort)
                                            }
                                            onRetry(model.id)
                                        }

                                        const sharedModel =
                                            "isCustom" in model && model.isCustom
                                                ? null
                                                : (model as SharedModel)
                                        const allowedEfforts =
                                            getAllowedReasoningEffortsForModel(sharedModel)

                                        if (allowedEfforts.length > 0) {
                                            return (
                                                <div
                                                    key={model.id}
                                                    className="flex items-center gap-0.5"
                                                >
                                                    <DropdownMenuItem
                                                        onClick={() =>
                                                            handleSelect(allowedEfforts[0])
                                                        }
                                                        className="flex-1 cursor-pointer pr-2"
                                                    >
                                                        <div className="flex min-w-0 flex-1 flex-col">
                                                            <span className="truncate font-medium text-sm">
                                                                {model.name}
                                                            </span>
                                                        </div>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSub>
                                                        <DropdownMenuSubTrigger className="h-9 cursor-pointer px-2">
                                                            <span className="sr-only">
                                                                Reasoning Options
                                                            </span>
                                                        </DropdownMenuSubTrigger>
                                                        <DropdownMenuPortal>
                                                            <DropdownMenuSubContent
                                                                sideOffset={8}
                                                                collisionPadding={16}
                                                            >
                                                                <DropdownMenuItem
                                                                    onClick={() => handleSelect()}
                                                                    className="mb-1 cursor-pointer font-medium"
                                                                >
                                                                    Retry with{" "}
                                                                    {"shortName" in model &&
                                                                    model.shortName
                                                                        ? model.shortName
                                                                        : model.name}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <div className="flex items-center gap-2 px-2 py-1.5">
                                                                    <Brain className="size-3 text-muted-foreground" />
                                                                    <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                                                        Reasoning Effort
                                                                    </span>
                                                                </div>
                                                                {allowedEfforts.map((effort) => (
                                                                    <DropdownMenuItem
                                                                        key={effort}
                                                                        onClick={() =>
                                                                            handleSelect(effort)
                                                                        }
                                                                        className="cursor-pointer pl-6"
                                                                    >
                                                                        {getReasoningEffortLabelForModel(
                                                                            sharedModel,
                                                                            effort
                                                                        )}
                                                                    </DropdownMenuItem>
                                                                ))}
                                                            </DropdownMenuSubContent>
                                                        </DropdownMenuPortal>
                                                    </DropdownMenuSub>
                                                </div>
                                            )
                                        }

                                        return (
                                            <DropdownMenuItem
                                                key={model.id}
                                                onClick={() => handleSelect()}
                                                className="cursor-pointer"
                                            >
                                                <div className="flex min-w-0 flex-col">
                                                    <span className="truncate font-medium text-sm">
                                                        {model.name}
                                                    </span>
                                                </div>
                                            </DropdownMenuItem>
                                        )
                                    })}

                                    {hasMore && !isExpanded && (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                className="cursor-pointer justify-center text-muted-foreground hover:text-foreground"
                                                onClick={(e) => {
                                                    e.preventDefault()
                                                    setExpandedProviders((prev) => ({
                                                        ...prev,
                                                        [section.id]: true
                                                    }))
                                                }}
                                            >
                                                <Archive className="size-3.5" />
                                                <span className="font-medium text-xs">
                                                    Show legacy models
                                                </span>
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                        </DropdownMenuSub>
                    )
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
