import {
    BraveIcon,
    ClaudeIcon,
    FalAIIcon,
    GeminiIcon,
    GroqIcon,
    OpenAIIcon,
    OpenRouterIcon,
    ReasoningHighIcon,
    ReasoningLowIcon,
    ReasoningMediumIcon,
    SerperDevIcon,
    TavilyIcon,
    VercelIcon,
    XAIIcon
} from "@/components/brand-icons"
import type { CoreProvider, SharedModel } from "@/convex/lib/models"
import { isModelSunset, resolveModelReplacement } from "@/convex/lib/models/lifecycle"
import type { GoogleAuthMode, ModelAbility, UserSettings } from "@/convex/schema/settings"
import { optionalBrowserEnv } from "@/lib/browser-env"
import type { ReasoningEffort } from "@/lib/model-store"
import { useSharedModels } from "@/lib/shared-models"
import type { Infer } from "convex/values"
import { Brain, Code, Eye, File, Key, Zap } from "lucide-react"

export type DisplayModel =
    | SharedModel
    | {
          id: string
          name: string
          abilities: ModelAbility[]
          isCustom: true
          providerId: string
          mode?: "text" | "image"
      }

export type CoreProviderInfo = {
    id: CoreProvider | "openrouter"
    name: string
    description: string
    placeholder: string
    icon: React.ComponentType<{ className?: string }> | string
    hidden?: boolean
    authModes?: {
        value: GoogleAuthMode
        label: string
        placeholder: string
        description: string
    }[]
}

export const CORE_PROVIDERS: CoreProviderInfo[] = [
    {
        id: "openrouter",
        name: "OpenRouter",
        description: "Access a wide variety of models through OpenRouter",
        placeholder: "sk-or-...",
        icon: OpenRouterIcon
    },
    {
        id: "gateway",
        name: "AI Gateway",
        description: "Access vendor models through Vercel AI Gateway",
        placeholder: "vercel_ai_...",
        icon: VercelIcon
    },
    {
        id: "openai",
        name: "OpenAI",
        description: "Access GPT-4, GPT-4o, o3, and other OpenAI models",
        placeholder: "sk-...",
        icon: OpenAIIcon
    },
    {
        id: "anthropic",
        name: "Anthropic",
        description: "Access Claude Sonnet, Opus, and other Anthropic models",
        placeholder: "sk-ant-...",
        icon: ClaudeIcon
    },
    {
        id: "google",
        name: "Google",
        description: "Access Gemini models with either AI Studio keys or Vertex credentials",
        placeholder: "AIza...",
        icon: GeminiIcon,
        authModes: [
            {
                value: "ai-studio",
                label: "AI Studio",
                placeholder: "AIza...",
                description: "Use a Google AI Studio API key"
            },
            {
                value: "vertex",
                label: "Vertex AI",
                placeholder: '{"type":"service_account",...}',
                description: "Use a Google Cloud service account JSON key"
            }
        ]
    },
    {
        id: "xai",
        name: "xAI",
        description: "Access Grok models through xAI",
        placeholder: "xai-...",
        icon: XAIIcon
    },
    {
        id: "groq",
        name: "Groq",
        description: "Access Llama, Speech-to-text, and other models with ultra-fast inference",
        placeholder: "gsk_...",
        icon: GroqIcon,
        hidden: true
    },
    {
        id: "fal",
        name: "Fal AI",
        description: "Access open-souce image generation models",
        placeholder: "key_secret:key_id",
        icon: FalAIIcon,
        hidden: true
    }
]

const LEGACY_DIRECT_INFERENCE_PROVIDER_IDS = new Set<CoreProvider>([
    "openai",
    "anthropic",
    "google",
    "xai",
    "groq",
    "fal"
])

export const legacyDirectInferenceProvidersEnabled =
    optionalBrowserEnv("VITE_ENABLE_LEGACY_DIRECT_INFERENCE_PROVIDERS") === "true"

