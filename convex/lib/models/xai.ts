import type { SharedModel } from "./types"

const xaiImageAdapters = (modelId: string): SharedModel["adapters"] => [
    `i3-xai:${modelId}`,
    `xai:${modelId}`
]

export const XAI_MODELS: SharedModel[] = [
    {
        id: "grok-imagine-image-pro",
        name: "Grok Imagine Image Pro",
        shortName: "Imagine Pro",
        artificialAnalysis: {
            type: "text-to-image",
            slug: "grok-imagine-image-pro"
        },
        releaseOrder: 20260402,
        adapters: xaiImageAdapters("grok-imagine-image-pro"),
        abilities: [],
        mode: "image",
        maxPerMessage: 10,
        supportsReferenceImages: true,
        customIcon: "xai",
        supportedImageSizes: [
            "1:1",
            "16:9",
            "9:16",
            "4:3",
            "3:4",
            "3:2",
            "2:3",
            "2:1",
            "1:2",
            "19.5:9",
            "9:19.5",
            "20:9",
            "9:20"
        ],
        supportedImageResolutions: ["1K", "2K"],
        prototypeCreditTier: "pro"
    },
    {
        id: "grok-imagine-image",
        name: "Grok Imagine Image",
        shortName: "Imagine",
        artificialAnalysis: {
            type: "text-to-image",
            slug: "grok-imagine-image"
        },
        releaseOrder: 20260401,
        adapters: xaiImageAdapters("grok-imagine-image"),
        abilities: [],
        mode: "image",
        maxPerMessage: 10,
        supportsReferenceImages: true,
        customIcon: "xai",
        supportedImageSizes: [
            "1:1",
            "16:9",
            "9:16",
            "4:3",
            "3:4",
            "3:2",
            "2:3",
            "2:1",
            "1:2",
            "19.5:9",
            "9:19.5",
            "20:9",
            "9:20"
        ],
        supportedImageResolutions: ["1K", "2K"],
        prototypeCreditTier: "pro"
    },
    {
        id: "grok-4.3",
        name: "Grok 4.3",
        shortName: "Grok 4.3",
        releaseOrder: 20260430,
        adapters: ["i3-xai:grok-4.3", "xai:grok-4.3", "openrouter:x-ai/grok-4.3"],
        abilities: ["reasoning", "vision", "function_calling", "effort_control"],
        contextLength: 1_000_000,
        customIcon: "xai"
    },
    {
        id: "grok-4-1-fast",
        name: "Grok 4.1 Fast",
        shortName: "Grok 4.1",
        releaseOrder: 20260321,
        adapters: [
            "i3-xai:grok-4-1-fast-non-reasoning",
            "i3-xai:grok-4-1-fast-reasoning",
            "xai:grok-4-1-fast-non-reasoning",
            "xai:grok-4-1-fast-reasoning",
            "openrouter:x-ai/grok-4.1-fast"
        ],
        abilities: ["reasoning", "function_calling"],
        supportsDisablingReasoning: true,
        customIcon: "xai"
    },
    {
        id: "grok-4.20-0309",
        name: "Grok 4.20 0309",
        shortName: "Grok 4.20",
        releaseOrder: 20250309,
        adapters: [
            "i3-xai:grok-4.20-0309-non-reasoning",
            "i3-xai:grok-4.20-0309-reasoning",
            "xai:grok-4.20-0309-non-reasoning",
            "xai:grok-4.20-0309-reasoning",
            "openrouter:x-ai/grok-4.20-beta"
        ],
        abilities: ["reasoning", "function_calling"],
        supportsDisablingReasoning: true,
        customIcon: "xai"
    }
]
