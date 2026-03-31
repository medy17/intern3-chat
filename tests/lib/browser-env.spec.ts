import { describe, expect, it } from "vitest"

import { browserEnv, optionalBrowserEnv } from "@/lib/browser-env"

describe("browser-env", () => {
    it("returns configured browser env values and exposes undefined for optional ones", () => {
        expect(browserEnv("VITE_CONVEX_URL")).toEqual(expect.any(String))
        expect(browserEnv("VITE_CONVEX_URL").length).toBeGreaterThan(0)
        expect([undefined, ""]).toContain(optionalBrowserEnv("VITE_POSTHOG_KEY"))
    })

    it("throws when a caller treats an optional missing value as required", () => {
        expect(() => browserEnv("VITE_POSTHOG_KEY")).toThrow(
            "Missing environment variable(browser): VITE_POSTHOG_KEY"
        )
    })
})
