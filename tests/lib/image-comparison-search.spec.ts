import { getImageComparisonUrl, validateImageComparisonSearch } from "@/lib/image-comparison-search"
import { describe, expect, it } from "vitest"

const a = "a".repeat(32)
const b = "b".repeat(32)

describe("comparison links", () => {
    it("preserves the selected A/B order across a new tab or reload", () => {
        const url = new URL(getImageComparisonUrl(b, a), "https://silkchat.dev")
        expect(url.pathname).toBe("/compare")
        expect(validateImageComparisonSearch(Object.fromEntries(url.searchParams))).toEqual({
            a: b,
            b: a
        })
    })

    it.each([{}, { a }, { a, b: a }, { a, b: "bad-id" }, { a: [a], b }])(
        "rejects incomplete, duplicate, and malformed pairs: %j",
        (search) => {
            expect(validateImageComparisonSearch(search)).toEqual({})
        }
    )
})
