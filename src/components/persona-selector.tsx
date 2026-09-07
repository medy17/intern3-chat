import { MemoizedMarkdown } from "@/components/memoized-markdown"
import { getProviderIcon } from "@/components/model-selector"
import { PersonaAvatar, getPersonaAvatarSrc } from "@/components/persona-avatar"
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useSession } from "@/hooks/auth-hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAvatarAccent } from "@/hooks/use-avatar-accent"
import {
    notifyModelReplacement,
    resolveAvailableModelReplacement
} from "@/hooks/use-model-lifecycle-migration"
import { useChatStore } from "@/lib/chat-store"
import { useDiskCachedQuery } from "@/lib/convex-cached-query"
import { getFavoriteToggleAction } from "@/lib/model-favorites"
import { useModelStore } from "@/lib/model-store"
import { useAvailableModels } from "@/lib/models-providers-shared"
import { clearPersonaOnboardingHandoff } from "@/lib/persona-onboarding"
import { SYNTHETIC_PERSONA_OPENING_ID } from "@/lib/personas/builtins"
import {
    PERSONA_FAVORITES_SECTION_ID,
    getDefaultFavoritePersonaKeys,
    getFavoritePersonaKeysByRecentlyAdded,
    getPersonaFavoritesStorageKey,
    reconcileFavoritePersonaKeys,
    resolveFavoritePersonaKeys
} from "@/lib/persona-favorites"
import { useSharedModels } from "@/lib/shared-models"
import { cn } from "@/lib/utils"
import { useConvexAuth } from "@convex-dev/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import {
    Bot,
    CheckCircle,
    ChevronDown,
    CircleHelp,
    MessageCircle,
    MessagesSquare,
    Plus,
    Reply,
    Search,
    Sparkles,
    Star,
    UserRound
} from "lucide-react"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import { nanoid } from "nanoid"
import type { CSSProperties, ReactNode } from "react"
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import "./persona-selector.css"

type PersonaOption = {
    source: "builtin" | "user"
    id: string
    name: string
    shortName: string
    description: string
    conversationStarters: string[]
    openings?: Array<{
        id: string
        text: string
        suggestedReplies: string[]
    }>
    defaultModelId: string
    avatarKind?: "builtin" | "r2"
    avatarValue?: string
    avatarMimeType?: string
}

const getSelectValue = (source: "default" | "builtin" | "user", id?: string) =>
    source === "default" ? "default" : `${source}:${id}`

const personaChromeTransition = {
    duration: 0.2,
    ease: [0.16, 1, 0.3, 1]
} as const
const PERSONA_PICKER_REVALIDATION_DELAY_MS = 240
const PERSONA_TOOLBAR_SAFETY_SPACE_PX = 24
const PERSONA_DESCRIPTION_PREVIEW_LENGTH = 68
const DEFAULT_PERSONA_DESCRIPTION =
    "Silkchat’s standard assistant—adaptable, helpful, and without a fixed character."

const getPersonaDescriptionPreview = (description: string) =>
    description.length > PERSONA_DESCRIPTION_PREVIEW_LENGTH
        ? `${description.slice(0, PERSONA_DESCRIPTION_PREVIEW_LENGTH - 1).trimEnd()}…`
        : description

function PersonaPickerCard({
    persona,
    modelName,
    selected,
    isFavorite,
    onToggleFavorite,
    onSelect
}: {
    persona: PersonaOption
    modelName: string
    selected: boolean
    isFavorite: boolean
    onToggleFavorite: (personaKey: string) => void
    onSelect: () => void
}) {
    const isMobile = useIsMobile()
    const cardRef = useRef<HTMLDivElement>(null)
    const [isSelectedVisible, setIsSelectedVisible] = useState(false)

    useEffect(() => {
        if (!selected) {
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
    }, [selected])

    return (
        <div
            ref={cardRef}
            className={cn(
                "relative flex w-full items-start gap-3 rounded-[var(--radius-xl)] border bg-background/60 p-3 text-left outline-none transition-colors hover:border-accent hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-ring",
                isMobile && "border-input",
                selected && "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/10 ring-inset"
            )}
        >
            {selected && (
                <div
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--radius-xl)]"
                    data-selected-persona-orbit-visible={isSelectedVisible}
                    aria-hidden="true"
                >
                    <div className="absolute inset-px overflow-hidden rounded-[calc(var(--radius-xl)-1px)]">
                        <div className="selected-persona-orbit-laser" />
                        <div className="selected-persona-orbit-laser selected-persona-orbit-laser-mirror" />
                    </div>
                    <div className="absolute inset-1 rounded-[var(--radius-lg)] border border-primary/25" />
                </div>
            )}
            <button
                type="button"
                aria-pressed={selected}
                onClick={onSelect}
                className="relative z-10 flex w-0 min-w-0 flex-1 items-start gap-3 text-left outline-none"
            >
                <PersonaAvatar
                    name={persona.name}
                    avatarKind={persona.avatarKind}
                    avatarValue={persona.avatarValue}
                    className="size-11 shrink-0"
                />
                <span className="w-0 min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2 pr-7">
                        <span className="truncate font-medium text-sm sm:text-base">
                            {persona.name}
                        </span>
                    </span>
                    <span
                        className="mt-1 block truncate pr-20 text-muted-foreground text-xs leading-5 sm:text-sm"
                        aria-label={persona.description}
                    >
                        {getPersonaDescriptionPreview(persona.description)}
                    </span>
                </span>
            </button>
            {selected && <CheckCircle className="absolute top-3 right-3 size-4 text-primary" />}
            <div className="absolute right-3 bottom-3 z-20 flex items-center gap-1">
                <PersonaFavoriteToggle
                    persona={persona}
                    isFavorite={isFavorite}
                    onToggleFavorite={onToggleFavorite}
                    useToastConfirmation={isMobile}
                />
                <PersonaInfoFlyout persona={persona} modelName={modelName} />
            </div>
        </div>
    )
}

