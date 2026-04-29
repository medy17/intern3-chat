import { ImageSkeleton } from "@/components/ui/image-skeleton"
import { memo, useMemo } from "react"

export const PendingImageItem = memo(({ aspectRatio }: { aspectRatio: string }) => {
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
            className="group relative overflow-hidden rounded-[var(--radius-lg)] border bg-background"
            style={{ aspectRatio: cssAspectRatio }}
        >
            <ImageSkeleton
                rows={rows}
                cols={cols}
                dotSize={3}
                gap={4}
                loadingDuration={99999}
                autoLoop={false}
                className="h-full w-full rounded-[var(--radius-lg)] border-0 bg-transparent"
            />
        </div>
    )
})
PendingImageItem.displayName = "PendingImageItem"
