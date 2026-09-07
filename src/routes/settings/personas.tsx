import {
    PersonaAvatarCropper as AvatarCropper,
    type PersonaAvatarCropState as AvatarCropState,
    readPersonaAvatarAsDataUrl as readFileAsDataUrl,
    cropPersonaAvatarToSquare as cropAvatarToSquare,
    compressPersonaAvatar as compressAvatar
} from "@/components/persona-avatar-cropper"
import { ModelSelector } from "@/components/model-selector"
import { PersonaAvatar } from "@/components/persona-avatar"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useSession, useToken } from "@/hooks/auth-hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import {
    notifyModelReplacement,
    resolveAvailableModelReplacement
} from "@/hooks/use-model-lifecycle-migration"
import { resolveJwtToken } from "@/lib/auth-token"
import { browserEnv } from "@/lib/browser-env"
import { uploadFileDirect } from "@/lib/direct-upload"
import { estimateTokenCount } from "@/lib/file_constants"
import { useAvailableModels } from "@/lib/models-providers-shared"
import {
    MAX_PERSONA_KNOWLEDGE_DOCS,
    MAX_PERSONA_PROMPT_TOKENS,
    MAX_PERSONA_STARTERS,
    MIN_PERSONA_STARTERS
} from "@/lib/personas/builtins"
import { useSharedModels } from "@/lib/shared-models"
import { useConvexAuth, useConvexMutation, useConvexQuery } from "@convex-dev/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Copy, Loader2, Pencil, Plus, Save, Trash2, Upload } from "lucide-react"
import {
    type Dispatch,
    type RefObject,
    type SetStateAction,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react"
import type { Area } from "react-easy-crop"
import { toast } from "sonner"

export const Route = createFileRoute("/settings/personas")({
    component: PersonasSettings
})

type PersonaAvatarUpload = {
    key: string
    fileName: string
    fileType: "image/avif" | "image/webp" | "image/jpeg" | "image/png"
    fileSize: number
}

type PersonaDocUpload = {
    key: string
    fileName: string
    fileType: "text/markdown"
    fileSize: number
    tokenCount: number
}

type PersonaFormState = {
    personaId?: Id<"userPersonas">
    name: string
    shortName: string
    description: string
    instructions: string
    conversationStarters: string[]
    defaultModelId: string
    avatar: PersonaAvatarUpload | null
    knowledgeDocs: PersonaDocUpload[]
}

type UserPersonaRecord = {
    _id: Id<"userPersonas">
    name: string
    shortName?: string
    description: string
    instructions: string
    conversationStarters: string[]
    defaultModelId: string
    avatarKey?: string
    avatarMimeType?: PersonaAvatarUpload["fileType"]
    avatarSizeBytes?: number
    knowledgeDocs: Array<{
        key: string
        fileName: string
        sizeBytes: number
        tokenCount: number
    }>
}

const EMPTY_FORM: PersonaFormState = {
    name: "",
    shortName: "",
    description: "",
    instructions: "",
    conversationStarters: Array.from({ length: MIN_PERSONA_STARTERS }, () => ""),
    defaultModelId: "",
    avatar: null,
    knowledgeDocs: []
}

const MAX_AVATAR_BYTES = 100 * 1024
const PERSONA_DESCRIPTION_TEXTAREA_CLASS =
    "h-24 max-h-40 resize-y overflow-y-auto [field-sizing:fixed]"
const PERSONA_INSTRUCTIONS_TEXTAREA_CLASS =
    "h-56 max-h-[50dvh] resize-y overflow-y-auto [field-sizing:fixed]"

const estimatePromptUsage = (form: PersonaFormState) =>
    Math.ceil(
        (form.name.length +
            form.description.length +
            form.instructions.length +
            form.conversationStarters.join("").length) /
            4
    ) + form.knowledgeDocs.reduce((sum, doc) => sum + doc.tokenCount, 0)

const normalizeStarterList = (starters: string[]) =>
    starters.map((starter) => starter.trim()).filter(Boolean)
const ensureStarterSlots = (starters: string[]) =>
    starters.length >= MIN_PERSONA_STARTERS
        ? starters
        : [...starters, ...Array.from({ length: MIN_PERSONA_STARTERS - starters.length }, () => "")]

const buildFormFromPersona = (persona: UserPersonaRecord, duplicate = false): PersonaFormState => ({
    personaId: duplicate ? undefined : persona._id,
    name: duplicate ? `${persona.name} Copy` : persona.name,
    shortName: persona.shortName || persona.name.slice(0, 10),
    description: persona.description,
    instructions: persona.instructions,
    conversationStarters: ensureStarterSlots(persona.conversationStarters),
    defaultModelId: persona.defaultModelId,
    avatar: persona.avatarKey
        ? {
              key: persona.avatarKey,
              fileName: persona.avatarKey.split("/").pop() || "avatar",
              fileType: persona.avatarMimeType || "image/webp",
              fileSize: persona.avatarSizeBytes || 0
          }
        : null,
    knowledgeDocs: persona.knowledgeDocs.map((doc) => ({
        key: doc.key,
        fileName: doc.fileName,
        fileType: "text/markdown",
        fileSize: doc.sizeBytes,
        tokenCount: doc.tokenCount
    }))
})

function PersonaEditorForm({
    form,
    setForm,
    canSave,
    hasPersonaModels,
    avatarInputRef,
    docsInputRef,
    onAvatarUpload,
    onKnowledgeDocsUpload
}: {
    form: PersonaFormState
    setForm: Dispatch<SetStateAction<PersonaFormState>>
    canSave: boolean
    hasPersonaModels: boolean
    avatarInputRef: RefObject<HTMLInputElement | null>
    docsInputRef: RefObject<HTMLInputElement | null>
    onAvatarUpload: (file?: File) => Promise<void>
    onKnowledgeDocsUpload: (files: FileList | null) => Promise<void>
}) {
    const canAddStarter = form.conversationStarters.length < MAX_PERSONA_STARTERS
    const canAddDocs = form.knowledgeDocs.length < MAX_PERSONA_KNOWLEDGE_DOCS

    return (
        <div className="space-y-8">
            <div className="space-y-3">
                <Label htmlFor="persona-name">Name</Label>
                <div className="flex items-center gap-3">
                    <Input
                        id="persona-name"
                        value={form.name}
                        onChange={(event) =>
                            setForm((current) => ({
                                ...current,
                                name: event.target.value
                            }))
                        }
                        maxLength={80}
                        placeholder="Senior systems architect"
                        className="flex-1"
                    />
                    <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full border bg-background transition-colors hover:bg-muted/50"
                        aria-label={
                            form.avatar ? "Replace persona avatar" : "Upload persona avatar"
                        }
                    >
                        <PersonaAvatar
                            name={form.name || "Persona"}
                            avatarKind={form.avatar ? "r2" : undefined}
                            avatarValue={form.avatar?.key}
                            className="size-10"
                            rounded="full"
                        />
                        {!form.avatar && (
                            <span className="absolute right-0 bottom-0 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground">
                                <Upload className="size-3" />
                            </span>
                        )}
                    </button>
                </div>
                <input
                    ref={avatarInputRef}
                    type="file"
                    accept=".avif,.webp,.jpg,.jpeg,.png,image/avif,image/webp,image/jpeg,image/png"
                    className="hidden"
                    onChange={(event) => {
                        void onAvatarUpload(event.target.files?.[0])
                        event.target.value = ""
                    }}
                />
                {form.avatar && (
                    <div className="flex justify-end">
                        <Button
                            variant="ghost"
                            type="button"
                            size="sm"
                            onClick={() =>
                                setForm((current) => ({
                                    ...current,
                                    avatar: null
                                }))
                            }
                        >
                            Remove avatar
                        </Button>
                    </div>
                )}
            </div>

            <div className="space-y-3">
                <Label htmlFor="persona-short-name">Short Name</Label>
                <Input
                    id="persona-short-name"
                    value={form.shortName}
                    onChange={(event) =>
                        setForm((current) => ({
                            ...current,
                            shortName: event.target.value
                        }))
                    }
                    maxLength={10}
                    placeholder="Pep"
                />
            </div>

            <div className="space-y-3">
                <Label htmlFor="persona-description">Description</Label>
                <Textarea
                    id="persona-description"
                    value={form.description}
                    onChange={(event) =>
                        setForm((current) => ({
                            ...current,
                            description: event.target.value
                        }))
                    }
                    rows={3}
                    maxLength={240}
                    placeholder="Direct, technical guidance for architecture and tradeoff reviews."
                    className={PERSONA_DESCRIPTION_TEXTAREA_CLASS}
                />
            </div>

            <div className="space-y-3">
                <Label htmlFor="persona-instructions">Instructions</Label>
                <Textarea
                    id="persona-instructions"
                    value={form.instructions}
                    onChange={(event) =>
                        setForm((current) => ({
                            ...current,
                            instructions: event.target.value
                        }))
                    }
                    rows={10}
                    placeholder="Describe how this persona should respond, reason, and structure answers."
                    className={PERSONA_INSTRUCTIONS_TEXTAREA_CLASS}
                />
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <Label>Default Model</Label>
                    {!hasPersonaModels && (
                        <span className="text-destructive text-xs">No compatible text models</span>
                    )}
                </div>
                {hasPersonaModels ? (
                    <ModelSelector
                        selectedModel={form.defaultModelId}
                        onModelChange={(value) =>
                            setForm((current) => ({
                                ...current,
                                defaultModelId: value
                            }))
                        }
                        telemetrySurface="persona_settings"
                        className="h-10 w-full justify-between border bg-background px-3 text-sm hover:bg-background"
                        triggerWrapperClassName="w-full"
                        contentClassName="z-[80]"
                        preferShortName={false}
                    />
                ) : (
                    <div className="rounded-lg border border-dashed px-3 py-2 text-muted-foreground text-sm">
                        Add a text chat model in Settings before assigning a persona default.
                    </div>
                )}
            </div>

            <div className="space-y-4">
                <div className="space-y-1">
                    <Label>Conversation Starters</Label>
                    <p className="text-muted-foreground text-xs">
                        Add between {MIN_PERSONA_STARTERS} and {MAX_PERSONA_STARTERS} conversation
                        starters.
                    </p>
                </div>
                <div className="space-y-3">
                    {form.conversationStarters.map((starter, index) => (
                        <div key={index} className="flex gap-2">
                            <Input
                                value={starter}
                                maxLength={160}
                                placeholder="Kick off the conversation with a suggested prompt."
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        conversationStarters: current.conversationStarters.map(
                                            (value, valueIndex) =>
                                                valueIndex === index ? event.target.value : value
                                        )
                                    }))
                                }
                            />
                            <Button
                                variant="ghost"
                                type="button"
                                disabled={form.conversationStarters.length <= MIN_PERSONA_STARTERS}
                                onClick={() =>
                                    setForm((current) => ({
                                        ...current,
                                        conversationStarters: current.conversationStarters.filter(
                                            (_, valueIndex) => valueIndex !== index
                                        )
                                    }))
                                }
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </div>
                <div className="pt-1">
                    <Button
                        variant="outline"
                        type="button"
                        size="sm"
                        onClick={() =>
                            setForm((current) => ({
                                ...current,
                                conversationStarters: [...current.conversationStarters, ""]
                            }))
                        }
                        disabled={!canAddStarter}
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add Conversation Starter
                    </Button>
                </div>
            </div>

            <div className="space-y-4">
                <div className="space-y-1">
                    <Label>Knowledge Base Documents</Label>
                    <p className="text-muted-foreground text-xs">
                        Up to {MAX_PERSONA_KNOWLEDGE_DOCS} documents.
                    </p>
                </div>
                <input
                    ref={docsInputRef}
                    type="file"
                    accept=".md,text/markdown,text/plain"
                    className="hidden"
                    multiple
                    onChange={(event) => {
                        void onKnowledgeDocsUpload(event.target.files)
                        event.target.value = ""
                    }}
                />
                <div className="space-y-3">
                    {form.knowledgeDocs.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            No knowledge documents uploaded.
                        </p>
                    ) : (
                        form.knowledgeDocs.map((doc) => (
                            <div
                                key={doc.key}
                                className="flex items-center justify-between rounded-lg border px-3 py-2"
                            >
                                <div className="min-w-0">
                                    <p className="truncate font-medium text-sm">{doc.fileName}</p>
                                    <p className="text-muted-foreground text-xs">
                                        {doc.tokenCount.toLocaleString()} tokens
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    type="button"
                                    onClick={() =>
                                        setForm((current) => ({
                                            ...current,
                                            knowledgeDocs: current.knowledgeDocs.filter(
                                                (candidate) => candidate.key !== doc.key
                                            )
                                        }))
                                    }
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))
                    )}
                </div>
                <div className="pt-1">
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => docsInputRef.current?.click()}
                        disabled={!canAddDocs}
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add knowledge document
                    </Button>
                </div>
            </div>

            {!canSave && (
                <div className="rounded-lg border border-dashed px-3 py-2 text-muted-foreground text-sm">
                    You must add a Name, Short name, Instructions, and a Default Model to save.
                </div>
            )}
        </div>
    )
}

