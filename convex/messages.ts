import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { internalMutation, internalQuery, query } from "./_generated/server"
import { getUserIdentity } from "./lib/identity"
import { MessageMetadata } from "./schema/message"
import { MessagePart } from "./schema/parts"

const getRecordArray = (value: unknown) =>
    Array.isArray(value)
        ? value.filter(
              (entry): entry is Record<string, unknown> =>
                  typeof entry === "object" && entry !== null
          )
        : []

const mergeStringArrays = (current: unknown, next: unknown) => {
    if (!Array.isArray(next)) return next
    const merged = new Set<string>()

    for (const value of Array.isArray(current) ? current : []) {
        if (typeof value === "string") merged.add(value)
    }
    for (const value of next) {
        if (typeof value === "string") merged.add(value)
    }

    return Array.from(merged)
}

const getAssetIdentity = (asset: Record<string, unknown>) => {
    const generatedImageId = asset.generatedImageId
    if (typeof generatedImageId === "string") return `id:${generatedImageId}`

    const storageKey = asset.storageKey
    if (typeof storageKey === "string") return `key:${storageKey}`

    const imageUrl = asset.imageUrl
    if (typeof imageUrl === "string") return `url:${imageUrl}`

    return JSON.stringify(asset)
}

const getVariantIndex = (asset: Record<string, unknown>) => {
    const variantIndex = asset.variantIndex
    return typeof variantIndex === "number" && Number.isFinite(variantIndex)
        ? variantIndex
        : undefined
}

const mergeAssetArrays = (current: unknown, next: unknown) => {
    if (!Array.isArray(next)) return next

    const merged = new Map<string, Record<string, unknown>>()
    for (const asset of [...getRecordArray(current), ...getRecordArray(next)]) {
        merged.set(getAssetIdentity(asset), asset)
    }

    return Array.from(merged.values()).sort((left, right) => {
        const leftIndex = getVariantIndex(left)
        const rightIndex = getVariantIndex(right)
        if (leftIndex === undefined && rightIndex === undefined) return 0
        if (leftIndex === undefined) return 1
        if (rightIndex === undefined) return -1
        return leftIndex - rightIndex
    })
}

const mergePreparedImageGenerationResult = (
    currentResult: Record<string, unknown>,
    update: Record<string, unknown>
) => {
    const merged = {
        ...currentResult,
        ...update
    }

    if ("generatedImageIds" in update) {
        merged.generatedImageIds = mergeStringArrays(
            currentResult.generatedImageIds,
            update.generatedImageIds
        )
    }
    if ("assets" in update) {
        merged.assets = mergeAssetArrays(currentResult.assets, update.assets)
    }

    return merged
}

const findPreparedImageGenerationResult = (
    parts: Array<{ type: string; toolInvocation?: unknown }>,
    toolCallId: string,
    cardId: string
) => {
    for (const part of parts) {
        if (part.type !== "tool-invocation") continue

        const invocation = part.toolInvocation as
            | {
                  toolName?: unknown
                  toolCallId?: unknown
                  state?: unknown
                  result?: unknown
              }
            | undefined
        if (
            invocation?.toolName !== "prepareImageGeneration" ||
            invocation.toolCallId !== toolCallId ||
            invocation.state !== "result" ||
            typeof invocation.result !== "object" ||
            invocation.result === null ||
            (invocation.result as Record<string, unknown>).cardId !== cardId
        ) {
            continue
        }

        return invocation.result as Record<string, unknown>
    }

    return null
}

const MEMORY_CHANGE_TOOL_NAMES = new Set(["add_memory", "update_memory", "forget_memory"])

const findPersistentSandboxCardResult = (
    parts: Array<{ type: string; toolInvocation?: unknown }>,
    toolCallId: string,
    cardId: string
) => {
    for (const part of parts) {
        if (part.type !== "tool-invocation") continue

        const invocation = part.toolInvocation as
            | {
                  toolName?: unknown
                  toolCallId?: unknown
                  state?: unknown
                  result?: unknown
              }
            | undefined
        if (
            invocation?.toolName !== "request_persistent_sandbox" ||
            invocation.toolCallId !== toolCallId ||
            invocation.state !== "result" ||
            typeof invocation.result !== "object" ||
            invocation.result === null
        ) {
            continue
        }

        const result = invocation.result as Record<string, unknown>
        if (result.kind === "persistent_sandbox_request" && result.cardId === cardId) {
            return result
        }
    }

    return null
}

