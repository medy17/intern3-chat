import { ImageDetailsModal } from "@/components/library/image-details-modal"
import { ImageGenerationSidebar } from "@/components/library/image-generation-sidebar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ImageSkeleton } from "@/components/ui/image-skeleton"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import { useSession } from "@/hooks/auth-hooks"
import { browserEnv } from "@/lib/browser-env"
import { createFileRoute } from "@tanstack/react-router"
import { useAction, useQuery } from "convex/react"
import { Image as ImageIcon, ImageOff } from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useState } from "react"

export const Route = createFileRoute("/_chat/library")({
    component: LibraryPage
})

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

const GeneratedImageItem = memo(({ image, onClick }: { image: any; onClick: () => void }) => {
    const [isError, setIsError] = useState(false)
    const [isLoaded, setIsLoaded] = useState(false)

    const imageUrl = `${browserEnv("VITE_CONVEX_API_URL")}/r2?key=${image.storageKey}`

    const handleImageLoad = useCallback(() => setIsLoaded(true), [])
    const handleImageError = useCallback(() => {
        setIsError(true)
        setIsLoaded(true)
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
        <div
            className="group relative cursor-pointer overflow-hidden rounded-xl border bg-background"
            style={{ aspectRatio: cssAspectRatio }}
            onClick={onClick}
        >
            {!isLoaded && (
                <div className="absolute inset-0 z-10 bg-background">
                    <ImageSkeleton
                        rows={rows}
                        cols={cols}
                        dotSize={3}
                        gap={4}
                        loadingDuration={99999}
                        autoLoop={false}
                        className="h-full w-full border-0 bg-transparent"
                    />
                </div>
            )}
            <img
                src={imageUrl}
                alt={image.prompt || "AI generation"}
                className={`absolute inset-0 h-full w-full object-cover transition-all duration-300 group-hover:scale-105 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={handleImageLoad}
                onError={handleImageError}
                loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 z-20 translate-y-2 bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                <div className="line-clamp-2 text-white text-xs">
                    <p>{image.prompt || "No prompt"}</p>
                </div>
            </div>
        </div>
    )
})
GeneratedImageItem.displayName = "GeneratedImageItem"

function LibraryPage() {
    const session = useSession()
    const images = useQuery(api.images.listGeneratedImages, session.user?.id ? {} : "skip")
    const migrateImages = useAction(api.images_node.migrateUserImages)

    const [pendingGenerations, setPendingGenerations] = useState<
        { id: string; aspectRatio: string }[]
    >([])

    useEffect(() => {
        if (session.user?.id) {
            // Run migration in background. It checks for missing DB entries.
            migrateImages().catch(console.error)
        }
    }, [session.user?.id, migrateImages])

    const [selectedImage, setSelectedImage] = useState<any | null>(null)

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
                onGenerateComplete={(id) =>
                    setPendingGenerations((prev) => prev.filter((p) => p.id !== id))
                }
            />

            <div className="flex-1 overflow-y-auto p-6">
                <div className="mb-8">
                    <h1 className="mb-2 font-bold text-3xl">AI Library</h1>
                    <p className="text-muted-foreground">Your collection of AI-generated images</p>
                    {images && (
                        <div className="mt-2 text-muted-foreground text-sm">
                            {images.length} images
                        </div>
                    )}
                </div>

                {!images ? (
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
                ) : images.length === 0 && pendingGenerations.length === 0 ? (
                    <div className="py-24 text-center">
                        <ImageIcon className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
                        <h3 className="mb-2 font-medium text-xl">No generated images yet</h3>
                        <p className="mx-auto max-w-sm text-muted-foreground">
                            Generate images using the sidebar to see them appear here.
                        </p>
                    </div>
                ) : (
                    <div className="columns-1 gap-4 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5">
                        {pendingGenerations.map((pending) => (
                            <div key={pending.id} className="mb-4 break-inside-avoid">
                                <PendingImageItem aspectRatio={pending.aspectRatio} />
                            </div>
                        ))}
                        {images.map((image) => (
                            <div key={image._id} className="mb-4 break-inside-avoid">
                                <GeneratedImageItem
                                    image={image}
                                    onClick={() => setSelectedImage(image)}
                                />
                            </div>
                        ))}
                    </div>
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
