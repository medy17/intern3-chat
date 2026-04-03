import { getMessageReasoningDetails } from "@/lib/message-reasoning"
import { describe, expect, it } from "vitest"

describe("getMessageReasoningDetails", () => {
    it("hides leaked reasoning when reasoning effort is off", () => {
        const result = getMessageReasoningDetails({
            role: "assistant",
            metadata: {
                reasoningEffort: "off"
            },
            parts: [{ type: "reasoning", text: "should never render" }]
        } as never)

        expect(result).toBeNull()
    })

    it("filters blank and redacted reasoning placeholders", () => {
        const result = getMessageReasoningDetails({
            role: "assistant",
            metadata: {
                reasoningEffort: "medium"
            },
            parts: [
                { type: "reasoning", text: "   " },
                { type: "reasoning", text: "[REDACTED]" }
            ]
        } as never)

        expect(result).toBeNull()
    })

    it("merges visible reasoning segments once and tracks streaming state", () => {
        const result = getMessageReasoningDetails({
            role: "assistant",
            metadata: {
                reasoningEffort: "medium"
            },
            parts: [
                { type: "reasoning", text: "Step 1", state: "done" },
                { type: "text", text: "Final answer" },
                {
                    type: "reasoning",
                    text: "[REDACTED]",
                    details: [{ type: "text", text: "Step 2" }]
                },
                { type: "reasoning", text: "Step 1", state: "streaming" }
            ]
        } as never)

        expect(result).toEqual({
            text: "Step 1\n\nStep 2",
            isStreaming: true
        })
    })
})
