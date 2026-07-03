---
name: project-onboarding
description: Step-by-step approach to mapping an unfamiliar codebase's architecture using the goodvibes intel server's analyzers before making changes to it. Load when starting work in a codebase you haven't worked in before.
---

# project-onboarding

Map a codebase's real structure before proposing changes to it — using the analyzers below
instead of reading files one at a time until a picture emerges by accident.

## 1. Orient: stack and layout

Start with `code_glob` (a broad pattern, `with_stats: false`, tight `max_results`) to see the
directory shape, and `code_read` with `extract: outline` on the entry point (`package.json`,
the framework's config file) to confirm the stack before analyzing anything more specific.

## 2. Backend surface

If the project has a backend: `api_routes` for the route inventory (framework-detected —
Express, Fastify, Hono, Next.js are all covered), then `api_spec` for the shape of each route's
request/response, then `db_schema` (with `usage: true` if you need to know which models are
actually queried where and whether any query runs inside a loop). Cross-check the two with
`api_validate` if you suspect the spec and the routes have drifted apart.

## 3. Frontend surface

If the project has a UI layer: `component_tree` on the app's root or a feature directory (start
with no `annotate` modes for the bare tree; add `state`/`boundaries`/`events`/`attributes` only
for the components you're about to touch — each mode costs response size). `layout_analysis` on
a specific file when you need to understand its layout hierarchy, overflow behavior, or stacking
context. `hook_dependencies` and `client_boundary` when you need to know whether a hook's
dependency array is honest or whether a server/client boundary is being crossed incorrectly.

## 4. Exported API surface

`code_surface` on the module(s) you're about to depend on or modify — it gives you the real
exported types and functions from the compiler, not from reading every file's exports by eye.
Before deleting or renaming anything it exports, run `code_safe_delete` on the specific symbol
first — it checks real compiler references, not a text search for the name.

## 5. Record what you found

Write what you learned to `.goodvibes/memory/` (see the `goodvibes-memory` skill) as a
`pattern` or `decision` entry — the next session, or the next agent working in this codebase,
shouldn't have to re-derive the same map from scratch.

## What this skill does not do

It doesn't run the project, install dependencies, or execute tests — that's native Bash. It
doesn't claim to understand business logic or intent from static analysis alone; treat the
analyzers' output as a structural map to verify against, not a substitute for reading the code
that actually matters for the task at hand.
