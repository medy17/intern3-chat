import type { UIMessage } from "ai"

const RENDER_FOOTER_METADATA_KEYS = [
    "modelName",
    "displayProvider",
    "runtimeProvider",
    "reasoningEffort",
    "promptTokens",
    "completionTokens",
    "reasoningTokens",
    "totalTokens",
    "estimatedCostUsd",
    "estimatedPromptCostUsd",
    "estimatedCompletionCostUsd",
    "serverDurationMs",
    "timeToFirstVisibleMs"
] as const

const serializeValue = (value: unknown) => {
    if (value === undefined) {
        return ""
    }

    try {
        return JSON.stringify(value) ?? ""
    } catch {
        return String(value)
    }
}

const getPartRenderFingerprint = (part: UIMessage["parts"][number]) => {
    switch (part.type) {
        case "text":
            return `text:${part.text}`
        case "reasoning":
            return `reasoning:${part.text}:${serializeValue("details" in part ? part.details : undefined)}:${"state" in part ? part.state : ""}`
        case "file":
            return `file:${part.mediaType ?? ""}:${part.filename ?? ""}:${part.url}`
        case "dynamic-tool":
            return `dynamic-tool:${part.toolName}:${serializeValue("input" in part ? part.input : undefined)}:${serializeValue("output" in part ? part.output : undefined)}:${"state" in part ? part.state : ""}`
        default:
            if (part.type.startsWith("tool-")) {
                return `${part.type}:${serializeValue("input" in part ? part.input : undefined)}:${serializeValue("output" in part ? part.output : undefined)}:${"state" in part ? part.state : ""}`
            }

            return part.type
    }
}

export const getMessageFooterMetadataKey = (message: UIMessage) => {
    if (message.role !== "assistant" || !("metadata" in message) || !message.metadata) {
        return undefined
    }

    const metadata = message.metadata as Record<string, unknown>

    return RENDER_FOOTER_METADATA_KEYS.map((key) => metadata[key] ?? "").join("|")
}

export const getMessageRenderFingerprint = (message: UIMessage) =>
    [
        message.role,
        message.id,
        getMessageFooterMetadataKey(message) ?? "",
        message.parts?.map(getPartRenderFingerprint).join("~") ?? ""
    ].join("::")

export const getMessageRenderFingerprintMap = (messages: UIMessage[]) =>
    Object.fromEntries(
        messages.map((message) => [message.id, getMessageRenderFingerprint(message)])
    )
