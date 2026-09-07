import { estimateImageCost, getImageCostLevel } from "@/convex/lib/image_generation/cost"
import type { SharedModel } from "@/convex/lib/models"
import { describe, expect, it } from "vitest"

const imageModel = (
    overrides: Partial<Extract<SharedModel, { mode: "image" }>> = {}
): SharedModel => ({
    id: "test-image-model",
    name: "Test image model",
    adapters: [],
    abilities: [],
    mode: "image",
    supportedImageSizes: ["1:1"],
    ...overrides
})

describe("image cost estimates", () => {
    it("multiplies resolution pricing by the requested variants", () => {
        const estimate = estimateImageCost({
            model: imageModel({
                imagePricing: {
                    source: "fal",
                    kind: "fixed",
                    usdPerImageByResolution: { "1K": 0.08, "2K": 0.12, "4K": 0.16 }
                }
            }),
            resolution: "4K",
            variants: 3
        })

        expect(estimate).toMatchObject({ usdPerImage: 0.16, totalUsd: 0.48, variants: 3 })
    })

    it("charges each reference again for every generated variant", () => {
        const estimate = estimateImageCost({
            model: imageModel({
                imagePricing: {
                    source: "fal",
                    kind: "fixed",
                    usdPerImageByResolution: { "1K": 0.05, "2K": 0.07 },
                    usdPerReferenceImage: 0.01
                }
            }),
            resolution: "2K",
            variants: 2,
            referenceCount: 3
        })

        expect(estimate).toMatchObject({ usdPerImage: 0.1, totalUsd: 0.2 })
    })

    it("does not charge for provider-included reference images", () => {
        const estimate = estimateImageCost({
            model: imageModel({
                imagePricing: {
                    source: "fal",
                    kind: "fixed",
                    usdPerImage: 0.0675,
                    usdPerReferenceImage: 0.0045,
                    freeReferenceImages: 1
                }
            }),
            referenceCount: 3
        })

        expect(estimate).toMatchObject({ usdPerImage: 0.0765, totalUsd: 0.0765 })
    })

    it("uses size-specific prices before coarse resolution prices", () => {
        const estimate = estimateImageCost({
            model: imageModel({
                id: "gpt-5-image",
                defaultImageQuality: "high",
                imagePricing: {
                    source: "fal",
                    kind: "fixed",
                    usdPerImageByQualityAndResolution: { high: { "1K": 0.133 } },
                    usdPerImageByQualityAndSize: {
                        high: { "1536x1024": 0.199 }
                    }
                }
            }),
            aspectRatio: "16:9",
            quality: "high"
        })

        expect(estimate).toMatchObject({ usdPerImage: 0.199, totalUsd: 0.199 })
    })

    it("rounds each provider request before multiplying variants", () => {
        const estimate = estimateImageCost({
            model: imageModel({
                imagePricing: {
                    source: "fal",
                    kind: "fixed",
                    usdPerImage: 0.011,
                    roundRequestUsdUpTo: 0.01
                }
            }),
            variants: 2
        })

        expect(estimate).toMatchObject({ usdPerImage: 0.02, totalUsd: 0.04 })
    })

    it("rounds megapixel billing up using the actual output dimensions", () => {
        const estimate = estimateImageCost({
            model: imageModel({
                id: "flux-2-flex",
                imagePricing: {
                    source: "fal",
                    kind: "output_megapixel",
                    usdPerOutputMegapixel: 0.05,
                    minimumBillableOutputMegapixels: 1,
                    roundOutputMegapixelsUp: true
                }
            }),
            aspectRatio: "16:9",
            resolution: "4K"
        })

        expect(estimate).toMatchObject({ usdPerImage: 0.45, totalUsd: 0.45 })
    })

    it("uses logarithmic anchors without arbitrary decimal breakpoints", () => {
        expect(getImageCostLevel(0.98)).toBe(4)
        expect(getImageCostLevel(1.1)).toBe(4)
    })

    it("does not label models whose pricing is unavailable", () => {
        expect(estimateImageCost({ model: imageModel() })).toBeNull()
    })
})
