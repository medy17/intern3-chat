import { useGenerationStore } from "@/components/library/generation-store"
import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import { useDiskCachedQuery } from "@/lib/convex-cached-query"
import {
    type GeneratedImageFilters,
    type GeneratedImageOrientation,
    hasActiveGeneratedImageFilters
} from "@/lib/generated-image-filters"
import {
    type ImageSortOption,
    type LibraryFiltersState,
    type LibrarySearchState,
    type LibraryView as LibraryViewMode,
    getLibraryFiltersFromSearch
} from "@/lib/library-search"
import { useSharedModels } from "@/lib/shared-models"
import { useAction } from "convex/react"
import { useEffect, useMemo, useState } from "react"

const ORIENTATION_LABELS: Record<GeneratedImageOrientation, string> = {
    landscape: "Landscape",
    portrait: "Portrait",
    square: "Square"
}

const toGeneratedImageFilters = (filters: LibraryFiltersState): GeneratedImageFilters => ({
    modelIds: filters.modelIds,
    resolutions: filters.resolutions,
    aspectRatios: filters.aspectRatios,
    orientations: filters.orientations
})

const getLibraryCacheScope = ({
    userId,
    pageNumber,
    pageSize,
    query,
    sortBy,
    filters,
    view
}: {
    userId: string
    pageNumber: number
    pageSize: number
    query: string
    sortBy: ImageSortOption
    filters: LibraryFiltersState
    view: LibraryViewMode
}) =>
    JSON.stringify({
        userId,
        pageNumber,
        pageSize,
        query,
        sortBy,
        filters,
        view
    })

const isQueryErrorResult = (value: unknown): value is { error: unknown } =>
    typeof value === "object" && value !== null && "error" in value

const getLibraryViewLabel = (view: LibraryViewMode) => (view === "archived" ? "Archive" : "Library")

const getSortOptions = (
    includeRelevance: boolean
): Array<{ value: ImageSortOption; label: string }> =>
    [
        includeRelevance ? { value: "relevance" as const, label: "Best match" } : null,
        { value: "newest" as const, label: "Newest first" },
        { value: "oldest" as const, label: "Oldest first" }
    ].filter((option): option is { value: ImageSortOption; label: string } => option !== null)

