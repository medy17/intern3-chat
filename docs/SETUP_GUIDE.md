# Setup Guide

This guide documents the current working setup for local development, production deployment, auth, and faster debugging.

## Architecture Overview

The app is split across three runtime layers:

1. `Vercel app`
   - serves the TanStack Start app
   - runs Better Auth
   - talks to Postgres through Drizzle
2. `Convex`
   - runs chat, tools, file routes, speech-to-text, search, and model execution
3. `Postgres`
   - stores Better Auth users, sessions, accounts, verifications, and `jwkss`

Convex trusts Better Auth JWTs using the app's `/api/auth/jwks` endpoint.

## Required Local Services

The included `docker-compose.yml` starts:

- Postgres on `localhost:5432`
- MinIO on `localhost:9000` and console `localhost:9001`

Start them with:

```bash
docker compose up -d
```

## Local Development

### Recommended flow

1. Copy `.env.example` to `.env.local`.
2. Fill in the variables you need.
3. Use local Postgres + local Convex URLs:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/intern3_db
VITE_BETTER_AUTH_URL=http://localhost:3000
VITE_CONVEX_URL=http://127.0.0.1:3210
VITE_CONVEX_API_URL=http://127.0.0.1:3210/http
```

4. Keep `CONVEX_DEPLOY_KEY` out of `.env.local` for local development to avoid accidentally targeting cloud deployments.
5. Run one-time local setup:

```bash
bun run local:setup
```

6. Start the local dev loop:

```bash
bun run local:dev
```

If you prefer separate terminals:

```bash
bun run local:convex
bun run local:app
```

### Push local code to cloud dev (`knowing-falcon-519`)

Preferred (cross-platform):

```bash
bun run cloud:dev:push
```

Manual shell-specific variants:

```powershell
$env:CONVEX_DEPLOYMENT="dev:knowing-falcon-519"
bunx convex dev --once --codegen disable --typecheck disable
Remove-Item Env:CONVEX_DEPLOYMENT
```

```bash
CONVEX_DEPLOYMENT=dev:knowing-falcon-519 bunx convex dev --once --codegen disable --typecheck disable
```

These push Convex functions to cloud dev but keep your local default unchanged.

If you still hit `ws://127.0.0.1:3210/... code 1006` afterward, verify `.env.local` has:

```bash
CONVEX_DEPLOYMENT=local:...
```

Then run:

```bash
bun run local:convex:configure
```

The local scripts use `--local-force-upgrade`, so Convex backend upgrade prompts do not block non-interactive terminals.

### Fastest debug loop

Use a local app first. Repeated Vercel builds are too slow for auth and provider debugging.

Good local loops:

- local app + local Postgres + local Convex dev
- local app + local Postgres + an existing Convex cloud dev deployment

Only switch back to Vercel when you already have a likely fix.

## Production Deployment

### Vercel owns

- `BETTER_AUTH_SECRET`
- `DATABASE_URL`
- `VITE_BETTER_AUTH_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `VITE_CONVEX_URL`
- `VITE_CONVEX_API_URL`
- `VITE_ENABLED_INTERNAL_PROVIDERS`

### Convex owns

- model provider secrets
- search provider secrets
- encryption key
- storage credentials

Use:

```bash
npx convex env set NAME value
npx convex deploy
vercel --prod
```

## Production Database Guidance

For Vercel, use a database connection that the runtime can actually reach. If you use Supabase, prefer the pooler or another Vercel-safe endpoint over a direct host that may fail DNS resolution or require network paths Vercel cannot use reliably.

## Auth-Specific Notes

### Better Auth details that matter in this repo

- `src/lib/auth.ts` trims env values before using them.
- `reactStartCookies()` must stay enabled.
- Better Auth JWTs are signed for audience `intern3`.
- Convex validates them against:
  - issuer: `VITE_BETTER_AUTH_URL`
  - JWKS: `${VITE_BETTER_AUTH_URL}/api/auth/jwks`

### JWK failure mode we hit

If `BETTER_AUTH_SECRET` changes while old encrypted `jwkss` rows still exist, Better Auth can fail with:

```text
Failed to decrypt private private key
```

Current behavior:

- `src/lib/auth.ts` disables private-key encryption for newly generated JWKs
- `src/routes/api/auth/$.ts` clears stale `jwkss` rows and retries once on this failure

If you ever rotate `BETTER_AUTH_SECRET`, clear stale JWK rows intentionally instead of waiting for random session failures.

### Session mismatch symptom

If the UI briefly looks signed in and then drops back to signed out, inspect:

- `GET /api/auth/get-session`
- `GET /api/auth/jwks`

If either one returns `500`, the auth state will look inconsistent even when the OAuth callback itself succeeded.

### Cookie bridge symptom

If auth succeeds but the app cannot keep session state across the TanStack Start response cycle, confirm `reactStartCookies()` is still present in `src/lib/auth.ts`.

## Google OAuth Notes

- keep Google envs free of trailing whitespace
- make redirect URIs match exactly
- use:
  - local: `http://localhost:3000/api/auth/callback/google`
  - production: `https://your-domain/api/auth/callback/google`

## Internal Provider Setup

The browser only shows internal providers listed in:

```bash
VITE_ENABLED_INTERNAL_PROVIDERS
```

The backend only enables providers that actually have keys configured in Convex.

Both must be correct.

## Suggested Change Workflow

### Setup/auth changes

1. reproduce locally
2. fix locally
3. verify `/api/auth/get-session` and `/api/auth/jwks`
4. deploy Convex if backend code changed
5. deploy Vercel if app code or app env changed

### Model/provider changes

1. add or update the model registry
2. patch provider factory or routing logic if the provider is new
3. verify internal provider env configuration
4. test locally with a real request
5. deploy Convex
6. deploy Vercel only if the browser app or app env changed

For the detailed model workflow, see [MODEL_PROVIDER_GUIDE.md](./MODEL_PROVIDER_GUIDE.md).
