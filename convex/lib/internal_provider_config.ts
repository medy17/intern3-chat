import { getGoogleAiStudioApiKey } from "./google_provider"
import type { CoreProvider } from "./models"

export const isInternalProviderConfigured = (providerId: CoreProvider) => {
    switch (providerId) {
        case "openai":
            return Boolean(process.env.OPENAI_API_KEY)
        case "anthropic":
            return Boolean(process.env.ANTHROPIC_API_KEY)
        case "google":
            if (process.env.GOOGLE_INTERNAL_PROVIDER === "vertex") {
                return Boolean(
                    process.env.GOOGLE_VERTEX_CREDENTIALS_JSON ||
                        ((process.env.GOOGLE_VERTEX_CLIENT_EMAIL ||
                            process.env.GOOGLE_CLIENT_EMAIL) &&
                            (process.env.GOOGLE_VERTEX_PRIVATE_KEY ||
                                process.env.GOOGLE_PRIVATE_KEY) &&
                            (process.env.GOOGLE_VERTEX_PROJECT ||
                                process.env.GOOGLE_CLOUD_PROJECT ||
                                process.env.GCLOUD_PROJECT))
                )
            }

            return Boolean(getGoogleAiStudioApiKey("internal"))
        case "groq":
            return Boolean(process.env.GROQ_API_KEY)
        case "fal":
            return Boolean(process.env.FAL_API_KEY)
        default: {
            const exhaustiveCheck: never = providerId
            throw new Error(`Unknown provider: ${exhaustiveCheck}`)
        }
    }
}
