import { ABILITIES, type AbilityId } from "@/lib/tool-abilities"
import type { Tool } from "ai"
import type { GenericActionCtx } from "convex/server"
import type { Infer } from "convex/values"
import type { DataModel } from "../_generated/dataModel"
import type { UserSettings } from "../schema/settings"
import {
    type ResolvedToolAvailabilityMap,
    resolveToolAvailability,
    sanitizeEnabledTools
} from "./tools/availability"
import { MCPAdapter } from "./tools/mcp_adapter"
import { SupermemoryAdapter } from "./tools/supermemory"
import { WebSearchAdapter } from "./tools/web_search"

export type ToolAdapter = (params: ConditionalToolParams) => Promise<Partial<Record<string, Tool>>>
export const TOOL_ADAPTERS = [WebSearchAdapter, SupermemoryAdapter, MCPAdapter]
export { ABILITIES }
export type { AbilityId }

export type ConditionalToolParams = {
    ctx: GenericActionCtx<DataModel>
    enabledTools: AbilityId[]
    userSettings: Infer<typeof UserSettings>
    toolAvailability: ResolvedToolAvailabilityMap
}

export const getToolkit = async (
    ctx: GenericActionCtx<DataModel>,
    enabledTools: AbilityId[],
    userSettings: Infer<typeof UserSettings>
): Promise<Record<string, Tool>> => {
    const toolAvailability = resolveToolAvailability(userSettings)
    const sanitizedEnabledTools = sanitizeEnabledTools(enabledTools, toolAvailability)
    const toolResults = await Promise.all(
        TOOL_ADAPTERS.map((adapter) =>
            adapter({
                ctx,
                enabledTools: sanitizedEnabledTools,
                userSettings,
                toolAvailability
            })
        )
    )

    const tools: Record<string, Tool> = {}
    for (const toolResult of toolResults) {
        for (const [key, value] of Object.entries(toolResult)) {
            if (value) {
                tools[key] = value
            }
        }
    }

    console.log("tools", Object.keys(tools))
    return tools
}

export { resolveToolAvailability, sanitizeEnabledTools }
export { getDeploymentSearchProviderApiKey } from "./tools/availability"
export type { ResolvedToolAvailabilityMap, ToolFundingSource } from "./tools/availability"
