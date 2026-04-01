// @vitest-environment jsdom

import {
    LIBRARY_GENERATION_STORE_KEY,
    useGenerationStore
} from "@/components/library/generation-store"
import { beforeEach, describe, expect, it } from "vitest"

describe("library-generation-store", () => {
    beforeEach(() => {
        localStorage.removeItem(LIBRARY_GENERATION_STORE_KEY)
        useGenerationStore.setState({
            pendingGenerations: [],
            completedGenerationCount: 0,
            prompt: "",
            selectedModelIds: [],
            selectedModelCounts: {},
            aspectRatio: "1:1",
            resolution: "1K"
        })
    })

    it("persists library generation preferences", () => {
        useGenerationStore.getState().setPrompt("sunset over the ocean")
        useGenerationStore.getState().setSelectedModelIds(["image-a", "image-b"])
        useGenerationStore.getState().setSelectedModelCounts({ "image-a": 2, "image-b": 1 })
        useGenerationStore.getState().setAspectRatio("16:9")
        useGenerationStore.getState().setResolution("2K")

        expect(useGenerationStore.getState()).toMatchObject({
            prompt: "sunset over the ocean",
            selectedModelIds: ["image-a", "image-b"],
            selectedModelCounts: { "image-a": 2, "image-b": 1 },
            aspectRatio: "16:9",
            resolution: "2K"
        })

        expect(JSON.parse(localStorage.getItem(LIBRARY_GENERATION_STORE_KEY) || "{}")).toEqual({
            state: {
                prompt: "sunset over the ocean",
                selectedModelIds: ["image-a", "image-b"],
                selectedModelCounts: { "image-a": 2, "image-b": 1 },
                aspectRatio: "16:9",
                resolution: "2K"
            },
            version: 0
        })
    })

    it("keeps pending generation state out of persistence", () => {
        useGenerationStore.getState().addPendingGeneration({
            id: "pending-1",
            aspectRatio: "1:1"
        })
        useGenerationStore.getState().removePendingGeneration("pending-1")

        expect(useGenerationStore.getState()).toMatchObject({
            pendingGenerations: [],
            completedGenerationCount: 1
        })

        expect(JSON.parse(localStorage.getItem(LIBRARY_GENERATION_STORE_KEY) || "{}")).toEqual({
            state: {
                prompt: "",
                selectedModelIds: [],
                selectedModelCounts: {},
                aspectRatio: "1:1",
                resolution: "1K"
            },
            version: 0
        })
    })
})
