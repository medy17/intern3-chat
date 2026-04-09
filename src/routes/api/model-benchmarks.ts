import {
    type ArtificialAnalysisModelType,
    MODELS_SHARED,
    type SharedModel
} from "@/convex/lib/models"
import { loadServerEnv } from "@/lib/load-server-env"
import type { ModelBenchmarkCard, ModelBenchmarkPayload } from "@/lib/model-benchmarks"
import { createFileRoute } from "@tanstack/react-router"

loadServerEnv()

const ARTIFICIAL_ANALYSIS_URL = "https://artificialanalysis.ai/"
const DATASET_TTL_MS = 1000 * 60 * 30

const DATASET_URLS: Record<ArtificialAnalysisModelType, string> = {
    llm: "https://artificialanalysis.ai/api/v2/data/llms/models",
    "text-to-image": "https://artificialanalysis.ai/api/v2/data/media/text-to-image",
    "image-editing": "https://artificialanalysis.ai/api/v2/data/media/image-editing"
}

type DatasetEntry = {
    id?: string
    name?: string
    slug?: string
    model_creator?: {
        id?: string
        name?: string
        slug?: string
    }
    evaluations?: Record<string, number | undefined>
    elo?: number
    rank?: number
    ci95?: string
}

type DatasetCacheEntry = {
    expiresAt: number
    data: DatasetEntry[] | null
    error?: string
}

type DatasetResult = {
    data: DatasetEntry[] | null
    hasApiKey: boolean
    fromCache: boolean
    error?: string
}

const datasetCache = new Map<ArtificialAnalysisModelType, DatasetCacheEntry>()

const toUnavailablePayload = (options?: {
    retryable?: boolean
    errorCode?: string
}): ModelBenchmarkPayload => ({
    available: false,
    retryable: options?.retryable,
    errorCode: options?.errorCode,
    sourceLabel: "Artificial Analysis",
    sourceUrl: ARTIFICIAL_ANALYSIS_URL,
    fetchedAt: new Date().toISOString(),
    cards: []
})

const normalizeMatchValue = (value?: string) =>
    value
        ?.toLowerCase()
        .replace(/\bpreview\b/g, "")
        .replace(/\bthinking\b/g, "")
        .replace(/[^a-z0-9]+/g, "") ?? ""

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value)

const getBenchmarkType = (model: SharedModel): ArtificialAnalysisModelType =>
    model.artificialAnalysis?.type ?? (model.mode === "image" ? "text-to-image" : "llm")

const getCachedDataset = async (
    type: ArtificialAnalysisModelType,
    options?: {
        bypassCache?: boolean
    }
): Promise<DatasetResult> => {
    const now = Date.now()
    const cached = datasetCache.get(type)
    if (!options?.bypassCache && cached && cached.expiresAt > now) {
        return {
            data: cached.data,
            hasApiKey: true,
            fromCache: true,
            error: cached.error
        }
    }

    const apiKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY?.trim()
    if (!apiKey) {
        if (cached?.data) {
            return {
                data: cached.data,
                hasApiKey: false,
                fromCache: true,
                error: "stale_missing_api_key"
            }
        }

        return {
            data: null,
            hasApiKey: false,
            fromCache: false,
            error: "missing_api_key"
        }
    }

    try {
        const response = await fetch(DATASET_URLS[type], {
            headers: {
                "x-api-key": apiKey
            }
        })

        if (!response.ok) {
            const error = `upstream_${response.status}`
            const retryAfterHeader = response.headers.get("retry-after")
            const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : Number.NaN
            const backoffMs =
                Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 1000 * 60 * 5

            if (cached?.data) {
                datasetCache.set(type, {
                    expiresAt: now + backoffMs,
                    data: cached.data,
                    error: `stale_${error}`
                })

                return {
                    data: cached.data,
                    hasApiKey: true,
                    fromCache: true,
                    error: `stale_${error}`
                }
            }

            return {
                data: null,
                hasApiKey: true,
                fromCache: false,
                error
            }
        }

        const parsed = (await response.json()) as { data?: unknown }
        const data = Array.isArray(parsed.data) ? (parsed.data as DatasetEntry[]) : null

        if (data) {
            datasetCache.set(type, {
                expiresAt: now + DATASET_TTL_MS,
                data,
                error: undefined
            })
        }

        return {
            data,
            hasApiKey: true,
            fromCache: false
        }
    } catch (error) {
        if (cached?.data) {
            datasetCache.set(type, {
                expiresAt: now + 1000 * 60 * 5,
                data: cached.data,
                error: "stale_fetch_failed"
            })

            return {
                data: cached.data,
                hasApiKey: true,
                fromCache: true,
                error: "stale_fetch_failed"
            }
        }

        return {
            data: null,
            hasApiKey: true,
            fromCache: false,
            error: error instanceof Error ? error.message : "fetch_failed"
        }
    }
}

