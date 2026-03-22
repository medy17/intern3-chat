import type { ModelAbility } from "../schema/settings"

export const CoreProviders = ["openai", "anthropic", "google", "xai", "groq", "fal"] as const
export type CoreProvider = (typeof CoreProviders)[number]
export type ModelDefinitionProviders =
    | CoreProvider // user BYOK key
    | `i3-${CoreProvider}` // internal API key
    | "openrouter"

export type RegistryKey = `${ModelDefinitionProviders | string}:${string}`
export type Provider = RegistryKey extends `${infer P}:${string}` ? P : never

export type BaseAspects =
    | "1:1"
    | "16:9"
    | "9:16"
    | "4:3"
    | "3:4"
    | "2:3"
    | "3:2"
    | "4:5"
    | "5:4"
    | "21:9"
export type BaseResolution = `${number}x${number}`
export type AllAspects = (BaseAspects | `${BaseAspects}-hd`) & {}
export type ImageSize = (AllAspects | BaseResolution) & {}
export type ImageResolution = ("1K" | "2K" | "4K") & {}

export type ReasoningEffortTier = "off" | "low" | "medium" | "high"
type EffortTierMap<T> = Partial<Record<ReasoningEffortTier, T>>

export type ModelReasoningProfiles = {
    google?: EffortTierMap<{
        thinkingBudget: number
        includeThoughts?: boolean
    }>
    openai?: EffortTierMap<{
        reasoningEffort: Exclude<ReasoningEffortTier, "off">
        reasoningSummary?: "auto" | "concise" | "detailed"
    }>
    anthropic?: EffortTierMap<{
        budgetTokens: number
    }>
}

export type SharedModel<Abilities extends ModelAbility[] = ModelAbility[]> = {
    id: string
    name: string
    shortName?: string
    releaseOrder?: number
    adapters: RegistryKey[]
    abilities: Abilities
    mode?: "text" | "image" | "speech-to-text"
    contextLength?: number
    maxTokens?: number
    supportedImageSizes?: ImageSize[]
    supportedImageResolutions?: ImageResolution[]
    customIcon?: "stability-ai" | "openai" | "bflabs" | "google" | "meta" | "xai"
    supportsDisablingReasoning?: boolean
    reasoningProfiles?: ModelReasoningProfiles
}

const openAiTextAdapters = (modelId: string): RegistryKey[] => [
    `i3-openai:${modelId}`,
    `openai:${modelId}`,
    `openrouter:openai/${modelId}`
]

const openAiImageAdapters = (modelId: string): RegistryKey[] => [
    `i3-openai:${modelId}`,
    `openai:${modelId}`
]

const googleTextAdapters = (modelId: string): RegistryKey[] => [
    `i3-google:${modelId}`,
    `google:${modelId}`,
    `openrouter:google/${modelId}`
]

const googleImageAdapters = (modelId: string): RegistryKey[] => [
    `i3-google:${modelId}`,
    `google:${modelId}`
]

const anthropicTextAdapters = (modelId: string): RegistryKey[] => [
    `i3-anthropic:${modelId}`,
    `anthropic:${modelId}`,
    `openrouter:anthropic/${modelId}`
]

