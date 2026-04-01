const STALE_ASSET_RELOAD_KEY = "stale-asset-reload-at"
const STALE_ASSET_RELOAD_COOLDOWN_MS = 60_000

const STALE_ASSET_ERROR_PATTERNS = [
    "failed to fetch dynamically imported module",
    "error loading dynamically imported module",
    "importing a module script failed",
    "failed to load module script",
    "unable to preload css",
    "unable to preload"
] as const

function normalizeErrorMessage(error: unknown): string {
    if (typeof error === "string") {
        return error.toLowerCase()
    }

    if (error instanceof Error) {
        return error.message.toLowerCase()
    }

    if (typeof error === "object" && error !== null) {
        const message =
            "message" in error && typeof error.message === "string"
                ? error.message
                : "reason" in error && typeof error.reason === "string"
                  ? error.reason
                  : null

        if (message) {
            return message.toLowerCase()
        }
    }

    return ""
}

export function isStaleAssetError(error: unknown): boolean {
    const message = normalizeErrorMessage(error)

    return STALE_ASSET_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
}

export function shouldReloadForStaleAsset(
    storage: Pick<Storage, "getItem" | "setItem">,
    now = Date.now()
) {
    const lastReloadRaw = storage.getItem(STALE_ASSET_RELOAD_KEY)
    const lastReloadAt = lastReloadRaw ? Number.parseInt(lastReloadRaw, 10) : Number.NaN

    if (Number.isFinite(lastReloadAt) && now - lastReloadAt < STALE_ASSET_RELOAD_COOLDOWN_MS) {
        return false
    }

    storage.setItem(STALE_ASSET_RELOAD_KEY, String(now))
    return true
}

type RecoveryOptions = {
    reload?: () => void
    storage?: Pick<Storage, "getItem" | "setItem">
    now?: () => number
}

export function installStaleAssetRecovery({
    reload = () => window.location.reload(),
    storage = window.sessionStorage,
    now = () => Date.now()
}: RecoveryOptions = {}) {
    const recover = (error: unknown, preventDefault?: () => void) => {
        if (!isStaleAssetError(error)) {
            return false
        }

        preventDefault?.()

        if (!shouldReloadForStaleAsset(storage, now())) {
            return true
        }

        console.warn("Reloading page after stale asset load failure", error)
        reload()
        return true
    }

    const handlePreloadError = (event: Event) => {
        const customEvent = event as Event & {
            payload?: unknown
        }

        recover(customEvent.payload, () => event.preventDefault())
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        recover(event.reason, () => event.preventDefault())
    }

    const handleWindowError = (event: ErrorEvent) => {
        recover(event.error ?? event.message, () => event.preventDefault())
    }

    window.addEventListener("vite:preloadError", handlePreloadError)
    window.addEventListener("unhandledrejection", handleUnhandledRejection)
    window.addEventListener("error", handleWindowError)

    return () => {
        window.removeEventListener("vite:preloadError", handlePreloadError)
        window.removeEventListener("unhandledrejection", handleUnhandledRejection)
        window.removeEventListener("error", handleWindowError)
    }
}
