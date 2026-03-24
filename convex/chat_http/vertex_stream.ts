import type { TextStreamPart } from "ai"
import { getGoogleAccessToken } from "../lib/google_auth"
import { getGoogleVertexConfig } from "../lib/google_provider"

const b64Lookup = new Uint8Array(256).fill(255)
const b64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
for (let i = 0; i < b64Chars.length; i++) {
    b64Lookup[b64Chars.charCodeAt(i)] = i
}

function base64ToUint8Array(base64: string): Uint8Array {
    let bufferLength = base64.length * 0.75
    if (base64[base64.length - 1] === "=") bufferLength--
    if (base64[base64.length - 2] === "=") bufferLength--

    const bytes = new Uint8Array(bufferLength)
    let p = 0
    for (let i = 0; i < base64.length; i += 4) {
        const encoded1 = b64Lookup[base64.charCodeAt(i)]
        const encoded2 = b64Lookup[base64.charCodeAt(i + 1)]
        const encoded3 = b64Lookup[base64.charCodeAt(i + 2)]
        const encoded4 = b64Lookup[base64.charCodeAt(i + 3)]

        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4)
        if (encoded3 !== 255) bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2)
        if (encoded4 !== 255) bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63)
    }
    return bytes
}

class StreamingBase64Decoder {
    chunks: Uint8Array[] = []
    currentStr = ""
    totalLength = 0

    add(chunk: string) {
        this.currentStr += chunk
        const processableLen = Math.floor(this.currentStr.length / 4) * 4
        if (processableLen > 0) {
            const processStr = this.currentStr.substring(0, processableLen)
            this.currentStr = this.currentStr.substring(processableLen)
            const decoded = base64ToUint8Array(processStr)
            this.chunks.push(decoded)
            this.totalLength += decoded.length
        }
    }

    finalize(): Uint8Array {
        if (this.currentStr.length > 0) {
            const decoded = base64ToUint8Array(this.currentStr)
            this.chunks.push(decoded)
            this.totalLength += decoded.length
        }
        const finalArray = new Uint8Array(this.totalLength)
        let offset = 0
        for (const chunk of this.chunks) {
            finalArray.set(chunk, offset)
            offset += chunk.length
        }
        return finalArray
    }
}

function uint8ArrayToBase64(bytes: Uint8Array | ArrayBuffer): string {
    const uint8 = new Uint8Array(bytes)
    let binary = ""
    for (let i = 0; i < uint8.byteLength; i++) {
        binary += String.fromCharCode(uint8[i])
    }
    return btoa(binary)
}

function parseSSEChunks(chunk: string): string[] {
    return chunk
        .split("\n\n")
        .map((c) => c.replace(/^data:\s*/, "").trim())
        .filter((c) => c)
}

