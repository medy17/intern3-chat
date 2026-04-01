const LAST_CHAT_ROUTE_KEY = "last-chat-route"

export const isRestorableChatPath = (pathname: string) =>
    pathname === "/" || pathname.startsWith("/thread/") || pathname.startsWith("/folder/")

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
