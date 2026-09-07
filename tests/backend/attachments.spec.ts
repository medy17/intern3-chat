import { beforeEach, describe, expect, it, vi } from "vitest"

const { getUserIdentityMock } = vi.hoisted(() => ({
    getUserIdentityMock: vi.fn()
}))

vi.mock("@convex-dev/r2", () => ({
    R2: class {}
}))

vi.mock("convex/values", () => ({
    v: new Proxy(
        {},
        {
            get: () => () => ({})
        }
    )
}))

vi.mock("../../convex/_generated/api", () => ({
    components: {
        r2: "r2"
    },
    internal: {
        account_deletion: {
            getAccountDeletionBlockerInternal: "getAccountDeletionBlockerInternal"
        }
    }
}))

vi.mock("../../convex/_generated/server", () => ({
    httpAction: (handler: unknown) => handler,
    mutation: (config: { handler: unknown }) => config.handler,
    query: (config: { handler: unknown }) => config.handler
}))

vi.mock("../../convex/lib/identity", () => ({
    getUserIdentity: getUserIdentityMock
}))

import {
    deleteFile,
    getFile,
    getUploadPolicy,
    listFiles,
    listGeneratedFiles,
    r2,
    uploadFile
} from "../../convex/attachments"
import { DEFAULT_UPLOAD_POLICY_VERSION, UPLOAD_POLICY_HEADER } from "../../src/lib/file_constants"

const uploadFileHandler = uploadFile as unknown as (
    ctx: Record<string, unknown>,
    request: Request
) => Promise<Response>
const getUploadPolicyHandler = getUploadPolicy as unknown as (
    ctx: Record<string, unknown>,
    args: Record<string, never>
) => Promise<unknown>
const deleteFileHandler = deleteFile as unknown as (
    ctx: Record<string, unknown>,
    args: { key: string }
) => Promise<unknown>
const listGeneratedFilesHandler = listGeneratedFiles as unknown as (
    ctx: Record<string, unknown>,
    args: { limit?: number; sortBy?: "size" | "newest" | "oldest" }
) => Promise<Array<{ key: string }>>
const listFilesHandler = listFiles as unknown as (
    ctx: Record<string, unknown>,
    args: {
        paginationOpts: { numItems: number; cursor: string | null }
        type: "all" | "other"
    }
) => Promise<{ page: Array<{ key: string }> }>
const getFileHandler = getFile as unknown as (
    ctx: Record<string, unknown>,
    request: Request
) => Promise<Response>

type UploadCtx = {
    auth: Record<string, never>
    runQuery: ReturnType<typeof vi.fn>
}
type DeleteCtx = UploadCtx & {
    db: {
        query: ReturnType<typeof vi.fn>
    }
}

const createHttpCtx = () =>
    ({
        auth: {},
        runQuery: vi.fn().mockResolvedValue(null)
    }) as UploadCtx

const createQueryCtx = () =>
    ({
        auth: {},
        runQuery: vi.fn().mockResolvedValue(null),
        db: {
            query: vi.fn().mockReturnValue({
                withIndex: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue(null)
                })
            })
        }
    }) as DeleteCtx

const createFileRequest = (fields?: { file?: Blob; fileName?: string }) => {
    const formData = new FormData()

    if (fields?.file) {
        formData.set("file", fields.file)
    }

    if (fields?.fileName) {
        formData.set("fileName", fields.fileName)
    }

    return new Request("https://example.com/upload", {
        method: "POST",
        body: formData
    })
}

