import * as React from "react"

const OVERLAY_HISTORY_KEY = "__silkchatOverlayBackDismiss"

const getHistoryState = () => {
    const state = window.history.state
    if (state && typeof state === "object") {
        return state as Record<string, unknown>
    }

    return {}
}

const createOverlayEntryId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID()
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useOverlayBackDismiss = ({
    open,
    onClose,
    enabled
}: {
    open: boolean
    onClose: () => void
    enabled: boolean
}) => {
    const entryIdRef = React.useRef<string | null>(null)
    const suppressNextPopCloseRef = React.useRef(false)

    React.useEffect(() => {
        if (!enabled || !open) {
            return
        }

        const entryId = createOverlayEntryId()
        entryIdRef.current = entryId

        window.history.pushState(
            { ...getHistoryState(), [OVERLAY_HISTORY_KEY]: entryId },
            "",
            window.location.href
        )

        const handlePopState = (event: PopStateEvent) => {
            if (entryIdRef.current !== entryId) {
                return
            }

            const nextState = event.state as Record<string, unknown> | null
            // Ignore pops from nested overlays back to this overlay's history marker.
            if (nextState?.[OVERLAY_HISTORY_KEY] === entryId) {
                return
            }

            entryIdRef.current = null
            if (suppressNextPopCloseRef.current) {
                suppressNextPopCloseRef.current = false
                return
            }

            onClose()
        }

        window.addEventListener("popstate", handlePopState)

        return () => {
            window.removeEventListener("popstate", handlePopState)

            if (entryIdRef.current !== entryId) {
                return
            }

            const currentState = window.history.state as Record<string, unknown> | null
            if (currentState?.[OVERLAY_HISTORY_KEY] === entryId) {
                suppressNextPopCloseRef.current = true
                window.history.back()
            }

            entryIdRef.current = null
        }
    }, [enabled, onClose, open])
}
