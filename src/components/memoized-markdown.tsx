import "katex/dist/katex.min.css"
import { Streamdown } from "streamdown"
import { streamdownComponents, streamdownPlugins } from "./streamdown-config"

export function MemoizedMarkdown({
    content,
    isAnimating = false
}: {
    content: string
    isAnimating?: boolean
}) {
    return (
        <Streamdown
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
