# Contributing

Thanks for taking a look at this project. A couple of things before you open a PR.

## `main` is protected

Every change — including from the maintainer's own tooling — goes through a pull
request. There is no direct push access to `main`, and merges require:

- CI passing (typecheck + build for both `client/` and `server/`, plus the sync,
  viewer-enforcement, and real-browser integration tests — see the README's
  [Verifying it yourself](README.md#verifying-it-yourself) section for what those
  actually check)
- Review and approval from [@Shreyash021104](https://github.com/Shreyash021104)

This isn't bureaucracy for its own sake: this repo doubles as a portfolio piece and an
interview reference, so every change on `main` needs to be something the maintainer
can stand behind and explain the reasoning for.

## Before you open a PR

1. **Read the README's "hardest decisions" section first.** It documents the
   non-obvious design choices (the connection-setup race, the two-layer read-only
   enforcement, the React StrictMode provider bug) and *why* things are built the way
   they are. A PR that undoes one of those without addressing the underlying problem
   will bounce.
2. **Run the existing tests locally** before pushing — from `server/`: `npm run
   test:sync` and `npm run test:viewer-enforcement`; from `client/`: `npm run
   test:visual`. These aren't smoke tests for CI's benefit; they were
   written to catch (and did catch) real bugs during development.
3. **If you're changing sync/collab behavior**, add or update a test that exercises it
   through a real WebSocket connection or a real browser — not a mock. The existing
   tests are structured that way on purpose (see decision #2 in the README for why
   mocked tests would have missed the bug that prompted them).
4. **Keep the scope tight.** One logical change per PR. Drive-by refactors or
   formatting-only diffs mixed into a functional change make review slower for both
   of us.

## Reporting a bug

Open an issue with: what you did, what you expected, what happened instead, and — if
it's a sync/collaboration bug — whether it reproduces with a single client or only
with two+ clients concurrently (that distinction usually points straight at whether
the bug is in the CRDT merge path or somewhere else).

## Questions

Open an issue. There's no separate chat/Discord for this project.
