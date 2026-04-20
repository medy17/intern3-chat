import { describe, expect, it } from "vitest"

import {
    getConfiguredCreditLimits,
    getCreditPeriodBounds,
    getCurrentCreditPeriodKey,
    resolvePrototypeCreditCharge,
    resolveRequiredPlanForModelAccess,
    resolveRequiredPlanForPrototypeModel
} from "../../convex/lib/credits"

describe("credits", () => {
    it("uses configured monthly limits when environment values are valid", () => {
        process.env.MONTHLY_CREDITS_FREE = "42"
        process.env.MONTHLY_CREDITS_PRO = "900"
        process.env.MONTHLY_PRO_CREDITS = "15"

        expect(getConfiguredCreditLimits("free")).toEqual({ basic: 42, pro: 0 })
        expect(getConfiguredCreditLimits("pro")).toEqual({ basic: 900, pro: 15 })
    })

    it("calculates UTC credit period keys and bounds", () => {
        const timestamp = Date.UTC(2026, 2, 31, 23, 59, 59, 999)

        expect(getCurrentCreditPeriodKey(timestamp)).toBe("2026-03")
        expect(getCreditPeriodBounds(timestamp)).toEqual({
            startsAt: Date.UTC(2026, 2, 1, 0, 0, 0, 0),
            endsAt: Date.UTC(2026, 3, 1, 0, 0, 0, 0)
        })
    })

    it("charges tool usage and reasoning-enabled requests against the expected buckets", () => {
        expect(
            resolvePrototypeCreditCharge({
                providerSource: "internal",
                modelMode: "text",
                enabledTools: [],
                reasoningEffort: "high",
                prototypeCreditTier: "basic",
                prototypeCreditTierWithReasoning: "pro"
            })
        ).toEqual({
            bucket: "pro",
            feature: "chat",
            counted: true,
            units: 1
        })

        expect(
            resolvePrototypeCreditCharge({
                providerSource: "internal",
                modelMode: "text",
                enabledTools: ["web_search"],
                reasoningEffort: "off",
                prototypeCreditTier: "basic"
            })
        ).toEqual({
            bucket: "pro",
            feature: "tool",
            counted: true,
            units: 1
        })
    })

    it("does not count BYOK requests against prototype credits", () => {
        expect(
            resolvePrototypeCreditCharge({
                providerSource: "byok",
                modelMode: "image",
                enabledTools: [],
                reasoningEffort: "off"
            })
        ).toEqual({
            bucket: "none",
            feature: "image",
            counted: false,
            units: 0
        })
    })

    it("resolves required plans from prototype model tiers", () => {
        expect(
            resolveRequiredPlanForPrototypeModel({
                modelMode: "text",
                reasoningEffort: "off",
                prototypeCreditTier: "basic"
            })
        ).toBe("free")

        expect(
            resolveRequiredPlanForPrototypeModel({
                modelMode: "image",
                reasoningEffort: "off"
            })
        ).toBe("pro")

        expect(
            resolveRequiredPlanForPrototypeModel({
                modelMode: "text",
                reasoningEffort: "high",
                prototypeCreditTier: "basic",
                prototypeCreditTierWithReasoning: "pro"
            })
        ).toBe("pro")
    })

    it("resolves picker access separately from credit buckets", () => {
        expect(
            resolveRequiredPlanForModelAccess({
                reasoningEffort: "off",
                availableToPickFor: "pro"
            })
        ).toBe("pro")

        expect(
            resolveRequiredPlanForModelAccess({
                reasoningEffort: "off",
                availableToPickFor: "free",
                availableToPickForReasoningEfforts: {
                    low: "pro",
                    medium: "pro",
                    high: "pro"
                }
            })
        ).toBe("free")

        expect(
            resolveRequiredPlanForModelAccess({
                reasoningEffort: "medium",
                availableToPickFor: "free",
                availableToPickForReasoningEfforts: {
                    low: "pro",
                    medium: "pro",
                    high: "pro"
                }
            })
        ).toBe("pro")
    })
})
