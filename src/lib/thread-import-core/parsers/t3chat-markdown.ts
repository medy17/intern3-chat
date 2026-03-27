import { z } from "zod"
import {
    extractLeadingFrontmatter,
    mapRoleHeaderToRole,
    normalizeSpacing,
    normalizeTitle,
    parseImportTimestamp,
    stripAttachmentMarkup
} from "../shared"
import type { ParsedThreadImportDocument } from "../types"

const SECTION_HEADER_REGEX = /^###\s+(User|Assistant(?:\s*\(([^)]+)\))?|System)\s*$/gm
const DETAILS_BLOCK_REGEX = /<details[\s\S]*?<\/details>/gi

const T3HeaderSchema = z.object({
    roleHeader: z.string().min(1),
    modelName: z.string().optional()
})

const extractTitle = (markdown: string) => {
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

export const tryParseT3ChatMarkdown = (markdown: string): ParsedThreadImportDocument | null => {
    const { body, frontmatter } = extractLeadingFrontmatter(markdown)
    const normalizedMarkdown = body.replace(/\r\n/g, "\n")
    const sectionMatches = Array.from(normalizedMarkdown.matchAll(SECTION_HEADER_REGEX))

    if (sectionMatches.length === 0) {
        return null
    }

    const parseWarnings: string[] = []
    const title = extractTitle(normalizedMarkdown)
    const messages: ParsedThreadImportDocument["messages"] = []

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
        if (!extracted.text && extracted.attachments.length === 0) {
            continue
        }

        messages.push({
            role: mapRoleHeaderToRole(parsedHeader.data.roleHeader),
            text: extracted.text,
            attachments: extracted.attachments,
            metadata: parsedHeader.data.modelName
                ? { modelName: parsedHeader.data.modelName }
                : undefined
        })
    }

    if (messages.length === 0) {
        return null
    }

    const titleFromFrontmatter =
        typeof frontmatter.title === "string" ? normalizeTitle(frontmatter.title) : ""
    const sourceCreatedAt = parseImportTimestamp(frontmatter.created_at ?? frontmatter.createdAt)
    const sourceUpdatedAt = parseImportTimestamp(frontmatter.updated_at ?? frontmatter.updatedAt)
    const conversationId =
        typeof frontmatter.thread_id === "string"
            ? frontmatter.thread_id
            : typeof frontmatter.id === "string"
              ? frontmatter.id
              : undefined

    return {
        title: titleFromFrontmatter || normalizeTitle(title) || "Imported Chat",
        messages,
        parseWarnings,
        source: {
            service: "t3chat",
            format: "markdown",
            conversationId,
            createdAt: sourceCreatedAt,
            updatedAt: sourceUpdatedAt ?? sourceCreatedAt
        }
    }
}

export const parseT3ChatMarkdown = (markdown: string): ParsedThreadImportDocument => {
    const parsed = tryParseT3ChatMarkdown(markdown)
    if (parsed) return parsed

    const fallbackText = normalizeSpacing(markdown)
    return {
        title: extractTitle(markdown),
        messages: fallbackText
            ? [
                  {
                      role: "user",
                      text: fallbackText,
                      attachments: []
                  }
              ]
            : [],
        parseWarnings: fallbackText
            ? [
                  "Markdown does not match strict T3 format; imported as a single user message fallback"
              ]
            : ["No conversation content found"],
        source: {
            service: "t3chat",
            format: "markdown"
        }
    }
}
