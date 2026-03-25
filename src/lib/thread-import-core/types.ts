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

export interface ThreadImportParseInput {
    content: string
    fileName?: string
    mimeType?: string
}
