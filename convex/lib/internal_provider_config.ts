import { getGoogleAiStudioApiKey, hasInternalGoogleVertexConfig } from "./google_provider"
import type { CoreProvider } from "./models"

export const isInternalProviderConfigured = (providerId: CoreProvider) => {
    switch (providerId) {
        case "openai":
            return Boolean(process.env.OPENAI_API_KEY)
        case "anthropic":
            return Boolean(process.env.ANTHROPIC_API_KEY)
        case "google":
            if (hasInternalGoogleVertexConfig()) {
                return true
            }

            return Boolean(getGoogleAiStudioApiKey("internal"))
        case "xai":
            return Boolean(process.env.XAI_API_KEY)
        case "groq":
            return Boolean(process.env.GROQ_API_KEY)
        case "fal":
            return Boolean(process.env.FAL_API_KEY)
        case "gateway":
            return Boolean(process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN)
        default: {
            const exhaustiveCheck: never = providerId
            throw new Error(`Unknown provider: ${exhaustiveCheck}`)
        }
    }
}
