import { beforeEach, describe, expect, it, vi } from "vitest"

const { decryptKeyMock, encryptKeyMock, getUserIdentityMock, isInternalProviderConfiguredMock } =
    vi.hoisted(() => ({
        decryptKeyMock: vi.fn(),
        encryptKeyMock: vi.fn(),
        getUserIdentityMock: vi.fn(),
        isInternalProviderConfiguredMock: vi.fn()
    }))

vi.mock("convex/values", () => {
    const passthrough = () => ({})
    return {
        v: new Proxy(
            {},
            {
                get: () => passthrough
            }
        )
    }
})

vi.mock("../../convex/_generated/server", () => ({
    internalQuery: (config: unknown) => config,
    query: (config: unknown) => config,
    mutation: (config: unknown) => config
}))

vi.mock("@/lib/default-user-settings", () => ({
    DefaultSettings: (userId: string) => ({
        userId,
        searchProvider: "firecrawl",
        searchIncludeSourcesByDefault: false,
        coreAIProviders: {},
        customAIProviders: {},
        customModels: {},
        titleGenerationModel: "gemini-2.0-flash-lite",
        customThemes: [],
        mcpServers: [],
        generalProviders: {
            supermemory: undefined,
            firecrawl: undefined,
            tavily: undefined,
            brave: undefined,
            serper: undefined
        },
        customization: undefined,
        onboardingCompleted: false
    })
}))

vi.mock("../../convex/lib/encryption", () => ({
    decryptKey: decryptKeyMock,
    encryptKey: encryptKeyMock
}))

vi.mock("../../convex/lib/identity", () => ({
    getUserIdentity: getUserIdentityMock
}))

vi.mock("../../convex/lib/internal_provider_config", () => ({
    isInternalProviderConfigured: isInternalProviderConfiguredMock
}))

vi.mock("../../convex/lib/models", () => ({
    MODELS_SHARED: [
        {
            id: "shared-text",
            name: "Shared Text",
            abilities: ["reasoning"],
            mode: "text",
            adapters: ["i3-openai:shared-text", "openrouter:or-shared", "openai:shared-text"],
            maxPerMessage: 4,
            supportsReferenceImages: true,
            openrouterImageModalities: undefined,
            supportedImageSizes: ["1:1"],
            supportedImageResolutions: ["1K"],
            prototypeCreditTier: "basic",
            prototypeCreditTierWithReasoning: "pro"
        }
    ],
    SHARED_MODELS_VERSION: "test-version"
}))

vi.mock("../../convex/schema", () => ({
    UserSettings: {}
}))

vi.mock("../../convex/schema/settings", () => ({
    NonSensitiveUserSettings: {}
}))

import { ChatError } from "@/lib/errors"
import { getUserRegistryInternal, updateUserSettings } from "../../convex/settings"

type SettingsCtx = Parameters<typeof getUserRegistryInternal.handler>[0]

const createCtx = (settings: Record<string, unknown>) =>
    ({
        auth: {},
        db: {
            query: vi.fn().mockReturnValue({
                withIndex: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue(settings)
                })
            }),
            patch: vi.fn(),
            insert: vi.fn()
        }
    }) as SettingsCtx

