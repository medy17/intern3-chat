import { ImageLoadIndicator } from "@/components/library/image-load-indicator"
import { usePrivateViewingStore } from "@/components/library/private-viewing-store"
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
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle
} from "@/components/ui/drawer"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { useIsMobile } from "@/hooks/use-mobile"
import {
    getExpandedImageUrl,
    getGeneratedImageDirectUrl,
    getGeneratedImageProxyUrl
} from "@/lib/generated-image-urls"
import { getIsImageHidden } from "@/lib/private-viewing"
import { useSharedModels } from "@/lib/shared-models"
import { cn } from "@/lib/utils"
import { useAction, useConvex, useMutation } from "convex/react"
import {
    Archive,
    Check,
    ChevronLeft,
    ChevronRight,
    Clipboard,
    Download,
    ExternalLink,
    RotateCcw,
    Trash2,
    X
} from "lucide-react"
import { memo, useEffect, useMemo, useRef, useState } from "react"

interface ImageDetailsModalProps {
    image: Doc<"generatedImages"> | null
    isOpen: boolean
    onClose: () => void
    isArchivedView?: boolean
    onPrevious?: () => void
    onNext?: () => void
    canNavigatePrevious?: boolean
    canNavigateNext?: boolean
    prefetchImageUrls?: string[]
    onDeleteStart?: (id: Id<"generatedImages">) => void
    onArchiveStart?: (id: Id<"generatedImages">) => void
    onRestoreStart?: (id: Id<"generatedImages">) => void
}

const DESKTOP_BREAKPOINT = 1100
const DESKTOP_GAP = 24
const DESKTOP_HORIZONTAL_CHROME = 96
const DESKTOP_VERTICAL_CHROME = 96
const DESKTOP_INFO_PANEL_WIDTH = 420
const DESKTOP_MAX_IMAGE_HEIGHT = 920
const MOBILE_HORIZONTAL_CHROME = 32
const MOBILE_VERTICAL_CHROME = 160
const MOBILE_MAX_IMAGE_HEIGHT_RATIO = 0.6
const DESKTOP_NAV_BUTTON_SPACE = 176
const loadedDetailImageUrls = new Set<string>()

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

