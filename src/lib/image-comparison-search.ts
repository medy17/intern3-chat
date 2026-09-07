export interface ImageComparisonSearch {
    a?: string
    b?: string
}

export function validateImageComparisonSearch(
    search: Record<string, unknown>
): ImageComparisonSearch {
    // A malformed link should show the picker instructions without sending invalid IDs to Convex.
    const validId = (value: unknown): value is string =>
        typeof value === "string" && /^[a-z0-9]{32}$/.test(value)
    if (!validId(search.a) || !validId(search.b) || search.a === search.b) return {}
    return { a: search.a, b: search.b }
}

export function getImageComparisonUrl(a: string, b: string) {
    return `/compare?${new URLSearchParams({ a, b })}`
}
