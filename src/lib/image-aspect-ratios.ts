export const SELECTABLE_IMAGE_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"] as const

export type SelectableImageAspectRatio = (typeof SELECTABLE_IMAGE_ASPECT_RATIOS)[number]

const gcd = (left: number, right: number): number => {
    let a = Math.abs(left)
    let b = Math.abs(right)

    while (b !== 0) {
        const remainder = a % b
        a = b
        b = remainder
    }

    return a || 1
}

const isSelectableImageAspectRatio = (value: string): value is SelectableImageAspectRatio =>
    (SELECTABLE_IMAGE_ASPECT_RATIOS as readonly string[]).includes(value)

export const normalizeExactImageAspectRatio = (size?: string): string | undefined => {
    if (!size) return undefined

    if (size.includes("x")) {
        const [width, height] = size.split("x").map(Number)
        if (width > 0 && height > 0) {
            const divisor = gcd(width, height)
            return `${width / divisor}:${height / divisor}`
        }
    }

    if (size.includes(":")) {
        const [width, height] = size.replace("-hd", "").split(":").map(Number)
        if (width > 0 && height > 0) {
            const divisor = gcd(width, height)
            return `${width / divisor}:${height / divisor}`
        }
    }

    return undefined
}

export const getSelectableImageAspectRatios = (
    supportedImageSizes?: readonly string[] | null
): SelectableImageAspectRatio[] => {
    if (!supportedImageSizes?.length) {
        return [...SELECTABLE_IMAGE_ASPECT_RATIOS]
    }

    const supportedSelectableRatios = new Set<SelectableImageAspectRatio>()

    for (const size of supportedImageSizes) {
        const normalizedRatio = normalizeExactImageAspectRatio(size)
        if (normalizedRatio && isSelectableImageAspectRatio(normalizedRatio)) {
            supportedSelectableRatios.add(normalizedRatio)
        }
    }

    return SELECTABLE_IMAGE_ASPECT_RATIOS.filter((ratio) => supportedSelectableRatios.has(ratio))
}

export const getCommonSelectableImageAspectRatios = (
    supportedImageSizeGroups: Array<readonly string[] | null | undefined>
): SelectableImageAspectRatio[] => {
    if (supportedImageSizeGroups.length === 0) return []

    let intersection = getSelectableImageAspectRatios(supportedImageSizeGroups[0])

    for (let index = 1; index < supportedImageSizeGroups.length; index++) {
        const ratios = getSelectableImageAspectRatios(supportedImageSizeGroups[index])
        intersection = intersection.filter((ratio) => ratios.includes(ratio))
    }

    return intersection
}
