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
import { useMutation } from "convex/react"
import { Check, CheckSquare2, Edit3, FolderOpen, Pin, Trash2 } from "lucide-react"
import { memo, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { Thread } from "./types"

interface ThreadItemProps {
    thread: Thread
    isInFolder?: boolean
    isSelectionMode?: boolean
    isSelected?: boolean
    enableContextMenu?: boolean
    enableLongPressSelection?: boolean
    onOpenRenameDialog?: (thread: Thread) => void
    onOpenMoveDialog?: (thread: Thread) => void
    onOpenDeleteDialog?: (thread: Thread) => void
    onToggleSelection?: (thread: Thread) => void
    onStartSelection?: (thread: Thread) => void
}

export const ThreadItem = memo(
    ({
        thread,
        isInFolder = false,
        isSelectionMode = false,
        isSelected = false,
        enableContextMenu = true,
        enableLongPressSelection = false,
        onOpenRenameDialog,
        onOpenMoveDialog,
        onOpenDeleteDialog,
        onToggleSelection,
        onStartSelection
    }: ThreadItemProps) => {
        const [isContextMenuOpen, setIsContextMenuOpen] = useState(false)
        const longPressTimeoutRef = useRef<number | null>(null)
        const longPressTriggeredRef = useRef(false)

        const togglePinMutation = useMutation(api.threads.togglePinThread)
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

        const handlePointerDown = (event: React.PointerEvent<HTMLAnchorElement>) => {
            if (!enableLongPressSelection || isSelectionMode || event.pointerType !== "touch") {
                return
            }
            longPressTriggeredRef.current = false
            clearLongPressTimer()
            longPressTimeoutRef.current = window.setTimeout(() => {
                longPressTriggeredRef.current = true
                handleStartSelection()
            }, 450)
        }

        const handlePointerUp = () => {
            clearLongPressTimer()
            if (longPressTriggeredRef.current) {
                window.setTimeout(() => {
                    longPressTriggeredRef.current = false
                }, 0)
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
                        "transition-colors duration-150 ease-in-out",
                        // Use solid background colors instead of translucent (/50)
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
                                    <span className="block min-w-0 flex-1 truncate text-sm">
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
                                onPointerDown={handlePointerDown}
                                onPointerUp={handlePointerUp}
                                onPointerLeave={clearLongPressTimer}
                                onPointerCancel={clearLongPressTimer}
                                onPointerMove={clearLongPressTimer}
                            >
                                <div className="flex min-w-0 flex-1 items-center">
                                    <span className="block min-w-0 flex-1 truncate text-sm">
                                        {thread.title}
                                    </span>
                                </div>
                            </Link>
                        )}
                    </SidebarMenuButton>

                    {!isSelectionMode && (
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end">
                            {/* 
                                1. Increased width to w-28 for a smoother fade
                                2. Changed to a solid gradient (via-40% creates a solid block behind the buttons) 
                            */}
                            <div
                                className={cn(
                                    "absolute inset-y-0 right-0 w-28 rounded-r-lg opacity-0 transition-opacity duration-150",
                                    "bg-gradient-to-r from-transparent via-40% via-sidebar-accent to-sidebar-accent",
                                    "group-hover/item:opacity-100",
                                    isContextMenuOpen && "opacity-100"
                                )}
                            />

                            <div
                                className={cn(
                                    "pointer-events-none relative z-10 flex translate-x-2 items-center gap-1 pr-1.5 opacity-0",
                                    "transition-all duration-150 ease-out",
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
            prevProps.enableContextMenu === nextProps.enableContextMenu
        )
    }
)

ThreadItem.displayName = "ThreadItem"
