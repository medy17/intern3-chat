# CURRENT BACKLOG

- Improve composer styling and effects (thinking of floating composer on the bottom for mobile and keeping docked for desktop).

### Abstractions and deduplication:

#### Cross-runtime and storage

- **R2 namespace registry.** Put root names, key builders, filename sanitizing, ownership, visibility, public URLs, retention, and deletion rules in one typed module. Also correct the old TTS `generations/` example in `MODEL_PROVIDER_GUIDE.md`.
- **One upload policy.** Share upload purposes, prefixes, MIME rules, and size limits between `src/lib/direct-upload.ts` and `convex/direct_uploads.ts`. Then remove or delegate the older upload handlers.
- **Finish the model-mode contract.** The mode-based union, shared chat filter, full model projection, and complete cache version are implemented. Finish runtime validation of mode-specific configuration and prevent image-only fields on text/speech definitions.

#### Frontend

- **Shared chat controller.** Move the common model, message, composer, retry, and thread-sync behavior out of `chat.tsx` and `folder-chat.tsx`. Keep only the thread/folder differences in those components.
- **Shared model-picker data.** Move provider order, grouping, labels, icons, sorting, and mode filtering out of `model-selector.tsx` and `retry-menu.tsx`.
- **Shared image viewer.** Reuse loading, source fallback, responsive layout, copy, download, archive, restore, and delete behavior across the library and image modals.

### Completed:

- Shared thread-import parser. (Frontend and backend now use `convex/lib/thread_import_core/`; old entry points re-export the same implementation.)
- Shared settings hook. (Eight consumers use `useCurrentUserSettings`, with cache keys scoped to the current account.)
- Shared persona avatar editor. (Settings now uses the existing cropper and crop/compression helpers.)
- Shared message validator. (Schema and message writes reuse the same validator; imports retain their supported subset.)
- Shared R2 paginator. (Attachments, image listing, exports, and account deletion share cursor handling while keeping their existing failure policies.)
- Shared fal image saver. (Webhook fallback and retry paths share image downloads, storage, insertion, and error collection.)
- Shared image-derivative pipeline. (Reference and context images share processing while retaining separate limits, compression settings, and cache keys.)
- Shared image-job status validator. (Image-job functions reuse the schema's status validator.)
- Add action bar in SilkScreen for bulk actions. (Added a responsive floating selection toolbar with page-wide selection, archive/restore, delete, and keyboard dismissal.)
- Add upgrade button for free users in model picker.
- Improve audio compression to allow for longer transcripts and fit into the 25mb window. (Audio was being wrongly converted to WAV for no reason which ballooned payload size and subsequently; upload speeds and API allowed payload sizes).
- Check why BYOK does not include total cost data and affects OpenRouter. (Was using wrong response field which did not include BYOK. Switched to correct field)
- Switch detailed costs indicator tooltip to stats for nerds when showing input/output token costs. (Completed and included some polish for the appearance settings screen)
- Add Kimi K3 & Meta Muse Spark 1.1
- Switch mobile model picker to vertical rail.
- Add image comparison mode in SilkScreen.

### Cancelled or Delayed:
- Load only latest messages in chat UI to improve performance and responsiveness. (Not necessary and introduced complications with UI logic. Not feasible for now.)