const findDatasetEntry = (model: SharedModel, dataset: DatasetEntry[]) => {
    const artificialAnalysis = model.artificialAnalysis

    if (artificialAnalysis?.id) {
        const matchedById = dataset.find((entry) => entry.id === artificialAnalysis.id)
        if (matchedById) return matchedById
    }

    if (artificialAnalysis?.slug) {
        const matchedBySlug = dataset.find((entry) => entry.slug === artificialAnalysis.slug)
        if (matchedBySlug) return matchedBySlug
    }

    const candidates = new Set(
        [model.id, model.name, model.shortName]
            .map((value) => normalizeMatchValue(value))
            .filter(Boolean)
    )

    return (
        dataset.find((entry) => {
            const normalizedName = normalizeMatchValue(entry.name)
            const normalizedSlug = normalizeMatchValue(entry.slug)

            return candidates.has(normalizedName) || candidates.has(normalizedSlug)
        }) ?? null
    )
}

const buildLlmCards = (entry: DatasetEntry): ModelBenchmarkCard[] => {
    const evaluations = entry.evaluations ?? {}
    const cards: ModelBenchmarkCard[] = []

    const formatBenchmarkScore = (value: number) => `${value.toFixed(1)}%`

    const addCard = (
        key: string,
        title: string,
        value: unknown,
        subtitle?: string,
        breakdownLabel?: string,
        breakdownValue?: string
    ) => {
        if (!isFiniteNumber(value)) return

        cards.push({
            key,
            title,
            value,
            displayValue: formatBenchmarkScore(value),
            subtitle,
            breakdownLabel,
            breakdownValue
        })
    }

    addCard(
        "intelligence",
        "Intelligence",
        evaluations.artificial_analysis_intelligence_index,
        undefined,
        isFiniteNumber(evaluations.gpqa)
            ? "GPQA"
            : isFiniteNumber(evaluations.mmlu_pro)
              ? "MMLU Pro"
              : isFiniteNumber(evaluations.hle)
                ? "HLE"
                : undefined,
        isFiniteNumber(evaluations.gpqa)
            ? formatBenchmarkScore(evaluations.gpqa * 100)
            : isFiniteNumber(evaluations.mmlu_pro)
              ? formatBenchmarkScore(evaluations.mmlu_pro * 100)
              : isFiniteNumber(evaluations.hle)
                ? formatBenchmarkScore(evaluations.hle * 100)
                : undefined
    )
    addCard(
        "coding",
        "Coding",
        evaluations.artificial_analysis_coding_index,
        undefined,
        isFiniteNumber(evaluations.scicode)
            ? "SciCode"
            : isFiniteNumber(evaluations.livecodebench)
              ? "LiveCodeBench"
              : undefined,
        isFiniteNumber(evaluations.scicode)
            ? formatBenchmarkScore(evaluations.scicode * 100)
            : isFiniteNumber(evaluations.livecodebench)
              ? formatBenchmarkScore(evaluations.livecodebench * 100)
              : undefined
    )
    addCard("math", "Math", evaluations.artificial_analysis_math_index, undefined)

    if (cards.at(-1)?.key === "math") {
        const mathCard = cards[cards.length - 1]
        mathCard.breakdownLabel = isFiniteNumber(evaluations.aime)
            ? "AIME"
            : isFiniteNumber(evaluations.aime_25)
              ? "AIME 2025"
              : isFiniteNumber(evaluations.math_500)
                ? "Math 500"
                : undefined
        mathCard.breakdownValue = isFiniteNumber(evaluations.aime)
            ? formatBenchmarkScore(evaluations.aime * 100)
            : isFiniteNumber(evaluations.aime_25)
              ? formatBenchmarkScore(evaluations.aime_25 * 100)
              : isFiniteNumber(evaluations.math_500)
                ? formatBenchmarkScore(evaluations.math_500 * 100)
                : undefined
    }

    if (cards.length === 0) {
        addCard(
            "gpqa",
            "GPQA",
            isFiniteNumber(evaluations.gpqa) ? evaluations.gpqa * 100 : undefined,
            "Benchmark Score"
        )
        addCard(
            "scicode",
            "SciCode",
            isFiniteNumber(evaluations.scicode) ? evaluations.scicode * 100 : undefined,
            "Benchmark Score"
        )
        addCard(
            "aime",
            "AIME",
            isFiniteNumber(evaluations.aime) ? evaluations.aime * 100 : undefined,
            "Benchmark Score"
        )
    }

    return cards.slice(0, 3)
}

