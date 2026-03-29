"use client"

import { useThemeStore } from "@/lib/theme-store"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
    const { themeState } = useThemeStore()

    return (
        <Sonner
            theme={themeState.currentMode as ToasterProps["theme"]}
            className="toaster group"
            style={
                {
                    "--border-radius": "var(--radius)"
                } as React.CSSProperties
            }
            toastOptions={{
                classNames: {
                    toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border shadow-lg !rounded-lg",
                    description: "group-[.toast]:text-muted-foreground",
                    actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground font-medium !rounded-md",
                    cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground font-medium !rounded-md",
                    error: "group-[.toaster]:bg-destructive group-[.toaster]:text-destructive-foreground group-[.toaster]:border-destructive",
                    success: "group-[.toaster]:bg-primary group-[.toaster]:text-primary-foreground group-[.toaster]:border-primary",
                    warning: "group-[.toaster]:bg-yellow-500 group-[.toaster]:text-white group-[.toaster]:border-yellow-500",
                    info: "group-[.toaster]:bg-blue-500 group-[.toaster]:text-white group-[.toaster]:border-blue-500",
                }
            }}
            {...props}
        />
    )
}

export { Toaster }
