import { beforeEach, describe, expect, it, vi } from "vitest"

const {
    getUserIdentityMock,
    decryptKeyMock,
    getGoogleAccessTokenMock,
    getGoogleAuthModeMock,
    getGoogleVertexConfigMock,
    hasInternalGoogleVertexConfigMock
} = vi.hoisted(() => ({
    getUserIdentityMock: vi.fn(),
    decryptKeyMock: vi.fn(),
    getGoogleAccessTokenMock: vi.fn(),
    getGoogleAuthModeMock: vi.fn(),
    getGoogleVertexConfigMock: vi.fn(),
    hasInternalGoogleVertexConfigMock: vi.fn()
}))

vi.mock("../../convex/_generated/server", () => ({
    httpAction: (handler: unknown) => handler
}))

vi.mock("../../convex/_generated/api", () => ({
    internal: {
        settings: {
            getUserSettingsInternal: "getUserSettingsInternal"
        }
    }
}))

vi.mock("../../convex/lib/identity", () => ({
    getUserIdentity: getUserIdentityMock
}))

vi.mock("../../convex/lib/encryption", () => ({
    decryptKey: decryptKeyMock
}))

vi.mock("../../convex/lib/google_auth", () => ({
    getGoogleAccessToken: getGoogleAccessTokenMock
}))

vi.mock("../../convex/lib/google_provider", () => ({
    getGoogleAuthMode: getGoogleAuthModeMock,
    getGoogleVertexConfig: getGoogleVertexConfigMock,
    hasInternalGoogleVertexConfig: hasInternalGoogleVertexConfigMock
}))

import { transcribeAudio } from "../../convex/speech_to_text"

const transcribeAudioHandler = transcribeAudio as unknown as (
    ctx: {
        auth: Record<string, never>
        runQuery: ReturnType<typeof vi.fn>
    },
    request: Request
) => Promise<Response>

type SpeechCtx = Parameters<typeof transcribeAudioHandler>[0]

const createCtx = (settings?: Record<string, unknown>) =>
    ({
        auth: {},
        runQuery: vi.fn().mockResolvedValue(
            settings ?? {
                coreAIProviders: {}
            }
        )
    }) as SpeechCtx

const createAudioRequest = (audio?: Blob) => {
    const formData = new FormData()
    if (audio) {
        formData.append("audio", audio, "audio.webm")
    }

    return new Request("https://example.com/transcribe", {
        method: "POST",
        body: formData
    })
}

const createOversizedAudioRequest = (size: number, type = "audio/webm") =>
    ({
        formData: async () => {
            return {
                get: (key: string) =>
                    key === "audio"
                        ? ({
                              size,
                              type,
                              arrayBuffer: async () => new ArrayBuffer(0)
                          } as Blob)
                        : null
            } as FormData
        }
    }) as Request

