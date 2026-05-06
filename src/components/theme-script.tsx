import { LOCAL_THEME_FONT_FAMILY_NAMES } from "@/lib/theme-font-config"
import { DEFAULT_THEME_PRESET, LEGACY_GREEN_THEME_PRESET } from "@/lib/theme-store"

export function ThemeScript() {
    const scriptContent = `
    (function() {
      const storageKey = "theme-store";
      const root = document.documentElement;
      const defaultThemePreset = ${JSON.stringify(DEFAULT_THEME_PRESET)};
      const legacyGreenThemePreset = ${JSON.stringify(LEGACY_GREEN_THEME_PRESET)};
      const DEFAULT_FONT_WEIGHTS = ["400"];
      const SYSTEM_FONTS = new Set([
        "ui-sans-serif",
        "ui-serif",
        "ui-monospace",
        "system-ui",
        "sans-serif",
        "serif",
        "monospace",
        "cursive",
        "fantasy"
      ]);
      const LOCAL_FONTS = new Set(${JSON.stringify(
          LOCAL_THEME_FONT_FAMILY_NAMES.map((family) => family.toLowerCase())
      )});

      function extractFontFamily(fontFamilyValue) {
        if (!fontFamilyValue) return null;

        const firstFont = fontFamilyValue.split(",")[0]?.trim();
        if (!firstFont) return null;

        const cleanFont = firstFont.replace(/['"]/g, "");
        const normalizedFont = cleanFont.toLowerCase();
        if (SYSTEM_FONTS.has(normalizedFont) || LOCAL_FONTS.has(normalizedFont)) {
          return null;
        }

        return cleanFont;
      }

      function buildFontCssUrl(family, weights) {
        weights = weights || DEFAULT_FONT_WEIGHTS;
        const normalizedFamily = family.trim().replace(/\\s+/g, "+");
        const weightsParam = weights.join(";");
        return \`https://fonts.googleapis.com/css2?family=\${normalizedFamily}:wght@\${weightsParam}&display=swap\`;
      }

      function ensureFontStylesheet(family, weights) {
        const href = buildFontCssUrl(family, weights);
        const existing = document.querySelector(\`link[data-theme-font="\${family}"], link[href="\${href}"]\`);
        if (existing) return;

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.setAttribute("data-theme-font", family);
        document.head.appendChild(link);
      }

      function isObject(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
      }

      function deepEqual(left, right) {
        if (left === right) return true;
        if (!isObject(left) || !isObject(right)) return false;

        const leftKeys = Object.keys(left);
        const rightKeys = Object.keys(right);
        if (leftKeys.length !== rightKeys.length) return false;

        for (const key of leftKeys) {
          if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
          if (!deepEqual(left[key], right[key])) return false;
        }

        return true;
      }

      function getDefaultThemeState(mode) {
        return {
          currentMode: mode,
          cssVars: {
            theme: { ...defaultThemePreset.cssVars.theme },
            light: { ...defaultThemePreset.cssVars.light },
            dark: { ...defaultThemePreset.cssVars.dark }
          }
        };
      }

      let themeState = null;
      let persistedStore = null;
      let persistedState = null;
      try {
        const persistedStateJSON = localStorage.getItem(storageKey);
        if (persistedStateJSON) {
          persistedStore = JSON.parse(persistedStateJSON);
          persistedState = persistedStore?.state || null;
          themeState = persistedState?.themeState || null;
        }
      } catch (e) {
        console.warn("Theme initialization: Failed to read/parse localStorage:", e);
      }

      const preferredMode = "dark";
      const hasSelectedTheme = Boolean(persistedState?.selectedThemeUrl);
      const shouldUseDefaultTheme =
        !themeState?.cssVars ||
        (!hasSelectedTheme && deepEqual(themeState.cssVars, legacyGreenThemePreset.cssVars));

      if (shouldUseDefaultTheme) {
        themeState = getDefaultThemeState(themeState?.currentMode || preferredMode);

        if (persistedStore) {
          try {
            localStorage.setItem(
              storageKey,
              JSON.stringify({
                ...persistedStore,
                state: {
                  ...(persistedState || {}),
                  themeState,
                  selectedThemeUrl: null
                },
                version: 1
              })
            );
          } catch (e) {
            console.warn("Theme initialization: Failed to migrate localStorage:", e);
          }
        }
      }

      const mode = themeState?.currentMode ?? preferredMode;
      const baseStyles = themeState?.cssVars?.theme;

      const activeStyles =
        mode === "dark"
          ? themeState?.cssVars?.dark
          : themeState?.cssVars?.light;

      if (!baseStyles && !activeStyles) {
        return;
      }

      const stylesToApply = {
        ...(baseStyles || {}),
        ...(activeStyles || {})
      };

      for (const styleName of Object.keys(stylesToApply)) {
        const value = stylesToApply[styleName];
        if (value !== undefined) {
          root.style.setProperty(\`--\${styleName}\`, value);
        }
      }

      root.setAttribute("data-theme", mode);
      root.classList.toggle("dark", mode === "dark");
      root.classList.toggle("light", mode === "light");

      const fontValues = [
        stylesToApply["font-sans"],
        stylesToApply["font-serif"],
        stylesToApply["font-mono"]
      ];

      for (const fontValue of fontValues) {
        const family = extractFontFamily(fontValue);
        if (!family) continue;
        ensureFontStylesheet(family);
      }
    })();
  `

    return (
        <script
            // biome-ignore lint/security/noDangerouslySetInnerHtml: this script needs to execute immediately
            dangerouslySetInnerHTML={{ __html: scriptContent }}
            suppressHydrationWarning
        />
    )
}
