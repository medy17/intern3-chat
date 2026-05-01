import "katex/dist/katex.min.css"
import { memo } from "react"
import { Streamdown } from "streamdown"
import { streamdownComponents, streamdownPlugins } from "./streamdown-config"

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
                {content}
            </Streamdown>
        )
    }
)
MemoizedMarkdown.displayName = "MemoizedMarkdown"
