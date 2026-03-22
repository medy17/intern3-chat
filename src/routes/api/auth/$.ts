import { db } from "@/database/db"
import { jwkss } from "@/database/schema"
import { auth } from "@/lib/auth"
import { createServerFileRoute } from "@tanstack/react-start/server"

const isRecoverableJwkError = (error: unknown) =>
    error instanceof Error && error.message.includes("Failed to decrypt private private key")

const shouldRetryAfterResponse = (pathname: string, response: Response) =>
    pathname.includes("/get-session") && response.status >= 500

const recoverFromStaleJwks = async () => db.delete(jwkss).execute()

const handleAuthRequest = async (request: Request) => {
    const pathname = new URL(request.url).pathname
    let response: Response

    try {
        response = await auth.handler(request)
    } catch (error) {
        if (!isRecoverableJwkError(error)) {
            throw error
        }

        await recoverFromStaleJwks()
        return auth.handler(request)
    }

    if (shouldRetryAfterResponse(pathname, response)) {
        await recoverFromStaleJwks()
        return auth.handler(request)
    }

    return response
}

export const ServerRoute = createServerFileRoute("/api/auth/$").methods({
    GET: ({ request }) => handleAuthRequest(request),
    POST: ({ request }) => handleAuthRequest(request)
})
