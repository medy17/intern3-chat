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
import { toast } from "sonner"

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
const MOBILE_FULLSCREEN_IMAGE_CHROME = 136
const MOBILE_PREVIEW_TOP_OFFSET = 88
const MOBILE_PREVIEW_GAP_ABOVE_DRAWER = 24
const MOBILE_PREVIEW_MIN_HEIGHT = 180
const MOBILE_BOTTOM_ACTION_SAFE_SPACE = 16
const MOBILE_DRAWER_HANDLE_HEIGHT = 24
const MOBILE_DETAILS_DRAWER_MAX_HEIGHT = 420
const MOBILE_DETAILS_TRANSITION_MS = 280
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

function fitAspectRatioBox({
    aspectRatioValue,
    maxWidth,
    maxHeight,
    minWidth = 0,
    minHeight = 0
}: {
    aspectRatioValue: number
    maxWidth: number
    maxHeight: number
    minWidth?: number
    minHeight?: number
}) {
    let width = maxWidth
    let height = width / aspectRatioValue

    if (height > maxHeight) {
        height = maxHeight
        width = height * aspectRatioValue
    }

    if (width < minWidth) {
        width = minWidth
        height = width / aspectRatioValue
    }

    if (height < minHeight) {
        height = minHeight
        width = height * aspectRatioValue
    }

    return { width, height }
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
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)
    const [isDetailsPreviewVisible, setIsDetailsPreviewVisible] = useState(false)
    const [isPromptCopied, setIsPromptCopied] = useState(false)
    const [loadState, setLoadState] = useState<"loading" | "revealing" | "ready">("loading")
    const [viewportSize, setViewportSize] = useState({ width: 1440, height: 900 })
    const [mobileDrawerTop, setMobileDrawerTop] = useState<number | null>(null)
    const revealTimeoutRef = useRef<number | null>(null)
    const copyPromptTimeoutRef = useRef<number | null>(null)
    const imageRef = useRef<HTMLImageElement | null>(null)
    const mobileDrawerRef = useRef<HTMLDivElement | null>(null)
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
                mobileFullscreenImage: { width: imageWidth, height: imageHeight },
                mobilePreviewImage: { width: imageWidth, height: imageHeight },
                mobileDetailsMaxHeight: 0,
                infoWidth: DESKTOP_INFO_PANEL_WIDTH,
                shellWidth: imageWidth + DESKTOP_GAP + DESKTOP_INFO_PANEL_WIDTH
            }
        }

        const fullscreenImage = fitAspectRatioBox({
            aspectRatioValue,
            maxWidth: Math.max(280, viewportSize.width - MOBILE_HORIZONTAL_CHROME),
            maxHeight: Math.max(240, viewportSize.height - MOBILE_FULLSCREEN_IMAGE_CHROME)
        })
        const mobileDetailsMaxHeight = Math.min(
            MOBILE_DETAILS_DRAWER_MAX_HEIGHT,
            viewportSize.height * 0.54
        )
        const fallbackDrawerTop =
            viewportSize.height - mobileDetailsMaxHeight - MOBILE_DRAWER_HANDLE_HEIGHT
        const resolvedDrawerTop =
            mobileDrawerTop === null
                ? fallbackDrawerTop
                : Math.min(mobileDrawerTop, fallbackDrawerTop)
        const mobilePreviewMaxHeight = Math.max(
            MOBILE_PREVIEW_MIN_HEIGHT,
            resolvedDrawerTop -
                MOBILE_PREVIEW_TOP_OFFSET -
                MOBILE_PREVIEW_GAP_ABOVE_DRAWER -
                MOBILE_BOTTOM_ACTION_SAFE_SPACE
        )
        const previewImage = fitAspectRatioBox({
            aspectRatioValue,
            maxWidth: Math.max(220, viewportSize.width - MOBILE_HORIZONTAL_CHROME),
            maxHeight: mobilePreviewMaxHeight
        })

        return {
            isDesktop: false,
            imageWidth: fullscreenImage.width,
            imageHeight: fullscreenImage.height,
            mobileFullscreenImage: fullscreenImage,
            mobilePreviewImage: previewImage,
            mobileDetailsMaxHeight,
            mobileDrawerTop: resolvedDrawerTop,
            infoWidth: fullscreenImage.width,
            shellWidth: fullscreenImage.width
        }
    }, [aspectRatioValue, mobileDrawerTop, viewportSize.height, viewportSize.width])

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

    const openDetailsDrawer = () => {
        setIsDetailsPreviewVisible(true)
        setMobileDrawerTop(layout.mobileDrawerTop ?? null)
        window.requestAnimationFrame(() => {
            setIsDetailsOpen(true)
        })
    }

    useEffect(() => {
        if (!isOpen || !localImage) return

        setIsModalImageHidden(initialImageHidden)
    }, [initialImageHidden, isOpen, localImage])

    useEffect(() => {
        setIsPromptCopied(false)
    }, [localImage?._id, isOpen])

    useEffect(() => {
        if (!isOpen) {
            setIsDetailsOpen(false)
            setIsDetailsPreviewVisible(false)
            setMobileDrawerTop(null)
        }
    }, [isOpen])

    useEffect(() => {
        setIsDetailsOpen(false)
        setIsDetailsPreviewVisible(false)
        setMobileDrawerTop(null)
    }, [localImage?._id])

    useEffect(() => {
        if (isDetailsOpen || !isDetailsPreviewVisible) return

        const timeoutId = window.setTimeout(() => {
            setIsDetailsPreviewVisible(false)
            setMobileDrawerTop(null)
        }, MOBILE_DETAILS_TRANSITION_MS)

        return () => window.clearTimeout(timeoutId)
    }, [isDetailsOpen, isDetailsPreviewVisible])

    useEffect(() => {
        if (!isMobile || !isOpen || !isDetailsOpen || typeof window === "undefined") {
            setMobileDrawerTop(null)
            return
        }

        let frameId = 0
        let previousTop = -1

        const updateDrawerTop = () => {
            const nextTop = mobileDrawerRef.current?.getBoundingClientRect().top ?? null
            if (nextTop !== null && Math.abs(nextTop - previousTop) > 0.5) {
                previousTop = nextTop
                setMobileDrawerTop(nextTop)
            }

            frameId = window.requestAnimationFrame(updateDrawerTop)
        }

        frameId = window.requestAnimationFrame(updateDrawerTop)

        return () => {
            window.cancelAnimationFrame(frameId)
        }
    }, [isDetailsOpen, isMobile, isOpen])

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
        const isDetailsExpanded = isDetailsPreviewVisible || isDetailsOpen

        return (
            <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DialogContent
                    showCloseButton={false}
                    overlayClassName="bg-black/92 backdrop-blur-md"
                    className="pointer-events-none inset-0 z-[70] h-[100dvh] max-h-none w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-transparent p-0 shadow-none"
                    onEscapeKeyDown={(event) => {
                        if (isDetailsOpen) {
                            event.preventDefault()
                            setIsDetailsOpen(false)
                        }
                    }}
                >
                    <div className="pointer-events-none relative h-full w-full">
                        <div className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-4 left-4 z-20 flex items-center justify-end">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="pointer-events-auto h-11 w-11 rounded-full border border-white/15 bg-background/15 text-white shadow-lg backdrop-blur-md hover:bg-background/25"
                                onClick={onClose}
                            >
                                <span className="sr-only">Close</span>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div
                            className={cn(
                                "absolute inset-x-0 transition-[top,bottom] duration-300 ease-out",
                                isDetailsExpanded
                                    ? "top-[calc(env(safe-area-inset-top)+4.5rem)]"
                                    : "top-[calc(env(safe-area-inset-top)+4rem)] bottom-[calc(env(safe-area-inset-bottom)+4.5rem)]"
                            )}
                        >
                            <div
                                className={cn(
                                    "flex h-full w-full justify-center px-4 transition-[align-items] duration-300 ease-out",
                                    isDetailsExpanded ? "items-start" : "items-center"
                                )}
                            >
                                <button
                                    type="button"
                                    className="pointer-events-auto relative flex items-center justify-center overflow-hidden rounded-[var(--radius-xl)] outline-none transition-[width,height,transform] duration-300 ease-out focus-visible:ring-2 focus-visible:ring-primary"
                                    style={{
                                        width: isDetailsExpanded
                                            ? layout.mobilePreviewImage.width
                                            : layout.mobileFullscreenImage.width,
                                        height: isDetailsExpanded
                                            ? layout.mobilePreviewImage.height
                                            : layout.mobileFullscreenImage.height,
                                        maxWidth: "100%",
                                        maxHeight: "100%",
                                        willChange: "width, height"
                                    }}
                                    onClick={handleToggleImageVisibility}
                                >
                                    <span className="sr-only">
                                        {isImageHidden ? "Unhide image" : "Hide image"}
                                    </span>
                                    {loadState !== "ready" && (
                                        <div className="absolute inset-0 z-10 bg-gradient-to-br from-muted/85 via-muted/65 to-accent/20" />
                                    )}
                                    {loadState !== "ready" && (
                                        <ImageLoadIndicator complete={loadState === "revealing"} />
                                    )}
                                    <img
                                        ref={imageRef}
                                        src={imageUrl}
                                        alt={localImage.prompt || "Generated Image"}
                                        className={cn(
                                            "h-full w-full rounded-[var(--radius-xl)] object-contain shadow-2xl transition-all duration-500",
                                            loadState === "loading" &&
                                                "scale-[1.02] opacity-0 blur-xl",
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
                                            <div className="pointer-events-none absolute inset-0 z-20 rounded-[var(--radius-xl)] bg-black/20 backdrop-blur-xl" />
                                            <div className="pointer-events-none absolute inset-x-6 bottom-6 z-30 rounded-[var(--radius)] border border-white/15 bg-background/80 px-4 py-2 text-center text-foreground text-sm shadow-lg backdrop-blur-md">
                                                Private viewing enabled
                                            </div>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {!isDetailsExpanded && (
                            <div className="pointer-events-none absolute right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-4 z-20 flex justify-center">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="pointer-events-auto h-11 rounded-full px-5 text-sm shadow-lg backdrop-blur-md"
                                    onClick={openDetailsDrawer}
                                >
                                    View Details
                                </Button>
                            </div>
                        )}

                        <Drawer
                            open={isDetailsOpen}
                            onOpenChange={setIsDetailsOpen}
                            nested
                            modal={false}
                        >
                            <DrawerContent
                                ref={mobileDrawerRef}
                                className="z-[80] max-h-[80dvh] min-h-0 overflow-hidden border-border/60 bg-background/98 backdrop-blur-xl"
                                overlayClassName="z-[79] bg-transparent"
                                style={{
                                    maxHeight: `${layout.mobileDetailsMaxHeight}px`
                                }}
                            >
                                <DrawerHeader className="shrink-0 text-left">
                                    <DrawerTitle>Image Details</DrawerTitle>
                                    <DrawerDescription>
                                        Prompt, metadata, and actions for this image.
                                    </DrawerDescription>
                                </DrawerHeader>
                                <div
                                    data-vaul-no-drag
                                    className="min-h-0 flex-1 touch-pan-y space-y-6 overflow-y-auto overscroll-contain px-5 pb-4"
                                    onTouchMoveCapture={(event) => event.stopPropagation()}
                                >
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
                            </DrawerContent>
                        </Drawer>
                    </div>
                    {sharedAlertDialog}
                </DialogContent>
            </Dialog>
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
