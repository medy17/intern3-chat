import type { RegistryKey, SharedModel } from "./types"

const openRouterTextAdapters = (modelId: string): RegistryKey[] => [`openrouter:${modelId}`]

export const ZAI_MODELS: SharedModel[] = [
    {
        id: "glm-5.1",
        name: "GLM 5.1",
        shortName: "GLM 5.1",
        releaseOrder: 20260407,
        adapters: openRouterTextAdapters("z-ai/glm-5.1"),
        abilities: ["reasoning", "function_calling", "effort_control"],
        supportsDisablingReasoning: true,
        developer: "Z.ai"
    },
    {
        id: "glm-5v-turbo",
        name: "GLM 5V Turbo",
        shortName: "GLM 5V Turbo",
        releaseOrder: 20260401,
        adapters: openRouterTextAdapters("z-ai/glm-5v-turbo"),
        abilities: ["reasoning", "vision", "function_calling"],
        supportsDisablingReasoning: true,
        developer: "Z.ai"
    },
    {
        id: "glm-5",
        name: "GLM 5",
        shortName: "GLM 5",
        releaseOrder: 20260211,
        adapters: openRouterTextAdapters("z-ai/glm-5"),
        abilities: ["reasoning", "function_calling"],
        supportsDisablingReasoning: true,
        developer: "Z.ai"
    }
]
