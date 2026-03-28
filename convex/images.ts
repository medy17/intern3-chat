import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { internalMutation, internalQuery, query } from "./_generated/server"
import { getUserIdentity } from "./lib/identity"

const generatedImageSortValidator = v.union(v.literal("newest"), v.literal("oldest"))

export const insertGeneratedImage = internalMutation({
    args: {
        userId: v.string(),
        storageKey: v.string(),
        prompt: v.optional(v.string()),
        modelId: v.optional(v.string()),
        aspectRatio: v.optional(v.string()),
        resolution: v.optional(v.string()),
        createdAt: v.optional(v.number())
    },
    handler: async (ctx, args) => {
        const { createdAt, ...rest } = args
        return await ctx.db.insert("generatedImages", {
            ...rest,
            createdAt: createdAt ?? Date.now()
        })
    }
})

export const listGeneratedImagesInternal = internalQuery({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("generatedImages")
            .withIndex("byUserIdAndCreatedAt", (q) => q.eq("userId", args.userId))
            .collect()
    }
})

export const listGeneratedImages = query({
    args: {},
    handler: async (ctx) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) return []

        const images = await ctx.db
            .query("generatedImages")
            .withIndex("byUserIdAndCreatedAt", (q) => q.eq("userId", user.id))
            .order("desc")
            .collect()

        return images
    }
})

export const paginateGeneratedImages = query({
    args: {
        paginationOpts: paginationOptsValidator,
        sortBy: v.optional(generatedImageSortValidator)
    },
    handler: async (ctx, { paginationOpts, sortBy }) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) {
            return {
                page: [],
                isDone: true,
                continueCursor: ""
            }
        }

        return await ctx.db
            .query("generatedImages")
            .withIndex("byUserIdAndCreatedAt", (q) => q.eq("userId", user.id))
            .order(sortBy === "oldest" ? "asc" : "desc")
            .paginate(paginationOpts)
    }
})

export const getGeneratedImagesCount = query({
    args: {},
    handler: async (ctx) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) return 0

        const images = await ctx.db
            .query("generatedImages")
            .withIndex("byUserIdAndCreatedAt", (q) => q.eq("userId", user.id))
            .collect()

        return images.length
    }
})

export const getGeneratedImageInternal = internalQuery({
    args: { id: v.id("generatedImages") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id)
    }
})

export const removeGeneratedImageInternal = internalMutation({
    args: { id: v.id("generatedImages") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id)
    }
})
