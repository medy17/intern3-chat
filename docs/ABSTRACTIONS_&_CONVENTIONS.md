# Abstractions & Conventions

This guide answers three questions:

1. Where should new code live?
2. When should repeated code become a shared abstraction?
3. Which existing contract should a new feature extend?

It covers both frontend and backend work. The known places that do not yet follow these rules are
listed in [Current Backlog](./CURRENT_BACKLOG.md).

If this guide disagrees with working code or tests, treat the code and tests as the current behavior.
Then fix the documentation in the same change.

## The short version

- Give each product rule one owner.
- Share policy and types. Keep runtime-specific I/O separate.
- Keep route files focused on routing and page composition.
- Keep durable data and permissions in Convex.
- Use a browser Web Worker only for expensive browser-side CPU work.
- Use the Cloudflare Worker only when bytes need to stream without passing through Convex.
- Add models to the server-owned model registry. Do not make a second frontend registry.
- Treat every R2 root as a separate storage policy, not just a folder name.

## When to create an abstraction

Create one when:

- the same rule exists in two places and is likely to gain more callers;
- changing one behavior requires matching edits in several files;
- frontend and backend must agree on the same literals, limits, or state transitions;
- several callers parse the same model ID, error, storage key, or provider response; or
- a pure decision can be separated from UI, database, or network code.

Do not create one just because two blocks happen to look similar. Keep code separate when the
permission rules, lifecycle, failure handling, or expected future changes are different.

Prefer a small, named module such as `upload-policy.ts` over a broad `utils.ts` file. A useful
abstraction should remove old copies, not add another wrapper on top of them.

## Where code belongs

| Need | Put it here |
| --- | --- |
| URL state, route metadata, redirects, page composition | `src/routes/` |
| Product-specific UI | A feature component in `src/components/` |
| Reusable, product-agnostic UI | `src/components/ui/` |
| Browser lifecycle or reusable React coordination | `src/hooks/` |
| Pure frontend policy, formatting, clients, and adapters | `src/lib/` |
| Reactive application reads | Convex query |
| Atomic database writes | Convex mutation |
| External calls and backend orchestration | Convex action |
| Code that needs a Node-only package or API | A `"use node"` action module |
| HTTP callbacks or upload endpoints tied to Convex data | Convex HTTP action |
| Large-file streaming to R2 or the browser | The Cloudflare Worker |
| Expensive browser-side CPU work | A browser Web Worker |
| File bytes | R2 |

TanStack Start server routes are for web-facing HTTP concerns that do not belong to Convex data.
Do not build a second application backend there.

Code shared by the frontend and Convex must be portable. It cannot depend on React, the DOM, browser
storage, Node-only packages, or secrets.

## Shared contracts and types

Validate data when it enters the app. This includes route input, public Convex arguments, webhook
payloads, Worker tickets, provider responses, and persisted browser state.

Use these rules:

- Export and reuse validators instead of copying the same object shape.
- Derive TypeScript types from validators or a single `as const` list.
- Use a discriminated union when one field decides which other fields are required.
- Include units in names, for example `maxAssetBytes` and `timeoutMs`.
- Convert provider responses to an app-owned type inside the provider adapter.
- Version saved browser data and signed protocols.
- Repeat security checks on the backend. Frontend validation is only an early user-facing check.

For shared string literals, keep one list and derive the TypeScript type:

```ts
export const MODEL_MODES = [
    "text",
    "image",
    "speech-to-text",
    "text-to-speech"
] as const

export type ModelMode = (typeof MODEL_MODES)[number]
```

Derive the runtime validator from the same list when possible. If the validator has to repeat the
literals, keep it beside the list and add a test that proves they match.

## Frontend conventions

### Routes and components

- Route files own URL/search state, route metadata, loaders, redirects, and page composition.
- Move large panels and reusable behavior into feature components.
- Keep business rules out of `src/components/ui/`.
- If two screens need the same sorting, grouping, labels, or actions, extract a pure view-model
  module. Do not import helpers from one large screen component into another.

The model picker and Retry use `src/lib/model-picker-data.ts` for provider sections and model
ordering, and `src/components/model-picker-icons.tsx` for their existing icons. Keep their layouts
and selection controls separate. `useModelFavorites` shares the existing account-scoped localStorage
preference through a subscribed store so changes reach both menus and other tabs. Retry displays
favorites using its normal model rows, including the same plan and attachment restrictions.
Only Retry's Favorites rows show provider logos: that submenu mixes providers. Provider-specific
submenus omit row logos because their parent entry already identifies the provider.

### State

| Kind of state | Owner |
| --- | --- |
| Used by one component tree | Local state or a reducer |
| Shareable in a URL | Typed route/search parameters |
| Durable user or app data | Convex |
| Same-origin server data outside Convex | TanStack Query |
| Cross-tree UI state or a saved UI preference | Zustand |
| Intentional stale-first Convex rendering | `useDiskCachedQuery` |

