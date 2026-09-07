import { useCallback, useEffect, useRef, useState } from "react"

/** Shares load bookkeeping, not presentation: each viewer owns its cache and reveal timing. */
export function useImageViewerLoad({
    url,
    enabled = true,
    cache,
    revealMs = 0
}: {
    url: string
    enabled?: boolean
    cache: Set<string>
    revealMs?: number
}) {
    const imageRef = useRef<HTMLImageElement | null>(null)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [loadState, setLoadState] = useState<"loading" | "revealing" | "ready">("loading")

    const clearReveal = useCallback(() => {
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
    }, [])

    useEffect(() => {
        clearReveal()
        if (!enabled || !url) return
        if (cache.has(url)) {
            setLoadState("ready")
            return
        }
        setLoadState("loading")
        const frame = window.requestAnimationFrame(() => {
            const element = imageRef.current
            if (element?.complete && element.naturalWidth > 0) {
                cache.add(url)
                setLoadState("ready")
            }
        })
        return () => {
            window.cancelAnimationFrame(frame)
            clearReveal()
        }
    }, [url, enabled, cache, clearReveal])

    const handleImageLoad = () => {
        clearReveal()
        if (cache.has(url) || revealMs === 0) {
            cache.add(url)
            setLoadState("ready")
            return
        }
        cache.add(url)
        setLoadState("revealing")
        timeoutRef.current = setTimeout(() => {
            setLoadState("ready")
            timeoutRef.current = null
        }, revealMs)
    }

    const handleImageFailure = (hasFallback: boolean) => {
        clearReveal()
        cache.delete(url)
        setLoadState(hasFallback ? "loading" : "ready")
    }

    return { imageRef, loadState, handleImageLoad, handleImageFailure }
}
