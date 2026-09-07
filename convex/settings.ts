import { DefaultSettings } from "@/lib/default-user-settings"
import { ChatError } from "@/lib/errors"
import { MAX_IMPORTED_THEMES } from "@/lib/imported-theme-limits"
import { getBuiltInThemeUrl, normalizeThemeImportUrl } from "@/lib/theme-utils"
import { type Infer, v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import { type QueryCtx, internalQuery, mutation, query } from "./_generated/server"
import { assertAccountNotDeleting } from "./lib/account_deletion_status"
import { resolveContextLimits } from "./lib/context_limits"
import { decryptKey, encryptKey } from "./lib/encryption"
import { getUserIdentity } from "./lib/identity"
import { normalizeModelAbilities } from "./lib/model_abilities"
import {
    MODELS_SHARED,
    type RegistryKey,
    SHARED_MODELS_VERSION,
    type SharedModel,
    getOpenRouterProviderModelId,
    isModelSunset
} from "./lib/models"
import { resolveToolAvailability } from "./lib/tools/availability"
import type { UserSettings } from "./schema"
import {
    ImageGenerationDefaults,
    NonSensitiveUserSettings,
    ResponseStyleLevel,
    StoredModelAbilitySchema
} from "./schema/settings"

type CoreProviderUsageMode = "priority" | "fallback"

export type UserRegistry = {
    providers: Record<
        string,
        {
            key: string
            endpoint?: string
            apiMode?: "chat" | "responses"
            name?: string
            usageMode?: CoreProviderUsageMode
            authMode?: "ai-studio" | "vertex"
        }
    >
    models: Record<string, SharedModel & { customProviderId?: string }>
    settings: Infer<typeof UserSettings> & { _id?: Id<"settings"> }
}

const normalizeImportedThemeUrl = (url: string) => {
    const normalizedUrl = url.trim()
    if (!normalizedUrl) throw new Error("Theme URL is required")
    if (normalizedUrl.length > 2048) throw new Error("Theme URL is too long")
    return normalizedUrl
}

const addImportedTheme = (themes: string[], url: string) => {
    const normalizedUrl = normalizeThemeImportUrl(url)
    if (!normalizedUrl) {
        throw new Error("Enter a theme URL from tweakcn.com")
    }
    if (getBuiltInThemeUrl(normalizedUrl)) return themes
    if (themes.includes(normalizedUrl)) return themes
    if (themes.length >= MAX_IMPORTED_THEMES) {
        throw new Error(
            `You can save up to ${MAX_IMPORTED_THEMES} themes. Remove one to add another.`
        )
    }
    return [...themes, normalizedUrl]
}

const normalizeImportedThemes = (themes: string[] | undefined) => {
    const normalizedThemes: string[] = []
    for (const url of themes ?? []) {
        const normalizedUrl = normalizeImportedThemeUrl(url)
        if (getBuiltInThemeUrl(normalizedUrl) || normalizedThemes.includes(normalizedUrl)) {
            continue
        }
        if (normalizedThemes.length >= MAX_IMPORTED_THEMES) {
            throw new Error(
                `You can save up to ${MAX_IMPORTED_THEMES} themes. Remove one to add another.`
            )
        }
        normalizedThemes.push(normalizedUrl)
    }
    return normalizedThemes
}

const CoreProviderUpdate = v.object({
    enabled: v.boolean(),
    newKey: v.optional(v.string()),
    usageMode: v.optional(v.union(v.literal("priority"), v.literal("fallback"))),
    authMode: v.optional(v.union(v.literal("ai-studio"), v.literal("vertex")))
})

const hasInternalOpenRouterConfig = () => Boolean(process.env.OPENROUTER_API_KEY?.trim())

const userHasAdminModelAccess = async (ctx: QueryCtx, userId: string) => {
    const access = await ctx.db
        .query("userAccess")
        .withIndex("byUser", (q) => q.eq("userId", userId))
        .first()

    return access?.isStaff ?? false
}

const userCanAccessSharedModel = (model: SharedModel, hasAdminModelAccess: boolean) =>
    model.requiredRole !== "admin" || hasAdminModelAccess

const getSharedModelsForUser = (hasAdminModelAccess: boolean) =>
    MODELS_SHARED.filter((model) => userCanAccessSharedModel(model, hasAdminModelAccess))

const resolveCurrentUserAdminModelAccess = async (ctx: QueryCtx) => {
    const user = await getUserIdentity(ctx.auth, { allowAnons: false })
    if ("error" in user) return false

    return await userHasAdminModelAccess(ctx, user.id)
}

const normalizeSettingsCustomModels = <
    TSettings extends {
        customModels?: Record<string, { abilities: readonly string[] }>
    }
>(
    settings: TSettings
) => ({
    ...settings,
    customModels: Object.fromEntries(
        Object.entries(settings.customModels ?? {}).map(([modelId, model]) => [
            modelId,
            {
                ...model,
                abilities: normalizeModelAbilities(
                    model.abilities as Parameters<typeof normalizeModelAbilities>[0]
                )
            }
        ])
    )
})

const hasInternalOpenRouterForModel = (model: SharedModel, adapter: RegistryKey) => {
    if (!hasInternalOpenRouterConfig()) {
        return false
    }

    const [providerId] = adapter.split(":")
    if (providerId === "openrouter") {
        return model.adapters.includes(adapter)
    }

    if (!providerId.startsWith("i3-")) {
        return false
    }

    if (model.mode === "speech-to-text" || model.mode === "text-to-speech") {
        return false
    }

    return model.adapters.some((candidate) => candidate.startsWith("openrouter:"))
}

const getOpenRouterMetadataByProviderModelId = async (
    ctx: QueryCtx,
    models: readonly Pick<SharedModel, "adapters">[]
) => {
    const providerModelIds = Array.from(
        new Set(models.map(getOpenRouterProviderModelId).filter((id): id is string => Boolean(id)))
    )
    const metadataEntries = await Promise.all(
        providerModelIds.map(async (providerModelId) => {
            const metadata = await ctx.db
                .query("modelProviderMetadata")
                .withIndex("byProviderModel", (q) =>
                    q.eq("provider", "openrouter").eq("providerModelId", providerModelId)
                )
                .first()

            return metadata ? ([providerModelId, metadata] as const) : null
        })
    )

    const metadataByProviderModelId: Record<string, Doc<"modelProviderMetadata">> = {}
    for (const entry of metadataEntries) {
        if (!entry) continue
        const [providerModelId, metadata] = entry
        metadataByProviderModelId[providerModelId] = metadata
    }

    return metadataByProviderModelId
}

const overlayOpenRouterMetadata = <
    TModel extends Pick<
        SharedModel,
        | "adapters"
        | "contextLength"
        | "maxTokens"
        | "knowledgeCutoff"
        | "inputUsdPer1MTokens"
        | "outputUsdPer1MTokens"
        | "openrouterProvider"
    >
>(
    model: TModel,
    metadataByProviderModelId: Record<string, Doc<"modelProviderMetadata">>
) => {
    const providerModelId = getOpenRouterProviderModelId(model)
    const metadata = providerModelId ? metadataByProviderModelId[providerModelId] : undefined

    if (!metadata) return model

    const pinnedProvider = model.openrouterProvider
    const hasPinnedPricing =
        pinnedProvider !== undefined && metadata.pricingProvider === pinnedProvider
    const [primaryPrices, fallbackPrices] = hasPinnedPricing ? [metadata, model] : [model, metadata]

    return {
        ...model,
        contextLength: model.contextLength ?? metadata.contextLength,
        maxTokens: model.maxTokens ?? metadata.maxCompletionTokens,
        knowledgeCutoff: model.knowledgeCutoff ?? metadata.knowledgeCutoff,
        inputUsdPer1MTokens:
            primaryPrices.inputUsdPer1MTokens ?? fallbackPrices.inputUsdPer1MTokens,
        outputUsdPer1MTokens:
            primaryPrices.outputUsdPer1MTokens ?? fallbackPrices.outputUsdPer1MTokens
    }
}

const getSettings = async (
    ctx: QueryCtx,
    userId: string
): Promise<Infer<typeof UserSettings> & { _id?: Id<"settings"> }> => {
    const settings = await ctx.db
        .query("settings")
        .withIndex("byUser", (q) => q.eq("userId", userId))
        .first()

    if (!settings) {
        return DefaultSettings(userId)
    }
    const normalized = normalizeSettingsCustomModels(settings)
    return {
        ...normalized,
        generalProviders: {
            ...normalized.generalProviders,
            // Hosted memory replaced the legacy per-user Supermemory credential.
            // Never return an obsolete encrypted secret to application clients.
            supermemory: undefined
        }
    }
}
export const getUserSettingsInternal = internalQuery({
    args: {
        userId: v.string()
    },
    handler: async (ctx, args): Promise<Infer<typeof UserSettings>> => {
        return await getSettings(ctx, args.userId)
    }
})

export const getUserSettings = query({
    args: {},
    handler: async (ctx): Promise<Infer<typeof UserSettings>> => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) return DefaultSettings("unauthorized")
        return await getSettings(ctx, user.id)
    }
})

