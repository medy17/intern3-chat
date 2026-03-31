import { afterEach, describe, expect, it, vi } from "vitest"

const { browserEnvMock } = vi.hoisted(() => ({
    browserEnvMock: vi.fn(() => "https://api.example.com/")
}))

vi.mock("@/lib/browser-env", () => ({
    browserEnv: browserEnvMock
}))

import {
    getExpandedImageUrl,
    getGeneratedImageProxyUrl,
    getLibraryImageSources,
    getOptimizedGeneratedImageUrl
} from "@/lib/generated-image-urls"

describe("generated-image-urls", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("builds the base Convex proxy URL with an encoded storage key", () => {
        expect(getGeneratedImageProxyUrl("folder/image key.png")).toBe(
            "https://api.example.com/r2?key=folder%2Fimage%20key.png"
        )
    })

    it("bypasses Vercel image optimization on localhost", () => {
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

    it("still returns the source URL in the Vitest dev environment", () => {
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
            sizes: "(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
        })

        expect(
            getExpandedImageUrl({
                storageKey: "generated/key-3",
                aspectRatio: "3:4"
            })
        ).toBe("https://api.example.com/r2?key=generated%2Fkey-3")
    })
})
