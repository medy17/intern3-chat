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

    it("clears stale jwks and retries recoverable decrypt failures", async () => {
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

    it("retries get-session requests after a recoverable 5xx response", async () => {
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
})
