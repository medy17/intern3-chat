import { z } from "zod"

export type ImportedMessageRole = "user" | "assistant" | "system"
export type ThreadImportFormat = "markdown" | "json"
export type ThreadImportService = "t3chat" | "chatgptexporter"

export interface ParsedAttachmentReference {
    type: "file" | "image"
    url: string
    filename: string
}

export interface ParsedThreadImportMessage {
    role: ImportedMessageRole
    text: string
    attachments: ParsedAttachmentReference[]
    createdAt?: number
    metadata?: {
        modelName?: string
    }
}

export interface ParsedThreadImportDocument {
    title: string
    messages: ParsedThreadImportMessage[]
    parseWarnings: string[]
    source: {
        format: ThreadImportFormat
        service: ThreadImportService
        conversationId?: string
        createdAt?: number
        updatedAt?: number
    }
}

const IMAGE_ATTACHMENT_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g
const FILE_ATTACHMENT_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
const SECTION_HEADER_REGEX = /^##\s*(Prompt|Response|System):\s*$/gm
const EXPORTER_FOOTER_BLOCK_REGEX =
    /\n(?:[-*_]\s*){3,}\s*\n+\s*Powered by(?:\s+\[?[^\]]+\]?\([^)]*\)|[^\n]*)?\s*$/i
const EXPORTER_FOOTER_LINE_REGEX = /\n+\s*Powered by\s+\[?[^\]]+\]?\([^)]*\)\s*$/i
const CHATGPT_EXPORTER_MESSAGE_TIMESTAMP_REGEX =
    /^(\d{1,2}\/\d{1,2}\/\d{4},\s+\d{1,2}:\d{2}:\d{2}\s+(?:AM|PM))\s*(?:\n+|$)/i
const T3_MARKDOWN_HEADER_REGEX = /^###\s+(User|Assistant(?:\s*\(([^)]+)\))?|System)\s*$/gm
const DETAILS_BLOCK_REGEX = /<details[\s\S]*?<\/details>/gi
const markdownExtensionRegex = /\.(md|markdown|txt)$/i
const jsonExtensionRegex = /\.json$/i
const MAX_ACCEPTABLE_FUTURE_MESSAGE_TIMESTAMP_MS = 5 * 60 * 1000

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

const SectionRoleSchema = z.enum(["Prompt", "Response", "System"])
const T3HeaderSchema = z.object({
    roleHeader: z.string().min(1),
    modelName: z.string().optional()
})

export const normalizeSpacing = (value: string) =>
    value
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()

export const normalizeTitle = (value: string) =>
    value
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100)

const normalizeKeySegment = (value: string | number | undefined) =>
    String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")

export const buildThreadImportDocumentKey = (document: ParsedThreadImportDocument, index: number) =>
    [
        document.source.service,
        document.source.format,
        index,
        normalizeKeySegment(document.source.conversationId) || "no-conversation-id",
        normalizeKeySegment(document.title) || "untitled",
        normalizeKeySegment(document.source.createdAt) || "no-created-at",
        normalizeKeySegment(document.source.updatedAt) || "no-updated-at"
    ].join(":")

export const parseImportTimestamp = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return value < 1_000_000_000_000 ? Math.trunc(value * 1000) : Math.trunc(value)
    }

    if (typeof value === "string") {
        const trimmed = value.trim()
        if (!trimmed) return undefined

        const asNumber = Number(trimmed)
        if (Number.isFinite(asNumber) && asNumber > 0) {
            return asNumber < 1_000_000_000_000 ? Math.trunc(asNumber * 1000) : Math.trunc(asNumber)
        }

        const parsed = Date.parse(trimmed)
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed
        }
    }

    return undefined
}

