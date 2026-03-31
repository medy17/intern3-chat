import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"
import { vi } from "vitest"

const originalEnv = { ...process.env }

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()

    for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) {
            Reflect.deleteProperty(process.env, key)
        }
    }

    Object.assign(process.env, originalEnv)
})
