import { beforeEach, describe, expect, it, vi } from "vitest"

const {
    getSessionMock,
    getUserCreditPlanMock,
    getConfiguredCreditLimitsMock,
    setUserCreditPlanMock
} = vi.hoisted(() => {
    process.env.VITE_POSTHOG_HOST = "https://ph.example.com"
    return {
        getSessionMock: vi.fn(),
        getUserCreditPlanMock: vi.fn(),
        getConfiguredCreditLimitsMock: vi.fn(),
        setUserCreditPlanMock: vi.fn()
    }
})

vi.mock("@tanstack/react-router", () => ({
    createFileRoute: () => (config: unknown) => config
}))

vi.mock("@/lib/auth", () => ({
    auth: {
        api: {
            getSession: getSessionMock
        }
    }
}))

vi.mock("@/lib/user-subscription", () => ({
    getUserCreditPlan: getUserCreditPlanMock,
    getConfiguredCreditLimits: getConfiguredCreditLimitsMock,
    setUserCreditPlan: setUserCreditPlanMock
}))

import { Route as CreditSummaryRoute } from "@/routes/api/credit-summary"
import { Route as DevCreditPlanRoute } from "@/routes/api/dev/credit-plan"
import { Route as PosthogProxyRoute } from "@/routes/api/phr/$"

type RouteHandlers = {
    server: {
        handlers: {
            GET?: (args: { request: Request }) => Promise<Response>
            POST?: (args: { request: Request }) => Promise<Response>
        }
    }
}

const creditSummaryHandlers = (CreditSummaryRoute as unknown as RouteHandlers).server.handlers
const devCreditPlanHandlers = (DevCreditPlanRoute as unknown as RouteHandlers).server.handlers
const posthogProxyHandlers = (PosthogProxyRoute as unknown as RouteHandlers).server.handlers

describe("API routes", () => {
    beforeEach(() => {
        getSessionMock.mockReset()
        getUserCreditPlanMock.mockReset()
        getConfiguredCreditLimitsMock.mockReset()
        setUserCreditPlanMock.mockReset()
        vi.spyOn(console, "error").mockImplementation(() => {})
        Reflect.deleteProperty(process.env, "NODE_ENV")
    })

    it("returns credit summary for an authenticated user", async () => {
        getSessionMock.mockResolvedValueOnce({
            user: {
                id: "user-1"
            }
        })
        getUserCreditPlanMock.mockResolvedValueOnce("pro")
        getConfiguredCreditLimitsMock.mockReturnValueOnce({
            basic: 1500,
            pro: 100
        })

        const response = await creditSummaryHandlers.GET!({
            request: new Request("https://example.com/api/credit-summary")
        })

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({
            enabled: true,
            plan: "pro",
            basic: {
                limit: 1500
            },
            pro: {
                limit: 100
            }
        })
    })

    it("enforces auth and dev-only constraints on the credit-plan route", async () => {
        process.env.NODE_ENV = "production"

        const prodResponse = await devCreditPlanHandlers.POST!({
            request: new Request("https://example.com/api/dev/credit-plan", {
                method: "POST",
                body: JSON.stringify({ plan: "pro" })
            })
        })

        expect(prodResponse.status).toBe(404)

        process.env.NODE_ENV = "development"
        getSessionMock.mockResolvedValueOnce({
            user: {
                id: "user-1"
            }
        })

        const invalidPlanResponse = await devCreditPlanHandlers.POST!({
            request: new Request("https://example.com/api/dev/credit-plan", {
                method: "POST",
                body: JSON.stringify({ plan: "enterprise" })
            })
        })

        expect(invalidPlanResponse.status).toBe(400)
        await expect(invalidPlanResponse.json()).resolves.toEqual({
            error: "Invalid plan"
        })
    })

    it("updates the credit plan in development for authenticated users", async () => {
        process.env.NODE_ENV = "development"
        getSessionMock.mockResolvedValueOnce({
            user: {
                id: "user-1"
            }
        })
        setUserCreditPlanMock.mockResolvedValueOnce("free")

        const response = await devCreditPlanHandlers.POST!({
            request: new Request("https://example.com/api/dev/credit-plan", {
                method: "POST",
                body: JSON.stringify({ plan: "free" })
            })
        })

        expect(setUserCreditPlanMock).toHaveBeenCalledWith("user-1", "free")
        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({
            ok: true,
            plan: "free"
        })
    })

    it("proxies PostHog requests, strips host/content-length/content-encoding, and adds CORS headers", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                status: 200,
                headers: {
                    "content-type": "application/json",
                    "content-length": "999",
                    "content-encoding": "gzip",
                    "x-test": "ok"
                }
            })
        )
        vi.stubGlobal("fetch", fetchMock)

        const response = await posthogProxyHandlers.GET!({
            request: new Request("https://example.com/api/phr/capture?foo=bar", {
                headers: {
                    host: "example.com",
                    origin: "https://app.example.com",
                    authorization: "Bearer token"
                }
            })
        })

        expect(fetchMock).toHaveBeenCalledWith(
            "https://ph.example.com/capture?foo=bar",
            expect.objectContaining({
                method: "GET",
                headers: {
                    origin: "https://app.example.com",
                    authorization: "Bearer token"
                }
            })
        )
        expect(response.headers.get("content-length")).toBeNull()
        expect(response.headers.get("content-encoding")).toBeNull()
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com")
        expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true")
        expect(await response.arrayBuffer()).toBeInstanceOf(ArrayBuffer)
    })
})
