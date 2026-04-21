"use client"

import { useOnboarding } from "@/hooks/use-onboarding"
import { useEffect, useState } from "react"
import { DEV_OPEN_ONBOARDING_EVENT } from "./dev-onboarding"
import { OnboardingDialog } from "./onboarding-dialog"

interface OnboardingProviderProps {
    children: React.ReactNode
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
    const { shouldShowOnboarding, isLoading, completeOnboarding } = useOnboarding()
    const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false)
    const [isDevDialogOpen, setIsDevDialogOpen] = useState(false)

    useEffect(() => {
        if (!isLoading && shouldShowOnboarding) {
            // Add a small delay to ensure the app is fully loaded
            const timer = setTimeout(() => {
                setIsStatusDialogOpen(true)
            }, 1000)

            return () => clearTimeout(timer)
        }

        if (!isLoading && !shouldShowOnboarding) {
            // If onboarding is complete, make sure dialog is closed
            setIsStatusDialogOpen(false)
        }
    }, [isLoading, shouldShowOnboarding])

    useEffect(() => {
        if (!import.meta.env.DEV) return

        const openDevDialog = () => {
            setIsDevDialogOpen(true)
        }

        document.addEventListener(DEV_OPEN_ONBOARDING_EVENT, openDevDialog)

        const searchParams = new URLSearchParams(window.location.search)
        if (searchParams.get("onboarding") === "1" || searchParams.has("showOnboarding")) {
            openDevDialog()
        }

        return () => {
            document.removeEventListener(DEV_OPEN_ONBOARDING_EVENT, openDevDialog)
        }
    }, [])

    const handleOnboardingComplete = async () => {
        setIsStatusDialogOpen(false)
        setIsDevDialogOpen(false)
        await completeOnboarding()
    }

    return (
        <>
            {children}
            <OnboardingDialog
                isOpen={isStatusDialogOpen || isDevDialogOpen}
                onComplete={handleOnboardingComplete}
            />
        </>
    )
}
