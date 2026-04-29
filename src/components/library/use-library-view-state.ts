import { useDesktopLibraryChromeStore } from "@/components/library/desktop-library-chrome-store"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { getExpandedImageUrl } from "@/lib/generated-image-urls"
import {
    DEFAULT_LIBRARY_FILTERS,
    DEFAULT_LIBRARY_SEARCH,
    type ImageSortOption,
    type LibraryFiltersState,
    type LibraryPageSize,
    type LibrarySearchState,
    type LibraryView as LibraryViewMode,
    cloneLibraryFilters,
    getLibraryFiltersFromSearch
} from "@/lib/library-search"
import type { UseNavigateResult } from "@tanstack/router-core"
import { useAction, useMutation } from "convex/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

const LIBRARY_SEARCH_DEBOUNCE_MS = 400
const LIBRARY_BACKSPACE_DEBOUNCE_MS = 700
const LIBRARY_RAPID_DELETE_DEBOUNCE_MS = 1000
const LIBRARY_MIN_QUERY_LENGTH = 2
const LIBRARY_RAPID_DELETE_WINDOW_MS = 250
const LIBRARY_RAPID_DELETE_DELTA = 2
const LIBRARY_DESKTOP_CHROME_COLLAPSE_SCROLL_TOP = 120
const LIBRARY_DESKTOP_CHROME_EXPAND_SCROLL_TOP = 40

const toggleFilterValue = <T extends string>(values: T[], value: T) =>
    values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]

const countActiveLibraryFilters = (filters: LibraryFiltersState) =>
    filters.modelIds.length +
    filters.resolutions.length +
    filters.aspectRatios.length +
    filters.orientations.length

const areStringArraysEqual = (left: string[], right: string[]) =>
    left.length === right.length && left.every((value, index) => value === right[index])

const areLibraryFiltersEqual = (left: LibraryFiltersState, right: LibraryFiltersState) =>
    areStringArraysEqual(left.modelIds, right.modelIds) &&
    areStringArraysEqual(left.resolutions, right.resolutions) &&
    areStringArraysEqual(left.aspectRatios, right.aspectRatios) &&
    areStringArraysEqual(left.orientations, right.orientations)

const getSortLabel = (sortBy: ImageSortOption) => {
    if (sortBy === "relevance") return "Best match"
    return sortBy === "newest" ? "Newest first" : "Oldest first"
}

