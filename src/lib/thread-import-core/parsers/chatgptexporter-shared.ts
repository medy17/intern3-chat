import { parseImportTimestamp } from "../shared"

const CHATGPT_CONVERSATION_ID_REGEX = /\/c\/([a-zA-Z0-9-]+)(?:[/?#]|$)/
const CHATGPT_EXPORTER_MESSAGE_TIMESTAMP_REGEX =
    /^(\d{1,2}\/\d{1,2}\/\d{4},\s+\d{1,2}:\d{2}:\d{2}\s+(?:AM|PM))\s*(?:\n+|$)/i
const MAX_ACCEPTABLE_FUTURE_MESSAGE_TIMESTAMP_MS = 5 * 60 * 1000

export const extractChatGPTConversationIdFromUrl = (url?: string) => {
    if (!url) return undefined
    const match = url.match(CHATGPT_CONVERSATION_ID_REGEX)
    return match?.[1]
}

export const parseChatGPTExporterMessageTimestamp = (value: unknown, now = Date.now()) => {
    const parsed = parseImportTimestamp(value)
    if (typeof parsed !== "number") return undefined
    if (parsed > now + MAX_ACCEPTABLE_FUTURE_MESSAGE_TIMESTAMP_MS) {
        return undefined
    }
    return parsed
}

export const extractChatGPTExporterSectionTimestamp = (value: string, now = Date.now()) => {
    const normalized = value.replace(/\r\n/g, "\n")
    const timestampMatch = normalized.match(CHATGPT_EXPORTER_MESSAGE_TIMESTAMP_REGEX)

    if (!timestampMatch) {
        return {
            body: normalized,
            createdAt: undefined
        }
    }

    return {
        body: normalized.slice(timestampMatch[0].length),
        createdAt: parseChatGPTExporterMessageTimestamp(timestampMatch[1], now)
    }
}
