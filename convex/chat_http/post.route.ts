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
import type { OpenRouterProviderOptions } from "@openrouter/ai-sdk-provider"
import type { Infer } from "convex/values"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { httpAction } from "../_generated/server"
import { r2 } from "../attachments"
import {
    resolvePrototypeCreditCharge,
    resolvePrototypeToolCreditCharge,
    resolveRequiredPlanForModelAccess
} from "../lib/credits"
import { dbMessagesToCore } from "../lib/db_to_core_messages"
import { getGoogleAuthMode } from "../lib/google_provider"
import { getUserIdentity } from "../lib/identity"
import {
    type CoreProvider,
    type ImageResolution,
    type ImageSize,
    MODELS_SHARED,
    type ModelReasoningProfiles
} from "../lib/models"
import { type CompiledPersonaSnapshot, compilePersonaSnapshot } from "../lib/personas"
import { getResumableStreamContext } from "../lib/resumable_stream_context"
import {
    type AbilityId,
    type ToolFundingSource,
    getToolkit,
    resolveToolAvailability,
    sanitizeEnabledTools
} from "../lib/toolkit"
import { getBuiltInPersonaDefinition } from "../personas"
import type { HTTPAIMessage } from "../schema/message"
import type { ErrorUIPart } from "../schema/parts"
import { generateThreadName } from "./generate_thread_name"
import { getModel } from "./get_model"
import { generateAndStoreImage } from "./image_generation"
import { manualStreamTransform } from "./manual_stream_transform"
import { buildPrompt } from "./prompt"

type OpenRouterRequestProviderOptions = OpenRouterProviderOptions & {
    extraBody?: Record<string, unknown>
}

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
        low: { budgetTokens: 1024 },
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
const OPENROUTER_ONLY_REASONING_CONTROL_MODEL_IDS = new Set(["grok-4.3"])

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

const normalizeDisplayProvider = (providerId: string | undefined) => {
    switch (providerId) {
        case "x-ai":
            return "xai"
        case "google":
        case "openai":
        case "anthropic":
        case "xai":
        case "groq":
        case "fal":
        case "openrouter":
            return providerId
        default:
            return providerId
    }
}

const resolveDisplayProvider = (
    modelId: string,
    runtimeProvider: CoreProvider | "openrouter" | "custom" | "unknown"
) => {
    const sharedModel = MODELS_SHARED.find((candidate) => candidate.id === modelId)
    if (!sharedModel) {
        if (runtimeProvider === "custom" || runtimeProvider === "unknown") {
            return undefined
        }
        return normalizeDisplayProvider(runtimeProvider)
    }

    if (sharedModel.customIcon) {
        return normalizeDisplayProvider(sharedModel.customIcon)
    }

    const providerAdapter = sharedModel.adapters.find((adapter) => {
        const providerId = adapter.split(":")[0]
        return providerId.startsWith("i3-") || providerId === "openrouter" || providerId === "xai"
    })

    if (providerAdapter) {
        const [providerId, providerModelId] = providerAdapter.split(":")
        if (providerId === "openrouter") {
            return normalizeDisplayProvider(providerModelId.split("/")[0])
        }

        if (providerId.startsWith("i3-")) {
            return normalizeDisplayProvider(providerId.slice(3))
        }

        return normalizeDisplayProvider(providerId)
    }

    if (runtimeProvider === "custom" || runtimeProvider === "unknown") {
        return undefined
    }

    return normalizeDisplayProvider(runtimeProvider)
}

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
            modelId.startsWith("gpt-5"))
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

