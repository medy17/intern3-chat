import type { ModelAbility } from "../../schema/settings"

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
    | "2:1"
    | "1:2"
    | "4:5"
    | "5:4"
    | "19.5:9"
    | "9:19.5"
    | "20:9"
    | "9:20"
    | "21:9"
export type BaseResolution = `${number}x${number}`
export type AllAspects = (BaseAspects | `${BaseAspects}-hd`) & {}
export type ImageSize = (AllAspects | BaseResolution) & {}
export type ImageResolution = ("1K" | "2K" | "4K") & {}

export type ReasoningEffortTier = "off" | "low" | "medium" | "high"
export type PrototypeCreditTier = "basic" | "pro"
export type PrototypeAccessPlan = "free" | "pro"
type EffortTierMap<T> = Partial<Record<ReasoningEffortTier, T>>

export type ArtificialAnalysisModelType = "llm" | "text-to-image" | "image-editing"

export type ArtificialAnalysisModelRef = {
    type: ArtificialAnalysisModelType
    id?: string
    slug?: string
}

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
    shortDescription?: string
    description?: string
    developer?: string
    knowledgeCutoff?: string
    addedOn?: string
    artificialAnalysis?: ArtificialAnalysisModelRef
    releaseOrder?: number
    adapters: RegistryKey[]
    abilities: Abilities
    mode?: "text" | "image" | "speech-to-text"
    contextLength?: number
    maxTokens?: number
    maxPerMessage?: number
    supportsReferenceImages?: boolean
    openrouterImageModalities?: Array<"image" | "text">
    supportedImageSizes?: ImageSize[]
    supportedImageResolutions?: ImageResolution[]
    customIcon?: "stability-ai" | "openai" | "bflabs" | "google" | "meta" | "xai"
    supportsDisablingReasoning?: boolean
    reasoningProfiles?: ModelReasoningProfiles
    availableToPickFor?: PrototypeAccessPlan
    availableToPickForReasoningEfforts?: EffortTierMap<PrototypeAccessPlan>
    prototypeCreditTier?: PrototypeCreditTier
    prototypeCreditTierWithReasoning?: PrototypeCreditTier
    legacy?: boolean
}
