# Model & Provider Guide

This guide documents how built-in models are wired in this repo and what has to change when you add or update models.

## Core Concepts

### Built-in model registry

Built-in models live in:

```text
convex/lib/models.ts
```

Each entry defines:

- `id`: the app-facing model ID
- `name` and optional `shortName`
- `adapters`: provider-specific targets like `openai:gpt-4o` or `i3-google:gemini-2.5-flash`
- `abilities`: feature flags used by the runtime and UI
- optional `mode`: `text`, `image`, or `speech-to-text`
- optional `supportedImageSizes`
- optional `customIcon`

### Adapter prefixes

- `openai:*`, `google:*`, `anthropic:*`, `xai:*`, `groq:*`, `fal:*`: user BYOK
- `i3-openai:*`, `i3-google:*`, `i3-xai:*`, etc.: internal provider keys
- `openrouter:*`: OpenRouter routing

Internal text requests can also route through OpenRouter when:

- the model has an `openrouter:*` adapter
- `OPENROUTER_API_KEY` is configured in Convex

That keeps the app-level model identity as `i3-*` while flattening transport quirks behind OpenRouter for the actual text request.

### Abilities

Common abilities:

- `reasoning`
- `effort_control`
- `vision`
- `function_calling`
- `pdf`

These flags are not decorative. They change runtime behavior.

## How To Add A Built-In Model

### 1. Add the model entry

Edit `convex/lib/models.ts` and define:

- the model ID
- adapters
- abilities
- mode if it is not normal text
- supported sizes if it is an image model

### 2. Check provider support

If the provider already exists and the model uses the same API shape, you may be done.

If not, also update:

- `convex/lib/provider_factory.ts`
- `convex/chat_http/get_model.ts`
- `convex/chat_http/post.route.ts`
- `convex/chat_http/image_generation.ts`

### 3. Check internal provider visibility

If the model uses an internal adapter like `i3-xai:*`, make sure:

- the provider is considered configured in `convex/lib/internal_provider_config.ts`
- the provider is enabled in `VITE_ENABLED_INTERNAL_PROVIDERS`
- the UI knows how to display the provider in `src/lib/models-providers-shared.ts`

### 4. Check UI provider metadata

If the provider is new, also update:

- `src/components/brand-icons.tsx`
- `src/components/model-selector.tsx`
- `src/lib/models-providers-shared.ts`

## How To Add A New Provider

You usually need to touch all of these:

1. `convex/lib/models.ts`
2. `convex/lib/provider_factory.ts`
3. `convex/lib/internal_provider_config.ts`
4. `convex/chat_http/get_model.ts`
5. `src/lib/models-providers-shared.ts`
6. provider icons in the UI

If the provider supports image generation or provider-specific reasoning controls, also update:

7. `convex/chat_http/post.route.ts`
8. `convex/chat_http/image_generation.ts`

## Provider-Specific Notes

### OpenAI

- provider is created with `createOpenAI(...)`
- built-in reasoning options are currently applied for model IDs starting with:
  - `o1`
  - `o3`
  - `o4`
  - `gpt-5.4`
- reasoning is passed via `OpenAIResponsesProviderOptions`

### Anthropic

- reasoning budget is mapped through `thinking.budgetTokens`
- only models tagged with `effort_control` should receive reasoning controls

### Google text models

- normal text and multimodal Google models use `@ai-sdk/google`
- auth mode can be:
  - AI Studio API key
  - Vertex service account credentials
- helper logic lives in `convex/lib/google_provider.ts`

### Google image models

The installed Google SDK path in this repo does not expose a native image model interface, so Google image models are routed through Google's OpenAI-compatible endpoint instead.

That path is implemented in:

- `convex/lib/provider_factory.ts`
- `convex/chat_http/get_model.ts`
- `convex/chat_http/image_generation.ts`

Important quirks:

- Google OpenAI-compatible image models require AI Studio auth
- Vertex is not supported for those image models in the current implementation
- aspect ratio is passed through:

```text
providerOptions.openai.extra_body.google.aspect_ratio
```

### xAI

xAI is implemented through xAI's OpenAI-compatible endpoint:

- base URL: `https://api.x.ai/v1`
- provider name: `xai`

That keeps xAI aligned with the SDK versions already used in this repo.

## Reasoning Control Rules

Reasoning controls are applied in `convex/chat_http/post.route.ts`.

Current mapping:

- OpenAI: `reasoningEffort` + `reasoningSummary`
- Anthropic: `thinking.budgetTokens`
- Google: `thinkingConfig.thinkingBudget` + `includeThoughts`
- OpenRouter: `reasoning.effort`

For Google in this repo, use the existing budget mapping. Do not assume newer `thinkingLevel` fields are available unless the installed SDK version actually supports them.

When an internal text request is routed through OpenRouter, the app-level `off|low|medium|high` setting maps to OpenRouter's reasoning effort instead of provider-native OpenAI, Google, or Anthropic fields.

## Image Model Rules

Image models must set:

- `mode: "image"`
- `supportedImageSizes`

Runtime image generation flows through:

```text
convex/chat_http/image_generation.ts
```

That file decides whether a model uses:

- a resolution like `1024x1024`
- an aspect ratio like `1:1`

If a provider needs a special transport shape, patch it there.

## Current Recent Additions

Recent built-in additions that already follow this pattern:

- OpenAI:
  - `gpt-5.4`
  - `gpt-5.4-mini`
  - `gpt-5.4-nano`
  - `gpt-image-1.5-2025-12-16`
- Google:
  - `gemini-3-flash-preview`
  - `gemini-3.1-pro-preview`
  - `gemini-3.1-flash-lite-preview`
  - `gemini-3.1-flash-image-preview`
  - `gemini-3-pro-image-preview`
  - `imagen-4.0-generate-001`
  - `imagen-4.0-ultra-generate-001`
  - `imagen-4.0-fast-generate-001`
- xAI:
  - `grok-4-1-fast`
  - `grok-4.20-0309`

## Testing Checklist

Before pushing model/provider changes:

1. confirm the model appears in the selector
2. confirm the provider is actually enabled
3. test one real request locally
4. test reasoning if the model supports `effort_control`
5. test image generation if `mode: "image"`
6. deploy Convex for backend/runtime changes
7. deploy Vercel only if the browser app or app env changed

## Common Failure Modes

- model added to `MODELS_SHARED` but provider not exposed in the UI
- provider enabled in the UI but missing from Convex env
- Google image model added without OpenAI-compatible routing
- reasoning model added without `effort_control`, so the UI/runtime never sends reasoning settings
- internal provider added but omitted from `VITE_ENABLED_INTERNAL_PROVIDERS`
