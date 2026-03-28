import { ImageLoadIndicator } from "@/components/library/image-load-indicator"
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { getExpandedImageUrl, getGeneratedImageProxyUrl } from "@/lib/generated-image-urls"
import { useSharedModels } from "@/lib/shared-models"
import { cn } from "@/lib/utils"
import { useAction, useQuery } from "convex/react"
import { Download, ExternalLink, Trash2, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

interface ImageDetailsModalProps {
    image: Doc<"generatedImages"> | null
    isOpen: boolean
    onClose: () => void
}

const DESKTOP_BREAKPOINT = 1100
const DESKTOP_GAP = 24
const DESKTOP_HORIZONTAL_CHROME = 96
const DESKTOP_VERTICAL_CHROME = 96
const DESKTOP_INFO_PANEL_WIDTH = 360
const DESKTOP_MAX_IMAGE_HEIGHT = 920
const MOBILE_HORIZONTAL_CHROME = 32
const MOBILE_VERTICAL_CHROME = 160
const MOBILE_MAX_IMAGE_HEIGHT_RATIO = 0.52

function getAspectRatioValue(aspectRatio: string) {
    if (aspectRatio.includes("x")) {
        const [width, height] = aspectRatio.split("x").map(Number)
        return width > 0 && height > 0 ? width / height : 1
    }

    if (aspectRatio.includes(":")) {
        const [width, height] = aspectRatio.replace("-hd", "").split(":").map(Number)
        return width > 0 && height > 0 ? width / height : 1
    }

    return 1
}

export function ImageDetailsModal({ image, isOpen, onClose }: ImageDetailsModalProps) {
    const { models } = useSharedModels()
    const deleteImage = useAction(api.images_node.deleteGeneratedImage)
    const metadata = useQuery(
        api.attachments.getFileMetadata,
        image ? { key: image.storageKey } : "skip"
    )
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [loadState, setLoadState] = useState<"loading" | "revealing" | "ready">("loading")
    const [viewportSize, setViewportSize] = useState({ width: 1440, height: 900 })
    const revealTimeoutRef = useRef<number | null>(null)
    const aspectRatio = image?.aspectRatio || "1:1"
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
    const aspectRatioValue = useMemo(() => getAspectRatioValue(aspectRatio), [aspectRatio])

    useEffect(() => {
        if (!image) return

        setLoadState("loading")

        return () => {
            if (revealTimeoutRef.current !== null) {
                window.clearTimeout(revealTimeoutRef.current)
            }
        }
    }, [image?._id])

    useEffect(() => {
        if (!isOpen || typeof window === "undefined") return

        const updateViewportSize = () => {
            setViewportSize({
                width: window.innerWidth,
                height: window.innerHeight
            })
        }

        updateViewportSize()
        window.addEventListener("resize", updateViewportSize)

        return () => {
            window.removeEventListener("resize", updateViewportSize)
        }
    }, [isOpen])

    const layout = useMemo(() => {
        const isDesktop = viewportSize.width >= DESKTOP_BREAKPOINT

        if (isDesktop) {
            const maxImageHeight = Math.max(
                320,
                Math.min(DESKTOP_MAX_IMAGE_HEIGHT, viewportSize.height - DESKTOP_VERTICAL_CHROME)
            )
            const maxImageWidth = Math.max(
                320,
                viewportSize.width -
                    DESKTOP_INFO_PANEL_WIDTH -
                    DESKTOP_GAP -
                    DESKTOP_HORIZONTAL_CHROME
            )
            const imageHeight = Math.min(maxImageHeight, maxImageWidth / aspectRatioValue)
            const imageWidth = imageHeight * aspectRatioValue

            return {
                isDesktop: true,
                imageWidth,
                imageHeight,
                infoWidth: DESKTOP_INFO_PANEL_WIDTH,
                shellWidth: imageWidth + DESKTOP_GAP + DESKTOP_INFO_PANEL_WIDTH
            }
        }

        const maxImageWidth = Math.max(280, viewportSize.width - MOBILE_HORIZONTAL_CHROME)
        const maxImageHeight = Math.max(
            240,
            viewportSize.height * MOBILE_MAX_IMAGE_HEIGHT_RATIO - MOBILE_VERTICAL_CHROME / 3
        )

        let imageWidth = maxImageWidth
        let imageHeight = imageWidth / aspectRatioValue

        if (imageHeight > maxImageHeight) {
            imageHeight = maxImageHeight
            imageWidth = imageHeight * aspectRatioValue
        }

        return {
            isDesktop: false,
            imageWidth,
            imageHeight,
            infoWidth: imageWidth,
            shellWidth: maxImageWidth
        }
    }, [aspectRatioValue, viewportSize.height, viewportSize.width])

    if (!image) return null

    const imageUrl = getExpandedImageUrl({
        storageKey: image.storageKey,
        aspectRatio: image.aspectRatio
    })
    const fullResolutionUrl = metadata?.url || getGeneratedImageProxyUrl(image.storageKey)
    const model = models.find((m) => m.id === image.modelId)
    const formattedDate = new Date(image.createdAt).toLocaleDateString()
    const resolutionLabel = image.resolution || "1K"

    const handleImageLoad = () => {
        setLoadState("revealing")

        if (revealTimeoutRef.current !== null) {
            window.clearTimeout(revealTimeoutRef.current)
        }

        revealTimeoutRef.current = window.setTimeout(() => {
            setLoadState("ready")
            revealTimeoutRef.current = null
        }, 240)
    }

    const handleImageError = () => {
        setLoadState("ready")
    }

    const handleDownload = () => {
        window.open(fullResolutionUrl, "_blank")
    }

    const handleViewFullResolution = () => {
        window.open(fullResolutionUrl, "_blank")
    }

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            await deleteImage({ id: image._id as Id<"generatedImages"> })
            setShowDeleteDialog(false)
            onClose()
        } catch (error) {
            console.error("Failed to delete image", error)
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                showCloseButton={false}
                className="max-w-none border-0 bg-transparent p-0 shadow-none sm:max-w-none"
            >
                <DialogHeader className="sr-only">
                    <DialogTitle>Image Details</DialogTitle>
                    <DialogDescription>Viewing details of a generated image.</DialogDescription>
                </DialogHeader>
                <div
                    className={cn(
                        "relative mx-auto flex items-start",
                        layout.isDesktop ? "flex-row gap-6" : "flex-col gap-4"
                    )}
                    style={{ width: layout.shellWidth }}
                >
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="-top-14 absolute right-0 z-20 rounded-full border border-border/60 bg-background/90 shadow-lg backdrop-blur-sm hover:bg-accent"
                        onClick={onClose}
                    >
                        <span className="sr-only">Close</span>
                        <X className="h-4 w-4" />
                    </Button>

                    <div
                        className="relative shrink-0 overflow-hidden rounded-3xl border border-border/60 bg-muted/35 shadow-2xl"
                        style={{
                            width: layout.imageWidth,
                            height: layout.imageHeight
                        }}
                    >
                        {loadState !== "ready" && (
                            <div className="absolute inset-0 z-10 bg-gradient-to-br from-muted/85 via-muted/65 to-accent/20" />
                        )}
                        {loadState !== "ready" && (
                            <div className="absolute inset-x-0 bottom-4 z-10 mx-4 space-y-2 rounded-2xl border border-border/50 bg-background/55 p-3 backdrop-blur-sm">
                                <div className="h-3 w-32 rounded bg-background/70" />
                                <div className="h-3 w-24 rounded bg-background/45" />
                            </div>
                        )}
                        {loadState !== "ready" && (
                            <ImageLoadIndicator complete={loadState === "revealing"} />
                        )}
                        <div className="flex h-full w-full items-center justify-center">
                            <img
                                src={imageUrl}
                                alt={image.prompt || "Generated Image"}
                                className={cn(
                                    "h-full w-full object-contain transition-all duration-500",
                                    loadState === "loading" && "scale-[1.02] opacity-0 blur-xl",
                                    loadState === "revealing" && "scale-[1.01] opacity-100 blur-md",
                                    loadState === "ready" && "scale-100 opacity-100 blur-0"
                                )}
                                style={{ aspectRatio: cssAspectRatio }}
                                onLoad={handleImageLoad}
                                onError={handleImageError}
                            />
                        </div>
                    </div>

                    <div
                        className="flex shrink-0 flex-col overflow-hidden rounded-3xl border border-border/60 bg-background/95 shadow-2xl backdrop-blur-md"
                        style={{
                            width: layout.infoWidth,
                            height: layout.isDesktop ? layout.imageHeight : undefined,
                            minHeight: layout.isDesktop ? layout.imageHeight : undefined
                        }}
                    >
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="mb-6">
                                <h3 className="mb-3 font-semibold text-2xl">Prompt</h3>
                                <p className="whitespace-pre-wrap text-base text-muted-foreground leading-7">
                                    {image.prompt || "No prompt available."}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-border/60 border-t pt-6">
                                <div>
                                    <h4 className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
                                        Model
                                    </h4>
                                    <p className="text-sm">
                                        {model?.name || image.modelId || "Unknown"}
                                    </p>
                                </div>
                                <div>
                                    <h4 className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
                                        Aspect Ratio
                                    </h4>
                                    <p className="text-sm">{image.aspectRatio || "Unknown"}</p>
                                </div>
                                <div>
                                    <h4 className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
                                        Resolution
                                    </h4>
                                    <p className="text-sm">{resolutionLabel}</p>
                                </div>
                                <div>
                                    <h4 className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
                                        Date
                                    </h4>
                                    <p className="text-sm">{formattedDate}</p>
                                </div>
                            </div>
                        </div>

                        <div className="border-border/60 border-t p-4">
                            <div className="flex flex-wrap gap-3">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={handleViewFullResolution}
                                >
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Full Resolution
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={handleDownload}
                                >
                                    <Download className="mr-2 h-4 w-4" />
                                    Download
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="icon"
                                    onClick={() => setShowDeleteDialog(true)}
                                    disabled={isDeleting}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Image</AlertDialogTitle>
                        <AlertDialogDescription>
                            Delete this generated image from your library? This will remove the
                            stored file and cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    )
}
