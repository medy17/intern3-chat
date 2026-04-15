import type { GeneratedImageOrientation } from "@/lib/generated-image-filters"

export type ImageSortOption = "relevance" | "newest" | "oldest"
export type LibraryPageSize = 20 | 30 | 40 | 50

export const LIBRARY_PAGE_SIZE_OPTIONS = [20, 30, 40, 50] as const

export type LibraryFiltersState = {
    modelIds: string[]
    resolutions: string[]
    aspectRatios: string[]
    orientations: GeneratedImageOrientation[]
}

export type LibrarySearchState = LibraryFiltersState & {
    page: number
    pageSize: LibraryPageSize
    query: string
    sort: ImageSortOption
}

export const DEFAULT_LIBRARY_FILTERS: LibraryFiltersState = {
    modelIds: [],
    resolutions: [],
    aspectRatios: [],
    orientations: []
}

export const DEFAULT_LIBRARY_SEARCH: LibrarySearchState = {
    page: 1,
    pageSize: 20,
    query: "",
    sort: "newest",
    ...DEFAULT_LIBRARY_FILTERS
}

const GENERATED_IMAGE_ORIENTATIONS = new Set<GeneratedImageOrientation>([
    "landscape",
    "portrait",
    "square"
])

const GENERATED_IMAGE_SORT_OPTIONS = new Set<ImageSortOption>(["relevance", "newest", "oldest"])

const getFirstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value)

const normalizePositiveInteger = (value: unknown) => {
    const candidate = getFirstValue(value)
    const parsed =
        typeof candidate === "number"
            ? candidate
            : typeof candidate === "string"
              ? Number(candidate)
              : Number.NaN

    if (!Number.isFinite(parsed) || parsed < 1) {
        return DEFAULT_LIBRARY_SEARCH.page
    }

    return Math.floor(parsed)
}

const normalizePageSize = (value: unknown): LibraryPageSize => {
    const candidate = getFirstValue(value)
    const parsed =
        typeof candidate === "number"
            ? candidate
            : typeof candidate === "string"
              ? Number(candidate)
              : Number.NaN

    return LIBRARY_PAGE_SIZE_OPTIONS.includes(parsed as LibraryPageSize)
        ? (parsed as LibraryPageSize)
        : DEFAULT_LIBRARY_SEARCH.pageSize
}

const normalizeStringArray = (value: unknown) => {
    const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : []
    const seen = new Set<string>()

    return values.filter((entry): entry is string => {
        if (typeof entry !== "string" || entry.length === 0 || seen.has(entry)) {
            return false
        }

        seen.add(entry)
        return true
    })
}

const normalizeQuery = (value: unknown) => {
    const candidate = getFirstValue(value)
    return typeof candidate === "string" ? candidate.trim().replace(/\s+/g, " ") : ""
}

const isGeneratedImageOrientation = (value: string): value is GeneratedImageOrientation =>
    GENERATED_IMAGE_ORIENTATIONS.has(value as GeneratedImageOrientation)

export const cloneLibraryFilters = (filters: LibraryFiltersState): LibraryFiltersState => ({
    modelIds: [...filters.modelIds],
    resolutions: [...filters.resolutions],
    aspectRatios: [...filters.aspectRatios],
    orientations: [...filters.orientations]
})

export const getLibraryFiltersFromSearch = (search: LibrarySearchState): LibraryFiltersState =>
    cloneLibraryFilters(search)

export const validateLibrarySearch = (search: Record<string, unknown>): LibrarySearchState => ({
    query: normalizeQuery(search.query),
    page: normalizePositiveInteger(search.page),
    pageSize: normalizePageSize(search.pageSize),
    sort: (() => {
        const query = normalizeQuery(search.query)
        const candidate = getFirstValue(search.sort)

        if (
            typeof candidate === "string" &&
            GENERATED_IMAGE_SORT_OPTIONS.has(candidate as ImageSortOption)
        ) {
            return candidate as ImageSortOption
        }

        return query ? "relevance" : DEFAULT_LIBRARY_SEARCH.sort
    })(),
    modelIds: normalizeStringArray(search.modelIds),
    resolutions: normalizeStringArray(search.resolutions),
    aspectRatios: normalizeStringArray(search.aspectRatios),
    orientations: normalizeStringArray(search.orientations).filter(isGeneratedImageOrientation)
})
