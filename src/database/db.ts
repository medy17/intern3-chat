import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
    throw new Error("DATABASE_URL is required")
}

const shouldUseSsl =
    process.env.DATABASE_SSL === "true" ||
    connectionString.includes("supabase.co") ||
    connectionString.includes("neon.tech")

const pool = new Pool({
    connectionString,
    ssl: shouldUseSsl
        ? {
              rejectUnauthorized: false
          }
        : undefined,
    max: 5
})

export const db = drizzle({
    client: pool
})
