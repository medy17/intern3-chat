import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export const copyToClipboard = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text)
    } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement("textarea")
        textArea.value = text
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        try {
            document.execCommand("copy")
        } catch (err) {
            console.error("Failed to copy text: ", err)
        }
        document.body.removeChild(textArea)
    }
}

const drawBlobToCanvas = async (blob: Blob, canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d")
    if (!context) {
        throw new Error("Canvas rendering is unavailable")
    }

    if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(blob)

        try {
            canvas.width = bitmap.width
            canvas.height = bitmap.height
            context.drawImage(bitmap, 0, 0)
            return
        } finally {
            bitmap.close()
        }
    }

    const objectUrl = URL.createObjectURL(blob)

    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = () => reject(new Error("Failed to decode image"))
            img.src = objectUrl
        })

        canvas.width = image.naturalWidth || image.width
        canvas.height = image.naturalHeight || image.height
        context.drawImage(image, 0, 0)
    } finally {
        URL.revokeObjectURL(objectUrl)
    }
}

const convertBlobToPng = async (blob: Blob) => {
    const canvas = document.createElement("canvas")
    await drawBlobToCanvas(blob, canvas)

    return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((pngBlob) => {
            if (pngBlob) {
                resolve(pngBlob)
                return
            }

            reject(new Error("Failed to encode image as PNG"))
        }, "image/png")
    })
}

const writeImageBlobToClipboard = async (blob: Blob) => {
    await navigator.clipboard.write([
        new ClipboardItem({
            [blob.type]: blob
        })
    ])
}

export const copyImageUrlToClipboard = async (url: string) => {
    const response = await fetch(url)

    if (!response.ok) {
        throw new Error(`Image request failed (${response.status})`)
    }

    const blob = await response.blob()
    if (!blob.type.startsWith("image/")) {
        throw new Error("Fetched file is not an image")
    }

    if (blob.type === "image/png") {
        await writeImageBlobToClipboard(blob)
        return
    }

    try {
        await writeImageBlobToClipboard(blob)
    } catch {
        const pngBlob = await convertBlobToPng(blob)
        await writeImageBlobToClipboard(pngBlob)
    }
}