const buildOpenRouterProviderOptions = (
    modelId: string,
    reasoningEffort: ReasoningEffort,
    supportsEffortControl = false,
    supportsReasoningToggle = false,
    supportsReasoning = false
): OpenRouterProviderOptions => {
    const options: OpenRouterRequestProviderOptions = {}
    const isXaiPinnedReasoningModel = modelId === "grok-4.3"
    const shouldForceReasoningForVariant =
        modelId.endsWith("-reasoning") || modelId.endsWith("-thinking")
    const isAlwaysOnReasoningModel = supportsReasoning && !supportsReasoningToggle

    const baseProviderConfig = isXaiPinnedReasoningModel
        ? {
              only: ["x-ai"],
              allow_fallbacks: false,
              require_parameters: true
          }
        : {
              require_parameters: true
          }

    if (reasoningEffort === "off" && !isAlwaysOnReasoningModel) {
        options.reasoning = {
            enabled: false,
            exclude: true,
            effort: "none"
        }
        options.extraBody = {
            provider: baseProviderConfig,
            include_reasoning: false,
            usage: {
                include: true
            }
        }
        return options
    }

    if (
        (supportsReasoningToggle || isAlwaysOnReasoningModel) &&
        !supportsEffortControl &&
        !shouldForceReasoningForVariant
    ) {
        options.reasoning = {
            enabled: true
        } as OpenRouterRequestProviderOptions["reasoning"]
        options.extraBody = {
            provider: baseProviderConfig,
            include_reasoning: true,
            usage: {
                include: true
            }
        }
        return options
    }

    if (!supportsEffortControl && !shouldForceReasoningForVariant) {
        options.extraBody = {
            provider: baseProviderConfig,
            usage: {
                include: true
            }
        }
        return options
    }

    options.reasoning = {
        enabled: true,
        effort: reasoningEffort === "off" ? "medium" : reasoningEffort
    }
    options.extraBody = {
        provider: baseProviderConfig,
        include_reasoning: true,
        usage: {
            include: true
        }
    }

    return options
}

const resolveEffectiveReasoningEffort = (
    modelId: string,
    requestedReasoningEffort?: ReasoningEffort,
    supportsReasoningToggle = false,
    supportsEffortControl = false,
    supportsReasoning = false
): ReasoningEffort => {
    const reasoningEffort = requestedReasoningEffort ?? "medium"
    const isForcedReasoningVariant = modelId.endsWith("-reasoning") || modelId.endsWith("-thinking")
    const isToggleOnlyReasoningModel = supportsReasoningToggle && !supportsEffortControl
    const isAlwaysOnReasoningModel = supportsReasoning && !supportsReasoningToggle

    if (isForcedReasoningVariant && reasoningEffort === "off") {
        return supportsEffortControl ? "low" : "medium"
    }

    if (isAlwaysOnReasoningModel) {
        return supportsEffortControl
            ? reasoningEffort === "off"
                ? "low"
                : reasoningEffort
            : "medium"
    }

    if (isToggleOnlyReasoningModel) {
        return reasoningEffort === "off" ? "off" : "medium"
    }

    return reasoningEffort
}

const createSafeResumableSseStream = ({
    stream,
    threadId,
    streamId
}: {
    stream: ReadableStream<string>
    threadId: Id<"threads">
    streamId: string
}) => {
    let reader: ReadableStreamDefaultReader<string> | null = null

    return new ReadableStream<string>({
        async start(controller) {
            reader = stream.getReader()

            try {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    controller.enqueue(value)
                }
            } catch (error) {
                console.error("[cvx][chat][stream] Resumable SSE source failed", {
                    threadId,
                    streamId,
                    error
                })
                controller.enqueue(
                    `data: ${JSON.stringify({ type: "error", errorText: "Stream error occurred" })}\n\n`
                )
                controller.enqueue("data: [DONE]\n\n")
            } finally {
                try {
                    controller.close()
                } catch {
                    // Ignore close races after downstream cancellation.
                }
                reader.releaseLock()
                reader = null
            }
        },
        async cancel(reason) {
            await reader?.cancel(reason)
        }
    })
}

type PersonaSelection = {
    source: "default" | "builtin" | "user"
    id?: string
}

const fetchPersonaDocumentText = async (key: string) => {
    const fileUrl = await r2.getUrl(key)
    const response = await fetch(fileUrl)

    if (!response.ok) {
        throw new Error(`Failed to fetch persona knowledge document: ${key}`)
    }

    return await response.text()
}