export const isLegacyDirectInferenceProvider = (providerId: string) =>
    LEGACY_DIRECT_INFERENCE_PROVIDER_IDS.has(providerId as CoreProvider)

export const shouldShowCoreInferenceProvider = (provider: CoreProviderInfo) =>
    provider.id === "openrouter" ||
    provider.id === "gateway" ||
    (legacyDirectInferenceProvidersEnabled && !provider.hidden)

const HIDDEN_PROVIDER_IDS = new Set(["groq", "fal", "i3-groq", "i3-fal"])
const enabledProviderEntries = new Set(
    (
        optionalBrowserEnv("VITE_ENABLED_INTERNAL_PROVIDERS") ||
        ["openai", "anthropic", "google", "xai", "groq", "fal", "gateway"].join(",")
    )
        .split(",")
        .map((provider) => provider.trim())
        .filter(Boolean)
        .map((provider) => provider.toLowerCase())
)
const enabledInternalProviders = new Set<CoreProvider>(
    [...enabledProviderEntries].filter((provider) =>
        ["openai", "anthropic", "google", "xai", "groq", "fal", "gateway"].includes(provider)
    ) as CoreProvider[]
)

const getOpenRouterModelSlug = (adapter: string) => {
    if (!adapter.startsWith("openrouter:")) return undefined
    return adapter.slice("openrouter:".length).split(":")[0]
}

const slugifyProviderToken = (value: string) =>
    value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")

const compactProviderToken = (value: string) => value.replace(/[^a-z0-9]+/g, "")

const getOpenRouterVisibilityAliases = (model: SharedModel) => {
    const aliases = new Set<string>()

    for (const adapter of model.adapters ?? []) {
        const slug = getOpenRouterModelSlug(adapter)
        if (!slug) continue

        const vendor = slug.split("/")[0]
        if (!vendor) continue

        const vendorSlug = slugifyProviderToken(vendor)
        const vendorCompact = compactProviderToken(vendor)
        if (vendorSlug) aliases.add(vendorSlug)
        if (vendorCompact) aliases.add(vendorCompact)

        if (vendorSlug.endsWith("-ai")) {
            aliases.add(vendorSlug.slice(0, -3))
        }
        if (vendorCompact.endsWith("ai")) {
            aliases.add(vendorCompact.slice(0, -2))
        }
    }

    const developer = model.developer?.trim()
    if (developer) {
        const developerSlug = slugifyProviderToken(developer)
        const developerCompact = compactProviderToken(developer.toLowerCase())
        if (developerSlug) aliases.add(developerSlug)
        if (developerCompact) aliases.add(developerCompact)

        if (developerSlug.endsWith("-ai")) {
            aliases.add(developerSlug.slice(0, -3))
        }
        if (developerCompact.endsWith("ai")) {
            aliases.add(developerCompact.slice(0, -2))
        }
    }

    aliases.delete("")
    return [...aliases]
}

export const isOpenRouterOnlySharedModel = (model: SharedModel) => {
    const adapters = model.adapters ?? []
    return adapters.length > 0 && adapters.every((adapter) => adapter.startsWith("openrouter:"))
}

export const isOpenRouterModelEnabledInBrowser = (
    model: SharedModel,
    enabledEntries: ReadonlySet<string> = enabledProviderEntries
) => {
    if (!isOpenRouterOnlySharedModel(model)) return true
    if (enabledEntries.has("openrouter")) return true

    return getOpenRouterVisibilityAliases(model).some((alias) =>
        enabledEntries.has(`openrouter-${alias}`)
    )
}

export const hasBuiltInOpenRouterProvider = (
    model: SharedModel,
    enabledEntries: ReadonlySet<string> = enabledProviderEntries
) => isOpenRouterOnlySharedModel(model) && isOpenRouterModelEnabledInBrowser(model, enabledEntries)

