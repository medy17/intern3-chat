# SilkChat

SilkChat is a TanStack Start + Convex chat app with Better Auth, Postgres-backed auth data, internal provider credits, BYOK support, file uploads, web search, artifacts, and image generation.

This repository is the source of truth for setup and model/provider changes. The old hosted docs were lagging behind the actual code.

## Stack

- `src/`: TanStack Start app, Better Auth routes, UI, browser env handling
- `convex/`: chat runtime, model selection, provider factory, settings, HTTP actions
- `Postgres`: Better Auth tables via Drizzle
- `Convex`: app backend, chat streaming, provider execution, user settings, file storage integration
- `Vercel`: web app hosting and server routes

## Quick Start

1. Install dependencies:

```bash
bun install
```

2. Copy `.env.example` to `.env.local` and fill in the values you actually need.

3. One-time local setup (starts Docker services, pushes auth schema, prompts for local Convex):

```bash
bun run local:setup
```

4. Start local development (Convex local + app on `localhost:3000`):

```bash
bun run local:dev
```

`bun run local:dev` now starts three processes:

- Convex local
- the Vite app
- a local Sharp-backed image optimizer that serves mocked `/cdn-cgi/image/...` URLs and caches outputs in `/.optimised-image-cache`

If you prefer separate terminals:

```bash
bun run local:convex
```

```bash
bun run local:app
```

The app runs at `http://localhost:3000`.
Plain `bun run dev` still uses the old direct local `/r2` image path without the optimizer helper.

## Push To Cloud Dev

When local iteration is done and you want to push Convex functions to cloud dev
(`knowing-falcon-519`) without changing your local setup:

```bash
bun run cloud:dev:push
```

This script is cross-platform (Windows/macOS/Linux).
It also restores your original `.env.local` after the push so local mode is not overwritten.

Manual overrides:

```powershell
$env:CONVEX_DEPLOYMENT="dev:knowing-falcon-519"
bunx convex dev --once --codegen disable --typecheck disable
Remove-Item Env:CONVEX_DEPLOYMENT
```

```bash
CONVEX_DEPLOYMENT=dev:knowing-falcon-519 bunx convex dev --once --codegen disable --typecheck disable
```

## Local WS Troubleshooting

If you see websocket errors like `ws://127.0.0.1:3210/... code 1006`, check `CONVEX_DEPLOYMENT` in `.env.local`.
It must start with `local:` when running `bun run local:dev`.
Local scripts also pass `--local-force-upgrade` to avoid blocking upgrade prompts in non-interactive terminals.

## Environment Split

The repo uses two different runtime environments.

### Vercel environment

These variables are read by the web app and Better Auth:

- `BETTER_AUTH_SECRET`
- `DATABASE_URL`
- `VITE_BETTER_AUTH_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `RESEND_API_KEY`
- `VITE_CONVEX_URL`
- `VITE_CONVEX_API_URL`
- `VITE_ENABLED_INTERNAL_PROVIDERS`
- `VITE_ENABLE_VOICE_INPUT`

### Convex environment

These variables are read by Convex actions and HTTP routes:

- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY` for routing internal text models through OpenRouter
- `XAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `STT_PROVIDER` to choose `google` or `groq` for `/transcribe`
- `GOOGLE_AI_STUDIO_API_KEY` or Vertex credentials
- `GOOGLE_SPEECH_LOCATION` for voice transcription region overrides
- `GROQ_API_KEY`
- `FAL_API_KEY`
- search provider keys
- storage keys
- `ENCRYPTION_KEY`

If a feature looks configured in Vercel but still fails at runtime, check whether the actual key belongs in Convex instead.

## Docs

- [Setup Guide](./SETUP_GUIDE.md)
- [Model & Provider Guide](./MODEL_PROVIDER_GUIDE.md)
- [OAuth Setup](./OAUTH_SETUP.md)
- [BYOK Setup](./BYOK_SETUP.md)
- [Email Setup](./EMAIL_SETUP.md)
- [Voice Input Setup](./VOICE_INPUT_SETUP.md)
- [Convex README](./convex/README.md)

## Important Files

- `src/lib/auth.ts`: Better Auth config, cookie bridge, JWT/JWKS settings
- `src/routes/api/auth/$.ts`: auth route wrapper and stale-JWKS recovery
- `convex/auth.config.ts`: Convex JWT validation against Better Auth JWKS
- `convex/lib/models.ts`: built-in model registry
- `convex/lib/provider_factory.ts`: provider creation and OpenAI-compatible adapters
- `convex/chat_http/get_model.ts`: resolves a selected model into an SDK model
- `convex/chat_http/post.route.ts`: provider-specific reasoning options
- `convex/chat_http/image_generation.ts`: image model execution and provider quirks
- `src/lib/models-providers-shared.ts`: provider metadata and internal-provider visibility in the UI

## Current Internal Providers

The browser currently enables these internal providers by default:

```bash
VITE_ENABLED_INTERNAL_PROVIDERS="openai,google,xai"
```

Hidden providers like `groq` and `fal` are still supported, but they are not shown as normal internal-provider options in the UI.

If `OPENROUTER_API_KEY` is set in Convex, internal text models with an `openrouter:*` adapter will route through OpenRouter first while keeping the same app-level internal model identity. Image and speech flows still use their direct provider integrations.

## Current Model Notes

Recent built-in additions include:

- OpenAI: `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-image-1.5-2025-12-16`
- Google: `gemini-3-flash-preview`, `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite-preview`, `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`, `imagen-4.0-*`
- xAI: `grok-4-1-*`, `grok-4.20-0309-*`

See [MODEL_PROVIDER_GUIDE.md](./MODEL_PROVIDER_GUIDE.md) for the rules behind those additions.

## Development Notes

- Use the local loop first. Do not debug auth or model changes by waiting on repeated Vercel builds unless the bug only reproduces in production.
- For production on Vercel, prefer a Postgres connection string that is Vercel-safe, for example a Supabase pooler URL. Direct database hosts can fail with DNS or network restrictions.
- Better Auth and Convex are coupled through `/api/auth/jwks`, so auth changes are never just a UI concern.
