"use client"

import { cn } from "@/lib/utils"
import { useThemeStore } from "@/lib/theme-store"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ className, style, toastOptions, ...props }: ToasterProps) => {
    const { themeState } = useThemeStore()
    const classNames = toastOptions?.classNames

    return (
        <Sonner
            theme={themeState.currentMode as ToasterProps["theme"]}
            className={cn("toaster group", className)}
            style={{
                ...style,
                fontFamily: "var(--font-sans)"
            }}
            toastOptions={{
                ...toastOptions,
                classNames: {
                    ...classNames,
                    toast: cn(
                        "group toast font-sans group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border shadow-lg",
                        classNames?.toast
                    ),
                    title: cn("font-sans", classNames?.title),
                    description: cn("font-sans group-[.toast]:text-muted-foreground", classNames?.description),
                    actionButton: cn(
                        "font-sans group-[.toast]:bg-primary group-[.toast]:text-primary-foreground font-medium",
                        classNames?.actionButton
                    ),
                    cancelButton: cn(
                        "font-sans group-[.toast]:bg-muted group-[.toast]:text-muted-foreground font-medium",
                        classNames?.cancelButton
                    ),
                    closeButton: cn("font-sans", classNames?.closeButton)
                }
            }}
            {...props}
        />
    )
}

export { Toaster }
