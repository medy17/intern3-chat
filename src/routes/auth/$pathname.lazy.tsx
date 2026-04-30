import { AuthCard } from "@/components/auth/auth-card"
import { ThemeSwitcher } from "@/components/themes/theme-switcher"
import { Button } from "@/components/ui/button"
import { useThemeStore } from "@/lib/theme-store"
import { Link, createLazyFileRoute } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

export const Route = createLazyFileRoute("/auth/$pathname")({
    component: RouteComponent
})

function RouteComponent() {
    const { themeState } = useThemeStore()

    return (
        <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
            {/* Left side - Background Image */}
            <div className="hidden bg-[url('/bg-light.jpg')] bg-center bg-cover bg-no-repeat lg:block dark:bg-[url('/bg-night.jpg')]" />

            {/* Right side - Auth Content */}
            <div className="relative flex flex-col items-center justify-center gap-4 p-4 sm:p-6 md:p-8">
                <div className="absolute top-4 left-4 sm:top-6 sm:left-6">
                    <Link to="/">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="gap-2 text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">Back</span>
                        </Button>
                    </Link>
                </div>
                <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
                    <ThemeSwitcher />
                </div>
                <div className="flex w-full max-w-sm items-center justify-center gap-4 sm:max-w-md lg:max-w-lg">
                    <AuthCard />
                </div>
                <div className="absolute right-4 bottom-4 left-4 flex flex-col items-center gap-2 sm:right-6 sm:bottom-6 sm:left-6">
                    <p className="hidden px-2 text-center text-muted-foreground text-xs leading-relaxed sm:block sm:text-sm">
                        {themeState.currentMode === "dark"
                            ? "Our intern is sleeping, meanwhile check out our"
                            : "Our intern is having his lunch, meanwhile checkout our"}{" "}
                        <Link to="/privacy-policy" className="underline hover:text-primary">
                            privacy policy
                        </Link>{" "}
                        and{" "}
                        <Link to="/terms-of-service" className="underline hover:text-primary">
                            terms of service
                        </Link>{" "}
                        :D
                    </p>
                </div>
            </div>
        </main>
    )
}
