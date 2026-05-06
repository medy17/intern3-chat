import { getLocalThemeFontFaceCss } from "@/lib/theme-font-config"

export function ThemeFontStyles() {
    return (
        <style
            // biome-ignore lint/security/noDangerouslySetInnerHtml: font-face rules need to exist before theme bootstrap
            dangerouslySetInnerHTML={{ __html: getLocalThemeFontFaceCss() }}
        />
    )
}
