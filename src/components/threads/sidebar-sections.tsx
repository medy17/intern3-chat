import { buttonVariants } from "@/components/ui/button"
import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { Link } from "@tanstack/react-router"
import { isAfter, isToday, isYesterday, subDays } from "date-fns"
import { Image, Loader2, Pin } from "lucide-react"
import type { ReactNode, RefObject } from "react"
import { FolderItem } from "./folder-item"
import { NewFolderButton } from "./new-folder-button"
import { ThreadItem } from "./thread-item"
import type { SidebarProject, Thread } from "./types"

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
    isSelectionMode,
    selectedThreadIds,
    onExportSelected,
    enableContextMenu,
    enableLongPressSelection,
    onOpenRenameDialog,
    onOpenMoveDialog,
    onOpenDeleteDialog,
    onExportThread,
    onToggleSelection,
    onStartSelection
}: {
    title: string
    threads: Thread[]
    icon?: ReactNode
    isSelectionMode?: boolean
    selectedThreadIds: string[]
    onExportSelected?: () => Promise<void> | void
    enableContextMenu?: boolean
    enableLongPressSelection?: boolean
    onOpenRenameDialog?: (thread: Thread) => void
    onOpenMoveDialog?: (thread: Thread) => void
    onOpenDeleteDialog?: (thread: Thread) => void
    onExportThread?: (thread: Thread) => Promise<void> | void
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
                            selectedThreadCount={selectedThreadIds.length}
                            enableContextMenu={enableContextMenu}
                            enableLongPressSelection={enableLongPressSelection}
                            onOpenRenameDialog={onOpenRenameDialog}
                            onOpenMoveDialog={onOpenMoveDialog}
                            onOpenDeleteDialog={onOpenDeleteDialog}
                            onExportThread={onExportThread}
                            onExportSelected={onExportSelected}
                            onToggleSelection={onToggleSelection}
                            onStartSelection={onStartSelection}
                        />
                    ))}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    )
}

function LibraryLink() {
    return (
        <div className="px-2">
            <Link
                to="/library"
                className={cn(buttonVariants({ variant: "ghost" }), "h-8 w-full justify-start")}
            >
                <Image className="h-4 w-4" />
                Library
            </Link>
        </div>
    )
}

export function FoldersSection({ projects }: { projects: SidebarProject[] }) {
    return (
        <SidebarGroup>
            <SidebarGroupLabel className="pr-0">
                Folders
                <div className="flex-grow" />
                <NewFolderButton />
            </SidebarGroupLabel>
            <SidebarGroupContent>
                <SidebarMenu>
                    {projects.map((project) => (
                        <FolderItem
                            key={project._id}
                            project={project}
                            numThreads={project.threadCount}
                        />
                    ))}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    )
}

export type ThreadGroupActions = {
    isSelectionMode?: boolean
    selectedThreadIds: string[]
    enableContextMenu?: boolean
    enableLongPressSelection?: boolean
    onOpenRenameDialog?: (thread: Thread) => void
    onOpenMoveDialog?: (thread: Thread) => void
    onOpenDeleteDialog?: (thread: Thread) => void
    onExportThread?: (thread: Thread) => Promise<void> | void
    onExportSelected?: () => Promise<void> | void
    onToggleSelection?: (thread: Thread) => void
    onStartSelection?: (thread: Thread) => void
}

export function ThreadSections({
    groupedThreads,
    ...threadGroupActions
}: {
    groupedThreads: GroupedThreads
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