export const getToolAvailability = query({
    args: {},
    handler: async (ctx) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) return null

        const settings = await getSettings(ctx, user.id)
        return resolveToolAvailability(settings)
    }
})

export const getSharedModels = query({
    args: {},
    handler: async (ctx) => {
        const hasAdminModelAccess = await resolveCurrentUserAdminModelAccess(ctx)
        const sharedModels = getSharedModelsForUser(hasAdminModelAccess)
        const metadataByProviderModelId = await getOpenRouterMetadataByProviderModelId(
            ctx,
            sharedModels
        )
        const metadataVersion = Math.max(
            0,
            ...Object.values(metadataByProviderModelId).map((metadata) => metadata.fetchedAt ?? 0)
        )

        return {
            version: `${SHARED_MODELS_VERSION}:${metadataVersion}`,
            models: sharedModels.map((model) =>
                overlayOpenRouterMetadata(model, metadataByProviderModelId)
            )
        }
    }
})

/**
 * Dev-only: the resolved context limits for a model, computed with OpenRouter pricing metadata.
 * Returns null in production — gated by the same flag as the dev credit lab.
 */
export const getDevModelContextLimits = query({
    args: { modelId: v.string() },
    handler: async (ctx, { modelId }) => {
        if (process.env.DEV_CREDIT_LAB_ENABLED !== "1") return null

        const model = MODELS_SHARED.find((candidate) => candidate.id === modelId)
        if (!model) return null

        const providerModelId = getOpenRouterProviderModelId(model)
        const metadataByProviderModelId: Record<string, Doc<"modelProviderMetadata">> = {}
        if (providerModelId) {
            const metadata = await ctx.db
                .query("modelProviderMetadata")
                .withIndex("byProviderModel", (q) =>
                    q.eq("provider", "openrouter").eq("providerModelId", providerModelId)
                )
                .first()
            if (metadata) metadataByProviderModelId[providerModelId] = metadata
        }

        const enriched = overlayOpenRouterMetadata(model, metadataByProviderModelId)
        const limits = resolveContextLimits(enriched)
        return {
            // The enriched policy fields, so the client can re-run resolveContextLimits with a
            // dev OTF override layered on top.
            contextLength: enriched.contextLength ?? null,
            maxTokens: enriched.maxTokens ?? null,
            inputUsdPer1MTokens: enriched.inputUsdPer1MTokens ?? null,
            hostedContextLength: model.hostedContextLength ?? null,
            resolvedHostedInputLimit: limits.hostedInputLimit,
            resolvedModelInputLimit: limits.modelInputLimit,
            hasPricing: typeof enriched.inputUsdPer1MTokens === "number"
        }
    }
})

