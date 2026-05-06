# Test Writing Guide

This repo should prefer fewer, sharper tests over broad mocked snapshots.

## Core Standard

A useful test should protect one of these:

- Real business logic
- User-visible behavior
- State transitions
- Error handling and recovery behavior
- External contracts such as parsing, serialization, and API responses

If a test mainly proves that one mocked function called another mocked function with a large object, it is probably low value.

## What To Prefer

- Test pure functions directly.
- Test parsing and serialization with realistic inputs and outputs.
- Test stores and hooks against real state when possible.
- Test route handlers for meaningful branches like auth, validation, recovery, and response shape.
- Test precedence rules and selection logic, not vendor snapshots.
- Keep assertions focused on the behavior that matters.

## What To Avoid

- Over-mocking internal collaborators.
- Large “happy path” orchestration tests that assert every payload field.
- Vendor-specific request-body snapshots unless that exact payload is the contract.
- UI tests that only verify heavily mocked assembly details.
- One-off migration regression tests that no longer protect active behavior.
- Brittle call-order assertions when set membership or behavior is enough.

## How to recognise a bad test

1. Does this path still contain real logic?
2. Is it small and direct or broad and useless?
3. If it's the latter, should the code be refactored to expose a pure helper worth testing?

Delete without replacement only when the test was mostly mock choreography and the path does not contain enough standalone behavior to justify direct coverage.

## Hooks And Stores

- Prefer real store assertions over mocked setter assertions.
- Verify idempotence when effects write into shared state.
- Test navigation or side effects only when gated by real state or status transitions.
- If a hook becomes hard to test without mocking everything, extract pure logic from it.

## Routes And Backend

- Keep tests for:
  - auth and permission checks
  - request validation
  - error mapping
  - recovery branches
  - persistence/state transitions
  - idempotency
- Avoid testing routes as pure wiring layers unless they contain nontrivial branching.
- For provider/model logic, test decision rules and precedence, not current catalog trivia.

## UI Components

- Keep tests when a component has meaningful rendering branches that users rely on.
- Avoid tests that require mocking half the app just to verify a label or icon.
- If the interesting part is grouping, filtering, formatting, or selection logic, move that logic into a helper and test the helper instead.

## Migrations And Compatibility

- Keep migration tests only while the migrated state is still a real supported input.
- Remove tests for dead aliases, old themes, old model IDs, and one-time incident workarounds once they stop carrying product risk.
- If compatibility is still required, cover the compatibility rule once, not through many vendor- or era-specific cases.

## Good Signs

- The test name describes a real behavior.
- The setup is short.
- The assertions are few and specific.
- The test would still be meaningful after an internal refactor.

## Bad Signs

- The file spends more effort mocking dependencies than exercising logic.
- Most assertions are `toHaveBeenCalledWith(...)` on mocked internals.
- The test breaks whenever implementation details change but user behavior does not.
- The test is protecting an old migration path no one should hit anymore.

## Practical Rule

Prefer:

- “given this input, the app stores/parses/renders/responds like this”

Over:

- “module A called module B with this exact nested object”

If a test cannot survive a reasonable refactor, it probably is not testing the right thing.
