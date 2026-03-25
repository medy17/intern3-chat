import { CommandK } from "@/components/commandk"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarRail,
    useSidebar
} from "@/components/ui/sidebar"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useFunction } from "@/hooks/use-function"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { useIsMobile } from "@/hooks/use-mobile"
import { authClient } from "@/lib/auth-client"
import { useDiskCachedPaginatedQuery, useDiskCachedQuery } from "@/lib/convex-cached-query"
import { getProjectColorClasses } from "@/lib/project-constants"
import { cn } from "@/lib/utils"
import { Link } from "@tanstack/react-router"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { isAfter, isToday, isYesterday, subDays } from "date-fns"
import {
    CheckCheck,
    CircleAlert,
    Clock3,
    FolderOpen,
    Image,
    Loader2,
    Pin,
    Search,
    Trash2,
    X
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { LogoMark } from "./logo"
import { FolderItem } from "./threads/folder-item"
import { ImportThreadButton, ImportThreadDialog } from "./threads/import-thread-button"
import { NewFolderButton } from "./threads/new-folder-button"
import { ThreadItem } from "./threads/thread-item"
import { ThreadItemDialogs } from "./threads/thread-item-dialogs"
import type { Thread } from "./threads/types"

const getThreadActivityTime = (thread: Thread) => thread.updatedAt ?? thread.createdAt

const attachmentModeLabel = (mode: "mirror" | "external" | "skip") => {
    switch (mode) {
        case "mirror":
            return "Mirror attachments"
        case "external":
            return "Keep external links"
        case "skip":
            return "Skip attachments"
    }
}

function groupThreadsByTime(threads: Thread[]) {
    const now = new Date()
    const lastWeek = subDays(now, 7)
    const lastMonth = subDays(now, 30)

    const pinned: Thread[] = []
    const today: Thread[] = []
    const yesterdayThreads: Thread[] = []
    const lastSevenDays: Thread[] = []
    const lastThirtyDays: Thread[] = []

    threads.forEach((thread) => {
        const threadDate = new Date(getThreadActivityTime(thread))
        if (thread.pinned) {
            pinned.push(thread)
            return
        }

        if (isToday(threadDate)) {
            today.push(thread)
        } else if (isYesterday(threadDate)) {
            yesterdayThreads.push(thread)
        } else if (isAfter(threadDate, lastWeek)) {
            lastSevenDays.push(thread)
        } else if (isAfter(threadDate, lastMonth)) {
            lastThirtyDays.push(thread)
        }
    })

    return {
        pinned,
        today,
        yesterday: yesterdayThreads,
        lastSevenDays,
        lastThirtyDays
    }
}

function ThreadsGroup({
    title,
    threads,
    icon,
    isSelectionMode,
    selectedThreadIds,
    enableContextMenu,
    enableLongPressSelection,
    onOpenRenameDialog,
    onOpenMoveDialog,
    onOpenDeleteDialog,
    onToggleSelection,
    onStartSelection
}: {
    title: string
    threads: Thread[]
    icon?: React.ReactNode
    isSelectionMode?: boolean
    selectedThreadIds: string[]
    enableContextMenu?: boolean
    enableLongPressSelection?: boolean
    onOpenRenameDialog?: (thread: Thread) => void
    onOpenMoveDialog?: (thread: Thread) => void
    onOpenDeleteDialog?: (thread: Thread) => void
    onToggleSelection?: (thread: Thread) => void
    onStartSelection?: (thread: Thread) => void
}) {
    if (threads.length === 0) return null

    return (
        <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2">
                {icon}
                {title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
                <SidebarMenu>
                    {threads.map((thread) => (
                        <ThreadItem
                            key={thread._id}
                            thread={thread}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedThreadIds.includes(thread._id)}
                            enableContextMenu={enableContextMenu}
                            enableLongPressSelection={enableLongPressSelection}
                            onOpenRenameDialog={onOpenRenameDialog}
                            onOpenMoveDialog={onOpenMoveDialog}
                            onOpenDeleteDialog={onOpenDeleteDialog}
                            onToggleSelection={onToggleSelection}
                            onStartSelection={onStartSelection}
                        />
                    ))}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    )
}

function LoadingSkeleton() {
    return <></>
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

type ImportJobListItem = ReturnType<typeof useQuery<typeof api.import_jobs.listImportJobs>> extends
    | infer TResult
    | undefined
    ? TResult extends Array<infer Item>
        ? Item
        : never
    : never

const importJobSidebarLabel: Record<
    ImportJobListItem["status"],
    { label: string; icon: typeof Clock3 }
> = {
    queued: { label: "Queued", icon: Clock3 },
    preparing: { label: "Preparing", icon: Loader2 },
    importing: { label: "Importing", icon: Loader2 },
    completed: { label: "Completed", icon: CheckCheck },
    completed_with_errors: { label: "Completed with issues", icon: CircleAlert },
    failed: { label: "Failed", icon: CircleAlert }
}

function ImportJobsGroup({
    jobs,
    onOpenJob
}: {
    jobs: ImportJobListItem[]
    onOpenJob: (jobId: Id<"importJobs">) => void
}) {
    if (jobs.length === 0) return null

    return (
        <SidebarGroup>
            <SidebarGroupLabel>Imports</SidebarGroupLabel>
            <SidebarGroupContent>
                <SidebarMenu>
                    {jobs.map((job) => {
                        const statusMeta = importJobSidebarLabel[job.status]
                        const StatusIcon = statusMeta.icon
                        const progressValue =
                            job.totalThreads > 0
                                ? Math.round((job.processedThreads / job.totalThreads) * 100)
                                : job.totalSourceFiles > 0
                                  ? Math.round(
                                        (job.preparedSourceFiles / job.totalSourceFiles) * 100
                                    )
                                  : job.status === "completed" ||
                                      job.status === "completed_with_errors"
                                    ? 100
                                    : 0

                        return (
                            <li key={job._id}>
                                <button
                                    type="button"
                                    onClick={() => onOpenJob(job._id)}
                                    className="flex w-full flex-col gap-2 rounded-md border bg-sidebar-accent/20 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent"
                                >
                                    <div className="flex items-center gap-2">
                                        <StatusIcon
                                            className={cn(
                                                "h-4 w-4 shrink-0",
                                                (job.status === "preparing" ||
                                                    job.status === "importing") &&
                                                    "animate-spin"
                                            )}
                                        />
                                        <span className="font-medium text-sm">
                                            {statusMeta.label}
                                        </span>
                                        <span className="ml-auto text-muted-foreground text-xs">
                                            {job.importedThreads}/{job.totalThreads || "?"}
                                        </span>
                                    </div>
                                    <Progress value={progressValue} className="h-1.5" />
                                    <div className="flex items-center justify-between text-muted-foreground text-xs">
                                        <span>{attachmentModeLabel(job.attachmentMode)}</span>
                                        <span>
                                            {job.errorCount + job.warningCount} issue
                                            {job.errorCount + job.warningCount === 1 ? "" : "s"}
                                        </span>
                                    </div>
                                </button>
                            </li>
                        )
                    })}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    )
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

    // Dialog state
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [showRenameDialog, setShowRenameDialog] = useState(false)
    const [showMoveDialog, setShowMoveDialog] = useState(false)
    const [currentThread, setCurrentThread] = useState<Thread | null>(null)

    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const importJobStatusRef = useRef<Record<string, string>>({})
    const { data: session } = authClient.useSession()
    const navigate = useNavigate()
    const params = useParams({ strict: false }) as { threadId?: string }
    const isMobile = useIsMobile()
    const { setOpen, setOpenMobile } = useSidebar()
    const auth = useConvexAuth()
    const togglePinMutation = useMutation(api.threads.togglePinThread)
    const deleteThreadMutation = useMutation(api.threads.deleteThread)
    const moveThreadMutation = useMutation(api.folders.moveThreadToProject)
    const importJobs = useQuery(
        api.import_jobs.listImportJobs,
        session?.user?.id && !auth.isLoading ? { limit: 6 } : "skip"
    )

    // Get all threads (not filtered by project anymore)
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

    // Get projects
    const projects = useDiskCachedQuery(
        api.folders.getUserProjects,
        {
            key: "projects",
            default: [],
            forceCache: true
        },
        session?.user?.id && !auth.isLoading ? {} : "skip"
    )

    const isLoading = false

    const sentinelRef = useInfiniteScroll({
        hasMore: status === "CanLoadMore",
        isLoading: false,
        onLoadMore: () => loadMore(25),
        rootMargin: "200px",
        threshold: 0.1
    })

    const isAuthenticated = Boolean(session?.user?.id)
    const hasError = false

    const selectedThreads = useMemo(() => {
        return allThreads.filter((thread) => selectedThreadIds.includes(thread._id))
    }, [allThreads, selectedThreadIds])

    const groupedNonProjectThreads = useMemo(() => {
        return groupThreadsByTime(allThreads)
    }, [allThreads])

    useEffect(() => {
        setSelectedThreadIds((previous) =>
            previous.filter((threadId) => allThreads.some((thread) => thread._id === threadId))
        )
    }, [allThreads])

    useEffect(() => {
        if (isSelectionMode && selectedThreadIds.length === 0) {
            setIsSelectionMode(false)
        }
    }, [isSelectionMode, selectedThreadIds.length])

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

    // Dialog handlers
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
                ? ("error" in projects
                      ? undefined
                      : projects.find((project) => project._id === targetProjectId)?.name) ||
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
        // Keep currentThread until animation completes
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

    // Keyboard shortcut for new chat (Cmd+Shift+O)
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.metaKey && event.shiftKey && event.key.toLowerCase() === "o") {
                event.preventDefault()
                navigate({ to: "/" })
            }
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

    const renderContent = () => {
        if (isLoading) {
            return <LoadingSkeleton />
        }

        if (hasError || "error" in projects) {
            return <></>
        }

        const hasProjects = projects.length > 0
        const hasNonProjectThreads = allThreads.length > 0

        if (!hasProjects && !hasNonProjectThreads) {
            return <EmptyState message="No threads found" />
        }

        return (
            <>
                <div className="px-2">
                    <Link
                        to="/library"
                        className={cn(
                            buttonVariants({ variant: "ghost" }),
                            "h-8 w-full justify-start"
                        )}
                    >
                        <Image className="h-4 w-4" />
                        Library
                    </Link>
                </div>
                {importJobs && importJobs.length > 0 && (
                    <ImportJobsGroup jobs={importJobs} onOpenJob={handleOpenImportJob} />
                )}
                {/* Folders Section */}
                <SidebarGroup>
                    <SidebarGroupLabel className="pr-0">
                        Folders
                        <div className="flex-grow" />
                        <NewFolderButton />
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {projects.map((project) => {
                                return (
                                    <FolderItem
                                        key={project._id}
                                        project={project}
                                        numThreads={project.threadCount}
                                    />
                                )
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                {/* Non-Project Threads */}
                {hasNonProjectThreads && (
                    <>
                        <ThreadsGroup
                            title="Pinned"
                            threads={groupedNonProjectThreads.pinned}
                            icon={<Pin className="h-4 w-4" />}
                            isSelectionMode={isSelectionMode}
                            selectedThreadIds={selectedThreadIds}
                            enableContextMenu={!isMobile}
                            enableLongPressSelection={isMobile}
                            onOpenRenameDialog={handleOpenRenameDialog}
                            onOpenMoveDialog={handleOpenMoveDialog}
                            onOpenDeleteDialog={handleOpenDeleteDialog}
                            onToggleSelection={handleToggleSelection}
                            onStartSelection={handleStartSelection}
                        />
                        <ThreadsGroup
                            title="Today"
                            threads={groupedNonProjectThreads.today}
                            isSelectionMode={isSelectionMode}
                            selectedThreadIds={selectedThreadIds}
                            enableContextMenu={!isMobile}
                            enableLongPressSelection={isMobile}
                            onOpenRenameDialog={handleOpenRenameDialog}
                            onOpenMoveDialog={handleOpenMoveDialog}
                            onOpenDeleteDialog={handleOpenDeleteDialog}
                            onToggleSelection={handleToggleSelection}
                            onStartSelection={handleStartSelection}
                        />
                        <ThreadsGroup
                            title="Yesterday"
                            threads={groupedNonProjectThreads.yesterday}
                            isSelectionMode={isSelectionMode}
                            selectedThreadIds={selectedThreadIds}
                            enableContextMenu={!isMobile}
                            enableLongPressSelection={isMobile}
                            onOpenRenameDialog={handleOpenRenameDialog}
                            onOpenMoveDialog={handleOpenMoveDialog}
                            onOpenDeleteDialog={handleOpenDeleteDialog}
                            onToggleSelection={handleToggleSelection}
                            onStartSelection={handleStartSelection}
                        />
                        <ThreadsGroup
                            title="Last 7 Days"
                            threads={groupedNonProjectThreads.lastSevenDays}
                            isSelectionMode={isSelectionMode}
                            selectedThreadIds={selectedThreadIds}
                            enableContextMenu={!isMobile}
                            enableLongPressSelection={isMobile}
                            onOpenRenameDialog={handleOpenRenameDialog}
                            onOpenMoveDialog={handleOpenMoveDialog}
                            onOpenDeleteDialog={handleOpenDeleteDialog}
                            onToggleSelection={handleToggleSelection}
                            onStartSelection={handleStartSelection}
                        />
                        <ThreadsGroup
                            title="Last 30 Days"
                            threads={groupedNonProjectThreads.lastThirtyDays}
                            isSelectionMode={isSelectionMode}
                            selectedThreadIds={selectedThreadIds}
                            enableContextMenu={!isMobile}
                            enableLongPressSelection={isMobile}
                            onOpenRenameDialog={handleOpenRenameDialog}
                            onOpenMoveDialog={handleOpenMoveDialog}
                            onOpenDeleteDialog={handleOpenDeleteDialog}
                            onToggleSelection={handleToggleSelection}
                            onStartSelection={handleStartSelection}
                        />
                    </>
                )}

                {/* Infinite Scroll Sentinel */}
                {status === "CanLoadMore" && (
                    <SidebarGroup>
                        <SidebarGroupContent>
                            <div
                                ref={sentinelRef}
                                className="flex w-full items-center justify-center gap-2 p-3 text-muted-foreground text-sm"
                            >
                                {isLoading && (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading more threads...
                                    </>
                                )}
                            </div>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}
            </>
        )
    }

    return (
        <>
            <Sidebar variant="inset">
                <SidebarHeader>
                    <div className="flex w-full items-center justify-center gap-2">
                        <Link to="/">
                            <LogoMark className="h-auto w-full max-w-52 px-4 pt-1.5" />
                        </Link>
                    </div>
                    <div className="my-2 h-px w-full bg-border" />

                    {/* <Tooltip> */}
                    {/* <TooltipTrigger> */}
                    <Link
                        to="/"
                        onClick={(event) => {
                            event.preventDefault()
                            document.dispatchEvent(new CustomEvent("new_chat"))
                            setOpenMobile(false)
                            void navigate({ to: "/" })
                        }}
                        className={cn(
                            buttonVariants({ variant: "default" }),
                            "w-full justify-center"
                        )}
                    >
                        New Chat
                    </Link>

                    <ImportThreadButton
                        onClick={() => {
                            setImportDialogJobId(activeImportJob?._id ?? null)
                            setImportOpen(true)
                        }}
                    />
                    {/* </TooltipTrigger>
                    <TooltipContent side="right">
                        <div className="flex items-center gap-1">
                            <span className="w-3.5 text-sm">
                                <ArrowBigUp className="size-4" />
                            </span>
                            <span className="text-sm">⌘</span>
                            <span className="text-sm">O</span>
                        </div>
                    </TooltipContent>
                </Tooltip> */}

                    <Button
                        onClick={() => {
                            setOpenMobile(false)
                            setCommandKOpen(true)
                        }}
                        variant="outline"
                    >
                        <Search className="h-4 w-4" />
                        Search chats
                        <div className="ml-auto flex items-center gap-1 text-xs">
                            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-muted-foreground">
                                <span className="text-sm">⌘</span>
                                <span className="text-xs">K</span>
                            </kbd>
                        </div>
                    </Button>
                </SidebarHeader>
                <SidebarContent ref={scrollContainerRef} className="scrollbar-hide">
                    {renderContent()}
                </SidebarContent>
                {showGradient && (
                    <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-20 bg-gradient-to-t from-sidebar via-sidebar/60 to-transparent" />
                )}
                {isSelectionMode && selectedThreads.length > 0 && (
                    <div className="absolute right-2 bottom-2 left-2 z-20 rounded-lg border bg-sidebar/95 p-2 shadow-lg backdrop-blur">
                        <div className="flex items-center gap-2">
                            <div className="font-medium text-sm">
                                {selectedThreads.length} selected
                            </div>
                            <div className="ml-auto flex items-center gap-1">
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={handleSelectAllThreads}
                                    disabled={isApplyingSelectionAction}
                                    title="Select all loaded threads"
                                >
                                    <CheckCheck className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={handleBulkTogglePin}
                                    disabled={isApplyingSelectionAction}
                                    title={
                                        selectedThreads.every((thread) => thread.pinned)
                                            ? "Unpin selected"
                                            : "Pin selected"
                                    }
                                >
                                    <Pin className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={handleOpenBulkMoveDialog}
                                    disabled={isApplyingSelectionAction}
                                    title="Move selected"
                                >
                                    <FolderOpen className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setShowBulkDeleteDialog(true)}
                                    disabled={isApplyingSelectionAction}
                                    title="Delete selected"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={handleExitSelectionMode}
                                    disabled={isApplyingSelectionAction}
                                    title="Exit selection"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Centralized Thread Dialogs */}
                <ThreadItemDialogs
                    showDeleteDialog={showDeleteDialog}
                    showRenameDialog={showRenameDialog}
                    showMoveDialog={showMoveDialog}
                    onCloseDeleteDialog={handleCloseDeleteDialog}
                    onCloseRenameDialog={handleCloseRenameDialog}
                    onCloseMoveDialog={handleCloseMoveDialog}
                    currentThread={currentThread}
                    projects={"error" in projects ? [] : projects}
                />

                <SidebarRail />
            </Sidebar>
            <Dialog
                open={showBulkMoveDialog}
                onOpenChange={(open) => {
                    if (!isApplyingSelectionAction && !open) {
                        setShowBulkMoveDialog(false)
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            Move {selectedThreads.length} selected thread
                            {selectedThreads.length === 1 ? "" : "s"}
                        </DialogTitle>
                    </DialogHeader>
                    <RadioGroup
                        value={bulkMoveProjectId}
                        onValueChange={setBulkMoveProjectId}
                        disabled={isApplyingSelectionAction}
                    >
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="no-folder" id="bulk-no-folder" />
                            <Label htmlFor="bulk-no-folder" className="cursor-pointer">
                                No Folder
                            </Label>
                        </div>
                        {"error" in projects
                            ? null
                            : projects.map((project) => {
                                  const colorClasses = getProjectColorClasses(
                                      project.color as never
                                  )
                                  return (
                                      <div
                                          key={project._id}
                                          className="flex items-center space-x-2"
                                      >
                                          <RadioGroupItem
                                              value={project._id}
                                              id={`bulk-${project._id}`}
                                          />
                                          <Label
                                              htmlFor={`bulk-${project._id}`}
                                              className="flex cursor-pointer items-center gap-2"
                                          >
                                              <div
                                                  className={cn(
                                                      "flex size-3 rounded-full",
                                                      colorClasses.split(" ").slice(1).join(" ")
                                                  )}
                                              />
                                              <span>{project.name}</span>
                                          </Label>
                                      </div>
                                  )
                              })}
                    </RadioGroup>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowBulkMoveDialog(false)}
                            disabled={isApplyingSelectionAction}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirmBulkMove}
                            disabled={isApplyingSelectionAction || selectedThreads.length === 0}
                        >
                            {isApplyingSelectionAction ? "Moving..." : "Move Selected"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Selected Threads</AlertDialogTitle>
                        <AlertDialogDescription>
                            Delete {selectedThreads.length} selected thread
                            {selectedThreads.length === 1 ? "" : "s"}? This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isApplyingSelectionAction}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmBulkDelete}
                            disabled={isApplyingSelectionAction}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isApplyingSelectionAction ? "Deleting..." : "Delete Selected"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <ImportThreadDialog
                open={importOpen}
                onOpenChange={setImportOpen}
                projects={"error" in projects ? [] : projects}
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
