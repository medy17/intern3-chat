import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { getUserIdentityMock } = vi.hoisted(() => ({
    getUserIdentityMock: vi.fn()
}))

vi.mock("convex/values", () => {
    const passthrough = () => ({})
    return {
        v: new Proxy(
            {},
            {
                get: () => passthrough
            }
        )
    }
})

vi.mock("../../convex/_generated/server", () => ({
    query: (config: unknown) => config
}))

vi.mock("../../convex/lib/identity", () => ({
    getUserIdentity: getUserIdentityMock
}))

vi.mock("../../convex/lib/models", () => ({
    MODELS_SHARED: [
        { id: "model-a", name: "Model A" },
        { id: "model-b", name: "Model B" }
    ]
}))

import { getMyModelUsage, getMyUsageChartData, getMyUsageStats } from "../../convex/analytics"

type AnalyticsEvent = Record<string, unknown>
type AnalyticsCtx = Parameters<typeof getMyUsageStats.handler>[0]

const createCtx = (events: AnalyticsEvent[]) =>
    ({
        auth: {},
        db: {
            query: vi.fn().mockReturnValue({
                withIndex: vi.fn().mockReturnValue({
                    filter: vi.fn().mockReturnValue({
                        collect: vi.fn().mockResolvedValue(events)
                    }),
                    collect: vi.fn().mockResolvedValue(events)
                })
            })
        }
    }) as AnalyticsCtx

describe("analytics", () => {
    beforeEach(() => {
        getUserIdentityMock.mockReset().mockResolvedValue({ id: "user-1" })
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"))
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("returns empty stats for unauthorized users", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ error: "Unauthorized" })

        const result = await getMyUsageStats.handler(createCtx([]), {
            timeframe: "7d"
        })

        expect(result).toEqual({
            modelStats: [],
            timeframe: "7d",
            totalRequests: 0,
            totalTokens: 0
        })
    })

    it("aggregates model usage stats over the requested timeframe", async () => {
        const nowDay = Math.floor(Date.now() / (24 * 60 * 60 * 1000))
        const result = await getMyUsageStats.handler(
            createCtx([
                { modelId: "model-a", p: 10, c: 5, r: 1, daysSinceEpoch: nowDay },
                { modelId: "model-a", p: 3, c: 2, r: 0, daysSinceEpoch: nowDay },
                { modelId: "model-b", p: 7, c: 4, r: 2, daysSinceEpoch: nowDay - 1 }
            ]),
            {
                timeframe: "7d"
            }
        )

        expect(result.totalRequests).toBe(3)
        expect(result.totalTokens).toBe(34)
        expect(result.modelStats).toEqual([
            {
                modelId: "model-a",
                modelName: "Model A",
                requests: 2,
                promptTokens: 13,
                completionTokens: 7,
                reasoningTokens: 1,
                totalTokens: 21
            },
            {
                modelId: "model-b",
                modelName: "Model B",
                requests: 1,
                promptTokens: 7,
                completionTokens: 4,
                reasoningTokens: 2,
                totalTokens: 13
            }
        ])
    })

    it("builds 1d hourly chart data and per-model buckets", async () => {
        const now = Date.now()
        const result = await getMyUsageChartData.handler(
            createCtx([
                {
                    modelId: "model-a",
                    p: 10,
                    c: 5,
                    r: 1,
                    _creationTime: now - 60 * 60 * 1000
                },
                {
                    modelId: "model-b",
                    p: 2,
                    c: 3,
                    r: 0,
                    _creationTime: now - 60 * 60 * 1000
                }
            ]),
            {
                timeframe: "1d"
            }
        )

        expect(result).toHaveLength(24)
        const activeHour = result.find((point) => point.totalRequests === 2)
        expect(activeHour).toMatchObject({
            totalRequests: 2,
            totalTokens: 21,
            models: {
                "model-a": {
                    requests: 1,
                    tokens: 16,
                    promptTokens: 10,
                    completionTokens: 5,
                    reasoningTokens: 1
                },
                "model-b": {
                    requests: 1,
                    tokens: 5,
                    promptTokens: 2,
                    completionTokens: 3,
                    reasoningTokens: 0
                }
            }
        })
    })

    it("returns per-model usage totals", async () => {
        const nowDay = Math.floor(Date.now() / (24 * 60 * 60 * 1000))
        const result = await getMyModelUsage.handler(
            createCtx([
                { modelId: "model-a", p: 5, c: 4, r: 1, daysSinceEpoch: nowDay },
                { modelId: "model-a", p: 2, c: 1, r: 0, daysSinceEpoch: nowDay }
            ]),
            {
                modelId: "model-a",
                timeframe: "30d"
            }
        )

        expect(result).toEqual({
            modelId: "model-a",
            requests: 2,
            promptTokens: 7,
            completionTokens: 5,
            reasoningTokens: 1,
            totalTokens: 13,
            timeframe: "30d"
        })
    })
})
