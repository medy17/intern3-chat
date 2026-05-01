import { describe, expect, it } from "vitest"
import { buildPrompt } from "../../convex/chat_http/prompt"

describe("buildPrompt", () => {
    it("aligns math delimiter guidance with Streamdown defaults", () => {
        const prompt = buildPrompt([])

        expect(prompt).toContain("Inline math: Use double-dollar delimiters like $$L_{0}$$.")
        expect(prompt).toContain("Never use single-dollar math delimiters like $L_{0}$.")
        expect(prompt).not.toContain("Never use \\( \\) or \\[ \\] math delimiters.")
    })
})