export const getUserRegistryInternal = internalQuery({
    args: {
        userId: v.string()
    },
    handler: async (ctx, args): Promise<UserRegistry> => {
        const settings = await getSettings(ctx, args.userId)
        const hasAdminModelAccess = await userHasAdminModelAccess(ctx, args.userId)
        const sharedModelsForUser = getSharedModelsForUser(hasAdminModelAccess).filter(
            (model) => !isModelSunset(model)
        )
        const metadataByProviderModelId = await getOpenRouterMetadataByProviderModelId(
            ctx,
            sharedModelsForUser
        )

        const providers: Record<
            string,
            {
                key: string
                endpoint?: string
                apiMode?: "chat" | "responses"
                name?: string
                usageMode?: CoreProviderUsageMode
                authMode?: "ai-studio" | "vertex"
            }
        > = {}
        for (const [providerId, provider] of Object.entries(settings.coreAIProviders)) {
            if (!provider.enabled) continue
            providers[providerId] = {
                key: await decryptKey(provider.encryptedKey),
                name: providerId,
                usageMode: provider.usageMode ?? "fallback",
                authMode: provider.authMode
            }
        }

        for (const [providerId, provider] of Object.entries(settings.customAIProviders)) {
            if (!provider.enabled) continue
            providers[providerId] = {
                key: await decryptKey(provider.encryptedKey),
                endpoint: provider.endpoint,
                apiMode:
                    provider.apiMode ?? settings.customAIProviders[providerId]?.apiMode ?? "chat",
                name: provider.name
            }
        }

        const models: Record<string, SharedModel & { customProviderId?: string }> = {}
        for (const rawModel of sharedModelsForUser) {
            const model = overlayOpenRouterMetadata(rawModel, metadataByProviderModelId)

            const available_adapters: RegistryKey[] = []
            for (const adapter of model.adapters) {
                const provider = adapter.split(":")[0]
                if (
                    provider in providers ||
                    (provider === "openrouter" && hasInternalOpenRouterForModel(model, adapter)) ||
                    (provider.startsWith("i3-") && hasInternalOpenRouterForModel(model, adapter))
                ) {
                    available_adapters.push(adapter)
                }
            }
            models[model.id] = { ...model, adapters: available_adapters }
        }

        for (const [modelId, model] of Object.entries(settings.customModels)) {
            if (!model.enabled) continue
            models[modelId] = {
                id: model.modelId,
                name: model.name ?? model.modelId,
                adapters: [`${model.providerId}:${model.modelId}`],
                abilities: normalizeModelAbilities(
                    model.abilities as Parameters<typeof normalizeModelAbilities>[0]
                ),
                contextLength: model.contextLength,
                maxTokens: model.maxTokens,
                customProviderId: model.providerId
            }
        }

        return { providers, models, settings }
    }
})