export function useLibraryData({
    search,
    userId,
    scrollMode
}: {
    search: LibrarySearchState
    userId?: string
    scrollMode: "paginated" | "infinite"
}) {
    const { models: sharedModels } = useSharedModels()
    const migrateImages = useAction(api.images_node.migrateUserImages)

    const searchQuery = search.query
    const hasSearchQuery = searchQuery.length > 0
    const sortBy = search.sort
    const view = search.view
    const isArchivedView = view === "archived"
    const sortOptions = useMemo(() => getSortOptions(hasSearchQuery), [hasSearchQuery])
    const pageNumber = search.page
    const pageSize = search.pageSize
    const currentCursor = pageNumber > 1 ? String((pageNumber - 1) * pageSize) : null
    const filters = getLibraryFiltersFromSearch(search)
    const activeFilters = useMemo(() => toGeneratedImageFilters(filters), [filters])
    const hasActiveFilters = useMemo(
        () => hasActiveGeneratedImageFilters(activeFilters),
        [activeFilters]
    )

    const libraryCacheScope = useMemo(
        () =>
            userId
                ? getLibraryCacheScope({
                      userId,
                      pageNumber,
                      pageSize,
                      query: searchQuery,
                      sortBy,
                      filters,
                      view
                  })
                : null,
        [filters, pageNumber, pageSize, searchQuery, sortBy, userId, view]
    )

    const imagePage = useDiskCachedQuery(
        api.images.paginateGeneratedImages,
        {
            key: libraryCacheScope ? `library-page:${libraryCacheScope}` : "library-page:guest",
            default: undefined
        },
        userId
            ? {
                  paginationOpts: { numItems: pageSize, cursor: currentCursor },
                  query: searchQuery,
                  sortBy,
                  filters: activeFilters,
                  view
              }
            : "skip"
    )

    const totalImages = useDiskCachedQuery(
        api.images.getGeneratedImagesCount,
        {
            key: libraryCacheScope ? `library-count:${libraryCacheScope}` : "library-count:guest",
            default: undefined
        },
        userId ? { query: searchQuery, filters: activeFilters, view } : "skip"
    )

    const filterOptions = useDiskCachedQuery(
        api.images.getGeneratedImageFacetOptions,
        {
            key: userId
                ? `library-filter-options:${userId}:${view}`
                : "library-filter-options:guest",
            default: undefined
        },
        userId ? { view } : "skip"
    )

    const { pendingGenerations, completedGenerationCount } = useGenerationStore()
    const [accumulatedImages, setAccumulatedImages] = useState<Doc<"generatedImages">[]>([])

    useEffect(() => {
        if (userId) {
            migrateImages().catch(console.error)
        }
    }, [migrateImages, userId])

    const resolvedImagePage = isQueryErrorResult(imagePage) ? undefined : imagePage
    const resolvedTotalImages = isQueryErrorResult(totalImages) ? undefined : totalImages
    const resolvedFilterOptions = isQueryErrorResult(filterOptions) ? undefined : filterOptions

    useEffect(() => {
        if (!resolvedImagePage) return

        setAccumulatedImages((prev) => {
            if (pageNumber === 1 || scrollMode === "paginated") {
                return resolvedImagePage.page
            }

            const existingIds = new Set(prev.map((img) => img._id))
            const newImages = resolvedImagePage.page.filter((img) => !existingIds.has(img._id))
            if (newImages.length === 0) return prev
            return [...prev, ...newImages]
        })
    }, [pageNumber, resolvedImagePage, scrollMode])

    const imagesSource =
        scrollMode === "infinite" ? accumulatedImages : (resolvedImagePage?.page ?? [])

    const modelNameById = useMemo(
        () => new Map(sharedModels.map((model) => [model.id, model.name])),
        [sharedModels]
    )

    const modelFilterOptions = useMemo(
        () =>
            (resolvedFilterOptions?.modelIds ?? []).map((modelId) => ({
                value: modelId,
                label: modelNameById.get(modelId) ?? modelId
            })),
        [modelNameById, resolvedFilterOptions?.modelIds]
    )

    const resolutionFilterOptions = useMemo(
        () =>
            (resolvedFilterOptions?.resolutions ?? []).map((resolution) => ({
                value: resolution,
                label: resolution
            })),
        [resolvedFilterOptions?.resolutions]
    )

    const aspectRatioFilterOptions = useMemo(
        () =>
            (resolvedFilterOptions?.aspectRatios ?? []).map((aspectRatio) => ({
                value: aspectRatio,
                label: aspectRatio
            })),
        [resolvedFilterOptions?.aspectRatios]
    )

    const orientationFilterOptions = useMemo(
        () =>
            (resolvedFilterOptions?.orientations ?? []).map((orientation) => ({
                value: orientation,
                label: ORIENTATION_LABELS[orientation]
            })),
        [resolvedFilterOptions?.orientations]
    )

    const totalPages =
        resolvedTotalImages === undefined
            ? undefined
            : Math.max(1, Math.ceil(resolvedTotalImages / pageSize))

    const libraryTitle = getLibraryViewLabel(view)
    const librarySummaryParts =
        resolvedTotalImages === undefined
            ? ["Loading..."]
            : [
                  `${resolvedTotalImages} ${isArchivedView ? "archived image" : "image"}${resolvedTotalImages === 1 ? "" : "s"}`,
                  ...(pendingGenerations.length > 0 && !hasActiveFilters && !isArchivedView
                      ? [`${pendingGenerations.length} pending`]
                      : []),
                  ...(totalPages !== undefined && totalPages > 0
                      ? [`Page ${pageNumber} of ${totalPages}`]
                      : [])
              ]

    const canGoPrevious = pageNumber > 1
    const canGoNext = resolvedImagePage ? !resolvedImagePage.isDone : false
    const showPendingGenerations =
        !isArchivedView && pageNumber === 1 && !hasActiveFilters && !hasSearchQuery

    return {
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
    }
}
