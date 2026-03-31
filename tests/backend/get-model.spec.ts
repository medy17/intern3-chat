import { beforeEach, describe, expect, it, vi } from "vitest"

const { getUserIdentityMock, createProviderMock, createOpenAIMock } = vi.hoisted(() => ({
    getUserIdentityMock: vi.fn(),
    createProviderMock: vi.fn(),
    createOpenAIMock: vi.fn()
}))

vi.mock("../../convex/lib/identity", () => ({
    getUserIdentity: getUserIdentityMock
}))

vi.mock("../../convex/lib/provider_factory", () => ({
    createProvider: createProviderMock,
    createGoogleOpenAICompatibleProvider: vi.fn()
}))

vi.mock("@ai-sdk/openai", () => ({
    createOpenAI: createOpenAIMock
}))

vi.mock("../../convex/_generated/api", () => ({
    internal: {
        settings: {
            getUserRegistryInternal: "getUserRegistryInternal"
        }
    }
}))

vi.mock("../../convex/lib/models", () => ({
    CoreProviders: ["openai", "google", "anthropic", "xai", "groq"],
    MODELS_SHARED: [
        {
            id: "shared-text",
            name: "Shared Text",
            mode: "text",
            abilities: ["reasoning"],
            adapters: ["openrouter:or-shared", "i3-openai:shared-text", "openai:shared-text"],
            prototypeCreditTier: "basic",
            prototypeCreditTierWithReasoning: "pro"
        }
    ]
}))

import { ChatError } from "@/lib/errors"
import { getModel } from "../../convex/chat_http/get_model"

type GetModelCtx = Parameters<typeof getModel>[0]

const createCtx = (registry: Record<string, unknown>) =>
    ({
        auth: {},
        runQuery: vi.fn().mockResolvedValue(registry)
    }) as GetModelCtx

describe("getModel", () => {
    beforeEach(() => {
        getUserIdentityMock.mockReset().mockResolvedValue({ id: "user-1" })
        createProviderMock.mockReset()
        createOpenAIMock.mockReset()
        Reflect.deleteProperty(process.env, "OPENROUTER_API_KEY")
        Reflect.deleteProperty(process.env, "OPENAI_API_KEY")
    })

    it("returns unauthorized when the user identity cannot be resolved", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ error: "Unauthorized" })

        await expect(
            getModel(createCtx({ models: {}, providers: {} }), "shared-text")
        ).rejects.toMatchObject({
            type: "unauthorized"
        })
    })

    it("prefers internal OpenRouter for shared models when an internal OpenRouter key is configured", async () => {
        process.env.OPENROUTER_API_KEY = "or-key"

        const openRouterChatModel = { provider: "openrouter-chat" }
        createProviderMock.mockResolvedValueOnce({
            chat: vi.fn().mockReturnValue(openRouterChatModel)
        })

        const result = await getModel(
            createCtx({
                providers: {},
                models: {
                    "shared-text": {
                        id: "shared-text",
                        name: "Shared Text",
                        mode: "text",
                        abilities: ["reasoning"],
                        adapters: [
                            "openrouter:or-shared",
                            "i3-openai:shared-text",
                            "openai:shared-text"
                        ],
                        prototypeCreditTier: "basic",
                        prototypeCreditTierWithReasoning: "pro"
                    }
                }
            }),
            "shared-text"
        )

        expect(createProviderMock).toHaveBeenCalledWith("openrouter", "internal", {
            modelId: "or-shared"
        })
        expect(result).toMatchObject({
            modelId: "shared-text",
            modelName: "Shared Text",
            providerSource: "internal",
            runtimeProvider: "openrouter",
            prototypeCreditTier: "basic",
            prototypeCreditTierWithReasoning: "pro",
            model: {
                provider: "openrouter-chat",
                modelType: "text"
            }
        })
    })

    it("prefers an internal provider adapter over BYOK for shared models when no internal OpenRouter path is active", async () => {
        const responsesModel = { provider: "internal-openai" }
        createProviderMock.mockResolvedValueOnce({
            responses: vi.fn().mockReturnValue(responsesModel)
        })

        const result = await getModel(
            createCtx({
                providers: {
                    openai: {
                        key: "user-openai-key"
                    }
                },
                models: {
                    "shared-text": {
                        id: "shared-text",
                        name: "Shared Text",
                        mode: "text",
                        abilities: ["reasoning"],
                        adapters: [
                            "openrouter:or-shared",
                            "i3-openai:shared-text",
                            "openai:shared-text"
                        ]
                    }
                }
            }),
            "shared-text"
        )

        expect(createProviderMock).toHaveBeenCalledWith("openai", "internal", {
            modelId: "shared-text"
        })
        expect(result).toMatchObject({
            providerSource: "internal",
            runtimeProvider: "openai",
            model: {
                provider: "internal-openai",
                modelType: "text"
            }
        })
    })

    it("uses BYOK core providers for custom models before internal or OpenRouter fallbacks", async () => {
        const responsesModel = { provider: "byok-openai" }
        createProviderMock.mockResolvedValueOnce({
            responses: vi.fn().mockReturnValue(responsesModel)
        })

        const result = await getModel(
            createCtx({
                providers: {
                    openai: {
                        key: "user-openai-key"
                    }
                },
                models: {
                    "custom-model": {
                        id: "my-model-id",
                        name: "My Custom Model",
                        mode: "text",
                        abilities: ["reasoning"],
                        customProviderId: "openai",
                        adapters: ["openai:my-model-id", "i3-openai:my-model-id"]
                    }
                }
            }),
            "custom-model"
        )

        expect(createProviderMock).toHaveBeenCalledWith("openai", "user-openai-key", {
            googleAuthMode: undefined,
            modelId: "my-model-id"
        })
        expect(result).toMatchObject({
            modelId: "my-model-id",
            modelName: "My Custom Model",
            providerSource: "byok",
            runtimeProvider: "openai",
            model: {
                provider: "byok-openai",
                modelType: "text"
            }
        })
    })

    it("returns a bad_model error when internalOnly removes all usable adapters", async () => {
        const result = await getModel(
            createCtx({
                providers: {
                    openai: {
                        key: "user-openai-key"
                    }
                },
                models: {
                    "shared-text": {
                        id: "shared-text",
                        name: "Shared Text",
                        mode: "text",
                        abilities: ["reasoning"],
                        adapters: ["openai:shared-text"]
                    }
                }
            }),
            "shared-text",
            {
                internalOnly: true
            }
        )

        expect(result).toBeInstanceOf(ChatError)
        expect((result as ChatError).type).toBe("bad_model")
        expect((result as ChatError).cause).toBe("No internal adapters found for model")
    })
})
