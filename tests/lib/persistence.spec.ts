import { beforeEach, describe, expect, it, vi } from "vitest"

import { loadAIConfig, loadUserInput, saveAIConfig, saveUserInput } from "@/lib/persistence"

type StorageState = Record<string, string>

const createStorageMock = (initialState: StorageState = {}) => {
    const state: StorageState = { ...initialState }

    return {
        getItem: vi.fn((key: string) => state[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
            state[key] = value
        }),
        removeItem: vi.fn((key: string) => {
            delete state[key]
        }),
        snapshot: () => ({ ...state })
    }
}

describe("persistence", () => {
    beforeEach(() => {
        vi.unstubAllGlobals()
    })

    it("returns SSR-safe defaults when window is unavailable", () => {
        expect(loadAIConfig()).toEqual({
            selectedModel: null,
            enabledTools: ["web_search"],
            selectedImageSize: "1:1",
            selectedImageResolution: "1K",
            reasoningEffort: "off"
        })
        expect(loadUserInput()).toBe("")
    })

    it("recovers from corrupted ai-config storage by clearing the key", () => {
        const storage = createStorageMock({
            "ai-config": "{not-json"
        })

        vi.stubGlobal("window", {})
        vi.stubGlobal("localStorage", storage)

        expect(loadAIConfig()).toEqual({
            selectedModel: null,
            enabledTools: ["web_search"],
            selectedImageSize: "1:1",
            selectedImageResolution: "1K",
            reasoningEffort: "off"
        })
        expect(storage.removeItem).toHaveBeenCalledWith("ai-config")
    })

    it("normalizes invalid enabled tools to the default tool set", () => {
        const storage = createStorageMock({
            "ai-config": JSON.stringify({
                selectedModel: "gpt-5.4",
                enabledTools: ["invalid-tool"],
                selectedImageSize: "16:9",
                selectedImageResolution: "2K",
                reasoningEffort: "medium"
            })
        })

        vi.stubGlobal("window", {})
        vi.stubGlobal("localStorage", storage)

        expect(loadAIConfig()).toEqual({
            selectedModel: "gpt-5.4",
            enabledTools: ["web_search"],
            selectedImageSize: "16:9",
            selectedImageResolution: "2K",
            reasoningEffort: "medium"
        })
    })

    it("persists validated config and trims/removes saved user input", () => {
        const storage = createStorageMock()

        vi.stubGlobal("window", {})
        vi.stubGlobal("localStorage", storage)

        saveAIConfig({
            selectedModel: "gemini-3-flash-preview",
            enabledTools: ["web_search", "mcp"],
            selectedImageSize: "1:1",
            selectedImageResolution: "1K",
            reasoningEffort: "low"
        })
        saveUserInput("  hello world  ")

        expect(storage.snapshot()).toMatchObject({
            "ai-config": JSON.stringify({
                selectedModel: "gemini-3-flash-preview",
                enabledTools: ["web_search", "mcp"],
                selectedImageSize: "1:1",
                selectedImageResolution: "1K",
                reasoningEffort: "low"
            }),
            "user-input": "  hello world  "
        })
        expect(loadUserInput()).toBe("hello world")

        saveUserInput("   ")
        expect(storage.removeItem).toHaveBeenCalledWith("user-input")
    })
})
