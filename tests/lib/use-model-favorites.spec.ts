// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useModelFavorites } from "@/hooks/use-model-favorites"
import { getModelFavoritesStorageKey } from "@/lib/model-favorites"
import type { SharedModel } from "@/convex/lib/models"

const models = ["a", "b"].map((id) => ({
    id,
    name: id,
    adapters: [],
    abilities: []
})) as SharedModel[]

describe("shared model favorites", () => {
    beforeEach(() => window.localStorage.clear())
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it("updates mounted picker and retry consumers immediately and persists the same list", () => {
        const key = getModelFavoritesStorageKey("sync")
        window.localStorage.setItem(key, '["a"]')
        const picker = renderHook(() => useModelFavorites("sync", models, models))
        const retry = renderHook(() => useModelFavorites("sync", models, models))
        act(() => picker.result.current.toggleFavorite("b"))
        expect(retry.result.current.favoriteModelIds).toEqual(["a", "b"])
        expect(window.localStorage.getItem(key)).toBe('["a","b"]')
        act(() => picker.result.current.toggleFavorite("a"))
        expect(retry.result.current.favoriteModelIds).toEqual(["b"])
    })

    it("switches accounts without carrying over favorites and honors cross-tab updates", () => {
        window.localStorage.setItem(getModelFavoritesStorageKey("one"), '["a"]')
        const key = getModelFavoritesStorageKey("two")
        window.localStorage.setItem(key, "[]")
        const hook = renderHook(({ user }) => useModelFavorites(user, models, models), {
            initialProps: { user: "one" }
        })
        hook.rerender({ user: "two" })
        expect(hook.result.current.favoriteModelIds).toEqual([])
        act(() => {
            window.localStorage.setItem(key, '["b"]')
            window.dispatchEvent(new StorageEvent("storage", { key }))
        })
        expect(hook.result.current.favoriteModelIds).toEqual(["b"])
        expect(window.localStorage.getItem(getModelFavoritesStorageKey("one"))).toBe('["a"]')
    })

    it("shares in-memory changes when storage writes fail", () => {
        const key = getModelFavoritesStorageKey("blocked")
        window.localStorage.setItem(key, "[]")
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("Quota")
        })
        const picker = renderHook(() => useModelFavorites("blocked", models, models))
        const retry = renderHook(() => useModelFavorites("blocked", models, models))
        act(() => picker.result.current.toggleFavorite("a"))
        expect(retry.result.current.favoriteModelIds).toEqual(["a"])
    })

    it("reconciles retired favorites once the registry is available", () => {
        const key = getModelFavoritesStorageKey("retired")
        window.localStorage.setItem(key, '["old"]')
        const shared = [
            ...models,
            {
                id: "old",
                name: "Old",
                adapters: [],
                abilities: [],
                sunsetOn: "2020-01-01",
                replacementId: "a"
            }
        ] as SharedModel[]
        const hook = renderHook(({ registry }) => useModelFavorites("retired", models, registry), {
            initialProps: { registry: [] as SharedModel[] }
        })
        expect(hook.result.current.favoriteModelIds).toEqual(["old"])
        hook.rerender({ registry: shared })
        expect(hook.result.current.favoriteModelIds).toEqual(["a"])
        expect(window.localStorage.getItem(key)).toBe('["a"]')
    })
})
