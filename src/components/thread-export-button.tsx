import { Button } from "@/components/ui/button"
import { useFunction } from "@/hooks/use-function"
import { exportSingleThread } from "@/lib/thread-export-client"
import { useConvex } from "convex/react"
import { Download, Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

export function ThreadExportButton({ threadId }: { threadId: string }) {
    const convex = useConvex()
    const [isExporting, setIsExporting] = useState(false)

    const handleExport = useFunction(async () => {
        setIsExporting(true)
        try {
            await exportSingleThread({
                convex,
                threadId
            })
        } catch (error) {
            console.error("Failed to export thread:", error)
            toast.error(error instanceof Error ? error.message : "Failed to export conversation")
        } finally {
            setIsExporting(false)
        }
    })

    return (
        <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-md"
            onClick={handleExport}
            disabled={isExporting}
            title="Export thread"
        >
            {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <Download className="h-4 w-4" />
            )}
        </Button>
    )
}
