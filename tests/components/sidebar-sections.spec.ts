import { groupThreadsByTime } from "@/components/threads/sidebar-sections"
import { describe, expect, it, vi } from "vitest"

describe("groupThreadsByTime", () => {
    it("keeps threads older than 30 days in an Older group", () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"))

        const grouped = groupThreadsByTime([
            {
                _id: "thread-older",
                title: "Old thread",
                createdAt: new Date("2026-03-01T12:00:00.000Z").getTime(),
                updatedAt: new Date("2026-03-01T12:00:00.000Z").getTime(),
                pinned: false
            },
            {
                _id: "thread-recent",
                title: "Recent thread",
                createdAt: new Date("2026-04-20T12:00:00.000Z").getTime(),
                updatedAt: new Date("2026-04-20T12:00:00.000Z").getTime(),
                pinned: false
            }
        ])

        expect(grouped.older.map((thread) => thread._id)).toEqual(["thread-older"])
        expect(grouped.lastThirtyDays.map((thread) => thread._id)).toEqual(["thread-recent"])

        vi.useRealTimers()
    })
})
