import { Button } from "@/components/ui/button"
import {
    ResponsivePopover,
    ResponsivePopoverContent,
    ResponsivePopoverTrigger
} from "@/components/ui/responsive-popover"
import { useSession } from "@/hooks/auth-hooks"
import {
    SHORTCUTS,
    getShortcutDisplayLabel,
    getShortcutDisplayTokens,
    getShortcutHelpSections
} from "@/lib/keyboard-shortcuts"
import { cn } from "@/lib/utils"
import { useConvexAuth } from "@convex-dev/react-query"
import { Keyboard } from "lucide-react"

function ShortcutTokens({ tokens }: { tokens: readonly string[] }) {
    return (
        <div className="flex flex-wrap items-center justify-end gap-1">
            {tokens.map((token, index) => (
                <div key={`${token}-${index}`} className="flex items-center gap-1">
                    {index > 0 ? <span className="text-muted-foreground text-xs">+</span> : null}
                    <kbd
                        className={cn(
                            "inline-flex min-h-6 items-center rounded-[var(--radius-md)] border border-border/70 bg-muted/60 px-1.5 py-0.5",
                            "font-medium font-mono text-[0.6875rem] text-foreground"
                        )}
                    >
                        {token}
                    </kbd>
                </div>
            ))}
        </div>
    )
}

export function SidebarShortcutsHelper() {
    const session = useSession()
    const auth = useConvexAuth()
    const userSettings = useCurrentUserSettings(session.user?.id, auth.isLoading)
    const invertSendNewlineBehavior =
        !("error" in userSettings) && userSettings.invertSendNewlineBehavior === true
    const shortcutHelpSections = getShortcutHelpSections(invertSendNewlineBehavior)

    return (
        <ResponsivePopover modal={false}>
            <ResponsivePopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-[var(--radius-md)]"
                    title="Keyboard shortcuts"
                >
                    <Keyboard className="h-4 w-4" />
                    <span className="sr-only">
                        Keyboard shortcuts, including{" "}
                        {getShortcutDisplayLabel(SHORTCUTS.toggleSidebar)}
                    </span>
                </Button>
            </ResponsivePopoverTrigger>
            <ResponsivePopoverContent
                side="bottom"
                align="end"
                title="Shortcuts"
                description="The list below is wired to the actual shortcut definitions."
                className="w-[min(28rem,calc(100vw-2rem))] overflow-hidden p-0"
            >
                <div className="max-h-[min(30rem,calc(100dvh-8rem))] overflow-y-auto">
                    {shortcutHelpSections.map((section) => (
                        <section key={section.title} className="border-b p-4 last:border-b-0">
                            <div className="mb-3 text-muted-foreground text-xs uppercase tracking-[0.12em]">
                                {section.title}
                            </div>
                            <div className="space-y-3">
                                {section.shortcuts.map((shortcut) => (
                                    <div
                                        key={shortcut.id}
                                        className="flex items-start justify-between gap-4"
                                    >
                                        <div className="min-w-0">
                                            <div className="font-medium text-sm">
                                                {shortcut.title}
                                            </div>
                                            <div className="text-muted-foreground text-xs">
                                                {[
                                                    shortcut.context,
                                                    "description" in shortcut
                                                        ? shortcut.description
                                                        : undefined
                                                ]
                                                    .filter(Boolean)
                                                    .join(" • ")}
                                            </div>
                                        </div>
                                        <ShortcutTokens
                                            tokens={getShortcutDisplayTokens(shortcut)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </ResponsivePopoverContent>
        </ResponsivePopover>
    )
}
import { useCurrentUserSettings } from "@/hooks/use-current-user-settings"
