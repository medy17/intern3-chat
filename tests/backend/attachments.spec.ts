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

import { deleteFile, getFile, listGeneratedFiles, r2, uploadFile } from "../../convex/attachments"

type UploadCtx = Parameters<typeof uploadFile>[0]
type DeleteCtx = Parameters<typeof deleteFile>[0]

const createHttpCtx = () =>
    ({
        auth: {}
    }) as UploadCtx

const createQueryCtx = () =>
    ({
        auth: {}
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
        vi.spyOn(crypto, "randomUUID").mockReturnValue("uuid-1")

        r2.store = vi.fn()
        r2.getMetadata = vi.fn()
        r2.deleteObject = vi.fn()
        r2.listMetadata = vi.fn()
        r2.getUrl = vi.fn()
    })

    it("rejects unauthorized uploads", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ error: "Unauthorized" })

        const response = await uploadFile(createHttpCtx(), createFileRequest())

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toMatchObject({
            error: "Unauthorized"
        })
    })

    it("rejects uploads without a file", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })

        const response = await uploadFile(
            createHttpCtx(),
            createFileRequest({ fileName: "notes.txt" })
        )

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
            error: "No file provided"
        })
    })

    it("rejects unsupported file types", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })

        const response = await uploadFile(
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

    it("rejects text files whose estimated token count exceeds the limit", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })

        const response = await uploadFile(
            createHttpCtx(),
            createFileRequest({
                file: new Blob(["a".repeat(128_001)], { type: "text/plain" }),
                fileName: "huge.txt"
            })
        )

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
            error: expect.stringContaining("exceeds 32,000 token limit")
        })
    })

    it("stores supported uploads with a normalized text MIME type", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })
        ;(r2.store as ReturnType<typeof vi.fn>).mockResolvedValueOnce("stored-key")

        const response = await uploadFile(
            createHttpCtx(),
            createFileRequest({
                file: new Blob(["const x = 1;"], { type: "application/octet-stream" }),
                fileName: "demo.ts"
            })
        )

        expect(response.status).toBe(200)
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

        const response = await uploadFile(
            createHttpCtx(),
            createFileRequest({
                file: new Blob(["hello"], { type: "text/plain" }),
                fileName: "notes.txt"
            })
        )

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toMatchObject({
            error: "Failed to upload file: R2 is not configured"
        })
    })

    it("rejects delete requests for files owned by another user", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })
        ;(r2.getMetadata as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            authorId: "user-2"
        })

        const result = await deleteFile(createQueryCtx(), { key: "file-1" })

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

        const result = await deleteFile(createQueryCtx(), { key: "file-1" })

        expect(r2.deleteObject).toHaveBeenCalledWith(expect.anything(), "file-1")
        expect(result).toEqual({ success: true })
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

        const result = await listGeneratedFiles(createQueryCtx(), {
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

    it("redirects file fetches to the resolved storage URL", async () => {
        ;(r2.getUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
            "https://files.example.com/file-1"
        )

        const response = await getFile(
            createHttpCtx(),
            new Request("https://example.com/file?key=file-1")
        )

        expect(response.status).toBe(302)
        expect(response.headers.get("location")).toBe("https://files.example.com/file-1")
    })
})
