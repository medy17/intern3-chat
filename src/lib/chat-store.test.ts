import { beforeEach, describe, expect, it } from "vitest"
import { useChatStore } from "./chat-store"

describe("chat-store", () => {
    beforeEach(() => {
        useChatStore.getState().resetChat()
    })

    it("should set thread ID", () => {
        useChatStore.getState().setThreadId("test-thread")
        expect(useChatStore.getState().threadId).toBe("test-thread")
    })

    it("should add and remove uploaded files", () => {
        const file = {
            key: "1",
            fileName: "test.txt",
            fileType: "text/plain",
            fileSize: 100,
            uploadedAt: Date.now()
        }

        useChatStore.getState().addUploadedFile(file)
        expect(useChatStore.getState().uploadedFiles).toHaveLength(1)
        expect(useChatStore.getState().uploadedFiles[0]).toEqual(file)

        useChatStore.getState().removeUploadedFile("1")
        expect(useChatStore.getState().uploadedFiles).toHaveLength(0)
    })

    it("should set last processed data index", () => {
        useChatStore.getState().setLastProcessedDataIndex(5)
        expect(useChatStore.getState().lastProcessedDataIndex).toBe(5)
    })

    it("should reset chat state completely", () => {
        useChatStore.getState().setThreadId("test")
        useChatStore.getState().setTargetMode("edit")
        useChatStore.getState().setUploading(true)

        useChatStore.getState().resetChat()

        const state = useChatStore.getState()
        expect(state.threadId).toBeUndefined()
        expect(state.targetMode).toBe("normal")
        expect(state.uploadedFiles).toHaveLength(0)
        expect(state.lastProcessedDataIndex).toBe(-1)
        expect(state.uploading).toBe(false)
    })
})
