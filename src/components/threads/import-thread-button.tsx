import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle
} from "@/components/ui/drawer"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectSeparator,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useToken } from "@/hooks/auth-hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import { resolveJwtToken } from "@/lib/auth-token"
import { browserEnv } from "@/lib/browser-env"
import { MAX_ATTACHMENTS_PER_THREAD, getFileTypeInfo } from "@/lib/file_constants"
import type { ParsedThreadImportDocument } from "@/lib/thread-import"
import {
    fetchRemoteAttachmentAsFile,
    mergeChatGPTExporterCompanionMarkdown,
    parseThreadImportContents,
    prepareImportedAttachmentFile
} from "@/lib/thread-import"
import { dispatchThreadImportDialogState } from "@/lib/thread-import-events"
import { buildThreadImportDocumentKey } from "@/lib/thread-import-keys"
import { cn } from "@/lib/utils"
import { useMutation, useQuery } from "convex/react"
import {
    AlertCircle,
    CheckCircle2,
    FileText,
    FileUp,
    Loader2,
    Plus,
    Trash2,
    XCircle
} from "lucide-react"
import { nanoid } from "nanoid"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { NewFolderDialog } from "./new-folder-button"
import type { Project } from "./types"

type ImportMutationMessage = {
    role: "user" | "assistant" | "system"
    createdAt?: number
    parts: Array<
        | {
              type: "text"
              text: string
          }
        | {
              type: "file"
              data: string
              filename?: string
              mimeType?: string
          }
    >
    metadata?: {
        modelName?: string
    }
}

type ImportQueueStatus = "parsing" | "ready" | "importing" | "success" | "error" | "invalid"

type ImportJobStatus =
    | "queued"
    | "preparing"
    | "importing"
    | "completed"
    | "completed_with_errors"
    | "failed"

interface ImportSourceFile {
    id: string
    file: File
}

interface ImportQueueItem {
    id: string
    sourceId: string
    documentKey: string
    supportingSourceIds?: string[]
    fileName: string
    selected: boolean
    status: ImportQueueStatus
    parsed?: ParsedThreadImportDocument
    messageCount: number
    attachmentCount: number
    parseWarning?: string
    error?: string
    threadId?: Id<"threads">
    importedAttachmentCount?: number
    failedAttachmentCount?: number
}

const statusLabel: Record<ImportQueueStatus, string> = {
    parsing: "Parsing",
    ready: "Ready",
    importing: "Importing",
    success: "Imported",
    error: "Failed",
    invalid: "Invalid"
}

const statusClasses: Record<ImportQueueStatus, string> = {
    parsing: "bg-muted text-muted-foreground",
    ready: "bg-primary/10 text-primary",
    importing: "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-500/20",
    error: "bg-destructive/10 text-destructive dark:text-red-400 dark:bg-destructive/20",
    invalid: "bg-destructive/10 text-destructive dark:text-red-400 dark:bg-destructive/20"
}

const supportedImportExtensionRegex = /\.(md|markdown|txt|json)$/i
const importConcurrencyTargets = {
    mirrorStandard: 6,
    externalLinks: 16,
    skipAttachments: 10,
    attachmentHeavy: 5,
    attachmentVeryHeavy: 4,
    globalAttachmentPool: 8
} as const
const attachmentThrottleThresholds = {
    high: 160,
    medium: 80
} as const

type TaskRunner = <T>(task: () => Promise<T>) => Promise<T>
type AttachmentImportMode = "mirror" | "external" | "skip"

const attachmentModeLabels: Record<AttachmentImportMode, string> = {
    mirror: "Mirror attachments",
    external: "Keep external links",
    skip: "Skip attachments"
}

const importJobStatusLabels: Record<ImportJobStatus, string> = {
    queued: "Queued",
    preparing: "Preparing files",
    importing: "Importing threads",
    completed: "Completed",
    completed_with_errors: "Completed with issues",
    failed: "Failed"
}

const importJobStatusDescriptions: Record<ImportJobStatus, string> = {
    queued: "Waiting to begin.",
    preparing: "Parsing uploaded files and building the import queue.",
    importing: "Creating conversations in the background.",
    completed: "All selected conversations imported successfully.",
    completed_with_errors: "Imported with warnings or partial failures.",
    failed: "The import job could not complete."
}

const importJobStatusClasses: Record<ImportJobStatus, string> = {
    queued: "bg-muted text-muted-foreground",
    preparing: "bg-primary/10 text-primary",
    importing: "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
    completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-500/20",
    completed_with_errors:
        "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
    failed: "bg-destructive/10 text-destructive dark:text-red-400 dark:bg-destructive/20"
}

const inferAttachmentMimeType = (filename: string) => {
    const fileTypeInfo = getFileTypeInfo(filename)

    if (fileTypeInfo.isPdf) {
        return "application/pdf"
    }

    if (fileTypeInfo.isImage) {
        const extension = fileTypeInfo.extension

        switch (extension) {
            case ".png":
                return "image/png"
            case ".jpg":
            case ".jpeg":
                return "image/jpeg"
            case ".gif":
                return "image/gif"
            case ".webp":
                return "image/webp"
            case ".bmp":
                return "image/bmp"
            case ".ico":
                return "image/x-icon"
            case ".svg":
                return "image/svg+xml"
            default:
                return undefined
        }
    }

    if (fileTypeInfo.isText) {
        return "text/plain"
    }

    return undefined
}

const createTaskRunner = (concurrency: number): TaskRunner => {
    if (concurrency <= 1) {
        return async function runTask<T>(task: () => Promise<T>) {
            return task()
        }
    }

    let activeTasks = 0
    const pendingTasks: Array<() => void> = []

    const runNextTask = () => {
        if (activeTasks >= concurrency) {
            return
        }

        const nextTask = pendingTasks.shift()
        if (!nextTask) {
            return
        }

        activeTasks += 1
        nextTask()
    }

    return function runTask<T>(task: () => Promise<T>) {
        return new Promise<T>((resolve, reject) => {
            const executeTask = () => {
                void task()
                    .then(resolve, reject)
                    .finally(() => {
                        activeTasks -= 1
                        runNextTask()
                    })
            }

            pendingTasks.push(executeTask)
            runNextTask()
        })
    }
}

