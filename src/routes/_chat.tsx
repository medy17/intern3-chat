import {
    type ErrorComponentProps,
    Outlet,
    createFileRoute,
    useLocation,
    useParams
} from "@tanstack/react-router"
import { motion } from "motion/react"
import { useEffect, useState } from "react"

import { Header } from "@/components/header"
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider"
import { ThreadsSidebar } from "@/components/threads-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { isRestorableChatPath, setLastChatRoute } from "@/lib/last-chat-route"
import {
    DEFAULT_LIBRARY_SEARCH,
    type LibrarySearchState,
    validateLibrarySearch
} from "@/lib/library-search"
import { LibraryView } from "./_chat.library"

export const Route = createFileRoute("/_chat")({
    component: ChatLayout
})

const areStringArraysEqual = (left: string[], right: string[]) =>
    left.length === right.length && left.every((value, index) => value === right[index])

const areLibrarySearchStatesEqual = (left: LibrarySearchState, right: LibrarySearchState) =>
    left.page === right.page &&
    left.pageSize === right.pageSize &&
    left.sort === right.sort &&
    areStringArraysEqual(left.modelIds, right.modelIds) &&
    areStringArraysEqual(left.resolutions, right.resolutions) &&
    areStringArraysEqual(left.aspectRatios, right.aspectRatios) &&
    areStringArraysEqual(left.orientations, right.orientations)

function ChatLayout() {
    const params = useParams({ strict: false })
    const location = useLocation()
    const threadId = params.threadId
    const isLibraryRoute = location.pathname.startsWith("/library")
    const activeLibrarySearch = isLibraryRoute
        ? validateLibrarySearch(location.search as Record<string, unknown>)
        : undefined
    const [cachedLibrarySearch, setCachedLibrarySearch] =
        useState<LibrarySearchState>(DEFAULT_LIBRARY_SEARCH)
    const [hasMountedLibrary, setHasMountedLibrary] = useState(false)

    useEffect(() => {
        if (!activeLibrarySearch) return
        setCachedLibrarySearch((previous) =>
            areLibrarySearchStatesEqual(previous, activeLibrarySearch)
                ? previous
                : activeLibrarySearch
        )
        setHasMountedLibrary(true)
    }, [activeLibrarySearch])

    useEffect(() => {
        if (!isRestorableChatPath(location.pathname)) return
        setLastChatRoute(location.href)
    }, [location.href, location.pathname])

    return (
        <OnboardingProvider>
            <SidebarProvider>
                <ThreadsSidebar />
                <SidebarInset>
                    <div
                        className="flex min-h-svh flex-1 flex-col overflow-hidden"
                        style={{
                            backgroundImage: "url(https://t3.chat/images/noise.png)",
                            backgroundRepeat: "repeat",
                            backgroundSize: "auto"
                        }}
                    >
                        <Header threadId={threadId} />
                        <div className="relative flex min-h-0 flex-1 flex-col">
                            {hasMountedLibrary || isLibraryRoute ? (
                                <motion.div
                                    initial={false}
                                    animate={{
                                        opacity: isLibraryRoute ? 1 : 0,
                                        y: isLibraryRoute ? 0 : 18,
                                        scale: isLibraryRoute ? 1 : 0.985
                                    }}
                                    transition={{
                                        duration: 0.28,
                                        ease: [0.16, 1, 0.3, 1]
                                    }}
                                    aria-hidden={!isLibraryRoute}
                                    className="absolute inset-0 min-h-0 overflow-hidden"
                                    style={{
                                        pointerEvents: isLibraryRoute ? "auto" : "none"
                                    }}
                                >
                                    <LibraryView
                                        search={activeLibrarySearch ?? cachedLibrarySearch}
                                    />
                                </motion.div>
                            ) : null}
                            {!isLibraryRoute && (
                                <motion.div
                                    initial={{ opacity: 0, y: 18, scale: 0.985 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{
                                        duration: 0.28,
                                        ease: [0.16, 1, 0.3, 1]
                                    }}
                                    className="flex min-h-0 flex-1 flex-col"
                                >
                                    <Outlet />
                                </motion.div>
                            )}
                        </div>
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </OnboardingProvider>
    )
}

export const ChatErrorBoundary = ({ error, info, reset }: ErrorComponentProps) => {
    const isNotFound = error.message.includes("ArgumentValidationError")

    return (
        <div className="relative flex h-[calc(100dvh-64px)] flex-col items-center justify-center">
            <div className="text-center">
                {isNotFound ? (
                    <>
                        <h1 className="mb-4 font-bold text-4xl text-muted-foreground">404</h1>
                        <p className="mb-6 text-lg text-muted-foreground">Thread not found</p>
                        <p className="text-muted-foreground text-sm">
                            The thread you're looking for doesn't exist or has been deleted.
                        </p>
                    </>
                ) : (
                    <>
                        <h1 className="mb-4 font-bold text-2xl text-muted-foreground">
                            Something went wrong
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            An error occurred while loading this page.
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
