// @vitest-environment jsdom

import { applyPromptTextareaSize } from "@/components/prompt-kit/prompt-input"
import { describe, expect, it } from "vitest"

const defineScrollHeight = (element: HTMLTextAreaElement, value: number) => {
    Object.defineProperty(element, "scrollHeight", {
        configurable: true,
        value
    })
}

describe("applyPromptTextareaSize", () => {
    it("switches to internal scrolling after reaching the numeric max height", () => {
        const textarea = document.createElement("textarea")
        textarea.value = "wrapped content"
        defineScrollHeight(textarea, 320)

        applyPromptTextareaSize(textarea, 240)

        expect(textarea.style.height).toBe("240px")
        expect(textarea.style.overflowY).toBe("auto")
    })

    it("keeps scrolling hidden while content stays below the numeric max height", () => {
        const textarea = document.createElement("textarea")
        textarea.value = "short content"
        defineScrollHeight(textarea, 120)

        applyPromptTextareaSize(textarea, 240)

        expect(textarea.style.height).toBe("120px")
        expect(textarea.style.overflowY).toBe("hidden")
    })

    it("clears sizing when the value is empty", () => {
        const textarea = document.createElement("textarea")
        textarea.value = "   "
        textarea.style.height = "120px"
        textarea.style.overflowY = "auto"

        applyPromptTextareaSize(textarea, 240)

        expect(textarea.style.height).toBe("")
        expect(textarea.style.overflowY).toBe("")
    })
})
