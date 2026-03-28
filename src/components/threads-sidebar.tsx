import { CommandK } from "@/components/commandk"
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarRail,
    useSidebar
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useFunction } from "@/hooks/use-function"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { useIsMobile } from "@/hooks/use-mobile"
import { authClient } from "@/lib/auth-client"
import { useDiskCachedPaginatedQuery, useDiskCachedQuery } from "@/lib/convex-cached-query"
import {
    isEditableShortcutTarget,
    isMacLikePlatform,
    isShortcutModifierPressed,
    matchesNewChatShortcut
} from "@/lib/keyboard-shortcuts"
import { exportMultipleThreads, exportSingleThread } from "@/lib/thread-export-client"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react"
import type { MouseEvent } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ImportThreadDialog } from "./threads/import-thread-button"
import { BulkDeleteThreadsDialog, BulkMoveThreadsDialog } from "./threads/sidebar-bulk-dialogs"
import {
    type PrototypeCreditSummary,
    PrototypeCreditsLoadingGroup,
    PrototypeCreditsSection
} from "./threads/sidebar-credits"
import { ThreadsSidebarHeader } from "./threads/sidebar-header"
import { ImportJobsGroup } from "./threads/sidebar-import-jobs"
import {
    FoldersSection,
    LibraryLink,
    LoadMoreThreadsGroup,
    ThreadSections,
    groupThreadsByTime
} from "./threads/sidebar-sections"
import { SelectionToolbar } from "./threads/sidebar-selection-toolbar"
import { ThreadItemDialogs } from "./threads/thread-item-dialogs"
import type { SidebarProject, Thread } from "./threads/types"

function ThreadItemSkeleton() {
    return (
        <div className="flex h-9 w-full items-center px-2">
            <Skeleton className="h-4 w-[85%] rounded-md" />
        </div>
    )
}

function LoadingSkeleton({ shouldShowCredits }: { shouldShowCredits: boolean }) {
    return (
        <div className="flex flex-col gap-2 py-2">
            <div className="px-2">
                <Skeleton className="h-8 w-full" />
            </div>
            {shouldShowCredits && <PrototypeCreditsLoadingGroup />}
            <div className="mt-4 flex flex-col gap-2 px-2">
                <div className="mb-2 flex flex-col gap-2">
                    <Skeleton className="h-4 w-20" />
                    <div className="flex flex-col">
                        <ThreadItemSkeleton />
                        <ThreadItemSkeleton />
                    </div>
                </div>
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-24" />
                    <div className="flex flex-col">
                        <ThreadItemSkeleton />
                        <ThreadItemSkeleton />
                        <ThreadItemSkeleton />
                    </div>
                </div>
            </div>
        </div>
    )
}

function EmptyState({ message }: { message: string }) {
    return (
        <SidebarGroup>
            <SidebarGroupContent>
                <div className="p-4 text-center text-muted-foreground">{message}</div>
            </SidebarGroupContent>
        </SidebarGroup>
    )
}

type PrototypeCreditPlanSummary = {
    enabled: boolean
    plan: "free" | "pro"
    basic: {
        limit: number
    }
    pro: {
        limit: number
    }
}