export const isInternalProviderEnabled = (providerId: string) => {
    if (!providerId.startsWith("i3-")) return false

    const coreProvider = providerId.slice(3) as CoreProvider
    return !HIDDEN_PROVIDER_IDS.has(providerId) && enabledInternalProviders.has(coreProvider)
}

export const getDefaultModelId = (sharedModels: SharedModel[]) => {
    const activeModels = sharedModels.filter((model) => !isModelSunset(model))
    const hasInternalProvider = (model: SharedModel) =>
        model.adapters.some((adapter) => isInternalProviderEnabled(adapter.split(":")[0]))

    const preferredResolution = resolveModelReplacement("gemini-3-flash-preview", sharedModels, {
        isCandidateAllowed: (model) => !isModelSunset(model) && hasInternalProvider(model)
    })

    return (
        preferredResolution.resolvedId ??
        activeModels.find((model) => hasInternalProvider(model))?.id ??
        activeModels.find((model) =>
            model.adapters.some((adapter) => !HIDDEN_PROVIDER_IDS.has(adapter.split(":")[0]))
        )?.id
    )
}

export const useDefaultModelId = () => {
    const { models } = useSharedModels()
    return getDefaultModelId(models)
}

export const isImageGenerationCapableModel = (model: DisplayModel) => {
    if (model.mode === "image") return true
    if (!("supportedImageResolutions" in model)) return false
    return (model.supportedImageResolutions?.length ?? 0) > 0
}

const buildFallbackModelDescription = (model: DisplayModel) => {
    if (isImageGenerationCapableModel(model)) {
        return "Image generation"
    }

    if (model.mode === "speech-to-text") {
        return "Speech to text"
    }

    const abilityLabels = model.abilities
        .filter((ability) => ability !== "effort_control")
        .slice(0, 3)
        .map((ability) => getAbilityLabel(ability))

    return abilityLabels.length > 0 ? abilityLabels.join(" • ") : "General purpose chat"
}

export const getModelShortDescription = (model: DisplayModel) => {
    if ("shortDescription" in model && typeof model.shortDescription === "string") {
        const description = model.shortDescription.trim()
        if (description) return description
    }

    return buildFallbackModelDescription(model)
}

export const getModelDescription = (model: DisplayModel) => {
    if ("description" in model && typeof model.description === "string") {
        const description = model.description.trim()
        if (description) return description
    }

    return getModelShortDescription(model)
}

export const getPrototypeCreditTierForModel = (
    model: DisplayModel,
    reasoningEffort: ReasoningEffort = "off"
): "basic" | "pro" => {
    if ("isCustom" in model && model.isCustom) {
        return "basic"
    }

    const sharedModel = model as SharedModel

    if (reasoningEffort !== "off" && sharedModel.prototypeCreditTierWithReasoning) {
        return sharedModel.prototypeCreditTierWithReasoning
    }

    return (
        sharedModel.prototypeCreditTier ?? (isImageGenerationCapableModel(model) ? "pro" : "basic")
    )
}

export const getRequiredPlanToPickModel = (
    model: DisplayModel,
    reasoningEffort: ReasoningEffort = "off"
): "free" | "pro" => {
    if ("isCustom" in model && model.isCustom) {
        return "pro"
    }

    const sharedModel = model as SharedModel
    const basePlan = sharedModel.availableToPickFor ?? "pro"
    return sharedModel.availableToPickForReasoningEfforts?.[reasoningEffort] ?? basePlan
}

export const getAllowedReasoningEffortsForModel = (
    model: SharedModel | null | undefined
): ReasoningEffort[] => {
    if (!model?.abilities.includes("reasoning")) return []

    if (model.abilities.includes("effort_control")) {
        return model.supportsDisablingReasoning
            ? ["off", "low", "medium", "high"]
            : ["low", "medium", "high"]
    }

    if (model.supportsDisablingReasoning) {
        return ["off", "medium"]
    }

    return ["medium"]
}

