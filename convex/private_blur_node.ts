"use node"

import {
    type PrivateBlurFormat,
    getPrivateBlurAuthorId,
    getPrivateBlurStorageKey
} from "@/lib/private-blur-variants"
import { v } from "convex/values"
import sharp from "sharp"
import { internalAction } from "./_generated/server"
import { r2 } from "./attachments"

const getContentType = (format: PrivateBlurFormat) =>
    format === "avif" ? "image/avif" : "image/webp"

export const ensurePrivateBlur = internalAction({
    args: {
        key: v.string(),
        width: v.number(),
        format: v.union(v.literal("avif"), v.literal("webp"))
    },
    handler: async (ctx, { key, width, format }) => {
        const blurredKey = getPrivateBlurStorageKey({
            storageKey: key,
            width,
            format
        })

        try {
            const existing = await r2.getMetadata(ctx, blurredKey)
            if (existing) {
                return await r2.getUrl(blurredKey)
            }
        } catch {
            // Generate and store on demand below.
        }

        let sourceUrl: string
        try {
            sourceUrl = await r2.getUrl(key)
        } catch {
            return null
        }

        const sourceResponse = await fetch(sourceUrl, {
            headers: {
                Accept: "image/*"
            }
        })

        if (!sourceResponse.ok) {
            return null
        }

        const sourceBytes = new Uint8Array(await sourceResponse.arrayBuffer())

        const transformer = sharp(sourceBytes, { failOn: "none" })
            .rotate()
            .resize({
                width,
                fit: "inside",
                withoutEnlargement: true
            })
            .blur(36)

        const outputBuffer =
            format === "avif"
                ? await transformer.avif({ quality: 55, effort: 7 }).toBuffer()
                : await transformer.webp({ quality: 60 }).toBuffer()

        await r2.store(ctx, new Uint8Array(outputBuffer), {
            authorId: getPrivateBlurAuthorId(key),
            key: blurredKey,
            type: getContentType(format)
        })

        return await r2.getUrl(blurredKey)
    }
})
