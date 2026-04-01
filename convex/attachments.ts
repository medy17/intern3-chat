// convex/attachments.ts
import { R2 } from "@convex-dev/r2"
import { v } from "convex/values"
import { components } from "./_generated/api"
import { httpAction, mutation, query } from "./_generated/server"
import {
    MAX_FILE_SIZE,
    MAX_TOKENS_PER_FILE,
    estimateTokenCount,
    getCorrectMimeType,
    getFileTypeInfo,
    isSupportedFile
} from "./lib/file_constants"
import { getUserIdentity } from "./lib/identity"

const sanitizeKeySegment = (name: string) =>
    name
        .normalize("NFD")
        .replace(
            /\u0300|\u0301|\u0302|\u0303|\u0304|\u0305|\u0306|\u0307|\u0308|\u0309|\u030A|\u030B|\u030C|\u030D|\u030E|\u030F|\u0310|\u0311|\u0312|\u0313|\u0314|\u0315|\u0316|\u0317|\u0318|\u0319|\u031A|\u031B|\u031C|\u031D|\u031E|\u031F|\u0320|\u0321|\u0322|\u0323|\u0324|\u0325|\u0326|\u0327|\u0328|\u0329|\u032A|\u032B|\u032C|\u032D|\u032E|\u032F|\u0330|\u0331|\u0332|\u0333|\u0334|\u0335|\u0336|\u0337|\u0338|\u0339|\u033A|\u033B|\u033C|\u033D|\u033E|\u033F|\u0340|\u0341|\u0342|\u0343|\u0344|\u0345|\u0346|\u0347|\u0348|\u0349|\u034A|\u034B|\u034C|\u034D|\u034E|\u034F|\u0350|\u0351|\u0352|\u0353|\u0354|\u0355|\u0356|\u0357|\u0358|\u0359|\u035A|\u035B|\u035C|\u035D|\u035E|\u035F|\u0360|\u0361|\u0362|\u0363|\u0364|\u0365|\u0366|\u0367|\u0368|\u0369|\u036A|\u036B|\u036C|\u036D|\u036E|\u036F/g,
            ""
        )
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 120) || "file"

const r2Unavailable = {
    store: async () => {
        throw new Error("R2 is not configured")
    },
    getMetadata: async () => {
        throw new Error("R2 is not configured")
    },
    deleteObject: async () => {
        throw new Error("R2 is not configured")
    },
    listMetadata: async () => {
        throw new Error("R2 is not configured")
    },
    getUrl: async () => {
        throw new Error("R2 is not configured")
    }
} satisfies Pick<R2, "store" | "getMetadata" | "deleteObject" | "listMetadata" | "getUrl">

export const r2 =
    process.env.R2_BUCKET &&
    process.env.R2_FORCE_PATH_STYLE &&
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
        ? new R2(components.r2)
        : r2Unavailable
