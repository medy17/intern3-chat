import { Button, buttonVariants } from "@/components/ui/button"
import { SidebarHeader } from "@/components/ui/sidebar"
import { api } from "@/convex/_generated/api"
import { cn } from "@/lib/utils"
import { Link, useNavigate } from "@tanstack/react-router"
import { useConvex } from "convex/react"
import { Image as ImageIcon, MessageSquare, Search } from "lucide-react"
import { type MouseEvent, useRef } from "react"
import { LogoMark } from "../logo"
import { ImportThreadButton } from "./import-thread-button"

export function ThreadsSidebarHeader({
    primaryShortcutLabel,
    onNewChat,
    onImportClick,
    onSearchClick,
    isLibraryMode
}: {
    primaryShortcutLabel: string
    onNewChat: (event: MouseEvent<HTMLAnchorElement>) => void
    onImportClick: () => void
    onSearchClick: () => void
    isLibraryMode?: boolean
}) {
    const navigate = useNavigate()
    const convex = useConvex()
    const hasPrefetchedLibraryRef = useRef(false)

    const handleLibraryHover = () => {
        if (hasPrefetchedLibraryRef.current || isLibraryMode) return
        hasPrefetchedLibraryRef.current = true

        // Fire and forget queries into the Convex cache
        convex.query(api.images.getGeneratedImagesCount, {}).catch(() => {})
        convex
            .query(api.images.paginateGeneratedImages, {
                paginationOpts: { numItems: 50, cursor: null },
                sortBy: "newest"
            })
            .catch(() => {})
    }

    return (
        <SidebarHeader>
            <div className="flex w-full items-center justify-between px-2 pt-2">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate({ to: "/" })}
                    className={cn(
                        "h-8 w-8 transition-colors",
                        !isLibraryMode
                            ? "text-primary"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <MessageSquare className="h-4 w-4" />
                </Button>

                <Link to="/">
                    <LogoMark className="h-5 w-auto" />
                </Link>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate({ to: "/library" })}
                    onMouseEnter={handleLibraryHover}
                    className={cn(
                        "h-8 w-8 transition-colors",
                        isLibraryMode
                            ? "text-primary"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <ImageIcon className="h-4 w-4" />
                </Button>
            </div>

            <div
                className={cn(
                    "grid transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    isLibraryMode ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
                )}
            >
                <div className="pointer-events-none flex flex-col overflow-hidden [&>*]:pointer-events-auto">
                    <div className="my-2 h-px w-full shrink-0 bg-border" />

                    <div className="flex flex-col gap-2">
                        <Link
                            to="/"
                            onClick={onNewChat}
                            className={cn(
                                buttonVariants({ variant: "default" }),
                                "w-full justify-center"
                            )}
                            tabIndex={isLibraryMode ? -1 : 0}
                        >
                            New Chat
                        </Link>

                        <div
                            className={cn(
                                "transition-opacity",
                                isLibraryMode ? "pointer-events-none" : "pointer-events-auto"
                            )}
                        >
                            <ImportThreadButton onClick={onImportClick} />
                        </div>

                        <Button
                            onClick={onSearchClick}
                            variant="outline"
                            tabIndex={isLibraryMode ? -1 : 0}
                        >
                            <Search className="h-4 w-4" />
                            Search chats
                            <div className="ml-auto flex items-center gap-1 text-xs">
                                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-muted-foreground">
                                    <span className="text-sm">{primaryShortcutLabel}</span>
                                    <span className="text-xs">K</span>
                                </kbd>
                            </div>
                        </Button>
                    </div>
                </div>
            </div>
        </SidebarHeader>
    )
}
