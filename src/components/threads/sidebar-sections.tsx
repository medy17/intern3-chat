import { buttonVariants } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu
} from "@/components/ui/sidebar"
import { getLastLibraryRoute } from "@/lib/last-chat-route"
import { DEFAULT_LIBRARY_SEARCH } from "@/lib/library-search"
import { cn } from "@/lib/utils"
import { Link, useNavigate } from "@tanstack/react-router"
import { isAfter, isToday, isYesterday, subDays } from "date-fns"
import { ChevronRight, Image, Loader2, Pin } from "lucide-react"
import { type ReactNode, type RefObject, useEffect, useState } from "react"
import { FolderItem } from "./folder-item"
import { NewFolderButton } from "./new-folder-button"
import { ThreadItem } from "./thread-item"
import type { Project, SidebarProject, Thread } from "./types"

const getThreadActivityTime = (thread: Thread) => thread.updatedAt ?? thread.createdAt

export type GroupedThreads = {
    pinned: Thread[]
    today: Thread[]
    yesterday: Thread[]
    lastSevenDays: Thread[]
    lastThirtyDays: Thread[]
}

export function groupThreadsByTime(threads: Thread[]): GroupedThreads {
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
    activeThreadId,
    isSelectionMode,
    selectedThreadIds,
    onExportSelected,
    enableContextMenu,
    enableLongPressSelection,
    canBulkTogglePin,
    areAllSelectedPinned,
    onOpenRenameDialog,
    onOpenMoveDialog,
    onOpenDeleteDialog,
    onExportThread,
    onToggleSelection,
    onStartSelection,
    onBulkTogglePin,
    onOpenBulkMoveDialog,
    onOpenBulkDeleteDialog
}: {
    title: string
    threads: Thread[]
    icon?: ReactNode
    activeThreadId?: string
    isSelectionMode?: boolean
    selectedThreadIds: string[]
    onExportSelected?: () => Promise<void> | void
    enableContextMenu?: boolean
    enableLongPressSelection?: boolean
    canBulkTogglePin?: boolean
    areAllSelectedPinned?: boolean
    onOpenRenameDialog?: (thread: Thread) => void
    onOpenMoveDialog?: (thread: Thread) => void
    onOpenDeleteDialog?: (thread: Thread) => void
    onExportThread?: (thread: Thread) => Promise<void> | void
    onToggleSelection?: (thread: Thread) => void
    onStartSelection?: (thread: Thread) => void
    onBulkTogglePin?: () => Promise<void> | void
    onOpenBulkMoveDialog?: () => void
    onOpenBulkDeleteDialog?: () => void
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
                            isActive={activeThreadId === thread._id}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedThreadIds.includes(thread._id)}
                            selectedThreadCount={selectedThreadIds.length}
                            enableContextMenu={enableContextMenu}
                            enableLongPressSelection={enableLongPressSelection}
                            canBulkTogglePin={canBulkTogglePin}
                            areAllSelectedPinned={areAllSelectedPinned}
                            onOpenRenameDialog={onOpenRenameDialog}
                            onOpenMoveDialog={onOpenMoveDialog}
                            onOpenDeleteDialog={onOpenDeleteDialog}
                            onExportThread={onExportThread}
                            onExportSelected={onExportSelected}
                            onToggleSelection={onToggleSelection}
                            onStartSelection={onStartSelection}
                            onBulkTogglePin={onBulkTogglePin}
                            onOpenBulkMoveDialog={onOpenBulkMoveDialog}
                            onOpenBulkDeleteDialog={onOpenBulkDeleteDialog}
                        />
                    ))}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    )
}

function LibraryLink() {
    const navigate = useNavigate()

    return (
        <div className="px-2">
            <Link
                to="/library"
                search={DEFAULT_LIBRARY_SEARCH}
                className={cn(buttonVariants({ variant: "ghost" }), "h-8 w-full justify-start")}
                onClick={(event) => {
                    event.preventDefault()
                    navigate({ href: getLastLibraryRoute() })
                }}
            >
                <Image className="h-4 w-4" />
                Library
            </Link>
        </div>
    )
}

export type FolderGroupActions = {
    isSelectionMode?: boolean
    enableContextMenu?: boolean
    enableLongPressSelection?: boolean
    getFolderSelectionState?: (project: Project, threadCount: number) => "none" | "some" | "all"
    onToggleFolderSelection?: (project: Project) => void | Promise<void>
    onStartFolderSelection?: (project: Project) => void | Promise<void>
}

