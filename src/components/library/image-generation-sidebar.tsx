import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/convex/_generated/api"
import type { SharedModel } from "@/convex/lib/models"
import { isModelSunset } from "@/convex/lib/models/lifecycle"
import { useToken } from "@/hooks/auth-hooks"
import {
    notifyModelReplacement,
    resolveAvailableModelReplacement
} from "@/hooks/use-model-lifecycle-migration"
import { resolveJwtToken } from "@/lib/auth-token"
import { browserEnv } from "@/lib/browser-env"
import {
    SELECTABLE_IMAGE_ASPECT_RATIOS,
    type SelectableImageAspectRatio,
    getCommonSelectableImageAspectRatios
} from "@/lib/image-aspect-ratios"
import { getRequiredPlanToPickModel } from "@/lib/models-providers-shared"
import { useSharedModels } from "@/lib/shared-models"
import { cn } from "@/lib/utils"
import { useAction } from "convex/react"
import { Archive, Loader2, Minus, Plus, Sparkles, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useGenerationStore } from "./generation-store"

const DEFAULT_VARIANTS_PER_MODEL = 1
const MAX_TOTAL_GENERATIONS_PER_RUN = 10
const LEGACY_IMAGE_MODEL_MIGRATION_KEY_PREFIX = "legacy-image-model-migrated"

const getModelMaxPerMessage = (model: SharedModel) =>
    model.maxPerMessage ?? DEFAULT_VARIANTS_PER_MODEL

const isLegacyImageModel = (model: SharedModel) => model.legacy === true

const getLegacyImageModelMigrationKey = (original: SharedModel, replacement: SharedModel) =>
    `${LEGACY_IMAGE_MODEL_MIGRATION_KEY_PREFIX}:${original.id}:${
        original.replacementId ?? "fallback"
    }:${replacement.id}`

const hasStoredLegacyImageModelMigration = (key: string) => {
    if (typeof window === "undefined") return false

    try {
        return window.localStorage.getItem(key) === "true"
    } catch {
        return false
    }
}

const storeLegacyImageModelMigration = (key: string) => {
    if (typeof window === "undefined") return

    try {
        window.localStorage.setItem(key, "true")
    } catch {}
}

const notifyLegacyImageModelReplacement = (original: SharedModel, replacement: SharedModel) => {
    toast.warning(
        `${original.name} is now a legacy image model. We selected ${replacement.name} instead, but you can still pick ${original.name} from legacy models.`
    )
}

const resolveLegacyImageModelReplacement = (
    original: SharedModel,
    candidateModels: readonly SharedModel[]
) => {
    const candidatesById = new Map(candidateModels.map((model) => [model.id, model]))
    const visited = new Set<string>()
    let current: SharedModel | undefined = original

    while (current?.replacementId && !visited.has(current.id)) {
        visited.add(current.id)
        const replacement = candidatesById.get(current.replacementId)
        if (!replacement) break
        if (!isLegacyImageModel(replacement)) return replacement
        current = replacement
    }

    return candidateModels.find((model) => model.id !== original.id && !isLegacyImageModel(model))
}

const clampModelCount = (model: SharedModel, count: number) =>
    Math.max(1, Math.min(count, getModelMaxPerMessage(model)))

const areStringArraysEqual = (left: string[], right: string[]) =>
    left.length === right.length && left.every((value, index) => value === right[index])

const areModelCountsEqual = (left: Record<string, number>, right: Record<string, number>) => {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)

    return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key])
}

