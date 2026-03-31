# Test Plan

This document records what I would test in this repo, why those areas matter, and a pragmatic order for implementing the suite.

I derived this from the codebase itself, not from `package.json`.

## Progress

- Status: in progress
- Active phase: Phase 3
- Current implementation scope:
  - minimal Vitest setup
  - custom local Vitest reporter with CI fallback to the default reporter
  - logically grouped test directories: `tests/backend`, `tests/routes`, `tests/lib`, `tests/imports`, and `tests/hooks`
  - backend-first unit coverage plus initial hook/state coverage for auth, model resolution, streaming, route handlers, attachments, imports, credits, analytics, and browser/client utilities
- Completed this round:
  - wrote initial test plan
  - added local Vitest setup
  - adapted a repo-local pretty Vitest reporter from `/temp`
  - added 31 unit test files
  - passing test batch: 135 tests across 31 files
- In progress this round:
  - unit and hook/state coverage are at a solid baseline
  - next step would be standing up a real E2E environment

### Implemented Coverage

- `tests/lib/auth-token.spec.ts`
  - JWT structure validation
  - token refresh and fallback behavior
- `tests/lib/errors.spec.ts`
  - visible vs hidden response shaping
  - error-code message mapping
- `tests/lib/credits.spec.ts`
  - configured limits
  - UTC credit period math
  - charge resolution
- `tests/lib/persistence.spec.ts`
  - SSR defaults
  - corrupted localStorage recovery
  - invalid tool normalization
  - user-input persistence behavior
- `tests/imports/thread-import-shared.spec.ts`
  - frontmatter parsing
  - timestamp parsing
  - attachment extraction
  - filename inference
- `tests/imports/thread-import-core.spec.ts`
  - strict T3 markdown parsing
  - ChatGPT Exporter JSON parsing
  - T3 bulk JSON multi-document handling
  - unsupported explicit JSON failure path
- `tests/imports/thread-export.spec.ts`
  - markdown serialization
  - message ordering
  - internal attachment URL resolution
  - archive naming
  - zip archive generation
- `tests/lib/generated-image-urls.spec.ts`
  - proxy URL generation
  - localhost/dev bypass behavior
  - responsive source metadata generation
- `tests/routes/api-auth-route.spec.ts`
  - stale-JWKS recovery
  - `/get-session` retry path
  - non-recoverable error passthrough
  - normal pass-through behavior
- `tests/backend/get-model.spec.ts`
  - unauthorized path
  - internal OpenRouter priority
  - internal provider priority over BYOK for shared models
  - BYOK priority for custom models
  - `internalOnly` adapter filtering
- `tests/backend/settings.spec.ts`
  - registry generation for enabled providers/models
  - encrypted-key preservation when `newKey` is omitted
  - unauthorized update rejection
- `tests/backend/manual-stream-transform.spec.ts`
  - inline image payload suppression
  - image and non-image file handling
  - tool call/result persistence
  - error forwarding
  - finish-step usage aggregation
- `tests/backend/threads.spec.ts`
  - bad-request path for missing message input
  - new thread creation
  - append flow for existing threads
  - edit/retry truncation and assistant-id reuse
  - missing-thread path
- `tests/backend/post-route.spec.ts`
  - empty/invalid request bodies
  - required field validation
  - edit/retry validation
  - unauthorized path
  - model-resolution error forwarding
  - pro-plan gating
  - pre-stream mutation failure handling
- `tests/backend/credits-module.spec.ts`
  - summary aggregation
  - idempotent credit event recording
  - plan mutation update behavior
- `tests/backend/analytics.spec.ts`
  - unauthorized fallback
  - model stats aggregation
  - 1d hourly chart aggregation
  - per-model totals
- `tests/backend/speech-to-text.spec.ts`
  - unauthorized HTTP rejection
  - file-size rejection
  - Google provider flow
  - Groq provider flow
  - provider error passthrough
- `tests/routes/api-routes.spec.ts`
  - credit summary auth and response shape
  - dev credit-plan JSON and plan validation
  - PostHog relay host-header stripping and CORS
- `tests/lib/browser-env.spec.ts`
  - required browser env lookup
  - optional browser env fallback behavior
- `tests/lib/model-store.spec.ts`
  - persisted default model loading
  - thread override precedence
  - reset and persistence behavior
- `tests/backend/get-route.spec.ts`
  - missing resumable-context fallback
  - auth and ownership checks
  - missing-stream handling
  - finished-stream empty SSE fallback
  - active resumable-stream passthrough
- `tests/backend/attachments.spec.ts`
  - upload auth and validation
  - token-limit rejection for text files
  - MIME normalization on upload
  - storage failure handling
  - delete ownership enforcement
  - generated-file pagination and sorting
  - download redirect behavior
