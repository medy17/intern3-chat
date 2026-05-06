# OAuth Configuration

This app currently uses Better Auth with Google OAuth plus email OTP. Convex trusts Better Auth JWTs through the app's JWKS endpoint, so OAuth setup has to be correct at both the app and backend levels.

## Required Environment Variables

These belong in the Vercel app environment, or in `.env.local` for local development.

```bash
BETTER_AUTH_SECRET=replace-with-a-stable-secret
DATABASE_URL=postgresql://...
VITE_BETTER_AUTH_URL=http://localhost:3000

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

VITE_CONVEX_URL=https://your-convex-deployment.convex.cloud
VITE_CONVEX_API_URL=https://your-convex-deployment.convex.cloud/http
```

## Google OAuth Setup

1. Go to Google Cloud Console.
2. Create or select a project.
3. Open `APIs & Services > Credentials`.
4. Create an OAuth client ID for a web application.
5. Add redirect URIs:
   - local: `http://localhost:3000/api/auth/callback/google`
   - production: `https://your-domain.com/api/auth/callback/google`
6. Add the client ID and secret to your runtime env.

## Local Auth Loop

1. Copy `.env.example` to `.env.local`.
2. Set `DATABASE_URL` to your local Postgres instance.
3. Set `VITE_BETTER_AUTH_URL=http://localhost:3000`.
4. Run:

```bash
docker compose up -d
bun run auth:push
bunx convex dev
bun run dev
```

## Better Auth Notes

The current auth implementation depends on these details:

- `src/lib/auth.ts` trims env vars before use. This protects against trailing spaces and newline characters in OAuth envs.
- `reactStartCookies()` is required. Without it, the UI can look signed in briefly and then fall back to signed out.
- Better Auth JWTs are used by Convex, so `/api/auth/jwks` must stay healthy.
- The app now generates JWT signing keys with `disablePrivateKeyEncryption: true` to avoid stale key decryption failures after secret mismatches.

## Production Database Note

For Vercel deployments, use a connection string that works from Vercel's runtime. In practice that usually means a Supabase pooler or other Vercel-safe Postgres endpoint rather than a direct host that may fail DNS or network resolution.

## Troubleshooting

### OAuth URL contains `%0D%0A` or Google says the request is malformed

Your OAuth envs likely contain trailing newline characters. Re-save them cleanly in Vercel. The app trims them now, but the source values should still be corrected.

### Sign-in succeeds, then the UI falls back to logged out

Check:

1. `GET /api/auth/get-session`
2. `GET /api/auth/jwks`

If either one fails, Convex session state will not stay consistent.

### `Failed to decrypt private private key`

This means Better Auth is reading a stale `jwkss` row that was encrypted under a different secret. The route wrapper in `src/routes/api/auth/$.ts` now clears stale `jwkss` rows and retries once, but if it persists:

1. confirm `BETTER_AUTH_SECRET` is stable
2. clear the old `jwkss` rows
3. retry auth

### Redirect URI mismatch

The callback URL in Google Cloud must match exactly:

- same protocol
- same host
- same path

### Convex auth fails after OAuth looks successful

Check `convex/auth.config.ts` and confirm:

- `VITE_BETTER_AUTH_URL` is correct
- the JWKS endpoint at `/api/auth/jwks` returns `200`

If the issuer or JWKS URL is wrong, Convex will reject the Better Auth JWT even if Google sign-in worked.