function PersonaFavoriteToggle({
    persona,
    isFavorite,
    onToggleFavorite,
    useToastConfirmation = false
}: {
    persona: PersonaOption
    isFavorite: boolean
    onToggleFavorite: (personaKey: string) => void
    useToastConfirmation?: boolean
}) {
    const [isRemovalArmed, setIsRemovalArmed] = useState(false)
    const [tooltipOpen, setTooltipOpen] = useState(false)
    const resetTimerRef = useRef<number | null>(null)
    const personaKey = getSelectValue(persona.source, persona.id)
    const confirmationToastId = `persona-favorite-removal:${personaKey}`

    const clearRemovalTimer = useCallback(() => {
        if (resetTimerRef.current !== null) {
            window.clearTimeout(resetTimerRef.current)
            resetTimerRef.current = null
        }
    }, [])

    const resetRemoval = useCallback(() => {
        clearRemovalTimer()
        setIsRemovalArmed(false)
        setTooltipOpen(false)
    }, [clearRemovalTimer])

    useEffect(() => clearRemovalTimer, [clearRemovalTimer])
    useEffect(() => {
        if (!isFavorite) resetRemoval()
    }, [isFavorite, resetRemoval])

    const handleToggle = () => {
        const action = getFavoriteToggleAction({ isFavorite, isRemovalArmed })
        if (action === "arm-removal") {
            setIsRemovalArmed(true)
            setTooltipOpen(true)
            if (useToastConfirmation) {
                toast("Tap again to remove from favorites", {
                    description: persona.name,
                    duration: 2500,
                    id: confirmationToastId
                })
            }
            resetTimerRef.current = window.setTimeout(resetRemoval, 2500)
            return
        }

        if (useToastConfirmation) toast.dismiss(confirmationToastId)
        resetRemoval()
        onToggleFavorite(personaKey)
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
                            ? `Confirm removal of ${persona.name} from favorites`
                            : isFavorite
                              ? `Remove ${persona.name} from favorites`
                              : `Add ${persona.name} to favorites`
                    }
                    aria-pressed={isFavorite}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={handleToggle}
                >
                    <Star className={cn("size-4", isFavorite && "fill-primary text-primary")} />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="z-[90]">
                {isRemovalArmed
                    ? "Click again to confirm"
                    : isFavorite
                      ? "Tap to Remove"
                      : "Add to favorites"}
            </TooltipContent>
        </Tooltip>
    )
}