export const getSelectableReasoningEffortsForPlan = (
    model: SharedModel | null | undefined,
    creditPlan: "free" | "pro" | null | undefined
): ReasoningEffort[] => {
    const allowedEfforts = getAllowedReasoningEffortsForModel(model)

    if (creditPlan !== "free" || !model) {
        return allowedEfforts
    }

    return allowedEfforts.filter((effort) => getRequiredPlanToPickModel(model, effort) === "free")
}

export const getReasoningEffortForPlan = (
    model: SharedModel | null | undefined,
    reasoningEffort: ReasoningEffort,
    creditPlan: "free" | "pro" | null | undefined
): ReasoningEffort | null => {
    const selectableEfforts = getSelectableReasoningEffortsForPlan(model, creditPlan)

    if (selectableEfforts.includes(reasoningEffort)) {
        return reasoningEffort
    }

    const effortRank: Record<ReasoningEffort, number> = {
        off: 0,
        low: 1,
        medium: 2,
        high: 3
    }
    const requestedRank = effortRank[reasoningEffort]
    const nearestLowerEffort = selectableEfforts
        .filter((effort) => effortRank[effort] <= requestedRank)
        .sort((left, right) => effortRank[right] - effortRank[left])[0]

    return nearestLowerEffort ?? selectableEfforts[0] ?? null
}

export const getReasoningEffortLabelForModel = (
    model: SharedModel | null | undefined,
    effort: ReasoningEffort
) => {
    if (effort === "off") {
        return "Instant"
    }

    const allowedEfforts = getAllowedReasoningEffortsForModel(model)
    const isToggleOnlyReasoningModel =
        allowedEfforts.length === 2 && allowedEfforts[0] === "off" && allowedEfforts[1] === "medium"
    const isAlwaysOnReasoningModel = allowedEfforts.length === 1 && allowedEfforts[0] === "medium"

    if (isToggleOnlyReasoningModel) {
        return "Thinking"
    }

    if (isAlwaysOnReasoningModel) {
        return "Thinking"
    }

    return effort.charAt(0).toUpperCase() + effort.slice(1)
}

export const getReasoningEffortIcon = (effort: ReasoningEffort) => {
    switch (effort) {
        case "off":
            return Zap
        case "low":
            return ReasoningLowIcon
        case "medium":
            return ReasoningMediumIcon
        case "high":
            return ReasoningHighIcon
    }
}

export type SearchProviderInfo = {
    id: "firecrawl" | "brave" | "tavily" | "serper"
    name: string
    description: string
    placeholder: string
    icon: React.ComponentType<{ className?: string }> | string
}

export const SEARCH_PROVIDERS: SearchProviderInfo[] = [
    {
        id: "firecrawl",
        name: "Firecrawl",
        description: "Advanced web scraping with content extraction and markdown support",
        placeholder: "fc-...",
        icon: "🔥"
    },
    {
        id: "brave",
        name: "Brave Search",
        description: "Fast, privacy-focused search results from Brave's independent index",
        placeholder: "BSA...",
        icon: BraveIcon
    },
    {
        id: "tavily",
        name: "Tavily",
        description: "AI-powered search with advanced content chunking and source analysis",
        placeholder: "tvly-...",
        icon: TavilyIcon
    },
    {
        id: "serper",
        name: "Serper",
        description: "Google-powered search with smart content scraping and context management",
        placeholder: "...",
        icon: SerperDevIcon
    }
]

