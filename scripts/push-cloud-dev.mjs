import { spawn } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const deployment = process.env.CLOUD_DEV_DEPLOYMENT || "dev:knowing-falcon-519"
const envLocalPath = path.resolve(process.cwd(), ".env.local")
const originalEnvLocal = existsSync(envLocalPath) ? readFileSync(envLocalPath, "utf8") : null

const child = spawn(
    "bunx",
    ["convex", "dev", "--once", "--codegen", "disable", "--typecheck", "disable"],
    {
        stdio: "inherit",
        shell: process.platform === "win32",
        env: {
            ...process.env,
            CONVEX_DEPLOYMENT: deployment
        }
    }
)

child.on("exit", (code) => {
    if (originalEnvLocal !== null && existsSync(envLocalPath)) {
        const current = readFileSync(envLocalPath, "utf8")
        if (current !== originalEnvLocal) {
            writeFileSync(envLocalPath, originalEnvLocal, "utf8")
            console.log("[cloud:dev:push] Restored original .env.local after cloud push.")
        }
    }
    process.exit(code ?? 1)
})
