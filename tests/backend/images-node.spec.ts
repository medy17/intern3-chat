import { beforeEach, describe, expect, it, vi } from "vitest"

const { generateAndStoreImageMock, getModelMock, getUserIdentityMock } = vi.hoisted(() => ({
    generateAndStoreImageMock: vi.fn(),
    getModelMock: vi.fn(),
    getUserIdentityMock: vi.fn()
}))

vi.mock("../../convex/_generated/api", () => ({
    internal: {
        credits: {
            recordCreditEventForMessage: "recordCreditEventForMessage"
        },
        images: {
            insertGeneratedImage: "insertGeneratedImage"
        }
    }
}))

vi.mock("../../convex/chat_http/get_model", () => ({
    getModel: getModelMock
}))

vi.mock("../../convex/chat_http/image_generation", () => ({
    generateAndStoreImage: generateAndStoreImageMock
}))

vi.mock("../../convex/lib/identity", () => ({
    getUserIdentity: getUserIdentityMock
}))

vi.mock("../../convex/attachments", () => ({
    r2: {
        store: vi.fn()
    }
}))

import { generateStandaloneImage } from "../../convex/images_node"

type GenerateStandaloneImageCtx = {
    auth: Record<string, unknown>
    runMutation: ReturnType<typeof vi.fn>
}

const generateStandaloneImageHandler = generateStandaloneImage as unknown as (
    ctx: GenerateStandaloneImageCtx,
    args: {
        prompt: string
        modelId: string
        aspectRatio?: string
        resolution?: string
        referenceImageIds?: string[]
    }
) => Promise<string[]>

const createCtx = (): GenerateStandaloneImageCtx =>
    ({
        auth: {},
        runMutation: vi.fn().mockResolvedValue("generated-image-1")
    }) as GenerateStandaloneImageCtx

const createImageModelData = (
    prototypeCreditTier: "basic" | "pro" = "pro",
    providerSource: "internal" | "byok" | "openrouter" | "custom" | "unknown" = "internal"
) => ({
    model: {
        modelType: "image"
    },
    modelName: "Image Model",
    providerSource,
    registry: {
        models: {
            "image-model": {}
        }
    },
    runtimeApiKey: undefined,
    prototypeCreditTier
})

describe("images_node", () => {
    beforeEach(() => {
        getUserIdentityMock.mockReset()
        getModelMock.mockReset()
        generateAndStoreImageMock.mockReset().mockResolvedValue({
            assets: [
                {
                    imageUrl: "generated-key",
                    imageSize: "1:1"
                }
            ],
            prompt: "A test image",
            modelId: "image-model"
        })
    })

    it("rejects free users before standalone pro image generation runs", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1", creditPlan: "free" })
        getModelMock.mockResolvedValueOnce(createImageModelData("pro"))
        const ctx = createCtx()

        await expect(
            generateStandaloneImageHandler(ctx, {
                prompt: "A test image",
                modelId: "image-model",
                aspectRatio: "1:1"
            })
        ).rejects.toThrow("Pro plan required for image generation.")

        expect(generateAndStoreImageMock).not.toHaveBeenCalled()
        expect(ctx.runMutation).not.toHaveBeenCalled()
    })

    it("allows pro users to run standalone pro image generation", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1", creditPlan: "pro" })
        getModelMock.mockResolvedValueOnce(createImageModelData("pro"))
        const ctx = createCtx()

        await expect(
            generateStandaloneImageHandler(ctx, {
                prompt: "A test image",
                modelId: "image-model",
                aspectRatio: "1:1"
            })
        ).resolves.toEqual(["generated-image-1"])

        expect(generateAndStoreImageMock).toHaveBeenCalledWith(
            expect.objectContaining({
                prompt: "A test image",
                modelId: "image-model",
                userId: "user-1"
            })
        )
        expect(ctx.runMutation).toHaveBeenCalledWith("insertGeneratedImage", {
            userId: "user-1",
            storageKey: "generated-key",
            prompt: "A test image",
            modelId: "image-model",
            aspectRatio: "1:1",
            resolution: undefined
        })
        expect(ctx.runMutation).toHaveBeenCalledWith("recordCreditEventForMessage", {
            userId: "user-1",
            messageId: "standalone-image:generated-image-1",
            messageKey: "standalone-image:generated-image-1",
            modelId: "image-model",
            providerSource: "internal",
            feature: "image",
            bucket: "pro",
            units: 1,
            counted: true
        })
    })
})
