import { afterEach, describe, expect, it, vi } from "vitest"

const { browserEnvMock } = vi.hoisted(() => ({
    browserEnvMock: vi.fn(() => "https://api.example.com/")
}))

vi.mock("@/lib/browser-env", () => ({
    browserEnv: browserEnvMock
}))

import {
    getCloudflareTransformedImageUrl,
    getExpandedImageUrl,
    getGeneratedImageCopyUrl,
    getGeneratedImageProxyUrl,
    getLibraryImageSources,
    getOptimizedGeneratedImageUrl,
    resetPrivateBlurFormatCacheForTests
} from "@/lib/generated-image-urls"

describe("generated-image-urls", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        resetPrivateBlurFormatCacheForTests()
    })

    it("builds the base Convex proxy URL with an encoded storage key", () => {
        expect(getGeneratedImageProxyUrl("folder/image key.png")).toBe(
            "https://api.example.com/r2?key=folder%2Fimage%20key.png"
        )
    })

    it("builds a same-origin dev proxy URL for clipboard copies", () => {
        expect(getGeneratedImageCopyUrl("folder/image key.png")).toBe(
            "/convex-http/r2?key=folder%2Fimage%20key.png"
        )
    })

    it("builds a Cloudflare transformation URL from a remote source URL", () => {
        expect(
            getCloudflareTransformedImageUrl({
                sourceUrl: "https://api.example.com/r2?key=generated%2Fkey-1",
                width: 540,
                quality: 76
            })
        ).toBe(
            "/cdn-cgi/image/fit=scale-down,width=540,quality=76,format=auto/https://api.example.com/r2?key=generated%2Fkey-1"
        )
    })

    it("bypasses Cloudflare image optimization on localhost", () => {
        vi.stubGlobal("window", {
            location: {
                hostname: "localhost"
            }
        })

        expect(
            getOptimizedGeneratedImageUrl({
                storageKey: "generated/key-1",
                aspectRatio: "9:16",
                longEdge: 720,
                quality: 80
            })
        ).toBe("https://api.example.com/r2?key=generated%2Fkey-1")
    })

    it("still returns the source URL outside the Cloudflare-served host in the Vitest dev environment", () => {
        vi.stubGlobal("window", {
            location: {
                hostname: "silkchat.app"
            }
        })

        expect(
            getOptimizedGeneratedImageUrl({
                storageKey: "generated/key-2",
                aspectRatio: "9:16",
                longEdge: 720,
                quality: 76
            })
        ).toBe("https://api.example.com/r2?key=generated%2Fkey-2")
    })

    it("builds responsive library metadata even when URLs bypass optimization", () => {
        vi.stubGlobal("window", {
            location: {
                hostname: "silkchat.app"
            }
        })

        expect(
            getLibraryImageSources({
                storageKey: "generated/key-3",
                aspectRatio: "3:4"
            })
        ).toEqual({
            src: "https://api.example.com/r2?key=generated%2Fkey-3",
            srcSet: [
                "https://api.example.com/r2?key=generated%2Fkey-3 432w",
                "https://api.example.com/r2?key=generated%2Fkey-3 540w"
            ].join(", "),
            sizes: "(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw",
            useCssBlurFallback: false
        })

        expect(
            getExpandedImageUrl({
                storageKey: "generated/key-3",
                aspectRatio: "3:4"
            })
        ).toBe("https://api.example.com/r2?key=generated%2Fkey-3")
    })

    it("falls back to css blur for hidden tiles when avif and webp are unsupported", () => {
        vi.stubGlobal("window", {
            location: {
                hostname: "silkchat.app"
            }
        })
        vi.stubGlobal("document", {
            createElement: vi.fn(() => ({
                toDataURL: vi.fn(() => "data:image/png;base64,fallback")
            }))
        })

        expect(
            getLibraryImageSources({
                storageKey: "generated/key-4",
                aspectRatio: "1:1",
                hidden: true
            })
        ).toEqual({
            src: "https://api.example.com/r2?key=generated%2Fkey-4",
            srcSet: [
                "https://api.example.com/r2?key=generated%2Fkey-4 576w",
                "https://api.example.com/r2?key=generated%2Fkey-4 720w"
            ].join(", "),
            sizes: "(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw",
            useCssBlurFallback: true
        })
    })

    it("still falls back to css blur for hidden tiles in the Vitest dev environment", () => {
        vi.stubGlobal("window", {
            location: {
                hostname: "silkchat.app"
            }
        })
        vi.stubGlobal("document", {
            createElement: vi.fn(() => ({
                toDataURL: vi.fn((mimeType: string) =>
                    mimeType === "image/avif"
                        ? "data:image/avif;base64,test"
                        : "data:image/png;base64,fallback"
                )
            }))
        })

        expect(
            getLibraryImageSources({
                storageKey: "generated/key-5",
                aspectRatio: "3:4",
                hidden: true
            })
        ).toEqual({
            src: "https://api.example.com/r2?key=generated%2Fkey-5",
            srcSet: [
                "https://api.example.com/r2?key=generated%2Fkey-5 432w",
                "https://api.example.com/r2?key=generated%2Fkey-5 540w"
            ].join(", "),
            sizes: "(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw",
            useCssBlurFallback: true
        })
    })
})
