import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { httpAction } from "./_generated/server"
import { r2 } from "./attachments"
import { getAccountDeletionBlockerForAction } from "./lib/account_deletion_gate"
import {
    FAL_R2_INGEST_SIGNATURE_HEADER,
    FAL_R2_INGEST_TIMESTAMP_HEADER,
    signFalR2IngestBody,
    verifyFalR2IngestBody
} from "./lib/fal_r2_ingest"
import { getUserIdentity } from "./lib/identity"
import { MESSAGE_SPEECH } from "./lib/speech_config"
import { parseSpeechTicket, readSpeechRequest, type SpeechTicket } from "./lib/speech_ticket"
import { getOpenRouterAttribution } from "./lib/openrouter_attribution"

const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
const storageKeyFor = async (userId: string, threadId: string, messageId: string, text: string) => {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
            JSON.stringify([userId, threadId, messageId, MESSAGE_SPEECH, text])
        )
    )
    const hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0")
    ).join("")
    return `tts/${userId}/${hash}-speech.wav`
}

// Control plane only: no audio is downloaded, uploaded, or proxied through Convex.
export const speakMessage = httpAction(async (ctx, request) => {
    const user = await getUserIdentity(ctx.auth, { allowAnons: false })
    if ("error" in user) return json({ error: "Unauthorized" }, 401)
    if (await getAccountDeletionBlockerForAction(ctx, user.id))
        return json({ error: "Account deletion is in progress" }, 403)
    let messageId: string
    let threadId: Id<"threads">
    try {
        const body = JSON.parse(await readSpeechRequest(request, 2048))
        if (
            typeof body.messageId !== "string" ||
            body.messageId.length > 200 ||
            typeof body.threadId !== "string"
        )
            throw new Error()
        messageId = body.messageId
        threadId = body.threadId
    } catch {
        return json({ error: "Invalid message" }, 400)
    }
    let text: string | null
    try {
        text = await ctx.runQuery(internal.speech_audio.getSource, {
            userId: user.id,
            threadId,
            messageId
        })
    } catch {
        return json({ error: "Message unavailable" }, 404)
    }
    if (!text) return json({ error: "This message has no text to read aloud" }, 400)
    const storageKey = await storageKeyFor(user.id, threadId, messageId, text)
    try {
        if (await r2.getMetadata(ctx, storageKey))
            return json({ url: await r2.getUrl(storageKey), format: "wav" })
    } catch {
        /* Live generation can still work if metadata lookup is unavailable. */
    }
    const endpoint = process.env.FAL_R2_INGEST_URL?.trim()
    const secret = process.env.FAL_R2_INGEST_SECRET?.trim()
    const origin = request.headers.get("Origin")
    if (!endpoint || !secret || !process.env.OPENROUTER_API_KEY?.trim())
        return json({ error: "Read aloud is not configured" }, 503)
    if (!origin) return json({ error: "Missing request origin" }, 400)
    const lease = await ctx.runMutation(internal.speech_audio.acquire, { userId: user.id })
    if (!lease)
        return json(
            { error: "Another read-aloud request is finishing. Please try again shortly." },
            429
        )
    const ticket: SpeechTicket = {
        purpose: "message-speech",
        userId: user.id,
        threadId,
        messageId,
        ...lease,
        storageKey,
        origin,
        callbackUrl: new URL("/speech/worker", process.env.CONVEX_SITE_URL ?? request.url).href
    }
    const body = JSON.stringify(ticket)
    const signed = await signFalR2IngestBody(body, secret)
    return json({
        url: new URL("/speech", endpoint).href,
        format: "pcm",
        ticket: { body, ...signed }
    })
})

