import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useIsMobile } from "./use-mobile"

describe("useIsMobile", () => {
    let addEventListenerMock: any
    let removeEventListenerMock: any

    beforeEach(() => {
        addEventListenerMock = vi.fn()
        removeEventListenerMock = vi.fn()

        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query) => ({
                matches: false,
                media: query,
                onchange: null,
                addEventListener: addEventListenerMock,
                removeEventListener: removeEventListenerMock,
                dispatchEvent: vi.fn()
            }))
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("should return false if innerWidth > 768", () => {
        Object.defineProperty(window, "innerWidth", {
            writable: true,
            configurable: true,
            value: 1024
        })
        const { result } = renderHook(() => useIsMobile())
        expect(result.current).toBe(false)
    })

    it("should return true if innerWidth < 768", () => {
        Object.defineProperty(window, "innerWidth", {
            writable: true,
            configurable: true,
            value: 500
        })
        const { result } = renderHook(() => useIsMobile())
        expect(result.current).toBe(true)
    })
})
