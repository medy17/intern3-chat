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
    const onCloseRef = React.useRef(onClose)

    React.useEffect(() => {
        onCloseRef.current = onClose
    }, [onClose])

    React.useEffect(() => {
        if (!enabled) {
            return
        }

        const handlePopState = (event: PopStateEvent) => {
            const entryId = entryIdRef.current
            if (!entryId) {
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

            onCloseRef.current()
        }

        window.addEventListener("popstate", handlePopState)
        return () => {
            window.removeEventListener("popstate", handlePopState)
        }
    }, [enabled])

    React.useEffect(() => {
        if (!enabled) {
            entryIdRef.current = null
            return
        }

        if (open && !entryIdRef.current) {
            const entryId = createOverlayEntryId()
            entryIdRef.current = entryId

            window.history.pushState(
                { ...getHistoryState(), [OVERLAY_HISTORY_KEY]: entryId },
                "",
                window.location.href
            )
            return
        }

        if (!open && entryIdRef.current) {
            const entryId = entryIdRef.current
            const currentState = window.history.state as Record<string, unknown> | null
            entryIdRef.current = null

            if (currentState?.[OVERLAY_HISTORY_KEY] === entryId) {
                suppressNextPopCloseRef.current = true
                window.history.back()
            }
        }
    }, [enabled, open])
}
