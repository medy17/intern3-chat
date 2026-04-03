import { v } from "convex/values"
import { MessagePart } from "./parts"

export const HTTPAIMessage = v.object({
    messageId: v.optional(v.string()),
    role: v.union(
        v.literal("user"),
        v.literal("assistant"),
        v.literal("system")
        // v.literal("data")
    ),
    content: v.optional(v.string()),
    parts: v.array(MessagePart)
})

export const AIMessage = v.object({
    messageId: v.string(),
    role: v.union(
        v.literal("user"),
        v.literal("assistant"),
        v.literal("system")
        // v.literal("data")
    ),
    parts: v.array(MessagePart),
    createdAt: v.number(),
    updatedAt: v.number(),
    metadata: v.object({
        modelId: v.optional(v.string()),
        modelName: v.optional(v.string()),
        displayProvider: v.optional(v.string()),
        runtimeProvider: v.optional(v.string()),
        reasoningEffort: v.optional(
            v.union(v.literal("off"), v.literal("low"), v.literal("medium"), v.literal("high"))
        ),
        promptTokens: v.optional(v.number()),
        completionTokens: v.optional(v.number()),
        reasoningTokens: v.optional(v.number()),
        totalTokens: v.optional(v.number()),
        estimatedCostUsd: v.optional(v.number()),
        estimatedPromptCostUsd: v.optional(v.number()),
        estimatedCompletionCostUsd: v.optional(v.number()),
        serverDurationMs: v.optional(v.number()),
        timeToFirstVisibleMs: v.optional(v.number()),
        creditProviderSource: v.optional(
            v.union(
                v.literal("internal"),
                v.literal("byok"),
                v.literal("openrouter"),
                v.literal("custom"),
                v.literal("unknown")
            )
        ),
        creditBucket: v.optional(v.union(v.literal("basic"), v.literal("pro"), v.literal("none"))),
        creditFeature: v.optional(
            v.union(v.literal("chat"), v.literal("image"), v.literal("tool"))
        ),
        creditUnits: v.optional(v.number()),
        creditCounted: v.optional(v.boolean())
    })
})

export const Message = v.object({
    threadId: v.id("threads"),
    messageId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    parts: v.array(MessagePart),
    createdAt: v.number(),
    updatedAt: v.number(),
    metadata: v.object({
        modelId: v.optional(v.string()),
        modelName: v.optional(v.string()),
        displayProvider: v.optional(v.string()),
        runtimeProvider: v.optional(v.string()),
        reasoningEffort: v.optional(
            v.union(v.literal("off"), v.literal("low"), v.literal("medium"), v.literal("high"))
        ),
        promptTokens: v.optional(v.number()),
        completionTokens: v.optional(v.number()),
        reasoningTokens: v.optional(v.number()),
        totalTokens: v.optional(v.number()),
        estimatedCostUsd: v.optional(v.number()),
        estimatedPromptCostUsd: v.optional(v.number()),
        estimatedCompletionCostUsd: v.optional(v.number()),
        serverDurationMs: v.optional(v.number()),
        timeToFirstVisibleMs: v.optional(v.number()),
        creditProviderSource: v.optional(
            v.union(
                v.literal("internal"),
                v.literal("byok"),
                v.literal("openrouter"),
                v.literal("custom"),
                v.literal("unknown")
            )
        ),
        creditBucket: v.optional(v.union(v.literal("basic"), v.literal("pro"), v.literal("none"))),
        creditFeature: v.optional(
            v.union(v.literal("chat"), v.literal("image"), v.literal("tool"))
        ),
        creditUnits: v.optional(v.number()),
        creditCounted: v.optional(v.boolean())
    })
})
