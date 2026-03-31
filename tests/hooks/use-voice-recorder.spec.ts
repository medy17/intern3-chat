// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { browserEnvMock, resolveJwtTokenMock, toastErrorMock, useTokenMock } = vi.hoisted(() => ({
    browserEnvMock: vi.fn(),
    resolveJwtTokenMock: vi.fn(),
    toastErrorMock: vi.fn(),
    useTokenMock: vi.fn()
}))

vi.mock("@/hooks/auth-hooks", () => ({
    useToken: useTokenMock
}))

vi.mock("@/lib/auth-token", () => ({
    resolveJwtToken: resolveJwtTokenMock
}))

vi.mock("@/lib/browser-env", () => ({
    browserEnv: browserEnvMock
}))

vi.mock("sonner", () => ({
    toast: {
        error: toastErrorMock
    }
}))

import { useVoiceRecorder } from "@/hooks/use-voice-recorder"

class FakeAnalyserNode {
    fftSize = 0
    smoothingTimeConstant = 0
    frequencyBinCount = 8

    disconnect() {}

    getByteFrequencyData(data: Uint8Array) {
        data.fill(64)
    }

    getByteTimeDomainData(data: Uint8Array) {
        data.fill(128)
    }
}

class FakeAudioContext {
    state = "running"
    analyser = new FakeAnalyserNode()
    source = {
        connect: vi.fn()
    }

    createAnalyser() {
        return this.analyser as unknown as AnalyserNode
    }

    createMediaStreamSource() {
        return this.source as unknown as MediaStreamAudioSourceNode
    }

    close() {
        this.state = "closed"
        return Promise.resolve()
    }

    resume() {
        this.state = "running"
        return Promise.resolve()
    }
}

type RecorderMode = "success" | "permission-error"

class FakeMediaRecorder {
    static supportedType = "audio/webm"
    static mode: RecorderMode = "success"
    static instances: FakeMediaRecorder[] = []

    static isTypeSupported(type: string) {
        return type === FakeMediaRecorder.supportedType
    }

    ondataavailable: ((event: { data: Blob }) => void) | null = null
    onstop: (() => void | Promise<void>) | null = null
    onerror: ((event: Event) => void) | null = null

    constructor(
        public stream: MediaStream,
        public options: MediaRecorderOptions = {}
    ) {
        FakeMediaRecorder.instances.push(this)
    }

    start() {}

    stop() {
        if (FakeMediaRecorder.mode === "success") {
            this.ondataavailable?.({
                data: new Blob(["audio-data"], {
                    type: this.options.mimeType || FakeMediaRecorder.supportedType
                })
            })
        }

        void this.onstop?.()
    }
}

const installRecorderEnvironment = (options?: {
    getUserMediaImpl?: () => Promise<MediaStream>
}) => {
    const mediaTrack = {
        kind: "audio",
        stop: vi.fn()
    }
    const mediaStream = {
        getTracks: () => [mediaTrack]
    } as unknown as MediaStream

    Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
            getUserMedia: vi.fn(options?.getUserMediaImpl ?? (() => Promise.resolve(mediaStream)))
        }
    })

    vi.stubGlobal("AudioContext", FakeAudioContext)
    Object.defineProperty(window, "AudioContext", {
        configurable: true,
        value: FakeAudioContext
    })
    Object.defineProperty(window, "MediaRecorder", {
        configurable: true,
        value: FakeMediaRecorder
    })
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder)

    return {
        mediaStream,
        mediaTrack
    }
}

const flushAsyncWork = async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
}

describe("useVoiceRecorder", () => {
    beforeEach(() => {
        FakeMediaRecorder.instances = []
        FakeMediaRecorder.mode = "success"
        FakeMediaRecorder.supportedType = "audio/webm"

        browserEnvMock.mockReset()
        resolveJwtTokenMock.mockReset()
        toastErrorMock.mockReset()
        useTokenMock.mockReset()
        vi.spyOn(console, "error").mockImplementation(() => {})
        vi.spyOn(console, "log").mockImplementation(() => {})
        vi.spyOn(console, "warn").mockImplementation(() => {})
        vi.useFakeTimers()

        browserEnvMock.mockReturnValue("https://convex.example")
        resolveJwtTokenMock.mockResolvedValue("jwt-1")
        useTokenMock.mockReturnValue({ token: "token-1" })
    })

    it("surfaces permission errors from getUserMedia", async () => {
        const permissionError = new Error("denied")
        permissionError.name = "NotAllowedError"
        installRecorderEnvironment({
            getUserMediaImpl: () => Promise.reject(permissionError)
        })

        const { result } = renderHook(() =>
            useVoiceRecorder({
                onTranscript: vi.fn()
            })
        )

        await act(async () => {
            await result.current.startRecording()
        })

        expect(result.current.state.isRecording).toBe(false)
        expect(toastErrorMock).toHaveBeenCalledWith(
            "Microphone permission denied. Please allow microphone access and try again."
        )
    })

    it("records, transcribes, and resets state after a successful stop", async () => {
        const { mediaTrack } = installRecorderEnvironment()
        const onTranscript = vi.fn()
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ text: "  transcribed text  " })
        })
        vi.stubGlobal("fetch", fetchMock)

        const { result } = renderHook(() =>
            useVoiceRecorder({
                onTranscript
            })
        )

        await act(async () => {
            await result.current.startRecording()
        })

        expect(result.current.state.isRecording).toBe(true)
        expect(FakeMediaRecorder.instances[0].options.mimeType).toBe("audio/webm")

        act(() => {
            vi.advanceTimersByTime(1_000)
        })

        expect(result.current.state.recordingDuration).toBe(1)

        act(() => {
            result.current.stopRecording()
        })

        await act(async () => {
            await flushAsyncWork()
        })

        expect(onTranscript).toHaveBeenCalledWith("transcribed text")
        expect(fetchMock).toHaveBeenCalledWith("https://convex.example/transcribe", {
            method: "POST",
            headers: {
                Authorization: "Bearer jwt-1"
            },
            body: expect.any(FormData)
        })
        expect(result.current.state.isRecording).toBe(false)
        expect(result.current.state.isTranscribing).toBe(false)
        expect(result.current.state.recordingDuration).toBe(0)
        expect(mediaTrack.stop).toHaveBeenCalledTimes(1)
    })

    it("cancels recording without attempting transcription", async () => {
        installRecorderEnvironment()
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)

        const { result } = renderHook(() =>
            useVoiceRecorder({
                onTranscript: vi.fn()
            })
        )

        await act(async () => {
            await result.current.startRecording()
        })

        act(() => {
            result.current.cancelRecording()
        })

        await act(async () => {
            await flushAsyncWork()
        })

        expect(result.current.state.isRecording).toBe(false)
        expect(result.current.state.isTranscribing).toBe(false)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("surfaces transcription failures from the backend", async () => {
        installRecorderEnvironment()
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                json: async () => ({ error: "Audio too large" })
            })
        )

        const { result } = renderHook(() =>
            useVoiceRecorder({
                onTranscript: vi.fn()
            })
        )

        await act(async () => {
            await result.current.startRecording()
        })

        act(() => {
            result.current.stopRecording()
        })

        await act(async () => {
            await flushAsyncWork()
        })
        expect(toastErrorMock).toHaveBeenCalledWith("Audio too large")
        expect(result.current.state.isTranscribing).toBe(false)
    })
})
