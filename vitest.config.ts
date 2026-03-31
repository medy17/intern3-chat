import path from "node:path"
import { defineConfig } from "vitest/config"

const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true"
const reporters = isCI
    ? ["default"]
    : [path.resolve(__dirname, "./tests/reporters/pretty-reporter.ts")]

export default defineConfig({
    resolve: {
        alias: {
            "@/convex": path.resolve(__dirname, "./convex"),
            "@": path.resolve(__dirname, "./src")
        }
    },
    test: {
        environment: "node",
        include: ["tests/**/*.spec.ts"],
        setupFiles: ["./tests/setup.ts"],
        reporters,
        restoreMocks: true,
        clearMocks: true
    }
})
