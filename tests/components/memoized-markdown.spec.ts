// @vitest-environment jsdom

import { MemoizedMarkdown } from "@/components/memoized-markdown"
import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it } from "vitest"

describe("MemoizedMarkdown", () => {
    it("preserves soft line breaks inside a paragraph", () => {
        const { container } = render(
            React.createElement(MemoizedMarkdown, {
                content: "First line\nSecond line"
            })
        )

        const paragraph = container.querySelector("p")

        expect(paragraph).toBeTruthy()
        expect(paragraph?.textContent).toBe("First line\nSecond line")
        expect(paragraph?.className).toContain("whitespace-pre-wrap")
    })

    it("renders blank-line separated text as separate paragraphs", () => {
        const { container } = render(
            React.createElement(MemoizedMarkdown, {
                content: "First paragraph\n\nSecond paragraph\n\n\nThird paragraph"
            })
        )

        const paragraphs = Array.from(container.querySelectorAll("p"))

        expect(paragraphs.map((paragraph) => paragraph.textContent)).toEqual([
            "First paragraph",
            "Second paragraph",
            "Third paragraph"
        ])
        expect(paragraphs.every((paragraph) => paragraph.className.includes("my-3"))).toBe(true)
    })

    it("renders inline code and previewable fenced blocks through Streamdown", () => {
        render(
            React.createElement(MemoizedMarkdown, {
                content: "Here is `inline` code.\n\n```html\n<div>Hello</div>\n```"
            })
        )

        expect(screen.getByText("inline").closest("code")).toBeTruthy()
        expect(screen.getByRole("tab", { name: "Code" })).toBeTruthy()
        expect(screen.getByRole("tab", { name: "Preview" })).toBeTruthy()
        expect(screen.getAllByText("html").length).toBeGreaterThan(0)
    })

    it("renders markdown tables without Streamdown's extra table wrapper", () => {
        const { container } = render(
            React.createElement(MemoizedMarkdown, {
                content:
                    "| Grain | Origin |\n|---|---|\n| Wheat | Fertile Crescent |\n| Barley | Fertile Crescent |"
            })
        )

        expect(container.querySelector("table")).toBeTruthy()
        expect(container.querySelector("[data-streamdown='table-wrapper']")).toBeNull()
    })
})