// Direct file upload HTTP action for files under 5MB
export const uploadFile = httpAction(async (ctx, request) => {
    try {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            })
        }
        const formData = await request.formData()
        const file = formData.get("file") as Blob

        const fileName = formData.get("fileName") as string

        if (!file) {
            return new Response(JSON.stringify({ error: "No file provided" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            })
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return new Response(
                JSON.stringify({
                    error: `File size exceeds 5MB limit. Current size: ${file.size} bytes`
                }),
                {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                }
            )
        }

        // Validate file type
        if (!isSupportedFile(fileName, file.type)) {
            return new Response(
                JSON.stringify({
                    error: `Unsupported file type: ${fileName}`
                }),
                {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                }
            )
        }

        const fileTypeInfo = getFileTypeInfo(fileName, file.type)

        // Get arrayBuffer once for validation (for text files and PDFs)
        const fileBuffer = await file.arrayBuffer()
        // const bufferCopy = new ArrayBuffer(fileBuffer.byteLength)
        // new Uint8Array(bufferCopy).set(new Uint8Array(fileBuffer))

        // For text files, validate token count
        if (fileTypeInfo.isText && (!fileTypeInfo.isImage || fileTypeInfo.isSvg)) {
            try {
                const text = new TextDecoder().decode(fileBuffer)
                const tokenCount = estimateTokenCount(text)

                if (tokenCount > MAX_TOKENS_PER_FILE) {
                    return new Response(
                        JSON.stringify({
                            error: `File "${fileName}" exceeds ${MAX_TOKENS_PER_FILE.toLocaleString()} token limit (estimated: ${tokenCount.toLocaleString()} tokens)`
                        }),
                        {
                            status: 400,
                            headers: { "Content-Type": "application/json" }
                        }
                    )
                }
            } catch (error) {
                console.error("Error validating text file:", error)
                return new Response(
                    JSON.stringify({
                        error: `Error validating file content: ${fileName}`
                    }),
                    {
                        status: 400,
                        headers: { "Content-Type": "application/json" }
                    }
                )
            }
        } else if (fileTypeInfo.isPdf) {
            // Some issue with the convex runtime. Might come back to this later but...
            // try {
            //     // Check page count
            //     console.log("Estimating PDF...")
            //     const { pageCount, tokenCount } = await estimatePdf(fileBuffer)
            //     console.log("PDF estimated", pageCount, tokenCount)
            //     if (pageCount > MAX_PDF_PAGES) {
            //         return new Response(
            //             JSON.stringify({
            //                 error: `PDF "${fileName}" exceeds ${MAX_PDF_PAGES} page limit (current: ${pageCount} pages)`
            //             }),
            //             {
            //                 status: 400,
            //                 headers: { "Content-Type": "application/json" }
            //             }
            //         )
            //     }
            //     // Check token count
            //     if (tokenCount > MAX_PDF_TOKENS) {
            //         return new Response(
            //             JSON.stringify({
            //                 error: `PDF "${fileName}" exceeds ${MAX_PDF_TOKENS.toLocaleString()} token limit (estimated: ${tokenCount.toLocaleString()} tokens)`
            //             }),
            //             {
            //                 status: 400,
            //                 headers: { "Content-Type": "application/json" }
            //             }
            //         )
            //     }
            // } catch (error) {
            //     console.error("Error validating PDF file:", error)
            //     return new Response(
            //         JSON.stringify({
            //             error: `Error validating PDF content: ${fileName}`
            //         }),
            //         {
            //             status: 400,
            //             headers: { "Content-Type": "application/json" }
            //         }
            //     )
            // }
        }

        // Generate unique key for the file
        const key = `attachments/${user.id}/${Date.now()}-${crypto.randomUUID()}-${sanitizeKeySegment(fileName)}`

        // Get the correct MIME type (handles browser inconsistencies)
        const mimeType = getCorrectMimeType(fileName, file.type)

        // Store file directly in R2
        const storedKey = await r2.store(ctx, new Uint8Array(fileBuffer), {
            authorId: user.id,
            key,
            type: mimeType
        })

        return new Response(
            JSON.stringify({
                key: storedKey,
                fileName: fileName,
                fileType: mimeType, // Return the corrected MIME type
                fileSize: file.size,
                uploadedAt: Date.now(),
                success: true
            }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" }
            }
        )
    } catch (error) {
        console.error("Error uploading file:", error)
        return new Response(
            JSON.stringify({
                error: `Failed to upload file: ${error instanceof Error ? error.message : "Unknown error"}`
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" }
            }
        )
    }
})

// Get file metadata - now with auth check
export const getFileMetadata = query({
    args: { key: v.string() },
    handler: async (ctx, args) => {
        try {
            //i guess if you have the key, you have the file anyway
            // so no auth here...
            const metadata = await r2.getMetadata(ctx, args.key)
            return metadata
        } catch (error) {
            console.error("Error getting file metadata:", error)
            return null
        }
    }
})

