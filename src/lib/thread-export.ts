import { getFileTypeInfo } from "@/lib/file_constants"

type ExportableRole = "user" | "assistant" | "system"

type ExportableMessagePart =
    | {
          type: "text"
          text: string
      }
    | {
          type: "image"
          image: string
          mimeType?: string
      }
    | {
          type: "file"
          data: string
          filename?: string
          mimeType?: string
      }
    | {
          type: "reasoning"
      }
    | {
          type: "tool-invocation"
      }
    | {
          type: "error"
      }

export interface ExportableThread {
    _id: string
    title: string
    createdAt: number
    updatedAt: number
    projectId?: string
}

export interface ExportableMessage {
    messageId: string
    role: ExportableRole
    createdAt: number
    updatedAt: number
    parts: ExportableMessagePart[]
    metadata?: {
        modelId?: string
        modelName?: string
    }
}

export interface ThreadMarkdownExport {
    fileName: string
    markdown: string
}

const textEncoder = new TextEncoder()

const isExternalFileReference = (value: string) =>
    value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")

const normalizeSpacing = (value: string) =>
    value
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()

const normalizeTitle = (value: string) =>
    value
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100)

const slugify = (value: string, fallback: string) => {
    const normalized = value
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)

    return normalized || fallback
}

const formatFileDate = (value: number) => {
    const date = new Date(value)
    const year = date.getUTCFullYear()
    const month = `${date.getUTCMonth() + 1}`.padStart(2, "0")
    const day = `${date.getUTCDate()}`.padStart(2, "0")
    return `${year}-${month}-${day}`
}

const toIsoString = (value: number) => new Date(value).toISOString()

const escapeFrontmatterString = (value: string) => JSON.stringify(value)

const escapeMarkdownLabel = (value: string) => value.replace(/[[\]]/g, "")

const resolveInternalAttachmentUrl = ({
    value,
    convexApiUrl
}: {
    value: string
    convexApiUrl: string
}) => {
    const normalizedApiUrl = convexApiUrl.replace(/\/$/, "")
    if (value.startsWith("/r2?key=")) {
        return `${normalizedApiUrl}${value}`
    }

    return `${normalizedApiUrl}/r2?key=${encodeURIComponent(value)}`
}

const inferAttachmentFilename = ({
    url,
    fallback
}: {
    url: string
    fallback: string
}) => {
    try {
        const parsed = new URL(url)
        const fromPath = parsed.pathname.split("/").pop()?.trim()
        if (fromPath) {
            return fromPath
        }
    } catch {
        // Fall back to provided label below.
    }

    return fallback
}

const buildAttachmentLine = ({
    url,
    filename,
    mimeType
}: {
    url: string
    filename: string
    mimeType?: string
}) => {
    const resolvedFileName = filename || inferAttachmentFilename({ url, fallback: "attachment" })
    const fileTypeInfo = getFileTypeInfo(resolvedFileName, mimeType)
    const label = escapeMarkdownLabel(resolvedFileName || "attachment")

    if (fileTypeInfo.isImage) {
        return `![${label}](${url})`
    }

    return `[${label}](${url})`
}

const buildMarkdownHeader = ({
    role,
    modelLabel
}: {
    role: ExportableRole
    modelLabel?: string
}) => {
    if (role === "assistant" && modelLabel) {
        return `### Assistant (${modelLabel})`
    }

    if (role === "assistant") {
        return "### Assistant"
    }

    if (role === "system") {
        return "### System"
    }

    return "### User"
}

