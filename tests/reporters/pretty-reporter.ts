import path from "node:path"
import pc from "picocolors"
import type { Reporter, Vitest } from "vitest/node"

type TaskState = "pass" | "fail" | "skip" | "todo" | "pending" | "unknown"

type AnyTask = {
    id?: string
    type?: "suite" | "test"
    name?: string
    mode?: "run" | "skip" | "only" | "todo"
    tasks?: AnyTask[]
    result?: {
        state?: unknown
        duration?: number
        errors?: unknown[]
    }
}

type AnyFile = {
    filepath?: string
    name?: string
    file?: string
    tasks?: AnyTask[]
}

type TaskResultPack = {
    id: string
    result?: {
        state?: unknown
        duration?: number
        errors?: unknown[]
    }
}

const normalisePath = (value: string) => value.replaceAll("\\", "/")

const toRelative = (value: string) => {
    try {
        return path.relative(process.cwd(), value)
    } catch {
        return value
    }
}

const safeBasename = (value: string) => {
    try {
        return path.basename(value)
    } catch {
        return value
    }
}

const safeDirname = (value: string) => {
    try {
        return path.dirname(value)
    } catch {
        return ""
    }
}

const normaliseState = (rawState: unknown, mode: unknown): TaskState => {
    if (mode === "skip") return "skip"
    if (mode === "todo") return "todo"

    const state = String(rawState ?? "").toLowerCase()

    if (state === "pass" || state === "passed" || state === "success") return "pass"
    if (state === "fail" || state === "failed") return "fail"
    if (state === "skip" || state === "skipped") return "skip"
    if (state === "todo") return "todo"

    if (!state) return "pending"
    return "unknown"
}

const iconFor = (state: TaskState) => {
    switch (state) {
        case "pass":
            return pc.green("✔")
        case "fail":
            return pc.red("✖")
        case "skip":
            return pc.yellow("↷")
        case "todo":
            return pc.yellow("…")
        case "pending":
            return pc.gray("·")
        default:
            return pc.gray("?")
    }
}

const colourName = (state: TaskState, text: string) => {
    switch (state) {
        case "pass":
            return pc.white(text)
        case "fail":
            return pc.red(text)
        case "skip":
        case "todo":
            return pc.yellow(text)
        default:
            return pc.gray(text)
    }
}

const formatDuration = (ms?: number) => {
    if (!ms || ms <= 0) return ""
    if (ms < 1000) return pc.dim(` ${Math.round(ms)}ms`)
    return pc.dim(` ${(ms / 1000).toFixed(2)}s`)
}

export default class PrettyReporter implements Reporter {
    private ctx: Vitest | undefined
    private startMs = 0
    private indexed = false
    private totalTests = 0
    private pass = 0
    private fail = 0
    private skip = 0
    private todo = 0
    private completed = new Set<string>()
    private lastProgressRender = 0
    private readonly interactive = Boolean(process.stdout.isTTY)

    onInit(ctx: Vitest) {
        this.ctx = ctx
        this.startMs = Date.now()

        process.stdout.write(pc.cyan(pc.bold("\n SILKCHAT TEST SUITE \n")))
        process.stdout.write(pc.gray(" Running tests...\n\n"))
    }

    onTaskUpdate(packs: TaskResultPack[]) {
        this.ensureIndexedFromState()

        for (const pack of packs ?? []) {
            if (!pack?.id || !pack.result) continue

            const state = normaliseState(pack.result.state, undefined)
            const terminal =
                state === "pass" || state === "fail" || state === "skip" || state === "todo"

            if (!terminal || this.completed.has(pack.id)) continue

            this.completed.add(pack.id)

            if (state === "pass") this.pass += 1
            if (state === "fail") this.fail += 1
            if (state === "skip") this.skip += 1
            if (state === "todo") this.todo += 1
        }

        if (!this.interactive) return

        const now = Date.now()
        if (now - this.lastProgressRender < 80) return
        this.lastProgressRender = now

        this.renderProgressLine()
    }

    onTestRunEnd() {
        if (this.interactive) {
            process.stdout.write("\r\x1b[2K\n")
        }

        this.printReportFromState()
    }

