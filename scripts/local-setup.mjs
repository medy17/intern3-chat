import { spawn } from "node:child_process"

const run = (label, command, args, { allowFailure = false } = {}) =>
    new Promise((resolve, reject) => {
        console.log(`\n[local-setup] ${label}`)
        const child = spawn(command, args, {
            stdio: "inherit",
            shell: process.platform === "win32"
        })

        child.on("exit", (code) => {
            if (code === 0) {
                resolve()
                return
            }
            if (allowFailure) {
                console.warn(`[local-setup] ${label} skipped (exit code ${code}).`)
                resolve()
                return
            }
            reject(new Error(`${label} failed with exit code ${code}`))
        })
    })

const main = async () => {
    await run("Starting Docker services (Postgres + MinIO)", "docker", ["compose", "up", "-d"])

    await run("Pushing Better Auth schema to local Postgres", "bun", ["run", "auth:push"])

    await run(
        "Configuring Convex local deployment (one-time, interactive)",
        "bunx",
        [
            "convex",
            "dev",
            "--configure",
            "existing",
            "--dev-deployment",
            "local",
            "--once",
            "--codegen",
            "disable",
            "--typecheck",
            "disable"
        ],
        { allowFailure: true }
    )

    console.log("\n[local-setup] Done. Run `bun run local:dev` to start app + local Convex.")
}

main().catch((error) => {
    console.error(`\n[local-setup] ${error.message}`)
    process.exit(1)
})