export const updateUserSettings = mutation({
    args: {
        userId: v.string(),
        baseSettings: NonSensitiveUserSettings,
        coreProviders: v.record(v.string(), CoreProviderUpdate),
        customProviders: v.record(
            v.string(),
            v.object({
                name: v.string(),
                enabled: v.boolean(),
                endpoint: v.string(),
                apiMode: v.optional(v.union(v.literal("chat"), v.literal("responses"))),
                newKey: v.optional(v.string())
            })
        )
    },
    handler: async (ctx, args) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new ChatError("unauthorized:api")
        if (user.id !== args.userId) {
            throw new ChatError("unauthorized:api")
        }
        await assertAccountNotDeleting(ctx, user.id)

        const settings = await getSettings(ctx, args.userId)
        const customThemes = normalizeImportedThemes(settings.customThemes)

        const newSettings: Infer<typeof UserSettings> = {
            ...normalizeSettingsCustomModels(args.baseSettings),
            customThemes,
            telemetryEnabled: args.baseSettings.telemetryEnabled ?? settings.telemetryEnabled,
            coreAIProviders: {},
            customAIProviders: {},
            generalProviders: {
                supermemory: undefined,
                firecrawl: settings.generalProviders?.firecrawl,
                tavily: settings.generalProviders?.tavily,
                brave: settings.generalProviders?.brave,
                serper: settings.generalProviders?.serper
            }
        }

        // Handle core AI providers
        for (const [providerId, provider] of Object.entries(args.coreProviders)) {
            newSettings.coreAIProviders[providerId] = {
                enabled: provider.enabled,
                usageMode:
                    provider.usageMode ??
                    settings.coreAIProviders[providerId]?.usageMode ??
                    "fallback",
                authMode: provider.authMode ?? settings.coreAIProviders[providerId]?.authMode,
                encryptedKey: provider.newKey
                    ? await encryptKey(provider.newKey)
                    : settings.coreAIProviders[providerId]?.encryptedKey || ""
            }
        }

        // Handle custom AI providers
        for (const [providerId, provider] of Object.entries(args.customProviders)) {
            newSettings.customAIProviders[providerId] = {
                enabled: provider.enabled,
                endpoint: provider.endpoint,
                apiMode:
                    provider.apiMode ?? settings.customAIProviders[providerId]?.apiMode ?? "chat",
                name: provider.name,
                encryptedKey: provider.newKey
                    ? await encryptKey(provider.newKey)
                    : settings.customAIProviders[providerId].encryptedKey
            }
        }

        if (settings._id) {
            await ctx.db.patch(settings._id, newSettings)
        } else {
            await ctx.db.insert("settings", newSettings)
        }
    }
})

