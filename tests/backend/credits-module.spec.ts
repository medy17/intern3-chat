import { beforeEach, describe, expect, it, vi } from "vitest"

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
    internalMutation: (config: unknown) => config,
    internalQuery: (config: unknown) => config,
    mutation: (config: unknown) => config,
    query: (config: unknown) => config
}))

vi.mock("../../convex/lib/identity", () => ({
    getUserIdentity: getUserIdentityMock
}))

import {
    getMyCreditSummary,
    recordCreditEventForMessage,
    setMyPrototypeCreditPlan
} from "../../convex/credits"

const getMyCreditSummaryHandler = getMyCreditSummary as unknown as {
    handler: (ctx: any, args: any) => Promise<any>
}
const recordCreditEventForMessageHandler = recordCreditEventForMessage as unknown as {
    handler: (ctx: any, args: any) => Promise<any>
}
const setMyPrototypeCreditPlanHandler = setMyPrototypeCreditPlan as unknown as {
    handler: (ctx: any, args: any) => Promise<any>
}

type CreditAccount = Record<string, unknown>
type CreditEvent = Record<string, unknown>
type CreditsCtx = Parameters<typeof getMyCreditSummaryHandler.handler>[0]

const createCtx = (options?: {
    account?: CreditAccount
    events?: CreditEvent[]
    existingEvent?: CreditEvent
}) =>
    ({
        auth: {},
        db: {
            query: vi.fn().mockImplementation((table: string) => ({
                withIndex: vi.fn().mockReturnValue({
                    first: vi
                        .fn()
                        .mockResolvedValue(
                            table === "prototypeCreditAccounts"
                                ? (options?.account ?? null)
                                : table === "prototypeCreditEvents"
                                  ? (options?.existingEvent ?? null)
                                  : null
                        ),
                    collect: vi.fn().mockResolvedValue(options?.events ?? [])
                })
            })),
            patch: vi.fn(),
            insert: vi.fn().mockResolvedValue("new-event-id")
        }
    }) as CreditsCtx

describe("credits module", () => {
    beforeEach(() => {
        getUserIdentityMock.mockReset().mockResolvedValue({ id: "user-1" })
        Reflect.deleteProperty(process.env, "MONTHLY_CREDITS_FREE")
        Reflect.deleteProperty(process.env, "MONTHLY_CREDITS_PRO")
        Reflect.deleteProperty(process.env, "MONTHLY_PRO_CREDITS")
    })

    it("returns a resolved credit summary with defaults and usage totals", async () => {
        process.env.MONTHLY_CREDITS_PRO = "1200"
        process.env.MONTHLY_PRO_CREDITS = "25"

        const result = await getMyCreditSummaryHandler.handler(
            createCtx({
                account: {
                    userId: "user-1",
                    enabled: true,
                    plan: "pro",
                    monthlyBasicCredits: 1200,
                    monthlyProCredits: 25
                },
                events: [
                    { counted: true, bucket: "basic", units: 3 },
                    { counted: true, bucket: "pro", units: 2 },
                    { counted: false, bucket: "none", units: 0 }
                ]
            }),
            {}
        )

        expect(result).toMatchObject({
            enabled: true,
            plan: "pro",
            basic: {
                limit: 1200,
                used: 3,
                remaining: 1197
            },
            pro: {
                limit: 25,
                used: 2,
                remaining: 23
            },
            requestCounts: {
                internal: 2,
                byok: 1,
                total: 3
            }
        })
    })

    it("does not duplicate credit events for the same user/message key", async () => {
        const existingEvent = { _id: "existing-event-id" }

        const result = await recordCreditEventForMessageHandler.handler(
            createCtx({
                existingEvent
            }),
            {
                userId: "user-1",
                threadId: "thread-1",
                messageId: "assistant-1",
                messageKey: "msg-key-1",
                modelId: "shared-text",
                providerSource: "internal",
                feature: "chat",
                bucket: "basic",
                units: 1,
                counted: true
            }
        )

        expect(result).toBe("existing-event-id")
    })

    it("patches an existing account when changing the prototype credit plan", async () => {
        const ctx = createCtx({
            account: {
                _id: "account-id",
                userId: "user-1",
                enabled: true,
                plan: "free",
                monthlyBasicCredits: 20,
                monthlyProCredits: 0
            }
        })

        const result = await setMyPrototypeCreditPlanHandler.handler(ctx, {
            plan: "pro"
        })

        expect(ctx.db.patch).toHaveBeenCalledWith(
            "account-id",
            expect.objectContaining({
                userId: "user-1",
                enabled: true,
                plan: "pro",
                monthlyBasicCredits: 1500,
                monthlyProCredits: 100
            })
        )
        expect(result).toMatchObject({
            userId: "user-1",
            plan: "pro"
        })
    })
})
