// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useImageViewerLoad } from "@/hooks/use-image-viewer-load"
import { useImageViewerActions } from "@/hooks/use-image-viewer-actions"
import { copyViewerPrompt } from "@/lib/image-viewer-clipboard"
import { downloadUrl } from "@/lib/utils"
import { toast } from "sonner"

vi.mock("@/lib/utils", () => ({ downloadUrl: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
        window.setTimeout(() => callback(0), 16)
    )
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => window.clearTimeout(id))
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: vi.fn().mockResolvedValue(undefined) }
    })
    vi.mocked(downloadUrl).mockResolvedValue(undefined)
})
afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.clearAllMocks()
})

describe("image viewer loading", () => {
    it.each([0, 240])("preserves the viewer's %i ms reveal policy", (revealMs) => {
        const cache = new Set<string>()
        const hook = renderHook(() => useImageViewerLoad({ url: "image", cache, revealMs }))
        act(() => hook.result.current.handleImageLoad())
        expect(hook.result.current.loadState).toBe(revealMs ? "revealing" : "ready")
        act(() => vi.advanceTimersByTime(revealMs))
        expect(hook.result.current.loadState).toBe("ready")
        expect(cache.has("image")).toBe(true)
    })

    it("recognizes a browser-cached image even when its load event was missed", () => {
        const cache = new Set<string>()
        const hook = renderHook(() => useImageViewerLoad({ url: "cached", cache, revealMs: 240 }))
        const image = document.createElement("img")
        Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 500 } })
        hook.result.current.imageRef.current = image
        act(() => vi.advanceTimersByTime(16))
        expect(hook.result.current.loadState).toBe("ready")
        hook.unmount()
        const remounted = renderHook(() =>
            useImageViewerLoad({ url: "cached", cache, revealMs: 240 })
        )
        expect(remounted.result.current.loadState).toBe("ready")
    })

    it("does not let an old reveal timer finish loading a different image", () => {
        const cache = new Set<string>()
        const hook = renderHook(({ url }) => useImageViewerLoad({ url, cache, revealMs: 240 }), {
            initialProps: { url: "first" }
        })
        act(() => hook.result.current.handleImageLoad())
        hook.rerender({ url: "second" })
        act(() => vi.advanceTimersByTime(240))
        expect(hook.result.current.loadState).toBe("loading")
    })

    it("evicts failed sources and stops the spinner when no fallback remains", () => {
        const cache = new Set(["optimized"])
        const hook = renderHook(({ url }) => useImageViewerLoad({ url, cache }), {
            initialProps: { url: "optimized" }
        })
        act(() => hook.result.current.handleImageFailure(true))
        expect(cache.has("optimized")).toBe(false)
        expect(hook.result.current.loadState).toBe("loading")
        hook.rerender({ url: "direct" })
        act(() => hook.result.current.handleImageFailure(false))
        expect(hook.result.current.loadState).toBe("ready")
    })

    it("cleans up timers when the viewer closes or unmounts", () => {
        const cache = new Set<string>()
        const hook = renderHook(
            ({ enabled }) => useImageViewerLoad({ url: "image", enabled, cache, revealMs: 240 }),
            { initialProps: { enabled: true } }
        )
        act(() => hook.result.current.handleImageLoad())
        hook.rerender({ enabled: false })
        hook.unmount()
        expect(vi.getTimerCount()).toBe(0)
    })
})

describe("image viewer actions", () => {
    it("preserves the library context menu's untrimmed prompt and silent empty case", async () => {
        await copyViewerPrompt({ prompt: "  A forest  ", trim: false, reportEmpty: false })
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith("  A forest  ")
        vi.mocked(navigator.clipboard.writeText).mockClear()
        await copyViewerPrompt({ prompt: "", trim: false, reportEmpty: false })
        expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
    })
    const options = {
        url: "https://example.com/original",
        storageKey: "generations/user/photo.webp",
        prompt: "  A forest  ",
        fallbackFileName: "image",
        resetKey: "one"
    }

    it("downloads the full-resolution URL using the existing filename", async () => {
        const hook = renderHook(() => useImageViewerActions(options))
        await act(() => hook.result.current.handleDownload())
        expect(downloadUrl).toHaveBeenCalledWith({ url: options.url, fileName: "photo.webp" })
    })

    it("uses the variant filename fallback and reports download failures", async () => {
        vi.mocked(downloadUrl).mockRejectedValueOnce(new Error("Network"))
        vi.spyOn(console, "error").mockImplementation(() => {})
        const hook = renderHook(() =>
            useImageViewerActions({
                ...options,
                storageKey: "",
                fallbackFileName: "silkscreen-image-A"
            })
        )
        await act(() => hook.result.current.handleDownload())
        expect(downloadUrl).toHaveBeenCalledWith({
            url: options.url,
            fileName: "silkscreen-image-A"
        })
        expect(toast.error).toHaveBeenCalledWith("Failed to download image")
    })

    it("shows prompt-copy feedback for 1500 ms after the clipboard succeeds", async () => {
        const hook = renderHook(() => useImageViewerActions(options))
        await act(() => hook.result.current.handleCopyPrompt())
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith("A forest")
        expect(hook.result.current.isPromptCopied).toBe(true)
        act(() => vi.advanceTimersByTime(1500))
        expect(hook.result.current.isPromptCopied).toBe(false)
    })

    it("does not claim success when clipboard permission is denied", async () => {
        vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("Denied"))
        const hook = renderHook(() => useImageViewerActions(options))
        await act(() => hook.result.current.handleCopyPrompt())
        expect(hook.result.current.isPromptCopied).toBe(false)
        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).toHaveBeenCalledWith("Failed to copy prompt")
    })

    it("ignores a pending clipboard result after navigating to another image", async () => {
        let resolve!: () => void
        vi.mocked(navigator.clipboard.writeText).mockReturnValueOnce(
            new Promise<void>((r) => {
                resolve = r
            })
        )
        const hook = renderHook(({ resetKey }) => useImageViewerActions({ ...options, resetKey }), {
            initialProps: { resetKey: "one" }
        })
        let pending!: Promise<void>
        act(() => {
            pending = hook.result.current.handleCopyPrompt()
        })
        hook.rerender({ resetKey: "two" })
        await act(async () => {
            resolve()
            await pending
        })
        expect(hook.result.current.isPromptCopied).toBe(false)
        expect(toast.success).not.toHaveBeenCalled()
    })
})
