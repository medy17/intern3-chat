import {
    getLibraryPageCursor,
    rememberLibraryPageCursor,
    type LibraryCursorHistory
} from "@/lib/library-pagination"
import { useGenerationStore } from "@/components/library/generation-store"
import { ImageComparisonModal } from "@/components/library/image-comparison-modal"
import { ImageDetailsModal } from "@/components/library/image-details-modal"
import { usePrivateViewingStore } from "@/components/library/private-viewing-store"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from "@/components/ui/accordion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog"
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
import { ImageSkeleton } from "@/components/ui/image-skeleton"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { useSidebar } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { useSession } from "@/hooks/auth-hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import { useDiskCachedQuery } from "@/lib/convex-cached-query"
import {
    type GeneratedImageFilters,
    type GeneratedImageOrientation,
    hasActiveGeneratedImageFilters
} from "@/lib/generated-image-filters"
import {
    getNextGeneratedImageRecoveryPhase,
    resolveGeneratedImageRenderSource
} from "@/lib/generated-image-recovery"
import {
    getExpandedImageUrl,
    getGeneratedImageCopyUrl,
    getGeneratedImageDirectUrl,
    getGeneratedImageProxyUrl,
    getLibraryImageSources
} from "@/lib/generated-image-urls"
import { ImageMetadataProvider, useImageMetadata } from "@/lib/image-metadata-context"
import { downloadViewerImage } from "@/lib/image-viewer-download"
import { copyViewerPrompt } from "@/lib/image-viewer-clipboard"
import {
    DEFAULT_LIBRARY_FILTERS,
    DEFAULT_LIBRARY_SEARCH,
    type ImageSortOption,
    LIBRARY_PAGE_SIZE_OPTIONS,
    type LibraryFiltersState,
    type LibraryPageSize,
    type LibrarySearchState,
    type LibraryView as LibraryViewMode,
    cloneLibraryFilters,
    getLibraryFiltersFromSearch,
    validateLibrarySearch
} from "@/lib/library-search"
import { getIsImageHidden } from "@/lib/private-viewing"
import { useSharedModels } from "@/lib/shared-models"
import { cn, copyImageUrlToClipboard } from "@/lib/utils"
import { createFileRoute, stripSearchParams, useNavigate } from "@tanstack/react-router"
import { useAction, useMutation, useQuery } from "convex/react"
import {
    Archive,
    ArrowLeft,
    ArrowRight,
    Check,
    CheckSquare2,
    Clipboard,
    Copy,
    Download,
    ExternalLink,
    Eye,
    EyeOff,
    Filter,
    Image as ImageIcon,
    ImageOff,
    Images,
    LoaderCircle,
    RotateCcw,
    Search,
    SquareMinus,
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

const getLibraryCacheScope = ({
    userId,
    pageNumber,
    pageSize,
    query,
    sortBy,
    filters,
    view
}: {
    userId: string
    pageNumber: number
    pageSize: number
    query: string
    sortBy: ImageSortOption
    filters: LibraryFiltersState
    view: LibraryViewMode
}) =>
    JSON.stringify({
        userId,
        pageNumber,
        pageSize,
        query,
        sortBy,
        filters,
        view
    })

const isQueryErrorResult = (value: unknown): value is { error: unknown } =>
    typeof value === "object" && value !== null && "error" in value

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

const getSortLabel = (sortBy: ImageSortOption) => {
    if (sortBy === "relevance") return "Best match"
    return sortBy === "newest" ? "Newest first" : "Oldest first"
}

const getLibraryViewLabel = (view: LibraryViewMode) => (view === "archived" ? "Archive" : "Library")

const getSortOptions = (
    includeRelevance: boolean
): Array<{ value: ImageSortOption; label: string }> =>
    includeRelevance
        ? [{ value: "relevance", label: "Best match" }]
        : [
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" }
          ]

const LIBRARY_SEARCH_DEBOUNCE_MS = 400
const LIBRARY_BACKSPACE_DEBOUNCE_MS = 700
const LIBRARY_RAPID_DELETE_DEBOUNCE_MS = 1000
const LIBRARY_MIN_QUERY_LENGTH = 2
const LIBRARY_RAPID_DELETE_WINDOW_MS = 250
const LIBRARY_RAPID_DELETE_DELTA = 2
const MobileFilterSection = ({
    title,
    action,
    children
}: {
    title: string
    action?: ReactNode
    children: ReactNode
}) => (
    <section className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0 md:border-t-0 md:pt-0">
        <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-base">{title}</h3>
            {action}
        </div>
        {children}
    </section>
)

const MobileSortFilter = ({
    options,
    value,
    onChange
}: {
    options: Array<{ value: ImageSortOption; label: string }>
    value: ImageSortOption
    onChange: (value: ImageSortOption) => void
}) => (
    <MobileFilterSection title="Sort By">
        <RadioGroup value={value} onValueChange={(next) => onChange(next as ImageSortOption)}>
            {options.map((option) => (
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

const DesktopCheckboxFilter = ({
    value,
    title,
    selectedValues,
    options,
    onToggleValue,
    onClear
}: {
    value: string
    title: string
    selectedValues: string[]
    options: Array<{ value: string; label: string }>
    onToggleValue: (value: string) => void
    onClear: () => void
}) => (
    <AccordionItem value={value} className="relative border-border/60">
        <AccordionTrigger className="pr-20 text-sm hover:text-foreground hover:no-underline [&>svg]:absolute [&>svg]:top-4 [&>svg]:right-0">
            <span className="flex items-center gap-2">
                <span>{title}</span>
                {selectedValues.length > 0 && (
                    <span className="rounded-[var(--radius-sm)] bg-primary/15 px-1.5 py-0.5 text-[0.625rem] text-primary leading-none">
                        {selectedValues.length}
                    </span>
                )}
            </span>
        </AccordionTrigger>
        {selectedValues.length > 0 && (
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute top-2.5 right-7 z-10 h-8 px-2 text-muted-foreground"
                onClick={onClear}
            >
                Clear
            </Button>
        )}
        <AccordionContent>
            {options.length > 0 ? (
                <div className="grid max-h-64 gap-1 overflow-y-auto pr-1">
                    {options.map((option) => (
                        <label
                            key={option.value}
                            htmlFor={`desktop-${value}-${option.value}`}
                            className="flex min-h-10 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-2 text-sm transition-colors hover:bg-muted/60 has-[[data-state=checked]]:bg-muted/60"
                        >
                            <Checkbox
                                id={`desktop-${value}-${option.value}`}
                                checked={selectedValues.includes(option.value)}
                                onCheckedChange={() => onToggleValue(option.value)}
                            />
                            <span className="min-w-0 break-words">{option.label}</span>
                        </label>
                    ))}
                </div>
            ) : (
                <p className="text-muted-foreground text-sm">No options available.</p>
            )}
        </AccordionContent>
    </AccordionItem>
)

const GalleryImageSkeleton = memo(() => (
    <div className="relative h-full w-full overflow-hidden rounded-[var(--radius-xl)] bg-muted/40">
        <Skeleton className="absolute inset-0 h-full w-full rounded-[var(--radius-xl)] bg-muted/60" />
    </div>
))
GalleryImageSkeleton.displayName = "GalleryImageSkeleton"

const PendingImageItem = memo(
    ({
        aspectRatio,
        status,
        isRetrying = false,
        onRetry
    }: {
        aspectRatio: string
        status?: string
        isRetrying?: boolean
        onRetry?: () => void
    }) => {
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

        const isStoringFailed = status === "storing_failed"

        return (
            <div
                className="group relative overflow-hidden rounded-[var(--radius-xl)] bg-muted/40"
                style={{ aspectRatio: cssAspectRatio }}
            >
                <ImageSkeleton
                    rows={rows}
                    cols={cols}
                    dotSize={3}
                    gap={4}
                    loadingDuration={99999}
                    autoLoop={false}
                    className="h-full w-full rounded-[var(--radius-xl)] border-0 bg-transparent"
                />
                {isStoringFailed && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 p-3 text-center backdrop-blur-sm">
                        <p className="text-muted-foreground text-xs">Couldn't load this image.</p>
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={isRetrying || !onRetry}
                            onClick={onRetry}
                        >
                            <RotateCcw
                                className={cn("mr-2 h-3.5 w-3.5", isRetrying && "animate-spin")}
                            />
                            {isRetrying ? "Retrying…" : "Refetch"}
                        </Button>
                    </div>
                )}
            </div>
        )
    }
)
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
        onBulkArchive,
        onBulkRestore,
        onCompareSelected,
        isImageHidden = false,
        onToggleImageHidden,
        isArchivedView = false,
        onArchive,
        onRestore
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
        onBulkArchive?: () => void
        onBulkRestore?: () => void
        onCompareSelected?: () => void
        isImageHidden?: boolean
        onToggleImageHidden?: () => void
        isArchivedView?: boolean
        onArchive?: () => void
        onRestore?: () => void
    }) => {
        const [isError, setIsError] = useState(false)
        const [imageRecoveryPhase, setImageRecoveryPhase] = useState<"primary" | "fallback">(
            "primary"
        )
        const [blurVariantStatus, setBlurVariantStatus] = useState<
            "idle" | "loading" | "ready" | "error"
        >("idle")
        const [blurVariantRetryKey, setBlurVariantRetryKey] = useState(0)
        const [loadState, setLoadState] = useState<"loading" | "revealing" | "ready">("loading")
        const revealTimeoutRef = useRef<number | null>(null)
        const blurVariantRetryTimeoutRef = useRef<number | null>(null)
        const blurVariantRequestIdRef = useRef(0)
        const { metadata, hasInvalidStoredImage } = useImageMetadata(image.storageKey)

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
                // Keep in sync with the reveal transition duration below (duration-500) so the
                // skeleton only unmounts once it has fully cross-faded out.
            }, 500)
        }, [onImageSettled])

        const handleImageError = useCallback(() => {
            const nextPhase = getNextGeneratedImageRecoveryPhase(imageRecoveryPhase)

            if (nextPhase === "error") {
                setIsError(true)
                setLoadState("ready")
                onImageSettled?.()
                return
            }

            setImageRecoveryPhase(nextPhase)
            setLoadState("loading")
        }, [imageRecoveryPhase, onImageSettled])

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
            setIsError(false)
            setImageRecoveryPhase("primary")
            setLoadState("loading")
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
        const fullResolutionUrl = getGeneratedImageDirectUrl(image.storageKey) || sourceImageUrl
        const renderedImageSource = resolveGeneratedImageRenderSource({
            phase: imageRecoveryPhase,
            primary: {
                src: visibleImageSources.src,
                srcSet: visibleImageSources.srcSet,
                sizes: visibleImageSources.sizes
            },
            fallback: {
                directSrc: fullResolutionUrl
            }
        })

        const handleDownload = () => {
            void downloadViewerImage({ url: fullResolutionUrl, storageKey: image.storageKey })
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
            void copyViewerPrompt({ prompt: image.prompt, trim: false, reportEmpty: false })
        }

        const handleViewFullResolution = () => {
            window.open(fullResolutionUrl, "_blank")
        }

        const handleArchiveStateChange = () => {
            if (isArchivedView) {
                onRestore?.()
                return
            }

            onArchive?.()
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
                    className="group relative overflow-hidden rounded-[var(--radius-xl)] bg-muted/50"
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
                            "group relative w-full overflow-hidden rounded-[var(--radius-xl)] bg-muted/40 ring-1 ring-border/40 transition-[box-shadow] duration-200",
                            isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        )}
                        style={{ aspectRatio: cssAspectRatio }}
                    >
                        <button
                            type="button"
                            className="absolute inset-0 z-20 appearance-none rounded-[var(--radius-xl)] text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                            onClick={handleClick}
                        >
                            <span className="sr-only">
                                {isSelectionMode ? "Select image" : "Open image details"}
                            </span>
                        </button>
                        {loadState !== "ready" && (
                            <div
                                className={cn(
                                    "pointer-events-none absolute inset-0 z-10 bg-background transition-opacity duration-500 ease-out",
                                    loadState === "revealing" ? "opacity-0" : "opacity-100"
                                )}
                            >
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
                        <div
                            className={cn(
                                "absolute inset-0 overflow-hidden transition-transform duration-500 ease-out motion-reduce:transition-none",
                                loadState === "ready" && "motion-safe:group-hover:scale-[1.025]",
                                loadState !== "ready" && "scale-100"
                            )}
                        >
                            <img
                                src={renderedImageSource.src}
                                srcSet={renderedImageSource.srcSet}
                                sizes={renderedImageSource.sizes}
                                alt={image.prompt || "AI generation"}
                                className={cn(
                                    "absolute inset-0 h-full w-full object-cover transition-[opacity,transform,filter] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
                                    loadState === "loading" && "translate-y-4 opacity-0",
                                    loadState !== "loading" && "translate-y-0 opacity-100",
                                    isImageHidden && blurVariantStatus === "ready" && "opacity-0",
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
                        {isImageHidden && (
                            <div
                                className={cn(
                                    "pointer-events-none absolute inset-0 z-10 bg-black/20 transition-opacity duration-300",
                                    useCssBlurFallback && "backdrop-blur-[2px]"
                                )}
                            />
                        )}
                        <div
                            className={cn(
                                "pointer-events-none absolute inset-x-0 bottom-0 z-10 translate-y-2 bg-gradient-to-t from-black/50 to-transparent p-2 transition-all",
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
                                    "absolute top-2 right-2 z-30 h-8 w-8 rounded-[var(--radius-md)] border border-border/60 bg-background/90 text-foreground backdrop-blur-md transition-opacity hover:bg-background",
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
                            <div className="pointer-events-none absolute inset-0 z-20 transition-colors duration-200">
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
                            {onCompareSelected && selectedCount === 2 && (
                                <ContextMenuItem onClick={onCompareSelected}>
                                    <Images className="mr-2 h-4 w-4" />
                                    Compare Selected
                                </ContextMenuItem>
                            )}
                            {onBulkDownload && (
                                <ContextMenuItem onClick={onBulkDownload}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Save Selected
                                </ContextMenuItem>
                            )}
                            {(onBulkArchive || onBulkRestore) && (
                                <ContextMenuItem
                                    onClick={isArchivedView ? onBulkRestore : onBulkArchive}
                                >
                                    {isArchivedView ? (
                                        <RotateCcw className="mr-2 h-4 w-4" />
                                    ) : (
                                        <Archive className="mr-2 h-4 w-4" />
                                    )}
                                    {isArchivedView ? "Restore Selected" : "Archive Selected"}
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
                            {(onArchive || onRestore) && (
                                <ContextMenuItem onClick={handleArchiveStateChange}>
                                    {isArchivedView ? (
                                        <RotateCcw className="mr-2 h-4 w-4" />
                                    ) : (
                                        <Archive className="mr-2 h-4 w-4" />
                                    )}
                                    {isArchivedView ? "Restore Image" : "Archive Image"}
                                </ContextMenuItem>
                            )}
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

export function LibraryView({
    search,
    deferHeavyContent = false
}: {
    search: LibrarySearchState
    deferHeavyContent?: boolean
}) {
    const navigate = useNavigate({ from: "/library" })
    const session = useSession()
    const isMobile = useIsMobile()
    const { state: sidebarState } = useSidebar()
    const { models: sharedModels } = useSharedModels()
    const migrateImages = useAction(api.images_node.migrateUserImages)
    const galleryRef = useRef<HTMLDivElement>(null)
    const libraryHeaderRef = useRef<HTMLDivElement>(null)
    const lastHeaderScrollTopRef = useRef(0)
    const [isLibraryHeaderHidden, setIsLibraryHeaderHidden] = useState(false)
    const [toolbarClearance, setToolbarClearance] = useState({ top: 64, left: 0, right: 0 })

    useEffect(() => {
        const gallery = galleryRef.current
        const controls = document.querySelector<HTMLElement>("[data-app-header-controls]")
        if (!gallery || !controls) return

        const updateClearance = () => {
            const width = gallery.clientWidth
            if (!width) return
            const right = controls.getBoundingClientRect().width + 16
            const left = sidebarState === "collapsed" ? 88 : 0
            // Keep a usable search field and compact buttons beside the app
            // controls; use a separate row when the sidebar leaves less room.
            const sharesRow = !isMobile && width - left - right - 48 >= 384
            const next = sharesRow ? { top: 16, left, right } : { top: 64, left: 0, right: 0 }
            setToolbarClearance((previous) =>
                previous.top === next.top &&
                previous.left === next.left &&
                previous.right === next.right
                    ? previous
                    : next
            )
        }
        updateClearance()
        const observer = new ResizeObserver(updateClearance)
        observer.observe(gallery)
        observer.observe(controls)
        return () => observer.disconnect()
    }, [isMobile, sidebarState, session.user?.id])
    const previousDraftQueryRef = useRef(search.query)
    const previousDraftQueryChangeAtRef = useRef<number | null>(null)
    const searchQuery = search.query
    const hasSearchQuery = searchQuery.length > 0
    const sortBy = hasSearchQuery ? "relevance" : search.sort
    const view = search.view
    const isArchivedView = view === "archived"
    const sortOptions = useMemo(() => getSortOptions(hasSearchQuery), [hasSearchQuery])
    const pageNumber = search.page
    const pageSize = search.pageSize
    const filters = getLibraryFiltersFromSearch(search)
    const cursorScope = JSON.stringify([
        session.user?.id,
        pageSize,
        searchQuery,
        sortBy,
        view,
        search.modelIds,
        search.resolutions,
        search.aspectRatios,
        search.orientations
    ])
    const [cursorHistory, setCursorHistory] = useState<LibraryCursorHistory>(() => ({
        scope: cursorScope,
        pages: { 1: null }
    }))
    const currentCursor = getLibraryPageCursor(cursorHistory, cursorScope, pageNumber)
    const [isFiltersDrawerOpen, setIsFiltersDrawerOpen] = useState(false)
    const [isDesktopFiltersOpen, setIsDesktopFiltersOpen] = useState(false)
    const [draftQuery, setDraftQuery] = useState(searchQuery)
    const [draftSortBy, setDraftSortBy] = useState<ImageSortOption>(sortBy)
    const [draftPageSize, setDraftPageSize] = useState<LibraryPageSize>(pageSize)
    const [draftFilters, setDraftFilters] = useState<LibraryFiltersState>(() =>
        cloneLibraryFilters(filters)
    )
    const [pendingPageNumber, setPendingPageNumber] = useState<{
        scope: string
        page: number
    } | null>(null)
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
    const libraryCacheScope = useMemo(
        () =>
            session.user?.id
                ? getLibraryCacheScope({
                      userId: session.user.id,
                      pageNumber,
                      pageSize,
                      query: searchQuery,
                      sortBy,
                      filters,
                      view
                  })
                : null,
        [filters, pageNumber, pageSize, searchQuery, session.user?.id, sortBy, view]
    )
    const libraryPageCacheKey = libraryCacheScope
        ? `library-cursor-page:v2:${libraryCacheScope}:${currentCursor}`
        : "library-page:guest"
    const nextPageNumber = pageNumber + 1
    const nextLibraryCacheScope = useMemo(
        () =>
            session.user?.id
                ? getLibraryCacheScope({
                      userId: session.user.id,
                      pageNumber: nextPageNumber,
                      pageSize,
                      query: searchQuery,
                      sortBy,
                      filters,
                      view
                  })
                : null,
        [filters, nextPageNumber, pageSize, searchQuery, session.user?.id, sortBy, view]
    )
    const imagePage = useDiskCachedQuery(
        api.images.paginateGeneratedImages,
        {
            key: libraryPageCacheKey,
            default: undefined
        },
        session.user?.id && currentCursor !== undefined
            ? {
                  paginationOpts: { numItems: pageSize, cursor: currentCursor },
                  query: searchQuery,
                  sortBy,
                  filters: activeFilters,
                  view
              }
            : "skip"
    )
    const resolvedImagePage = isQueryErrorResult(imagePage) ? undefined : imagePage
    const nextLibraryPageCacheKey = nextLibraryCacheScope
        ? `library-cursor-page:v2:${nextLibraryCacheScope}:${resolvedImagePage?.continueCursor}`
        : "library-page:guest"
    const nextImagePage = useDiskCachedQuery(
        api.images.paginateGeneratedImages,
        {
            key: nextLibraryPageCacheKey,
            default: undefined
        },
        session.user?.id && resolvedImagePage && !resolvedImagePage.isDone
            ? {
                  paginationOpts: { numItems: pageSize, cursor: resolvedImagePage.continueCursor },
                  query: searchQuery,
                  sortBy,
                  filters: activeFilters,
                  view
              }
            : "skip"
    )
    const prefetchedNextImagePage = isQueryErrorResult(nextImagePage) ? undefined : nextImagePage
    const filterOptions = useDiskCachedQuery(
        api.images.getGeneratedImageFacetOptions,
        {
            key: session.user?.id
                ? `library-filter-options:${session.user.id}:${view}`
                : "library-filter-options:guest",
            default: undefined
        },
        session.user?.id ? { view } : "skip"
    )

    const { pendingGenerations, completedGenerationCount } = useGenerationStore()
    const activeGenerationJobs =
        useQuery(
            api.image_generation_jobs.listActiveImageGenerationJobs,
            session.user?.id ? {} : "skip"
        ) ?? []
    const displayedPendingGenerations = useMemo(() => {
        const pendingById = new Map<
            string,
            { id: string; jobId?: string; aspectRatio: string; status?: string }
        >()

        for (const pending of pendingGenerations) {
            pendingById.set(pending.id, pending)
        }

        for (const job of activeGenerationJobs) {
            const id = job.clientRequestId ?? job._id
            pendingById.set(id, {
                id,
                jobId: job._id,
                aspectRatio: job.aspectRatio,
                status: job.status
            })
        }

        return Array.from(pendingById.values())
    }, [activeGenerationJobs, pendingGenerations])
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
        if (isMobile) {
            setIsDesktopFiltersOpen(false)
        } else {
            setIsFiltersDrawerOpen(false)
        }
    }, [isMobile])

    useEffect(() => {
        setDraftQuery(searchQuery)
    }, [searchQuery])

    useEffect(() => {
        const normalizedDraftQuery = draftQuery.trim().replace(/\s+/g, " ")
        const eligibleQuery =
            normalizedDraftQuery.length >= LIBRARY_MIN_QUERY_LENGTH ? normalizedDraftQuery : ""
        const now = Date.now()
        const previousDraftQuery = previousDraftQueryRef.current.trim().replace(/\s+/g, " ")
        const previousChangeAt = previousDraftQueryChangeAtRef.current
        const deleteDelta = previousDraftQuery.length - normalizedDraftQuery.length

        previousDraftQueryRef.current = draftQuery
        previousDraftQueryChangeAtRef.current = now

        if (eligibleQuery === searchQuery) {
            return
        }

        const isBackspacing =
            normalizedDraftQuery.length < previousDraftQuery.length &&
            previousDraftQuery.startsWith(normalizedDraftQuery)
        const isRapidDelete =
            deleteDelta >= LIBRARY_RAPID_DELETE_DELTA &&
            previousChangeAt !== null &&
            now - previousChangeAt <= LIBRARY_RAPID_DELETE_WINDOW_MS
        const debounceMs = isRapidDelete
            ? LIBRARY_RAPID_DELETE_DEBOUNCE_MS
            : isBackspacing
              ? LIBRARY_BACKSPACE_DEBOUNCE_MS
              : LIBRARY_SEARCH_DEBOUNCE_MS

        const timeoutId = window.setTimeout(() => {
            navigate({
                replace: true,
                search: (prev) => {
                    const nextQuery = eligibleQuery

                    return {
                        ...prev,
                        query: nextQuery,
                        sort:
                            nextQuery && !prev.query
                                ? "relevance"
                                : !nextQuery && prev.sort === "relevance"
                                  ? DEFAULT_LIBRARY_SEARCH.sort
                                  : prev.sort,
                        page: DEFAULT_LIBRARY_SEARCH.page
                    }
                }
            })
        }, debounceMs)

        return () => {
            window.clearTimeout(timeoutId)
        }
    }, [draftQuery, navigate, searchQuery])

    const [selectedImage, setSelectedImage] = useState<Doc<"generatedImages"> | null>(null)
    const [hiddenImageIds, setHiddenImageIds] = useState<Set<string>>(new Set())
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [selectedImageIds, setSelectedImageIds] = useState<Set<Id<"generatedImages">>>(new Set())
    const [comparisonImages, setComparisonImages] = useState<
        [Doc<"generatedImages">, Doc<"generatedImages">] | null
    >(null)
    const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)
    const bulkDeleteCancelRef = useRef<HTMLButtonElement>(null)
    const deleteImageAction = useAction(api.images_node.deleteGeneratedImage)
    const reprocessImageAsset = useAction(
        api.image_generation_jobs.reprocessImageGenerationJobAsset
    )
    const [retryingAssetJobIds, setRetryingAssetJobIds] = useState<Set<string>>(new Set())
    const handleRetryImageAsset = useCallback(
        async (jobId: string) => {
            setRetryingAssetJobIds((prev) => new Set(prev).add(jobId))
            try {
                await reprocessImageAsset({ jobId: jobId as Id<"imageGenerationJobs"> })
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Couldn't retrieve the image")
            } finally {
                setRetryingAssetJobIds((prev) => {
                    const next = new Set(prev)
                    next.delete(jobId)
                    return next
                })
            }
        },
        [reprocessImageAsset]
    )
    const archiveImage = useMutation(api.images.archiveGeneratedImage)
    const restoreImage = useMutation(api.images.restoreGeneratedImage)

    useEffect(() => {
        void view
        setHiddenImageIds(new Set())
        setSelectedImageIds(new Set())
        setIsSelectionMode(false)
        setSelectedImage(null)
    }, [view])

    const resolvedFilterOptions = isQueryErrorResult(filterOptions) ? undefined : filterOptions

    const images = (resolvedImagePage?.page ?? []).filter((img) => !hiddenImageIds.has(img._id))
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
            (resolvedFilterOptions?.modelIds ?? []).map((modelId) => ({
                value: modelId,
                label: modelNameById.get(modelId) ?? modelId
            })),
        [resolvedFilterOptions?.modelIds, modelNameById]
    )
    const resolutionFilterOptions = useMemo(
        () =>
            (resolvedFilterOptions?.resolutions ?? []).map((resolution) => ({
                value: resolution,
                label: resolution
            })),
        [resolvedFilterOptions?.resolutions]
    )
    const aspectRatioFilterOptions = useMemo(
        () =>
            (resolvedFilterOptions?.aspectRatios ?? []).map((aspectRatio) => ({
                value: aspectRatio,
                label: aspectRatio
            })),
        [resolvedFilterOptions?.aspectRatios]
    )
    const orientationFilterOptions = useMemo(
        () =>
            (resolvedFilterOptions?.orientations ?? []).map((orientation) => ({
                value: orientation,
                label: ORIENTATION_LABELS[orientation]
            })),
        [resolvedFilterOptions?.orientations]
    )
    const libraryTitle = getLibraryViewLabel(view)
    const canGoPrevious = pageNumber > 1
    const canGoNext = resolvedImagePage ? !resolvedImagePage.isDone : false
    const isNextPagePending =
        pendingPageNumber?.scope === cursorScope && pendingPageNumber.page === nextPageNumber
    const showPendingGenerations =
        !isArchivedView && pageNumber === 1 && !hasActiveFilters && !hasSearchQuery
    const scrollResetKey = JSON.stringify(search)

    const handleViewChange = useCallback(
        (nextView: LibraryViewMode) => {
            if (nextView === view) return

            navigate({
                replace: true,
                search: (prev) => ({
                    ...prev,
                    view: nextView,
                    page: DEFAULT_LIBRARY_SEARCH.page
                })
            })
        },
        [navigate, view]
    )

    const syncDraftFilters = useCallback(() => {
        setDraftSortBy(sortBy)
        setDraftPageSize(pageSize)
        setDraftFilters(cloneLibraryFilters(filters))
    }, [filters, pageSize, sortBy])

    const handleOpenFiltersDrawer = useCallback(() => {
        syncDraftFilters()
        setIsFiltersDrawerOpen(true)
    }, [syncDraftFilters])

    const handleDesktopFiltersToggle = useCallback(() => {
        if (!isDesktopFiltersOpen) syncDraftFilters()
        setIsDesktopFiltersOpen((isOpen) => !isOpen)
    }, [isDesktopFiltersOpen, syncDraftFilters])

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

    const handleResetFilters = useCallback(() => {
        const nextSort = hasSearchQuery ? "relevance" : DEFAULT_LIBRARY_SEARCH.sort

        setDraftSortBy(nextSort)
        setDraftPageSize(DEFAULT_LIBRARY_SEARCH.pageSize)
        setDraftFilters(cloneLibraryFilters(DEFAULT_LIBRARY_FILTERS))

        navigate({
            replace: true,
            search: (prev) => ({
                ...prev,
                ...cloneLibraryFilters(DEFAULT_LIBRARY_FILTERS),
                pageSize: DEFAULT_LIBRARY_SEARCH.pageSize,
                sort: nextSort,
                page: DEFAULT_LIBRARY_SEARCH.page
            })
        })
    }, [hasSearchQuery, navigate])

    const handleApplyFilters = useCallback(() => {
        const didSortChange = draftSortBy !== sortBy
        const didPageSizeChange = draftPageSize !== pageSize
        const didFiltersChange = !areLibraryFiltersEqual(draftFilters, filters)

        if (didSortChange || didPageSizeChange || didFiltersChange) {
            navigate({
                replace: true,
                search: (prev) => ({
                    ...prev,
                    ...cloneLibraryFilters(draftFilters),
                    pageSize: draftPageSize,
                    sort: draftSortBy,
                    page: DEFAULT_LIBRARY_SEARCH.page
                })
            })
        }

        setIsFiltersDrawerOpen(false)
        setIsDesktopFiltersOpen(false)
    }, [draftFilters, draftPageSize, draftSortBy, filters, navigate, pageSize, sortBy])

    const handleNextPage = useCallback(() => {
        if (!resolvedImagePage || resolvedImagePage.isDone || isNextPagePending) return
        setPendingPageNumber({ scope: cursorScope, page: nextPageNumber })
    }, [resolvedImagePage, isNextPagePending, nextPageNumber, cursorScope])

    useEffect(() => {
        if (!isNextPagePending || !prefetchedNextImagePage || !resolvedImagePage) return
        setCursorHistory((history) =>
            rememberLibraryPageCursor(
                history,
                cursorScope,
                nextPageNumber,
                resolvedImagePage.continueCursor
            )
        )
        setPendingPageNumber(null)
        navigate({ search: (prev) => ({ ...prev, page: nextPageNumber }) })
    }, [
        isNextPagePending,
        navigate,
        nextPageNumber,
        prefetchedNextImagePage,
        resolvedImagePage,
        cursorScope
    ])

    useEffect(() => {
        void libraryPageCacheKey
        setPendingPageNumber(null)
    }, [libraryPageCacheKey])

    const handlePreviousPage = useCallback(() => {
        navigate({ search: (prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }) })
    }, [navigate])

    useEffect(() => {
        // Numeric page links and reloads have no cursor history. Restart instead
        // of scanning the database to reconstruct an offset.
        if (currentCursor !== undefined) return
        navigate({ replace: true, search: (prev) => ({ ...prev, page: 1 }) })
    }, [currentCursor, navigate])

    useEffect(() => {
        void scrollResetKey
        setIsLibraryHeaderHidden(false)
        lastHeaderScrollTopRef.current = 0
        galleryRef.current?.scrollTo({ top: 0, behavior: "smooth" })
        setSelectedImageIds(new Set())
        setIsSelectionMode(false)
        setIsBulkDeleteDialogOpen(false)
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

    const handleClearSelection = useCallback(() => {
        setSelectedImageIds(new Set())
        setIsSelectionMode(false)
    }, [])

    const handleCompareSelected = useCallback(() => {
        if (selectedImageIds.size !== 2) return

        const imageById = new Map(images.map((image) => [image._id, image]))
        const selected = Array.from(selectedImageIds)
            .map((id) => imageById.get(id))
            .filter((image): image is Doc<"generatedImages"> => image !== undefined)

        if (selected.length !== 2) {
            toast.error("Both selected images must be on the current page")
            return
        }

        setComparisonImages([selected[0], selected[1]])
        handleClearSelection()
    }, [handleClearSelection, images, selectedImageIds])

    const allVisibleImagesSelected =
        images.length > 0 && images.every((image) => selectedImageIds.has(image._id))

    const handleToggleSelectVisible = useCallback(() => {
        if (allVisibleImagesSelected) {
            setSelectedImageIds(new Set())
            setIsSelectionMode(false)
            return
        }

        setSelectedImageIds(new Set(images.map((image) => image._id)))
        setIsSelectionMode(images.length > 0)
    }, [allVisibleImagesSelected, images])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isBulkDeleteDialogOpen || selectedImage) return

            if (event.key === "Escape" && isSelectionMode) {
                handleClearSelection()
                return
            }

            if (event.key.toLowerCase() !== "a" || (!event.ctrlKey && !event.metaKey)) return

            const target = event.target
            const isEditableTarget =
                target instanceof HTMLElement &&
                (target.isContentEditable ||
                    target.closest("input, textarea, [contenteditable='true']") !== null)

            if (isEditableTarget || images.length === 0) return

            event.preventDefault()
            setSelectedImageIds(new Set(images.map((image) => image._id)))
            setIsSelectionMode(true)
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [handleClearSelection, images, isBulkDeleteDialogOpen, isSelectionMode, selectedImage])

    const hideImageLocally = useCallback((imageId: Id<"generatedImages">) => {
        setHiddenImageIds((prev) => new Set(prev).add(imageId))
        setSelectedImageIds((prev) => {
            if (!prev.has(imageId)) {
                return prev
            }

            const next = new Set(prev)
            next.delete(imageId)
            if (next.size === 0) {
                setIsSelectionMode(false)
            }
            return next
        })
    }, [])

    const handleDeleteImage = useCallback(
        (imageId: Id<"generatedImages">) => {
            hideImageLocally(imageId)
            deleteImageAction({ id: imageId }).catch(console.error)
        },
        [deleteImageAction, hideImageLocally]
    )

    const handleArchiveImage = useCallback(
        (imageId: Id<"generatedImages">) => {
            hideImageLocally(imageId)
            archiveImage({ id: imageId }).catch(console.error)
        },
        [archiveImage, hideImageLocally]
    )

    const handleRestoreImage = useCallback(
        (imageId: Id<"generatedImages">) => {
            hideImageLocally(imageId)
            restoreImage({ id: imageId }).catch(console.error)
        },
        [hideImageLocally, restoreImage]
    )

    const handleCloseModal = useCallback(() => setSelectedImage(null), [])
    const handleHideImageLocally = useCallback((id: Id<"generatedImages">) => {
        setHiddenImageIds((prev) => new Set(prev).add(id))
    }, [])

    const handleSelectPreviousImage = useCallback(() => {
        if (!canNavigateSelectedImagePrevious) return

        setSelectedImage(images[selectedImageIndex - 1] ?? null)
    }, [canNavigateSelectedImagePrevious, images, selectedImageIndex])

    const handleSelectNextImage = useCallback(() => {
        if (!canNavigateSelectedImageNext) return

        setSelectedImage(images[selectedImageIndex + 1] ?? null)
    }, [canNavigateSelectedImageNext, images, selectedImageIndex])

    const handleRequestBulkDelete = useCallback(() => {
        if (selectedImageIds.size === 0) return
        setIsBulkDeleteDialogOpen(true)
    }, [selectedImageIds.size])

    const handleConfirmBulkDelete = useCallback(() => {
        if (selectedImageIds.size === 0) return

        const idsToDelete = Array.from(selectedImageIds)
        setIsBulkDeleteDialogOpen(false)
        setHiddenImageIds((prev) => {
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

    const handleBulkArchive = useCallback(() => {
        if (selectedImageIds.size === 0) return

        const idsToArchive = Array.from(selectedImageIds)
        setHiddenImageIds((prev) => {
            const next = new Set(prev)
            idsToArchive.forEach((id) => next.add(id))
            return next
        })

        setSelectedImageIds(new Set())
        setIsSelectionMode(false)

        idsToArchive.forEach((id) => {
            archiveImage({ id }).catch(console.error)
        })
    }, [archiveImage, selectedImageIds])

    const handleBulkRestore = useCallback(() => {
        if (selectedImageIds.size === 0) return

        const idsToRestore = Array.from(selectedImageIds)
        setHiddenImageIds((prev) => {
            const next = new Set(prev)
            idsToRestore.forEach((id) => next.add(id))
            return next
        })

        setSelectedImageIds(new Set())
        setIsSelectionMode(false)

        idsToRestore.forEach((id) => {
            restoreImage({ id }).catch(console.error)
        })
    }, [restoreImage, selectedImageIds])

    const mobileFilterControls = (
        <div className="grid gap-x-8 gap-y-6">
            <MobileSortFilter options={sortOptions} value={draftSortBy} onChange={setDraftSortBy} />
            <MobileFilterSection title="Results Per Page">
                <Select
                    value={String(draftPageSize)}
                    onValueChange={(value) => setDraftPageSize(Number(value) as LibraryPageSize)}
                >
                    <SelectTrigger className="w-full bg-background">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[70]">
                        {LIBRARY_PAGE_SIZE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={String(option)}>
                                {option} per page
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </MobileFilterSection>
            <MobileCheckboxFilter
                title="Model"
                selectedValues={draftFilters.modelIds}
                options={modelFilterOptions}
                onToggleValue={(value) => handleDraftFilterChange("modelIds", value)}
                onClear={() => handleClearDraftFilterGroup("modelIds")}
            />
            <MobileCheckboxFilter
                title="Resolution"
                selectedValues={draftFilters.resolutions}
                options={resolutionFilterOptions}
                onToggleValue={(value) => handleDraftFilterChange("resolutions", value)}
                onClear={() => handleClearDraftFilterGroup("resolutions")}
            />
            <MobileCheckboxFilter
                title="Aspect Ratio"
                selectedValues={draftFilters.aspectRatios}
                options={aspectRatioFilterOptions}
                onToggleValue={(value) => handleDraftFilterChange("aspectRatios", value)}
                onClear={() => handleClearDraftFilterGroup("aspectRatios")}
            />
            <MobileCheckboxFilter
                title="Orientation"
                selectedValues={draftFilters.orientations}
                options={orientationFilterOptions}
                onToggleValue={(value) => handleDraftFilterChange("orientations", value)}
                onClear={() => handleClearDraftFilterGroup("orientations")}
            />
        </div>
    )

    const desktopFilterControls = (
        <>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3">
                <div className="flex flex-col gap-3">
                    <label className="font-medium text-sm" htmlFor="desktop-library-sort">
                        Sort by
                    </label>
                    <Select
                        value={draftSortBy}
                        onValueChange={(value) => setDraftSortBy(value as ImageSortOption)}
                    >
                        <SelectTrigger id="desktop-library-sort" className="w-full bg-background">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {sortOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-col gap-3">
                    <label className="font-medium text-sm" htmlFor="desktop-library-page-size">
                        Results per page
                    </label>
                    <Select
                        value={String(draftPageSize)}
                        onValueChange={(value) =>
                            setDraftPageSize(Number(value) as LibraryPageSize)
                        }
                    >
                        <SelectTrigger
                            id="desktop-library-page-size"
                            className="w-full bg-background"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {LIBRARY_PAGE_SIZE_OPTIONS.map((option) => (
                                <SelectItem key={option} value={String(option)}>
                                    {option} per page
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground"
                    onClick={handleResetFilters}
                >
                    Reset all
                </Button>
            </div>
            <Accordion type="multiple" className="mt-4 grid items-start gap-x-8 md:grid-cols-2">
                <DesktopCheckboxFilter
                    value="models"
                    title="Model"
                    selectedValues={draftFilters.modelIds}
                    options={modelFilterOptions}
                    onToggleValue={(value) => handleDraftFilterChange("modelIds", value)}
                    onClear={() => handleClearDraftFilterGroup("modelIds")}
                />
                <DesktopCheckboxFilter
                    value="resolutions"
                    title="Resolution"
                    selectedValues={draftFilters.resolutions}
                    options={resolutionFilterOptions}
                    onToggleValue={(value) => handleDraftFilterChange("resolutions", value)}
                    onClear={() => handleClearDraftFilterGroup("resolutions")}
                />
                <DesktopCheckboxFilter
                    value="aspect-ratios"
                    title="Aspect Ratio"
                    selectedValues={draftFilters.aspectRatios}
                    options={aspectRatioFilterOptions}
                    onToggleValue={(value) => handleDraftFilterChange("aspectRatios", value)}
                    onClear={() => handleClearDraftFilterGroup("aspectRatios")}
                />
                <DesktopCheckboxFilter
                    value="orientations"
                    title="Orientation"
                    selectedValues={draftFilters.orientations}
                    options={orientationFilterOptions}
                    onToggleValue={(value) => handleDraftFilterChange("orientations", value)}
                    onClear={() => handleClearDraftFilterGroup("orientations")}
                />
            </Accordion>
        </>
    )

    const hasCustomizedFilters =
        hasActiveFilters ||
        pageSize !== DEFAULT_LIBRARY_SEARCH.pageSize ||
        sortBy !== (hasSearchQuery ? "relevance" : DEFAULT_LIBRARY_SEARCH.sort)

    if (!session.user?.id) {
        return (
            <div className="container mx-auto max-w-6xl px-4 pt-16 pb-8">
                <div className="mb-8 shrink-0">
                    <h1 className="mb-2 whitespace-nowrap font-bold text-3xl">{libraryTitle}</h1>
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
                className={cn(
                    "h-dvh w-full overflow-y-auto overflow-x-hidden transition-[filter] duration-300",
                    selectedImage ? "lg:blur-sm" : ""
                )}
                ref={galleryRef}
                onScroll={(event) => {
                    const container = event.currentTarget
                    const top = Math.max(
                        0,
                        Math.min(
                            container.scrollTop,
                            container.scrollHeight - container.clientHeight
                        )
                    )
                    const delta = top - lastHeaderScrollTopRef.current
                    if (top <= 80) {
                        setIsLibraryHeaderHidden(false)
                        lastHeaderScrollTopRef.current = top
                        return
                    }
                    if (Math.abs(delta) < 8) return
                    lastHeaderScrollTopRef.current = top
                    const isHeaderFocused = libraryHeaderRef.current?.contains(
                        document.activeElement
                    )
                    setIsLibraryHeaderHidden(delta > 0 && !isHeaderFocused)
                }}
                layoutScroll
            >
                <div
                    ref={libraryHeaderRef}
                    onFocusCapture={() => setIsLibraryHeaderHidden(false)}
                    style={{ paddingTop: toolbarClearance.top }}
                    className={cn(
                        "sticky top-0 z-40 flex shrink-0 flex-col bg-background/95 backdrop-blur-xl transition-[padding,translate] duration-300 ease-out motion-reduce:transition-none",
                        isLibraryHeaderHidden && !isDesktopFiltersOpen && !isFiltersDrawerOpen
                            ? "-translate-y-full"
                            : "translate-y-0",
                        isMobile
                            ? "gap-3 px-3 pb-3"
                            : cn("px-6 pb-4", isDesktopFiltersOpen && "relative")
                    )}
                >
                    <h1 className="sr-only">{libraryTitle}</h1>

                    {isMobile && (
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                            <div className="flex items-center gap-2">
                                <Tabs
                                    value={view}
                                    onValueChange={(value) =>
                                        handleViewChange(value as LibraryViewMode)
                                    }
                                >
                                    <TabsList className="h-9">
                                        <TabsTrigger value="active" className="text-xs">
                                            <ImageIcon className="mr-2 hidden h-3.5 w-3.5 sm:block" />
                                            Library
                                        </TabsTrigger>
                                        <TabsTrigger value="archived" className="text-xs">
                                            <Archive className="mr-2 hidden h-3.5 w-3.5 sm:block" />
                                            Archive
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                                <Button
                                    type="button"
                                    variant={privateViewingEnabled ? "secondary" : "outline"}
                                    className="h-9 gap-2"
                                    onClick={togglePrivateViewingEnabled}
                                >
                                    {privateViewingEnabled ? (
                                        <EyeOff className="h-4 w-4" />
                                    ) : (
                                        <Eye className="h-4 w-4" />
                                    )}
                                    <span className="hidden sm:inline">Private Viewing</span>
                                </Button>
                            </div>
                        </div>
                    )}

                    <div
                        className="@container/library-toolbar flex min-w-0 items-center gap-2"
                        style={{
                            marginLeft: toolbarClearance.left,
                            marginRight: toolbarClearance.right
                        }}
                    >
                        <div className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="search"
                                value={draftQuery}
                                onChange={(event) => setDraftQuery(event.target.value)}
                                placeholder="Search images"
                                className="h-10 rounded-[var(--radius-lg)] border-border/60 bg-muted/35 pr-10 pl-9 shadow-none transition-colors placeholder:text-muted-foreground focus-visible:bg-background"
                                aria-label="Search library"
                            />
                            {draftQuery.length > 0 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Clear search"
                                    className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:bg-transparent"
                                    onClick={() => setDraftQuery("")}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                            {isMobile ? (
                                <Button
                                    type="button"
                                    variant={
                                        hasActiveFilters ||
                                        hasSearchQuery ||
                                        sortBy !== (hasSearchQuery ? "relevance" : "newest")
                                            ? "secondary"
                                            : "outline"
                                    }
                                    className="h-11 shrink-0 gap-2 rounded-[var(--radius-lg)] border-border/60 px-3 shadow-none"
                                    onClick={handleOpenFiltersDrawer}
                                >
                                    <Filter className="h-4 w-4" />
                                    <span>Filters</span>
                                    {activeFilterCount > 0 && (
                                        <span className="rounded-[var(--radius-sm)] bg-primary/15 px-1.5 py-0.5 text-primary text-xs leading-none">
                                            {activeFilterCount}
                                        </span>
                                    )}
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        type="button"
                                        variant={privateViewingEnabled ? "secondary" : "outline"}
                                        className="h-10 gap-2"
                                        onClick={togglePrivateViewingEnabled}
                                        aria-label="Toggle Private Viewing"
                                    >
                                        {privateViewingEnabled ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                        <span className="@xl/library-toolbar:inline hidden">
                                            Private Viewing
                                        </span>
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={hasCustomizedFilters ? "secondary" : "outline"}
                                        className="h-10 gap-2 rounded-[var(--radius-lg)] border-border/60 px-3 shadow-none"
                                        onClick={handleDesktopFiltersToggle}
                                        aria-expanded={isDesktopFiltersOpen}
                                        aria-controls="desktop-library-filters"
                                    >
                                        <Filter className="h-4 w-4" />
                                        Filters
                                        {activeFilterCount > 0 && (
                                            <span className="rounded-[var(--radius-sm)] bg-primary/15 px-1.5 py-0.5 text-[0.625rem] text-primary leading-none">
                                                {activeFilterCount}
                                            </span>
                                        )}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    <AnimatePresence initial={false}>
                        {!isMobile && isDesktopFiltersOpen && (
                            <motion.section
                                id="desktop-library-filters"
                                className="overflow-hidden"
                                aria-label="Library filters"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            >
                                <div className="mt-3 rounded-[var(--radius-xl)] border border-border/60 bg-muted/20 p-4 lg:p-5">
                                    {desktopFilterControls}
                                    <div className="mt-4 flex justify-end gap-2 border-border/60 border-t pt-4">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setIsDesktopFiltersOpen(false)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button type="button" onClick={handleApplyFilters}>
                                            Apply
                                        </Button>
                                    </div>
                                </div>
                            </motion.section>
                        )}
                    </AnimatePresence>
                </div>

                {/* Mobile Filters Drawer */}
                {isMobile && (
                    <Drawer open={isFiltersDrawerOpen} onOpenChange={setIsFiltersDrawerOpen}>
                        <DrawerContent
                            className="z-[60] flex max-h-[90dvh] flex-col overflow-hidden"
                            overlayClassName="z-[60]"
                        >
                            <DrawerHeader className="shrink-0 text-left">
                                <DrawerTitle>Filters</DrawerTitle>
                                <DrawerDescription>
                                    Narrow the library and choose how results are sorted.
                                </DrawerDescription>
                            </DrawerHeader>

                            <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
                                {mobileFilterControls}
                            </div>

                            <DrawerFooter className="shrink-0 border-t px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                                <div className="flex items-center justify-between gap-3 text-muted-foreground text-sm">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="px-0"
                                        onClick={handleResetFilters}
                                    >
                                        Reset all
                                    </Button>
                                    <span className="text-muted-foreground text-sm">
                                        {draftActiveFilterCount > 0
                                            ? `${draftActiveFilterCount} filters selected`
                                            : `${draftPageSize} per page · ${getSortLabel(draftSortBy)}`}
                                    </span>
                                </div>
                                <div className="flex gap-2">
                                    <DrawerClose asChild>
                                        <Button type="button" variant="outline" className="flex-1">
                                            Cancel
                                        </Button>
                                    </DrawerClose>
                                    <Button
                                        type="button"
                                        className="flex-1"
                                        onClick={handleApplyFilters}
                                    >
                                        Apply
                                    </Button>
                                </div>
                            </DrawerFooter>
                        </DrawerContent>
                    </Drawer>
                )}

                {/* Scrollable Gallery Area */}
                <div
                    className={cn(
                        "@container px-3 pt-2 pb-5 sm:px-6 sm:pt-3 sm:pb-6",
                        isSelectionMode && "pb-28 sm:pb-28 lg:pb-28"
                    )}
                >
                    {deferHeavyContent || !resolvedImagePage ? (
                        <output
                            aria-live="polite"
                            className="flex min-h-[50dvh] items-center justify-center text-muted-foreground"
                        >
                            <div className="flex items-center gap-2 text-sm">
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                                Loading library…
                            </div>
                        </output>
                    ) : images.length === 0 &&
                      resolvedImagePage.isDone &&
                      pageNumber === 1 &&
                      (!showPendingGenerations || displayedPendingGenerations.length === 0) ? (
                        <div className="py-24 text-center">
                            <ImageIcon className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
                            <h3 className="mb-2 font-medium text-xl">
                                {isArchivedView
                                    ? hasSearchQuery && hasActiveFilters
                                        ? "No archived images match this search"
                                        : hasSearchQuery
                                          ? "No archived images match this search"
                                          : hasActiveFilters
                                            ? "No archived images match these filters"
                                            : "No archived images yet"
                                    : hasSearchQuery && hasActiveFilters
                                      ? "No images match this search"
                                      : hasSearchQuery
                                        ? "No images match this search"
                                        : hasActiveFilters
                                          ? "No images match these filters"
                                          : "No generated images yet"}
                            </h3>
                            <p className="mx-auto max-w-sm text-muted-foreground">
                                {isArchivedView
                                    ? "Archived images will appear here until they are restored or deleted."
                                    : "Generate images using the sidebar to see them appear here."}
                            </p>
                        </div>
                    ) : (
                        <>
                            {images.length === 0 && (
                                <p className="py-12 text-center text-muted-foreground">
                                    {resolvedImagePage.isDone
                                        ? "No more matching images. Use Previous to return."
                                        : "No matches on this page. Use Next to continue searching."}
                                </p>
                            )}
                            <ImageMetadataProvider
                                key={libraryPageCacheKey}
                                storageKeys={images.map((img) => img.storageKey)}
                            >
                                <div className="@2xl:columns-3 @4xl:columns-4 @6xl:columns-5 columns-2 gap-3 sm:gap-4">
                                    <AnimatePresence>
                                        {showPendingGenerations &&
                                            displayedPendingGenerations.map((pending) => (
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
                                                    className="mb-3 break-inside-avoid sm:mb-4"
                                                >
                                                    <PendingImageItem
                                                        aspectRatio={pending.aspectRatio}
                                                        status={pending.status}
                                                        isRetrying={retryingAssetJobIds.has(
                                                            pending.jobId ?? pending.id
                                                        )}
                                                        onRetry={() =>
                                                            handleRetryImageAsset(
                                                                pending.jobId ?? pending.id
                                                            )
                                                        }
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
                                                    className="mb-3 break-inside-avoid sm:mb-4"
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
                                                        onDelete={() =>
                                                            handleDeleteImage(image._id)
                                                        }
                                                        isArchivedView={isArchivedView}
                                                        onArchive={() =>
                                                            handleArchiveImage(image._id)
                                                        }
                                                        onRestore={() =>
                                                            handleRestoreImage(image._id)
                                                        }
                                                        onBulkArchive={handleBulkArchive}
                                                        onBulkRestore={handleBulkRestore}
                                                        onCompareSelected={handleCompareSelected}
                                                        selectedCount={selectedImageIds.size}
                                                        onBulkDelete={handleRequestBulkDelete}
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
                            </ImageMetadataProvider>

                            {(canGoPrevious || canGoNext) && (
                                <nav
                                    id="library-pagination"
                                    aria-label="Image library pagination"
                                    className="mt-6 flex items-center justify-center gap-3 border-border/60 border-t pt-4 pb-2"
                                >
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        disabled={!canGoPrevious}
                                        onClick={handlePreviousPage}
                                        className="h-11 gap-2 rounded-[var(--radius-md)] px-3 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                    >
                                        <ArrowLeft className="size-4" />
                                        Previous
                                    </Button>
                                    <Input
                                        type="text"
                                        value={pageNumber}
                                        readOnly
                                        aria-label="Current page"
                                        aria-current="page"
                                        className="h-10 w-14 rounded-[var(--radius-md)] border-border/60 bg-transparent px-1 text-center font-medium text-foreground tabular-nums shadow-none"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        disabled={!canGoNext || isNextPagePending}
                                        aria-label={
                                            isNextPagePending ? "Loading next page" : "Next page"
                                        }
                                        aria-busy={isNextPagePending}
                                        onClick={handleNextPage}
                                        className="h-11 gap-2 rounded-[var(--radius-md)] px-3 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                    >
                                        Next
                                        {isNextPagePending ? (
                                            <LoaderCircle className="size-4 animate-spin" />
                                        ) : (
                                            <ArrowRight className="size-4" />
                                        )}
                                    </Button>
                                </nav>
                            )}
                        </>
                    )}
                </div>

                <AnimatePresence>
                    {isSelectionMode && selectedImageIds.size > 0 && (
                        <motion.div
                            role="toolbar"
                            aria-label="Selected image actions"
                            initial={{ opacity: 0, y: 24, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 16, scale: 0.97 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-50 mx-auto flex max-w-fit items-center gap-1 border border-border/70 bg-background/90 p-1.5 shadow-2xl backdrop-blur-xl sm:gap-1.5"
                            style={{ borderRadius: "var(--radius-xl)" }}
                        >
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label="Compare selected images"
                                className="rounded-[var(--radius-md)] px-2 sm:px-3"
                                disabled={selectedImageIds.size !== 2}
                                onClick={handleCompareSelected}
                            >
                                <Images className="size-4" />
                                <span className="hidden sm:inline">Compare</span>
                            </Button>

                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={
                                    allVisibleImagesSelected
                                        ? "Clear page selection"
                                        : "Select current page"
                                }
                                aria-pressed={allVisibleImagesSelected}
                                className="rounded-[var(--radius-md)] px-2.5 font-semibold sm:px-3"
                                onClick={handleToggleSelectVisible}
                            >
                                {allVisibleImagesSelected ? (
                                    <CheckSquare2 className="size-4" />
                                ) : (
                                    <SquareMinus className="size-4" />
                                )}
                                <span>{selectedImageIds.size} selected</span>
                            </Button>

                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={
                                    isArchivedView
                                        ? "Restore selected images"
                                        : "Archive selected images"
                                }
                                className="rounded-[var(--radius-md)] px-2 sm:px-3"
                                onClick={isArchivedView ? handleBulkRestore : handleBulkArchive}
                            >
                                {isArchivedView ? (
                                    <RotateCcw className="size-4" />
                                ) : (
                                    <Archive className="size-4" />
                                )}
                                <span className="hidden sm:inline">
                                    {isArchivedView ? "Restore" : "Archive"}
                                </span>
                            </Button>

                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label="Delete selected images"
                                className="rounded-[var(--radius-md)] px-2 text-destructive hover:bg-destructive/10 hover:text-destructive sm:px-3"
                                onClick={handleRequestBulkDelete}
                            >
                                <Trash2 className="size-4" />
                                <span className="hidden sm:inline">Delete</span>
                            </Button>

                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label="Cancel image selection"
                                className="rounded-[var(--radius-md)] px-2 text-muted-foreground sm:px-3"
                                onClick={handleClearSelection}
                            >
                                Cancel
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
                    <AlertDialogContent
                        className="rounded-[var(--radius-xl)]"
                        onOpenAutoFocus={() => {
                            window.requestAnimationFrame(() => bulkDeleteCancelRef.current?.focus())
                        }}
                    >
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Delete {selectedImageIds.size}{" "}
                                {selectedImageIds.size === 1 ? "image" : "images"}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                This permanently removes the selected
                                {selectedImageIds.size === 1 ? " image" : " images"} and stored
                                {selectedImageIds.size === 1 ? " file" : " files"}. This cannot be
                                undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel
                                ref={bulkDeleteCancelRef}
                                className="rounded-[var(--radius-md)]"
                            >
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                className="rounded-[var(--radius-md)] bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={handleConfirmBulkDelete}
                            >
                                Delete permanently
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <ImageDetailsModal
                    image={selectedImage}
                    isOpen={!!selectedImage}
                    onClose={handleCloseModal}
                    isArchivedView={isArchivedView}
                    onPrevious={handleSelectPreviousImage}
                    onNext={handleSelectNextImage}
                    canNavigatePrevious={canNavigateSelectedImagePrevious}
                    canNavigateNext={canNavigateSelectedImageNext}
                    prefetchImageUrls={selectedImagePrefetchUrls}
                    onDeleteStart={handleHideImageLocally}
                    onArchiveStart={handleHideImageLocally}
                    onRestoreStart={handleHideImageLocally}
                />
                <ImageComparisonModal
                    images={comparisonImages}
                    isOpen={comparisonImages !== null}
                    onClose={() => setComparisonImages(null)}
                />
            </motion.div>
        </AnimatePresence>
    )
}
