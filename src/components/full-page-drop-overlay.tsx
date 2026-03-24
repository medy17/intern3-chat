import { cn } from "@/lib/utils"
import { Upload } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

interface FullPageDropOverlayProps {
    onDrop: (files: File[]) => void
    className?: string
}

export function FullPageDropOverlay({ onDrop, className }: FullPageDropOverlayProps) {
    const [isDragOver, setIsDragOver] = useState(false)
    const dragCounterRef = useRef(0)

    const handleDragEnter = useCallback((e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()

        // Only show overlay if dragging files (not text selections, etc.)
        if (!e.dataTransfer?.types.includes("Files")) return

        dragCounterRef.current++
        if (dragCounterRef.current === 1) {
            setIsDragOver(true)
        }
    }, [])

    const handleDragLeave = useCallback((e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()

        dragCounterRef.current--
        if (dragCounterRef.current === 0) {
            setIsDragOver(false)
        }
    }, [])

    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }, [])

    const handleDrop = useCallback(
        (e: DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            dragCounterRef.current = 0
            setIsDragOver(false)

            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                const files = Array.from(e.dataTransfer.files)
                onDrop(files)
            }
        },
        [onDrop]
    )

    useEffect(() => {
        window.addEventListener("dragenter", handleDragEnter)
        window.addEventListener("dragleave", handleDragLeave)
        window.addEventListener("dragover", handleDragOver)
        window.addEventListener("drop", handleDrop)

        return () => {
            window.removeEventListener("dragenter", handleDragEnter)
            window.removeEventListener("dragleave", handleDragLeave)
            window.removeEventListener("dragover", handleDragOver)
            window.removeEventListener("drop", handleDrop)
        }
    }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop])

    return (
        <div
            className={cn(
                "pointer-events-none fixed inset-0 z-[100] flex items-center justify-center transition-all duration-200",
                isDragOver
                    ? "pointer-events-auto bg-background/80 opacity-100 backdrop-blur-sm"
                    : "opacity-0",
                className
            )}
        >
            <div
                className={cn(
                    "flex flex-col items-center gap-4 transition-transform duration-200",
                    isDragOver ? "scale-100" : "scale-90"
                )}
            >
                <div className="flex size-20 items-center justify-center rounded-2xl border-2 border-primary/60 border-dashed bg-primary/10">
                    <Upload className="size-10 text-primary" strokeWidth={2} />
                </div>
                <div className="text-center">
                    <h2 className="font-semibold text-2xl text-foreground">Add Attachment</h2>
                    <p className="mt-1 text-muted-foreground text-sm">
                        Drop a file here to attach it to your message
                    </p>
                    <p className="mt-2 text-muted-foreground/70 text-xs">
                        Accepted file types: Text, PDF, PNG, JPEG, GIF, WebP, SVG, Code
                    </p>
                </div>
            </div>
        </div>
    )
}
