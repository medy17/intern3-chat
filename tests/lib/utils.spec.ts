// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"

import { copyImageUrlToClipboard } from "@/lib/utils"

describe("copyImageUrlToClipboard", () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it("writes png images directly to the clipboard", async () => {
        const writeMock = vi.fn().mockResolvedValue(undefined)
        const clipboardItemMock = vi.fn()
        class ClipboardItemMock {
            items: Record<string, Blob>

            constructor(items: Record<string, Blob>) {
                this.items = items
                clipboardItemMock(items)
            }
        }

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(new Blob(["png"], { type: "image/png" }), {
                    headers: {
                        "content-type": "image/png"
                    }
                })
            )
        )
        vi.stubGlobal("navigator", {
            clipboard: {
                write: writeMock
            }
        })
        vi.stubGlobal("ClipboardItem", ClipboardItemMock)

        await copyImageUrlToClipboard("/convex-http/r2?key=image")

        expect(writeMock).toHaveBeenCalledTimes(1)
        expect(clipboardItemMock).toHaveBeenCalledWith({
            "image/png": expect.any(Blob)
        })
    })

    it("falls back to png encoding when the original mime type write fails", async () => {
        const writeMock = vi
            .fn()
            .mockRejectedValueOnce(new Error("unsupported mime"))
            .mockResolvedValueOnce(undefined)
        const clipboardItemMock = vi.fn()
        const drawImageMock = vi.fn()
        const toBlobMock = vi.fn((callback: BlobCallback) =>
            callback(new Blob(["png"], { type: "image/png" }))
        )
        const originalCreateElement = document.createElement.bind(document)
        class ClipboardItemMock {
            items: Record<string, Blob>

            constructor(items: Record<string, Blob>) {
                this.items = items
                clipboardItemMock(items)
            }
        }

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(new Blob(["jpeg"], { type: "image/jpeg" }), {
                    headers: {
                        "content-type": "image/jpeg"
                    }
                })
            )
        )
        vi.stubGlobal("navigator", {
            clipboard: {
                write: writeMock
            }
        })
        vi.stubGlobal("ClipboardItem", ClipboardItemMock)
        vi.stubGlobal(
            "createImageBitmap",
            vi.fn().mockResolvedValue({
                width: 10,
                height: 20,
                close: vi.fn()
            })
        )
        vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
            if (tagName === "canvas") {
                return {
                    width: 0,
                    height: 0,
                    getContext: vi.fn(() => ({
                        drawImage: drawImageMock
                    })),
                    toBlob: toBlobMock
                } as unknown as HTMLCanvasElement
            }

            return originalCreateElement(tagName)
        })

        await copyImageUrlToClipboard("/convex-http/r2?key=image")

        expect(writeMock).toHaveBeenCalledTimes(2)
        expect(drawImageMock).toHaveBeenCalledTimes(1)
        expect(clipboardItemMock).toHaveBeenLastCalledWith({
            "image/png": expect.any(Blob)
        })
    })
})
