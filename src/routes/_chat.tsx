import {
    type ErrorComponentProps,
    createFileRoute,
    useLocation,
    useParams
} from "@tanstack/react-router"
import { motion } from "motion/react"
import { useEffect, useState } from "react"

import { Chat } from "@/components/chat"
import { FolderChat } from "@/components/folder-chat"
import { Header } from "@/components/header"
import { LandingPage } from "@/components/landing-page"
import { LogoSymbol } from "@/components/logo"
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider"
import { SharedChat } from "@/components/shared-chat"
import { ThreadsSidebar } from "@/components/threads-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import type { Id } from "@/convex/_generated/dataModel"
import { useSession } from "@/hooks/auth-hooks"
import {
    isRestorableChatPath,
    peekLastChatRoute,
    setLastChatRoute,
    setLastLibraryRoute
} from "@/lib/last-chat-route"
import {
    DEFAULT_LIBRARY_SEARCH,
    type LibrarySearchState,
    validateLibrarySearch
} from "@/lib/library-search"
import { LibraryView } from "./_chat.library"

export const Route = createFileRoute("/_chat")({
    component: ChatLayout
})

const ROOT_SESSION_LOADING_DELAY_MS = 2000
const ROOT_SESSION_EXIT_DELAY_MS = 700

const areStringArraysEqual = (left: string[], right: string[]) =>
    left.length === right.length && left.every((value, index) => value === right[index])

const areLibrarySearchStatesEqual = (left: LibrarySearchState, right: LibrarySearchState) =>
    left.page === right.page &&
    left.pageSize === right.pageSize &&
    left.query === right.query &&
    left.sort === right.sort &&
    left.view === right.view &&
    areStringArraysEqual(left.modelIds, right.modelIds) &&
    areStringArraysEqual(left.resolutions, right.resolutions) &&
    areStringArraysEqual(left.aspectRatios, right.aspectRatios) &&
    areStringArraysEqual(left.orientations, right.orientations)

type CachedChatTarget =
    | { kind: "root" }
    | { kind: "thread"; threadId: string }
    | { kind: "folder"; folderId: string }
    | { kind: "folderThread"; folderId: string; threadId: string }
    | { kind: "shared"; sharedThreadId: string }

const parseCachedChatTarget = (hrefOrPath: string): CachedChatTarget | null => {
    const pathname = new URL(hrefOrPath, "https://intern3.chat").pathname

    if (pathname === "/") {
        return { kind: "root" }
    }

    const threadMatch = /^\/thread\/([^/]+)$/.exec(pathname)
    if (threadMatch) {
        return {
            kind: "thread",
            threadId: threadMatch[1]
        }
    }

    const folderThreadMatch = /^\/folder\/([^/]+)\/thread\/([^/]+)$/.exec(pathname)
    if (folderThreadMatch) {
        return {
            kind: "folderThread",
            folderId: folderThreadMatch[1],
            threadId: folderThreadMatch[2]
        }
    }

    const folderMatch = /^\/folder\/([^/]+)$/.exec(pathname)
    if (folderMatch) {
        return {
            kind: "folder",
            folderId: folderMatch[1]
        }
    }

    const sharedMatch = /^\/s\/([^/]+)$/.exec(pathname)
    if (sharedMatch) {
        return {
            kind: "shared",
            sharedThreadId: sharedMatch[1]
        }
    }

    return null
}

const areCachedChatTargetsEqual = (
    left: CachedChatTarget | null,
    right: CachedChatTarget | null
) => {
    if (left === right) return true
    if (!left || !right || left.kind !== right.kind) return false

    switch (left.kind) {
        case "root":
            return true
        case "thread":
            return left.threadId === (right.kind === "thread" ? right.threadId : "")
        case "folder":
            return left.folderId === (right.kind === "folder" ? right.folderId : "")
        case "folderThread":
            return (
                right.kind === "folderThread" &&
                left.folderId === right.folderId &&
                left.threadId === right.threadId
            )
        case "shared":
            return left.sharedThreadId === (right.kind === "shared" ? right.sharedThreadId : "")
    }
}

function PersistentChatView({
    target,
    isActiveRoute
}: {
    target: CachedChatTarget
    isActiveRoute: boolean
}) {
    switch (target.kind) {
        case "root":
            return <Chat threadId={undefined} isActiveRoute={isActiveRoute} />
        case "thread":
            return <Chat threadId={target.threadId} isActiveRoute={isActiveRoute} />
        case "folder":
            return (
                <FolderChat
                    folderId={target.folderId as Id<"projects">}
                    isActiveRoute={isActiveRoute}
                />
            )
        case "folderThread":
            return (
                <Chat
                    threadId={target.threadId}
                    folderId={target.folderId as Id<"projects">}
                    isActiveRoute={isActiveRoute}
                />
            )
        case "shared":
            return <SharedChat sharedThreadId={target.sharedThreadId} />
    }
}

