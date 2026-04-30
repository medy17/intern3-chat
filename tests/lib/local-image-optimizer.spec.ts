import {
    buildLocalImageOptimizerUrl,
    extractLocalImageOptimizerRequestParts,
    getLocalImageOptimizerCacheKeyInput,
    isAllowedLocalImageOptimizerSource,
    parseLocalImageTransformOptions
} from "@/lib/local-image-optimizer"
import { describe, expect, it } from "vitest"

describe("local-image-optimizer", () => {
    it("builds a local optimizer URL with the mocked Cloudflare path shape", () => {
        expect(
            buildLocalImageOptimizerUrl({
                sourceUrl: "https://api.example.com/r2?key=generated%2Fkey-1",
                width: 540,
                quality: 76
            })
        ).toBe(
            "/cdn-cgi/image/fit=scale-down,width=540,quality=76,format=auto/https://api.example.com/r2?key=generated%2Fkey-1"
        )
    })

    it("parses the supported local optimizer transform options", () => {
        expect(
            parseLocalImageTransformOptions("fit=scale-down,width=540,quality=76,format=auto")
        ).toEqual({
            fit: "scale-down",
            width: 540,
            quality: 76,
            format: "auto"
        })
    })

    it("rejects unsupported transform options", () => {
        expect(parseLocalImageTransformOptions("fit=cover,width=540,quality=76,format=auto")).toBe(
            null
        )
        expect(
            parseLocalImageTransformOptions("fit=scale-down,width=0,quality=76,format=auto")
        ).toBe(null)
        expect(
            parseLocalImageTransformOptions("fit=scale-down,width=540,quality=120,format=auto")
        ).toBe(null)
    })

    it("reconstructs embedded source URLs that carry their query in the outer request", () => {
        const requestUrl = new URL(
            "http://localhost:3000/cdn-cgi/image/fit=scale-down,width=540,quality=76,format=auto/http://127.0.0.1:3210/http/r2?key=generated%2Fkey-1"
        )

        expect(extractLocalImageOptimizerRequestParts(requestUrl)).toEqual({
            optionsSegment: "fit=scale-down,width=540,quality=76,format=auto",
            sourceUrl: "http://127.0.0.1:3210/http/r2?key=generated%2Fkey-1"
        })
    })

    it("allows only Convex /r2 source URLs with a key", () => {
        expect(
            isAllowedLocalImageOptimizerSource({
                sourceUrl: "http://127.0.0.1:3210/http/r2?key=generated%2Fkey-1",
                convexApiUrl: "http://127.0.0.1:3210/http"
            })
        ).toBe(true)

        expect(
            isAllowedLocalImageOptimizerSource({
                sourceUrl: "http://127.0.0.1:3210/http/private-blur?key=generated%2Fkey-1",
                convexApiUrl: "http://127.0.0.1:3210/http"
            })
        ).toBe(false)

        expect(
            isAllowedLocalImageOptimizerSource({
                sourceUrl: "https://cdn.example.com/r2?key=generated%2Fkey-1",
                convexApiUrl: "http://127.0.0.1:3210/http"
            })
        ).toBe(false)
    })

    it("builds a stable cache key input string", () => {
        expect(
            getLocalImageOptimizerCacheKeyInput({
                sourceUrl: "http://127.0.0.1:3210/http/r2?key=generated%2Fkey-1",
                width: 540,
                quality: 76,
                format: "webp"
            })
        ).toBe(
            "v1|width=540|quality=76|format=webp|http://127.0.0.1:3210/http/r2?key=generated%2Fkey-1"
        )
    })
})