const findPreparedMemoryChangeResult = (
    parts: Array<{ type: string; toolInvocation?: unknown }>,
    toolCallId: string,
    cardId: string
) => {
    for (const part of parts) {
        if (part.type !== "tool-invocation") continue

        const invocation = part.toolInvocation as
            | {
                  toolName?: unknown
                  toolCallId?: unknown
                  state?: unknown
                  result?: unknown
              }
            | undefined
        if (
            typeof invocation?.toolName !== "string" ||
            !MEMORY_CHANGE_TOOL_NAMES.has(invocation.toolName) ||
            invocation.toolCallId !== toolCallId ||
            invocation.state !== "result" ||
            typeof invocation.result !== "object" ||
            invocation.result === null
        ) {
            continue
        }

        const result = invocation.result as Record<string, unknown>
        if (result.kind === "prepared_memory_change" && result.cardId === cardId) {
            return result
        }
    }

    return null
}

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

export const getPreparedImageGenerationCardResult = query({
    args: {
        threadId: v.optional(v.id("threads")),
        sharedThreadId: v.optional(v.id("sharedThreads")),
        messageId: v.string(),
        toolCallId: v.string(),
        cardId: v.string()
    },
    handler: async ({ db, auth }, { threadId, sharedThreadId, messageId, toolCallId, cardId }) => {
        if (sharedThreadId) {
            const sharedThread = await db.get(sharedThreadId)
            if (!sharedThread) return null

            const sharedMessage = sharedThread.messages.find(
                (message) => message.messageId === messageId
            )
            const sharedResult = sharedMessage
                ? findPreparedImageGenerationResult(sharedMessage.parts, toolCallId, cardId)
                : null
            if (!sharedResult) return null

            const messages = await db
                .query("messages")
                .withIndex("byMessageId", (q) => q.eq("messageId", messageId))
                .collect()
            const currentMessage = messages.find(
                (candidate) => candidate.threadId === sharedThread.originalThreadId
            )

            return currentMessage
                ? (findPreparedImageGenerationResult(currentMessage.parts, toolCallId, cardId) ??
                      sharedResult)
                : sharedResult
        }

        if (!threadId) return null

        const user = await getUserIdentity(auth, { allowAnons: false })
        if ("error" in user) return null

        const thread = await db.get(threadId)
        if (!thread || thread.authorId !== user.id) return null

        const messages = await db
            .query("messages")
            .withIndex("byMessageId", (q) => q.eq("messageId", messageId))
            .collect()
        const message = messages.find((candidate) => candidate.threadId === threadId)
        if (!message) return null

        return findPreparedImageGenerationResult(message.parts, toolCallId, cardId)
    }
})

export const getPreparedMemoryChangeCardResult = query({
    args: {
        threadId: v.id("threads"),
        messageId: v.string(),
        toolCallId: v.string(),
        cardId: v.string()
    },
    handler: async ({ db, auth }, { threadId, messageId, toolCallId, cardId }) => {
        const user = await getUserIdentity(auth, { allowAnons: false })
        if ("error" in user) return null

        const thread = await db.get(threadId)
        if (!thread || thread.authorId !== user.id) return null

        const messages = await db
            .query("messages")
            .withIndex("byMessageId", (q) => q.eq("messageId", messageId))
            .collect()
        const message = messages.find((candidate) => candidate.threadId === threadId)
        if (!message) return null

        return findPreparedMemoryChangeResult(message.parts, toolCallId, cardId)
    }
})

export const getPersistentSandboxCardResult = query({
    args: {
        threadId: v.id("threads"),
        messageId: v.string(),
        toolCallId: v.string(),
        cardId: v.string()
    },
    handler: async ({ db, auth }, { threadId, messageId, toolCallId, cardId }) => {
        const user = await getUserIdentity(auth, { allowAnons: false })
        if ("error" in user) return null

        const thread = await db.get(threadId)
        if (!thread || thread.authorId !== user.id) return null

        const messages = await db
            .query("messages")
            .withIndex("byMessageId", (q) => q.eq("messageId", messageId))
            .collect()
        const message = messages.find((candidate) => candidate.threadId === threadId)
        if (!message) return null

        return findPersistentSandboxCardResult(message.parts, toolCallId, cardId)
    }
})

