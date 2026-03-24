import { spawn } from "node:child_process"

const children = []
let shuttingDown = false

const start = (label, command, args) => {
    const child = spawn(command, args, {
        stdio: "inherit",
        shell: process.platform === "win32"
    })

    child.on("exit", (code) => {
        if (shuttingDown) return
        shuttingDown = true
        for (const running of children) {
            if (!running.killed) {
                running.kill("SIGTERM")
            }
        }
        process.exit(code ?? 1)
    })

    console.log(`[local-dev] started ${label}`)
    children.push(child)
}

const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    for (const child of children) {
        if (!child.killed) {
            child.kill("SIGTERM")
        }
    }
    setTimeout(() => process.exit(0), 200)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

start("Convex local", "bunx", [
    "convex",
    "dev",
    "--local",
    "--tail-logs",
    "pause-on-deploy",
    "--codegen",
    "disable",
    "--typecheck",
    "disable"
])
start("Web app", "bun", ["run", "dev"])
