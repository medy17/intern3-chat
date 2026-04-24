import { z } from "zod"
import { normalizeSpacing, normalizeTitle, parseImportTimestamp } from "../shared"
import type { ImportedMessageRole, ParsedThreadImportDocument } from "../types"
import {
    extractChatGPTConversationIdFromUrl,
    extractChatGPTExporterSectionTimestamp
} from "./chatgptexporter-shared"

const SECTION_HEADER_REGEX = /^##\s*(Prompt|Response|System):\s*$/gm
const EXPORTER_FOOTER_BLOCK_REGEX =
    /\n(?:[-*_]\s*){3,}\s*\n+\s*Powered by(?:\s+\[?[^\]]+\]?\([^)]*\)|[^\n]*)?\s*$/i
const EXPORTER_FOOTER_LINE_REGEX = /\n+\s*Powered by\s+\[?[^\]]+\]?\([^)]*\)\s*$/i

const SectionRoleSchema = z.enum(["Prompt", "Response", "System"])

const mapRole = (role: z.infer<typeof SectionRoleSchema>): ImportedMessageRole => {
    if (role === "Prompt") return "user"
    if (role === "Response") return "assistant"
    return "system"
}

const extractTitle = (markdown: string) => {
    const headingMatch = markdown.match(/^#\s+(.+)$/m)
    if (!headingMatch?.[1]) return "Imported Chat"
    return normalizeTitle(headingMatch[1]) || "Imported Chat"
}

const extractLink = (markdown: string) => {
    const linkWithLabelMatch = markdown.match(
        /^\*\*Link:\*\*\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)/m
    )
    if (linkWithLabelMatch?.[2]) return linkWithLabelMatch[2]

    const plainLinkMatch = markdown.match(/^\*\*Link:\*\*\s*(https?:\/\/\S+)/m)
    if (plainLinkMatch?.[1]) return plainLinkMatch[1]

    return undefined
}

const extractMetadataTimestamp = (markdown: string, label: "Created" | "Updated") => {
    const metadataMatch = markdown.match(new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+?)\\s*$`, "m"))
    return parseImportTimestamp(metadataMatch?.[1])
}

const stripExporterFooter = (value: string) =>
    value.replace(EXPORTER_FOOTER_BLOCK_REGEX, "").replace(EXPORTER_FOOTER_LINE_REGEX, "").trim()

export const tryParseChatGPTExporterMarkdown = (
    markdown: string
): ParsedThreadImportDocument | null => {
    const normalized = markdown.replace(/\r\n/g, "\n")
    const sectionMatches = Array.from(normalized.matchAll(SECTION_HEADER_REGEX))

    if (sectionMatches.length === 0) return null

    const parseWarnings: string[] = []
    const messages: ParsedThreadImportDocument["messages"] = []

    for (let index = 0; index < sectionMatches.length; index += 1) {
        const match = sectionMatches[index]
        const nextMatch = sectionMatches[index + 1]

        const roleParsed = SectionRoleSchema.safeParse(match[1])
        if (!roleParsed.success) {
            parseWarnings.push(`Skipped unsupported markdown section role "${match[1]}"`)
            continue
        }

        const start = (match.index || 0) + match[0].length
        const end = nextMatch?.index ?? normalized.length
        const sectionContent = stripExporterFooter(normalized.slice(start, end))
        const extracted = extractChatGPTExporterSectionTimestamp(sectionContent)
        const text = normalizeSpacing(extracted.body)
        if (!text) continue

        messages.push({
            role: mapRole(roleParsed.data),
            text,
            attachments: [],
            createdAt: extracted.createdAt
        })
    }

    if (messages.length === 0) return null

    const link = extractLink(normalized)
    if (/^\*\*User:\*\*/m.test(normalized)) {
        parseWarnings.push("Skipped personal metadata fields from markdown export")
    }
    if (link) {
        parseWarnings.push(
            "Using markdown as formatting companion only when JSON source is available"
        )
    }

    return {
        title: extractTitle(normalized),
        messages,
        parseWarnings,
        source: {
            service: "chatgptexporter",
            format: "markdown",
            conversationId: extractChatGPTConversationIdFromUrl(link),
            createdAt: extractMetadataTimestamp(normalized, "Created"),
            updatedAt: extractMetadataTimestamp(normalized, "Updated")
        }
    }
}
