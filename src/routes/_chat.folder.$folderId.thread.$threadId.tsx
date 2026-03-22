import { Chat } from "@/components/chat"
import type { Id } from "@/convex/_generated/dataModel"
import { createFileRoute } from "@tanstack/react-router"
import { ChatErrorBoundary } from "./_chat"

export const Route = createFileRoute("/_chat/folder/$folderId/thread/$threadId")({
    component: RouteComponent,
    errorComponent: ChatErrorBoundary
})

function RouteComponent() {
    const { folderId, threadId } = Route.useParams()
    return <Chat threadId={threadId} folderId={folderId as Id<"projects">} />
}
