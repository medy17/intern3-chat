"use node"

import { ChatError } from "@/lib/errors"
import { type OpenAIProvider, createOpenAI } from "@ai-sdk/openai"
import type { ImageModelV1, LanguageModelV1 } from "@ai-sdk/provider"
import { internal } from "../_generated/api"
import type { ActionCtx } from "../_generated/server"
import { getUserIdentity } from "../lib/identity"
import { type CoreProvider, CoreProviders, MODELS_SHARED } from "../lib/models"
import { createGoogleOpenAICompatibleProvider, createProvider } from "../lib/provider_factory"

const createPatchedOpenAIImageModel = (
    providerSpecificModelId: string,
    apiKey: string
): ImageModelV1 => ({
    specificationVersion: "v1",
    provider: "openai",
    modelId: providerSpecificModelId,
    maxImagesPerCall: 1,
    doGenerate: async ({ prompt, n, size, headers, abortSignal }) => {
        const response = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                ...headers
            },
            body: JSON.stringify({
                model: providerSpecificModelId,
                prompt,
                n,
                size
            }),
            signal: abortSignal
        })

        const responseHeaders: Record<string, string> = {}
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value
        })
        const responseBody = (await response.json().catch(() => undefined)) as
            | {
                  data?: Array<{
                      b64_json?: string
                  }>
                  error?: {
                      message?: string
                  }
              }
            | undefined

        if (!response.ok) {
            throw new Error(
                responseBody?.error?.message ||
                    `OpenAI image generation failed with status ${response.status}`
            )
        }

        const images = responseBody?.data?.flatMap((item) => (item.b64_json ? [item.b64_json] : []))

        if (!images?.length) {
            throw new Error("OpenAI image generation returned no image data")
        }

        return {
            images,
            warnings: [],
            response: {
                timestamp: new Date(),
                modelId: providerSpecificModelId,
                headers: responseHeaders
            }
        }
    }
})

const getOpenAIImageModel = (providerSpecificModelId: string, apiKey: string): ImageModelV1 => {
    if (providerSpecificModelId === "gpt-image-1.5-2025-12-16") {
        return createPatchedOpenAIImageModel(providerSpecificModelId, apiKey)
    }

    const provider = createOpenAI({
        apiKey,
        compatibility: "strict"
    })

    return provider.imageModel(providerSpecificModelId)
}

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

export const getModel = async (ctx: ActionCtx, modelId: string) => {
    const user = await getUserIdentity(ctx.auth, { allowAnons: false })
    if ("error" in user) throw new ChatError("unauthorized:chat")

    const registry = await ctx.runQuery(internal.settings.getUserRegistryInternal, {
        userId: user.id
    })

    if (!(modelId in registry.models)) return new ChatError("bad_model:api")

    const model = registry.models[modelId]
    if (!model) return new ChatError("bad_model:api")
    if (!model.adapters.length) return new ChatError("bad_model:api", "No adapters found for model")

    // Priority sorting: BYOK Core Providers > OpenRouter > Server (i3-)
    const sortedAdapters = model.adapters.sort((a, b) => {
        const providerA = a.split(":")[0]
        const providerB = b.split(":")[0]

        const getPriority = (provider: string) => {
            if (CoreProviders.includes(provider as CoreProvider)) return 1
            if (provider === "openrouter") return 2
            if (provider.startsWith("i3-")) return 3
            return 4
        }

        return getPriority(providerA) - getPriority(providerB)
    })

    console.log("[getModel] model", model, "sortedAdapters", sortedAdapters)
    let finalModel: LanguageModelV1 | ImageModelV1 | undefined = undefined

    for (const adapter of sortedAdapters) {
        const providerIdRaw = model.customProviderId ?? adapter.split(":")[0]
        const providerSpecificModelId = model.customProviderId ? model.id : adapter.split(":")[1]
        if (providerIdRaw.startsWith("i3-")) {
            const providerId = providerIdRaw.slice(3) as CoreProvider
            const sdk_provider = await createProvider(providerId, "internal", {
                modelId: providerSpecificModelId
            })

            //last check that this model actually is in MODELS_SHARED
            if (
                !MODELS_SHARED.some((m) =>
                    m.adapters.some((a) => a === `i3-${providerId}:${providerSpecificModelId}`)
                )
            ) {
                console.error(`Model ${providerSpecificModelId} not found in internal modelset`)
                continue
            }

            if (model.mode === "image") {
                if (providerId === "openai") {
                    const openAiApiKey = process.env.OPENAI_API_KEY
                    if (!openAiApiKey) {
                        console.error("Internal OpenAI API key not found for image model")
                        continue
                    }

                    finalModel = getOpenAIImageModel(providerSpecificModelId, openAiApiKey)
                    break
                }

                if (providerId === "google") {
                    finalModel = await getGoogleImageModel(providerSpecificModelId, "internal")
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
                } else {
                    finalModel = sdk_provider.languageModel(providerSpecificModelId)
                }
            }
            break
        }

        const provider = registry.providers[providerIdRaw]
        if (!provider) {
            console.error(`Provider ${providerIdRaw} not found`)
            continue
        }

        if (["openrouter", ...CoreProviders].includes(providerIdRaw)) {
            if (model.mode === "image") {
                if (providerIdRaw === "openai") {
                    finalModel = getOpenAIImageModel(providerSpecificModelId, provider.key)
                    break
                }

                if (providerIdRaw === "google") {
                    try {
                        finalModel = await getGoogleImageModel(
                            providerSpecificModelId,
                            provider.key,
                            provider.authMode
                        )
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
                } else {
                    finalModel = sdk_provider.languageModel(providerSpecificModelId)
                }
            }
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
            compatibility: "compatible",
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
        break
    }

    if (!finalModel) return new ChatError("bad_model:api")

    Object.assign(finalModel, {
        modelType: "maxImagesPerCall" in finalModel ? "image" : "text"
    })

    return {
        model: finalModel as
            | (LanguageModelV1 & { modelType: "text" })
            | (ImageModelV1 & { modelType: "image" }),
        abilities: model.abilities,
        registry,
        modelId: model.id,
        modelName: model.name ?? model.id
    }
}
