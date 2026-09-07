export type FileTypeFilter = "all" | "image" | "pdf" | "text" | "other"
export type FileSort = "newest" | "oldest"

export interface ListedFileMetadata {
    contentType?: string
    lastModified: string
}

const USER_VISIBLE_FILE_ROOTS = [
    "attachments",
    "references",
    "generations",
    "tts",
    "code-artifacts",
    "persona-avatars",
    "persona-docs"
] as const

export const getUserVisibleFilePrefixes = (userId: string) =>
    USER_VISIBLE_FILE_ROOTS.map((root) => `${root}/${userId}/`)

export const matchesFileTypeFilter = (contentType: string | undefined, filter: FileTypeFilter) => {
    if (filter === "all") return true

    const normalizedType = contentType?.toLowerCase() ?? ""
    const isImage = normalizedType.startsWith("image/")
    const isPdf = normalizedType === "application/pdf"
    const isText = normalizedType.startsWith("text/")

    if (filter === "image") return isImage
    if (filter === "pdf") return isPdf
    if (filter === "text") return isText

    return !isImage && !isPdf && !isText
}

export const filterAndSortFiles = <T extends ListedFileMetadata>(
    files: T[],
    filter: FileTypeFilter,
    sort: FileSort
) =>
    files
        .filter((file) => matchesFileTypeFilter(file.contentType, filter))
        .sort((a, b) => {
            const difference =
                new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
            return sort === "oldest" ? -difference : difference
        })

export const getFilePaginationOffset = (cursor: string | null) => {
    if (!cursor) return 0

    const offset = Number.parseInt(cursor, 10)
    return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0
}
