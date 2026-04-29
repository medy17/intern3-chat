"use node"

import path from "node:path"
import dotenv from "dotenv"

let loaded = false

export function loadServerEnv() {
    if (loaded) return

    const cwd = process.cwd()
    dotenv.config({
        path: [path.join(cwd, ".env.local"), path.join(cwd, ".env")],
        override: false,
        quiet: true
    })

    loaded = true
}
