import type { TextStreamPart, UIMessageChunk } from "ai"
import type { GenericActionCtx } from "convex/server"
import type { Infer } from "convex/values"
import type { DataModel } from "../_generated/dataModel"
import { r2 } from "../attachments"
import type { ErrorUIPart } from "../schema/parts"

type StoredPart =
    | {
          type: "text"
          text: string
      }
    | {
          type: "reasoning"
          reasoning: string
          duration?: number
          details?: Array<{
              type: "text" | "redacted"
              text?: string
              data?: string
              signature?: string
          }>
      }
    | {
          type: "tool-invocation"
          toolInvocation: {
              state: "call" | "result" | "partial-call"
              args?: unknown
              result?: unknown
              toolCallId: string
              toolName: string
              step?: number
          }
      }
    | {
          type: "file"
          data: string
          filename?: string
          mimeType?: string
      }
    | Infer<typeof ErrorUIPart>

export const manualStreamTransform = (
    parts: StoredPart[],
    totalTokenUsage: {
        promptTokens: number
        completionTokens: number
        reasoningTokens: number
    },
    uploadPromises: Promise<void>[],
    userId: string,
    actionCtx: GenericActionCtx<DataModel>
) => {
    let reasoningStartedAt = -1

    const appendTextPart = (text: string, type: "text" | "reasoning") => {
        const lastPart = parts[parts.length - 1]

        if (type === "text" && lastPart?.type === "text") {
            lastPart.text += text
            return
        }

        if (type === "reasoning" && lastPart?.type === "reasoning") {
            lastPart.reasoning += text
            lastPart.duration = Date.now() - reasoningStartedAt
            return
        }

        if (type === "text") {
            parts.push({
                type: "text",
                text
            })
            return
        }

        if (reasoningStartedAt === -1) {
            reasoningStartedAt = Date.now()
        }

        parts.push({
            type: "reasoning",
            reasoning: text,
            details: []
        })
    }

    return new TransformStream<TextStreamPart<any>, UIMessageChunk>({
        transform: async (chunk, controller) => {
            switch (chunk.type) {
                case "text-start":
                    controller.enqueue({ type: "text-start", id: chunk.id })
                    break
                case "text-delta":
                    controller.enqueue({ type: "text-delta", id: chunk.id, delta: chunk.text })
                    appendTextPart(chunk.text, "text")
                    break
                case "text-end":
                    controller.enqueue({ type: "text-end", id: chunk.id })
                    break
                case "reasoning-start":
                    controller.enqueue({ type: "reasoning-start", id: chunk.id })
                    if (reasoningStartedAt === -1) reasoningStartedAt = Date.now()
                    break
                case "reasoning-delta":
                    controller.enqueue({
                        type: "reasoning-delta",
                        id: chunk.id,
                        delta: chunk.text
                    })
                    appendTextPart(chunk.text, "reasoning")
                    break
                case "reasoning-end":
                    controller.enqueue({ type: "reasoning-end", id: chunk.id })
                    break
                case "file": {
                    const mediaType = chunk.file.mediaType

                    if (mediaType.startsWith("image/")) {
                        const upload = (async () => {
                            const fileExtension = mediaType.split("/")[1] || "png"
                            const key = `generations/${userId}/${Date.now()}-${crypto.randomUUID()}-gen.${fileExtension}`

                            const storedKey = await r2.store(actionCtx, chunk.file.uint8Array, {
                                authorId: userId,
                                key,
                                type: mediaType
                            })

                            parts.push({
                                type: "file",
                                mimeType: mediaType,
                                data: storedKey
                            })

                            controller.enqueue({
                                type: "file",
                                mediaType,
                                url: `/r2?key=${storedKey}`
                            })
                        })()

                        uploadPromises.push(upload)
                        await upload
                        break
                    }

                    const dataUrl = `data:${mediaType};base64,${chunk.file.base64}`
                    parts.push({
                        type: "file",
                        mimeType: mediaType,
                        data: dataUrl
                    })
                    controller.enqueue({
                        type: "file",
                        mediaType,
                        url: dataUrl
                    })
                    break
                }
                case "source":
                    if (chunk.sourceType === "url") {
                        controller.enqueue({
                            type: "source-url",
                            sourceId: chunk.id,
                            url: chunk.url,
                            title: chunk.title
                        })
                    } else {
                        controller.enqueue({
                            type: "source-document",
                            sourceId: chunk.id,
                            mediaType: chunk.mediaType,
                            title: chunk.title,
                            filename: chunk.filename
                        })
                    }
                    break
                case "tool-input-start":
                    controller.enqueue({
                        type: "tool-input-start",
                        toolCallId: chunk.id,
                        toolName: chunk.toolName
                    })
                    break
                case "tool-input-delta":
                    controller.enqueue({
                        type: "tool-input-delta",
                        toolCallId: chunk.id,
                        inputTextDelta: chunk.delta
                    })
                    break
                case "tool-call":
                    parts.push({
                        type: "tool-invocation",
                        toolInvocation: {
                            state: "call",
                            args: chunk.input,
                            toolCallId: chunk.toolCallId,
                            toolName: chunk.toolName
                        }
                    })
                    controller.enqueue({
                        type: "tool-input-available",
                        toolCallId: chunk.toolCallId,
                        toolName: chunk.toolName,
                        input: chunk.input
                    })
                    break
                case "tool-result": {
                    const found = parts.findIndex(
                        (part) =>
                            part.type === "tool-invocation" &&
                            part.toolInvocation.toolCallId === chunk.toolCallId
                    )

                    if (found !== -1) {
                        const part = parts[found] as Extract<
                            StoredPart,
                            { type: "tool-invocation" }
                        >
                        part.toolInvocation.state = "result"
                        part.toolInvocation.result = chunk.output
                    }

                    controller.enqueue({
                        type: "tool-output-available",
                        toolCallId: chunk.toolCallId,
                        output: chunk.output
                    })
                    break
                }
                case "tool-error":
                    controller.enqueue({
                        type: "tool-output-error",
                        toolCallId: chunk.toolCallId,
                        errorText: String(chunk.error)
                    })
                    break
                case "error": {
                    const errorText =
                        chunk.error instanceof Error
                            ? chunk.error.message
                            : typeof chunk.error === "string"
                              ? chunk.error
                              : "An error occurred"

                    parts.push({
                        type: "error",
                        error: {
                            code: "unknown",
                            message: errorText
                        }
                    })
                    controller.enqueue({
                        type: "error",
                        errorText
                    })
                    break
                }
                case "start-step":
                    controller.enqueue({ type: "start-step" })
                    break
                case "finish-step":
                    totalTokenUsage.promptTokens += chunk.usage.inputTokens || 0
                    totalTokenUsage.completionTokens += chunk.usage.outputTokens || 0
                    totalTokenUsage.reasoningTokens +=
                        chunk.usage.outputTokenDetails.reasoningTokens ||
                        chunk.usage.reasoningTokens ||
                        0

                    console.log("[cvx][chat][stream] step-finish", {
                        finishReason: chunk.finishReason,
                        usage: chunk.usage
                    })
                    controller.enqueue({ type: "finish-step" })
                    break
                case "tool-input-end":
                case "tool-output-denied":
                case "tool-approval-request":
                case "start":
                case "finish":
                case "abort":
                case "raw":
                    break
                default: {
                    const exhaustiveCheck: never = chunk
                    console.log("[cvx][chat][stream] ignored chunk", exhaustiveCheck)
                }
            }
        }
    })
}
