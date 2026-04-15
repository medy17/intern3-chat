import {
    DEFAULT_LIBRARY_SEARCH,
    getLibraryFiltersFromSearch,
    validateLibrarySearch
} from "@/lib/library-search"
import { describe, expect, it } from "vitest"

describe("library-search", () => {
    it("returns defaults when search params are missing", () => {
        expect(validateLibrarySearch({})).toEqual(DEFAULT_LIBRARY_SEARCH)
    })

    it("parses page, sort, and array filters from search params", () => {
        expect(
            validateLibrarySearch({
                page: "3",
                query: "  cyberpunk robot  ",
                sort: "oldest",
                modelIds: ["flux-1", "seedream"],
                resolutions: "2K",
                aspectRatios: ["16:9"],
                orientations: ["landscape", "square"]
            })
        ).toEqual({
            page: 3,
            pageSize: 20,
            query: "cyberpunk robot",
            sort: "oldest",
            modelIds: ["flux-1", "seedream"],
            resolutions: ["2K"],
            aspectRatios: ["16:9"],
            orientations: ["landscape", "square"]
        })
    })

    it("defaults search queries to relevance sorting", () => {
        expect(
            validateLibrarySearch({
                query: "anime robot"
            })
        ).toEqual({
            ...DEFAULT_LIBRARY_SEARCH,
            query: "anime robot",
            sort: "relevance"
        })
    })

    it("drops invalid values and clamps the page number", () => {
        expect(
            validateLibrarySearch({
                page: 0,
                sort: "sideways",
                modelIds: ["flux-1", "flux-1", ""],
                orientations: ["portrait", "invalid", "portrait"]
            })
        ).toEqual({
            ...DEFAULT_LIBRARY_SEARCH,
            modelIds: ["flux-1"],
            orientations: ["portrait"]
        })
    })

    it("returns cloned filter arrays for UI state", () => {
        const filters = getLibraryFiltersFromSearch({
            ...DEFAULT_LIBRARY_SEARCH,
            modelIds: ["flux-1"]
        })

        filters.modelIds.push("seedream")

        expect(DEFAULT_LIBRARY_SEARCH.modelIds).toEqual([])
    })
})