export const patchPreparedImageGenerationToolResult = internalMutation({
    args: {
        threadId: v.id("threads"),
        messageId: v.string(),
        toolCallId: v.string(),
        cardId: v.string(),
        update: v.any()
    },
    handler: async ({ db }, { threadId, messageId, toolCallId, cardId, update }) => {
        const msgs = await db
            .query("messages")
            .withIndex("byMessageId", (q) => q.eq("messageId", messageId))
            .collect()
        const msg = msgs.find((candidate) => candidate.threadId === threadId)
        if (!msg) return null

        const parts = msg.parts.map((part) => {
            if (
                part.type !== "tool-invocation" ||
                part.toolInvocation.toolName !== "prepareImageGeneration" ||
                part.toolInvocation.toolCallId !== toolCallId ||
                part.toolInvocation.state !== "result" ||
                typeof part.toolInvocation.result !== "object" ||
                part.toolInvocation.result === null
            ) {
                return part
            }

            const currentResult = part.toolInvocation.result as Record<string, unknown>
            if (currentResult.cardId !== cardId) {
                return part
            }

            return {
                ...part,
                toolInvocation: {
                    ...part.toolInvocation,
                    result: mergePreparedImageGenerationResult(
                        currentResult,
                        update as Record<string, unknown>
                    )
                }
            }
        })

        await db.patch(msg._id as Id<"messages">, {
            parts,
            updatedAt: Date.now()
        })
        await db.patch(threadId, {
            updatedAt: Date.now()
        })

        return { success: true }
    }
})

// Atomically claims a pending image-generation card for submission. Because Convex
// mutations are transactional, this compare-and-swap closes the double-confirm race:
// only the first caller flips `pending_confirmation` -> `submitting` and gets the card
// back; concurrent confirms observe the already-claimed status and bail out.
export const claimPreparedImageGenerationCard = internalMutation({
    args: {
        threadId: v.id("threads"),
        messageId: v.string(),
        toolCallId: v.string(),
        cardId: v.string()
    },
    handler: async ({ db }, { threadId, messageId, toolCallId, cardId }) => {
        const msgs = await db
            .query("messages")
            .withIndex("byMessageId", (q) => q.eq("messageId", messageId))
            .collect()
        const msg = msgs.find((candidate) => candidate.threadId === threadId)
        if (!msg || msg.role !== "assistant") {
            return { ok: false as const, reason: "not_found" as const }
        }

        const part = msg.parts.find(
            (candidate) =>
                candidate.type === "tool-invocation" &&
                candidate.toolInvocation.toolName === "prepareImageGeneration" &&
                candidate.toolInvocation.toolCallId === toolCallId &&
                candidate.toolInvocation.state === "result" &&
                typeof candidate.toolInvocation.result === "object" &&
                candidate.toolInvocation.result !== null &&
                (candidate.toolInvocation.result as Record<string, unknown>).cardId === cardId
        )
        if (!part || part.type !== "tool-invocation") {
            return { ok: false as const, reason: "not_found" as const }
        }

        const currentResult = part.toolInvocation.result as Record<string, unknown>
        if (currentResult.status !== "pending_confirmation") {
            return { ok: false as const, reason: "not_pending" as const }
        }

        const parts = msg.parts.map((candidate) =>
            candidate === part
                ? {
                      ...candidate,
                      toolInvocation: {
                          ...candidate.toolInvocation,
                          result: { ...currentResult, status: "submitting" }
                      }
                  }
                : candidate
        )

        await db.patch(msg._id as Id<"messages">, {
            parts,
            updatedAt: Date.now()
        })
        await db.patch(threadId, {
            updatedAt: Date.now()
        })

        return { ok: true as const, result: currentResult }
    }
})

export const patchPreparedMemoryChangeToolResult = internalMutation({
    args: {
        threadId: v.id("threads"),
        messageId: v.string(),
        toolCallId: v.string(),
        cardId: v.string(),
        update: v.any()
    },
    handler: async ({ db }, { threadId, messageId, toolCallId, cardId, update }) => {
        const msgs = await db
            .query("messages")
            .withIndex("byMessageId", (q) => q.eq("messageId", messageId))
            .collect()
        const msg = msgs.find((candidate) => candidate.threadId === threadId)
        if (!msg) return null

        let didPatch = false
        const parts = msg.parts.map((part) => {
            if (
                part.type !== "tool-invocation" ||
                !MEMORY_CHANGE_TOOL_NAMES.has(part.toolInvocation.toolName) ||
                part.toolInvocation.toolCallId !== toolCallId ||
                part.toolInvocation.state !== "result" ||
                typeof part.toolInvocation.result !== "object" ||
                part.toolInvocation.result === null
            ) {
                return part
            }

            const currentResult = part.toolInvocation.result as Record<string, unknown>
            if (
                currentResult.kind !== "prepared_memory_change" ||
                currentResult.cardId !== cardId
            ) {
                return part
            }

            didPatch = true
            return {
                ...part,
                toolInvocation: {
                    ...part.toolInvocation,
                    result: {
                        ...currentResult,
                        ...(update as Record<string, unknown>)
                    }
                }
            }
        })

        if (!didPatch) return null

        await db.patch(msg._id as Id<"messages">, {
            parts,
            updatedAt: Date.now()
        })
        await db.patch(threadId, {
            updatedAt: Date.now()
        })

        return { success: true }
    }
})

