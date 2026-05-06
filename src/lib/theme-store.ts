import { DEFAULT_THEME_SANS_FONT_STACK } from "@/lib/theme-font-config"
import isEqual from "fast-deep-equal"
import { create } from "zustand"
import { persist } from "zustand/middleware"

export const THEME_STORE_KEY = "theme-store"
export const VERCEL_THEME_URL = "https://tweakcn.com/editor/theme?theme=vercel"
export const LEGACY_GREEN_THEME_URL = "silkchat:legacy-green"

export type ThemeMode = "dark" | "light"

export type ThemePreset = {
    cssVars: {
        theme: Record<string, string>
        light: Record<string, string>
        dark: Record<string, string>
    }
}

export type ThemeState = {
    currentMode: ThemeMode
    cssVars: {
        theme: Record<string, string>
        light: Record<string, string>
        dark: Record<string, string>
    }
}

type ThemeStore = {
    themeState: ThemeState
    selectedThemeUrl: string | null
    setThemeState: (themeState: ThemeState) => void
    setSelectedThemeUrl: (selectedThemeUrl: string | null) => void
    resetThemeToDefault: () => void
}

type PersistedThemeState = {
    themeState?: ThemeState | null
    selectedThemeUrl?: string | null
}

export const VERCEL_THEME_PRESET = {
    cssVars: {
        theme: {
            "font-sans": DEFAULT_THEME_SANS_FONT_STACK,
            "font-mono": "Geist Mono, monospace",
            "font-serif": "Georgia, serif",
            radius: "0.5rem",
            "tracking-tighter": "calc(var(--tracking-normal) - 0.05em)",
            "tracking-tight": "calc(var(--tracking-normal) - 0.025em)",
            "tracking-wide": "calc(var(--tracking-normal) + 0.025em)",
            "tracking-wider": "calc(var(--tracking-normal) + 0.05em)",
            "tracking-widest": "calc(var(--tracking-normal) + 0.1em)"
        },
        light: {
            background: "oklch(0.9900 0 0)",
            foreground: "oklch(0 0 0)",
            card: "oklch(1 0 0)",
            "card-foreground": "oklch(0 0 0)",
            popover: "oklch(0.9900 0 0)",
            "popover-foreground": "oklch(0 0 0)",
            primary: "oklch(0 0 0)",
            "primary-foreground": "oklch(1 0 0)",
            secondary: "oklch(0.9400 0 0)",
            "secondary-foreground": "oklch(0 0 0)",
            muted: "oklch(0.9700 0 0)",
            "muted-foreground": "oklch(0.4400 0 0)",
            accent: "oklch(0.9400 0 0)",
            "accent-foreground": "oklch(0 0 0)",
            destructive: "oklch(0.6300 0.1900 23.0300)",
            "destructive-foreground": "oklch(1 0 0)",
            border: "oklch(0.9200 0 0)",
            input: "oklch(0.9400 0 0)",
            ring: "oklch(0 0 0)",
            "chart-1": "oklch(0.8100 0.1700 75.3500)",
            "chart-2": "oklch(0.5500 0.2200 264.5300)",
            "chart-3": "oklch(0.7200 0 0)",
            "chart-4": "oklch(0.9200 0 0)",
            "chart-5": "oklch(0.5600 0 0)",
            radius: "0.5rem",
            sidebar: "oklch(0.9900 0 0)",
            "sidebar-foreground": "oklch(0 0 0)",
            "sidebar-primary": "oklch(0 0 0)",
            "sidebar-primary-foreground": "oklch(1 0 0)",
            "sidebar-accent": "oklch(0.9400 0 0)",
            "sidebar-accent-foreground": "oklch(0 0 0)",
            "sidebar-border": "oklch(0.9400 0 0)",
            "sidebar-ring": "oklch(0 0 0)",
            "font-sans": DEFAULT_THEME_SANS_FONT_STACK,
            "font-serif": "Georgia, serif",
            "font-mono": "Geist Mono, monospace",
            "shadow-color": "hsl(0 0% 0%)",
            "shadow-opacity": "0.18",
            "shadow-blur": "2px",
            "shadow-spread": "0px",
            "shadow-offset-x": "0px",
            "shadow-offset-y": "1px",
            "letter-spacing": "0em",
            spacing: "0.25rem",
            "shadow-2xs": "0px 1px 2px 0px hsl(0 0% 0% / 0.09)",
            "shadow-xs": "0px 1px 2px 0px hsl(0 0% 0% / 0.09)",
            "shadow-sm":
                "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 1px 2px -1px hsl(0 0% 0% / 0.18)",
            shadow: "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 1px 2px -1px hsl(0 0% 0% / 0.18)",
            "shadow-md":
                "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 2px 4px -1px hsl(0 0% 0% / 0.18)",
            "shadow-lg":
                "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 4px 6px -1px hsl(0 0% 0% / 0.18)",
            "shadow-xl":
                "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 8px 10px -1px hsl(0 0% 0% / 0.18)",
            "shadow-2xl": "0px 1px 2px 0px hsl(0 0% 0% / 0.45)",
            "tracking-normal": "0em"
        },
        dark: {
            background: "oklch(0 0 0)",
            foreground: "oklch(1 0 0)",
            card: "oklch(0.1400 0 0)",
            "card-foreground": "oklch(1 0 0)",
            popover: "oklch(0.1800 0 0)",
            "popover-foreground": "oklch(1 0 0)",
            primary: "oklch(1 0 0)",
            "primary-foreground": "oklch(0 0 0)",
            secondary: "oklch(0.2500 0 0)",
            "secondary-foreground": "oklch(1 0 0)",
            muted: "oklch(0.2300 0 0)",
            "muted-foreground": "oklch(0.7200 0 0)",
            accent: "oklch(0.3200 0 0)",
            "accent-foreground": "oklch(1 0 0)",
            destructive: "oklch(0.6900 0.2000 23.9100)",
            "destructive-foreground": "oklch(0 0 0)",
            border: "oklch(0.2600 0 0)",
            input: "oklch(0.3200 0 0)",
            ring: "oklch(0.7200 0 0)",
            "chart-1": "oklch(0.8100 0.1700 75.3500)",
            "chart-2": "oklch(0.5800 0.2100 260.8400)",
            "chart-3": "oklch(0.5600 0 0)",
            "chart-4": "oklch(0.4400 0 0)",
            "chart-5": "oklch(0.9200 0 0)",
            radius: "0.5rem",
            sidebar: "oklch(0.1800 0 0)",
            "sidebar-foreground": "oklch(1 0 0)",
            "sidebar-primary": "oklch(1 0 0)",
            "sidebar-primary-foreground": "oklch(0 0 0)",
            "sidebar-accent": "oklch(0.3200 0 0)",
            "sidebar-accent-foreground": "oklch(1 0 0)",
            "sidebar-border": "oklch(0.3200 0 0)",
            "sidebar-ring": "oklch(0.7200 0 0)",
            "font-sans": DEFAULT_THEME_SANS_FONT_STACK,
            "font-serif": "Georgia, serif",
            "font-mono": "Geist Mono, monospace",
            "shadow-color": "hsl(0 0% 0%)",
            "shadow-opacity": "0.18",
            "shadow-blur": "2px",
            "shadow-spread": "0px",
            "shadow-offset-x": "0px",
            "shadow-offset-y": "1px",
            "letter-spacing": "0em",
            spacing: "0.25rem",
            "shadow-2xs": "0px 1px 2px 0px hsl(0 0% 0% / 0.09)",
            "shadow-xs": "0px 1px 2px 0px hsl(0 0% 0% / 0.09)",
            "shadow-sm":
                "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 1px 2px -1px hsl(0 0% 0% / 0.18)",
            shadow: "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 1px 2px -1px hsl(0 0% 0% / 0.18)",
            "shadow-md":
                "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 2px 4px -1px hsl(0 0% 0% / 0.18)",
            "shadow-lg":
                "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 4px 6px -1px hsl(0 0% 0% / 0.18)",
            "shadow-xl":
                "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 8px 10px -1px hsl(0 0% 0% / 0.18)",
            "shadow-2xl": "0px 1px 2px 0px hsl(0 0% 0% / 0.45)"
        }
    }
} as const

