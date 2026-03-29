import { useGenerationStore } from "@/components/library/generation-store"
import { ImageDetailsModal } from "@/components/library/image-details-modal"
import { ImageLoadIndicator } from "@/components/library/image-load-indicator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger
} from "@/components/ui/context-menu"
import { ImageSkeleton } from "@/components/ui/image-skeleton"
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious
} from "@/components/ui/pagination"
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
import { getGeneratedImageProxyUrl, getLibraryImageSources } from "@/lib/generated-image-urls"
import { cn } from "@/lib/utils"
import { createFileRoute } from "@tanstack/react-router"
import { useAction, useQuery } from "convex/react"
import {
    Check,
    CheckSquare2,
    Clipboard,
    Copy,
    Download,
    ExternalLink,
    Image as ImageIcon,
    ImageOff,
    Trash2
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

export const Route = createFileRoute("/_chat/library")({
    component: LibraryPage
})

const IMAGES_PER_PAGE = 50
type ImageSortOption = "newest" | "oldest"
type ImageLoadPlaceholder = "tiles" | "skeleton"

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
        onBulkDownload
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
    }) => {
        const [isError, setIsError] = useState(false)
        const [loadState, setLoadState] = useState<"loading" | "revealing" | "ready">("loading")
        const revealTimeoutRef = useRef<number | null>(null)
        const metadata = useQuery(api.attachments.getFileMetadata, { key: image.storageKey })

        const imageSources = getLibraryImageSources({
            storageKey: image.storageKey,
            aspectRatio: image.aspectRatio
        })

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
            }
        }, [])

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

        const fullResolutionUrl = metadata?.url || getGeneratedImageProxyUrl(image.storageKey)

        const handleDownload = () => {
            window.open(fullResolutionUrl, "_blank")
        }

        const handleCopyImage = async () => {
            try {
                const response = await fetch(fullResolutionUrl)
                const blob = await response.blob()
                await navigator.clipboard.write([
                    new ClipboardItem({
                        [blob.type]: blob
                    })
                ])
                toast.success("Image copied to clipboard")
            } catch (err) {
                toast.error("Failed to copy image")
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

        if (isError) {
            return (
                <div
                    className="group relative overflow-hidden rounded-lg border bg-muted/50"
                    style={{ aspectRatio: cssAspectRatio }}
                >
                    <div className="flex h-full items-center justify-center">
                        <div className="text-center">
                            <ImageOff className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                            <p className="text-muted-foreground text-sm">Failed to load</p>
                        </div>
                    </div>
                </div>
            )
        }

        return (
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <button
                        type="button"
                        className={cn(
                            "group relative w-full appearance-none overflow-hidden rounded-lg border bg-background text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                            isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        )}
                        style={{ aspectRatio: cssAspectRatio }}
                        onClick={handleClick}
                    >
                        {loadState !== "ready" && (
                            <div className="absolute inset-0 z-10 bg-background">
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
                        <img
                            src={imageSources.src}
                            srcSet={imageSources.srcSet}
                            sizes={imageSources.sizes}
                            alt={image.prompt || "AI generation"}
                            className={cn(
                                "absolute inset-0 h-full w-full object-cover transition-all duration-500",
                                loadState === "loading" && "scale-[1.04] opacity-0 blur-xl",
                                loadState === "revealing" && "scale-[1.02] opacity-100 blur-md",
                                loadState === "ready" &&
                                    "scale-100 opacity-100 blur-0 group-hover:scale-105"
                            )}
                            onLoad={handleImageLoad}
                            onError={handleImageError}
                            loading="lazy"
                        />
                        <div className="absolute inset-x-0 bottom-0 z-20 translate-y-2 bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                            <div className="line-clamp-2 text-white text-xs">
                                <p>{image.prompt || "No prompt"}</p>
                            </div>
                        </div>
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
                    </button>
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

function LibraryPage() {
    const session = useSession()
    const migrateImages = useAction(api.images_node.migrateUserImages)
    const galleryRef = useRef<HTMLDivElement>(null)
    const [sortBy, setSortBy] = useState<ImageSortOption>("newest")
    const [{ currentCursor, previousCursors }, setPaginationState] = useState<{
        currentCursor: string | null
        previousCursors: (string | null)[]
    }>({
        currentCursor: null,
        previousCursors: []
    })
    const imagePage = useQuery(
        api.images.paginateGeneratedImages,
        session.user?.id
            ? {
                  paginationOpts: { numItems: IMAGES_PER_PAGE, cursor: currentCursor },
                  sortBy
              }
            : "skip"
    )
    const totalImages = useQuery(api.images.getGeneratedImagesCount, session.user?.id ? {} : "skip")

    const { pendingGenerations, completedGenerationCount } = useGenerationStore()
    const [animatedImageIds, setAnimatedImageIds] = useState<string[]>([])
    const previousPageImageIdsRef = useRef<string[]>([])
    const previousGenerationCountRef = useRef(0)

    useEffect(() => {
        if (session.user?.id) {
            // Run migration in background. It checks for missing DB entries.
            migrateImages().catch(console.error)
        }
    }, [session.user?.id, migrateImages])

    const [selectedImage, setSelectedImage] = useState<Doc<"generatedImages"> | null>(null)
    const [deletedImageIds, setDeletedImageIds] = useState<Set<string>>(new Set())
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [selectedImageIds, setSelectedImageIds] = useState<Set<Id<"generatedImages">>>(new Set())
    const deleteImageAction = useAction(api.images_node.deleteGeneratedImage)

    const images = (imagePage?.page ?? []).filter((img) => !deletedImageIds.has(img._id))
    const pageNumber = previousCursors.length + 1
    const totalPages =
        totalImages === undefined
            ? undefined
            : Math.max(1, Math.ceil(totalImages / IMAGES_PER_PAGE))
    const canGoPrevious = previousCursors.length > 0
    const canGoNext = imagePage ? !imagePage.isDone : false
    const showPendingGenerations = pageNumber === 1

    const resetPagination = useCallback(() => {
        setPaginationState({
            currentCursor: null,
            previousCursors: []
        })
    }, [])

    const handleSortChange = useCallback(
        (value: ImageSortOption) => {
            setSortBy(value)
            resetPagination()
        },
        [resetPagination]
    )

    const handleNextPage = useCallback(() => {
        if (!imagePage || imagePage.isDone) return

        setPaginationState((prev) => ({
            currentCursor: imagePage.continueCursor,
            previousCursors: [...prev.previousCursors, prev.currentCursor]
        }))
    }, [imagePage])

    const handlePreviousPage = useCallback(() => {
        setPaginationState((prev) => {
            if (prev.previousCursors.length === 0) return prev

            return {
                currentCursor: prev.previousCursors[prev.previousCursors.length - 1] ?? null,
                previousCursors: prev.previousCursors.slice(0, -1)
            }
        })
    }, [])

    useEffect(() => {
        if (!imagePage || currentCursor === null || imagePage.page.length > 0) return

        setPaginationState((prev) => {
            if (prev.previousCursors.length === 0) {
                return { currentCursor: null, previousCursors: [] }
            }

            return {
                currentCursor: prev.previousCursors[prev.previousCursors.length - 1] ?? null,
                previousCursors: prev.previousCursors.slice(0, -1)
            }
        })
    }, [currentCursor, imagePage])

    useEffect(() => {
        galleryRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    }, [currentCursor, sortBy])

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
                className="flex min-h-0 w-full flex-1 overflow-hidden"
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
                                    ? ` · ${pendingGenerations.length} pending`
                                    : ""}
                            </div>
                        </div>

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
                    </div>

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
                            <h3 className="mb-2 font-medium text-xl">No generated images yet</h3>
                            <p className="mx-auto max-w-sm text-muted-foreground">
                                Generate images using the sidebar to see them appear here.
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
                                    {images.map((image) => (
                                        <motion.div
                                            key={image._id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9, filter: "blur(8px)" }}
                                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
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
                                                onImageSettled={() => handleImageSettled(image._id)}
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
                                            />
                                        </motion.div>
                                    ))}
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
                    onDeleteStart={(id) => {
                        setDeletedImageIds((prev) => new Set(prev).add(id))
                    }}
                />
            </motion.div>
        </AnimatePresence>
    )
}
