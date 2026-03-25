"use node"

import { MAX_ATTACHMENTS_PER_THREAD } from "@/lib/file_constants"
import { getFileTypeInfo } from "@/lib/file_constants"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalAction } from "./_generated/server"
import { r2 } from "./attachments"
import {
    type ParsedThreadImportDocument,
    buildThreadImportDocumentKey,
    mergeChatGPTExporterCompanionMarkdown,
    parseThreadImportContents
} from "./lib/thread_import_core"

type AttachmentMode = "mirror" | "external" | "skip"

const inferAttachmentMimeType = (filename: string) => {
    const fileTypeInfo = getFileTypeInfo(filename)

    if (fileTypeInfo.isPdf) {
        return "application/pdf"
    }

    if (fileTypeInfo.isImage) {
        switch (fileTypeInfo.extension) {
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

const truncateImportMessage = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 220)

const fetchTextFromStoredImportSource = async (storageKey: string) => {
    const signedUrl = await r2.getUrl(storageKey)
    const response = await fetch(signedUrl)
    if (!response.ok) {
        throw new Error(`Failed to load import source (${response.status})`)
    }

    return await response.text()
}

const mergePreparedEntries = <
    T extends {
        parsed: ParsedThreadImportDocument
    }
>(
    items: T[]
) => {
    const jsonByConversationId = new Map<string, T[]>()
    const markdownByConversationId = new Map<string, T[]>()

    for (const item of items) {
        if (item.parsed.source.service !== "chatgptexporter") continue

        const conversationId = item.parsed.source.conversationId
        if (!conversationId) continue

        if (item.parsed.source.format === "json") {
            const existing = jsonByConversationId.get(conversationId) ?? []
            existing.push(item)
            jsonByConversationId.set(conversationId, existing)
        } else if (item.parsed.source.format === "markdown") {
            const existing = markdownByConversationId.get(conversationId) ?? []
            existing.push(item)
            markdownByConversationId.set(conversationId, existing)
        }
    }

    const updates = new Map<T, T>()
    const removed = new Set<T>()

    for (const [conversationId, jsonItems] of jsonByConversationId.entries()) {
        const markdownItems = markdownByConversationId.get(conversationId)
        if (!markdownItems?.length) continue

        const pairCount = Math.min(jsonItems.length, markdownItems.length)
        for (let index = 0; index < pairCount; index += 1) {
            const jsonItem = jsonItems[index]
            const markdownItem = markdownItems[index]
            const mergeResult = mergeChatGPTExporterCompanionMarkdown({
                jsonDocument: jsonItem.parsed,
                markdownDocument: markdownItem.parsed
            })

            if (!mergeResult.merged) {
                continue
            }

            removed.add(markdownItem)
            updates.set(jsonItem, {
                ...jsonItem,
                parsed: mergeResult.mergedDocument
            })
        }
    }

    return items.filter((item) => !removed.has(item)).map((item) => updates.get(item) ?? item)
}

const buildImportWarning = ({
    attachmentMode,
    failedAttachmentCount,
    overAttachmentLimit
}: {
    attachmentMode: AttachmentMode
    failedAttachmentCount: number
    overAttachmentLimit: boolean
}) => {
    const warnings: string[] = []

    if (attachmentMode === "mirror" && overAttachmentLimit) {
        warnings.push(`Mirrored only the first ${MAX_ATTACHMENTS_PER_THREAD} attachments`)
    }

    if (failedAttachmentCount > 0) {
        warnings.push(
            `Skipped ${failedAttachmentCount} attachment${failedAttachmentCount === 1 ? "" : "s"}`
        )
    }

    return warnings.length > 0 ? warnings.join(". ") : undefined
}

export const prepareImportJob = internalAction({
    args: { jobId: v.id("importJobs") },
    handler: async (ctx, { jobId }) => {
        await ctx.runMutation(internal.import_jobs.markImportJobPreparing, { jobId })

        const job = await ctx.runQuery(internal.import_jobs.getImportJobInternal, {
            jobId
        })
        if (!job) {
            return
        }

        const sources = await ctx.runQuery(internal.import_jobs.getImportJobSourcesInternal, {
            jobId
        })

        type PreparedEntry = {
            sourceId: Id<"importJobSources">
            fileName: string
            documentKey: string
            parsed: ParsedThreadImportDocument
        }

        const preparedEntries: PreparedEntry[] = []

        try {
            for (const source of sources) {
                try {
                    const content = await fetchTextFromStoredImportSource(source.storageKey)
                    const parsedDocuments = parseThreadImportContents({
                        content,
                        fileName: source.fileName,
                        mimeType: source.mimeType
                    }).filter((document) => document.messages.length > 0)

                    parsedDocuments.forEach((document, index) => {
                        preparedEntries.push({
                            sourceId: source._id,
                            fileName: source.fileName,
                            documentKey: buildThreadImportDocumentKey(document, index),
                            parsed: document
                        })
                    })

                    await ctx.runMutation(internal.import_jobs.markImportJobSourcePrepared, {
                        sourceId: source._id,
                        preparedDocumentCount: parsedDocuments.length
                    })
                } catch (error) {
                    await ctx.runMutation(internal.import_jobs.markImportJobSourceError, {
                        sourceId: source._id,
                        error:
                            error instanceof Error
                                ? error.message
                                : `Failed to parse ${source.fileName}`
                    })
                }
            }

            const selectedDocumentKeysBySource = new Map<string, Set<string>>(
                sources.map((source) => [source._id, new Set(source.selectedDocumentKeys)])
            )

            const mergedEntries = mergePreparedEntries(preparedEntries)
            const threadsToSave = mergedEntries
                .filter((entry) =>
                    selectedDocumentKeysBySource.get(entry.sourceId)?.has(entry.documentKey)
                )
                .map((entry) => ({
                    sourceId: entry.sourceId,
                    documentKey: entry.documentKey,
                    fileName: entry.fileName,
                    title: entry.parsed.title,
                    messages: entry.parsed.messages.map((message) => ({
                        role: message.role,
                        text: message.text,
                        attachments: message.attachments.map((attachment) => ({
                            type: attachment.type,
                            url: attachment.url,
                            filename: attachment.filename
                        })),
                        metadata: message.metadata
                    })),
                    parseWarnings: entry.parsed.parseWarnings,
                    sourceMetadata: {
                        service: entry.parsed.source.service,
                        format: entry.parsed.source.format,
                        conversationId: entry.parsed.source.conversationId,
                        createdAt: entry.parsed.source.createdAt,
                        updatedAt: entry.parsed.source.updatedAt
                    }
                }))

            const result = await ctx.runMutation(
                internal.import_jobs.savePreparedImportJobThreads,
                {
                    jobId,
                    threads: threadsToSave
                }
            )

            if (result?.totalThreads && result.totalThreads > 0) {
                const processImportJobThreadRef =
                    // biome-ignore lint/complexity/useLiteralKeys: generated internal types do not surface this node module reliably.
                    internal["import_jobs_node"].processImportJobThread
                await ctx.scheduler.runAfter(0, processImportJobThreadRef, {
                    jobId
                })
            }
        } catch (error) {
            await ctx.runMutation(internal.import_jobs.failImportJob, {
                jobId,
                error: error instanceof Error ? error.message : "Failed to prepare import job"
            })
        }
    }
})

export const processImportJobThread = internalAction({
    args: { jobId: v.id("importJobs") },
    handler: async (ctx, { jobId }) => {
        const job = await ctx.runQuery(internal.import_jobs.getImportJobInternal, {
            jobId
        })
        if (!job || job.status !== "importing") {
            return
        }

        const importJobThread = await ctx.runMutation(
            internal.import_jobs.claimNextImportJobThread,
            {
                jobId
            }
        )
        if (!importJobThread) {
            return
        }

        try {
            let failedAttachmentCount = 0
            let importedAttachmentCount = 0
            let remainingAttachmentSlots =
                job.attachmentMode === "mirror"
                    ? MAX_ATTACHMENTS_PER_THREAD
                    : Number.POSITIVE_INFINITY
            const mirrorRemoteAttachment =
                job.attachmentMode === "mirror"
                    ? (await import("./import_jobs_mirror_node")).mirrorRemoteAttachment
                    : null
            const preparedMessages: Array<{
                role: "user" | "assistant" | "system"
                parts: Array<
                    | { type: "text"; text: string }
                    | { type: "file"; data: string; filename?: string; mimeType?: string }
                >
                metadata?: { modelName?: string }
            }> = []
            const totalAttachmentReferences = importJobThread.messages.reduce(
                (sum, message) => sum + message.attachments.length,
                0
            )
            const overAttachmentLimit =
                job.attachmentMode === "mirror" &&
                totalAttachmentReferences > MAX_ATTACHMENTS_PER_THREAD

            for (const message of importJobThread.messages) {
                const parts: Array<
                    | { type: "text"; text: string }
                    | { type: "file"; data: string; filename?: string; mimeType?: string }
                > = []
                const text = message.text.trim()

                if (text) {
                    parts.push({
                        type: "text",
                        text
                    })
                }

                if (job.attachmentMode === "mirror") {
                    const attachmentsToMirror = message.attachments.slice(
                        0,
                        remainingAttachmentSlots
                    )
                    failedAttachmentCount += Math.max(
                        0,
                        message.attachments.length - attachmentsToMirror.length
                    )

                    for (const attachment of attachmentsToMirror) {
                        try {
                            const mirrored = await mirrorRemoteAttachment!({
                                ctx,
                                authorId: job.authorId,
                                url: attachment.url,
                                filename: attachment.filename
                            })

                            parts.push({
                                type: "file",
                                data: mirrored.key,
                                filename: mirrored.fileName,
                                mimeType: mirrored.fileType
                            })
                            importedAttachmentCount += 1
                            remainingAttachmentSlots -= 1
                        } catch {
                            failedAttachmentCount += 1
                        }
                    }
                } else if (job.attachmentMode === "external") {
                    for (const attachment of message.attachments) {
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
                        role: message.role,
                        parts,
                        metadata: message.metadata
                    })
                }
            }

            if (preparedMessages.length === 0) {
                throw new Error("No messages left after validation and attachment processing")
            }

            const result = await ctx.runMutation(internal.threads.importPreparedThread, {
                authorId: job.authorId,
                title: importJobThread.title,
                messages: preparedMessages,
                projectId: job.projectId,
                sourceCreatedAt: importJobThread.sourceMetadata.createdAt,
                sourceUpdatedAt: importJobThread.sourceMetadata.updatedAt
            })

            if (!result || "error" in result) {
                throw new Error(
                    result && "error" in result && typeof result.error === "string"
                        ? result.error
                        : "Import failed"
                )
            }

            await ctx.runMutation(internal.import_jobs.completeImportJobThread, {
                importJobThreadId: importJobThread._id,
                importedThreadId: result.threadId,
                warning: buildImportWarning({
                    attachmentMode: job.attachmentMode,
                    failedAttachmentCount,
                    overAttachmentLimit
                })
            })
        } catch (error) {
            await ctx.runMutation(internal.import_jobs.failImportJobThread, {
                importJobThreadId: importJobThread._id,
                error:
                    error instanceof Error ? truncateImportMessage(error.message) : "Import failed",
                warning: buildImportWarning({
                    attachmentMode: job.attachmentMode,
                    failedAttachmentCount: 0,
                    overAttachmentLimit: false
                })
            })
        }

        // biome-ignore lint/complexity/useLiteralKeys: generated internal types do not surface this node module reliably.
        await ctx.scheduler.runAfter(0, internal["import_jobs_node"].processImportJobThread, {
            jobId
        })
    }
})
