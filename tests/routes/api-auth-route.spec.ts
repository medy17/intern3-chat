import { beforeEach, describe, expect, it, vi } from "vitest"

const { authHandlerMock, deleteExecuteMock, deleteMock } = vi.hoisted(() => ({
    authHandlerMock: vi.fn(),
    deleteExecuteMock: vi.fn(),
    deleteMock: vi.fn()
}))

vi.mock("@/database/db", () => ({
    db: {
        delete: deleteMock
    }
}))

vi.mock("@/database/schema", () => ({
    jwkss: { table: "jwkss" }
}))

vi.mock("@/lib/auth", () => ({
    auth: {
        handler: authHandlerMock
    }
}))

vi.mock("@tanstack/react-router", () => ({
    createFileRoute: () => (config: unknown) => config
}))

import { Route } from "@/routes/api/auth/$"

const routeHandlers = (
    Route as unknown as {
        server: {
            handlers: {
                GET: (args: { request: Request }) => Promise<Response>
                POST: (args: { request: Request }) => Promise<Response>
            }
        }
    }
).server.handlers

describe("api auth route", () => {
    beforeEach(() => {
        authHandlerMock.mockReset()
        deleteExecuteMock.mockReset()
        deleteMock.mockReset().mockReturnValue({
            execute: deleteExecuteMock
        })
    })

    it("recovers from stale JWKS decryption failures by deleting keys and retrying", async () => {
        const recoveredResponse = new Response("ok", { status: 200 })

        authHandlerMock
            .mockRejectedValueOnce(new Error("Failed to decrypt private private key"))
            .mockResolvedValueOnce(recoveredResponse)

        const response = await routeHandlers.GET({
            request: new Request("https://example.com/api/auth/sign-in")
        })

        expect(response).toBe(recoveredResponse)
        expect(deleteMock).toHaveBeenCalledWith({ table: "jwkss" })
        expect(deleteExecuteMock).toHaveBeenCalledTimes(1)
        expect(authHandlerMock).toHaveBeenCalledTimes(2)
    })

    it("retries get-session requests after a 5xx response and clears stale JWKS first", async () => {
        authHandlerMock
            .mockResolvedValueOnce(new Response("broken", { status: 500 }))
            .mockResolvedValueOnce(new Response("recovered", { status: 200 }))

        const response = await routeHandlers.GET({
            request: new Request("https://example.com/api/auth/get-session")
        })

        expect(response.status).toBe(200)
        await expect(response.text()).resolves.toBe("recovered")
        expect(deleteExecuteMock).toHaveBeenCalledTimes(1)
        expect(authHandlerMock).toHaveBeenCalledTimes(2)
    })

    it("does not swallow non-recoverable auth handler errors", async () => {
        authHandlerMock.mockRejectedValueOnce(new Error("some other auth failure"))

        await expect(
            routeHandlers.POST({
                request: new Request("https://example.com/api/auth/sign-out", {
                    method: "POST"
                })
            })
        ).rejects.toThrow("some other auth failure")

        expect(deleteExecuteMock).not.toHaveBeenCalled()
    })

    it("returns the auth handler response directly when no recovery is needed", async () => {
        const response = new Response("fine", { status: 200 })
        authHandlerMock.mockResolvedValueOnce(response)

        const result = await routeHandlers.GET({
            request: new Request("https://example.com/api/auth/callback")
        })

        expect(result).toBe(response)
        expect(authHandlerMock).toHaveBeenCalledTimes(1)
        expect(deleteExecuteMock).not.toHaveBeenCalled()
    })
})
