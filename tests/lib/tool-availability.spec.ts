import { beforeEach, describe, expect, it } from "vitest"

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
    beforeEach(() => {
        Reflect.deleteProperty(process.env, "FIRECRAWL_API_KEY")
        Reflect.deleteProperty(process.env, "BRAVE_API_KEY")
        Reflect.deleteProperty(process.env, "TAVILY_API_KEY")
        Reflect.deleteProperty(process.env, "SERPER_API_KEY")
    })

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

    it("enables web search through the selected deployment provider", () => {
        process.env.BRAVE_API_KEY = "deployment-brave-key"

        const result = resolveToolAvailability(
            createSettings({
                searchProvider: "brave"
            })
        )

        expect(result.web_search).toEqual({
            enabled: true,
            fundingSource: "deployment",
            provider: "brave"
        })
    })

    it("prefers selected provider BYOK over deployment provisioning", () => {
        process.env.TAVILY_API_KEY = "deployment-tavily-key"

        const result = resolveToolAvailability(
            createSettings({
                searchProvider: "tavily",
                generalProviders: {
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

    it("does not use deployment keys from non-selected search providers", () => {
        process.env.SERPER_API_KEY = "deployment-serper-key"

        const result = resolveToolAvailability(
            createSettings({
                searchProvider: "firecrawl"
            })
        )

        expect(result.web_search).toEqual({
            enabled: false,
            fundingSource: "none",
            provider: "firecrawl"
        })
    })

    it("keeps supermemory and mcp user-provisioned only", () => {
        process.env.FIRECRAWL_API_KEY = "deployment-firecrawl-key"

        const result = resolveToolAvailability(
            createSettings({
                generalProviders: {
                    firecrawl: undefined,
                    supermemory: undefined
                },
                mcpServers: []
            })
        )

        expect(result.web_search.fundingSource).toBe("deployment")
        expect(result.supermemory).toEqual({
            enabled: false,
            fundingSource: "none"
        })
        expect(result.mcp).toEqual({
            enabled: false,
            fundingSource: "none"
        })
    })
})