export const MODELS_SHARED: SharedModel[] = [
    {
        id: "gpt-5.4-nano",
        name: "GPT 5.4 nano",
        shortName: "5.4 nano",
        releaseOrder: 20261022,
        adapters: openAiTextAdapters("gpt-5.4-nano"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gpt-5.4-mini",
        name: "GPT 5.4 mini",
        shortName: "5.4 mini",
        releaseOrder: 20261021,
        adapters: openAiTextAdapters("gpt-5.4-mini"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gpt-5.4",
        name: "GPT 5.4",
        shortName: "5.4",
        releaseOrder: 20261020,
        adapters: openAiTextAdapters("gpt-5.4"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gpt-5.3",
        name: "GPT 5.3",
        shortName: "5.3",
        releaseOrder: 20261019,
        adapters: openAiTextAdapters("gpt-5.3"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gpt-5.2",
        name: "GPT 5.2",
        shortName: "5.2",
        releaseOrder: 20261018,
        adapters: openAiTextAdapters("gpt-5.2"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gpt-5.1",
        name: "GPT 5.1",
        shortName: "5.1",
        releaseOrder: 20261017,
        adapters: openAiTextAdapters("gpt-5.1"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gpt-5-image-mini",
        name: "GPT 5 Image Mini",
        shortName: "5 Image Mini",
        releaseOrder: 20261016,
        adapters: openAiImageAdapters("gpt-5-image-mini"),
        abilities: [],
        mode: "image",
        customIcon: "openai",
        supportedImageSizes: ["1024x1024", "1536x1024", "1024x1536"]
    },
    {
        id: "gpt-5-image",
        name: "GPT 5 Image",
        shortName: "5 Image",
        releaseOrder: 20261015,
        adapters: openAiImageAdapters("gpt-5-image"),
        abilities: [],
        mode: "image",
        customIcon: "openai",
        supportedImageSizes: ["1024x1024", "1536x1024", "1024x1536"]
    },
    {
        id: "gpt-5",
        name: "GPT 5",
        shortName: "5",
        releaseOrder: 20261014,
        adapters: openAiTextAdapters("gpt-5"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gpt-5-mini",
        name: "GPT 5 mini",
        shortName: "5 mini",
        releaseOrder: 20261013,
        adapters: openAiTextAdapters("gpt-5-mini"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gpt-5-nano",
        name: "GPT 5 nano",
        shortName: "5 nano",
        releaseOrder: 20261012,
        adapters: openAiTextAdapters("gpt-5-nano"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "o4-mini-high",
        name: "o4 mini high",
        shortName: "o4 mini high",
        releaseOrder: 20261011,
        adapters: openAiTextAdapters("o4-mini-high"),
        abilities: ["reasoning", "vision", "function_calling", "pdf"]
    },
    {
        id: "o3",
        name: "o3",
        shortName: "o3",
        releaseOrder: 20261010,
        adapters: openAiTextAdapters("o3"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "o4-mini",
        name: "o4 mini",
        shortName: "o4 mini",
        releaseOrder: 20261009,
        adapters: openAiTextAdapters("o4-mini"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gpt-4.1",
        name: "GPT 4.1",
        shortName: "4.1",
        releaseOrder: 20261008,
        adapters: openAiTextAdapters("gpt-4.1"),
        abilities: ["vision", "function_calling", "pdf"]
    },
    {
        id: "gpt-4.1-mini",
        name: "GPT 4.1 mini",
        shortName: "4.1 mini",
        releaseOrder: 20261007,
        adapters: openAiTextAdapters("gpt-4.1-mini"),
        abilities: ["vision", "function_calling", "pdf"]
    },
    {
        id: "gpt-4.1-nano",
        name: "GPT 4.1 nano",
        shortName: "4.1 nano",
        releaseOrder: 20261006,
        adapters: openAiTextAdapters("gpt-4.1-nano"),
        abilities: ["vision", "function_calling", "pdf"]
    },
    {
        id: "gpt-4.5-preview",
        name: "GPT 4.5 Preview",
        shortName: "4.5 Preview",
        releaseOrder: 20261005,
        adapters: openAiTextAdapters("gpt-4.5-preview"),
        abilities: ["vision", "function_calling", "pdf"]
    },
    {
        id: "o3-mini-high",
        name: "o3 mini high",
        shortName: "o3 mini high",
        releaseOrder: 20261004,
        adapters: openAiTextAdapters("o3-mini-high"),
        abilities: ["reasoning", "function_calling"]
    },
    {
        id: "o3-mini",
        name: "o3 mini",
        shortName: "o3 mini",
        releaseOrder: 20261003,
        adapters: openAiTextAdapters("o3-mini"),
        abilities: ["reasoning", "function_calling", "effort_control"]
    },
    {
        id: "gpt-4o",
        name: "GPT 4o",
        shortName: "4o",
        releaseOrder: 20261001,
        adapters: openAiTextAdapters("gpt-4o"),
        abilities: ["vision", "function_calling", "pdf"]
    },
    {
        id: "gpt-4o-mini",
        name: "GPT 4o mini",
        shortName: "4o mini",
        releaseOrder: 20261002,
        adapters: openAiTextAdapters("gpt-4o-mini"),
        abilities: ["vision", "function_calling", "pdf"]
    },
    {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        shortName: "Sonnet 4.6",
        releaseOrder: 20260930,
        adapters: anthropicTextAdapters("claude-sonnet-4.6"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "claude-opus-4.6",
        name: "Claude Opus 4.6",
        shortName: "Opus 4.6",
        releaseOrder: 20260929,
        adapters: anthropicTextAdapters("claude-opus-4.6"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "claude-opus-4.5",
        name: "Claude Opus 4.5",
        shortName: "Opus 4.5",
        releaseOrder: 20260928,
        adapters: anthropicTextAdapters("claude-opus-4.5"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "claude-haiku-4.5",
        name: "Claude Haiku 4.5",
        shortName: "Haiku 4.5",
        releaseOrder: 20260927,
        adapters: anthropicTextAdapters("claude-haiku-4.5"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "claude-sonnet-4.5",
        name: "Claude Sonnet 4.5",
        shortName: "Sonnet 4.5",
        releaseOrder: 20260926,
        adapters: anthropicTextAdapters("claude-sonnet-4.5"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "claude-opus-4.1",
        name: "Claude Opus 4.1",
        shortName: "Opus 4.1",
        releaseOrder: 20260925,
        adapters: anthropicTextAdapters("claude-opus-4.1"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "claude-opus-4",
        name: "Claude Opus 4",
        shortName: "Opus 4",
        releaseOrder: 20260924,
        adapters: anthropicTextAdapters("claude-opus-4"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "claude-sonnet-4",
        name: "Claude Sonnet 4",
        shortName: "Sonnet 4",
        releaseOrder: 20260923,
        adapters: anthropicTextAdapters("claude-sonnet-4"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash Preview",
        shortName: "3 Flash",
        releaseOrder: 20260922,
        adapters: googleTextAdapters("gemini-3-flash-preview"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gemini-3.1-flash-lite-preview",
        name: "Gemini 3.1 Flash Lite Preview",
        shortName: "3.1 Flash Lite",
        releaseOrder: 20260921,
        adapters: googleTextAdapters("gemini-3.1-flash-lite-preview"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro Preview",
        shortName: "3.1 Pro",
        releaseOrder: 20260920,
        adapters: googleTextAdapters("gemini-3.1-pro-preview"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        shortName: "2.5 Flash",
        releaseOrder: 20260919,
        adapters: googleTextAdapters("gemini-2.5-flash"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash Lite",
        shortName: "2.5 Flash Lite",
        releaseOrder: 20260918,
        adapters: googleTextAdapters("gemini-2.5-flash-lite"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        shortName: "2.5 Pro",
        releaseOrder: 20260917,
        adapters: googleTextAdapters("gemini-2.5-pro"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        shortName: "2.0 Flash",
        releaseOrder: 20260916,
        adapters: googleTextAdapters("gemini-2.0-flash"),
        abilities: ["vision", "function_calling", "pdf"]
    },
    {
        id: "gemini-2.0-flash-lite",
        name: "Gemini 2.0 Flash Lite",
        shortName: "2.0 Flash Lite",
        releaseOrder: 20260915,
        adapters: googleTextAdapters("gemini-2.0-flash-lite"),
        abilities: ["vision", "function_calling", "pdf"]
    },
    {
        id: "gemini-3-pro-preview",
        name: "Gemini 3 Pro Preview",
        shortName: "3 Pro",
        releaseOrder: 20260914,
        adapters: googleTextAdapters("gemini-3-pro-preview"),
        abilities: ["reasoning", "vision", "function_calling", "pdf", "effort_control"],
        supportsDisablingReasoning: true
    },
    {
        id: "gemini-2.5-flash-image",
        name: "Gemini 2.5 Flash Image",
        shortName: "2.5 Flash Image",
        releaseOrder: 20260913,
        adapters: googleImageAdapters("gemini-2.5-flash-image"),
        abilities: [],
        mode: "image",
        customIcon: "google",
        supportedImageSizes: ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"],
        supportedImageResolutions: ["1K", "2K", "4K"]
    },
    {
        id: "llama-4-scout-17b-16e-instruct",
        name: "Llama 4 Scout 17B 16E",
        shortName: "Llama 4 Scout 17B",
        releaseOrder: 20250404,
        adapters: [
            "i3-groq:meta-llama/llama-4-scout-17b-16e-instruct",
            "groq:meta-llama/llama-4-scout-17b-16e-instruct"
        ],
        abilities: ["vision"],
        customIcon: "meta"
    },
    {
        id: "grok-4-1-fast-reasoning",
        name: "Grok 4.1 Fast Reasoning",
        shortName: "Grok 4.1 R",
        releaseOrder: 20260321,
        adapters: ["i3-xai:grok-4-1-fast-reasoning", "xai:grok-4-1-fast-reasoning"],
        abilities: ["reasoning", "function_calling"],
        customIcon: "xai"
    },
    {
        id: "grok-4-1-fast-non-reasoning",
        name: "Grok 4.1 Fast",
        shortName: "Grok 4.1",
        releaseOrder: 20260320,
        adapters: ["i3-xai:grok-4-1-fast-non-reasoning", "xai:grok-4-1-fast-non-reasoning"],
        abilities: ["function_calling"],
        customIcon: "xai"
    },
    {
        id: "grok-4.20-0309-reasoning",
        name: "Grok 4.20 0309 Reasoning",
        shortName: "Grok 4.20 R",
        releaseOrder: 20250309,
        adapters: ["i3-xai:grok-4.20-0309-reasoning", "xai:grok-4.20-0309-reasoning"],
        abilities: ["reasoning", "function_calling"],
        customIcon: "xai"
    },
    {
        id: "grok-4.20-0309-non-reasoning",
        name: "Grok 4.20 0309",
        shortName: "Grok 4.20",
        releaseOrder: 20250308,
        adapters: ["i3-xai:grok-4.20-0309-non-reasoning", "xai:grok-4.20-0309-non-reasoning"],
        abilities: ["function_calling"],
        customIcon: "xai"
    },
    {
        id: "llama-4-maverick-17b-128e-instruct",
        name: "Llama 4 Maverick 17B 128E Instruct",
        shortName: "Llama 4 Maverick 17B",
        releaseOrder: 20250405,
        adapters: ["groq:meta-llama/llama-4-maverick-17b-128e-instruct"],
        abilities: ["vision"],
        customIcon: "meta"
    },
    {
        id: "llama-3-1-8b-instant",
        name: "Llama 3.1 8B Instant",
        shortName: "Llama 3.1 8B",
        releaseOrder: 20240723,
        adapters: ["i3-groq:llama-3.1-8b-instant", "groq:llama-3.1-8b-instant"],
        abilities: [],
        customIcon: "meta"
    },
    {
        id: "whisper-large-v3-turbo",
        name: "Whisper Large v3 Turbo",
        releaseOrder: 20240301,
        adapters: ["groq:whisper-large-v3-turbo"],
        abilities: [],
        mode: "speech-to-text"
    }
] as const

export const SHARED_MODELS_VERSION = JSON.stringify(
    MODELS_SHARED.map((model) => [
        model.id,
        model.name,
        model.shortName,
        model.releaseOrder,
        model.adapters,
        model.abilities,
        model.mode,
        model.supportedImageSizes,
        model.supportedImageResolutions,
        model.customIcon,
        model.supportsDisablingReasoning
    ])
)