const extractChatGPTConversationIdFromUrl = (value?: string) => {
    if (!value) return undefined
    try {
        const url = new URL(value)
        const match = url.pathname.match(/\/c\/([^/?#]+)/)
        return match?.[1]
    } catch {
        return undefined
    }
}

const parseChatGPTExporterMessageTimestamp = (value: unknown, now = Date.now()) => {
    const parsed = parseImportTimestamp(value)
    if (typeof parsed !== "number") return undefined
    if (parsed > now + MAX_ACCEPTABLE_FUTURE_MESSAGE_TIMESTAMP_MS) {
        return undefined
    }
    return parsed
}

const extractChatGPTExporterSectionTimestamp = (value: string, now = Date.now()) => {
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

const sanitizeFilename = (value: string, fallback = "attachment") => {
    const decoded = (() => {
        try {
            return decodeURIComponent(value)
        } catch {
            return value
        }
    })()

    const cleaned = decoded
        .replace(/[?#].*$/, "")
        .replace(/[\\/:*?"<>|]/g, "-")
        .trim()

    return cleaned || fallback
}

const inferFilenameFromUrl = (url: string) => {
    try {
        const parsed = new URL(url)
        const fromPath = parsed.pathname.split("/").pop() || ""
        return sanitizeFilename(fromPath, "attachment")
    } catch {
        const fromPath = url.split("/").pop() || ""
        return sanitizeFilename(fromPath, "attachment")
    }
}

const stripAttachmentMarkup = (content: string) => {
    const attachments: ParsedAttachmentReference[] = []

    const withoutImages = content.replace(IMAGE_ATTACHMENT_REGEX, (_, alt: string, url: string) => {
        attachments.push({
            type: "image",
            url,
            filename: sanitizeFilename(alt || inferFilenameFromUrl(url), "image")
        })
        return ""
    })

    const withoutFiles = withoutImages.replace(
        FILE_ATTACHMENT_REGEX,
        (_, label: string, url: string) => {
            attachments.push({
                type: "file",
                url,
                filename: sanitizeFilename(label || inferFilenameFromUrl(url), "attachment")
            })
            return ""
        }
    )

    return {
        text: normalizeSpacing(withoutFiles),
        attachments
    }
}

const MIME_EXTENSION_MAP: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "image/x-icon": ".ico",
    "image/svg+xml": ".svg",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "text/javascript": ".js",
    "application/javascript": ".js",
    "application/typescript": ".ts",
    "application/json": ".json",
    "text/html": ".html",
    "text/css": ".css"
}

const getExtension = (name: string) => name.toLowerCase().match(/\.[^.]+$/)?.[0]

export const ensureAttachmentFilename = ({
    fileNameHint,
    url,
    mimeType
}: {
    fileNameHint: string
    url: string
    mimeType?: string
}) => {
    const hint = sanitizeFilename(fileNameHint, "attachment")
    if (getExtension(hint)) {
        return hint
    }

    const fromUrl = inferFilenameFromUrl(url)
    if (getExtension(fromUrl)) {
        return sanitizeFilename(fromUrl, hint)
    }

    const extension = mimeType ? MIME_EXTENSION_MAP[mimeType.toLowerCase()] : undefined
    if (extension) {
        return `${hint}${extension}`
    }

    return `${hint}.bin`
}

const mapRoleHeaderToRole = (header: string): ImportedMessageRole => {
    const normalized = header.trim().toLowerCase()
    if (normalized === "system") return "system"
    if (normalized.startsWith("assistant")) return "assistant"
    return "user"
}

const mapExporterRole = (value: string): ImportedMessageRole | null => {
    const normalized = value.trim().toLowerCase()
    if (normalized === "prompt") return "user"
    if (normalized === "response") return "assistant"
    if (normalized === "system") return "system"
    return null
}

const extractExporterTitle = (markdown: string) => {
    const headingMatch = markdown.match(/^#\s+(.+)$/m)
    if (!headingMatch?.[1]) return "Imported Chat"
    return normalizeTitle(headingMatch[1]) || "Imported Chat"
}

const extractExporterLink = (markdown: string) => {
    const linkWithLabelMatch = markdown.match(
        /^\*\*Link:\*\*\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)/m
    )
    if (linkWithLabelMatch?.[2]) return linkWithLabelMatch[2]

    const plainLinkMatch = markdown.match(/^\*\*Link:\*\*\s*(https?:\/\/\S+)/m)
    if (plainLinkMatch?.[1]) return plainLinkMatch[1]

    return undefined
}

const extractExporterMetadataTimestamp = (markdown: string, label: "Created" | "Updated") => {
    const metadataMatch = markdown.match(new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+?)\\s*$`, "m"))
    return parseImportTimestamp(metadataMatch?.[1])
}

const stripExporterFooter = (value: string) =>
    value.replace(EXPORTER_FOOTER_BLOCK_REGEX, "").replace(EXPORTER_FOOTER_LINE_REGEX, "").trim()

const extractT3Title = (markdown: string) => {
    const headingMatch = markdown.match(/^#\s+(.+)$/m)
    if (headingMatch?.[1]) {
        const heading = normalizeTitle(headingMatch[1])
        if (heading) return heading
    }

    const firstNonEmptyLine = markdown
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0)

    return normalizeTitle(firstNonEmptyLine || "Imported Chat") || "Imported Chat"
}

const getThreadId = (thread: z.infer<typeof T3ThreadSchema>) => thread.threadId ?? thread.id ?? ""
const getMessageSortTimestamp = (message: z.infer<typeof T3MessageSchema>) =>
    message.created_at ?? message.createdAt ?? message._creationTime ?? 0

const extractT3MessageText = (message: z.infer<typeof T3MessageSchema>) => {
    if (typeof message.content === "string" && message.content.trim().length > 0) {
        return normalizeSpacing(message.content)
    }

    if (!message.parts?.length) return ""

    return normalizeSpacing(
        message.parts
            .filter(
                (part) => part.type === "text" && typeof part.text === "string" && part.text.trim()
            )
            .map((part) => part.text as string)
            .join("\n\n")
    )
}

const tryParseChatGPTExporterJson = (content: string): ParsedThreadImportDocument | null => {
    let raw: unknown
    try {
        raw = JSON.parse(content)
    } catch {
        return null
    }

    const validated = ChatGPTExporterRootSchema.safeParse(raw)
    if (!validated.success) return null

    const parseWarnings: string[] = []
    const messages: ParsedThreadImportMessage[] = []
    let droppedTimestampCount = 0

    for (const message of validated.data.messages) {
        const mappedRole = mapExporterRole(message.role)
        if (!mappedRole) {
            parseWarnings.push(`Skipped unsupported JSON role "${message.role}"`)
            continue
        }

        const text = normalizeSpacing(message.say)
        if (!text) continue

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

const tryParseT3ChatThreadsJson = (content: string): ParsedThreadImportDocument[] | null => {
    let raw: unknown
    try {
        raw = JSON.parse(content)
    } catch {
        return null
    }

    const validated = T3ThreadsExportSchema.safeParse(raw)
    if (!validated.success) return null

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
        const messages: ParsedThreadImportMessage[] = []

        for (const message of threadMessages) {
            attachmentReferenceCount += message.attachmentIds?.length ?? 0
            const text = extractT3MessageText(message)
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

        if (messages.length === 0) continue

        if (attachmentReferenceCount > 0) {
            parseWarnings.push(
                `Skipped ${attachmentReferenceCount} attachment reference(s); bulk JSON export does not include importable attachment URLs`
            )
        }

        const sourceCreatedAt = parseImportTimestamp(thread.created_at ?? thread.createdAt)
        const sourceUpdatedAt = parseImportTimestamp(thread.updated_at ?? thread.updatedAt)
        documents.push({
            title: normalizeTitle(thread.title ?? "") || "Imported Chat",
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

    return documents.length > 0 ? documents : null
}

const tryParseT3ChatMarkdown = (markdown: string): ParsedThreadImportDocument | null => {
    const normalizedMarkdown = markdown.replace(/\r\n/g, "\n")
    const sectionMatches = Array.from(normalizedMarkdown.matchAll(T3_MARKDOWN_HEADER_REGEX))

    if (sectionMatches.length === 0) return null

    const parseWarnings: string[] = []
    const title = extractT3Title(normalizedMarkdown)
    const messages: ParsedThreadImportMessage[] = []

    for (let index = 0; index < sectionMatches.length; index += 1) {
        const match = sectionMatches[index]
        const nextMatch = sectionMatches[index + 1]
        const parsedHeader = T3HeaderSchema.safeParse({
            roleHeader: match[1],
            modelName: match[2]?.trim() || undefined
        })

        if (!parsedHeader.success) {
            parseWarnings.push("Skipped a malformed message heading in markdown export")
            continue
        }

        const start = (match.index || 0) + match[0].length
        const end = nextMatch?.index ?? normalizedMarkdown.length
        const sectionContent = normalizedMarkdown
            .slice(start, end)
            .replace(/^---\s*$/gm, "")
            .replace(DETAILS_BLOCK_REGEX, "")
            .trim()

        const extracted = stripAttachmentMarkup(sectionContent)
        if (!extracted.text && extracted.attachments.length === 0) continue

        messages.push({
            role: mapRoleHeaderToRole(parsedHeader.data.roleHeader),
            text: extracted.text,
            attachments: extracted.attachments,
            metadata: parsedHeader.data.modelName
                ? { modelName: parsedHeader.data.modelName }
                : undefined
        })
    }

    if (messages.length === 0) return null

    return {
        title: normalizeTitle(title) || "Imported Chat",
        messages,
        parseWarnings,
        source: {
            service: "t3chat",
            format: "markdown"
        }
    }
}

const tryParseChatGPTExporterMarkdown = (markdown: string): ParsedThreadImportDocument | null => {
    const normalized = markdown.replace(/\r\n/g, "\n")
    const sectionMatches = Array.from(normalized.matchAll(SECTION_HEADER_REGEX))
    if (sectionMatches.length === 0) return null

    const parseWarnings: string[] = []
    const messages: ParsedThreadImportMessage[] = []

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
            role:
                roleParsed.data === "Prompt"
                    ? "user"
                    : roleParsed.data === "Response"
                      ? "assistant"
                      : "system",
            text,
            attachments: [],
            createdAt: extracted.createdAt
        })
    }

    if (messages.length === 0) return null

    const link = extractExporterLink(normalized)
    if (/^\*\*User:\*\*/m.test(normalized)) {
        parseWarnings.push("Skipped personal metadata fields from markdown export")
    }
    if (link) {
        parseWarnings.push(
            "Using markdown as formatting companion only when JSON source is available"
        )
    }

    return {
        title: extractExporterTitle(normalized),
        messages,
        parseWarnings,
        source: {
            service: "chatgptexporter",
            format: "markdown",
            conversationId: extractChatGPTConversationIdFromUrl(link),
            createdAt: extractExporterMetadataTimestamp(normalized, "Created"),
            updatedAt: extractExporterMetadataTimestamp(normalized, "Updated")
        }
    }
}

export const parseThreadImportContents = ({
    content,
    fileName,
    mimeType
}: {
    content: string
    fileName?: string
    mimeType?: string
}) => {
    const trimmed = content.trimStart()
    const formatHint =
        (fileName && jsonExtensionRegex.test(fileName)) ||
        mimeType?.toLowerCase() === "application/json" ||
        trimmed.startsWith("{") ||
        trimmed.startsWith("[")
            ? "json"
            : (fileName && markdownExtensionRegex.test(fileName)) ||
                (mimeType &&
                    (mimeType.toLowerCase().includes("markdown") || mimeType === "text/plain"))
              ? "markdown"
              : "markdown"

    const hasExplicitJsonHint =
        Boolean(fileName && jsonExtensionRegex.test(fileName)) ||
        mimeType?.toLowerCase() === "application/json"
    const hasJsonLikeContent = trimmed.startsWith("{") || trimmed.startsWith("[")

    if (formatHint === "json") {
        const chatGPTExporter = tryParseChatGPTExporterJson(content)
        if (chatGPTExporter) return [chatGPTExporter]

        const t3ThreadsExport = tryParseT3ChatThreadsJson(content)
        if (t3ThreadsExport?.length) return t3ThreadsExport

        if (hasExplicitJsonHint || hasJsonLikeContent) {
            throw new Error(
                "Unsupported JSON export format. Expected ChatGPT Exporter JSON schema or T3 bulk threads JSON."
            )
        }
    }

    const strictT3 = tryParseT3ChatMarkdown(content)
    if (strictT3) return [strictT3]

    const chatgptExporterMarkdown = tryParseChatGPTExporterMarkdown(content)
    if (chatgptExporterMarkdown) return [chatgptExporterMarkdown]

    throw new Error(
        "Unsupported markdown export format. Expected T3 (### User/Assistant/System) or ChatGPTExporter (## Prompt/Response) markdown."
    )
}

const normalizeForCompare = (value: string) =>
    normalizeSpacing(value).replace(/\s+/g, " ").trim().toLowerCase()

const toTokenSet = (value: string) => new Set(normalizeForCompare(value).match(/[a-z0-9]+/g) ?? [])

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

    return jaccard(toTokenSet(jsonMessage.text), toTokenSet(markdownMessage.text)) >= 0.72
}

export const mergeChatGPTExporterCompanionMarkdown = ({
    jsonDocument,
    markdownDocument
}: {
    jsonDocument: ParsedThreadImportDocument
    markdownDocument: ParsedThreadImportDocument
}) => {
    const n = jsonDocument.messages.length
    const m = markdownDocument.messages.length
    const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0))

    for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
            if (isComparableMessage(jsonDocument.messages[i], markdownDocument.messages[j])) {
                dp[i][j] = 1 + dp[i + 1][j + 1]
            } else {
                dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
            }
        }
    }

    const pairs: Array<{ jsonIndex: number; markdownIndex: number }> = []
    let i = 0
    let j = 0
    while (i < n && j < m) {
        const messagesMatch = isComparableMessage(
            jsonDocument.messages[i],
            markdownDocument.messages[j]
        )
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
            merged: false
        }
    }

    const markdownByJsonIndex = new Map<number, number>()
    for (const pair of pairs) {
        markdownByJsonIndex.set(pair.jsonIndex, pair.markdownIndex)
    }

    return {
        mergedDocument: {
            ...jsonDocument,
            messages: jsonDocument.messages.map((jsonMessage, index) => {
                const markdownIndex = markdownByJsonIndex.get(index)
                if (markdownIndex === undefined) return jsonMessage
                return {
                    ...jsonMessage,
                    text: markdownDocument.messages[markdownIndex].text,
                    createdAt:
                        jsonMessage.createdAt ?? markdownDocument.messages[markdownIndex].createdAt
                }
            }),
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
        merged: true
    }
}
