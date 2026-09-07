import type { SharedModel } from "@/convex/lib/models"
import { useCreditAccess } from "@/components/credits/credit-access-runtime"
import { useSession } from "@/hooks/auth-hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import type { AssistantConfigOverride } from "@/lib/assistant-config"
import { modelSupportsNativePdf, modelSupportsVision } from "@/lib/attachment-support"
import { DefaultSettings } from "@/lib/default-user-settings"
import { type ReasoningEffort, useModelStore } from "@/lib/model-store"
import {
    getAbilityIcon,
    getAbilityLabel,
    getAllowedReasoningEffortsForModel,
    getReasoningEffortForPlan,
    getReasoningEffortIcon,
    getReasoningEffortLabelForModel,
    getRequiredPlanToPickModel,
    isAdminOnlyModel,
    useAvailableModels
} from "@/lib/models-providers-shared"
import type { DisplayModel } from "@/lib/models-providers-shared"
import { cn } from "@/lib/utils"
import { useConvexAuth } from "@convex-dev/react-query"
import { Archive, ChevronRight, Crown, RotateCcw } from "lucide-react"
import * as React from "react"
import { getProviderSectionIcon } from "./model-picker-icons"
import { buildModelPickerSections, getModelSectionId } from "@/lib/model-picker-data"
import { FAVORITES_SECTION_ID } from "@/lib/model-favorites"
import { useModelFavorites } from "@/hooks/use-model-favorites"
import { useSharedModels } from "@/lib/shared-models"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion"
import { Badge } from "./ui/badge"
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
import { ResponsivePopover, ResponsivePopoverContent } from "./ui/responsive-popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

function RetryMenuDisabledReasonTooltip({
    reason,
    children
}: {
    reason: string
    children: React.ReactElement
}) {
    return (
        <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent className="z-[71] max-w-[min(22rem,calc(100vw-2rem))]">
                <div className="space-y-1.5 p-1">
                    <p className="font-medium leading-none">Why this model is unavailable</p>
                    <p className="text-primary-foreground/80">{reason}</p>
                </div>
            </TooltipContent>
        </Tooltip>
    )
}

const AdminOnlyModelBadge = () => (
    <Badge
        variant="secondary"
        className="border border-border/70 text-[0.625rem] uppercase tracking-wide"
    >
        Admin
    </Badge>
)

const MODEL_ABILITY_COLORS: Record<string, string> = {
    vision: "var(--chart-2, var(--primary))",
    reasoning: "var(--chart-3, var(--primary))",
    function_calling: "var(--chart-1, var(--primary))",
    native_pdf: "var(--chart-5, var(--primary))",
    pdf: "var(--chart-5, var(--primary))"
}

const getModelAbilityDisplayRank = (ability: string) => {
    switch (ability) {
        case "vision":
            return 0
        case "reasoning":
            return 1
        case "function_calling":
            return 2
        case "native_pdf":
        case "pdf":
            return 4
        default:
            return 3
    }
}

const RetryModelAbilityIcons = ({ model }: { model: DisplayModel }) => {
    const abilities = model.abilities
        .map((ability, index) => ({ ability, index }))
        .filter(({ ability }) => ability !== "effort_control")
        .sort(
            (left, right) =>
                getModelAbilityDisplayRank(left.ability) -
                    getModelAbilityDisplayRank(right.ability) || left.index - right.index
        )
        .slice(0, 4)
        .map(({ ability }) => ability)

    if (abilities.length === 0) {
        return null
    }

    return (
        <span className="flex shrink-0 items-center justify-end gap-2">
            {abilities.map((ability) => {
                const AbilityIcon = getAbilityIcon(ability)
                const label = getAbilityLabel(ability)
                const featureColor = MODEL_ABILITY_COLORS[ability] ?? "var(--primary)"

                return (
                    <Tooltip key={ability} delayDuration={150}>
                        <TooltipTrigger asChild>
                            <span
                                className="relative flex size-6 items-center justify-center overflow-hidden rounded-[var(--radius-md)] text-[color-mix(in_oklab,var(--feature-color)_72%,var(--foreground))]"
                                style={{ "--feature-color": featureColor } as React.CSSProperties}
                                aria-label={label}
                            >
                                <span className="absolute inset-0 bg-current opacity-20 dark:opacity-15" />
                                <AbilityIcon className="relative size-4 text-[color-mix(in_oklab,var(--feature-color)_72%,var(--foreground))]" />
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="z-[71]">
                            {label}
                        </TooltipContent>
                    </Tooltip>
                )
            })}
        </span>
    )
}

