import { beforeEach, describe, expect, it, vi } from "vitest"

const {
    createAnthropicMock,
    createFalMock,
    createGoogleGenerativeAIMock,
    createGroqMock,
    createOpenAIMock,
    createOpenRouterMock,
    createVertexMock,
    getGoogleAiStudioApiKeyMock,
    getGoogleAuthModeMock,
    getGoogleVertexConfigMock
} = vi.hoisted(() => ({
    createAnthropicMock: vi.fn(),
    createFalMock: vi.fn(),
    createGoogleGenerativeAIMock: vi.fn(),
    createGroqMock: vi.fn(),
    createOpenAIMock: vi.fn(),
    createOpenRouterMock: vi.fn(),
    createVertexMock: vi.fn(),
    getGoogleAiStudioApiKeyMock: vi.fn(),
    getGoogleAuthModeMock: vi.fn(),
    getGoogleVertexConfigMock: vi.fn()
}))

vi.mock("@ai-sdk/anthropic", () => ({
    createAnthropic: createAnthropicMock
}))

vi.mock("@ai-sdk/fal", () => ({
    createFal: createFalMock
}))

vi.mock("@ai-sdk/google", () => ({
    createGoogleGenerativeAI: createGoogleGenerativeAIMock
}))

vi.mock("@ai-sdk/google-vertex/edge", () => ({
    createVertex: createVertexMock
}))

vi.mock("@ai-sdk/groq", () => ({
    createGroq: createGroqMock
}))

vi.mock("@ai-sdk/openai", () => ({
    createOpenAI: createOpenAIMock
}))

vi.mock("@openrouter/ai-sdk-provider", () => ({
    createOpenRouter: createOpenRouterMock
}))

vi.mock("../../convex/lib/google_provider", () => ({
    getGoogleAiStudioApiKey: getGoogleAiStudioApiKeyMock,
    getGoogleAuthMode: getGoogleAuthModeMock,
    getGoogleVertexConfig: getGoogleVertexConfigMock
}))

import {
    createGoogleOpenAICompatibleProvider,
    createProvider
} from "../../convex/lib/provider_factory"

describe("provider_factory", () => {
    beforeEach(() => {
        createAnthropicMock.mockReset()
        createFalMock.mockReset()
        createGoogleGenerativeAIMock.mockReset()
        createGroqMock.mockReset()
        createOpenAIMock.mockReset()
        createOpenRouterMock.mockReset()
        createVertexMock.mockReset()
        getGoogleAiStudioApiKeyMock.mockReset()
        getGoogleAuthModeMock.mockReset()
        getGoogleVertexConfigMock.mockReset()
    })

    it("rejects blank non-internal API keys", async () => {
        await expect(createProvider("openai", "   ")).rejects.toThrow(
            "API key is required for non-internal providers"
        )
    })

    it("creates an OpenAI provider with the internal server key", async () => {
        vi.stubEnv("OPENAI_API_KEY", "internal-openai-key")
        createOpenAIMock.mockReturnValueOnce({ provider: "openai" })

        const provider = await createProvider("openai", "internal")

        expect(createOpenAIMock).toHaveBeenCalledWith({
            apiKey: "internal-openai-key"
        })
        expect(provider).toEqual({ provider: "openai" })
    })

    it("uses the Google AI Studio provider for non-vertex auth", async () => {
        getGoogleAuthModeMock.mockReturnValueOnce("studio")
        getGoogleAiStudioApiKeyMock.mockReturnValueOnce("google-ai-studio-key")
        createGoogleGenerativeAIMock.mockReturnValueOnce({ provider: "google-studio" })

        const provider = await createProvider("google", "internal", {
            googleAuthMode: "api-key",
            modelId: "gemini-2.5-pro"
        })

        expect(getGoogleAiStudioApiKeyMock).toHaveBeenCalledWith("internal")
        expect(createGoogleGenerativeAIMock).toHaveBeenCalledWith({
            apiKey: "google-ai-studio-key"
        })
        expect(provider).toEqual({ provider: "google-studio" })
    })

    it("uses the global Vertex endpoint for gemini-3 models", async () => {
        getGoogleAuthModeMock.mockReturnValueOnce("vertex")
        getGoogleVertexConfigMock.mockReturnValueOnce({
            project: "project-1",
            location: "us-central1",
            credentials: {
                client_email: "svc@example.com",
                private_key: "private-key",
                private_key_id: "key-id"
            }
        })
        createVertexMock.mockReturnValueOnce({ provider: "vertex" })

        const provider = await createProvider("google", "internal", {
            googleAuthMode: "service-account",
            modelId: "gemini-3.0-fast"
        })

        expect(createVertexMock).toHaveBeenCalledWith({
            project: "project-1",
            location: "global",
            baseURL:
                "https://aiplatform.googleapis.com/v1/projects/project-1/locations/global/publishers/google",
            googleCredentials: {
                clientEmail: "svc@example.com",
                privateKey: "private-key",
                privateKeyId: "key-id"
            }
        })
        expect(provider).toEqual({ provider: "vertex" })
    })

    it("trims and uses the internal OpenRouter key", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "  openrouter-key  ")
        createOpenRouterMock.mockReturnValueOnce({ provider: "openrouter" })

        const provider = await createProvider("openrouter", "internal")

        expect(createOpenRouterMock).toHaveBeenCalledWith({
            apiKey: "openrouter-key",
            compatibility: "strict"
        })
        expect(provider).toEqual({ provider: "openrouter" })
    })

    it("rejects internal OpenRouter usage when no key is configured", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "")

        await expect(createProvider("openrouter", "internal")).rejects.toThrow(
            "OpenRouter API key is required"
        )
    })

    it("rejects Google OpenAI-compatible usage for Vertex auth", () => {
        getGoogleAuthModeMock.mockReturnValueOnce("vertex")

        expect(() =>
            createGoogleOpenAICompatibleProvider("internal", {
                googleAuthMode: "service-account"
            })
        ).toThrow("Google OpenAI-compatible image models require AI Studio authentication")
    })

    it("requires an AI Studio key for the OpenAI-compatible Google provider", () => {
        getGoogleAuthModeMock.mockReturnValueOnce("studio")
        getGoogleAiStudioApiKeyMock.mockReturnValueOnce(undefined)

        expect(() =>
            createGoogleOpenAICompatibleProvider("internal", {
                googleAuthMode: "api-key"
            })
        ).toThrow("Google AI Studio API key is required")
    })

    it("creates the OpenAI-compatible Google provider with the expected base URL", () => {
        getGoogleAuthModeMock.mockReturnValueOnce("studio")
        getGoogleAiStudioApiKeyMock.mockReturnValueOnce("google-ai-studio-key")
        createOpenAIMock.mockReturnValueOnce({ provider: "google-openai" })

        const provider = createGoogleOpenAICompatibleProvider("internal", {
            googleAuthMode: "api-key"
        })

        expect(createOpenAIMock).toHaveBeenCalledWith({
            apiKey: "google-ai-studio-key",
            baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
            name: "google"
        })
        expect(provider).toEqual({ provider: "google-openai" })
    })
})
