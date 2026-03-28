import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/convex/_generated/api"
import { useSharedModels } from "@/lib/shared-models"
import { cn } from "@/lib/utils"
import { useAction } from "convex/react"
import { Loader2, Plus, Sparkles, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

export function ImageGenerationSidebar({
    onGenerateStart,
    onGenerateComplete
}: {
    onGenerateStart?: (info: { id: string; aspectRatio: string }) => void
    onGenerateComplete?: (id: string) => void
} = {}) {
    const { models } = useSharedModels()
    const imageModels = models.filter((m) => m.mode === "image")

    const [prompt, setPrompt] = useState("")
    const [selectedModelIds, setSelectedModelIds] = useState<string[]>(
        imageModels.length > 0 ? [imageModels[0].id] : []
    )
    const [aspectRatio, setAspectRatio] = useState("1:1")
    const [resolution, setResolution] = useState("1K")
    const [referenceFiles, setReferenceFiles] = useState<{ file: File; preview: string }[]>([])
    const [showGradient, setShowGradient] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const container = scrollContainerRef.current
        if (!container) return

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container
            const hasScrollableContent = scrollHeight > clientHeight
            const isScrolledToBottom = scrollHeight - scrollTop - clientHeight < 5
            setShowGradient(hasScrollableContent && !isScrolledToBottom)
        }

        handleScroll()
        container.addEventListener("scroll", handleScroll)

        const resizeObserver = new ResizeObserver(handleScroll)
        resizeObserver.observe(container)

        const mutationObserver = new MutationObserver(handleScroll)
        mutationObserver.observe(container, {
            childList: true,
            subtree: true
        })

        return () => {
            container.removeEventListener("scroll", handleScroll)
            resizeObserver.disconnect()
            mutationObserver.disconnect()
        }
    }, [aspectRatio, resolution, selectedModelIds, imageModels, referenceFiles])

    const generateImage = useAction(api.images_node.generateStandaloneImage)
    const [isGenerating, setIsGenerating] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (files.length > 0) {
            const newRefs = files.map((file) => ({
                file,
                preview: URL.createObjectURL(file)
            }))
            setReferenceFiles((prev) => [...prev, ...newRefs])
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    const removeReferenceImage = (index: number) => {
        setReferenceFiles((prev) => {
            const newArray = [...prev]
            URL.revokeObjectURL(newArray[index].preview)
            newArray.splice(index, 1)
            return newArray
        })
    }

    const toggleModel = (modelId: string) => {
        setSelectedModelIds((prev) => {
            if (prev.includes(modelId)) {
                // Don't allow deselecting the last active model
                if (prev.length === 1) return prev
                return prev.filter((id) => id !== modelId)
            }
            return [...prev, modelId]
        })
    }

    const commonImageSizes = useMemo(() => {
        if (selectedModelIds.length === 0) return []
        const selectedModels = imageModels.filter((m) => selectedModelIds.includes(m.id))
        let intersection = selectedModels[0].supportedImageSizes || [
            "1:1",
            "16:9",
            "9:16",
            "4:3",
            "3:4",
            "21:9"
        ]

        for (let i = 1; i < selectedModels.length; i++) {
            const sizes = selectedModels[i].supportedImageSizes || [
                "1:1",
                "16:9",
                "9:16",
                "4:3",
                "3:4",
                "21:9"
            ]
            intersection = intersection.filter((size) => sizes.includes(size))
        }

        // Hardcode exactly what's on the screen if possible, but intersection is safer. Let's ensure these map well
        return intersection
    }, [selectedModelIds, imageModels])

    useEffect(() => {
        if (commonImageSizes.length > 0 && !commonImageSizes.includes(aspectRatio)) {
            setAspectRatio(commonImageSizes[0])
        }
    }, [commonImageSizes, aspectRatio])

    const commonImageResolutions = useMemo(() => {
        if (selectedModelIds.length === 0) return ["1K"]
        const selectedModels = imageModels.filter((m) => selectedModelIds.includes(m.id))

        const allSupport = selectedModels.every(
            (m) => m.supportedImageResolutions && m.supportedImageResolutions.length > 0
        )

        if (!allSupport) {
            return ["1K"]
        }

        let intersection = ["1K", "2K", "4K"]
        for (const model of selectedModels) {
            if (model.supportedImageResolutions) {
                intersection = intersection.filter((res) =>
                    model.supportedImageResolutions!.includes(res as any)
                )
            }
        }

        return intersection.length > 0 ? intersection : ["1K"]
    }, [selectedModelIds, imageModels])

    useEffect(() => {
        if (commonImageResolutions.length > 0 && !commonImageResolutions.includes(resolution)) {
            setResolution(commonImageResolutions[0] || "1K")
        }
    }, [commonImageResolutions, resolution])

    const handleGenerate = async () => {
        if (!prompt || selectedModelIds.length === 0) return

        setIsGenerating(true)
        try {
            await Promise.allSettled(
                selectedModelIds.map(async (modelId) => {
                    const model = imageModels.find((m) => m.id === modelId)
                    const supportsResolution =
                        model?.supportedImageResolutions &&
                        model.supportedImageResolutions.length > 0

                    const id = Math.random().toString(36).substring(2, 11)
                    if (onGenerateStart) {
                        onGenerateStart({ id, aspectRatio })
                    }

                    try {
                        await generateImage({
                            prompt,
                            modelId,
                            aspectRatio,
                            ...(supportsResolution ? { resolution } : {})
                        })
                    } finally {
                        if (onGenerateComplete) {
                            onGenerateComplete(id)
                        }
                    }
                })
            )
        } catch (error) {
            console.error("Failed to generate image:", error)
        } finally {
            setIsGenerating(false)
        }
    }

    const aspectRatios = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"]

    return (
        <div className="custom-scrollbar flex h-full w-72 shrink-0 flex-col border-r bg-background text-foreground text-sm">
            {/* Prompt Section */}
            <div className="space-y-3 border-b p-4">
                <div className="flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                    <Sparkles className="h-3.5 w-3.5" /> PROMPT
                </div>
                <Textarea
                    placeholder="Describe your image..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="min-h-[100px] resize-none rounded-md border-0 bg-muted/30 px-4 py-3 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/30"
                />
            </div>

            {/* References Section */}
            <div className="space-y-3 border-b p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                        <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                        REFERENCES
                    </div>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                </div>

                {referenceFiles.length > 0 && (
                    <div className="custom-scrollbar flex gap-2 overflow-x-auto pb-1">
                        {referenceFiles.map((ref, index) => (
                            <div
                                key={index}
                                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-background"
                            >
                                <img
                                    src={ref.preview}
                                    className="h-full w-full object-cover"
                                    alt="ref"
                                />
                                <button
                                    className="absolute top-1 right-1 rounded-full bg-background/50 p-0.5 text-foreground transition-colors hover:bg-background/80"
                                    onClick={() => removeReferenceImage(index)}
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple
                    ref={fileInputRef}
                    onChange={handleFileChange}
                />
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col">
                <div ref={scrollContainerRef} className="custom-scrollbar flex-1 overflow-y-auto">
                    {/* Input Section */}
                    <div className="space-y-3 border-b p-4">
                        <div className="flex items-center justify-between font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                            <div className="flex items-center gap-2">
                                <svg
                                    className="h-3.5 w-3.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                                </svg>
                                MODELS
                            </div>
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                {selectedModelIds.length} active
                            </span>
                        </div>

                        <div className="flex flex-col space-y-1">
                            {imageModels.map((model) => {
                                const isSelected = selectedModelIds.includes(model.id)
                                return (
                                    <button
                                        key={model.id}
                                        onClick={() => toggleModel(model.id)}
                                        className={cn(
                                            "group flex items-center justify-between rounded-md p-3 text-left transition-all duration-200",
                                            isSelected
                                                ? "bg-primary/15 text-primary"
                                                : "text-muted-foreground hover:bg-muted/50"
                                        )}
                                    >
                                        <div className="flex flex-col">
                                            <span
                                                className={cn(
                                                    "font-medium",
                                                    isSelected ? "text-foreground" : ""
                                                )}
                                            >
                                                {model.name}
                                            </span>
                                            <span className="mt-0.5 line-clamp-1 pr-2 text-[10px] opacity-70">
                                                {model.description || "Image generation model"}
                                            </span>
                                        </div>

                                        <div
                                            className={cn(
                                                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                                                isSelected
                                                    ? "border-primary bg-primary"
                                                    : "border-muted-foreground/30 group-hover:border-muted-foreground/50"
                                            )}
                                        >
                                            {isSelected && (
                                                <svg
                                                    className="h-2.5 w-2.5 text-primary-foreground"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="3"
                                                >
                                                    <polyline points="20 6 9 17 4 12" />
                                                </svg>
                                            )}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Aspect Ratio Section */}
                    <div className="space-y-4 p-4">
                        <div className="flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                            <svg
                                className="h-3.5 w-3.5"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            </svg>
                            ASPECT RATIO
                        </div>

                        <div className="custom-scrollbar flex gap-2 overflow-x-auto pb-2">
                            {aspectRatios.map((size) => {
                                const isAvailable = commonImageSizes.includes(size)
                                const isSelected = aspectRatio === size
                                const [wStr, hStr] = size.split(":")
                                const w = Number.parseInt(wStr) || 1
                                const h = Number.parseInt(hStr) || 1

                                return (
                                    <button
                                        key={size}
                                        onClick={() => isAvailable && setAspectRatio(size)}
                                        disabled={!isAvailable}
                                        className={cn(
                                            "flex min-w-[36px] shrink-0 flex-col items-center gap-1.5 rounded-md p-2 transition-all",
                                            !isAvailable && "cursor-not-allowed opacity-30",
                                            isSelected && isAvailable
                                                ? "bg-primary/15 text-primary"
                                                : "text-muted-foreground hover:bg-muted/50"
                                        )}
                                    >
                                        <div className="flex h-5 items-center justify-center">
                                            <div
                                                className={cn(
                                                    "rounded-[2px] border-2",
                                                    isSelected
                                                        ? "border-primary"
                                                        : "border-muted-foreground/50"
                                                )}
                                                style={{
                                                    width:
                                                        w >= h
                                                            ? "18px"
                                                            : `${Math.max(10, 18 * (w / h))}px`,
                                                    height:
                                                        h >= w
                                                            ? "18px"
                                                            : `${Math.max(10, 18 * (h / w))}px`
                                                }}
                                            />
                                        </div>
                                        <span
                                            className={cn(
                                                "font-medium text-[9px]",
                                                isSelected ? "text-foreground" : ""
                                            )}
                                        >
                                            {size}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Resolution Section */}
                    <div className="space-y-4 p-4 pt-0">
                        <div className="flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                            <svg
                                className="h-3.5 w-3.5"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                            RESOLUTION
                        </div>

                        <div className="custom-scrollbar flex gap-2 overflow-x-auto pb-2">
                            {["1K", "2K", "4K"].map((res) => {
                                const isAvailable = commonImageResolutions.includes(res)
                                const isSelected = resolution === res

                                return (
                                    <button
                                        key={res}
                                        onClick={() => isAvailable && setResolution(res)}
                                        disabled={!isAvailable}
                                        className={cn(
                                            "flex min-w-[60px] flex-1 shrink-0 flex-col items-center justify-center rounded-md p-2 transition-all",
                                            !isAvailable && "cursor-not-allowed opacity-30",
                                            isSelected && isAvailable
                                                ? "border border-primary/20 bg-primary/15 text-primary"
                                                : "border border-transparent text-muted-foreground hover:bg-muted/50"
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "font-medium text-xs",
                                                isSelected ? "text-foreground" : ""
                                            )}
                                        >
                                            {res.toLowerCase()}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
                {showGradient && (
                    <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-20 bg-gradient-to-t from-background via-background/60 to-transparent" />
                )}
            </div>

            {/* Bottom Generate Button */}
            <div className="sticky bottom-0 z-10 border-t bg-background p-4">
                <Button
                    onClick={handleGenerate}
                    disabled={
                        !prompt ||
                        selectedModelIds.length === 0 ||
                        isGenerating ||
                        commonImageSizes.length === 0
                    }
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary font-medium text-secondary-foreground hover:bg-secondary/80"
                >
                    {isGenerating ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Generating...
                        </>
                    ) : (
                        <>
                            <Sparkles className="h-4 w-4 text-muted-foreground" />
                            Generate
                        </>
                    )}
                </Button>
            </div>
        </div>
    )
}
