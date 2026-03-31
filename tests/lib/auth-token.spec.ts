import { beforeEach, describe, expect, it, vi } from "vitest"

const { fetchMock } = vi.hoisted(() => ({
    fetchMock: vi.fn()
}))

vi.mock("@/lib/auth-client", () => ({
    authClient: {
        $fetch: fetchMock
    }
}))

import { isJwtToken, resolveJwtToken } from "@/lib/auth-token"

const createJwt = (payload: Record<string, unknown>) => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url")
    return `${header}.${encodedPayload}.signature`
}

describe("auth-token", () => {
    beforeEach(() => {
        fetchMock.mockReset()
    })

    it("accepts only structurally valid JWTs", () => {
        expect(isJwtToken(createJwt({ sub: "user-1" }))).toBe(true)
        expect(isJwtToken("not-a-jwt")).toBe(false)
        expect(isJwtToken("a..c")).toBe(false)
        expect(isJwtToken("a.b")).toBe(false)
        expect(isJwtToken(undefined)).toBe(false)
    })

    it("reuses an existing valid token without fetching", async () => {
        const token = createJwt({ sub: "user-1" })

        await expect(resolveJwtToken(`  ${token}  `)).resolves.toBe(token)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("refreshes the token when forced", async () => {
        const currentToken = createJwt({ sub: "stale-user" })
        const refreshedToken = createJwt({ sub: "fresh-user" })

        fetchMock.mockResolvedValue({
            data: {
                token: ` ${refreshedToken} `
            }
        })

        await expect(resolveJwtToken(currentToken, { forceRefresh: true })).resolves.toBe(
            refreshedToken
        )
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("falls back to the current valid token when refresh fails", async () => {
        const token = createJwt({ sub: "user-1" })
        fetchMock.mockRejectedValue(new Error("network"))

        await expect(resolveJwtToken(token, { forceRefresh: true })).resolves.toBe(token)
    })

    it("returns undefined when neither the current nor fetched token is valid", async () => {
        fetchMock.mockResolvedValue({
            data: {
                token: "invalid"
            }
        })

        await expect(resolveJwtToken("still-invalid")).resolves.toBeUndefined()
    })
})
