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

export interface ParsedThreadPersonaSnapshot {
    source: "builtin" | "user"
    sourceId: string
    name: string
    shortName?: string
    description: string
    instructions: string
    defaultModelId: string
    conversationStarters: string[]
    avatarKind?: "builtin" | "r2"
    avatarValue?: string
    avatarMimeType?: string
    knowledgeDocs: Array<{
        fileName: string
        tokenCount: number
    }>
    compiledPrompt: string
    promptTokenEstimate: number
}

export interface ParsedThreadImportDocument {
    title: string
    messages: ParsedThreadImportMessage[]
    parseWarnings: string[]
    personaSnapshot?: ParsedThreadPersonaSnapshot
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
