import {
    filterAndSortFiles,
    getFilePaginationOffset,
    getUserVisibleFilePrefixes,
    matchesFileTypeFilter
} from "@/../convex/lib/file_listing"
import { describe, expect, it } from "vitest"

describe("file listing", () => {
    it("matches the supported MIME type groups", () => {
        expect(matchesFileTypeFilter("image/png", "image")).toBe(true)
        expect(matchesFileTypeFilter("application/pdf", "pdf")).toBe(true)
        expect(matchesFileTypeFilter("text/markdown", "text")).toBe(true)
        expect(matchesFileTypeFilter("audio/mpeg", "other")).toBe(true)
        expect(matchesFileTypeFilter(undefined, "other")).toBe(true)
        expect(matchesFileTypeFilter("image/png", "pdf")).toBe(false)
    })

    it("filters before sorting the complete result set", () => {
        const files = [
            { key: "old.png", contentType: "image/png", lastModified: "2025-01-01T00:00:00Z" },
            { key: "notes.txt", contentType: "text/plain", lastModified: "2025-03-01T00:00:00Z" },
            { key: "new.png", contentType: "image/png", lastModified: "2025-02-01T00:00:00Z" }
        ]

        expect(filterAndSortFiles(files, "image", "newest").map((file) => file.key)).toEqual([
            "new.png",
            "old.png"
        ])
        expect(filterAndSortFiles(files, "image", "oldest").map((file) => file.key)).toEqual([
            "old.png",
            "new.png"
        ])
    })

    it("only queries user-visible storage prefixes", () => {
        expect(getUserVisibleFilePrefixes("user-1")).toEqual([
            "attachments/user-1/",
            "references/user-1/",
            "generations/user-1/",
            "tts/user-1/",
            "code-artifacts/user-1/",
            "persona-avatars/user-1/",
            "persona-docs/user-1/"
        ])
        expect(getUserVisibleFilePrefixes("user-1")).not.toContain("imports/user-1/")
    })

    it("treats invalid cursors as the first page", () => {
        expect(getFilePaginationOffset(null)).toBe(0)
        expect(getFilePaginationOffset("40")).toBe(40)
        expect(getFilePaginationOffset("not-a-cursor")).toBe(0)
        expect(getFilePaginationOffset("-20")).toBe(0)
    })
})