    private getStateFiles(): AnyFile[] {
        const ctx = this.ctx as
            | { state?: { getFiles?: () => unknown; files?: unknown } }
            | undefined
        const state = ctx?.state

        const filesFromGetter = state?.getFiles?.()
        if (Array.isArray(filesFromGetter)) return filesFromGetter

        const filesFromProp = state?.files
        if (Array.isArray(filesFromProp)) return filesFromProp

        return []
    }

    private ensureIndexedFromState() {
        if (this.indexed) return

        const files = this.getStateFiles()
        if (!files.length) return

        let total = 0

        const walk = (task: AnyTask) => {
            if (!task) return
            if (task.type === "test") total += 1
            if (Array.isArray(task.tasks)) task.tasks.forEach(walk)
        }

        files.forEach((file) => {
            if (Array.isArray(file.tasks)) file.tasks.forEach(walk)
        })

        this.totalTests = total
        this.indexed = true
    }

    private renderProgressLine() {
        const total = Math.max(this.totalTests, 1)
        const done = Math.min(this.completed.size, total)
        const pct = this.totalTests ? Math.round((done / total) * 100) : 0

        const width = 28
        const filled = Math.round((pct / 100) * width)
        const bar = pc.green("█".repeat(filled)) + pc.gray("░".repeat(width - filled))

        const elapsed = (Date.now() - this.startMs) / 1000

        const line = [
            pc.dim(" Progress "),
            "[",
            bar,
            "] ",
            pc.white(`${pct}%`),
            pc.dim(`  (${done}/${this.totalTests})`),
            pc.dim("  | "),
            pc.green(`✔ ${this.pass}`),
            pc.dim(" "),
            pc.red(`✖ ${this.fail}`),
            pc.dim(" "),
            pc.yellow(`↷ ${this.skip}`),
            this.todo ? pc.dim(" ") : "",
            this.todo ? pc.yellow(`… ${this.todo}`) : "",
            pc.dim(`  | ${elapsed.toFixed(1)}s`)
        ].join("")

        process.stdout.write(`\r\x1b[2K${line}`)
    }

    private printReportFromState() {
        const files = this.getStateFiles()
        const duration = ((Date.now() - this.startMs) / 1000).toFixed(2)

        const totals = this.computeTotals(files)
        this.pass = totals.pass
        this.fail = totals.fail
        this.skip = totals.skip
        this.todo = totals.todo
        this.totalTests = totals.total

        process.stdout.write(pc.cyan(pc.bold("\n RESULTS \n")))

        const grouped = new Map<string, AnyFile[]>()
        for (const file of files) {
            const raw = file.filepath ?? file.file ?? file.name ?? ""
            const rel = normalisePath(toRelative(raw))
            const dir = normalisePath(safeDirname(rel)) || "."
            const group = grouped.get(dir) ?? []
            group.push(file)
            grouped.set(dir, group)
        }

        const dirs = [...grouped.keys()].sort((a, b) => a.localeCompare(b))

        for (const dir of dirs) {
            process.stdout.write(pc.magenta(pc.bold(`\n ${dir === "." ? "." : dir}\n`)))

            const dirFiles = grouped.get(dir) ?? []
            dirFiles.sort((a, b) => {
                const aPath = a.filepath ?? a.file ?? a.name ?? ""
                const bPath = b.filepath ?? b.file ?? b.name ?? ""
                return aPath.localeCompare(bPath)
            })

            for (const file of dirFiles) {
                const raw = file.filepath ?? file.file ?? file.name ?? ""
                const rel = normalisePath(toRelative(raw))
                const name = safeBasename(rel)
                const stats = this.computeFileTotals(file)

                const badge =
                    stats.fail > 0
                        ? pc.red(` ${stats.fail} failed`)
                        : pc.green(` ${stats.pass} passed`)

                const extras: string[] = []
                if (stats.skip > 0) extras.push(pc.yellow(`${stats.skip} skipped`))
                if (stats.todo > 0) extras.push(pc.yellow(`${stats.todo} todo`))

                process.stdout.write(
                    `  ${pc.dim(name)}${pc.dim("  ")}${badge}${extras.length ? pc.dim(` (${extras.join(", ")})`) : ""}${formatDuration(stats.durationMs)}\n`
                )

                if (Array.isArray(file.tasks) && file.tasks.length) {
                    for (const task of file.tasks) this.printTaskTree(task, 4)
                }
            }
        }

        const done = this.pass + this.fail + this.skip + this.todo
        const pct = this.totalTests ? Math.round((done / this.totalTests) * 100) : 0

        process.stdout.write(pc.gray("\n ─────────────────────────────────────────────\n"))
        process.stdout.write(
            ` Summary: ${pc.green(`✔ ${this.pass}`)}  ${pc.red(`✖ ${this.fail}`)}  ${pc.yellow(`↷ ${this.skip}`)}${this.todo ? `  ${pc.yellow(`… ${this.todo}`)}` : ""}\n`
        )
        process.stdout.write(` Progress: ${pct}% (${done}/${this.totalTests})\n`)
        process.stdout.write(` Time: ${duration}s\n`)

        if (this.fail > 0) {
            process.stdout.write(pc.red(`\n ${this.fail} failing test(s).\n\n`))
        } else {
            process.stdout.write(pc.green("\n All tests passed.\n\n"))
        }
    }