const buildMessageBlock = ({
    message,
    convexApiUrl
}: {
    message: ExportableMessage
    convexApiUrl: string
}) => {
    const textContent = normalizeSpacing(
        message.parts
            .filter(
                (part): part is Extract<ExportableMessagePart, { type: "text" }> =>
                    part.type === "text"
            )
            .map((part) => part.text)
            .join("\n\n")
    )

    const attachmentLines = message.parts
        .flatMap((part) => {
            if (part.type === "image") {
                const url = isExternalFileReference(part.image)
                    ? part.image
                    : resolveInternalAttachmentUrl({
                          value: part.image,
                          convexApiUrl
                      })

                return [
                    buildAttachmentLine({
                        url,
                        filename: inferAttachmentFilename({
                            url,
                            fallback: "image"
                        }),
                        mimeType: part.mimeType
                    })
                ]
            }

            if (part.type === "file") {
                const url = isExternalFileReference(part.data)
                    ? part.data
                    : resolveInternalAttachmentUrl({
                          value: part.data,
                          convexApiUrl
                      })

                return [
                    buildAttachmentLine({
                        url,
                        filename:
                            part.filename ||
                            inferAttachmentFilename({
                                url,
                                fallback: "attachment"
                            }),
                        mimeType: part.mimeType
                    })
                ]
            }

            return []
        })
        .filter(Boolean)

    if (!textContent && attachmentLines.length === 0) {
        return null
    }

    const modelLabel =
        message.role === "assistant"
            ? normalizeTitle(message.metadata?.modelName || message.metadata?.modelId || "")
            : undefined

    const bodyLines = [textContent, attachmentLines.join("\n")].filter(Boolean)

    return [buildMarkdownHeader({ role: message.role, modelLabel }), "", ...bodyLines].join("\n")
}

const buildThreadFrontmatter = ({
    thread,
    exportedAt
}: {
    thread: ExportableThread
    exportedAt: number
}) => {
    const lines = [
        "---",
        `format: ${escapeFrontmatterString("intern3-chat-markdown-v1")}`,
        `thread_id: ${escapeFrontmatterString(thread._id)}`,
        `created_at: ${escapeFrontmatterString(toIsoString(thread.createdAt))}`,
        `updated_at: ${escapeFrontmatterString(toIsoString(thread.updatedAt))}`,
        `exported_at: ${escapeFrontmatterString(toIsoString(exportedAt))}`,
        `title: ${escapeFrontmatterString(normalizeTitle(thread.title) || "Exported Chat")}`
    ]

    if (thread.projectId) {
        lines.push(`project_id: ${escapeFrontmatterString(thread.projectId)}`)
    }

    lines.push("---")
    return lines.join("\n")
}

export const buildThreadExportFileName = ({
    thread,
    exportedAt
}: {
    thread: ExportableThread
    exportedAt: number
}) => {
    const date = formatFileDate(exportedAt)
    const slug = slugify(thread.title, "thread")
    return `${date}--${slug}--${thread._id}.md`
}

export const buildThreadsExportArchiveName = ({
    exportedAt,
    threadCount
}: {
    exportedAt: number
    threadCount: number
}) => `${formatFileDate(exportedAt)}--intern3-export--${threadCount}-threads.zip`

export const serializeThreadToMarkdown = ({
    thread,
    messages,
    convexApiUrl,
    exportedAt = Date.now()
}: {
    thread: ExportableThread
    messages: ExportableMessage[]
    convexApiUrl: string
    exportedAt?: number
}): ThreadMarkdownExport => {
    const sortedMessages = [...messages].sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
            return left.createdAt - right.createdAt
        }

        if (left.updatedAt !== right.updatedAt) {
            return left.updatedAt - right.updatedAt
        }

        return left.messageId.localeCompare(right.messageId)
    })

    const messageBlocks = sortedMessages
        .map((message) => buildMessageBlock({ message, convexApiUrl }))
        .filter((block): block is string => Boolean(block))

    if (messageBlocks.length === 0) {
        throw new Error("Thread has no exportable content")
    }

    const title = normalizeTitle(thread.title) || "Exported Chat"
    const markdown = [
        buildThreadFrontmatter({ thread, exportedAt }),
        "",
        `# ${title}`,
        "",
        messageBlocks.join("\n\n")
    ].join("\n")

    return {
        fileName: buildThreadExportFileName({ thread, exportedAt }),
        markdown
    }
}

const createCrc32Table = () => {
    const table = new Uint32Array(256)

    for (let index = 0; index < 256; index += 1) {
        let value = index

        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
        }

        table[index] = value >>> 0
    }

    return table
}

const crc32Table = createCrc32Table()

const crc32 = (bytes: Uint8Array) => {
    let crc = 0xffffffff

    for (const value of bytes) {
        crc = crc32Table[(crc ^ value) & 0xff] ^ (crc >>> 8)
    }

    return (crc ^ 0xffffffff) >>> 0
}

const writeUint16LE = (target: Uint8Array, offset: number, value: number) => {
    target[offset] = value & 0xff
    target[offset + 1] = (value >>> 8) & 0xff
}

