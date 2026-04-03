type AssistantMessageMetadata = {
    modelName?: string
    displayProvider?: string
    runtimeProvider?: string
    reasoningEffort?: "off" | "low" | "medium" | "high"
    promptTokens?: number
    completionTokens?: number
    reasoningTokens?: number
    totalTokens?: number
    estimatedCostUsd?: number
    estimatedPromptCostUsd?: number
    estimatedCompletionCostUsd?: number
    serverDurationMs?: number
    timeToFirstVisibleMs?: number
}

const isValidNonNegativeNumber = (value: number | undefined): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0

const formatSeconds = (milliseconds: number) => `${(milliseconds / 1000).toFixed(2)} sec`

const formatNumber = (value: number) => Math.round(value).toLocaleString()

const formatRate = (value: number) => `${value.toFixed(2)} tok/sec`

const formatUsdValue = (value: number) =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: value < 0.01 ? 6 : 4,
        maximumFractionDigits: value < 0.01 ? 6 : 4
    }).format(value)

export const deriveMessageFooterStats = (metadata?: AssistantMessageMetadata) => {
    if (!metadata) return null

    const promptTokens = isValidNonNegativeNumber(metadata.promptTokens)
        ? metadata.promptTokens
        : undefined
    const completionTokens = isValidNonNegativeNumber(metadata.completionTokens)
        ? metadata.completionTokens
        : undefined
    const reasoningTokens =
        isValidNonNegativeNumber(metadata.reasoningTokens) && metadata.reasoningTokens > 0
            ? metadata.reasoningTokens
            : undefined
    const regularOutputTokens =
        completionTokens !== undefined
            ? Math.max(0, completionTokens - (reasoningTokens ?? 0))
            : undefined
    const totalTokens = isValidNonNegativeNumber(metadata.totalTokens)
        ? metadata.totalTokens
        : promptTokens !== undefined && completionTokens !== undefined
          ? promptTokens + completionTokens
          : undefined
    const estimatedCostUsd = isValidNonNegativeNumber(metadata.estimatedCostUsd)
        ? metadata.estimatedCostUsd
        : undefined
    const estimatedPromptCostUsd = isValidNonNegativeNumber(metadata.estimatedPromptCostUsd)
        ? metadata.estimatedPromptCostUsd
        : undefined
    const estimatedCompletionCostUsd = isValidNonNegativeNumber(metadata.estimatedCompletionCostUsd)
        ? metadata.estimatedCompletionCostUsd
        : undefined

    const timeToFirstVisibleMs = isValidNonNegativeNumber(metadata.timeToFirstVisibleMs)
        ? metadata.timeToFirstVisibleMs
        : undefined
    const serverDurationMs = isValidNonNegativeNumber(metadata.serverDurationMs)
        ? metadata.serverDurationMs
        : undefined

    let tokensPerSecond: number | undefined
    if (completionTokens !== undefined && serverDurationMs !== undefined) {
        const generationMs =
            timeToFirstVisibleMs !== undefined
                ? Math.max(serverDurationMs - timeToFirstVisibleMs, 0)
                : serverDurationMs
        if (generationMs > 0) {
            const computedRate = (completionTokens / generationMs) * 1000
            if (Number.isFinite(computedRate) && computedRate > 0) {
                tokensPerSecond = computedRate
            }
        }
    }

    return {
        modelName: metadata.modelName,
        displayProvider: metadata.displayProvider,
        runtimeProvider: metadata.runtimeProvider,
        reasoningEffort: metadata.reasoningEffort,
        promptTokens,
        completionTokens,
        reasoningTokens,
        regularOutputTokens,
        totalTokens,
        estimatedCostUsd,
        estimatedPromptCostUsd,
        estimatedCompletionCostUsd,
        timeToFirstVisibleMs,
        tokensPerSecond
    }
}

export const formatFooterTokenTotal = (value: number | undefined) =>
    value !== undefined ? `${formatNumber(value)} tokens` : undefined

export const formatFooterTokenBreakdown = (
    label: "regular" | "reasoning" | "in" | "out",
    value: number | undefined
) => (value !== undefined ? `${formatNumber(value)} ${label}` : undefined)

export const formatFooterTTFT = (value: number | undefined) =>
    value !== undefined ? `TTFT ${formatSeconds(value)}` : undefined

export const formatFooterSpeed = (value: number | undefined) =>
    value !== undefined ? formatRate(value) : undefined

export const formatFooterCost = (value: number | undefined) =>
    value !== undefined ? `Est. ${formatUsdValue(value)}` : undefined

export const formatFooterCostBreakdown = (label: "in" | "out", value: number | undefined) =>
    value !== undefined ? `${formatUsdValue(value)} ${label}` : undefined

export const formatFooterReasoningEffort = (
    value: AssistantMessageMetadata["reasoningEffort"] | undefined
) => {
    switch (value) {
        case "off":
            return "Off"
        case "low":
            return "Low"
        case "medium":
            return "Medium"
        case "high":
            return "High"
        default:
            return undefined
    }
}

export type { AssistantMessageMetadata }