Do not copy a Convex query result into Zustand. Store a stable ID or a local draft, then read the
current record from Convex.

Saved browser state needs validation, a version, and migrations. Scope cache keys by user whenever
one account could otherwise see another account's cached data.

Use `"skip"` until authentication and required IDs are ready. Cached data can improve rendering, but
it never grants access and must not contain secrets.

### UI and responsive behavior

- Use semantic theme colors such as `bg-background` and `text-muted-foreground`.
- Use the theme radius scale (`sm`, `md`, `lg`, `xl`). Never hardcode a numeric radius.
- Prefer CSS breakpoints for layout.
- Use `useIsMobile` only when behavior or component structure changes.
- Use `useIsTouchDevice` for pointer capability, not screen size.
- Reuse `ResponsivePopover` for the existing popover-on-desktop, drawer-on-mobile pattern.
- Preserve labels, keyboard controls, visible focus, native semantics, and reduced motion.
- Design loading, empty, error, success, and retry states for every async view.

### Browser and server boundaries

- Guard `window`, `document`, `localStorage`, `matchMedia`, and `Worker` during server rendering.
- Create and clean up browser side effects in effects or browser-only adapters.
- Use `browserEnv` or `optionalBrowserEnv` for browser-visible configuration.
- Keep secrets in server or Convex environment modules. Never expose them through `VITE_*`.

### Errors

Keep errors structured when the UI needs to choose a recovery action. Chat should keep using the
existing `ChatError` code and detail contract.

Normalize unknown Convex and network errors in one frontend helper. Do not create a new
`instanceof Error` chain in every component.

Do not log prompts, file contents, API keys, authorization headers, or raw provider responses.

### Frontend checklist

- Is the route still mostly composition?
- Does one system own the data?
- Can repeated UI decisions be a pure function?
- Are browser APIs safe during server rendering?
- Are colors and radii theme-based?
- Does the interaction work with keyboard, touch, and small screens?
- Does the test protect user-visible behavior rather than component internals?

## Backend conventions

### Pick the right Convex function

- Use a **query** for a reactive read.
- Use a **mutation** for an atomic database change.
- Use an **action** for external I/O or orchestration.
- Use a **Node action** only when normal Convex code cannot use a required package or API.
- Use an **HTTP action** for callbacks and HTTP entry points that need Convex auth or data.
- Use an **internal** function when only trusted backend code should call it.

Public functions should be easy to scan:

1. Validate input.
2. Resolve the current user.
3. Check resource ownership and permissions.
4. Apply the account-deletion gate where needed.
5. Call the domain logic.
6. Return a small, safe result.

Never accept a client-supplied user ID as proof of ownership.

### Data and long-running work

- Export validators that appear in more than one schema or function.
- Use indexes for production reads. Do not load an unbounded table and filter it in memory.
- Keep authoritative timestamps and status changes on the backend.
- Give durable jobs explicit states, legal transitions, retry counts, and terminal states.
- Make callbacks, retries, billing settlement, cancellation, and cleanup idempotent.
- Store enough provider IDs and normalized results to recover after a process stops.
- Do not depend on a promise, Worker instance, or module variable staying alive.

### External services and billing

- Keep provider request and response mapping inside a provider adapter.
- Add time, size, redirect, and source-host limits to external work.
- Decide which failures may retry.
- Make sure retries cannot create a second charge, row, or object.
- Use the existing reserve, settle, and release flow for billable work.
- A successful file upload is not the end of the operation. Finish database state and R2 metadata too.

### R2 ownership

Check both the authenticated user and the object's metadata. A matching key prefix is not enough.

Use `authorId` for user-owned R2 metadata. After a direct upload or Worker upload, synchronize the
metadata before treating the object as ready.

### Backend checklist

- Is this the smallest suitable Convex function type?
- Are input and output boundaries validated?
- Are identity and ownership checked?
- Is account deletion handled?
- Is the query bounded and indexed?
- Can a retry safely run twice?
- Are external time and size limits explicit?
- Do all paths finish or release billing state?
- Does the test assert the result or state transition, not mocked call order?

## When to use a Worker

The repo has two kinds of Worker. Always say which one you mean.

### Browser Web Worker

Use one when browser-side computation is heavy enough to freeze typing, scrolling, or rendering.
The work must be serializable and must not need the DOM.

The main-thread wrapper owns:

- typed messages;
- transferable data where useful;
- request or version IDs so stale results can be ignored;
- cancellation and termination;
- error handling; and
- a fallback when `Worker` is unavailable.

Do not use a browser Web Worker for normal React work, small array operations, durable state, or
provider calls that need secrets.

### Cloudflare Worker

