import type { ModelAbility } from "../../schema/settings"

export const CoreProviders = [
    "openai",
    "anthropic",
    "google",
    "xai",
    "groq",
    "fal",
    "gateway"
] as const
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
export type ImageQuality = ("low" | "medium" | "high" | "auto") & {}
export type TranscriptionAudioFormat = "wav" | "mp3" | "ogg" | "flac" | "webm" | "m4a" | "aac"

export type TranscriptionConfig = {
    preferredFormat: TranscriptionAudioFormat
    acceptedFormats: TranscriptionAudioFormat[]
}

export type SpeechAudioFormat = "pcm" | "mp3"
export type SpeechPricing =
    | { inputUsdPer1MCharacters: number; inputUsdPer1MUtf8Bytes?: never }
    | { inputUsdPer1MUtf8Bytes: number; inputUsdPer1MCharacters?: never }

export type SpeechConfig = SpeechPricing & {
    // Omit to use the provider default when there is no fixed voice catalog.
    voice?: string
    // Managed shortlist for developer auditions, not a user preference.
    auditionVoices?: string[]
    preferredFormat: SpeechAudioFormat
    pcm: { sampleRate: number; channels: 1; bitsPerSample: 16 }
    maxInputCharacters: number
}

export type ImagePricing = {
    source: "fal"
    kind: "fixed" | "output_megapixel"
    usdPerImage?: number
    usdPerImageByResolution?: Partial<Record<ImageResolution, number>>
    usdPerImageByQualityAndResolution?: Partial<
        Record<ImageQuality, Partial<Record<ImageResolution, number>>>
    >
    usdPerImageByQualityAndSize?: Partial<Record<ImageQuality, Partial<Record<ImageSize, number>>>>
    usdPerOutputMegapixel?: number
    minimumBillableOutputMegapixels?: number
    roundOutputMegapixelsUp?: boolean
    usdPerReferenceImage?: number
    usdPerReferenceImageByQuality?: Partial<Record<ImageQuality, number>>
    freeReferenceImages?: number
    /** Provider request totals are rounded up to this USD increment. */
    roundRequestUsdUpTo?: number
}

export type ReasoningEffortTier = "off" | "minimal" | "low" | "medium" | "high"
export type PrototypeAccessPlan = "free" | "pro"
export type ModelRequiredRole = "admin"
type EffortTierMap<T> = Partial<Record<ReasoningEffortTier, T>>
type GoogleThinkingLevel = Exclude<ReasoningEffortTier, "off">
type StandardReasoningEffortTier = Exclude<ReasoningEffortTier, "off" | "minimal">

export type ArtificialAnalysisModelType = "llm" | "text-to-image" | "image-editing"

export type ArtificialAnalysisModelRef = {
    type: ArtificialAnalysisModelType
    id?: string
    slug?: string
}

export type ModelReasoningProfiles = {
    google?: EffortTierMap<{
        thinkingBudget?: number
        thinkingLevel?: GoogleThinkingLevel
        includeThoughts?: boolean
    }>
    openai?: Partial<
        Record<
            StandardReasoningEffortTier,
            {
                reasoningEffort: StandardReasoningEffortTier
                reasoningSummary?: "auto" | "concise" | "detailed"
            }
        >
    >
    anthropic?: Partial<
        Record<
            StandardReasoningEffortTier,
            {
                budgetTokens: number
            }
        >
    >
}

type SharedModelFields<Abilities extends ModelAbility[] = ModelAbility[]> = {
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
    contextLength?: number
    maxTokens?: number
    inputUsdPer1MTokens?: number
    outputUsdPer1MTokens?: number
    hostedContextLength?: number
    maxPerMessage?: number
    supportsReferenceImages?: boolean
    maxReferenceImages?: number
    openrouterImageModalities?: Array<"image" | "text">
    openrouterProvider?: string
    supportedImageSizes?: ImageSize[]
    supportedImageResolutions?: ImageResolution[]
    defaultImageQuality?: ImageQuality
    imagePricing?: ImagePricing
    customIcon?: "stability-ai" | "openai" | "bflabs" | "google" | "meta" | "xai"
    supportsDisablingReasoning?: boolean
    reasoningEfforts?: ReasoningEffortTier[]
    defaultReasoningEffort?: ReasoningEffortTier
    reasoningProfiles?: ModelReasoningProfiles
    availableToPickFor?: PrototypeAccessPlan
    availableToPickForReasoningEfforts?: EffortTierMap<PrototypeAccessPlan>
    requiredRole?: ModelRequiredRole
    legacy?: boolean
    sunsetOn?: string
    replacementId?: string
}

export const MODEL_MODES = ["text", "image", "speech-to-text", "text-to-speech"] as const
export type ModelMode = (typeof MODEL_MODES)[number]

export const isModelMode = (value: unknown): value is ModelMode =>
    typeof value === "string" && MODEL_MODES.some((mode) => mode === value)

export const isChatModel = (model: {
    mode?: string
    supportedImageResolutions?: readonly string[]
}) =>
    (model.mode === undefined || model.mode === "text") && !model.supportedImageResolutions?.length

type ModelModeFields =
    | { mode?: "text"; transcription?: never; speech?: never; imagePricing?: never }
    | { mode: "image"; supportedImageSizes: ImageSize[]; transcription?: never; speech?: never }
    | {
          mode: "speech-to-text"
          transcription: TranscriptionConfig
          speech?: never
          imagePricing?: never
      }
    | { mode: "text-to-speech"; speech: SpeechConfig; transcription?: never; imagePricing?: never }

export type SharedModel<Abilities extends ModelAbility[] = ModelAbility[]> =
    SharedModelFields<Abilities> & ModelModeFields
