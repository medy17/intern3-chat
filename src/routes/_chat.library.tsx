import { GeneratedImageItem } from "@/components/library/generated-image-item"
import { ImageDetailsModal } from "@/components/library/image-details-modal"
import {
    MobileCheckboxFilter,
    MobileFilterSection,
    MobileSortFilter,
    MultiSelectFilter
} from "@/components/library/library-filter-controls"
import { LibraryListTable } from "@/components/library/library-list-table"
import { PendingImageItem } from "@/components/library/pending-image-item"
import { usePrivateViewingStore } from "@/components/library/private-viewing-store"
import { useLibraryData } from "@/components/library/use-library-data"
import { useLibraryViewState } from "@/components/library/use-library-view-state"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious
} from "@/components/ui/pagination"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useSession } from "@/hooks/auth-hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import type { GeneratedImageOrientation } from "@/lib/generated-image-filters"
import { getGeneratedImageDirectUrl, getGeneratedImageProxyUrl } from "@/lib/generated-image-urls"
import { ImageMetadataProvider } from "@/lib/image-metadata-context"
import {
    DEFAULT_LIBRARY_SEARCH,
    type ImageSortOption,
    LIBRARY_PAGE_SIZE_OPTIONS,
    type LibraryPageSize,
    type LibrarySearchState,
    type LibraryView as LibraryViewMode,
    validateLibrarySearch
} from "@/lib/library-search"
import { getIsImageHidden } from "@/lib/private-viewing"
import { cn } from "@/lib/utils"
import { createFileRoute, stripSearchParams, useNavigate } from "@tanstack/react-router"
import {
    Archive,
    Download,
    Eye,
    EyeOff,
    Filter,
    Image as ImageIcon,
    LayoutGrid,
    List,
    RotateCcw,
    Search,
    Trash2,
    X
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useRef, useState } from "react"

export const Route = createFileRoute("/_chat/library")({
    validateSearch: validateLibrarySearch,
    search: {
        middlewares: [stripSearchParams(DEFAULT_LIBRARY_SEARCH)]
    },
    component: LibraryRouteComponent
})

function LibraryRouteComponent() {
    const search = Route.useSearch()

    return <LibraryView search={search} />
}

