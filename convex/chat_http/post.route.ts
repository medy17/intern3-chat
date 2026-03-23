"use node"

import {
    JsonToSseTransformStream,
    UI_MESSAGE_STREAM_HEADERS,
    createUIMessageStream,
    smoothStream,
    stepCountIs,
    streamText
} from "ai"
import { nanoid } from "nanoid"

import { ChatError } from "@/lib/errors"
import type { ReasoningEffort } from "@/lib/model-store"
import type { AnthropicProviderOptions } from "@ai-sdk/anthropic"
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google"
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai"
import type { Infer } from "convex/values"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { httpAction } from "../_generated/server"
import { dbMessagesToCore } from "../lib/db_to_core_messages"
import { getGoogleAuthMode } from "../lib/google_provider"
import { getUserIdentity } from "../lib/identity"
import {
    type ImageResolution,
    type ImageSize,
    MODELS_SHARED,
    type ModelReasoningProfiles
} from "../lib/models"
import { getResumableStreamContext } from "../lib/resumable_stream_context"
import { type AbilityId, getToolkit } from "../lib/toolkit"
import type { HTTPAIMessage } from "../schema/message"
import type { ErrorUIPart } from "../schema/parts"
import { generateThreadName } from "./generate_thread_name"
import { getModel } from "./get_model"
import { generateAndStoreImage } from "./image_generation"
import { manualStreamTransform } from "./manual_stream_transform"
import { buildPrompt } from "./prompt"

const DEFAULT_REASONING_PROFILES: ModelReasoningProfiles = {
    google: {
        off: { thinkingBudget: 0, includeThoughts: false },
        low: { thinkingBudget: 1000, includeThoughts: true },
        medium: { thinkingBudget: 6000, includeThoughts: true },
        high: { thinkingBudget: 12000, includeThoughts: true }
    },
    openai: {
        low: { reasoningEffort: "low", reasoningSummary: "detailed" },
        medium: { reasoningEffort: "medium", reasoningSummary: "detailed" },
        high: { reasoningEffort: "high", reasoningSummary: "detailed" }
    },
    anthropic: {
        low: { budgetTokens: 1000 },
        medium: { budgetTokens: 6000 },
        high: { budgetTokens: 12000 }
    }
}

const resolveReasoningProfiles = (modelId: string) =>
    MODELS_SHARED.find((model) => model.id === modelId)?.reasoningProfiles

const GOOGLE_IMAGE_PREVIEW_MODEL_IDS = new Set([
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview"
])

const GOOGLE_MINIMUM_SAFETY_SETTINGS = [
    {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "OFF"
    },
    {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "OFF"
    },
    {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "OFF"
    },
    {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "OFF"
    },
    {
        category: "HARM_CATEGORY_CIVIC_INTEGRITY",
        threshold: "OFF"
    }
] as const

const isGoogleImagePreviewModel = (modelId: string) => GOOGLE_IMAGE_PREVIEW_MODEL_IDS.has(modelId)

const buildGoogleProviderOptions = (
    modelId: string,
    reasoningEffort: ReasoningEffort,
    supportsEffortControl = false,
    reasoningProfiles?: ModelReasoningProfiles,
    imageSize?: ImageSize,
    imageResolution?: ImageResolution
): GoogleGenerativeAIProviderOptions => {
    const options: GoogleGenerativeAIProviderOptions = {
        safetySettings: [...GOOGLE_MINIMUM_SAFETY_SETTINGS]
    }

    if (["gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"].includes(modelId)) {
        options.responseModalities = ["IMAGE"]
    } else if (["gemini-2.0-flash-image-generation"].includes(modelId)) {
        options.responseModalities = ["TEXT", "IMAGE"]
    }

    if (isGoogleImagePreviewModel(modelId)) {
        const aspectRatio =
            imageSize && !imageSize.includes("x")
                ? (imageSize as
                      | "1:1"
                      | "16:9"
                      | "9:16"
                      | "4:3"
                      | "3:4"
                      | "2:3"
                      | "3:2"
                      | "4:5"
                      | "5:4"
                      | "21:9")
                : undefined

        options.imageConfig = {
            ...(aspectRatio ? { aspectRatio } : {}),
            imageSize: imageResolution ?? "1K"
        }
    }

    if (supportsEffortControl) {
        const googleProfile =
            reasoningProfiles?.google?.[reasoningEffort] ??
            DEFAULT_REASONING_PROFILES.google?.[reasoningEffort]

        if (googleProfile) {
            options.thinkingConfig = {
                thinkingBudget: googleProfile.thinkingBudget,
                ...(googleProfile.includeThoughts !== undefined
                    ? { includeThoughts: googleProfile.includeThoughts }
                    : {})
            }
        }
    }

    return options
}

