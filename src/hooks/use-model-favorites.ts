import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react"
import type { SharedModel } from "@/convex/lib/models"
import type { DisplayModel } from "@/lib/models-providers-shared"
import {
    getModelFavoritesStorageKey,
    reconcileFavoriteModelIds,
    resolveFavoriteModelIds
} from "@/lib/model-favorites"

const FAVORITES_CHANGED_EVENT = "silkchat:model-favorites-changed"
const memoryFallback = new Map<string, string>()

const readFavorites = (key: string | null) => {
    if (!key || typeof window === "undefined") return null
    if (memoryFallback.has(key)) return memoryFallback.get(key) ?? null
    try {
        return window.localStorage.getItem(key)
    } catch {
        return memoryFallback.get(key) ?? null
    }
}

const writeFavorites = (key: string, ids: string[]) => {
    const value = JSON.stringify(ids)
    if (readFavorites(key) === value) return
    try {
        window.localStorage.setItem(key, value)
        memoryFallback.delete(key)
    } catch {
        memoryFallback.set(key, value)
    }
    // Storage events only notify other tabs; this also updates mounted retry menus.
    window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT, { detail: key }))
}

export function useModelFavorites(
    userId: string | undefined,
    availableModels: DisplayModel[],
    sharedModels: SharedModel[]
) {
    const key = userId ? getModelFavoritesStorageKey(userId) : null
    const subscribe = useCallback(
        (notify: () => void) => {
            const onStorage = (event: StorageEvent) => {
                if (event.key === key || event.key === null) {
                    if (key) memoryFallback.delete(key)
                    notify()
                }
            }
            const onChange = (event: Event) => {
                if ((event as CustomEvent<string>).detail === key) notify()
            }
            window.addEventListener("storage", onStorage)
            window.addEventListener(FAVORITES_CHANGED_EVENT, onChange)
            return () => {
                window.removeEventListener("storage", onStorage)
                window.removeEventListener(FAVORITES_CHANGED_EVENT, onChange)
            }
        },
        [key]
    )
    const storedValue = useSyncExternalStore(
        subscribe,
        useCallback(() => readFavorites(key), [key]),
        () => null
    )
    const favoriteModelIds = useMemo(() => resolveFavoriteModelIds(storedValue), [storedValue])

    useEffect(() => {
        if (!key || sharedModels.length === 0 || readFavorites(key) !== storedValue) return
        const reconciled = reconcileFavoriteModelIds({
            favoriteModelIds,
            sharedModels,
            availableModelIds: new Set(availableModels.map((model) => model.id))
        })
        if (
            reconciled.length !== favoriteModelIds.length ||
            reconciled.some((id, index) => id !== favoriteModelIds[index])
        ) {
            writeFavorites(key, reconciled)
        }
    }, [key, storedValue, favoriteModelIds, availableModels, sharedModels])

    const toggleFavorite = useCallback(
        (modelId: string) => {
            if (!key) return
            const current = resolveFavoriteModelIds(readFavorites(key))
            writeFavorites(
                key,
                current.includes(modelId)
                    ? current.filter((id) => id !== modelId)
                    : [...current, modelId]
            )
        },
        [key]
    )

    return { favoriteModelIds, toggleFavorite }
}
