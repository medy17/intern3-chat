import {
    SELECTABLE_IMAGE_ASPECT_RATIOS,
    getSelectableImageAspectRatios,
    normalizeExactImageAspectRatio
} from "@/lib/image-aspect-ratios"
import { describe, expect, it } from "vitest"

describe("image-aspect-ratios", () => {
    it("returns all selectable aspect ratios when a model does not declare supported sizes", () => {
        expect(getSelectableImageAspectRatios(undefined)).toEqual([
            ...SELECTABLE_IMAGE_ASPECT_RATIOS
        ])
    })

    it("returns only supported selectable ratios", () => {
        expect(getSelectableImageAspectRatios(["1:1", "3:4", "5:4"])).toEqual(["1:1", "3:4"])
    })

    it("normalizes exact ratios without snapping unsupported sizes to nearby selectable ones", () => {
        expect(normalizeExactImageAspectRatio("1536x1024")).toBe("3:2")
        expect(normalizeExactImageAspectRatio("1024x1536")).toBe("2:3")
        expect(normalizeExactImageAspectRatio("16:9-hd")).toBe("16:9")
    })
})