function PersonaEditor({
    open,
    onOpenChange,
    form,
    setForm,
    personaPromptUsage,
    canSave,
    hasPersonaModels,
    avatarInputRef,
    docsInputRef,
    isSaving,
    isDeleting,
    onAvatarUpload,
    onKnowledgeDocsUpload,
    onDelete,
    onSave
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    form: PersonaFormState
    setForm: Dispatch<SetStateAction<PersonaFormState>>
    personaPromptUsage: number
    canSave: boolean
    hasPersonaModels: boolean
    avatarInputRef: RefObject<HTMLInputElement | null>
    docsInputRef: RefObject<HTMLInputElement | null>
    isSaving: boolean
    isDeleting: boolean
    onAvatarUpload: (file?: File) => Promise<void>
    onKnowledgeDocsUpload: (files: FileList | null) => Promise<void>
    onDelete: () => Promise<void>
    onSave: () => Promise<void>
}) {
    const isMobile = useIsMobile()
    const title = form.personaId ? "Edit Persona" : "Create Persona"
    const description = form.personaId
        ? "Update this persona. Existing threads keep their snapshot."
        : "Create a reusable persona for future conversations."
    const footerActions = (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {form.personaId ? (
                <Button
                    variant="destructive"
                    onClick={() => void onDelete()}
                    disabled={isDeleting || isSaving}
                >
                    {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Trash2 className="h-4 w-4" />
                    )}
                    Delete
                </Button>
            ) : (
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                    Cancel
                </Button>
            )}
            {isMobile && form.personaId && (
                <DrawerClose asChild>
                    <Button variant="outline" disabled={isSaving || isDeleting}>
                        Cancel
                    </Button>
                </DrawerClose>
            )}
            {!isMobile && form.personaId && (
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                    Cancel
                </Button>
            )}
            <Button onClick={() => void onSave()} disabled={!canSave || isSaving || isDeleting}>
                {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Save className="h-4 w-4" />
                )}
                {form.personaId ? "Save Changes" : "Create Persona"}
            </Button>
        </div>
    )
    const footer = (
        <div className="flex w-full flex-col gap-3">
            <p className="text-muted-foreground text-sm">
                Used {personaPromptUsage.toLocaleString()}/
                {MAX_PERSONA_PROMPT_TOKENS.toLocaleString()} tokens for this Persona
            </p>
            {footerActions}
        </div>
    )

    if (isMobile) {
        return (
            <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
                <DrawerContent
                    className="z-[70] flex h-[92dvh] max-h-[92dvh] flex-col gap-0 overflow-hidden border-border/60 bg-background p-0"
                    overlayClassName="z-[70]"
                >
                    <DrawerHeader className="shrink-0 text-left">
                        <DrawerTitle>{title}</DrawerTitle>
                        <DrawerDescription>{description}</DrawerDescription>
                    </DrawerHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                        <PersonaEditorForm
                            form={form}
                            setForm={setForm}
                            canSave={canSave}
                            hasPersonaModels={hasPersonaModels}
                            avatarInputRef={avatarInputRef}
                            docsInputRef={docsInputRef}
                            onAvatarUpload={onAvatarUpload}
                            onKnowledgeDocsUpload={onKnowledgeDocsUpload}
                        />
                    </div>
                    <DrawerFooter className="shrink-0 border-t px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                        {footer}
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
                <DialogHeader className="border-b px-6 pt-6 pb-4">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                    <PersonaEditorForm
                        form={form}
                        setForm={setForm}
                        canSave={canSave}
                        hasPersonaModels={hasPersonaModels}
                        avatarInputRef={avatarInputRef}
                        docsInputRef={docsInputRef}
                        onAvatarUpload={onAvatarUpload}
                        onKnowledgeDocsUpload={onKnowledgeDocsUpload}
                    />
                </div>
                <DialogFooter className="border-t px-6 py-4">{footer}</DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function PersonasSettings() {
    const session = useSession()
    const auth = useConvexAuth()
    const { token } = useToken()
    const builtIns = useConvexQuery(
        api.personas.listBuiltInPersonas,
        session.user?.id ? {} : "skip"
    )
    const userPersonas = useConvexQuery(
        api.personas.listUserPersonas,
        session.user?.id ? {} : "skip"
    )
    const userSettings = useCurrentUserSettings(session.user?.id, auth.isLoading)
    const createPersona = useConvexMutation(api.personas.createUserPersona)
    const updatePersona = useConvexMutation(api.personas.updateUserPersona)
    const deletePersona = useConvexMutation(api.personas.deleteUserPersona)
    const { availableModels } = useAvailableModels(
        "error" in userSettings ? undefined : userSettings
    )
    const { models: sharedModels } = useSharedModels()

    const personaModels = useMemo(
        () => availableModels.filter((model) => isChatModel(model)),
        [availableModels]
    )

    const resolveModelName = useMemo(() => {
        const namesById = new Map<string, string>()
        for (const model of sharedModels) namesById.set(model.id, model.name)
        for (const model of availableModels) namesById.set(model.id, model.name)
        return (modelId: string) => namesById.get(modelId) ?? modelId
    }, [sharedModels, availableModels])

    const [form, setForm] = useState<PersonaFormState>(EMPTY_FORM)
    const [isEditorOpen, setIsEditorOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
    const [avatarCropState, setAvatarCropState] = useState<AvatarCropState | null>(null)
    const avatarInputRef = useRef<HTMLInputElement>(null)
    const docsInputRef = useRef<HTMLInputElement>(null)

    const resetForm = () =>
        setForm({
            ...EMPTY_FORM,
            defaultModelId: personaModels[0]?.id || ""
        })

    useEffect(() => {
        if (!form.defaultModelId && personaModels.length > 0) {
            setForm((current) => ({
                ...current,
                defaultModelId: personaModels[0].id
            }))
        }
    }, [form.defaultModelId, personaModels])

    useEffect(() => {
        if (
            !form.defaultModelId ||
            personaModels.some((model) => model.id === form.defaultModelId)
        ) {
            return
        }

        const replacement = resolveAvailableModelReplacement({
            modelId: form.defaultModelId,
            sharedModels,
            availableModels: personaModels
        })

        if (!replacement.replacementId || !replacement.replacement) return

        setForm((current) =>
            current.defaultModelId === form.defaultModelId
                ? {
                      ...current,
                      defaultModelId: replacement.replacementId!
                  }
                : current
        )

        if (replacement.originalModel) {
            notifyModelReplacement(replacement.originalModel, replacement.replacement)
        }
    }, [form.defaultModelId, personaModels, sharedModels])

    const personaPromptUsage = useMemo(() => estimatePromptUsage(form), [form])
    const [debouncedPersonaPromptUsage, setDebouncedPersonaPromptUsage] =
        useState(personaPromptUsage)

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedPersonaPromptUsage(personaPromptUsage)
        }, 150)

        return () => window.clearTimeout(timeoutId)
    }, [personaPromptUsage])

    const normalizedStarterCount = useMemo(
        () => normalizeStarterList(form.conversationStarters).length,
        [form.conversationStarters]
    )
    const canSave =
        form.name.trim().length > 0 &&
        form.shortName.trim().length > 0 &&
        form.shortName.trim().length <= 10 &&
        form.description.trim().length > 0 &&
        form.instructions.trim().length > 0 &&
        form.defaultModelId.length > 0 &&
        normalizedStarterCount >= MIN_PERSONA_STARTERS &&
        normalizedStarterCount <= MAX_PERSONA_STARTERS &&
        personaPromptUsage <= MAX_PERSONA_PROMPT_TOKENS &&
        personaModels.some((model) => model.id === form.defaultModelId)

    const handleEditorOpenChange = (open: boolean) => {
        setIsEditorOpen(open)
        if (!open) {
            setAvatarCropState(null)
            resetForm()
        }
    }

    const openCreatePersona = () => {
        resetForm()
        setIsEditorOpen(true)
    }

    const openEditPersona = (persona: UserPersonaRecord) => {
        setForm(buildFormFromPersona(persona))
        setIsEditorOpen(true)
    }

    const openDuplicatePersona = (persona: UserPersonaRecord) => {
        setForm(buildFormFromPersona(persona, true))
        setIsEditorOpen(true)
    }

    const handleAvatarCropOpenChange = (open: boolean) => {
        if (!open && !isUploadingAvatar) {
            setAvatarCropState(null)
        }
    }

    const uploadPersonaFile = async (purpose: "persona-avatar" | "persona-doc", file: File) => {
        const jwt = await resolveJwtToken(token)
        if (!jwt) {
            throw new Error("Authentication token unavailable")
        }

        return uploadFileDirect({
            file,
            jwt,
            uploadBaseUrl: `${browserEnv("VITE_CONVEX_API_URL")}/upload`,
            purpose
        })
    }

    const handleAvatarUpload = async (file?: File) => {
        if (!file) return

        try {
            const src = await readFileAsDataUrl(file)
            setAvatarCropState({
                src,
                fileName: file.name
            })
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Avatar upload failed")
        }
    }

    const handleAvatarCropConfirm = async (croppedAreaPixels: Area) => {
        if (!avatarCropState) return

        setIsUploadingAvatar(true)
        try {
            const cropped = await cropAvatarToSquare({
                src: avatarCropState.src,
                croppedAreaPixels,
                fileName: avatarCropState.fileName
            })
            const compressed = await compressAvatar(cropped)
            const uploaded = (await uploadPersonaFile(
                "persona-avatar",
                compressed
            )) as PersonaAvatarUpload
            setForm((current) => ({
                ...current,
                avatar: uploaded
            }))
            setAvatarCropState(null)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Avatar upload failed")
        } finally {
            setIsUploadingAvatar(false)
        }
    }

    const handleKnowledgeDocsUpload = async (files: FileList | null) => {
        if (!files) return

        const remainingSlots = MAX_PERSONA_KNOWLEDGE_DOCS - form.knowledgeDocs.length
        if (remainingSlots <= 0) {
            toast.warning(`Personas can only include ${MAX_PERSONA_KNOWLEDGE_DOCS} docs.`)
            return
        }

        const filesToUpload = Array.from(files).slice(0, remainingSlots)
        if (files.length > remainingSlots) {
            toast.warning(`Only the first ${remainingSlots} document(s) were added.`)
        }

        try {
            const uploadedDocs = await Promise.all(
                filesToUpload.map(async (file): Promise<PersonaDocUpload> => {
                    const tokenCount = estimateTokenCount(await file.text())
                    if (tokenCount > MAX_PERSONA_PROMPT_TOKENS) {
                        throw new Error(
                            `Knowledge document exceeds ${MAX_PERSONA_PROMPT_TOKENS.toLocaleString()} token limit`
                        )
                    }
                    const uploaded = await uploadPersonaFile("persona-doc", file)
                    return {
                        ...uploaded,
                        fileType: "text/markdown",
                        tokenCount
                    }
                })
            )

            setForm((current) => ({
                ...current,
                knowledgeDocs: [...current.knowledgeDocs, ...uploadedDocs]
            }))
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Document upload failed")
        }
    }

    const handleSave = async () => {
        if (!session.user?.id || !canSave) return

        setIsSaving(true)
        try {
            const payload = {
                name: form.name,
                shortName: form.shortName,
                description: form.description,
                instructions: form.instructions,
                conversationStarters: normalizeStarterList(form.conversationStarters),
                defaultModelId: form.defaultModelId,
                avatar: form.avatar
                    ? {
                          key: form.avatar.key,
                          mimeType: form.avatar.fileType,
                          sizeBytes: form.avatar.fileSize
                      }
                    : null,
                knowledgeDocs: form.knowledgeDocs.map((doc) => ({
                    key: doc.key,
                    fileName: doc.fileName,
                    mimeType: "text/markdown" as const,
                    sizeBytes: doc.fileSize
                }))
            }

            if (form.personaId) {
                await updatePersona({
                    personaId: form.personaId,
                    ...payload
                })
                toast.success("Persona updated")
            } else {
                await createPersona(payload)
                toast.success("Persona created")
            }

            handleEditorOpenChange(false)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save persona")
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!form.personaId) return

        setIsDeleting(true)
        try {
            await deletePersona({ personaId: form.personaId })
            toast.success("Persona deleted")
            handleEditorOpenChange(false)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete persona")
        } finally {
            setIsDeleting(false)
        }
    }

    if (!session.user?.id) {
        return (
            <SettingsLayout title="Personas" description="Create reusable prompt personas">
                <p className="text-muted-foreground text-sm">Sign in to manage personas.</p>
            </SettingsLayout>
        )
    }

    if (!builtIns || !userPersonas) {
        return (
            <SettingsLayout title="Personas" description="Create reusable prompt personas">
                <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </SettingsLayout>
        )
    }

    return (
        <SettingsLayout title="Personas" description="Create reusable prompt personas">
            <div className="space-y-8">
                <div className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h3 className="font-semibold text-foreground">Your Personas</h3>
                            <p className="mt-1 text-muted-foreground text-sm">
                                Create, duplicate, and edit your own personas and experts.
                            </p>
                        </div>
                        <Button onClick={openCreatePersona}>
                            <Plus className="h-4 w-4" />
                            New Persona
                        </Button>
                    </div>
                    {userPersonas.length === 0 ? (
                        <Card className="p-5">
                            <div>
                                <h4 className="font-medium">No custom personas yet</h4>
                                <p className="mt-1 text-muted-foreground text-sm">
                                    Start from scratch and add your own instructions, starters, and
                                    knowledge docs.
                                </p>
                            </div>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {userPersonas.map((persona) => (
                                <Card
                                    key={persona._id}
                                    className="min-w-0 gap-4 rounded-[var(--radius-xl)] p-4 shadow-none"
                                >
                                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                        <div className="flex min-w-0 flex-1 items-start gap-3">
                                            <PersonaAvatar
                                                name={persona.name}
                                                avatarKind={persona.avatarKey ? "r2" : undefined}
                                                avatarValue={persona.avatarKey}
                                                className="size-10 shrink-0 [&_[data-slot=avatar-fallback]]:text-sm"
                                            />
                                            <div className="min-w-0">
                                                <h4 className="font-medium [overflow-wrap:anywhere]">
                                                    {persona.name}
                                                </h4>
                                                <p className="mt-1 text-muted-foreground text-sm leading-relaxed [overflow-wrap:anywhere]">
                                                    {persona.description}
                                                </p>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    <Badge
                                                        variant="secondary"
                                                        className="max-w-full whitespace-normal rounded-[var(--radius-md)] text-left [overflow-wrap:anywhere]"
                                                    >
                                                        {resolveModelName(persona.defaultModelId)}
                                                    </Badge>
                                                    {persona.knowledgeDocs.length > 0 && (
                                                        <Badge
                                                            variant="outline"
                                                            className="rounded-[var(--radius-md)]"
                                                        >
                                                            {persona.knowledgeDocs.length} doc
                                                            {persona.knowledgeDocs.length === 1
                                                                ? ""
                                                                : "s"}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2 self-end md:self-center">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-9 rounded-[var(--radius-md)]"
                                                aria-label={`Edit ${persona.name}`}
                                                onClick={() => openEditPersona(persona)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                                Edit
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-9 rounded-[var(--radius-md)]"
                                                aria-label={`Duplicate ${persona.name}`}
                                                onClick={() => openDuplicatePersona(persona)}
                                            >
                                                <Copy className="h-4 w-4" />
                                                Duplicate
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <div>
                        <h3 className="font-semibold text-foreground">Built-in Personas</h3>
                        <p className="mt-1 text-muted-foreground text-sm">
                            Ready-to-use personas available in the chat persona selector.
                        </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        {builtIns.map((persona) => (
                            <Card
                                key={persona.id}
                                className="min-w-0 gap-3 rounded-[var(--radius-xl)] p-4 shadow-none"
                            >
                                <div className="flex items-center gap-3">
                                    <PersonaAvatar
                                        name={persona.name}
                                        avatarKind={persona.avatarKind}
                                        avatarValue={persona.avatarValue}
                                        className="size-10 shrink-0 [&_[data-slot=avatar-fallback]]:text-sm"
                                    />
                                    <h4 className="min-w-0 font-medium [overflow-wrap:anywhere]">
                                        {persona.name}
                                    </h4>
                                </div>
                                <p className="text-muted-foreground text-sm leading-relaxed [overflow-wrap:anywhere]">
                                    {persona.description}
                                </p>
                                <div className="mt-auto flex flex-wrap items-start gap-2 pt-1">
                                    <Badge
                                        variant="secondary"
                                        className="max-w-full whitespace-normal rounded-[var(--radius-md)] text-left [overflow-wrap:anywhere]"
                                    >
                                        {resolveModelName(persona.defaultModelId)}
                                    </Badge>
                                    {persona.docNames.map((docName) => (
                                        <Badge
                                            key={docName}
                                            variant="outline"
                                            className="max-w-full whitespace-normal rounded-[var(--radius-md)] text-left [overflow-wrap:anywhere]"
                                        >
                                            {docName}
                                        </Badge>
                                    ))}
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            </div>

            <PersonaEditor
                open={isEditorOpen}
                onOpenChange={handleEditorOpenChange}
                form={form}
                setForm={setForm}
                personaPromptUsage={debouncedPersonaPromptUsage}
                canSave={canSave}
                hasPersonaModels={personaModels.length > 0}
                avatarInputRef={avatarInputRef}
                docsInputRef={docsInputRef}
                isSaving={isSaving}
                isDeleting={isDeleting}
                onAvatarUpload={handleAvatarUpload}
                onKnowledgeDocsUpload={handleKnowledgeDocsUpload}
                onDelete={handleDelete}
                onSave={handleSave}
            />
            <AvatarCropper
                cropState={avatarCropState}
                open={Boolean(avatarCropState)}
                onOpenChange={handleAvatarCropOpenChange}
                onConfirm={handleAvatarCropConfirm}
                isSaving={isUploadingAvatar}
            />
        </SettingsLayout>
    )
}
import { useCurrentUserSettings } from "@/hooks/use-current-user-settings"
import { isChatModel } from "@/convex/lib/models"
