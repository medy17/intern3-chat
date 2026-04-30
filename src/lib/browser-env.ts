type Env = {
    VITE_CONVEX_URL: string
    VITE_CONVEX_API_URL: string
    VITE_R2_PUBLIC_BASE_URL?: string
    VITE_CLOUDFLARE_IMAGE_HOST?: string
    VITE_LOCAL_IMAGE_OPTIMIZER_ENABLED?: string
    VITE_POSTHOG_KEY?: string
    VITE_POSTHOG_HOST?: string
    VITE_ENABLE_VOICE_INPUT?: string
    VITE_ENABLED_INTERNAL_PROVIDERS?: string
    VITE_ENABLE_LEGACY_DIRECT_INFERENCE_PROVIDERS?: string
}

export const browserEnv = (key: keyof Env) => {
    const value = (import.meta as unknown as { env: Env }).env[key]?.trim()
    if (!value) {
        throw new Error(`Missing environment variable(browser): ${key}`)
    }
    return value
}

export const optionalBrowserEnv = (key: keyof Env) =>
    (import.meta as unknown as { env: Env }).env[key]?.trim()
