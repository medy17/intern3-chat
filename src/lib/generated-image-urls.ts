import { browserEnv } from "@/lib/browser-env"
import { type PrivateBlurFormat, getConstrainedWidth } from "@/lib/private-blur-variants"

const LOCAL_IMAGE_HOSTS = new Set(["localhost", "127.0.0.1"])
const DEV_CONVEX_HTTP_PROXY_PREFIX = "/convex-http"

let preferredPrivateBlurFormat: PrivateBlurFormat | null | undefined

export const resetPrivateBlurFormatCacheForTests = () => {
    preferredPrivateBlurFormat = undefined
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

const supportsCanvasMimeType = (mimeType: string) => {
    if (typeof document === "undefined") {
        return false
    }

    const canvas = document.createElement("canvas")
    if (typeof canvas.toDataURL !== "function") {
        return false
    }

    try {
        return canvas.toDataURL(mimeType).startsWith(`data:${mimeType}`)
    } catch {
        return false
    }
}

export const getPreferredPrivateBlurFormat = (): PrivateBlurFormat | null => {
    if (preferredPrivateBlurFormat !== undefined) {
        return preferredPrivateBlurFormat
    }

    if (import.meta.env.DEV) {
        preferredPrivateBlurFormat = null
        return preferredPrivateBlurFormat
    }

    if (typeof window === "undefined") {
        preferredPrivateBlurFormat = null
        return preferredPrivateBlurFormat
    }

    if (supportsCanvasMimeType("image/avif")) {
        preferredPrivateBlurFormat = "avif"
        return preferredPrivateBlurFormat
    }

    if (supportsCanvasMimeType("image/webp")) {
        preferredPrivateBlurFormat = "webp"
        return preferredPrivateBlurFormat
    }

    preferredPrivateBlurFormat = null
    return preferredPrivateBlurFormat
}

export const getGeneratedImageProxyUrl = (storageKey: string) => {
    const apiBase = browserEnv("VITE_CONVEX_API_URL").replace(/\/$/, "")
    return `${apiBase}/r2?key=${encodeURIComponent(storageKey)}`
}

export const getGeneratedImageCopyUrl = (storageKey: string) => {
    if (import.meta.env.DEV) {
        return `${DEV_CONVEX_HTTP_PROXY_PREFIX}/r2?key=${encodeURIComponent(storageKey)}`
    }

    return getGeneratedImageProxyUrl(storageKey)
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

export const getPrivateBlurImageUrl = ({
    storageKey,
    aspectRatio,
    longEdge,
    format
}: {
    storageKey: string
    aspectRatio?: string
    longEdge: number
    format: PrivateBlurFormat
}) => {
    const width = getConstrainedWidth(aspectRatio, longEdge)
    const params = new URLSearchParams({
        key: storageKey,
        w: String(width),
        fmt: format
    })

    const apiBase = browserEnv("VITE_CONVEX_API_URL").replace(/\/$/, "")
    return `${apiBase}/private-blur?${params.toString()}`
}

export const getLibraryImageSources = ({
    storageKey,
    aspectRatio,
    hidden = false
}: {
    storageKey: string
    aspectRatio?: string
    hidden?: boolean
}) => {
    const smallWidth = getConstrainedWidth(aspectRatio, 576)
    const largeWidth = getConstrainedWidth(aspectRatio, 720)
    const preferredBlurFormat = hidden ? getPreferredPrivateBlurFormat() : null

    if (hidden && preferredBlurFormat) {
        return {
            src: getPrivateBlurImageUrl({
                storageKey,
                aspectRatio,
                longEdge: 720,
                format: preferredBlurFormat
            }),
            srcSet: [
                `${getPrivateBlurImageUrl({
                    storageKey,
                    aspectRatio,
                    longEdge: 576,
                    format: preferredBlurFormat
                })} ${smallWidth}w`,
                `${getPrivateBlurImageUrl({
                    storageKey,
                    aspectRatio,
                    longEdge: 720,
                    format: preferredBlurFormat
                })} ${largeWidth}w`
            ].join(", "),
            sizes: "(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw",
            useCssBlurFallback: false
        }
    }

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
                quality: 80
            })} ${smallWidth}w`,
            `${getOptimizedGeneratedImageUrl({
                storageKey,
                aspectRatio,
                longEdge: 720,
                quality: 76
            })} ${largeWidth}w`
        ].join(", "),
        sizes: "(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw",
        useCssBlurFallback: hidden
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
