import { afterEach, describe, expect, it, vi } from "vitest"
import type { R2Bucket } from "@cloudflare/workers-types"
import { signFalR2IngestBody } from "../../convex/lib/fal_r2_ingest"
import { MESSAGE_SPEECH } from "../../convex/lib/speech_config"
import { speechWavHeader } from "../../src/lib/speech-pcm"
import { handleSpeechRequest } from "../../workers/fal-r2-ingest/src/speech"
import { SpeechAssetWriter } from "../../workers/fal-r2-ingest/src/speech-asset"
import type { FalR2WorkerEnv } from "../../workers/fal-r2-ingest/src/index"

const secret = "test-speech-ingest-secret"
const ticket = {
    purpose: "message-speech",
    userId: "user-1",
    threadId: "thread-1",
    messageId: "message-1",
    leaseId: "lease-1",
    acquiredAt: 123,
    storageKey: "tts/user-1/test-speech.wav",
    origin: "https://app.example",
    callbackUrl: "https://convex.example/speech/worker"
}
async function request() {
    const body = JSON.stringify(ticket)
    return new Request("https://worker.example/speech", {
        method: "POST",
        headers: { Origin: ticket.origin },
        body: JSON.stringify({ body, ...(await signFalR2IngestBody(body, secret)) })
    })
}
const configResponse = () =>
    Response.json({
        text: "Hello there.",
        apiKey: "hosted-key",
        config: MESSAGE_SPEECH,
        attribution: { appUrl: "https://app.example", appName: "SilkChat", headers: {} }
    })
function fixture() {
    const bucket = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue({}),
        delete: vi.fn(),
        createMultipartUpload: vi.fn()
    }
    const env = {
        FAL_R2_INGEST_SECRET: secret,
        DESTINATION_BUCKET: bucket
    } as unknown as FalR2WorkerEnv
    const tasks: Promise<unknown>[] = []
    return {
        bucket,
        env,
        tasks,
        ctx: {
            waitUntil: (promise: Promise<unknown>) => {
                tasks.push(promise)
            }
        }
    }
}
afterEach(() => vi.unstubAllGlobals())

