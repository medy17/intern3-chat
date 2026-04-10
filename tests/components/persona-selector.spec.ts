// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
    useAvailableModelsMock,
    useConvexAuthMock,
    useDiskCachedQueryMock,
    useIsMobileMock,
    useQueryMock,
    useSessionMock
} = vi.hoisted(() => ({
    useAvailableModelsMock: vi.fn(),
    useConvexAuthMock: vi.fn(),
    useDiskCachedQueryMock: vi.fn(),
    useIsMobileMock: vi.fn(),
    useQueryMock: vi.fn(),
    useSessionMock: vi.fn()
}))

vi.mock("@/components/persona-avatar", () => ({
    PersonaAvatar: () => React.createElement("span", { "data-testid": "persona-avatar" })
}))

vi.mock("@/convex/_generated/api", () => ({
    api: {
        personas: {
            listPersonaPickerOptions: "listPersonaPickerOptions"
        },
        settings: {
            getUserSettings: "getUserSettings"
        },
        threads: {
            getThread: "getThread"
        }
    }
}))

vi.mock("@/hooks/auth-hooks", () => ({
    useSession: useSessionMock
}))

vi.mock("@/hooks/use-mobile", () => ({
    useIsMobile: useIsMobileMock
}))

vi.mock("@/lib/convex-cached-query", () => ({
    useDiskCachedQuery: useDiskCachedQueryMock
}))

vi.mock("@/lib/models-providers-shared", () => ({
    useAvailableModels: useAvailableModelsMock
}))

vi.mock("@convex-dev/react-query", () => ({
    useConvexAuth: useConvexAuthMock
}))

vi.mock("convex/react", () => ({
    useQuery: useQueryMock
}))

import { PersonaSelector } from "@/components/persona-selector"
import { useChatStore } from "@/lib/chat-store"

describe("PersonaSelector", () => {
    beforeEach(() => {
        useAvailableModelsMock.mockReset()
        useConvexAuthMock.mockReset()
        useDiskCachedQueryMock.mockReset()
        useIsMobileMock.mockReset()
        useQueryMock.mockReset()
        useSessionMock.mockReset()

        useChatStore.setState({
            selectedPersona: { source: "default" }
        })

        useSessionMock.mockReturnValue({
            user: {
                id: "user-1"
            }
        })
        useConvexAuthMock.mockReturnValue({ isLoading: false })
        useIsMobileMock.mockReturnValue(false)
        useDiskCachedQueryMock.mockReturnValue({})
        useAvailableModelsMock.mockReturnValue({
            availableModels: []
        })
    })

    it("hides persona chrome for existing default threads", () => {
        useQueryMock.mockImplementation((query: string) => {
            if (query === "getThread") {
                return {
                    _id: "thread-1"
                }
            }

            if (query === "listPersonaPickerOptions") {
                return {
                    builtIns: [],
                    userPersonas: []
                }
            }

            return undefined
        })

        const { container } = render(React.createElement(PersonaSelector, { threadId: "thread-1" }))

        expect(container.querySelector('[role="combobox"]')).toBeNull()
        expect(container.textContent).toBe("")
        expect(screen.queryByText("Default")).toBeNull()
    })

    it("shows a read-only badge for persona-backed threads", () => {
        useQueryMock.mockImplementation((query: string) => {
            if (query === "getThread") {
                return {
                    _id: "thread-1",
                    personaSource: "builtin",
                    personaName: "Socrates",
                    personaAvatarKind: "builtin",
                    personaAvatarValue: "/avatars/socrates.webp"
                }
            }

            if (query === "listPersonaPickerOptions") {
                return {
                    builtIns: [],
                    userPersonas: []
                }
            }

            return undefined
        })

        const { container } = render(React.createElement(PersonaSelector, { threadId: "thread-1" }))

        expect(screen.getByText("Socrates")).toBeTruthy()
        expect(screen.getByTestId("persona-avatar")).toBeTruthy()
        expect(container.querySelector('[role="combobox"]')).toBeNull()
    })
})
