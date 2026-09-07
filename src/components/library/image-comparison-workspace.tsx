import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react"
import { useImageViewerLoad } from "@/hooks/use-image-viewer-load"
import { useImageViewerActions } from "@/hooks/use-image-viewer-actions"
import { ImageLoadIndicator } from "@/components/library/image-load-indicator"
import { ReferenceImageThumbnails } from "@/components/library/image-metadata-panel"
import { Button } from "@/components/ui/button"
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
    Info,
    ZoomIn,
    ZoomOut,
    Scan,
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

interface ImageComparisonWorkspaceProps {
    images: readonly [GeneratedImage, GeneratedImage]
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
    size: { width: number; height: number }
) {
    return useMemo(() => {
        if (size.width < 10 || size.height < 10) return null

        return fitImageAspectRatioBox({
            aspectRatioValue: getImageAspectRatioValue(aspectRatio || "1:1"),
            maxWidth: size.width,
            maxHeight: size.height
        })
    }, [aspectRatio, size])
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

    // Reset fallback recovery when the selected image changes.
    // biome-ignore lint/correctness/useExhaustiveDependencies: storageKey identifies the image to reset.
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
        setRecoveryPhase(nextPhase)
    }

    if (recoveryPhase === "error") {
        return (
            <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted text-sm"
                role="status"
            >
                <p>Couldn't load this image.</p>
                <Button
                    variant="outline"
                    size="sm"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => setRecoveryPhase("primary")}
                >
                    Try again
                </Button>
            </div>
        )
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
                "min-w-0 truncate rounded-[var(--radius-md)] bg-background/70 px-3 py-2 font-medium text-foreground text-sm backdrop-blur-md",
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
        <div className="flex flex-wrap items-center gap-2">
            <Button
                variant="outline"
                className="min-w-0"
                onClick={() => window.open(fullResolutionUrl, "_blank", "noopener,noreferrer")}
            >
                <ExternalLink className="mr-2 h-4 w-4" />
                Full Resolution
            </Button>
            <div className="flex items-center gap-2">
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
            // On the scrolling mobile page, ordinary wheel gestures reach the
            // details below. Trackpad pinch (Ctrl+wheel) still zooms the image.
            if (window.innerWidth < 1024 && !event.ctrlKey && !event.metaKey) return
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
                "overscroll-contain",
                transform.scale > 1 ? "touch-none" : "touch-pan-y",
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
    const box = useFittedImageBox(image.aspectRatio, size)

    return (
        <motion.section
            layout="position"
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex min-h-0 min-w-0 flex-col gap-3"
            aria-label={`Comparison image ${label}`}
        >
            <div
                style={{ width: Math.max(box?.width || 0, 220) }}
                className={cn(
                    "flex max-w-full items-center justify-between gap-2 self-center px-1",
                    label === "A" ? "md:self-end" : "md:self-start"
                )}
            >
                <PaneBadge label={label} modelName={modelName} />
                <span className="shrink-0 rounded-[var(--radius-sm)] bg-background/85 px-2 py-1 text-muted-foreground text-xs backdrop-blur-md">
                    {image.aspectRatio || "1:1"}
                </span>
            </div>
            <div
                ref={ref}
                className={cn(
                    "flex min-h-0 flex-1 items-center justify-center overflow-hidden",
                    label === "A" ? "md:justify-end" : "md:justify-start"
                )}
            >
                {box && (
                    <ComparisonViewport
                        transform={transform}
                        onTransformChange={onTransformChange}
                        pinchStateRef={pinchStateRef}
                        className="relative shrink-0 overflow-hidden rounded-[var(--radius-xl)] border border-border/60 bg-background/30 shadow-2xl lg:rounded-[var(--radius-sm)] lg:border-0 lg:bg-transparent lg:shadow-none"
                        style={{ width: box.width, height: box.height }}
                    >
                        <ComparisonImage image={image} transform={transform} />
                    </ComparisonViewport>
                )}
            </div>
        </motion.section>
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
    const box = useFittedImageBox(imageA.aspectRatio, {
        width: size.width,
        height: Math.max(0, size.height - 48)
    })
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
            className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden"
        >
            {box && (
                <>
                    <div style={{ width: box.width }} className="grid shrink-0 grid-cols-2 gap-2">
                        <PaneBadge label="A" modelName={modelNameA} />
                        <PaneBadge label="B" modelName={modelNameB} className="text-right" />
                    </div>
                    <div
                        ref={boxRef}
                        className="relative shrink-0 overflow-hidden rounded-[var(--radius-xl)] border border-border/60 bg-background/30 shadow-2xl lg:rounded-[var(--radius-sm)] lg:border-0 lg:bg-transparent lg:shadow-none"
                        style={{ width: box.width, height: box.height }}
                    >
                        <ComparisonViewport
                            transform={transform}
                            onTransformChange={onTransformChange}
                            onScrub={onSliderPercentChange}
                            className="absolute inset-0"
                        >
                            <motion.div
                                key={`${imageA._id}-${imageB._id}`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="absolute inset-0"
                            >
                                <ComparisonImage image={imageB} transform={transform} />
                                <ComparisonImage
                                    image={imageA}
                                    transform={transform}
                                    clipPercent={sliderPercent}
                                />
                            </motion.div>
                        </ComparisonViewport>

                        <div
                            className="absolute inset-y-0 z-20"
                            style={{ left: `${sliderPercent}%` }}
                        >
                            <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background shadow-md" />
                            <div
                                className="absolute top-1/2 flex h-12 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-[var(--radius-md)] border border-border/70 bg-background text-foreground shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                role="slider"
                                aria-label="Comparison divider"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(sliderPercent)}
                                aria-valuetext={`${Math.round(sliderPercent)}% image A`}
                                tabIndex={0}
                                onKeyDown={(event) => {
                                    const next =
                                        event.key === "Home"
                                            ? 0
                                            : event.key === "End"
                                              ? 100
                                              : event.key === "ArrowLeft" ||
                                                  event.key === "ArrowDown"
                                                ? sliderPercent - SLIDER_KEYBOARD_STEP
                                                : event.key === "ArrowRight" ||
                                                    event.key === "ArrowUp"
                                                  ? sliderPercent + SLIDER_KEYBOARD_STEP
                                                  : null
                                    if (next === null) return
                                    event.preventDefault()
                                    onSliderPercentChange(clampSliderPercent(next))
                                }}
                                onPointerDown={handleDividerPointerDown}
                                onPointerMove={handleDividerPointerMove}
                            >
                                <ChevronsLeftRight className="size-4" />
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export function ImageComparisonWorkspace({ images }: ImageComparisonWorkspaceProps) {
    const { models } = useSharedModels()
    const reducedMotion = useReducedMotion()
    const [isDesktop, setIsDesktop] = useState(
        () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
    )
    useEffect(() => {
        const query = window.matchMedia("(min-width: 1024px)")
        const update = () => setIsDesktop(query.matches)
        update()
        query.addEventListener("change", update)
        return () => query.removeEventListener("change", update)
    }, [])
    const [showDetails, setShowDetails] = useState(false)
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

    const changeZoom = (delta: number) => {
        setTransform((current) => {
            const scale = clampScale(current.scale + delta)
            if (scale === 1) return INITIAL_TRANSFORM
            const ratio = scale / current.scale
            return { scale, x: current.x * ratio, y: current.y * ratio }
        })
    }

    const detailsContent = (
        <div className="p-5 lg:h-full lg:w-[360px] lg:overflow-y-auto">
            <div className="mb-5 flex items-center justify-between">
                <h2 className="font-semibold text-lg">Image details</h2>
                <Button
                    size="icon"
                    variant="ghost"
                    className="hidden lg:inline-flex"
                    aria-label="Hide image details"
                    onClick={() => setShowDetails(false)}
                >
                    <X className="size-4" />
                </Button>
            </div>
            {orderedImages.map((image, index) => (
                <section
                    key={image._id}
                    className="space-y-4 py-4 first:pt-0 [&+section]:mt-4 [&+section]:border-border [&+section]:border-t"
                >
                    <h2 className="font-medium text-sm">
                        {index === 0 ? "A" : "B"} · {getModelName(image)}
                    </h2>
                    <dl className="flex flex-wrap gap-x-4 gap-y-2 text-muted-foreground text-xs">
                        <div>
                            <dt className="sr-only">Aspect ratio</dt>
                            <dd>{image.aspectRatio || "Unknown ratio"}</dd>
                        </div>
                        <div>
                            <dt className="sr-only">Resolution</dt>
                            <dd>{image.resolution || "1K"}</dd>
                        </div>
                        <div>
                            <dt className="sr-only">Created</dt>
                            <dd>{new Date(image.createdAt).toLocaleDateString()}</dd>
                        </div>
                    </dl>
                    <div>
                        <h3 className="mb-2 font-medium text-xs">Prompt</h3>
                        <p className="whitespace-pre-wrap break-words text-muted-foreground text-sm leading-relaxed">
                            {image.prompt || "No prompt available."}
                        </p>
                    </div>
                    <ReferenceImageThumbnails referenceImageKeys={image.referenceImageKeys} />
                    <PanelActions image={image} label={index === 0 ? "A" : "B"} />
                </section>
            ))}
        </div>
    )

    return (
        <MotionConfig
            reducedMotion="user"
            transition={{ duration: reducedMotion ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
            <div className="h-dvh overflow-y-auto bg-background text-foreground lg:overflow-hidden">
                <div className="relative flex h-dvh shrink-0 flex-col gap-4 p-3 sm:gap-5 sm:p-6 lg:gap-2 lg:p-3">
                    <motion.header
                        initial={{ opacity: 0, y: reducedMotion ? 0 : -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex shrink-0 items-center justify-between gap-3"
                    >
                        <Tabs
                            value={mode}
                            onValueChange={(value) => setMode(value as ComparisonMode)}
                        >
                            <TabsList className="h-11 rounded-[var(--radius-lg)] border border-border/60 bg-background/90 p-1 shadow-lg backdrop-blur-md">
                                <TabsTrigger
                                    value="side-by-side"
                                    className="h-9 rounded-[var(--radius-md)] px-3 sm:px-5"
                                >
                                    <Columns2 className="size-4" />
                                    <span className="hidden sm:inline">Side by side</span>
                                    <span className="sm:hidden">Split</span>
                                </TabsTrigger>
                                <TabsTrigger
                                    value="slider"
                                    className="h-9 rounded-[var(--radius-md)] px-3 sm:px-5"
                                >
                                    <SquareSplitHorizontal className="size-4" />
                                    Slider
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <div className="flex items-center gap-1">
                            <Button
                                variant={showDetails ? "secondary" : "outline"}
                                className="hidden h-11 rounded-[var(--radius-lg)] border-border/60 bg-background/90 px-3 shadow-lg backdrop-blur-md lg:inline-flex"
                                size="sm"
                                aria-expanded={showDetails}
                                aria-controls="comparison-details"
                                onClick={() => setShowDetails(!showDetails)}
                            >
                                <Info className="size-4" />
                                Details
                            </Button>
                        </div>
                    </motion.header>
                    <motion.div
                        initial={{
                            opacity: 0,
                            scale: reducedMotion ? 1 : 0.96,
                            y: reducedMotion ? 0 : 16
                        }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="flex min-h-0 flex-1 flex-col lg:flex-row"
                    >
                        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 rounded-[var(--radius-xl)] bg-muted/30 p-3 sm:p-5 lg:rounded-none lg:bg-transparent lg:p-0">
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.div
                                    key={mode}
                                    initial={{
                                        opacity: 0,
                                        scale: reducedMotion ? 1 : 0.97,
                                        y: reducedMotion ? 0 : 8
                                    }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{
                                        opacity: 0,
                                        scale: reducedMotion ? 1 : 0.98,
                                        transition: { duration: reducedMotion ? 0 : 0.12 }
                                    }}
                                    className="flex min-h-0 flex-1 flex-col gap-3"
                                >
                                    {mode === "side-by-side" ? (
                                        <div className="grid min-h-0 flex-1 grid-rows-2 gap-3 md:grid-cols-2 md:grid-rows-1 md:gap-5">
                                            <SideBySidePane
                                                key={imageA._id}
                                                image={imageA}
                                                label="A"
                                                modelName={getModelName(imageA)}
                                                transform={transform}
                                                onTransformChange={setTransform}
                                                pinchStateRef={sharedPinchStateRef}
                                            />
                                            <SideBySidePane
                                                key={imageB._id}
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
                                            modelNameA={getModelName(imageA)}
                                            modelNameB={getModelName(imageB)}
                                            imageA={imageA}
                                            imageB={imageB}
                                            transform={transform}
                                            onTransformChange={setTransform}
                                            sliderPercent={sliderPercent}
                                            onSliderPercentChange={setSliderPercent}
                                        />
                                    )}
                                </motion.div>
                            </AnimatePresence>
                            {mode === "slider" && imageA.aspectRatio !== imageB.aspectRatio && (
                                <p className="text-center text-muted-foreground text-xs">
                                    Different aspect ratios: images are fitted without cropping.
                                </p>
                            )}
                        </main>
                        <AnimatePresence initial={false}>
                            {isDesktop && showDetails && (
                                <motion.aside
                                    key="desktop-details"
                                    initial={{
                                        opacity: 0,
                                        width: 0,
                                        height: "100%",
                                        marginLeft: 0,
                                        marginTop: 0
                                    }}
                                    animate={{
                                        opacity: 1,
                                        width: 360,
                                        height: "100%",
                                        marginLeft: 16,
                                        marginTop: 0
                                    }}
                                    exit={{
                                        opacity: 0,
                                        width: 0,
                                        height: "100%",
                                        marginLeft: 0,
                                        marginTop: 0
                                    }}
                                    id="comparison-details"
                                    aria-label="Image details"
                                    className="shrink-0 overflow-hidden border-border border-l bg-background"
                                >
                                    {detailsContent}
                                </motion.aside>
                            )}
                        </AnimatePresence>
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, y: reducedMotion ? 0 : 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex shrink-0 items-center gap-1 self-center rounded-[var(--radius-xl)] border border-border/60 bg-background/90 p-1.5 shadow-xl backdrop-blur-xl lg:absolute lg:top-3 lg:left-1/2 lg:-translate-x-1/2 lg:rounded-[var(--radius-lg)] lg:border-transparent lg:bg-transparent lg:p-1 lg:shadow-none"
                    >
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-9"
                                    onClick={handleSwap}
                                    aria-label="Swap images A and B"
                                >
                                    <ArrowLeftRight className="size-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Swap A and B</TooltipContent>
                        </Tooltip>
                        <div className="mx-1 h-5 w-px bg-border" />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-9"
                            disabled={transform.scale <= MIN_SCALE}
                            onClick={() => changeZoom(-0.5)}
                            aria-label="Zoom out"
                        >
                            <ZoomOut className="size-4" />
                        </Button>
                        <span className="w-12 text-center text-xs tabular-nums">
                            {Math.round(transform.scale * 100)}%
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-9"
                            disabled={transform.scale >= MAX_SCALE}
                            onClick={() => changeZoom(0.5)}
                            aria-label="Zoom in"
                        >
                            <ZoomIn className="size-4" />
                        </Button>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-9"
                                    aria-label="Reset zoom and divider"
                                    onClick={() => {
                                        setTransform(INITIAL_TRANSFORM)
                                        setSliderPercent(INITIAL_SLIDER_PERCENT)
                                    }}
                                >
                                    <Scan className="size-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Fit images and center divider</TooltipContent>
                        </Tooltip>
                    </motion.div>
                </div>
                {!isDesktop && (
                    <section
                        id="comparison-details"
                        aria-label="Image details"
                        className="border-border border-t pb-[env(safe-area-inset-bottom)]"
                    >
                        {detailsContent}
                    </section>
                )}
            </div>
        </MotionConfig>
    )
}
