import { corsRouter } from "convex-helpers/server/cors"
import { httpRouter } from "convex/server"
import { getFile, uploadFile } from "./attachments"
import { chatGET } from "./chat_http/get.route"
import { chatPOST } from "./chat_http/post.route"
import { transcribeAudio } from "./speech_to_text"

const normalizeOrigin = (value?: string) => {
    if (!value) return undefined
    return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`
}

const http = httpRouter()
const cors = corsRouter(http, {
    allowedOrigins: [
        normalizeOrigin(process.env.VITE_BETTER_AUTH_URL),
        normalizeOrigin(process.env.VERCEL_URL),
        "http://localhost:3000",
        "https://localhost:3000"
    ].filter(Boolean) as string[],
    allowedHeaders: ["Content-Type", "Authorization"],
    allowCredentials: true
})

cors.route({
    path: "/chat",
    method: "POST",
    handler: chatPOST
})

cors.route({
    path: "/chat",
    method: "GET",
    handler: chatGET
})

// File upload route
cors.route({
    path: "/upload",
    method: "POST",
    handler: uploadFile
})

// Speech-to-text route
cors.route({
    path: "/transcribe",
    method: "POST",
    handler: transcribeAudio
})

http.route({
    path: "/r2",
    method: "GET",
    handler: getFile
})

export default http
