import { describe, expect, it } from "vitest"
import { buildPrompt } from "../../convex/chat_http/prompt"

describe("buildPrompt", () => {
    it("aligns math delimiter guidance with Streamdown defaults", () => {
        const prompt = buildPrompt({
            enabledTools: []
        })

        expect(prompt).toContain("Inline math: Use double-dollar delimiters like $$L_{0}$$.")
        expect(prompt).toContain("Single-dollar delimiters ($L_{0}$) are forbidden.")
    })

    it("appends saved user customization when present", () => {
        const prompt = buildPrompt({
            enabledTools: [],
            userSettings: {
                userId: "user-1",
                searchProvider: "firecrawl",
                searchIncludeSourcesByDefault: false,
                coreAIProviders: {},
                customAIProviders: {},
                customModels: {},
                titleGenerationModel: "gemini-3.1-flash-lite-preview",
                customThemes: [],
                mcpServers: [],
                generalProviders: {
                    supermemory: undefined,
                    firecrawl: undefined,
                    tavily: undefined,
                    brave: undefined,
                    serper: undefined
                },
                customization: {
                    name: "Ahmed",
                    aiPersonality: "Use paragraph replies.",
                    additionalContext: "I write TypeScript."
                },
                onboardingCompleted: false
            }
        })

        expect(prompt).toContain("## User Personalization")
        expect(prompt).toContain('- Address the user as "Ahmed"')
        expect(prompt).toContain("- Personality traits: Use paragraph replies.")
        expect(prompt).toContain("- Additional context about the user: I write TypeScript.")
    })
})
