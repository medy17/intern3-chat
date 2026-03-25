import { httpAction } from "./_generated/server"
import { r2 } from "./attachments"
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
        const storageKey = `imports/${user.id}/sources/${Date.now()}-${crypto.randomUUID()}-${sanitizeKeySegment(fileNameValue)}`
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