- `tests/backend/provider-factory.spec.ts`
  - blank API key rejection
  - internal provider key resolution
  - Google AI Studio vs Vertex routing
  - gemini-3 global Vertex location handling
  - OpenRouter internal-key trimming and failure path
  - Google OpenAI-compatible provider validation
- `tests/hooks/use-auto-resume.spec.ts`
  - resume attempt scheduling
  - pending-stream suppression
  - waiting for message hydration
- `tests/hooks/use-thread-sync.spec.ts`
  - reset on missing route thread
  - store-thread adoption from the route
  - rerender trigger guard
- `tests/hooks/use-chat-actions.spec.ts`
  - stop-vs-send behavior while streaming
  - submit with uploaded files and trimmed text
  - retry truncation and regenerate wiring
  - edit-and-retry attachment deletion and message rewrite
- `tests/hooks/use-chat-integration.spec.ts`
  - request body construction
  - reconnect request construction
  - pending-stream tracking
  - shared-thread transport bypass
  - resume restoration of backend messages
- `tests/lib/convex-cached-query.spec.ts`
  - disk-cache fallback
  - storage-event updates
  - skip-vs-force-cache behavior
  - paginated empty-result debounce
  - cache clearing
- `tests/hooks/use-voice-recorder.spec.ts`
  - permission-denied handling
  - recording lifecycle and transcription submission
  - cancel-without-transcribe behavior
  - backend transcription error surfacing
- `tests/hooks/use-chat-data-processor.spec.ts`
  - thread-id hydration from assistant metadata
  - navigation after assistant metadata arrives
  - stream attachment and pending-stream reset
- `tests/backend/http.spec.ts`
  - allowed-origin normalization
  - HTTP route registration for chat, uploads, transcription, and file proxying

### Current Runner

- `vitest.config.ts`
- local reporter: `tests/reporters/pretty-reporter.ts`
- logical test layout:
  - backend: `tests/backend`
  - routes: `tests/routes`
  - library/utilities: `tests/lib`
  - import/export: `tests/imports`
  - hooks/state: `tests/hooks`
- reporter behavior:
  - local runs use the custom pretty reporter
  - CI falls back to Vitest's default reporter
- run command used so far: `bunx vitest run`

### Recommended Next Slice

- targeted hook/state tests for:
  - focused feasibility check for E2E setup

### E2E Feasibility Check

- There is no existing Playwright config, browser test directory, or repo-owned E2E harness checked in right now.
- The app boot path depends on TanStack Start plus Convex, Better Auth, Postgres-backed auth/session state, and environment-provided service URLs.
- Auth is not mocked at the app boundary:
  - `src/providers.tsx` wires `AuthQueryProvider`, Better Auth UI, and a live `ConvexQueryClient`
  - `src/lib/auth.ts` configures Better Auth against the real database adapter and trusted origins
- I do not see a dedicated seeded test user flow, bypass auth mode, or local E2E fixture layer for standing up authenticated browser tests cheaply.
- Because of that, adding Playwright files right now would mostly create scaffolding, not reliable signal.
- The honest next step for E2E is to first define:
  - how the app is started in test mode
  - how Convex/Postgres/auth are provisioned for tests
  - how a deterministic signed-in session is created
  - which flows are allowed to hit real external providers versus mocked endpoints
- Until that exists, the most trustworthy coverage in this repo is still the unit and hook/state layer above.

### Note On Remaining Utility Coverage

- `src/lib/generated-image-urls.ts` is covered for the stable dev/local behavior used in the current Vitest runner.
- The production-only Vercel optimization branch still needs a production-mode harness or a different test seam if we want to pin that behavior directly.

## Current Findings

- There is no meaningful test suite checked into the repo right now.
- The repo has build/type/lint plumbing, but no obvious repo-owned Vitest/Playwright/Jest/Cypress tests.
- The highest-risk logic is not the generic UI layer. It is the app-specific behavior around auth, model/provider resolution, streaming chat, credits, imports, attachments, and voice input.
- The codebase is split between:
  - TanStack Start frontend in `src/`
  - Convex backend/runtime in `convex/`
  - Postgres-backed auth/user plan data in `src/database/`
- Several important behaviors are custom and should be pinned down with tests because regressions would be user-visible and hard to diagnose:
  - stale JWKS recovery
  - JWT resolution/fallback
  - provider adapter prioritization
  - internal vs BYOK vs OpenRouter routing
  - reasoning and credit charging logic
  - resumable chat streams
  - import parsing and attachment handling
  - browser-specific voice recording/transcription flow

## What Not To Prioritize

- Snapshot-heavy coverage of generic `src/components/ui/*`
- Broad visual tests before behavioral coverage exists
- Low-value wrappers that mostly pass props through to third-party libraries

Those can come later if needed. The main risk in this repo is business logic and state coordination.

## Recommended Test Layers

## 1. Pure Unit Tests

