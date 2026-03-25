import { z } from "zod"
import { normalizeSpacing, normalizeTitle, parseImportTimestamp } from "../shared"
import type { ParsedThreadImportDocument } from "../types"

const T3ThreadSchema = z
    .object({
        threadId: z.string().optional(),
        id: z.string().optional(),
        title: z.string().optional(),
        createdAt: z.number().optional(),
        created_at: z.number().optional(),
        updatedAt: z.number().optional(),
        updated_at: z.number().optional()
    })
    .passthrough()
    .refine((value) => Boolean(value.threadId || value.id), {
        message: "Thread entry must include threadId or id"
    })

const T3MessagePartSchema = z
    .object({
        type: z.string(),
        text: z.string().optional()
    })
    .passthrough()

const T3MessageSchema = z
    .object({
        threadId: z.string(),
        role: z.union([z.literal("user"), z.literal("assistant"), z.literal("system")]),
        content: z.string().optional(),
        attachmentIds: z.array(z.string()).optional(),
        parts: z.array(T3MessagePartSchema).optional(),
        created_at: z.number().optional(),
        createdAt: z.number().optional(),
        _creationTime: z.number().optional()
    })
    .passthrough()

const T3ThreadsExportSchema = z
    .object({
        threads: z.array(T3ThreadSchema).min(1),
        messages: z.array(T3MessageSchema),
        version: z.string().optional()
    })
    .passthrough()

const getThreadId = (thread: z.infer<typeof T3ThreadSchema>) => thread.threadId ?? thread.id ?? ""

const getMessageSortTimestamp = (message: z.infer<typeof T3MessageSchema>) =>
    message.created_at ?? message.createdAt ?? message._creationTime ?? 0

const extractMessageText = (message: z.infer<typeof T3MessageSchema>) => {
    if (typeof message.content === "string" && message.content.trim().length > 0) {
        return normalizeSpacing(message.content)
    }

    if (!message.parts?.length) return ""

    const textParts = message.parts
        .filter((part) => part.type === "text" && typeof part.text === "string" && part.text.trim())
        .map((part) => part.text as string)

    return normalizeSpacing(textParts.join("\n\n"))
}

export const tryParseT3ChatThreadsJson = (content: string): ParsedThreadImportDocument[] | null => {
    let raw: unknown
    try {
        raw = JSON.parse(content)
    } catch {
        return null
    }

    const validated = T3ThreadsExportSchema.safeParse(raw)
    if (!validated.success) {
        return null
    }

    const documents: ParsedThreadImportDocument[] = []
    const messagesByThreadId = new Map<string, z.infer<typeof T3MessageSchema>[]>()

    for (const message of validated.data.messages) {
        const threadMessages = messagesByThreadId.get(message.threadId) ?? []
        threadMessages.push(message)
        messagesByThreadId.set(message.threadId, threadMessages)
    }

    for (const thread of validated.data.threads) {
        const threadId = getThreadId(thread)
        if (!threadId) continue

        const threadMessages = (messagesByThreadId.get(threadId) ?? []).sort(
            (a, b) => getMessageSortTimestamp(a) - getMessageSortTimestamp(b)
        )

        const parseWarnings: string[] = []
        let attachmentReferenceCount = 0
        const messages: ParsedThreadImportDocument["messages"] = []

        for (const message of threadMessages) {
            attachmentReferenceCount += message.attachmentIds?.length ?? 0

            const text = extractMessageText(message)
            if (!text) continue

            const modelName =
                typeof (message as Record<string, unknown>).model === "string"
                    ? ((message as Record<string, unknown>).model as string)
                    : undefined

            messages.push({
                role: message.role,
                text,
                attachments: [],
                metadata: message.role === "assistant" && modelName ? { modelName } : undefined
            })
        }

        if (messages.length === 0) {
            continue
        }

        if (attachmentReferenceCount > 0) {
            parseWarnings.push(
                `Skipped ${attachmentReferenceCount} attachment reference(s); bulk JSON export does not include importable attachment URLs`
            )
        }

        const title = normalizeTitle(thread.title ?? "")
        const sourceCreatedAt = parseImportTimestamp(thread.created_at ?? thread.createdAt)
        const sourceUpdatedAt = parseImportTimestamp(thread.updated_at ?? thread.updatedAt)
        documents.push({
            title: title || "Imported Chat",
            messages,
            parseWarnings,
            source: {
                service: "t3chat",
                format: "json",
                conversationId: threadId,
                createdAt: sourceCreatedAt,
                updatedAt: sourceUpdatedAt ?? sourceCreatedAt
            }
        })
    }

    if (documents.length === 0) {
        return null
    }

    return documents
}
