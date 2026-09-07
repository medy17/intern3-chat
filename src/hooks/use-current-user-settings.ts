import { api } from "@/convex/_generated/api"
import { useDiskCachedQuery } from "@/lib/convex-cached-query"
import { DefaultSettings } from "@/lib/default-user-settings"

/** Callers supply their existing auth state; cached settings never cross accounts. */
export function useCurrentUserSettings(userId: string | undefined, isLoading: boolean) {
    return useDiskCachedQuery(
        api.settings.getUserSettings,
        {
            key: `user-settings:${userId ?? "anonymous"}`,
            default: DefaultSettings(userId ?? "CACHE"),
            forceCache: true
        },
        userId && !isLoading ? {} : "skip"
    )
}
