import { PendingImageItem } from "@/components/library/pending-image-item"
import { Button } from "@/components/ui/button"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger
} from "@/components/ui/context-menu"
import type { Doc } from "@/convex/_generated/dataModel"
import { getLibraryImageSources } from "@/lib/generated-image-urls"
import { type PrivateViewingOverride, getIsImageHidden } from "@/lib/private-viewing"
import { useSharedModels } from "@/lib/shared-models"
import { cn } from "@/lib/utils"
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    useReactTable
} from "@tanstack/react-table"
import { Archive, Check, CheckSquare2, Eye, EyeOff, RotateCcw, Trash2 } from "lucide-react"
import React, { useMemo } from "react"
import { VList } from "virtua"

export interface LibraryListTableProps {
    images: Doc<"generatedImages">[]
    pendingGenerations: { id: string; aspectRatio: string }[]
    showPendingGenerations: boolean
    selectedImageIds: Set<string>
    isSelectionMode: boolean
    isArchivedView: boolean
    privateViewingEnabled: boolean
    imageOverrides: Record<string, PrivateViewingOverride>
    onToggleSelection: (id: string) => void
    onStartSelection: (id: string) => void
    onImageClick: (image: Doc<"generatedImages">) => void
    onDelete: (id: string) => void
    onArchive: (id: string) => void
    onRestore: (id: string) => void
    onToggleImageHidden: (id: string) => void
    onBulkDelete: () => void
    onBulkArchive: () => void
    onBulkRestore: () => void
    canLoadMore: boolean
    onLoadMore: () => void
}

function ScrollSentinel({ onLoadMore }: { onLoadMore: () => void }) {
    const ref = React.useRef<HTMLDivElement>(null)
    React.useEffect(() => {
        if (!ref.current) return
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    onLoadMore()
                }
            },
            { rootMargin: "200px" }
        )
        observer.observe(ref.current)
        return () => observer.disconnect()
    }, [onLoadMore])
    return <div ref={ref} className="h-10 w-full" />
}

const columnHelper = createColumnHelper<Doc<"generatedImages">>()

