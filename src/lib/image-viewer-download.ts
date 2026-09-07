import { downloadUrl } from "@/lib/utils"
import { toast } from "sonner"

/** Download original bytes; opening a full-resolution tab is a separate viewer action. */
export async function downloadViewerImage({
    url,
    storageKey,
    fallbackFileName = "silkchat-image",
    errorLabel = "Failed to download image:"
}: {
    url: string
    storageKey?: string
    fallbackFileName?: string
    errorLabel?: string
}) {
    if (!url) return
    try {
        await downloadUrl({ url, fileName: storageKey?.split("/").pop() || fallbackFileName })
    } catch (error) {
        console.error(errorLabel, error)
        toast.error("Failed to download image")
    }
}
