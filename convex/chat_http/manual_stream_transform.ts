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
        totalTokens: number
        estimatedCostUsd?: number
        estimatedPromptCostUsd?: number
        estimatedCompletionCostUsd?: number
    },
    uploadPromises: Promise<void>[],
    userId: string,
    actionCtx: GenericActionCtx<DataModel>,
    streamMetrics?: {
        firstVisibleAtMs?: number
    },
    options?: {
        allowReasoning?: boolean
        onPartsChanged?: () => void
        onToolCall?: (toolCall: { toolCallId: string; toolName: string }) => void
    }
) => {
    let reasoningStartedAt = -1
    let hasSuppressedInlinePayloadNotice = false
    let pendingReasoningStartId: string | null = null
    let activeReasoningId: string | null = null
    const allowReasoning = options?.allowReasoning ?? true
    const REDACTED_REASONING_PATTERN = /^\[REDACTED\]$/i
    const notifyPartsChanged = () => {
        options?.onPartsChanged?.()
    }

    const isLikelyInlineImagePayload = (text: string) => {
        if (text.includes("data:image/")) return true
        if (text.length < 2048) return false
        const compact = text.replace(/\s+/g, "")
        return /^[A-Za-z0-9+/=]+$/.test(compact)
    }

    const canStoreTextChunk = (text: string, type: "text" | "reasoning") => {
        if (type === "text" && isLikelyInlineImagePayload(text)) {
            return false
        }

        return true
    }

    const shouldForwardTextChunk = (text: string) => {
        if (!isLikelyInlineImagePayload(text)) {
            return true
        }

        if (!hasSuppressedInlinePayloadNotice) {
            controllerSafeNotice()
            hasSuppressedInlinePayloadNotice = true
        }

        return false
    }

    let currentTextChunkId: string | null = null
    let textNoticeController: TransformStreamDefaultController<UIMessageChunk> | null = null
    const markFirstVisible = () => {
        if (streamMetrics?.firstVisibleAtMs !== undefined) return
        if (streamMetrics) {
            streamMetrics.firstVisibleAtMs = Date.now()
        }
    }

    const controllerSafeNotice = () => {
        if (!textNoticeController || !currentTextChunkId) return
        markFirstVisible()
        textNoticeController.enqueue({
            type: "text-delta",
            id: currentTextChunkId,
            delta: "\n\n[Image payload omitted from live text stream.]"
        })
    }

    const getReasoningChunkText = (chunk: { text?: string; delta?: string }) => {
        const rawText = chunk.text ?? chunk.delta ?? ""
        const trimmed = rawText.trim()
        if (!trimmed || REDACTED_REASONING_PATTERN.test(trimmed)) {
            return ""
        }
        return rawText
    }

    const appendTextPart = (text: string, type: "text" | "reasoning") => {
        if (!canStoreTextChunk(text, type)) {
            return
        }
        const lastPart = parts[parts.length - 1]

        if (type === "text" && lastPart?.type === "text") {
            lastPart.text += text
            notifyPartsChanged()
            return
        }

        if (type === "reasoning" && lastPart?.type === "reasoning") {
            lastPart.reasoning += text
            lastPart.duration = Date.now() - reasoningStartedAt
            notifyPartsChanged()
            return
        }

        if (type === "text") {
            parts.push({
                type: "text",
                text
            })
            notifyPartsChanged()
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
        notifyPartsChanged()
    }

    let totalBytesTracked = 0
    let chunkCount = 0
    const isValidCost = (value: unknown): value is number =>
        typeof value === "number" && Number.isFinite(value) && value >= 0
    const appendCost = (
        key: "estimatedCostUsd" | "estimatedPromptCostUsd" | "estimatedCompletionCostUsd",
        value: unknown
    ) => {
        if (!isValidCost(value)) return
        totalTokenUsage[key] = (totalTokenUsage[key] ?? 0) + value
    }
    const getRawCostDetails = (
        raw: unknown
    ):
        | {
              upstream_inference_cost?: unknown
              upstream_inference_prompt_cost?: unknown
              upstream_inference_completions_cost?: unknown
          }
        | undefined => {
        if (!raw || typeof raw !== "object" || !("cost_details" in raw)) return undefined
        const costDetails = raw.cost_details
        if (!costDetails || typeof costDetails !== "object") return undefined
        return costDetails
    }

    // biome-ignore lint/suspicious/noExplicitAny: AI SDK stream chunks are provider-polymorphic here
    return new TransformStream<TextStreamPart<any>, UIMessageChunk>({
        transform: async (chunk, controller) => {
            chunkCount++
            // TEMP DIAGNOSTIC: log chunk type and approximate size
            let approxSize = 0
            if (chunk.type === "text-delta") approxSize = chunk.text?.length ?? 0
            else if (chunk.type === "reasoning-delta") approxSize = chunk.text?.length ?? 0
            else if (chunk.type === "file") {
                approxSize =
                    (chunk.file?.uint8Array?.byteLength ?? 0) + (chunk.file?.base64?.length ?? 0)
            }
            totalBytesTracked += approxSize
            if (chunkCount % 50 === 1 || approxSize > 10_000) {
                console.log(
                    `[DIAG] chunk#${chunkCount} type=${chunk.type} size=${approxSize} totalTracked=${totalBytesTracked}`
                )
            }

            switch (chunk.type) {
                case "text-start":
                    currentTextChunkId = chunk.id
                    controller.enqueue({ type: "text-start", id: chunk.id })
                    break
                case "text-delta":
                    textNoticeController = controller
                    if (shouldForwardTextChunk(chunk.text)) {
                        markFirstVisible()
                        controller.enqueue({ type: "text-delta", id: chunk.id, delta: chunk.text })
                    }
                    appendTextPart(chunk.text, "text")
                    break
                case "text-end":
                    currentTextChunkId = null
                    textNoticeController = null
                    controller.enqueue({ type: "text-end", id: chunk.id })
                    break
                case "reasoning-start":
                    if (!allowReasoning) break
                    pendingReasoningStartId = chunk.id
                    break
                case "reasoning-delta": {
                    if (!allowReasoning) break

                    const reasoningText = getReasoningChunkText(chunk)
                    if (!reasoningText) break

                    if (activeReasoningId !== chunk.id) {
                        if (reasoningStartedAt === -1) reasoningStartedAt = Date.now()
                        controller.enqueue({
                            type: "reasoning-start",
                            id: pendingReasoningStartId ?? chunk.id
                        })
                        activeReasoningId = chunk.id
                        pendingReasoningStartId = null
                    }

                    markFirstVisible()
                    controller.enqueue({
                        type: "reasoning-delta",
                        id: chunk.id,
                        delta: reasoningText
                    })
                    appendTextPart(reasoningText, "reasoning")
                    break
                }
                case "reasoning-end":
                    if (!allowReasoning) break

                    if (activeReasoningId === chunk.id) {
                        controller.enqueue({ type: "reasoning-end", id: chunk.id })
                        activeReasoningId = null
                    }
                    if (pendingReasoningStartId === chunk.id) {
                        pendingReasoningStartId = null
                    }
                    reasoningStartedAt = -1
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
                            notifyPartsChanged()

                            controller.enqueue({
                                type: "file",
                                mediaType,
                                url: `/r2?key=${storedKey}`
                            })
                            markFirstVisible()
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
                    notifyPartsChanged()
                    controller.enqueue({
                        type: "file",
                        mediaType,
                        url: dataUrl
                    })
                    markFirstVisible()
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
                    options?.onToolCall?.({
                        toolCallId: chunk.toolCallId,
                        toolName: chunk.toolName
                    })
                    parts.push({
                        type: "tool-invocation",
                        toolInvocation: {
                            state: "call",
                            args: chunk.input,
                            toolCallId: chunk.toolCallId,
                            toolName: chunk.toolName
                        }
                    })
                    notifyPartsChanged()
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
                        notifyPartsChanged()
                    }

                    controller.enqueue({
                        type: "tool-output-available",
                        toolCallId: chunk.toolCallId,
                        output: chunk.output
                    })
                    markFirstVisible()
                    break
                }
                case "tool-error":
                    markFirstVisible()
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
                    notifyPartsChanged()
                    controller.enqueue({
                        type: "error",
                        errorText
                    })
                    break
                }
                case "start-step":
                    controller.enqueue({ type: "start-step" })
                    break
                case "finish-step": {
                    const rawCostDetails = getRawCostDetails(chunk.usage.raw)
                    totalTokenUsage.promptTokens += chunk.usage.inputTokens || 0
                    totalTokenUsage.completionTokens += chunk.usage.outputTokens || 0
                    totalTokenUsage.reasoningTokens +=
                        chunk.usage.outputTokenDetails.reasoningTokens ||
                        chunk.usage.reasoningTokens ||
                        0
                    totalTokenUsage.totalTokens +=
                        chunk.usage.totalTokens ||
                        (chunk.usage.inputTokens || 0) + (chunk.usage.outputTokens || 0)
                    appendCost("estimatedCostUsd", rawCostDetails?.upstream_inference_cost)
                    appendCost(
                        "estimatedPromptCostUsd",
                        rawCostDetails?.upstream_inference_prompt_cost
                    )
                    appendCost(
                        "estimatedCompletionCostUsd",
                        rawCostDetails?.upstream_inference_completions_cost
                    )

                    console.log("[cvx][chat][stream] step-finish", {
                        finishReason: chunk.finishReason,
                        usage: chunk.usage
                    })
                    controller.enqueue({ type: "finish-step" })
                    break
                }
                case "tool-input-end":
                case "tool-approval-request":
                case "start":
                case "finish":
                case "abort":
                case "raw":
                    break
                default: {
                    console.log("[cvx][chat][stream] ignored chunk", chunk)
                }
            }
        }
    })
}
