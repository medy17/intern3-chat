import { ImageComparisonWorkspace } from "@/components/library/image-comparison-workspace"
import { LibraryLogo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { validateImageComparisonSearch } from "@/lib/image-comparison-search"
import { createFileRoute } from "@tanstack/react-router"
import { useConvexAuth, useQuery } from "convex/react"
import { ArrowLeft, Images } from "lucide-react"
import { useMemo } from "react"

export const Route = createFileRoute("/compare")({
    validateSearch: validateImageComparisonSearch,
    head: () => ({
        meta: [{ title: "Compare images · SilkChat" }, { name: "robots", content: "noindex" }]
    }),
    component: ComparisonPage,
    errorComponent: ({ reset }) => (
        <ComparisonMessage
            title="Couldn't open this comparison"
            description="The images could not be loaded. Try again, or choose another pair from your library."
        >
            <Button onClick={reset}>Try again</Button>
        </ComparisonMessage>
    )
})

function ComparisonMessage({
    title,
    description,
    children
}: {
    title: string
    description: string
    children?: React.ReactNode
}) {
    return (
        <main className="flex h-dvh flex-col bg-background p-5 text-foreground sm:p-8">
            <a href="/library" aria-label="Silkchat image library" className="w-fit">
                <LibraryLogo className="h-7 w-auto" />
            </a>
            <div className="m-auto flex max-w-md flex-col items-center gap-4 text-center">
                <Images className="mb-2 size-9 text-muted-foreground" />
                <h1 className="font-semibold text-2xl">{title}</h1>
                <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
                <div className="mt-2 flex flex-wrap justify-center gap-3">
                    {children}
                    <Button variant="outline" asChild>
                        <a href="/library">
                            <ArrowLeft className="size-4" />
                            Open library
                        </a>
                    </Button>
                </div>
            </div>
        </main>
    )
}

function ComparisonPage() {
    const { a, b } = Route.useSearch()
    const { isAuthenticated, isLoading } = useConvexAuth()
    const images = useQuery(
        api.images.listGeneratedImagesByIds,
        isAuthenticated && a && b
            ? { ids: [a as Id<"generatedImages">, b as Id<"generatedImages">] }
            : "skip"
    )
    const pair = useMemo(
        () => (images?.length === 2 ? ([images[0], images[1]] as const) : null),
        [images]
    )

    if (isLoading || (isAuthenticated && a && b && images === undefined)) {
        return (
            <main
                className="flex h-dvh flex-col gap-6 bg-background p-5 sm:p-8"
                aria-label="Loading comparison"
                aria-busy="true"
            >
                <Skeleton className="h-10 w-52 rounded-[var(--radius-lg)]" />
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-5">
                    <Skeleton className="rounded-[var(--radius-xl)]" />
                    <Skeleton className="rounded-[var(--radius-xl)]" />
                </div>
            </main>
        )
    }
    if (!isAuthenticated) {
        return (
            <ComparisonMessage
                title="Sign in to compare images"
                description="Your comparisons use images from your Silkchat library."
            >
                <Button asChild>
                    <a
                        href={`/auth/sign-in?${new URLSearchParams({ redirect: window.location.pathname + window.location.search })}`}
                    >
                        Sign in
                    </a>
                </Button>
            </ComparisonMessage>
        )
    }
    if (!a || !b)
        return (
            <ComparisonMessage
                title="Bring two images together"
                description="Select two images in your library, then choose Compare. Your comparison opens here in its own tab."
            />
        )
    if (!pair)
        return (
            <ComparisonMessage
                title="These images aren't available"
                description="One or both images may have been deleted, or belong to another account. Choose two images from your library to start again."
            />
        )
    return <ImageComparisonWorkspace images={pair} />
}
