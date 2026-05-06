import {
    LOCAL_THEME_FONTS,
    LOCAL_THEME_FONT_PRELOADS,
    T3_CHAT_THEME_URL,
    type ThemePresetLike,
    applyThemeFontOverrides,
    getLocalThemeFontFaceCss
} from "@/lib/theme-font-config"
import { describe, expect, it } from "vitest"

function createPreset(fontSans: string): ThemePresetLike {
    return {
        cssVars: {
            theme: {
                "font-sans": fontSans,
                radius: "0.5rem"
            },
            light: {
                "font-sans": fontSans,
                primary: "oklch(0 0 0)"
            },
            dark: {
                "font-sans": fontSans,
                primary: "oklch(1 0 0)"
            }
        }
    }
}

describe("applyBuiltInThemeOverrides", () => {
    it("overrides t3-chat to use ProximaVara", () => {
        const preset = createPreset("system-ui, sans-serif")

        const result = applyThemeFontOverrides(T3_CHAT_THEME_URL, preset)

        expect(result.cssVars.theme["font-sans"]).toBe(LOCAL_THEME_FONTS.proximaVara.stack)
        expect(result.cssVars.light["font-sans"]).toBe(LOCAL_THEME_FONTS.proximaVara.stack)
        expect(result.cssVars.dark["font-sans"]).toBe(LOCAL_THEME_FONTS.proximaVara.stack)
        expect(result.cssVars.theme.radius).toBe("0.5rem")
    })

    it("leaves other themes untouched", () => {
        const preset = createPreset("Geist Mono, monospace")

        const result = applyThemeFontOverrides(
            "https://tweakcn.com/editor/theme?theme=mono",
            preset
        )

        expect(result).toEqual(preset)
    })

    it("exposes local font asset metadata", () => {
        expect(LOCAL_THEME_FONT_PRELOADS).toContainEqual({
            href: "/fonts/proxima-vara.woff2",
            type: "font/woff2"
        })
        expect(getLocalThemeFontFaceCss()).toContain('font-family: "ProximaVara";')
        expect(getLocalThemeFontFaceCss()).toContain('url("/fonts/proxima-vara.woff2")')
    })
})