    private computeTotals(files: AnyFile[]) {
        let pass = 0
        let fail = 0
        let skip = 0
        let todo = 0
        let total = 0

        const walk = (task: AnyTask) => {
            if (!task) return

            if (task.type === "test") {
                total += 1
                const state = normaliseState(task.result?.state, task.mode)
                if (state === "pass") pass += 1
                else if (state === "fail") fail += 1
                else if (state === "skip") skip += 1
                else if (state === "todo") todo += 1
            }

            if (Array.isArray(task.tasks)) task.tasks.forEach(walk)
        }

        files.forEach((file) => {
            if (Array.isArray(file.tasks)) file.tasks.forEach(walk)
        })

        return { pass, fail, skip, todo, total }
    }

    private computeFileTotals(file: AnyFile) {
        let pass = 0
        let fail = 0
        let skip = 0
        let todo = 0
        let durationMs = 0

        const walk = (task: AnyTask) => {
            if (!task) return

            if (task.type === "test") {
                const state = normaliseState(task.result?.state, task.mode)
                if (state === "pass") pass += 1
                else if (state === "fail") fail += 1
                else if (state === "skip") skip += 1
                else if (state === "todo") todo += 1

                if (typeof task.result?.duration === "number") {
                    durationMs += task.result.duration
                }
            }

            if (Array.isArray(task.tasks)) task.tasks.forEach(walk)
        }

        if (Array.isArray(file.tasks)) file.tasks.forEach(walk)

        return { pass, fail, skip, todo, durationMs }
    }

    private printTaskTree(task: AnyTask, indent: number) {
        const pad = " ".repeat(indent)

        if (task.type === "suite") {
            if (task.name?.trim()) {
                process.stdout.write(`${pad}${pc.blue(pc.bold(task.name))}\n`)
            }
            if (Array.isArray(task.tasks)) {
                for (const child of task.tasks) this.printTaskTree(child, indent + 2)
            }
            return
        }

        if (task.type !== "test") return

        const state = normaliseState(task.result?.state, task.mode)
        process.stdout.write(
            `${pad}${iconFor(state)} ${colourName(state, task.name ?? "(unnamed test)")}${formatDuration(task.result?.duration)}\n`
        )

        if (state !== "fail" || !Array.isArray(task.result?.errors)) return

        for (const error of task.result.errors) {
            let message = "Unknown error"

            if (error instanceof Error) {
                message = error.message.split("\n")[0]
            } else if (typeof error === "string") {
                message = error.split("\n")[0]
            } else if (error && typeof error === "object") {
                try {
                    message = JSON.stringify(error).slice(0, 140)
                } catch {
                    message = "[object]"
                }
            } else if (error != null) {
                message = String(error).split("\n")[0]
            }

            process.stdout.write(`${pad}  ${pc.red("└─ ")}${pc.dim(message)}\n`)
        }
    }
}
