"use node"

import { createAnthropic } from "@ai-sdk/anthropic"
import { createFal } from "@ai-sdk/fal"
import { createGateway } from "@ai-sdk/gateway"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createVertex } from "@ai-sdk/google-vertex/edge"
import { createGroq } from "@ai-sdk/groq"
import { createOpenAI } from "@ai-sdk/openai"
import type { ProviderV3 } from "@ai-sdk/provider"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

import type { GoogleAuthMode } from "../schema/settings"
import {
    getGoogleAiStudioApiKey,
    getGoogleAuthMode,
    getGoogleVertexConfig
} from "./google_provider"
import type { CoreProvider } from "./models"

export const createGoogleOpenAICompatibleProvider = (
    apiKey: string | "internal",
    options?: {
        googleAuthMode?: GoogleAuthMode
    }
) => {
    if (getGoogleAuthMode(apiKey, options?.googleAuthMode) === "vertex") {
        throw new Error("Google OpenAI-compatible image models require AI Studio authentication")
    }

    const resolvedApiKey = getGoogleAiStudioApiKey(apiKey)
    if (!resolvedApiKey) {
        throw new Error("Google AI Studio API key is required")
    }

    return createOpenAI({
        apiKey: resolvedApiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
        name: "google"
    })
}

export const createProvider = (
    providerId: CoreProvider | "openrouter",
    apiKey: string | "internal",
    options?: {
        googleAuthMode?: GoogleAuthMode
        modelId?: string
    }
): Promise<ProviderV3> => {
    return createProviderInternal(providerId, apiKey, options)
}

const shouldUseGlobalVertexLocation = (modelId?: string) =>
    Boolean(modelId && /^gemini-3(\.|-)/.test(modelId))

const getInternalOpenRouterApiKey = () => process.env.OPENROUTER_API_KEY?.trim()
const getInternalGatewayApiKey = () => process.env.AI_GATEWAY_API_KEY?.trim()

const createProviderInternal = async (
    providerId: CoreProvider | "openrouter",
    apiKey: string | "internal",
    options?: {
        googleAuthMode?: GoogleAuthMode
        modelId?: string
    }
): Promise<ProviderV3> => {
    if (apiKey !== "internal" && (!apiKey || apiKey.trim() === "")) {
        throw new Error("API key is required for non-internal providers")
    }

    switch (providerId) {
        case "openai":
            return createOpenAI({
                apiKey: apiKey === "internal" ? process.env.OPENAI_API_KEY : apiKey
            })
        case "anthropic":
            return createAnthropic({
                apiKey: apiKey === "internal" ? process.env.ANTHROPIC_API_KEY : apiKey
            })
        case "google":
            if (getGoogleAuthMode(apiKey, options?.googleAuthMode) === "vertex") {
                const vertexConfig = getGoogleVertexConfig(apiKey)
                const location = shouldUseGlobalVertexLocation(options?.modelId)
                    ? "global"
                    : vertexConfig.location
                const baseURL =
                    location === "global"
                        ? `https://aiplatform.googleapis.com/v1/projects/${vertexConfig.project}/locations/global/publishers/google`
                        : undefined
                return createVertex({
                    project: vertexConfig.project,
                    location,
                    ...(baseURL ? { baseURL } : {}),
                    googleCredentials: {
                        clientEmail: vertexConfig.credentials.client_email,
                        privateKey: vertexConfig.credentials.private_key,
                        privateKeyId: vertexConfig.credentials.private_key_id
                    }
                })
            }

            return createGoogleGenerativeAI({
                apiKey: getGoogleAiStudioApiKey(apiKey)
            })
        case "xai": {
            const resolvedApiKey = apiKey === "internal" ? process.env.XAI_API_KEY : apiKey
            if (!resolvedApiKey) {
                throw new Error("xAI API key is required")
            }

            return createOpenAI({
                apiKey: resolvedApiKey,
                baseURL: "https://api.x.ai/v1",
                name: "xai"
            })
        }
        case "groq":
            return createGroq({
                apiKey: apiKey === "internal" ? process.env.GROQ_API_KEY : apiKey
            })
        case "openrouter": {
            const resolvedApiKey = apiKey === "internal" ? getInternalOpenRouterApiKey() : apiKey
            if (!resolvedApiKey) {
                throw new Error("OpenRouter API key is required")
            }

            return createOpenRouter({
                apiKey: resolvedApiKey,
                compatibility: "strict"
            }) as unknown as ProviderV3
        }
        case "fal":
            return createFal({
                apiKey: apiKey === "internal" ? process.env.FAL_API_KEY : apiKey
            })
        case "gateway":
            return createGateway({
                ...(apiKey === "internal"
                    ? getInternalGatewayApiKey()
                        ? { apiKey: getInternalGatewayApiKey() }
                        : {}
                    : { apiKey })
            })
        default: {
            const exhaustiveCheck: never = providerId
            throw new Error(`Unknown provider: ${exhaustiveCheck}`)
        }
    }
}
