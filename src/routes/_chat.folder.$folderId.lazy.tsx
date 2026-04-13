import { FolderChat } from "@/components/folder-chat"
import type { Id } from "@/convex/_generated/dataModel"
import { createLazyFileRoute } from "@tanstack/react-router"
export const Route = createLazyFileRoute("/_chat/folder/$folderId")({
    component: () => {
        const { folderId } = Route.useParams()
        return <FolderChat folderId={folderId as Id<"projects">} />
    }
})
