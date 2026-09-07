"use node"

import { createHash, randomBytes } from "node:crypto"
import type { BetterAuthOptions } from "better-auth"
import { v } from "convex/values"
import {
    type AccountExportFile,
    type AccountExportProfile,
    type AccountExportStoredFile,
    buildEncryptedAccountExportArchive
} from "../src/lib/account-export"
import { buildThreadExportFileName, serializeThreadToMarkdown } from "../src/lib/thread-export"
import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import { type ActionCtx, action, internalAction } from "./_generated/server"
import {
    ACCOUNT_EXPORT_EMAIL_MAX_RETRIES,
    type AccountExportReservation,
    getAccountExportConfiguration,
    getAccountExportEmailRetryDelayMs
} from "./account_exports"
import { r2 } from "./attachments"
import { authComponent } from "./auth"
import { decryptKey, encryptKey } from "./lib/encryption"
import { getUserVisibleFilePrefixes } from "./lib/file_listing"
import { getUserIdentity } from "./lib/identity"
import { listAllSupermemoryMemories } from "./lib/supermemory_api"

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
const TURNSTILE_ACTION = "account_export"
const TURNSTILE_ALWAYS_PASS_TEST_SITE_KEY = "1x00000000000000000000AA"
const TURNSTILE_ALWAYS_PASS_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA"
const MAX_ENCRYPTED_EXPORT_BYTES = 100 * 1024 * 1024

type TurnstileVerification = {
    success?: boolean
    action?: string
}

type AccountExportRequestResult =
    | Exclude<AccountExportReservation, { accepted: true }>
    | (Extract<AccountExportReservation, { accepted: true }> & { password: string })

const generateExportPassword = () => {
    const bytes = randomBytes(32)
    return {
        password: bytes.toString("base64url"),
        keyHash: createHash("sha256").update(bytes).digest("hex")
    }
}

const getConvexSiteUrl = () => {
    const value =
        process.env.CONVEX_SITE_URL?.trim() ||
        process.env.VITE_CONVEX_SITE_URL?.trim() ||
        process.env.VITE_CONVEX_API_URL?.trim()
    if (!value) throw new Error("CONVEX_SITE_URL is not configured")
    return value.replace(/\/$/, "")
}

const getPublicAssetBaseUrl = () => {
    const value = process.env.R2_PUBLIC_BASE_URL?.trim()
    if (!value) throw new Error("R2_PUBLIC_BASE_URL is not configured")
    return value.replace(/\/$/, "")
}

const toPublicAssetUrl = (baseUrl: string, key: string) =>
    `${baseUrl}/${key
        .replace(/^\/+/, "")
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/")}`

const loadAccountProfile = async (
    ctx: ActionCtx,
    authId: string,
    fallback: { id: string; email: string }
): Promise<AccountExportProfile> => {
    const adapter = authComponent.adapter(
        ctx as unknown as Parameters<typeof authComponent.adapter>[0]
    )({} as BetterAuthOptions)
    const authUser = (await adapter.findOne({
        model: "user",
        where: [{ field: "id", value: authId }]
    })) as Record<string, unknown> | null

    return {
        id: fallback.id,
        name: typeof authUser?.name === "string" ? authUser.name : undefined,
        email: typeof authUser?.email === "string" ? authUser.email : fallback.email,
        emailVerified:
            typeof authUser?.emailVerified === "boolean" ? authUser.emailVerified : undefined,
        createdAt:
            authUser?.createdAt instanceof Date ||
            typeof authUser?.createdAt === "string" ||
            typeof authUser?.createdAt === "number"
                ? authUser.createdAt
                : undefined
    }
}

const loadStoredFiles = async (
    ctx: ActionCtx,
    userId: string,
    publicAssetBaseUrl: string
): Promise<AccountExportStoredFile[]> => {
    const files: AccountExportStoredFile[] = []

    for (const keyPrefix of getUserVisibleFilePrefixes(userId)) {
        for await (const page of iterateMetadataPages(
            (cursor) => r2.listMetadata(ctx, userId, 200, cursor, keyPrefix),
            () => {
                throw new Error(`Repeated R2 pagination cursor for ${keyPrefix}`)
            }
        )) {
            files.push(
                ...page.map((file) => ({
                    key: file.key,
                    url: toPublicAssetUrl(publicAssetBaseUrl, file.key),
                    contentType: file.contentType,
                    size: file.size,
                    lastModified: file.lastModified
                }))
            )
        }
    }

    return files
}

