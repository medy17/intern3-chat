import { useDesktopLibraryChromeStore } from "@/components/library/desktop-library-chrome-store"
import { usePrivateViewingStore } from "@/components/library/private-viewing-store"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSession } from "@/hooks/auth-hooks"
import {
    DEFAULT_LIBRARY_SEARCH,
    type LibraryView,
    validateLibrarySearch
} from "@/lib/library-search"
import { cn } from "@/lib/utils"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { Archive, Eye, EyeOff, Image as ImageIcon } from "lucide-react"
import { ShareButton } from "./share-button"
import { ThemeSwitcher } from "./themes/theme-switcher"
import { ThreadExportButton } from "./thread-export-button"
import { SidebarTrigger, useSidebar } from "./ui/sidebar"
import { UserButton } from "./user-button"

export function Header({ threadId }: { threadId?: string }) {
    const { isMobile, openMobile } = useSidebar()
    const { data: session } = useSession()
    const location = useLocation()
    const navigate = useNavigate()
    const isDesktopLibraryChromeCollapsed = useDesktopLibraryChromeStore(
        (state) => state.isCollapsed
    )
    const privateViewingEnabled = usePrivateViewingStore((state) => state.privateViewingEnabled)
    const togglePrivateViewingEnabled = usePrivateViewingStore(
        (state) => state.togglePrivateViewingEnabled
    )

    const showTrigger = isMobile ? !openMobile : true
    const isLibraryRoute = location.pathname.startsWith("/library")
    const librarySearch = isLibraryRoute
        ? validateLibrarySearch(location.search as Record<string, unknown>)
        : null
    const showDesktopLibraryControls =
        isLibraryRoute && !!session?.user?.id && !isMobile && librarySearch !== null
    const shouldCollapseHeader = showDesktopLibraryControls && isDesktopLibraryChromeCollapsed

    const handleLibraryViewChange = (nextView: LibraryView) => {
        if (!librarySearch || nextView === librarySearch.view) return

        navigate({
            to: "/library",
            replace: true,
            search: {
                ...librarySearch,
                view: nextView,
                page: DEFAULT_LIBRARY_SEARCH.page
            }
        })
    }

    return (
        <>
            {showTrigger && (
                <div className="pointer-events-auto fixed top-4 left-4 z-50 md:top-6 md:left-6">
                    <SidebarTrigger className="h-8 w-8 text-muted-foreground transition-colors hover:text-foreground" />
                </div>
            )}
            <header
                className={cn(
                    "pointer-events-none absolute top-0 z-50 w-full transition-transform duration-300 ease-out",
                    shouldCollapseHeader ? "-translate-y-full" : "translate-y-0"
                )}
            >
                <div className="flex w-full items-center justify-end p-2">
                    <div className="pointer-events-auto flex items-center gap-2 rounded-[var(--radius-xl)] bg-background/10 p-2 backdrop-blur-sm">
                        {showDesktopLibraryControls && (
                            <>
                                <Tabs
                                    value={librarySearch.view}
                                    onValueChange={(value) =>
                                        handleLibraryViewChange(value as LibraryView)
                                    }
                                >
                                    <TabsList className="h-8">
                                        <TabsTrigger value="active" className="px-4 text-xs">
                                            <ImageIcon className="hidden h-3.5 w-3.5 lg:block" />
                                            Library
                                        </TabsTrigger>
                                        <TabsTrigger value="archived" className="px-4 text-xs">
                                            <Archive className="hidden h-3.5 w-3.5 lg:block" />
                                            Archive
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                                <Button
                                    type="button"
                                    variant={privateViewingEnabled ? "secondary" : "outline"}
                                    size="sm"
                                    className="gap-2 text-xs"
                                    onClick={togglePrivateViewingEnabled}
                                >
                                    {privateViewingEnabled ? (
                                        <EyeOff className="h-4 w-4" />
                                    ) : (
                                        <Eye className="h-4 w-4" />
                                    )}
                                    <span>Private Viewing</span>
                                </Button>
                                <div className="h-4 w-px bg-border" />
                            </>
                        )}
                        {threadId && <ThreadExportButton threadId={threadId} />}
                        {threadId && <ShareButton threadId={threadId} />}
                        <ThemeSwitcher />
                        <div className="h-4 w-px bg-border" />
                        <UserButton />
                    </div>
                </div>
            </header>
        </>
    )
}
