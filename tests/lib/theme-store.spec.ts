// @vitest-environment jsdom

import { DEFAULT_THEME_SANS_FONT_STACK } from "@/lib/theme-font-config"
import { beforeEach, describe, expect, it, vi } from "vitest"

function createLocalStorage() {
    const storage = new Map<string, string>()

    return {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
        key: (index: number) => Array.from(storage.keys())[index] ?? null,
        get length() {
            return storage.size
        }
    }
}

let moduleCounter = 0
const loadStore = async () => {
    if (typeof vi.resetModules === "function") {
        vi.resetModules()
        return await import("@/lib/theme-store")
    }

    return await import(`../../src/lib/theme-store.ts?test=${moduleCounter++}`)
}

describe("theme-store", () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: globalThis
        })
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: createLocalStorage()
        })
    })

    it("defaults to the Vercel theme", async () => {
        const { useThemeStore, isDefaultThemeCssVars } = await loadStore()

        const { themeState, selectedThemeUrl } = useThemeStore.getState()
        expect(selectedThemeUrl).toBeNull()
        expect(themeState.currentMode).toBe("dark")
        expect(isDefaultThemeCssVars(themeState.cssVars)).toBe(true)
        expect(themeState.cssVars.theme["font-sans"]).toBe(DEFAULT_THEME_SANS_FONT_STACK)
        expect(themeState.cssVars.light.primary).toBe("oklch(0 0 0)")
    })

    it("resets to the Vercel theme", async () => {
        const {
            LEGACY_GREEN_THEME_URL,
            getLegacyGreenThemeState,
            isDefaultThemeCssVars,
            useThemeStore
        } = await loadStore()

        useThemeStore.getState().setThemeState(getLegacyGreenThemeState("dark"))
        useThemeStore.getState().setSelectedThemeUrl(LEGACY_GREEN_THEME_URL)

        useThemeStore.getState().resetThemeToDefault()

        const { themeState, selectedThemeUrl } = useThemeStore.getState()
        expect(selectedThemeUrl).toBeNull()
        expect(themeState.currentMode).toBe("dark")
        expect(isDefaultThemeCssVars(themeState.cssVars)).toBe(true)
    })

    it("preserves non-null selected theme URLs", async () => {
        const { getLegacyGreenThemeState, normalizeThemeStoreStateForDefault } = await loadStore()
        const legacyState = getLegacyGreenThemeState("dark")

        const normalized = normalizeThemeStoreStateForDefault({
            themeState: legacyState,
            selectedThemeUrl: "https://tweakcn.com/editor/theme?theme=mono"
        })

        expect(normalized.selectedThemeUrl).toBe("https://tweakcn.com/editor/theme?theme=mono")
        expect(normalized.themeState).toEqual(legacyState)
    })

    it("preserves arbitrary custom css variables without a selected URL", async () => {
        const { getDefaultThemeState, normalizeThemeStoreStateForDefault } = await loadStore()
        const customState = getDefaultThemeState("light")
        customState.cssVars.light.primary = "oklch(0.5 0.2 120)"

        const normalized = normalizeThemeStoreStateForDefault({
            themeState: customState,
            selectedThemeUrl: null
        })

        expect(normalized.selectedThemeUrl).toBeNull()
        expect(normalized.themeState).toEqual(customState)
    })
})