export const addUserTheme = mutation({
    args: {
        url: v.string()
    },
    handler: async (ctx, args) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new Error("Unauthorized")
        await assertAccountNotDeleting(ctx, user.id)
        const settings = await getSettings(ctx, user.id)
        const existingThemes = normalizeImportedThemes(settings.customThemes)
        const updatedThemes = addImportedTheme(existingThemes, args.url)
        if (updatedThemes === existingThemes) return

        const newSettings: Infer<typeof UserSettings> = {
            ...settings,
            customThemes: updatedThemes
        }

        if (settings._id) {
            await ctx.db.patch(settings._id, newSettings)
        } else {
            await ctx.db.insert("settings", newSettings)
        }
    }
})

export const deleteUserTheme = mutation({
    args: {
        url: v.string()
    },
    handler: async (ctx, args) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new Error("Unauthorized")
        await assertAccountNotDeleting(ctx, user.id)
        const settings = await getSettings(ctx, user.id)

        const existingThemes = settings.customThemes ?? []
        const url = normalizeImportedThemeUrl(args.url)
        const updatedThemes = existingThemes.filter((t) => t !== url)
        if (updatedThemes.length === existingThemes.length) return

        const newSettings: Infer<typeof UserSettings> = {
            ...settings,
            customThemes: updatedThemes
        }

        if (settings._id) {
            await ctx.db.patch(settings._id, newSettings)
        } else {
            await ctx.db.insert("settings", newSettings)
        }
    }
})