const resolvePersonaSnapshotForRequest = async (
    ctx: any,
    userId: string,
    selection?: PersonaSelection
): Promise<CompiledPersonaSnapshot | null | ChatError> => {
    if (!selection || selection.source === "default") {
        return null
    }

    if (selection.source === "builtin") {
        const persona = getBuiltInPersonaDefinition(selection.id ?? "")
        if (!persona) {
            return new ChatError("bad_request:chat", "Persona not found.")
        }

        return compilePersonaSnapshot({
            source: "builtin",
            sourceId: persona.id,
            name: persona.name,
            shortName: persona.shortName,
            description: persona.description,
            instructions: persona.instructions,
            defaultModelId: persona.defaultModelId,
            conversationStarters: persona.conversationStarters,
            avatarKind: "builtin",
            avatarValue: persona.avatarPath,
            knowledgeDocs: persona.knowledgeDocs.map((doc) => ({
                fileName: doc.fileName,
                content: doc.content
            }))
        })
    }

    if (!selection.id) {
        return new ChatError("bad_request:chat", "Persona not found.")
    }

    const persona = await ctx.runQuery(internal.personas.getUserPersonaByIdInternal, {
        personaId: selection.id as Id<"userPersonas">
    })

    if (!persona || persona.authorId !== userId) {
        return new ChatError("forbidden:chat", "Persona not found.")
    }

    const knowledgeDocs = await Promise.all(
        persona.knowledgeDocs.map(async (doc: { key: string; fileName: string }) => ({
            fileName: doc.fileName,
            content: await fetchPersonaDocumentText(doc.key)
        }))
    )

    return compilePersonaSnapshot({
        source: "user",
        sourceId: String(persona._id),
        name: persona.name,
        shortName: persona.shortName || persona.name.slice(0, 10),
        description: persona.description,
        instructions: persona.instructions,
        defaultModelId: persona.defaultModelId,
        conversationStarters: persona.conversationStarters,
        avatarKind: persona.avatarKey ? "r2" : undefined,
        avatarValue: persona.avatarKey,
        avatarMimeType: persona.avatarMimeType,
        knowledgeDocs
    })
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
        personaSelection?: PersonaSelection
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
    const userCreditPlan =
        (user as typeof user & { creditPlan?: string }).creditPlan === "pro" ? "pro" : "free"

    const modelData = await getModel(ctx, body.model, {
        reasoningEffort: body.reasoningEffort
    })
    if (modelData instanceof ChatError) return modelData.toResponse()
    const { model, modelName } = modelData
    const displayProvider = resolveDisplayProvider(body.model, modelData.runtimeProvider)
    const configuredMaxTokens = modelData.registry.models[body.model]?.maxTokens
    const selectedRegistryModel = modelData.registry.models[body.model]
    const supportsReasoningToggle =
        selectedRegistryModel?.abilities?.includes("reasoning") === true &&
        selectedRegistryModel?.supportsDisablingReasoning === true
    const supportsReasoning = selectedRegistryModel?.abilities?.includes("reasoning") === true
    const supportsEffortControl =
        modelData.abilities.includes("effort_control") &&
        (!OPENROUTER_ONLY_REASONING_CONTROL_MODEL_IDS.has(body.model) ||
            modelData.runtimeProvider === "openrouter")
    const maxTokens =
        typeof configuredMaxTokens === "number" && configuredMaxTokens > 0
            ? configuredMaxTokens
            : 16096
    const effectiveReasoningEffort = resolveEffectiveReasoningEffort(
        body.model,
        body.reasoningEffort,
        supportsReasoningToggle,
        supportsEffortControl,
        supportsReasoning
    )
    const reasoningProfiles = resolveReasoningProfiles(body.model)
    const requiredPlanForModel = resolveRequiredPlanForModelAccess({
        reasoningEffort: effectiveReasoningEffort,
        availableToPickFor: modelData.availableToPickFor,
        availableToPickForReasoningEfforts: modelData.availableToPickForReasoningEfforts
    })

    if (requiredPlanForModel === "pro" && userCreditPlan !== "pro") {
        return new ChatError(
            "forbidden:chat",
            "Pro plan required for the selected model."
        ).toResponse()
    }

    const modelCreditCharge = resolvePrototypeCreditCharge({
        providerSource: modelData.providerSource,
        modelMode: model.modelType,
        enabledTools: body.enabledTools,
        reasoningEffort: effectiveReasoningEffort,
        prototypeCreditTier: modelData.prototypeCreditTier,
        prototypeCreditTierWithReasoning: modelData.prototypeCreditTierWithReasoning
    })

    const personaSnapshot = !body.id
        ? await resolvePersonaSnapshotForRequest(ctx, user.id, body.personaSelection)
        : null

    if (personaSnapshot instanceof ChatError) {
        return personaSnapshot.toResponse()
    }

    const mutationResult = await (async () => {
        try {
            return await ctx.runMutation(internal.threads.createThreadOrInsertMessages, {
                threadId: body.id as Id<"threads">,
                authorId: user.id,
                userMessage: "message" in body ? body.message : undefined,
                proposedNewAssistantId: body.proposedNewAssistantId,
                targetFromMessageId: body.targetFromMessageId,
                targetMode: body.targetMode,
                folderId: body.folderId,
                personaSnapshot: personaSnapshot ?? undefined
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

    const mapped_messages = await dbMessagesToCore(dbMessages, modelData.abilities, {
        publicAssetBaseUrl: new URL(req.url).origin
    })

    const streamStartTime = Date.now()

    const remoteCancel = new AbortController()
    const abortRemoteGeneration = () => {
        remoteCancel.abort(req.signal.reason)
    }

    if (req.signal.aborted) {
        abortRemoteGeneration()
    } else {
        req.signal.addEventListener("abort", abortRemoteGeneration, { once: true })
    }
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
    const filteredSettings = {
        ...settings,
        mcpServers: settings.mcpServers?.filter((server: { name: string; enabled?: boolean }) => {
            if (server.enabled === false) return false
            const overrideValue = body.mcpOverrides?.[server.name]
            return overrideValue !== false
        })
    }
    const requestedEnabledTools = Array.from(new Set(body.enabledTools))
    if ((filteredSettings.mcpServers ?? []).length > 0) {
        requestedEnabledTools.push("mcp")
    }
    const toolAvailability = resolveToolAvailability(filteredSettings)
    const resolvedEnabledTools = sanitizeEnabledTools(requestedEnabledTools, toolAvailability)
    const toolCalls = new Map<string, { toolCallId: string; toolName: string }>()
    const getToolFundingSource = (toolName: string): ToolFundingSource => {
        if (toolName === "web_search") return toolAvailability.web_search.fundingSource
        return "byok"
    }
    const persistedPersonaSnapshot =
        personaSnapshot ??
        (await ctx.runQuery(internal.personas.getThreadPersonaSnapshotInternal, {
            threadId: mutationResult.threadId
        }))

    // Track token usage
    const totalTokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: undefined as number | undefined,
        estimatedPromptCostUsd: undefined as number | undefined,
        estimatedCompletionCostUsd: undefined as number | undefined
    }
    const streamMetrics: {
        firstVisibleAtMs?: number
    } = {}
    const getTimeToFirstVisibleMs = () =>
        streamMetrics.firstVisibleAtMs !== undefined
            ? Math.max(0, streamMetrics.firstVisibleAtMs - streamStartTime)
            : undefined
    const markFirstVisible = () => {
        if (streamMetrics.firstVisibleAtMs !== undefined) return
        streamMetrics.firstVisibleAtMs = Date.now()
    }
    const cloneStreamParts = () =>
        (typeof structuredClone === "function"
            ? structuredClone(parts)
            : JSON.parse(JSON.stringify(parts))) as typeof parts
    let livePersistTimeout: ReturnType<typeof setTimeout> | null = null
    let livePersistInFlight: Promise<void> | null = null
    let livePersistQueued = false
    let lastLivePersistAt = 0
    let lastLivePersistSignature = ""

    const persistLiveAssistantMessage = async (force = false): Promise<void> => {
        if (parts.length === 0) return

        const now = Date.now()
        const throttleMs = 250
        const remainingThrottleMs = throttleMs - (now - lastLivePersistAt)

        if (!force && remainingThrottleMs > 0) {
            if (!livePersistTimeout) {
                livePersistTimeout = setTimeout(() => {
                    livePersistTimeout = null
                    void persistLiveAssistantMessage()
                }, remainingThrottleMs)
            }
            return
        }

        if (livePersistInFlight) {
            livePersistQueued = true
            return
        }

        const partsSnapshot = cloneStreamParts()
        const signature = JSON.stringify(partsSnapshot)

        if (signature === lastLivePersistSignature) {
            return
        }

        livePersistInFlight = ctx
            .runMutation(internal.messages.patchMessage, {
                threadId: mutationResult.threadId,
                messageId: mutationResult.assistantMessageId,
                parts: partsSnapshot,
                metadata: {
                    serverDurationMs: Date.now() - streamStartTime,
                    timeToFirstVisibleMs: getTimeToFirstVisibleMs()
                }
            })
            .then(() => {
                lastLivePersistSignature = signature
                lastLivePersistAt = Date.now()
            })
            .catch((error) => {
                console.error("[cvx][chat][stream] Failed to persist live assistant parts", {
                    threadId: mutationResult.threadId,
                    messageId: mutationResult.assistantMessageId,
                    error
                })
            })
            .finally(async () => {
                livePersistInFlight = null

                if (livePersistQueued) {
                    livePersistQueued = false
                    await persistLiveAssistantMessage(force)
                }
            })

        await livePersistInFlight
    }

    const scheduleLiveAssistantPersist = () => {
        void persistLiveAssistantMessage()
    }
    const forwardStreamToWriter = async (
        sourceStream: ReadableStream<unknown>,
        writer: { write: (chunk: unknown) => void | Promise<void> }
    ) => {
        const reader = sourceStream.getReader()

        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            await writer.write(value)
        }
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
                    modelName,
                    displayProvider,
                    runtimeProvider: modelData.runtimeProvider,
                    reasoningEffort: effectiveReasoningEffort
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

                const effectivePrompt = persistedPersonaSnapshot?.compiledPrompt
                    ? `${persistedPersonaSnapshot.compiledPrompt}\n\n## User Request\n${prompt ?? ""}`
                    : prompt

                if (typeof effectivePrompt !== "string" || !effectivePrompt.trim()) {
                    console.error("[cvx][chat][stream] No valid prompt found for image generation")
                    parts.push({
                        type: "error",
                        error: {
                            code: "unknown",
                            message:
                                "No prompt provided for image generation. Please provide a description of the image you want to create."
                        }
                    })
                    markFirstVisible()
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
                                prompt: effectivePrompt
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
                            displayProvider,
                            runtimeProvider: modelData.runtimeProvider,
                            reasoningEffort: effectiveReasoningEffort,
                            totalTokens: totalTokenUsage.totalTokens,
                            estimatedCostUsd: totalTokenUsage.estimatedCostUsd,
                            estimatedPromptCostUsd: totalTokenUsage.estimatedPromptCostUsd,
                            estimatedCompletionCostUsd: totalTokenUsage.estimatedCompletionCostUsd,
                            serverDurationMs: Date.now() - streamStartTime,
                            timeToFirstVisibleMs: getTimeToFirstVisibleMs()
                        }
                    })

                    try {
                        // Generate the image
                        const result = await generateAndStoreImage({
                            prompt: effectivePrompt,
                            imageSize,
                            imageResolution: body.imageResolution,
                            imageModel: model,
                            modelId: body.model,
                            userId: user.id,
                            threadId: mutationResult.threadId,
                            actionCtx: ctx,
                            maxAssets: 1,
                            runtimeApiKey: modelData.runtimeApiKey
                        })

                        // Send tool result
                        markFirstVisible()
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
                        markFirstVisible()
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
                        manualStreamTransform(
                            parts,
                            totalTokenUsage,
                            uploadPromises,
                            user.id,
                            ctx,
                            streamMetrics,
                            {
                                allowReasoning: effectiveReasoningEffort !== "off",
                                onPartsChanged: scheduleLiveAssistantPersist,
                                onToolCall: (toolCall) => {
                                    toolCalls.set(toolCall.toolCallId, toolCall)
                                }
                            }
                        )
                    )

                    await forwardStreamToWriter(transformedStream, writer)

                    await Promise.allSettled(uploadPromises)

                    writer.write({
                        type: "finish",
                        finishReason: "stop",
                        messageMetadata: {
                            threadId: mutationResult.threadId,
                            streamId,
                            modelId: body.model,
                            modelName,
                            displayProvider,
                            runtimeProvider: modelData.runtimeProvider,
                            reasoningEffort: effectiveReasoningEffort,
                            promptTokens: totalTokenUsage.promptTokens,
                            completionTokens: totalTokenUsage.completionTokens,
                            reasoningTokens: Math.max(0, totalTokenUsage.reasoningTokens),
                            totalTokens: totalTokenUsage.totalTokens,
                            estimatedCostUsd: totalTokenUsage.estimatedCostUsd,
                            estimatedPromptCostUsd: totalTokenUsage.estimatedPromptCostUsd,
                            estimatedCompletionCostUsd: totalTokenUsage.estimatedCompletionCostUsd,
                            serverDurationMs: Date.now() - streamStartTime,
                            timeToFirstVisibleMs: getTimeToFirstVisibleMs()
                        }
                    })
                } else {
                    const shouldDisableSmoothTransform = isGoogleImagePreviewModel(
                        modelData.modelId
                    )
                    const usesOpenRouter = modelData.runtimeProvider === "openrouter"
                    const result = streamText({
                        model: model,
                        maxOutputTokens: maxTokens,
                        stopWhen: stepCountIs(100),
                        abortSignal: remoteCancel.signal,
                        experimental_transform: shouldDisableSmoothTransform
                            ? undefined
                            : smoothStream(),
                        tools: modelData.abilities.includes("function_calling")
                            ? await getToolkit(ctx, resolvedEnabledTools, filteredSettings)
                            : undefined,
                        messages: [
                            ...(modelData.modelId !== "gemini-2.0-flash-image-generation"
                                ? [
                                      {
                                          role: "system",
                                          content: buildPrompt(
                                              resolvedEnabledTools,
                                              settings,
                                              persistedPersonaSnapshot?.compiledPrompt
                                          )
                                      } as const
                                  ]
                                : []),
                            ...mapped_messages
                        ],
                        providerOptions: usesOpenRouter
                            ? {
                                  openrouter: buildOpenRouterProviderOptions(
                                      modelData.modelId,
                                      effectiveReasoningEffort,
                                      supportsEffortControl,
                                      supportsReasoningToggle,
                                      supportsReasoning
                                  )
                              }
                            : {
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

                    const transformedStream = result.fullStream.pipeThrough(
                        manualStreamTransform(
                            parts,
                            totalTokenUsage,
                            uploadPromises,
                            user.id,
                            ctx,
                            streamMetrics,
                            {
                                allowReasoning: effectiveReasoningEffort !== "off",
                                onPartsChanged: scheduleLiveAssistantPersist,
                                onToolCall: (toolCall) => {
                                    toolCalls.set(toolCall.toolCallId, toolCall)
                                }
                            }
                        )
                    )

                    await forwardStreamToWriter(transformedStream, writer)

                    await Promise.allSettled(uploadPromises)

                    writer.write({
                        type: "finish",
                        finishReason: await result.finishReason,
                        messageMetadata: {
                            threadId: mutationResult.threadId,
                            streamId,
                            modelId: body.model,
                            modelName,
                            displayProvider,
                            runtimeProvider: modelData.runtimeProvider,
                            reasoningEffort: effectiveReasoningEffort,
                            promptTokens: totalTokenUsage.promptTokens,
                            completionTokens: totalTokenUsage.completionTokens,
                            reasoningTokens: totalTokenUsage.reasoningTokens,
                            totalTokens: totalTokenUsage.totalTokens,
                            estimatedCostUsd: totalTokenUsage.estimatedCostUsd,
                            estimatedPromptCostUsd: totalTokenUsage.estimatedPromptCostUsd,
                            estimatedCompletionCostUsd: totalTokenUsage.estimatedCompletionCostUsd,
                            serverDurationMs: Date.now() - streamStartTime,
                            timeToFirstVisibleMs: getTimeToFirstVisibleMs()
                        }
                    })
                }
            }
            remoteCancel.abort()
            console.log()
            req.signal.removeEventListener("abort", abortRemoteGeneration)

            if (livePersistTimeout) {
                clearTimeout(livePersistTimeout)
                livePersistTimeout = null
            }
            await persistLiveAssistantMessage(true)

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
                    displayProvider,
                    runtimeProvider: modelData.runtimeProvider,
                    reasoningEffort: effectiveReasoningEffort,
                    promptTokens: totalTokenUsage.promptTokens,
                    completionTokens: totalTokenUsage.completionTokens,
                    reasoningTokens: totalTokenUsage.reasoningTokens,
                    totalTokens: totalTokenUsage.totalTokens,
                    estimatedCostUsd: totalTokenUsage.estimatedCostUsd,
                    estimatedPromptCostUsd: totalTokenUsage.estimatedPromptCostUsd,
                    estimatedCompletionCostUsd: totalTokenUsage.estimatedCompletionCostUsd,
                    creditProviderSource: modelData.providerSource,
                    creditBucket: modelCreditCharge.bucket,
                    creditFeature: modelCreditCharge.feature,
                    creditUnits: modelCreditCharge.units,
                    creditCounted: modelCreditCharge.counted,
                    serverDurationMs: Date.now() - streamStartTime,
                    timeToFirstVisibleMs: getTimeToFirstVisibleMs()
                }
            })
            await ctx.runMutation(internal.credits.recordCreditEventForMessage, {
                userId: user.id,
                threadId: mutationResult.threadId,
                messageId: mutationResult.assistantMessageId,
                messageKey: `${String(mutationResult.assistantMessageConvexId)}:model`,
                modelId: body.model,
                providerSource: modelData.providerSource,
                feature: modelCreditCharge.feature,
                bucket: modelCreditCharge.bucket,
                units: modelCreditCharge.units,
                counted: modelCreditCharge.counted
            })

            for (const toolCall of toolCalls.values()) {
                const toolCreditCharge = resolvePrototypeToolCreditCharge({
                    fundingSource: getToolFundingSource(toolCall.toolName)
                })
                await ctx.runMutation(internal.credits.recordCreditEventForMessage, {
                    userId: user.id,
                    threadId: mutationResult.threadId,
                    messageId: mutationResult.assistantMessageId,
                    messageKey: `${String(mutationResult.assistantMessageConvexId)}:tool:${toolCall.toolCallId}`,
                    modelId: body.model,
                    providerSource: toolCreditCharge.providerSource,
                    feature: toolCreditCharge.feature,
                    bucket: toolCreditCharge.bucket,
                    units: toolCreditCharge.units,
                    counted: toolCreditCharge.counted
                })
            }

            if (model.modelType === "image") {
                writer.write({
                    type: "finish",
                    finishReason: "stop",
                    messageMetadata: {
                        threadId: mutationResult.threadId,
                        streamId,
                        modelId: body.model,
                        modelName,
                        displayProvider,
                        runtimeProvider: modelData.runtimeProvider,
                        reasoningEffort: effectiveReasoningEffort,
                        promptTokens: totalTokenUsage.promptTokens,
                        completionTokens: totalTokenUsage.completionTokens,
                        reasoningTokens: totalTokenUsage.reasoningTokens,
                        totalTokens: totalTokenUsage.totalTokens,
                        estimatedCostUsd: totalTokenUsage.estimatedCostUsd,
                        estimatedPromptCostUsd: totalTokenUsage.estimatedPromptCostUsd,
                        estimatedCompletionCostUsd: totalTokenUsage.estimatedCompletionCostUsd,
                        serverDurationMs: Date.now() - streamStartTime,
                        timeToFirstVisibleMs: getTimeToFirstVisibleMs()
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
            req.signal.removeEventListener("abort", abortRemoteGeneration)
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
            (
                await streamContext.resumableStream(streamId, () =>
                    createSafeResumableSseStream({
                        stream: sseStream,
                        threadId: mutationResult.threadId,
                        streamId
                    })
                )
            )?.pipeThrough(new TextEncoderStream()),
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