const buildMediaCards = (entry: DatasetEntry): ModelBenchmarkCard[] => {
    const cards: ModelBenchmarkCard[] = []

    if (isFiniteNumber(entry.elo)) {
        cards.push({
            key: "elo",
            title: "Image Quality",
            value: entry.elo,
            displayValue: `${Math.round(entry.elo)}`,
            subtitle: isFiniteNumber(entry.rank) ? `Rank #${entry.rank}` : "ELO Rating"
        })
    }

    return cards
}

const buildPayload = (
    entry: DatasetEntry | null,
    type: ArtificialAnalysisModelType,
    options?: {
        retryable?: boolean
        errorCode?: string
    }
): ModelBenchmarkPayload => {
    if (!entry) {
        return toUnavailablePayload(options)
    }

    const cards = type === "llm" ? buildLlmCards(entry) : buildMediaCards(entry)

    if (cards.length === 0) {
        return toUnavailablePayload(options)
    }

    return {
        available: true,
        sourceLabel: "Artificial Analysis",
        sourceUrl: ARTIFICIAL_ANALYSIS_URL,
        fetchedAt: new Date().toISOString(),
        cards
    }
}

export const Route = createFileRoute("/api/model-benchmarks")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const url = new URL(request.url)
                const modelId = url.searchParams.get("modelId")?.trim()
                const refresh = url.searchParams.get("refresh") === "1"
                const debug = url.searchParams.get("debug") === "1"

                if (!modelId) {
                    return Response.json({ error: "Missing modelId" }, { status: 400 })
                }

                const model = MODELS_SHARED.find((candidate) => candidate.id === modelId)
                if (!model) {
                    return Response.json({ error: "Unknown model" }, { status: 404 })
                }

                const type = getBenchmarkType(model)
                const datasetResult = await getCachedDataset(type, {
                    bypassCache: refresh
                })
                const entry = datasetResult.data
                    ? findDatasetEntry(model, datasetResult.data)
                    : null
                const payload = buildPayload(entry, type, {
                    retryable:
                        !entry &&
                        (datasetResult.error === "fetch_failed" ||
                            datasetResult.error?.startsWith("upstream_") ||
                            datasetResult.error?.startsWith("stale_upstream_") ||
                            datasetResult.error === "stale_fetch_failed"),
                    errorCode: !entry ? datasetResult.error : undefined
                })
                const responseBody = debug
                    ? {
                          ...payload,
                          debug: {
                              hasApiKey: datasetResult.hasApiKey,
                              fromCache: datasetResult.fromCache,
                              error: datasetResult.error ?? null,
                              benchmarkType: type,
                              artificialAnalysisRef: model.artificialAnalysis ?? null,
                              datasetSize: datasetResult.data?.length ?? 0,
                              matchedEntry: entry
                                  ? {
                                        id: entry.id ?? null,
                                        name: entry.name ?? null,
                                        slug: entry.slug ?? null
                                    }
                                  : null
                          }
                      }
                    : payload
                const cacheControl = payload.available
                    ? "public, max-age=1800, stale-while-revalidate=86400"
                    : payload.retryable
                      ? "no-store"
                      : "public, max-age=300, stale-while-revalidate=600"

                return Response.json(responseBody, {
                    headers: {
                        "Cache-Control": cacheControl
                    }
                })
            }
        }
    }
})

export const ServerRoute = Route