export const ImageDetailsModal = memo(function ImageDetailsModal({
    image,
    isOpen,
    onClose,
    isArchivedView = false,
    onPrevious,
    onNext,
    canNavigatePrevious = false,
    canNavigateNext = false,
    prefetchImageUrls = [],
    onDeleteStart,
    onArchiveStart,
    onRestoreStart
}: ImageDetailsModalProps) {
    const isMobile = useIsMobile()
    const { models } = useSharedModels()
    const convex = useConvex()
    const deleteImage = useAction(api.images_node.deleteGeneratedImage)
    const archiveImage = useMutation(api.images.archiveGeneratedImage)
    const restoreImage = useMutation(api.images.restoreGeneratedImage)
    const privateViewingEnabled = usePrivateViewingStore((state) => state.privateViewingEnabled)
    const imageOverrides = usePrivateViewingStore((state) => state.imageOverrides)
    const [localImage, setLocalImage] = useState(image)
    const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null)
    const [isModalImageHidden, setIsModalImageHidden] = useState(false)
    useEffect(() => {
        if (image) {
            setLocalImage(image)
        }
    }, [image])

    useEffect(() => {
        let cancelled = false

        if (!localImage) {
            setMetadata(null)
            return
        }

        convex
            .query(api.attachments.getFileMetadata, { key: localImage.storageKey })
            .then((result) => {
                if (!cancelled) {
                    setMetadata(result)
                }
            })
            .catch((error) => {
                console.error("Failed to load image metadata:", error)
                if (!cancelled) {
                    setMetadata(null)
                }
            })

        return () => {
            cancelled = true
        }
    }, [convex, localImage])

    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [isPromptCopied, setIsPromptCopied] = useState(false)
    const [loadState, setLoadState] = useState<"loading" | "revealing" | "ready">("loading")
    const [viewportSize, setViewportSize] = useState({ width: 1440, height: 900 })
    const revealTimeoutRef = useRef<number | null>(null)
    const copyPromptTimeoutRef = useRef<number | null>(null)
    const imageRef = useRef<HTMLImageElement | null>(null)
    const aspectRatio = localImage?.aspectRatio || "1:1"
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
    const imageUrl = localImage
        ? getExpandedImageUrl({
              storageKey: localImage.storageKey,
              aspectRatio: localImage.aspectRatio
          })
        : ""

    useEffect(() => {
        if (!localImage || !isOpen) return

        if (revealTimeoutRef.current !== null) {
            window.clearTimeout(revealTimeoutRef.current)
            revealTimeoutRef.current = null
        }

        if (loadedDetailImageUrls.has(imageUrl)) {
            setLoadState("ready")
            return
        }

        setLoadState("loading")

        const syncCachedImageState = window.requestAnimationFrame(() => {
            const imageElement = imageRef.current
            if (!imageElement?.complete || imageElement.naturalWidth <= 0) {
                return
            }

            loadedDetailImageUrls.add(imageUrl)
            setLoadState("ready")
        })

        return () => {
            window.cancelAnimationFrame(syncCachedImageState)
            if (revealTimeoutRef.current !== null) {
                window.clearTimeout(revealTimeoutRef.current)
                revealTimeoutRef.current = null
            }
            if (copyPromptTimeoutRef.current !== null) {
                window.clearTimeout(copyPromptTimeoutRef.current)
                copyPromptTimeoutRef.current = null
            }
        }
    }, [imageUrl, isOpen, localImage])

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

    useEffect(() => {
        if (!isOpen || typeof window === "undefined" || prefetchImageUrls.length === 0) {
            return
        }

        const prefetchedImages = prefetchImageUrls
            .filter((url) => url && !loadedDetailImageUrls.has(url))
            .map((url) => {
                const image = new window.Image()
                image.decoding = "async"
                image.onload = () => {
                    loadedDetailImageUrls.add(url)
                }
                image.src = url
                return image
            })

        return () => {
            for (const image of prefetchedImages) {
                image.onload = null
                image.onerror = null
            }
        }
    }, [isOpen, prefetchImageUrls])

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

    const showDesktopNavButtons =
        layout.isDesktop &&
        viewportSize.width >= layout.shellWidth + DESKTOP_NAV_BUTTON_SPACE &&
        (canNavigatePrevious || canNavigateNext)

    const initialImageHidden = localImage
        ? getIsImageHidden({
              privateViewingEnabled,
              override: imageOverrides[localImage._id]
          })
        : false

    const handleImageLoad = () => {
        if (loadedDetailImageUrls.has(imageUrl)) {
            setLoadState("ready")
            return
        }

        loadedDetailImageUrls.add(imageUrl)
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
        loadedDetailImageUrls.delete(imageUrl)
        setLoadState("ready")
    }

    const handleDownload = () => {
        window.open(fullResolutionUrl, "_blank")
    }

    const handleViewFullResolution = () => {
        window.open(fullResolutionUrl, "_blank")
    }

    const handleCopyPrompt = () => {
        const prompt = localImage?.prompt?.trim()
        if (!prompt) {
            toast.error("No prompt available to copy")
            return
        }

        navigator.clipboard.writeText(prompt)
        setIsPromptCopied(true)
        if (copyPromptTimeoutRef.current !== null) {
            window.clearTimeout(copyPromptTimeoutRef.current)
        }
        copyPromptTimeoutRef.current = window.setTimeout(() => {
            setIsPromptCopied(false)
            copyPromptTimeoutRef.current = null
        }, 1500)
        toast.success("Prompt copied to clipboard")
    }

    const handleToggleImageVisibility = () => {
        setIsModalImageHidden((current) => !current)
    }

    useEffect(() => {
        if (!isOpen || !localImage) return

        setIsModalImageHidden(initialImageHidden)
    }, [initialImageHidden, isOpen, localImage])

    useEffect(() => {
        setIsPromptCopied(false)
    }, [localImage?._id, isOpen])

    useEffect(() => {
        if (!isOpen || isMobile) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
                return
            }

            const target = event.target
            if (
                target instanceof HTMLElement &&
                (target.isContentEditable ||
                    target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.tagName === "SELECT")
            ) {
                return
            }

            if (event.key === "ArrowLeft" && canNavigatePrevious && onPrevious) {
                event.preventDefault()
                onPrevious()
            }

            if (event.key === "ArrowRight" && canNavigateNext && onNext) {
                event.preventDefault()
                onNext()
            }
        }

        window.addEventListener("keydown", handleKeyDown)

        return () => {
            window.removeEventListener("keydown", handleKeyDown)
        }
    }, [canNavigateNext, canNavigatePrevious, isMobile, isOpen, onNext, onPrevious])

    if (!localImage) return null

    const isImageHidden = isModalImageHidden
    const fullResolutionUrl =
        getGeneratedImageDirectUrl(localImage.storageKey) ??
        getGeneratedImageProxyUrl(localImage.storageKey)
    const model = models.find((m) => m.id === localImage.modelId)
    const formattedDate = new Date(localImage.createdAt).toLocaleDateString()
    const resolutionLabel = localImage.resolution || "1K"

    const handleDelete = () => {
        const imageId = localImage._id as Id<"generatedImages">
        setShowDeleteDialog(false)
        onClose()
        if (onDeleteStart) {
            onDeleteStart(imageId)
        }

        // Fire and forget deletion
        deleteImage({ id: imageId }).catch((error) => {
            console.error("Failed to delete image", error)
        })
    }

    const handleArchiveStateChange = () => {
        const imageId = localImage._id as Id<"generatedImages">
        onClose()

        if (isArchivedView) {
            onRestoreStart?.(imageId)
            restoreImage({ id: imageId }).catch((error) => {
                console.error("Failed to restore image", error)
            })
            return
        }

        onArchiveStart?.(imageId)
        archiveImage({ id: imageId }).catch((error) => {
            console.error("Failed to archive image", error)
        })
    }
    const sharedAlertDialog = (
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Image</AlertDialogTitle>
                    <AlertDialogDescription>
                        Delete this generated image from your library? This will remove the stored
                        file and cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )

    if (isMobile) {
        return (
            <>
                <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
                    <DrawerContent className="flex h-[92dvh] max-h-[92dvh] flex-col gap-0 overflow-hidden border-border/60 bg-background p-0">
                        <DrawerHeader className="shrink-0 pb-0 text-left">
                            <DrawerTitle>Image Details</DrawerTitle>
                            <DrawerDescription>
                                Viewing details of a generated image.
                            </DrawerDescription>
                        </DrawerHeader>

                        {/* Top: Image Area */}
                        <div className="relative flex min-h-[16rem] flex-1 items-center justify-center overflow-hidden bg-background p-4">
                            {loadState !== "ready" && (
                                <div className="absolute inset-0 z-10 bg-gradient-to-br from-muted/85 via-muted/65 to-accent/20" />
                            )}
                            {loadState !== "ready" && (
                                <ImageLoadIndicator complete={loadState === "revealing"} />
                            )}
                            <button
                                type="button"
                                className="relative flex max-h-full min-h-[16rem] max-w-full shrink-0 items-center justify-center overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                style={{
                                    width: layout.imageWidth,
                                    height: layout.imageHeight,
                                    maxWidth: "100%",
                                    maxHeight: "100%"
                                }}
                                onClick={handleToggleImageVisibility}
                            >
                                <span className="sr-only">
                                    {isImageHidden ? "Unhide image" : "Hide image"}
                                </span>
                                <img
                                    ref={imageRef}
                                    src={imageUrl}
                                    alt={localImage.prompt || "Generated Image"}
                                    className={cn(
                                        "h-full w-full rounded-lg object-contain shadow-sm transition-all duration-500",
                                        loadState === "loading" && "scale-[1.02] opacity-0 blur-xl",
                                        loadState === "revealing" &&
                                            "scale-[1.01] opacity-100 blur-md",
                                        loadState === "ready" && "scale-100 opacity-100 blur-0",
                                        isImageHidden && "brightness-75 saturate-50"
                                    )}
                                    style={{ aspectRatio: cssAspectRatio }}
                                    onLoad={handleImageLoad}
                                    onError={handleImageError}
                                />
                                {isImageHidden && (
                                    <>
                                        <div className="pointer-events-none absolute inset-0 z-20 rounded-lg bg-black/20 backdrop-blur-xl" />
                                        <div className="pointer-events-none absolute inset-x-6 bottom-6 z-30 rounded-[var(--radius)] border border-white/15 bg-background/80 px-4 py-2 text-center text-sm shadow-lg backdrop-blur-md">
                                            Private viewing enabled
                                        </div>
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Bottom: Details Area */}
                        <div className="flex max-h-[42vh] shrink-0 flex-col border-border/60 border-t bg-background">
                            <div className="flex-1 space-y-6 overflow-y-auto p-5">
                                <div>
                                    <h3 className="mb-2 font-semibold text-xl">Prompt</h3>
                                    <p className="whitespace-pre-wrap text-muted-foreground text-sm leading-relaxed">
                                        {localImage.prompt || "No prompt available."}
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-border/60 border-t pt-2">
                                    <div>
                                        <h4 className="mb-1 font-medium text-[0.625rem] text-muted-foreground uppercase tracking-[0.18em]">
                                            Model
                                        </h4>
                                        <p className="font-medium text-xs">
                                            {model?.name || localImage.modelId || "Unknown"}
                                        </p>
                                    </div>
                                    <div>
                                        <h4 className="mb-1 font-medium text-[0.625rem] text-muted-foreground uppercase tracking-[0.18em]">
                                            Aspect Ratio
                                        </h4>
                                        <p className="font-medium text-xs">
                                            {localImage.aspectRatio || "Unknown"}
                                        </p>
                                    </div>
                                    <div>
                                        <h4 className="mb-1 font-medium text-[0.625rem] text-muted-foreground uppercase tracking-[0.18em]">
                                            Resolution
                                        </h4>
                                        <p className="font-medium text-xs">{resolutionLabel}</p>
                                    </div>
                                    <div>
                                        <h4 className="mb-1 font-medium text-[0.625rem] text-muted-foreground uppercase tracking-[0.18em]">
                                            Date
                                        </h4>
                                        <p className="font-medium text-xs">{formattedDate}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="border-border/60 border-t bg-background px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                                <div className="flex flex-nowrap items-center gap-2">
                                    <Button
                                        variant="outline"
                                        className="h-10 min-w-0 flex-1 text-xs"
                                        onClick={handleViewFullResolution}
                                    >
                                        <ExternalLink className="mr-1.5 h-4 w-4" />
                                        Full Res
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        className="h-10 w-10 shrink-0"
                                        onClick={handleDownload}
                                        aria-label="Download image"
                                    >
                                        <Download className="h-4 w-4" />
                                        <span className="sr-only">Download</span>
                                    </Button>
                                    <Button
                                        variant={isPromptCopied ? "secondary" : "outline"}
                                        size="icon"
                                        className="h-10 w-10 shrink-0"
                                        onClick={handleCopyPrompt}
                                        aria-label={
                                            isPromptCopied ? "Prompt copied" : "Copy prompt"
                                        }
                                    >
                                        {isPromptCopied ? (
                                            <Check className="h-4 w-4" />
                                        ) : (
                                            <Clipboard className="h-4 w-4" />
                                        )}
                                        <span className="sr-only">
                                            {isPromptCopied ? "Copied" : "Copy Prompt"}
                                        </span>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-10 w-10 shrink-0"
                                        onClick={handleArchiveStateChange}
                                        aria-label={
                                            isArchivedView ? "Restore image" : "Archive image"
                                        }
                                    >
                                        {isArchivedView ? (
                                            <RotateCcw className="h-4 w-4" />
                                        ) : (
                                            <Archive className="h-4 w-4" />
                                        )}
                                        <span className="sr-only">
                                            {isArchivedView ? "Restore" : "Archive"}
                                        </span>
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="icon"
                                        className="h-10 w-10 shrink-0"
                                        onClick={() => setShowDeleteDialog(true)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </DrawerContent>
                </Drawer>
                {sharedAlertDialog}
            </>
        )
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                showCloseButton={false}
                overlayClassName="backdrop-blur-md"
                className="w-fit max-w-none border-0 bg-transparent p-0 shadow-none sm:max-w-none"
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
                    {showDesktopNavButtons && (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="-left-[4.5rem] -translate-y-1/2 absolute top-1/2 z-20 h-11 w-11 rounded-lg border-border/70 bg-background/85 text-foreground shadow-lg backdrop-blur-md hover:bg-accent/80 disabled:pointer-events-none disabled:opacity-35"
                                onClick={onPrevious}
                                disabled={!canNavigatePrevious}
                            >
                                <span className="sr-only">Previous image</span>
                                <ChevronLeft className="h-5 w-5" />
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="-right-[4.5rem] -translate-y-1/2 absolute top-1/2 z-20 h-11 w-11 rounded-lg border-border/70 bg-background/85 text-foreground shadow-lg backdrop-blur-md hover:bg-accent/80 disabled:pointer-events-none disabled:opacity-35"
                                onClick={onNext}
                                disabled={!canNavigateNext}
                            >
                                <span className="sr-only">Next image</span>
                                <ChevronRight className="h-5 w-5" />
                            </Button>
                        </>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="-top-14 lg:-right-[4.5rem] absolute right-0 z-20 h-11 w-11 rounded-lg border border-border/70 bg-background/85 text-foreground shadow-lg backdrop-blur-sm hover:bg-accent lg:top-0"
                        onClick={onClose}
                    >
                        <span className="sr-only">Close</span>
                        <X className="h-4 w-4" />
                    </Button>

                    <div
                        className="relative shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/35 shadow-2xl"
                        style={{
                            width: layout.imageWidth,
                            height: layout.imageHeight
                        }}
                    >
                        {loadState !== "ready" && (
                            <div className="absolute inset-0 z-10 bg-gradient-to-br from-muted/85 via-muted/65 to-accent/20" />
                        )}
                        {loadState !== "ready" && (
                            <div className="absolute inset-x-0 bottom-4 z-10 mx-4 space-y-2 rounded-lg border border-border/50 bg-background/55 p-3 backdrop-blur-sm">
                                <div className="h-3 w-32 rounded bg-background/70" />
                                <div className="h-3 w-24 rounded bg-background/45" />
                            </div>
                        )}
                        {loadState !== "ready" && (
                            <ImageLoadIndicator complete={loadState === "revealing"} />
                        )}
                        <button
                            type="button"
                            className="flex h-full w-full items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            onClick={handleToggleImageVisibility}
                        >
                            <span className="sr-only">
                                {isImageHidden ? "Unhide image" : "Hide image"}
                            </span>
                            <img
                                ref={imageRef}
                                src={imageUrl}
                                alt={localImage.prompt || "Generated Image"}
                                className={cn(
                                    "h-full w-full object-contain transition-all duration-500",
                                    loadState === "loading" && "scale-[1.02] opacity-0 blur-xl",
                                    loadState === "revealing" && "scale-[1.01] opacity-100 blur-md",
                                    loadState === "ready" && "scale-100 opacity-100 blur-0",
                                    isImageHidden && "brightness-75 saturate-50"
                                )}
                                style={{ aspectRatio: cssAspectRatio }}
                                onLoad={handleImageLoad}
                                onError={handleImageError}
                            />
                        </button>
                        {isImageHidden && (
                            <>
                                <div className="pointer-events-none absolute inset-0 z-20 bg-black/20 backdrop-blur-xl" />
                                <div className="pointer-events-none absolute inset-x-6 bottom-6 z-30 rounded-[var(--radius)] border border-white/15 bg-background/80 px-4 py-2 text-center text-sm shadow-lg backdrop-blur-md">
                                    Private viewing enabled
                                </div>
                            </>
                        )}
                    </div>

                    <div
                        className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-background/95 shadow-2xl backdrop-blur-md"
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
                                    {localImage.prompt || "No prompt available."}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-border/60 border-t pt-6">
                                <div>
                                    <h4 className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
                                        Model
                                    </h4>
                                    <p className="text-sm">
                                        {model?.name || localImage.modelId || "Unknown"}
                                    </p>
                                </div>
                                <div>
                                    <h4 className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
                                        Aspect Ratio
                                    </h4>
                                    <p className="text-sm">{localImage.aspectRatio || "Unknown"}</p>
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
                            <div className="flex flex-nowrap items-center gap-3">
                                <Button
                                    variant="outline"
                                    className="min-w-0 flex-1"
                                    onClick={handleViewFullResolution}
                                >
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Full Resolution
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="h-10 w-10 shrink-0"
                                    onClick={handleDownload}
                                    aria-label="Download image"
                                >
                                    <Download className="h-4 w-4" />
                                    <span className="sr-only">Download</span>
                                </Button>
                                <Button
                                    variant={isPromptCopied ? "secondary" : "outline"}
                                    size="icon"
                                    className="h-10 w-10 shrink-0"
                                    onClick={handleCopyPrompt}
                                    aria-label={isPromptCopied ? "Prompt copied" : "Copy prompt"}
                                >
                                    {isPromptCopied ? (
                                        <Check className="h-4 w-4" />
                                    ) : (
                                        <Clipboard className="h-4 w-4" />
                                    )}
                                    <span className="sr-only">
                                        {isPromptCopied ? "Copied" : "Copy Prompt"}
                                    </span>
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-10 w-10 shrink-0"
                                    onClick={handleArchiveStateChange}
                                    aria-label={isArchivedView ? "Restore image" : "Archive image"}
                                >
                                    {isArchivedView ? (
                                        <RotateCcw className="h-4 w-4" />
                                    ) : (
                                        <Archive className="h-4 w-4" />
                                    )}
                                    <span className="sr-only">
                                        {isArchivedView ? "Restore" : "Archive"}
                                    </span>
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="icon"
                                    onClick={() => setShowDeleteDialog(true)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
            {sharedAlertDialog}
        </Dialog>
    )
})
