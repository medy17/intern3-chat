import { ImageDetailsModal } from "@/components/library/image-details-modal"
import { ImageGenerationSidebar } from "@/components/library/image-generation-sidebar"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import type { Doc } from "@/convex/_generated/dataModel"
import { useSession } from "@/hooks/auth-hooks"
import { browserEnv } from "@/lib/browser-env"
import { createFileRoute } from "@tanstack/react-router"
import { useAction, useQuery } from "convex/react"
import { Image as ImageIcon, ImageOff } from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

export const Route = createFileRoute("/_chat/library")({
    component: LibraryPage
})

const IMAGES_PER_PAGE = 50
type ImageSortOption = "newest" | "oldest"
type ImageLoadPlaceholder = "tiles" | "skeleton"

const GalleryImageSkeleton = memo(({ aspectRatio }: { aspectRatio: string }) => {
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

    return (
        <div
            className="overflow-hidden rounded-xl border border-border/60 bg-background"
            style={{ aspectRatio: cssAspectRatio }}
        >
            <Skeleton className="h-full w-full rounded-none bg-accent/70" />
        </div>
    )
})
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
            className="group relative overflow-hidden rounded-xl border bg-background"
            style={{ aspectRatio: cssAspectRatio }}
        >
            <ImageSkeleton
                rows={rows}
                cols={cols}
                dotSize={3}
                gap={4}
                loadingDuration={99999}
                autoLoop={false}
                className="h-full w-full rounded-xl border-0 bg-transparent"
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
        onImageSettled
    }: {
        image: Doc<"generatedImages">
        onClick: () => void
        placeholder?: ImageLoadPlaceholder
        onImageSettled?: () => void
    }) => {
        const [isError, setIsError] = useState(false)
        const [isLoaded, setIsLoaded] = useState(false)

        const imageUrl = `${browserEnv("VITE_CONVEX_API_URL")}/r2?key=${image.storageKey}`

        const handleImageLoad = useCallback(() => {
            setIsLoaded(true)
            onImageSettled?.()
        }, [onImageSettled])
        const handleImageError = useCallback(() => {
            setIsError(true)
            setIsLoaded(true)
            onImageSettled?.()
        }, [onImageSettled])

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

        if (isError) {
            return (
                <div
                    className="group relative overflow-hidden rounded-xl border bg-muted/50"
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
            <button
                type="button"
                className="group relative w-full appearance-none overflow-hidden rounded-xl border bg-background text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                style={{ aspectRatio: cssAspectRatio }}
                onClick={onClick}
            >
                {!isLoaded && (
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
                            <GalleryImageSkeleton aspectRatio={aspectRatio} />
                        )}
                    </div>
                )}
                <img
                    src={imageUrl}
                    alt={image.prompt || "AI generation"}
                    className={`absolute inset-0 h-full w-full object-cover transition-all duration-300 group-hover:scale-105 ${isLoaded ? "opacity-100" : "opacity-0"}`}
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                    loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 z-20 translate-y-2 bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                    <div className="line-clamp-2 text-white text-xs">
                        <p>{image.prompt || "No prompt"}</p>
                    </div>
                </div>
            </button>
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

    const [pendingGenerations, setPendingGenerations] = useState<
        { id: string; aspectRatio: string }[]
    >([])
    const [completedGenerationCount, setCompletedGenerationCount] = useState(0)
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
    const images = imagePage?.page ?? []
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

    if (!session.user?.id) {
        return (
            <div className="container mx-auto max-w-6xl px-4 pt-12 pb-8">
                <div className="mb-8">
                    <h1 className="mb-2 font-bold text-3xl">AI Library</h1>
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
        <div className="flex h-dvh w-full overflow-hidden">
            <ImageGenerationSidebar
                onGenerateStart={(info) => setPendingGenerations((prev) => [info, ...prev])}
                onGenerateComplete={(id) => {
                    setPendingGenerations((prev) => prev.filter((p) => p.id !== id))
                    setCompletedGenerationCount((prev) => prev + 1)
                }}
            />

            <div ref={galleryRef} className="flex-1 overflow-y-auto p-6">
                <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h1 className="mb-2 font-bold text-3xl">AI Library</h1>
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
                            onValueChange={(value) => handleSortChange(value as ImageSortOption)}
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
                                <Skeleton className="h-full w-full rounded-xl" />
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
                            {showPendingGenerations &&
                                pendingGenerations.map((pending) => (
                                    <div key={pending.id} className="mb-4 break-inside-avoid">
                                        <PendingImageItem aspectRatio={pending.aspectRatio} />
                                    </div>
                                ))}
                            {images.map((image) => (
                                <div key={image._id} className="mb-4 break-inside-avoid">
                                    <GeneratedImageItem
                                        image={image}
                                        placeholder={
                                            animatedImageIds.includes(image._id)
                                                ? "tiles"
                                                : "skeleton"
                                        }
                                        onClick={() => setSelectedImage(image)}
                                        onImageSettled={() => handleImageSettled(image._id)}
                                    />
                                </div>
                            ))}
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
            </div>

            <ImageDetailsModal
                image={selectedImage}
                isOpen={!!selectedImage}
                onClose={() => setSelectedImage(null)}
            />
        </div>
    )
}
