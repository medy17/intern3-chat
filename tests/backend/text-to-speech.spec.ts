import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    identity: vi.fn(),
    deleting: vi.fn(),
    r2: {
        getMetadata: vi.fn(),
        getUrl: vi.fn(),
        store: vi.fn(),
        deleteObject: vi.fn(),
        syncMetadata: vi.fn()
    }
}))
vi.mock("../../convex/_generated/server", () => ({
    httpAction: (fn: unknown) => fn,
    internalQuery: (fn: unknown) => fn,
    internalMutation: (fn: unknown) => fn
}))
vi.mock("../../convex/_generated/api", () => ({
    internal: {
        speech_audio: {
            getSource: "source",
            acquire: "acquire",
            release: "release",
            consume: "consume"
        }
    }
}))
vi.mock("../../convex/lib/identity", () => ({ getUserIdentity: mocks.identity }))
vi.mock("../../convex/lib/account_deletion_gate", () => ({
    getAccountDeletionBlockerForAction: mocks.deleting
}))
vi.mock("../../convex/attachments", () => ({ r2: mocks.r2 }))

import { speakMessage, speechWorkerCallback } from "../../convex/text_to_speech"
import {
    signFalR2IngestBody,
    FAL_R2_INGEST_SIGNATURE_HEADER,
    FAL_R2_INGEST_TIMESTAMP_HEADER
} from "../../convex/lib/fal_r2_ingest"
import { getSource } from "../../convex/speech_audio"

const handler = speakMessage as unknown as (
    ctx: ReturnType<typeof context>,
    request: Request
) => Promise<Response>
const workerHandler = speechWorkerCallback as unknown as typeof handler
const context = () => ({
    auth: {},
    runQuery: vi.fn().mockResolvedValue("Hello there."),
    runMutation: vi.fn().mockResolvedValue({ acquiredAt: 123, leaseId: "lease-1" })
})
const request = () =>
    new Request("https://example.com/speech", {
        method: "POST",
        headers: { Origin: "https://example.com" },
        body: JSON.stringify({ threadId: "thread-1", messageId: "message-1" })
    })

describe("message speech", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.stubEnv("OPENROUTER_API_KEY", "hosted-test-key")
        mocks.identity.mockResolvedValue({ id: "user-1" })
        mocks.deleting.mockResolvedValue(null)
        mocks.r2.getMetadata.mockResolvedValue(null)
        mocks.r2.getUrl.mockResolvedValue("https://storage.example/speech.wav")
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.unstubAllEnvs()
    })

    it("rejects unauthenticated and empty requests before generation", async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        mocks.identity.mockResolvedValueOnce({ error: "Unauthorized" })
        expect((await handler(context(), request())).status).toBe(401)
        const ctx = context()
        ctx.runQuery.mockResolvedValueOnce("")
        expect((await handler(ctx, request())).status).toBe(400)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("does not read another user's message", async () => {
        const source = getSource as unknown as {
            handler: (ctx: unknown, args: unknown) => Promise<unknown>
        }
        const db = { get: vi.fn().mockResolvedValue({ authorId: "someone-else" }), query: vi.fn() }
        expect(
            await source.handler(
                { db },
                { userId: "user-1", threadId: "thread-1", messageId: "message-1" }
            )
        ).toBeNull()
        expect(db.query).not.toHaveBeenCalled()
    })

    it("returns a worker ticket without transferring audio or exposing the provider key", async () => {
        vi.stubEnv("FAL_R2_INGEST_URL", "https://worker.example/ingest")
        vi.stubEnv("FAL_R2_INGEST_SECRET", "test-ingest-secret")
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        const response = await handler(context(), request())
        const body = await response.json()
        expect(body.url).toBe("https://worker.example/speech")
        expect(body.format).toBe("pcm")
        expect(JSON.parse(body.ticket.body).storageKey).toMatch(/^tts\/user-1\/.+-speech\.wav$/)
        expect(JSON.stringify(body)).not.toContain("hosted-test-key")
        expect(fetchMock).not.toHaveBeenCalled()
        expect(mocks.r2.store).not.toHaveBeenCalled()
    })

    it("returns a direct R2 URL for completed audio without a generation lease", async () => {
        mocks.r2.getMetadata.mockResolvedValue({ key: "saved" })
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        const ctx = context()
        const response = await handler(ctx, request())
        expect(await response.json()).toEqual({
            url: "https://storage.example/speech.wav",
            format: "wav"
        })
        expect(fetchMock).not.toHaveBeenCalled()
        expect(ctx.runMutation).not.toHaveBeenCalled()
    })

    it("settles only after metadata is saved, and releases on callback failure", async () => {
        const secret = "test-ingest-secret"
        vi.stubEnv("FAL_R2_INGEST_URL", "https://worker.example/ingest")
        vi.stubEnv("FAL_R2_INGEST_SECRET", secret)
        const prepared = await (await handler(context(), request())).json()
        const ticket = JSON.parse(prepared.ticket.body)
        const callbackRequest = async (phase: string, submittedCharacters = 0) => {
            const body = JSON.stringify({
                phase,
                ticket,
                submittedCharacters,
                submittedUtf8Bytes: submittedCharacters
            })
            const signed = await signFalR2IngestBody(body, secret)
            return new Request(ticket.callbackUrl, {
                method: "POST",
                body,
                headers: {
                    [FAL_R2_INGEST_SIGNATURE_HEADER]: signed.signature,
                    [FAL_R2_INGEST_TIMESTAMP_HEADER]: signed.timestamp
                }
            })
        }
        const ctx = context()
        mocks.r2.syncMetadata.mockRejectedValueOnce(new Error("R2 unavailable"))
        await expect(workerHandler(ctx, await callbackRequest("complete", 12))).rejects.toThrow(
            "R2 unavailable"
        )
        expect(ctx.runMutation.mock.calls.at(-1)?.[1]).toMatchObject({
            complete: false,
            submittedCharacters: 12,
            submittedUtf8Bytes: 12
        })
        expect((await workerHandler(ctx, await callbackRequest("complete"))).status).toBe(200)
        expect(ctx.runMutation.mock.calls.at(-1)?.[1]).toMatchObject({ complete: true })
        expect((await workerHandler(ctx, await callbackRequest("failed"))).status).toBe(200)
        expect(ctx.runMutation.mock.calls.at(-1)?.[1]).toMatchObject({ complete: false })
    })
})
