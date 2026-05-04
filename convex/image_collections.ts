import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { getUserIdentity } from "./lib/identity"

export const listCollections = query({
    handler: async (ctx) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) return []

        return await ctx.db
            .query("imageCollections")
            .withIndex("byUserIdAndUpdatedAt", (q) => q.eq("userId", user.id))
            .order("desc")
            .collect()
    }
})

export const createCollection = mutation({
    args: {
        name: v.string(),
        description: v.optional(v.string())
    },
    handler: async (ctx, { name, description }) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new Error("Unauthorized")

        const now = Date.now()
        const collectionId = await ctx.db.insert("imageCollections", {
            userId: user.id,
            name,
            description,
            createdAt: now,
            updatedAt: now
        })

        return collectionId
    }
})

export const updateCollection = mutation({
    args: {
        id: v.id("imageCollections"),
        name: v.optional(v.string()),
        description: v.optional(v.string())
    },
    handler: async (ctx, { id, name, description }) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new Error("Unauthorized")

        const collection = await ctx.db.get(id)
        if (!collection || collection.userId !== user.id) {
            throw new Error("Collection not found")
        }

        const updates: Partial<typeof collection> = { updatedAt: Date.now() }
        if (name !== undefined) updates.name = name
        if (description !== undefined) updates.description = description

        await ctx.db.patch(id, updates)
    }
})

export const deleteCollection = mutation({
    args: {
        id: v.id("imageCollections")
    },
    handler: async (ctx, { id }) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new Error("Unauthorized")

        const collection = await ctx.db.get(id)
        if (!collection || collection.userId !== user.id) {
            throw new Error("Collection not found")
        }

        // Remove collectionId from associated images
        const images = await ctx.db
            .query("generatedImages")
            .withIndex("byCollectionId", (q) => q.eq("collectionId", id))
            .collect()

        for (const image of images) {
            await ctx.db.patch(image._id, { collectionId: undefined })
        }

        await ctx.db.delete(id)
    }
})
