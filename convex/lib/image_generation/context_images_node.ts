"use node"

import { getOrCreateImageDerivative } from "./derivatives_node"

import type { GenericActionCtx } from "convex/server"
import { v } from "convex/values"
import type { DataModel } from "../../_generated/dataModel"
import { internalAction } from "../../_generated/server"
import { assertOwnedImageKey } from "./shared"

export const MAX_MODEL_CONTEXT_IMAGE_SIZE = 1 * 1024 * 1024

const MODEL_CONTEXT_IMAGE_COMPRESSION_STEPS = [
    { quality: 0.78, maxDimension: 1536 },
    { quality: 0.68, maxDimension: 1280 },
    { quality: 0.58, maxDimension: 1024 }
] as const

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "")
const trimLeadingSlash = (value: string) => value.replace(/^\/+/, "")

const encodeKeyPath = (key: string) =>
    trimLeadingSlash(key)
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")

const buildDirectPublicAssetUrl = (key: string, publicAssetBaseUrl?: string) => {
    if (!publicAssetBaseUrl) {
        throw new Error(
            `R2_PUBLIC_BASE_URL is required to resolve model-facing generated image URLs for ${key}`
        )
    }

    return `${trimTrailingSlash(publicAssetBaseUrl)}/${encodeKeyPath(key)}`
}

const getOrCreateGeneratedImageContextDerivative = (
    ctx: GenericActionCtx<DataModel>,
    args: { userId: string; sourceKey: string }
) =>
    getOrCreateImageDerivative(ctx, {
        ...args,
        profile: {
            subdirectory: "generated-context",
            maxBytes: MAX_MODEL_CONTEXT_IMAGE_SIZE,
            steps: MODEL_CONTEXT_IMAGE_COMPRESSION_STEPS,
            label: "Generated image context",
            errorLabel: "generated image context"
        }
    })

export const resolveGeneratedImageContextUrl = async (
    ctx: GenericActionCtx<DataModel>,
    {
        userId,
        storageKey,
        publicAssetBaseUrl
    }: {
        userId: string
        storageKey: string
        publicAssetBaseUrl?: string
    }
) => {
    const metadata = await assertOwnedImageKey(ctx, userId, storageKey)
    let key = storageKey

    if (typeof metadata.size !== "number" || metadata.size > MAX_MODEL_CONTEXT_IMAGE_SIZE) {
        key = await getOrCreateGeneratedImageContextDerivative(ctx, {
            userId,
            sourceKey: storageKey
        })
    }

    return {
        url: buildDirectPublicAssetUrl(key, publicAssetBaseUrl),
        mediaType: key.endsWith(".webp") ? "image/webp" : metadata.mimeType || "image/png"
    }
}

/**
 * Node-runtime boundary for {@link resolveGeneratedImageContextUrl}. The chat
 * HTTP handler runs in the V8 isolate, which cannot bundle sharp, so it invokes
 * this action via `ctx.runAction` to keep image compression in the Node runtime.
 */
export const resolveGeneratedImageContext = internalAction({
    args: {
        userId: v.string(),
        storageKey: v.string(),
        publicAssetBaseUrl: v.optional(v.string())
    },
    handler: (ctx, args) => resolveGeneratedImageContextUrl(ctx, args)
})