The Worker in `workers/fal-r2-ingest/` streams generated images and speech without sending those bytes
through Convex. Its current routes are `/ingest` and `/speech`.

Use it when the main task is moving a bounded stream between an approved source, the browser, and R2.
Convex still owns permission decisions, job state, billing, leases, and final metadata.

Every Worker route must:

- verify a short-lived signed request or ticket;
- validate the route, method, source, redirect, owner, and allowed R2 prefix;
- limit time and bytes;
- stream instead of buffering the complete file;
- abort incomplete multipart uploads;
- assume in-memory state can disappear; and
- return a small result so Convex can finish the durable state.

Add a route to the existing Worker when it uses the same bucket, secret, trust rules, limits, and
deployment schedule.

Create a separate Worker only when it needs a different public boundary, bucket, secret set,
resource limits, deployment schedule, or failure isolation. A new model or provider is not enough
reason on its own.

Use a Convex action when the main task is provider logic or durable workflow state. Use a Node action
only when a Node-only dependency makes it necessary.

## Models and providers

Read [Model & Provider Guide](./MODEL_PROVIDER_GUIDE.md) before changing model entries.

The model list has one owner:

- Provider and developer modules live in `convex/lib/models/`.
- `convex/lib/models.ts` builds the complete registry.
- The frontend reads that registry through `src/lib/shared-models.ts`.
- Do not add a separate model list to the frontend.

### Terms

| Term | Meaning |
| --- | --- |
| Model | The app-facing model with a stable `id` |
| Developer | The company or project shown in the UI |
| Provider | A supported credential or runtime identity |
| Adapter | The routing target, such as `openrouter:openai/...` or `fal:fal-ai/...` |
| Mode | The request, executor, result, and lifecycle type |
| Ability | An optional feature inside a mode, such as vision or reasoning |

Adapter prefixes mean:

- `i3-<provider>:*`: internal provider identity and grouping;
- `<provider>:*`: user-provider identity used by settings;
- `openrouter:*`: built-in text/chat and speech-to-text routing; and
- `fal:*`: image generation through fal.

Do not add a new `CoreProvider` just because a new developer appears in the model list. Add one only
when users or the app need a distinct credential/configuration surface.

### Current model modes

| Mode | What it requires |
| --- | --- |
| Text/LLM | `mode` is omitted or `"text"`; adapters and abilities control chat behavior |
| Image | `mode: "image"`, image configuration, pricing, and a matching fal descriptor |
| Speech to text | `mode: "speech-to-text"` and accepted/preferred transcription formats |
| Text to speech | `mode: "text-to-speech"` and speech format, PCM, input limit, and pricing |

A mode is for a different request, executor, result, or lifecycle. An ability changes behavior within
an existing mode. Reasoning, vision, function calling, and native PDF input are abilities, not modes.

`SharedModel` is a mode-based union: image models require image sizes, and speech models require
their speech configuration. Finishing runtime validation and rejecting all misplaced image fields
is still listed in the backlog.

### Add a model to an existing provider

1. Add the entry to the matching module in `convex/lib/models/`.
2. Set a stable ID, names, adapters, abilities, access/lifecycle fields, and pricing.
3. Set `mode` and its required configuration for non-text models.
4. Add an `openrouter:*` adapter for hosted text models.
5. Add or reuse a fal descriptor for image models.
6. Check the server-to-client projection and model cache version.
7. Check every picker that should include or exclude the mode.
8. Add registry, routing, pricing, access, and lifecycle tests.

### Add a provider or developer

First decide which change you are making:

- **New developer using OpenRouter:** add the registry module, model entries, adapters, and UI
  attribution/icon. Do not change the provider factory.
- **New credential provider:** also add the provider literal/type, settings validator, encrypted
  credential storage, credential priority, settings UI, redaction, and account-deletion behavior.
- **New runtime transport:** also add provider factory and `get_model` support, request/response
  mapping, streaming and tool behavior, error mapping, billing, timeouts, telemetry, and tests.
- **New fal endpoint:** add the shared image model and typed fal descriptor. Keep library and chat
  image generation on the same durable job flow.

### Add a new model mode

Adding a mode is a full-stack change. It must include:

1. The literal, TypeScript type, runtime validator, and mode-specific model shape.
2. Registry serialization and the server-to-client response.
3. A typed executor and provider adapter.
4. Request, result, error, cancel, retry, and durable job behavior.
5. Pricing, limits, access, and billing.
6. Storage and retention if it creates files.
7. UI selection and mode-specific controls.
8. Telemetry and privacy rules.
9. Frontend and backend tests.
10. Updates to this guide and the relevant feature guide.

## R2 prefixes

An R2 root is a policy boundary. It tells us who owns an object, who can see it, how long it lives,
and which code may use it.

### Existing roots

