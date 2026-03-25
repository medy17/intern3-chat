import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { StickToBottomButton } from "./stick-to-bottom-button"

describe("StickToBottomButton", () => {
    it("should render when not at bottom", () => {
        const scrollToBottomMock = vi.fn()
        render(<StickToBottomButton isAtBottom={false} scrollToBottom={scrollToBottomMock} />)

        const button = screen.getByRole("button", { name: /scroll to bottom/i })
        expect(button).toBeInTheDocument()
    })

    it("should not render when at bottom", () => {
        const scrollToBottomMock = vi.fn()
        render(<StickToBottomButton isAtBottom={true} scrollToBottom={scrollToBottomMock} />)

        const button = screen.queryByRole("button", { name: /scroll to bottom/i })
        expect(button).not.toBeInTheDocument()
    })

    it("should call scrollToBottom when clicked", () => {
        const scrollToBottomMock = vi.fn()
        render(<StickToBottomButton isAtBottom={false} scrollToBottom={scrollToBottomMock} />)

        const button = screen.getByRole("button", { name: /scroll to bottom/i })
        fireEvent.click(button)

        expect(scrollToBottomMock).toHaveBeenCalledTimes(1)
    })
})
