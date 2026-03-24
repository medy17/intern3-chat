import { api } from "@/convex/_generated/api"
import type { SharedModel } from "@/convex/lib/models"
import { useSession } from "@/hooks/auth-hooks"
import { useDiskCachedQuery } from "@/lib/convex-cached-query"
import { DefaultSettings } from "@/lib/default-user-settings"
import { type ReasoningEffort, useModelStore } from "@/lib/model-store"
import { getProviderDisplayName, useAvailableModels } from "@/lib/models-providers-shared"
import type { DisplayModel } from "@/lib/models-providers-shared"
import { useConvexAuth } from "@convex-dev/react-query"
import { Brain, RotateCcw } from "lucide-react"
import * as React from "react"
import { getProviderIcon } from "./model-selector"
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

            <DropdownMenuContent align="end" className="w-[200px]">
                <DropdownMenuItem onClick={() => onRetry()} className="cursor-pointer gap-2">
                    <RotateCcw className="h-4 w-4" />
                    <span>Retry same</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <div className="flex items-center gap-2 px-2 py-1.5">
                    <div className="h-[1px] flex-1 bg-border" />
                    <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                        or switch model
                    </span>
                    <div className="h-[1px] flex-1 bg-border" />
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
                            <DropdownMenuSubTrigger className="cursor-pointer">
                                <span className="flex-1 truncate">{section.label}</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                                <DropdownMenuSubContent
                                    className="w-[240px]"
                                    sideOffset={8}
                                    collisionPadding={16}
                                >
                                    {visibleModels.map((model) => {
                                        const isCustom = "isCustom" in model && model.isCustom

                                        const handleSelect = (effort?: ReasoningEffort) => {
                                            setSelectedModel(model.id)
                                            if (effort) {
                                                setReasoningEffort(effort)
                                            }
                                            onRetry(model.id)
                                        }

                                        const supportsEffort =
                                            model.abilities.includes("effort_control")
                                        const supportsDisabling =
                                            "supportsDisablingReasoning" in model &&
                                            model.supportsDisablingReasoning
                                        const allowedEfforts: ReasoningEffort[] = supportsDisabling
                                            ? ["off", "low", "medium", "high"]
                                            : ["low", "medium", "high"]

                                        const formatEffort = (effort: string) =>
                                            effort.charAt(0).toUpperCase() + effort.slice(1)

                                        if (supportsEffort) {
                                            return (
                                                <div
                                                    key={model.id}
                                                    className="flex items-center gap-0.5"
                                                >
                                                    <DropdownMenuItem
                                                        onClick={() =>
                                                            handleSelect(allowedEfforts[0])
                                                        }
                                                        className="flex-1 cursor-pointer gap-2 pr-2"
                                                    >
                                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-secondary/60">
                                                            {getProviderIcon(model, isCustom)}
                                                        </div>
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
                                                                        {formatEffort(effort)}
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
                                                className="cursor-pointer gap-2"
                                            >
                                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-secondary/60">
                                                    {getProviderIcon(model, isCustom)}
                                                </div>
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
