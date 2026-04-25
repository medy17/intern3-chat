import sharp from "sharp"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { generateImageMock, generateTextMock, storeMock, getGoogleAuthModeMock } = vi.hoisted(
    () => ({
        generateImageMock: vi.fn(),
        generateTextMock: vi.fn(),
        storeMock: vi.fn(),
        getGoogleAuthModeMock: vi.fn()
    })
)

const fetchMock = vi.fn()

vi.mock("ai", () => ({
    generateImage: generateImageMock,
    generateText: generateTextMock
}))

vi.mock("@ai-sdk/openai", () => ({
    createOpenAI: vi.fn()
}))

vi.mock("../../convex/attachments", () => ({
    r2: {
        store: storeMock,
        getMetadata: vi.fn(),
        getUrl: vi.fn()
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
        MODELS_SHARED: [
            ...actual.OPENROUTER_MODELS,
            {
                id: "grok-imagine-image",
                name: "Grok Imagine Image",
                mode: "image",
                adapters: ["i3-xai:grok-imagine-image", "xai:grok-imagine-image"],
                abilities: [],
                supportsReferenceImages: true,
                supportedImageSizes: ["1:1", "16:9", "9:16"],
                supportedImageResolutions: ["1K", "2K"]
            },
            {
                id: "gpt-5.4-image-2",
                name: "GPT 5.4 Image 2",
                mode: "image",
                adapters: [
                    "i3-gateway:openai/gpt-image-2",
                    "gateway:openai/gpt-image-2",
                    "i3-openai:gpt-image-2",
                    "openai:gpt-image-2"
                ],
                abilities: [],
                supportsReferenceImages: true,
                supportedImageSizes: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"],
                supportedImageResolutions: ["1K", "2K", "4K"],
                defaultImageQuality: "low"
            }
        ],
        ImageResolution: undefined,
        ImageSize: undefined
    }
})

import { r2 } from "../../convex/attachments"
import { generateAndStoreImage } from "../../convex/chat_http/image_generation"

describe("generateAndStoreImage", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", fetchMock)
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
        fetchMock.mockReset()
        vi.mocked(r2.getMetadata).mockReset()
        vi.mocked(r2.getUrl).mockReset()
    })

    it("maps Library aspect ratio and resolution controls to OpenAI pixel sizes", async () => {
        await generateAndStoreImage({
            prompt: "A wide banner",
            imageSize: "21:9",
            imageResolution: "4K",
            imageModel: {
                provider: "gateway",
                modelId: "openai/gpt-image-2"
            } as never,
            modelId: "gpt-5.4-image-2",
            userId: "user-1",
            actionCtx: {} as never,
            maxAssets: 1,
            runtimeApiKey: "openai-key"
        })

        console.log(generateImageMock.mock.calls[0]?.[0])
        expect(fetchMock).not.toHaveBeenCalled()
        expect(generateImageMock).toHaveBeenCalledTimes(1)
        expect(generateImageMock).toHaveBeenCalledWith(
            expect.objectContaining({
                model: expect.objectContaining({
                    provider: "gateway",
                    modelId: "openai/gpt-image-2"
                }),
                prompt: "A wide banner",
                n: 1,
                size: "3808x1632",
                providerOptions: {
                    openai: {
                        moderation: "low",
                        quality: "low"
                    }
                }
            })
        )
    })

    it("uses the actual returned xAI image dimensions instead of the requested aspect ratio", async () => {
        const landscapeImage = await sharp({
            create: {
                width: 1600,
                height: 900,
                channels: 3,
                background: { r: 0, g: 0, b: 0 }
            }
        })
            .png()
            .toBuffer()

        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: [
                    {
                        b64_json: landscapeImage.toString("base64")
                    }
                ]
            })
        })

        const result = await generateAndStoreImage({
            prompt: "A cinematic portrait",
            imageSize: "9:16",
            imageResolution: "2K",
            imageModel: {
                provider: "xai.image",
                modelId: "grok-imagine-image"
            } as never,
            modelId: "grok-imagine-image",
            userId: "user-1",
            actionCtx: {} as never,
            maxAssets: 1,
            runtimeApiKey: "xai-key"
        })

        expect(generateImageMock).not.toHaveBeenCalled()
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.x.ai/v1/images/generations",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    Authorization: "Bearer xai-key",
                    "Content-Type": "application/json"
                })
            })
        )
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.x.ai/v1/images/generations",
            expect.objectContaining({
                body: JSON.stringify({
                    model: "grok-imagine-image",
                    prompt: "A cinematic portrait",
                    response_format: "b64_json",
                    aspect_ratio: "9:16",
                    resolution: "2k"
                })
            })
        )
        expect(result.assets[0]?.imageSize).toBe("16:9")
        expect(storeMock).toHaveBeenCalledTimes(1)
    })
})
