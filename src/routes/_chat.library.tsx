import { useGenerationStore } from "@/components/library/generation-store"
import { ImageDetailsModal } from "@/components/library/image-details-modal"
import { ImageLoadIndicator } from "@/components/library/image-load-indicator"
import { usePrivateViewingStore } from "@/components/library/private-viewing-store"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger
} from "@/components/ui/context-menu"
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle
} from "@/components/ui/drawer"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { ImageSkeleton } from "@/components/ui/image-skeleton"
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious
} from "@/components/ui/pagination"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { useSession } from "@/hooks/auth-hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import {
    type GeneratedImageFilters,
    type GeneratedImageOrientation,
    hasActiveGeneratedImageFilters
} from "@/lib/generated-image-filters"
import {
    getExpandedImageUrl,
    getGeneratedImageCopyUrl,
    getGeneratedImageProxyUrl,
    getLibraryImageSources
} from "@/lib/generated-image-urls"
import {
    DEFAULT_LIBRARY_FILTERS,
    DEFAULT_LIBRARY_SEARCH,
    type ImageSortOption,
    type LibraryFiltersState,
    type LibrarySearchState,
    cloneLibraryFilters,
    getLibraryFiltersFromSearch,
    validateLibrarySearch
} from "@/lib/library-search"
import { getIsImageHidden } from "@/lib/private-viewing"
import { useSharedModels } from "@/lib/shared-models"
import { cn, copyImageUrlToClipboard } from "@/lib/utils"
import { createFileRoute, stripSearchParams, useNavigate } from "@tanstack/react-router"
import { useAction, useQuery } from "convex/react"
import {
    Check,
    CheckSquare2,
    ChevronDown,
    Clipboard,
    Copy,
    Download,
    ExternalLink,
    Eye,
    EyeOff,
    Filter,
    Image as ImageIcon,
    ImageOff,
    Trash2,
    X
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { type ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

export const Route = createFileRoute("/_chat/library")({
    validateSearch: validateLibrarySearch,
    search: {
        middlewares: [stripSearchParams(DEFAULT_LIBRARY_SEARCH)]
    },
    component: LibraryRouteComponent
})

const IMAGES_PER_PAGE = 50
type ImageLoadPlaceholder = "tiles" | "skeleton"

const ORIENTATION_LABELS: Record<GeneratedImageOrientation, string> = {
    landscape: "Landscape",
    portrait: "Portrait",
    square: "Square"
}

const appendRetryParam = (url: string, retryKey: number) =>
    retryKey > 0 ? `${url}${url.includes("?") ? "&" : "?"}retry=${retryKey}` : url

const appendRetryParamToSrcSet = (srcSet: string, retryKey: number) => {
    if (retryKey <= 0) return srcSet

    return srcSet
        .split(", ")
        .map((candidate) => {
            const descriptorIndex = candidate.lastIndexOf(" ")
            if (descriptorIndex === -1) {
                return appendRetryParam(candidate, retryKey)
            }

            const candidateUrl = candidate.slice(0, descriptorIndex)
            const descriptor = candidate.slice(descriptorIndex)
            return `${appendRetryParam(candidateUrl, retryKey)}${descriptor}`
        })
        .join(", ")
}

const toGeneratedImageFilters = (filters: LibraryFiltersState): GeneratedImageFilters => ({
    modelIds: filters.modelIds,
    resolutions: filters.resolutions,
    aspectRatios: filters.aspectRatios,
    orientations: filters.orientations
})

const getFilterButtonLabel = ({
    emptyLabel,
    selectedValues,
    optionLabels
}: {
    emptyLabel: string
    selectedValues: string[]
    optionLabels: Map<string, string>
}) => {
    if (selectedValues.length === 0) return emptyLabel
    if (selectedValues.length === 1) {
        return optionLabels.get(selectedValues[0]) ?? selectedValues[0]
    }

    return `${selectedValues.length} selected`
}

const toggleFilterValue = <T extends string>(values: T[], value: T) =>
    values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]

const countActiveLibraryFilters = (filters: LibraryFiltersState) =>
    filters.modelIds.length +
    filters.resolutions.length +
    filters.aspectRatios.length +
    filters.orientations.length

const areStringArraysEqual = (left: string[], right: string[]) =>
    left.length === right.length && left.every((value, index) => value === right[index])

const areLibraryFiltersEqual = (left: LibraryFiltersState, right: LibraryFiltersState) =>
    areStringArraysEqual(left.modelIds, right.modelIds) &&
    areStringArraysEqual(left.resolutions, right.resolutions) &&
    areStringArraysEqual(left.aspectRatios, right.aspectRatios) &&
    areStringArraysEqual(left.orientations, right.orientations)

const MOBILE_SORT_OPTIONS: Array<{ value: ImageSortOption; label: string }> = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" }
]

