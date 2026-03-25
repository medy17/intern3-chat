import { describe, expect, it } from "vitest"
import { useThemeStore } from "./theme-store"

describe("theme-store", () => {
    it("should have a default light theme", () => {
        const state = useThemeStore.getState()
        expect(state.themeState.currentMode).toBe("light")
        expect(state.themeState.cssVars).toBeDefined()
    })

    it("should allow setting theme state", () => {
        const newState = {
            currentMode: "dark" as const,
            cssVars: {
                theme: {},
                light: {},
                dark: {}
            }
        }

        useThemeStore.getState().setThemeState(newState)
        expect(useThemeStore.getState().themeState.currentMode).toBe("dark")
    })
})