function PersonaDetailPanel({ persona, modelName }: { persona: PersonaOption; modelName: string }) {
    const isMobile = useIsMobile()
    const { models: sharedModels } = useSharedModels()
    const defaultModel = sharedModels.find((model) => model.id === persona.defaultModelId)
    const avatarAccent = useAvatarAccent(
        getPersonaAvatarSrc(persona.avatarKind, persona.avatarValue)
    )
    const accentStyle = {
        "--persona-detail-accent": avatarAccent,
        borderColor: "color-mix(in oklab, var(--persona-detail-accent) 24%, var(--border))"
    } as CSSProperties
    const opening = persona.openings?.[0]
    const authoredOpening = opening?.id === SYNTHETIC_PERSONA_OPENING_ID ? undefined : opening
    const suggestedReplies =
        opening?.suggestedReplies.filter(
            (reply) => !persona.conversationStarters.includes(reply)
        ) ?? []
    const portraitHeader = (
        <div
            className="grid h-[7.75rem] grid-cols-[7.75rem_minmax(0,1fr)] overflow-hidden rounded-[var(--radius-xl)] border bg-background/60"
            style={accentStyle}
        >
            <PersonaAvatar
                name={persona.name}
                avatarKind={persona.avatarKind}
                avatarValue={persona.avatarValue}
                rounded="none"
                className="size-[7.75rem] rounded-none border-0 border-border/70 border-r shadow-none"
            />
            <div className="flex min-w-0 flex-col justify-center px-4 py-3">
                {isMobile ? (
                    <DrawerTitle className="truncate text-xl">{persona.name}</DrawerTitle>
                ) : (
                    <h3 className="truncate font-semibold text-xl">{persona.name}</h3>
                )}
                <p
                    className="mt-1.5 line-clamp-3 text-foreground/75 text-sm leading-5"
                    aria-label={persona.description}
                >
                    {persona.description}
                </p>
            </div>
        </div>
    )

    return (
        <div className="flex h-full min-h-0 flex-col bg-background">
            {isMobile ? (
                <DrawerHeader className="shrink-0 pb-0 text-left">{portraitHeader}</DrawerHeader>
            ) : (
                <div className="shrink-0 p-5 pb-0">{portraitHeader}</div>
            )}

            <ScrollArea className="min-h-0 flex-1">
                <div className={cn("space-y-5 pb-5", isMobile ? "px-4 pt-5" : "px-5 pt-6")}>
                    <section className="flex flex-wrap gap-2">
                        <div
                            className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--chart-2)_28%,transparent)] bg-[color-mix(in_oklab,var(--chart-2)_12%,transparent)] px-3 py-1.5 text-[color-mix(in_oklab,var(--chart-2)_72%,var(--foreground))] text-sm"
                            title={modelName}
                        >
                            <span className="shrink-0">
                                {defaultModel ? (
                                    getProviderIcon(defaultModel, false)
                                ) : (
                                    <Bot className="size-4" />
                                )}
                            </span>
                            <span className="truncate">{modelName}</span>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--chart-3)_28%,transparent)] bg-[color-mix(in_oklab,var(--chart-3)_12%,transparent)] px-3 py-1.5 text-[color-mix(in_oklab,var(--chart-3)_72%,var(--foreground))] text-sm">
                            <MessagesSquare className="size-4 shrink-0" />
                            <span>
                                {persona.conversationStarters.length}{" "}
                                {persona.conversationStarters.length === 1 ? "starter" : "starters"}
                            </span>
                        </div>
                    </section>

                    {authoredOpening?.text && (
                        <section className="overflow-hidden rounded-[var(--radius-xl)] border border-[color-mix(in_oklab,var(--chart-1)_30%,var(--border))] bg-background/60 p-3">
                            <div className="flex items-center gap-3">
                                <div className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--chart-1)_26%,transparent)] bg-[color-mix(in_oklab,var(--chart-1)_14%,transparent)] text-[var(--chart-1)]">
                                    <MessageCircle className="size-4" />
                                </div>
                                <h4 className="font-semibold text-foreground text-sm">
                                    Opening line
                                </h4>
                            </div>
                            <div className="persona-detail-markdown mt-2.5 px-1 pb-1 text-foreground/90 text-sm leading-6">
                                <MemoizedMarkdown content={authoredOpening.text} />
                            </div>
                        </section>
                    )}

                    {persona.conversationStarters.length > 0 && (
                        <section>
                            <div className="flex items-center gap-3">
                                <div className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--chart-2)_26%,transparent)] bg-[color-mix(in_oklab,var(--chart-2)_14%,transparent)] text-[var(--chart-2)]">
                                    <MessagesSquare className="size-4" />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-foreground text-sm">
                                        Conversation starters
                                    </h4>
                                    <p className="mt-0.5 text-foreground/65 text-xs">
                                        A few ways to begin
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3 overflow-hidden rounded-[var(--radius-xl)] border border-border bg-background/60">
                                {persona.conversationStarters.map((starter, index) => (
                                    <div
                                        key={starter}
                                        className="flex items-start gap-3 border-border border-b px-3 py-3 last:border-b-0"
                                    >
                                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--chart-2)_16%,var(--background))] font-semibold text-[var(--chart-2)] text-xs">
                                            {index + 1}
                                        </span>
                                        <div className="persona-detail-markdown min-w-0 pt-0.5 text-foreground/90 text-sm leading-5">
                                            <MemoizedMarkdown content={starter} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {suggestedReplies.length > 0 && (
                        <section>
                            <div className="flex items-center gap-3">
                                <div className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--chart-4)_26%,transparent)] bg-[color-mix(in_oklab,var(--chart-4)_14%,transparent)] text-[var(--chart-4)]">
                                    <Reply className="size-4" />
                                </div>
                                <h4 className="font-semibold text-foreground text-sm">
                                    Suggested replies
                                </h4>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {suggestedReplies.map((reply) => (
                                    <div
                                        key={reply}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--chart-4)_30%,var(--border))] bg-[color-mix(in_oklab,var(--chart-4)_10%,var(--background))] px-3 py-1.5 text-foreground/90 text-sm"
                                    >
                                        <Reply className="size-3 text-[var(--chart-4)]" />
                                        <div className="persona-detail-markdown min-w-0">
                                            <MemoizedMarkdown content={reply} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}

function PersonaInfoFlyout({ persona, modelName }: { persona: PersonaOption; modelName: string }) {
    const isMobile = useIsMobile()
    const [open, setOpen] = useState(false)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const wasOpenRef = useRef(false)

    useEffect(() => {
        if (!isMobile) {
            wasOpenRef.current = open
            return
        }

        if (wasOpenRef.current && !open) {
            requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }))
        }

        wasOpenRef.current = open
    }, [isMobile, open])

    const trigger = (
        <button
            ref={triggerRef}
            type="button"
            aria-label={`Show details for ${persona.name}`}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-secondary/50 text-muted-foreground transition-colors hover:text-foreground"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (isMobile) setOpen(true)
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
                    <PersonaDetailPanel persona={persona} modelName={modelName} />
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
                className="z-[90] w-[min(96vw,32rem)] overflow-hidden p-0 sm:w-[min(92vw,34rem)]"
            >
                <div className="flex h-[min(70vh,38rem)] min-h-0 flex-col overflow-hidden">
                    <PersonaDetailPanel persona={persona} modelName={modelName} />
                </div>
            </HoverCardContent>
        </HoverCard>
    )
}

