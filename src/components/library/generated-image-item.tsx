import { ImageLoadIndicator } from "@/components/library/image-load-indicator"
import { Button } from "@/components/ui/button"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger
} from "@/components/ui/context-menu"
import { ImageSkeleton } from "@/components/ui/image-skeleton"
import { Skeleton } from "@/components/ui/skeleton"
import type { Doc } from "@/convex/_generated/dataModel"
import {
    getGeneratedImageCopyUrl,
    getGeneratedImageDirectUrl,
    getGeneratedImageProxyUrl,
    getLibraryImageSources
} from "@/lib/generated-image-urls"
import { useImageMetadata } from "@/lib/image-metadata-context"
import { cn, copyImageUrlToClipboard } from "@/lib/utils"
import {
    Archive,
    Check,
    CheckSquare2,
    Clipboard,
    Copy,
    Download,
    ExternalLink,
    Eye,
    EyeOff,
    ImageOff,
    RotateCcw,
    Trash2
} from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

export type ImageLoadPlaceholder = "tiles" | "skeleton"

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

const GalleryImageSkeleton = memo(() => (
    <div className="relative h-full w-full overflow-hidden rounded-[var(--radius-lg)] border border-border/60 bg-muted/40">
        <div className="absolute inset-0 bg-gradient-to-br from-muted/90 via-muted/70 to-accent/50" />
        <div className="absolute inset-0 backdrop-blur-[1px]" />
        <div className="absolute inset-x-0 bottom-0 space-y-2 p-3">
            <Skeleton className="h-3 w-4/5 bg-background/70" />
            <Skeleton className="h-3 w-3/5 bg-background/55" />
        </div>
    </div>
))
GalleryImageSkeleton.displayName = "GalleryImageSkeleton"

export interface GeneratedImageItemProps {
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
    isImageHidden?: boolean
    onToggleImageHidden?: () => void
    isArchivedView?: boolean
    onArchive?: () => void
    onRestore?: () => void
    layout?: "grid" | "list"
}

export const GeneratedImageItem = memo(
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
        isImageHidden = false,
        onToggleImageHidden,
        isArchivedView = false,
        onArchive,
        onRestore,
        layout = "grid"
    }: GeneratedImageItemProps) => {
        const layoutMode = layout
        const [isError, setIsError] = useState(false)
        const [blurVariantStatus, setBlurVariantStatus] = useState<
            "idle" | "loading" | "ready" | "error"
        >("idle")
        const [blurVariantRetryKey, setBlurVariantRetryKey] = useState(0)
        const [loadState, setLoadState] = useState<"loading" | "revealing" | "ready">("loading")
        const revealTimeoutRef = useRef<number | null>(null)
        const blurVariantRetryTimeoutRef = useRef<number | null>(null)
        const blurVariantRequestIdRef = useRef(0)
        const { hasInvalidStoredImage } = useImageMetadata(image.storageKey)

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
        const fullResolutionUrl = getGeneratedImageDirectUrl(image.storageKey) || sourceImageUrl

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

        const handleArchiveStateChange = () => {
            if (isArchivedView) {
                onRestore?.()
                return
            }

            onArchive?.()
        }

        const handleClick = (e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            if (isSelectionMode) {
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
                    className="group relative overflow-hidden rounded-[var(--radius-lg)] border bg-muted/50"
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
                    {layoutMode === "list" ? (
                        <div
                            className={cn(
                                "group grid grid-cols-[auto_minmax(0,1fr)_repeat(4,100px)_auto] items-center gap-4 border-border/60 border-b p-3 transition-colors last:border-b-0 hover:bg-muted/50",
                                isSelected && "bg-primary/5"
                            )}
                        >
                            <button
                                type="button"
                                className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border bg-muted/20 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                onClick={handleClick}
                            >
                                <img
                                    src={visibleImageSources.src}
                                    className="absolute inset-0 h-full w-full object-cover"
                                    alt={image.prompt || ""}
                                    loading="lazy"
                                />
                                {isImageHidden && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                                        <EyeOff className="h-4 w-4 text-white/80" />
                                    </div>
                                )}
                            </button>
                            <button
                                type="button"
                                className="truncate text-left font-medium text-sm outline-none"
                                onClick={handleClick}
                            >
                                {isImageHidden
                                    ? "Private viewing enabled"
                                    : image.prompt || "No prompt"}
                            </button>
                            <div className="truncate text-muted-foreground text-xs">
                                {image.modelId}
                            </div>
                            <div className="truncate text-muted-foreground text-xs">
                                {image.resolution || "1K"}
                            </div>
                            <div className="truncate text-muted-foreground text-xs">
                                {image.aspectRatio}
                            </div>
                            <div className="truncate text-muted-foreground text-xs">
                                {new Date(image.createdAt).toLocaleDateString()}
                            </div>
                            <div className="flex justify-end pr-2">
                                {isSelectionMode ? (
                                    <button
                                        type="button"
                                        className={cn(
                                            "flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-2 outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary",
                                            isSelected
                                                ? "border-primary bg-primary text-primary-foreground"
                                                : "border-muted-foreground/30 bg-transparent text-transparent hover:border-primary/50"
                                        )}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onToggleSelection?.()
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "h-3 w-3",
                                                isSelected ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                    </button>
                                ) : (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onStartSelection?.()
                                        }}
                                    >
                                        <CheckSquare2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div
                            className={cn(
                                "group relative w-full overflow-hidden rounded-[var(--radius-lg)] border bg-background transition-all",
                                isSelected &&
                                    "ring-2 ring-primary ring-offset-2 ring-offset-background"
                            )}
                            style={{ aspectRatio: cssAspectRatio }}
                        >
                            <button
                                type="button"
                                className="absolute inset-0 z-20 appearance-none rounded-[var(--radius-lg)] text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                                        "absolute top-2 right-2 z-30 h-8 w-8 border border-white/15 bg-background/80 text-foreground shadow-lg backdrop-blur-md transition-all hover:bg-background",
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
                    )}
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
