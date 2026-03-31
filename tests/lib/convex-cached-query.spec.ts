// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { usePaginatedQueryMock, useQueryMock } = vi.hoisted(() => ({
    usePaginatedQueryMock: vi.fn(),
    useQueryMock: vi.fn()
}))

vi.mock("convex-helpers/react/cache", () => ({
    useQuery: useQueryMock
}))

vi.mock("convex/react", () => ({
    usePaginatedQuery: usePaginatedQueryMock
}))

import {
    clearDiskCache,
    useDiskCachedPaginatedQuery,
    useDiskCachedQuery
} from "@/lib/convex-cached-query"

describe("convex-cached-query", () => {
    beforeEach(() => {
        localStorage.clear()
        usePaginatedQueryMock.mockReset()
        useQueryMock.mockReset()
        vi.useFakeTimers()
        vi.spyOn(console, "warn").mockImplementation(() => {})
    })

    it("persists live query results while returning the freshest server value", () => {
        useQueryMock.mockReturnValue([{ id: "item-1" }, { id: "item-2" }, { id: "item-3" }])

        const { result } = renderHook(() =>
            useDiskCachedQuery(
                "query-ref" as never,
                {
                    key: "items",
                    maxItems: 2,
                    default: []
                },
                { threadId: "thread-1" } as never
            )
        )

        expect(result.current).toEqual([{ id: "item-1" }, { id: "item-2" }, { id: "item-3" }])
        expect(JSON.parse(localStorage.getItem("CVX_DISK_CACHE:items") || "null")).toEqual([
            { id: "item-1" },
            { id: "item-2" }
        ])
    })

    it("falls back to disk cache and reacts to storage events", () => {
        localStorage.setItem("CVX_DISK_CACHE:items", JSON.stringify([{ id: "cached-1" }]))
        useQueryMock.mockReturnValue(undefined)

        const { result } = renderHook(() =>
            useDiskCachedQuery(
                "query-ref" as never,
                {
                    key: "items",
                    default: []
                },
                { threadId: "thread-1" } as never
            )
        )

        expect(result.current).toEqual([{ id: "cached-1" }])

        act(() => {
            window.dispatchEvent(
                new StorageEvent("storage", {
                    key: "CVX_DISK_CACHE:items",
                    newValue: JSON.stringify([{ id: "cached-2" }])
                })
            )
        })

        expect(result.current).toEqual([{ id: "cached-2" }])
    })

    it("returns the provided default on skip unless forceCache is enabled", () => {
        localStorage.setItem("CVX_DISK_CACHE:items", JSON.stringify([{ id: "cached-1" }]))
        useQueryMock.mockReturnValue(undefined)

        const { result, rerender } = renderHook(
            (forceCache: boolean) =>
                useDiskCachedQuery(
                    "query-ref" as never,
                    {
                        key: "items",
                        default: [],
                        forceCache
                    },
                    "skip" as never
                ),
            {
                initialProps: false
            }
        )

        expect(result.current).toEqual([])

        rerender(true)

        expect(result.current).toEqual([{ id: "cached-1" }])
    })

    it("debounces empty exhausted paginated results before dropping the disk cache", () => {
        localStorage.setItem("CVX_DISK_CACHE:pages", JSON.stringify([{ id: "cached-1" }]))

        const paginatedState = {
            results: [],
            status: "LoadingFirstPage",
            loadMore: vi.fn()
        }

        usePaginatedQueryMock.mockImplementation(() => paginatedState)

        const { result, rerender } = renderHook(() =>
            useDiskCachedPaginatedQuery(
                "query-ref" as never,
                { key: "pages" },
                { folderId: "folder-1" } as never,
                { initialNumItems: 10 }
            )
        )

        expect(result.current.results).toEqual([{ id: "cached-1" }])

        paginatedState.status = "Exhausted"
        rerender()

        act(() => {
            vi.advanceTimersByTime(499)
        })
        expect(result.current.results).toEqual([{ id: "cached-1" }])

        act(() => {
            vi.advanceTimersByTime(1)
        })
        expect(result.current.results).toEqual([])
    })

    it("clears only the disk cache keys owned by the helper", () => {
        localStorage.setItem("CVX_DISK_CACHE:one", "1")
        localStorage.setItem("CVX_DISK_CACHE:two", "2")
        localStorage.setItem("unrelated", "3")

        clearDiskCache()

        expect(localStorage.getItem("CVX_DISK_CACHE:one")).toBeNull()
        expect(localStorage.getItem("CVX_DISK_CACHE:two")).toBeNull()
        expect(localStorage.getItem("unrelated")).toBe("3")
    })
})
