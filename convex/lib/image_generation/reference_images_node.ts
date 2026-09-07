"use node"

import { getOrCreateImageDerivative } from "./derivatives_node"

import type { GenericActionCtx } from "convex/server"
import type { DataModel } from "../../_generated/dataModel"
import { r2 } from "../../attachments"
import type { FalReferenceImage } from "../models/fal"
import { type ImageReferenceSource, assertOwnedImageKey } from "./shared"

export const MAX_MODEL_REFERENCE_IMAGE_SIZE = 4 * 1024 * 1024

const MODEL_REFERENCE_COMPRESSION_STEPS = [
    { quality: 0.82, maxDimension: 2048 },
    { quality: 0.72, maxDimension: 1536 },
    { quality: 0.62, maxDimension: 1280 }
] as const

const getOrCreateGeneratedReferenceDerivative = (
    ctx: GenericActionCtx<DataModel>,
    args: { userId: string; sourceKey: string }
) =>
    getOrCreateImageDerivative(ctx, {
        ...args,
        profile: {
            subdirectory: "generated",
            maxBytes: MAX_MODEL_REFERENCE_IMAGE_SIZE,
            steps: MODEL_REFERENCE_COMPRESSION_STEPS,
            label: "Reference image",
            errorLabel: "reference image"
        }
    })

export const resolveFalReferenceImagesForProvider = async (
    ctx: GenericActionCtx<DataModel>,
    userId: string,
    references: ImageReferenceSource[] = []
): Promise<FalReferenceImage[]> => {
    const resolved: FalReferenceImage[] = []

    for (const reference of references) {
        const metadata = await assertOwnedImageKey(ctx, userId, reference.key)
        const size = metadata.size
        let key = reference.key

        if (
            reference.source === "generation" &&
            (typeof size !== "number" || size > MAX_MODEL_REFERENCE_IMAGE_SIZE)
        ) {
            key = await getOrCreateGeneratedReferenceDerivative(ctx, {
                userId,
                sourceKey: reference.key
            })
        }

        resolved.push({
            key,
            url: await r2.getUrl(key)
        })
    }

    return resolved
}
