import { v } from "convex/values"

export const ImageCollection = {
    name: v.string(),
    description: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number()
}
