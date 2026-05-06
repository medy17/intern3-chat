# BYOK (Bring Your Own Key) Setup

This app supports both:

- internal provider keys managed by the deployment
- user BYOK keys stored per account

User BYOK keys are encrypted before storage and decrypted only at runtime.

## Required Encryption Variable

Set this in Convex:

```bash
ENCRYPTION_KEY=your_random_secret
```

Use a long random value. Do not reuse an example value.

## Supported BYOK Providers

- `openai`
- `anthropic`
- `google`
- `xai`
- `openrouter`
- `groq`
- `fal`

## Google BYOK Modes

Google supports two auth modes:

- `ai-studio`: standard API key
- `vertex`: service account JSON

Important limitation:

- Google image-only models that use the OpenAI-compatible image endpoint require AI Studio auth. They do not run through Vertex in the current implementation.

## Internal Provider Environment Variables

These belong in Convex, not Vercel:

```bash
OPENAI_API_KEY=
OPENROUTER_API_KEY=
XAI_API_KEY=
ANTHROPIC_API_KEY=

GOOGLE_INTERNAL_PROVIDER=ai-studio
GOOGLE_AI_STUDIO_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=

GOOGLE_VERTEX_CREDENTIALS_JSON=
GOOGLE_VERTEX_PROJECT=
GOOGLE_VERTEX_LOCATION=us-central1

GROQ_API_KEY=
FAL_API_KEY=
```

If `OPENROUTER_API_KEY` is set, internal text models that also define an `openrouter:*` adapter can route through OpenRouter even when their original internal provider key is not configured. Direct provider paths are still used for image generation and speech-to-text.

## How Provider Resolution Works

When a model is selected, the runtime resolves providers in this order:

1. matching user BYOK key
2. matching internal provider key
3. failure if neither is available

For built-in models, the available adapter list lives in `convex/lib/models.ts`.

## Where Provider Visibility Comes From

Two checks control whether an internal provider is usable:

1. `convex/lib/internal_provider_config.ts` checks whether the secret exists in Convex.
2. `VITE_ENABLED_INTERNAL_PROVIDERS` decides whether the browser should show that internal provider.

That means a provider can be configured in Convex and still hidden in the UI.

## xAI Notes

xAI is implemented through xAI's OpenAI-compatible API:

- base URL: `https://api.x.ai/v1`
- provider name: `xai`

The project does not use a dedicated xAI SDK package here because the installed AI SDK versions are aligned around the OpenAI-compatible path.

## Google Notes

Google text models use the Google SDK path:

- AI Studio API keys
- or Vertex service account credentials

Google image models that were added later use Google's OpenAI-compatible endpoint because the installed Google SDK package in this repo does not expose an image model API.

## Security Notes

- Never commit provider keys.
- Never store user BYOK secrets in plain text.
- Rotate `ENCRYPTION_KEY` carefully. If you change it, previously encrypted stored keys will become unreadable.

## Related Docs

- [Model & Provider Guide](./MODEL_PROVIDER_GUIDE.md)
- [Setup Guide](./SETUP_GUIDE.md)
