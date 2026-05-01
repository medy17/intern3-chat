import type { AbilityId } from "@/lib/tool-abilities"
import type { Infer } from "convex/values"
import type { UserSettings } from "../../schema/settings"
import type { SearchProviderType } from "./adapters"

export type ToolFundingSource = "byok" | "deployment" | "none"

export type ResolvedToolAvailability = {
    enabled: boolean
    fundingSource: ToolFundingSource
    provider?: SearchProviderType
}

export type ResolvedToolAvailabilityMap = Record<AbilityId, ResolvedToolAvailability>

export const getDeploymentSearchProviderApiKey = (provider: SearchProviderType) => {
    switch (provider) {
        case "firecrawl":
            return process.env.FIRECRAWL_API_KEY?.trim()
        case "brave":
            return process.env.BRAVE_API_KEY?.trim()
        case "tavily":
            return process.env.TAVILY_API_KEY?.trim()
        case "serper":
            return process.env.SERPER_API_KEY?.trim()
        default: {
            const exhaustiveCheck: never = provider
            throw new Error(`Unsupported search provider: ${exhaustiveCheck}`)
        }
    }
}

const hasEnabledProviderKey = (provider: { enabled: boolean; encryptedKey: string } | undefined) =>
    provider?.enabled === true && Boolean(provider.encryptedKey)

export const resolveToolAvailability = (
    userSettings: Infer<typeof UserSettings>
): ResolvedToolAvailabilityMap => {
    const searchProvider = (userSettings.searchProvider ?? "firecrawl") as SearchProviderType
    const searchProviderConfig = userSettings.generalProviders?.[searchProvider]
    const hasSearchByok = hasEnabledProviderKey(searchProviderConfig)
    const hasSearchDeployment = Boolean(getDeploymentSearchProviderApiKey(searchProvider))
    const hasSupermemoryByok = hasEnabledProviderKey(userSettings.generalProviders?.supermemory)
    const hasMcpServers = (userSettings.mcpServers ?? []).some((server) => server.enabled !== false)

    return {
        web_search: {
            enabled: hasSearchByok || hasSearchDeployment,
            fundingSource: hasSearchByok ? "byok" : hasSearchDeployment ? "deployment" : "none",
            provider: searchProvider
        },
        supermemory: {
            enabled: hasSupermemoryByok,
            fundingSource: hasSupermemoryByok ? "byok" : "none"
        },
        mcp: {
            enabled: hasMcpServers,
            fundingSource: hasMcpServers ? "byok" : "none"
        }
    }
}

export const sanitizeEnabledTools = (
    enabledTools: AbilityId[],
    availability: ResolvedToolAvailabilityMap
): AbilityId[] => {
    const uniqueTools = Array.from(new Set(enabledTools))
    return uniqueTools.filter((tool) => availability[tool]?.enabled)
}
