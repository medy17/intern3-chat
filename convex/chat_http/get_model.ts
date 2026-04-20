"use node"

import { ChatError } from "@/lib/errors"
import { type OpenAIProvider, createOpenAI } from "@ai-sdk/openai"
import type { ImageModelV3, LanguageModelV3 } from "@ai-sdk/provider"
import type { OpenRouterProvider } from "@openrouter/ai-sdk-provider"
import { internal } from "../_generated/api"
import type { ActionCtx } from "../_generated/server"
import { getUserIdentity } from "../lib/identity"
import { type CoreProvider, CoreProviders, MODELS_SHARED } from "../lib/models"
import { createGoogleOpenAICompatibleProvider, createProvider } from "../lib/provider_factory"

const getInternalOpenRouterApiKey = () => process.env.OPENROUTER_API_KEY?.trim()
const getRegistryProviderId = (adapter: string) => adapter.slice(0, adapter.indexOf(":"))
const getRegistryModelId = (adapter: string) => adapter.slice(adapter.indexOf(":") + 1)

const getOpenRouterModelId = (modelId: string) =>
    getRegistryModelId(
        MODELS_SHARED.find((entry) => entry.id === modelId)?.adapters.find((adapter) =>
            adapter.startsWith("openrouter:")
        ) ?? ""
    ) || undefined

const getOpenAIImageModel = (providerSpecificModelId: string, apiKey: string): ImageModelV3 =>
    createOpenAI({
        apiKey
    }).imageModel(providerSpecificModelId)

const getGoogleImageModel = async (
    providerSpecificModelId: string,
    apiKey: string | "internal",
    googleAuthMode?: "ai-studio" | "vertex"
) => {
    const sdkProvider = await createProvider("google", apiKey, {
        googleAuthMode,
        modelId: providerSpecificModelId
    })

    if (sdkProvider.imageModel) {
        return sdkProvider.imageModel(providerSpecificModelId)
    }

    const googleImageProvider = createGoogleOpenAICompatibleProvider(apiKey, {
        googleAuthMode
    })
    return googleImageProvider.imageModel(providerSpecificModelId)
}

