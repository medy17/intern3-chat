import {
    BlackForestLabsIcon,
    ClaudeIcon,
    DeepSeekIcon,
    FalAIIcon,
    GeminiIcon,
    GrokIcon,
    GroqIcon,
    MetaIcon,
    MiniMaxIcon,
    MoonshotLogo,
    OpenAIIcon,
    OpenRouterIcon,
    QwenIcon,
    StabilityIcon,
    XiaomiIcon,
    ZAIIcon
} from "@/components/brand-icons"
import { Badge } from "@/components/ui/badge"
import type { SharedModel } from "@/convex/lib/models"
import type { DisplayModel } from "@/lib/models-providers-shared"
import { FAVORITES_SECTION_ID } from "@/lib/model-favorites"
import { Server, Star } from "lucide-react"

const getDeveloperBrandIcon = (developer?: string, className = "size-4") => {
    switch (developer?.trim()) {
        case "Z.ai":
            return <ZAIIcon className={className} />
        case "Moonshot AI":
            return <MoonshotLogo className={`${className} rounded-sm`} />
        case "DeepSeek":
            return <DeepSeekIcon className={`${className} rounded-sm`} />
        case "Qwen":
            return <QwenIcon className={className} />
        case "Xiaomi":
            return <XiaomiIcon className={className} />
        case "MiniMax":
            return <MiniMaxIcon className={className} />
        case "Meta":
            return <MetaIcon className={className} />
        default:
            return null
    }
}

export const getProviderIcon = (model: DisplayModel, isCustom: boolean) => {
    if (isCustom) {
        return <Badge className="text-xs">Custom</Badge>
    }

    const sharedModel = model as SharedModel
    if (sharedModel.customIcon || sharedModel.adapters) {
        const firstAdapter = sharedModel.adapters?.[0]
        const icon = sharedModel.customIcon ?? firstAdapter?.split(":")[0]

        switch (icon) {
            case "i3-openai":
            case "openai":
                return <OpenAIIcon className="size-4" />
            case "i3-anthropic":
            case "anthropic":
                return <ClaudeIcon className="size-4" />
            case "i3-google":
            case "google":
                return <GeminiIcon className="size-4" />
            case "i3-xai":
            case "xai":
                return <GrokIcon className="size-4" />
            case "i3-groq":
            case "groq":
                return <GroqIcon className="size-4" />
            case "i3-fal":
            case "fal":
                return <FalAIIcon className="size-4" />
            case "openrouter":
                return (
                    getDeveloperBrandIcon(sharedModel.developer) ?? (
                        <OpenRouterIcon className="size-4" />
                    )
                )
            case "bflabs":
                return <BlackForestLabsIcon className="size-4" />
            case "stability-ai":
                return <StabilityIcon className="size-4" />
            case "meta":
                return <MetaIcon className="size-4" />
            default:
                return <Badge className="text-xs">Built-in</Badge>
        }
    }

    return <Badge className="text-xs">Built-in</Badge>
}

export const getProviderSectionIcon = (
    providerId: string,
    models?: DisplayModel[],
    className = "size-4"
) => {
    if (providerId.startsWith("openrouter-developer:")) {
        const developer = models?.find((model) => !("isCustom" in model && model.isCustom)) as
            | SharedModel
            | undefined
        return (
            getDeveloperBrandIcon(developer?.developer, className) ?? (
                <OpenRouterIcon className={className} />
            )
        )
    }

    switch (providerId) {
        case FAVORITES_SECTION_ID:
            return <Star className={className} />
        case "openai":
            return <OpenAIIcon className={className} />
        case "anthropic":
            return <ClaudeIcon className={className} />
        case "google":
            return <GeminiIcon className={className} />
        case "xai":
            return <GrokIcon className={className} />
        case "groq":
            return <GroqIcon className={className} />
        case "fal":
            return <FalAIIcon className={className} />
        case "openrouter":
            return <OpenRouterIcon className={className} />
        default:
            return <Server className={className} />
    }
}
