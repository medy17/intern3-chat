import { z } from "zod"
import { create } from "zustand"
import { persist } from "zustand/middleware"

export const MESSAGE_FOOTER_STORE_KEY = "message-footer-store"

export type AssistantFooterMode = "simple" | "nerd" | "extra-nerdy"

type MessageFooterStore = {
    footerMode: AssistantFooterMode
    setFooterMode: (footerMode: AssistantFooterMode) => void
}

const PersistedMessageFooterStoreSchema = z.object({
    footerMode: z.enum(["simple", "nerd", "extra-nerdy"]).optional()
})

export const useMessageFooterStore = create<MessageFooterStore>()(
    persist(
        (set) => ({
            footerMode: "simple",
            setFooterMode: (footerMode) => set({ footerMode })
        }),
        {
            name: MESSAGE_FOOTER_STORE_KEY,
            partialize: (state) => ({ footerMode: state.footerMode }),
            merge: (persistedState, currentState) => {
                const parsed = PersistedMessageFooterStoreSchema.safeParse(persistedState)
                if (!parsed.success) {
                    return currentState
                }

                return {
                    ...currentState,
                    ...parsed.data
                }
            }
        }
    )
)
