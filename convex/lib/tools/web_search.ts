import { tool } from "ai"
import { z } from "zod"
import { internal } from "../../_generated/api"
import type { ToolAdapter } from "../toolkit"
import { SearchProvider, type SearchProviderType } from "./adapters"
import { getDeploymentSearchProviderApiKey } from "./availability"

export const WebSearchAdapter: ToolAdapter = async (params) => {
    if (!params.enabledTools.includes("web_search")) return {}

    const { userSettings, ctx } = params
    const webSearchAvailability = params.toolAvailability.web_search
    if (!webSearchAvailability.enabled) return {}
    const searchProviderId =
        webSearchAvailability.provider ?? (userSettings.searchProvider as SearchProviderType)

    const byokProvider = userSettings.generalProviders?.[searchProviderId]
    let apiKey: string | undefined

    if (
        webSearchAvailability.fundingSource === "byok" &&
        byokProvider?.enabled &&
        byokProvider.encryptedKey
    ) {
        const decryptedKey = await ctx.runQuery(internal.settings.getDecryptedGeneralProviderKey, {
            providerId: searchProviderId,
            userId: userSettings.userId
        })
        if (decryptedKey) {
            apiKey = decryptedKey
        }
    }

    if (!apiKey && webSearchAvailability.fundingSource === "deployment") {
        apiKey = getDeploymentSearchProviderApiKey(searchProviderId)
    }

    if (!apiKey) return {}

    return {
        web_search: tool({
            description:
                "Search the web for information. Optionally scrape content from results for detailed information.",
            inputSchema: z.object({
                query: z.string().describe("The search query"),
                scrapeContent: z
                    .boolean()
                    .describe("Whether to scrape and include content from search results")
            }),
            execute: async ({ query, scrapeContent }) => {
                // Use the user's default setting if scrapeContent is not provided
                const shouldScrapeContent =
                    scrapeContent ?? userSettings.searchIncludeSourcesByDefault
                try {
                    const searchProvider = new SearchProvider({
                        provider: searchProviderId,
                        apiKey
                    })

                    console.log(`Searching for ${query} with provider ${searchProviderId}...`)

                    const results = await searchProvider.search(query, {
                        limit: 5,
                        scrapeContent: shouldScrapeContent,
                        formats: shouldScrapeContent ? ["markdown", "links"] : []
                    })

                    return {
                        success: true,
                        query,
                        results: results.map((result) => ({
                            title: result.title,
                            url: result.url,
                            description: result.description,
                            ...(result.content && { content: result.content }),
                            ...(result.markdown && { markdown: result.markdown })
                        })),
                        count: results.length
                    }
                } catch (error) {
                    console.error("Web search error:", error)
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error occurred",
                        query,
                        results: []
                    }
                }
            }
        })
    }
}