export function FoldersSection({
    projects,
    currentFolderId,
    isSelectionMode,
    enableContextMenu,
    enableLongPressSelection,
    getFolderSelectionState,
    onToggleFolderSelection,
    onStartFolderSelection
}: {
    projects: SidebarProject[]
    currentFolderId?: string
} & FolderGroupActions) {
    const [isOpen, setIsOpen] = useState(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("folders-section-open")
            if (saved !== null) {
                return saved === "true"
            }
        }
        return false // default for new users is collapsed
    })

    useEffect(() => {
        localStorage.setItem("folders-section-open", String(isOpen))
    }, [isOpen])

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="group/collapsible">
            <SidebarGroup>
                <SidebarGroupLabel className="gap-0 pr-0">
                    <CollapsibleTrigger className="mr-2 flex flex-1 cursor-pointer items-center transition-colors hover:text-sidebar-foreground">
                        <ChevronRight className="mr-1 h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                        Folders
                    </CollapsibleTrigger>
                    <NewFolderButton onSuccess={() => setIsOpen(true)} />
                </SidebarGroupLabel>
                <CollapsibleContent>
                    <SidebarGroupContent>
                        {projects.length === 0 ? (
                            <div className="p-4 text-center text-muted-foreground text-sm">
                                No folders created yet
                            </div>
                        ) : (
                            <SidebarMenu>
                                {projects.map((project) => (
                                    <FolderItem
                                        key={project._id}
                                        project={project}
                                        numThreads={project.threadCount}
                                        isCurrentFolder={currentFolderId === project._id}
                                        isSelectionMode={isSelectionMode}
                                        selectionState={getFolderSelectionState?.(
                                            project,
                                            project.threadCount
                                        )}
                                        enableContextMenu={enableContextMenu}
                                        enableLongPressSelection={enableLongPressSelection}
                                        onToggleSelection={onToggleFolderSelection}
                                        onStartSelection={onStartFolderSelection}
                                    />
                                ))}
                            </SidebarMenu>
                        )}
                    </SidebarGroupContent>
                </CollapsibleContent>
            </SidebarGroup>
        </Collapsible>
    )
}

export type ThreadGroupActions = {
    isSelectionMode?: boolean
    selectedThreadIds: string[]
    enableContextMenu?: boolean
    enableLongPressSelection?: boolean
    canBulkTogglePin?: boolean
    areAllSelectedPinned?: boolean
    onOpenRenameDialog?: (thread: Thread) => void
    onOpenMoveDialog?: (thread: Thread) => void
    onOpenDeleteDialog?: (thread: Thread) => void
    onExportThread?: (thread: Thread) => Promise<void> | void
    onExportSelected?: () => Promise<void> | void
    onToggleSelection?: (thread: Thread) => void
    onStartSelection?: (thread: Thread) => void
    onBulkTogglePin?: () => Promise<void> | void
    onOpenBulkMoveDialog?: () => void
    onOpenBulkDeleteDialog?: () => void
}

export function ThreadSections({
    groupedThreads,
    activeThreadId,
    ...threadGroupActions
}: {
    groupedThreads: GroupedThreads
    activeThreadId?: string
} & ThreadGroupActions) {
    const sections = [
        {
            title: "Pinned",
            threads: groupedThreads.pinned,
            icon: <Pin className="h-4 w-4" />
        },
        { title: "Today", threads: groupedThreads.today },
        { title: "Yesterday", threads: groupedThreads.yesterday },
        { title: "Last 7 Days", threads: groupedThreads.lastSevenDays },
        { title: "Last 30 Days", threads: groupedThreads.lastThirtyDays }
    ]

    return sections.map((section) => (
        <ThreadsGroup
            key={section.title}
            title={section.title}
            threads={section.threads}
            icon={section.icon}
            activeThreadId={activeThreadId}
            {...threadGroupActions}
        />
    ))
}

export function LoadMoreThreadsGroup({
    show,
    isLoading,
    sentinelRef
}: {
    show: boolean
    isLoading: boolean
    sentinelRef: RefObject<HTMLDivElement | null>
}) {
    if (!show) return null

    return (
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
    )
}

export { LibraryLink }
