import type { ImportedMessageRole, ParsedAttachmentReference } from "./types"

const IMAGE_ATTACHMENT_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g
const FILE_ATTACHMENT_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g

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

export const extractLeadingFrontmatter = (value: string) => {
    const normalized = value.replace(/\r\n/g, "\n")
    const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?/)

    if (!frontmatterMatch) {
        return {
            body: normalized,
            frontmatter: {} as Record<string, string>
        }
    }

    const parsed = Object.fromEntries(
        frontmatterMatch[1]
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const separatorIndex = line.indexOf(":")
                if (separatorIndex === -1) {
                    return null
                }

                const key = line.slice(0, separatorIndex).trim()
                const rawValue = line.slice(separatorIndex + 1).trim()

                if (!key) {
                    return null
                }

                if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
                    try {
                        return [key, JSON.parse(rawValue) as string]
                    } catch {
                        return [key, rawValue.slice(1, -1)]
                    }
                }

                if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
                    return [key, rawValue.slice(1, -1)]
                }

                return [key, rawValue]
            })
            .filter((entry): entry is [string, string] => Boolean(entry))
    )

    return {
        body: normalized.slice(frontmatterMatch[0].length),
        frontmatter: parsed
    }
}

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

export const mapRoleHeaderToRole = (header: string): ImportedMessageRole => {
    const normalized = header.trim().toLowerCase()
    if (normalized === "system") return "system"
    if (normalized.startsWith("assistant")) return "assistant"
    return "user"
}

const getExtension = (name: string) => {
    const match = name.toLowerCase().match(/\.[^.]+$/)
    return match?.[0]
}

export const sanitizeFilename = (value: string, fallback = "attachment") => {
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

export const inferFilenameFromUrl = (url: string) => {
    try {
        const parsed = new URL(url)
        const fromPath = parsed.pathname.split("/").pop() || ""
        return sanitizeFilename(fromPath, "attachment")
    } catch {
        const fromPath = url.split("/").pop() || ""
        return sanitizeFilename(fromPath, "attachment")
    }
}

export const stripAttachmentMarkup = (content: string) => {
    const attachments: ParsedAttachmentReference[] = []

    const withoutImages = content.replace(IMAGE_ATTACHMENT_REGEX, (_, alt: string, url: string) => {
        const filename = sanitizeFilename(alt || inferFilenameFromUrl(url), "image")
        attachments.push({
            type: "image",
            url,
            filename
        })
        return ""
    })

    const withoutFiles = withoutImages.replace(
        FILE_ATTACHMENT_REGEX,
        (_, label: string, url: string) => {
            const filename = sanitizeFilename(label || inferFilenameFromUrl(url), "attachment")
            attachments.push({
                type: "file",
                url,
                filename
            })
            return ""
        }
    )

    return {
        text: normalizeSpacing(withoutFiles),
        attachments
    }
}

const extensionFromMimeType = (mimeType?: string) => {
    if (!mimeType) return undefined
    return MIME_EXTENSION_MAP[mimeType.toLowerCase()]
}

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

    const extension = extensionFromMimeType(mimeType)
    if (extension) {
        return `${hint}${extension}`
    }

    return `${hint}.bin`
}