const buildOpenAIProviderOptions = (
    modelId: string,
    reasoningEffort: ReasoningEffort,
    supportsEffortControl = false,
    reasoningProfiles?: ModelReasoningProfiles
): OpenAIResponsesProviderOptions => {
    const options: OpenAIResponsesProviderOptions = {}

    const openaiProfile =
        reasoningEffort !== "off"
            ? (reasoningProfiles?.openai?.[reasoningEffort] ??
              DEFAULT_REASONING_PROFILES.openai?.[reasoningEffort])
            : undefined

    if (
        supportsEffortControl &&
        openaiProfile &&
        (modelId.startsWith("o1") ||
            modelId.startsWith("o3") ||
            modelId.startsWith("o4") ||
            modelId.startsWith("gpt-5.4"))
    ) {
        options.reasoningEffort = openaiProfile.reasoningEffort
        options.reasoningSummary = openaiProfile.reasoningSummary
    }

    return options
}

const buildAnthropicProviderOptions = (
    modelId: string,
    reasoningEffort: ReasoningEffort,
    reasoningProfiles?: ModelReasoningProfiles
): AnthropicProviderOptions => {
    const options: AnthropicProviderOptions = {}

    const anthropicProfile =
        reasoningEffort !== "off"
            ? (reasoningProfiles?.anthropic?.[reasoningEffort] ??
              DEFAULT_REASONING_PROFILES.anthropic?.[reasoningEffort])
            : undefined

    if (
        anthropicProfile &&
        ["sonnet-4", "4-sonnet", "4-opus", "opus-4", "3.7"].some((m) => modelId.includes(m))
    ) {
        options.thinking = {
            type: "enabled",
            budgetTokens: anthropicProfile.budgetTokens
        }
    }

    return options
}
export const chatPOST = httpAction(async (ctx, req) => {
    type ChatRequestBody = {
        id?: string
        message: Infer<typeof HTTPAIMessage>
        model: string
        proposedNewAssistantId: string
        enabledTools: AbilityId[]
        targetFromMessageId?: string
        targetMode?: "normal" | "edit" | "retry"
        imageSize?: ImageSize
        imageResolution?: ImageResolution
        mcpOverrides?: Record<string, boolean>
        folderId?: Id<"projects">
        reasoningEffort?: ReasoningEffort
    }

    let body: ChatRequestBody
    try {
        const rawBody = await req.text()
        if (!rawBody.trim()) {
            console.error("[cvx][chat] Empty request body", {
                contentLength: req.headers.get("content-length")
            })
            return new ChatError("bad_request:chat").toResponse()
        }

        body = JSON.parse(rawBody) as ChatRequestBody
    } catch (error) {
        console.error("[cvx][chat] Invalid request body", error)
        return new ChatError("bad_request:chat").toResponse()
    }

    if (!body.message || !body.model || !body.proposedNewAssistantId) {
        return new ChatError("bad_request:chat").toResponse()
    }

    if (body.targetFromMessageId && !body.id) {
        return new ChatError("bad_request:chat").toResponse()
    }

    const user = await getUserIdentity(ctx.auth, { allowAnons: true })
    if ("error" in user) return new ChatError("unauthorized:chat").toResponse()

    const mutationResult = await (async () => {
        try {
            return await ctx.runMutation(internal.threads.createThreadOrInsertMessages, {
                threadId: body.id as Id<"threads">,
                authorId: user.id,
                userMessage: "message" in body ? body.message : undefined,
                proposedNewAssistantId: body.proposedNewAssistantId,
                targetFromMessageId: body.targetFromMessageId,
                targetMode: body.targetMode,
                folderId: body.folderId
            })
        } catch (error) {
            console.error("[cvx][chat] Failed to create or append messages", error)
            return new ChatError("bad_request:chat")
        }
    })()

    if (mutationResult instanceof ChatError) return mutationResult.toResponse()
    if (!mutationResult) return new ChatError("bad_request:chat").toResponse()

    const dbMessages = await ctx.runQuery(internal.messages.getMessagesByThreadId, {
        threadId: mutationResult.threadId
    })
    const streamId = await ctx.runMutation(internal.streams.appendStreamId, {
        threadId: mutationResult.threadId
    })

    const modelData = await getModel(ctx, body.model)
    if (modelData instanceof ChatError) return modelData.toResponse()
    const { model, modelName } = modelData
    const configuredMaxTokens = modelData.registry.models[body.model]?.maxTokens
    const maxTokens =
        typeof configuredMaxTokens === "number" && configuredMaxTokens > 0
            ? configuredMaxTokens
            : 16096
    const effectiveReasoningEffort: ReasoningEffort = body.reasoningEffort ?? "medium"
    const reasoningProfiles = resolveReasoningProfiles(body.model)

    const mapped_messages = await dbMessagesToCore(dbMessages, modelData.abilities)

    const streamStartTime = Date.now()

    const remoteCancel = new AbortController()
    const parts: Array<
        | { type: "text"; text: string }
        | { type: "reasoning"; reasoning: string; duration?: number; details?: [] }
        | {
              type: "tool-invocation"
              toolInvocation: {
                  state: "call" | "result" | "partial-call"
                  args?: unknown
                  result?: unknown
                  toolCallId: string
                  toolName: string
              }
          }
        | { type: "file"; data: string; filename?: string; mimeType?: string }
        | Infer<typeof ErrorUIPart>
    > = []

    const uploadPromises: Promise<void>[] = []
    const settings = await ctx.runQuery(internal.settings.getUserSettingsInternal, {
        userId: user.id
    })

    if (settings.mcpServers && settings.mcpServers.length > 0) {
        const enabledMcpServers = settings.mcpServers.filter((server) => {
            const overrideValue = body.mcpOverrides?.[server.name]
            if (overrideValue === undefined) return server.enabled
            return overrideValue !== false
        })

        if (enabledMcpServers.length > 0) {
            body.enabledTools.push("mcp")
        }
    }

    // Track token usage
    const totalTokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        reasoningTokens: 0
    }

    const stream = createUIMessageStream({
        execute: async ({ writer }) => {
            await ctx.runMutation(internal.threads.updateThreadStreamingState, {
                threadId: mutationResult.threadId,
                isLive: true,
                streamStartedAt: streamStartTime,
                currentStreamId: streamId
            })

            let nameGenerationPromise: Promise<string | ChatError> | undefined
            if (!body.id) {
                nameGenerationPromise = generateThreadName(
                    ctx,
                    mutationResult.threadId,
                    mapped_messages,
                    user.id,
                    settings
                )
            }

            writer.write({
                type: "start",
                messageId: mutationResult.assistantMessageId,
                messageMetadata: {
                    threadId: mutationResult.threadId,
                    streamId,
                    modelId: body.model,
                    modelName
                }
            })

            if (model.modelType === "image") {
                console.log("[cvx][chat][stream] Image generation mode detected")

                // Extract the prompt from the user message
                const userMessage = mapped_messages.find((m) => m.role === "user")

                const prompt =
                    typeof userMessage?.content === "string"
                        ? userMessage.content
                        : userMessage?.content
                              .map((t) => (t.type === "text" ? t.text : undefined))
                              .filter((t) => t !== undefined)
                              .join(" ")

                if (typeof prompt !== "string" || !prompt.trim()) {
                    console.error("[cvx][chat][stream] No valid prompt found for image generation")
                    parts.push({
                        type: "error",
                        error: {
                            code: "unknown",
                            message:
                                "No prompt provided for image generation. Please provide a description of the image you want to create."
                        }
                    })
                    writer.write({
                        type: "error",
                        errorText:
                            "No prompt provided for image generation. Please provide a description of the image you want to create."
                    })
                } else {
                    // Use the provided imageSize or fall back to default
                    const imageSize: ImageSize = (body.imageSize || "1:1") as ImageSize

                    // Create mock tool call for image generation
                    const mockToolCall: {
                        type: "tool-invocation"
                        toolInvocation: {
                            state: "call"
                            args: {
                                imageSize: ImageSize
                                prompt: string
                            }
                            toolCallId: string
                            toolName: "image_generation"
                        }
                    } = {
                        type: "tool-invocation",
                        toolInvocation: {
                            state: "call",
                            args: {
                                imageSize,
                                prompt
                            },
                            toolCallId: nanoid(),
                            toolName: "image_generation"
                        }
                    }

                    parts.push(mockToolCall)
                    writer.write({
                        type: "tool-input-available",
                        toolCallId: mockToolCall.toolInvocation.toolCallId,
                        toolName: mockToolCall.toolInvocation.toolName,
                        input: mockToolCall.toolInvocation.args
                    })

                    // Patch the message with the tool call first
                    await ctx.runMutation(internal.messages.patchMessage, {
                        threadId: mutationResult.threadId,
                        messageId: mutationResult.assistantMessageId,
                        parts: parts,
                        metadata: {
                            modelId: body.model,
                            modelName,
                            serverDurationMs: Date.now() - streamStartTime
                        }
                    })

                    try {
                        // Generate the image
                        const result = await generateAndStoreImage({
                            prompt,
                            imageSize,
                            imageModel: model,
                            modelId: body.model,
                            userId: user.id,
                            threadId: mutationResult.threadId,
                            actionCtx: ctx
                        })

                        // Send tool result
                        writer.write({
                            type: "tool-output-available",
                            toolCallId: mockToolCall.toolInvocation.toolCallId,
                            output: {
                                assets: result.assets,
                                prompt: result.prompt,
                                modelId: result.modelId
                            }
                        })

                        // Update parts with successful result
                        parts[0] = {
                            type: "tool-invocation",
                            toolInvocation: {
                                state: "result",
                                args: mockToolCall.toolInvocation.args,
                                result: {
                                    assets: result.assets,
                                    prompt: result.prompt,
                                    modelId: result.modelId
                                },
                                toolCallId: mockToolCall.toolInvocation.toolCallId,
                                toolName: "image_generation"
                            }
                        }
                    } catch (error) {
                        console.error("[cvx][chat][stream] Image generation failed:", error)

                        // Send error in tool result
                        const errorMessage =
                            error instanceof Error ? error.message : "Unknown error occurred"
                        writer.write({
                            type: "tool-output-available",
                            toolCallId: mockToolCall.toolInvocation.toolCallId,
                            output: {
                                error: errorMessage
                            }
                        })

                        // Update parts with error
                        parts[0] = {
                            type: "tool-invocation",
                            toolInvocation: {
                                state: "result",
                                args: mockToolCall.toolInvocation.args,
                                result: {
                                    error: errorMessage
                                },
                                toolCallId: mockToolCall.toolInvocation.toolCallId,
                                toolName: "image_generation"
                            }
                        }
                    }
                }
            } else {
                const authMode = getGoogleAuthMode("internal")
                const isVertexImageModel =
                    authMode === "vertex" &&
                    (isGoogleImagePreviewModel(modelData.modelId) ||
                        modelData.modelId === "gemini-2.0-flash-image-generation")

                if (isVertexImageModel) {
                    console.log(
                        "[cvx][chat][stream] Using custom Vertex streamGenerateContent for image model"
                    )
                    const vertexStreamPromise = import("./vertex_stream").then((m) =>
                        m.fetchVertexStreamGenerateContent(
                            mapped_messages,
                            modelData.modelId,
                            body.imageSize,
                            body.imageResolution,
                            effectiveReasoningEffort
                        )
                    )

                    const resultStream = await vertexStreamPromise

                    const transformedStream = resultStream.pipeThrough(
                        manualStreamTransform(parts, totalTokenUsage, uploadPromises, user.id, ctx)
                    )

                    const [streamForWriter, streamForBlocking] = transformedStream.tee()

                    writer.merge(streamForWriter)

                    const reader = streamForBlocking.getReader()
                    while (true) {
                        const { done } = await reader.read()
                        if (done) break
                    }

                    await Promise.allSettled(uploadPromises)

                    writer.write({
                        type: "finish",
                        finishReason: "stop",
                        messageMetadata: {
                            threadId: mutationResult.threadId,
                            streamId,
                            modelId: body.model,
                            modelName,
                            promptTokens: totalTokenUsage.promptTokens,
                            completionTokens: totalTokenUsage.completionTokens,
                            reasoningTokens: Math.max(0, totalTokenUsage.reasoningTokens),
                            serverDurationMs: Date.now() - streamStartTime
                        }
                    })
                } else {
                    // Pass the filtered settings (with MCP overrides applied) to the toolkit
                    const filteredSettings = {
                        ...settings,
                        mcpServers: settings.mcpServers?.filter((server) => {
                            if (server.enabled === false) return false
                            const overrideValue = body.mcpOverrides?.[server.name]
                            return overrideValue !== false
                        })
                    }
                    const shouldDisableSmoothTransform = isGoogleImagePreviewModel(
                        modelData.modelId
                    )
                    const result = streamText({
                        model: model,
                        maxOutputTokens: maxTokens,
                        stopWhen: stepCountIs(100),
                        abortSignal: remoteCancel.signal,
                        experimental_transform: shouldDisableSmoothTransform
                            ? undefined
                            : smoothStream(),
                        tools: modelData.abilities.includes("function_calling")
                            ? await getToolkit(ctx, body.enabledTools, filteredSettings)
                            : undefined,
                        messages: [
                            ...(modelData.modelId !== "gemini-2.0-flash-image-generation"
                                ? [
                                      {
                                          role: "system",
                                          content: buildPrompt(body.enabledTools, settings)
                                      } as const
                                  ]
                                : []),
                            ...mapped_messages
                        ],
                        providerOptions: {
                            google: buildGoogleProviderOptions(
                                modelData.modelId,
                                effectiveReasoningEffort,
                                modelData.abilities.includes("effort_control"),
                                reasoningProfiles,
                                body.imageSize,
                                body.imageResolution
                            ),
                            openai: buildOpenAIProviderOptions(
                                modelData.modelId,
                                effectiveReasoningEffort,
                                modelData.abilities.includes("effort_control"),
                                reasoningProfiles
                            ),
                            anthropic: buildAnthropicProviderOptions(
                                modelData.modelId,
                                effectiveReasoningEffort,
                                reasoningProfiles
                            )
                        }
                    })

                    writer.merge(
                        result.fullStream.pipeThrough(
                            manualStreamTransform(
                                parts,
                                totalTokenUsage,
                                uploadPromises,
                                user.id,
                                ctx
                            )
                        )
                    )

                    await Promise.allSettled(uploadPromises)

                    writer.write({
                        type: "finish",
                        finishReason: await result.finishReason,
                        messageMetadata: {
                            threadId: mutationResult.threadId,
                            streamId,
                            modelId: body.model,
                            modelName,
                            promptTokens: totalTokenUsage.promptTokens,
                            completionTokens: totalTokenUsage.completionTokens,
                            reasoningTokens: totalTokenUsage.reasoningTokens,
                            serverDurationMs: Date.now() - streamStartTime
                        }
                    })
                }
            }
            remoteCancel.abort()
            console.log()

            await ctx.runMutation(internal.messages.patchMessage, {
                threadId: mutationResult.threadId,
                messageId: mutationResult.assistantMessageId,
                parts:
                    parts.length > 0
                        ? parts
                        : [
                              {
                                  type: "error",
                                  error: {
                                      code: "no-response",
                                      message:
                                          "The model did not generate a response. Please try again."
                                  }
                              }
                          ],
                metadata: {
                    modelId: body.model,
                    modelName,
                    promptTokens: totalTokenUsage.promptTokens,
                    completionTokens: totalTokenUsage.completionTokens,
                    reasoningTokens: totalTokenUsage.reasoningTokens,
                    serverDurationMs: Date.now() - streamStartTime
                }
            })

            if (model.modelType === "image") {
                writer.write({
                    type: "finish",
                    finishReason: "stop",
                    messageMetadata: {
                        threadId: mutationResult.threadId,
                        streamId,
                        modelId: body.model,
                        modelName,
                        promptTokens: totalTokenUsage.promptTokens,
                        completionTokens: totalTokenUsage.completionTokens,
                        reasoningTokens: totalTokenUsage.reasoningTokens,
                        serverDurationMs: Date.now() - streamStartTime
                    }
                })
            }

            if (nameGenerationPromise) {
                try {
                    await nameGenerationPromise
                } catch (error) {
                    console.error("[cvx][chat][thread-name] Failed to generate thread name:", error)
                }
            }

            await ctx
                .runMutation(internal.threads.updateThreadStreamingState, {
                    threadId: mutationResult.threadId,
                    isLive: false,
                    currentStreamId: undefined
                })
                .catch((err) => console.error("Failed to update thread state:", err))
        },
        onError: (error) => {
            console.error("[cvx][chat][stream] Fatal error:", error)
            // Mark thread as not live on error
            ctx.runMutation(internal.threads.updateThreadStreamingState, {
                threadId: mutationResult.threadId,
                isLive: false
            }).catch((err) => console.error("Failed to update thread state:", err))
            return "Stream error occurred"
        }
    })

    const streamContext = getResumableStreamContext()
    const shouldBypassResumableForImagePayloads =
        model.modelType === "image" || isGoogleImagePreviewModel(modelData.modelId)

    if (streamContext && !shouldBypassResumableForImagePayloads) {
        const sseStream = stream.pipeThrough(new JsonToSseTransformStream())
        return new Response(
            (await streamContext.resumableStream(streamId, () => sseStream))?.pipeThrough(
                new TextEncoderStream()
            ),
            {
                headers: UI_MESSAGE_STREAM_HEADERS
            }
        )
    }

    return new Response(
        stream.pipeThrough(new JsonToSseTransformStream()).pipeThrough(new TextEncoderStream()),
        {
            headers: UI_MESSAGE_STREAM_HEADERS
        }
    )
})