describe("attachments", () => {
    beforeEach(() => {
        getUserIdentityMock.mockReset()
        vi.spyOn(console, "error").mockImplementation(() => {})
        vi.spyOn(console, "warn").mockImplementation(() => {})
        vi.spyOn(crypto, "randomUUID").mockReturnValue("123e4567-e89b-12d3-a456-426614174000")

        r2.store = vi.fn()
        r2.getMetadata = vi.fn()
        r2.deleteObject = vi.fn()
        r2.listMetadata = vi.fn()
        r2.getUrl = vi.fn()
    })

    it("exposes upload policy with a deterministic version", async () => {
        await expect(getUploadPolicyHandler(createQueryCtx(), {})).resolves.toMatchObject({
            version: DEFAULT_UPLOAD_POLICY_VERSION,
            maxFileSize: 15 * 1024 * 1024,
            maxImageFileSize: 5 * 1024 * 1024,
            maxImageDimension: 2048,
            maxAttachmentsPerThread: 100
        })
    })

    it("rejects unauthorized uploads", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ error: "Unauthorized" })

        const response = await uploadFileHandler(createHttpCtx(), createFileRequest())

        expect(response.status).toBe(401)
        expect(response.headers.get(UPLOAD_POLICY_HEADER)).toBe(DEFAULT_UPLOAD_POLICY_VERSION)
        await expect(response.json()).resolves.toMatchObject({
            error: "Unauthorized"
        })
    })

    it("rejects uploads without a file", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })

        const response = await uploadFileHandler(
            createHttpCtx(),
            createFileRequest({ fileName: "notes.txt" })
        )

        expect(response.status).toBe(400)
        expect(response.headers.get(UPLOAD_POLICY_HEADER)).toBe(DEFAULT_UPLOAD_POLICY_VERSION)
        await expect(response.json()).resolves.toMatchObject({
            error: "No file provided"
        })
    })

    it("rejects unsupported file types", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })

        const response = await uploadFileHandler(
            createHttpCtx(),
            createFileRequest({
                file: new Blob(["binary"], { type: "application/octet-stream" }),
                fileName: "archive.zip"
            })
        )

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
            error: "Unsupported file type: archive.zip"
        })
    })

    it("accepts long text above the legacy 32k context-oriented upload limit", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })
        ;(r2.store as ReturnType<typeof vi.fn>).mockResolvedValueOnce("stored-key")

        const response = await uploadFileHandler(
            createHttpCtx(),
            createFileRequest({
                file: new Blob(["a".repeat(128_001)], { type: "text/plain" }),
                fileName: "huge.txt"
            })
        )

        expect(response.status).toBe(200)
        expect(r2.store).toHaveBeenCalledOnce()
    })

    it("stores supported uploads with a normalized text MIME type", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })
        ;(r2.store as ReturnType<typeof vi.fn>).mockResolvedValueOnce("stored-key")

        const response = await uploadFileHandler(
            createHttpCtx(),
            createFileRequest({
                file: new Blob(["const x = 1;"], { type: "application/octet-stream" }),
                fileName: "demo.ts"
            })
        )

        expect(response.status).toBe(200)
        expect(response.headers.get(UPLOAD_POLICY_HEADER)).toBe(DEFAULT_UPLOAD_POLICY_VERSION)
        expect(r2.store).toHaveBeenCalledWith(
            expect.anything(),
            expect.any(Uint8Array),
            expect.objectContaining({
                authorId: "user-1",
                key: expect.stringContaining("attachments/user-1/"),
                type: "text/plain"
            })
        )
        await expect(response.json()).resolves.toMatchObject({
            success: true,
            key: "stored-key",
            fileType: "text/plain",
            fileName: "demo.ts"
        })
    })

    it("surfaces storage failures such as missing R2 configuration", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })
        ;(r2.store as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
            new Error("R2 is not configured")
        )

        const response = await uploadFileHandler(
            createHttpCtx(),
            createFileRequest({
                file: new Blob(["hello"], { type: "text/plain" }),
                fileName: "notes.txt"
            })
        )

        expect(response.status).toBe(500)
        expect(response.headers.get(UPLOAD_POLICY_HEADER)).toBe(DEFAULT_UPLOAD_POLICY_VERSION)
        await expect(response.json()).resolves.toMatchObject({
            error: "Failed to upload file: R2 is not configured"
        })
    })

    it("rejects delete requests for files owned by another user", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })
        ;(r2.getMetadata as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            authorId: "user-2"
        })

        const result = await deleteFileHandler(createQueryCtx(), { key: "file-1" })

        expect(result).toEqual({
            success: false,
            error: "Access denied: File does not belong to user"
        })
        expect(r2.deleteObject).not.toHaveBeenCalled()
    })

    it("deletes files owned by the current user", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })
        ;(r2.getMetadata as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            authorId: "user-1"
        })

        const result = await deleteFileHandler(createQueryCtx(), { key: "file-1" })

        expect(r2.deleteObject).toHaveBeenCalledWith(expect.anything(), "file-1")
        expect(result).toEqual({ success: true })
    })

    it("lists owned TTS audio in Files without adding it to the generated-image gallery", async () => {
        getUserIdentityMock.mockResolvedValue({ id: "user-1" })
        const files = [
            { key: "tts/user-1/new-speech.wav", contentType: "audio/wav" },
            { key: "tts/user-2/private-speech.wav", contentType: "audio/wav" },
            { key: "generations/user-1/image.png", contentType: "image/png" },
            { key: "imports/user-1/source.json", contentType: "application/json" }
        ].map((file) => ({ ...file, lastModified: "2026-09-08T00:00:00.000Z" }))
        ;(r2.listMetadata as ReturnType<typeof vi.fn>).mockImplementation(
            (_ctx, _userId, _limit, _cursor, prefix: string) => ({
                page: files.filter((file) => file.key.startsWith(prefix)),
                isDone: true,
                continueCursor: ""
            })
        )

        const all = await listFilesHandler(createQueryCtx(), {
            paginationOpts: { numItems: 20, cursor: null },
            type: "all"
        })
        expect(all.page.map((file) => file.key).sort()).toEqual([
            "generations/user-1/image.png",
            "tts/user-1/new-speech.wav"
        ])
        const other = await listFilesHandler(createQueryCtx(), {
            paginationOpts: { numItems: 20, cursor: null },
            type: "other"
        })
        expect(other.page.map((file) => file.key)).toEqual(["tts/user-1/new-speech.wav"])
        const gallery = await listGeneratedFilesHandler(createQueryCtx(), {})
        expect(gallery.map((file) => file.key)).toEqual(["generations/user-1/image.png"])
        expect(r2.store).not.toHaveBeenCalled()
        expect(r2.deleteObject).not.toHaveBeenCalled()
    })

    it("walks generated-file pages, deduplicates repeated cursors, and sorts by size", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })
        ;(r2.listMetadata as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                page: [
                    { key: "a", size: 2, lastModified: "2026-03-30T00:00:00.000Z" },
                    { key: "b", size: 8, lastModified: "2026-03-29T00:00:00.000Z" }
                ],
                isDone: false,
                continueCursor: "cursor-1"
            })
            .mockResolvedValueOnce({
                page: [{ key: "c", size: 5, lastModified: "2026-03-31T00:00:00.000Z" }],
                isDone: false,
                continueCursor: "cursor-1"
            })

        const result = await listGeneratedFilesHandler(createQueryCtx(), {
            limit: 10,
            sortBy: "size"
        })

        expect(r2.listMetadata).toHaveBeenNthCalledWith(
            1,
            expect.anything(),
            "user-1",
            200,
            null,
            "generations/user-1/"
        )
        expect(r2.listMetadata).toHaveBeenNthCalledWith(
            2,
            expect.anything(),
            "user-1",
            200,
            "cursor-1",
            "generations/user-1/"
        )
        expect(console.warn).toHaveBeenCalledWith(
            "[attachments.listGeneratedFiles] Repeated pagination cursor detected"
        )
        expect(result.map((file: { key: string }) => file.key)).toEqual(["b", "c", "a"])
    })

    it("proxies file fetches through the resolved storage URL", async () => {
        ;(r2.getUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
            "https://files.example.com/file-1"
        )
        const upstreamResponse = new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: {
                "content-type": "image/png",
                "content-length": "3",
                "cache-control": "public, max-age=60"
            }
        })
        const fetchMock = vi.fn().mockResolvedValueOnce(upstreamResponse)
        vi.stubGlobal("fetch", fetchMock)

        const response = await getFileHandler(
            createHttpCtx(),
            new Request("https://example.com/file?key=file-1")
        )

        expect(fetchMock).toHaveBeenCalledWith("https://files.example.com/file-1")
        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe("image/png")
        expect(response.headers.get("content-length")).toBe("3")
        expect(response.headers.get("cache-control")).toBe("public, max-age=60")
        await expect(response.arrayBuffer()).resolves.toEqual(new Uint8Array([1, 2, 3]).buffer)
    })

    it("applies a longer shared cache policy for generated image sources", async () => {
        ;(r2.getUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
            "https://files.example.com/generated-image"
        )
        const upstreamResponse = new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: {
                "content-type": "image/png",
                "cache-control": "public, max-age=60"
            }
        })
        const fetchMock = vi.fn().mockResolvedValueOnce(upstreamResponse)
        vi.stubGlobal("fetch", fetchMock)

        const response = await getFileHandler(
            createHttpCtx(),
            new Request("https://example.com/file?key=generations%2Fuser-1%2Ffile-1.png")
        )

        expect(response.status).toBe(200)
        expect(response.headers.get("cache-control")).toBe(
            "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=604800"
        )
    })
})