const MultiSelectFilter = ({
    label,
    emptyLabel,
    selectedValues,
    options,
    onToggleValue,
    onClear
}: {
    label: string
    emptyLabel: string
    selectedValues: string[]
    options: Array<{ value: string; label: string }>
    onToggleValue: (value: string) => void
    onClear: () => void
}) => {
    const optionLabelMap = useMemo(
        () => new Map(options.map((option) => [option.value, option.label])),
        [options]
    )

    return (
        <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs uppercase tracking-wider">{label}</span>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant={selectedValues.length > 0 ? "secondary" : "outline"}
                        className="w-full justify-between bg-background font-normal"
                    >
                        <span className="truncate">
                            {getFilterButtonLabel({
                                emptyLabel,
                                selectedValues,
                                optionLabels: optionLabelMap
                            })}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-60" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuLabel>{label}</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem
                        checked={selectedValues.length === 0}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={() => onClear()}
                    >
                        {emptyLabel}
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    {options.map((option) => (
                        <DropdownMenuCheckboxItem
                            key={option.value}
                            checked={selectedValues.includes(option.value)}
                            onSelect={(event) => event.preventDefault()}
                            onCheckedChange={() => onToggleValue(option.value)}
                        >
                            {option.label}
                        </DropdownMenuCheckboxItem>
                    ))}
                    {selectedValues.length > 0 && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onSelect={(event) => {
                                    event.preventDefault()
                                    onClear()
                                }}
                            >
                                Clear {label.toLowerCase()}
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}

const MobileFilterSection = ({
    title,
    action,
    children
}: {
    title: string
    action?: ReactNode
    children: ReactNode
}) => (
    <section className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
        <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-base">{title}</h3>
            {action}
        </div>
        {children}
    </section>
)

const MobileSortFilter = ({
    value,
    onChange
}: {
    value: ImageSortOption
    onChange: (value: ImageSortOption) => void
}) => (
    <MobileFilterSection title="Sort By">
        <RadioGroup value={value} onValueChange={(next) => onChange(next as ImageSortOption)}>
            {MOBILE_SORT_OPTIONS.map((option) => (
                <label
                    key={option.value}
                    htmlFor={`mobile-sort-${option.value}`}
                    className="flex items-center gap-3 py-1.5 text-sm"
                >
                    <RadioGroupItem id={`mobile-sort-${option.value}`} value={option.value} />
                    <span>{option.label}</span>
                </label>
            ))}
        </RadioGroup>
    </MobileFilterSection>
)

const MobileCheckboxFilter = ({
    title,
    selectedValues,
    options,
    onToggleValue,
    onClear
}: {
    title: string
    selectedValues: string[]
    options: Array<{ value: string; label: string }>
    onToggleValue: (value: string) => void
    onClear: () => void
}) => (
    <MobileFilterSection
        title={`${title}${selectedValues.length > 0 ? ` (${selectedValues.length})` : ""}`}
        action={
            selectedValues.length > 0 ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={onClear}
                >
                    Clear
                </Button>
            ) : undefined
        }
    >
        <div className="space-y-3">
            {options.map((option) => (
                <label
                    key={option.value}
                    htmlFor={`${title.toLowerCase().replace(/\s+/g, "-")}-${option.value}`}
                    className="flex items-center gap-3 py-1.5 text-sm"
                >
                    <Checkbox
                        id={`${title.toLowerCase().replace(/\s+/g, "-")}-${option.value}`}
                        checked={selectedValues.includes(option.value)}
                        onCheckedChange={() => onToggleValue(option.value)}
                    />
                    <span>{option.label}</span>
                </label>
            ))}
        </div>
    </MobileFilterSection>
)

const GalleryImageSkeleton = memo(() => (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-border/60 bg-muted/40">
        <div className="absolute inset-0 bg-gradient-to-br from-muted/90 via-muted/70 to-accent/50" />
        <div className="absolute inset-0 backdrop-blur-[1px]" />
        <div className="absolute inset-x-0 bottom-0 space-y-2 p-3">
            <Skeleton className="h-3 w-4/5 bg-background/70" />
            <Skeleton className="h-3 w-3/5 bg-background/55" />
        </div>
    </div>
))
GalleryImageSkeleton.displayName = "GalleryImageSkeleton"

const PendingImageItem = memo(({ aspectRatio }: { aspectRatio: string }) => {
    // Convert aspect ratio to CSS aspect-ratio value
    const cssAspectRatio = useMemo(() => {
        if (aspectRatio.includes("x")) {
            const [width, height] = aspectRatio.split("x").map(Number)
            return `${width}/${height}`
        }
        if (aspectRatio.includes(":")) {
            const baseRatio = aspectRatio.replace("-hd", "")
            return baseRatio.replace(":", "/")
        }
        return "1/1"
    }, [aspectRatio])

    // Calculate optimal rows and cols based on aspect ratio
    const { rows, cols } = useMemo(() => {
        const [widthRatio, heightRatio] = cssAspectRatio.split("/").map(Number)
        const baseSize = 20

        if (widthRatio >= heightRatio) {
            const calculatedCols = Math.round(baseSize * (widthRatio / heightRatio))
            return { rows: baseSize, cols: calculatedCols }
        }
        const calculatedRows = Math.round(baseSize * (heightRatio / widthRatio))
        return { rows: calculatedRows, cols: baseSize }
    }, [cssAspectRatio])

    return (
        <div
            className="group relative overflow-hidden rounded-lg border bg-background"
            style={{ aspectRatio: cssAspectRatio }}
        >
            <ImageSkeleton
                rows={rows}
                cols={cols}
                dotSize={3}
                gap={4}
                loadingDuration={99999}
                autoLoop={false}
                className="h-full w-full rounded-lg border-0 bg-transparent"
            />
        </div>
    )
})
PendingImageItem.displayName = "PendingImageItem"

const GeneratedImageItem = memo(
    ({
        image,
        onClick,
        placeholder = "skeleton",
        onImageSettled,
        onDelete,
        isSelected = false,
        isSelectionMode = false,
        onToggleSelection,
        onStartSelection,
        selectedCount = 0,
        onBulkDelete,
        onBulkDownload,
        isImageHidden = false,
        onToggleImageHidden
    }: {
        image: Doc<"generatedImages">
        onClick: () => void
        placeholder?: ImageLoadPlaceholder
        onImageSettled?: () => void
        onDelete?: () => void
        isSelected?: boolean
        isSelectionMode?: boolean
        onToggleSelection?: () => void
        onStartSelection?: () => void
        selectedCount?: number
        onBulkDelete?: () => void
        onBulkDownload?: () => void
        isImageHidden?: boolean
        onToggleImageHidden?: () => void
    }) => {
        const [isError, setIsError] = useState(false)
        const [blurVariantStatus, setBlurVariantStatus] = useState<
            "idle" | "loading" | "ready" | "error"
        >("idle")
        const [blurVariantRetryKey, setBlurVariantRetryKey] = useState(0)
        const [loadState, setLoadState] = useState<"loading" | "revealing" | "ready">("loading")
        const revealTimeoutRef = useRef<number | null>(null)
        const blurVariantRetryTimeoutRef = useRef<number | null>(null)
        const blurVariantRequestIdRef = useRef(0)
        const metadata = useQuery(api.attachments.getFileMetadata, { key: image.storageKey })
        const hasInvalidStoredImage =
            metadata !== undefined &&
            (!metadata || (typeof metadata.size === "number" && metadata.size <= 0))

        const visibleImageSources = getLibraryImageSources({
            storageKey: image.storageKey,
            aspectRatio: image.aspectRatio,
            hidden: false
        })

        const hiddenImageSources = getLibraryImageSources({
            storageKey: image.storageKey,
            aspectRatio: image.aspectRatio,
            hidden: true
        })
        const retriedHiddenImageSources = useMemo(
            () => ({
                ...hiddenImageSources,
                src: appendRetryParam(hiddenImageSources.src, blurVariantRetryKey),
                srcSet: appendRetryParamToSrcSet(hiddenImageSources.srcSet, blurVariantRetryKey)
            }),
            [blurVariantRetryKey, hiddenImageSources]
        )

        const clearBlurVariantRetryTimeout = useCallback(() => {
            if (blurVariantRetryTimeoutRef.current !== null) {
                window.clearTimeout(blurVariantRetryTimeoutRef.current)
                blurVariantRetryTimeoutRef.current = null
            }
        }, [])

        const retryBlurVariant = useCallback(() => {
            clearBlurVariantRetryTimeout()
            blurVariantRequestIdRef.current += 1
            setBlurVariantStatus("idle")
            setBlurVariantRetryKey((current) => current + 1)
        }, [clearBlurVariantRetryTimeout])

        const canUseBlurVariant = !hiddenImageSources.useCssBlurFallback
        const shouldMountBlurVariant =
            canUseBlurVariant &&
            (isImageHidden || blurVariantStatus === "loading" || blurVariantStatus === "ready")
        const useCssBlurFallback =
            isImageHidden && (!canUseBlurVariant || blurVariantStatus !== "ready")

        const handleImageLoad = useCallback(() => {
            setLoadState("revealing")

            if (revealTimeoutRef.current !== null) {
                window.clearTimeout(revealTimeoutRef.current)
            }

            revealTimeoutRef.current = window.setTimeout(() => {
                setLoadState("ready")
                onImageSettled?.()
                revealTimeoutRef.current = null
            }, 240)
        }, [onImageSettled])

        const handleImageError = useCallback(() => {
            setIsError(true)
            setLoadState("ready")
            onImageSettled?.()
        }, [onImageSettled])

        useEffect(() => {
            return () => {
                if (revealTimeoutRef.current !== null) {
                    window.clearTimeout(revealTimeoutRef.current)
                }

                clearBlurVariantRetryTimeout()
                blurVariantRequestIdRef.current += 1
            }
        }, [clearBlurVariantRetryTimeout])

        useEffect(() => {
            void image.storageKey
            clearBlurVariantRetryTimeout()
            blurVariantRequestIdRef.current += 1
            setBlurVariantStatus("idle")
            setBlurVariantRetryKey(0)
        }, [clearBlurVariantRetryTimeout, image.storageKey])

        useEffect(() => {
            if (!canUseBlurVariant || !isImageHidden || blurVariantStatus === "ready") {
                return
            }

            if (typeof window === "undefined") {
                return
            }

            const requestId = blurVariantRequestIdRef.current + 1
            blurVariantRequestIdRef.current = requestId
            setBlurVariantStatus("loading")

            const preloadImage = new window.Image()
            preloadImage.decoding = "async"
            preloadImage.src = retriedHiddenImageSources.src

            preloadImage.onload = () => {
                if (blurVariantRequestIdRef.current !== requestId) {
                    return
                }

                clearBlurVariantRetryTimeout()
                setBlurVariantStatus("ready")
            }

            preloadImage.onerror = () => {
                if (blurVariantRequestIdRef.current !== requestId) {
                    return
                }

                setBlurVariantStatus("error")
            }

            return () => {
                preloadImage.onload = null
                preloadImage.onerror = null
            }
        }, [
            blurVariantStatus,
            canUseBlurVariant,
            clearBlurVariantRetryTimeout,
            isImageHidden,
            retriedHiddenImageSources.src
        ])

        useEffect(() => {
            if (
                !canUseBlurVariant ||
                !isImageHidden ||
                blurVariantStatus !== "error" ||
                typeof window === "undefined" ||
                typeof document === "undefined"
            ) {
                return
            }

            const retryWhenInteractive = () => {
                if (document.visibilityState === "hidden") {
                    return
                }

                retryBlurVariant()
            }

            clearBlurVariantRetryTimeout()
            blurVariantRetryTimeoutRef.current = window.setTimeout(() => {
                retryWhenInteractive()
            }, 2500)

            window.addEventListener("focus", retryWhenInteractive)
            window.addEventListener("online", retryWhenInteractive)
            document.addEventListener("visibilitychange", retryWhenInteractive)

            return () => {
                clearBlurVariantRetryTimeout()
                window.removeEventListener("focus", retryWhenInteractive)
                window.removeEventListener("online", retryWhenInteractive)
                document.removeEventListener("visibilitychange", retryWhenInteractive)
            }
        }, [
            blurVariantStatus,
            canUseBlurVariant,
            clearBlurVariantRetryTimeout,
            isImageHidden,
            retryBlurVariant
        ])

        const aspectRatio = image.aspectRatio || "1:1"
        const cssAspectRatio = useMemo(() => {
            if (aspectRatio.includes("x")) {
                const [width, height] = aspectRatio.split("x").map(Number)
                return `${width}/${height}`
            }
            if (aspectRatio.includes(":")) {
                const baseRatio = aspectRatio.replace("-hd", "")
                return baseRatio.replace(":", "/")
            }
            return "1/1"
        }, [aspectRatio])

        const { rows, cols } = useMemo(() => {
            const [widthRatio, heightRatio] = cssAspectRatio.split("/").map(Number)
            const baseSize = 20
            if (widthRatio >= heightRatio) {
                const calculatedCols = Math.round(baseSize * (widthRatio / heightRatio))
                return { rows: baseSize, cols: calculatedCols }
            }
            const calculatedRows = Math.round(baseSize * (heightRatio / widthRatio))
            return { rows: calculatedRows, cols: baseSize }
        }, [cssAspectRatio])

        const sourceImageUrl = getGeneratedImageProxyUrl(image.storageKey)
        const copyImageUrl = getGeneratedImageCopyUrl(image.storageKey)
        const fullResolutionUrl = metadata?.url || sourceImageUrl

        const handleDownload = () => {
            window.open(fullResolutionUrl, "_blank")
        }

        const handleCopyImage = async () => {
            const copyPromise = copyImageUrlToClipboard(copyImageUrl)

            toast.promise(copyPromise, {
                loading: "Copying image...",
                success: "Image copied to clipboard",
                error: "Failed to copy image"
            })

            try {
                await copyPromise
            } catch (err) {
                console.error("Failed to copy image:", err)
            }
        }

        const handleCopyPrompt = () => {
            if (image.prompt) {
                navigator.clipboard.writeText(image.prompt)
                toast.success("Prompt copied to clipboard")
            }
        }

        const handleViewFullResolution = () => {
            window.open(fullResolutionUrl, "_blank")
        }

        const handleClick = (e: React.MouseEvent) => {
            if (isSelectionMode) {
                e.preventDefault()
                e.stopPropagation()
                onToggleSelection?.()
            } else {
                onClick()
            }
        }

        const handleToggleImageHidden = (e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            onToggleImageHidden?.()
        }

        if (isError || hasInvalidStoredImage) {
            return (
                <div
                    className="group relative overflow-hidden rounded-lg border bg-muted/50"
                    style={{ aspectRatio: cssAspectRatio }}
                >
                    <div className="flex h-full items-center justify-center">
                        <div className="text-center">
                            <ImageOff className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                            <p className="text-muted-foreground text-sm">
                                {hasInvalidStoredImage ? "Image unavailable" : "Failed to load"}
                            </p>
                        </div>
                    </div>
                </div>
            )
        }

        return (
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div
                        className={cn(
                            "group relative w-full overflow-hidden rounded-lg border bg-background transition-all",
                            isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        )}
                        style={{ aspectRatio: cssAspectRatio }}
                    >
                        <button
                            type="button"
                            className="absolute inset-0 z-30 appearance-none rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            onClick={handleClick}
                        >
                            <span className="sr-only">
                                {isSelectionMode ? "Select image" : "Open image details"}
                            </span>
                        </button>
                        {loadState !== "ready" && (
                            <div className="pointer-events-none absolute inset-0 z-10 bg-background">
                                {placeholder === "tiles" ? (
                                    <ImageSkeleton
                                        rows={rows}
                                        cols={cols}
                                        dotSize={3}
                                        gap={4}
                                        loadingDuration={99999}
                                        autoLoop={false}
                                        className="h-full w-full border-0 bg-transparent"
                                    />
                                ) : (
                                    <GalleryImageSkeleton />
                                )}
                            </div>
                        )}
                        {loadState !== "ready" && (
                            <ImageLoadIndicator complete={loadState === "revealing"} />
                        )}
                        {metadata && (
                            <div
                                className={cn(
                                    "absolute inset-0 overflow-hidden transition-transform duration-[1600ms] ease-out will-change-transform",
                                    loadState === "ready" && "group-hover:scale-[1.02]",
                                    loadState !== "ready" && "scale-100"
                                )}
                            >
                                <img
                                    src={visibleImageSources.src}
                                    srcSet={visibleImageSources.srcSet}
                                    sizes={visibleImageSources.sizes}
                                    alt={image.prompt || "AI generation"}
                                    className={cn(
                                        "absolute inset-0 h-full w-full object-cover transition-[opacity,filter] duration-300 ease-out",
                                        loadState === "loading" && "scale-[1.04] opacity-0 blur-xl",
                                        loadState === "revealing" &&
                                            "scale-[1.02] opacity-100 blur-md",
                                        loadState === "ready" && "scale-100 opacity-100 blur-0",
                                        isImageHidden &&
                                            blurVariantStatus === "ready" &&
                                            "opacity-0",
                                        useCssBlurFallback && "scale-[1.08] blur-2xl"
                                    )}
                                    onLoad={handleImageLoad}
                                    onError={handleImageError}
                                    loading="lazy"
                                />
                                {shouldMountBlurVariant && (
                                    <img
                                        key={`${image.storageKey}-${blurVariantRetryKey}`}
                                        src={retriedHiddenImageSources.src}
                                        alt=""
                                        aria-hidden="true"
                                        className={cn(
                                            "pointer-events-none absolute inset-0 h-full w-full object-cover brightness-70 saturate-[0.35] transition-opacity duration-300 ease-out",
                                            isImageHidden && blurVariantStatus === "ready"
                                                ? "opacity-100"
                                                : "opacity-0"
                                        )}
                                        onLoad={() => setBlurVariantStatus("ready")}
                                        loading="lazy"
                                    />
                                )}
                            </div>
                        )}
                        {isImageHidden && (
                            <div
                                className={cn(
                                    "pointer-events-none absolute inset-0 z-20 bg-black/20 transition-opacity duration-300",
                                    useCssBlurFallback && "backdrop-blur-[2px]"
                                )}
                            />
                        )}
                        <div
                            className={cn(
                                "pointer-events-none absolute inset-x-0 bottom-0 z-20 translate-y-2 bg-gradient-to-t from-black/50 to-transparent p-2 transition-all",
                                isImageHidden
                                    ? "translate-y-0 opacity-100"
                                    : "opacity-0 group-hover:translate-y-0 group-hover:opacity-100"
                            )}
                        >
                            <div className="relative min-h-[2rem] overflow-hidden text-white text-xs">
                                <p
                                    className={cn(
                                        "absolute inset-0 line-clamp-2 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
                                        isImageHidden
                                            ? "translate-y-[-35%] opacity-0"
                                            : "translate-y-0 opacity-100"
                                    )}
                                >
                                    {image.prompt ?? "No prompt"}
                                </p>
                                <p
                                    className={cn(
                                        "absolute inset-0 line-clamp-2 font-medium transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
                                        isImageHidden
                                            ? "translate-y-0 opacity-100"
                                            : "translate-y-[35%] opacity-0"
                                    )}
                                >
                                    Private viewing enabled
                                </p>
                                <span className="invisible line-clamp-2 block font-medium">
                                    Private viewing enabled
                                </span>
                            </div>
                        </div>
                        {onToggleImageHidden && (
                            <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className={cn(
                                    "absolute top-2 right-2 z-40 h-8 w-8 border border-white/15 bg-background/80 text-foreground shadow-lg backdrop-blur-md transition-all hover:bg-background",
                                    isImageHidden
                                        ? "opacity-100"
                                        : "pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                                )}
                                onClick={handleToggleImageHidden}
                            >
                                <span className="sr-only">
                                    {isImageHidden ? "Unhide image" : "Hide image"}
                                </span>
                                {isImageHidden ? (
                                    <Eye className="h-4 w-4" />
                                ) : (
                                    <EyeOff className="h-4 w-4" />
                                )}
                            </Button>
                        )}
                        {isSelectionMode && (
                            <div className="pointer-events-none absolute inset-0 z-30 transition-colors duration-200">
                                <div
                                    className={cn(
                                        "absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200",
                                        isSelected
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-white/70 bg-black/20 text-transparent"
                                    )}
                                >
                                    <Check
                                        className={cn(
                                            "h-3 w-3",
                                            isSelected ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                </div>
                                <div
                                    className={cn(
                                        "absolute inset-0 transition-colors duration-200",
                                        isSelected ? "bg-primary/10" : "group-hover:bg-black/10"
                                    )}
                                />
                            </div>
                        )}
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                    {onStartSelection && !isSelectionMode && (
                        <>
                            <ContextMenuItem onClick={onStartSelection}>
                                <CheckSquare2 className="mr-2 h-4 w-4" />
                                Select Images
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                        </>
                    )}

                    {isSelectionMode && selectedCount > 0 ? (
                        <>
                            {onBulkDownload && (
                                <ContextMenuItem onClick={onBulkDownload}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Save Selected
                                </ContextMenuItem>
                            )}
                            <ContextMenuSeparator />
                            {onBulkDelete && (
                                <ContextMenuItem
                                    onClick={onBulkDelete}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete Selected
                                </ContextMenuItem>
                            )}
                        </>
                    ) : (
                        <>
                            <ContextMenuItem onClick={handleDownload}>
                                <Download className="mr-2 h-4 w-4" />
                                Save Image
                            </ContextMenuItem>
                            <ContextMenuItem onClick={handleCopyImage}>
                                <Copy className="mr-2 h-4 w-4" />
                                Copy Image
                            </ContextMenuItem>
                            {image.prompt && (
                                <ContextMenuItem onClick={handleCopyPrompt}>
                                    <Clipboard className="mr-2 h-4 w-4" />
                                    Copy Prompt
                                </ContextMenuItem>
                            )}
                            {onToggleImageHidden && (
                                <ContextMenuItem onClick={onToggleImageHidden}>
                                    {isImageHidden ? (
                                        <Eye className="mr-2 h-4 w-4" />
                                    ) : (
                                        <EyeOff className="mr-2 h-4 w-4" />
                                    )}
                                    {isImageHidden ? "Unhide Image" : "Hide Image"}
                                </ContextMenuItem>
                            )}
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={handleViewFullResolution}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Open Full Resolution
                            </ContextMenuItem>
                            {onDelete && (
                                <>
                                    <ContextMenuSeparator />
                                    <ContextMenuItem
                                        onClick={onDelete}
                                        className="text-destructive focus:text-destructive"
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete Image
                                    </ContextMenuItem>
                                </>
                            )}
                        </>
                    )}
                </ContextMenuContent>
            </ContextMenu>
        )
    }
)
GeneratedImageItem.displayName = "GeneratedImageItem"

function LibraryRouteComponent() {
    const search = Route.useSearch()

    return <LibraryView search={search} />
}

export function LibraryView({ search }: { search: LibrarySearchState }) {
    const navigate = useNavigate({ from: "/library" })
    const session = useSession()
    const isMobile = useIsMobile()
    const { models: sharedModels } = useSharedModels()
    const migrateImages = useAction(api.images_node.migrateUserImages)
    const galleryRef = useRef<HTMLDivElement>(null)
    const sortBy = search.sort
    const pageNumber = search.page
    const currentCursor = pageNumber > 1 ? String((pageNumber - 1) * IMAGES_PER_PAGE) : null
    const filters = getLibraryFiltersFromSearch(search)
    const [isFiltersDrawerOpen, setIsFiltersDrawerOpen] = useState(false)
    const [draftSortBy, setDraftSortBy] = useState<ImageSortOption>(sortBy)
    const [draftFilters, setDraftFilters] = useState<LibraryFiltersState>(() =>
        cloneLibraryFilters(filters)
    )
    const activeFilters = useMemo(() => toGeneratedImageFilters(filters), [filters])
    const hasActiveFilters = useMemo(
        () => hasActiveGeneratedImageFilters(activeFilters),
        [activeFilters]
    )
    const activeFilterCount = useMemo(() => countActiveLibraryFilters(filters), [filters])
    const draftActiveFilterCount = useMemo(
        () => countActiveLibraryFilters(draftFilters),
        [draftFilters]
    )
    const imagePage = useQuery(
        api.images.paginateGeneratedImages,
        session.user?.id
            ? {
                  paginationOpts: { numItems: IMAGES_PER_PAGE, cursor: currentCursor },
                  sortBy,
                  filters: activeFilters
              }
            : "skip"
    )
    const totalImages = useQuery(
        api.images.getGeneratedImagesCount,
        session.user?.id ? { filters: activeFilters } : "skip"
    )
    const filterOptions = useQuery(
        api.images.getGeneratedImageFacetOptions,
        session.user?.id ? {} : "skip"
    )

    const { pendingGenerations, completedGenerationCount } = useGenerationStore()
    const privateViewingEnabled = usePrivateViewingStore((state) => state.privateViewingEnabled)
    const imageOverrides = usePrivateViewingStore((state) => state.imageOverrides)
    const togglePrivateViewingEnabled = usePrivateViewingStore(
        (state) => state.togglePrivateViewingEnabled
    )
    const toggleImageVisibility = usePrivateViewingStore((state) => state.toggleImageVisibility)
    const [animatedImageIds, setAnimatedImageIds] = useState<string[]>([])
    const previousPageImageIdsRef = useRef<string[]>([])
    const previousGenerationCountRef = useRef(0)

    useEffect(() => {
        if (session.user?.id) {
            // Run migration in background. It checks for missing DB entries.
            migrateImages().catch(console.error)
        }
    }, [session.user?.id, migrateImages])

    useEffect(() => {
        if (!isMobile) {
            setIsFiltersDrawerOpen(false)
        }
    }, [isMobile])

    const [selectedImage, setSelectedImage] = useState<Doc<"generatedImages"> | null>(null)
    const [deletedImageIds, setDeletedImageIds] = useState<Set<string>>(new Set())
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [selectedImageIds, setSelectedImageIds] = useState<Set<Id<"generatedImages">>>(new Set())
    const deleteImageAction = useAction(api.images_node.deleteGeneratedImage)

    const images = (imagePage?.page ?? []).filter((img) => !deletedImageIds.has(img._id))
    const selectedImageIndex = useMemo(
        () => (selectedImage ? images.findIndex((image) => image._id === selectedImage._id) : -1),
        [images, selectedImage]
    )
    const canNavigateSelectedImagePrevious = selectedImageIndex > 0
    const canNavigateSelectedImageNext =
        selectedImageIndex >= 0 && selectedImageIndex < images.length - 1
    const selectedImagePrefetchUrls = useMemo(() => {
        if (selectedImageIndex < 0) {
            return []
        }

        const nearbyIndices = [
            selectedImageIndex - 1,
            selectedImageIndex + 1,
            selectedImageIndex - 2,
            selectedImageIndex + 2
        ].filter((index) => index >= 0 && index < images.length)

        return nearbyIndices.map((index) =>
            getExpandedImageUrl({
                storageKey: images[index].storageKey,
                aspectRatio: images[index].aspectRatio
            })
        )
    }, [images, selectedImageIndex])
    const modelNameById = useMemo(
        () => new Map(sharedModels.map((model) => [model.id, model.name])),
        [sharedModels]
    )
    const modelFilterOptions = useMemo(
        () =>
            (filterOptions?.modelIds ?? []).map((modelId) => ({
                value: modelId,
                label: modelNameById.get(modelId) ?? modelId
            })),
        [filterOptions?.modelIds, modelNameById]
    )
    const resolutionFilterOptions = useMemo(
        () =>
            (filterOptions?.resolutions ?? []).map((resolution) => ({
                value: resolution,
                label: resolution
            })),
        [filterOptions?.resolutions]
    )
    const aspectRatioFilterOptions = useMemo(
        () =>
            (filterOptions?.aspectRatios ?? []).map((aspectRatio) => ({
                value: aspectRatio,
                label: aspectRatio
            })),
        [filterOptions?.aspectRatios]
    )
    const orientationFilterOptions = useMemo(
        () =>
            (filterOptions?.orientations ?? []).map((orientation) => ({
                value: orientation,
                label: ORIENTATION_LABELS[orientation]
            })),
        [filterOptions?.orientations]
    )
    const totalPages =
        totalImages === undefined
            ? undefined
            : Math.max(1, Math.ceil(totalImages / IMAGES_PER_PAGE))
    const canGoPrevious = pageNumber > 1
    const canGoNext = imagePage ? !imagePage.isDone : false
    const showPendingGenerations = pageNumber === 1 && !hasActiveFilters
    const scrollResetKey = JSON.stringify(search)

    const handleSortChange = useCallback(
        (value: ImageSortOption) => {
            navigate({
                replace: true,
                search: (prev) => ({
                    ...prev,
                    sort: value,
                    page: DEFAULT_LIBRARY_SEARCH.page
                })
            })
        },
        [navigate]
    )

    const handleFilterChange = useCallback(
        <K extends keyof LibraryFiltersState>(key: K, value: LibraryFiltersState[K][number]) => {
            navigate({
                replace: true,
                search: (prev) => {
                    const nextFilters = getLibraryFiltersFromSearch(prev)
                    nextFilters[key] = toggleFilterValue(
                        nextFilters[key],
                        value
                    ) as LibraryFiltersState[K]

                    return {
                        ...prev,
                        ...nextFilters,
                        page: DEFAULT_LIBRARY_SEARCH.page
                    }
                }
            })
        },
        [navigate]
    )

    const handleClearFilters = useCallback(() => {
        navigate({
            replace: true,
            search: (prev) => ({
                ...prev,
                ...cloneLibraryFilters(DEFAULT_LIBRARY_FILTERS),
                page: DEFAULT_LIBRARY_SEARCH.page
            })
        })
    }, [navigate])

    const handleClearFilterGroup = useCallback(
        <K extends keyof LibraryFiltersState>(key: K) => {
            navigate({
                replace: true,
                search: (prev) => {
                    const nextFilters = getLibraryFiltersFromSearch(prev)
                    nextFilters[key] = []

                    return {
                        ...prev,
                        ...nextFilters,
                        page: DEFAULT_LIBRARY_SEARCH.page
                    }
                }
            })
        },
        [navigate]
    )

    const handleOpenFiltersDrawer = useCallback(() => {
        setDraftSortBy(sortBy)
        setDraftFilters(cloneLibraryFilters(filters))
        setIsFiltersDrawerOpen(true)
    }, [filters, sortBy])

    const handleDraftFilterChange = useCallback(
        <K extends keyof LibraryFiltersState>(key: K, value: string) => {
            setDraftFilters((prev) => ({
                ...prev,
                [key]: toggleFilterValue(prev[key], value)
            }))
        },
        []
    )

    const handleClearDraftFilterGroup = useCallback(
        <K extends keyof LibraryFiltersState>(key: K) => {
            setDraftFilters((prev) => ({
                ...prev,
                [key]: []
            }))
        },
        []
    )

    const handleResetDraftFilters = useCallback(() => {
        setDraftSortBy(DEFAULT_LIBRARY_SEARCH.sort)
        setDraftFilters(cloneLibraryFilters(DEFAULT_LIBRARY_FILTERS))
    }, [])

    const handleApplyDrawerFilters = useCallback(() => {
        const didSortChange = draftSortBy !== sortBy
        const didFiltersChange = !areLibraryFiltersEqual(draftFilters, filters)

        if (didSortChange || didFiltersChange) {
            navigate({
                replace: true,
                search: (prev) => ({
                    ...prev,
                    ...cloneLibraryFilters(draftFilters),
                    sort: draftSortBy,
                    page: DEFAULT_LIBRARY_SEARCH.page
                })
            })
        }

        setIsFiltersDrawerOpen(false)
    }, [draftFilters, draftSortBy, filters, navigate, sortBy])

    const handleNextPage = useCallback(() => {
        if (!imagePage || imagePage.isDone) return

        navigate({
            search: (prev) => ({
                ...prev,
                page: prev.page + 1
            })
        })
    }, [imagePage, navigate])

    const handlePreviousPage = useCallback(() => {
        navigate({
            search: (prev) => {
                if (prev.page <= 1) return prev

                return {
                    ...prev,
                    page: prev.page - 1
                }
            }
        })
    }, [navigate])

    useEffect(() => {
        if (totalPages === undefined || pageNumber <= totalPages) return

        navigate({
            replace: true,
            search: (prev) => ({
                ...prev,
                page: totalPages
            })
        })
    }, [navigate, pageNumber, totalPages])

    useEffect(() => {
        void scrollResetKey
        galleryRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    }, [scrollResetKey])

    useEffect(() => {
        const currentImageIds = images.map((image) => image._id)
        const didCompleteGeneration = completedGenerationCount > previousGenerationCountRef.current

        if (didCompleteGeneration && sortBy === "newest" && pageNumber === 1) {
            const previousImageIds = new Set(previousPageImageIdsRef.current)
            const newImageIds = currentImageIds.filter((imageId) => !previousImageIds.has(imageId))

            if (newImageIds.length > 0) {
                setAnimatedImageIds((prev) => [...new Set([...prev, ...newImageIds])])
            }
        }

        previousGenerationCountRef.current = completedGenerationCount
        previousPageImageIdsRef.current = currentImageIds
    }, [completedGenerationCount, images, pageNumber, sortBy])

    const handleImageSettled = useCallback((imageId: Doc<"generatedImages">["_id"]) => {
        setAnimatedImageIds((prev) => prev.filter((id) => id !== imageId))
    }, [])

    const handleStartSelection = useCallback((imageId: Id<"generatedImages">) => {
        setIsSelectionMode(true)
        setSelectedImageIds(new Set([imageId]))
    }, [])

    const handleToggleSelection = useCallback((imageId: Id<"generatedImages">) => {
        setSelectedImageIds((prev) => {
            const next = new Set(prev)
            if (next.has(imageId)) {
                next.delete(imageId)
                if (next.size === 0) setIsSelectionMode(false)
            } else {
                next.add(imageId)
            }
            return next
        })
    }, [])

    const handleDeleteImage = useCallback(
        (imageId: Id<"generatedImages">) => {
            setDeletedImageIds((prev) => new Set(prev).add(imageId))
            deleteImageAction({ id: imageId }).catch(console.error)
        },
        [deleteImageAction]
    )

    const handleSelectPreviousImage = useCallback(() => {
        if (!canNavigateSelectedImagePrevious) return

        setSelectedImage(images[selectedImageIndex - 1] ?? null)
    }, [canNavigateSelectedImagePrevious, images, selectedImageIndex])

    const handleSelectNextImage = useCallback(() => {
        if (!canNavigateSelectedImageNext) return

        setSelectedImage(images[selectedImageIndex + 1] ?? null)
    }, [canNavigateSelectedImageNext, images, selectedImageIndex])

    const handleBulkDelete = useCallback(() => {
        if (selectedImageIds.size === 0) return

        const idsToDelete = Array.from(selectedImageIds)
        setDeletedImageIds((prev) => {
            const next = new Set(prev)
            idsToDelete.forEach((id) => next.add(id))
            return next
        })

        // Clear selection
        setSelectedImageIds(new Set())
        setIsSelectionMode(false)

        // Fire and forget deletions
        idsToDelete.forEach((id) => {
            deleteImageAction({ id }).catch(console.error)
        })
    }, [selectedImageIds, deleteImageAction])

    if (!session.user?.id) {
        return (
            <div className="container mx-auto max-w-6xl px-4 pt-16 pb-8">
                <div className="mb-8 shrink-0">
                    <h1 className="mb-2 whitespace-nowrap font-bold text-3xl">AI Library</h1>
                    <p className="text-muted-foreground">Your collection of AI-generated images</p>
                </div>
                <Alert>
                    <AlertDescription>
                        Sign in to view your AI-generated image library.
                    </AlertDescription>
                </Alert>
            </div>
        )
    }

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key="ai-library"
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="flex h-dvh min-h-0 w-full overflow-hidden"
            >
                <motion.div
                    ref={galleryRef}
                    layoutScroll
                    className="min-h-0 flex-1 overflow-y-auto p-6 pt-16"
                >
                    <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="shrink-0">
                            <h1 className="mb-2 whitespace-nowrap font-bold text-3xl">
                                AI Library
                            </h1>
                            <p className="text-muted-foreground">
                                Your collection of AI-generated images
                            </p>
                            <div className="mt-2 text-muted-foreground text-sm">
                                {totalImages === undefined
                                    ? "Loading image count..."
                                    : `${totalImages} images${totalPages && totalPages > 1 ? ` · Page ${pageNumber} of ${totalPages}` : ""}`}
                                {pendingGenerations.length > 0
                                    ? !hasActiveFilters
                                        ? ` · ${pendingGenerations.length} pending`
                                        : ""
                                    : ""}
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                            <Button
                                type="button"
                                variant={privateViewingEnabled ? "secondary" : "outline"}
                                className="w-full justify-center gap-2 sm:w-44"
                                onClick={togglePrivateViewingEnabled}
                            >
                                <span className="inline-flex h-4 w-4 items-center justify-center">
                                    {privateViewingEnabled ? (
                                        <EyeOff className="h-4 w-4" />
                                    ) : (
                                        <Eye className="h-4 w-4" />
                                    )}
                                </span>
                                <span>Private Viewing</span>
                                <span className="inline-flex w-7 justify-start">
                                    {privateViewingEnabled ? "On" : "Off"}
                                </span>
                            </Button>
                            {isMobile ? (
                                <Button
                                    type="button"
                                    variant={
                                        hasActiveFilters || sortBy !== "newest"
                                            ? "secondary"
                                            : "outline"
                                    }
                                    className="w-full justify-between gap-3"
                                    onClick={handleOpenFiltersDrawer}
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <Filter className="h-4 w-4" />
                                        Filters & Sort
                                    </span>
                                    <span className="text-muted-foreground text-xs">
                                        {activeFilterCount > 0
                                            ? `${activeFilterCount} active`
                                            : sortBy === "newest"
                                              ? "Newest first"
                                              : "Oldest first"}
                                    </span>
                                </Button>
                            ) : (
                                <>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <span className="text-muted-foreground text-xs uppercase tracking-wider">
                                            Sort
                                        </span>
                                        <Select
                                            value={sortBy}
                                            onValueChange={(value) =>
                                                handleSortChange(value as ImageSortOption)
                                            }
                                        >
                                            <SelectTrigger className="w-full min-w-36 bg-background sm:w-40">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="newest">Newest first</SelectItem>
                                                <SelectItem value="oldest">Oldest first</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {hasActiveFilters && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className="sm:self-end"
                                            onClick={handleClearFilters}
                                        >
                                            Clear filters
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {!isMobile && (
                        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <MultiSelectFilter
                                label="Model"
                                emptyLabel="All models"
                                selectedValues={filters.modelIds}
                                options={modelFilterOptions}
                                onToggleValue={(value) => handleFilterChange("modelIds", value)}
                                onClear={() => handleClearFilterGroup("modelIds")}
                            />
                            <MultiSelectFilter
                                label="Resolution"
                                emptyLabel="All resolutions"
                                selectedValues={filters.resolutions}
                                options={resolutionFilterOptions}
                                onToggleValue={(value) => handleFilterChange("resolutions", value)}
                                onClear={() => handleClearFilterGroup("resolutions")}
                            />
                            <MultiSelectFilter
                                label="Aspect Ratio"
                                emptyLabel="All aspect ratios"
                                selectedValues={filters.aspectRatios}
                                options={aspectRatioFilterOptions}
                                onToggleValue={(value) => handleFilterChange("aspectRatios", value)}
                                onClear={() => handleClearFilterGroup("aspectRatios")}
                            />
                            <MultiSelectFilter
                                label="Orientation"
                                emptyLabel="All orientations"
                                selectedValues={filters.orientations}
                                options={orientationFilterOptions}
                                onToggleValue={(value) =>
                                    handleFilterChange(
                                        "orientations",
                                        value as GeneratedImageOrientation
                                    )
                                }
                                onClear={() => handleClearFilterGroup("orientations")}
                            />
                        </div>
                    )}

                    {isMobile && (
                        <Drawer open={isFiltersDrawerOpen} onOpenChange={setIsFiltersDrawerOpen}>
                            <DrawerContent
                                className="z-[60] flex max-h-[90dvh] flex-col overflow-hidden"
                                overlayClassName="z-[60]"
                            >
                                <DrawerHeader className="shrink-0 text-left">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1">
                                            <DrawerTitle>Filters</DrawerTitle>
                                            <DrawerDescription>
                                                Narrow the library and choose how results are
                                                sorted.
                                            </DrawerDescription>
                                        </div>
                                        <DrawerClose asChild>
                                            <Button type="button" variant="ghost" size="icon">
                                                <span className="sr-only">Close filters</span>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </DrawerClose>
                                    </div>
                                </DrawerHeader>

                                <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
                                    <MobileSortFilter
                                        value={draftSortBy}
                                        onChange={setDraftSortBy}
                                    />
                                    <MobileCheckboxFilter
                                        title="Model"
                                        selectedValues={draftFilters.modelIds}
                                        options={modelFilterOptions}
                                        onToggleValue={(value) =>
                                            handleDraftFilterChange("modelIds", value)
                                        }
                                        onClear={() => handleClearDraftFilterGroup("modelIds")}
                                    />
                                    <MobileCheckboxFilter
                                        title="Resolution"
                                        selectedValues={draftFilters.resolutions}
                                        options={resolutionFilterOptions}
                                        onToggleValue={(value) =>
                                            handleDraftFilterChange("resolutions", value)
                                        }
                                        onClear={() => handleClearDraftFilterGroup("resolutions")}
                                    />
                                    <MobileCheckboxFilter
                                        title="Aspect Ratio"
                                        selectedValues={draftFilters.aspectRatios}
                                        options={aspectRatioFilterOptions}
                                        onToggleValue={(value) =>
                                            handleDraftFilterChange("aspectRatios", value)
                                        }
                                        onClear={() => handleClearDraftFilterGroup("aspectRatios")}
                                    />
                                    <MobileCheckboxFilter
                                        title="Orientation"
                                        selectedValues={draftFilters.orientations}
                                        options={orientationFilterOptions}
                                        onToggleValue={(value) =>
                                            handleDraftFilterChange("orientations", value)
                                        }
                                        onClear={() => handleClearDraftFilterGroup("orientations")}
                                    />
                                </div>

                                <DrawerFooter className="shrink-0 border-t px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                                    <div className="flex items-center justify-between gap-3 text-muted-foreground text-sm">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className="px-0"
                                            onClick={handleResetDraftFilters}
                                        >
                                            Reset all
                                        </Button>
                                        <span className="text-muted-foreground text-sm">
                                            {draftActiveFilterCount > 0
                                                ? `${draftActiveFilterCount} filters selected`
                                                : draftSortBy === "newest"
                                                  ? "Newest first"
                                                  : "Oldest first"}
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <DrawerClose asChild>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="flex-1"
                                            >
                                                Cancel
                                            </Button>
                                        </DrawerClose>
                                        <Button
                                            type="button"
                                            className="flex-1"
                                            onClick={handleApplyDrawerFilters}
                                        >
                                            Apply
                                        </Button>
                                    </div>
                                </DrawerFooter>
                            </DrawerContent>
                        </Drawer>
                    )}

                    {!imagePage ? (
                        <div className="columns-1 gap-4 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="mb-4 break-inside-avoid"
                                    style={{ height: `${Math.random() * 150 + 250}px` }}
                                >
                                    <Skeleton className="h-full w-full rounded-lg" />
                                </div>
                            ))}
                        </div>
                    ) : images.length === 0 &&
                      (!showPendingGenerations || pendingGenerations.length === 0) ? (
                        <div className="py-24 text-center">
                            <ImageIcon className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
                            <h3 className="mb-2 font-medium text-xl">
                                {hasActiveFilters
                                    ? "No images match these filters"
                                    : "No generated images yet"}
                            </h3>
                            <p className="mx-auto max-w-sm text-muted-foreground">
                                {hasActiveFilters
                                    ? "Try a different model, resolution, aspect ratio, or orientation."
                                    : "Generate images using the sidebar to see them appear here."}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="columns-1 gap-4 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5">
                                <AnimatePresence>
                                    {showPendingGenerations &&
                                        pendingGenerations.map((pending) => (
                                            <motion.div
                                                key={pending.id}
                                                layout
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{
                                                    opacity: 0,
                                                    scale: 0.9,
                                                    filter: "blur(8px)"
                                                }}
                                                transition={{
                                                    duration: 0.3,
                                                    ease: [0.16, 1, 0.3, 1]
                                                }}
                                                className="mb-4 break-inside-avoid"
                                            >
                                                <PendingImageItem
                                                    aspectRatio={pending.aspectRatio}
                                                />
                                            </motion.div>
                                        ))}
                                    {images.map((image) => {
                                        const isImageHidden = getIsImageHidden({
                                            privateViewingEnabled,
                                            override: imageOverrides[image._id]
                                        })

                                        return (
                                            <motion.div
                                                key={image._id}
                                                layout
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{
                                                    opacity: 0,
                                                    scale: 0.9,
                                                    filter: "blur(8px)"
                                                }}
                                                transition={{
                                                    duration: 0.3,
                                                    ease: [0.16, 1, 0.3, 1]
                                                }}
                                                className="mb-4 break-inside-avoid"
                                            >
                                                <GeneratedImageItem
                                                    image={image}
                                                    placeholder={
                                                        animatedImageIds.includes(image._id)
                                                            ? "tiles"
                                                            : "skeleton"
                                                    }
                                                    onClick={() => setSelectedImage(image)}
                                                    onImageSettled={() =>
                                                        handleImageSettled(image._id)
                                                    }
                                                    isSelected={selectedImageIds.has(image._id)}
                                                    isSelectionMode={isSelectionMode}
                                                    onToggleSelection={() =>
                                                        handleToggleSelection(image._id)
                                                    }
                                                    onStartSelection={() =>
                                                        handleStartSelection(image._id)
                                                    }
                                                    onDelete={() => handleDeleteImage(image._id)}
                                                    selectedCount={selectedImageIds.size}
                                                    onBulkDelete={handleBulkDelete}
                                                    isImageHidden={isImageHidden}
                                                    onToggleImageHidden={() =>
                                                        toggleImageVisibility(image._id)
                                                    }
                                                />
                                            </motion.div>
                                        )
                                    })}
                                </AnimatePresence>
                            </div>

                            {(canGoPrevious ||
                                canGoNext ||
                                (totalPages !== undefined && totalPages > 1)) && (
                                <div className="mt-8 border-t pt-4">
                                    <Pagination>
                                        <PaginationContent>
                                            <PaginationItem>
                                                <PaginationPrevious
                                                    href="#library-pagination"
                                                    className={
                                                        !canGoPrevious
                                                            ? "pointer-events-none opacity-50"
                                                            : undefined
                                                    }
                                                    onClick={(event) => {
                                                        event.preventDefault()
                                                        handlePreviousPage()
                                                    }}
                                                />
                                            </PaginationItem>
                                            <PaginationItem>
                                                <PaginationLink
                                                    href="#library-pagination"
                                                    isActive
                                                    size="default"
                                                    className="min-w-10"
                                                    onClick={(event) => event.preventDefault()}
                                                >
                                                    {pageNumber}
                                                </PaginationLink>
                                            </PaginationItem>
                                            <PaginationItem>
                                                <PaginationNext
                                                    href="#library-pagination"
                                                    className={
                                                        !canGoNext
                                                            ? "pointer-events-none opacity-50"
                                                            : undefined
                                                    }
                                                    onClick={(event) => {
                                                        event.preventDefault()
                                                        handleNextPage()
                                                    }}
                                                />
                                            </PaginationItem>
                                        </PaginationContent>
                                    </Pagination>
                                    <p
                                        id="library-pagination"
                                        className="mt-2 text-center text-muted-foreground text-xs"
                                    >
                                        Showing up to {IMAGES_PER_PAGE} completed images per page
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </motion.div>

                <ImageDetailsModal
                    image={selectedImage}
                    isOpen={!!selectedImage}
                    onClose={() => setSelectedImage(null)}
                    onPrevious={handleSelectPreviousImage}
                    onNext={handleSelectNextImage}
                    canNavigatePrevious={canNavigateSelectedImagePrevious}
                    canNavigateNext={canNavigateSelectedImageNext}
                    prefetchImageUrls={selectedImagePrefetchUrls}
                    onDeleteStart={(id) => {
                        setDeletedImageIds((prev) => new Set(prev).add(id))
                    }}
                />
            </motion.div>
        </AnimatePresence>
    )
}
