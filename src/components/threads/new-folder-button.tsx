import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useIsMobile } from "@/hooks/use-mobile"
import { DEFAULT_PROJECT_ICON, PROJECT_COLORS } from "@/lib/project-constants"
import { cn } from "@/lib/utils"
import { useMutation } from "convex/react"
import { Check, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

function NewFolderForm({
    folderName,
    setFolderName,
    folderDescription,
    setFolderDescription,
    folderColor,
    setFolderColor,
    isCreating,
    onSubmit
}: {
    folderName: string
    setFolderName: (v: string) => void
    folderDescription: string
    setFolderDescription: (v: string) => void
    folderColor: string
    setFolderColor: (v: string) => void
    isCreating: boolean
    onSubmit: () => void
}) {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="folder-name">Name</Label>
                <Input
                    id="folder-name"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    placeholder="Enter folder name"
                    className="max-w-full sm:max-w-[50%]"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !isCreating) {
                            onSubmit()
                        }
                    }}
                    disabled={isCreating}
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="folder-description">Description (Optional)</Label>
                <Input
                    id="folder-description"
                    value={folderDescription}
                    onChange={(e) => setFolderDescription(e.target.value)}
                    placeholder="Enter folder description"
                    disabled={isCreating}
                />
            </div>

            <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-2">
                    {PROJECT_COLORS.map((color) => (
                        <button
                            key={color.id}
                            type="button"
                            onClick={() => setFolderColor(color.id)}
                            disabled={isCreating}
                            className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                                color.class.split(" ").slice(1).join(" "),
                                folderColor === color.id
                                    ? "scale-110 border-foreground"
                                    : "border-transparent hover:scale-105"
                            )}
                        >
                            {folderColor === color.id && (
                                <Check className="h-4 w-4 text-white drop-shadow-sm" />
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

export function NewFolderDialog({
    open,
    onOpenChange,
    onSuccess,
    className
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess?: (projectId: Id<"projects">) => void
    className?: string
}) {
    const isMobile = useIsMobile()
    const [folderName, setFolderName] = useState("")
    const [folderDescription, setFolderDescription] = useState("")
    const [folderColor, setFolderColor] = useState<string>("blue")
    const [isCreating, setIsCreating] = useState(false)
    const createProjectMutation = useMutation(api.folders.createProject)

    const handleCreate = async () => {
        const trimmedName = folderName.trim()
        if (!trimmedName) {
            toast.error("Folder name cannot be empty")
            return
        }

        setIsCreating(true)
        try {
            const result = await createProjectMutation({
                name: trimmedName,
                description: folderDescription.trim() || undefined,
                icon: DEFAULT_PROJECT_ICON,
                color: folderColor
            })

            if (result && !("error" in result) && "projectId" in result) {
                toast.success("Folder created successfully")
                setFolderName("")
                setFolderDescription("")
                setFolderColor("blue")
                onOpenChange(false)
                onSuccess?.(result.projectId as Id<"projects">)
            } else {
                toast.error("Failed to create folder")
            }
        } catch (error) {
            console.error("Failed to create folder:", error)
            toast.error("Failed to create folder")
        } finally {
            setIsCreating(false)
        }
    }

    const formProps = {
        folderName,
        setFolderName,
        folderDescription,
        setFolderDescription,
        folderColor,
        setFolderColor,
        isCreating,
        onSubmit: handleCreate
    }

    if (isMobile) {
        return (
            <Drawer open={open} onOpenChange={onOpenChange}>
                <DrawerContent className={cn("z-[70]", className)} overlayClassName="z-[70]">
                    <DrawerHeader>
                        <DrawerTitle>Create New Folder</DrawerTitle>
                        <DrawerDescription>
                            Folders are a great way to organize your threads
                        </DrawerDescription>
                    </DrawerHeader>
                    <div className="overflow-y-auto px-4">
                        <NewFolderForm {...formProps} />
                    </div>
                    <DrawerFooter>
                        <Button onClick={handleCreate} disabled={isCreating || !folderName.trim()}>
                            {isCreating ? "Creating..." : "Create"}
                        </Button>
                        <DrawerClose asChild>
                            <Button variant="outline" disabled={isCreating}>
                                Cancel
                            </Button>
                        </DrawerClose>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={cn("max-w-md", className)}>
                <DialogHeader>
                    <DialogTitle>Create New Folder</DialogTitle>
                    <DialogDescription>
                        Folders are a great way to organize your threads
                    </DialogDescription>
                </DialogHeader>
                <NewFolderForm {...formProps} />
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isCreating}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} disabled={isCreating || !folderName.trim()}>
                        {isCreating ? "Creating..." : "Create"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export function NewFolderButton({
    onClick,
    onSuccess
}: {
    onClick?: () => void
    onSuccess?: (projectId: Id<"projects">) => void
}) {
    const [showDialog, setShowDialog] = useState(false)

    return (
        <>
            <Button
                size="sm"
                variant={"ghost"}
                onClick={() => {
                    setShowDialog(true)
                    onClick?.()
                }}
                className="size-6 text-muted-foreground"
            >
                <Plus className="size-4" />
                <span className="sr-only">New folder</span>
            </Button>

            <NewFolderDialog open={showDialog} onOpenChange={setShowDialog} onSuccess={onSuccess} />
        </>
    )
}
