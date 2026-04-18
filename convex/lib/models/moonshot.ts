import type { RegistryKey, SharedModel } from "./types"

const openRouterTextAdapters = (modelId: string): RegistryKey[] => [`openrouter:${modelId}`]

export const MOONSHOT_MODELS: SharedModel[] = [
    {
        id: "kimi-k2.5",
        name: "Kimi K2.5",
        shortName: "K2.5",
        releaseOrder: 20260127,
        adapters: openRouterTextAdapters("moonshotai/kimi-k2.5"),
        abilities: ["reasoning", "vision", "function_calling"],
        supportsDisablingReasoning: true,
        developer: "Moonshot AI"
    },
    {
        id: "kimi-k2-0905",
        name: "Kimi K2 0905",
        shortName: "K2 0905",
        releaseOrder: 20250904,
        adapters: openRouterTextAdapters("moonshotai/kimi-k2-0905"),
        abilities: ["function_calling"],
        developer: "Moonshot AI"
    }
]
