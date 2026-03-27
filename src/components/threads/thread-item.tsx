import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger
} from "@/components/ui/context-menu"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { api } from "@/convex/_generated/api"
import { cn } from "@/lib/utils"
import { Link, useParams } from "@tanstack/react-router"
import { useAction, useMutation } from "convex/react"
import {
    Check,
    CheckSquare2,
    Download,
    Edit3,
    FolderOpen,
    Loader2,
    Pin,
    Sparkles,
    Trash2
} from "lucide-react"
import { memo, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { Thread } from "./types"

interface ThreadItemProps {
    thread: Thread
    isInFolder?: boolean
    isSelectionMode?: boolean
    isSelected?: boolean
    selectedThreadCount?: number
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

export const ThreadItem = memo(
    ({
        thread,
        isInFolder = false,
        isSelectionMode = false,
        isSelected = false,
        selectedThreadCount = 0,
        enableContextMenu = true,
        enableLongPressSelection = false,
        onOpenRenameDialog,
        onOpenMoveDialog,
        onOpenDeleteDialog,
        onExportThread,
        onExportSelected,
        onToggleSelection,
        onStartSelection
    }: ThreadItemProps) => {
        const [isContextMenuOpen, setIsContextMenuOpen] = useState(false)
        const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false)
        const [isExporting, setIsExporting] = useState(false)
        const longPressTimeoutRef = useRef<number | null>(null)
        const longPressStartPointRef = useRef<{ x: number; y: number } | null>(null)
        const longPressTriggeredRef = useRef(false)

        const togglePinMutation = useMutation(api.threads.togglePinThread)
        const regenerateThreadTitle = useAction(api.threads.regenerateThreadTitle)
        const params = useParams({ strict: false }) as { threadId?: string }
        const isActive = params.threadId === thread._id

        const clearLongPressTimer = () => {
            if (longPressTimeoutRef.current !== null) {
                window.clearTimeout(longPressTimeoutRef.current)
                longPressTimeoutRef.current = null
            }
        }

        useEffect(() => {
            return () => {
                if (longPressTimeoutRef.current !== null) {
                    window.clearTimeout(longPressTimeoutRef.current)
                }
            }
        }, [])

        const handleTogglePin = async () => {
            const pinned = thread.pinned
            try {
                await togglePinMutation({ threadId: thread._id })
            } catch (error) {
                console.error("Failed to toggle pin:", error)
                toast.error(`Failed to ${pinned ? "unpin" : "pin"} thread`)
            }
        }

        const handleRename = () => onOpenRenameDialog?.(thread)
        const handleMove = () => onOpenMoveDialog?.(thread)
        const handleDelete = () => onOpenDeleteDialog?.(thread)
        const handleStartSelection = () => onStartSelection?.(thread)
        const handleToggleSelection = () => onToggleSelection?.(thread)
        const shouldExportSelection = isSelectionMode && selectedThreadCount > 1
        const handleExport = async () => {
            if (isExporting) return

            setIsExporting(true)
            try {
                if (shouldExportSelection) {
                    await onExportSelected?.()
                    return
                }

                await onExportThread?.(thread)
            } finally {
                setIsExporting(false)
            }
        }

        const handleRegenerateTitle = async () => {
            setIsRegeneratingTitle(true)
            try {
                const result = await regenerateThreadTitle({
                    threadId: thread._id
                })

                if ("error" in result) {
                    toast.error(
                        typeof result.error === "string"
                            ? result.error
                            : "Failed to regenerate title"
                    )
                    return
                }

                toast.success("Thread title regenerated")
            } catch (error) {
                console.error("Failed to regenerate thread title:", error)
                toast.error("Failed to regenerate title")
            } finally {
                setIsRegeneratingTitle(false)
            }
        }

        const handlePointerDown = (event: React.PointerEvent<HTMLAnchorElement>) => {
            if (!enableLongPressSelection || isSelectionMode || event.pointerType !== "touch") {
                return
            }
            longPressTriggeredRef.current = false
            longPressStartPointRef.current = {
                x: event.clientX,
                y: event.clientY
            }
            clearLongPressTimer()
            longPressTimeoutRef.current = window.setTimeout(() => {
                longPressTriggeredRef.current = true
                handleStartSelection()
            }, 450)
        }

        const handlePointerUp = () => {
            clearLongPressTimer()
            longPressStartPointRef.current = null
            if (longPressTriggeredRef.current) {
                window.setTimeout(() => {
                    longPressTriggeredRef.current = false
                }, 0)
            }
        }

        const handlePointerMove = (event: React.PointerEvent<HTMLAnchorElement>) => {
            if (
                event.pointerType !== "touch" ||
                longPressTimeoutRef.current === null ||
                !longPressStartPointRef.current
            ) {
                return
            }

            const deltaX = event.clientX - longPressStartPointRef.current.x
            const deltaY = event.clientY - longPressStartPointRef.current.y
            const movedDistance = Math.hypot(deltaX, deltaY)

            if (movedDistance > 10) {
                clearLongPressTimer()
                longPressStartPointRef.current = null
            }
        }

        const handleLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
            if (isSelectionMode) {
                event.preventDefault()
                event.stopPropagation()
                handleToggleSelection()
                return
            }
            if (longPressTriggeredRef.current) {
                event.preventDefault()
                event.stopPropagation()
            }
        }

        const handleContextMenu = (event: React.MouseEvent<HTMLAnchorElement>) => {
            if (!enableLongPressSelection) {
                return
            }

            event.preventDefault()
            event.stopPropagation()
        }

        const contextMenuItems = (
            <>
                {onStartSelection && !isSelectionMode && (
                    <>
                        <ContextMenuItem onClick={handleStartSelection}>
                            <CheckSquare2 className="h-4 w-4" />
                            Select threads
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                    </>
                )}
                <ContextMenuItem onClick={handleRename}>
                    <Edit3 className="h-4 w-4" />
                    Rename
                </ContextMenuItem>
                <ContextMenuItem onClick={() => void handleExport()} disabled={isExporting}>
                    {isExporting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Download className="h-4 w-4" />
                    )}
                    {shouldExportSelection ? "Export Selected as ZIP" : "Export as Markdown"}
                </ContextMenuItem>
                <ContextMenuItem
                    onClick={() => {
                        void handleRegenerateTitle()
                    }}
                    disabled={isRegeneratingTitle}
                >
                    {isRegeneratingTitle ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Sparkles className="h-4 w-4" />
                    )}
                    Regenerate Title
                </ContextMenuItem>
                <ContextMenuItem onClick={handleTogglePin}>
                    <Pin className="h-4 w-4" />
                    {thread.pinned ? "Unpin" : "Pin"}
                </ContextMenuItem>
                <ContextMenuItem onClick={handleMove}>
                    <FolderOpen className="h-4 w-4" />
                    Move to folder
                </ContextMenuItem>
                <ContextMenuItem onClick={handleDelete} variant="destructive">
                    <Trash2 className="h-4 w-4" />
                    Delete
                </ContextMenuItem>
            </>
        )

        const threadContent = (
            <SidebarMenuItem className={isInFolder ? "pl-6" : ""}>
                <div
                    className={cn(
                        "group/item relative flex h-9 w-full items-center overflow-hidden rounded-lg outline-hidden",
                        "transition-colors duration-200 ease-in-out",
                        "hover:bg-sidebar-accent",
                        isContextMenuOpen && "bg-sidebar-accent",
                        (isActive || isSelected) && "bg-sidebar-accent"
                    )}
                >
                    <SidebarMenuButton
                        className={cn(
                            "h-full min-w-0 flex-1 px-2 hover:bg-transparent",
                            isActive && "text-sidebar-accent-foreground"
                        )}
                    >
                        {isSelectionMode ? (
                            <button
                                type="button"
                                className="flex h-full w-full min-w-0 items-center gap-2"
                                onClick={handleToggleSelection}
                            >
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <span
                                        aria-hidden="true"
                                        className={cn(
                                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
                                            isSelected
                                                ? "border-primary bg-primary text-primary-foreground"
                                                : "border-muted-foreground/40 bg-transparent"
                                        )}
                                    >
                                        {isSelected && <Check className="h-3 w-3" />}
                                    </span>
                                    <span
                                        className={cn(
                                            "block min-w-0 flex-1 truncate text-sm",
                                            "transition-all duration-500 ease-in-out",
                                            isRegeneratingTitle
                                                ? "opacity-40 blur-[2px]"
                                                : "opacity-100 blur-0"
                                        )}
                                    >
                                        {thread.title}
                                    </span>
                                </div>
                            </button>
                        ) : (
                            <Link
                                to="/thread/$threadId"
                                params={{ threadId: thread._id }}
                                className="flex h-full w-full min-w-0 items-center"
                                onClick={handleLinkClick}
                                onContextMenu={handleContextMenu}
                                onPointerDown={handlePointerDown}
                                onPointerUp={handlePointerUp}
                                onPointerLeave={handlePointerUp}
                                onPointerCancel={handlePointerUp}
                                onPointerMove={handlePointerMove}
                                style={
                                    enableLongPressSelection
                                        ? {
                                              WebkitTouchCallout: "none",
                                              WebkitUserSelect: "none",
                                              userSelect: "none",
                                              touchAction: "manipulation"
                                          }
                                        : undefined
                                }
                            >
                                <div className="flex min-w-0 flex-1 items-center">
                                    <span
                                        className={cn(
                                            "block min-w-0 flex-1 truncate text-sm",
                                            "transition-all duration-500 ease-in-out",
                                            isRegeneratingTitle
                                                ? "opacity-40 blur-[2px]"
                                                : "opacity-100 blur-0"
                                        )}
                                    >
                                        {thread.title}
                                    </span>
                                </div>
                            </Link>
                        )}
                    </SidebarMenuButton>

                    {!isSelectionMode && (
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end">
                            <div
                                className={cn(
                                    "absolute inset-y-0 right-0 w-28 rounded-r-lg opacity-0",
                                    "bg-gradient-to-r from-transparent via-40% via-sidebar-accent to-sidebar-accent",
                                    "transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                                    "group-hover/item:opacity-100",
                                    isContextMenuOpen && "opacity-100"
                                )}
                            />

                            <div
                                className={cn(
                                    "pointer-events-none relative z-10 flex items-center gap-1 pr-1.5",
                                    "translate-x-12 opacity-0",
                                    "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                                    "group-hover/item:pointer-events-auto group-hover/item:translate-x-0 group-hover/item:opacity-100",
                                    isContextMenuOpen &&
                                        "pointer-events-auto translate-x-0 opacity-100"
                                )}
                            >
                                <button
                                    type="button"
                                    title={thread.pinned ? "Unpin thread" : "Pin thread"}
                                    onClick={(event) => {
                                        event.preventDefault()
                                        event.stopPropagation()
                                        void handleTogglePin()
                                    }}
                                    className="pointer-events-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
                                >
                                    <Pin
                                        className={cn(
                                            "h-3.5 w-3.5",
                                            thread.pinned && "fill-current text-foreground"
                                        )}
                                    />
                                </button>
                                <button
                                    type="button"
                                    title="Delete thread"
                                    onClick={(event) => {
                                        event.preventDefault()
                                        event.stopPropagation()
                                        handleDelete()
                                    }}
                                    className="pointer-events-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </SidebarMenuItem>
        )

        if (!enableContextMenu) return threadContent

        return (
            <ContextMenu onOpenChange={setIsContextMenuOpen}>
                <ContextMenuTrigger asChild>{threadContent}</ContextMenuTrigger>
                <ContextMenuContent>{contextMenuItems}</ContextMenuContent>
            </ContextMenu>
        )
    },
    (prevProps, nextProps) => {
        return (
            prevProps.thread._id === nextProps.thread._id &&
            prevProps.thread.title === nextProps.thread.title &&
            prevProps.thread.pinned === nextProps.thread.pinned &&
            prevProps.isInFolder === nextProps.isInFolder &&
            prevProps.isSelectionMode === nextProps.isSelectionMode &&
            prevProps.isSelected === nextProps.isSelected &&
            prevProps.selectedThreadCount === nextProps.selectedThreadCount &&
            prevProps.enableContextMenu === nextProps.enableContextMenu &&
            prevProps.onExportThread === nextProps.onExportThread &&
            prevProps.onExportSelected === nextProps.onExportSelected
        )
    }
)

ThreadItem.displayName = "ThreadItem"