describe("speech worker", () => {
    it("identifies an R2 cache hit before authorizing billing and skips synthesis", async () => {
        const f = fixture()
        const bytes = new Uint8Array(46)
        bytes.set(speechWavHeader(2, 24000))
        bytes.set([1, 2], 44)
        f.bucket.get.mockResolvedValue({ body: new Response(bytes).body })
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(configResponse())
            .mockResolvedValueOnce(Response.json({ ok: true }))
        vi.stubGlobal("fetch", fetchMock)
        const response = await handleSpeechRequest(await request(), f.env, f.ctx)
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2]))
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).cached).toBe(true)
        expect(fetchMock.mock.calls.every(([url]) => url === ticket.callbackUrl)).toBe(true)
        expect(f.bucket.put).not.toHaveBeenCalled()
    })

    it("returns the credit limit explanation without starting synthesis", async () => {
        const f = fixture()
        const fetchMock = vi.fn().mockResolvedValue(
            Response.json(
                {
                    error: "Included usage limit reached. Cached recordings are still free to play."
                },
                { status: 429 }
            )
        )
        vi.stubGlobal("fetch", fetchMock)
        const response = await handleSpeechRequest(await request(), f.env, f.ctx)
        expect(response.status).toBe(429)
        expect((await response.json()).error).toContain("Included usage limit reached")
        expect(fetchMock.mock.calls.every(([url]) => url === ticket.callbackUrl)).toBe(true)
    })
    it("uses Workers-compatible redirect handling and rejects redirected callbacks", async () => {
        const f = fixture()
        const log = vi.spyOn(console, "error").mockImplementation(() => {})
        const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
            expect(init.redirect).toBe("manual")
            return new Response(null, {
                status: 302,
                headers: { Location: "https://elsewhere.example" }
            })
        })
        vi.stubGlobal("fetch", fetchMock)
        try {
            const response = await handleSpeechRequest(await request(), f.env, f.ctx)
            await Promise.all(f.tasks)
            expect(response.status).toBe(502)
            expect(fetchMock.mock.calls.every(([url]) => url === ticket.callbackUrl)).toBe(true)
            expect(f.bucket.put).not.toHaveBeenCalled()
        } finally {
            log.mockRestore()
        }
    })

    it("rejects unsigned playback requests before calling any provider", async () => {
        const f = fixture()
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        const response = await handleSpeechRequest(
            new Request("https://worker.example/speech", { method: "POST", body: "{}" }),
            f.env,
            f.ctx
        )
        expect(response.status).toBe(401)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("streams live audio and commits a complete WAV directly to R2", async () => {
        const f = fixture()
        let upstream!: ReadableStreamDefaultController<Uint8Array>
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                upstream = controller
                controller.enqueue(new Uint8Array([1, 2]))
            }
        })
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(configResponse())
            .mockResolvedValueOnce(
                new Response(stream, {
                    headers: { "Content-Type": "audio/pcm" }
                })
            )
            .mockResolvedValueOnce(Response.json({ ok: true }))
        vi.stubGlobal("fetch", fetchMock)
        const response = await handleSpeechRequest(await request(), f.env, f.ctx)
        const reader = response.body!.getReader()
        expect((await reader.read()).value).toEqual(new Uint8Array([1, 2]))
        expect(f.bucket.put).not.toHaveBeenCalled()
        upstream.enqueue(new Uint8Array([3, 4]))
        upstream.close()
        while (!(await reader.read()).done) {
            /* drain */
        }
        const saved = f.bucket.put.mock.calls[0]?.[1] as Uint8Array
        expect(Array.from(saved.slice(44))).toEqual([1, 2, 3, 4])
        const callbacks = fetchMock.mock.calls.filter(([url]) => url === ticket.callbackUrl)
        expect(callbacks.map(([, init]) => JSON.parse(init.body).phase)).toEqual([
            "start",
            "complete"
        ])
        expect(callbacks.every(([, init]) => init.body.length < 16384)).toBe(true)
    })

    it("keeps completed audio when the metadata callback has an uncertain result", async () => {
        const f = fixture()
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(configResponse())
            .mockResolvedValueOnce(
                new Response(new Uint8Array([1, 2]), {
                    headers: { "Content-Type": "audio/pcm" }
                })
            )
            .mockResolvedValueOnce(
                Response.json({ error: "temporarily unavailable" }, { status: 500 })
            )
            .mockResolvedValueOnce(Response.json({ ok: true }))
        vi.stubGlobal("fetch", fetchMock)
        const response = await handleSpeechRequest(await request(), f.env, f.ctx)
        await expect(response.arrayBuffer()).rejects.toThrow()
        expect(f.bucket.put).toHaveBeenCalledOnce()
        expect(f.bucket.delete).not.toHaveBeenCalled()
        const callbacks = fetchMock.mock.calls.filter(([url]) => url === ticket.callbackUrl)
        expect(callbacks.map(([, init]) => JSON.parse(init.body).phase)).toEqual([
            "start",
            "complete",
            "failed"
        ])
    })

    it("discards failed streams without publishing partial assets", async () => {
        const f = fixture()
        let upstream!: ReadableStreamDefaultController<Uint8Array>
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                upstream = controller
                controller.enqueue(new Uint8Array([1, 2]))
            }
        })
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(configResponse())
            .mockResolvedValueOnce(
                new Response(stream, {
                    headers: { "Content-Type": "audio/pcm;rate=24000;channels=1" }
                })
            )
            .mockResolvedValueOnce(Response.json({ ok: true }))
        vi.stubGlobal("fetch", fetchMock)
        const response = await handleSpeechRequest(await request(), f.env, f.ctx)
        const reader = response.body!.getReader()
        await reader.read()
        upstream.error(new Error("disconnected"))
        await expect(reader.read()).rejects.toThrow("disconnected")
        expect(f.bucket.put).not.toHaveBeenCalled()
        expect(JSON.parse(fetchMock.mock.calls.at(-1)?.[1].body)).toMatchObject({
            phase: "failed",
            submittedCharacters: 12,
            submittedUtf8Bytes: 12
        })
    })

    it("accepts recordings larger than 18 MiB using ordered multipart uploads", async () => {
        const uploaded: { partNumber: number; length: number; bytes?: Uint8Array }[] = []
        const complete = vi.fn()
        const upload = {
            uploadPart: async (partNumber: number, bytes: Uint8Array) => {
                uploaded.push({
                    partNumber,
                    length: bytes.length,
                    ...(partNumber === 1 ? { bytes: bytes.slice(0, 44) } : {})
                })
                return { partNumber, etag: String(partNumber) }
            },
            complete,
            abort: vi.fn()
        }
        const bucket = {
            createMultipartUpload: vi.fn().mockResolvedValue(upload)
        } as unknown as R2Bucket
        const writer = new SpeechAssetWriter(bucket, ticket.storageKey, 24000)
        const block = new Uint8Array(1024 * 1024)
        for (let index = 0; index < 20; index++) await writer.append(block)
        expect(complete).not.toHaveBeenCalled()
        await writer.complete()
        expect(uploaded.reduce((total, part) => total + part.length, 0)).toBe(20 * 1024 * 1024 + 44)
        expect(
            complete.mock.calls[0]?.[0].map((part: { partNumber: number }) => part.partNumber)
        ).toEqual([1, 2, 3, 4, 5])
        const first = uploaded.find((part) => part.partNumber === 1)!.bytes!
        expect(new DataView(first.buffer).getUint32(40, true)).toBe(20 * 1024 * 1024)
    })

    it("aborts multipart storage when generation is cancelled", async () => {
        const abort = vi.fn()
        const bucket = {
            createMultipartUpload: vi
                .fn()
                .mockResolvedValue({ uploadPart: vi.fn().mockResolvedValue({}), abort })
        } as unknown as R2Bucket
        const writer = new SpeechAssetWriter(bucket, ticket.storageKey, 24000)
        await writer.append(new Uint8Array(6 * 1024 * 1024))
        await writer.discard()
        expect(abort).toHaveBeenCalledOnce()
    })
})
