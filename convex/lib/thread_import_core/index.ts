import { tryParseChatGPTExporterJson } from "./parsers/chatgptexporter_json"
import { tryParseChatGPTExporterMarkdown } from "./parsers/chatgptexporter_markdown"
import { tryParseT3ChatThreadsJson } from "./parsers/t3chat_json"
import { tryParseT3ChatMarkdown } from "./parsers/t3chat_markdown"
import type { ParsedThreadImportDocument, ThreadImportParseInput } from "./types"

const markdownExtensionRegex = /\.(md|markdown|txt)$/i
const jsonExtensionRegex = /\.json$/i

const detectFormatHint = ({ content, fileName, mimeType }: ThreadImportParseInput) => {
    if (fileName && jsonExtensionRegex.test(fileName)) return "json" as const
    if (mimeType && mimeType.toLowerCase() === "application/json") return "json" as const
    const trimmed = content.trimStart()
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json" as const
    if (fileName && markdownExtensionRegex.test(fileName)) return "markdown" as const
    if (mimeType && (mimeType.toLowerCase().includes("markdown") || mimeType === "text/plain")) {
        return "markdown" as const
    }
    return "markdown" as const
}

export const parseThreadImportContents = ({
    content,
    fileName,
    mimeType
}: ThreadImportParseInput): ParsedThreadImportDocument[] => {
    const formatHint = detectFormatHint({ content, fileName, mimeType })
    const hasExplicitJsonHint =
        Boolean(fileName && jsonExtensionRegex.test(fileName)) ||
        mimeType?.toLowerCase() === "application/json"
    const hasJsonLikeContent =
        content.trimStart().startsWith("{") || content.trimStart().startsWith("[")

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
    if (strictT3) {
        return [strictT3]
    }

    const chatgptExporterMarkdown = tryParseChatGPTExporterMarkdown(content)
    if (chatgptExporterMarkdown) {
        return [chatgptExporterMarkdown]
    }

    throw new Error(
        "Unsupported markdown export format. Expected T3 (### User/Assistant/System) or ChatGPTExporter (## Prompt/Response) markdown."
    )
}

export const parseThreadImportContent = (
    input: ThreadImportParseInput
): ParsedThreadImportDocument => {
    const documents = parseThreadImportContents(input)
    if (documents.length === 0) {
        throw new Error("No importable conversations found")
    }

    if (documents.length === 1) return documents[0]

    return {
        ...documents[0],
        parseWarnings: [
            ...documents[0].parseWarnings,
            `File contains ${documents.length} conversations; first one selected by single-document parser`
        ]
    }
}

export { mergeChatGPTExporterCompanionMarkdown } from "./merge/chatgptexporter_merge"
export type {
    ImportedMessageRole,
    ParsedAttachmentReference,
    ParsedThreadImportDocument,
    ParsedThreadImportMessage,
    ParsedThreadPersonaSnapshot
} from "./types"
