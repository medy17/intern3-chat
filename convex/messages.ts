import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { internalMutation, internalQuery } from "./_generated/server"
import { MessagePart } from "./schema/parts"

export const getMessagesByThreadId = internalQuery({
    args: { threadId: v.id("threads") },
    handler: async ({ db }, { threadId }) => {
        return await db
            .query("messages")
            .withIndex("byThreadId", (q) => q.eq("threadId", threadId))
            .order("desc")
            .collect()
    }
})

export const patchMessage = internalMutation({
    args: {
        threadId: v.id("threads"),
        messageId: v.string(),
        parts: v.array(MessagePart),
        metadata: v.optional(
            v.object({
                modelId: v.optional(v.string()),
                modelName: v.optional(v.string()),
                displayProvider: v.optional(v.string()),
                runtimeProvider: v.optional(v.string()),
                reasoningEffort: v.optional(
                    v.union(
                        v.literal("off"),
                        v.literal("low"),
                        v.literal("medium"),
                        v.literal("high")
                    )
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
                creditBucket: v.optional(
                    v.union(v.literal("basic"), v.literal("pro"), v.literal("none"))
                ),
                creditFeature: v.optional(
                    v.union(v.literal("chat"), v.literal("image"), v.literal("tool"))
                ),
                creditUnits: v.optional(v.number()),
                creditCounted: v.optional(v.boolean())
            })
        )
    },
    handler: async ({ db }, { threadId, messageId, parts, metadata }) => {
        const msgs = await db
            .query("messages")
            .withIndex("byMessageId", (q) => q.eq("messageId", messageId))
            .collect()
        const msg = msgs[0]
        if (!msg) return

        await db.patch(msg._id as Id<"messages">, {
            parts,
            metadata: {
                ...msg.metadata,
                ...metadata
            },
            updatedAt: Date.now()
        })

        await db.patch(threadId, {
            updatedAt: Date.now()
        })

        // Create usage event for analytics
        if (metadata?.modelId) {
            const thread = await db.get(threadId)
            if (thread) {
                await db.insert("usageEvents", {
                    userId: thread.authorId,
                    modelId: metadata.modelId,
                    p: metadata.promptTokens ?? 0,
                    c: metadata.completionTokens ?? 0,
                    r: metadata.reasoningTokens ?? 0,
                    daysSinceEpoch: Math.floor(Date.now() / (24 * 60 * 60 * 1000))
                })
            }
        }

        return { success: true, _id: msg._id }
    }
})
