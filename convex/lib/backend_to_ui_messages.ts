import type { UIMessage } from "ai"
import type { Infer } from "convex/values"
import type { Message } from "../schema"
import type { AIMessage } from "../schema/message"

type AIUIMessageWithParts = UIMessage<Infer<typeof AIMessage>["metadata"]> & {
    metadata?: Infer<typeof AIMessage>["metadata"]
}

const isExternalFileReference = (value: string) =>
    value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")

export const backendToUiMessages = (messages: Infer<typeof Message>[]): AIUIMessageWithParts[] => {
    if (!messages || messages.length === 0) {
        return []
    }

    const result = messages.map((message) => {
        const uiMessage: AIUIMessageWithParts = {
            metadata: message.metadata,
            id: message.messageId,
            role: message.role,
            parts:
                message.parts?.map((part) => {
                    if (part.type === "image") {
                        return {
                            type: "file" as const,
                            mediaType: part.mimeType || "image/png",
                            url: part.image
                        }
                    }

                    if (part.type === "error") {
                        return {
                            type: "text" as const,
                            text: part.error.message
                        }
                    }

                    if (part.type === "reasoning") {
                        return {
                            type: "reasoning" as const,
                            text: part.reasoning
                        }
                    }

                    if (part.type === "file") {
                        return {
                            type: "file" as const,
                            filename: part.filename,
                            mediaType: part.mimeType || "application/octet-stream",
                            url: isExternalFileReference(part.data)
                                ? part.data
                                : `/r2?key=${part.data}`
                        }
                    }

                    if (part.type === "tool-invocation") {
                        return {
                            type: `tool-${part.toolInvocation.toolName}` as const,
                            toolCallId: part.toolInvocation.toolCallId,
                            state:
                                part.toolInvocation.state === "result"
                                    ? "output-available"
                                    : "input-available",
                            input: part.toolInvocation.args,
                            ...(part.toolInvocation.state === "result"
                                ? { output: part.toolInvocation.result }
                                : {})
                        }
                    }

                    return part
                }) ?? []
        }
        return uiMessage
    })

    return result
}