export function useLibraryViewState({
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
}: {
    search: LibrarySearchState
    navigate: UseNavigateResult<"/library">
    isMobile: boolean
    galleryRef: React.RefObject<HTMLDivElement | null>
    filters: LibraryFiltersState
    hasSearchQuery: boolean
    hasActiveFilters: boolean
    sortBy: ImageSortOption
    view: LibraryViewMode
    pageNumber: number
    pageSize: LibraryPageSize
    totalPages: number | undefined
    canGoNext: boolean
    imagesSource: Doc<"generatedImages">[]
    completedGenerationCount: number
    scrollMode: "paginated" | "infinite"
}) {
    const isDesktopLibraryChromeCollapsed = useDesktopLibraryChromeStore(
        (state) => state.isCollapsed
    )
    const setIsDesktopLibraryChromeCollapsed = useDesktopLibraryChromeStore(
        (state) => state.setIsCollapsed
    )
    const resetDesktopLibraryChrome = useDesktopLibraryChromeStore((state) => state.reset)

    const searchQuery = search.query
    const previousDraftQueryRef = useRef(search.query)
    const previousDraftQueryChangeAtRef = useRef<number | null>(null)
    const [isFiltersDrawerOpen, setIsFiltersDrawerOpen] = useState(false)
    const [draftQuery, setDraftQuery] = useState(searchQuery)
    const [draftSortBy, setDraftSortBy] = useState<ImageSortOption>(sortBy)
    const [draftPageSize, setDraftPageSize] = useState<LibraryPageSize>(pageSize)
    const [draftFilters, setDraftFilters] = useState<LibraryFiltersState>(() =>
        cloneLibraryFilters(filters)
    )

    const activeFilterCount = useMemo(() => countActiveLibraryFilters(filters), [filters])
    const draftActiveFilterCount = useMemo(
        () => countActiveLibraryFilters(draftFilters),
        [draftFilters]
    )
    const shouldHideDesktopStickyChrome =
        isDesktopLibraryChromeCollapsed && !hasSearchQuery && !hasActiveFilters

    useEffect(() => {
        if (!isMobile) {
            setIsFiltersDrawerOpen(false)
        }
    }, [isMobile])

    useEffect(() => {
        if (isMobile) {
            resetDesktopLibraryChrome()
            return
        }

        const gallery = galleryRef.current
        if (!gallery) return

        let ticking = false

        const updateChromeState = () => {
            const currentScrollTop = gallery.scrollTop

            if (currentScrollTop >= LIBRARY_DESKTOP_CHROME_COLLAPSE_SCROLL_TOP) {
                setIsDesktopLibraryChromeCollapsed(true)
            } else if (currentScrollTop <= LIBRARY_DESKTOP_CHROME_EXPAND_SCROLL_TOP) {
                setIsDesktopLibraryChromeCollapsed(false)
            }

            ticking = false
        }

        const handleScroll = () => {
            if (ticking) return

            ticking = true
            window.requestAnimationFrame(updateChromeState)
        }

        handleScroll()
        gallery.addEventListener("scroll", handleScroll, { passive: true })

        return () => {
            gallery.removeEventListener("scroll", handleScroll)
            resetDesktopLibraryChrome()
        }
    }, [galleryRef, isMobile, resetDesktopLibraryChrome, setIsDesktopLibraryChromeCollapsed])

    useEffect(() => {
        setDraftQuery(searchQuery)
    }, [searchQuery])

    useEffect(() => {
        const normalizedDraftQuery = draftQuery.trim().replace(/\s+/g, " ")
        const eligibleQuery =
            normalizedDraftQuery.length >= LIBRARY_MIN_QUERY_LENGTH ? normalizedDraftQuery : ""
        const now = Date.now()
        const previousDraftQuery = previousDraftQueryRef.current.trim().replace(/\s+/g, " ")
        const previousChangeAt = previousDraftQueryChangeAtRef.current
        const deleteDelta = previousDraftQuery.length - normalizedDraftQuery.length

        previousDraftQueryRef.current = draftQuery
        previousDraftQueryChangeAtRef.current = now

        if (eligibleQuery === searchQuery) {
            return
        }

        const isBackspacing =
            normalizedDraftQuery.length < previousDraftQuery.length &&
            previousDraftQuery.startsWith(normalizedDraftQuery)
        const isRapidDelete =
            deleteDelta >= LIBRARY_RAPID_DELETE_DELTA &&
            previousChangeAt !== null &&
            now - previousChangeAt <= LIBRARY_RAPID_DELETE_WINDOW_MS
        const debounceMs = isRapidDelete
            ? LIBRARY_RAPID_DELETE_DEBOUNCE_MS
            : isBackspacing
              ? LIBRARY_BACKSPACE_DEBOUNCE_MS
              : LIBRARY_SEARCH_DEBOUNCE_MS

        const timeoutId = window.setTimeout(() => {
            navigate({
                replace: true,
                search: (prev) => {
                    const nextQuery = eligibleQuery

                    return {
                        ...prev,
                        query: nextQuery,
                        sort:
                            nextQuery && !prev.query
                                ? "relevance"
                                : !nextQuery && prev.sort === "relevance"
                                  ? DEFAULT_LIBRARY_SEARCH.sort
                                  : prev.sort,
                        page: DEFAULT_LIBRARY_SEARCH.page
                    }
                }
            })
        }, debounceMs)

        return () => {
            window.clearTimeout(timeoutId)
        }
    }, [draftQuery, navigate, searchQuery])

    const [selectedImage, setSelectedImage] = useState<Doc<"generatedImages"> | null>(null)
    const [hiddenImageIds, setHiddenImageIds] = useState<Set<string>>(new Set())
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [selectedImageIds, setSelectedImageIds] = useState<Set<Id<"generatedImages">>>(new Set())
    const [animatedImageIds, setAnimatedImageIds] = useState<string[]>([])
    const [galleryLayout, setGalleryLayout] = useState<"grid" | "list">("grid")
    const scrollSentinelRef = useRef<HTMLDivElement>(null)
    const previousPageImageIdsRef = useRef<string[]>([])
    const previousGenerationCountRef = useRef(0)

    const deleteImageAction = useAction(api.images_node.deleteGeneratedImage)
    const archiveImage = useMutation(api.images.archiveGeneratedImage)
    const restoreImage = useMutation(api.images.restoreGeneratedImage)

    useEffect(() => {
        void view
        setHiddenImageIds(new Set())
        setSelectedImageIds(new Set())
        setIsSelectionMode(false)
        setSelectedImage(null)
    }, [view])

    const images = useMemo(
        () => imagesSource.filter((img) => !hiddenImageIds.has(img._id)),
        [hiddenImageIds, imagesSource]
    )

    const selectedImageIndex = useMemo(
        () => (selectedImage ? images.findIndex((image) => image._id === selectedImage._id) : -1),
        [images, selectedImage]
    )

    const canNavigateSelectedImagePrevious = selectedImageIndex > 0
    const canNavigateSelectedImageNext =
        selectedImageIndex >= 0 && selectedImageIndex < images.length - 1

    const selectedImagePrefetchUrls = useMemo(() => {
        if (selectedImageIndex < 0) {
            return []
        }

        const nearbyIndices = [
            selectedImageIndex - 1,
            selectedImageIndex + 1,
            selectedImageIndex - 2,
            selectedImageIndex + 2
        ].filter((index) => index >= 0 && index < images.length)

        return nearbyIndices.map((index) =>
            getExpandedImageUrl({
                storageKey: images[index].storageKey,
                aspectRatio: images[index].aspectRatio
            })
        )
    }, [images, selectedImageIndex])

    const handleSortChange = useCallback(
        (value: ImageSortOption) => {
            navigate({
                replace: true,
                search: (prev) => ({
                    ...prev,
                    sort: value,
                    page: DEFAULT_LIBRARY_SEARCH.page
                })
            })
        },
        [navigate]
    )

    const handlePageSizeChange = useCallback(
        (value: LibraryPageSize) => {
            navigate({
                replace: true,
                search: (prev) => ({
                    ...prev,
                    pageSize: value,
                    page: DEFAULT_LIBRARY_SEARCH.page
                })
            })
        },
        [navigate]
    )

    const handleViewChange = useCallback(
        (nextView: LibraryViewMode) => {
            if (nextView === view) return

            navigate({
                replace: true,
                search: (prev) => ({
                    ...prev,
                    view: nextView,
                    page: DEFAULT_LIBRARY_SEARCH.page
                })
            })
        },
        [navigate, view]
    )

    const handleFilterChange = useCallback(
        <K extends keyof LibraryFiltersState>(key: K, value: LibraryFiltersState[K][number]) => {
            navigate({
                replace: true,
                search: (prev) => {
                    const nextFilters = getLibraryFiltersFromSearch(prev)
                    nextFilters[key] = toggleFilterValue(
                        nextFilters[key],
                        value
                    ) as LibraryFiltersState[K]

                    return {
                        ...prev,
                        ...nextFilters,
                        page: DEFAULT_LIBRARY_SEARCH.page
                    }
                }
            })
        },
        [navigate]
    )

    const handleClearFilters = useCallback(() => {
        navigate({
            replace: true,
            search: (prev) => ({
                ...prev,
                ...cloneLibraryFilters(DEFAULT_LIBRARY_FILTERS),
                page: DEFAULT_LIBRARY_SEARCH.page
            })
        })
    }, [navigate])

    const handleClearFilterGroup = useCallback(
        <K extends keyof LibraryFiltersState>(key: K) => {
            navigate({
                replace: true,
                search: (prev) => {
                    const nextFilters = getLibraryFiltersFromSearch(prev)
                    nextFilters[key] = []

                    return {
                        ...prev,
                        ...nextFilters,
                        page: DEFAULT_LIBRARY_SEARCH.page
                    }
                }
            })
        },
        [navigate]
    )

    const handleOpenFiltersDrawer = useCallback(() => {
        setDraftSortBy(sortBy)
        setDraftPageSize(pageSize)
        setDraftFilters(cloneLibraryFilters(filters))
        setIsFiltersDrawerOpen(true)
    }, [filters, pageSize, sortBy])

    const handleDraftFilterChange = useCallback(
        <K extends keyof LibraryFiltersState>(key: K, value: string) => {
            setDraftFilters((prev) => ({
                ...prev,
                [key]: toggleFilterValue(prev[key], value)
            }))
        },
        []
    )

    const handleClearDraftFilterGroup = useCallback(
        <K extends keyof LibraryFiltersState>(key: K) => {
            setDraftFilters((prev) => ({
                ...prev,
                [key]: []
            }))
        },
        []
    )

    const handleResetDraftFilters = useCallback(() => {
        setDraftSortBy(hasSearchQuery ? "relevance" : DEFAULT_LIBRARY_SEARCH.sort)
        setDraftPageSize(DEFAULT_LIBRARY_SEARCH.pageSize)
        setDraftFilters(cloneLibraryFilters(DEFAULT_LIBRARY_FILTERS))
    }, [hasSearchQuery])

    const handleApplyDrawerFilters = useCallback(() => {
        const didSortChange = draftSortBy !== sortBy
        const didPageSizeChange = draftPageSize !== pageSize
        const didFiltersChange = !areLibraryFiltersEqual(draftFilters, filters)

        if (didSortChange || didPageSizeChange || didFiltersChange) {
            navigate({
                replace: true,
                search: (prev) => ({
                    ...prev,
                    ...cloneLibraryFilters(draftFilters),
                    pageSize: draftPageSize,
                    sort: draftSortBy,
                    page: DEFAULT_LIBRARY_SEARCH.page
                })
            })
        }

        setIsFiltersDrawerOpen(false)
    }, [draftFilters, draftPageSize, draftSortBy, filters, navigate, pageSize, sortBy])

    const handleNextPage = useCallback(() => {
        if (!canGoNext) return

        navigate({
            search: (prev) => ({
                ...prev,
                page: prev.page + 1
            })
        })
    }, [canGoNext, navigate])

    useEffect(() => {
        if (scrollMode !== "infinite" || !scrollSentinelRef.current || !canGoNext) return

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    handleNextPage()
                }
            },
            { rootMargin: "400px" }
        )

        observer.observe(scrollSentinelRef.current)

        return () => observer.disconnect()
    }, [scrollMode, canGoNext, handleNextPage])

    const handlePreviousPage = useCallback(() => {
        navigate({
            search: (prev) => {
                if (prev.page <= 1) return prev

                return {
                    ...prev,
                    page: prev.page - 1
                }
            }
        })
    }, [navigate])

    useEffect(() => {
        if (totalPages === undefined || pageNumber <= totalPages) return

        navigate({
            replace: true,
            search: (prev) => ({
                ...prev,
                page: totalPages
            })
        })
    }, [navigate, pageNumber, totalPages])

    const scrollResetKey = JSON.stringify(search)

    useEffect(() => {
        void scrollResetKey
        galleryRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    }, [galleryRef, scrollResetKey])

    useEffect(() => {
        const currentImageIds = images.map((image) => image._id)
        const didCompleteGeneration = completedGenerationCount > previousGenerationCountRef.current

        if (didCompleteGeneration && sortBy === "newest" && pageNumber === 1) {
            const previousImageIds = new Set(previousPageImageIdsRef.current)
            const newImageIds = currentImageIds.filter((imageId) => !previousImageIds.has(imageId))

            if (newImageIds.length > 0) {
                setAnimatedImageIds((prev) => [...new Set([...prev, ...newImageIds])])
            }
        }

        previousGenerationCountRef.current = completedGenerationCount
        previousPageImageIdsRef.current = currentImageIds
    }, [completedGenerationCount, images, pageNumber, sortBy])

    const handleImageSettled = useCallback((imageId: Doc<"generatedImages">["_id"]) => {
        setAnimatedImageIds((prev) => prev.filter((id) => id !== imageId))
    }, [])

    const handleStartSelection = useCallback((imageId: Id<"generatedImages">) => {
        setIsSelectionMode(true)
        setSelectedImageIds(new Set([imageId]))
    }, [])

    const handleToggleSelection = useCallback((imageId: Id<"generatedImages">) => {
        setSelectedImageIds((prev) => {
            const next = new Set(prev)
            if (next.has(imageId)) {
                next.delete(imageId)
                if (next.size === 0) setIsSelectionMode(false)
            } else {
                next.add(imageId)
            }
            return next
        })
    }, [])

    const hideImageLocally = useCallback((imageId: Id<"generatedImages">) => {
        setHiddenImageIds((prev) => new Set(prev).add(imageId))
        setSelectedImageIds((prev) => {
            if (!prev.has(imageId)) {
                return prev
            }

            const next = new Set(prev)
            next.delete(imageId)
            if (next.size === 0) {
                setIsSelectionMode(false)
            }
            return next
        })
    }, [])

    const handleDeleteImage = useCallback(
        (imageId: Id<"generatedImages">) => {
            hideImageLocally(imageId)
            deleteImageAction({ id: imageId }).catch(console.error)
        },
        [deleteImageAction, hideImageLocally]
    )

    const handleArchiveImage = useCallback(
        (imageId: Id<"generatedImages">) => {
            hideImageLocally(imageId)
            archiveImage({ id: imageId }).catch(console.error)
        },
        [archiveImage, hideImageLocally]
    )

    const handleRestoreImage = useCallback(
        (imageId: Id<"generatedImages">) => {
            hideImageLocally(imageId)
            restoreImage({ id: imageId }).catch(console.error)
        },
        [hideImageLocally, restoreImage]
    )

    const handleCloseModal = useCallback(() => setSelectedImage(null), [])

    const handleHideImageLocally = useCallback((id: Id<"generatedImages">) => {
        setHiddenImageIds((prev) => new Set(prev).add(id))
    }, [])

    const handleSelectPreviousImage = useCallback(() => {
        if (!canNavigateSelectedImagePrevious) return

        setSelectedImage(images[selectedImageIndex - 1] ?? null)
    }, [canNavigateSelectedImagePrevious, images, selectedImageIndex])

    const handleSelectNextImage = useCallback(() => {
        if (!canNavigateSelectedImageNext) return

        setSelectedImage(images[selectedImageIndex + 1] ?? null)
    }, [canNavigateSelectedImageNext, images, selectedImageIndex])

    const handleBulkDelete = useCallback(() => {
        if (selectedImageIds.size === 0) return

        const idsToDelete = Array.from(selectedImageIds)
        setHiddenImageIds((prev) => {
            const next = new Set(prev)
            idsToDelete.forEach((id) => next.add(id))
            return next
        })
        setSelectedImageIds(new Set())
        setIsSelectionMode(false)

        idsToDelete.forEach((id) => {
            deleteImageAction({ id }).catch(console.error)
        })
    }, [deleteImageAction, selectedImageIds])

    const handleBulkArchive = useCallback(() => {
        if (selectedImageIds.size === 0) return

        const idsToArchive = Array.from(selectedImageIds)
        setHiddenImageIds((prev) => {
            const next = new Set(prev)
            idsToArchive.forEach((id) => next.add(id))
            return next
        })
        setSelectedImageIds(new Set())
        setIsSelectionMode(false)

        idsToArchive.forEach((id) => {
            archiveImage({ id }).catch(console.error)
        })
    }, [archiveImage, selectedImageIds])

    const handleBulkRestore = useCallback(() => {
        if (selectedImageIds.size === 0) return

        const idsToRestore = Array.from(selectedImageIds)
        setHiddenImageIds((prev) => {
            const next = new Set(prev)
            idsToRestore.forEach((id) => next.add(id))
            return next
        })
        setSelectedImageIds(new Set())
        setIsSelectionMode(false)

        idsToRestore.forEach((id) => {
            restoreImage({ id }).catch(console.error)
        })
    }, [restoreImage, selectedImageIds])

    const handleClearSelection = useCallback(() => {
        setSelectedImageIds(new Set())
        setIsSelectionMode(false)
    }, [])

    return {
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
        draftSortLabel: getSortLabel(draftSortBy)
    }
}
