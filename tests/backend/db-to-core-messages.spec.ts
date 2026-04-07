import { beforeEach, describe, expect, it, vi } from "vitest"

const { getUrlMock } = vi.hoisted(() => ({
    getUrlMock: vi.fn()
}))

vi.mock("@convex-dev/r2", () => ({
    R2: class {
        getUrl = getUrlMock
    }
}))

vi.mock("../../convex/_generated/api", () => ({
    components: {
        r2: "r2"
    }
}))

import { dbMessagesToCore } from "../../convex/lib/db_to_core_messages"

describe("dbMessagesToCore", () => {
    beforeEach(() => {
        getUrlMock.mockReset().mockResolvedValue("https://files.example/image.png")
    })

    it("uses the public asset base URL for internal image attachments when provided", async () => {
        const result = await dbMessagesToCore(
            [
                {
                    messageId: "message-1",
                    role: "user",
                    parts: [
                        {
                            type: "file",
                            data: "attachments/user-1/image.png",
                            filename: "image.png",
                            mimeType: "image/png"
                        }
                    ]
                }
            ] as never,
            [],
            {
                publicAssetBaseUrl: "https://convex.example"
            }
        )

        expect(result).toEqual([
            {
                role: "user",
                messageId: "message-1",
                content: [
                    {
                        type: "image",
                        image: "https://convex.example/r2?key=attachments%2Fuser-1%2Fimage.png",
                        mediaType: "image/png"
                    }
                ]
            }
        ])
        expect(getUrlMock).not.toHaveBeenCalled()
    })

    it("uses direct storage URLs for internal image attachments when requested for model-facing payloads", async () => {
        const result = await dbMessagesToCore(
            [
                {
                    messageId: "message-1",
                    role: "user",
                    parts: [
                        {
                            type: "file",
                            data: "attachments/user-1/image.png",
                            filename: "image.png",
                            mimeType: "image/png"
                        }
                    ]
                }
            ] as never,
            [],
            {
                publicAssetBaseUrl: "https://convex.example",
                preferDirectAssetUrls: true
            }
        )

        expect(result).toEqual([
            {
                role: "user",
                messageId: "message-1",
                content: [
                    {
                        type: "image",
                        image: "https://files.example/image.png",
                        mediaType: "image/png"
                    }
                ]
            }
        ])
        expect(getUrlMock).toHaveBeenCalledWith("attachments/user-1/image.png")
    })
})