const writeUint32LE = (target: Uint8Array, offset: number, value: number) => {
    target[offset] = value & 0xff
    target[offset + 1] = (value >>> 8) & 0xff
    target[offset + 2] = (value >>> 16) & 0xff
    target[offset + 3] = (value >>> 24) & 0xff
}

const toDosDateTime = (date: Date) => {
    const year = Math.max(1980, date.getFullYear())
    const month = date.getMonth() + 1
    const day = date.getDate()
    const hours = date.getHours()
    const minutes = date.getMinutes()
    const seconds = Math.floor(date.getSeconds() / 2)

    return {
        time: (hours << 11) | (minutes << 5) | seconds,
        date: ((year - 1980) << 9) | (month << 5) | day
    }
}

const toArrayBuffer = (value: Uint8Array) => Uint8Array.from(value).buffer

export const buildZipArchive = (
    files: Array<{
        name: string
        content: string
    }>
) => {
    if (files.length === 0) {
        throw new Error("No files to export")
    }

    const localParts: Uint8Array[] = []
    const centralParts: Uint8Array[] = []
    let offset = 0

    for (const file of files) {
        const fileNameBytes = textEncoder.encode(file.name)
        const fileBytes = textEncoder.encode(file.content)
        const checksum = crc32(fileBytes)
        const { time, date } = toDosDateTime(new Date())

        const localHeader = new Uint8Array(30 + fileNameBytes.length)
        writeUint32LE(localHeader, 0, 0x04034b50)
        writeUint16LE(localHeader, 4, 20)
        writeUint16LE(localHeader, 6, 0x0800)
        writeUint16LE(localHeader, 8, 0)
        writeUint16LE(localHeader, 10, time)
        writeUint16LE(localHeader, 12, date)
        writeUint32LE(localHeader, 14, checksum)
        writeUint32LE(localHeader, 18, fileBytes.length)
        writeUint32LE(localHeader, 22, fileBytes.length)
        writeUint16LE(localHeader, 26, fileNameBytes.length)
        writeUint16LE(localHeader, 28, 0)
        localHeader.set(fileNameBytes, 30)

        localParts.push(localHeader, fileBytes)

        const centralHeader = new Uint8Array(46 + fileNameBytes.length)
        writeUint32LE(centralHeader, 0, 0x02014b50)
        writeUint16LE(centralHeader, 4, 20)
        writeUint16LE(centralHeader, 6, 20)
        writeUint16LE(centralHeader, 8, 0x0800)
        writeUint16LE(centralHeader, 10, 0)
        writeUint16LE(centralHeader, 12, time)
        writeUint16LE(centralHeader, 14, date)
        writeUint32LE(centralHeader, 16, checksum)
        writeUint32LE(centralHeader, 20, fileBytes.length)
        writeUint32LE(centralHeader, 24, fileBytes.length)
        writeUint16LE(centralHeader, 28, fileNameBytes.length)
        writeUint16LE(centralHeader, 30, 0)
        writeUint16LE(centralHeader, 32, 0)
        writeUint16LE(centralHeader, 34, 0)
        writeUint16LE(centralHeader, 36, 0)
        writeUint32LE(centralHeader, 38, 0)
        writeUint32LE(centralHeader, 42, offset)
        centralHeader.set(fileNameBytes, 46)
        centralParts.push(centralHeader)

        offset += localHeader.length + fileBytes.length
    }

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
    const endOfCentralDirectory = new Uint8Array(22)
    writeUint32LE(endOfCentralDirectory, 0, 0x06054b50)
    writeUint16LE(endOfCentralDirectory, 4, 0)
    writeUint16LE(endOfCentralDirectory, 6, 0)
    writeUint16LE(endOfCentralDirectory, 8, files.length)
    writeUint16LE(endOfCentralDirectory, 10, files.length)
    writeUint32LE(endOfCentralDirectory, 12, centralSize)
    writeUint32LE(endOfCentralDirectory, 16, offset)
    writeUint16LE(endOfCentralDirectory, 20, 0)

    return new Blob(
        [...localParts, ...centralParts, endOfCentralDirectory].map((part) => toArrayBuffer(part)),
        {
            type: "application/zip"
        }
    )
}

export const downloadBlob = ({ blob, fileName }: { blob: Blob; fileName: string }) => {
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = objectUrl
    anchor.download = fileName
    anchor.style.display = "none"
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)

    window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl)
    }, 1000)
}
