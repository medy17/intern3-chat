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
import { Download, ExternalLink, Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

interface ImageDetailsModalProps {
    image: Doc<"generatedImages"> | null
    isOpen: boolean
    onClose: () => void
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

    useEffect(() => {
        if (!image) return

        setLoadState("loading")

        return () => {
            if (revealTimeoutRef.current !== null) {
                window.clearTimeout(revealTimeoutRef.current)
            }
        }
    }, [image?._id])

    if (!image) return null

    const imageUrl = getExpandedImageUrl({
        storageKey: image.storageKey,
        aspectRatio: image.aspectRatio
    })
    const fullResolutionUrl = metadata?.url || getGeneratedImageProxyUrl(image.storageKey)
    const model = models.find((m) => m.id === image.modelId)

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
            <DialogContent className="flex max-w-5xl flex-col gap-0 overflow-hidden p-0 md:flex-row">
                <DialogHeader className="sr-only">
                    <DialogTitle>Image Details</DialogTitle>
                    <DialogDescription>Viewing details of a generated image.</DialogDescription>
                </DialogHeader>

                {/* Left side: Image Viewer */}
                <div className="relative flex min-h-[50vh] flex-1 items-center justify-center bg-muted/30 p-4">
                    {loadState !== "ready" && (
                        <div className="absolute inset-0 z-10 bg-gradient-to-br from-muted/70 via-muted/45 to-accent/25" />
                    )}
                    {loadState !== "ready" && (
                        <div className="absolute inset-x-0 bottom-4 z-10 mx-4 space-y-2 rounded-xl border border-border/40 bg-background/30 p-3 backdrop-blur-sm">
                            <div className="h-3 w-32 rounded bg-background/60" />
                            <div className="h-3 w-24 rounded bg-background/45" />
                        </div>
                    )}
                    {loadState !== "ready" && (
                        <ImageLoadIndicator complete={loadState === "revealing"} />
                    )}
                    <img
                        src={imageUrl}
                        alt={image.prompt || "Generated Image"}
                        className={cn(
                            "relative z-[5] max-h-[80vh] w-auto rounded-md object-contain transition-all duration-500",
                            loadState === "loading" && "scale-[1.02] opacity-0 blur-xl",
                            loadState === "revealing" && "scale-[1.01] opacity-100 blur-md",
                            loadState === "ready" && "scale-100 opacity-100 blur-0"
                        )}
                        style={{ aspectRatio: cssAspectRatio }}
                        onLoad={handleImageLoad}
                        onError={handleImageError}
                    />
                </div>

                {/* Right side: Metadata */}
                <div className="flex w-full flex-col gap-6 border-l bg-background p-6 md:w-80">
                    <div>
                        <h3 className="mb-2 font-semibold">Prompt</h3>
                        <p className="whitespace-pre-wrap text-muted-foreground text-sm">
                            {image.prompt || "No prompt available."}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <h3 className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                                Model
                            </h3>
                            <p className="text-sm">{model?.name || image.modelId || "Unknown"}</p>
                        </div>
                        <div>
                            <h3 className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                                Aspect Ratio
                            </h3>
                            <p className="text-sm">
                                {image.aspectRatio || image.resolution || "Unknown"}
                            </p>
                        </div>
                        <div>
                            <h3 className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                                Date
                            </h3>
                            <p className="text-sm">
                                {new Date(image.createdAt).toLocaleDateString()}
                            </p>
                        </div>
                    </div>

                    <div className="mt-auto flex gap-3 border-t pt-6">
                        <Button
                            variant="outline"
                            className="flex-1"
                            onClick={handleViewFullResolution}
                        >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Full Resolution
                        </Button>
                        <Button variant="secondary" className="flex-1" onClick={handleDownload}>
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