const loadThreads = async (ctx: ActionCtx, userId: string): Promise<Doc<"threads">[]> => {
    const threads: Doc<"threads">[] = []
    let cursor: string | null = null

    do {
        const result: {
            page: Doc<"threads">[]
            isDone: boolean
            continueCursor: string
        } = await ctx.runQuery(internal.account_exports.listAccountExportThreads, {
            userId,
            paginationOpts: { numItems: 50, cursor }
        })
        threads.push(...result.page)
        cursor = result.isDone ? null : result.continueCursor
    } while (cursor)

    return threads
}

export const requestAccountExport = action({
    args: {
        turnstileToken: v.string(),
        consentSensitiveDataLinksAccepted: v.boolean(),
        consentOneTimePasswordAccepted: v.boolean()
    },
    handler: async (ctx, args): Promise<AccountExportRequestResult> => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new Error(String(user.error || "Unauthorized"))
        if (!getAccountExportConfiguration().configured) {
            throw new Error("Account exports are not configured")
        }
        if (!args.consentSensitiveDataLinksAccepted || !args.consentOneTimePasswordAccepted) {
            throw new Error("Both export acknowledgements are required")
        }
        if (!args.turnstileToken || args.turnstileToken.length > 2048) {
            throw new Error("Complete the security check and try again")
        }

        const verificationResponse = await fetch(TURNSTILE_VERIFY_URL, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                secret: process.env.TURNSTILE_SECRET_KEY || "",
                response: args.turnstileToken
            })
        })
        const verification = (await verificationResponse.json()) as TurnstileVerification
        const usesOfficialAlwaysPassTestKeys =
            process.env.TURNSTILE_SITE_KEY === TURNSTILE_ALWAYS_PASS_TEST_SITE_KEY &&
            process.env.TURNSTILE_SECRET_KEY === TURNSTILE_ALWAYS_PASS_TEST_SECRET_KEY
        const actionMatches = usesOfficialAlwaysPassTestKeys
            ? true
            : verification.action === TURNSTILE_ACTION
        if (!verificationResponse.ok || verification.success !== true || !actionMatches) {
            throw new Error("Security check failed. Please complete it again.")
        }

        const { password, keyHash } = generateExportPassword()
        const encryptedPassword = await encryptKey(password)
        const reservation: AccountExportReservation = await ctx.runMutation(
            internal.account_exports.reserveAccountExport,
            {
                userId: user.id,
                authId: user.authId,
                email: typeof user.email === "string" ? user.email : "",
                keyHash,
                encryptedPassword,
                consentSensitiveDataLinksAccepted: args.consentSensitiveDataLinksAccepted,
                consentOneTimePasswordAccepted: args.consentOneTimePasswordAccepted
            }
        )

        return reservation.accepted ? { ...reservation, password } : reservation
    }
})

