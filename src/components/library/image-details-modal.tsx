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
import { useMutation, useQuery } from "convex/react"
import { Download, ExternalLink, Trash2 } from "lucide-react"
import { useState } from "react"

interface ImageDetailsModalProps {
    image: Doc<"generatedImages"> | null
    isOpen: boolean
    onClose: () => void
}

export function ImageDetailsModal({ image, isOpen, onClose }: ImageDetailsModalProps) {
    const { models } = useSharedModels()
    const deleteImage = useMutation(api.images_node.deleteGeneratedImage)
    const metadata = useQuery(
        api.attachments.getFileMetadata,
        image ? { key: image.storageKey } : "skip"
    )
    const [isDeleting, setIsDeleting] = useState(false)

    if (!image) return null

    const imageUrl = getExpandedImageUrl({
        storageKey: image.storageKey,
        aspectRatio: image.aspectRatio
    })
    const fullResolutionUrl = metadata?.url || getGeneratedImageProxyUrl(image.storageKey)
    const model = models.find((m) => m.id === image.modelId)

    const handleDownload = () => {
        window.open(fullResolutionUrl, "_blank")
    }

    const handleViewFullResolution = () => {
        window.open(fullResolutionUrl, "_blank")
    }

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this image?")) return
        setIsDeleting(true)
        try {
            await deleteImage({ id: image._id as Id<"generatedImages"> })
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
                <div className="flex min-h-[50vh] flex-1 items-center justify-center bg-muted/30 p-4">
                    <img
                        src={imageUrl}
                        alt={image.prompt || "Generated Image"}
                        className="max-h-[80vh] w-auto rounded-md object-contain"
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
                            onClick={handleDelete}
                            disabled={isDeleting}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
