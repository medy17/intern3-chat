import { beforeEach, describe, expect, it, vi } from "vitest"

const { corsRouterMock, httpRouterMock } = vi.hoisted(() => ({
    corsRouterMock: vi.fn(),
    httpRouterMock: vi.fn()
}))

vi.mock("convex/server", () => ({
    httpRouter: httpRouterMock
}))

vi.mock("convex-helpers/server/cors", () => ({
    corsRouter: corsRouterMock
}))

vi.mock("../../convex/attachments", () => ({
    getFile: "getFileHandler",
    uploadFile: "uploadFileHandler"
}))

vi.mock("../../convex/chat_http/get.route", () => ({
    chatGET: "chatGetHandler"
}))

vi.mock("../../convex/chat_http/post.route", () => ({
    chatPOST: "chatPostHandler"
}))

vi.mock("../../convex/import_jobs_http", () => ({
    uploadImportSource: "uploadImportHandler"
}))

vi.mock("../../convex/speech_to_text", () => ({
    transcribeAudio: "transcribeHandler"
}))

describe("convex/http", () => {
    beforeEach(() => {
        corsRouterMock.mockReset()
        httpRouterMock.mockReset()
    })

    it("normalizes allowed origins and registers the expected HTTP routes", async () => {
        vi.stubEnv("VITE_BETTER_AUTH_URL", "app.example.com")
        vi.stubEnv("VERCEL_URL", "https://preview.example.com")

        const corsRoute = vi.fn()
        const httpRoute = vi.fn()
        const http = { route: httpRoute }

        httpRouterMock.mockReturnValue(http)
        corsRouterMock.mockReturnValue({
            route: corsRoute
        })

        const module = await import("../../convex/http")

        expect(httpRouterMock).toHaveBeenCalledTimes(1)
        expect(corsRouterMock).toHaveBeenCalledWith(http, {
            allowedOrigins: [
                "https://app.example.com",
                "https://preview.example.com",
                "http://localhost:3000",
                "https://localhost:3000"
            ],
            allowedHeaders: ["Content-Type", "Authorization"],
            allowCredentials: true
        })

        expect(corsRoute).toHaveBeenCalledTimes(5)
        expect(corsRoute).toHaveBeenNthCalledWith(1, {
            path: "/chat",
            method: "POST",
            handler: "chatPostHandler"
        })
        expect(corsRoute).toHaveBeenNthCalledWith(2, {
            path: "/chat",
            method: "GET",
            handler: "chatGetHandler"
        })
        expect(corsRoute).toHaveBeenNthCalledWith(3, {
            path: "/upload",
            method: "POST",
            handler: "uploadFileHandler"
        })
        expect(corsRoute).toHaveBeenNthCalledWith(4, {
            path: "/import-upload",
            method: "POST",
            handler: "uploadImportHandler"
        })
        expect(corsRoute).toHaveBeenNthCalledWith(5, {
            path: "/transcribe",
            method: "POST",
            handler: "transcribeHandler"
        })

        expect(httpRoute).toHaveBeenCalledWith({
            path: "/r2",
            method: "GET",
            handler: "getFileHandler"
        })
        expect(module.default).toBe(http)
    })
})
