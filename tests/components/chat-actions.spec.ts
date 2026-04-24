// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/browser-env", () => ({
    browserEnv: vi.fn(() => "https://convex.example"),
    optionalBrowserEnv: vi.fn(() => undefined)
}))

vi.mock("@/components/retry-menu", () => ({
    RetryMenu: () => null
}))

import { ChatActions } from "@/components/chat-actions"
import { useMessageFooterStore } from "@/lib/message-footer-store"
import type { UIMessage } from "ai"

const createAssistantMessage = (metadata?: Record<string, unknown>) =>
    ({
        id: "assistant-1",
        role: "assistant",
        metadata,
        parts: [{ type: "text", text: "Hello world" }]
    }) as unknown as UIMessage

describe("ChatActions", () => {
    beforeEach(() => {
        useMessageFooterStore.setState({ footerMode: "simple", footerMetadataByMessageId: {} })
    })

    it("renders only the model name in simple mode", () => {
        render(
            React.createElement(ChatActions, {
                role: "assistant",
                message: createAssistantMessage({
                    modelName: "GPT 5.4 Mini",
                    runtimeProvider: "openrouter",
                    reasoningEffort: "medium",
                    promptTokens: 757,
                    completionTokens: 159,
                    reasoningTokens: 76,
                    totalTokens: 916,
                    serverDurationMs: 2500,
                    timeToFirstVisibleMs: 500
                })
            })
        )

        expect(screen.getByText("GPT 5.4 Mini (Medium)")).toBeTruthy()
        expect(screen.queryByText("916 tokens")).toBeNull()
        expect(screen.queryByText("79.50 tok/sec")).toBeNull()
        expect(screen.queryByText("TTFT 0.50 sec")).toBeNull()
    })

    it("renders nerd stats and marquee chrome when metadata is complete", () => {
        useMessageFooterStore.setState({ footerMode: "nerd" })

        const { container } = render(
            React.createElement(ChatActions, {
                role: "assistant",
                message: createAssistantMessage({
                    modelName: "GPT 5.4 Mini",
                    runtimeProvider: "openrouter",
                    reasoningEffort: "medium",
                    promptTokens: 757,
                    completionTokens: 159,
                    reasoningTokens: 76,
                    totalTokens: 916,
                    serverDurationMs: 2500,
                    timeToFirstVisibleMs: 500
                })
            })
        )

        expect(screen.getByText("GPT 5.4 Mini (Medium)")).toBeTruthy()
        expect(screen.getByText("79.50 tok/sec")).toBeTruthy()
        expect(screen.getByText("916 tokens (757 in, 159 out)")).toBeTruthy()
        expect(screen.getByText("TTFT 0.50 sec")).toBeTruthy()
        expect(container.querySelector(".footer-marquee-mask")).toBeTruthy()
        expect(container.querySelector(".footer-marquee-track")).toBeTruthy()
        expect(screen.queryByText(/reasoning/)).toBeNull()
    })

    it("falls back to prompt plus completion total without double-counting reasoning", () => {
        useMessageFooterStore.setState({ footerMode: "nerd" })

        render(
            React.createElement(ChatActions, {
                role: "assistant",
                message: createAssistantMessage({
                    modelName: "GPT 5.4 Mini",
                    runtimeProvider: "openrouter",
                    reasoningEffort: "medium",
                    promptTokens: 757,
                    completionTokens: 159,
                    reasoningTokens: 76
                })
            })
        )

        expect(screen.getByText("916 tokens (757 in, 159 out)")).toBeTruthy()
        expect(screen.queryByText("992 tokens")).toBeNull()
    })

    it("updates footer metadata from the footer store without replacing the whole message", () => {
        useMessageFooterStore.setState({ footerMode: "nerd" })

        const message = createAssistantMessage({
            timeToFirstVisibleMs: 500
        })

        const { rerender } = render(
            React.createElement(ChatActions, {
                role: "assistant",
                message
            })
        )

        expect(screen.getByText("TTFT 0.50 sec")).toBeTruthy()
        expect(screen.queryByText("GPT 5.4 Mini (Medium)")).toBeNull()

        act(() => {
            useMessageFooterStore.getState().setFooterMetadata(message.id, {
                modelName: "GPT 5.4 Mini",
                runtimeProvider: "openrouter",
                reasoningEffort: "medium",
                promptTokens: 757,
                completionTokens: 159,
                totalTokens: 916,
                serverDurationMs: 2500,
                timeToFirstVisibleMs: 500
            })
        })

        rerender(
            React.createElement(ChatActions, {
                role: "assistant",
                message
            })
        )

        expect(screen.getByText("GPT 5.4 Mini (Medium)")).toBeTruthy()
        expect(screen.getByText("79.50 tok/sec")).toBeTruthy()
        expect(screen.getByText("916 tokens (757 in, 159 out)")).toBeTruthy()
    })
})
