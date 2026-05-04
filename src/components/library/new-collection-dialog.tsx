import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/convex/_generated/api"
import { useMutation } from "convex/react"
import { useState } from "react"
import { toast } from "sonner"

export function NewCollectionDialog({
    open,
    onOpenChange,
    onSuccess
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess?: (collectionId: string) => void
}) {
    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [isCreating, setIsCreating] = useState(false)
    const createCollection = useMutation(api.image_collections.createCollection)

    const handleCreate = async () => {
        const trimmedName = name.trim()
        if (!trimmedName) return

        setIsCreating(true)
        try {
            const collectionId = await createCollection({
                name: trimmedName,
                description: description.trim() || undefined
            })
            toast.success("Collection created")
            onOpenChange(false)
            setName("")
            setDescription("")
            onSuccess?.(collectionId)
        } catch (error) {
            console.error("Failed to create collection:", error)
            toast.error("Failed to create collection")
        } finally {
            setIsCreating(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create Collection</DialogTitle>
                    <DialogDescription>Group your generated images together.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="collection-name">Name</Label>
                        <Input
                            id="collection-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter collection name"
                            autoFocus
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="collection-description">Description (Optional)</Label>
                        <Input
                            id="collection-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Enter collection description"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} disabled={isCreating || !name.trim()}>
                        {isCreating ? "Creating..." : "Create Collection"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