describe("settings", () => {
    beforeEach(() => {
        decryptKeyMock.mockReset().mockImplementation(async (value: string) => `dec:${value}`)
        encryptKeyMock.mockReset().mockImplementation(async (value: string) => `enc:${value}`)
        getUserIdentityMock.mockReset().mockResolvedValue({ id: "user-1" })
        isInternalProviderConfiguredMock.mockReset().mockReturnValue(false)
        Reflect.deleteProperty(process.env, "OPENROUTER_API_KEY")
    })

    it("builds a registry with enabled BYOK providers, internal providers, and custom models", async () => {
        process.env.OPENROUTER_API_KEY = "or-key"
        isInternalProviderConfiguredMock.mockImplementation((providerId: string) => {
            return providerId === "openai"
        })

        const result = await getUserRegistryInternal.handler(
            createCtx({
                userId: "user-1",
                coreAIProviders: {
                    openai: {
                        enabled: true,
                        encryptedKey: "openai-key",
                        authMode: "ai-studio"
                    }
                },
                customAIProviders: {
                    customprov: {
                        enabled: true,
                        encryptedKey: "custom-key",
                        endpoint: "https://custom.example.com/v1",
                        name: "Custom Provider"
                    }
                },
                customModels: {
                    "custom-model": {
                        enabled: true,
                        providerId: "customprov",
                        modelId: "custom-model-id",
                        name: "Custom Model",
                        abilities: ["reasoning"],
                        contextLength: 32000,
                        maxTokens: 8000
                    }
                },
                generalProviders: {}
            }),
            { userId: "user-1" }
        )

        expect(result.providers).toEqual({
            openai: {
                key: "dec:openai-key",
                name: "openai",
                authMode: "ai-studio"
            },
            customprov: {
                key: "dec:custom-key",
                endpoint: "https://custom.example.com/v1",
                name: "Custom Provider"
            }
        })
        expect(result.models["shared-text"].adapters).toEqual([
            "i3-openai:shared-text",
            "openrouter:or-shared",
            "openai:shared-text"
        ])
        expect(result.models["custom-model"]).toMatchObject({
            id: "custom-model-id",
            name: "Custom Model",
            adapters: ["customprov:custom-model-id"],
            customProviderId: "customprov"
        })
    })

    it("preserves existing encrypted keys when updates omit newKey values", async () => {
        const ctx = createCtx({
            _id: "settings-id",
            userId: "user-1",
            coreAIProviders: {
                openai: {
                    enabled: true,
                    encryptedKey: "existing-core-key",
                    authMode: "vertex"
                }
            },
            customAIProviders: {
                customprov: {
                    enabled: true,
                    endpoint: "https://custom.example.com/v1",
                    name: "Custom Provider",
                    encryptedKey: "existing-custom-key"
                }
            },
            generalProviders: {
                supermemory: {
                    enabled: true,
                    encryptedKey: "existing-supermemory-key"
                },
                firecrawl: undefined,
                tavily: undefined,
                brave: {
                    enabled: true,
                    encryptedKey: "existing-brave-key",
                    country: "us",
                    searchLang: "en",
                    safesearch: "moderate"
                },
                serper: undefined
            }
        })

        await updateUserSettings.handler(ctx, {
            userId: "user-1",
            baseSettings: {
                userId: "user-1",
                searchProvider: "brave",
                searchIncludeSourcesByDefault: true,
                customModels: {},
                customThemes: [],
                titleGenerationModel: "shared-text",
                mcpServers: [],
                customization: undefined,
                onboardingCompleted: true
            },
            coreProviders: {
                openai: {
                    enabled: true
                }
            },
            customProviders: {
                customprov: {
                    enabled: true,
                    endpoint: "https://custom.example.com/v1",
                    name: "Custom Provider"
                }
            },
            generalProviders: {
                brave: {
                    enabled: true,
                    country: "my",
                    searchLang: "ms",
                    safesearch: "strict"
                }
            }
        })

        expect(ctx.db.patch).toHaveBeenCalledTimes(1)
        expect(ctx.db.patch).toHaveBeenCalledWith(
            "settings-id",
            expect.objectContaining({
                coreAIProviders: {
                    openai: {
                        enabled: true,
                        authMode: "vertex",
                        encryptedKey: "existing-core-key"
                    }
                },
                customAIProviders: {
                    customprov: {
                        enabled: true,
                        endpoint: "https://custom.example.com/v1",
                        name: "Custom Provider",
                        encryptedKey: "existing-custom-key"
                    }
                },
                generalProviders: expect.objectContaining({
                    supermemory: {
                        enabled: true,
                        encryptedKey: "existing-supermemory-key"
                    },
                    brave: {
                        enabled: true,
                        encryptedKey: "existing-brave-key",
                        country: "my",
                        searchLang: "ms",
                        safesearch: "strict"
                    }
                })
            })
        )
        expect(encryptKeyMock).not.toHaveBeenCalled()
    })

    it("rejects updates when the authenticated user does not match the requested userId", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "other-user" })

        await expect(
            updateUserSettings.handler(createCtx(null), {
                userId: "user-1",
                baseSettings: {
                    userId: "user-1",
                    searchProvider: "firecrawl",
                    searchIncludeSourcesByDefault: false,
                    customModels: {},
                    customThemes: [],
                    titleGenerationModel: "shared-text",
                    mcpServers: [],
                    customization: undefined,
                    onboardingCompleted: false
                },
                coreProviders: {},
                customProviders: {}
            })
        ).rejects.toBeInstanceOf(ChatError)
    })
})
