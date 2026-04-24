import { describe, expect, it } from "vitest"

import {
    buildThreadExportFileName,
    buildThreadsExportArchiveName,
    buildZipArchive,
    serializeThreadToMarkdown
} from "@/lib/thread-export"

describe("thread-export", () => {
    it("serializes messages in chronological order and resolves internal attachments", () => {
        const exported = serializeThreadToMarkdown({
            thread: {
                _id: "thread-123",
                title: "Résumé Review",
                createdAt: Date.UTC(2026, 2, 28, 10, 0, 0),
                updatedAt: Date.UTC(2026, 2, 28, 12, 0, 0)
            },
            messages: [
                {
                    messageId: "b",
                    role: "assistant",
                    createdAt: 20,
                    updatedAt: 20,
                    metadata: {
                        modelName: "gpt-5.4"
                    },
                    parts: [
                        { type: "text", text: "Here is the answer." },
                        { type: "image", image: "generated/key-1", mimeType: "image/png" }
                    ]
                },
                {
                    messageId: "a",
                    role: "user",
                    createdAt: 10,
                    updatedAt: 10,
                    parts: [
                        { type: "text", text: "Please review this." },
                        {
                            type: "file",
                            data: "/r2?key=attachment-key",
                            filename: "review.md",
                            mimeType: "text/plain"
                        }
                    ]
                },
                {
                    messageId: "c",
                    role: "assistant",
                    createdAt: 30,
                    updatedAt: 30,
                    parts: [{ type: "reasoning" }]
                }
            ],
            convexApiUrl: "https://convex.example.com/",
            exportedAt: Date.UTC(2026, 2, 31, 0, 0, 0)
        })

        expect(exported.fileName).toBe("2026-03-31--resume-review--thread-123.md")
        expect(exported.markdown).toContain("# Résumé Review")
        expect(exported.markdown).toContain("### User")
        expect(exported.markdown).toContain(
            "[review.md](https://convex.example.com/r2?key=attachment-key)"
        )
        expect(exported.markdown).toContain("### Assistant (gpt-5.4)")
        expect(exported.markdown).toContain(
            "![r2](https://convex.example.com/r2?key=generated%2Fkey-1)"
        )
        expect(exported.markdown.indexOf("### User")).toBeLessThan(
            exported.markdown.indexOf("### Assistant (gpt-5.4)")
        )
        expect(exported.markdown).not.toContain("reasoning")
    })

    it("throws when a thread has no exportable content", () => {
        expect(() =>
            serializeThreadToMarkdown({
                thread: {
                    _id: "thread-empty",
                    title: "Empty",
                    createdAt: 1,
                    updatedAt: 1
                },
                messages: [
                    {
                        messageId: "only",
                        role: "assistant",
                        createdAt: 1,
                        updatedAt: 1,
                        parts: [{ type: "error" }]
                    }
                ],
                convexApiUrl: "https://convex.example.com"
            })
        ).toThrow("Thread has no exportable content")
    })

    it("builds deterministic export names and a valid zip archive header", async () => {
        expect(
            buildThreadExportFileName({
                thread: {
                    _id: "thread-9",
                    title: "Crème Brûlée / Notes",
                    createdAt: 0,
                    updatedAt: 0
                },
                exportedAt: Date.UTC(2026, 2, 31, 0, 0, 0)
            })
        ).toBe("2026-03-31--creme-brulee-notes--thread-9.md")

        expect(
            buildThreadsExportArchiveName({
                exportedAt: Date.UTC(2026, 2, 31, 0, 0, 0),
                threadCount: 2
            })
        ).toBe("2026-03-31--intern3-export--2-threads.zip")

        const archive = buildZipArchive([
            {
                name: "a.md",
                content: "# A"
            },
            {
                name: "b.md",
                content: "# B"
            }
        ])
        const bytes = new Uint8Array(await archive.arrayBuffer())

        expect(archive.type).toBe("application/zip")
        expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
    })

    it("rejects attempts to build an empty archive", () => {
        expect(() => buildZipArchive([])).toThrow("No files to export")
    })
})