const uploadAttachment = async ({
    file,
    jwt
}: {
    file: File
    jwt: string
}) => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("fileName", file.name)

    const response = await fetch(`${browserEnv("VITE_CONVEX_API_URL")}/upload`, {
        method: "POST",
        body: formData,
        headers: {
            Authorization: `Bearer ${jwt}`
        }
    })

    if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || `Upload failed with status ${response.status}`)
    }

    return (await response.json()) as {
        key: string
        fileName: string
        fileType: string
    }
}

const uploadImportSource = async ({
    file,
    clientSourceId,
    jwt
}: {
    file: File
    clientSourceId: string
    jwt: string
}) => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("fileName", file.name)
    formData.append("clientSourceId", clientSourceId)

    const response = await fetch(`${browserEnv("VITE_CONVEX_API_URL")}/import-upload`, {
        method: "POST",
        body: formData,
        headers: {
            Authorization: `Bearer ${jwt}`
        }
    })

    if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || `Import upload failed with status ${response.status}`)
    }

    return (await response.json()) as {
        clientSourceId?: string
        storageKey: string
        fileName: string
        mimeType?: string
        size: number
    }
}

export function ImportThreadButton({ onClick }: { onClick: () => void }) {
    return (
        <Button variant="outline" onClick={onClick} className="w-full justify-center">
            <FileUp className="h-4 w-4" />
            Import Thread
        </Button>
    )
}

