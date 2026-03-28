"use node"

import { ChatError } from "@/lib/errors"
import type { ImageModelV3 } from "@ai-sdk/provider"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import { action } from "./_generated/server"
import { getModel } from "./chat_http/get_model"
import { generateAndStoreImage } from "./chat_http/image_generation"
import { getUserIdentity } from "./lib/identity"
import type { ImageResolution, ImageSize } from "./lib/models"

export const generateStandaloneImage = action({
    args: {
        prompt: v.string(),
        modelId: v.string(),
        aspectRatio: v.optional(v.string()),
        resolution: v.optional(v.string()),
        referenceImageIds: v.optional(v.array(v.string()))
    },
    handler: async (ctx, args) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new Error("unauthorized:chat")

        const modelData = await getModel(ctx, args.modelId)
        if (modelData instanceof ChatError) throw new Error(modelData.message)

        const { model } = modelData

        const result = await generateAndStoreImage({
            prompt: args.prompt,
            imageSize: (args.aspectRatio || "1:1") as ImageSize,
            imageResolution: args.resolution as ImageResolution | undefined,
            imageModel: model as ImageModelV3,
            modelId: args.modelId,
            userId: user.id,
            actionCtx: ctx,
            referenceImageKeys: args.referenceImageIds,
            maxAssets: 1
        })

        const insertedIds: string[] = []
        for (const asset of result.assets) {
            const id = await ctx.runMutation(internal.images.insertGeneratedImage, {
                userId: user.id,
                storageKey: asset.imageUrl,
                prompt: args.prompt,
                modelId: args.modelId,
                aspectRatio: args.aspectRatio,
                resolution: args.resolution
            })
            insertedIds.push(id)
        }

        return insertedIds
    }
})

export const deleteGeneratedImage = action({
    args: { id: v.id("generatedImages") },
    handler: async (ctx, args) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new Error("unauthorized:chat")

        // Need internal query to get image to check ownership and storageKey
        const image = await ctx.runQuery(internal.images.getGeneratedImageInternal, { id: args.id })
        if (!image) throw new Error("Image not found")
        if (image.userId !== user.id) throw new Error("Unauthorized to delete this image")

        // Import r2 dynamically or statically
        const { r2 } = await import("./attachments")

        try {
            await r2.deleteObject(ctx, image.storageKey)
        } catch (error) {
            console.error("Failed to delete from R2:", error)
            throw new Error("Failed to delete image file from storage")
        }

        await ctx.runMutation(internal.images.removeGeneratedImageInternal, { id: args.id })
    }
})

export const migrateUserImages = action({
    args: {},
    handler: async (ctx) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) return

        const { r2 } = await import("./attachments")
        const keyPrefix = `generations/${user.id}/`
        const pageSize = 200
        let cursor: string | null = null
        const files: { key: string; lastModified: string | number }[] = []
        const seenCursors = new Set<string>()

        while (true) {
            const result: {
                page: { key: string; lastModified: string | number }[]
                isDone: boolean
                continueCursor: string
            } = await r2.listMetadata(ctx, user.id, pageSize, cursor, keyPrefix)
            files.push(...result.page)

            if (result.isDone) break

            if (seenCursors.has(result.continueCursor)) break
            seenCursors.add(result.continueCursor)
            cursor = result.continueCursor
        }

        // Get existing entries from DB
        const existingImages = await ctx.runQuery(internal.images.listGeneratedImagesInternal, {
            userId: user.id
        })
        const existingKeys = new Set(
            existingImages.map((img: { storageKey: string }) => img.storageKey)
        )

        const newFiles = files.filter((f) => !existingKeys.has(f.key))

        for (const file of newFiles) {
            await ctx.runMutation(internal.images.insertGeneratedImage, {
                userId: user.id,
                storageKey: file.key,
                createdAt: new Date(file.lastModified).getTime()
            })
        }
    }
})
