import type { RegistryKey, SharedModel } from "./types"

const openAiTextAdapters = (modelId: string): RegistryKey[] => [
    `i3-openai:${modelId}`,
    `openai:${modelId}`,
    `openrouter:openai/${modelId}`
]

const openAiImageAdapters = (modelId: string, openRouterModelId = `openai/${modelId}`) =>
    [`openrouter:${openRouterModelId}`] satisfies RegistryKey[]

const openAiDirectImageAdapters = (modelId: string) =>
    [`i3-openai:${modelId}`, `openai:${modelId}`] satisfies RegistryKey[]

const GPT_IMAGE_2_SIZES = [
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "21:9"
] satisfies SharedModel["supportedImageSizes"]

const FREE_ACCESS = {
    availableToPickFor: "free"
} satisfies Pick<SharedModel, "availableToPickFor">

const FREE_WITHOUT_REASONING_ACCESS = {
    availableToPickFor: "free",
    availableToPickForReasoningEfforts: {
        low: "pro",
        medium: "pro",
        high: "pro"
    }
} satisfies Pick<SharedModel, "availableToPickFor" | "availableToPickForReasoningEfforts">

export const OPENAI_MODELS: SharedModel[] = [
    {
        id: "gpt-5.4-nano",
        name: "GPT 5.4 nano",
        shortName: "5.4 nano",
        shortDescription: "Smallest GPT-5.4 variant for fast, low-cost text and tool use",
        description:
            "GPT 5.4 nano is the lightest GPT-5.4 model, tuned for low-latency chat, lightweight automations, and high-volume workloads where speed and cost matter more than deep reasoning depth.",
        developer: "OpenAI",
        artificialAnalysis: {
            type: "llm",
            slug: "gpt-5-4-nano"
        },
        releaseOrder: 20261022,
        adapters: openAiTextAdapters("gpt-5.4-nano"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true,
        ...FREE_WITHOUT_REASONING_ACCESS,
        prototypeCreditTier: "basic"
    },
    {
        id: "gpt-5.4-mini",
        name: "GPT 5.4 mini",
        shortName: "5.4 mini",
        shortDescription: "Balanced GPT-5.4 model for everyday chat, search, and tool use",
        description:
            "GPT 5.4 mini balances quality, speed, and cost for everyday assistant workflows. It is a practical default when you want strong multimodal and tool-calling support without paying for the largest GPT-5.4 tier.",
        developer: "OpenAI",
        artificialAnalysis: {
            type: "llm",
            slug: "gpt-5-4-mini"
        },
        releaseOrder: 20261021,
        adapters: openAiTextAdapters("gpt-5.4-mini"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true,
        ...FREE_WITHOUT_REASONING_ACCESS,
        prototypeCreditTier: "basic"
    },
    {
        id: "gpt-5.4",
        name: "GPT 5.4",
        shortName: "5.4",
        shortDescription: "Fast OpenAI model for everyday chat and tools",
        description:
            "GPT 5.4 is a fast flagship-style OpenAI model aimed at high-quality chat, multimodal input, and tool use. It works well as a strong default when you want broad capability without switching into a more specialized reasoning-first model.",
        developer: "OpenAI",
        artificialAnalysis: {
            type: "llm",
            slug: "gpt-5-4"
        },
        releaseOrder: 20261020,
        adapters: openAiTextAdapters("gpt-5.4"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true,
        ...FREE_WITHOUT_REASONING_ACCESS,
        prototypeCreditTier: "basic",
        prototypeCreditTierWithReasoning: "pro"
    },
    {
        id: "gpt-5.3",
        name: "GPT 5.3",
        shortName: "5.3",
        releaseOrder: 20261019,
        adapters: openAiTextAdapters("gpt-5.3"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true,
        ...FREE_WITHOUT_REASONING_ACCESS,
        prototypeCreditTier: "basic",
        prototypeCreditTierWithReasoning: "pro",
        legacy: true
    },
    {
        id: "gpt-5.2",
        name: "GPT 5.2",
        shortName: "5.2",
        releaseOrder: 20261018,
        adapters: openAiTextAdapters("gpt-5.2"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true,
        ...FREE_WITHOUT_REASONING_ACCESS,
        prototypeCreditTier: "basic",
        prototypeCreditTierWithReasoning: "pro",
        legacy: true
    },
    {
        id: "gpt-5.1",
        name: "GPT 5.1",
        shortName: "5.1",
        releaseOrder: 20261017,
        adapters: openAiTextAdapters("gpt-5.1"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true,
        ...FREE_WITHOUT_REASONING_ACCESS,
        prototypeCreditTier: "basic",
        prototypeCreditTierWithReasoning: "pro",
        legacy: true
    },
    {
        id: "gpt-5.4-image-2",
        name: "GPT 5.4 Image 2",
        shortName: "5.4 Image 2",
        releaseOrder: 20261023,
        // Re-check @ai-sdk/openai before changing this back: 3.0.53 and 4.0.0-beta.38
        // still treat gpt-image-2 as an unknown image model and add invalid response_format.
        adapters: openAiDirectImageAdapters("gpt-image-2"),
        abilities: [],
        mode: "image",
        maxPerMessage: 2,
        customIcon: "openai",
        supportedImageSizes: [...GPT_IMAGE_2_SIZES],
        supportedImageResolutions: ["1K", "2K", "4K"],
        defaultImageQuality: "low",
        prototypeCreditTier: "pro"
    },
    {
        id: "gpt-5-image-mini",
        name: "GPT 5 Image Mini",
        shortName: "5 Image Mini",
        releaseOrder: 20261016,
        adapters: openAiImageAdapters("gpt-5-image-mini", "openai/gpt-5-image-mini"),
        abilities: [],
        mode: "image",
        maxPerMessage: 2,
        openrouterImageModalities: ["image", "text"],
        customIcon: "openai",
        supportedImageSizes: ["1024x1024", "1536x1024", "1024x1536"],
        prototypeCreditTier: "pro",
        legacy: true,
        replacementId: "gpt-5.4-image-2"
    },
    {
        id: "gpt-5-image",
        name: "GPT 5 Image",
        shortName: "5 Image",
        releaseOrder: 20261015,
        adapters: openAiImageAdapters("gpt-5-image", "openai/gpt-5-image"),
        abilities: [],
        mode: "image",
        maxPerMessage: 2,
        openrouterImageModalities: ["image", "text"],
        customIcon: "openai",
        supportedImageSizes: ["1024x1024", "1536x1024", "1024x1536"],
        prototypeCreditTier: "pro",
        legacy: true,
        replacementId: "gpt-5.4-image-2"
    },
    {
        id: "gpt-5",
        name: "GPT 5",
        shortName: "5",
        releaseOrder: 20261014,
        adapters: openAiTextAdapters("gpt-5"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true,
        ...FREE_WITHOUT_REASONING_ACCESS,
        prototypeCreditTier: "basic",
        prototypeCreditTierWithReasoning: "pro",
        legacy: true
    },
    {
        id: "gpt-5-mini",
        name: "GPT 5 mini",
        shortName: "5 mini",
        releaseOrder: 20261013,
        adapters: openAiTextAdapters("gpt-5-mini"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true,
        ...FREE_WITHOUT_REASONING_ACCESS,
        prototypeCreditTier: "basic",
        legacy: true
    },
    {
        id: "gpt-5-nano",
        name: "GPT 5 nano",
        shortName: "5 nano",
        releaseOrder: 20261012,
        adapters: openAiTextAdapters("gpt-5-nano"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true,
        ...FREE_WITHOUT_REASONING_ACCESS,
        prototypeCreditTier: "basic",
        legacy: true
    },
    {
        id: "o4-mini-high",
        name: "o4 mini high",
        shortName: "o4 mini high",
        releaseOrder: 20261011,
        adapters: openAiTextAdapters("o4-mini-high"),
        abilities: ["reasoning", "vision", "function_calling", "pdf"],
        prototypeCreditTier: "pro",
        legacy: true
    },
    {
        id: "o3",
        name: "o3",
        shortName: "o3",
        releaseOrder: 20261010,
        adapters: openAiTextAdapters("o3"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true,
        prototypeCreditTier: "pro",
        legacy: true
    },
    {
        id: "o4-mini",
        name: "o4 mini",
        shortName: "o4 mini",
        releaseOrder: 20261009,
        adapters: openAiTextAdapters("o4-mini"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true,
        prototypeCreditTier: "pro",
        legacy: true
    },
    {
        id: "gpt-4.1",
        name: "GPT 4.1",
        shortName: "4.1",
        releaseOrder: 20261008,
        adapters: openAiTextAdapters("gpt-4.1"),
        abilities: ["vision", "function_calling", "pdf"],
        ...FREE_ACCESS,
        prototypeCreditTier: "basic",
        legacy: true
    },
    {
        id: "gpt-4.1-mini",
        name: "GPT 4.1 mini",
        shortName: "4.1 mini",
        releaseOrder: 20261007,
        adapters: openAiTextAdapters("gpt-4.1-mini"),
        abilities: ["vision", "function_calling", "pdf"],
        ...FREE_ACCESS,
        prototypeCreditTier: "basic",
        legacy: true
    },
    {
        id: "gpt-4.1-nano",
        name: "GPT 4.1 nano",
        shortName: "4.1 nano",
        releaseOrder: 20261006,
        adapters: openAiTextAdapters("gpt-4.1-nano"),
        abilities: ["vision", "function_calling", "pdf"],
        ...FREE_ACCESS,
        prototypeCreditTier: "basic",
        legacy: true
    },
    {
        id: "gpt-4.5-preview",
        name: "GPT 4.5 Preview",
        shortName: "4.5 Preview",
        releaseOrder: 20261005,
        adapters: openAiTextAdapters("gpt-4.5-preview"),
        abilities: ["vision", "function_calling", "pdf"],
        ...FREE_ACCESS,
        prototypeCreditTier: "basic",
        legacy: true
    },
    {
        id: "o3-mini-high",
        name: "o3 mini high",
        shortName: "o3 mini high",
        releaseOrder: 20261004,
        adapters: openAiTextAdapters("o3-mini-high"),
        abilities: ["reasoning", "function_calling"],
        prototypeCreditTier: "pro",
        legacy: true
    },
    {
        id: "o3-mini",
        name: "o3 mini",
        shortName: "o3 mini",
        releaseOrder: 20261003,
        adapters: openAiTextAdapters("o3-mini"),
        abilities: ["reasoning", "function_calling", "effort_control"],
        prototypeCreditTier: "pro",
        legacy: true
    },
    {
        id: "gpt-4o",
        name: "GPT 4o",
        shortName: "4o",
        releaseOrder: 20261001,
        adapters: openAiTextAdapters("gpt-4o"),
        abilities: ["vision", "function_calling", "pdf"],
        ...FREE_ACCESS,
        prototypeCreditTier: "basic",
        legacy: true
    },
    {
        id: "gpt-4o-mini",
        name: "GPT 4o mini",
        shortName: "4o mini",
        releaseOrder: 20261002,
        adapters: openAiTextAdapters("gpt-4o-mini"),
        abilities: ["vision", "function_calling", "pdf"],
        ...FREE_ACCESS,
        prototypeCreditTier: "basic",
        legacy: true
    },
    {
        id: "gpt-image-1.5",
        name: "GPT Image 1.5",
        shortName: "Image 1.5",
        artificialAnalysis: {
            type: "text-to-image",
            slug: "openai-gpt_image-1-5"
        },
        releaseOrder: 20260910,
        adapters: openAiImageAdapters("gpt-image-1.5"),
        abilities: [],
        mode: "image",
        maxPerMessage: 2,
        customIcon: "openai",
        supportedImageSizes: ["1024x1024", "1536x1024", "1024x1536"],
        prototypeCreditTier: "pro",
        legacy: true,
        replacementId: "gpt-5.4-image-2"
    }
]
