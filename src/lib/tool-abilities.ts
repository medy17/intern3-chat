export const ABILITIES = ["web_search", "supermemory", "mcp"] as const
export type AbilityId = (typeof ABILITIES)[number]
