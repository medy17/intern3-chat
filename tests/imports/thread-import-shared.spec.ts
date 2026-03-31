import { describe, expect, it } from "vitest"

import {
    ensureAttachmentFilename,
    extractLeadingFrontmatter,
    parseImportTimestamp,
    stripAttachmentMarkup
} from "@/lib/thread-import-core/shared"

describe("thread import shared helpers", () => {
    it("parses leading frontmatter and strips it from the body", () => {
        const result = extractLeadingFrontmatter(`---
title: "Imported Chat"
author: 'Ahmed'
ignored-line
---
Hello there`)

        expect(result).toEqual({
            body: "Hello there",
            frontmatter: {
                title: "Imported Chat",
                author: "Ahmed"
            }
        })
    })

    it("parses unix-second, millisecond, and ISO timestamps", () => {
        expect(parseImportTimestamp(1_700_000_000)).toBe(1_700_000_000_000)
        expect(parseImportTimestamp(1_700_000_000_123)).toBe(1_700_000_000_123)
        expect(parseImportTimestamp("2026-03-31T12:34:56.000Z")).toBe(
            Date.parse("2026-03-31T12:34:56.000Z")
        )
        expect(parseImportTimestamp("")).toBeUndefined()
    })

    it("extracts attachment markup and preserves normalized message text", () => {
        const result = stripAttachmentMarkup(`
Before

![Example Image](https://example.com/files/My%20Image.png)
[Quarterly Report](https://example.com/reports/q1.pdf)

After
`)

        expect(result).toEqual({
            text: "Before\n\nAfter",
            attachments: [
                {
                    type: "image",
                    url: "https://example.com/files/My%20Image.png",
                    filename: "Example Image"
                },
                {
                    type: "file",
                    url: "https://example.com/reports/q1.pdf",
                    filename: "Quarterly Report"
                }
            ]
        })
    })

    it("infers attachment filenames from URL or mime type when needed", () => {
        expect(
            ensureAttachmentFilename({
                fileNameHint: "diagram",
                url: "https://example.com/assets/diagram.svg",
                mimeType: "image/svg+xml"
            })
        ).toBe("diagram.svg")

        expect(
            ensureAttachmentFilename({
                fileNameHint: "notes",
                url: "https://example.com/download",
                mimeType: "text/plain"
            })
        ).toBe("notes.txt")
    })
})
