import { getMessageRenderFingerprintMap } from "@/lib/message-render-fingerprint"
import type { UIMessage } from "ai"
import { useEffect, useRef, useState } from "react"

type MessageRenderWorkerResponse = {
    requestId: number
    fingerprints: Record<string, string>
}

export function useMessageRenderFingerprints(messages: UIMessage[]) {
    const [fingerprints, setFingerprints] = useState<Record<string, string>>(() =>
        getMessageRenderFingerprintMap(messages)
    )
    const workerRef = useRef<Worker | null>(null)
    const latestRequestIdRef = useRef(0)

    useEffect(() => {
        if (typeof window === "undefined" || typeof Worker === "undefined") {
            setFingerprints(getMessageRenderFingerprintMap(messages))
            return
        }

        if (!workerRef.current) {
            workerRef.current = new Worker(
                new URL("../workers/message-render.worker.ts", import.meta.url),
                { type: "module" }
            )
        }

        const worker = workerRef.current
        const requestId = latestRequestIdRef.current + 1
        latestRequestIdRef.current = requestId

        const handleMessage = (event: MessageEvent<MessageRenderWorkerResponse>) => {
            if (event.data.requestId !== latestRequestIdRef.current) {
                return
            }

            setFingerprints(event.data.fingerprints)
        }

        worker.addEventListener("message", handleMessage)
        worker.postMessage({ requestId, messages })

        return () => {
            worker.removeEventListener("message", handleMessage)
        }
    }, [messages])

    useEffect(
        () => () => {
            workerRef.current?.terminate()
            workerRef.current = null
        },
        []
    )

    return fingerprints
}
