import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

crons.interval(
    "cleanup stale import jobs",
    { hours: 1 },
    internal.import_jobs.cleanupStaleImportData
)

export default crons