export const LEGACY_GREEN_THEME_PRESET = {
    cssVars: {
        theme: {
            "font-sans": "Outfit, sans-serif",
            "font-mono": "monospace",
            "font-serif": 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
            radius: "0.5rem",
            "tracking-tighter": "calc(var(--tracking-normal) - 0.05em)",
            "tracking-tight": "calc(var(--tracking-normal) - 0.025em)",
            "tracking-wide": "calc(var(--tracking-normal) + 0.025em)",
            "tracking-wider": "calc(var(--tracking-normal) + 0.05em)",
            "tracking-widest": "calc(var(--tracking-normal) + 0.1em)"
        },
        light: {
            background: "oklch(0.9711 0.0074 80.7211)",
            foreground: "oklch(0.3000 0.0358 30.2042)",
            card: "oklch(0.9711 0.0074 80.7211)",
            "card-foreground": "oklch(0.3000 0.0358 30.2042)",
            popover: "oklch(0.9711 0.0074 80.7211)",
            "popover-foreground": "oklch(0.3000 0.0358 30.2042)",
            primary: "oklch(0.5234 0.1347 144.1672)",
            "primary-foreground": "oklch(1.0000 0 0)",
            secondary: "oklch(0.9571 0.0210 147.6360)",
            "secondary-foreground": "oklch(0.4254 0.1159 144.3078)",
            muted: "oklch(0.9370 0.0142 74.4218)",
            "muted-foreground": "oklch(0.4495 0.0486 39.2110)",
            accent: "oklch(0.8952 0.0504 146.0366)",
            "accent-foreground": "oklch(0.4254 0.1159 144.3078)",
            destructive: "oklch(0.5386 0.1937 26.7249)",
            "destructive-foreground": "oklch(1.0000 0 0)",
            border: "oklch(0.8805 0.0208 74.6428)",
            input: "oklch(0.8805 0.0208 74.6428)",
            ring: "oklch(0.5234 0.1347 144.1672)",
            "chart-1": "oklch(0.6731 0.1624 144.2083)",
            "chart-2": "oklch(0.5752 0.1446 144.1813)",
            "chart-3": "oklch(0.5234 0.1347 144.1672)",
            "chart-4": "oklch(0.4254 0.1159 144.3078)",
            "chart-5": "oklch(0.2157 0.0453 145.7256)",
            radius: "0.5rem",
            sidebar: "oklch(0.9370 0.0142 74.4218)",
            "sidebar-foreground": "oklch(0.3000 0.0358 30.2042)",
            "sidebar-primary": "oklch(0.5234 0.1347 144.1672)",
            "sidebar-primary-foreground": "oklch(1.0000 0 0)",
            "sidebar-accent": "oklch(0.8952 0.0504 146.0366)",
            "sidebar-accent-foreground": "oklch(0.4254 0.1159 144.3078)",
            "sidebar-border": "oklch(0.8805 0.0208 74.6428)",
            "sidebar-ring": "oklch(0.5234 0.1347 144.1672)",
            "font-sans": "Montserrat, sans-serif",
            "font-serif": "Merriweather, serif",
            "font-mono": "Source Code Pro, monospace",
            "shadow-color": "oklch(0 0 0)",
            "shadow-opacity": "0.1",
            "shadow-blur": "3px",
            "shadow-spread": "0px",
            "shadow-offset-x": "0",
            "shadow-offset-y": "1px",
            "letter-spacing": "0em",
            spacing: "0.25rem",
            "shadow-2xs": "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
            "shadow-xs": "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
            "shadow-sm": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
            shadow: "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
            "shadow-md": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 2px 4px -1px hsl(0 0% 0% / 0.10)",
            "shadow-lg": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 4px 6px -1px hsl(0 0% 0% / 0.10)",
            "shadow-xl": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 8px 10px -1px hsl(0 0% 0% / 0.10)",
            "shadow-2xl": "0 1px 3px 0px hsl(0 0% 0% / 0.25)",
            "tracking-normal": "0em"
        },
        dark: {
            background: "oklch(0 0 0)",
            foreground: "oklch(0.9288 0.0126 255.5078)",
            card: "oklch(0.1684 0 0)",
            "card-foreground": "oklch(0.9288 0.0126 255.5078)",
            popover: "oklch(0.2603 0 0)",
            "popover-foreground": "oklch(0.7348 0 0)",
            primary: "oklch(0.4365 0.1044 156.7556)",
            "primary-foreground": "oklch(0.9213 0.0135 167.1556)",
            secondary: "oklch(0.2603 0 0)",
            "secondary-foreground": "oklch(0.9851 0 0)",
            muted: "oklch(0.2393 0 0)",
            "muted-foreground": "oklch(0.7122 0 0)",
            accent: "oklch(0.3132 0 0)",
            "accent-foreground": "oklch(0.9851 0 0)",
            destructive: "oklch(0.3123 0.0852 29.7877)",
            "destructive-foreground": "oklch(0.9368 0.0045 34.3092)",
            border: "oklch(0.2264 0 0)",
            input: "oklch(0.2603 0 0)",
            ring: "oklch(0.8003 0.1821 151.7110)",
            "chart-1": "oklch(0.8003 0.1821 151.7110)",
            "chart-2": "oklch(0.7137 0.1434 254.6240)",
            "chart-3": "oklch(0.7090 0.1592 293.5412)",
            "chart-4": "oklch(0.8369 0.1644 84.4286)",
            "chart-5": "oklch(0.7845 0.1325 181.9120)",
            radius: "0.5rem",
            sidebar: "oklch(0.1684 0 0)",
            "sidebar-foreground": "oklch(0.6301 0 0)",
            "sidebar-primary": "oklch(0.4365 0.1044 156.7556)",
            "sidebar-primary-foreground": "oklch(0.9213 0.0135 167.1556)",
            "sidebar-accent": "oklch(0.3132 0 0)",
            "sidebar-accent-foreground": "oklch(0.9851 0 0)",
            "sidebar-border": "oklch(0.2809 0 0)",
            "sidebar-ring": "oklch(0.8003 0.1821 151.7110)",
            "font-sans": "Outfit, sans-serif",
            "font-serif": 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
            "font-mono": "monospace",
            "shadow-color": "oklch(0 0 0)",
            "shadow-opacity": "0.1",
            "shadow-blur": "3px",
            "shadow-spread": "0px",
            "shadow-offset-x": "0",
            "shadow-offset-y": "1px",
            "letter-spacing": "0em",
            spacing: "0.25rem",
            "shadow-2xs": "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
            "shadow-xs": "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
            "shadow-sm": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
            shadow: "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
            "shadow-md": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 2px 4px -1px hsl(0 0% 0% / 0.10)",
            "shadow-lg": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 4px 6px -1px hsl(0 0% 0% / 0.10)",
            "shadow-xl": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 8px 10px -1px hsl(0 0% 0% / 0.10)",
            "shadow-2xl": "0 1px 3px 0px hsl(0 0% 0% / 0.25)"
        }
    }
} as const

