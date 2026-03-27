import type { Thread } from "@/components/threads/types"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { CheckCheck, FolderOpen, MoreHorizontal, Pin, Trash2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

const TOOLBAR_BUTTON_WIDTH = 32
const TOOLBAR_GAP_WIDTH = 4
const TOOLBAR_SIDE_PADDING = 8

type OverflowAction = "pin" | "move" | "delete"

export function SelectionToolbar({
    selectedThreads,
    isApplyingSelectionAction,
    onSelectAllThreads,
    onBulkTogglePin,
    onOpenBulkMoveDialog,
    onOpenBulkDeleteDialog,
    onExitSelectionMode
}: {
    selectedThreads: Thread[]
    isApplyingSelectionAction: boolean
    onSelectAllThreads: () => void
    onBulkTogglePin: () => void
    onOpenBulkMoveDialog: () => void
    onOpenBulkDeleteDialog: () => void
    onExitSelectionMode: () => void
}) {
    const layoutRef = useRef<HTMLDivElement>(null)
    const labelRef = useRef<HTMLDivElement>(null)
    const updateVisibleActionsRef = useRef<() => void>(() => {})
    const [visibleOverflowActions, setVisibleOverflowActions] = useState<OverflowAction[]>([
        "pin",
        "move",
        "delete"
    ])

    useEffect(() => {
        const layout = layoutRef.current
        const label = labelRef.current
        if (!layout || !label) return

        const updateVisibleActions = () => {
            const layoutWidth = layout.clientWidth
            const labelWidth = label.clientWidth

            const availableWidth =
                layoutWidth - labelWidth - TOOLBAR_SIDE_PADDING - TOOLBAR_GAP_WIDTH
            const alwaysVisibleWidth = TOOLBAR_BUTTON_WIDTH * 2 + TOOLBAR_GAP_WIDTH

            const remainingWidth = Math.max(0, availableWidth - alwaysVisibleWidth)
            const candidates: OverflowAction[] = ["pin", "move", "delete"]
            const nextVisible: OverflowAction[] = []

            let consumedWidth = 0
            for (const action of candidates) {
                const nextWidth =
                    consumedWidth === 0
                        ? TOOLBAR_BUTTON_WIDTH
                        : consumedWidth + TOOLBAR_GAP_WIDTH + TOOLBAR_BUTTON_WIDTH

                const needsMenu =
                    candidates.length - (nextVisible.length + 1) > 0
                        ? TOOLBAR_GAP_WIDTH + TOOLBAR_BUTTON_WIDTH
                        : 0

                if (nextWidth + needsMenu <= remainingWidth) {
                    nextVisible.push(action)
                    consumedWidth = nextWidth
                } else {
                    break
                }
            }

            setVisibleOverflowActions(nextVisible)
        }

        updateVisibleActionsRef.current = updateVisibleActions
        updateVisibleActions()

        const observer = new ResizeObserver(updateVisibleActions)
        observer.observe(layout)
        observer.observe(label)

        return () => {
            observer.disconnect()
        }
    }, [])

    const overflowActions = (["pin", "move", "delete"] as const).filter(
        (action) => !visibleOverflowActions.includes(action)
    )

    if (selectedThreads.length === 0) return null

    return (
        <div className="absolute right-2 bottom-2 left-2 z-20 rounded-lg border bg-sidebar/95 p-2 shadow-lg backdrop-blur">
            <div ref={layoutRef} className="flex items-center gap-2">
                <div ref={labelRef} className="font-medium text-sm">
                    {selectedThreads.length} selected
                </div>
                <div className="ml-auto flex items-center gap-1">
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={onSelectAllThreads}
                        disabled={isApplyingSelectionAction}
                        title="Select all loaded threads"
                    >
                        <CheckCheck className="h-4 w-4" />
                    </Button>
                    {visibleOverflowActions.includes("pin") && (
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={onBulkTogglePin}
                            disabled={isApplyingSelectionAction}
                            title={
                                selectedThreads.every((thread) => thread.pinned)
                                    ? "Unpin selected"
                                    : "Pin selected"
                            }
                        >
                            <Pin className="h-4 w-4" />
                        </Button>
                    )}
                    {visibleOverflowActions.includes("move") && (
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={onOpenBulkMoveDialog}
                            disabled={isApplyingSelectionAction}
                            title="Move selected"
                        >
                            <FolderOpen className="h-4 w-4" />
                        </Button>
                    )}
                    {visibleOverflowActions.includes("delete") && (
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={onOpenBulkDeleteDialog}
                            disabled={isApplyingSelectionAction}
                            title="Delete selected"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                    {overflowActions.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    disabled={isApplyingSelectionAction}
                                    title="More actions"
                                >
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {overflowActions.includes("pin") && (
                                    <DropdownMenuItem onClick={onBulkTogglePin}>
                                        <Pin className="h-4 w-4" />
                                        {selectedThreads.every((thread) => thread.pinned)
                                            ? "Unpin selected"
                                            : "Pin selected"}
                                    </DropdownMenuItem>
                                )}
                                {overflowActions.includes("move") && (
                                    <DropdownMenuItem onClick={onOpenBulkMoveDialog}>
                                        <FolderOpen className="h-4 w-4" />
                                        Move selected
                                    </DropdownMenuItem>
                                )}
                                {overflowActions.includes("delete") && (
                                    <DropdownMenuItem
                                        onClick={onOpenBulkDeleteDialog}
                                        className="text-destructive focus:text-destructive"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        Delete selected
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={onExitSelectionMode}
                        disabled={isApplyingSelectionAction}
                        title="Exit selection"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    )
}
