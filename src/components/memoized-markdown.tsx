import "katex/dist/katex.min.css"
import { memo } from "react"
import { Streamdown } from "streamdown"
import { streamdownComponents, streamdownPlugins } from "./streamdown-config"

const SINGLE_DOLLAR_BLOCK_PATTERN = /(^|\n)([ \t]*)\$[ \t]*\n([\s\S]*?)\n[ \t]*\$([ \t]*(?=\n|$))/g
const SINGLE_DOLLAR_INLINE_PATTERN = /(^|[^$\\])\$([^$\n]+?)\$(?!\$)/g

const looksLikeMath = (value: string) => {
    const expression = value.trim()

    if (!expression) return false

    return (
        /^\d+(?:[.,]\d+)?$/.test(expression) ||
        /\\[A-Za-z]+/.test(expression) ||
        /[_^{}]/.test(expression) ||
        /[=<>±≤≥≈≠∞∑∏√∫]/.test(expression) ||
        /^\([A-Za-z0-9_,\s+\-*/^{}\\]+\)$/.test(expression) ||
        /[A-Za-z0-9)]\s*[+\-*/]\s*[A-Za-z0-9(\\]/.test(expression) ||
        /^[A-Za-z](?:\s*[+\-*/=]\s*[A-Za-z0-9\\{(]|[_^])?/.test(expression)
    )
}

export const normalizeMarkdownMathDelimiters = (content: string) =>
    content
        .replace(
            SINGLE_DOLLAR_BLOCK_PATTERN,
            (_match, prefix: string, indent: string, expression: string, suffix: string) =>
                `${prefix}${indent}$$\n${expression}\n${indent}$$${suffix}`
        )
        .replace(SINGLE_DOLLAR_INLINE_PATTERN, (_match, prefix: string, expression: string) =>
            looksLikeMath(expression) ? `${prefix}$$${expression}$$` : `${prefix}$${expression}$`
        )

export const MemoizedMarkdown = memo(
    ({
        content,
        isAnimating = false
    }: {
        content: string
        isAnimating?: boolean
    }) => {
        return (
            <Streamdown
                className="markdown-content space-y-0"
                components={streamdownComponents}
                controls={false}
                isAnimating={isAnimating}
                linkSafety={{ enabled: false }}
                mode={isAnimating ? "streaming" : "static"}
                plugins={streamdownPlugins}
            >
                {normalizeMarkdownMathDelimiters(content)}
            </Streamdown>
        )
    }
)
MemoizedMarkdown.displayName = "MemoizedMarkdown"