const RetrySubmenuContent = ({
    alignToMobileViewport = false,
    className,
    ...props
}: React.ComponentProps<typeof DropdownMenuSubContent> & {
    alignToMobileViewport?: boolean
}) => {
    const alignMobileContent = React.useCallback(
        (element: HTMLDivElement | null) => {
            if (!alignToMobileViewport || !element || window.innerWidth >= 640) {
                return
            }

            const alignContent = () => {
                if (!element.isConnected) return

                element.style.translate = "none"
                const viewportLeft = window.visualViewport?.offsetLeft ?? 0
                const contentLeft = element.getBoundingClientRect().left
                element.style.translate = `${viewportLeft + 8 - contentLeft}px 0`
            }

            alignContent()
            requestAnimationFrame(alignContent)
        },
        [alignToMobileViewport]
    )

    return (
        <DropdownMenuSubContent
            ref={alignMobileContent}
            avoidCollisions
            collisionPadding={20}
            className={cn(
                "max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto",
                className
            )}
            {...props}
        />
    )
}

const RetryModelRowContent = ({
    model,
    isModelLocked,
    showProviderIcon
}: {
    model: DisplayModel
    isModelLocked: boolean
    showProviderIcon: boolean
}) => (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-4 p-3">
        {showProviderIcon && (
            <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center">
                {getProviderSectionIcon(getModelSectionId(model), [model], "size-4")}
            </span>
        )}
        <span className="min-w-0 flex-1 font-medium text-muted-foreground">
            <span className="w-fit whitespace-nowrap max-sm:whitespace-normal max-sm:break-words">
                {model.name}
            </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
            <RetryModelAbilityIcons model={model} />
            {isModelLocked && (
                <Badge
                    variant="secondary"
                    className="border border-border/70 text-[0.625rem] uppercase tracking-wide"
                >
                    Pro
                </Badge>
            )}
            {isAdminOnlyModel(model) && <AdminOnlyModelBadge />}
        </span>
    </div>
)

