import { PersonaAvatar } from "@/components/persona-avatar"
import { PromptInputAction } from "@/components/prompt-kit/prompt-input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useSession } from "@/hooks/auth-hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import {
    notifyModelReplacement,
    resolveAvailableModelReplacement
} from "@/hooks/use-model-lifecycle-migration"
import { useChatStore } from "@/lib/chat-store"
import { useDiskCachedQuery } from "@/lib/convex-cached-query"
import { DefaultSettings } from "@/lib/default-user-settings"
import { useModelStore } from "@/lib/model-store"
import { useAvailableModels } from "@/lib/models-providers-shared"
import { useSharedModels } from "@/lib/shared-models"
import { useConvexAuth } from "@convex-dev/react-query"
import { useQuery } from "convex/react"
import { Sparkles } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useMemo } from "react"
import { toast } from "sonner"

type PersonaOption = {
    source: "builtin" | "user"
    id: string
    name: string
    shortName: string
    description: string
    conversationStarters: string[]
    defaultModelId: string
    avatarKind?: "builtin" | "r2"
    avatarValue?: string
    avatarMimeType?: string
}

const getSelectValue = (source: "default" | "builtin" | "user", id?: string) =>
    source === "default" ? "default" : `${source}:${id}`

const personaChromeTransition = {
    duration: 0.2,
    ease: [0.16, 1, 0.3, 1]
} as const

function PersonaSelectItem({ persona }: { persona: PersonaOption }) {
    return (
        <div className="flex min-w-0 items-center gap-2">
            <PersonaAvatar
                name={persona.name}
                avatarKind={persona.avatarKind}
                avatarValue={persona.avatarValue}
                className="size-5"
            />
            <span className="truncate">{persona.name}</span>
        </div>
    )
}