export function LibraryView({ search }: { search: LibrarySearchState }) {
    const navigate = useNavigate({ from: "/library" })
    const session = useSession()
    const isMobile = useIsMobile()
    const galleryRef = useRef<HTMLDivElement>(null)
    const [scrollMode, setScrollMode] = useState<"paginated" | "infinite">("paginated")
    const privateViewingEnabled = usePrivateViewingStore((state) => state.privateViewingEnabled)
    const imageOverrides = usePrivateViewingStore((state) => state.imageOverrides)
    const togglePrivateViewingEnabled = usePrivateViewingStore(
        (state) => state.togglePrivateViewingEnabled
    )
    const toggleImageVisibility = usePrivateViewingStore((state) => state.toggleImageVisibility)
    const {
        searchQuery,
        hasSearchQuery,
        sortBy,
        view,
        isArchivedView,
        sortOptions,
        pageNumber,
        pageSize,
        filters,
        hasActiveFilters,
        pendingGenerations,
        completedGenerationCount,
        resolvedImagePage,
        imagesSource,
        totalPages,
        libraryTitle,
        librarySummaryParts,
        canGoPrevious,
        canGoNext,
        showPendingGenerations,
        modelFilterOptions,
        resolutionFilterOptions,
        aspectRatioFilterOptions,
        orientationFilterOptions
    } = useLibraryData({
        search,
        userId: session.user?.id,
        scrollMode
    })

    const {
        isFiltersDrawerOpen,
        setIsFiltersDrawerOpen,
        draftQuery,
        setDraftQuery,
        draftSortBy,
        setDraftSortBy,
        draftPageSize,
        setDraftPageSize,
        draftFilters,
        activeFilterCount,
        draftActiveFilterCount,
        shouldHideDesktopStickyChrome,
        selectedImage,
        setSelectedImage,
        isSelectionMode,
        selectedImageIds,
        galleryLayout,
        setGalleryLayout,
        scrollSentinelRef,
        animatedImageIds,
        images,
        canNavigateSelectedImagePrevious,
        canNavigateSelectedImageNext,
        selectedImagePrefetchUrls,
        handleSortChange,
        handlePageSizeChange,
        handleViewChange,
        handleFilterChange,
        handleClearFilters,
        handleClearFilterGroup,
        handleOpenFiltersDrawer,
        handleDraftFilterChange,
        handleClearDraftFilterGroup,
        handleResetDraftFilters,
        handleApplyDrawerFilters,
        handleNextPage,
        handlePreviousPage,
        handleImageSettled,
        handleStartSelection,
        handleToggleSelection,
        handleDeleteImage,
        handleArchiveImage,
        handleRestoreImage,
        handleCloseModal,
        handleHideImageLocally,
        handleSelectPreviousImage,
        handleSelectNextImage,
        handleBulkDelete,
        handleBulkArchive,
        handleBulkRestore,
        handleClearSelection,
        draftSortLabel
    } = useLibraryViewState({
        search,
        navigate,
        isMobile,
        galleryRef,
        filters,
        hasSearchQuery,
        hasActiveFilters,
        sortBy,
        view,
        pageNumber,
        pageSize,
        totalPages,
        canGoNext,
        imagesSource,
        completedGenerationCount,
        scrollMode
    })

    if (!session.user?.id) {
        return (
            <div className="container mx-auto max-w-6xl px-4 pt-16 pb-8">
                <div className="mb-8 shrink-0">
                    <h1 className="mb-2 whitespace-nowrap font-bold text-3xl">{libraryTitle}</h1>
                    <p className="text-muted-foreground">Your collection of AI-generated images</p>
                </div>
                <Alert>
                    <AlertDescription>
                        Sign in to view your AI-generated image library.
                    </AlertDescription>
                </Alert>
            </div>
        )
    }

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key="ai-library"
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="h-dvh w-full overflow-y-auto overflow-x-hidden transition-[filter] duration-300"
                ref={galleryRef}
                layoutScroll
            >
                <div className="cubic-bezier(0.16,1,0.3,1) relative flex-1 overflow-hidden">
                    <div
                        className={cn(
                            "relative z-40 flex shrink-0 flex-col bg-background/95 backdrop-blur-xl transition-transform duration-300 ease-out",
                            isMobile ? "gap-4 px-4 pt-16 pb-4" : "sticky top-0 px-6 pt-4 pb-4",
                            !isMobile &&
                                (shouldHideDesktopStickyChrome
                                    ? "-translate-y-full"
                                    : "translate-y-0")
                        )}
                    >
                        {!isMobile && (
                            <div className="mb-3 flex flex-col gap-2">
                                <h1 className="whitespace-nowrap font-bold text-3xl leading-none">
                                    {libraryTitle}
                                </h1>
                                <p className="text-muted-foreground text-sm">
                                    {librarySummaryParts.join(" · ")}
                                </p>
                            </div>
                        )}

                        {isMobile && (
                            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                                <div className="flex items-end gap-6">
                                    <div>
                                        <h1 className="whitespace-nowrap font-bold text-3xl leading-none">
                                            {libraryTitle}
                                        </h1>
                                        <p className="mt-2 text-muted-foreground text-sm">
                                            {librarySummaryParts.join(" · ")}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Tabs
                                        value={view}
                                        onValueChange={(value) =>
                                            handleViewChange(value as LibraryViewMode)
                                        }
                                    >
                                        <TabsList className="h-9">
                                            <TabsTrigger value="active" className="text-xs">
                                                <ImageIcon className="mr-2 hidden h-3.5 w-3.5 sm:block" />
                                                Library
                                            </TabsTrigger>
                                            <TabsTrigger value="archived" className="text-xs">
                                                <Archive className="mr-2 hidden h-3.5 w-3.5 sm:block" />
                                                Archive
                                            </TabsTrigger>
                                        </TabsList>
                                    </Tabs>
                                    <Button
                                        type="button"
                                        variant={privateViewingEnabled ? "secondary" : "outline"}
                                        className="h-9 gap-2"
                                        onClick={togglePrivateViewingEnabled}
                                    >
                                        {privateViewingEnabled ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                        <span className="hidden sm:inline">Private Viewing</span>
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                            <div className="relative w-full lg:w-72 lg:shrink-0">
                                <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    value={draftQuery}
                                    onChange={(event) => setDraftQuery(event.target.value)}
                                    placeholder="Search prompts, styles, subjects, or metadata"
                                    className="h-9 pr-9 pl-9 text-sm"
                                    aria-label="Search library"
                                />
                                {draftQuery.length > 0 && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="-translate-y-1/2 absolute top-1/2 right-1 h-7 w-7 text-muted-foreground hover:bg-transparent"
                                        onClick={() => setDraftQuery("")}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>

                            <div className="flex flex-1 flex-wrap items-center gap-2 lg:min-w-0">
                                {isMobile ? (
                                    <Button
                                        type="button"
                                        variant={
                                            hasActiveFilters ||
                                            hasSearchQuery ||
                                            sortBy !== (hasSearchQuery ? "relevance" : "newest")
                                                ? "secondary"
                                                : "outline"
                                        }
                                        className="h-10 w-full gap-2 sm:w-auto"
                                        onClick={handleOpenFiltersDrawer}
                                    >
                                        <Filter className="h-4 w-4" />
                                        <span>Filters</span>
                                        {activeFilterCount > 0 && (
                                            <span className="ml-1 rounded-md bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary leading-none">
                                                {activeFilterCount}
                                            </span>
                                        )}
                                    </Button>
                                ) : (
                                    <>
                                        <div className="flex flex-1 flex-wrap items-center gap-2">
                                            <MultiSelectFilter
                                                label="Model"
                                                emptyLabel="All models"
                                                selectedValues={filters.modelIds}
                                                options={modelFilterOptions}
                                                onToggleValue={(value) =>
                                                    handleFilterChange("modelIds", value)
                                                }
                                                onClear={() => handleClearFilterGroup("modelIds")}
                                            />
                                            <MultiSelectFilter
                                                label="Resolution"
                                                emptyLabel="All resolutions"
                                                selectedValues={filters.resolutions}
                                                options={resolutionFilterOptions}
                                                onToggleValue={(value) =>
                                                    handleFilterChange("resolutions", value)
                                                }
                                                onClear={() =>
                                                    handleClearFilterGroup("resolutions")
                                                }
                                            />
                                            <MultiSelectFilter
                                                label="Aspect Ratio"
                                                emptyLabel="All aspect ratios"
                                                selectedValues={filters.aspectRatios}
                                                options={aspectRatioFilterOptions}
                                                onToggleValue={(value) =>
                                                    handleFilterChange("aspectRatios", value)
                                                }
                                                onClear={() =>
                                                    handleClearFilterGroup("aspectRatios")
                                                }
                                            />
                                            <MultiSelectFilter
                                                label="Orientation"
                                                emptyLabel="All orientations"
                                                selectedValues={filters.orientations}
                                                options={orientationFilterOptions}
                                                onToggleValue={(value) =>
                                                    handleFilterChange(
                                                        "orientations",
                                                        value as GeneratedImageOrientation
                                                    )
                                                }
                                                onClear={() =>
                                                    handleClearFilterGroup("orientations")
                                                }
                                            />
                                            {hasActiveFilters && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    className="h-9 px-2 text-muted-foreground text-sm hover:text-foreground"
                                                    onClick={handleClearFilters}
                                                >
                                                    Clear filters
                                                </Button>
                                            )}
                                        </div>

                                        <div className="ml-auto flex shrink-0 items-center gap-2 border-border/60 border-l pl-3">
                                            <div className="hidden items-center rounded-md border border-border/60 bg-muted/30 p-0.5 lg:flex">
                                                <ToggleGroup
                                                    type="single"
                                                    value={galleryLayout}
                                                    onValueChange={(v) =>
                                                        v && setGalleryLayout(v as "grid" | "list")
                                                    }
                                                >
                                                    <ToggleGroupItem
                                                        value="grid"
                                                        aria-label="Grid view"
                                                        className="h-7 w-8 rounded-sm px-0"
                                                    >
                                                        <LayoutGrid className="h-4 w-4" />
                                                    </ToggleGroupItem>
                                                    <ToggleGroupItem
                                                        value="list"
                                                        aria-label="List view"
                                                        className="h-7 w-8 rounded-sm px-0"
                                                    >
                                                        <List className="h-4 w-4" />
                                                    </ToggleGroupItem>
                                                </ToggleGroup>
                                            </div>
                                            <div className="hidden items-center rounded-md border border-border/60 bg-muted/30 p-0.5 lg:flex">
                                                <ToggleGroup
                                                    type="single"
                                                    value={scrollMode}
                                                    onValueChange={(v) =>
                                                        v &&
                                                        setScrollMode(v as "paginated" | "infinite")
                                                    }
                                                >
                                                    <ToggleGroupItem
                                                        value="paginated"
                                                        aria-label="Paginated"
                                                        className="h-7 rounded-sm px-2 text-xs"
                                                    >
                                                        Pages
                                                    </ToggleGroupItem>
                                                    <ToggleGroupItem
                                                        value="infinite"
                                                        aria-label="Infinite Scroll"
                                                        className="h-7 rounded-sm px-2 text-xs"
                                                    >
                                                        Scroll
                                                    </ToggleGroupItem>
                                                </ToggleGroup>
                                            </div>
                                            <div className="mx-1 hidden h-4 w-[1px] bg-border/60 lg:block" />
                                            <Select
                                                value={sortBy}
                                                onValueChange={(value) =>
                                                    handleSortChange(value as ImageSortOption)
                                                }
                                            >
                                                <SelectTrigger className="h-9 w-[130px] bg-background text-sm">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {sortOptions.map((option) => (
                                                        <SelectItem
                                                            key={option.value}
                                                            value={option.value}
                                                            className="text-sm"
                                                        >
                                                            {option.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Select
                                                value={String(pageSize)}
                                                disabled={scrollMode === "infinite"}
                                                onValueChange={(value) =>
                                                    handlePageSizeChange(
                                                        Number(value) as LibraryPageSize
                                                    )
                                                }
                                            >
                                                <SelectTrigger className="h-9 w-[70px] bg-background text-sm">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {LIBRARY_PAGE_SIZE_OPTIONS.map((option) => (
                                                        <SelectItem
                                                            key={option}
                                                            value={String(option)}
                                                            className="text-sm"
                                                        >
                                                            {option}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Mobile Filters Drawer */}
                    {isMobile && (
                        <Drawer open={isFiltersDrawerOpen} onOpenChange={setIsFiltersDrawerOpen}>
                            <DrawerContent
                                className="z-[60] flex max-h-[90dvh] flex-col overflow-hidden"
                                overlayClassName="z-[60]"
                            >
                                <DrawerHeader className="shrink-0 text-left">
                                    <DrawerTitle>Filters</DrawerTitle>
                                    <DrawerDescription>
                                        Narrow the library and choose how results are sorted.
                                    </DrawerDescription>
                                </DrawerHeader>

                                <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
                                    <MobileSortFilter
                                        options={sortOptions}
                                        value={draftSortBy}
                                        onChange={setDraftSortBy}
                                    />
                                    <MobileFilterSection title="Results Per Page">
                                        <Select
                                            value={String(draftPageSize)}
                                            onValueChange={(value) =>
                                                setDraftPageSize(Number(value) as LibraryPageSize)
                                            }
                                        >
                                            <SelectTrigger className="w-full bg-background">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="z-[70]">
                                                {LIBRARY_PAGE_SIZE_OPTIONS.map((option) => (
                                                    <SelectItem key={option} value={String(option)}>
                                                        {option} per page
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </MobileFilterSection>
                                    <MobileCheckboxFilter
                                        title="Model"
                                        selectedValues={draftFilters.modelIds}
                                        options={modelFilterOptions}
                                        onToggleValue={(value) =>
                                            handleDraftFilterChange("modelIds", value)
                                        }
                                        onClear={() => handleClearDraftFilterGroup("modelIds")}
                                    />
                                    <MobileCheckboxFilter
                                        title="Resolution"
                                        selectedValues={draftFilters.resolutions}
                                        options={resolutionFilterOptions}
                                        onToggleValue={(value) =>
                                            handleDraftFilterChange("resolutions", value)
                                        }
                                        onClear={() => handleClearDraftFilterGroup("resolutions")}
                                    />
                                    <MobileCheckboxFilter
                                        title="Aspect Ratio"
                                        selectedValues={draftFilters.aspectRatios}
                                        options={aspectRatioFilterOptions}
                                        onToggleValue={(value) =>
                                            handleDraftFilterChange("aspectRatios", value)
                                        }
                                        onClear={() => handleClearDraftFilterGroup("aspectRatios")}
                                    />
                                    <MobileCheckboxFilter
                                        title="Orientation"
                                        selectedValues={draftFilters.orientations}
                                        options={orientationFilterOptions}
                                        onToggleValue={(value) =>
                                            handleDraftFilterChange("orientations", value)
                                        }
                                        onClear={() => handleClearDraftFilterGroup("orientations")}
                                    />
                                </div>

                                <DrawerFooter className="shrink-0 border-t px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                                    <div className="flex items-center justify-between gap-3 text-muted-foreground text-sm">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className="px-0"
                                            onClick={handleResetDraftFilters}
                                        >
                                            Reset all
                                        </Button>
                                        <span className="text-muted-foreground text-sm">
                                            {draftActiveFilterCount > 0
                                                ? `${draftActiveFilterCount} filters selected`
                                                : `${draftPageSize} per page · ${draftSortLabel}`}
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <DrawerClose asChild>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="flex-1"
                                            >
                                                Cancel
                                            </Button>
                                        </DrawerClose>
                                        <Button
                                            type="button"
                                            className="flex-1"
                                            onClick={handleApplyDrawerFilters}
                                        >
                                            Apply
                                        </Button>
                                    </div>
                                </DrawerFooter>
                            </DrawerContent>
                        </Drawer>
                    )}

                    {/* Scrollable Gallery Area */}
                    <div className="px-4 pt-2 pb-4 lg:px-6 lg:pb-6">
                        <div className="relative">
                            <div
                                className={cn(
                                    "min-w-0",
                                    selectedImage && !isMobile && "lg:pr-[504px]"
                                )}
                                onMouseDown={(event) => {
                                    if (
                                        selectedImage &&
                                        !isMobile &&
                                        event.target === event.currentTarget
                                    ) {
                                        handleCloseModal()
                                    }
                                }}
                            >
                                <div>
                                    {!resolvedImagePage ? (
                                        <div
                                            className={
                                                galleryLayout === "list"
                                                    ? "flex flex-col gap-2"
                                                    : "columns-1 gap-4 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6"
                                            }
                                        >
                                            {Array.from({ length: 12 }).map((_, i) => (
                                                <div
                                                    key={i}
                                                    className={cn(
                                                        "mb-4 break-inside-avoid",
                                                        galleryLayout === "list" &&
                                                            "mb-0 h-16 rounded-[var(--radius-lg)] border"
                                                    )}
                                                    style={
                                                        galleryLayout === "grid"
                                                            ? {
                                                                  height: `${Math.random() * 150 + 250}px`
                                                              }
                                                            : undefined
                                                    }
                                                >
                                                    <Skeleton className="h-full w-full rounded-[var(--radius-lg)]" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : images.length === 0 &&
                                      (!showPendingGenerations ||
                                          pendingGenerations.length === 0) ? (
                                        <div className="py-24 text-center">
                                            <ImageIcon className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
                                            <h3 className="mb-2 font-medium text-xl">
                                                {isArchivedView
                                                    ? hasSearchQuery && hasActiveFilters
                                                        ? "No archived images match this search"
                                                        : hasSearchQuery
                                                          ? "No archived images match this search"
                                                          : hasActiveFilters
                                                            ? "No archived images match these filters"
                                                            : "No archived images yet"
                                                    : hasSearchQuery && hasActiveFilters
                                                      ? "No images match this search"
                                                      : hasSearchQuery
                                                        ? "No images match this search"
                                                        : hasActiveFilters
                                                          ? "No images match these filters"
                                                          : "No generated images yet"}
                                            </h3>
                                            <p className="mx-auto max-w-sm text-muted-foreground">
                                                {isArchivedView
                                                    ? "Archived images will appear here until they are restored or deleted."
                                                    : "Generate images using the sidebar to see them appear here."}
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            <ImageMetadataProvider
                                                storageKeys={images.map((img) => img.storageKey)}
                                            >
                                                {galleryLayout === "list" ? (
                                                    <LibraryListTable
                                                        images={images}
                                                        pendingGenerations={pendingGenerations}
                                                        showPendingGenerations={
                                                            showPendingGenerations
                                                        }
                                                        selectedImageIds={selectedImageIds}
                                                        isSelectionMode={isSelectionMode}
                                                        isArchivedView={isArchivedView}
                                                        privateViewingEnabled={
                                                            privateViewingEnabled
                                                        }
                                                        imageOverrides={imageOverrides}
                                                        onToggleSelection={handleToggleSelection}
                                                        onStartSelection={handleStartSelection}
                                                        onImageClick={setSelectedImage}
                                                        onDelete={handleDeleteImage}
                                                        onArchive={handleArchiveImage}
                                                        onRestore={handleRestoreImage}
                                                        onToggleImageHidden={toggleImageVisibility}
                                                        onBulkDelete={handleBulkDelete}
                                                        onBulkArchive={handleBulkArchive}
                                                        onBulkRestore={handleBulkRestore}
                                                        canLoadMore={canGoNext}
                                                        onLoadMore={handleNextPage}
                                                    />
                                                ) : (
                                                    <div className="columns-1 gap-4 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
                                                        <AnimatePresence>
                                                            {showPendingGenerations &&
                                                                pendingGenerations.map(
                                                                    (pending) => (
                                                                        <motion.div
                                                                            key={pending.id}
                                                                            layout
                                                                            initial={{
                                                                                opacity: 0,
                                                                                scale: 0.95
                                                                            }}
                                                                            animate={{
                                                                                opacity: 1,
                                                                                scale: 1
                                                                            }}
                                                                            exit={{
                                                                                opacity: 0,
                                                                                scale: 0.9,
                                                                                filter: "blur(8px)"
                                                                            }}
                                                                            transition={{
                                                                                duration: 0.3,
                                                                                ease: [
                                                                                    0.16, 1, 0.3, 1
                                                                                ]
                                                                            }}
                                                                            className="mb-4 break-inside-avoid"
                                                                        >
                                                                            <PendingImageItem
                                                                                aspectRatio={
                                                                                    pending.aspectRatio
                                                                                }
                                                                            />
                                                                        </motion.div>
                                                                    )
                                                                )}
                                                            {images.map((image) => {
                                                                const isImageHidden =
                                                                    getIsImageHidden({
                                                                        privateViewingEnabled,
                                                                        override:
                                                                            imageOverrides[
                                                                                image._id
                                                                            ]
                                                                    })

                                                                return (
                                                                    <motion.div
                                                                        key={image._id}
                                                                        layout
                                                                        initial={{
                                                                            opacity: 0,
                                                                            scale: 0.95
                                                                        }}
                                                                        animate={{
                                                                            opacity: 1,
                                                                            scale: 1
                                                                        }}
                                                                        exit={{
                                                                            opacity: 0,
                                                                            scale: 0.9,
                                                                            filter: "blur(8px)"
                                                                        }}
                                                                        transition={{
                                                                            duration: 0.3,
                                                                            ease: [0.16, 1, 0.3, 1]
                                                                        }}
                                                                        className="mb-4 break-inside-avoid"
                                                                    >
                                                                        <GeneratedImageItem
                                                                            image={image}
                                                                            placeholder={
                                                                                animatedImageIds.includes(
                                                                                    image._id
                                                                                )
                                                                                    ? "tiles"
                                                                                    : "skeleton"
                                                                            }
                                                                            onClick={() =>
                                                                                setSelectedImage(
                                                                                    image
                                                                                )
                                                                            }
                                                                            onImageSettled={() =>
                                                                                handleImageSettled(
                                                                                    image._id
                                                                                )
                                                                            }
                                                                            isSelected={selectedImageIds.has(
                                                                                image._id
                                                                            )}
                                                                            isSelectionMode={
                                                                                isSelectionMode
                                                                            }
                                                                            onToggleSelection={() =>
                                                                                handleToggleSelection(
                                                                                    image._id
                                                                                )
                                                                            }
                                                                            onStartSelection={() =>
                                                                                handleStartSelection(
                                                                                    image._id
                                                                                )
                                                                            }
                                                                            onDelete={() =>
                                                                                handleDeleteImage(
                                                                                    image._id
                                                                                )
                                                                            }
                                                                            isArchivedView={
                                                                                isArchivedView
                                                                            }
                                                                            onArchive={() =>
                                                                                handleArchiveImage(
                                                                                    image._id
                                                                                )
                                                                            }
                                                                            onRestore={() =>
                                                                                handleRestoreImage(
                                                                                    image._id
                                                                                )
                                                                            }
                                                                            onBulkArchive={
                                                                                handleBulkArchive
                                                                            }
                                                                            onBulkRestore={
                                                                                handleBulkRestore
                                                                            }
                                                                            selectedCount={
                                                                                selectedImageIds.size
                                                                            }
                                                                            onBulkDelete={
                                                                                handleBulkDelete
                                                                            }
                                                                            isImageHidden={
                                                                                isImageHidden
                                                                            }
                                                                            onToggleImageHidden={() =>
                                                                                toggleImageVisibility(
                                                                                    image._id
                                                                                )
                                                                            }
                                                                        />
                                                                    </motion.div>
                                                                )
                                                            })}
                                                        </AnimatePresence>
                                                    </div>
                                                )}
                                            </ImageMetadataProvider>

                                            {scrollMode === "infinite" &&
                                                galleryLayout !== "list" &&
                                                canGoNext && (
                                                    <div
                                                        ref={scrollSentinelRef}
                                                        className="flex justify-center py-8 text-muted-foreground"
                                                    >
                                                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                                    </div>
                                                )}

                                            {isSelectionMode && selectedImageIds.size > 0 && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 16 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: 16 }}
                                                    transition={{
                                                        duration: 0.2,
                                                        ease: [0.16, 1, 0.3, 1]
                                                    }}
                                                    className="sticky bottom-4 z-30 mx-auto flex w-fit items-center gap-3 rounded-[var(--radius-xl)] border bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur-xl"
                                                >
                                                    <span className="font-medium text-sm">
                                                        {selectedImageIds.size} selected
                                                    </span>
                                                    <div className="h-4 w-px bg-border" />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 gap-1.5 text-sm"
                                                        onClick={() => {
                                                            const urls = images
                                                                .filter((img) =>
                                                                    selectedImageIds.has(img._id)
                                                                )
                                                                .map(
                                                                    (img) =>
                                                                        getGeneratedImageDirectUrl(
                                                                            img.storageKey
                                                                        ) ||
                                                                        getGeneratedImageProxyUrl(
                                                                            img.storageKey
                                                                        )
                                                                )
                                                            for (const url of urls) {
                                                                window.open(url, "_blank")
                                                            }
                                                        }}
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                        Save
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 gap-1.5 text-sm"
                                                        onClick={
                                                            isArchivedView
                                                                ? handleBulkRestore
                                                                : handleBulkArchive
                                                        }
                                                    >
                                                        {isArchivedView ? (
                                                            <RotateCcw className="h-3.5 w-3.5" />
                                                        ) : (
                                                            <Archive className="h-3.5 w-3.5" />
                                                        )}
                                                        {isArchivedView ? "Restore" : "Archive"}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 gap-1.5 text-destructive text-sm hover:text-destructive"
                                                        onClick={handleBulkDelete}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                        Delete
                                                    </Button>
                                                    <div className="h-4 w-px bg-border" />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 text-sm"
                                                        onClick={handleClearSelection}
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                        Cancel
                                                    </Button>
                                                </motion.div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {!isMobile && (
                                <div className="absolute inset-y-0 right-0 hidden w-[480px] lg:block">
                                    <ImageDetailsModal
                                        image={selectedImage}
                                        isOpen={!!selectedImage}
                                        onClose={handleCloseModal}
                                        isArchivedView={isArchivedView}
                                        onPrevious={handleSelectPreviousImage}
                                        onNext={handleSelectNextImage}
                                        canNavigatePrevious={canNavigateSelectedImagePrevious}
                                        canNavigateNext={canNavigateSelectedImageNext}
                                        prefetchImageUrls={selectedImagePrefetchUrls}
                                        onDeleteStart={handleHideImageLocally}
                                        onArchiveStart={handleHideImageLocally}
                                        onRestoreStart={handleHideImageLocally}
                                    />
                                </div>
                            )}
                        </div>

                        {scrollMode === "paginated" &&
                            (canGoPrevious ||
                                canGoNext ||
                                (totalPages !== undefined && totalPages > 1)) && (
                                <div className="mt-8 flex items-center justify-center gap-4 border-t pt-6 pb-2">
                                    <Pagination>
                                        <PaginationContent>
                                            <PaginationItem>
                                                <PaginationPrevious
                                                    href="#library-pagination"
                                                    className={
                                                        !canGoPrevious
                                                            ? "pointer-events-none opacity-50"
                                                            : undefined
                                                    }
                                                    onClick={(event) => {
                                                        event.preventDefault()
                                                        handlePreviousPage()
                                                    }}
                                                />
                                            </PaginationItem>
                                            <PaginationItem>
                                                <PaginationLink
                                                    href="#library-pagination"
                                                    isActive
                                                    size="default"
                                                    className="min-w-10"
                                                    onClick={(event) => event.preventDefault()}
                                                >
                                                    {pageNumber}
                                                </PaginationLink>
                                            </PaginationItem>
                                            {totalPages !== undefined && totalPages > 1 && (
                                                <PaginationItem>
                                                    <span
                                                        className="px-2 text-muted-foreground text-sm"
                                                        id="library-pagination"
                                                    >
                                                        of {totalPages}
                                                    </span>
                                                </PaginationItem>
                                            )}
                                            <PaginationItem>
                                                <PaginationNext
                                                    href="#library-pagination"
                                                    className={
                                                        !canGoNext
                                                            ? "pointer-events-none opacity-50"
                                                            : undefined
                                                    }
                                                    onClick={(event) => {
                                                        event.preventDefault()
                                                        handleNextPage()
                                                    }}
                                                />
                                            </PaginationItem>
                                        </PaginationContent>
                                    </Pagination>
                                    <p
                                        id="library-pagination"
                                        className="mt-2 text-center text-muted-foreground text-xs"
                                    >
                                        Showing up to {pageSize} completed images per page
                                    </p>
                                </div>
                            )}
                    </div>
                </div>

                {isMobile && (
                    <ImageDetailsModal
                        image={selectedImage}
                        isOpen={!!selectedImage}
                        onClose={handleCloseModal}
                        isArchivedView={isArchivedView}
                        onPrevious={handleSelectPreviousImage}
                        onNext={handleSelectNextImage}
                        canNavigatePrevious={canNavigateSelectedImagePrevious}
                        canNavigateNext={canNavigateSelectedImageNext}
                        prefetchImageUrls={selectedImagePrefetchUrls}
                        onDeleteStart={handleHideImageLocally}
                        onArchiveStart={handleHideImageLocally}
                        onRestoreStart={handleHideImageLocally}
                    />
                )}
            </motion.div>
        </AnimatePresence>
    )
}
