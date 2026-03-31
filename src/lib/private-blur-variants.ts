export type PrivateBlurFormat = "avif" | "webp"

const PRIVATE_BLUR_VERSION = "v3"
const PRIVATE_BLUR_LONG_EDGES = [576, 720] as const

export const normalizeAspectRatio = (aspectRatio?: string) => {
    if (!aspectRatio) return 1

    if (aspectRatio.includes("x")) {
        const [width, height] = aspectRatio.split("x").map(Number)
        if (width > 0 && height > 0) {
            return width / height
        }
    }

    if (aspectRatio.includes(":")) {
        const baseRatio = aspectRatio.replace("-hd", "")
        const [width, height] = baseRatio.split(":").map(Number)
        if (width > 0 && height > 0) {
            return width / height
        }
    }

    return 1
}

export const getConstrainedWidth = (aspectRatio: string | undefined, longEdge: number) => {
    const ratio = normalizeAspectRatio(aspectRatio)
    if (ratio >= 1) {
        return longEdge
    }

    return Math.max(1, Math.round(longEdge * ratio))
}

export const getLibraryPrivateBlurWidths = (aspectRatio?: string) =>
    PRIVATE_BLUR_LONG_EDGES.map((longEdge) => getConstrainedWidth(aspectRatio, longEdge))

export const getPrivateBlurStorageKey = ({
    storageKey,
    width,
    format
}: {
    storageKey: string
    width: number
    format: PrivateBlurFormat
}) => {
    const keyWithoutExtension = storageKey.replace(/\.[^.\/]+$/, "")
    const normalizedKey = keyWithoutExtension.startsWith("generations/")
        ? keyWithoutExtension.slice("generations/".length)
        : keyWithoutExtension

    return `blurred_generations/${normalizedKey}__pv-w${width}-${PRIVATE_BLUR_VERSION}.${format}`
}

export const getPrivateBlurAuthorId = (storageKey: string) => {
    const [, userId] = storageKey.split("/")
    return userId || "derived"
}
