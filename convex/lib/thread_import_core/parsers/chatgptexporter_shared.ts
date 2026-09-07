import { parseImportTimestamp } from "../shared"

const CHATGPT_CONVERSATION_ID_REGEX = /\/c\/([a-zA-Z0-9-]+)(?:[/?#]|$)/
const MESSAGE_TIMESTAMP_PATTERN = String.raw`(\d{1,2})\/(\d{1,2})\/(\d{4}),[ \t]+(\d{1,2}):(\d{2}):(\d{2})(?:[ \t]+(AM|PM))?`
const MESSAGE_TIMESTAMP_REGEX = new RegExp(`^${MESSAGE_TIMESTAMP_PATTERN}$`, "i")
const SECTION_TIMESTAMP_REGEX = new RegExp(`^(${MESSAGE_TIMESTAMP_PATTERN})[ \\t]*(?:\\n+|$)`, "i")
const MAX_ACCEPTABLE_FUTURE_MESSAGE_TIMESTAMP_MS = 5 * 60 * 1000

export const extractChatGPTConversationIdFromUrl = (url?: string) => {
    if (!url) return undefined
    const match = url.match(CHATGPT_CONVERSATION_ID_REGEX)
    return match?.[1]
}

export const parseChatGPTExporterMessageTimestamp = (value: unknown, now = Date.now()) => {
    const match = typeof value === "string" ? value.trim().match(MESSAGE_TIMESTAMP_REGEX) : null
    let parsed: number | undefined
    if (match) {
        // Exporter message dates use D/M/YYYY with a 24-hour clock, or the older
        // M/D/YYYY with AM/PM. Export-level Created/Updated fields are separate.
        const [, first, second, yearText, hourText, minuteText, secondText, meridiem] = match
        const year = Number(yearText)
        const month = Number(meridiem ? first : second)
        const day = Number(meridiem ? second : first)
        let hour = Number(hourText)
        const minute = Number(minuteText)
        const seconds = Number(secondText)
        if (meridiem) {
            if (hour < 1 || hour > 12) return undefined
            hour = (hour % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0)
        }
        // The export has no timezone; retain the existing local-time convention.
        const date = new Date(year, month - 1, day, hour, minute, seconds)
        if (
            date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day ||
            date.getHours() !== hour ||
            date.getMinutes() !== minute ||
            date.getSeconds() !== seconds
        ) {
            return undefined
        }
        parsed = date.getTime() > 0 ? date.getTime() : undefined
    } else {
        parsed = parseImportTimestamp(value)
    }
    if (typeof parsed !== "number") return undefined
    if (parsed > now + MAX_ACCEPTABLE_FUTURE_MESSAGE_TIMESTAMP_MS) {
        return undefined
    }
    return parsed
}

export const extractChatGPTExporterSectionTimestamp = (value: string, now = Date.now()) => {
    const normalized = value.replace(/\r\n/g, "\n")
    const timestampMatch = normalized.match(SECTION_TIMESTAMP_REGEX)

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
