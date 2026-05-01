import { describe, expect, it } from "vitest"

import { resolveToolAvailability } from "../../convex/lib/tools/availability"

const createSettings = (overrides: Record<string, unknown> = {}) =>
    ({
        userId: "user-1",
        searchProvider: "firecrawl",
        searchIncludeSourcesByDefault: false,
        customModels: {},
        titleGenerationModel: "model",
        mcpServers: [],
        coreAIProviders: {},
        customAIProviders: {},
        generalProviders: {
            supermemory: undefined,
            firecrawl: undefined,
            tavily: undefined,
            brave: undefined,
            serper: undefined
        },
        ...overrides
    }) as never

describe("tool availability", () => {
    it("keeps web search unavailable when only a non-selected provider has BYOK", () => {
        const result = resolveToolAvailability(
            createSettings({
                searchProvider: "firecrawl",
                generalProviders: {
                    firecrawl: undefined,
                    tavily: {
                        enabled: true,
                        encryptedKey: "encrypted-tavily-key"
                    }
                }
            })
        )

        expect(result.web_search).toEqual({
            enabled: false,
            fundingSource: "none",
            provider: "firecrawl"
        })
    })

    it("prefers the selected search provider when it is configured", () => {
        const result = resolveToolAvailability(
            createSettings({
                searchProvider: "tavily",
                generalProviders: {
                    firecrawl: {
                        enabled: true,
                        encryptedKey: "encrypted-firecrawl-key"
                    },
                    tavily: {
                        enabled: true,
                        encryptedKey: "encrypted-tavily-key"
                    }
                }
            })
        )

        expect(result.web_search).toEqual({
            enabled: true,
            fundingSource: "byok",
            provider: "tavily"
        })
    })
})
