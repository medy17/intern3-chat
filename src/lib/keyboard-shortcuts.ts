export const OPEN_MODEL_PICKER_SHORTCUT_EVENT = "silkchat:open-model-picker"

export const isShortcutModifierPressed = (event: Pick<KeyboardEvent, "metaKey" | "ctrlKey">) =>
    event.metaKey || event.ctrlKey

export const isEditableShortcutTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
        return false
    }

    return (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.closest("[contenteditable='true']") !== null
    )
}

export const isMacLikePlatform = () => {
    if (typeof navigator === "undefined") {
        return false
    }

    return /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform)
}

export const matchesNewChatShortcut = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== "o") {
        return false
    }

    if (event.metaKey) {
        return event.shiftKey
    }

    return event.ctrlKey && event.altKey
}
