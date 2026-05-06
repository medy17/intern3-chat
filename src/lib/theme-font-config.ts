export const T3_CHAT_THEME_URL = "https://tweakcn.com/editor/theme?theme=t3-chat"

type ThemeCssVars = {
    theme: Record<string, string>
    light: Record<string, string>
    dark: Record<string, string>
}

export type ThemePresetLike = {
    cssVars: ThemeCssVars
}

type LocalThemeFontSource = {
    path: string
    format: string
    mimeType: string
}

type LocalThemeFontDefinition = {
    family: string
    stack: string
    sources: LocalThemeFontSource[]
    display: string
    weight: string
    style: string
}

type ThemeFontOverrideTokens = Partial<Record<"font-sans" | "font-serif" | "font-mono", string>>

export const LOCAL_THEME_FONTS = {
    proximaVara: {
        family: "ProximaVara",
        stack: '"ProximaVara", sans-serif',
        sources: [
            {
                path: "/fonts/proxima-vara.woff2",
                format: "woff2",
                mimeType: "font/woff2"
            }
        ],
        display: "swap",
        weight: "200 800",
        style: "normal"
    }
} as const satisfies Record<string, LocalThemeFontDefinition>

export const DEFAULT_THEME_SANS_FONT_STACK = LOCAL_THEME_FONTS.proximaVara.stack

export const BUILT_IN_THEME_FONT_OVERRIDES = {
    [T3_CHAT_THEME_URL]: {
        "font-sans": LOCAL_THEME_FONTS.proximaVara.stack
    }
} as const satisfies Record<string, ThemeFontOverrideTokens>

export const LOCAL_THEME_FONT_FAMILY_NAMES = Object.values(LOCAL_THEME_FONTS).map(
    (font) => font.family
)

export const LOCAL_THEME_FONT_PRELOADS = Object.values(LOCAL_THEME_FONTS).flatMap((font) =>
    font.sources.map((source) => ({
        href: source.path,
        type: source.mimeType
    }))
)

function applyOverrideTokens(
    section: Record<string, string>,
    tokens?: ThemeFontOverrideTokens
): Record<string, string> {
    if (!tokens) {
        return section
    }

    return {
        ...section,
        ...tokens
    }
}

export function applyThemeFontOverrides<T extends ThemePresetLike>(url: string, preset: T): T {
    const overrideTokens = BUILT_IN_THEME_FONT_OVERRIDES[url]
    if (!overrideTokens) {
        return preset
    }

    return {
        ...preset,
        cssVars: {
            theme: applyOverrideTokens(preset.cssVars.theme, overrideTokens),
            light: applyOverrideTokens(preset.cssVars.light, overrideTokens),
            dark: applyOverrideTokens(preset.cssVars.dark, overrideTokens)
        }
    }
}

export function getLocalThemeFontFaceCss() {
    return Object.values(LOCAL_THEME_FONTS)
        .map((font) => {
            const src = font.sources
                .map((source) => `url("${source.path}") format("${source.format}")`)
                .join(", ")

            return [
                "@font-face {",
                `    font-family: "${font.family}";`,
                `    src: ${src};`,
                `    font-style: ${font.style};`,
                `    font-weight: ${font.weight};`,
                `    font-display: ${font.display};`,
                "}"
            ].join("\n")
        })
        .join("\n\n")
}