export function useAvailableModels(userSettings: Infer<typeof UserSettings> | undefined) {
    const { models: sharedModels } = useSharedModels()
    const currentProviders = {
        core: userSettings?.coreAIProviders || {},
        custom: userSettings?.customAIProviders || {}
    }

    const availableModels: DisplayModel[] = []
    const unavailableModels: DisplayModel[] = []

    // Add shared models
    sharedModels
        .filter(
            (model) =>
                !isModelSunset(model) &&
                isOpenRouterModelEnabledInBrowser(model) &&
                model.adapters.some((adapter) => !HIDDEN_PROVIDER_IDS.has(adapter.split(":")[0]))
        )
        .forEach((model) => {
            const hasInternalProvider = model.adapters.some((adapter) => {
                const providerId = adapter.split(":")[0]
                return providerId.startsWith("i3-") && isInternalProviderEnabled(providerId)
            })
            const hasInternalOpenRouterProvider = hasBuiltInOpenRouterProvider(model)

            const hasOpenRouterProvider = model.adapters.some((adapter) => {
                const providerId = adapter.split(":")[0]
                return (
                    providerId === "openrouter" &&
                    currentProviders.core.openrouter?.enabled &&
                    isOpenRouterModelEnabledInBrowser(model)
                )
            })

            const hasLegacyDirectProvider =
                legacyDirectInferenceProvidersEnabled &&
                model.adapters.some((adapter) => {
                    const providerId = adapter.split(":")[0]
                    if (HIDDEN_PROVIDER_IDS.has(providerId)) return false
                    if (providerId.startsWith("i3-") || providerId === "openrouter") return false
                    return currentProviders.core[providerId as CoreProvider]?.enabled
                })

            const hasProvider =
                hasInternalProvider ||
                hasInternalOpenRouterProvider ||
                hasOpenRouterProvider ||
                hasLegacyDirectProvider

            if (hasProvider) {
                availableModels.push(model)
            } else {
                unavailableModels.push(model)
            }
        })

    // Add custom models
    Object.entries(userSettings?.customModels || {}).forEach(([id, customModel]) => {
        if (!customModel.enabled) return

        const hasProvider =
            currentProviders.core[customModel.providerId]?.enabled ||
            currentProviders.custom[customModel.providerId]?.enabled

        const modelData = {
            id,
            name: customModel.name || customModel.modelId,
            abilities: customModel.abilities,
            isCustom: true as const,
            providerId: customModel.providerId
        }

        if (hasProvider) {
            availableModels.push(modelData)
        } else {
            unavailableModels.push(modelData)
        }
    })

    return { availableModels, unavailableModels, currentProviders }
}

export const getAbilityIcon = (ability: ModelAbility) => {
    switch (ability) {
        case "vision":
            return Eye
        case "reasoning":
            return Brain
        case "function_calling":
            return Code
        case "pdf":
            return File
        default:
            return Key
    }
}

export const getAbilityLabel = (ability: ModelAbility) => {
    switch (ability) {
        case "function_calling":
            return "Function Calling"
        case "vision":
            return "Vision"
        case "reasoning":
            return "Reasoning"
        case "pdf":
            return "PDF"
        default:
            return ability
    }
}

export const getProviderDisplayName = (
    providerId: string,
    currentProviders: {
        core: Record<string, { enabled: boolean; encryptedKey: string; authMode?: GoogleAuthMode }>
        custom: Record<
            string,
            { name: string; enabled: boolean; endpoint: string; encryptedKey: string }
        >
    }
) => {
    // Check if it's a core provider
    const coreProvider = CORE_PROVIDERS.find((p) => p.id === providerId)
    if (coreProvider) {
        if (providerId === "google") {
            const authMode = currentProviders.core.google?.authMode
            if (authMode === "vertex") {
                return "Google Vertex"
            }
            if (authMode === "ai-studio") {
                return "Google AI Studio"
            }
        }
        return coreProvider.name
    }

    // Check if it's a custom provider
    const customProvider = currentProviders.custom[providerId]
    if (customProvider) {
        return customProvider.name
    }

    return providerId
}

export type CustomModelFormData = {
    name: string
    modelId: string
    providerId: string
    contextLength: number
    maxTokens: number
    abilities: ModelAbility[]
    enabled: boolean
}
