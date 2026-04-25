import { beforeEach, describe, expect, it, vi } from "vitest"

const {
    createAnthropicMock,
    createFalMock,
    createGatewayMock,
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
    createGatewayMock: vi.fn(),
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

vi.mock("@ai-sdk/gateway", () => ({
    createGateway: createGatewayMock
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

import { createProvider } from "../../convex/lib/provider_factory"

describe("provider_factory", () => {
    beforeEach(() => {
        createAnthropicMock.mockReset()
        createFalMock.mockReset()
        createGatewayMock.mockReset()
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

    it("uses the Google AI Studio provider for non-vertex auth", async () => {
        getGoogleAuthModeMock.mockReturnValueOnce("ai-studio")
        getGoogleAiStudioApiKeyMock.mockReturnValueOnce("google-ai-studio-key")
        createGoogleGenerativeAIMock.mockReturnValueOnce({ provider: "google-studio" })

        const provider = await createProvider("google", "internal", {
            googleAuthMode: "ai-studio",
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
            googleAuthMode: "vertex",
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

    it("rejects internal OpenRouter usage when no key is configured", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "")

        await expect(createProvider("openrouter", "internal")).rejects.toThrow(
            "OpenRouter API key is required"
        )
    })

    it("creates the gateway provider with a user API key", async () => {
        createGatewayMock.mockReturnValueOnce({ provider: "gateway" })

        const provider = await createProvider("gateway", "gateway-key")

        expect(createGatewayMock).toHaveBeenCalledWith({
            apiKey: "gateway-key"
        })
        expect(provider).toEqual({ provider: "gateway" })
    })
})
