import { beforeEach, describe, expect, it } from "vitest"

import { useModelStore } from "@/lib/model-store"

describe("model-store", () => {
    beforeEach(() => {
        useModelStore.setState({
            selectedModel: null,
            enabledTools: ["web_search"],
            selectedImageSize: "1:1",
            selectedImageResolution: "1K",
            reasoningEffort: "off",
            mcpOverrides: {},
            defaultMcpOverrides: {}
        })
    })

    it("merges default and thread-specific MCP overrides with thread values taking precedence", () => {
        useModelStore.getState().setDefaultMcpOverride("server-a", true)
        useModelStore.getState().setDefaultMcpOverride("server-b", false)
        useModelStore.getState().setMcpOverride("thread-1", "server-b", true)
        useModelStore.getState().setMcpOverride("thread-1", "server-c", false)

        expect(useModelStore.getState().getEffectiveMcpOverrides("thread-1")).toEqual({
            "server-a": true,
            "server-b": true,
            "server-c": false
        })
        expect(useModelStore.getState().getEffectiveMcpOverrides()).toEqual({
            "server-a": true,
            "server-b": false
        })
    })

    it("clears per-thread overrides without affecting defaults", () => {
        useModelStore.getState().setDefaultMcpOverride("server-a", true)
        useModelStore.getState().setMcpOverride("thread-1", "server-b", false)

        useModelStore.getState().clearMcpOverrides("thread-1")

        expect(useModelStore.getState().getMcpOverrides("thread-1")).toEqual({})
        expect(useModelStore.getState().getEffectiveMcpOverrides("thread-1")).toEqual({
            "server-a": true
        })
    })

    it("updates selected model, tools, image settings, and reasoning effort", () => {
        useModelStore.getState().setSelectedModel("gpt-5.4")
        useModelStore.getState().setEnabledTools(["web_search", "mcp"])
        useModelStore.getState().setSelectedImageSize("16:9")
        useModelStore.getState().setSelectedImageResolution("2K")
        useModelStore.getState().setReasoningEffort("high")

        expect(useModelStore.getState()).toMatchObject({
            selectedModel: "gpt-5.4",
            enabledTools: ["web_search", "mcp"],
            selectedImageSize: "16:9",
            selectedImageResolution: "2K",
            reasoningEffort: "high"
        })
    })
})