function DefaultPersonaCard({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
    const isMobile = useIsMobile()
    const cardRef = useRef<HTMLDivElement>(null)
    const [isSelectedVisible, setIsSelectedVisible] = useState(false)

    useEffect(() => {
        if (!selected) {
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
    }, [selected])

    return (
        <div
            ref={cardRef}
            className={cn(
                "relative w-full rounded-[var(--radius-xl)] border bg-background/60 p-3 text-left transition-colors hover:border-accent hover:bg-accent/10",
                isMobile && "border-input",
                selected && "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/10 ring-inset"
            )}
        >
            {selected && (
                <div
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--radius-xl)]"
                    data-selected-persona-orbit-visible={isSelectedVisible}
                    aria-hidden="true"
                >
                    <div className="absolute inset-px overflow-hidden rounded-[calc(var(--radius-xl)-1px)]">
                        <div className="selected-persona-orbit-laser" />
                        <div className="selected-persona-orbit-laser selected-persona-orbit-laser-mirror" />
                    </div>
                    <div className="absolute inset-1 rounded-[var(--radius-lg)] border border-primary/25" />
                </div>
            )}
            <button
                type="button"
                aria-pressed={selected}
                onClick={onSelect}
                className="relative z-10 flex w-0 min-w-0 flex-1 items-start gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-xl)] border border-foreground/10 bg-secondary text-muted-foreground shadow-inner">
                    <Sparkles className="size-5" />
                </span>
                <span className="w-0 min-w-0 flex-1 pr-7">
                    <span className="font-medium text-sm sm:text-base">Default</span>
                    <span
                        className="mt-1 block truncate text-muted-foreground text-xs leading-5 sm:text-sm"
                        aria-label={DEFAULT_PERSONA_DESCRIPTION}
                    >
                        {getPersonaDescriptionPreview(DEFAULT_PERSONA_DESCRIPTION)}
                    </span>
                </span>
            </button>
            {selected && <CheckCircle className="absolute top-3 right-3 size-4 text-primary" />}
        </div>
    )
}

function PersonaPickerSection({
    personas,
    selectedValue,
    favoritePersonaKeys,
    modelNamesById,
    onToggleFavorite,
    onSelect
}: {
    personas: PersonaOption[]
    selectedValue: string
    favoritePersonaKeys: string[]
    modelNamesById: Map<string, string>
    onToggleFavorite: (personaKey: string) => void
    onSelect: (persona: PersonaOption) => void
}) {
    return (
        <div className="grid gap-2 pb-3">
            {personas.map((persona) => {
                const personaKey = getSelectValue(persona.source, persona.id)
                return (
                    <PersonaPickerCard
                        key={personaKey}
                        persona={persona}
                        modelName={
                            modelNamesById.get(persona.defaultModelId) ?? persona.defaultModelId
                        }
                        selected={selectedValue === personaKey}
                        isFavorite={favoritePersonaKeys.includes(personaKey)}
                        onToggleFavorite={onToggleFavorite}
                        onSelect={() => onSelect(persona)}
                    />
                )
            })}
        </div>
    )
}

function PersonaPicker({
    isMobile,
    open,
    onOpenChange,
    desktopAlignOffset,
    desktopPopoverWidth,
    trigger,
    children
}: {
    isMobile: boolean
    open: boolean
    onOpenChange: (open: boolean) => void
    desktopAlignOffset: number
    desktopPopoverWidth: number | null
    trigger: ReactNode
    children: ReactNode
}) {
    if (isMobile) {
        return (
            <>
                {trigger}
                <Drawer open={open} onOpenChange={onOpenChange} nested>
                    <DrawerContent
                        className="z-[81] flex h-[85dvh] max-h-[85dvh] flex-col gap-0 overflow-hidden bg-background p-0"
                        overlayClassName="z-[80]"
                    >
                        <DrawerTitle className="sr-only">Choose a persona</DrawerTitle>
                        <div className="flex min-h-0 flex-1 flex-col pt-2">{children}</div>
                    </DrawerContent>
                </Drawer>
            </>
        )
    }

    return (
        <ResponsivePopover open={open} onOpenChange={onOpenChange}>
            <ResponsivePopoverTrigger asChild>{trigger}</ResponsivePopoverTrigger>
            <ResponsivePopoverContent
                align="start"
                side="top"
                sideOffset={6}
                alignOffset={desktopAlignOffset}
                collisionPadding={8}
                className="z-[80] flex h-[min(38rem,var(--radix-popover-content-available-height))] w-[min(92vw,42.5rem)] flex-col overflow-hidden rounded-[var(--radius-lg)] border-border/70 bg-popover p-0 shadow-lg"
                style={{
                    ...(desktopPopoverWidth
                        ? {
                              width: `${desktopPopoverWidth}px`,
                              maxWidth: "92vw"
                          }
                        : {}),
                    maxHeight: "var(--radix-popover-content-available-height)"
                }}
            >
                {children}
            </ResponsivePopoverContent>
        </ResponsivePopover>
    )
}