export const DEFAULT_THEME_PRESET = VERCEL_THEME_PRESET

function clonePresetCssVars(preset: ThemePreset): ThemeState["cssVars"] {
    return {
        theme: { ...preset.cssVars.theme },
        light: { ...preset.cssVars.light },
        dark: { ...preset.cssVars.dark }
    }
}

export function isDefaultThemeCssVars(cssVars: ThemeState["cssVars"] | null | undefined) {
    return isEqual(cssVars, DEFAULT_THEME_PRESET.cssVars)
}

export function isLegacyGreenThemeCssVars(cssVars: ThemeState["cssVars"] | null | undefined) {
    return isEqual(cssVars, LEGACY_GREEN_THEME_PRESET.cssVars)
}

export function shouldMigrateToDefaultTheme(
    state: PersistedThemeState | null | undefined
): boolean {
    if (!state) return true
    if (state.selectedThemeUrl) return false
    if (!state.themeState?.cssVars) return true

    return isLegacyGreenThemeCssVars(state.themeState.cssVars)
}

export function normalizeThemeStoreStateForDefault(
    state: PersistedThemeState | null | undefined
): PersistedThemeState {
    if (!shouldMigrateToDefaultTheme(state)) {
        return state ?? {}
    }

    const currentMode = state?.themeState?.currentMode ?? "light"

    return {
        ...state,
        themeState: getDefaultThemeState(currentMode),
        selectedThemeUrl: null
    }
}

export function getDefaultThemeState(currentMode: ThemeMode = "dark"): ThemeState {
    return {
        currentMode,
        cssVars: clonePresetCssVars(DEFAULT_THEME_PRESET)
    }
}

export function getLegacyGreenThemeState(currentMode: ThemeMode = "dark"): ThemeState {
    return {
        currentMode,
        cssVars: clonePresetCssVars(LEGACY_GREEN_THEME_PRESET)
    }
}

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            themeState: getDefaultThemeState(),
            selectedThemeUrl: null,
            setThemeState: (themeState) => set({ themeState }),
            setSelectedThemeUrl: (selectedThemeUrl) => set({ selectedThemeUrl }),
            resetThemeToDefault: () =>
                set((state) => ({
                    themeState: getDefaultThemeState(state.themeState.currentMode),
                    selectedThemeUrl: null
                }))
        }),
        {
            name: THEME_STORE_KEY,
            version: 1,
            migrate: (persistedState) =>
                normalizeThemeStoreStateForDefault(persistedState as PersistedThemeState),
            partialize: (state) => ({
                themeState: state.themeState,
                selectedThemeUrl: state.selectedThemeUrl
            })
        }
    )
)