// Claims a pending memory mutation before the external write. Convex mutations are
// transactional, so only one tab can transition a card out of pending confirmation.
export const claimPreparedMemoryChangeCard = internalMutation({
    args: {
        threadId: v.id("threads"),
        messageId: v.string(),
        toolCallId: v.string(),
        cardId: v.string()
    },
    handler: async ({ db }, { threadId, messageId, toolCallId, cardId }) => {
        const msgs = await db
            .query("messages")
            .withIndex("byMessageId", (q) => q.eq("messageId", messageId))
            .collect()
        const msg = msgs.find((candidate) => candidate.threadId === threadId)
        if (!msg || msg.role !== "assistant") {
            return { ok: false as const, reason: "not_found" as const }
        }

        const part = msg.parts.find(
            (candidate) =>
                candidate.type === "tool-invocation" &&
                MEMORY_CHANGE_TOOL_NAMES.has(candidate.toolInvocation.toolName) &&
                candidate.toolInvocation.toolCallId === toolCallId &&
                candidate.toolInvocation.state === "result" &&
                typeof candidate.toolInvocation.result === "object" &&
                candidate.toolInvocation.result !== null &&
                (candidate.toolInvocation.result as Record<string, unknown>).kind ===
                    "prepared_memory_change" &&
                (candidate.toolInvocation.result as Record<string, unknown>).cardId === cardId
        )
        if (!part || part.type !== "tool-invocation") {
            return { ok: false as const, reason: "not_found" as const }
        }

        const currentResult = part.toolInvocation.result as Record<string, unknown>
        if (currentResult.status !== "pending_confirmation") {
            return { ok: false as const, reason: "not_pending" as const }
        }

        const parts = msg.parts.map((candidate) =>
            candidate === part
                ? {
                      ...candidate,
                      toolInvocation: {
                          ...candidate.toolInvocation,
                          result: { ...currentResult, status: "executing" }
                      }
                  }
                : candidate
        )

        await db.patch(msg._id as Id<"messages">, {
            parts,
            updatedAt: Date.now()
        })
        await db.patch(threadId, {
            updatedAt: Date.now()
        })

        return { ok: true as const, result: currentResult }
    }
})

export const cancelPreparedMemoryChangeCard = internalMutation({
    args: {
        threadId: v.id("threads"),
        messageId: v.string(),
        toolCallId: v.string(),
        cardId: v.string()
    },
    handler: async ({ db }, args) => {
        const msgs = await db
            .query("messages")
            .withIndex("byMessageId", (q) => q.eq("messageId", args.messageId))
            .collect()
        const msg = msgs.find((candidate) => candidate.threadId === args.threadId)
        if (!msg || msg.role !== "assistant") return { ok: false as const }

        let cancelled = false
        const parts = msg.parts.map((part) => {
            if (
                part.type !== "tool-invocation" ||
                !MEMORY_CHANGE_TOOL_NAMES.has(part.toolInvocation.toolName) ||
                part.toolInvocation.toolCallId !== args.toolCallId ||
                part.toolInvocation.state !== "result" ||
                typeof part.toolInvocation.result !== "object" ||
                part.toolInvocation.result === null
            ) {
                return part
            }

            const result = part.toolInvocation.result as Record<string, unknown>
            if (
                result.kind !== "prepared_memory_change" ||
                result.cardId !== args.cardId ||
                result.status !== "pending_confirmation"
            ) {
                return part
            }

            cancelled = true
            return {
                ...part,
                toolInvocation: {
                    ...part.toolInvocation,
                    result: { ...result, status: "cancelled" }
                }
            }
        })

        if (!cancelled) return { ok: false as const }

        await db.patch(msg._id as Id<"messages">, { parts, updatedAt: Date.now() })
        await db.patch(args.threadId, { updatedAt: Date.now() })
        return { ok: true as const }
    }
})

export const patchMessage = internalMutation({
    args: {
        threadId: v.id("threads"),
        messageId: v.string(),
        parts: v.array(MessagePart),
        metadata: v.optional(MessageMetadata)
    },
    handler: async ({ db }, { threadId, messageId, parts, metadata }) => {
        const msgs = await db
            .query("messages")
            .withIndex("byMessageId", (q) => q.eq("messageId", messageId))
            .collect()
        const msg = msgs.find((candidate) => candidate.threadId === threadId)
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
