import type { GoogleAuthMode } from "../schema/settings"

type VertexServiceAccount = {
    project_id?: string
    client_email?: string
    private_key?: string
    private_key_id?: string
}

type VertexConfigWrapper = {
    projectId?: string
    location?: string
    credentials?: VertexServiceAccount
    client_email?: string
    private_key?: string
    private_key_id?: string
    project_id?: string
}

const hasInternalVertexCredentialEnv = () =>
    Boolean(
        process.env.GOOGLE_VERTEX_CREDENTIALS_JSON ||
            ((process.env.GOOGLE_VERTEX_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL) &&
                (process.env.GOOGLE_VERTEX_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY) &&
                (process.env.GOOGLE_VERTEX_PROJECT ||
                    process.env.GOOGLE_CLOUD_PROJECT ||
                    process.env.GCLOUD_PROJECT))
    )

export const getGoogleAuthMode = (
    secret: string | "internal",
    explicitMode?: GoogleAuthMode
): GoogleAuthMode => {
    if (explicitMode) {
        return explicitMode
    }

    if (secret === "internal") {
        const configuredMode = process.env.GOOGLE_INTERNAL_PROVIDER
        if (configuredMode === "vertex" || configuredMode === "ai-studio") {
            return configuredMode
        }

        return hasInternalVertexCredentialEnv() ? "vertex" : "ai-studio"
    }

    return secret.trim().startsWith("{") ? "vertex" : "ai-studio"
}

const normalizePrivateKey = (privateKey?: string) => privateKey?.replace(/\\n/g, "\n")

export const getGoogleAiStudioApiKey = (secret: string | "internal") => {
    if (secret !== "internal") {
        return secret
    }

    return (
        process.env.GOOGLE_AI_STUDIO_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.GOOGLE_API_KEY
    )
}

export const hasInternalGoogleVertexConfig = () => hasInternalVertexCredentialEnv()

const parseVertexWrapper = (raw: string): VertexConfigWrapper =>
    JSON.parse(raw) as VertexConfigWrapper

export const getGoogleVertexConfig = (secret: string | "internal") => {
    if (secret === "internal") {
        const rawJson = process.env.GOOGLE_VERTEX_CREDENTIALS_JSON
        if (rawJson) {
            return normalizeGoogleVertexConfig(parseVertexWrapper(rawJson))
        }

        const clientEmail =
            process.env.GOOGLE_VERTEX_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL
        const privateKey = normalizePrivateKey(
            process.env.GOOGLE_VERTEX_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY
        )

        if (!clientEmail || !privateKey) {
            throw new Error(
                "GOOGLE_VERTEX_CREDENTIALS_JSON or split Vertex credentials are required"
            )
        }

        return {
            project:
                process.env.GOOGLE_VERTEX_PROJECT ||
                process.env.GOOGLE_CLOUD_PROJECT ||
                process.env.GCLOUD_PROJECT ||
                "",
            location: process.env.GOOGLE_VERTEX_LOCATION || "us-central1",
            credentials: {
                client_email: clientEmail,
                private_key: privateKey,
                private_key_id:
                    process.env.GOOGLE_VERTEX_PRIVATE_KEY_ID || process.env.GOOGLE_PRIVATE_KEY_ID
            }
        }
    }

    return normalizeGoogleVertexConfig(parseVertexWrapper(secret))
}

const normalizeGoogleVertexConfig = (config: VertexConfigWrapper) => {
    const credentials = config.credentials ?? config
    const project = config.projectId || config.project_id || credentials.project_id || ""
    const location = config.location || process.env.GOOGLE_VERTEX_LOCATION || "us-central1"
    const clientEmail = credentials.client_email
    const privateKey = normalizePrivateKey(credentials.private_key)

    if (!project) {
        throw new Error("Google Vertex project_id is required")
    }

    if (!clientEmail || !privateKey) {
        throw new Error("Google Vertex client_email and private_key are required")
    }

    return {
        project,
        location,
        credentials: {
            client_email: clientEmail,
            private_key: privateKey,
            private_key_id: credentials.private_key_id
        }
    }
}
