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
import { Button } from "@/components/ui/button"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger
} from "@/components/ui/context-menu"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { api } from "@/convex/_generated/api"
import { useIsMobile } from "@/hooks/use-mobile"
import {
    DEFAULT_PROJECT_ICON,
    PROJECT_COLORS,
    type ProjectColorId,
    getProjectColorClasses
} from "@/lib/project-constants"
import { cn } from "@/lib/utils"
import { Link } from "@tanstack/react-router"
import { useNavigate } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import { Check, CheckSquare2, Edit3, Loader2, Minus, MoreHorizontal, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { Project } from "./types"

type FolderSelectionState = "none" | "some" | "all"

interface FolderItemProps {
    project: Project
    numThreads: number
    isCurrentFolder?: boolean
    isSelectionMode?: boolean
    selectionState?: FolderSelectionState
    enableContextMenu?: boolean
    enableLongPressSelection?: boolean
    onStartSelection?: (project: Project) => void | Promise<void>
    onToggleSelection?: (project: Project) => void | Promise<void>
}

export function FolderItem({
    project,
    numThreads,
    isCurrentFolder = false,
    isSelectionMode = false,
    selectionState = "none",
    enableContextMenu = true,
    enableLongPressSelection = false,
    onStartSelection,
    onToggleSelection
}: FolderItemProps) {
    const [showEditDialog, setShowEditDialog] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isContextMenuOpen, setIsContextMenuOpen] = useState(false)
    const [editName, setEditName] = useState("")
    const [editDescription, setEditDescription] = useState("")
    const [editColor, setEditColor] = useState<string>("blue")
    const [isEditing, setIsEditing] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const longPressTimeoutRef = useRef<number | null>(null)
    const longPressStartPointRef = useRef<{ x: number; y: number } | null>(null)
    const longPressTriggeredRef = useRef(false)

    const colorClasses = getProjectColorClasses(project.color as ProjectColorId)
    const updateProjectMutation = useMutation(api.folders.updateProject)
    const deleteProjectMutation = useMutation(api.folders.deleteProject)
    const navigate = useNavigate()
    const isMobile = useIsMobile()

    const handleEdit = async () => {
        const trimmedName = editName.trim()
        if (!trimmedName) {
            toast.error("Folder name cannot be empty")
            return
        }

        setIsEditing(true)
        try {
            const result = await updateProjectMutation({
                projectId: project._id,
                name: trimmedName,
                description: editDescription.trim() || undefined,
                color: editColor,
                icon: project.icon || DEFAULT_PROJECT_ICON
            })

            if (result && "error" in result) {
                toast.error(
                    typeof result.error === "string" ? result.error : "Failed to update folder"
                )
            } else {
                toast.success("Folder updated successfully")
                setShowEditDialog(false)
            }
        } catch (error) {
            console.error("Failed to update folder:", error)
            toast.error("Failed to update folder")
        } finally {
            setIsEditing(false)
        }
    }

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            // Navigate away if currently viewing this folder
            if (isCurrentFolder) {
                navigate({ to: "/", replace: true })
            }

            const result = await deleteProjectMutation({ projectId: project._id })

            if (result && "error" in result) {
                toast.error(
                    typeof result.error === "string" ? result.error : "Failed to delete folder"
                )
            } else if (result && "archived" in result && result.archived) {
                toast.success("Folder archived (contains threads)")
            } else {
                toast.success("Folder deleted successfully")
            }
            setShowDeleteDialog(false)
        } catch (error) {
            console.error("Failed to delete folder:", error)
            toast.error("Failed to delete folder")
        } finally {
            setIsDeleting(false)
        }
    }

    const openEditDialog = () => {
        setEditName(project.name)
        setEditDescription(project.description || "")
        setEditColor(project.color || "blue")
        setShowEditDialog(true)
    }

    const { setOpenMobile } = useSidebar()
    const hasThreads = numThreads > 0
    const isFullySelected = selectionState === "all"
    const isPartiallySelected = selectionState === "some"
    const isTileHighlighted =
        isMenuOpen || isContextMenuOpen || isCurrentFolder || isFullySelected || isPartiallySelected

    useEffect(() => {
        return () => {
            if (longPressTimeoutRef.current !== null) {
                window.clearTimeout(longPressTimeoutRef.current)
            }
        }
    }, [])

    const clearLongPressTimer = () => {
        if (longPressTimeoutRef.current !== null) {
            window.clearTimeout(longPressTimeoutRef.current)
            longPressTimeoutRef.current = null
        }
    }

    const handleStartSelection = () => {
        if (!hasThreads) return
        void onStartSelection?.(project)
    }

    const handleToggleSelection = () => {
        if (!hasThreads) return
        void onToggleSelection?.(project)
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
        if (longPressTriggeredRef.current) {
            event.preventDefault()
            event.stopPropagation()
            return
        }

        if (!isMobile) {
            return
        }

        event.preventDefault()
        setOpenMobile(false)

        let didNavigate = false
        const doNavigate = () => {
            if (didNavigate) return
            didNavigate = true
            void navigate({
                to: "/folder/$folderId",
                params: { folderId: project._id }
            })
        }

        window.addEventListener("popstate", doNavigate, { once: true })
        window.setTimeout(doNavigate, 150)
    }

    const handleContextMenu = (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (!enableLongPressSelection) {
            return
        }

        event.preventDefault()
        event.stopPropagation()
    }

    const folderMenuItems = (
        <>
            {!isSelectionMode && hasThreads && onStartSelection && (
                <>
                    <ContextMenuItem onClick={handleStartSelection}>
                        <CheckSquare2 className="h-4 w-4" />
                        Select threads
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                </>
            )}
            <ContextMenuItem onClick={openEditDialog}>
                <Edit3 className="h-4 w-4" />
                Edit folder
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setShowDeleteDialog(true)} variant="destructive">
                <Trash2 className="h-4 w-4" />
                Delete folder
            </ContextMenuItem>
        </>
    )

    const folderContent = (
        <SidebarMenuItem>
            <div
                className={cn(
                    "group/item relative flex h-9 w-full items-center overflow-hidden rounded-lg outline-hidden transition-colors duration-200 ease-in-out hover:bg-sidebar-accent",
                    isTileHighlighted && "bg-sidebar-accent"
                )}
            >
                <SidebarMenuButton
                    asChild={!isSelectionMode}
                    className={cn(
                        "h-full min-w-0 flex-1 px-2 hover:bg-transparent",
                        isCurrentFolder && !isSelectionMode && "text-foreground"
                    )}
                >
                    {isSelectionMode ? (
                        <button
                            type="button"
                            className="flex h-full w-full min-w-0 items-center gap-2"
                            onClick={handleToggleSelection}
                            disabled={!hasThreads}
                        >
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
                                        isFullySelected || isPartiallySelected
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-muted-foreground/40 bg-transparent"
                                    )}
                                >
                                    {isFullySelected && <Check className="h-3 w-3" />}
                                    {isPartiallySelected && <Minus className="h-3 w-3" />}
                                </span>
                                <div
                                    className={cn(
                                        "flex size-3 shrink-0 items-center justify-center rounded-full text-xs",
                                        colorClasses.split(" ").slice(1).join(" ")
                                    )}
                                />
                                <span className="min-w-0 flex-1 truncate font-medium text-sm">
                                    {project.name}
                                </span>
                            </div>
                            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                                {numThreads}
                            </span>
                        </button>
                    ) : (
                        <Link
                            onClick={handleLinkClick}
                            to="/folder/$folderId"
                            params={{ folderId: project._id }}
                            className="flex h-full w-full min-w-0 items-center gap-2"
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
                            <div
                                className={cn(
                                    "flex size-3 shrink-0 items-center justify-center rounded-full text-xs",
                                    colorClasses.split(" ").slice(1).join(" ")
                                )}
                            />
                            <span className="min-w-0 flex-1 truncate font-medium">
                                {project.name}
                            </span>
                        </Link>
                    )}
                </SidebarMenuButton>

                {!isSelectionMode && (
                    <DropdownMenu onOpenChange={setIsMenuOpen}>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="relative mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
                                aria-label={`Folder actions for ${project.name}`}
                            >
                                <span
                                    className={cn(
                                        "pointer-events-none absolute rounded bg-input px-1 py-0.5 text-[10px] leading-none transition-opacity",
                                        isMenuOpen
                                            ? "opacity-0"
                                            : "opacity-100 group-hover/item:opacity-0"
                                    )}
                                >
                                    {numThreads}
                                </span>
                                <MoreHorizontal
                                    className={cn(
                                        "h-4 w-4 transition-opacity",
                                        isMenuOpen || "opacity-0 group-hover/item:opacity-100"
                                    )}
                                />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {hasThreads && onStartSelection && (
                                <DropdownMenuItem onClick={handleStartSelection}>
                                    <CheckSquare2 className="h-4 w-4" />
                                    Select threads
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={openEditDialog}>
                                <Edit3 className="h-4 w-4" />
                                Edit folder
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setShowDeleteDialog(true)}
                                variant="destructive"
                            >
                                <Trash2 className="h-4 w-4" />
                                Delete folder
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </SidebarMenuItem>
    )

    return (
        <>
            {enableContextMenu ? (
                <ContextMenu onOpenChange={setIsContextMenuOpen}>
                    <ContextMenuTrigger asChild>{folderContent}</ContextMenuTrigger>
                    <ContextMenuContent>{folderMenuItems}</ContextMenuContent>
                </ContextMenu>
            ) : (
                folderContent
            )}

            {/* Edit Dialog */}
            <Dialog
                open={showEditDialog}
                onOpenChange={(open) => {
                    if (!isEditing) {
                        setShowEditDialog(open)
                    }
                }}
            >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Folder</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="edit-folder-name">Name</Label>
                            <Input
                                id="edit-folder-name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="max-w-[50%]"
                                placeholder="Enter folder name"
                                disabled={isEditing}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-folder-description">Description (optional)</Label>
                            <Input
                                id="edit-folder-description"
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                placeholder="Enter folder description"
                                disabled={isEditing}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Color</Label>
                            <div className="flex gap-2">
                                {PROJECT_COLORS.map((color) => (
                                    <button
                                        key={color.id}
                                        type="button"
                                        onClick={() => setEditColor(color.id)}
                                        disabled={isEditing}
                                        className={cn(
                                            "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                                            color.class.split(" ").slice(1).join(" "),
                                            editColor === color.id
                                                ? "scale-110 border-foreground"
                                                : "border-transparent hover:scale-105"
                                        )}
                                    >
                                        {editColor === color.id && (
                                            <Check className="h-4 w-4 text-white drop-shadow-sm" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowEditDialog(false)}
                            disabled={isEditing}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleEdit} disabled={isEditing || !editName.trim()}>
                            {isEditing ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                "Save"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Folder</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete{" "}
                            <span className="font-bold">{project.name}</span>?
                            {numThreads > 0 && (
                                <>
                                    <br />
                                    <br />
                                    This folder contains {numThreads} thread
                                    {numThreads !== 1 ? "s" : ""}. The folder will be archived
                                    instead of deleted.
                                </>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {numThreads > 0 ? "Archiving..." : "Deleting..."}
                                </>
                            ) : numThreads > 0 ? (
                                "Archive"
                            ) : (
                                "Delete"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
