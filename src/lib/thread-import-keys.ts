import type { ParsedThreadImportDocument } from "./thread-import-core"

const normalizeKeySegment = (value: string | number | undefined) =>
    String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")

export const buildThreadImportDocumentKey = (
    document: ParsedThreadImportDocument,
    index: number
) => {
    const conversationId = normalizeKeySegment(document.source.conversationId)
    const title = normalizeKeySegment(document.title)
    const createdAt = normalizeKeySegment(document.source.createdAt)
    const updatedAt = normalizeKeySegment(document.source.updatedAt)

    return [
        document.source.service,
        document.source.format,
        index,
        conversationId || "no-conversation-id",
        title || "untitled",
        createdAt || "no-created-at",
        updatedAt || "no-updated-at"
    ].join(":")
}