export async function fetchVertexStreamGenerateContent(
    // biome-ignore lint/suspicious/noExplicitAny: MappedMessages can be any AI SDK type
    mappedMessages: any[],
    modelId: string,
    aspectRatio?: string,
    imageResolution?: string,
    reasoningEffort?: string
    // biome-ignore lint/suspicious/noExplicitAny: ToolSet constraint requires any here
): Promise<ReadableStream<TextStreamPart<any>>> {
    const vertexConfig = getGoogleVertexConfig("internal")
    const token = await getGoogleAccessToken(
        vertexConfig.credentials.client_email,
        vertexConfig.credentials.private_key
    )

    const location = /^gemini-3(\.|-)/.test(modelId) ? "global" : vertexConfig.location
    const baseUrl =
        location === "global"
            ? "https://aiplatform.googleapis.com"
            : `https://${location}-aiplatform.googleapis.com`

    const url = `${baseUrl}/v1/projects/${vertexConfig.project}/locations/${location}/publishers/google/models/${modelId}:streamGenerateContent?alt=sse`

    const contents = await Promise.all(
        mappedMessages.map(async (m) => {
            // biome-ignore lint/suspicious/noExplicitAny: Vertex payload part
            const parts: any[] = []
            if (typeof m.content === "string") {
                parts.push({ text: m.content })
            } else if (Array.isArray(m.content)) {
                for (const c of m.content) {
                    if (c.type === "text") {
                        parts.push({ text: c.text })
                    } else if (c.type === "image") {
                        let imageData: string
                        let mimeType = c.mimeType || "image/png"
                        if (typeof c.image === "string" && c.image.startsWith("http")) {
                            // Image is a URL — fetch it and convert to base64
                            const imgResponse = await fetch(c.image)
                            if (!imgResponse.ok) {
                                console.error(
                                    `[cvx][chat][vertex_stream] Failed to fetch image URL: ${imgResponse.status}`
                                )
                                parts.push({ text: "[Image could not be loaded]" })
                                continue
                            }
                            const contentType = imgResponse.headers.get("content-type")
                            if (contentType) mimeType = contentType
                            const arrayBuffer = await imgResponse.arrayBuffer()
                            imageData = uint8ArrayToBase64(new Uint8Array(arrayBuffer))
                        } else if (typeof c.image === "string") {
                            imageData = c.image
                        } else {
                            imageData = uint8ArrayToBase64(c.image)
                        }
                        parts.push({
                            inlineData: {
                                mimeType,
                                data: imageData
                            }
                        })
                    }
                }
            }
            return {
                role: m.role === "assistant" ? "model" : "user",
                parts
            }
        })
    )

    // biome-ignore lint/suspicious/noExplicitAny: Vertex generation config is highly flexible
    const body: any = {
        contents,
        generationConfig: {
            responseModalities: ["IMAGE", "TEXT"]
        }
    }

    if (reasoningEffort && reasoningEffort !== "off") {
        body.generationConfig.thinkingConfig = {
            thinkingLevel: reasoningEffort.toUpperCase()
        }
    }

    if (aspectRatio || imageResolution) {
        body.generationConfig.imageConfig = {
            aspectRatio: aspectRatio === "1:1" ? "1:1" : aspectRatio || "auto",
            imageSize: imageResolution || "1K",
            imageOutputOptions: {
                mimeType: "image/png"
            },
            personGeneration: "ALLOW_ALL"
        }
    }

    console.log(
        "[cvx][chat][vertex_stream] Sending Vertex request with generationConfig:",
        JSON.stringify(body.generationConfig, null, 2)
    )

    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    })

    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Vertex API error: ${res.status} ${errorText}`)
    }

    if (!res.body) throw new Error("No response body from Vertex API")

    return new ReadableStream({
        async start(controller) {
            const reader = res.body!.getReader()
            const decoder = new TextDecoder("utf-8")
            let buffer = ""

            const chunkId = `msg_${Date.now()}`
            controller.enqueue({ type: "text-start", id: chunkId })

            let outputTokens = 0
            let hasStartedReasoning = false
            let isImageStreaming = false
            let streamingDecoder: StreamingBase64Decoder | null = null
            let activeImageMimeType = "image/png"

            try {
                while (true) {
                    const { done, value } = await reader.read()

                    let chunkStr = ""
                    if (value) {
                        chunkStr = decoder.decode(value, { stream: true })
                    }
                    if (done) {
                        chunkStr += decoder.decode()
                    }

                    if (isImageStreaming) {
                        const endQuoteIdx = chunkStr.indexOf('"')
                        if (endQuoteIdx !== -1) {
                            streamingDecoder!.add(chunkStr.substring(0, endQuoteIdx))
                            isImageStreaming = false

                            console.log(
                                "[cvx][chat][vertex_stream] Interception complete! Pushing parsed buffer..."
                            )
                            const finalArray = streamingDecoder!.finalize()
                            controller.enqueue({
                                type: "file",
                                file: {
                                    mediaType: activeImageMimeType,
                                    base64: "", // Omitted to stay under 64MB isolate limit
                                    uint8Array: finalArray
                                }
                            })
                            buffer += chunkStr.substring(endQuoteIdx) // CRITICAL: += instead of =
                        } else {
                            streamingDecoder!.add(chunkStr)
                            continue // Skip SSE processing while intercepting base64!
                        }
                    } else {
                        buffer += chunkStr
                        const dataMarker = '"data": "'
                        const dataIdx = buffer.indexOf(dataMarker)
                        if (dataIdx !== -1) {
                            console.log(
                                "[cvx][chat][vertex_stream] Beginning aggressive memory interception of JSON image block..."
                            )
                            isImageStreaming = true

                            const mimeMarker = '"mimeType": "'
                            const mimeIdx = buffer.lastIndexOf(mimeMarker, dataIdx)
                            if (mimeIdx !== -1) {
                                const endMimeIdx = buffer.indexOf('"', mimeIdx + mimeMarker.length)
                                if (endMimeIdx !== -1 && endMimeIdx < dataIdx) {
                                    activeImageMimeType = buffer.substring(
                                        mimeIdx + mimeMarker.length,
                                        endMimeIdx
                                    )
                                }
                            }

                            const base64StartStr = buffer.substring(dataIdx + dataMarker.length)
                            // Retain the 'data' JSON property key instead of dropping it
                            // CRITICAL: We omit the space after the colon ("data":") so the next iter's
                            // dataIdx = buffer.indexOf('"data": "') doesn't find this key again!
                            buffer = `${buffer.substring(0, dataIdx)}"data":"`

                            streamingDecoder = new StreamingBase64Decoder()

                            const endQuoteIdx = base64StartStr.indexOf('"')
                            if (endQuoteIdx !== -1) {
                                streamingDecoder.add(base64StartStr.substring(0, endQuoteIdx))
                                isImageStreaming = false
                                const finalArray = streamingDecoder.finalize()
                                controller.enqueue({
                                    type: "file",
                                    file: {
                                        mediaType: activeImageMimeType,
                                        base64: "", // Omitted to stay under memory ceilings
                                        uint8Array: finalArray
                                    }
                                })
                                buffer += base64StartStr.substring(endQuoteIdx)
                            } else {
                                streamingDecoder.add(base64StartStr)
                                continue // Await next TCP chunks to complete the string!
                            }
                        }
                    }

                    const sseParts = buffer.split(/\r?\n\r?\n/)

                    if (!done && !isImageStreaming) {
                        buffer = sseParts.pop() || ""
                    } else {
                        buffer = "" // process all parts
                    }

                    for (const sse of sseParts) {
                        const braceIndex = sse.indexOf("{")
                        if (braceIndex === -1) continue
                        const dataStr = sse.substring(braceIndex)

                        console.log(
                            `[cvx][chat][vertex_stream] Parsing SSE block: ${dataStr.substring(0, 150)}...`
                        )
                        try {
                            const data = JSON.parse(dataStr)

                            if (data.usageMetadata?.candidatesTokenCount) {
                                outputTokens += data.usageMetadata.candidatesTokenCount
                            }

                            if (!data.candidates) continue

                            for (const candidate of data.candidates) {
                                const parts = candidate.content?.parts || []
                                for (const part of parts) {
                                    if (part.text && part.thought) {
                                        if (!hasStartedReasoning) {
                                            controller.enqueue({
                                                type: "reasoning-start",
                                                id: chunkId
                                            })
                                            hasStartedReasoning = true
                                        }
                                        controller.enqueue({
                                            type: "reasoning-delta",
                                            id: chunkId,
                                            text: part.text
                                        })
                                    } else if (part.text) {
                                        if (hasStartedReasoning) {
                                            controller.enqueue({
                                                type: "reasoning-end",
                                                id: chunkId
                                            })
                                            hasStartedReasoning = false
                                        }
                                        controller.enqueue({
                                            type: "text-delta",
                                            id: chunkId,
                                            text: part.text
                                        })
                                    }
                                    if (part.inlineData) {
                                        // Empty data! It was intercepted by StreamingBase64Decoder!
                                        // Do nothing here since the controller.enqueue already fired in the interceptor!
                                    }
                                }
                            }
                        } catch (e) {
                            console.error(
                                `[cvx][chat][vertex_stream] Error parsing SSE JSON: ${e} for dataStr: ${dataStr.substring(0, 200)}`
                            )
                        }
                    }

                    if (done) break
                }
            } finally {
                if (hasStartedReasoning) {
                    controller.enqueue({ type: "reasoning-end", id: chunkId })
                }
                controller.enqueue({ type: "text-end", id: chunkId })
                controller.enqueue({
                    type: "finish-step",
                    finishReason: "stop",
                    usage: {
                        promptTokens: 0,
                        completionTokens: outputTokens,
                        totalTokens: outputTokens,
                        outputTokenDetails: { reasoningTokens: 0 }
                    },
                    // biome-ignore lint/suspicious/noExplicitAny: Native AI SDK mock
                    response: {} as any,
                    rawFinishReason: "stop",
                    providerMetadata: {}
                    // biome-ignore lint/suspicious/noExplicitAny: Native AI SDK mock
                } as any)
                controller.close()
            }
        }
    })
}