export function RetryMenu({
    onRetry,
    requiresVision = false,
    requiresNativePdf = false,
    triggerLabel
}: {
    onRetry: (configOverride?: AssistantConfigOverride) => void
    requiresVision?: boolean
    requiresNativePdf?: boolean
    triggerLabel?: string
}) {
    const auth = useConvexAuth()
    const session = useSession()
    const isMobile = useIsMobile()
    const [mobileDisabledReason, setMobileDisabledReason] = React.useState<string | null>(null)
    const userSettings = useCurrentUserSettings(session.user?.id, auth.isLoading)

    const reasoningEffort = useModelStore((state) => state.reasoningEffort)
    const creditPlan = useCreditAccess((state) => state.plan)

    const { availableModels, currentProviders } = useAvailableModels(
        "error" in userSettings ? DefaultSettings(session.user?.id ?? "") : userSettings
    )

    const getDefaultRetryEffort = React.useCallback(
        (sharedModel: SharedModel | null, allowedEfforts: ReasoningEffort[]) => {
            if (allowedEfforts.length === 0) {
                return undefined
            }

            if (!sharedModel) {
                return creditPlan === "free" ? null : allowedEfforts[0]
            }

            if (creditPlan === "free") {
                return getReasoningEffortForPlan(sharedModel, reasoningEffort, creditPlan)
            }

            return allowedEfforts.includes(reasoningEffort) ? reasoningEffort : allowedEfforts[0]
        },
        [creditPlan, reasoningEffort]
    )

    const { models: sharedModels } = useSharedModels()
    const { favoriteModelIds } = useModelFavorites(session.user?.id, availableModels, sharedModels)
    const providerSections = React.useMemo(
        () =>
            buildModelPickerSections(availableModels, currentProviders, favoriteModelIds).filter(
                (section) => section.id !== FAVORITES_SECTION_ID || section.models.length > 0
            ),
        [availableModels, currentProviders, favoriteModelIds]
    )

    const getDisabledReason = React.useCallback(
        (isModelLocked: boolean, isVisionBlocked: boolean, isNativePdfBlocked: boolean) => {
            if (isNativePdfBlocked) {
                return "This thread requires native PDF support."
            }

            if (isVisionBlocked) {
                return "This thread requires vision support."
            }

            if (isModelLocked) {
                return "Requires Pro plan."
            }

            return null
        },
        []
    )

    const trigger = (
        <DropdownMenuTrigger asChild>
            <Button
                variant={triggerLabel ? "outline" : "ghost"}
                size={triggerLabel ? "sm" : "icon"}
                className={
                    triggerLabel
                        ? "text-foreground"
                        : "h-7 w-7 border bg-background/80 text-foreground shadow-sm backdrop-blur-sm hover:bg-accent hover:text-primary"
                }
            >
                <RotateCcw className={triggerLabel ? "size-4" : "h-3.5 w-3.5"} />
                {triggerLabel}
            </Button>
        </DropdownMenuTrigger>
    )

    return (
        <DropdownMenu>
            {triggerLabel ? (
                trigger
            ) : (
                <Tooltip delayDuration={150}>
                    <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                    <TooltipContent side="bottom">
                        <p>Retry</p>
                    </TooltipContent>
                </Tooltip>
            )}

            <DropdownMenuContent
                align="end"
                collisionPadding={20}
                className="relative mb-2 w-fit max-w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] border-none"
            >
                <DropdownMenuItem onClick={() => onRetry()} className="cursor-pointer px-3 py-2">
                    <RotateCcw className="mr-2 size-4" />
                    <span>Retry same</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="mx-2 my-5 opacity-50" />
                <div className="absolute z-10 -mt-8 flex w-full items-center justify-center">
                    <span className="bg-popover px-2 text-muted-foreground/80 text-sm">
                        OR SWITCH MODEL
                    </span>
                </div>

                {providerSections.map((section) => {
                    const currentModels = section.models.filter(
                        (model) => !("legacy" in model && model.legacy)
                    )
                    const legacyModels = section.models.filter(
                        (model) => "legacy" in model && model.legacy
                    )
                    const visibleModels =
                        section.id === FAVORITES_SECTION_ID
                            ? section.models
                            : currentModels.length > 0
                              ? currentModels
                              : legacyModels.slice(0, 5)
                    const hiddenLegacyModels =
                        section.id === FAVORITES_SECTION_ID
                            ? []
                            : currentModels.length > 0
                              ? legacyModels
                              : legacyModels.slice(5)

                    const renderModel = (model: DisplayModel) => {
                        const sharedModel =
                            "isCustom" in model && model.isCustom ? null : (model as SharedModel)
                        const allowedEfforts = getAllowedReasoningEffortsForModel(sharedModel)
                        const defaultRetryEffort = getDefaultRetryEffort(
                            sharedModel,
                            allowedEfforts
                        )
                        const isModelLocked =
                            creditPlan === "free" &&
                            (allowedEfforts.length > 0
                                ? defaultRetryEffort === null
                                : getRequiredPlanToPickModel(model, "off") === "pro")
                        const isNativePdfBlocked =
                            requiresNativePdf && !modelSupportsNativePdf(model)
                        const isVisionBlocked = requiresVision && !modelSupportsVision(model)
                        const disabledReason = getDisabledReason(
                            isModelLocked,
                            isVisionBlocked,
                            isNativePdfBlocked
                        )
                        const isModelDisabled =
                            isModelLocked || isVisionBlocked || isNativePdfBlocked

                        const handleSelect = (effort?: ReasoningEffort) => {
                            if (isModelDisabled) return

                            onRetry({
                                modelIdOverride: model.id,
                                ...(effort ? { reasoningEffortOverride: effort } : {})
                            })
                        }

                        const rowContent = (
                            <RetryModelRowContent
                                model={model}
                                isModelLocked={isModelLocked}
                                showProviderIcon={section.id === FAVORITES_SECTION_ID}
                            />
                        )

                        if (isModelDisabled) {
                            const disabledRow = (
                                <DropdownMenuItem
                                    key={model.id}
                                    aria-label={`${model.name} unavailable: ${disabledReason}`}
                                    onSelect={(event) => {
                                        event.preventDefault()
                                        if (isMobile && disabledReason) {
                                            setMobileDisabledReason(disabledReason)
                                        }
                                    }}
                                    className="cursor-not-allowed gap-0 p-0 opacity-50 hover:bg-transparent max-sm:cursor-pointer"
                                >
                                    {rowContent}
                                    <span
                                        aria-hidden="true"
                                        className="flex w-10 shrink-0 items-center justify-center"
                                    >
                                        <ChevronRight className="invisible size-4" />
                                    </span>
                                </DropdownMenuItem>
                            )

                            if (isMobile || !disabledReason) {
                                return disabledRow
                            }

                            return (
                                <RetryMenuDisabledReasonTooltip
                                    key={model.id}
                                    reason={disabledReason}
                                >
                                    {disabledRow}
                                </RetryMenuDisabledReasonTooltip>
                            )
                        }

                        if (allowedEfforts.length === 0) {
                            return (
                                <DropdownMenuItem
                                    key={model.id}
                                    onSelect={(event) => {
                                        if (isModelDisabled) {
                                            event.preventDefault()
                                            return
                                        }
                                        handleSelect()
                                    }}
                                    className={cn(
                                        "group flex items-stretch gap-0 p-0",
                                        isModelDisabled &&
                                            "cursor-not-allowed opacity-50 hover:bg-transparent"
                                    )}
                                >
                                    {rowContent}
                                    <span
                                        aria-hidden="true"
                                        className="flex w-10 shrink-0 items-center justify-center"
                                    >
                                        <ChevronRight className="invisible size-4" />
                                    </span>
                                </DropdownMenuItem>
                            )
                        }

                        return (
                            <div key={model.id} className="flex w-full items-stretch">
                                <DropdownMenuItem
                                    onSelect={(event) => {
                                        if (isModelDisabled || defaultRetryEffort === null) {
                                            event.preventDefault()
                                            return
                                        }
                                        handleSelect(defaultRetryEffort ?? undefined)
                                    }}
                                    className={cn(
                                        "group min-w-0 flex-1 p-0",
                                        isModelDisabled &&
                                            "cursor-not-allowed opacity-50 hover:bg-transparent"
                                    )}
                                >
                                    {rowContent}
                                </DropdownMenuItem>
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger
                                        disabled={isModelDisabled}
                                        className={cn(
                                            "w-10 shrink-0 self-stretch px-3 py-0 [&>svg]:m-0",
                                            isModelDisabled && "cursor-not-allowed opacity-50"
                                        )}
                                    >
                                        <span className="sr-only">Reasoning options</span>
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuPortal>
                                        <DropdownMenuSubContent
                                            sideOffset={8}
                                            collisionPadding={16}
                                            className="max-sm:!ml-0 w-fit min-w-[10.5rem] max-w-[12rem] rounded-[var(--radius-lg)] max-sm:w-[min(12rem,calc(100dvw-2rem))] max-sm:min-w-0"
                                        >
                                            {(() => {
                                                const effortItems = allowedEfforts.map((effort) => {
                                                    const requiredPlan =
                                                        sharedModel !== null
                                                            ? getRequiredPlanToPickModel(
                                                                  sharedModel,
                                                                  effort
                                                              )
                                                            : null
                                                    return {
                                                        effort,
                                                        isEffortLocked:
                                                            creditPlan === "free" &&
                                                            requiredPlan === "pro",
                                                        requiredPlan
                                                    }
                                                })
                                                const firstProIndex = effortItems.findIndex(
                                                    ({ requiredPlan }) => requiredPlan === "pro"
                                                )
                                                const shouldShowProDivider =
                                                    effortItems.length >= 3 && firstProIndex > 0

                                                return effortItems.map(
                                                    ({ effort, isEffortLocked }, index) => {
                                                        const EffortIcon = getReasoningEffortIcon(
                                                            effort,
                                                            sharedModel
                                                        )

                                                        return (
                                                            <React.Fragment key={effort}>
                                                                {shouldShowProDivider &&
                                                                    firstProIndex === index && (
                                                                        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-2 py-1.5">
                                                                            <div className="h-px flex-1 bg-border" />
                                                                            <span className="flex items-center gap-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                                                                <Crown className="size-3 shrink-0" />
                                                                                <span>Pro</span>
                                                                            </span>
                                                                            <div className="h-px flex-1 bg-border" />
                                                                        </div>
                                                                    )}
                                                                <DropdownMenuItem
                                                                    disabled={isEffortLocked}
                                                                    onClick={() =>
                                                                        handleSelect(effort)
                                                                    }
                                                                    className="cursor-pointer gap-2"
                                                                >
                                                                    <EffortIcon className="size-4 shrink-0" />
                                                                    <span className="flex-1">
                                                                        {getReasoningEffortLabelForModel(
                                                                            sharedModel,
                                                                            effort
                                                                        )}
                                                                    </span>
                                                                    {effort ===
                                                                        defaultRetryEffort && (
                                                                        <span className="ml-1.5 text-muted-foreground/80 text-xs">
                                                                            (default)
                                                                        </span>
                                                                    )}
                                                                    {isEffortLocked && (
                                                                        <Badge
                                                                            variant="secondary"
                                                                            className="border border-border/70 text-[0.625rem] uppercase tracking-wide"
                                                                        >
                                                                            Pro
                                                                        </Badge>
                                                                    )}
                                                                </DropdownMenuItem>
                                                            </React.Fragment>
                                                        )
                                                    }
                                                )
                                            })()}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuPortal>
                                </DropdownMenuSub>
                            </div>
                        )
                    }

                    return (
                        <DropdownMenuSub key={section.id}>
                            <DropdownMenuSubTrigger className="cursor-pointer px-3 py-2">
                                <div className="flex items-center gap-4 pr-8">
                                    <span className="flex size-4 shrink-0 items-center justify-center">
                                        {getProviderSectionIcon(
                                            section.id,
                                            section.models,
                                            "size-4"
                                        )}
                                    </span>
                                    <span>{section.label}</span>
                                </div>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                                <RetrySubmenuContent
                                    alignToMobileViewport
                                    sideOffset={8}
                                    className="mb-2 w-max max-w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] max-sm:mx-2 max-sm:w-[min(22rem,calc(100dvw-2rem))] max-sm:max-w-[calc(100dvw-2rem)]"
                                >
                                    {visibleModels.map(renderModel)}
                                    {hiddenLegacyModels.length > 0 && (
                                        <Accordion type="single" collapsible className="w-full">
                                            <AccordionItem value="legacy" className="border-none">
                                                <AccordionTrigger className="px-3 py-2 text-muted-foreground hover:no-underline data-[state=open]:hidden">
                                                    <span className="flex items-center gap-4">
                                                        <Archive className="size-4" />
                                                        <span>Show legacy models</span>
                                                    </span>
                                                </AccordionTrigger>
                                                <AccordionContent className="px-0 pb-0">
                                                    {hiddenLegacyModels.map(renderModel)}
                                                </AccordionContent>
                                            </AccordionItem>
                                        </Accordion>
                                    )}
                                </RetrySubmenuContent>
                            </DropdownMenuPortal>
                        </DropdownMenuSub>
                    )
                })}
            </DropdownMenuContent>
            {isMobile && (
                <ResponsivePopover
                    open={mobileDisabledReason !== null}
                    onOpenChange={(open) => {
                        if (!open) setMobileDisabledReason(null)
                    }}
                    nested
                >
                    <ResponsivePopoverContent
                        className="z-[91] mx-auto w-[min(22rem,calc(100dvw-2rem))] rounded-[var(--radius-lg)] border border-border bg-popover text-popover-foreground"
                        overlayClassName="z-[90]"
                        title="Why this model is unavailable"
                    >
                        <p className="px-4 pb-4 text-muted-foreground text-sm">
                            {mobileDisabledReason}
                        </p>
                    </ResponsivePopoverContent>
                </ResponsivePopover>
            )}
        </DropdownMenu>
    )
}
import { useCurrentUserSettings } from "@/hooks/use-current-user-settings"
