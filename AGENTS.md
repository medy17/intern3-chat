## Repo Notes
- Use bun. NO NPM!
- The test command is `bun run test`, NOT `bun test`.
- Do not run a dev server. Assume one is already running.
- When writing/modifying UI, always use theme based variables. Do not hardcode radius values, use theme.radius.sm/md/lg/xl. IF YOU HARDCODE, YOUR WORK WILL BE AUTOMATICALLY REJECTED.
- Follow [TEST_WRITING_GUIDE.md](./TEST_WRITING_GUIDE.md) when adding, removing, or refactoring tests.