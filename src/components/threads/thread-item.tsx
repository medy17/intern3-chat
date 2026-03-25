import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger
} from "@/components/ui/context-menu"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { api } from "@/convex/_generated/api"
import { cn } from "@/lib/utils"
import { Link } from "@tanstack/react-router"
import { useParams } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import equal from "fast-deep-equal/es6"
import { Check, CheckSquare2, Edit3, FolderOpen, MoreHorizontal, Pin, Trash2 } from "lucide-react"
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
        const [isMenuOpen, setIsMenuOpen] = useState(false)
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

        const handleRename = () => {
            onOpenRenameDialog?.(thread)
        }

        const handleMove = () => {
            onOpenMoveDialog?.(thread)
        }

        const handleDelete = () => {
            onOpenDeleteDialog?.(thread)
        }

        const handleStartSelection = () => {
            onStartSelection?.(thread)
        }

        const handleToggleSelection = () => {
            onToggleSelection?.(thread)
        }

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

        const menuItems = (
            <>
                {onStartSelection && !isSelectionMode && (
                    <DropdownMenuItem onClick={handleStartSelection}>
                        <CheckSquare2 className="h-4 w-4" />
                        Select threads
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleRename}>
                    <Edit3 className="h-4 w-4" />
                    Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleTogglePin}>
                    <Pin className="h-4 w-4" />
                    {thread.pinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMove}>
                    <FolderOpen className="h-4 w-4" />
                    Move to folder
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDelete} variant="destructive">
                    <Trash2 className="h-4 w-4" />
                    Delete
                </DropdownMenuItem>
            </>
        )

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
                        "group/item flex w-full items-center rounded-sm hover:bg-accent/50",
                        isMenuOpen && "bg-accent/50",
                        (isActive || isSelected) && "bg-accent/60"
                    )}
                >
                    <SidebarMenuButton
                        className={cn("flex-1 hover:bg-transparent", isActive && "text-foreground")}
                    >
                        {isSelectionMode ? (
                            <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2"
                                onClick={handleToggleSelection}
                            >
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <span
                                        aria-hidden="true"
                                        className={cn(
                                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                                            isSelected
                                                ? "border-primary bg-primary text-primary-foreground"
                                                : "border-muted-foreground/40 bg-transparent"
                                        )}
                                    >
                                        {isSelected && <Check className="h-3 w-3" />}
                                    </span>
                                    <span className="truncate">{thread.title}</span>
                                </div>
                            </button>
                        ) : (
                            <Link
                                to="/thread/$threadId"
                                params={{ threadId: thread._id }}
                                className="flex items-center justify-between gap-2"
                                onClick={handleLinkClick}
                                onPointerDown={handlePointerDown}
                                onPointerUp={handlePointerUp}
                                onPointerLeave={clearLongPressTimer}
                                onPointerCancel={clearLongPressTimer}
                                onPointerMove={clearLongPressTimer}
                            >
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <span className="truncate">{thread.title}</span>
                                </div>
                                <DropdownMenu onOpenChange={setIsMenuOpen}>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.preventDefault()
                                                event.stopPropagation()
                                            }}
                                            className={cn(
                                                "rounded p-1 transition-opacity",
                                                isMenuOpen ||
                                                    "opacity-0 group-hover/item:opacity-100"
                                            )}
                                        >
                                            <MoreHorizontal className="mr-1 h-4 w-4" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {menuItems}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </Link>
                        )}
                    </SidebarMenuButton>
                </div>
            </SidebarMenuItem>
        )

        if (!enableContextMenu) {
            return threadContent
        }

        return (
            <ContextMenu onOpenChange={setIsMenuOpen}>
                <ContextMenuTrigger asChild>{threadContent}</ContextMenuTrigger>
                <ContextMenuContent>{contextMenuItems}</ContextMenuContent>
            </ContextMenu>
        )
    },
    (prevProps, nextProps) => {
        return (
            equal(prevProps.thread, nextProps.thread) &&
            prevProps.isInFolder === nextProps.isInFolder &&
            prevProps.isSelectionMode === nextProps.isSelectionMode &&
            prevProps.isSelected === nextProps.isSelected &&
            prevProps.enableContextMenu === nextProps.enableContextMenu &&
            prevProps.enableLongPressSelection === nextProps.enableLongPressSelection
        )
    }
)

ThreadItem.displayName = "ThreadItem"
