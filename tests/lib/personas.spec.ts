import { describe, expect, it } from "vitest"

import {
    buildCompiledPersonaPrompt,
    compilePersonaSnapshot,
    sanitizePersonaMarkdown
} from "../../convex/lib/personas"

describe("persona prompt helpers", () => {
    it("strips markdown links and image links from knowledge docs", () => {
        const sanitized = sanitizePersonaMarkdown(
            [
                "Read [the guide](https://example.com/guide).",
                "Ignore <https://example.com/auto> too.",
                "![diagram](https://example.com/diagram.png)",
                "Bare URL https://example.com/test should vanish."
            ].join("\n")
        )

        expect(sanitized).toContain("Read the guide.")
        expect(sanitized).not.toContain("https://example.com")
        expect(sanitized).not.toContain("diagram.png")
    })

    it("builds a compiled persona prompt and tracks doc token counts", () => {
        const snapshot = compilePersonaSnapshot({
            source: "user",
            sourceId: "persona-1",
            name: "Essay Columnist",
            shortName: "Essay",
            description: "Writes with structure and voice.",
            instructions: "Use a confident editorial tone.",
            defaultModelId: "gpt-5.4-mini",
            conversationStarters: ["Write a tighter intro."],
            avatarKind: "r2",
            avatarValue: "persona-avatars/user/avatar.webp",
            knowledgeDocs: [
                {
                    fileName: "voice.md",
                    content: "Use specific examples and cut filler transitions."
                }
            ]
        })

        expect(
            buildCompiledPersonaPrompt({
                name: snapshot.name,
                description: snapshot.description,
                instructions: snapshot.instructions,
                knowledgeDocs: [
                    {
                        fileName: "voice.md",
                        content: "Use specific examples and cut filler transitions."
                    }
                ]
            })
        ).toContain("## Active Persona")
        expect(snapshot.compiledPrompt).toContain("## Persona Knowledge Base")
        expect(snapshot.knowledgeDocs).toEqual([
            expect.objectContaining({
                fileName: "voice.md",
                tokenCount: expect.any(Number)
            })
        ])
        expect(snapshot.promptTokenEstimate).toBeGreaterThan(0)
    })
})
