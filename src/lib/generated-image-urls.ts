import { browserEnv } from "@/lib/browser-env"

const LOCAL_IMAGE_HOSTS = new Set(["localhost", "127.0.0.1"])

const normalizeAspectRatio = (aspectRatio?: string) => {
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

const getConstrainedWidth = (aspectRatio: string | undefined, longEdge: number) => {
    const ratio = normalizeAspectRatio(aspectRatio)
    if (ratio >= 1) {
        return longEdge
    }

    return Math.max(1, Math.round(longEdge * ratio))
}

const shouldBypassVercelOptimization = () => {
    if (import.meta.env.DEV) {
        return true
    }

    if (typeof window === "undefined") {
        return false
    }

    return LOCAL_IMAGE_HOSTS.has(window.location.hostname)
}

export const getGeneratedImageProxyUrl = (storageKey: string) => {
    const apiBase = browserEnv("VITE_CONVEX_API_URL").replace(/\/$/, "")
    return `${apiBase}/r2?key=${encodeURIComponent(storageKey)}`
}

export const getOptimizedGeneratedImageUrl = ({
    storageKey,
    aspectRatio,
    longEdge,
    quality = 60
}: {
    storageKey: string
    aspectRatio?: string
    longEdge: number
    quality?: number
}) => {
    const sourceUrl = getGeneratedImageProxyUrl(storageKey)

    if (shouldBypassVercelOptimization()) {
        return sourceUrl
    }

    const width = getConstrainedWidth(aspectRatio, longEdge)
    return `/_vercel/image?url=${encodeURIComponent(sourceUrl)}&w=${width}&q=${quality}`
}

export const getLibraryImageSources = ({
    storageKey,
    aspectRatio
}: {
    storageKey: string
    aspectRatio?: string
}) => {
    const smallWidth = getConstrainedWidth(aspectRatio, 576)
    const largeWidth = getConstrainedWidth(aspectRatio, 720)

    return {
        src: getOptimizedGeneratedImageUrl({
            storageKey,
            aspectRatio,
            longEdge: 720,
            quality: 76
        }),
        srcSet: [
            `${getOptimizedGeneratedImageUrl({
                storageKey,
                aspectRatio,
                longEdge: 576,
                quality: 70
            })} ${smallWidth}w`,
            `${getOptimizedGeneratedImageUrl({
                storageKey,
                aspectRatio,
                longEdge: 720,
                quality: 76
            })} ${largeWidth}w`
        ].join(", "),
        sizes: "(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
    }
}

export const getExpandedImageUrl = ({
    storageKey,
    aspectRatio
}: {
    storageKey: string
    aspectRatio?: string
}) =>
    getOptimizedGeneratedImageUrl({
        storageKey,
        aspectRatio,
        longEdge: 1080,
        quality: 84
    })
