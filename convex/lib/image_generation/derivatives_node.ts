"use node"

import type { GenericActionCtx } from "convex/server"
import type { DataModel } from "../../_generated/dataModel"
import { r2 } from "../../attachments"
import {
    DEFAULT_UPLOAD_POLICY_VERSION,
    MAX_COMPRESSIBLE_IMAGE_SIZE,
    formatFileSizeLimit
} from "../file_constants"
import { compressImageBytesToWebpLimit } from "../image_compression_node"
import { getMetadataString } from "./shared"

const getSourceKeyHash = async (sourceKey: string) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sourceKey))
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 32)
}

const fetchStoredImageBytes = async (key: string, label: string) => {
    const url = await r2.getUrl(key)
    const response = await fetch(url, {
        headers: {
            Accept: "image/*",
            "Accept-Encoding": "identity"
        }
    })

    if (!response.ok) {
        throw new Error(`Failed to load ${label} (${response.status})`)
    }

    return new Uint8Array(await response.arrayBuffer())
}

export const getOrCreateImageDerivative = async (
    ctx: GenericActionCtx<DataModel>,
    {
        userId,
        sourceKey,
        profile
    }: {
        userId: string
        sourceKey: string
        profile: {
            subdirectory: string
            maxBytes: number
            steps: readonly { quality: number; maxDimension: number }[]
            label: string
            errorLabel: string
        }
    }
) => {
    const sourceHash = await getSourceKeyHash(sourceKey)
    const derivativeKey = `references/${userId}/${profile.subdirectory}/${sourceHash}-${DEFAULT_UPLOAD_POLICY_VERSION}.webp`

    try {
        const existing = await r2.getMetadata(ctx, derivativeKey)
        if (existing && getMetadataString(existing, "authorId") === userId) {
            return derivativeKey
        }
    } catch {
        // Missing derivative: create it below.
    }

    const bytes = await fetchStoredImageBytes(sourceKey, profile.errorLabel)
    if (bytes.byteLength > MAX_COMPRESSIBLE_IMAGE_SIZE) {
        throw new Error(
            `${profile.label} exceeds ${formatFileSizeLimit(MAX_COMPRESSIBLE_IMAGE_SIZE)} limit`
        )
    }

    const compressed = await compressImageBytesToWebpLimit({
        bytes,
        maxBytes: profile.maxBytes,
        steps: profile.steps,
        errorLabel: profile.errorLabel
    })

    return await r2.store(ctx, compressed, {
        authorId: userId,
        key: derivativeKey,
        type: "image/webp",
        cacheControl: "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=604800"
    })
}
