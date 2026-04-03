import type { UIMessage } from "ai"

type MessageWithReasoningMetadata = Pick<UIMessage, "role" | "parts"> & {
    metadata?: unknown
}

type ReasoningPart = Extract<UIMessage["parts"][number], { type: "reasoning" }> & {
    details?: Array<{
        type?: string
        text?: string
        data?: string
    }>
    state?: string
}

const REDACTED_REASONING_PATTERN = /^\[REDACTED\]$/i

const isMeaningfulReasoningText = (value: string) => {
    const trimmed = value.trim()
    return trimmed !== "" && !REDACTED_REASONING_PATTERN.test(trimmed)
}

const getReasoningTextFromDetails = (part: ReasoningPart) => {
    if (!Array.isArray(part.details)) return ""

    return part.details
        .map((detail) => {
            if (detail.type !== "text") return ""
            return detail.text ?? detail.data ?? ""
        })
        .join("")
}

const extractReasoningSegments = (part: ReasoningPart) => {
    const segments: string[] = []

    if (typeof part.text === "string" && isMeaningfulReasoningText(part.text)) {
        segments.push(part.text)
    }

    const detailText = getReasoningTextFromDetails(part)
    if (isMeaningfulReasoningText(detailText)) {
        segments.push(detailText)
    }

    return segments
}

export const getMessageReasoningDetails = (message: MessageWithReasoningMetadata) => {
    const reasoningEffort =
        message.metadata &&
        typeof message.metadata === "object" &&
        "reasoningEffort" in message.metadata &&
        typeof message.metadata.reasoningEffort === "string"
            ? message.metadata.reasoningEffort
            : undefined

    if (message.role !== "assistant" || reasoningEffort === "off") {
        return null
    }

    const seenSegments = new Set<string>()
    const segments: string[] = []
    let isStreaming = false

    for (const part of message.parts) {
        if (part.type !== "reasoning") continue

        if ((part as ReasoningPart).state && (part as ReasoningPart).state !== "done") {
            isStreaming = true
        }

        for (const segment of extractReasoningSegments(part as ReasoningPart)) {
            const normalizedKey = segment.trim()
            if (seenSegments.has(normalizedKey)) continue
            seenSegments.add(normalizedKey)
            segments.push(segment)
        }
    }

    if (segments.length === 0) {
        return null
    }

    return {
        text: segments.join("\n\n"),
        isStreaming
    }
}
