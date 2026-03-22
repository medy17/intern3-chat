import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
// vite.config.ts
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import analyzer from "vite-bundle-analyzer"
import svgr from "vite-plugin-svgr"

const sandpackSsrStub = path.resolve(__dirname, "./src/lib/sandpack-react-ssr-stub.tsx")

export default defineConfig({
    resolve: {
        alias: {
            "@/convex": path.resolve(__dirname, "./convex"),
            "@": path.resolve(__dirname, "./src"),
            "@tanstack/react-start/server": path.resolve(
                __dirname,
                "./src/lib/tanstack-react-start-server-shim.ts"
            ),
            "micromark-extension-math": "micromark-extension-llm-math"
        },
        tsconfigPaths: true
    },
    server: {
        proxy: {}
    },
    plugins: [
        (process.env.ANALYZE && analyzer()) || null,
        {
            name: "ssr-sandpack-stub",
            enforce: "pre",
            resolveId(id, _importer, options) {
                if (options?.ssr && id === "@codesandbox/sandpack-react") {
                    return sandpackSsrStub
                }
            }
        },
        tanstackStart({
            spa: {
                enabled: true
            }
        }),
        react(),
        tailwindcss(),
        svgr({ include: "**/*.svg" }),
        nitro()
    ],
    environments: {
        ssr: {
            build: {
                rollupOptions: {
                    input: "./src/server.ts"
                }
            }
        }
    }
})
