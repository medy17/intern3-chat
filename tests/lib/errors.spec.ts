import { describe, expect, it } from "vitest"

import { ChatError, getMessageByErrorCode } from "@/lib/errors"

describe("ChatError", () => {
    it("returns user-visible error responses for chat/auth/api surfaces", async () => {
        const response = new ChatError("unauthorized:chat", "missing-session").toResponse()

        await expect(response.json()).resolves.toEqual({
            code: "unauthorized:chat",
            message: "You need to sign in to view this chat. Please sign in and try again.",
            cause: "missing-session"
        })
        expect(response.status).toBe(401)
    })

    it("hides database errors behind a generic response", async () => {
        const response = new ChatError("bad_request:database").toResponse()

        await expect(response.json()).resolves.toEqual({
            code: "",
            message: "Something went wrong. Please try again later."
        })
        expect(response.status).toBe(400)
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*")
    })
})

describe("getMessageByErrorCode", () => {
    it("maps known codes and falls back safely for unknown ones", () => {
        expect(getMessageByErrorCode("rate_limit:chat")).toBe(
            "You have exceeded your maximum number of messages for the day. Please try again later."
        )
        expect(getMessageByErrorCode("bad_request:stream")).toBe(
            "Something went wrong. Please try again later."
        )
    })
})