These should come first. They are fast, deterministic, and will cover the most failure-prone logic.

Targets:

- `src/lib/auth-token.ts`
  - `isJwtToken`
  - `resolveJwtToken`
- `src/lib/errors.ts`
  - `ChatError`
  - status/message mapping
  - response shaping for different surfaces
- `convex/lib/credits.ts`
  - monthly period key/bounds
  - charge resolution for chat/tool/image
  - counted vs non-counted provider sources
- `convex/lib/provider_factory.ts`
  - provider creation rules
  - Google Vertex global-location behavior
  - OpenRouter internal key behavior
- `src/lib/generated-image-urls.ts`
  - aspect-ratio parsing
  - local/dev optimization bypass logic
  - generated URL construction
- `src/lib/persistence.ts`
  - defaults on SSR
  - corrupted localStorage recovery
  - invalid tool filtering
- `src/lib/thread-import-core/shared.ts`
  - frontmatter parsing
  - timestamp parsing
  - filename sanitization
  - attachment markup extraction
- `src/lib/thread-import-core/index.ts`
  - format detection
  - supported/unsupported JSON and markdown flows
- `src/lib/thread-export.ts`
  - markdown serialization
  - attachment URL resolution
  - archive naming
  - zip generation

## 2. Backend Logic Tests

These should mock Convex context and external providers. The goal is to validate app behavior, not SDK internals.

Targets:

- `src/routes/api/auth/$.ts`
  - recoverable stale-JWKS error retries
  - retry on `/get-session` 5xx
  - non-recoverable error passthrough
- `convex/settings.ts`
  - registry generation based on enabled providers
  - custom model/provider handling
  - preserving encrypted keys when `newKey` is omitted
  - partial updates vs full updates
  - decrypt failure fallback for general providers
- `convex/chat_http/get_model.ts`
  - shared model adapter priority
  - custom model adapter priority
  - internal OpenRouter routing when configured
  - missing provider/model failure paths
  - image vs text provider selection
- `convex/chat_http/post.route.ts`
  - required plan resolution
  - credit charge metadata
  - create-thread vs existing-thread flow
  - image-generation branch
  - toolkit enablement
  - credit event recording
- `convex/chat_http/manual_stream_transform.ts`
  - text chunks
  - suppressed inline image payloads
  - reasoning parts
  - file parts
  - tool call/result parts
  - finish/error handling
- `convex/chat_http/get.route.ts`
  - resume behavior when stream context is unavailable
  - auth and ownership checks
  - empty stream fallback behavior
- `convex/threads.ts`
  - initial thread title derivation
  - mirrored attachment count enforcement
  - import flow
  - edit/retry message truncation behavior
  - fork/share/delete/rename auth rules
- `convex/attachments.ts`
  - file size/type validation
  - text token limit enforcement
  - R2 unavailable behavior
  - delete ownership checks
  - generated files listing behavior
- `convex/speech_to_text.ts`
  - provider selection
  - credential fallback rules
  - Google vs Groq handling
  - HTTP error mapping
  - file size rejection
- `convex/credits.ts`
  - summary math
  - once-per-message credit event recording
  - free vs pro account defaults
- `convex/analytics.ts`
  - 1d hourly aggregation
  - 7d/30d daily aggregation
  - empty unauthorized behavior

## 3. Frontend Hook/State Tests

These matter because the app coordinates router state, local state, Convex state, and streaming state at the same time.

Targets:

- `src/hooks/use-chat-integration.ts`
  - request body construction
  - token refresh use
  - reconnect request construction
  - seeded ID handling
  - shared vs non-shared thread behavior
- `src/hooks/use-chat-actions.ts`
  - submit with text only
  - submit with files only
  - stop on active stream
  - retry/edit-and-retry behavior
  - deleted attachment cleanup path
- `src/hooks/use-auto-resume.ts`
  - retries only for live threads
  - no resume while pending/streaming/submitted
  - attempt cap and interval behavior
- `src/hooks/use-chat-data-processor.ts`
  - thread ID hydration
  - navigation after assistant metadata arrives
  - attached stream ID tracking
- `src/hooks/use-thread-sync.ts`
  - reset on no route thread
  - rerender trigger when route thread changes
- `src/lib/model-store.ts`
  - persistence
  - MCP default/thread override precedence
- `src/lib/convex-cached-query.ts`
  - disk cache fallback
  - storage event updates
  - empty-result debounce path for paginated queries
- `src/hooks/use-voice-recorder.ts`
  - MIME selection logic
  - iOS/Safari compatibility branches
  - normalization path for mp4/m4a/aac
  - cleanup behavior

## 4. Import/Export Compatibility Tests

This is a dedicated area because it involves user data movement and should be treated as a product boundary.

Targets:

