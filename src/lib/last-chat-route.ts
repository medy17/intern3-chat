const LAST_CHAT_ROUTE_KEY = "last-chat-route"
const LAST_LIBRARY_ROUTE_KEY = "last-library-route"

export const isRestorableChatPath = (pathname: string) =>
    pathname === "/" ||
    pathname.startsWith("/thread/") ||
    pathname.startsWith("/folder/") ||
    pathname.startsWith("/s/")

export const peekLastChatRoute = () => {
    if (typeof window === "undefined") {
        return null
    }

    return window.sessionStorage.getItem(LAST_CHAT_ROUTE_KEY)
}

export const getLastChatRoute = () => {
    if (typeof window === "undefined") {
        return "/"
    }

    return window.sessionStorage.getItem(LAST_CHAT_ROUTE_KEY) ?? "/"
}

export const setLastChatRoute = (href: string) => {
    if (typeof window === "undefined") {
        return
    }

    window.sessionStorage.setItem(LAST_CHAT_ROUTE_KEY, href)
}

export const getLastLibraryRoute = () => {
    if (typeof window === "undefined") {
        return "/library"
    }

    return window.sessionStorage.getItem(LAST_LIBRARY_ROUTE_KEY) ?? "/library"
}

export const setLastLibraryRoute = (href: string) => {
    if (typeof window === "undefined") {
        return
    }

    window.sessionStorage.setItem(LAST_LIBRARY_ROUTE_KEY, href)
}
