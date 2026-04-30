import "katex/dist/katex.min.css"
import { memo, useMemo } from "react"
import { Streamdown, parseMarkdownIntoBlocks } from "streamdown"
import { streamdownComponents, streamdownPlugins } from "./streamdown-config"

const RenderedBlock = memo(
    ({ block, isAnimating }: { block: string; isAnimating: boolean }) => (
        <Streamdown
            className="!my-0"
            components={streamdownComponents}
            controls={false}
            isAnimating={isAnimating}
            linkSafety={{ enabled: false }}
            mode={isAnimating ? "streaming" : "static"}
            plugins={streamdownPlugins}
        >
            {block}
        </Streamdown>
    ),
    (prevProps, nextProps) =>
        prevProps.block === nextProps.block && prevProps.isAnimating === nextProps.isAnimating
)
RenderedBlock.displayName = "RenderedBlock"

export const MemoizedMarkdown = memo(
    ({
        content,
        isAnimating = false
    }: {
        content: string
        isAnimating?: boolean
    }) => {
        const blocks = useMemo(() => parseMarkdownIntoBlocks(content), [content])

        return (
            <div className="space-y-4">
                {blocks.map((block, index) => {
                    const isLastBlock = index === blocks.length - 1
                    const blockIsAnimating = isAnimating && isLastBlock

                    return (
                        <RenderedBlock
                            key={`${index}`}
                            block={block}
                            isAnimating={blockIsAnimating}
                        />
                    )
                })}
            </div>
        )
    }
)
MemoizedMarkdown.displayName = "MemoizedMarkdown"
