export type MetadataPage<T> = { page: T[]; isDone: boolean; continueCursor: string }

/** Uses the Convex R2 component's pagination contract, not the raw bucket list API. */
export async function* iterateMetadataPages<T>(
    load: (cursor: string | null) => Promise<MetadataPage<T>>,
    onRepeatedCursor?: () => void
) {
    let cursor: string | null = null
    const seen = new Set<string>()
    while (true) {
        const result = await load(cursor)
        yield result.page
        if (result.isDone) return
        if (seen.has(result.continueCursor)) {
            if (onRepeatedCursor) {
                onRepeatedCursor()
                return
            }
            throw new Error("R2 pagination did not advance")
        }
        seen.add(result.continueCursor)
        cursor = result.continueCursor
    }
}
