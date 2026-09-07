import { normalizeSpacing } from "../shared"
import type { ParsedThreadImportDocument } from "../types"

interface MessagePair {
    jsonIndex: number
    markdownIndex: number
}

const normalizeForCompare = (value: string) =>
    normalizeSpacing(value).replace(/\s+/g, " ").trim().toLowerCase()

const toTokenSet = (value: string) => {
    const tokens = normalizeForCompare(value).match(/[a-z0-9]+/g)
    return new Set(tokens ?? [])
}

const jaccard = (a: Set<string>, b: Set<string>) => {
    if (a.size === 0 && b.size === 0) return 1
    if (a.size === 0 || b.size === 0) return 0

    let intersection = 0
    for (const token of a) {
        if (b.has(token)) intersection += 1
    }

    const union = a.size + b.size - intersection
    return union > 0 ? intersection / union : 0
}

const isComparableMessage = (
    jsonMessage: ParsedThreadImportDocument["messages"][number],
    markdownMessage: ParsedThreadImportDocument["messages"][number]
) => {
    if (jsonMessage.role !== markdownMessage.role) return false

    const jsonNormalized = normalizeForCompare(jsonMessage.text)
    const markdownNormalized = normalizeForCompare(markdownMessage.text)
    if (!jsonNormalized || !markdownNormalized) {
        return jsonNormalized === markdownNormalized
    }

    if (jsonNormalized === markdownNormalized) return true
    if (
        jsonNormalized.length >= 48 &&
        markdownNormalized.length >= 48 &&
        (jsonNormalized.includes(markdownNormalized) || markdownNormalized.includes(jsonNormalized))
    ) {
        return true
    }

    const similarity = jaccard(toTokenSet(jsonMessage.text), toTokenSet(markdownMessage.text))
    return similarity >= 0.72
}

const computePairs = (
    jsonMessages: ParsedThreadImportDocument["messages"],
    markdownMessages: ParsedThreadImportDocument["messages"]
) => {
    const n = jsonMessages.length
    const m = markdownMessages.length
    const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0))

    for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
            if (isComparableMessage(jsonMessages[i], markdownMessages[j])) {
                dp[i][j] = 1 + dp[i + 1][j + 1]
            } else {
                dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
            }
        }
    }

    const pairs: MessagePair[] = []
    let i = 0
    let j = 0
    while (i < n && j < m) {
        const messagesMatch = isComparableMessage(jsonMessages[i], markdownMessages[j])
        if (messagesMatch && dp[i][j] === dp[i + 1][j + 1] + 1) {
            pairs.push({ jsonIndex: i, markdownIndex: j })
            i += 1
            j += 1
            continue
        }

        if (dp[i + 1][j] >= dp[i][j + 1]) {
            i += 1
        } else {
            j += 1
        }
    }

    return pairs
}

export interface ChatGPTExporterCompanionMergeResult {
    mergedDocument: ParsedThreadImportDocument
    confidence: number
    matchedMessages: number
    unmatchedJsonMessages: number
    unmatchedMarkdownMessages: number
    merged: boolean
}

export const mergeChatGPTExporterCompanionMarkdown = ({
    jsonDocument,
    markdownDocument
}: {
    jsonDocument: ParsedThreadImportDocument
    markdownDocument: ParsedThreadImportDocument
}): ChatGPTExporterCompanionMergeResult => {
    const pairs = computePairs(jsonDocument.messages, markdownDocument.messages)
    const matchedMessages = pairs.length
    const unmatchedJsonMessages = jsonDocument.messages.length - matchedMessages
    const unmatchedMarkdownMessages = markdownDocument.messages.length - matchedMessages
    const confidence =
        Math.max(jsonDocument.messages.length, markdownDocument.messages.length) > 0
            ? matchedMessages /
              Math.max(jsonDocument.messages.length, markdownDocument.messages.length)
            : 0

    const minimumMatches = Math.max(1, Math.floor(jsonDocument.messages.length * 0.5))
    const shouldMerge = matchedMessages >= minimumMatches && confidence >= 0.58

    if (!shouldMerge) {
        return {
            mergedDocument: {
                ...jsonDocument,
                parseWarnings: [
                    ...jsonDocument.parseWarnings,
                    `Skipped markdown enrichment due to low match confidence (${matchedMessages}/${jsonDocument.messages.length} matched)`
                ]
            },
            confidence,
            matchedMessages,
            unmatchedJsonMessages,
            unmatchedMarkdownMessages,
            merged: false
        }
    }

    const markdownByJsonIndex = new Map<number, number>()
    for (const pair of pairs) {
        markdownByJsonIndex.set(pair.jsonIndex, pair.markdownIndex)
    }

    const mergedMessages = jsonDocument.messages.map((jsonMessage, index) => {
        const markdownIndex = markdownByJsonIndex.get(index)
        if (markdownIndex === undefined) return jsonMessage

        return {
            ...jsonMessage,
            text: markdownDocument.messages[markdownIndex].text,
            createdAt: jsonMessage.createdAt ?? markdownDocument.messages[markdownIndex].createdAt
        }
    })

    return {
        mergedDocument: {
            ...jsonDocument,
            messages: mergedMessages,
            parseWarnings: [
                ...jsonDocument.parseWarnings,
                `Enriched from markdown companion (${matchedMessages}/${jsonDocument.messages.length} messages matched)`,
                ...(unmatchedMarkdownMessages > 0
                    ? [`Ignored ${unmatchedMarkdownMessages} unmatched markdown message(s)`]
                    : []),
                ...(unmatchedJsonMessages > 0
                    ? [`Kept ${unmatchedJsonMessages} JSON-only message(s) without enrichment`]
                    : [])
            ]
        },
        confidence,
        matchedMessages,
        unmatchedJsonMessages,
        unmatchedMarkdownMessages,
        merged: true
    }
}