describe("transcribeAudio", () => {
    beforeEach(() => {
        getUserIdentityMock.mockReset()
        decryptKeyMock.mockReset()
        getGoogleAccessTokenMock.mockReset()
        getGoogleAuthModeMock.mockReset()
        getGoogleVertexConfigMock.mockReset()
        hasInternalGoogleVertexConfigMock.mockReset()
        vi.spyOn(console, "error").mockImplementation(() => {})
        vi.spyOn(console, "warn").mockImplementation(() => {})
        vi.spyOn(console, "log").mockImplementation(() => {})
        vi.unstubAllGlobals()
        Reflect.deleteProperty(process.env, "STT_PROVIDER")
        Reflect.deleteProperty(process.env, "GROQ_API_KEY")
        Reflect.deleteProperty(process.env, "GOOGLE_SPEECH_LOCATION")
    })

    it("returns 401 for unauthorized users", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ error: "Unauthorized" })

        const response = await transcribeAudioHandler(createCtx(), createAudioRequest())

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
    })

    it("returns 500 when google speech configuration is unavailable", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })
        hasInternalGoogleVertexConfigMock.mockReturnValue(false)

        const response = await transcribeAudioHandler(
            createCtx({
                coreAIProviders: {}
            }),
            createAudioRequest(new Blob(["abc"], { type: "audio/webm" }))
        )

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({
            error: "Voice input service not configured. Configure Google in Vertex AI mode in AI Options or set internal GOOGLE_VERTEX_* credentials."
        })
    })

    it("rejects missing audio files and oversized uploads", async () => {
        getUserIdentityMock.mockResolvedValue({ id: "user-1" })
        hasInternalGoogleVertexConfigMock.mockReturnValue(true)
        getGoogleVertexConfigMock.mockReturnValue({
            project: "proj-1",
            location: "us-central1",
            credentials: {
                client_email: "svc@example.com",
                private_key: "private-key"
            }
        })

        const missingResponse = await transcribeAudioHandler(createCtx(), createAudioRequest())
        expect(missingResponse.status).toBe(400)
        await expect(missingResponse.json()).resolves.toEqual({
            error: "No audio file provided"
        })

        const largeResponse = await transcribeAudioHandler(
            createCtx(),
            createOversizedAudioRequest(25 * 1024 * 1024 + 1)
        )
        expect(largeResponse.status).toBe(400)
        await expect(largeResponse.json()).resolves.toEqual({
            error: "Audio file too large (max 25MB)"
        })
    })

    it("uses google transcription with internal vertex credentials and returns joined transcripts", async () => {
        getUserIdentityMock.mockResolvedValueOnce({ id: "user-1" })
        hasInternalGoogleVertexConfigMock.mockReturnValue(true)
        getGoogleVertexConfigMock.mockReturnValue({
            project: "proj-1",
            location: "us-central1",
            credentials: {
                client_email: "svc@example.com",
                private_key: "private-key"
            }
        })
        getGoogleAccessTokenMock.mockResolvedValue("access-token")
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    results: [
                        { alternatives: [{ transcript: "hello" }] },
                        { alternatives: [{ transcript: "world" }] }
                    ]
                }),
                { status: 200 }
            )
        )
        vi.stubGlobal("fetch", fetchMock)

        const response = await transcribeAudioHandler(
            createCtx({
                coreAIProviders: {}
            }),
            createAudioRequest(new Blob(["abc"], { type: "audio/webm" }))
        )

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith(
            "https://us-speech.googleapis.com/v2/projects/proj-1/locations/us/recognizers/_:recognize",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    Authorization: "Bearer access-token",
                    "Content-Type": "application/json"
                })
            })
        )
        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({
            text: "hello world"
        })
    })

    it("maps groq authentication and rate-limit failures to the expected responses", async () => {
        process.env.STT_PROVIDER = "groq"
        process.env.GROQ_API_KEY = "gsk_live"
        getUserIdentityMock.mockResolvedValue({ id: "user-1" })

        const unauthorizedFetch = vi
            .fn()
            .mockResolvedValueOnce(new Response("bad key", { status: 401 }))
            .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
        vi.stubGlobal("fetch", unauthorizedFetch)

        const unauthorizedResponse = await transcribeAudioHandler(
            createCtx({
                coreAIProviders: {}
            }),
            createAudioRequest(new Blob(["abc"], { type: "audio/webm" }))
        )
        expect(unauthorizedResponse.status).toBe(500)
        await expect(unauthorizedResponse.json()).resolves.toEqual({
            error: "Invalid Groq credentials. Please check your Groq configuration."
        })

        const rateLimitResponse = await transcribeAudioHandler(
            createCtx({
                coreAIProviders: {}
            }),
            createAudioRequest(new Blob(["abc"], { type: "audio/webm" }))
        )
        expect(rateLimitResponse.status).toBe(429)
        await expect(rateLimitResponse.json()).resolves.toEqual({
            error: "Rate limit exceeded. Please try again later."
        })
    })
})