export function ThreadsSidebar() {
    const [showGradient, setShowGradient] = useState(false)
    const [commandKOpen, setCommandKOpen] = useState(false)
    const [importOpen, setImportOpen] = useState(false)
    const [importDialogJobId, setImportDialogJobId] = useState<Id<"importJobs"> | null>(null)
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([])
    const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false)
    const [showBulkMoveDialog, setShowBulkMoveDialog] = useState(false)
    const [bulkMoveProjectId, setBulkMoveProjectId] = useState<string>("no-folder")
    const [isApplyingSelectionAction, setIsApplyingSelectionAction] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [showRenameDialog, setShowRenameDialog] = useState(false)
    const [showMoveDialog, setShowMoveDialog] = useState(false)
    const [currentThread, setCurrentThread] = useState<Thread | null>(null)
    const [isUpdatingCreditPlan, setIsUpdatingCreditPlan] = useState(false)
    const [creditPlanRefreshNonce, setCreditPlanRefreshNonce] = useState(0)
    const [primaryShortcutLabel, setPrimaryShortcutLabel] = useState("Ctrl")
    const [prototypeCreditPlanSummary, setPrototypeCreditPlanSummary] =
        useState<PrototypeCreditPlanSummary | null>(null)

    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const importJobStatusRef = useRef<Record<string, string>>({})
    const { data: session, isPending: isSessionPending } = authClient.useSession()
    const navigate = useNavigate()
    const params = useParams({ strict: false }) as { threadId?: string }
    const isMobile = useIsMobile()
    const { setOpenMobile } = useSidebar()
    const auth = useConvexAuth()
    const convex = useConvex()
    const togglePinMutation = useMutation(api.threads.togglePinThread)
    const deleteThreadMutation = useMutation(api.threads.deleteThread)
    const moveThreadMutation = useMutation(api.folders.moveThreadToProject)

    const importJobs = useQuery(
        api.import_jobs.listImportJobs,
        session?.user?.id && !auth.isLoading ? { limit: 6 } : "skip"
    )
    const activeThread = useQuery(
        api.threads.getThread,
        params.threadId && session?.user?.id && !auth.isLoading
            ? { threadId: params.threadId as Id<"threads"> }
            : "skip"
    )
    const usageSummary = useQuery(
        api.credits.getMyCreditUsageSummary,
        session?.user?.id && !auth.isLoading ? {} : "skip"
    )

    const {
        results: allThreads,
        status,
        loadMore
    } = useDiskCachedPaginatedQuery(
        api.threads.getUserThreadsPaginated,
        {
            key: "threads",
            maxItems: 50
        },
        session?.user?.id && !auth.isLoading
            ? {
                  includeInFolder: false
              }
            : "skip",
        {
            initialNumItems: 50
        }
    )

    const projects = useDiskCachedQuery(
        api.folders.getUserProjects,
        {
            key: "projects",
            default: [],
            forceCache: true
        },
        session?.user?.id && !auth.isLoading ? {} : "skip"
    )

    const hasError = false
    const hasProjectsError = "error" in projects
    const resolvedProjects: SidebarProject[] = hasProjectsError ? [] : projects

    const isLoading = auth.isLoading && allThreads.length === 0 && resolvedProjects.length === 0

    const sentinelRef = useInfiniteScroll({
        hasMore: status === "CanLoadMore",
        isLoading: false,
        onLoadMore: () => loadMore(25),
        rootMargin: "200px",
        threshold: 0.1
    })

    const isAuthenticated = Boolean(session?.user?.id)
    const shouldShowPrototypeCredits = isAuthenticated || isSessionPending
    const shouldShowDevCreditPlanToggle = import.meta.env.DEV && Boolean(session?.user?.id)

    const currentThreadForShortcut = useMemo(
        () =>
            (activeThread && !("error" in activeThread)
                ? (activeThread as Thread)
                : allThreads.find((thread) => thread._id === params.threadId)) ?? null,
        [activeThread, allThreads, params.threadId]
    )

    const selectedThreads = useMemo(
        () => allThreads.filter((thread) => selectedThreadIds.includes(thread._id)),
        [allThreads, selectedThreadIds]
    )

    const groupedNonProjectThreads = useMemo(() => groupThreadsByTime(allThreads), [allThreads])

    const activeImportJob = useMemo(
        () =>
            importJobs?.find(
                (job) =>
                    job.status === "queued" ||
                    job.status === "preparing" ||
                    job.status === "importing"
            ) ?? null,
        [importJobs]
    )

    const prototypeCreditSummary = useMemo<PrototypeCreditSummary | null>(() => {
        if (!prototypeCreditPlanSummary || !usageSummary) {
            return null
        }

        return {
            enabled: prototypeCreditPlanSummary.enabled,
            plan: prototypeCreditPlanSummary.plan,
            periodKey: usageSummary.periodKey,
            periodStartsAt: usageSummary.periodStartsAt,
            periodEndsAt: usageSummary.periodEndsAt,
            basic: {
                limit: prototypeCreditPlanSummary.basic.limit,
                used: usageSummary.basic.used,
                remaining: Math.max(
                    0,
                    prototypeCreditPlanSummary.basic.limit - usageSummary.basic.used
                )
            },
            pro: {
                limit: prototypeCreditPlanSummary.pro.limit,
                used: usageSummary.pro.used,
                remaining: Math.max(0, prototypeCreditPlanSummary.pro.limit - usageSummary.pro.used)
            },
            requestCounts: usageSummary.requestCounts
        }
    }, [prototypeCreditPlanSummary, usageSummary])

    useEffect(() => {
        setSelectedThreadIds((previous) =>
            previous.filter((threadId) => allThreads.some((thread) => thread._id === threadId))
        )
    }, [allThreads])

    useEffect(() => {
        setPrimaryShortcutLabel(isMacLikePlatform() ? "⌘" : "Ctrl")
    }, [])

    useEffect(() => {
        if (isSelectionMode && selectedThreadIds.length === 0) {
            setIsSelectionMode(false)
        }
    }, [isSelectionMode, selectedThreadIds.length])

    useEffect(() => {
        if (activeImportJob && !importDialogJobId) {
            setImportDialogJobId(activeImportJob._id)
        }
    }, [activeImportJob, importDialogJobId])

    useEffect(() => {
        if (!importJobs) return

        const nextStatuses: Record<string, string> = {}
        for (const job of importJobs) {
            const previousStatus = importJobStatusRef.current[job._id]
            nextStatuses[job._id] = job.status

            if (previousStatus === undefined || previousStatus === job.status) {
                continue
            }

            if (job.status === "completed") {
                toast.success(`Background import completed (${job.importedThreads} threads)`)
            } else if (job.status === "completed_with_errors") {
                toast.warning(
                    `Import finished with issues (${job.importedThreads} imported, ${job.failedThreads} failed)`
                )
            } else if (job.status === "failed") {
                toast.error("Background import failed")
            }
        }

        importJobStatusRef.current = nextStatuses
    }, [importJobs])

    useEffect(() => {
        if (!session?.user?.id || auth.isLoading) {
            setPrototypeCreditPlanSummary(null)
            return
        }

        let cancelled = false
        const refreshPlanSummary = async () => {
            try {
                const response = await fetch(
                    `/api/credit-summary?refresh=${creditPlanRefreshNonce}`
                )
                if (!response.ok) {
                    throw new Error(`Failed to load credit summary (${response.status})`)
                }
                const summary = (await response.json()) as PrototypeCreditPlanSummary
                if (!cancelled) {
                    setPrototypeCreditPlanSummary(summary)
                }
            } catch (error) {
                console.error("Failed to load prototype credit summary:", error)
            }
        }

        void refreshPlanSummary()
        const interval = window.setInterval(() => {
            void refreshPlanSummary()
        }, 15000)

        return () => {
            cancelled = true
            window.clearInterval(interval)
        }
    }, [auth.isLoading, creditPlanRefreshNonce, session?.user?.id])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditableShortcutTarget(event.target)) {
                return
            }

            if (!matchesNewChatShortcut(event)) return

            event.preventDefault()
            navigate({ to: "/" })
        }

        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [navigate])

    useEffect(() => {
        const container = scrollContainerRef.current
        if (!container) return

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container
            const hasScrollableContent = scrollHeight > clientHeight
            const isScrolledToBottom = scrollHeight - scrollTop - clientHeight < 5
            setShowGradient(hasScrollableContent && !isScrolledToBottom)
        }

        handleScroll()
        container.addEventListener("scroll", handleScroll)

        const resizeObserver = new ResizeObserver(handleScroll)
        resizeObserver.observe(container)

        const mutationObserver = new MutationObserver(handleScroll)
        mutationObserver.observe(container, {
            childList: true,
            subtree: true
        })

        return () => {
            container.removeEventListener("scroll", handleScroll)
            resizeObserver.disconnect()
            mutationObserver.disconnect()
        }
    }, [])

    const handleSetCreditPlan = async (plan: "free" | "pro") => {
        if (!session?.user?.id || isUpdatingCreditPlan) return

        try {
            setIsUpdatingCreditPlan(true)
            const response = await fetch("/api/dev/credit-plan", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    plan
                })
            })

            if (!response.ok) {
                throw new Error(`Failed to update plan (${response.status})`)
            }

            setCreditPlanRefreshNonce((previous) => previous + 1)
        } catch (error) {
            console.error("Failed to update prototype credit plan:", error)
            toast.error("Failed to update credit plan")
        } finally {
            setIsUpdatingCreditPlan(false)
        }
    }

    const handleOpenRenameDialog = useFunction((thread: Thread) => {
        setCurrentThread(thread)
        setShowRenameDialog(true)
    })

    const handleOpenMoveDialog = useFunction((thread: Thread) => {
        setCurrentThread(thread)
        setShowMoveDialog(true)
    })

    const handleOpenDeleteDialog = useFunction((thread: Thread) => {
        setCurrentThread(thread)
        setShowDeleteDialog(true)
    })

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditableShortcutTarget(event.target)) {
                return
            }

            if (!currentThreadForShortcut || !isShortcutModifierPressed(event) || !event.shiftKey) {
                return
            }

            if (event.key !== "Backspace" && event.key !== "Delete") {
                return
            }

            event.preventDefault()
            handleOpenDeleteDialog(currentThreadForShortcut)
        }

        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [currentThreadForShortcut, handleOpenDeleteDialog])

    const handleStartSelection = useFunction((thread: Thread) => {
        setIsSelectionMode(true)
        setSelectedThreadIds((previous) =>
            previous.includes(thread._id) ? previous : [...previous, thread._id]
        )
    })

    const handleToggleSelection = useFunction((thread: Thread) => {
        setSelectedThreadIds((previous) =>
            previous.includes(thread._id)
                ? previous.filter((threadId) => threadId !== thread._id)
                : [...previous, thread._id]
        )
    })

    const handleExitSelectionMode = useFunction(() => {
        setIsSelectionMode(false)
        setSelectedThreadIds([])
        setShowBulkDeleteDialog(false)
        setShowBulkMoveDialog(false)
        setBulkMoveProjectId("no-folder")
    })

    const handleOpenImportJob = useFunction((jobId: Id<"importJobs">) => {
        setImportDialogJobId(jobId)
        setImportOpen(true)
    })

    const handleSelectAllThreads = useFunction(() => {
        setSelectedThreadIds(allThreads.map((thread) => thread._id))
    })

    const handleExportThread = useFunction(async (thread: Thread) => {
        try {
            await exportSingleThread({
                convex,
                threadId: thread._id
            })
        } catch (error) {
            console.error("Failed to export thread:", error)
            toast.error(error instanceof Error ? error.message : "Failed to export conversation")
        }
    })

    const handleExportSelectedThreads = useFunction(async () => {
        if (selectedThreads.length === 0) return

        setIsApplyingSelectionAction(true)
        try {
            await exportMultipleThreads({
                convex,
                threadIds: selectedThreads.map((thread) => thread._id)
            })
        } catch (error) {
            console.error("Failed to export selected threads:", error)
            toast.error(
                error instanceof Error ? error.message : "Failed to export selected threads"
            )
        } finally {
            setIsApplyingSelectionAction(false)
        }
    })

    const handleBulkTogglePin = useFunction(async () => {
        if (selectedThreads.length === 0) return

        const shouldPin = !selectedThreads.every((thread) => thread.pinned)
        const threadsToToggle = selectedThreads.filter(
            (thread) => Boolean(thread.pinned) !== shouldPin
        )

        if (threadsToToggle.length === 0) return

        setIsApplyingSelectionAction(true)
        try {
            await Promise.all(
                threadsToToggle.map((thread) => togglePinMutation({ threadId: thread._id }))
            )
            toast.success(
                shouldPin
                    ? `Pinned ${threadsToToggle.length} thread${threadsToToggle.length === 1 ? "" : "s"}`
                    : `Unpinned ${threadsToToggle.length} thread${threadsToToggle.length === 1 ? "" : "s"}`
            )
        } catch (error) {
            console.error("Failed to update selected thread pins:", error)
            toast.error("Failed to update selected threads")
        } finally {
            setIsApplyingSelectionAction(false)
        }
    })

    const handleConfirmBulkDelete = useFunction(async () => {
        if (selectedThreads.length === 0) return

        setIsApplyingSelectionAction(true)
        try {
            if (selectedThreads.some((thread) => thread._id === params.threadId)) {
                navigate({ to: "/", replace: true })
            }

            await Promise.all(
                selectedThreads.map((thread) => deleteThreadMutation({ threadId: thread._id }))
            )
            toast.success(
                `Deleted ${selectedThreads.length} thread${selectedThreads.length === 1 ? "" : "s"}`
            )
            handleExitSelectionMode()
        } catch (error) {
            console.error("Failed to delete selected threads:", error)
            toast.error("Failed to delete selected threads")
        } finally {
            setIsApplyingSelectionAction(false)
            setShowBulkDeleteDialog(false)
        }
    })

    const handleOpenBulkMoveDialog = useFunction(() => {
        setBulkMoveProjectId("no-folder")
        setShowBulkMoveDialog(true)
    })

    const handleConfirmBulkMove = useFunction(async () => {
        if (selectedThreads.length === 0) return

        const targetProjectId =
            bulkMoveProjectId === "no-folder" ? undefined : (bulkMoveProjectId as Id<"projects">)

        setIsApplyingSelectionAction(true)
        try {
            await Promise.all(
                selectedThreads.map((thread) =>
                    moveThreadMutation({
                        threadId: thread._id,
                        projectId: targetProjectId
                    })
                )
            )

            const targetName = targetProjectId
                ? resolvedProjects.find((project) => project._id === targetProjectId)?.name ||
                  "folder"
                : "General"

            toast.success(
                `Moved ${selectedThreads.length} thread${selectedThreads.length === 1 ? "" : "s"} to ${targetName}`
            )
            handleExitSelectionMode()
        } catch (error) {
            console.error("Failed to move selected threads:", error)
            toast.error("Failed to move selected threads")
        } finally {
            setIsApplyingSelectionAction(false)
            setShowBulkMoveDialog(false)
        }
    })

    const handleCloseRenameDialog = useFunction(() => {
        setShowRenameDialog(false)
        setTimeout(() => {
            if (!showRenameDialog && !showMoveDialog && !showDeleteDialog) {
                setCurrentThread(null)
            }
        }, 150)
    })

    const handleCloseMoveDialog = useFunction(() => {
        setShowMoveDialog(false)
        setTimeout(() => {
            if (!showRenameDialog && !showMoveDialog && !showDeleteDialog) {
                setCurrentThread(null)
            }
        }, 150)
    })

    const handleCloseDeleteDialog = useFunction(() => {
        setShowDeleteDialog(false)
        setTimeout(() => {
            if (!showRenameDialog && !showMoveDialog && !showDeleteDialog) {
                setCurrentThread(null)
            }
        }, 150)
    })

    const handleNewChatClick = useFunction((event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault()
        document.dispatchEvent(new CustomEvent("new_chat"))
        setOpenMobile(false)

        let didNavigate = false
        const doNavigate = () => {
            if (didNavigate) return
            didNavigate = true
            void navigate({ to: "/" })
        }

        if (isMobile) {
            window.addEventListener("popstate", doNavigate, { once: true })
            setTimeout(doNavigate, 150)
        } else {
            doNavigate()
        }
    })

    const handleImportClick = useFunction(() => {
        setImportDialogJobId(activeImportJob?._id ?? null)
        setImportOpen(true)
    })

    const handleSearchClick = useFunction(() => {
        setOpenMobile(false)
        setCommandKOpen(true)
    })

    const renderContent = () => {
        if (isLoading) {
            return <LoadingSkeleton shouldShowCredits={false} />
        }

        if (hasError || hasProjectsError) {
            return <></>
        }

        const hasProjects = resolvedProjects.length > 0
        const hasNonProjectThreads = allThreads.length > 0

        if (!hasProjects && !hasNonProjectThreads) {
            return (
                <>
                    <LibraryLink />
                    <EmptyState message="No threads found" />
                </>
            )
        }

        return (
            <>
                <LibraryLink />
                {importJobs && importJobs.length > 0 && (
                    <ImportJobsGroup jobs={importJobs} onOpenJob={handleOpenImportJob} />
                )}
                <FoldersSection projects={resolvedProjects} />
                {allThreads.length > 0 && (
                    <ThreadSections
                        groupedThreads={groupedNonProjectThreads}
                        isSelectionMode={isSelectionMode}
                        selectedThreadIds={selectedThreadIds}
                        enableContextMenu={!isMobile}
                        enableLongPressSelection={isMobile}
                        onOpenRenameDialog={handleOpenRenameDialog}
                        onOpenMoveDialog={handleOpenMoveDialog}
                        onOpenDeleteDialog={handleOpenDeleteDialog}
                        onExportThread={handleExportThread}
                        onExportSelected={handleExportSelectedThreads}
                        onToggleSelection={handleToggleSelection}
                        onStartSelection={handleStartSelection}
                    />
                )}
                <LoadMoreThreadsGroup
                    show={status === "CanLoadMore"}
                    isLoading={isLoading}
                    sentinelRef={sentinelRef}
                />
            </>
        )
    }

    return (
        <>
            <Sidebar variant="inset">
                <ThreadsSidebarHeader
                    primaryShortcutLabel={primaryShortcutLabel}
                    onNewChat={handleNewChatClick}
                    onImportClick={handleImportClick}
                    onSearchClick={handleSearchClick}
                />
                <SidebarContent ref={scrollContainerRef} className="scrollbar-hide">
                    <PrototypeCreditsSection
                        shouldShow={shouldShowPrototypeCredits}
                        summary={prototypeCreditSummary}
                        shouldShowDevCreditPlanToggle={shouldShowDevCreditPlanToggle}
                        isUpdatingCreditPlan={isUpdatingCreditPlan}
                        onSetCreditPlan={handleSetCreditPlan}
                    />
                    {renderContent()}
                </SidebarContent>
                {showGradient && (
                    <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-20 bg-gradient-to-t from-sidebar via-sidebar/60 to-transparent" />
                )}
                {isSelectionMode && (
                    <SelectionToolbar
                        selectedThreads={selectedThreads}
                        isApplyingSelectionAction={isApplyingSelectionAction}
                        onSelectAllThreads={handleSelectAllThreads}
                        onBulkTogglePin={handleBulkTogglePin}
                        onOpenBulkMoveDialog={handleOpenBulkMoveDialog}
                        onOpenBulkDeleteDialog={() => setShowBulkDeleteDialog(true)}
                        onExitSelectionMode={handleExitSelectionMode}
                    />
                )}
                <ThreadItemDialogs
                    showDeleteDialog={showDeleteDialog}
                    showRenameDialog={showRenameDialog}
                    showMoveDialog={showMoveDialog}
                    onCloseDeleteDialog={handleCloseDeleteDialog}
                    onCloseRenameDialog={handleCloseRenameDialog}
                    onCloseMoveDialog={handleCloseMoveDialog}
                    currentThread={currentThread}
                    projects={resolvedProjects}
                />
                <SidebarRail />
            </Sidebar>
            <BulkMoveThreadsDialog
                open={showBulkMoveDialog}
                onOpenChange={setShowBulkMoveDialog}
                selectedThreadsCount={selectedThreads.length}
                bulkMoveProjectId={bulkMoveProjectId}
                onBulkMoveProjectIdChange={setBulkMoveProjectId}
                isApplyingSelectionAction={isApplyingSelectionAction}
                projects={resolvedProjects}
                onConfirm={handleConfirmBulkMove}
            />
            <BulkDeleteThreadsDialog
                open={showBulkDeleteDialog}
                onOpenChange={setShowBulkDeleteDialog}
                selectedThreadsCount={selectedThreads.length}
                isApplyingSelectionAction={isApplyingSelectionAction}
                onConfirm={handleConfirmBulkDelete}
            />
            <ImportThreadDialog
                open={importOpen}
                onOpenChange={setImportOpen}
                projects={resolvedProjects}
                jobId={importDialogJobId}
                onJobIdChange={setImportDialogJobId}
                onImported={(threadId) => {
                    setOpenMobile(false)
                    navigate({
                        to: "/thread/$threadId",
                        params: { threadId }
                    })
                }}
            />
            <CommandK open={commandKOpen} onOpenChange={setCommandKOpen} />
        </>
    )
}
