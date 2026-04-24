import { describe, expect, it } from "vitest"

import { parseThreadImportContent, parseThreadImportContents } from "@/lib/thread-import-core"

describe("thread-import-core", () => {
    it("parses strict T3 markdown exports with frontmatter and attachments", () => {
        const documents = parseThreadImportContents({
            fileName: "thread.md",
            mimeType: "text/markdown",
            content: `---
title: "Roadmap Review"
thread_id: "thread-123"
created_at: "2026-03-30T10:00:00.000Z"
updated_at: "2026-03-30T10:05:00.000Z"
---
# Ignored Heading

### User

Can you review this file?
[notes.txt](https://example.com/files/notes.txt)

### Assistant (gpt-5.4)

Yes, here's the summary.
![diagram](https://example.com/files/diagram.png)
`
        })

        expect(documents).toHaveLength(1)
        expect(documents[0]).toEqual({
            title: "Roadmap Review",
            messages: [
                {
                    role: "user",
                    text: "Can you review this file?",
                    attachments: [
                        {
                            type: "file",
                            url: "https://example.com/files/notes.txt",
                            filename: "notes.txt"
                        }
                    ]
                },
                {
                    role: "assistant",
                    text: "Yes, here's the summary.",
                    attachments: [
                        {
                            type: "image",
                            url: "https://example.com/files/diagram.png",
                            filename: "diagram"
                        }
                    ],
                    metadata: {
                        modelName: "gpt-5.4"
                    }
                }
            ],
            parseWarnings: [],
            source: {
                service: "t3chat",
                format: "markdown",
                conversationId: "thread-123",
                createdAt: Date.parse("2026-03-30T10:00:00.000Z"),
                updatedAt: Date.parse("2026-03-30T10:05:00.000Z")
            }
        })
    })

    it("parses ChatGPT Exporter JSON and preserves expected warnings", () => {
        const document = parseThreadImportContent({
            fileName: "export.json",
            mimeType: "application/json",
            content: JSON.stringify({
                metadata: {
                    title: "Daily Notes",
                    user: {
                        name: "Ahmed",
                        email: "ahmed@example.com"
                    },
                    dates: {
                        created: "2026-03-29T00:00:00.000Z",
                        updated: "2026-03-29T01:00:00.000Z"
                    },
                    link: "https://chat.openai.com/c/conv-123",
                    powered_by: "ChatGPT Exporter"
                },
                messages: [
                    {
                        role: "Prompt",
                        say: "  Hello there  ",
                        time: "2026-03-29T00:15:00.000Z",
                        ignored: true
                    },
                    {
                        role: "Response",
                        say: "General Kenobi",
                        time: "3026-03-29T00:16:00.000Z"
                    },
                    {
                        role: "Narrator",
                        say: "skip me",
                        time: "2026-03-29T00:17:00.000Z"
                    }
                ],
                extra: "still supported"
            })
        })

        expect(document.title).toBe("Daily Notes")
        expect(document.messages).toEqual([
            {
                role: "user",
                text: "Hello there",
                attachments: [],
                createdAt: Date.parse("2026-03-29T00:15:00.000Z")
            },
            {
                role: "assistant",
                text: "General Kenobi",
                attachments: [],
                createdAt: undefined
            }
        ])
        expect(document.parseWarnings).toEqual([
            'Skipped unsupported JSON role "Narrator"',
            "Dropped 1 invalid message timestamp(s) from JSON export",
            "Skipped personal metadata fields from JSON export",
            "Skipped source-link/provider metadata from JSON export"
        ])
        expect(document.source).toEqual({
            service: "chatgptexporter",
            format: "json",
            conversationId: "conv-123",
            createdAt: Date.parse("2026-03-29T00:00:00.000Z"),
            updatedAt: Date.parse("2026-03-29T01:00:00.000Z")
        })
    })

    it("parses ChatGPT Exporter markdown without importing timestamp lines into message text", () => {
        const document = parseThreadImportContent({
            fileName: "export.md",
            mimeType: "text/markdown",
            content: `# Daily Notes

**User:** Ahmed
**Created:** 3/29/2026 00:00:00
**Updated:** 3/29/2026 01:00:00
**Link:** [https://chatgpt.com/c/conv-123](https://chatgpt.com/c/conv-123)

## Prompt:
3/29/2026, 12:15:00 AM

Hello there

## Response:
3/29/2026, 12:16:00 AM

> Thought for a few seconds

General Kenobi
`
        })

        expect(document.messages).toEqual([
            {
                role: "user",
                text: "Hello there",
                attachments: [],
                createdAt: Date.parse("3/29/2026, 12:15:00 AM")
            },
            {
                role: "assistant",
                text: "> Thought for a few seconds\n\nGeneral Kenobi",
                attachments: [],
                createdAt: Date.parse("3/29/2026, 12:16:00 AM")
            }
        ])
        expect(document.parseWarnings).toEqual([
            "Skipped personal metadata fields from markdown export",
            "Using markdown as formatting companion only when JSON source is available"
        ])
        expect(document.source).toEqual({
            service: "chatgptexporter",
            format: "markdown",
            conversationId: "conv-123",
            createdAt: Date.parse("3/29/2026 00:00:00"),
            updatedAt: Date.parse("3/29/2026 01:00:00")
        })
    })

    it("parses T3 bulk JSON and adds a warning when single-document parsing picks the first thread", () => {
        const content = JSON.stringify({
            threads: [
                {
                    threadId: "thread-1",
                    title: "First Thread",
                    createdAt: 1_700_000_000
                },
                {
                    threadId: "thread-2",
                    title: "Second Thread",
                    createdAt: 1_700_000_100
                }
            ],
            messages: [
                {
                    threadId: "thread-2",
                    role: "assistant",
                    content: "Second reply",
                    createdAt: 20
                },
                {
                    threadId: "thread-1",
                    role: "user",
                    content: "First prompt",
                    createdAt: 10,
                    attachmentIds: ["a1", "a2"]
                }
            ]
        })

        const documents = parseThreadImportContents({
            fileName: "bulk.json",
            mimeType: "application/json",
            content
        })
        const single = parseThreadImportContent({
            fileName: "bulk.json",
            mimeType: "application/json",
            content
        })

        expect(documents).toHaveLength(2)
        expect(documents[0].title).toBe("First Thread")
        expect(documents[0].parseWarnings).toEqual([
            "Skipped 2 attachment reference(s); bulk JSON export does not include importable attachment URLs"
        ])
        expect(documents[1].messages[0].text).toBe("Second reply")
        expect(single.parseWarnings.at(-1)).toBe(
            "File contains 2 conversations; first one selected by single-document parser"
        )
    })

    it("throws a clear error for unsupported explicit JSON input", () => {
        expect(() =>
            parseThreadImportContents({
                fileName: "broken.json",
                mimeType: "application/json",
                content: JSON.stringify({ nope: true })
            })
        ).toThrow(
            "Unsupported JSON export format. Expected ChatGPT Exporter JSON schema or T3 bulk threads JSON."
        )
    })
})
