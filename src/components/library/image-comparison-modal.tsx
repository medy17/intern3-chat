import { useImageViewerLoad } from "@/hooks/use-image-viewer-load"
import { useImageViewerActions } from "@/hooks/use-image-viewer-actions"
import { ImageLoadIndicator } from "@/components/library/image-load-indicator"
import { ImageMetadataPanel } from "@/components/library/image-metadata-panel"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Doc } from "@/convex/_generated/dataModel"
import {
    type GeneratedImageRecoveryPhase,
    getNextGeneratedImageRecoveryPhase,
    resolveGeneratedImageRenderSource
} from "@/lib/generated-image-recovery"
import {
    getExpandedImageUrl,
    getGeneratedImageDirectUrl,
    getGeneratedImageProxyUrl
} from "@/lib/generated-image-urls"
import { fitImageAspectRatioBox, getImageAspectRatioValue } from "@/lib/image-aspect-ratios"
import { useSharedModels } from "@/lib/shared-models"
import { cn } from "@/lib/utils"
import {
    ArrowLeftRight,
    Check,
    ChevronsLeftRight,
    Clipboard,
    Columns2,
    Download,
    ExternalLink,
    SquareSplitHorizontal,
    X
} from "lucide-react"
import {
    type CSSProperties,
    type MouseEvent as ReactMouseEvent,
    type ReactNode,
    type PointerEvent as ReactPointerEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react"

type GeneratedImage = Doc<"generatedImages">

type ComparisonMode = "side-by-side" | "slider"

interface ImageComparisonModalProps {
    images: readonly [GeneratedImage, GeneratedImage] | null
    isOpen: boolean
    onClose: () => void
}

interface ViewTransform {
    scale: number
    x: number
    y: number
}

const INITIAL_TRANSFORM: ViewTransform = { scale: 1, x: 0, y: 0 }
const MIN_SCALE = 1
const MAX_SCALE = 6
const DOUBLE_CLICK_SCALE = 2.5
const WHEEL_ZOOM_SENSITIVITY = 0.0015
const INITIAL_SLIDER_PERCENT = 50
const SLIDER_KEYBOARD_STEP = 5
// Metadata panels are hidden below Tailwind's md breakpoint.
const METADATA_PANEL_BREAKPOINT = 768
const METADATA_PANEL_MIN_HEIGHT = 288
const CONTENT_GAP = 16

function getMetadataPanelReservedHeight() {
    if (typeof window === "undefined" || window.innerWidth < METADATA_PANEL_BREAKPOINT) {
        return 0
    }

    return METADATA_PANEL_MIN_HEIGHT + CONTENT_GAP
}

function clampScale(scale: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

function clampSliderPercent(percent: number) {
    return Math.min(100, Math.max(0, percent))
}

// Keeps the image from being panned entirely out of the viewport.
function clampTransform(transform: ViewTransform, width: number, height: number): ViewTransform {
    if (transform.scale <= 1) return INITIAL_TRANSFORM

    const maxX = (width * (transform.scale - 1)) / 2
    const maxY = (height * (transform.scale - 1)) / 2

    return {
        scale: transform.scale,
        x: Math.min(maxX, Math.max(-maxX, transform.x)),
        y: Math.min(maxY, Math.max(-maxY, transform.y))
    }
}

function getComparisonImageUrls(image: GeneratedImage) {
    const optimizedUrl = getExpandedImageUrl({
        storageKey: image.storageKey,
        aspectRatio: image.aspectRatio
    })
    const directUrl = getGeneratedImageDirectUrl(image.storageKey)

    return {
        optimizedUrl,
        directUrl,
        fullResolutionUrl: directUrl || getGeneratedImageProxyUrl(image.storageKey) || optimizedUrl
    }
}

// Mirrors the details modal's cache so remounts (e.g. mode switches) can skip
// the loading state for images the browser already has.
const loadedComparisonImageUrls = new Set<string>()

function useElementSize<T extends HTMLElement>() {
    const ref = useRef<T | null>(null)
    const [size, setSize] = useState({ width: 0, height: 0 })

    useEffect(() => {
        const element = ref.current
        if (!element) return

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0]
            if (!entry) return

            setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
        })

        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    return { ref, size }
}

function useFittedImageBox(
    aspectRatio: string | undefined,
    size: { width: number; height: number },
    reservedHeight = 0
) {
    return useMemo(() => {
        if (size.width < 10 || size.height < 10) return null

        return fitImageAspectRatioBox({
            aspectRatioValue: getImageAspectRatioValue(aspectRatio || "1:1"),
            maxWidth: size.width,
            maxHeight: Math.max(120, size.height - reservedHeight)
        })
    }, [aspectRatio, size, reservedHeight])
}

function ComparisonImage({
    image,
    transform,
    clipPercent
}: {
    image: GeneratedImage
    transform: ViewTransform
    /** When set, clips the image to the left `clipPercent`% of the viewport (slider mode). */
    clipPercent?: number
}) {
    const [recoveryPhase, setRecoveryPhase] = useState<GeneratedImageRecoveryPhase>("primary")

    useEffect(() => {
        setRecoveryPhase("primary")
    }, [image.storageKey])

    // Comparison is about pixel-level differences, so render the full-resolution
    // source and only fall back to the optimized variant if it fails.
    const { optimizedUrl, fullResolutionUrl } = getComparisonImageUrls(image)
    const renderedSource = resolveGeneratedImageRenderSource({
        phase: recoveryPhase,
        primary: { src: fullResolutionUrl },
        fallback: { directSrc: optimizedUrl }
    })
    const renderedUrl = renderedSource.src

    const {
        imageRef,
        loadState,
        handleImageLoad: handleLoad,
        handleImageFailure
    } = useImageViewerLoad({
        url: renderedUrl,
        cache: loadedComparisonImageUrls
    })
    const isLoaded = loadState === "ready"
    const handleError = () => {
        const nextPhase = getNextGeneratedImageRecoveryPhase(recoveryPhase)
        handleImageFailure(nextPhase !== "error")
        if (nextPhase !== "error") setRecoveryPhase(nextPhase)
    }

    return (
        <div
            className="absolute inset-0"
            style={
                clipPercent === undefined
                    ? undefined
                    : { clipPath: `inset(0 ${100 - clampSliderPercent(clipPercent)}% 0 0)` }
            }
        >
            {!isLoaded && (
                <div className="absolute inset-0 z-10 bg-gradient-to-br from-muted/85 via-muted/65 to-accent/20" />
            )}
            {!isLoaded && <ImageLoadIndicator complete={false} />}
            <div className="flex h-full w-full items-center justify-center">
                <img
                    ref={imageRef}
                    src={renderedUrl}
                    alt={image.prompt || "Generated image"}
                    draggable={false}
                    className={cn(
                        "max-h-full max-w-full select-none object-contain transition-[opacity,filter] duration-300 will-change-transform",
                        isLoaded ? "opacity-100 blur-0" : "opacity-0 blur-md"
                    )}
                    style={{
                        transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`
                    }}
                    onLoad={handleLoad}
                    onError={handleError}
                />
            </div>
        </div>
    )
}

function PaneBadge({
    label,
    modelName,
    className
}: {
    label: "A" | "B"
    modelName: string
    className?: string
}) {
    return (
        <div
            className={cn(
                "pointer-events-none z-10 max-w-[70%] truncate rounded-[var(--radius-md)] border border-background/40 bg-background/80 px-2 py-1 font-medium text-foreground text-xs shadow-lg backdrop-blur-md",
                className
            )}
        >
            {label} · {modelName}
        </div>
    )
}

function PanelActions({ image, label }: { image: GeneratedImage; label: "A" | "B" }) {
    const { fullResolutionUrl } = getComparisonImageUrls(image)
    const { isPromptCopied, handleDownload, handleCopyPrompt } = useImageViewerActions({
        url: fullResolutionUrl,
        storageKey: image.storageKey,
        prompt: image.prompt,
        fallbackFileName: `silkscreen-image-${label}`,
        downloadErrorLabel: "Failed to download comparison image:",
        resetKey: image._id
    })

    return (
        <div className="flex flex-nowrap items-center justify-between gap-3">
            <Button
                variant="outline"
                className="min-w-0"
                onClick={() => window.open(fullResolutionUrl, "_blank", "noopener,noreferrer")}
            >
                <ExternalLink className="mr-2 h-4 w-4" />
                Full Resolution
            </Button>
            <div className="flex items-center gap-3">
                <Button
                    variant="secondary"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    onClick={handleDownload}
                    aria-label={`Download image ${label}`}
                >
                    <Download className="h-4 w-4" />
                    <span className="sr-only">Download</span>
                </Button>
                <Button
                    variant={isPromptCopied ? "secondary" : "outline"}
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    onClick={handleCopyPrompt}
                    aria-label={isPromptCopied ? "Prompt copied" : `Copy prompt for image ${label}`}
                >
                    {isPromptCopied ? (
                        <Check className="h-4 w-4" />
                    ) : (
                        <Clipboard className="h-4 w-4" />
                    )}
                    <span className="sr-only">{isPromptCopied ? "Copied" : "Copy Prompt"}</span>
                </Button>
            </div>
        </div>
    )
}

interface PinchGestureState {
    pointers: Map<number, { x: number; y: number }>
    pinchStart: { distance: number; scale: number } | null
    /** Bumped when a pinch starts/ends so sibling viewports discard stale pan starts. */
    epoch: number
}

function createPinchGestureState(): PinchGestureState {
    return { pointers: new Map(), pinchStart: null, epoch: 0 }
}

function ComparisonViewport({
    transform,
    onTransformChange,
    onScrub,
    pinchStateRef,
    className,
    style,
    children
}: {
    transform: ViewTransform
    onTransformChange: (transform: ViewTransform) => void
    /** When provided, dragging at 100% zoom scrubs the comparison slider instead of panning. */
    onScrub?: (percent: number) => void
    /**
     * Share pinch tracking across sibling viewports so a two-finger gesture
     * that lands one finger in each side-by-side pane still zooms.
     */
    pinchStateRef?: { current: PinchGestureState }
    className?: string
    style?: CSSProperties
    children: ReactNode
}) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const stateRef = useRef({ transform, onTransformChange })
    stateRef.current = { transform, onTransformChange }
    const panStartRef = useRef<{
        pointerX: number
        pointerY: number
        x: number
        y: number
        epoch: number
    } | null>(null)
    const scrubStateRef = useRef<{ startX: number; active: boolean } | null>(null)
    const fallbackPinchStateRef = useRef<PinchGestureState>(createPinchGestureState())
    const pinchState = (pinchStateRef ?? fallbackPinchStateRef).current

    const getPinchDistance = () => {
        const pointers = Array.from(pinchState.pointers.values())
        if (pointers.length < 2) return null

        const [first, second] = pointers
        return Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
    }

    // Center-anchored so sibling viewports processing the same gesture apply
    // identical transforms regardless of where the fingers sit.
    const applyPinchZoom = () => {
        const pinchStart = pinchState.pinchStart
        const distance = getPinchDistance()
        const container = containerRef.current
        if (!pinchStart || !distance || !container) return

        const { transform: current, onTransformChange: applyTransform } = stateRef.current
        const scale = clampScale(pinchStart.scale * (distance / pinchStart.distance))
        if (scale === current.scale) return

        const rect = container.getBoundingClientRect()
        const ratio = scale / current.scale
        applyTransform(
            clampTransform(
                { scale, x: current.x * ratio, y: current.y * ratio },
                rect.width,
                rect.height
            )
        )
    }

    const zoomAtPoint = useCallback((clientX: number, clientY: number, nextScale: number) => {
        const container = containerRef.current
        if (!container) return

        const { transform: current, onTransformChange: applyTransform } = stateRef.current
        const scale = clampScale(nextScale)
        if (scale === current.scale) return

        // Keep the point under the cursor fixed while the scale changes.
        const rect = container.getBoundingClientRect()
        const pointX = clientX - rect.left - rect.width / 2
        const pointY = clientY - rect.top - rect.height / 2
        const ratio = scale / current.scale

        applyTransform(
            clampTransform(
                {
                    scale,
                    x: pointX - (pointX - current.x) * ratio,
                    y: pointY - (pointY - current.y) * ratio
                },
                rect.width,
                rect.height
            )
        )
    }, [])

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        // Registered manually because React wheel listeners are passive, which
        // blocks preventDefault and lets the page scroll behind the dialog.
        const handleWheel = (event: WheelEvent) => {
            event.preventDefault()
            const { transform: current } = stateRef.current
            zoomAtPoint(
                event.clientX,
                event.clientY,
                current.scale * Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY)
            )
        }

        container.addEventListener("wheel", handleWheel, { passive: false })
        return () => container.removeEventListener("wheel", handleWheel)
    }, [zoomAtPoint])

    const scrubTo = (clientX: number) => {
        const container = containerRef.current
        if (!container || !onScrub) return

        const rect = container.getBoundingClientRect()
        onScrub(clampSliderPercent(((clientX - rect.left) / rect.width) * 100))
    }

    const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return

        event.currentTarget.setPointerCapture(event.pointerId)
        pinchState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

        // A second finger switches from pan/scrub to pinch zoom.
        if (pinchState.pointers.size === 2) {
            panStartRef.current = null
            scrubStateRef.current = null

            const distance = getPinchDistance()
            if (distance) {
                pinchState.pinchStart = { distance, scale: transform.scale }
                pinchState.epoch += 1
            }
            return
        }

        if (transform.scale > 1) {
            panStartRef.current = {
                pointerX: event.clientX,
                pointerY: event.clientY,
                x: transform.x,
                y: transform.y,
                epoch: pinchState.epoch
            }
            return
        }

        if (onScrub) {
            // Wait for real drag movement before scrubbing so plain clicks and
            // double-click zoom don't teleport the divider.
            scrubStateRef.current = { startX: event.clientX, active: false }
        }
    }

    const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (pinchState.pointers.has(event.pointerId)) {
            pinchState.pointers.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY
            })
        }

        if (pinchState.pinchStart) {
            applyPinchZoom()
            return
        }

        let panStart = panStartRef.current
        if (panStart) {
            // A pinch happened (possibly in a sibling pane) since this pan
            // started; restart it from here so the image doesn't jump.
            if (panStart.epoch !== pinchState.epoch) {
                const { transform: current } = stateRef.current
                panStart = {
                    pointerX: event.clientX,
                    pointerY: event.clientY,
                    x: current.x,
                    y: current.y,
                    epoch: pinchState.epoch
                }
                panStartRef.current = panStart
            }

            const rect = containerRef.current?.getBoundingClientRect()
            if (!rect) return

            onTransformChange(
                clampTransform(
                    {
                        scale: transform.scale,
                        x: panStart.x + event.clientX - panStart.pointerX,
                        y: panStart.y + event.clientY - panStart.pointerY
                    },
                    rect.width,
                    rect.height
                )
            )
            return
        }

        const scrubState = scrubStateRef.current
        if (scrubState) {
            if (!scrubState.active && Math.abs(event.clientX - scrubState.startX) < 3) {
                return
            }

            scrubState.active = true
            scrubTo(event.clientX)
        }
    }

    const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }

        pinchState.pointers.delete(event.pointerId)

        if (pinchState.pointers.size < 2 && pinchState.pinchStart) {
            pinchState.pinchStart = null
            pinchState.epoch += 1
        }

        // Hand off from pinch to a one-finger pan without the image jumping.
        if (pinchState.pointers.size === 1) {
            const remaining = pinchState.pointers.values().next().value
            const { transform: current } = stateRef.current

            panStartRef.current =
                remaining && current.scale > 1
                    ? {
                          pointerX: remaining.x,
                          pointerY: remaining.y,
                          x: current.x,
                          y: current.y,
                          epoch: pinchState.epoch
                      }
                    : null
            scrubStateRef.current = null
            return
        }

        panStartRef.current = null
        scrubStateRef.current = null
    }

    const handleDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
        if (transform.scale > 1) {
            onTransformChange(INITIAL_TRANSFORM)
            return
        }

        zoomAtPoint(event.clientX, event.clientY, DOUBLE_CLICK_SCALE)
    }

    return (
        <div
            ref={containerRef}
            className={cn(
                "touch-none overscroll-contain",
                transform.scale > 1
                    ? "cursor-grab active:cursor-grabbing"
                    : onScrub && "cursor-ew-resize",
                className
            )}
            style={style}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onDoubleClick={handleDoubleClick}
        >
            {children}
        </div>
    )
}

function SideBySidePane({
    image,
    label,
    modelName,
    transform,
    onTransformChange,
    pinchStateRef
}: {
    image: GeneratedImage
    label: "A" | "B"
    modelName: string
    transform: ViewTransform
    onTransformChange: (transform: ViewTransform) => void
    pinchStateRef: { current: PinchGestureState }
}) {
    const { ref, size } = useElementSize<HTMLDivElement>()
    const box = useFittedImageBox(image.aspectRatio, size, getMetadataPanelReservedHeight())

    return (
        <section
            ref={ref}
            className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-4 md:justify-start"
            aria-label={`Comparison image ${label}`}
        >
            {box && (
                <>
                    <ComparisonViewport
                        transform={transform}
                        onTransformChange={onTransformChange}
                        pinchStateRef={pinchStateRef}
                        className="relative shrink-0 overflow-hidden rounded-[var(--radius-xl)] border border-border/60 bg-muted/35 shadow-2xl"
                        style={{ width: box.width, height: box.height }}
                    >
                        <ComparisonImage image={image} transform={transform} />
                        <PaneBadge
                            label={label}
                            modelName={modelName}
                            className="absolute bottom-2 left-2"
                        />
                    </ComparisonViewport>
                    <ImageMetadataPanel
                        image={image}
                        modelName={modelName}
                        className="hidden min-h-0 w-full flex-1 md:flex"
                        footer={<PanelActions image={image} label={label} />}
                    />
                </>
            )}
        </section>
    )
}

function SliderView({
    imageA,
    imageB,
    modelNameA,
    modelNameB,
    transform,
    onTransformChange,
    sliderPercent,
    onSliderPercentChange
}: {
    imageA: GeneratedImage
    imageB: GeneratedImage
    modelNameA: string
    modelNameB: string
    transform: ViewTransform
    onTransformChange: (transform: ViewTransform) => void
    sliderPercent: number
    onSliderPercentChange: (percent: number) => void
}) {
    const { ref, size } = useElementSize<HTMLDivElement>()
    const box = useFittedImageBox(imageA.aspectRatio, size, getMetadataPanelReservedHeight())
    const boxRef = useRef<HTMLDivElement | null>(null)

    const handleDividerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
    }

    const handleDividerPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return

        const rect = boxRef.current?.getBoundingClientRect()
        if (!rect) return

        onSliderPercentChange(clampSliderPercent(((event.clientX - rect.left) / rect.width) * 100))
    }

    return (
        <div
            ref={ref}
            className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-4 md:justify-start"
        >
            {box && (
                <>
                    <div
                        ref={boxRef}
                        className="relative shrink-0 overflow-hidden rounded-[var(--radius-xl)] border border-border/60 bg-muted/35 shadow-2xl"
                        style={{ width: box.width, height: box.height }}
                    >
                        <ComparisonViewport
                            transform={transform}
                            onTransformChange={onTransformChange}
                            onScrub={onSliderPercentChange}
                            className="absolute inset-0"
                        >
                            <ComparisonImage image={imageB} transform={transform} />
                            <ComparisonImage
                                image={imageA}
                                transform={transform}
                                clipPercent={sliderPercent}
                            />
                        </ComparisonViewport>

                        <div
                            className="absolute inset-y-0 z-20"
                            style={{ left: `${sliderPercent}%` }}
                        >
                            <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background shadow-md" />
                            <div
                                className="absolute top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full border border-border/70 bg-background/95 shadow-lg backdrop-blur"
                                role="slider"
                                aria-label="Comparison divider"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(sliderPercent)}
                                tabIndex={0}
                                onPointerDown={handleDividerPointerDown}
                                onPointerMove={handleDividerPointerMove}
                            >
                                <ChevronsLeftRight className="size-4" />
                            </div>
                        </div>

                        <PaneBadge
                            label="A"
                            modelName={modelNameA}
                            className="absolute bottom-2 left-2"
                        />
                        <PaneBadge
                            label="B"
                            modelName={modelNameB}
                            className="absolute right-2 bottom-2"
                        />
                    </div>
                    <div className="hidden min-h-0 w-full flex-1 gap-4 md:grid md:grid-cols-2">
                        <ImageMetadataPanel
                            image={imageA}
                            modelName={modelNameA}
                            className="min-h-0"
                            footer={<PanelActions image={imageA} label="A" />}
                        />
                        <ImageMetadataPanel
                            image={imageB}
                            modelName={modelNameB}
                            className="min-h-0"
                            footer={<PanelActions image={imageB} label="B" />}
                        />
                    </div>
                </>
            )}
        </div>
    )
}

export function ImageComparisonModal({ images, isOpen, onClose }: ImageComparisonModalProps) {
    const { models } = useSharedModels()
    const [mode, setMode] = useState<ComparisonMode>("side-by-side")
    const [orderedImages, setOrderedImages] = useState(images)
    const [transform, setTransform] = useState<ViewTransform>(INITIAL_TRANSFORM)
    const [sliderPercent, setSliderPercent] = useState(INITIAL_SLIDER_PERCENT)
    // Shared across the side-by-side panes so a pinch spanning both still zooms.
    const sharedPinchStateRef = useRef<PinchGestureState>(createPinchGestureState())

    useEffect(() => {
        setOrderedImages(images)
        setTransform(INITIAL_TRANSFORM)
        setSliderPercent(INITIAL_SLIDER_PERCENT)
    }, [images])

    useEffect(() => {
        if (!isOpen || mode !== "slider") return

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

            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault()
                const step =
                    event.key === "ArrowLeft" ? -SLIDER_KEYBOARD_STEP : SLIDER_KEYBOARD_STEP
                setSliderPercent((current) => clampSliderPercent(current + step))
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [isOpen, mode])

    const modelNameById = useMemo(
        () =>
            new Map<string, string>(
                models.map((model) => [String(model.id), String(model.name)] as const)
            ),
        [models]
    )

    if (!orderedImages) return null

    const [imageA, imageB] = orderedImages
    const getModelName = (image: GeneratedImage) => {
        const modelId = typeof image.modelId === "string" ? image.modelId : ""
        return modelNameById.get(modelId) || modelId || "Unknown model"
    }

    const handleSwap = () => {
        setOrderedImages((current) => (current ? ([current[1], current[0]] as const) : current))
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                showCloseButton={false}
                overlayClassName="backdrop-blur-xl"
                className="inset-0 flex h-[100dvh] max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col rounded-none border-0 bg-transparent p-3 shadow-none sm:max-w-none sm:p-4"
            >
                <DialogHeader className="sr-only">
                    <DialogTitle>Compare images</DialogTitle>
                    <DialogDescription>
                        Compare two generated images side by side or with an overlay slider, with
                        synchronized zooming and panning.
                    </DialogDescription>
                </DialogHeader>

                <div className="relative flex min-h-0 flex-1 flex-col">
                    <div className="absolute top-0 left-0 z-30">
                        <Tabs
                            value={mode}
                            onValueChange={(value) => setMode(value as ComparisonMode)}
                        >
                            <TabsList className="h-9 border border-border/70 shadow-lg backdrop-blur-md">
                                <TabsTrigger value="side-by-side" className="text-xs">
                                    <Columns2 className="mr-2 hidden h-3.5 w-3.5 sm:block" />
                                    Side by side
                                </TabsTrigger>
                                <TabsTrigger value="slider" className="text-xs">
                                    <SquareSplitHorizontal className="mr-2 hidden h-3.5 w-3.5 sm:block" />
                                    Slider
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    <div className="absolute top-0 right-0 z-30 flex items-center gap-2">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9 rounded-[var(--radius-lg)] border-border/70 bg-background/85 shadow-lg backdrop-blur-md hover:bg-accent/80"
                                    onClick={handleSwap}
                                >
                                    <ArrowLeftRight className="size-4" />
                                    <span className="hidden sm:inline">Swap</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Swap A and B</TooltipContent>
                        </Tooltip>

                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 rounded-[var(--radius-lg)] border-border/70 bg-background/85 shadow-lg backdrop-blur-md hover:bg-accent/80"
                            onClick={onClose}
                        >
                            <span className="sr-only">Close</span>
                            <X className="size-4" />
                        </Button>
                    </div>

                    {mode === "side-by-side" ? (
                        <div className="grid min-h-0 flex-1 grid-rows-2 gap-4 md:grid-cols-2 md:grid-rows-1">
                            <SideBySidePane
                                image={imageA}
                                label="A"
                                modelName={getModelName(imageA)}
                                transform={transform}
                                onTransformChange={setTransform}
                                pinchStateRef={sharedPinchStateRef}
                            />
                            <SideBySidePane
                                image={imageB}
                                label="B"
                                modelName={getModelName(imageB)}
                                transform={transform}
                                onTransformChange={setTransform}
                                pinchStateRef={sharedPinchStateRef}
                            />
                        </div>
                    ) : (
                        <SliderView
                            imageA={imageA}
                            imageB={imageB}
                            modelNameA={getModelName(imageA)}
                            modelNameB={getModelName(imageB)}
                            transform={transform}
                            onTransformChange={setTransform}
                            sliderPercent={sliderPercent}
                            onSliderPercentChange={setSliderPercent}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