export function ImageGenerationSidebar({ disabled = false }: { disabled?: boolean }) {
    const { token } = useToken()
    const { models } = useSharedModels()
    const imageModels = useMemo<SharedModel[]>(
        () => (models as SharedModel[]).filter((m) => m.mode === "image" && !isModelSunset(m)),
        [models]
    )
    const {
        addPendingGeneration,
        removePendingGeneration,
        prompt,
        setPrompt,
        selectedModelIds,
        setSelectedModelIds,
        selectedModelCounts,
        setSelectedModelCounts,
        aspectRatio,
        setAspectRatio,
        resolution,
        setResolution
    } = useGenerationStore()
    const isDevMode = import.meta.env.DEV

    const [referenceFiles, setReferenceFiles] = useState<{ file: File; preview: string }[]>([])
    const [showGradient, setShowGradient] = useState(false)
    const [fakeResponseTimeSeconds, setFakeResponseTimeSeconds] = useState(15)
    const [creditPlan, setCreditPlan] = useState<"free" | "pro" | null>(null)
    const [expandedLegacyModels, setExpandedLegacyModels] = useState(false)
    const [sessionRevealedLegacyModelIds, setSessionRevealedLegacyModelIds] = useState<Set<string>>(
        () => new Set()
    )
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const referenceFilesRef = useRef(referenceFiles)
    const seenLegacyMigrationKeysRef = useRef<Set<string>>(new Set())
    const sessionRevealedLegacyModelIdsRef = useRef<Set<string>>(new Set())

    useEffect(() => {
        let cancelled = false

        const loadCreditPlan = async () => {
            try {
                const response = await fetch("/api/credit-summary", {
                    credentials: "include"
                })

                if (!response.ok) {
                    throw new Error("Failed to load credit summary")
                }

                const data = (await response.json()) as { plan?: "free" | "pro" }
                if (!cancelled) {
                    setCreditPlan(data.plan === "pro" ? "pro" : "free")
                }
            } catch {
                if (!cancelled) {
                    setCreditPlan("free")
                }
            }
        }

        void loadCreditPlan()

        return () => {
            cancelled = true
        }
    }, [])

    const lockedModelIds = useMemo(
        () =>
            new Set(
                creditPlan === "free"
                    ? imageModels
                          .filter((model) => getRequiredPlanToPickModel(model) === "pro")
                          .map((model) => model.id)
                    : []
            ),
        [creditPlan, imageModels]
    )
    const selectableImageModels = useMemo(
        () => imageModels.filter((model) => !lockedModelIds.has(model.id)),
        [imageModels, lockedModelIds]
    )

    useEffect(() => {
        referenceFilesRef.current = referenceFiles
    }, [referenceFiles])

    useEffect(() => {
        setSelectedModelIds((prev) => {
            const selectableModels = creditPlan === null ? imageModels : selectableImageModels
            const selectableIds = new Set(selectableModels.map((model) => model.id))
            const fallbackPool = selectableModels.length > 0 ? selectableModels : imageModels
            const validSelections = prev
                .map((id) => {
                    if (selectableIds.has(id)) return id

                    const original = models.find((model) => model.id === id)
                    if (!original || !isModelSunset(original)) return id

                    const replacement = resolveAvailableModelReplacement({
                        modelId: id,
                        sharedModels: models,
                        availableModels: selectableModels,
                        fallbackModelId: fallbackPool[0]?.id
                    })

                    if (replacement.replacementId && replacement.replacement) {
                        notifyModelReplacement(original, replacement.replacement)
                        return replacement.replacementId
                    }

                    return id
                })
                .filter(
                    (id, index, values) => selectableIds.has(id) && values.indexOf(id) === index
                )
            if (validSelections.length > 0) {
                return areStringArraysEqual(prev, validSelections) ? prev : validSelections
            }

            const fallbackSelection = fallbackPool.length > 0 ? [fallbackPool[0].id] : []
            return areStringArraysEqual(prev, fallbackSelection) ? prev : fallbackSelection
        })
    }, [creditPlan, imageModels, models, selectableImageModels, setSelectedModelIds])

    useEffect(() => {
        if (creditPlan === null || selectedModelIds.length === 0) return

        const candidateModels =
            selectableImageModels.length > 0 ? selectableImageModels : imageModels
        if (candidateModels.length === 0) return

        const imageModelsById = new Map(imageModels.map((model) => [model.id, model]))
        const migrations = selectedModelIds
            .map((modelId) => {
                const original = imageModelsById.get(modelId)
                if (!original || !isLegacyImageModel(original) || isModelSunset(original)) {
                    return null
                }
                if (
                    sessionRevealedLegacyModelIds.has(original.id) ||
                    sessionRevealedLegacyModelIdsRef.current.has(original.id)
                ) {
                    return null
                }

                const replacement = resolveLegacyImageModelReplacement(original, candidateModels)
                if (!replacement || replacement.id === original.id) {
                    return null
                }

                const storageKey = getLegacyImageModelMigrationKey(original, replacement)
                if (
                    seenLegacyMigrationKeysRef.current.has(storageKey) ||
                    hasStoredLegacyImageModelMigration(storageKey)
                ) {
                    return null
                }

                return { original, replacement, storageKey }
            })
            .filter(
                (
                    migration
                ): migration is {
                    original: SharedModel
                    replacement: SharedModel
                    storageKey: string
                } => migration !== null
            )

        if (migrations.length === 0) return

        const replacementByOriginalId = new Map(
            migrations.map((migration) => [migration.original.id, migration.replacement])
        )
        const nextSelectedModelIds = selectedModelIds
            .map((modelId) => replacementByOriginalId.get(modelId)?.id ?? modelId)
            .filter((modelId, index, values) => values.indexOf(modelId) === index)

        for (const migration of migrations) {
            seenLegacyMigrationKeysRef.current.add(migration.storageKey)
            storeLegacyImageModelMigration(migration.storageKey)
            notifyLegacyImageModelReplacement(migration.original, migration.replacement)
        }

        if (!areStringArraysEqual(selectedModelIds, nextSelectedModelIds)) {
            setSelectedModelIds(nextSelectedModelIds)
        }

        setSelectedModelCounts((prev) => {
            const nextCounts = { ...prev }
            let changed = false

            for (const migration of migrations) {
                const originalCount =
                    nextCounts[migration.original.id] ?? DEFAULT_VARIANTS_PER_MODEL
                delete nextCounts[migration.original.id]

                const replacementCount = nextCounts[migration.replacement.id] ?? 0
                const mergedCount = clampModelCount(
                    migration.replacement,
                    replacementCount + originalCount
                )

                if (nextCounts[migration.replacement.id] !== mergedCount) {
                    nextCounts[migration.replacement.id] = mergedCount
                    changed = true
                }

                if (migration.original.id in prev) {
                    changed = true
                }
            }

            return changed && !areModelCountsEqual(prev, nextCounts) ? nextCounts : prev
        })
    }, [
        creditPlan,
        imageModels,
        selectableImageModels,
        selectedModelIds,
        sessionRevealedLegacyModelIds,
        setSelectedModelCounts,
        setSelectedModelIds
    ])

    useEffect(() => {
        setSelectedModelCounts((prev) => {
            const validCounts = Object.fromEntries(
                Object.entries(prev)
                    .filter(([id]) => imageModels.some((model) => model.id === id))
                    .map(([id, count]) => {
                        const model = imageModels.find((candidate) => candidate.id === id)
                        return [id, Math.max(1, Math.min(count, getModelMaxPerMessage(model!)))]
                    })
            )

            if (Object.keys(validCounts).length > 0) {
                return areModelCountsEqual(prev, validCounts) ? prev : validCounts
            }

            const fallbackCounts =
                imageModels.length > 0 ? { [imageModels[0].id]: DEFAULT_VARIANTS_PER_MODEL } : {}
            return areModelCountsEqual(prev, fallbackCounts) ? prev : fallbackCounts
        })
    }, [imageModels, setSelectedModelCounts])

    useEffect(() => {
        const container = scrollContainerRef.current
        if (!container) return

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container
            const hasScrollableContent = scrollHeight > clientHeight
            const isScrolledToBottom = scrollHeight - scrollTop - clientHeight < 5
            setShowGradient(hasScrollableContent && !isScrolledToBottom)
        }

        handleScroll()
        container.addEventListener("scroll", handleScroll)

        const resizeObserver = new ResizeObserver(handleScroll)
        resizeObserver.observe(container)

        const mutationObserver = new MutationObserver(handleScroll)
        mutationObserver.observe(container, {
            childList: true,
            subtree: true
        })

        return () => {
            container.removeEventListener("scroll", handleScroll)
            resizeObserver.disconnect()
            mutationObserver.disconnect()
        }
    }, [])

    const generateImage = useAction(api.images_node.generateStandaloneImage)
    const generateFakeImage = useAction(api.images_node.generateFakeStandaloneImage)
    const [generationMode, setGenerationMode] = useState<"real" | "fake" | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const isGenerating = generationMode !== null

    useEffect(() => {
        return () => {
            for (const ref of referenceFilesRef.current) {
                URL.revokeObjectURL(ref.preview)
            }
        }
    }, [])

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (generationPanelDisabled || selectedRequiresPlanUpgrade) {
            if (fileInputRef.current) {
                fileInputRef.current.value = ""
            }
            return
        }

        if (!supportsReferenceImagesForSelection) {
            toast.error("Reference images are not supported for the selected model set")
            if (fileInputRef.current) {
                fileInputRef.current.value = ""
            }
            return
        }

        const files = Array.from(e.target.files || [])
        if (files.length > 0) {
            const newRefs = files.map((file) => ({
                file,
                preview: URL.createObjectURL(file)
            }))
            setReferenceFiles((prev) => [...prev, ...newRefs])
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        if (generationPanelDisabled || selectedRequiresPlanUpgrade) {
            e.preventDefault()
            return
        }

        const items = Array.from(e.clipboardData.items)
        const imageItems = items.filter((item) => item.type.startsWith("image/"))

        if (imageItems.length > 0) {
            if (!supportsReferenceImagesForSelection) {
                e.preventDefault()
                toast.error("Reference images are not supported for the selected model set")
                return
            }

            e.preventDefault()
            const files = imageItems
                .map((item) => item.getAsFile())
                .filter((f): f is File => f !== null)
            const newRefs = files.map((file) => ({
                file,
                preview: URL.createObjectURL(file)
            }))
            setReferenceFiles((prev) => [...prev, ...newRefs])
        }
    }

    const removeReferenceImage = (index: number) => {
        setReferenceFiles((prev) => {
            const newArray = [...prev]
            URL.revokeObjectURL(newArray[index].preview)
            newArray.splice(index, 1)
            return newArray
        })
    }

    const toggleModel = (modelId: string) => {
        if (lockedModelIds.has(modelId)) {
            return
        }

        const toggledModel = imageModels.find((model) => model.id === modelId)
        if (toggledModel && isLegacyImageModel(toggledModel)) {
            sessionRevealedLegacyModelIdsRef.current.add(modelId)
            setSessionRevealedLegacyModelIds((prev) => {
                if (prev.has(modelId)) return prev
                const next = new Set(prev)
                next.add(modelId)
                return next
            })
        }

        const isSelected = selectedModelIds.includes(modelId)
        if (isSelected && selectedModelIds.length === 1) {
            return
        }

        setSelectedModelIds((prev) =>
            isSelected ? prev.filter((id) => id !== modelId) : [...prev, modelId]
        )
        setSelectedModelCounts((prev) => {
            if (isSelected) {
                const next = { ...prev }
                delete next[modelId]
                return next
            }

            return {
                ...prev,
                [modelId]: DEFAULT_VARIANTS_PER_MODEL
            }
        })
    }

    const totalRequestedGenerations = useMemo(
        () =>
            selectedModelIds.reduce(
                (total, modelId) =>
                    total + (selectedModelCounts[modelId] ?? DEFAULT_VARIANTS_PER_MODEL),
                0
            ),
        [selectedModelCounts, selectedModelIds]
    )

    const updateModelCount = (modelId: string, nextCount: number) => {
        const model = imageModels.find((candidate) => candidate.id === modelId)
        if (!model) return

        const modelMax = getModelMaxPerMessage(model)
        const clampedCount = Math.max(1, Math.min(nextCount, modelMax))
        const currentCount = selectedModelCounts[modelId] ?? DEFAULT_VARIANTS_PER_MODEL
        const nextTotal = totalRequestedGenerations - currentCount + clampedCount

        if (nextTotal > MAX_TOTAL_GENERATIONS_PER_RUN) {
            toast.error(`You can generate up to ${MAX_TOTAL_GENERATIONS_PER_RUN} images per run`)
            return
        }

        setSelectedModelCounts((prev) => ({
            ...prev,
            [modelId]: clampedCount
        }))
    }

    const selectedModels = useMemo(
        () => imageModels.filter((model) => selectedModelIds.includes(model.id)),
        [imageModels, selectedModelIds]
    )
    const collapsedVisibleLegacyModelIds = useMemo(() => {
        const visibleLegacyModelIds = new Set(sessionRevealedLegacyModelIds)
        for (const modelId of selectedModelIds) {
            const model = imageModels.find((candidate) => candidate.id === modelId)
            if (model && isLegacyImageModel(model)) {
                visibleLegacyModelIds.add(modelId)
            }
        }

        return new Set(
            imageModels
                .filter((model) => isLegacyImageModel(model) && visibleLegacyModelIds.has(model.id))
                .map((model) => model.id)
        )
    }, [imageModels, selectedModelIds, sessionRevealedLegacyModelIds])
    const visibleImageModels = useMemo(() => {
        const currentModels = imageModels.filter((model) => !isLegacyImageModel(model))
        const legacyModels = imageModels.filter((model) => isLegacyImageModel(model))
        const visibleLegacyModels = expandedLegacyModels
            ? legacyModels
            : legacyModels.filter((model) => collapsedVisibleLegacyModelIds.has(model.id))

        return [...currentModels, ...visibleLegacyModels]
    }, [collapsedVisibleLegacyModelIds, expandedLegacyModels, imageModels])
    const hiddenLegacyModelCount = useMemo(() => {
        if (expandedLegacyModels) return 0

        return imageModels.filter(
            (model) => isLegacyImageModel(model) && !collapsedVisibleLegacyModelIds.has(model.id)
        ).length
    }, [collapsedVisibleLegacyModelIds, expandedLegacyModels, imageModels])
    const visibleSelectedOrRevealedLegacyCount = collapsedVisibleLegacyModelIds.size

    const commonImageSizes = useMemo<SelectableImageAspectRatio[]>(() => {
        if (selectedModels.length === 0) return []

        return getCommonSelectableImageAspectRatios(
            selectedModels.map((model) => model.supportedImageSizes)
        )
    }, [selectedModels])

    useEffect(() => {
        if (
            commonImageSizes.length > 0 &&
            !commonImageSizes.includes(aspectRatio as SelectableImageAspectRatio)
        ) {
            setAspectRatio(commonImageSizes[0])
        }
    }, [commonImageSizes, aspectRatio, setAspectRatio])

    const commonImageResolutions = useMemo(() => {
        if (selectedModels.length === 0) return ["1K"]

        const allSupport = selectedModels.every(
            (m) => m.supportedImageResolutions && m.supportedImageResolutions.length > 0
        )

        if (!allSupport) {
            return ["1K"]
        }

        let intersection = ["1K", "2K", "4K"]
        for (const model of selectedModels) {
            if (model.supportedImageResolutions) {
                intersection = intersection.filter((res) =>
                    model.supportedImageResolutions!.includes(res as "1K" | "2K" | "4K")
                )
            }
        }

        return intersection.length > 0 ? intersection : ["1K"]
    }, [selectedModels])

    useEffect(() => {
        if (commonImageResolutions.length > 0 && !commonImageResolutions.includes(resolution)) {
            setResolution(commonImageResolutions[0] || "1K")
        }
    }, [commonImageResolutions, resolution, setResolution])

    const selectedRequiresPlanUpgrade = useMemo(
        () => selectedModels.some((model) => lockedModelIds.has(model.id)),
        [lockedModelIds, selectedModels]
    )
    const generationPlanLocked =
        creditPlan === "free" && imageModels.length > 0 && selectableImageModels.length === 0
    const generationPanelDisabled = disabled || generationPlanLocked

    const supportsReferenceImagesForSelection = useMemo(
        () =>
            selectedModels.length > 0 &&
            selectedModels.every((model) => model.supportsReferenceImages === true),
        [selectedModels]
    )
    const hasSingleReferenceXaiEdit = useMemo(
        () =>
            referenceFiles.length === 1 &&
            selectedModels.some((model) =>
                model.adapters.some((adapter) => {
                    const providerId = adapter.split(":")[0]
                    return providerId === "xai" || providerId === "i3-xai"
                })
            ),
        [referenceFiles.length, selectedModels]
    )

    const canGenerateBase =
        selectedModelIds.length > 0 && !isGenerating && commonImageSizes.length > 0
    const normalizedPrompt = prompt.trim()
    const canSubmitGeneration =
        canGenerateBase &&
        Boolean(normalizedPrompt) &&
        !generationPanelDisabled &&
        !selectedRequiresPlanUpgrade

    const uploadReferenceKeys = async () => {
        if (referenceFiles.length === 0) {
            return []
        }

        return await Promise.all(
            referenceFiles.map(async ({ file }) => {
                const jwt = await resolveJwtToken(token)
                if (!jwt) {
                    throw new Error("Authentication token unavailable")
                }

                const formData = new FormData()
                formData.append("file", file)
                formData.append("fileName", file.name)

                const response = await fetch(`${browserEnv("VITE_CONVEX_API_URL")}/upload`, {
                    method: "POST",
                    body: formData,
                    headers: {
                        Authorization: `Bearer ${jwt}`
                    }
                })

                const payload = (await response.json()) as {
                    error?: string
                    key?: string
                }

                if (!response.ok || !payload.key) {
                    throw new Error(
                        payload.error || `Failed to upload reference image "${file.name}"`
                    )
                }

                return payload.key
            })
        )
    }

    const handleGenerate = async () => {
        if (generationPanelDisabled || selectedRequiresPlanUpgrade) return
        if (!normalizedPrompt || selectedModelIds.length === 0) return
        if (referenceFiles.length > 0 && !supportsReferenceImagesForSelection) {
            toast.error("Reference images are not supported for the selected model set")
            return
        }

        setGenerationMode("real")
        try {
            const uploadedReferenceKeys = await uploadReferenceKeys()

            const results = await Promise.allSettled(
                selectedModelIds
                    .flatMap((modelId) => {
                        const model = imageModels.find((m) => m.id === modelId)
                        const supportsResolution =
                            model?.supportedImageResolutions &&
                            model.supportedImageResolutions.length > 0
                        const count = selectedModelCounts[modelId] ?? DEFAULT_VARIANTS_PER_MODEL

                        return Array.from({ length: count }, () => async () => {
                            const id = Math.random().toString(36).substring(2, 11)
                            addPendingGeneration({ id, aspectRatio })

                            try {
                                await generateImage({
                                    prompt: normalizedPrompt,
                                    modelId,
                                    aspectRatio,
                                    referenceImageIds: uploadedReferenceKeys,
                                    ...(supportsResolution ? { resolution } : {})
                                })
                            } finally {
                                removePendingGeneration(id)
                            }
                        })
                    })
                    .map((runGeneration) => runGeneration())
            )

            const failedResult = results.find(
                (result): result is PromiseRejectedResult => result.status === "rejected"
            )
            if (failedResult) {
                throw failedResult.reason
            }
        } catch (error) {
            console.error("Failed to generate image:", error)
            toast.error(
                error instanceof Error ? error.message : "Failed to generate image with references"
            )
        } finally {
            setGenerationMode(null)
        }
    }

    const handleFakeGenerate = async () => {
        if (generationPanelDisabled || selectedRequiresPlanUpgrade) return
        if (!isDevMode || !normalizedPrompt || selectedModelIds.length === 0) return
        if (referenceFiles.length > 0 && !supportsReferenceImagesForSelection) {
            toast.error("Reference images are not supported for the selected model set")
            return
        }

        setGenerationMode("fake")
        try {
            const uploadedReferenceKeys = await uploadReferenceKeys()
            const results = await Promise.allSettled(
                selectedModelIds
                    .flatMap((modelId) => {
                        const model = imageModels.find((m) => m.id === modelId)
                        const supportsResolution =
                            model?.supportedImageResolutions &&
                            model.supportedImageResolutions.length > 0
                        const count = selectedModelCounts[modelId] ?? DEFAULT_VARIANTS_PER_MODEL

                        return Array.from({ length: count }, (_, index) => async () => {
                            const id = Math.random().toString(36).substring(2, 11)
                            addPendingGeneration({ id, aspectRatio })

                            try {
                                await generateFakeImage({
                                    prompt: normalizedPrompt,
                                    modelId,
                                    aspectRatio,
                                    variantIndex: index + 1,
                                    referenceImageIds: uploadedReferenceKeys,
                                    responseTimeSeconds: fakeResponseTimeSeconds,
                                    ...(supportsResolution ? { resolution } : {})
                                })
                            } finally {
                                removePendingGeneration(id)
                            }
                        })
                    })
                    .map((runGeneration) => runGeneration())
            )

            const failedResult = results.find(
                (result): result is PromiseRejectedResult => result.status === "rejected"
            )
            if (failedResult) {
                throw failedResult.reason
            }
        } catch (error) {
            console.error("Failed to run fake image generation:", error)
            toast.error(
                error instanceof Error ? error.message : "Failed to run fake image generation"
            )
        } finally {
            setGenerationMode(null)
        }
    }

    return (
        <div className="custom-scrollbar relative flex h-full w-full flex-col text-foreground text-sm">
            <fieldset
                disabled={generationPanelDisabled}
                className={cn(
                    "flex h-full w-full flex-col",
                    generationPanelDisabled && "opacity-50"
                )}
            >
                {/* Prompt Section */}
                <div className="space-y-3 border-b p-4">
                    <div className="flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                        <Sparkles className="h-3.5 w-3.5" /> PROMPT
                    </div>
                    <Textarea
                        placeholder="Describe your image..."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onPaste={handlePaste}
                        className="field-sizing-fixed max-h-[24dvh] min-h-[112px] resize-none overflow-y-auto rounded-md border-0 bg-muted/30 px-4 py-3 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/30"
                    />
                </div>

                {/* References Section */}
                <div className="space-y-3 border-b p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                            <svg
                                className="h-3.5 w-3.5"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                            </svg>
                            REFERENCES
                        </div>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={
                                !supportsReferenceImagesForSelection || selectedRequiresPlanUpgrade
                            }
                            className="text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                    </div>

                    {!supportsReferenceImagesForSelection && (
                        <p className="text-[11px] text-muted-foreground">
                            Reference images are unavailable for the current model selection.
                        </p>
                    )}

                    {referenceFiles.length > 0 && (
                        <div className="custom-scrollbar flex gap-2 overflow-x-auto pb-1">
                            {referenceFiles.map((ref, index) => (
                                <div
                                    key={index}
                                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-background"
                                >
                                    <img
                                        src={ref.preview}
                                        className="h-full w-full object-cover"
                                        alt="ref"
                                    />
                                    <button
                                        type="button"
                                        className="absolute top-1 right-1 rounded-full bg-background/50 p-0.5 text-foreground transition-colors hover:bg-background/80"
                                        onClick={() => removeReferenceImage(index)}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        multiple
                        ref={fileInputRef}
                        onChange={handleFileChange}
                    />
                </div>

                <div className="relative flex min-h-0 flex-1 flex-col">
                    <div
                        ref={scrollContainerRef}
                        className="custom-scrollbar flex-1 overflow-y-auto"
                    >
                        {/* Input Section */}
                        <div className="space-y-3 border-b p-4">
                            <div className="flex items-center justify-between font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                <div className="flex items-center gap-2">
                                    <svg
                                        className="h-3.5 w-3.5"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                                    </svg>
                                    MODELS
                                </div>
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                    {selectedModelIds.length} active • {totalRequestedGenerations}{" "}
                                    outputs
                                </span>
                            </div>

                            <div className="flex flex-col space-y-1">
                                {visibleImageModels.map((model) => {
                                    const isSelected = selectedModelIds.includes(model.id)
                                    const modelPlanLocked = lockedModelIds.has(model.id)
                                    const isLegacyModel = isLegacyImageModel(model)
                                    const modelCount =
                                        selectedModelCounts[model.id] ?? DEFAULT_VARIANTS_PER_MODEL
                                    const modelMaxPerMessage = getModelMaxPerMessage(model)
                                    const canIncrement =
                                        isSelected &&
                                        modelCount < modelMaxPerMessage &&
                                        totalRequestedGenerations < MAX_TOTAL_GENERATIONS_PER_RUN
                                    return (
                                        <div
                                            key={model.id}
                                            className={cn(
                                                "group rounded-md p-2 transition-all duration-200",
                                                modelPlanLocked && "cursor-not-allowed opacity-50",
                                                isSelected
                                                    ? "bg-primary/15 text-primary"
                                                    : "text-muted-foreground hover:bg-muted/50"
                                            )}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => toggleModel(model.id)}
                                                disabled={modelPlanLocked}
                                                className="flex w-full items-center justify-between p-1 text-left disabled:cursor-not-allowed"
                                            >
                                                <div className="flex min-w-0 flex-col">
                                                    <span
                                                        className={cn(
                                                            "truncate font-medium",
                                                            isSelected ? "text-foreground" : ""
                                                        )}
                                                    >
                                                        {model.name}
                                                    </span>
                                                    <span className="mt-0.5 text-[10px] opacity-70">
                                                        {modelPlanLocked
                                                            ? "Pro plan required"
                                                            : `${
                                                                  isLegacyModel ? "Legacy • " : ""
                                                              }Up to ${modelMaxPerMessage} per run`}
                                                    </span>
                                                </div>

                                                <div
                                                    className={cn(
                                                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                                                        isSelected
                                                            ? "border-primary bg-primary"
                                                            : "border-muted-foreground/30 group-hover:border-muted-foreground/50"
                                                    )}
                                                >
                                                    {isSelected && (
                                                        <svg
                                                            className="h-2.5 w-2.5 text-primary-foreground"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="3"
                                                        >
                                                            <polyline points="20 6 9 17 4 12" />
                                                        </svg>
                                                    )}
                                                </div>
                                            </button>

                                            {isSelected && (
                                                <div className="mt-2 flex items-center justify-between rounded-md border border-primary/10 bg-background/40 px-2 py-1.5">
                                                    <span className="text-[10px] uppercase tracking-wider opacity-70">
                                                        Variants
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                updateModelCount(
                                                                    model.id,
                                                                    modelCount - 1
                                                                )
                                                            }
                                                            disabled={
                                                                modelPlanLocked || modelCount <= 1
                                                            }
                                                            className="flex h-6 w-6 items-center justify-center rounded border border-border/60 text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
                                                        >
                                                            <Minus className="h-3 w-3" />
                                                        </button>
                                                        <span className="min-w-8 text-center font-medium text-foreground text-xs">
                                                            {modelCount}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                updateModelCount(
                                                                    model.id,
                                                                    modelCount + 1
                                                                )
                                                            }
                                                            disabled={
                                                                modelPlanLocked || !canIncrement
                                                            }
                                                            className="flex h-6 w-6 items-center justify-center rounded border border-border/60 text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
                                                        >
                                                            <Plus className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                                {hiddenLegacyModelCount > 0 && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="mt-1 h-9 w-full justify-center gap-2 text-muted-foreground text-xs hover:text-foreground"
                                        onClick={() => setExpandedLegacyModels(true)}
                                    >
                                        <Archive className="h-3.5 w-3.5" />
                                        {visibleSelectedOrRevealedLegacyCount > 0
                                            ? "Show more legacy models"
                                            : "Show legacy models"}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Aspect Ratio Section */}
                        <div className="space-y-4 p-4">
                            <div className="flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                <svg
                                    className="h-3.5 w-3.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                </svg>
                                ASPECT RATIO
                            </div>

                            <div className="custom-scrollbar flex gap-2 overflow-x-auto pb-2">
                                {SELECTABLE_IMAGE_ASPECT_RATIOS.map((size) => {
                                    const isAvailable = commonImageSizes.includes(size)
                                    const isSelected = aspectRatio === size
                                    const [wStr, hStr] = size.split(":")
                                    const w = Number.parseInt(wStr) || 1
                                    const h = Number.parseInt(hStr) || 1

                                    return (
                                        <button
                                            type="button"
                                            key={size}
                                            onClick={() => isAvailable && setAspectRatio(size)}
                                            disabled={!isAvailable}
                                            className={cn(
                                                "flex min-w-[36px] shrink-0 flex-col items-center gap-1.5 rounded-md p-2 transition-all",
                                                !isAvailable && "cursor-not-allowed opacity-30",
                                                isSelected && isAvailable
                                                    ? "bg-primary/15 text-primary"
                                                    : "text-muted-foreground hover:bg-muted/50"
                                            )}
                                        >
                                            <div className="flex h-5 items-center justify-center">
                                                <div
                                                    className={cn(
                                                        "rounded-[2px] border-2",
                                                        isSelected
                                                            ? "border-primary"
                                                            : "border-muted-foreground/50"
                                                    )}
                                                    style={{
                                                        width:
                                                            w >= h
                                                                ? "18px"
                                                                : `${Math.max(10, 18 * (w / h))}px`,
                                                        height:
                                                            h >= w
                                                                ? "18px"
                                                                : `${Math.max(10, 18 * (h / w))}px`
                                                    }}
                                                />
                                            </div>
                                            <span
                                                className={cn(
                                                    "font-medium text-[9px]",
                                                    isSelected ? "text-foreground" : ""
                                                )}
                                            >
                                                {size}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                            {hasSingleReferenceXaiEdit && (
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    xAI single-image edits keep the input image's aspect ratio. The
                                    aspect ratio picker only reliably applies to text-to-image and
                                    multi-image edits.
                                </p>
                            )}
                        </div>

                        {/* Resolution Section */}
                        <div className="space-y-4 p-4 pt-0">
                            <div className="flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                <svg
                                    className="h-3.5 w-3.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                    <line x1="12" y1="22.08" x2="12" y2="12" />
                                </svg>
                                RESOLUTION
                            </div>

                            <div className="custom-scrollbar flex gap-2 overflow-x-auto pb-2">
                                {["1K", "2K", "4K"].map((res) => {
                                    const isAvailable = commonImageResolutions.includes(res)
                                    const isSelected = resolution === res

                                    return (
                                        <button
                                            type="button"
                                            key={res}
                                            onClick={() => isAvailable && setResolution(res)}
                                            disabled={!isAvailable}
                                            className={cn(
                                                "flex min-w-[60px] flex-1 shrink-0 flex-col items-center justify-center rounded-md p-2 transition-all",
                                                !isAvailable && "cursor-not-allowed opacity-30",
                                                isSelected && isAvailable
                                                    ? "border border-primary/20 bg-primary/15 text-primary"
                                                    : "border border-transparent text-muted-foreground hover:bg-muted/50"
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "font-medium text-xs",
                                                    isSelected ? "text-foreground" : ""
                                                )}
                                            >
                                                {res.toLowerCase()}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                    <div
                        className={cn(
                            "pointer-events-none absolute right-0 bottom-0 left-0 h-20 bg-gradient-to-t from-sidebar via-sidebar/60 to-transparent transition-opacity duration-300",
                            showGradient ? "opacity-100" : "opacity-0"
                        )}
                    />
                </div>

                {/* Bottom Generate Button */}
                <div className="sticky bottom-0 z-10 border-t bg-sidebar p-4">
                    {isDevMode && (
                        <div className="mb-3 rounded-md border border-border/60 bg-background/50 p-3">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
                                    Time To Respond
                                </span>
                                <span className="font-medium text-foreground text-sm">
                                    {fakeResponseTimeSeconds}s
                                </span>
                            </div>
                            <Slider
                                value={[fakeResponseTimeSeconds]}
                                min={5}
                                max={90}
                                step={1}
                                disabled={isGenerating}
                                onValueChange={(value) => {
                                    const nextValue = value[0]
                                    if (typeof nextValue === "number") {
                                        setFakeResponseTimeSeconds(nextValue)
                                    }
                                }}
                            />
                            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>5s min</span>
                                <span>90s max</span>
                            </div>
                        </div>
                    )}
                    {isDevMode && (
                        <Button
                            onClick={handleFakeGenerate}
                            disabled={!canSubmitGeneration}
                            variant="outline"
                            className="mb-2 flex h-11 w-full items-center justify-center gap-2 rounded-md border-border border-dashed bg-background font-medium hover:bg-muted/50"
                        >
                            {generationMode === "fake" ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Fake Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                                    {totalRequestedGenerations > 1
                                        ? `Fake Generation (${totalRequestedGenerations})`
                                        : "Fake Generation"}
                                </>
                            )}
                        </Button>
                    )}
                    <Button
                        onClick={handleGenerate}
                        disabled={disabled || !canSubmitGeneration}
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary font-medium text-secondary-foreground hover:bg-secondary/80"
                    >
                        {generationMode === "real" ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <Sparkles className="h-4 w-4 text-muted-foreground" />
                                {totalRequestedGenerations > 1
                                    ? `Generate ${totalRequestedGenerations} Images`
                                    : "Generate"}
                            </>
                        )}
                    </Button>
                </div>
            </fieldset>
            {generationPanelDisabled && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-sidebar/70 p-6 text-center backdrop-blur-sm">
                    <div className="max-w-xs rounded-lg border border-border/60 bg-background/90 p-4 shadow-lg">
                        <p className="font-medium text-sm">
                            {disabled ? "Image generation unavailable" : "Upgrade to Pro"}
                        </p>
                        <p className="mt-1 text-muted-foreground text-xs leading-5">
                            {disabled
                                ? "You cannot generate images in the Archive view. Switch to the Library view to continue generating images."
                                : "Free users may view their image library, but creating new images requires a Pro plan."}
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
