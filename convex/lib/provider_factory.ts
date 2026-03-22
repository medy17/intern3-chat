"use node"

import { createAnthropic } from "@ai-sdk/anthropic"
import { createFal } from "@ai-sdk/fal"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createGroq } from "@ai-sdk/groq"
import { createOpenAI } from "@ai-sdk/openai"
import type { ProviderV1 } from "@ai-sdk/provider"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

import type { GoogleAuthMode } from "../schema/settings"
import {
    getGoogleAiStudioApiKey,
    getGoogleAuthMode,
    getGoogleVertexConfig
} from "./google_provider"
import type { CoreProvider } from "./models"

export const createProvider = (
    providerId: CoreProvider | "openrouter" | "fal",
    apiKey: string | "internal",
    options?: {
        googleAuthMode?: GoogleAuthMode
    }
): Promise<Omit<ProviderV1, "textEmbeddingModel">> => {
    return createProviderInternal(providerId, apiKey, options)
}

const createProviderInternal = async (
    providerId: CoreProvider | "openrouter" | "fal",
    apiKey: string | "internal",
    options?: {
        googleAuthMode?: GoogleAuthMode
    }
): Promise<Omit<ProviderV1, "textEmbeddingModel">> => {
    if (apiKey !== "internal" && (!apiKey || apiKey.trim() === "")) {
        throw new Error("API key is required for non-internal providers")
    }

    switch (providerId) {
        case "openai":
            return createOpenAI({
                apiKey: apiKey === "internal" ? process.env.OPENAI_API_KEY : apiKey,
                compatibility: "strict"
            })
        case "anthropic":
            return createAnthropic({
                apiKey: apiKey === "internal" ? process.env.ANTHROPIC_API_KEY : apiKey
            })
        case "google":
            if (getGoogleAuthMode(apiKey, options?.googleAuthMode) === "vertex") {
                const vertexConfig = getGoogleVertexConfig(apiKey)
                const dynamicImport = new Function("specifier", "return import(specifier)") as (
                    specifier: string
                ) => Promise<typeof import("@ai-sdk/google-vertex")>
                const { createVertex } = await dynamicImport("@ai-sdk/google-vertex")
                return createVertex({
                    project: vertexConfig.project,
                    location: vertexConfig.location,
                    googleAuthOptions: {
                        credentials: vertexConfig.credentials
                    }
                })
            }

            return createGoogleGenerativeAI({
                apiKey: getGoogleAiStudioApiKey(apiKey)
            })
        case "groq":
            return createGroq({
                apiKey: apiKey === "internal" ? process.env.GROQ_API_KEY : apiKey
            })
        case "openrouter":
            return createOpenRouter({
                apiKey
            })
        case "fal":
            return createFal({
                apiKey: apiKey === "internal" ? process.env.FAL_API_KEY : apiKey
            })
        default: {
            const exhaustiveCheck: never = providerId
            throw new Error(`Unknown provider: ${exhaustiveCheck}`)
        }
    }
}
