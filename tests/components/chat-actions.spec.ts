// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
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
        useMessageFooterStore.setState({ footerMode: "simple" })
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

    it("renders full nerd stats when metadata is complete", () => {
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

    it("renders reasoning token breakdowns in extra nerdy mode", () => {
        useMessageFooterStore.setState({ footerMode: "extra-nerdy" })

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
                    estimatedCostUsd: 0.001552,
                    estimatedPromptCostUsd: 0.000757,
                    estimatedCompletionCostUsd: 0.000795,
                    serverDurationMs: 2500,
                    timeToFirstVisibleMs: 500
                })
            })
        )

        expect(
            screen.getByText("916 tokens (83 regular, 76 reasoning, 757 in, 159 out)")
        ).toBeTruthy()
        expect(screen.getByText("Est. $0.001552 ($0.000757 in, $0.000795 out)")).toBeTruthy()
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

    it("hides TTFT and uses total duration fallback for speed when TTFT is missing", () => {
        useMessageFooterStore.setState({ footerMode: "nerd" })

        render(
            React.createElement(ChatActions, {
                role: "assistant",
                message: createAssistantMessage({
                    modelName: "GPT 5.4 Mini",
                    runtimeProvider: "openai",
                    reasoningEffort: "off",
                    promptTokens: 200,
                    completionTokens: 50,
                    serverDurationMs: 2000
                })
            })
        )

        expect(screen.getByText("GPT 5.4 Mini (Off)")).toBeTruthy()
        expect(screen.getByText("25.00 tok/sec")).toBeTruthy()
        expect(screen.queryByText(/TTFT/)).toBeNull()
    })

    it("hides unavailable speed and reasoning segments cleanly", () => {
        useMessageFooterStore.setState({ footerMode: "nerd" })

        render(
            React.createElement(ChatActions, {
                role: "assistant",
                message: createAssistantMessage({
                    modelName: "GPT 5.4 Mini",
                    runtimeProvider: "openai",
                    reasoningEffort: "low",
                    promptTokens: 10,
                    completionTokens: 0,
                    totalTokens: 10
                })
            })
        )

        expect(screen.getByText("GPT 5.4 Mini (Low)")).toBeTruthy()
        expect(screen.getByText("10 tokens (10 in, 0 out)")).toBeTruthy()
        expect(screen.queryByText(/tok\/sec/)).toBeNull()
        expect(screen.queryByText(/reasoning/)).toBeNull()
    })
})