export const updateUserSettingsPartial = mutation({
    args: {
        // Base settings (partial)
        titleGenerationModel: v.optional(v.string()),
        toolCallLimitPerTurn: v.optional(v.number()),
        invertSendNewlineBehavior: v.optional(v.boolean()),
        telemetryEnabled: v.optional(v.boolean()),
        imageGenerationDefaults: v.optional(ImageGenerationDefaults),
        customization: v.optional(
            v.object({
                name: v.optional(v.union(v.string(), v.null())),
                aiPersonality: v.optional(v.union(v.string(), v.null())),
                additionalContext: v.optional(v.union(v.string(), v.null()))
            })
        ),
        responseStyle: v.optional(
            v.object({
                warmth: v.optional(v.union(ResponseStyleLevel, v.null())),
                enthusiasm: v.optional(v.union(ResponseStyleLevel, v.null())),
                structure: v.optional(v.union(ResponseStyleLevel, v.null())),
                emoji: v.optional(v.union(ResponseStyleLevel, v.null())),
                profanity: v.optional(v.union(ResponseStyleLevel, v.null()))
            })
        ),

        // Provider updates (only pass what's changing)
        coreProviderUpdates: v.optional(v.record(v.string(), CoreProviderUpdate)),
        customProviderUpdates: v.optional(
            v.record(
                v.string(),
                v.union(
                    // Update existing provider
                    v.object({
                        name: v.string(),
                        enabled: v.boolean(),
                        endpoint: v.string(),
                        apiMode: v.optional(v.union(v.literal("chat"), v.literal("responses"))),
                        newKey: v.optional(v.string())
                    }),
                    // Delete provider (null value)
                    v.null()
                )
            )
        ),
        // Custom models
        customModelUpdates: v.optional(
            v.record(
                v.string(),
                v.union(
                    v.object({
                        enabled: v.boolean(),
                        name: v.optional(v.string()),
                        modelId: v.string(),
                        providerId: v.string(),
                        contextLength: v.number(),
                        maxTokens: v.number(),
                        abilities: v.array(StoredModelAbilitySchema)
                    }),
                    v.null() // Delete model
                )
            )
        ),

        // Custom themes
        addTheme: v.optional(v.string()),
        removeTheme: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new ChatError("unauthorized:api")
        await assertAccountNotDeleting(ctx, user.id)

        const settings = await getSettings(ctx, user.id)
        const newSettings: Infer<typeof UserSettings> = { ...settings }

        // Update base settings
        if (args.titleGenerationModel !== undefined) {
            newSettings.titleGenerationModel = args.titleGenerationModel
        }
        if (args.toolCallLimitPerTurn !== undefined) {
            newSettings.toolCallLimitPerTurn = args.toolCallLimitPerTurn
        }
        if (args.invertSendNewlineBehavior !== undefined) {
            newSettings.invertSendNewlineBehavior = args.invertSendNewlineBehavior
        }
        if (args.telemetryEnabled !== undefined) {
            newSettings.telemetryEnabled = args.telemetryEnabled
        }
        if (args.imageGenerationDefaults !== undefined) {
            // Merge so a partial update (e.g. only resolution) preserves the other field.
            newSettings.imageGenerationDefaults = {
                ...newSettings.imageGenerationDefaults,
                ...args.imageGenerationDefaults
            }
        }
        if (args.customization !== undefined) {
            const customization = { ...newSettings.customization }

            for (const field of ["name", "aiPersonality", "additionalContext"] as const) {
                const value = args.customization[field]
                if (value === null) {
                    delete customization[field]
                } else if (value !== undefined) {
                    customization[field] = value
                }
            }

            newSettings.customization =
                Object.keys(customization).length > 0 ? customization : undefined
        }
        if (args.responseStyle !== undefined) {
            const responseStyle = { ...newSettings.responseStyle }

            for (const field of [
                "warmth",
                "enthusiasm",
                "structure",
                "emoji",
                "profanity"
            ] as const) {
                const value = args.responseStyle[field]
                if (value === null) {
                    delete responseStyle[field]
                } else if (value !== undefined) {
                    responseStyle[field] = value
                }
            }

            newSettings.responseStyle =
                Object.keys(responseStyle).length > 0 ? responseStyle : undefined
        }

        // Update core AI providers
        if (args.coreProviderUpdates) {
            for (const [providerId, update] of Object.entries(args.coreProviderUpdates)) {
                newSettings.coreAIProviders[providerId] = {
                    enabled: update.enabled,
                    usageMode:
                        update.usageMode ??
                        settings.coreAIProviders[providerId]?.usageMode ??
                        "fallback",
                    authMode: update.authMode ?? settings.coreAIProviders[providerId]?.authMode,
                    encryptedKey: update.newKey
                        ? await encryptKey(update.newKey)
                        : settings.coreAIProviders[providerId]?.encryptedKey || ""
                }
            }
        }

        // Update custom AI providers
        if (args.customProviderUpdates) {
            for (const [providerId, update] of Object.entries(args.customProviderUpdates)) {
                if (update === null) {
                    // Delete provider
                    delete newSettings.customAIProviders[providerId]
                } else {
                    // Update provider
                    newSettings.customAIProviders[providerId] = {
                        name: update.name,
                        enabled: update.enabled,
                        endpoint: update.endpoint,
                        apiMode:
                            update.apiMode ??
                            settings.customAIProviders[providerId]?.apiMode ??
                            "chat",
                        encryptedKey: update.newKey
                            ? await encryptKey(update.newKey)
                            : settings.customAIProviders[providerId]?.encryptedKey || ""
                    }
                }
            }
        }

        // Update custom models
        if (args.customModelUpdates) {
            for (const [modelId, update] of Object.entries(args.customModelUpdates)) {
                if (update === null) {
                    // Delete model
                    delete newSettings.customModels[modelId]
                } else {
                    // Update model
                    newSettings.customModels[modelId] = {
                        ...update,
                        abilities: normalizeModelAbilities(update.abilities)
                    }
                }
            }
        }

        // Handle theme updates
        if (args.addTheme) {
            const existingThemes = normalizeImportedThemes(newSettings.customThemes)
            newSettings.customThemes = addImportedTheme(existingThemes, args.addTheme)
        }
        if (args.removeTheme) {
            const existingThemes = newSettings.customThemes || []
            const url = normalizeImportedThemeUrl(args.removeTheme)
            newSettings.customThemes = existingThemes.filter((t) => t !== url)
        }

        // Save settings
        if (settings._id) {
            await ctx.db.patch(settings._id, newSettings)
        } else {
            await ctx.db.insert("settings", newSettings)
        }
    }
})

export const getOnboardingStatus = query({
    args: {},
    handler: async (ctx): Promise<{ shouldShowOnboarding: boolean } | { error: string }> => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) return { error: "unauthorized:api" }

        const settings = await getSettings(ctx, user.id)

        // Show onboarding if onboardingCompleted is false or undefined
        return { shouldShowOnboarding: !settings.onboardingCompleted }
    }
})

export const completeOnboarding = mutation({
    args: {},
    handler: async (ctx) => {
        const user = await getUserIdentity(ctx.auth, { allowAnons: false })
        if ("error" in user) throw new ChatError("unauthorized:api")
        await assertAccountNotDeleting(ctx, user.id)

        const settings = await getSettings(ctx, user.id)

        const newSettings: Infer<typeof UserSettings> = {
            ...settings,
            onboardingCompleted: true
        }

        if (settings._id) {
            await ctx.db.patch(settings._id, newSettings)
        } else {
            await ctx.db.insert("settings", newSettings)
        }
    }
})
