import {
    getMessageFooterMetadataKey,
    getMessageRenderFingerprint,
    getMessageRenderFingerprintMap
} from "@/lib/message-render-fingerprint"
import type { UIMessage } from "ai"
import { describe, expect, it } from "vitest"

describe("message render fingerprints", () => {
    it("stays stable for fresh objects with unchanged render content", () => {
        const message: UIMessage = {
            id: "assistant-1",
            role: "assistant",
            parts: [{ type: "text", text: "hello" }],
            metadata: {
                modelName: "claude",
                displayProvider: "Anthropic"
            }
        }

        const clonedMessage: UIMessage = {
            ...message,
            parts: [...message.parts],
            metadata:
                message.metadata && typeof message.metadata === "object"
                    ? { ...message.metadata }
                    : undefined
        }

        expect(getMessageRenderFingerprint(clonedMessage)).toBe(
            getMessageRenderFingerprint(message)
        )
    })

    it("changes when streaming render content changes", () => {
        const baseMessage: UIMessage = {
            id: "assistant-1",
            role: "assistant",
            parts: [{ type: "text", text: "hello" }]
        }

        const updatedMessage: UIMessage = {
            ...baseMessage,
            parts: [{ type: "text", text: "hello world" }]
        }

        expect(getMessageRenderFingerprint(updatedMessage)).not.toBe(
            getMessageRenderFingerprint(baseMessage)
        )
    })

    it("includes footer metadata and produces a per-message lookup map", () => {
        const messages: UIMessage[] = [
            {
                id: "assistant-1",
                role: "assistant",
                parts: [{ type: "text", text: "done" }],
                metadata: {
                    modelName: "claude",
                    promptTokens: 12,
                    completionTokens: 34
                }
            },
            {
                id: "user-1",
                role: "user",
                parts: [{ type: "text", text: "hi" }]
            }
        ]

        expect(getMessageFooterMetadataKey(messages[0])).toContain("claude")
        expect(getMessageRenderFingerprintMap(messages)).toMatchObject({
            "assistant-1": expect.any(String),
            "user-1": expect.any(String)
        })
    })
})
