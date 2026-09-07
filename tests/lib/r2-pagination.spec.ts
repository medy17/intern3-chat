import { iterateMetadataPages, type MetadataPage } from "../../convex/lib/r2_pagination"
import { describe, expect, it } from "vitest"

describe("R2 metadata pagination", () => {
    it("continues through empty pages until the component reports completion", async () => {
        const pages = new Map<string | null, MetadataPage<string>>([
            [null, { page: ["first"], isDone: false, continueCursor: "a" }],
            ["a", { page: [], isDone: false, continueCursor: "b" }],
            ["b", { page: ["last"], isDone: true, continueCursor: "" }]
        ])
        const items: string[] = []
        for await (const page of iterateMetadataPages(async (cursor) => pages.get(cursor)!)) {
            items.push(...page)
        }
        expect(items).toEqual(["first", "last"])
    })

    it("fails a stalled export or cleanup instead of looping forever", async () => {
        const consume = async () => {
            for await (const page of iterateMetadataPages(async () => ({
                page: ["file"],
                isDone: false,
                continueCursor: "same"
            }))) {
                expect(page).toEqual(["file"])
            }
        }
        await expect(consume()).rejects.toThrow("R2 pagination did not advance")
    })

    it("allows read-only listings to return partial results on a stalled cursor", async () => {
        let stalled = false
        const pages: string[][] = []
        for await (const page of iterateMetadataPages(
            async () => ({ page: ["file"], isDone: false, continueCursor: "same" }),
            () => {
                stalled = true
            }
        ))
            pages.push(page)
        expect(stalled).toBe(true)
        expect(pages).toHaveLength(2)
    })
})