export function PersonaSelector({
    threadId,
    open: controlledOpen,
    onOpenChange
}: {
    threadId?: string
    open?: boolean
    onOpenChange?: (open: boolean) => void
}) {
    const session = useSession()
    const auth = useConvexAuth()
    const navigate = useNavigate()
    const isMobile = useIsMobile()
    const [internalOpen, setInternalOpen] = useState(false)
    const isPickerOpen = controlledOpen ?? internalOpen
    const setIsPickerOpen = useCallback(
        (nextOpen: boolean) => {
            if (controlledOpen === undefined) setInternalOpen(nextOpen)
            onOpenChange?.(nextOpen)
        },
        [controlledOpen, onOpenChange]
    )
    const [searchValue, setSearchValue] = useState("")
    const [canRevalidatePickerOptions, setCanRevalidatePickerOptions] = useState(true)
    const [useShortLabel, setUseShortLabel] = useState(false)
    const selectorRootRef = useRef<HTMLDivElement>(null)
    const pickerTriggerRef = useRef<HTMLSpanElement>(null)
    const fullLabelMeasureRef = useRef<HTMLSpanElement>(null)
    const shortLabelMeasureRef = useRef<HTMLSpanElement>(null)
    const [desktopAlignOffset, setDesktopAlignOffset] = useState(0)
    const [desktopPopoverWidth, setDesktopPopoverWidth] = useState<number | null>(null)
    const [favoritePersonaKeys, setFavoritePersonaKeys] = useState<string[]>([])
    const [loadedFavoritesKey, setLoadedFavoritesKey] = useState<string | null>(null)
    const [activeSection, setActiveSection] = useState<"favorites" | "builtin" | "user">(
        "favorites"
    )
    const personaRailLayoutGroupId = useId()
    const { selectedModel, setSelectedModel } = useModelStore()
    const { selectedPersona, setSelectedPersona, setPendingPersonaOpening } = useChatStore()
    const thread = useQuery(
        api.threads.getThread,
        threadId && session.user?.id && !auth.isLoading
            ? { threadId: threadId as Id<"threads"> }
            : "skip"
    )
    useEffect(() => {
        if (!isPickerOpen) {
            setCanRevalidatePickerOptions(true)
            setSearchValue("")
            setActiveSection("favorites")
            return
        }

        setCanRevalidatePickerOptions(false)
        const timeoutId = window.setTimeout(() => {
            setCanRevalidatePickerOptions(true)
        }, PERSONA_PICKER_REVALIDATION_DELAY_MS)

        return () => window.clearTimeout(timeoutId)
    }, [isPickerOpen])

    const pickerOptions = useDiskCachedQuery(
        api.personas.listPersonaPickerOptions,
        {
            key: "persona-picker-options",
            default: { builtIns: [], userPersonas: [] },
            forceCache: true
        },
        session.user?.id && !auth.isLoading && canRevalidatePickerOptions ? {} : "skip"
    )
    const userSettings = useCurrentUserSettings(session.user?.id, auth.isLoading)
    const resolvedPickerOptions = "error" in pickerOptions ? null : pickerOptions
    const { availableModels } = useAvailableModels(
        "error" in userSettings ? undefined : userSettings
    )
    const { models: sharedModels } = useSharedModels()
    const availableModelIds = useMemo(
        () => new Set(availableModels.map((model) => model.id)),
        [availableModels]
    )

    const allOptions = useMemo<PersonaOption[]>(() => {
        if (!resolvedPickerOptions) return []
        return [...resolvedPickerOptions.builtIns, ...resolvedPickerOptions.userPersonas]
    }, [resolvedPickerOptions])
    const defaultFavoritePersonaKeys = useMemo(
        () =>
            getDefaultFavoritePersonaKeys(
                (resolvedPickerOptions?.userPersonas ?? []).map((persona) =>
                    getSelectValue("user", persona.id)
                )
            ),
        [resolvedPickerOptions]
    )
    const favoritesStorageKey = session.user?.id
        ? getPersonaFavoritesStorageKey(session.user.id)
        : null

    useEffect(() => {
        if (!favoritesStorageKey) {
            setFavoritePersonaKeys([])
            setLoadedFavoritesKey(null)
            return
        }

        let storedValue: string | null = null
        try {
            storedValue = window.localStorage.getItem(favoritesStorageKey)
        } catch {}

        setFavoritePersonaKeys(resolveFavoritePersonaKeys(storedValue, defaultFavoritePersonaKeys))
        setLoadedFavoritesKey(favoritesStorageKey)
    }, [defaultFavoritePersonaKeys, favoritesStorageKey])

    useEffect(() => {
        if (
            !favoritesStorageKey ||
            loadedFavoritesKey !== favoritesStorageKey ||
            allOptions.length === 0
        ) {
            return
        }

        const availablePersonaKeys = new Set(
            allOptions.map((persona) => getSelectValue(persona.source, persona.id))
        )
        setFavoritePersonaKeys((currentKeys) => {
            const reconciledKeys = reconcileFavoritePersonaKeys({
                favoritePersonaKeys: currentKeys,
                availablePersonaKeys
            })
            const unchanged =
                reconciledKeys.length === currentKeys.length &&
                reconciledKeys.every((key, index) => key === currentKeys[index])
            if (unchanged) return currentKeys

            try {
                window.localStorage.setItem(favoritesStorageKey, JSON.stringify(reconciledKeys))
            } catch {}
            return reconciledKeys
        })
    }, [allOptions, favoritesStorageKey, loadedFavoritesKey])

    const toggleFavorite = useCallback(
        (personaKey: string) => {
            setFavoritePersonaKeys((currentKeys) => {
                const nextKeys = currentKeys.includes(personaKey)
                    ? currentKeys.filter((key) => key !== personaKey)
                    : [...currentKeys, personaKey]

                if (favoritesStorageKey) {
                    try {
                        window.localStorage.setItem(favoritesStorageKey, JSON.stringify(nextKeys))
                    } catch {}
                }

                return nextKeys
            })
        },
        [favoritesStorageKey]
    )

    const modelNamesById = useMemo(() => {
        const models = [...sharedModels, ...availableModels]
        return new Map(models.map((model) => [model.id, model.name]))
    }, [availableModels, sharedModels])
    const filteredOptions = useMemo(() => {
        const query = searchValue.trim().toLocaleLowerCase()
        if (!query) return allOptions

        return allOptions.filter((persona) => {
            const modelName = modelNamesById.get(persona.defaultModelId) ?? persona.defaultModelId
            return [persona.name, persona.shortName, persona.description, modelName].some((value) =>
                value.toLocaleLowerCase().includes(query)
            )
        })
    }, [allOptions, modelNamesById, searchValue])

    const filteredBuiltIns = filteredOptions.filter((persona) => persona.source === "builtin")
    const filteredUserPersonas = filteredOptions.filter((persona) => persona.source === "user")
    const filteredOptionsByKey = new Map(
        filteredOptions.map((persona) => [getSelectValue(persona.source, persona.id), persona])
    )
    const filteredFavorites = getFavoritePersonaKeysByRecentlyAdded(favoritePersonaKeys).flatMap(
        (personaKey) => {
            const persona = filteredOptionsByKey.get(personaKey)
            return persona ? [persona] : []
        }
    )
    const visibleOptions =
        activeSection === "favorites"
            ? filteredFavorites
            : activeSection === "builtin"
              ? filteredBuiltIns
              : filteredUserPersonas
    const normalizedSearch = searchValue.trim().toLocaleLowerCase()
    const defaultMatchesSearch =
        !normalizedSearch ||
        "default standard adaptable helpful assistant".includes(normalizedSearch)
    const showDefaultOption = activeSection === "builtin" && defaultMatchesSearch

    const selectedValue = getSelectValue(selectedPersona.source, selectedPersona.id)

    const selectedOption = useMemo(
        () =>
            selectedPersona.source === "default"
                ? null
                : (allOptions.find(
                      (option) =>
                          option.source === selectedPersona.source &&
                          option.id === selectedPersona.id
                  ) ?? null),
        [allOptions, selectedPersona]
    )
    const selectedLabel = selectedOption
        ? isMobile || useShortLabel
            ? selectedOption.shortName
            : selectedOption.name
        : "Default"

    const updateSelectedLabelLength = useCallback(() => {
        const selectorRoot = selectorRootRef.current
        const toolbarGroup = selectorRoot?.parentElement
        const fullLabelWidth = fullLabelMeasureRef.current?.offsetWidth
        const shortLabelWidth = shortLabelMeasureRef.current?.offsetWidth

        if (!selectedOption || !selectorRoot || !toolbarGroup || !fullLabelWidth) {
            setUseShortLabel(false)
            return
        }

        const toolbarStyle = window.getComputedStyle(toolbarGroup)
        const gap = Number.parseFloat(toolbarStyle.columnGap || toolbarStyle.gap) || 0
        const toolbarChildren = Array.from(toolbarGroup.children)
        const occupiedWidth = toolbarChildren.reduce(
            (total, child) =>
                total +
                (child instanceof HTMLElement
                    ? child.offsetWidth
                    : child.getBoundingClientRect().width),
            gap * Math.max(0, toolbarChildren.length - 1)
        )
        const currentLabelWidth =
            isMobile || useShortLabel ? (shortLabelWidth ?? fullLabelWidth) : fullLabelWidth
        const fullLabelOccupiedWidth = occupiedWidth + fullLabelWidth - currentLabelWidth
        const hasRoomForFullLabel =
            fullLabelOccupiedWidth + PERSONA_TOOLBAR_SAFETY_SPACE_PX <= toolbarGroup.clientWidth

        setUseShortLabel(!hasRoomForFullLabel)
    }, [isMobile, selectedOption, useShortLabel])

    useLayoutEffect(() => {
        updateSelectedLabelLength()

        const selectorRoot = selectorRootRef.current
        const toolbarGroup = selectorRoot?.parentElement
        if (!toolbarGroup || typeof ResizeObserver === "undefined") return

        const observer = new ResizeObserver(updateSelectedLabelLength)
        observer.observe(toolbarGroup)
        for (const child of toolbarGroup.children) observer.observe(child)

        return () => observer.disconnect()
    }, [updateSelectedLabelLength])

    useLayoutEffect(() => {
        if (!isPickerOpen || isMobile) return

        const updateOffset = () => {
            const trigger = pickerTriggerRef.current
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
        const trigger = pickerTriggerRef.current
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
    }, [isMobile, isPickerOpen])

    const lockedPersonaName =
        threadId &&
        (thread?.personaName ??
            (thread === undefined && selectedOption
                ? isMobile
                    ? selectedOption.shortName
                    : selectedOption.name
                : null))
    const lockedAvatarKind =
        threadId &&
        (thread?.personaAvatarKind ??
            (thread === undefined && selectedOption ? selectedOption.avatarKind : undefined))
    const lockedAvatarValue =
        threadId &&
        (thread?.personaAvatarValue ??
            (thread === undefined && selectedOption ? selectedOption.avatarValue : undefined))

    const applyPersonaSelection = (option: PersonaOption) => {
        // Manual choice wins over any pending onboarding handoff.
        clearPersonaOnboardingHandoff()
        setSelectedPersona({ source: option.source, id: option.id })
        const opening = option.openings?.[0]
        setPendingPersonaOpening(
            opening
                ? {
                      source: option.source,
                      personaId: option.id,
                      openingId: opening.id,
                      messageId: nanoid(),
                      text: opening.text,
                      suggestedReplies: opening.suggestedReplies
                  }
                : undefined
        )

        const replacement = resolveAvailableModelReplacement({
            modelId: option.defaultModelId,
            sharedModels,
            availableModels
        })
        const targetModelId = availableModelIds.has(option.defaultModelId)
            ? option.defaultModelId
            : replacement.replacementId

        if (targetModelId && availableModelIds.has(targetModelId)) {
            if (selectedModel !== targetModelId) {
                setSelectedModel(targetModelId)
            }
            if (
                targetModelId !== option.defaultModelId &&
                replacement.originalModel &&
                replacement.replacement
            ) {
                notifyModelReplacement(replacement.originalModel, replacement.replacement)
            }
        } else {
            toast.warning(
                `${option.name} prefers ${option.defaultModelId}, but it is not currently available.`
            )
        }
    }

    const personaSections = [
        {
            id: PERSONA_FAVORITES_SECTION_ID as "favorites",
            label: "Favorites",
            icon: <Star className="size-4" />
        },
        {
            id: "builtin" as const,
            label: "Built-ins",
            icon: <Sparkles className="size-4" />
        },
        {
            id: "user" as const,
            label: "Custom",
            icon: <UserRound className="size-4" />
        }
    ]

    const personaList =
        showDefaultOption || visibleOptions.length > 0 ? (
            <div className="space-y-2 pb-3">
                {showDefaultOption && (
                    <DefaultPersonaCard
                        selected={selectedPersona.source === "default"}
                        onSelect={() => {
                            clearPersonaOnboardingHandoff()
                            setSelectedPersona({ source: "default" })
                            setPendingPersonaOpening(undefined)
                            setIsPickerOpen(false)
                        }}
                    />
                )}
                <PersonaPickerSection
                    personas={visibleOptions}
                    selectedValue={selectedValue}
                    favoritePersonaKeys={favoritePersonaKeys}
                    modelNamesById={modelNamesById}
                    onToggleFavorite={toggleFavorite}
                    onSelect={(persona) => {
                        applyPersonaSelection(persona)
                        setIsPickerOpen(false)
                    }}
                />
            </div>
        ) : (
            <div className="flex min-h-48 flex-1 items-center justify-center rounded-[var(--radius-xl)] border border-dashed px-6 text-center text-muted-foreground text-sm">
                {searchValue.trim()
                    ? "No personas match your search."
                    : activeSection === "favorites"
                      ? "Star personas in Built-ins or Custom to see them here."
                      : activeSection === "user"
                        ? "Create a persona to see it here."
                        : "No built-in personas are available."}
            </div>
        )

    return (
        <motion.div ref={selectorRootRef} layout className="shrink-0 overflow-hidden">
            {selectedOption && (
                <span
                    aria-hidden="true"
                    className="invisible fixed whitespace-nowrap @3xl:text-sm text-xs"
                >
                    <span ref={fullLabelMeasureRef}>{selectedOption.name}</span>
                    <span ref={shortLabelMeasureRef}>{selectedOption.shortName}</span>
                </span>
            )}
            <AnimatePresence initial={false} mode="popLayout">
                {!threadId ? (
                    <motion.div
                        key="persona-picker"
                        layout
                        initial={{ opacity: 0, x: -12, scale: 0.96 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -12, scale: 0.96 }}
                        transition={personaChromeTransition}
                    >
                        <PersonaPicker
                            isMobile={isMobile}
                            open={isPickerOpen}
                            onOpenChange={setIsPickerOpen}
                            desktopAlignOffset={desktopAlignOffset}
                            desktopPopoverWidth={desktopPopoverWidth}
                            trigger={
                                <span ref={pickerTriggerRef} className="inline-flex">
                                    <button
                                        type="button"
                                        className="flex h-8 min-w-0 items-center justify-between gap-0.5 rounded-[var(--radius-md)] border bg-secondary/70 px-1.5 @3xl:text-sm text-xs backdrop-blur-lg transition-colors hover:bg-secondary/80 min-[390px]:gap-2 min-[390px]:px-2"
                                        aria-label="Select persona"
                                        title="Select persona"
                                        onClick={() => {
                                            if (isMobile) setIsPickerOpen(true)
                                        }}
                                    >
                                        <div className="flex min-w-0 items-center gap-2">
                                            {selectedOption ? (
                                                <PersonaAvatar
                                                    name={selectedOption.name}
                                                    avatarKind={selectedOption.avatarKind}
                                                    avatarValue={selectedOption.avatarValue}
                                                    className="size-5"
                                                />
                                            ) : (
                                                <Sparkles className="size-4 shrink-0" />
                                            )}
                                            <span className="hidden whitespace-nowrap min-[390px]:block">
                                                {selectedLabel}
                                            </span>
                                        </div>
                                        <ChevronDown className="size-4 shrink-0 opacity-50" />
                                    </button>
                                </span>
                            }
                        >
                            <div className="flex min-h-0 flex-1 flex-col bg-background sm:bg-popover">
                                <div className="shrink-0 bg-background px-4 pt-3 pb-3 sm:bg-popover sm:p-3 sm:pb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="relative min-w-0 flex-1">
                                            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                value={searchValue}
                                                onChange={(event) =>
                                                    setSearchValue(event.target.value)
                                                }
                                                placeholder="Search personas..."
                                                className="h-10 border-0 bg-secondary/60 pl-9 shadow-none focus-visible:ring-2"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-secondary/60 px-3 font-medium text-foreground text-sm transition-colors hover:bg-secondary/80"
                                            onClick={() => {
                                                setIsPickerOpen(false)
                                                void navigate({ to: "/settings/personas" })
                                            }}
                                        >
                                            <Plus className="size-4" />
                                            <span className="hidden sm:inline">Create persona</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="grid min-h-0 flex-1 grid-cols-[3.5rem_minmax(0,1fr)] grid-rows-1 overflow-hidden md:grid-cols-[4rem_minmax(0,1fr)]">
                                    <div className="flex min-h-0 min-w-0 flex-col rounded-tr-[var(--radius-md)] border-t border-r bg-muted/50">
                                        <LayoutGroup id={personaRailLayoutGroupId}>
                                            <div
                                                className={cn(
                                                    "relative flex flex-col items-center gap-1",
                                                    isMobile ? "px-1 pt-3 pb-2" : "px-2 pt-3 pb-2"
                                                )}
                                            >
                                                {personaSections.map((section) => {
                                                    const isActive = activeSection === section.id
                                                    return (
                                                        <Tooltip key={section.id}>
                                                            <TooltipTrigger asChild>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setActiveSection(section.id)
                                                                    }
                                                                    className={cn(
                                                                        "relative isolate flex size-11 min-w-0 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-transparent bg-transparent p-0 text-left transition-colors",
                                                                        isActive
                                                                            ? "text-foreground"
                                                                            : "text-muted-foreground hover:bg-muted/50"
                                                                    )}
                                                                    aria-label={section.label}
                                                                >
                                                                    {isActive && (
                                                                        <motion.span
                                                                            aria-hidden="true"
                                                                            layoutId="persona-selector-section-indicator"
                                                                            className={cn(
                                                                                "pointer-events-none absolute inset-0 -z-10 rounded-[inherit] ring-1 ring-foreground/20 ring-inset",
                                                                                isMobile
                                                                                    ? "bg-background"
                                                                                    : "bg-popover"
                                                                            )}
                                                                            transition={{
                                                                                duration: 0.25,
                                                                                ease: [
                                                                                    0.16, 1, 0.3, 1
                                                                                ]
                                                                            }}
                                                                        />
                                                                    )}
                                                                    <span className="relative z-10 flex size-7 items-center justify-center rounded-[var(--radius-md)]">
                                                                        {section.icon}
                                                                    </span>
                                                                </button>
                                                            </TooltipTrigger>
                                                            <TooltipContent
                                                                side="left"
                                                                className="z-[90]"
                                                            >
                                                                {section.label}
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    )
                                                })}
                                            </div>
                                        </LayoutGroup>
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
                                                onTouchMoveCapture={(event) =>
                                                    event.stopPropagation()
                                                }
                                            >
                                                {personaList}
                                            </div>
                                        ) : (
                                            <ScrollArea className="min-h-0 flex-1 pr-1">
                                                {personaList}
                                            </ScrollArea>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </PersonaPicker>
                    </motion.div>
                ) : null}

                {lockedPersonaName ? (
                    <motion.div
                        key={`thread-persona:${lockedPersonaName}`}
                        layout
                        initial={{ opacity: 0, x: -12, scale: 0.96 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -12, scale: 0.96 }}
                        transition={personaChromeTransition}
                    >
                        <Badge
                            variant="secondary"
                            className="flex h-8 items-center gap-2 rounded-[var(--radius-md)] bg-secondary/70 px-2"
                            title="Thread persona"
                        >
                            {lockedAvatarKind && lockedAvatarValue ? (
                                <PersonaAvatar
                                    name={lockedPersonaName}
                                    avatarKind={lockedAvatarKind}
                                    avatarValue={lockedAvatarValue}
                                    className="size-5"
                                />
                            ) : (
                                <Sparkles className="size-4 shrink-0" />
                            )}
                            <span className="max-w-[8.75rem] truncate">{lockedPersonaName}</span>
                        </Badge>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </motion.div>
    )
}
import { useCurrentUserSettings } from "@/hooks/use-current-user-settings"
