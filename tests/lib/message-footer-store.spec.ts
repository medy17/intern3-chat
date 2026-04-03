// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"

const loadStore = async () => {
    vi.resetModules()
    return await import("@/lib/message-footer-store")
}

describe("message-footer-store", () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it("defaults to simple", async () => {
        const { useMessageFooterStore } = await loadStore()

        await useMessageFooterStore.persist.rehydrate()

        expect(useMessageFooterStore.getState().footerMode).toBe("simple")
    })

    it("restores persisted values", async () => {
        localStorage.setItem(
            "message-footer-store",
            JSON.stringify({
                state: {
                    footerMode: "extra-nerdy"
                },
                version: 0
            })
        )

        const { useMessageFooterStore } = await loadStore()

        await useMessageFooterStore.persist.rehydrate()

        expect(useMessageFooterStore.getState().footerMode).toBe("extra-nerdy")
    })

    it("falls back to simple for invalid persisted values", async () => {
        localStorage.setItem(
            "message-footer-store",
            JSON.stringify({
                state: {
                    footerMode: "broken"
                },
                version: 0
            })
        )

        const { useMessageFooterStore } = await loadStore()

        await useMessageFooterStore.persist.rehydrate()

        expect(useMessageFooterStore.getState().footerMode).toBe("simple")
    })
})