export const getModel = async (
    ctx: ActionCtx,
    modelId: string,
    options?: {
        internalOnly?: boolean
        reasoningEffort?: "off" | "low" | "medium" | "high"
    }
) => {
    const user = await getUserIdentity(ctx.auth, { allowAnons: false })
    if ("error" in user) throw new ChatError("unauthorized:chat")

    const registry = await ctx.runQuery(internal.settings.getUserRegistryInternal, {
        userId: user.id
    })

    if (!(modelId in registry.models)) return new ChatError("bad_model:api")

    const model = registry.models[modelId]
    if (!model) return new ChatError("bad_model:api")
    if (!model.adapters.length) return new ChatError("bad_model:api", "No adapters found for model")

    const adaptersToConsider = options?.internalOnly
        ? model.adapters.filter((adapter) => adapter.startsWith("i3-"))
        : model.adapters

    if (!adaptersToConsider.length) {
        return new ChatError("bad_model:api", "No internal adapters found for model")
    }

    const isCustomModel = Boolean(model.customProviderId)
    const prefersReasoningVariant = (options?.reasoningEffort ?? "medium") !== "off"

    // Priority sorting:
    // - built-in shared models: OpenRouter BYOK > built-in internal > legacy direct BYOK
    // - custom models: keep provider-native ordering
    const sortedAdapters = adaptersToConsider.sort((a, b) => {
        const providerA = getRegistryProviderId(a)
        const providerB = getRegistryProviderId(b)
        const modelA = getRegistryModelId(a)
        const modelB = getRegistryModelId(b)

        const getPriority = (provider: string) => {
            if (!isCustomModel) {
                if (provider === "openrouter") return 1
                if (provider.startsWith("i3-")) return 2
                if (CoreProviders.includes(provider as CoreProvider)) return 3
                return 4
            }

            if (CoreProviders.includes(provider as CoreProvider)) return 1
            if (provider.startsWith("i3-")) return 2
            if (provider === "openrouter") return 3
            return 4
        }

        const getXaiVariantPriority = (provider: string, providerModelId: string) => {
            if (provider !== "xai" && provider !== "i3-xai") return 0
            if (providerModelId.endsWith("-non-reasoning")) return prefersReasoningVariant ? 2 : 0
            if (providerModelId.endsWith("-reasoning")) return prefersReasoningVariant ? 0 : 2
            return 1
        }

        const providerPriorityDiff = getPriority(providerA) - getPriority(providerB)
        if (providerPriorityDiff !== 0) return providerPriorityDiff

        return getXaiVariantPriority(providerA, modelA) - getXaiVariantPriority(providerB, modelB)
    })

    console.log("[getModel] model", model, "sortedAdapters", sortedAdapters)
    let finalModel: LanguageModelV3 | ImageModelV3 | undefined = undefined
    let providerSource: "internal" | "byok" | "openrouter" | "custom" | "unknown" = "unknown"
    let runtimeProvider: CoreProvider | "openrouter" | "custom" | "unknown" = "unknown"
    let runtimeApiKey: string | undefined = undefined

    for (const adapter of sortedAdapters) {
        const providerIdRaw = model.customProviderId ?? getRegistryProviderId(adapter)
        const providerSpecificModelId = model.customProviderId
            ? model.id
            : getRegistryModelId(adapter)
        if (providerIdRaw.startsWith("i3-")) {
            const providerId = providerIdRaw.slice(3) as CoreProvider
            //last check that this model actually is in MODELS_SHARED
            if (
                !MODELS_SHARED.some((m) =>
                    m.adapters.some((a) => a === `i3-${providerId}:${providerSpecificModelId}`)
                )
            ) {
                console.error(`Model ${providerSpecificModelId} not found in internal modelset`)
                continue
            }

            const internalOpenRouterApiKey = getInternalOpenRouterApiKey()
            const openRouterModelId = internalOpenRouterApiKey
                ? getOpenRouterModelId(model.id)
                : undefined

            if (openRouterModelId) {
                const openRouterProvider = (await createProvider(
                    "openrouter",
                    "internal"
                )) as unknown as OpenRouterProvider
                finalModel =
                    model.mode === "image"
                        ? openRouterProvider.imageModel(openRouterModelId)
                        : openRouterProvider.chat(openRouterModelId)
                providerSource = "internal"
                runtimeProvider = "openrouter"
                break
            }

            const sdk_provider = await createProvider(providerId, "internal", {
                modelId: providerSpecificModelId
            })

            if (model.mode === "image") {
                if (providerId === "openai") {
                    const openAiApiKey = process.env.OPENAI_API_KEY
                    if (!openAiApiKey) {
                        console.error("Internal OpenAI API key not found for image model")
                        continue
                    }

                    finalModel = getOpenAIImageModel(providerSpecificModelId, openAiApiKey)
                    providerSource = "internal"
                    break
                }

                if (providerId === "google") {
                    finalModel = await getGoogleImageModel(providerSpecificModelId, "internal")
                    providerSource = "internal"
                    break
                }

                if (!sdk_provider.imageModel) {
                    console.error(`Provider ${providerId} does not support image models`)
                    continue
                }
                finalModel = sdk_provider.imageModel(providerSpecificModelId)
            } else {
                if (providerId === "openai") {
                    finalModel = (sdk_provider as OpenAIProvider).responses(providerSpecificModelId)
                } else if (providerId === "google") {
                    finalModel = sdk_provider.languageModel(providerSpecificModelId)
                } else {
                    finalModel = sdk_provider.languageModel(providerSpecificModelId)
                }
            }
            providerSource = "internal"
            runtimeProvider = providerId
            runtimeApiKey =
                providerId === "xai" ? process.env.XAI_API_KEY?.trim() || undefined : undefined
            break
        }

        const provider = registry.providers[providerIdRaw]
        const hasInternalOpenRouter =
            providerIdRaw === "openrouter" && Boolean(getInternalOpenRouterApiKey())
        if (providerIdRaw === "openrouter" && !provider && hasInternalOpenRouter) {
            const sdk_provider = (await createProvider("openrouter", "internal", {
                modelId: providerSpecificModelId
            })) as unknown as OpenRouterProvider

            finalModel =
                model.mode === "image"
                    ? sdk_provider.imageModel(providerSpecificModelId)
                    : sdk_provider.chat(providerSpecificModelId)
            providerSource = "internal"
            runtimeProvider = "openrouter"
            break
        }

        if (!provider) {
            console.error(`Provider ${providerIdRaw} not found`)
            continue
        }

        if (["openrouter", ...CoreProviders].includes(providerIdRaw)) {
            if (model.mode === "image") {
                if (providerIdRaw === "openai") {
                    finalModel = getOpenAIImageModel(providerSpecificModelId, provider.key)
                    providerSource = "byok"
                    break
                }

                if (providerIdRaw === "google") {
                    try {
                        finalModel = await getGoogleImageModel(
                            providerSpecificModelId,
                            provider.key,
                            provider.authMode
                        )
                        providerSource = "byok"
                        break
                    } catch (error) {
                        console.error(
                            `Provider ${providerIdRaw} does not support image models:`,
                            error
                        )
                        continue
                    }
                }

                const sdk_provider = await createProvider(
                    providerIdRaw as CoreProvider,
                    provider.key,
                    {
                        googleAuthMode: provider.authMode,
                        modelId: providerSpecificModelId
                    }
                )
                if (!sdk_provider.imageModel) {
                    console.error(`Provider ${providerIdRaw} does not support image models`)
                    continue
                }
                finalModel = sdk_provider.imageModel(providerSpecificModelId)
            } else {
                const sdk_provider = await createProvider(
                    providerIdRaw as CoreProvider,
                    provider.key,
                    {
                        googleAuthMode: provider.authMode,
                        modelId: providerSpecificModelId
                    }
                )
                if (providerIdRaw === "openai") {
                    finalModel = (sdk_provider as OpenAIProvider).responses(providerSpecificModelId)
                } else if (providerIdRaw === "google") {
                    finalModel = sdk_provider.languageModel(providerSpecificModelId)
                } else if (providerIdRaw === "openrouter") {
                    finalModel = (sdk_provider as unknown as OpenRouterProvider).chat(
                        providerSpecificModelId
                    )
                } else {
                    finalModel = sdk_provider.languageModel(providerSpecificModelId)
                }
            }
            providerSource = providerIdRaw === "openrouter" ? "openrouter" : "byok"
            runtimeProvider =
                providerIdRaw === "openrouter" ? "openrouter" : (providerIdRaw as CoreProvider)
            runtimeApiKey = providerIdRaw === "xai" ? provider.key : undefined
            break
        }

        //custom openai-compatible provider
        if (!provider.endpoint) {
            console.error(`Provider ${providerIdRaw} does not have a valid endpoint`)
            continue
        }
        const sdk_provider = createOpenAI({
            baseURL: provider.endpoint,
            apiKey: provider.key,
            name: provider.name
        })
        if (model.mode === "image") {
            if (!sdk_provider.imageModel) {
                console.error(`Provider ${providerIdRaw} does not support image models`)
                continue
            }
            finalModel = sdk_provider.imageModel(providerSpecificModelId)
        } else {
            finalModel = sdk_provider.languageModel(providerSpecificModelId)
        }
        providerSource = "custom"
        runtimeProvider = "custom"
        runtimeApiKey = undefined
        break
    }

    if (!finalModel) return new ChatError("bad_model:api")

    Object.assign(finalModel, {
        modelType: "maxImagesPerCall" in finalModel ? "image" : "text"
    })

    return {
        model: finalModel as
            | (LanguageModelV3 & { modelType: "text" })
            | (ImageModelV3 & { modelType: "image" }),
        abilities: model.abilities,
        registry,
        modelId: model.id,
        modelName: model.name ?? model.id,
        providerSource,
        runtimeProvider,
        runtimeApiKey,
        availableToPickFor: model.availableToPickFor,
        availableToPickForReasoningEfforts: model.availableToPickForReasoningEfforts,
        prototypeCreditTier: model.prototypeCreditTier,
        prototypeCreditTierWithReasoning: model.prototypeCreditTierWithReasoning
    }
}
