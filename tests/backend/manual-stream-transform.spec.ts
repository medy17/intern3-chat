import { beforeEach, describe, expect, it, vi } from "vitest"

const { r2StoreMock } = vi.hoisted(() => ({
    r2StoreMock: vi.fn()
}))

vi.mock("../../convex/attachments", () => ({
    r2: {
        store: r2StoreMock
    }
}))

import { manualStreamTransform } from "../../convex/chat_http/manual_stream_transform"

type StoredParts = Parameters<typeof manualStreamTransform>[0]
type ActionCtx = Parameters<typeof manualStreamTransform>[4]

const collectChunks = async (chunks: unknown[], options?: { userId?: string }) => {
    const parts: StoredParts = []
    const totalTokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        reasoningTokens: 0
    }
    const uploadPromises: Promise<void>[] = []
    const transform = manualStreamTransform(
        parts,
        totalTokenUsage,
        uploadPromises,
        options?.userId ?? "user-1",
        {} as ActionCtx
    )

    const writer = transform.writable.getWriter()
    const reader = transform.readable.getReader()
    const output: unknown[] = []
    const readTask = (async () => {
        while (true) {
            const result = await reader.read()
            if (result.done) break
            output.push(result.value)
        }
    })()

    for (const chunk of chunks) {
        await writer.write(chunk as never)
    }
    await writer.close()
    await readTask

    await Promise.all(uploadPromises)

    return {
        parts,
        totalTokenUsage,
        uploadPromises,
        output
    }
}

describe("manualStreamTransform", () => {
    beforeEach(() => {
        r2StoreMock.mockReset().mockResolvedValue("stored/key.png")
        vi.spyOn(console, "log").mockImplementation(() => {})
    })

    it("suppresses inline image payload text in persisted parts and emits a live notice once", async () => {
        const hugeInlinePayload = `data:image/png;base64,${"A".repeat(3000)}`

        const result = await collectChunks([
            { type: "text-start", id: "txt-1" },
            { type: "text-delta", id: "txt-1", text: hugeInlinePayload },
            { type: "text-delta", id: "txt-1", text: "Visible text" },
            { type: "text-end", id: "txt-1" }
        ])

        expect(result.parts).toEqual([
            {
                type: "text",
                text: "Visible text"
            }
        ])
        expect(result.output).toEqual([
            { type: "text-start", id: "txt-1" },
            {
                type: "text-delta",
                id: "txt-1",
                delta: "\n\n[Image payload omitted from live text stream.]"
            },
            { type: "text-delta", id: "txt-1", delta: "Visible text" },
            { type: "text-end", id: "txt-1" }
        ])
    })

    it("stores image files through R2 and forwards non-image files as data URLs", async () => {
        const result = await collectChunks([
            {
                type: "file",
                file: {
                    mediaType: "image/png",
                    uint8Array: new Uint8Array([1, 2, 3]),
                    base64: "AQID"
                }
            },
            {
                type: "file",
                file: {
                    mediaType: "text/plain",
                    uint8Array: new Uint8Array([72, 105]),
                    base64: "SGk="
                }
            }
        ])

        expect(r2StoreMock).toHaveBeenCalledTimes(1)
        expect(r2StoreMock).toHaveBeenCalledWith(
            {},
            new Uint8Array([1, 2, 3]),
            expect.objectContaining({
                authorId: "user-1",
                type: "image/png"
            })
        )
        expect(result.parts).toEqual([
            {
                type: "file",
                mimeType: "image/png",
                data: "stored/key.png"
            },
            {
                type: "file",
                mimeType: "text/plain",
                data: "data:text/plain;base64,SGk="
            }
        ])
        expect(result.output).toEqual([
            {
                type: "file",
                mediaType: "image/png",
                url: "/r2?key=stored/key.png"
            },
            {
                type: "file",
                mediaType: "text/plain",
                url: "data:text/plain;base64,SGk="
            }
        ])
        expect(result.uploadPromises).toHaveLength(1)
    })

    it("persists tool calls/results and forwards tool and error output", async () => {
        const result = await collectChunks([
            {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "web_search",
                input: { query: "intern3 chat" }
            },
            {
                type: "tool-result",
                toolCallId: "call-1",
                output: { answer: "done" }
            },
            {
                type: "error",
                error: new Error("stream broke")
            }
        ])

        expect(result.parts).toEqual([
            {
                type: "tool-invocation",
                toolInvocation: {
                    state: "result",
                    args: { query: "intern3 chat" },
                    result: { answer: "done" },
                    toolCallId: "call-1",
                    toolName: "web_search"
                }
            },
            {
                type: "error",
                error: {
                    code: "unknown",
                    message: "stream broke"
                }
            }
        ])
        expect(result.output).toEqual([
            {
                type: "tool-input-available",
                toolCallId: "call-1",
                toolName: "web_search",
                input: { query: "intern3 chat" }
            },
            {
                type: "tool-output-available",
                toolCallId: "call-1",
                output: { answer: "done" }
            },
            {
                type: "error",
                errorText: "stream broke"
            }
        ])
    })

    it("accumulates reasoning text and finish-step token usage", async () => {
        const result = await collectChunks([
            { type: "reasoning-start", id: "r-1" },
            { type: "reasoning-delta", id: "r-1", text: "Step 1" },
            { type: "reasoning-delta", id: "r-1", text: " + Step 2" },
            { type: "reasoning-end", id: "r-1" },
            {
                type: "finish-step",
                finishReason: "stop",
                usage: {
                    inputTokens: 10,
                    outputTokens: 20,
                    outputTokenDetails: {
                        reasoningTokens: 7
                    }
                }
            }
        ])

        expect(result.parts).toHaveLength(1)
        expect(result.parts[0]).toMatchObject({
            type: "reasoning",
            reasoning: "Step 1 + Step 2"
        })
        expect(typeof result.parts[0].duration).toBe("number")
        expect(result.totalTokenUsage).toEqual({
            promptTokens: 10,
            completionTokens: 20,
            reasoningTokens: 7
        })
        expect(result.output).toEqual([
            { type: "reasoning-start", id: "r-1" },
            { type: "reasoning-delta", id: "r-1", delta: "Step 1" },
            { type: "reasoning-delta", id: "r-1", delta: " + Step 2" },
            { type: "reasoning-end", id: "r-1" },
            { type: "finish-step" }
        ])
    })
})
