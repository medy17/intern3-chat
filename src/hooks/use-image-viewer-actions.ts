import { useEffect, useRef, useState } from "react"
import { downloadViewerImage } from "@/lib/image-viewer-download"
import { copyViewerPrompt } from "@/lib/image-viewer-clipboard"

/** Shared modal prompt feedback and downloads; callers keep their own controls and layout. */
export function useImageViewerActions({
    url,
    storageKey,
    prompt,
    fallbackFileName,
    downloadErrorLabel = "Failed to download image:",
    resetKey,
    enabled = true
}: {
    url: string
    storageKey?: string
    prompt?: string
    fallbackFileName: string
    downloadErrorLabel?: string
    resetKey?: string
    enabled?: boolean
}) {
    const [isPromptCopied, setIsPromptCopied] = useState(false)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const generationRef = useRef(0)

    // biome-ignore lint/correctness/useExhaustiveDependencies: Reset feedback when the viewed image or open state changes.
    useEffect(() => {
        generationRef.current += 1
        setIsPromptCopied(false)
        return () => {
            generationRef.current += 1
            if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
        }
    }, [resetKey, enabled])

    const handleDownload = async () => {
        if (!enabled || !url) return
        await downloadViewerImage({
            url,
            storageKey,
            fallbackFileName,
            errorLabel: downloadErrorLabel
        })
    }

    const handleCopyPrompt = async () => {
        if (!enabled) return
        const generation = generationRef.current
        await copyViewerPrompt({
            prompt,
            trim: true,
            reportEmpty: true,
            isCurrent: () => generation === generationRef.current,
            onCopied: () => {
                setIsPromptCopied(true)
                if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
                timeoutRef.current = setTimeout(() => {
                    setIsPromptCopied(false)
                    timeoutRef.current = null
                }, 1500)
            }
        })
    }

    return { isPromptCopied, handleDownload, handleCopyPrompt }
}
