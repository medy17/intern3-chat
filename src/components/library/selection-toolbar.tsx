import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Archive, Download, FolderPlus, RotateCcw, Trash2, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

export function SelectionToolbar({
    selectedCount,
    isArchivedView,
    collections,
    onClearSelection,
    onDownload,
    onArchive,
    onRestore,
    onDelete,
    onAddToCollection
}: {
    selectedCount: number
    isArchivedView: boolean
    collections: Array<{ _id: string; name: string }>
    onClearSelection: () => void
    onDownload?: () => void
    onArchive?: () => void
    onRestore?: () => void
    onDelete?: () => void
    onAddToCollection?: (collectionId: string) => void
}) {
    if (selectedCount === 0) return null

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: 100, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 100, opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="fixed inset-x-0 bottom-6 z-[100] mx-auto flex w-fit max-w-[90vw] items-center gap-1.5 rounded-md border border-border/50 bg-background/95 p-1.5 shadow-2xl backdrop-blur-xl"
            >
                <div className="flex shrink-0 items-center gap-2 pr-2 pl-3 font-medium text-sm">
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/20 px-1.5 text-[0.625rem] text-primary">
                        {selectedCount}
                    </span>
                    <span className="hidden sm:inline">selected</span>
                </div>

                <div className="mx-1 h-4 w-px shrink-0 bg-border/60" />

                {onDownload && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-2 rounded-md px-3 text-xs"
                        onClick={onDownload}
                    >
                        <Download className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Download</span>
                    </Button>
                )}

                {onAddToCollection && collections.length > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-2 rounded-md px-3 text-xs"
                            >
                                <FolderPlus className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Add to Collection</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="w-48 pb-1">
                            {collections.map((collection) => (
                                <DropdownMenuItem
                                    key={collection._id}
                                    onClick={() => onAddToCollection(collection._id)}
                                >
                                    {collection.name}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                {isArchivedView
                    ? onRestore && (
                          <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-2 rounded-md px-3 text-xs"
                              onClick={onRestore}
                          >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Restore</span>
                          </Button>
                      )
                    : onArchive && (
                          <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-2 rounded-md px-3 text-xs"
                              onClick={onArchive}
                          >
                              <Archive className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Archive</span>
                          </Button>
                      )}

                {onDelete && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-2 rounded-md px-3 text-destructive text-xs hover:bg-destructive/10 hover:text-destructive"
                        onClick={onDelete}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Delete</span>
                    </Button>
                )}

                <div className="mx-1 h-4 w-px shrink-0 bg-border/60" />

                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-md"
                    onClick={onClearSelection}
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Clear selection</span>
                </Button>
            </motion.div>
        </AnimatePresence>
    )
}
