import {
    getGeneratedImageOrientation,
    normalizeGeneratedImageAspectRatio
} from "@/lib/generated-image-filters"

const normalizeSearchToken = (value: string) => value.trim().replace(/\s+/g, " ")

const dedupeTokens = (values: Array<string | undefined>) => {
    const seen = new Set<string>()
    const tokens: string[] = []

    for (const value of values) {
        if (!value) continue

        const normalized = normalizeSearchToken(value)
        if (!normalized) continue

        const key = normalized.toLocaleLowerCase()
        if (seen.has(key)) continue

        seen.add(key)
        tokens.push(normalized)
    }

    return tokens
}

export const buildGeneratedImageSearchText = ({
    prompt,
    modelId,
    aspectRatio,
    resolution
}: {
    prompt?: string
    modelId?: string
    aspectRatio?: string
    resolution?: string
}) => {
    const normalizedAspectRatio = normalizeGeneratedImageAspectRatio(aspectRatio)
    const orientation = getGeneratedImageOrientation(aspectRatio)
    const tokens = dedupeTokens([
        prompt,
        modelId,
        resolution,
        aspectRatio,
        normalizedAspectRatio,
        orientation
    ])

    return tokens.length > 0 ? tokens.join(" | ") : undefined
}
