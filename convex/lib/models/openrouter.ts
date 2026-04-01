import type { RegistryKey, SharedModel } from "./types"

const openRouterImageAdapters = (modelId: string): RegistryKey[] => [`openrouter:${modelId}`]

const OPENROUTER_IMAGE_SIZES = [
    "1:1",
    "3:2",
    "2:3",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9"
] as const

export const OPENROUTER_MODELS: SharedModel[] = [
    {
        id: "flux-2-flex",
        name: "FLUX 2 Flex",
        shortName: "Flux 2 Flex",
        releaseOrder: 20260331,
        adapters: openRouterImageAdapters("black-forest-labs/flux.2-flex"),
        abilities: [],
        mode: "image",
        maxPerMessage: 2,
        supportsReferenceImages: true,
        openrouterImageModalities: ["image"],
        customIcon: "bflabs",
        supportedImageSizes: [...OPENROUTER_IMAGE_SIZES],
        prototypeCreditTier: "pro"
    },
    {
        id: "seedream-4-5",
        name: "Seedream 4.5",
        shortName: "Seedream 4.5",
        releaseOrder: 20260330,
        adapters: openRouterImageAdapters("bytedance-seed/seedream-4.5"),
        abilities: [],
        mode: "image",
        maxPerMessage: 4,
        supportsReferenceImages: true,
        openrouterImageModalities: ["image"],
        supportedImageSizes: [...OPENROUTER_IMAGE_SIZES],
        supportedImageResolutions: ["1K", "2K", "4K"],
        prototypeCreditTier: "pro"
    }
]
