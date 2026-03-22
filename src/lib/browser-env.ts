type Env = {
    VITE_CONVEX_URL: string
    VITE_CONVEX_API_URL: string
    VITE_POSTHOG_KEY?: string
    VITE_POSTHOG_HOST?: string
    VITE_ENABLE_VOICE_INPUT?: string
    VITE_ENABLED_INTERNAL_PROVIDERS?: string
}

export const browserEnv = (key: keyof Env) => {
    const value = (import.meta as unknown as { env: Env }).env[key]
    if (!value) {
        throw new Error(`Missing environment variable(browser): ${key}`)
    }
    return value
}

export const optionalBrowserEnv = (key: keyof Env) =>
    (import.meta as unknown as { env: Env }).env[key]
