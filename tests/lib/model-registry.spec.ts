import { MODELS_SHARED, SHARED_MODELS_VERSION, isChatModel, isModelMode } from "@/convex/lib/models"
import { describe, expect, it } from "vitest"

const textModels = MODELS_SHARED.filter((model) => (model.mode ?? "text") === "text")

describe("text model registry", () => {
    it("excludes image and speech models from chat while accepting legacy text entries", () => {
        expect(isChatModel({})).toBe(true)
        expect(isChatModel({ mode: "text" })).toBe(true)
        for (const mode of ["image", "speech-to-text", "text-to-speech", "unknown"]) {
            expect(isChatModel({ mode })).toBe(false)
        }
        expect(isChatModel({ supportedImageResolutions: ["1K"] })).toBe(false)
        expect(isModelMode("speech-to-text")).toBe(true)
        expect(isModelMode("unknown")).toBe(false)
    })

    it("includes complete model configuration in the cache version", () => {
        expect(JSON.parse(SHARED_MODELS_VERSION)).toEqual(JSON.parse(JSON.stringify(MODELS_SHARED)))
    })
    it("gives every text model a non-empty, unique short name", () => {
        const shortNames = textModels.map((model) => model.shortName?.trim())

        expect(shortNames.every(Boolean)).toBe(true)
        expect(new Set(shortNames).size).toBe(shortNames.length)
    })
})
