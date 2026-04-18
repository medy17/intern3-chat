import type { RegistryKey, SharedModel } from "./types"

const openRouterTextAdapters = (modelId: string): RegistryKey[] => [`openrouter:${modelId}`]

export const DEEPSEEK_MODELS: SharedModel[] = [
    {
        id: "deepseek-v3.2",
        name: "DeepSeek V3.2",
        shortName: "DS V3.2",
        releaseOrder: 20251201,
        adapters: openRouterTextAdapters("deepseek/deepseek-v3.2"),
        abilities: ["reasoning", "function_calling"],
        supportsDisablingReasoning: true,
        developer: "DeepSeek"
    }
]