// Worker-only callbacks exchange credentials/text once, then completion metadata.
export const speechWorkerCallback = httpAction(async (ctx, request) => {
    const secret = process.env.FAL_R2_INGEST_SECRET?.trim()
    if (!secret) return json({ error: "Not configured" }, 503)
    let body: string
    try {
        body = await readSpeechRequest(request)
    } catch {
        return json({ error: "Invalid callback" }, 400)
    }
    if (
        !(await verifyFalR2IngestBody({
            body,
            secret,
            timestamp: request.headers.get(FAL_R2_INGEST_TIMESTAMP_HEADER),
            signature: request.headers.get(FAL_R2_INGEST_SIGNATURE_HEADER)
        }))
    )
        return json({ error: "Unauthorized" }, 401)
    let payload: {
        phase: string
        ticket: SpeechTicket
        cached: boolean
        submittedCharacters: number
        submittedUtf8Bytes: number
    }
    try {
        const parsed = JSON.parse(body)
        const ticket = parseSpeechTicket(parsed.ticket)
        if (!ticket || !["start", "complete", "failed"].includes(parsed.phase)) throw new Error()
        if (parsed.cached !== undefined && typeof parsed.cached !== "boolean") throw new Error()
        for (const field of ["submittedCharacters", "submittedUtf8Bytes"] as const) {
            if (
                parsed[field] !== undefined &&
                (!Number.isSafeInteger(parsed[field]) || parsed[field] < 0)
            )
                throw new Error()
        }
        payload = {
            phase: parsed.phase,
            ticket,
            cached: parsed.cached === true,
            submittedCharacters: parsed.submittedCharacters ?? 0,
            submittedUtf8Bytes: parsed.submittedUtf8Bytes ?? 0
        }
    } catch {
        return json({ error: "Invalid callback" }, 400)
    }
    const { ticket, phase } = payload
    const release = (complete = false) =>
        ctx.runMutation(internal.speech_audio.release, {
            userId: ticket.userId,
            acquiredAt: ticket.acquiredAt,
            leaseId: ticket.leaseId as Id<"rateLimit">,
            complete,
            submittedCharacters: payload.submittedCharacters,
            submittedUtf8Bytes: payload.submittedUtf8Bytes
        })
    if (phase === "failed") {
        await release()
        return json({ ok: true })
    }
    if (await getAccountDeletionBlockerForAction(ctx, ticket.userId)) {
        await release()
        return json({ error: "Account unavailable" }, 403)
    }
    if (phase === "complete") {
        try {
            await r2.syncMetadata(ctx, ticket.storageKey, { authorId: ticket.userId })
            if (await getAccountDeletionBlockerForAction(ctx, ticket.userId)) {
                await r2.deleteObject(ctx, ticket.storageKey)
                await release()
                return json({ error: "Account unavailable" }, 403)
            }
            await release(true)
            return json({ ok: true })
        } catch (error) {
            await release()
            throw error
        }
    }
    try {
        const text = await ctx.runQuery(internal.speech_audio.getSource, {
            userId: ticket.userId,
            threadId: ticket.threadId as Id<"threads">,
            messageId: ticket.messageId
        })
        if (
            !text ||
            (await storageKeyFor(ticket.userId, ticket.threadId, ticket.messageId, text)) !==
                ticket.storageKey
        )
            throw new Error("Message changed")
        const apiKey = process.env.OPENROUTER_API_KEY?.trim()
        if (!apiKey) throw new Error("Read aloud is not configured")
        const reservation = await ctx.runMutation(internal.speech_audio.consume, {
            userId: ticket.userId,
            acquiredAt: ticket.acquiredAt,
            leaseId: ticket.leaseId as Id<"rateLimit">,
            threadId: ticket.threadId as Id<"threads">,
            messageId: ticket.messageId,
            text,
            cached: payload.cached
        })
        if (!reservation.allowed) {
            if (reservation.reason === "usage") {
                await release()
                return json(
                    {
                        error: "Included usage limit reached. Cached recordings are still free to play.",
                        kind: "usage_limit_exceeded",
                        ...reservation
                    },
                    429
                )
            }
            return json({ error: "This playback request has expired or was already used" }, 409)
        }
        return json({
            text,
            apiKey,
            config: MESSAGE_SPEECH,
            attribution: getOpenRouterAttribution()
        })
    } catch {
        await release()
        return json({ error: "Message unavailable" }, 409)
    }
})
