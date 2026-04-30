import { optionalBrowserEnv } from "./browser-env"

export const LOCAL_IMAGE_OPTIMIZER_ENV_KEY = "VITE_LOCAL_IMAGE_OPTIMIZER_ENABLED"
export const LOCAL_IMAGE_OPTIMIZER_DEFAULT_PORT = 43177
export const LOCAL_IMAGE_OPTIMIZER_CACHE_DIR = ".optimised-image-cache"
export const LOCAL_IMAGE_OPTIMIZER_CACHE_VERSION = "v1"
export const LOCAL_IMAGE_OPTIMIZER_ROUTE_PREFIX = "/cdn-cgi/image"

const MAX_IMAGE_WIDTH = 4096
const MIN_IMAGE_QUALITY = 1
const MAX_IMAGE_QUALITY = 100

export type ParsedLocalImageTransformOptions = {
    fit: "scale-down"
    width: number
    quality: number
    format: "auto"
}

const parseIntegerInRange = (value: string | undefined, min: number, max: number) => {
    if (!value || !/^\d+$/.test(value)) {
        return null
    }

    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        return null
    }

    return parsed
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "")

export const isLocalImageOptimizerEnabled = () =>
    import.meta.env.DEV && optionalBrowserEnv(LOCAL_IMAGE_OPTIMIZER_ENV_KEY) === "1"

export const buildLocalImageOptimizerUrl = ({
    sourceUrl,
    width,
    quality
}: {
    sourceUrl: string
    width: number
    quality: number
}) =>
    `${LOCAL_IMAGE_OPTIMIZER_ROUTE_PREFIX}/fit=scale-down,width=${width},quality=${quality},format=auto/${sourceUrl}`

export const parseLocalImageTransformOptions = (
    value: string
): ParsedLocalImageTransformOptions | null => {
    const entries = value.split(",")
    const parsed: Partial<ParsedLocalImageTransformOptions> = {}

    for (const entry of entries) {
        const [rawKey, rawValue] = entry.split("=")
        if (!rawKey || rawValue === undefined) {
            return null
        }

        const key = rawKey.trim()
        const normalizedValue = rawValue.trim()

        switch (key) {
            case "fit":
                if (normalizedValue !== "scale-down") {
                    return null
                }
                parsed.fit = "scale-down"
                break
            case "width": {
                const width = parseIntegerInRange(normalizedValue, 1, MAX_IMAGE_WIDTH)
                if (width === null) {
                    return null
                }
                parsed.width = width
                break
            }
            case "quality": {
                const quality = parseIntegerInRange(
                    normalizedValue,
                    MIN_IMAGE_QUALITY,
                    MAX_IMAGE_QUALITY
                )
                if (quality === null) {
                    return null
                }
                parsed.quality = quality
                break
            }
            case "format":
                if (normalizedValue !== "auto") {
                    return null
                }
                parsed.format = "auto"
                break
            default:
                return null
        }
    }

    if (
        parsed.fit !== "scale-down" ||
        !parsed.width ||
        !parsed.quality ||
        parsed.format !== "auto"
    ) {
        return null
    }

    return parsed as ParsedLocalImageTransformOptions
}

export const extractLocalImageOptimizerRequestParts = (requestUrl: URL) => {
    const prefix = `${LOCAL_IMAGE_OPTIMIZER_ROUTE_PREFIX}/`
    if (!requestUrl.pathname.startsWith(prefix)) {
        return null
    }

    const remainder = requestUrl.pathname.slice(prefix.length)
    const slashIndex = remainder.indexOf("/")
    if (slashIndex <= 0 || slashIndex === remainder.length - 1) {
        return null
    }

    const optionsSegment = remainder.slice(0, slashIndex)
    const sourcePath = remainder.slice(slashIndex + 1)
    const sourceUrl = `${sourcePath}${requestUrl.search}`

    return {
        optionsSegment,
        sourceUrl
    }
}

export const isAllowedLocalImageOptimizerSource = ({
    sourceUrl,
    convexApiUrl
}: {
    sourceUrl: string
    convexApiUrl: string
}) => {
    try {
        const parsedSourceUrl = new URL(sourceUrl)
        const convexUrl = new URL(convexApiUrl)
        const expectedPath = `${trimTrailingSlash(convexUrl.pathname)}/r2`

        if (parsedSourceUrl.origin !== convexUrl.origin) {
            return false
        }

        if (parsedSourceUrl.pathname !== expectedPath) {
            return false
        }

        return Boolean(parsedSourceUrl.searchParams.get("key"))
    } catch {
        return false
    }
}

export const getLocalImageOptimizerCacheKeyInput = ({
    sourceUrl,
    width,
    quality,
    format
}: {
    sourceUrl: string
    width: number
    quality: number
    format: string
}) =>
    [
        LOCAL_IMAGE_OPTIMIZER_CACHE_VERSION,
        `width=${width}`,
        `quality=${quality}`,
        `format=${format}`,
        sourceUrl
    ].join("|")
