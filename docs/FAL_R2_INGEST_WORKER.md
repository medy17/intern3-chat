# fal to R2 ingestion Worker

The Worker keeps generated image and read-aloud bytes out of Convex. Convex sends signed requests,
and the Worker streams each asset into the bound bucket. Convex records the resulting metadata after
storage completes.

Read-aloud recordings use `tts/<userId>/<hash>-speech.wav`. The `generations/` prefix is reserved
for generated images. Speech ticket validation is shared by Convex and the Worker, so prefix changes
require deploying both.

Image ingestion falls back to the existing Convex download-and-upload path when the Worker is
disabled or its request fails. Read aloud requires the Worker and uses signed callbacks to exchange
configuration and finalize metadata. The Worker owns no durable job state.

## Configure an environment

The Wrangler config contains cloud development, staging, and production environments. Verify each
`bucket_name` in `workers/fal-r2-ingest/wrangler.jsonc` before deploying.

Authenticate Wrangler and set a different shared secret in each environment:

```powershell
bunx wrangler login

bunx wrangler secret put FAL_R2_INGEST_SECRET --config workers/fal-r2-ingest/wrangler.jsonc --env=""
bunx wrangler secret put FAL_R2_INGEST_SECRET --config workers/fal-r2-ingest/wrangler.jsonc --env staging
bunx wrangler secret put FAL_R2_INGEST_SECRET --config workers/fal-r2-ingest/wrangler.jsonc --env production
```

Deploy the cloud-development Worker manually when its code changes:

```powershell
bun run fal:r2:worker:deploy:cloud-dev
```

`bun run staging:deploy` and `bun run prod:deploy` deploy their matching Worker before Convex and
the frontend. This makes new Worker routes available before Convex starts issuing requests to them.

Append `/ingest` to the deployed Worker URL and set the matching Convex environment:

```dotenv
FAL_R2_INGEST_URL="https://<worker-host>/ingest"
FAL_R2_INGEST_SECRET="<same-environment-secret>"
```

Push the environment and Convex backend using the repository's normal environment and deployment
commands. Removing `FAL_R2_INGEST_URL` immediately restores the Convex-only path.

## Validate

```powershell
bun run fal:r2:worker:typecheck
bun run check-types
bun run test
```

After enabling it, generate an image and confirm the Worker handles one `/ingest` request, the image
appears normally, and Convex logs do not contain the fallback message.

The Worker accepts HTTPS sources under `*.fal.media`, follows at most three validated redirects,
limits each streamed asset to 100 MiB, and gives the upstream request two minutes.
