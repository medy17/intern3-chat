import { beforeEach, describe, expect, it, vi } from "vitest"

const { generateImageMock, generateTextMock, storeMock, getGoogleAuthModeMock } = vi.hoisted(
    () => ({
        generateImageMock: vi.fn(),
        generateTextMock: vi.fn(),
        storeMock: vi.fn(),
        getGoogleAuthModeMock: vi.fn()
    })
)

vi.mock("ai", () => ({
    generateImage: generateImageMock,
    generateText: generateTextMock
}))

vi.mock("@ai-sdk/openai", () => ({
    createOpenAI: vi.fn()
}))

vi.mock("../../convex/attachments", () => ({
    r2: {
        store: storeMock
    }
}))

vi.mock("../../convex/lib/google_provider", () => ({
    getGoogleAuthMode: getGoogleAuthModeMock,
    getGoogleVertexConfig: vi.fn()
}))

vi.mock("../../convex/lib/google_auth", () => ({
    getGoogleAccessToken: vi.fn()
}))

vi.mock("../../convex/lib/models", async () => {
    const actual = await vi.importActual<typeof import("../../convex/lib/models/openrouter")>(
        "../../convex/lib/models/openrouter"
    )

    return {
        MODELS_SHARED: actual.OPENROUTER_MODELS,
        ImageResolution: undefined,
        ImageSize: undefined
    }
})

import { generateAndStoreImage } from "../../convex/chat_http/image_generation"

describe("generateAndStoreImage", () => {
    beforeEach(() => {
        generateImageMock.mockReset().mockResolvedValue({
            images: [
                {
                    mediaType: "image/png",
                    uint8Array: new Uint8Array([1, 2, 3])
                }
            ]
        })
        generateTextMock.mockReset()
        storeMock.mockReset().mockResolvedValue("stored-key")
        getGoogleAuthModeMock.mockReset().mockReturnValue("ai-studio")
    })

    it("passes Seedream image resolution through OpenRouter image_config", async () => {
        await generateAndStoreImage({
            prompt: "A cinematic portrait",
            imageSize: "9:16",
            imageResolution: "1K",
            imageModel: {
                provider: "openrouter",
                modelId: "bytedance-seed/seedream-4.5"
            } as never,
            modelId: "seedream-4-5",
            userId: "user-1",
            actionCtx: {} as never,
            maxAssets: 1
        })

        expect(generateImageMock).toHaveBeenCalledTimes(1)
        expect(generateImageMock).toHaveBeenCalledWith(
            expect.objectContaining({
                aspectRatio: "9:16",
                providerOptions: {
                    openrouter: expect.objectContaining({
                        modalities: ["image"],
                        image_config: {
                            aspect_ratio: "9:16",
                            image_size: "1K"
                        },
                        provider: {
                            only: ["seed"],
                            allow_fallbacks: false,
                            require_parameters: true
                        }
                    })
                }
            })
        )
        expect(storeMock).toHaveBeenCalledTimes(1)
    })
})
