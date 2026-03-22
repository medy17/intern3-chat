"use node"

import { ChatError } from "@/lib/errors"
import { type CoreMessage, generateText } from "ai"
import type { GenericActionCtx } from "convex/server"
import type { Infer } from "convex/values"
import { internal } from "../_generated/api"
import type { DataModel, Id } from "../_generated/dataModel"
import type { UserSettings } from "../schema"
import { getModel } from "./get_model"

const TITLE_MODEL_FALLBACKS = [
    "gpt-4.1-mini",
    "gpt-4o-mini",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash"
] as const

const contentToText = (content: CoreMessage["content"]): string => {
    if (typeof content === "string") {
        return content
    }

    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (part.type === "text") {
                    return part.text
                }
                if (part.type === "image") {
                    return "[image]"
                }
                if (part.type === "file") {
                    return `[file: ${part.filename || "unknown"}]`
                }
                if (part.type === "tool-call") {
                    return `[tool: ${part.toolName}]`
                }
                if (part.type === "tool-result") {
                    return `[tool result: ${part.toolName}]`
                }
                if (part.type === "reasoning") {
                    return `[reasoning: ${part.text}]`
                }
                return ""
            })
            .join(" ")
    }

    return ""
}

const normalizeTitle = (title: string) =>
    title
        .replace(/[\r\n]+/g, " ")
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100)

const fallbackTitleFromMessages = (messages: CoreMessage[]) => {
    const firstUserMessage = messages.find((message) => message.role === "user")
    const rawTitle = normalizeTitle(contentToText(firstUserMessage?.content ?? ""))

    if (!rawTitle) return "New Chat"

    const words = rawTitle.split(" ")
    return normalizeTitle(words.slice(0, 6).join(" "))
}

const getAvailableTitleModelId = async (
    ctx: GenericActionCtx<DataModel>,
    userId: string,
    preferredModelId: string
) => {
    const registry = await ctx.runQuery(internal.settings.getUserRegistryInternal, {
        userId
    })

    const candidates = [preferredModelId, ...TITLE_MODEL_FALLBACKS]

    return candidates.find((candidate, index) => {
        if (candidates.indexOf(candidate) !== index) return false
        return (registry.models[candidate]?.adapters.length ?? 0) > 0
    })
}

export const generateThreadName = async (
    ctx: GenericActionCtx<DataModel>,
    threadId: Id<"threads">,
    messages: CoreMessage[],
    userId: string,
    settings: Infer<typeof UserSettings>
) => {
    const relevant_messages = messages.filter((message) => message.role !== "system").slice(0, 5)

    const fallbackTitle = fallbackTitleFromMessages(relevant_messages)
    const titleModelId = await getAvailableTitleModelId(ctx, userId, settings.titleGenerationModel)

    if (!titleModelId) {
        await ctx.runMutation(internal.threads.updateThreadName, {
            threadId,
            name: fallbackTitle
        })
        return fallbackTitle
    }

    try {
        const modelData = await getModel(ctx, titleModelId)
        if (modelData instanceof ChatError) {
            throw new Error(modelData.message)
        }

        const { model } = modelData
        if (model.modelType === "image") {
            throw new Error("Title generation model resolved to an image model")
        }

        const result = await generateText({
            model,
            messages: [
                {
                    role: "system",
                    content: `
You are tasked with generating a concise, descriptive title for a chat conversation based on the initial messages. The title should:

1. Be 2-6 words long
2. Capture the main topic or question being discussed
3. Be clear and specific
4. Use title case (capitalize first letter of each major word)
5. Not include quotation marks or special characters
6. Be professional and appropriate

Examples of good titles:
- "Python Data Analysis Help"
- "React Component Design"
- "Travel Planning Italy"
- "Budget Spreadsheet Formula"
- "Career Change Advice"

Generate a title that accurately represents what this conversation is about based on the messages provided.`
                },
                {
                    role: "user",
                    content: `Here are the first 5 messages of the conversation:

${relevant_messages.map((message) => `${message.role}: ${contentToText(message.content)}`).join("\n")}

Generate a title that accurately represents what this conversation is about based on the messages provided.`
                }
            ]
        })

        const generatedTitle = normalizeTitle(result.text) || fallbackTitle
        await ctx.runMutation(internal.threads.updateThreadName, {
            threadId,
            name: generatedTitle
        })

        return generatedTitle
    } catch (error) {
        console.error("[cvx][chat][thread-name] Title generation failed, using fallback:", error)
        await ctx.runMutation(internal.threads.updateThreadName, {
            threadId,
            name: fallbackTitle
        })
        return fallbackTitle
    }
}
