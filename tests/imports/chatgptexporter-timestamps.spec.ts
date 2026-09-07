import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    mergeChatGPTExporterCompanionMarkdown,
    parseThreadImportContent
} from "@/lib/thread-import-core"

describe("ChatGPT Exporter message timestamps", () => {
    beforeEach(() => {
        vi.spyOn(Date, "now").mockReturnValue(new Date(2026, 8, 9).getTime())
    })
    afterEach(() => vi.restoreAllMocks())

    it.each([
        ["07/09/2026, 20:01:07", new Date(2026, 8, 7, 20, 1, 7).getTime()],
        ["08/09/2026, 00:33:22", new Date(2026, 8, 8, 0, 33, 22).getTime()],
        ["29/03/2026, 12:16:00", new Date(2026, 2, 29, 12, 16).getTime()],
        ["3/29/2026, 12:15:00 AM", new Date(2026, 2, 29, 0, 15).getTime()],
        ["3/29/2026, 12:15:00 PM", new Date(2026, 2, 29, 12, 15).getTime()],
        ["31/02/2026, 20:01:07", undefined],
        ["07/09/2026, 24:01:07", undefined],
        ["07/09/3026, 20:01:07", undefined]
    ])(
        "keeps %s out of text and parses it consistently in JSON and Markdown",
        (time, createdAt) => {
            const text = "Please review this date:\n\n07/09/2026, 20:01:07"
            const jsonDocument = parseThreadImportContent({
                fileName: "export.json",
                content: JSON.stringify({
                    metadata: { title: "Daily Notes", dates: { created: "9/7/2026 20:01:08" } },
                    messages: [{ role: "Prompt", say: text, time }]
                })
            })
            const markdownDocument = parseThreadImportContent({
                fileName: "export.md",
                content: `# Daily Notes\r\n\r\n**Created:** 9/7/2026 20:01:08\r\n\r\n## Prompt:\r\n${time}\r\n\r\n${text}`
            })
            const result = mergeChatGPTExporterCompanionMarkdown({ jsonDocument, markdownDocument })

            expect(result.merged).toBe(true)
            for (const document of [jsonDocument, markdownDocument, result.mergedDocument]) {
                expect(document.messages[0].text).toBe(text)
                expect(document.messages[0].createdAt).toBe(createdAt)
                expect(document.source?.createdAt).toBe(new Date(2026, 8, 7, 20, 1, 8).getTime())
            }
        }
    )

    it.each(["07/09/2026, 20:01:07 is the date we agreed on.", "> 07/09/2026, 20:01:07"])(
        "preserves dates that are part of the opening message text: %s",
        (text) => {
            const document = parseThreadImportContent({
                fileName: "export.md",
                content: `# Daily Notes\n\n## Prompt:\n${text}`
            })
            expect(document.messages[0].text).toBe(text)
            expect(document.messages[0].createdAt).toBeUndefined()
        }
    )
})