| Root | Use |
| --- | --- |
| `attachments/<userId>/` | Message files and imported attachments |
| `references/<userId>/` | Image-generation inputs and their normalized derivatives |
| `generations/<userId>/` | Generated image originals only |
| `code-artifacts/<userId>/` | Outputs from code execution |
| `persona-avatars/<userId>/` | Persona avatars |
| `persona-docs/<userId>/` | Persona knowledge files |
| `imports/<userId>/sources/` | Temporary import inputs; hidden from Files |
| `account-exports/<userId>/` | Account export archives; hidden from Files |
| `tts/<userId>/` | Read-aloud audio cache; visible in Files and account exports, hidden from SilkScreen |
| `blurred_generations/<userId>/` | Rebuildable private-preview images |

`tts/` is the speech prefix. `generations/` is for images only. The text-to-speech section in
`MODEL_PROVIDER_GUIDE.md` still contains an old `generations/` example. The Worker guide and current
code correctly use `tts/`.

### Reuse a root or create a new one?

Use an existing root when ownership, visibility, access, retention, deletion, and consumers are the
same.

Use a sub-prefix for a derivative or workflow step that still has the same policy. Current examples
are `references/<userId>/generated/` and `references/<userId>/generated-context/`.

Create a new root only when at least one of those policies is different.

For every new root, decide:

- Who creates, reads, lists, exports, and deletes it?
- Does it appear in Files, SilkScreen, model context, or account export?
- Is it an original or a rebuildable derivative?
- Which MIME types, sizes, and sources are allowed?
- How is it removed during cleanup and account deletion?
- Does it use a public or signed URL?
- Which Worker and upload allowlists must change?
- Which environments and buckets contain it?

### Do not mix these prefixes

- Keep speech, references, temporary files, and code artifacts out of `generations/`.
- Keep generated outputs out of `references/`.
- Keep image-generation inputs out of `attachments/`.
- Keep temporary imports out of user-visible roots.
- Include `tts/` in Files and account exports, but not in the SilkScreen gallery.
- Keep `blurred_generations/` out of generic file and gallery listing.
- Never use a derivative as the only copy of an original.
- Never use a key prefix as the only ownership check.

### Key and listing rules

- Put the user ID directly below the root.
- Sanitize user-controlled filename segments with one shared function.
- Use timestamp and UUID suffixes for separate uploads.
- Use a content hash plus a transform version for deterministic derivatives.
- Reserve direct uploads on the backend with owner, purpose, prefix, size, MIME, and expiry checks.
- Synchronize `authorId` metadata before making an uploaded object available.
- Limit streamed bytes and abort incomplete multipart uploads.
- Follow R2's `truncated` and cursor values when listing.
- Detect repeated cursors so cleanup cannot loop forever.
- Make bulk cleanup paginated, restartable, and safe to run more than once.

The buckets are intentionally separate:

| Environment | Bucket |
| --- | --- |
| Cloud development | `silkchat-cloud-dev` |
| Staging | `silkchat-staging` |
| Production | `intern3-user-files` |

Never point development or staging at the production bucket.

## Testing and deployment

Read [Test Writing Guide](./TEST_WRITING_GUIDE.md) before changing tests. Test permissions,
validation, state changes, retries, parsed results, and user-visible behavior. Avoid tests that only
assert mocked call order.

Use:

```bash
bunx vitest run <focused-test-file>
bun run check-types
bun run test
```

Use `bun run test`, not `bun test`.

Run `bun run fal:r2:worker:typecheck` after changing Worker code or its shared protocol. Do not start
a development server for normal verification. Do not use browser automation for auth-gated routes.

Push backend changes to cloud development with `bun run cloud:dev:push`. Use
`bun run staging:deploy` and `bun run prod:deploy` for synchronized deployments.

## Before finishing an abstraction

- One clearly named module owns the rule.
- All intended callers use it.
- Old copies are removed or have a specific removal task.
- Runtime validation and TypeScript types agree.
- Permissions, privacy, billing, and cleanup still happen in the correct layer.
- Tests protect behavior, not the internal refactor.
- Documentation points to the owner instead of copying changing details.

## Related guides

- [Repository layout](../README.md)
- [Setup and Deployment Guide](./SETUP_GUIDE.md)
- [Model & Provider Guide](./MODEL_PROVIDER_GUIDE.md)
- [BYOK Setup](./BYOK_SETUP.md)
- [Image Generation](./IMAGE_GENERATION.md)
- [fal to R2 ingestion Worker](./FAL_R2_INGEST_WORKER.md)
- [Code Execution Architecture](./CODE_EXECUTION_ARCHITECTURE.md)
- [Account Deletion](./ACCOUNT_DELETION.md)
- [Testing Overview](./TESTING.md)
- [Test Writing Guide](./TEST_WRITING_GUIDE.md)