export const buildAccountExport = internalAction({
    args: {
        jobId: v.id("accountExportJobs"),
        userId: v.string(),
        authId: v.string(),
        encryptedPassword: v.string()
    },
    handler: async (ctx, args) => {
        let storedKey: string | null = null

        try {
            const password = await decryptKey(args.encryptedPassword)
            const claim = await ctx.runMutation(internal.account_exports.claimAccountExportBuild, {
                jobId: args.jobId,
                userId: args.userId
            })
            if (!claim) return

            const exportedAt = Date.now()
            const convexSiteUrl = getConvexSiteUrl()
            const publicAssetBaseUrl = getPublicAssetBaseUrl()
            const [profile, settings, collections, storedFiles, threads, memories] =
                await Promise.all([
                    loadAccountProfile(ctx, args.authId, {
                        id: args.userId,
                        email: claim.email
                    }),
                    ctx.runQuery(internal.settings.getUserSettingsInternal, {
                        userId: args.userId
                    }),
                    ctx.runQuery(internal.account_exports.getAccountExportCollections, {
                        userId: args.userId
                    }),
                    loadStoredFiles(ctx, args.userId, publicAssetBaseUrl),
                    loadThreads(ctx, args.userId),
                    listAllSupermemoryMemories(args.userId)
                ])

            const threadFiles: AccountExportFile[] = []
            for (const thread of threads) {
                const data = await ctx.runQuery(
                    internal.account_exports.getAccountExportThreadData,
                    {
                        userId: args.userId,
                        threadId: thread._id
                    }
                )
                if (!data) continue

                try {
                    const serialized = serializeThreadToMarkdown({
                        thread: {
                            ...thread,
                            personaSnapshot: data.personaSnapshot ?? undefined
                        } as never,
                        messages: data.messages as never,
                        convexApiUrl: convexSiteUrl,
                        publicAssetBaseUrl,
                        exportedAt
                    })
                    threadFiles.push({ name: serialized.fileName, content: serialized.markdown })
                } catch (error) {
                    if (
                        error instanceof Error &&
                        error.message === "Thread has no exportable content"
                    ) {
                        threadFiles.push({
                            name: buildThreadExportFileName({ thread, exportedAt }),
                            content: `# ${thread.title || "Untitled conversation"}\n\nThis conversation had no exportable messages.\n`
                        })
                        continue
                    }
                    throw error
                }
            }

            const archive = await buildEncryptedAccountExportArchive({
                exportedAt,
                password,
                profile,
                settings,
                personas: collections.personas,
                projects: collections.projects,
                memories,
                storedFiles,
                threadFiles,
                threadCount: threads.length
            })
            const bytes = new Uint8Array(await archive.blob.arrayBuffer())
            if (bytes.byteLength > MAX_ENCRYPTED_EXPORT_BYTES) {
                throw new Error("Encrypted account export exceeds the 100 MB limit")
            }

            storedKey = await r2.store(ctx, bytes, {
                authorId: args.userId,
                key: claim.objectKey,
                type: "application/zip",
                disposition: `attachment; filename="${archive.fileName}"`
            })
            const downloadUrl = toPublicAssetUrl(publicAssetBaseUrl, storedKey)
            const completed = await ctx.runMutation(
                internal.account_exports.completeAccountExportBuild,
                {
                    jobId: args.jobId,
                    userId: args.userId,
                    objectKey: storedKey,
                    downloadUrl,
                    sizeBytes: bytes.byteLength
                }
            )
            if (!completed) {
                await r2.deleteObject(ctx, storedKey)
            }
        } catch (error) {
            if (storedKey) {
                await r2.deleteObject(ctx, storedKey).catch(() => undefined)
            }
            await ctx.runMutation(internal.account_exports.failAccountExport, {
                jobId: args.jobId,
                error: error instanceof Error ? error.message : "Account export failed"
            })
        }
    }
})

export const deliverAccountExportEmail = internalAction({
    args: {
        jobId: v.id("accountExportJobs"),
        attempt: v.optional(v.number())
    },
    handler: async (ctx, { jobId, attempt = 0 }) => {
        const job = await ctx.runMutation(internal.account_exports.getAccountExportForDelivery, {
            jobId
        })
        if (!job) return

        try {
            const { sendAccountExportEmail } = await import("../src/lib/email")
            const acknowledgement = await sendAccountExportEmail({
                email: job.email,
                downloadUrl: job.downloadUrl,
                idempotencyKey: `account-export/${jobId}`
            })
            await ctx.runMutation(internal.account_exports.markAccountExportDelivered, {
                jobId,
                ...(acknowledgement.providerMessageId
                    ? { providerMessageId: acknowledgement.providerMessageId }
                    : {}),
                deliveryAttempts: attempt + 1
            })
        } catch (error) {
            if (attempt < ACCOUNT_EXPORT_EMAIL_MAX_RETRIES) {
                await ctx.scheduler.runAfter(
                    getAccountExportEmailRetryDelayMs(attempt),
                    internal.account_exports_node.deliverAccountExportEmail,
                    { jobId, attempt: attempt + 1 }
                )
                return
            }

            let terminalError = error instanceof Error ? error.message : "Email delivery failed"
            if (job.objectKey) {
                try {
                    await r2.deleteObject(ctx, job.objectKey)
                } catch (cleanupError) {
                    const cleanupMessage =
                        cleanupError instanceof Error
                            ? cleanupError.message
                            : "Stored export cleanup failed"
                    terminalError = `${terminalError}; archive cleanup failed: ${cleanupMessage}`
                }
            }
            await ctx.runMutation(internal.account_exports.failAccountExport, {
                jobId,
                error: terminalError,
                deliveryAttempts: attempt + 1
            })
        }
    }
})
import { iterateMetadataPages } from "./lib/r2_pagination"
