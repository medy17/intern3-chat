import { v } from "convex/values"

export const GeneratedImage = {
    userId: v.string(), // Clerk or custom auth userId
    storageKey: v.string(), // e.g., the R2 key
    prompt: v.optional(v.string()), // Optional for migrated images
    searchText: v.optional(v.string()),
    modelId: v.optional(v.string()),
    aspectRatio: v.optional(v.string()), // Or whatever format ImageSize is
    resolution: v.optional(v.string()), // If applicable
    isArchived: v.optional(v.boolean()),
    createdAt: v.number(), // timestamp
    collectionId: v.optional(v.any())
}
