// Signed with the existing ingest-worker convention. Contains no provider credentials.
export type SpeechTicket = {
    purpose: "message-speech"
    userId: string
    threadId: string
    messageId: string
    leaseId: string
    acquiredAt: number
    storageKey: string
    origin: string
    callbackUrl: string
}

export function parseSpeechTicket(value: unknown): SpeechTicket | null {
    if (!value || typeof value !== "object") return null
    const item = value as Record<string, unknown>
    if (item.purpose !== "message-speech" || typeof item.acquiredAt !== "number") return null
    for (const name of [
        "userId",
        "threadId",
        "messageId",
        "leaseId",
        "storageKey",
        "origin",
        "callbackUrl"
    ]) {
        if (typeof item[name] !== "string" || !item[name]) return null
    }
    if (
        !(item.storageKey as string).startsWith(`tts/${item.userId}/`) ||
        !(item.storageKey as string).endsWith("-speech.wav")
    )
        return null
    try {
        if (new URL(item.callbackUrl as string).protocol !== "https:") return null
        if (new URL(item.origin as string).origin !== item.origin) return null
    } catch {
        return null
    }
    return item as SpeechTicket
}

export async function readSpeechRequest(request: Request, limit = 16384): Promise<string> {
    const reader = request.body?.getReader()
    if (!reader) throw new Error("Missing request body")
    const decoder = new TextDecoder()
    let bytes = 0
    let text = ""
    try {
        while (true) {
            const next = await reader.read()
            if (next.done) break
            bytes += next.value.length
            if (bytes > limit) throw new Error("Request too large")
            text += decoder.decode(next.value, { stream: true })
        }
        return text + decoder.decode()
    } finally {
        await reader.cancel().catch(() => {})
    }
}
