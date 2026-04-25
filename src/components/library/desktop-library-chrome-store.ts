import { create } from "zustand"

interface DesktopLibraryChromeStore {
    isCollapsed: boolean
    setIsCollapsed: (isCollapsed: boolean) => void
    reset: () => void
}

export const useDesktopLibraryChromeStore = create<DesktopLibraryChromeStore>((set) => ({
    isCollapsed: false,
    setIsCollapsed: (isCollapsed) => set({ isCollapsed }),
    reset: () => set({ isCollapsed: false })
}))