export function LibraryListTable({
    images,
    pendingGenerations,
    showPendingGenerations,
    selectedImageIds,
    isSelectionMode,
    isArchivedView,
    privateViewingEnabled,
    imageOverrides,
    onToggleSelection,
    onStartSelection,
    onImageClick,
    onDelete,
    onArchive,
    onRestore,
    onToggleImageHidden,
    onBulkDelete,
    onBulkArchive,
    onBulkRestore,
    canLoadMore,
    onLoadMore
}: LibraryListTableProps) {
    const { models: sharedModels } = useSharedModels()

    const columns = useMemo(
        () => [
            columnHelper.display({
                id: "thumbnail",
                header: () => null,
                cell: (info) => {
                    const image = info.row.original
                    const isImageHidden = getIsImageHidden({
                        privateViewingEnabled,
                        override: imageOverrides[image._id]
                    })

                    const visibleImageSources = getLibraryImageSources({
                        storageKey: image.storageKey,
                        aspectRatio: image.aspectRatio,
                        hidden: false
                    })

                    return (
                        <button
                            type="button"
                            className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border bg-muted/20 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            onClick={(e) => {
                                e.stopPropagation()
                                if (isSelectionMode) {
                                    onToggleSelection(image._id)
                                } else {
                                    onImageClick(image)
                                }
                            }}
                        >
                            <img
                                src={visibleImageSources.src}
                                className="absolute inset-0 h-full w-full object-cover"
                                alt={image.prompt || ""}
                                loading="lazy"
                            />
                            {isImageHidden && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                                    <EyeOff className="h-4 w-4 text-white/80" />
                                </div>
                            )}
                        </button>
                    )
                },
                size: 64
            }),
            columnHelper.accessor("prompt", {
                header: "Prompt",
                cell: (info) => {
                    const image = info.row.original
                    const isImageHidden = getIsImageHidden({
                        privateViewingEnabled,
                        override: imageOverrides[image._id]
                    })

                    return (
                        <button
                            type="button"
                            className="w-full truncate text-left font-medium text-sm outline-none"
                            onClick={(e) => {
                                e.stopPropagation()
                                if (isSelectionMode) {
                                    onToggleSelection(image._id)
                                } else {
                                    onImageClick(image)
                                }
                            }}
                        >
                            {isImageHidden
                                ? "Private viewing enabled"
                                : image.prompt || "No prompt"}
                        </button>
                    )
                },
                size: 400
            }),
            columnHelper.accessor("modelId", {
                header: "Model",
                cell: (info) => {
                    const modelId = info.getValue()
                    const modelName = sharedModels?.find((m) => m.id === modelId)?.name || modelId
                    return (
                        <span className="truncate text-muted-foreground text-xs">{modelName}</span>
                    )
                },
                size: 150
            }),
            columnHelper.accessor("resolution", {
                header: "Resolution",
                cell: (info) => (
                    <span className="truncate text-muted-foreground text-xs">
                        {info.getValue() || "1K"}
                    </span>
                ),
                size: 100
            }),
            columnHelper.accessor("aspectRatio", {
                header: "Aspect Ratio",
                cell: (info) => (
                    <span className="truncate text-muted-foreground text-xs">
                        {info.getValue()}
                    </span>
                ),
                size: 100
            }),
            columnHelper.accessor("createdAt", {
                header: "Date",
                cell: (info) => (
                    <span className="truncate text-muted-foreground text-xs">
                        {new Date(info.getValue()).toLocaleDateString()}
                    </span>
                ),
                size: 100
            }),
            columnHelper.display({
                id: "actions",
                header: () => null,
                cell: (info) => {
                    const image = info.row.original
                    const isSelected = selectedImageIds.has(image._id)

                    return (
                        <div className="flex justify-end pr-2">
                            {isSelectionMode ? (
                                <button
                                    type="button"
                                    className={cn(
                                        "flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-2 outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary",
                                        isSelected
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-muted-foreground/30 bg-transparent text-transparent hover:border-primary/50"
                                    )}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onToggleSelection(image._id)
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "h-3 w-3",
                                            isSelected ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                </button>
                            ) : (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onStartSelection(image._id)
                                    }}
                                >
                                    <CheckSquare2 className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    )
                },
                size: 60
            })
        ],
        [
            imageOverrides,
            privateViewingEnabled,
            isSelectionMode,
            selectedImageIds,
            sharedModels,
            onImageClick,
            onStartSelection,
            onToggleSelection
        ]
    )

    const table = useReactTable({
        data: images,
        columns,
        getCoreRowModel: getCoreRowModel()
    })

    return (
        <div className="flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm">
            {/* Header */}
            <div className="flex border-b bg-muted/50 p-3 font-medium text-muted-foreground text-xs">
                {table.getHeaderGroups().map((headerGroup) => (
                    <React.Fragment key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                            <div
                                key={header.id}
                                style={{
                                    width: header.getSize(),
                                    flex: header.column.id === "prompt" ? "1 1 0" : "none"
                                }}
                            >
                                {header.isPlaceholder
                                    ? null
                                    : flexRender(
                                          header.column.columnDef.header,
                                          header.getContext()
                                      )}
                            </div>
                        ))}
                    </React.Fragment>
                ))}
            </div>

            {/* Pending Generations */}
            {showPendingGenerations && pendingGenerations.length > 0 && (
                <div className="flex flex-col">
                    {pendingGenerations.map((pending) => (
                        <div key={pending.id} className="border-border/60 border-b p-3">
                            <PendingImageItem aspectRatio={pending.aspectRatio} />
                        </div>
                    ))}
                </div>
            )}

            {/* Virtualized Rows */}
            <div className="flex h-[calc(100dvh-200px)] flex-col">
                <VList>
                    {table.getRowModel().rows.map((row) => {
                        const image = row.original
                        const isSelected = selectedImageIds.has(image._id)
                        const isImageHidden = getIsImageHidden({
                            privateViewingEnabled,
                            override: imageOverrides[image._id]
                        })

                        return (
                            <ContextMenu key={row.id}>
                                <ContextMenuTrigger asChild>
                                    <div
                                        className={cn(
                                            "group flex items-center gap-4 border-border/60 border-b p-3 transition-colors hover:bg-muted/50",
                                            isSelected && "bg-primary/5"
                                        )}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <div
                                                key={cell.id}
                                                style={{
                                                    width: cell.column.getSize(),
                                                    flex:
                                                        cell.column.id === "prompt"
                                                            ? "1 1 0"
                                                            : "none",
                                                    overflow: "hidden"
                                                }}
                                            >
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </ContextMenuTrigger>
                                <ContextMenuContent className="w-48">
                                    {!isSelectionMode && (
                                        <>
                                            <ContextMenuItem
                                                onClick={() => onStartSelection(image._id)}
                                            >
                                                <CheckSquare2 className="mr-2 h-4 w-4" />
                                                Select Images
                                            </ContextMenuItem>
                                            <ContextMenuSeparator />
                                        </>
                                    )}

                                    {isSelectionMode && selectedImageIds.size > 0 ? (
                                        <>
                                            <ContextMenuItem
                                                onClick={
                                                    isArchivedView ? onBulkRestore : onBulkArchive
                                                }
                                            >
                                                {isArchivedView ? (
                                                    <RotateCcw className="mr-2 h-4 w-4" />
                                                ) : (
                                                    <Archive className="mr-2 h-4 w-4" />
                                                )}
                                                {isArchivedView
                                                    ? "Restore Selected"
                                                    : "Archive Selected"}
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                onClick={onBulkDelete}
                                                className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Delete Selected
                                            </ContextMenuItem>
                                        </>
                                    ) : (
                                        <>
                                            <ContextMenuItem
                                                onClick={() => onToggleImageHidden(image._id)}
                                            >
                                                {isImageHidden ? (
                                                    <Eye className="mr-2 h-4 w-4" />
                                                ) : (
                                                    <EyeOff className="mr-2 h-4 w-4" />
                                                )}
                                                {isImageHidden ? "Unhide Image" : "Hide Image"}
                                            </ContextMenuItem>

                                            <ContextMenuItem
                                                onClick={() =>
                                                    isArchivedView
                                                        ? onRestore(image._id)
                                                        : onArchive(image._id)
                                                }
                                            >
                                                {isArchivedView ? (
                                                    <RotateCcw className="mr-2 h-4 w-4" />
                                                ) : (
                                                    <Archive className="mr-2 h-4 w-4" />
                                                )}
                                                {isArchivedView ? "Restore" : "Archive"}
                                            </ContextMenuItem>
                                            <ContextMenuSeparator />
                                            <ContextMenuItem
                                                onClick={() => onDelete(image._id)}
                                                className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Delete
                                            </ContextMenuItem>
                                        </>
                                    )}
                                </ContextMenuContent>
                            </ContextMenu>
                        )
                    })}
                    {canLoadMore && <ScrollSentinel onLoadMore={onLoadMore} />}
                </VList>
            </div>
        </div>
    )
}
