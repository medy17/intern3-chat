import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const children = []
let shuttingDown = false

const ensureLocalDeploymentSelected = () => {
    const envLocalPath = path.resolve(process.cwd(), ".env.local")
    if (!existsSync(envLocalPath)) return true

    const envLocalContent = readFileSync(envLocalPath, "utf8")
    const match = envLocalContent.match(/^CONVEX_DEPLOYMENT=(.+)$/m)
    if (!match) return true

    const rawValue = match[1].split("#")[0].trim().replace(/^"|"$/g, "")
    if (rawValue.startsWith("local:")) return true

    console.error(
        `[local-dev] CONVEX_DEPLOYMENT is '${rawValue}', not a local deployment.\n[local-dev] Run \`bun run local:convex:configure\` first, then re-run \`bun run local:dev\`.`
    )
    return false
}

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

const runConvexBootstrap = () =>
    new Promise((resolve, reject) => {
        console.log("[local-dev] bootstrapping Convex local deployment...")

        const child = spawn(
            "bunx",
            [
                "convex",
                "dev",
                "--local",
                "--local-force-upgrade",
                "--once",
                "--tail-logs",
                "disable",
                "--codegen",
                "disable",
                "--typecheck",
                "disable"
            ],
            {
                stdio: ["pipe", "inherit", "inherit"],
                shell: process.platform === "win32"
            }
        )

        // Non-interactive environments can stall on backend upgrade prompts.
        // Sending "y" proactively allows the bootstrap to continue when prompted.
        child.stdin?.write("y\n")
        child.stdin?.end()

        child.on("exit", (code) => {
            if (code === 0) {
                resolve()
                return
            }
            reject(new Error(`Convex bootstrap failed with exit code ${code}`))
        })
    })

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

if (!ensureLocalDeploymentSelected()) {
    process.exit(1)
}

runConvexBootstrap()
    .then(() => {
        start("Convex local", "bunx", [
            "convex",
            "dev",
            "--local",
            "--local-force-upgrade",
            "--tail-logs",
            "pause-on-deploy",
            "--codegen",
            "disable",
            "--typecheck",
            "disable"
        ])
        start("Web app", "bun", ["run", "dev"])
    })
    .catch((error) => {
        console.error(`[local-dev] ${error.message}`)
        process.exit(1)
    })