- T3 markdown imports
- T3 JSON bulk imports
- ChatGPT Exporter markdown imports
- ChatGPT Exporter JSON imports
- companion markdown merge for ChatGPT Exporter
- attachment filename inference/sanitization
- imported attachment preparation and compression
- thread export markdown generation
- export multiple threads to archive
- export -> import roundtrip sanity checks

Important note:

- I would run shared fixtures against both the client import implementation in `src/lib/thread-import-core/*` and the Convex-side import implementation in `convex/lib/thread_import_core.ts` where applicable, to ensure they stay behaviorally aligned.

## 5. API Contract Tests

Targets:

- `src/routes/api/credit-summary.ts`
  - unauthorized response
  - plan/limits response shape
- `src/routes/api/dev/credit-plan.ts`
  - dev-only gating
  - invalid JSON handling
  - invalid plan handling
- `src/routes/api/phr/$.ts`
  - host header stripping
  - body forwarding
  - response header filtering
  - CORS response headers
- `convex/http.ts`
  - route registration assumptions
  - origin normalization for CORS setup

## 6. Focused End-to-End Tests

Only a handful initially. Keep these high-signal.

Recommended E2E flows:

1. Sign in, open a new chat, send a prompt, receive an assistant response, reload, and resume the thread.
2. Retry and edit a previous message, confirm later messages are replaced correctly.
3. Upload a supported attachment and send it in chat.
4. Import a supported thread export and verify imported messages appear in the UI.
5. Export a thread and confirm the downloaded markdown contains expected content and attachment links.
6. Switch provider/model settings and confirm the selected model remains usable.
7. Use voice input when enabled and confirm transcript insertion.

## Priority Order

## Phase 1

- `src/lib/auth-token.ts`
- `src/lib/errors.ts`
- `convex/lib/credits.ts`
- `src/lib/persistence.ts`
- `src/lib/generated-image-urls.ts`
- `src/lib/thread-import-core/shared.ts`
- `src/lib/thread-import-core/index.ts`

Reason:

- fastest setup
- high confidence
- catches foundational regressions early

## Phase 2

- `src/routes/api/auth/$.ts`
- `convex/settings.ts`
- `convex/chat_http/get_model.ts`
- `convex/chat_http/manual_stream_transform.ts`
- `convex/threads.ts`
- `convex/attachments.ts`

Reason:

- this is the core application behavior
- these files contain the densest custom logic

## Phase 3

- `convex/chat_http/post.route.ts`
- `convex/chat_http/get.route.ts`
- `convex/speech_to_text.ts`
- `convex/credits.ts`
- `convex/analytics.ts`
- `src/hooks/use-chat-integration.ts`
- `src/hooks/use-chat-actions.ts`
- `src/hooks/use-auto-resume.ts`

Reason:

- higher setup cost
- more mocks and orchestration
- important, but easier once the lower-level logic is already covered

## Phase 4

- focused E2E coverage for the top user flows

Reason:

- validates the integration points after the core logic is already pinned down

## First 10 Tests I Would Actually Write

1. `isJwtToken` accepts only structurally valid JWTs and rejects malformed tokens.
2. `resolveJwtToken` reuses a valid token, refreshes an invalid one, and falls back correctly on fetch failure.
3. Auth route retries after stale-JWKS errors and `/get-session` 5xx responses.
4. `getUserRegistryInternal` exposes only models/providers that should be available for the current settings.
5. `getModel` chooses the correct adapter across internal, BYOK, OpenRouter, and custom cases.
6. Credit charge resolution correctly distinguishes chat/tool/image and internal vs non-counted requests.
7. `manualStreamTransform` suppresses inline image payload text while preserving persisted/output behavior.
8. `createThreadOrInsertMessages` handles new chat, retry, and edit flows correctly.
9. Import parser fixtures cover supported T3 and ChatGPT Exporter formats plus unsupported cases.
10. Exported markdown contains the expected headers, message blocks, and resolved attachment URLs.

## Risks To Watch

- Auth regressions may only appear after key rotation or stale cached state.
- Provider/model selection bugs may look like random runtime failures unless adapter ordering is explicitly tested.
- Credit logic can silently drift if plan gating and event-recording tests are absent.
- Stream handling bugs may only appear during reconnect/resume or on tool/image responses.
- Import bugs will be expensive because they affect user data and are often format-specific.
- Voice input has browser-specific branches, especially around iOS Safari and audio normalization.

## Suggested Tooling Direction

I have not changed tooling in this repo yet. If we proceed, the likely split is:

- unit/backend logic: Vitest
- React hooks/components: Vitest + Testing Library
- browser flows: Playwright

But the sequencing matters more than the exact tool choice right now.

## Decision Point

If we want to move efficiently, the next step should be choosing one of these scopes:

- minimal: Phase 1 only
- practical: Phases 1 and 2
- serious baseline: Phases 1 through 3
- full initial program: add the focused E2E flows too
