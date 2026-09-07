import { describe, expect, it } from "vitest"
import type { SharedModel } from "@/convex/lib/models"
import type { DisplayModel } from "@/lib/models-providers-shared"
import { buildModelPickerSections } from "@/lib/model-picker-data"

const model = (id: string, overrides: Partial<SharedModel> = {}): SharedModel =>
    ({
        id,
        name: id,
        mode: "text",
        adapters: ["i3-openai:test"],
        abilities: [],
        ...overrides
    }) as SharedModel
const providers: Parameters<typeof buildModelPickerSections>[1] = {
    core: {},
    custom: {
        private: {
            name: "My provider",
            enabled: true,
            encryptedKey: "",
            endpoint: "https://example.com"
        }
    }
}

describe("shared model picker sections", () => {
    it("preserves provider priority, developer grouping, custom labels and model order", () => {
        const models: DisplayModel[] = [
            model("old", { legacy: true, releaseOrder: 99 }),
            model("B", { releaseOrder: 2 }),
            model("A", { releaseOrder: 2 }),
            model("earlier", { releaseOrder: 1 }),
            model("gemini", { adapters: ["i3-google:test"] }),
            model("grok", { adapters: ["i3-xai:test"] }),
            model("developer", { adapters: ["openrouter:test"], developer: "DeepSeek" }),
            model("mixed", { adapters: ["openrouter:test", "i3-anthropic:test"] }),
            {
                id: "custom",
                name: "Custom",
                isCustom: true,
                providerId: "private",
                abilities: []
            } as DisplayModel
        ]
        const original = models.map((m) => m.id)
        const sections = buildModelPickerSections(models, providers, [])
        expect(sections.map((s) => [s.id, s.label])).toEqual([
            ["favorites", "Favorites"],
            ["openai", "OpenAI"],
            ["anthropic", "Anthropic"],
            ["google", "Gemini"],
            ["xai", "xAI"],
            ["openrouter-developer:deepseek", "DeepSeek"],
            ["private", "My provider"]
        ])
        expect(sections[1].models.map((m) => m.id)).toEqual(["A", "B", "earlier", "old"])
        expect(models.map((m) => m.id)).toEqual(original)
    })

    it("keeps favorites newest-first, including legacy models, without bypassing chat filtering", () => {
        const models = [
            model("current"),
            model("legacy", { legacy: true }),
            model("image", { mode: "image" }),
            model("speech", { mode: "text-to-speech" })
        ]
        const sections = buildModelPickerSections(models, providers, [
            "current",
            "missing",
            "image",
            "speech",
            "legacy"
        ])
        expect(sections[0].models.map((m) => m.id)).toEqual(["legacy", "current"])
        expect(sections[1].models.map((m) => m.id)).toEqual(["current", "legacy"])
    })
})