export function ImportThreadDialog({
    open,
    onOpenChange,
    projects,
    jobId,
    onJobIdChange,
    onImported
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    projects: Project[]
    jobId: Id<"importJobs"> | null
    onJobIdChange: (jobId: Id<"importJobs"> | null) => void
    onImported?: (threadId: Id<"threads">) => void
}) {
    const { token } = useToken()
    const isMobile = useIsMobile()
    const importThreadMutation = useMutation(api.threads.importThread)
    const startImportJobMutation = useMutation(api.import_jobs.startImportJob)
    const deleteImportJobMutation = useMutation(api.import_jobs.deleteImportJob)
    const currentJob = useQuery(api.import_jobs.getImportJob, jobId ? { jobId } : "skip")
    const fileInputRef = useRef<HTMLInputElement>(null)
    const dragDepthRef = useRef(0)

    const setOpen = onOpenChange
    const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
    const [selectOpen, setSelectOpen] = useState(false)
    const [sourceFiles, setSourceFiles] = useState<ImportSourceFile[]>([])
    const [queue, setQueue] = useState<ImportQueueItem[]>([])
    const [isParsingFiles, setIsParsingFiles] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [isDropZoneActive, setIsDropZoneActive] = useState(false)
    const [attachmentImportMode, setAttachmentImportMode] =
        useState<AttachmentImportMode>("external")
    const [selectedProjectId, setSelectedProjectId] = useState<string>("no-folder")

    useEffect(() => {
        dispatchThreadImportDialogState(open)
    }, [open])

    useEffect(() => {
        return () => {
            dispatchThreadImportDialogState(false)
        }
    }, [])

    useEffect(() => {
        if (!open) {
            dragDepthRef.current = 0
            setIsDropZoneActive(false)
        }
    }, [open])

    const resetLocalImportState = () => {
        setQueue([])
        setSourceFiles([])
        setIsParsingFiles(false)
        setIsImporting(false)
        dragDepthRef.current = 0
        setIsDropZoneActive(false)
    }

    // Keep internal alias for setOpen used throughout the component
    // (onOpenChange is the controlled prop from parent)

    const selectableQueueItems = useMemo(
        () => queue.filter((item) => item.status !== "parsing" && item.status !== "importing"),
        [queue]
    )

    const selectedSelectableCount = useMemo(
        () => selectableQueueItems.filter((item) => item.selected).length,
        [selectableQueueItems]
    )

    const hasSelectableItems = selectableQueueItems.length > 0
    const allSelectableChecked =
        hasSelectableItems && selectedSelectableCount === selectableQueueItems.length
    const someSelectableChecked =
        selectedSelectableCount > 0 && selectedSelectableCount < selectableQueueItems.length

    const itemsReadyForImport = useMemo(
        () =>
            queue.filter(
                (item) =>
                    item.selected &&
                    (item.status === "ready" || item.status === "error") &&
                    item.parsed
            ),
        [queue]
    )

    const selectedAttachmentCount = useMemo(
        () => itemsReadyForImport.reduce((sum, item) => sum + item.attachmentCount, 0),
        [itemsReadyForImport]
    )

    const shouldMirrorAttachments = attachmentImportMode === "mirror"
    const shouldKeepExternalAttachments = attachmentImportMode === "external"
    const attachmentModeSummary = attachmentModeLabels[attachmentImportMode]
    const shouldUseAsyncImport =
        shouldMirrorAttachments || itemsReadyForImport.length > 50 || Boolean(jobId)

    const requestedConcurrency = useMemo(() => {
        switch (attachmentImportMode) {
            case "mirror":
                return importConcurrencyTargets.mirrorStandard
            case "external":
                return importConcurrencyTargets.externalLinks
            case "skip":
                return importConcurrencyTargets.skipAttachments
        }
    }, [attachmentImportMode])

    const effectiveConcurrency = useMemo(() => {
        if (!shouldMirrorAttachments) {
            return requestedConcurrency
        }

        if (selectedAttachmentCount >= attachmentThrottleThresholds.high) {
            return importConcurrencyTargets.attachmentVeryHeavy
        }

        if (selectedAttachmentCount >= attachmentThrottleThresholds.medium) {
            return Math.min(requestedConcurrency, importConcurrencyTargets.attachmentHeavy)
        }

        return requestedConcurrency
    }, [shouldMirrorAttachments, requestedConcurrency, selectedAttachmentCount])

    const canImport = itemsReadyForImport.length > 0 && !isImporting && !isParsingFiles

    const summary = useMemo(() => {
        const success = queue.filter((item) => item.status === "success").length
        const failed = queue.filter(
            (item) => item.status === "error" || item.status === "invalid"
        ).length
        const pending = queue.filter((item) => item.status === "ready").length

        return { success, failed, pending }
    }, [queue])

    const updateQueueItem = (id: string, updater: (item: ImportQueueItem) => ImportQueueItem) => {
        setQueue((previous) => previous.map((item) => (item.id === id ? updater(item) : item)))
    }

    const mergePairedChatGPTExporterQueueItems = (items: ImportQueueItem[]) => {
        const jsonByConversationId = new Map<string, ImportQueueItem[]>()
        const markdownByConversationId = new Map<string, ImportQueueItem[]>()

        for (const item of items) {
            if (item.status !== "ready" || !item.parsed) continue
            if (item.parsed.source.service !== "chatgptexporter") continue

            const conversationId = item.parsed.source.conversationId
            if (!conversationId) continue

            if (item.parsed.source.format === "json") {
                const existing = jsonByConversationId.get(conversationId) ?? []
                existing.push(item)
                jsonByConversationId.set(conversationId, existing)
            }

            if (item.parsed.source.format === "markdown") {
                const existing = markdownByConversationId.get(conversationId) ?? []
                existing.push(item)
                markdownByConversationId.set(conversationId, existing)
            }
        }

        const updateById = new Map<string, ImportQueueItem>()
        const removeIds = new Set<string>()
        let mergedCount = 0

        for (const [conversationId, jsonItems] of jsonByConversationId.entries()) {
            const markdownItems = markdownByConversationId.get(conversationId)
            if (!markdownItems?.length) continue

            const mergePairs = Math.min(jsonItems.length, markdownItems.length)
            for (let index = 0; index < mergePairs; index += 1) {
                const jsonItem = jsonItems[index]
                const markdownItem = markdownItems[index]
                if (!jsonItem.parsed || !markdownItem.parsed) continue

                const mergeResult = mergeChatGPTExporterCompanionMarkdown({
                    jsonDocument: jsonItem.parsed,
                    markdownDocument: markdownItem.parsed
                })

                if (!mergeResult.merged) {
                    continue
                }

                mergedCount += 1
                removeIds.add(markdownItem.id)

                const enrichmentWarning = mergeResult.mergedDocument.parseWarnings.find((warning) =>
                    warning.startsWith("Enriched from markdown companion")
                )

                updateById.set(jsonItem.id, {
                    ...jsonItem,
                    supportingSourceIds: Array.from(
                        new Set([
                            ...(jsonItem.supportingSourceIds ?? []),
                            jsonItem.sourceId,
                            ...(markdownItem.supportingSourceIds ?? []),
                            markdownItem.sourceId
                        ])
                    ).filter((sourceId) => sourceId !== jsonItem.sourceId),
                    parsed: mergeResult.mergedDocument,
                    messageCount: mergeResult.mergedDocument.messages.length,
                    attachmentCount: mergeResult.mergedDocument.messages.reduce(
                        (sum, message) => sum + message.attachments.length,
                        0
                    ),
                    parseWarning:
                        enrichmentWarning ||
                        mergeResult.mergedDocument.parseWarnings[0] ||
                        undefined
                })
            }
        }

        const queue = items
            .filter((item) => !removeIds.has(item.id))
            .map((item) => updateById.get(item.id) ?? item)

        return { queue, mergedCount }
    }

    const sanitizeIncomingFiles = (files: File[]) => {
        const accepted: File[] = []
        let rejected = 0

        for (const file of files) {
            const matchesByType =
                file.type === "text/markdown" ||
                file.type === "text/plain" ||
                file.type === "application/markdown" ||
                file.type === "application/json"

            const matchesByName = supportedImportExtensionRegex.test(file.name)

            if (matchesByType || matchesByName) {
                accepted.push(file)
            } else {
                rejected += 1
            }
        }

        return {
            accepted,
            rejected
        }
    }

    const handleAddFiles = async (files: File[]) => {
        if (files.length === 0) {
            return
        }

        const { accepted, rejected } = sanitizeIncomingFiles(files)

        if (rejected > 0) {
            toast.error(
                `Skipped ${rejected} file${rejected > 1 ? "s" : ""}. Use supported exports (.md, .txt, .json).`
            )
        }

        if (accepted.length === 0) {
            return
        }

        const acceptedSourceFiles: ImportSourceFile[] = accepted.map((file) => ({
            id: nanoid(),
            file
        }))
        const queuedItems: ImportQueueItem[] = acceptedSourceFiles.map((source) => ({
            id: nanoid(),
            sourceId: source.id,
            documentKey: source.id,
            supportingSourceIds: [],
            fileName: source.file.name,
            selected: true,
            status: "parsing",
            messageCount: 0,
            attachmentCount: 0
        }))

        setSourceFiles((previous) => [...previous, ...acceptedSourceFiles])
        setQueue((previous) => [...previous, ...queuedItems])
        setIsParsingFiles(true)

        await Promise.all(
            queuedItems.map(async (queuedItem, index) => {
                const source = acceptedSourceFiles[index]
                const file = source.file

                try {
                    const content = await file.text()
                    const parsedDocuments = parseThreadImportContents({
                        content,
                        fileName: file.name,
                        mimeType: file.type || undefined
                    })

                    const importableDocuments = parsedDocuments.filter(
                        (document) => document.messages.length > 0
                    )

                    if (importableDocuments.length === 0) {
                        updateQueueItem(queuedItem.id, (item) => ({
                            ...item,
                            selected: false,
                            status: "invalid",
                            error: "No importable messages found"
                        }))
                        return
                    }

                    const [firstDocument, ...remainingDocuments] = importableDocuments
                    const attachmentCount = firstDocument.messages.reduce(
                        (sum, message) => sum + message.attachments.length,
                        0
                    )

                    updateQueueItem(queuedItem.id, (item) => ({
                        ...item,
                        documentKey: buildThreadImportDocumentKey(firstDocument, 0),
                        supportingSourceIds: [],
                        fileName:
                            importableDocuments.length > 1
                                ? `${file.name} • ${firstDocument.title}`
                                : file.name,
                        status: "ready",
                        parsed: firstDocument,
                        messageCount: firstDocument.messages.length,
                        attachmentCount,
                        parseWarning: firstDocument.parseWarnings[0],
                        error: undefined
                    }))

                    if (remainingDocuments.length > 0) {
                        const extraItems: ImportQueueItem[] = remainingDocuments.map(
                            (document, documentIndex) => ({
                                id: nanoid(),
                                sourceId: source.id,
                                documentKey: buildThreadImportDocumentKey(
                                    document,
                                    documentIndex + 1
                                ),
                                supportingSourceIds: [],
                                fileName: `${file.name} • ${document.title}`,
                                selected: true,
                                status: "ready",
                                parsed: document,
                                messageCount: document.messages.length,
                                attachmentCount: document.messages.reduce(
                                    (sum, message) => sum + message.attachments.length,
                                    0
                                ),
                                parseWarning: document.parseWarnings[0]
                            })
                        )

                        setQueue((previous) => [...previous, ...extraItems])
                    }
                } catch (error) {
                    updateQueueItem(queuedItem.id, (item) => ({
                        ...item,
                        selected: false,
                        status: "invalid",
                        error:
                            error instanceof Error ? error.message : "Unable to parse import file"
                    }))
                }
            })
        )

        let mergedCount = 0
        setQueue((previous) => {
            const merged = mergePairedChatGPTExporterQueueItems(previous)
            mergedCount = merged.mergedCount
            return merged.queue
        })

        if (mergedCount > 0) {
            toast.success(
                `Auto-paired ${mergedCount} ChatGPT Exporter markdown companion${mergedCount > 1 ? "s" : ""} with JSON source file${mergedCount > 1 ? "s" : ""}.`
            )
        }

        setIsParsingFiles(false)
    }

    const handleDialogDragEnter = (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault()
        event.stopPropagation()

        if (!open || isImporting || isParsingFiles) {
            return
        }

        if (!event.dataTransfer?.types.includes("Files")) {
            return
        }

        dragDepthRef.current += 1
        setIsDropZoneActive(true)
    }

    const handleDialogDragLeave = (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault()
        event.stopPropagation()

        dragDepthRef.current -= 1
        if (dragDepthRef.current <= 0) {
            dragDepthRef.current = 0
            setIsDropZoneActive(false)
        }
    }

    const handleDialogDragOver = (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault()
        event.stopPropagation()
    }

    const handleDialogDrop = async (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault()
        event.stopPropagation()

        dragDepthRef.current = 0
        setIsDropZoneActive(false)

        if (isImporting || isParsingFiles) {
            return
        }

        const files = Array.from(event.dataTransfer.files || [])
        await handleAddFiles(files)
    }

    const importSingleQueueItem = async ({
        item,
        jwt,
        runAttachmentTask
    }: {
        item: ImportQueueItem
        jwt: string
        runAttachmentTask: TaskRunner
    }) => {
        if (!item.parsed) {
            throw new Error("Missing parsed conversation data")
        }

        let importedAttachmentCount = 0
        let failedAttachmentCount = 0
        let remainingAttachmentSlots = shouldMirrorAttachments
            ? MAX_ATTACHMENTS_PER_THREAD
            : Number.POSITIVE_INFINITY
        const preparedMessages: ImportMutationMessage[] = []

        for (const parsedMessage of item.parsed.messages) {
            const parts: ImportMutationMessage["parts"] = []

            const text = parsedMessage.text.trim()
            if (text) {
                parts.push({
                    type: "text",
                    text
                })
            }

            if (shouldMirrorAttachments) {
                const attachmentsToProcess = parsedMessage.attachments.slice(
                    0,
                    remainingAttachmentSlots
                )
                const skippedAttachments =
                    parsedMessage.attachments.length - attachmentsToProcess.length

                failedAttachmentCount += skippedAttachments

                const attachmentResults = await Promise.all(
                    attachmentsToProcess.map((attachment) =>
                        runAttachmentTask(async () => {
                            try {
                                const downloadedFile = await fetchRemoteAttachmentAsFile({
                                    url: attachment.url,
                                    filename: attachment.filename
                                })

                                const preparedFile =
                                    await prepareImportedAttachmentFile(downloadedFile)
                                const uploaded = await uploadAttachment({
                                    file: preparedFile,
                                    jwt
                                })

                                return {
                                    success: true as const,
                                    part: {
                                        type: "file" as const,
                                        data: uploaded.key,
                                        filename: uploaded.fileName,
                                        mimeType: uploaded.fileType
                                    }
                                }
                            } catch (error) {
                                console.warn(
                                    `[thread-import] Failed attachment import for ${attachment.url}`,
                                    error
                                )

                                return {
                                    success: false as const
                                }
                            }
                        })
                    )
                )

                for (const result of attachmentResults) {
                    if (!result.success) {
                        failedAttachmentCount += 1
                        continue
                    }

                    parts.push(result.part)
                    importedAttachmentCount += 1
                    remainingAttachmentSlots -= 1
                }
            } else if (shouldKeepExternalAttachments) {
                for (const attachment of parsedMessage.attachments) {
                    parts.push({
                        type: "file",
                        data: attachment.url,
                        filename: attachment.filename,
                        mimeType: inferAttachmentMimeType(attachment.filename)
                    })
                    importedAttachmentCount += 1
                }
            }

            if (parts.length > 0) {
                preparedMessages.push({
                    role: parsedMessage.role,
                    createdAt: parsedMessage.createdAt,
                    parts,
                    metadata: parsedMessage.metadata
                })
            }
        }

        if (preparedMessages.length === 0) {
            throw new Error("No messages left after validation and attachment processing")
        }

        const projectId =
            selectedProjectId === "no-folder" ? undefined : (selectedProjectId as Id<"projects">)

        const result = await importThreadMutation({
            title: item.parsed.title,
            messages: preparedMessages,
            projectId,
            sourceCreatedAt: item.parsed.source.createdAt,
            sourceUpdatedAt: item.parsed.source.updatedAt
        })

        if (!result || "error" in result) {
            const errorMessage =
                result && "error" in result && typeof result.error === "string"
                    ? result.error
                    : "Import failed"
            throw new Error(errorMessage)
        }

        return {
            threadId: result.threadId as Id<"threads">,
            importedMessages: preparedMessages.length,
            importedAttachmentCount,
            failedAttachmentCount
        }
    }

    const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || [])
        await handleAddFiles(files)
        event.target.value = ""
    }

    const handleImport = async () => {
        if (itemsReadyForImport.length === 0) {
            toast.error("Select at least one valid conversation to import")
            return
        }

        setIsImporting(true)
        try {
            const projectId =
                selectedProjectId === "no-folder"
                    ? undefined
                    : (selectedProjectId as Id<"projects">)

            if (shouldUseAsyncImport) {
                const jwt = await resolveJwtToken(token)
                if (!jwt) {
                    throw new Error("Authentication token unavailable")
                }

                const selectedDocumentKeysBySource = new Map<string, string[]>()
                for (const item of itemsReadyForImport) {
                    const keys = selectedDocumentKeysBySource.get(item.sourceId) ?? []
                    keys.push(item.documentKey)
                    selectedDocumentKeysBySource.set(item.sourceId, keys)

                    for (const supportingSourceId of item.supportingSourceIds ?? []) {
                        if (!selectedDocumentKeysBySource.has(supportingSourceId)) {
                            selectedDocumentKeysBySource.set(supportingSourceId, [])
                        }
                    }
                }

                const runUploadTask = createTaskRunner(8)
                const uploadedSources = await Promise.all(
                    Array.from(selectedDocumentKeysBySource.entries()).map(
                        ([sourceId, selectedDocumentKeys]) =>
                            runUploadTask(async () => {
                                const sourceFile = sourceFiles.find(
                                    (source) => source.id === sourceId
                                )
                                if (!sourceFile) {
                                    throw new Error("Missing selected source file for async import")
                                }

                                const uploaded = await uploadImportSource({
                                    file: sourceFile.file,
                                    clientSourceId: sourceId,
                                    jwt
                                })

                                return {
                                    clientSourceId: sourceId,
                                    storageKey: uploaded.storageKey,
                                    fileName: uploaded.fileName,
                                    mimeType: uploaded.mimeType,
                                    size: uploaded.size,
                                    selectedDocumentKeys
                                }
                            })
                    )
                )

                const result = await startImportJobMutation({
                    attachmentMode: attachmentImportMode,
                    projectId,
                    sourceFiles: uploadedSources
                })

                if (!result || "error" in result) {
                    throw new Error(
                        result && "error" in result && typeof result.error === "string"
                            ? result.error
                            : "Failed to start import job"
                    )
                }

                resetLocalImportState()
                onJobIdChange(result.jobId)
                toast.success("Import job started. You can close this dialog and keep working.")
                return
            }

            const jwt = shouldMirrorAttachments ? await resolveJwtToken(token) : null
            if (shouldMirrorAttachments && !jwt) {
                throw new Error("Authentication token unavailable")
            }

            let successCount = 0
            let failedCount = 0

            const importQueue = [...itemsReadyForImport]
            let cursor = 0
            const workerCount = Math.min(effectiveConcurrency, importQueue.length)
            const runAttachmentTask = createTaskRunner(
                shouldMirrorAttachments ? importConcurrencyTargets.globalAttachmentPool : 1
            )

            const runWorker = async () => {
                while (true) {
                    const currentIndex = cursor
                    cursor += 1

                    if (currentIndex >= importQueue.length) {
                        return
                    }

                    const queueItem = importQueue[currentIndex]

                    updateQueueItem(queueItem.id, (item) => ({
                        ...item,
                        status: "importing",
                        error: undefined
                    }))

                    try {
                        const result = await importSingleQueueItem({
                            item: queueItem,
                            jwt: jwt!,
                            runAttachmentTask
                        })

                        successCount += 1
                        updateQueueItem(queueItem.id, (item) => ({
                            ...item,
                            selected: false,
                            status: "success",
                            threadId: result.threadId,
                            messageCount: result.importedMessages,
                            importedAttachmentCount: result.importedAttachmentCount,
                            failedAttachmentCount: result.failedAttachmentCount,
                            error: undefined
                        }))
                    } catch (error) {
                        failedCount += 1
                        updateQueueItem(queueItem.id, (item) => ({
                            ...item,
                            status: "error",
                            error: error instanceof Error ? error.message : "Import failed"
                        }))
                    }
                }
            }

            await Promise.all(Array.from({ length: workerCount }, () => runWorker()))

            if (successCount > 0) {
                toast.success(`Imported ${successCount} conversation${successCount > 1 ? "s" : ""}`)
            }
            if (failedCount > 0) {
                toast.error(`${failedCount} conversation${failedCount > 1 ? "s" : ""} failed`)
            }
        } catch (error) {
            console.error("[thread-import] failed", error)
            toast.error(error instanceof Error ? error.message : "Failed to import thread")
        } finally {
            setIsImporting(false)
        }
    }

    const startNewImport = () => {
        onJobIdChange(null)
        resetLocalImportState()
    }

    const handleDeleteCurrentJob = async () => {
        if (!jobId) return

        try {
            const result = await deleteImportJobMutation({ jobId })
            if (!result || ("error" in result && result.error)) {
                throw new Error(
                    result && "error" in result && typeof result.error === "string"
                        ? result.error
                        : "Failed to remove import job"
                )
            }

            onJobIdChange(null)
            toast.success("Import job removed")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to remove import job")
        }
    }

    const currentJobProgressValue = currentJob
        ? currentJob.totalThreads > 0
            ? Math.min(
                  100,
                  Math.round((currentJob.processedThreads / currentJob.totalThreads) * 100)
              )
            : currentJob.preparedSourceFiles > 0
              ? Math.min(
                    100,
                    Math.round(
                        (currentJob.preparedSourceFiles /
                            Math.max(currentJob.totalSourceFiles, 1)) *
                            100
                    )
                )
              : currentJob.status === "completed" || currentJob.status === "completed_with_errors"
                ? 100
                : 0
        : 0

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".md,.markdown,.txt,.json,text/markdown,text/plain,application/json"
                className="hidden"
                onChange={handleFileInputChange}
            />

            {(() => {
                const handleOpenChange = (nextOpen: boolean) => {
                    if (!isImporting && !isParsingFiles) {
                        setOpen(nextOpen)
                    }
                }

                const dragProps = {
                    onDragEnter: handleDialogDragEnter,
                    onDragLeave: handleDialogDragLeave,
                    onDragOver: handleDialogDragOver,
                    onDrop: handleDialogDrop
                }

                const queueImportBody = (
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-0">
                        <div className="space-y-6 pb-4">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="thread-import-folder">Destination Folder</Label>
                                    <div className="flex items-center gap-2">
                                        <Select
                                            open={selectOpen}
                                            onOpenChange={setSelectOpen}
                                            value={selectedProjectId}
                                            onValueChange={setSelectedProjectId}
                                            disabled={isImporting || isParsingFiles}
                                        >
                                            <SelectTrigger
                                                id="thread-import-folder"
                                                className="flex-1"
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="z-[80]">
                                                <SelectItem value="no-folder">
                                                    General (No Folder)
                                                </SelectItem>
                                                {projects.map((project) => (
                                                    <SelectItem
                                                        key={project._id}
                                                        value={project._id}
                                                    >
                                                        {project.name}
                                                    </SelectItem>
                                                ))}
                                                <SelectSeparator />
                                                <button
                                                    type="button"
                                                    className="flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-primary text-sm outline-hidden hover:bg-accent focus:bg-accent"
                                                    onPointerDown={(e) => {
                                                        e.preventDefault()
                                                        e.stopPropagation()
                                                    }}
                                                    onClick={(e) => {
                                                        e.preventDefault()
                                                        e.stopPropagation()
                                                        setSelectOpen(false)
                                                        setShowNewFolderDialog(true)
                                                    }}
                                                >
                                                    <Plus className="h-4 w-4" />
                                                    <span>Create Folder</span>
                                                </button>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="rounded-md border bg-muted/10 px-3">
                                    <Accordion type="single" collapsible>
                                        <AccordionItem
                                            value="attachment-options"
                                            className="border-b-0"
                                        >
                                            <AccordionTrigger className="py-3 hover:no-underline">
                                                <div className="space-y-0.5">
                                                    <div className="font-normal text-sm">
                                                        Attachment options
                                                    </div>
                                                    <p className="text-muted-foreground text-xs">
                                                        {attachmentModeSummary}
                                                    </p>
                                                </div>
                                            </AccordionTrigger>
                                            <AccordionContent className="pt-1">
                                                <RadioGroup
                                                    value={attachmentImportMode}
                                                    onValueChange={(value) =>
                                                        setAttachmentImportMode(
                                                            value as AttachmentImportMode
                                                        )
                                                    }
                                                    className="gap-2"
                                                >
                                                    <label
                                                        htmlFor="thread-import-attachment-mirror"
                                                        className="flex cursor-pointer items-start gap-3 rounded-md border bg-background px-3 py-2.5 transition-colors hover:bg-muted/40"
                                                    >
                                                        <RadioGroupItem
                                                            id="thread-import-attachment-mirror"
                                                            value="mirror"
                                                            disabled={isImporting || isParsingFiles}
                                                            className="mt-0.5"
                                                        />
                                                        <div className="space-y-1">
                                                            <div className="font-medium text-sm">
                                                                Mirror attachments
                                                            </div>
                                                            <p className="text-muted-foreground text-xs leading-5">
                                                                Slowest. Copies files into your app
                                                                for better reliability. Max{" "}
                                                                {MAX_ATTACHMENTS_PER_THREAD}{" "}
                                                                mirrored attachments per imported
                                                                thread.
                                                            </p>
                                                        </div>
                                                    </label>

                                                    <label
                                                        htmlFor="thread-import-attachment-external"
                                                        className="flex cursor-pointer items-start gap-3 rounded-md border bg-background px-3 py-2.5 transition-colors hover:bg-muted/40"
                                                    >
                                                        <RadioGroupItem
                                                            id="thread-import-attachment-external"
                                                            value="external"
                                                            disabled={isImporting || isParsingFiles}
                                                            className="mt-0.5"
                                                        />
                                                        <div className="space-y-1">
                                                            <div className="font-medium text-sm">
                                                                Keep external links
                                                            </div>
                                                            <p className="text-muted-foreground text-xs leading-5">
                                                                Fastest. Files stay on the original
                                                                source and may break later.
                                                            </p>
                                                        </div>
                                                    </label>

                                                    <label
                                                        htmlFor="thread-import-attachment-skip"
                                                        className="flex cursor-pointer items-start gap-3 rounded-md border bg-background px-3 py-2.5 transition-colors hover:bg-muted/40"
                                                    >
                                                        <RadioGroupItem
                                                            id="thread-import-attachment-skip"
                                                            value="skip"
                                                            disabled={isImporting || isParsingFiles}
                                                            className="mt-0.5"
                                                        />
                                                        <div className="space-y-1">
                                                            <div className="font-medium text-sm">
                                                                Skip attachments
                                                            </div>
                                                            <p className="text-muted-foreground text-xs leading-5">
                                                                Imports messages only.
                                                            </p>
                                                        </div>
                                                    </label>
                                                </RadioGroup>
                                            </AccordionContent>
                                        </AccordionItem>
                                    </Accordion>
                                </div>
                            </div>

                            <Button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isImporting || isParsingFiles}
                                className="w-full sm:hidden"
                            >
                                <FileUp className="h-4 w-4" />
                                Select Files
                            </Button>

                            <div
                                className={cn(
                                    "flex flex-col rounded-md border transition-colors",
                                    isDropZoneActive && "border-primary bg-primary/5"
                                )}
                            >
                                <div className="flex items-center justify-between border-b bg-muted/10 px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            checked={
                                                allSelectableChecked
                                                    ? true
                                                    : someSelectableChecked
                                                      ? "indeterminate"
                                                      : false
                                            }
                                            onCheckedChange={(checked) => {
                                                const isChecked =
                                                    checked === "indeterminate"
                                                        ? true
                                                        : Boolean(checked)

                                                setQueue((previous) =>
                                                    previous.map((item) =>
                                                        item.status === "parsing" ||
                                                        item.status === "importing"
                                                            ? item
                                                            : {
                                                                  ...item,
                                                                  selected: isChecked
                                                              }
                                                    )
                                                )
                                            }}
                                            disabled={
                                                !hasSelectableItems || isImporting || isParsingFiles
                                            }
                                        />
                                        <span className="font-medium text-sm">
                                            Conversation queue
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                        <span>Ready: {summary.pending}</span>
                                        <span>Imported: {summary.success}</span>
                                        <span>Issues: {summary.failed}</span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-1 border-b bg-muted/20 px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2">
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isImporting || isParsingFiles}
                                        className="hidden h-8 shrink-0 px-2 sm:inline-flex sm:px-3"
                                    >
                                        <FileUp className="h-3.5 w-3.5 sm:mr-1.5" />
                                        <span className="hidden sm:inline">Add Files</span>
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() =>
                                            setQueue((previous) =>
                                                previous.filter((item) => !item.selected)
                                            )
                                        }
                                        disabled={
                                            selectedSelectableCount === 0 ||
                                            isImporting ||
                                            isParsingFiles
                                        }
                                        className="h-8 shrink-0 px-2 text-muted-foreground sm:px-3"
                                    >
                                        <Trash2 className="h-3.5 w-3.5 sm:mr-1.5" />
                                        <span className="hidden sm:inline">Remove Selected</span>
                                        <span className="text-xs sm:hidden">Remove</span>
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() =>
                                            setQueue((previous) =>
                                                previous.filter((item) => item.status !== "success")
                                            )
                                        }
                                        disabled={
                                            summary.success === 0 || isImporting || isParsingFiles
                                        }
                                        className="h-8 shrink-0 px-2 text-muted-foreground sm:px-3"
                                    >
                                        <span className="hidden sm:inline">Clear Completed</span>
                                        <span className="text-xs sm:hidden">Clear</span>
                                    </Button>
                                    {(isParsingFiles || isImporting) && (
                                        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            <span className="hidden sm:inline">
                                                {isParsingFiles ? "Parsing..." : "Importing..."}
                                            </span>
                                        </span>
                                    )}
                                </div>

                                {isDropZoneActive && (
                                    <div className="hidden border-b bg-primary/10 px-3 py-4 text-center font-medium text-primary text-sm sm:block">
                                        Drop export files here to add them to the queue
                                    </div>
                                )}

                                <div className="max-h-[30vh] min-h-[7.5rem] overflow-y-auto sm:max-h-[40vh] sm:min-h-[9.375rem]">
                                    {queue.length === 0 ? (
                                        <div className="p-10 text-center text-muted-foreground">
                                            <FileText className="mx-auto mb-3 h-10 w-10 opacity-20" />
                                            <p className="font-medium text-sm">
                                                No files selected yet
                                            </p>
                                            <p className="mt-1 hidden text-xs opacity-70 sm:block">
                                                Drag and drop export files here
                                            </p>
                                            <p className="mt-1 text-xs opacity-70 sm:hidden">
                                                Tap "Select Files" above to add export files
                                            </p>
                                        </div>
                                    ) : (
                                        queue.map((item) => (
                                            <div
                                                key={item.id}
                                                className="flex items-start gap-3 border-b px-3 py-3 last:border-b-0"
                                            >
                                                <Checkbox
                                                    checked={item.selected}
                                                    onCheckedChange={(checked) =>
                                                        setQueue((previous) =>
                                                            previous.map((currentItem) =>
                                                                currentItem.id !== item.id ||
                                                                currentItem.status === "parsing" ||
                                                                currentItem.status === "importing"
                                                                    ? currentItem
                                                                    : {
                                                                          ...currentItem,
                                                                          selected:
                                                                              checked ===
                                                                              "indeterminate"
                                                                                  ? true
                                                                                  : Boolean(checked)
                                                                      }
                                                            )
                                                        )
                                                    }
                                                    disabled={
                                                        item.status === "parsing" ||
                                                        item.status === "importing" ||
                                                        isImporting ||
                                                        isParsingFiles
                                                    }
                                                />

                                                <div className="min-w-0 flex-1 space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                        <p className="truncate font-medium text-sm">
                                                            {item.fileName}
                                                        </p>
                                                        <Badge
                                                            variant="secondary"
                                                            className={cn(
                                                                "text-xs",
                                                                statusClasses[item.status]
                                                            )}
                                                        >
                                                            {statusLabel[item.status]}
                                                        </Badge>
                                                    </div>

                                                    <p className="text-muted-foreground text-xs">
                                                        {item.messageCount} messages,{" "}
                                                        {item.attachmentCount} attachments
                                                    </p>

                                                    {item.parseWarning && (
                                                        <p className="text-amber-600 text-xs dark:text-amber-400">
                                                            {item.parseWarning}
                                                        </p>
                                                    )}

                                                    {shouldMirrorAttachments &&
                                                        item.attachmentCount >
                                                            MAX_ATTACHMENTS_PER_THREAD && (
                                                            <p className="text-amber-600 text-xs dark:text-amber-400">
                                                                Only the first{" "}
                                                                {MAX_ATTACHMENTS_PER_THREAD}{" "}
                                                                attachments will be mirrored for
                                                                this thread.
                                                            </p>
                                                        )}

                                                    {shouldKeepExternalAttachments &&
                                                        item.attachmentCount > 0 && (
                                                            <p className="text-muted-foreground text-xs">
                                                                Attachments will remain as external
                                                                links.
                                                            </p>
                                                        )}

                                                    {item.error && (
                                                        <p className="inline-flex items-center gap-1 text-destructive text-xs">
                                                            <XCircle className="h-3 w-3" />
                                                            {item.error}
                                                        </p>
                                                    )}

                                                    {item.status === "success" && (
                                                        <div className="inline-flex flex-wrap items-center gap-2 text-emerald-600 text-xs dark:text-emerald-400">
                                                            <span className="inline-flex items-center gap-1">
                                                                <CheckCircle2 className="h-3 w-3" />
                                                                Imported
                                                            </span>
                                                            <span>
                                                                Attachments:{" "}
                                                                {item.importedAttachmentCount ?? 0}
                                                            </span>
                                                            {(item.failedAttachmentCount ?? 0) >
                                                                0 && (
                                                                <span>
                                                                    Skipped:{" "}
                                                                    {item.failedAttachmentCount}
                                                                </span>
                                                            )}
                                                            {item.threadId && onImported && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() =>
                                                                        onImported(item.threadId!)
                                                                    }
                                                                    className="h-6 px-2 text-xs"
                                                                >
                                                                    Open
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() =>
                                                        setQueue((previous) =>
                                                            previous.filter(
                                                                (current) => current.id !== item.id
                                                            )
                                                        )
                                                    }
                                                    className="h-7 w-7"
                                                    disabled={
                                                        item.status === "importing" ||
                                                        item.status === "parsing" ||
                                                        isImporting ||
                                                        isParsingFiles
                                                    }
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )

                const queueImportFooter = (
                    <>
                        <Button
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={isImporting || isParsingFiles}
                        >
                            Close
                        </Button>
                        <Button onClick={handleImport} disabled={!canImport}>
                            {isImporting
                                ? "Importing..."
                                : `Import selected (${itemsReadyForImport.length})`}
                        </Button>
                    </>
                )

                const importBody = jobId ? (
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-0">
                        <div className="space-y-5 pb-4">
                            {currentJob ? (
                                <>
                                    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-medium text-sm">
                                                        Background import
                                                    </h3>
                                                    <Badge
                                                        variant="secondary"
                                                        className={cn(
                                                            "text-xs",
                                                            importJobStatusClasses[
                                                                currentJob.status
                                                            ]
                                                        )}
                                                    >
                                                        {importJobStatusLabels[currentJob.status]}
                                                    </Badge>
                                                </div>
                                                <p className="text-muted-foreground text-sm">
                                                    {importJobStatusDescriptions[currentJob.status]}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={handleDeleteCurrentJob}
                                                >
                                                    Remove Job
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={startNewImport}
                                                >
                                                    New Import
                                                </Button>
                                            </div>
                                        </div>

                                        <Progress value={currentJobProgressValue} />

                                        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                                            <div className="rounded-md border bg-background/80 p-3">
                                                <div className="text-muted-foreground text-xs">
                                                    Files prepared
                                                </div>
                                                <div className="mt-1 font-medium">
                                                    {currentJob.preparedSourceFiles}/
                                                    {currentJob.totalSourceFiles}
                                                </div>
                                            </div>
                                            <div className="rounded-md border bg-background/80 p-3">
                                                <div className="text-muted-foreground text-xs">
                                                    Threads processed
                                                </div>
                                                <div className="mt-1 font-medium">
                                                    {currentJob.processedThreads}/
                                                    {currentJob.totalThreads}
                                                </div>
                                            </div>
                                            <div className="rounded-md border bg-background/80 p-3">
                                                <div className="text-muted-foreground text-xs">
                                                    Imported
                                                </div>
                                                <div className="mt-1 font-medium">
                                                    {currentJob.importedThreads}
                                                </div>
                                            </div>
                                            <div className="rounded-md border bg-background/80 p-3">
                                                <div className="text-muted-foreground text-xs">
                                                    Issues
                                                </div>
                                                <div className="mt-1 font-medium">
                                                    {currentJob.errorCount +
                                                        currentJob.warningCount}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                                            <span>
                                                Attachment mode:{" "}
                                                {attachmentModeLabels[currentJob.attachmentMode]}
                                            </span>
                                            {currentJob.completedAt && (
                                                <span>
                                                    Completed{" "}
                                                    {new Date(
                                                        currentJob.completedAt
                                                    ).toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {currentJob.recentWarnings.length > 0 && (
                                        <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                                            <div className="inline-flex items-center gap-2 font-medium text-sm">
                                                <AlertCircle className="h-4 w-4 text-amber-500" />
                                                Recent warnings
                                            </div>
                                            <div className="space-y-1.5">
                                                {currentJob.recentWarnings.map((warning, index) => (
                                                    <p
                                                        key={`${warning}-${index}`}
                                                        className="text-sm"
                                                    >
                                                        {warning}
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {currentJob.recentErrors.length > 0 && (
                                        <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                                            <div className="inline-flex items-center gap-2 font-medium text-sm">
                                                <XCircle className="h-4 w-4 text-destructive" />
                                                Recent errors
                                            </div>
                                            <div className="space-y-1.5">
                                                {currentJob.recentErrors.map((error, index) => (
                                                    <p
                                                        key={`${error}-${index}`}
                                                        className="text-sm"
                                                    >
                                                        {error}
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-3 rounded-lg border p-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="font-medium text-sm">Source files</div>
                                            <div className="text-muted-foreground text-xs">
                                                {currentJob.sources.length} file
                                                {currentJob.sources.length === 1 ? "" : "s"}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            {currentJob.sources.map((source) => (
                                                <div
                                                    key={source._id}
                                                    className="flex items-start justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium text-sm">
                                                            {source.fileName}
                                                        </p>
                                                        <p className="text-muted-foreground text-xs">
                                                            {source.preparedDocumentCount ?? 0}{" "}
                                                            prepared conversation
                                                            {source.preparedDocumentCount === 1
                                                                ? ""
                                                                : "s"}
                                                        </p>
                                                        {source.error && (
                                                            <p className="mt-1 text-destructive text-xs">
                                                                {source.error}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <Badge
                                                        variant="secondary"
                                                        className={cn(
                                                            "text-xs",
                                                            source.status === "error"
                                                                ? "bg-destructive/10 text-destructive"
                                                                : source.status === "prepared"
                                                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                                  : "bg-muted text-muted-foreground"
                                                        )}
                                                    >
                                                        {source.status}
                                                    </Badge>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex min-h-[16.25rem] items-center justify-center text-muted-foreground">
                                    <div className="inline-flex items-center gap-2 text-sm">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading import job...
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    queueImportBody
                )

                const importFooter = jobId ? (
                    <>
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Close
                        </Button>
                        <Button variant="ghost" onClick={handleDeleteCurrentJob}>
                            Remove Job
                        </Button>
                        <Button variant="secondary" onClick={startNewImport}>
                            Start Another Import
                        </Button>
                    </>
                ) : (
                    queueImportFooter
                )

                if (isMobile) {
                    return (
                        <Drawer open={open} onOpenChange={handleOpenChange}>
                            <DrawerContent
                                className="z-[70] flex max-h-[90dvh] flex-col overflow-hidden"
                                overlayClassName="z-[70]"
                                {...dragProps}
                            >
                                <DrawerHeader className="shrink-0">
                                    <DrawerTitle>Import Thread</DrawerTitle>
                                    <DrawerDescription>
                                        Select export files, review, then import.
                                    </DrawerDescription>
                                </DrawerHeader>
                                {importBody}
                                <DrawerFooter className="shrink-0 flex-row justify-end">
                                    {importFooter}
                                </DrawerFooter>
                            </DrawerContent>
                        </Drawer>
                    )
                }

                return (
                    <Dialog open={open} onOpenChange={handleOpenChange}>
                        <DialogContent
                            className="flex max-h-[88vh] max-w-3xl flex-col overflow-hidden"
                            {...dragProps}
                        >
                            <DialogHeader className="shrink-0">
                                <DialogTitle>Import Thread</DialogTitle>
                                <DialogDescription>
                                    Select one or more supported exports, review validation status,
                                    then import selected conversations.
                                </DialogDescription>
                            </DialogHeader>
                            {importBody}
                            <DialogFooter className="shrink-0">{importFooter}</DialogFooter>
                        </DialogContent>
                    </Dialog>
                )
            })()}

            <NewFolderDialog
                open={showNewFolderDialog}
                onOpenChange={setShowNewFolderDialog}
                className="z-[90]"
                onSuccess={(projectId) => {
                    setSelectedProjectId(projectId)
                }}
            />
        </>
    )
}