export function PersonaSelector({ threadId }: { threadId?: string }) {
    const session = useSession()
    const auth = useConvexAuth()
    const isMobile = useIsMobile()
    const { selectedModel, setSelectedModel } = useModelStore()
    const { selectedPersona, setSelectedPersona } = useChatStore()
    const thread = useQuery(
        api.threads.getThread,
        threadId ? { threadId: threadId as Id<"threads"> } : "skip"
    )
    const pickerOptions = useQuery(
        api.personas.listPersonaPickerOptions,
        session.user?.id && !auth.isLoading ? {} : "skip"
    )
    const userSettings = useDiskCachedQuery(
        api.settings.getUserSettings,
        {
            key: "user-settings",
            default: DefaultSettings(session.user?.id ?? "CACHE"),
            forceCache: true
        },
        session.user?.id && !auth.isLoading ? {} : "skip"
    )
    const { availableModels } = useAvailableModels(
        "error" in userSettings ? undefined : userSettings
    )
    const { models: sharedModels } = useSharedModels()
    const availableModelIds = useMemo(
        () => new Set(availableModels.map((model) => model.id)),
        [availableModels]
    )

    const allOptions = useMemo<PersonaOption[]>(() => {
        if (!pickerOptions) return []
        return [...pickerOptions.builtIns, ...pickerOptions.userPersonas]
    }, [pickerOptions])

    const selectedValue = getSelectValue(selectedPersona.source, selectedPersona.id)

    const selectedOption = useMemo(
        () =>
            selectedPersona.source === "default"
                ? null
                : (allOptions.find(
                      (option) =>
                          option.source === selectedPersona.source &&
                          option.id === selectedPersona.id
                  ) ?? null),
        [allOptions, selectedPersona]
    )
    const selectedLabel = selectedOption
        ? isMobile
            ? selectedOption.shortName
            : selectedOption.name
        : "Default"

    const lockedPersonaName =
        threadId &&
        (thread?.personaName ??
            (thread === undefined && selectedOption
                ? isMobile
                    ? selectedOption.shortName
                    : selectedOption.name
                : null))
    const lockedAvatarKind =
        threadId &&
        (thread?.personaAvatarKind ??
            (thread === undefined && selectedOption ? selectedOption.avatarKind : undefined))
    const lockedAvatarValue =
        threadId &&
        (thread?.personaAvatarValue ??
            (thread === undefined && selectedOption ? selectedOption.avatarValue : undefined))

    return (
        <motion.div layout className="shrink-0 overflow-hidden">
            <AnimatePresence initial={false} mode="popLayout">
                {!threadId ? (
                    <motion.div
                        key="persona-picker"
                        layout
                        initial={{ opacity: 0, x: -12, scale: 0.96 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -12, scale: 0.96 }}
                        transition={personaChromeTransition}
                    >
                        <PromptInputAction tooltip="Select persona">
                            <Select
                                value={selectedValue}
                                onValueChange={(value) => {
                                    if (value === "default") {
                                        setSelectedPersona({ source: "default" })
                                        return
                                    }

                                    const [source, id] = value.split(":") as [
                                        "builtin" | "user",
                                        string
                                    ]
                                    const option = allOptions.find(
                                        (candidate) =>
                                            candidate.source === source && candidate.id === id
                                    )

                                    if (!option) {
                                        setSelectedPersona({ source: "default" })
                                        return
                                    }

                                    setSelectedPersona({ source, id })

                                    const replacement = resolveAvailableModelReplacement({
                                        modelId: option.defaultModelId,
                                        sharedModels,
                                        availableModels
                                    })
                                    const targetModelId = availableModelIds.has(
                                        option.defaultModelId
                                    )
                                        ? option.defaultModelId
                                        : replacement.replacementId

                                    if (targetModelId && availableModelIds.has(targetModelId)) {
                                        if (selectedModel !== targetModelId) {
                                            setSelectedModel(targetModelId)
                                        }
                                        if (
                                            targetModelId !== option.defaultModelId &&
                                            replacement.originalModel &&
                                            replacement.replacement
                                        ) {
                                            notifyModelReplacement(
                                                replacement.originalModel,
                                                replacement.replacement
                                            )
                                        }
                                    } else {
                                        toast.warning(
                                            `${option.name} prefers ${option.defaultModelId}, but it is not currently available.`
                                        )
                                    }
                                }}
                            >
                                <SelectTrigger className="!h-8 !px-1.5 min-[390px]:!px-2 min-w-0 gap-0.5 border bg-secondary/70 text-xs backdrop-blur-lg hover:bg-secondary/80 sm:min-w-[13.75rem] sm:text-sm min-[390px]:gap-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                        {selectedOption ? (
                                            <PersonaAvatar
                                                name={selectedOption.name}
                                                avatarKind={selectedOption.avatarKind}
                                                avatarValue={selectedOption.avatarValue}
                                                className="size-5"
                                            />
                                        ) : (
                                            <Sparkles className="size-4 shrink-0" />
                                        )}
                                        <span className="hidden truncate min-[390px]:block">
                                            {selectedLabel}
                                        </span>
                                    </div>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">Default</SelectItem>
                                    {pickerOptions?.builtIns.map((persona) => (
                                        <SelectItem
                                            key={`builtin:${persona.id}`}
                                            value={getSelectValue("builtin", persona.id)}
                                            textValue={persona.name}
                                        >
                                            <PersonaSelectItem persona={persona} />
                                        </SelectItem>
                                    ))}
                                    {pickerOptions?.userPersonas.map((persona) => (
                                        <SelectItem
                                            key={`user:${persona.id}`}
                                            value={getSelectValue("user", persona.id)}
                                            textValue={persona.name}
                                        >
                                            <PersonaSelectItem persona={persona} />
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </PromptInputAction>
                    </motion.div>
                ) : null}

                {lockedPersonaName ? (
                    <motion.div
                        key={`thread-persona:${lockedPersonaName}`}
                        layout
                        initial={{ opacity: 0, x: -12, scale: 0.96 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -12, scale: 0.96 }}
                        transition={personaChromeTransition}
                    >
                        <PromptInputAction tooltip="Thread persona">
                            <Badge
                                variant="secondary"
                                className="flex h-8 items-center gap-2 rounded-md bg-secondary/70 px-2"
                            >
                                {lockedAvatarKind && lockedAvatarValue ? (
                                    <PersonaAvatar
                                        name={lockedPersonaName}
                                        avatarKind={lockedAvatarKind}
                                        avatarValue={lockedAvatarValue}
                                        className="size-5"
                                    />
                                ) : (
                                    <Sparkles className="size-4 shrink-0" />
                                )}
                                <span className="max-w-[8.75rem] truncate">
                                    {lockedPersonaName}
                                </span>
                            </Badge>
                        </PromptInputAction>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </motion.div>
    )
}
