// @vitest-environment jsdom

import {
    installStaleAssetRecovery,
    isStaleAssetError,
    shouldReloadForStaleAsset
} from "@/lib/stale-asset-recovery"
import { afterEach, describe, expect, it, vi } from "vitest"

describe("isStaleAssetError", () => {
    it("matches dynamic import fetch failures", () => {
        expect(
            isStaleAssetError(new TypeError("Failed to fetch dynamically imported module"))
        ).toBe(true)
    })

    it("ignores unrelated errors", () => {
        expect(isStaleAssetError(new Error("Network timeout"))).toBe(false)
    })
})

describe("shouldReloadForStaleAsset", () => {
    it("allows a reload once within the cooldown window", () => {
        const storage = new Map<string, string>()
        const adapter = {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                storage.set(key, value)
            }
        }

        expect(shouldReloadForStaleAsset(adapter, 1_000)).toBe(true)
        expect(shouldReloadForStaleAsset(adapter, 1_500)).toBe(false)
        expect(shouldReloadForStaleAsset(adapter, 62_000)).toBe(true)
    })
})

describe("installStaleAssetRecovery", () => {
    afterEach(() => {
        window.sessionStorage.clear()
        vi.restoreAllMocks()
    })

    it("reloads once for stale preload errors", () => {
        const reload = vi.fn()
        const cleanup = installStaleAssetRecovery({ reload, now: () => 5_000 })

        const event = new Event("vite:preloadError", {
            cancelable: true
        }) as Event & { payload?: unknown }
        event.payload = new TypeError("Failed to fetch dynamically imported module")

        window.dispatchEvent(event)
        window.dispatchEvent(event)

        cleanup()

        expect(reload).toHaveBeenCalledTimes(1)
        expect(event.defaultPrevented).toBe(true)
    })

    it("reloads once for stale unhandled import failures", () => {
        const reload = vi.fn()
        const cleanup = installStaleAssetRecovery({ reload, now: () => 8_000 })

        const event = new PromiseRejectionEvent("unhandledrejection", {
            cancelable: true,
            promise: new Promise(() => {}),
            reason: new TypeError("Importing a module script failed")
        })

        window.dispatchEvent(event)

        cleanup()

        expect(reload).toHaveBeenCalledTimes(1)
        expect(event.defaultPrevented).toBe(true)
    })
})
