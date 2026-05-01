export type PrototypeCreditPlan = "free" | "pro"
export type PrototypeCreditBucket = "basic" | "pro" | "none"
export type PrototypeAccessPlan = PrototypeCreditPlan
export type PrototypeCreditProviderSource =
    | "internal"
    | "byok"
    | "openrouter"
    | "custom"
    | "unknown"
export type PrototypeCreditFeature = "chat" | "image" | "tool"
export type PrototypeReasoningEffort = "off" | "low" | "medium" | "high"
export type PrototypeToolFundingSource = "byok" | "deployment" | "none"
export type PrototypeReasoningAccessPlanMap = Partial<
    Record<PrototypeReasoningEffort, PrototypeAccessPlan>
>

export const DEFAULT_PROTOTYPE_CREDITS: Record<
    PrototypeCreditPlan,
    {
        basic: number
        pro: number
    }
> = {
    free: {
        basic: 20,
        pro: 0
    },
    pro: {
        basic: 1500,
        pro: 100
    }
}

const parseCreditLimit = (value: string | undefined, fallback: number) => {
    if (!value) return fallback

    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export const getConfiguredCreditLimits = (plan: PrototypeCreditPlan) => {
    const freeBasicCredits = parseCreditLimit(
        process.env.MONTHLY_CREDITS_FREE,
        DEFAULT_PROTOTYPE_CREDITS.free.basic
    )
    const proBasicCredits = parseCreditLimit(
        process.env.MONTHLY_CREDITS_PRO,
        DEFAULT_PROTOTYPE_CREDITS.pro.basic
    )
    const proCredits = parseCreditLimit(
        process.env.MONTHLY_PRO_CREDITS,
        DEFAULT_PROTOTYPE_CREDITS.pro.pro
    )

    if (plan === "pro") {
        return {
            basic: proBasicCredits,
            pro: proCredits
        }
    }

    return {
        basic: freeBasicCredits,
        pro: 0
    }
}

export const getCurrentCreditPeriodKey = (timestamp = Date.now()) => {
    const date = new Date(timestamp)
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, "0")
    return `${year}-${month}`
}

export const getCreditPeriodBounds = (timestamp = Date.now()) => {
    const date = new Date(timestamp)
    const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0)
    const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0)
    return {
        startsAt: start,
        endsAt: end
    }
}

export const resolvePrototypeCreditCharge = ({
    providerSource,
    modelMode,
    enabledTools,
    reasoningEffort,
    prototypeCreditTier,
    prototypeCreditTierWithReasoning
}: {
    providerSource: PrototypeCreditProviderSource
    modelMode: "text" | "image"
    enabledTools: string[]
    reasoningEffort: PrototypeReasoningEffort
    prototypeCreditTier?: Exclude<PrototypeCreditBucket, "none">
    prototypeCreditTierWithReasoning?: Exclude<PrototypeCreditBucket, "none">
}) => {
    const feature: PrototypeCreditFeature = modelMode === "image" ? "image" : "chat"

    const countsAgainstCredits = providerSource === "internal" || providerSource === "unknown"
    if (!countsAgainstCredits) {
        return {
            bucket: "none" as const,
            feature,
            counted: false,
            units: 0
        }
    }

    const isReasoningEnabled = reasoningEffort !== "off"
    const bucket =
        isReasoningEnabled && prototypeCreditTierWithReasoning
            ? prototypeCreditTierWithReasoning
            : (prototypeCreditTier ?? (modelMode === "image" ? "pro" : "basic"))

    return {
        bucket,
        feature,
        counted: true,
        units: 1
    }
}

export const resolvePrototypeToolCreditCharge = ({
    fundingSource
}: {
    fundingSource: PrototypeToolFundingSource
}) => {
    if (fundingSource !== "deployment") {
        return {
            providerSource: "byok" as const,
            bucket: "none" as const,
            feature: "tool" as const,
            counted: false,
            units: 0
        }
    }

    return {
        providerSource: "internal" as const,
        bucket: "basic" as const,
        feature: "tool" as const,
        counted: true,
        units: 1
    }
}

export const resolveRequiredPlanForPrototypeModel = ({
    modelMode,
    reasoningEffort,
    prototypeCreditTier,
    prototypeCreditTierWithReasoning
}: {
    modelMode: "text" | "image"
    reasoningEffort: PrototypeReasoningEffort
    prototypeCreditTier?: Exclude<PrototypeCreditBucket, "none">
    prototypeCreditTierWithReasoning?: Exclude<PrototypeCreditBucket, "none">
}): PrototypeCreditPlan => {
    if (reasoningEffort !== "off" && prototypeCreditTierWithReasoning) {
        return prototypeCreditTierWithReasoning === "pro" ? "pro" : "free"
    }

    const bucket = prototypeCreditTier ?? (modelMode === "image" ? "pro" : "basic")
    return bucket === "pro" ? "pro" : "free"
}

export const resolveRequiredPlanForModelAccess = ({
    reasoningEffort,
    availableToPickFor,
    availableToPickForReasoningEfforts
}: {
    reasoningEffort: PrototypeReasoningEffort
    availableToPickFor?: PrototypeAccessPlan
    availableToPickForReasoningEfforts?: PrototypeReasoningAccessPlanMap
}): PrototypeAccessPlan => {
    const basePlan = availableToPickFor ?? "pro"
    return availableToPickForReasoningEfforts?.[reasoningEffort] ?? basePlan
}
