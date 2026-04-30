import path from "node:path"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
// vite.config.ts
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig, loadEnv } from "vite"
import analyzer from "vite-bundle-analyzer"
import svgr from "vite-plugin-svgr"
import { LOCAL_IMAGE_OPTIMIZER_DEFAULT_PORT } from "./src/lib/local-image-optimizer"

const sandpackSsrStub = path.resolve(__dirname, "./src/lib/sandpack-react-ssr-stub.tsx")

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "")
    const convexApiUrl = env.VITE_CONVEX_API_URL?.trim()
    const convexApiTarget = convexApiUrl ? new URL(convexApiUrl) : null
    const convexApiOrigin = convexApiTarget
        ? `${convexApiTarget.protocol}//${convexApiTarget.host}`
        : null
    const convexApiBasePath = convexApiTarget?.pathname.replace(/\/$/, "") || ""
    const localImageOptimizerEnabled =
        (
            process.env.VITE_LOCAL_IMAGE_OPTIMIZER_ENABLED ?? env.VITE_LOCAL_IMAGE_OPTIMIZER_ENABLED
        )?.trim() === "1"
    const localImageOptimizerPort =
        (process.env.LOCAL_IMAGE_OPTIMIZER_PORT || "").trim() ||
        String(LOCAL_IMAGE_OPTIMIZER_DEFAULT_PORT)
    const proxy: Record<
        string,
        {
            target: string
            changeOrigin: boolean
            rewrite?: (requestPath: string) => string
        }
    > = convexApiOrigin
        ? {
              "/convex-http": {
                  target: convexApiOrigin,
                  changeOrigin: true,
                  rewrite: (requestPath: string) =>
                      requestPath.replace(/^\/convex-http/, convexApiBasePath)
              }
          }
        : {}

    if (localImageOptimizerEnabled) {
        proxy["/cdn-cgi/image"] = {
            target: `http://127.0.0.1:${localImageOptimizerPort}`,
            changeOrigin: true
        }
    }

    return {
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
            proxy: Object.keys(proxy).length > 0 ? proxy : undefined
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
            babel({ presets: [reactCompilerPreset()] }),
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
    }
})
