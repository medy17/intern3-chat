import {
    type ErrorComponentProps,
    Outlet,
    createFileRoute,
    useParams
} from "@tanstack/react-router"

import { Header } from "@/components/header"
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider"
import { ThreadsSidebar } from "@/components/threads-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export const Route = createFileRoute("/_chat")({
    component: ChatLayout
})

function ChatLayout() {
    const params = useParams({ strict: false })
    const threadId = params.threadId

    return (
        <OnboardingProvider>
            <SidebarProvider>
                <ThreadsSidebar />
                <SidebarInset>
                    <div
                        className="flex min-h-svh flex-1 flex-col overflow-hidden"
                        style={{
                            backgroundImage: "url(https://t3.chat/images/noise.png)",
                            backgroundRepeat: "repeat",
                            backgroundSize: "auto"
                        }}
                    >
                        <Header threadId={threadId} />
                        <div className="flex min-h-0 flex-1 flex-col">
                            <Outlet />
                        </div>
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </OnboardingProvider>
    )
}

export const ChatErrorBoundary = ({ error, info, reset }: ErrorComponentProps) => {
    const isNotFound = error.message.includes("ArgumentValidationError")

    return (
        <div className="relative flex h-[calc(100dvh-64px)] flex-col items-center justify-center">
            <div className="text-center">
                {isNotFound ? (
                    <>
                        <h1 className="mb-4 font-bold text-4xl text-muted-foreground">404</h1>
                        <p className="mb-6 text-lg text-muted-foreground">Thread not found</p>
                        <p className="text-muted-foreground text-sm">
                            The thread you're looking for doesn't exist or has been deleted.
                        </p>
                    </>
                ) : (
                    <>
                        <h1 className="mb-4 font-bold text-2xl text-muted-foreground">
                            Something went wrong
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            An error occurred while loading this page.
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