// Mutation to delete file - now with auth check
export const deleteFile = mutation({
    args: { key: v.string() },
    handler: async (ctx, args) => {
        try {
            const user = await getUserIdentity(ctx.auth, { allowAnons: false })
            if ("error" in user) {
                return {
                    success: false,
                    error: "Unauthorized"
                }
            }

            const metadata = await r2.getMetadata(ctx, args.key)
            if (!metadata) {
                return {
                    success: false,
                    error: "File not found"
                }
            }

            if (metadata.authorId !== user.id) {
                return {
                    success: false,
                    error: "Access denied: File does not belong to user"
                }
            }

            await r2.deleteObject(ctx, args.key)

            console.log("Successfully deleted file:", args.key)
            return { success: true }
        } catch (error) {
            console.error("Error deleting file:", error)
            return {
                success: false,
                error: `Failed to delete file: ${error instanceof Error ? error.message : "Unknown error"}`
            }
        }
    }
})

// List files for current user only
export const listFiles = query({
    args: {
        limit: v.optional(v.number())
    },
    handler: async (ctx, args) => {
        try {
            const user = await getUserIdentity(ctx.auth, { allowAnons: false })
            if ("error" in user) {
                return []
            }

            return await r2.listMetadata(ctx, user.id, args.limit || 50)
        } catch (error) {
            console.error("Error listing files:", error)
            return []
        }
    }
})

export const listGeneratedFiles = query({
    args: {
        limit: v.optional(v.number()),
        sortBy: v.optional(v.union(v.literal("newest"), v.literal("oldest"), v.literal("size")))
    },
    handler: async (ctx, args) => {
        try {
            const user = await getUserIdentity(ctx.auth, { allowAnons: false })
            if ("error" in user) {
                return []
            }

            const pageSize = 200
            const files: Awaited<ReturnType<typeof r2.listMetadata>>["page"] = []
            let cursor: string | null = null
            const seenCursors = new Set<string>()
            const keyPrefix = `generations/${user.id}/`

            while (true) {
                const result = await r2.listMetadata(ctx, user.id, pageSize, cursor, keyPrefix)
                files.push(...result.page)

                if (result.isDone) {
                    break
                }

                if (seenCursors.has(result.continueCursor)) {
                    console.warn(
                        "[attachments.listGeneratedFiles] Repeated pagination cursor detected"
                    )
                    break
                }

                seenCursors.add(result.continueCursor)
                cursor = result.continueCursor
            }

            switch (args.sortBy || "newest") {
                case "oldest":
                    files.sort(
                        (a, b) =>
                            new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime()
                    )
                    break
                case "size":
                    files.sort((a, b) => (b.size || 0) - (a.size || 0))
                    break
                default:
                    files.sort(
                        (a, b) =>
                            new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
                    )
                    break
            }

            return files.slice(0, args.limit || 200)
        } catch (error) {
            console.error("Error listing generated files:", error)
            return []
        }
    }
})

export const getFile = httpAction(async (ctx, req) => {
    const { searchParams } = new URL(req.url)
    const key = searchParams.get("key")
    if (!key) return new Response(null, { status: 400 })
    try {
        const fileUrl = await r2.getUrl(key)
        const upstream = await fetch(fileUrl)

        if (!upstream.ok) {
            return new Response(null, { status: upstream.status })
        }

        const headers = new Headers()
        const passthroughHeaders = [
            "content-type",
            "content-length",
            "content-disposition",
            "cache-control",
            "etag",
            "last-modified"
        ]

        for (const headerName of passthroughHeaders) {
            const headerValue = upstream.headers.get(headerName)
            if (headerValue) {
                headers.set(headerName, headerValue)
            }
        }

        return new Response(upstream.body, {
            status: upstream.status,
            headers
        })
    } catch (error) {
        console.error("Error fetching file:", error)
        return new Response(null, { status: 500 })
    }
})
