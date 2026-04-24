import {
    SELECTABLE_IMAGE_ASPECT_RATIOS,
    getCommonSelectableImageAspectRatios,
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

    it("maps legacy OpenAI dimension sizes to the exact selectable ratios they support", () => {
        expect(getSelectableImageAspectRatios(["1024x1024", "1536x1024", "1024x1536"])).toEqual([
            "1:1"
        ])
    })

    it("keeps legacy and current GPT image models compatible on their shared square ratio", () => {
        expect(
            getCommonSelectableImageAspectRatios([
                ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"],
                ["1024x1024", "1536x1024", "1024x1536"]
            ])
        ).toEqual(["1:1"])
    })

    it("normalizes exact ratios without snapping unsupported sizes to nearby selectable ones", () => {
        expect(normalizeExactImageAspectRatio("1536x1024")).toBe("3:2")
        expect(normalizeExactImageAspectRatio("1024x1536")).toBe("2:3")
        expect(normalizeExactImageAspectRatio("16:9-hd")).toBe("16:9")
    })
})
