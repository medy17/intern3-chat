import { buildGeneratedImageSearchText } from "@/lib/generated-image-search"
import { describe, expect, it } from "vitest"

describe("generated-image-search", () => {
    it("builds searchable text from prompt and metadata", () => {
        expect(
            buildGeneratedImageSearchText({
                prompt: "  anime robot girl  ",
                modelId: "flux-1",
                aspectRatio: "9:16",
                resolution: "2K"
            })
        ).toBe("anime robot girl | flux-1 | 2K | 9:16 | portrait")
    })

    it("deduplicates overlapping aspect ratio aliases", () => {
        expect(
            buildGeneratedImageSearchText({
                prompt: "cinematic 16:9 frame",
                aspectRatio: "16:9"
            })
        ).toBe("cinematic 16:9 frame | 16:9 | landscape")
    })

    it("returns undefined when there is no searchable content", () => {
        expect(buildGeneratedImageSearchText({})).toBeUndefined()
    })
})
