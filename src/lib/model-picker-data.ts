import { isChatModel, type SharedModel } from "@/convex/lib/models"
import {
    type DisplayModel,
    getProviderDisplayName,
    type useAvailableModels
} from "@/lib/models-providers-shared"
import { FAVORITES_SECTION_ID, getFavoriteModelIdsByRecentlyAdded } from "@/lib/model-favorites"

const PROVIDER_ORDER = ["openai", "anthropic", "google", "xai", "groq", "fal", "openrouter"]
const getModelReleaseOrder = (model: DisplayModel) =>
    "isCustom" in model && model.isCustom ? 0 : ((model as SharedModel).releaseOrder ?? 0)
export const isLegacyModel = (model: DisplayModel) => "legacy" in model && model.legacy === true

const normalizeProviderId = (providerId: string) =>
    providerId.startsWith("i3-") ? providerId.slice(3) : providerId

const getOpenRouterDeveloperSectionId = (developer: string) =>
    `openrouter-developer:${developer
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}`

export const isOpenRouterOnlySharedModel = (model: SharedModel) => {
    const adapters = model.adapters ?? []
    return adapters.length > 0 && adapters.every((adapter) => adapter.startsWith("openrouter:"))
}

export const getModelProviderId = (model: DisplayModel) => {
    if ("isCustom" in model && model.isCustom) {
        return normalizeProviderId(model.providerId)
    }

    const sharedModel = model as SharedModel
    const adapters = sharedModel.adapters ?? []
    const preferredAdapter =
        adapters.find((adapter) => !adapter.startsWith("openrouter:")) ?? adapters[0]

    return normalizeProviderId(preferredAdapter?.split(":")[0] ?? "unknown")
}

export const getModelSectionId = (model: DisplayModel) => {
    if ("isCustom" in model && model.isCustom) {
        return normalizeProviderId(model.providerId)
    }

    const sharedModel = model as SharedModel
    if (isOpenRouterOnlySharedModel(sharedModel) && sharedModel.developer?.trim()) {
        return getOpenRouterDeveloperSectionId(sharedModel.developer)
    }

    return getModelProviderId(model)
}

export const getProviderSectionLabel = (
    providerId: string,
    currentProviders: ReturnType<typeof useAvailableModels>["currentProviders"],
    models?: DisplayModel[]
) => {
    if (providerId.startsWith("openrouter-developer:")) {
        const developer = models?.find((model) => !("isCustom" in model && model.isCustom)) as
            | SharedModel
            | undefined
        return developer?.developer?.trim() || "OpenRouter"
    }

    switch (providerId) {
        case "google":
            return "Gemini"
        case "xai":
            return "xAI"
        default:
            return getProviderDisplayName(providerId, currentProviders)
    }
}

export function buildModelPickerSections(
    availableModels: DisplayModel[],
    currentProviders: ReturnType<typeof useAvailableModels>["currentProviders"],
    favoriteModelIds: readonly string[]
) {
    const textModels = availableModels.filter((model) => isChatModel(model))
    const grouped = textModels.reduce<Record<string, DisplayModel[]>>((acc, model) => {
        const sectionId = getModelSectionId(model)
        if (!acc[sectionId]) {
            acc[sectionId] = []
        }
        acc[sectionId].push(model)
        return acc
    }, {})

    const sections = Object.entries(grouped)
        .map(([providerId, models]) => {
            const label = getProviderSectionLabel(providerId, currentProviders, models)
            return {
                id: providerId,
                label,
                models: [...models].sort((left, right) => {
                    const legacyDelta = Number(isLegacyModel(left)) - Number(isLegacyModel(right))
                    if (legacyDelta !== 0) {
                        return legacyDelta
                    }

                    const releaseDelta = getModelReleaseOrder(right) - getModelReleaseOrder(left)
                    if (releaseDelta !== 0) {
                        return releaseDelta
                    }
                    return left.name.localeCompare(right.name)
                })
            }
        })
        .sort((left, right) => {
            const leftId = left.id
            const rightId = right.id
            const leftOrder = PROVIDER_ORDER.indexOf(leftId)
            const rightOrder = PROVIDER_ORDER.indexOf(rightId)
            const resolvedLeftOrder = leftOrder === -1 ? Number.MAX_SAFE_INTEGER : leftOrder
            const resolvedRightOrder = rightOrder === -1 ? Number.MAX_SAFE_INTEGER : rightOrder
            if (resolvedLeftOrder !== resolvedRightOrder) {
                return resolvedLeftOrder - resolvedRightOrder
            }
            return left.label.localeCompare(right.label)
        })

    const modelsById = new Map(textModels.map((model) => [model.id, model]))
    const favoriteModels = getFavoriteModelIdsByRecentlyAdded(favoriteModelIds).flatMap(
        (modelId) => {
            const model = modelsById.get(modelId)
            return model ? [model] : []
        }
    )

    return [
        {
            id: FAVORITES_SECTION_ID,
            label: "Favorites",
            models: favoriteModels
        },
        ...sections
    ]
}
