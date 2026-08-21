---
name: goodvibes-memory
description: Documents the .goodvibes/memory/ cross-session memory files (decisions, patterns, failures, preferences): what's written automatically, what you should read and write, and the exact JSON shape of each file. Load at the start of a task to check prior context, and before finishing to record what you learned.
---

# goodvibes-memory

Project memory that survives across sessions, stored under `.goodvibes/memory/`.

Four files, each a plain JSON array. Plain JSON is the point: any tool can read or write these
without a parser written specifically for them, so the format cannot drift away from the code
that reads it.

## Files and shapes

`.goodvibes/memory/decisions.json`: architectural choices and why.
```json
[{ "title": "Use tRPC for the API layer", "date": "2026-07-02",
   "rationale": "End-to-end type safety with the existing Next.js app",
   "alternatives": ["REST + OpenAPI", "GraphQL"], "agent": "architect" }]
```

`.goodvibes/memory/patterns.json`: established, reusable approaches.
```json
[{ "name": "Repository pattern for data access", "date": "2026-07-02",
   "description": "All DB access goes through src/repositories/*, never direct Prisma calls in routes",
   "files": ["src/repositories/user-repository.ts"] }]
```

`.goodvibes/memory/failures.json`: approaches that were tried and didn't work.
```json
[{ "date": "2026-07-02", "approach": "Bash failed: npm ERR! ERESOLVE ...",
   "reason": "Exhausted 6 attempts across 3 phases", "suggestion": "Manual intervention required" }]
```
This file is also written automatically: the `PostToolUseFailure` hook appends an entry here
when its 3-phase fix loop exhausts all attempts on a given error (see `post-tool-use-failure.mjs`).
That's the only automatic write in this system. Everything else is something an agent does
deliberately.

`.goodvibes/memory/preferences.json`: project conventions worth remembering.
```json
[{ "key": "test-framework", "value": "vitest", "date": "2026-07-02",
   "notes": "Project already had vitest configured; don't introduce jest" }]
```

## How to use it

**At the start of a task**: check `decisions.json` and `patterns.json` for anything relevant to
what you're about to do, and `failures.json` for approaches already known not to work. Don't
propose one of them again without a reason things have changed. All four files are plain JSON;
read them with `code_read` or native Read, whichever is simpler for a small file.

**When you finish a task**: if you made an architectural choice, found a reusable pattern, or hit
a dead end worth remembering, append an entry to the matching file (read the array, push, write
it back; there's no dedicated write tool, this is a plain file you read-modify-write like any
other project file). Don't write an entry for routine work that isn't worth another session's
attention. This is memory for things that would otherwise be re-discovered the hard way, not a
changelog.

## What this is not

It is not a task queue, not a message bus between agents in the same session (use the
orchestrator/Task tool output for that), and not automatically summarized or pruned. These
files grow with the project's history. If a file gets large enough to be unwieldy, that's a sign
to prune stale/superseded entries by hand, not a reason to stop using it.
