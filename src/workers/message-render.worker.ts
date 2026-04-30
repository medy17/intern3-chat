import type { UIMessage } from "ai"
import { getMessageRenderFingerprintMap } from "../lib/message-render-fingerprint"

type MessageRenderWorkerRequest = {
    requestId: number
    messages: UIMessage[]
}

type MessageRenderWorkerResponse = {
    requestId: number
    fingerprints: Record<string, string>
}

self.onmessage = (event: MessageEvent<MessageRenderWorkerRequest>) => {
    const response: MessageRenderWorkerResponse = {
        requestId: event.data.requestId,
        fingerprints: getMessageRenderFingerprintMap(event.data.messages)
    }

    self.postMessage(response)
}
