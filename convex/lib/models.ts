export * from "./models/types"
export * from "./models/lifecycle"

import { ANTHROPIC_MODELS } from "./models/anthropic"
import { CANOPYLABS_MODELS } from "./models/canopylabs"
import { DEEPGRAM_MODELS } from "./models/deepgram"
import { FISH_AUDIO_MODELS } from "./models/fish_audio"
import { DEEPSEEK_MODELS } from "./models/deepseek"
import { FAL_IMAGE_MODELS } from "./models/fal"
import { GOOGLE_MODELS } from "./models/google"
import { META_MODELS } from "./models/meta"
import { MICROSOFT_MODELS } from "./models/microsoft"
import { MINIMAX_MODELS } from "./models/minimax"
import { MOONSHOT_MODELS } from "./models/moonshot"
import { OPENAI_MODELS } from "./models/openai"
import { QWEN_MODELS } from "./models/qwen"
import type { SharedModel } from "./models/types"
import { XAI_MODELS } from "./models/xai"
import { XIAOMI_MODELS } from "./models/xiaomi"
import { ZAI_MODELS } from "./models/zai"

export const getOpenRouterProviderModelId = (model: Pick<SharedModel, "adapters">) => {
    const adapter = model.adapters.find((candidate) => candidate.startsWith("openrouter:"))
    return adapter?.slice("openrouter:".length)
}

export const MODELS_SHARED: SharedModel[] = [
    ...OPENAI_MODELS,
    ...DEEPSEEK_MODELS,
    ...ZAI_MODELS,
    ...MOONSHOT_MODELS,
    ...QWEN_MODELS,
    ...XIAOMI_MODELS,
    ...MINIMAX_MODELS,
    ...ANTHROPIC_MODELS,
    ...GOOGLE_MODELS,
    ...META_MODELS,
    ...MICROSOFT_MODELS,
    ...CANOPYLABS_MODELS,
    ...DEEPGRAM_MODELS,
    ...FISH_AUDIO_MODELS,
    ...XAI_MODELS,
    ...FAL_IMAGE_MODELS
] as const

export const SHARED_MODELS_VERSION = JSON.stringify(MODELS_SHARED)