function ChatLayout() {
    const { data: session, isPending } = useSession()
    const params = useParams({ strict: false })
    const location = useLocation()

    const isRoot = location.pathname === "/"
    const [shouldRunInitialRootAuthGate] = useState(isRoot)
    const [hasRootLoadingDelayElapsed, setHasRootLoadingDelayElapsed] = useState(!isRoot)
    const [hasCompletedInitialRootAuthGate, setHasCompletedInitialRootAuthGate] = useState(!isRoot)
    const [isRootLoaderExiting, setIsRootLoaderExiting] = useState(false)
    const shouldShowInitialRootAuthGate =
        shouldRunInitialRootAuthGate && !hasCompletedInitialRootAuthGate
    const showRootSessionPendingState =
        isRoot && (shouldShowInitialRootAuthGate || (!shouldRunInitialRootAuthGate && isPending))
    const showLandingPage = isRoot && !showRootSessionPendingState && !session?.user

    const threadId = params.threadId
    const isLibraryRoute = location.pathname.startsWith("/library")
    const activeLibrarySearch = isLibraryRoute
        ? validateLibrarySearch(location.search as Record<string, unknown>)
        : undefined
    const [cachedLibrarySearch, setCachedLibrarySearch] =
        useState<LibrarySearchState>(DEFAULT_LIBRARY_SEARCH)
    const [hasMountedLibrary, setHasMountedLibrary] = useState(false)
    const [cachedChatTarget, setCachedChatTarget] = useState<CachedChatTarget | null>(() => {
        if (typeof window === "undefined") return null

        const storedRoute = peekLastChatRoute()
        return storedRoute ? parseCachedChatTarget(storedRoute) : null
    })
    const currentChatTarget = isLibraryRoute ? null : parseCachedChatTarget(location.pathname)

    useEffect(() => {
        if (!shouldRunInitialRootAuthGate) return

        const timeoutId = window.setTimeout(() => {
            setHasRootLoadingDelayElapsed(true)
        }, ROOT_SESSION_LOADING_DELAY_MS)

        return () => window.clearTimeout(timeoutId)
    }, [shouldRunInitialRootAuthGate])

    useEffect(() => {
        if (!shouldRunInitialRootAuthGate) return
        if (isPending || !hasRootLoadingDelayElapsed) return
        if (hasCompletedInitialRootAuthGate) return

        setIsRootLoaderExiting(true)

        const timeoutId = window.setTimeout(() => {
            setHasCompletedInitialRootAuthGate(true)
        }, ROOT_SESSION_EXIT_DELAY_MS)

        return () => window.clearTimeout(timeoutId)
    }, [
        hasCompletedInitialRootAuthGate,
        hasRootLoadingDelayElapsed,
        isPending,
        shouldRunInitialRootAuthGate
    ])

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
        if (isLibraryRoute) return

        const nextTarget = parseCachedChatTarget(location.pathname)
        if (!nextTarget) return

        setCachedChatTarget((previous) =>
            areCachedChatTargetsEqual(previous, nextTarget) ? previous : nextTarget
        )
    }, [isLibraryRoute, location.pathname])

    useEffect(() => {
        if (isLibraryRoute) {
            setLastLibraryRoute(location.href)
            return
        }

        if (!isRestorableChatPath(location.pathname)) return
        setLastChatRoute(location.href)
    }, [isLibraryRoute, location.href, location.pathname])

    if (showRootSessionPendingState) {
        return (
            <RootSessionPendingState
                isExiting={isRootLoaderExiting && shouldShowInitialRootAuthGate}
            />
        )
    }

    if (showLandingPage) {
        return <LandingPage />
    }

    const chatTargetToRender = currentChatTarget ?? cachedChatTarget

    return (
        <OnboardingProvider>
            <SidebarProvider>
                <ThreadsSidebar />
                <SidebarInset>
                    <div
                        className="flex min-h-svh flex-1 flex-col overflow-hidden"
                        style={{
                            backgroundImage: "url(noise.png)",
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
                            {chatTargetToRender ? (
                                <motion.div
                                    initial={false}
                                    animate={{
                                        opacity: isLibraryRoute ? 0 : 1,
                                        y: isLibraryRoute ? 18 : 0,
                                        scale: isLibraryRoute ? 0.985 : 1
                                    }}
                                    transition={{
                                        duration: 0.28,
                                        ease: [0.16, 1, 0.3, 1]
                                    }}
                                    aria-hidden={isLibraryRoute}
                                    className="absolute inset-0 flex min-h-0 flex-1 flex-col overflow-hidden"
                                    style={{
                                        pointerEvents: isLibraryRoute ? "none" : "auto"
                                    }}
                                >
                                    <PersistentChatView
                                        target={chatTargetToRender}
                                        isActiveRoute={!isLibraryRoute}
                                    />
                                </motion.div>
                            ) : null}
                        </div>
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </OnboardingProvider>
    )
}

function RootSessionPendingState({ isExiting }: { isExiting: boolean }) {
    return (
        <motion.div
            animate={{
                opacity: isExiting ? 0 : 1
            }}
            aria-busy="true"
            aria-label="Loading session"
            className="flex min-h-svh items-center justify-center overflow-hidden bg-background"
            initial={false}
            transition={{
                duration: ROOT_SESSION_EXIT_DELAY_MS / 1000,
                ease: [0.16, 1, 0.3, 1]
            }}
        >
            <motion.div
                animate={{
                    scale: isExiting ? 4.5 : 1
                }}
                className="relative size-24"
                initial={false}
                transition={{
                    duration: ROOT_SESSION_EXIT_DELAY_MS / 1000,
                    ease: [0.16, 1, 0.3, 1]
                }}
            >
                <LogoSymbol className="absolute inset-0 size-full text-muted-foreground/20" />
                <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0 animate-[root-logo-fill_2s_ease-in-out_forwards] overflow-hidden"
                >
                    <LogoSymbol className="absolute bottom-0 left-0 size-24 text-primary" />
                </div>
                <span className="sr-only">Loading session</span>
            </motion.div>
        </motion.div>
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
