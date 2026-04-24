import { z } from "zod"
import { normalizeSpacing, normalizeTitle, parseImportTimestamp } from "../shared"
import type { ImportedMessageRole, ParsedThreadImportDocument } from "../types"
import {
    extractChatGPTConversationIdFromUrl,
    parseChatGPTExporterMessageTimestamp
} from "./chatgptexporter-shared"

const ChatGPTExporterMessageSchema = z
    .object({
        role: z.string().min(1),
        say: z.string(),
        time: z.unknown().optional()
    })
    .passthrough()

const ChatGPTExporterMetadataSchema = z
    .object({
        title: z.string().optional(),
        user: z
            .object({
                name: z.string().optional(),
                email: z.string().optional()
            })
            .passthrough()
            .optional(),
        dates: z
            .object({
                created: z.string().optional(),
                updated: z.string().optional(),
                exported: z.string().optional()
            })
            .passthrough()
            .optional(),
        link: z.string().optional(),
        powered_by: z.string().optional()
    })
    .passthrough()

const ChatGPTExporterRootSchema = z
    .object({
        metadata: ChatGPTExporterMetadataSchema.optional(),
        messages: z.array(ChatGPTExporterMessageSchema).min(1)
    })
    .passthrough()

const mapExporterRole = (value: string): ImportedMessageRole | null => {
    const normalized = value.trim().toLowerCase()
    if (normalized === "prompt") return "user"
    if (normalized === "response") return "assistant"
    if (normalized === "system") return "system"
    return null
}

export const tryParseChatGPTExporterJson = (content: string): ParsedThreadImportDocument | null => {
    let raw: unknown
    try {
        raw = JSON.parse(content)
    } catch {
        return null
    }

    const validated = ChatGPTExporterRootSchema.safeParse(raw)
    if (!validated.success) {
        return null
    }

    const parseWarnings: string[] = []
    const messages: ParsedThreadImportDocument["messages"] = []
    let droppedTimestampCount = 0

    for (const message of validated.data.messages) {
        const mappedRole = mapExporterRole(message.role)
        if (!mappedRole) {
            parseWarnings.push(`Skipped unsupported JSON role "${message.role}"`)
            continue
        }

        const text = normalizeSpacing(message.say)
        if (!text) {
            continue
        }

        const createdAt = parseChatGPTExporterMessageTimestamp(message.time)
        if (message.time !== undefined && createdAt === undefined) {
            droppedTimestampCount += 1
        }

        messages.push({
            role: mappedRole,
            text,
            attachments: [],
            createdAt
        })
    }

    if (messages.length === 0) {
        return {
            title: "Imported Chat",
            messages: [],
            parseWarnings: [
                "No importable messages found in JSON export after role and content validation"
            ],
            source: {
                service: "chatgptexporter",
                format: "json"
            }
        }
    }

    if (droppedTimestampCount > 0) {
        parseWarnings.push(
            `Dropped ${droppedTimestampCount} invalid message timestamp(s) from JSON export`
        )
    }

    if (validated.data.metadata?.user?.email || validated.data.metadata?.user?.name) {
        parseWarnings.push("Skipped personal metadata fields from JSON export")
    }

    if (validated.data.metadata?.link || validated.data.metadata?.powered_by) {
        parseWarnings.push("Skipped source-link/provider metadata from JSON export")
    }

    const sourceCreatedAt = parseImportTimestamp(validated.data.metadata?.dates?.created)
    const sourceUpdatedAt = parseImportTimestamp(validated.data.metadata?.dates?.updated)

    return {
        title: normalizeTitle(validated.data.metadata?.title || "Imported Chat") || "Imported Chat",
        messages,
        parseWarnings,
        source: {
            service: "chatgptexporter",
            format: "json",
            conversationId: extractChatGPTConversationIdFromUrl(validated.data.metadata?.link),
            createdAt: sourceCreatedAt,
            updatedAt: sourceUpdatedAt ?? sourceCreatedAt
        }
    }
}
