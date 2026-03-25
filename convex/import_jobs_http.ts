import { httpAction } from "./_generated/server"
import { r2 } from "./attachments"
import { getUserIdentity } from "./lib/identity"

const MAX_IMPORT_SOURCE_SIZE = 100 * 1024 * 1024
const SUPPORTED_IMPORT_SOURCE_REGEX = /\.(md|markdown|txt|json)$/i
const SUPPORTED_IMPORT_MIME_TYPES = new Set([
    "text/markdown",
    "text/plain",
    "application/markdown",
    "application/json"
])

const isSupportedImportSource = (fileName: string, mimeType?: string | null) =>
    SUPPORTED_IMPORT_SOURCE_REGEX.test(fileName) ||
    (mimeType ? SUPPORTED_IMPORT_MIME_TYPES.has(mimeType.toLowerCase()) : false)

export const uploadImportSource = httpAction(async (ctx, request) => {
    try {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            })
        }

        const formData = await request.formData()
        const file = formData.get("file")
        const fileNameValue = formData.get("fileName")
        const clientSourceIdValue = formData.get("clientSourceId")

        if (!(file instanceof Blob) || typeof fileNameValue !== "string") {
            return new Response(JSON.stringify({ error: "No file provided" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            })
        }

        if (file.size > MAX_IMPORT_SOURCE_SIZE) {
            return new Response(
                JSON.stringify({
                    error: `Import source exceeds ${(MAX_IMPORT_SOURCE_SIZE / (1024 * 1024)).toFixed(0)}MB limit`
                }),
                {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                }
            )
        }

        if (!isSupportedImportSource(fileNameValue, file.type)) {
            return new Response(
                JSON.stringify({ error: `Unsupported import file: ${fileNameValue}` }),
                {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                }
            )
        }

        const fileBuffer = new Uint8Array(await file.arrayBuffer())
        const storageKey = `imports/${user.id}/sources/${Date.now()}-${crypto.randomUUID()}-${fileNameValue}`
        const mimeType = file.type || undefined

        const storedKey = await r2.store(ctx, fileBuffer, {
            authorId: user.id,
            key: storageKey,
            type: mimeType
        })

        return new Response(
            JSON.stringify({
                clientSourceId:
                    typeof clientSourceIdValue === "string" ? clientSourceIdValue : undefined,
                storageKey: storedKey,
                fileName: fileNameValue,
                mimeType,
                size: file.size,
                success: true
            }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" }
            }
        )
    } catch (error) {
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : "Failed to upload import source"
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" }
            }
        )
    }
})
