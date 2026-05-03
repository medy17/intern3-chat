import { Button, buttonVariants } from "@/components/ui/button"
import { SidebarHeader, SidebarTrigger } from "@/components/ui/sidebar"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { getLastChatRoute, getLastLibraryRoute } from "@/lib/last-chat-route"
import { cn } from "@/lib/utils"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { useConvex } from "convex/react"
import { Image as ImageIcon, MessageSquare, Search } from "lucide-react"
import { type MouseEvent, useRef } from "react"
import { LibraryLogo, LogoMark } from "../logo"
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
    const router = useRouter()
    const convex = useConvex()
    const hasPrefetchedLibraryRef = useRef(false)
    const hasPrefetchedChatRef = useRef(false)

    const prefetchThread = (threadId: string) => {
        convex
            .query(api.threads.getThreadMessages, { threadId: threadId as Id<"threads"> })
            .catch(() => {})
        convex.query(api.threads.getThread, { threadId: threadId as Id<"threads"> }).catch(() => {})
    }

    const handleToggleHover = () => {
        if (!isLibraryMode) {
            if (hasPrefetchedLibraryRef.current) return
            hasPrefetchedLibraryRef.current = true

            // Fire and forget queries into the Convex cache
            convex.query(api.images.getGeneratedImagesCount, {}).catch(() => {})
            convex
                .query(api.images.paginateGeneratedImages, {
                    paginationOpts: { numItems: 50, cursor: null },
                    sortBy: "newest"
                })
                .catch(() => {})
            return
        }

        if (hasPrefetchedChatRef.current || typeof window === "undefined") return
        hasPrefetchedChatRef.current = true

        try {
            const { pathname } = new URL(getLastChatRoute(), window.location.origin)
            const segments = pathname.split("/").filter(Boolean)

            if (pathname === "/") {
                void router.preloadRoute({ to: "/" })
                return
            }

            if (segments[0] === "thread" && segments[1]) {
                const threadId = segments[1]
                void router.preloadRoute({ to: "/thread/$threadId", params: { threadId } })
                prefetchThread(threadId)
                return
            }

            if (
                segments[0] === "folder" &&
                segments[1] &&
                segments[2] === "thread" &&
                segments[3]
            ) {
                const folderId = segments[1]
                const threadId = segments[3]

                void router.preloadRoute({
                    to: "/folder/$folderId/thread/$threadId",
                    params: { folderId, threadId }
                })
                convex
                    .query(api.threads.getThreadsByProject, {
                        projectId: folderId as Id<"projects">,
                        paginationOpts: { numItems: 25, cursor: null }
                    })
                    .catch(() => {})
                prefetchThread(threadId)
                return
            }

            if (segments[0] === "folder" && segments[1]) {
                const folderId = segments[1]

                void router.preloadRoute({
                    to: "/folder/$folderId",
                    params: { folderId }
                })
                convex
                    .query(api.threads.getThreadsByProject, {
                        projectId: folderId as Id<"projects">,
                        paginationOpts: { numItems: 25, cursor: null }
                    })
                    .catch(() => {})
                return
            }

            if (segments[0] === "s" && segments[1]) {
                const sharedThreadId = segments[1]

                void router.preloadRoute({
                    to: "/s/$sharedThreadId",
                    params: { sharedThreadId }
                })
                convex
                    .query(api.threads.getSharedThread, {
                        sharedThreadId: sharedThreadId as Id<"sharedThreads">
                    })
                    .catch(() => {})
            }
        } catch {
            // Ignore malformed session storage values and fall back to normal navigation.
        }
    }

    const handleLibraryToggle = () => {
        if (isLibraryMode) {
            navigate({ href: getLastChatRoute() })
            return
        }

        navigate({ href: getLastLibraryRoute() })
    }

    return (
        <SidebarHeader>
            <div className="flex w-full items-center justify-between px-2 pt-2">
                <SidebarTrigger className="h-8 w-8 text-muted-foreground transition-colors hover:text-foreground md:hidden" />
                <div className="hidden h-8 w-8 shrink-0 md:block" />

                <Link
                    to="/"
                    className="-my-1 flex h-[28px] items-start overflow-hidden py-1"
                    style={{
                        maskImage:
                            "linear-gradient(to bottom, transparent 0px, black 4px, black 24px, transparent 28px)",
                        WebkitMaskImage:
                            "linear-gradient(to bottom, transparent 0px, black 4px, black 24px, transparent 28px)"
                    }}
                >
                    <div
                        className={cn(
                            "flex flex-col items-center gap-2 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
                            isLibraryMode ? "-translate-y-[28px]" : "translate-y-0"
                        )}
                    >
                        <LogoMark className="h-5 w-auto shrink-0" />
                        <LibraryLogo className="h-5 w-auto shrink-0" />
                    </div>
                </Link>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleLibraryToggle}
                    onMouseEnter={handleToggleHover}
                    className="h-8 w-8 text-muted-foreground transition-colors hover:text-foreground"
                >
                    {isLibraryMode ? (
                        <MessageSquare className="h-4 w-4" />
                    ) : (
                        <ImageIcon className="h-4 w-4" />
                    )}
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
