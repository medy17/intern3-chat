"use client"

import { GoogleIcon } from "@/components/brand-icons"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSession } from "@/hooks/auth-hooks"
import { authClient } from "@/lib/auth-client"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { MotionConfig, motion } from "motion/react"
import { useEffect } from "react"
import { toast } from "sonner"

export function AuthCard() {
    const router = useRouter()
    const { data: session } = useSession()

    useEffect(() => {
        if (session?.user?.name) {
            router.navigate({ to: "/" })
        }
    }, [session, router])

    const googleSignInMutation = useMutation({
        mutationFn: async () =>
            authClient.signIn.social({
                provider: "google"
            }),
        onError: (error) => {
            toast.error(error.message ?? "Failed to sign in with Google")
        }
    })

    return (
        <MotionConfig
            transition={{
                type: "tween",
                duration: 0.15,
                ease: [0.25, 0.46, 0.45, 0.94]
            }}
        >
            <div className="flex w-full max-w-sm flex-col gap-6 md:max-w-md">
                <Card className="inset-shadow-sm gap-4 overflow-hidden border-2 bg-card pt-3 pb-5">
                    <CardHeader className="flex justify-center border-b-2 [.border-b-2]:pb-2.5">
                        <CardTitle className="text-xl">Sign In to intern3.chat</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-6">
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="grid gap-4"
                        >
                            <p className="text-center text-muted-foreground text-sm">
                                Continue with your Google account to access this workspace.
                            </p>
                            <Button
                                variant="outline"
                                className="h-10 w-full gap-2"
                                onClick={() => googleSignInMutation.mutate()}
                                disabled={googleSignInMutation.isPending}
                            >
                                {googleSignInMutation.isPending ? (
                                    <Loader2 className="size-4 shrink-0 animate-spin" />
                                ) : (
                                    <GoogleIcon className="size-4 shrink-0" />
                                )}
                                Continue with Google
                            </Button>
                        </motion.div>
                    </CardContent>
                </Card>
            </div>
        </MotionConfig>
    )
}
