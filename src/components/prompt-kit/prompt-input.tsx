import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type React from "react"
import {
    createContext,
    forwardRef,
    useCallback,
    useContext,
    useEffect,
    useImperativeHandle,
    useRef
} from "react"

export function applyPromptTextareaSize(
    textarea: HTMLTextAreaElement,
    maxHeight: number | string,
    value?: string
) {
    textarea.style.height = "auto"

    const nextValue = value ?? textarea.value
    if (!nextValue.trim()) {
        textarea.style.height = ""
        textarea.style.overflowY = ""
        return
    }

    if (typeof maxHeight === "number") {
        const nextHeight = Math.min(textarea.scrollHeight, maxHeight)
        textarea.style.height = `${nextHeight}px`
        textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden"
        return
    }

    textarea.style.height = `min(${textarea.scrollHeight}px, ${maxHeight})`
    textarea.style.overflowY = "auto"
}

type PromptInputContextType = {
    isLoading: boolean
    maxHeight: number | string
    onSubmit?: () => void
    disabled?: boolean
    textareaRef: React.RefObject<HTMLTextAreaElement | null>
}

const PromptInputContext = createContext<PromptInputContextType>({
    isLoading: false,
    maxHeight: 240,
    onSubmit: undefined,
    disabled: false,
    textareaRef: { current: null }
})

function usePromptInput() {
    const context = useContext(PromptInputContext)
    if (!context) {
        throw new Error("usePromptInput must be used within a PromptInput")
    }
    return context
}

export type PromptInputRef = {
    getValue: () => string
    setValue: (value: string) => void
    clear: () => void
    focus: () => void
    resize: () => void
}

type PromptInputProps = {
    isLoading?: boolean
    maxHeight?: number | string
    onSubmit?: () => void
    children: React.ReactNode
    className?: string
}

const PromptInput = forwardRef<PromptInputRef, PromptInputProps>(
    ({ className, isLoading = false, maxHeight = 240, onSubmit, children }, ref) => {
        const textareaRef = useRef<HTMLTextAreaElement>(null)
        const resizeFrameRef = useRef<number | null>(null)
        const resizeTextarea = useCallback(
            (value?: string) => {
                const textarea = textareaRef.current
                if (!textarea) return
                applyPromptTextareaSize(textarea, maxHeight, value)
            },
            [maxHeight]
        )
        const scheduleResize = useCallback(
            (value?: string) => {
                if (typeof window === "undefined") return

                if (resizeFrameRef.current !== null) {
                    window.cancelAnimationFrame(resizeFrameRef.current)
                }

                resizeFrameRef.current = window.requestAnimationFrame(() => {
                    resizeFrameRef.current = window.requestAnimationFrame(() => {
                        resizeFrameRef.current = null
                        resizeTextarea(value)
                    })
                })
            },
            [resizeTextarea]
        )

        useImperativeHandle(
            ref,
            () => ({
                getValue: () => textareaRef.current?.value || "",
                setValue: (value: string) => {
                    if (textareaRef.current) {
                        textareaRef.current.value = value
                        resizeTextarea(value)
                        scheduleResize(value)
                    }
                },
                clear: () => {
                    if (textareaRef.current) {
                        textareaRef.current.value = ""
                        resizeTextarea("")
                        scheduleResize("")
                        localStorage.removeItem("user-input")
                    }
                },
                focus: () => {
                    textareaRef.current?.focus()
                },
                resize: () => {
                    resizeTextarea()
                    scheduleResize()
                }
            }),
            [resizeTextarea, scheduleResize]
        )

        useEffect(() => {
            resizeTextarea()
        }, [resizeTextarea])

        useEffect(() => {
            return () => {
                if (resizeFrameRef.current !== null) {
                    window.cancelAnimationFrame(resizeFrameRef.current)
                }
            }
        }, [])

        return (
            <TooltipProvider>
                <PromptInputContext.Provider
                    value={{
                        isLoading,
                        maxHeight,
                        onSubmit,
                        textareaRef
                    }}
                >
                    <div
                        data-slot="prompt-input-root"
                        className={cn(
                            "rounded-t-lg border-2 border-input bg-background/80 p-2 shadow-xs backdrop-blur-lg md:rounded-lg dark:bg-input/70",
                            className
                        )}
                    >
                        {children}
                    </div>
                </PromptInputContext.Provider>
            </TooltipProvider>
        )
    }
)

PromptInput.displayName = "PromptInput"

export type PromptInputTextareaProps = {
    disableAutosize?: boolean
} & React.ComponentProps<typeof Textarea>

function PromptInputTextarea({
    className,
    onKeyDown,
    disableAutosize = false,
    ...props
}: PromptInputTextareaProps) {
    const { maxHeight, onSubmit, disabled, textareaRef } = usePromptInput()

    const resizeTextarea = useCallback(
        (target: HTMLTextAreaElement) => {
            applyPromptTextareaSize(target, maxHeight)
        },
        [maxHeight]
    )

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                onSubmit?.()
            }
            onKeyDown?.(e)
        },
        [onSubmit, onKeyDown]
    )

    const handleInput = useCallback(
        (e: React.FormEvent<HTMLTextAreaElement>) => {
            if (disableAutosize) return

            const target = e.target as HTMLTextAreaElement
            resizeTextarea(target)

            localStorage.setItem("user-input", target.value)
        },
        [disableAutosize, resizeTextarea]
    )

    useEffect(() => {
        if (disableAutosize || !textareaRef.current) return
        resizeTextarea(textareaRef.current)
    }, [disableAutosize, resizeTextarea, textareaRef])

    return (
        <Textarea
            defaultValue={
                typeof window !== "undefined" ? localStorage.getItem("user-input") || "" : ""
            }
            ref={textareaRef}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            className={cn(
                "field-sizing-fixed min-h-[2.75rem] w-full resize-none overflow-y-auto border-none bg-transparent text-foreground shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                className
            )}
            rows={1}
            disabled={disabled}
            {...props}
        />
    )
}

type PromptInputActionsProps = React.HTMLAttributes<HTMLDivElement>

function PromptInputActions({ children, className, ...props }: PromptInputActionsProps) {
    return (
        <div className={cn("flex items-center gap-2", className)} {...props}>
            {children}
        </div>
    )
}

type PromptInputActionProps = {
    className?: string
    tooltip: React.ReactNode
    children: React.ReactNode
    side?: "top" | "bottom" | "left" | "right"
} & React.ComponentProps<typeof Tooltip>

function PromptInputAction({
    tooltip,
    children,
    className,
    side = "top",
    ...props
}: PromptInputActionProps) {
    const { disabled } = usePromptInput()

    return (
        <Tooltip {...props}>
            <TooltipTrigger asChild disabled={disabled}>
                {children}
            </TooltipTrigger>
            <TooltipContent side={side} className={className}>
                {tooltip}
            </TooltipContent>
        </Tooltip>
    )
}

export { PromptInput, PromptInputTextarea, PromptInputActions, PromptInputAction }
