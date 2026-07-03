---
name: intel-mastery
description: Usage guide for goodvibes-intel's structure-aware tools (code_read, code_grep, code_glob, code_surface, code_safe_delete, api_*, db_schema, component_tree, hook_dependencies, client_boundary, layout_analysis, scaffold). Load when working in a codebase and deciding between intel tools and native Read/Grep/Glob.
---

# intel-mastery

goodvibes-intel's tools are opt-in, not mandatory. They're worth reaching for on the operations
they're actually measured to beat native tools on (structure-aware search, safe-delete
reference checking, API/schema/component analysis); they're not worth forcing where a native
tool is simpler or where intel doesn't cover the case. This skill is the honest usage guide —
successor to v1's `precision-mastery`, without the always-on injection and without unmeasured
efficiency claims.

## The contract every filesystem tool follows

Every tool that touches the filesystem takes `base_path` and echoes `resolved_path` (absolute)
for every file in the response. Pass `base_path` explicitly — a relative path resolved without
one still works, but the response carries a `warning` field telling you it resolved against the
server's own working directory, which may not be what you meant.

Every response is an envelope: `{ success, data, error?, warning?, meta }`. `meta.token_estimate`
is computed from the actual rendered response, not a guess. If a cap trimmed the payload,
`meta.truncated` is `true` and `meta.effective_caps` names which cap did it — a response that
silently drops content without saying so is a bug, not intended behavior.

## `code_read` — outline or lines, not everything

Two extract modes: `outline` (structure — exports, top-level declarations, no bodies) and
`lines`/`range` (actual content, optionally with line numbers via `include_line_numbers`).
Start with `outline` when you're orienting yourself in a file you haven't read yet; only pull
`lines` for the specific ranges you need to act on. Batch multiple files in one call — each
entry in the response is keyed by the request entry, not by path, so two requests for the same
path never collide.

## `code_grep` — the crown jewel, with honest caps

Supports `count_only`, `files_only`, and full match output, with real `.gitignore` respect (not
a partial implementation). Every cap (`max_results`, `max_total_matches`) is echoed in
`effective_caps` in every output format, including `count_only` — if you get a count, trust it;
if results were capped, `truncated` says so. Use `count_only` first to gauge scope on a broad
pattern before pulling full matches.

## `code_glob` — file discovery with real gitignore

`respect_gitignore` actually reads `.gitignore` files; `DEFAULT_EXCLUDES` doesn't leak
`node_modules` matches into results the way v1's anchored version could. Use `with_stats` when
you need file sizes/mtimes; otherwise leave it off to keep the response small.

## Static analyzers

- **`code_surface`** — a file or directory's exported API surface (types, functions, entry
  points), computed from the TypeScript compiler, not regex.
- **`code_safe_delete`** — checks whether removing a symbol breaks other files, using real
  compiler references (not a text search for the symbol name).
- **`api_routes` / `api_spec` / `api_validate`** — route detection across Express/Fastify/Hono/
  Next.js, an OpenAPI-shaped spec extraction, and static spec-vs-routes mismatch checking.
  `api_validate` is static only — it never makes live requests (that's `goodvibes-connect`'s
  trust model, a different plugin, for a reason).
- **`db_schema`** — Prisma/Drizzle/SQL schema extraction, with an opt-in `usage: true` mode that
  maps real Prisma call sites (including query-in-a-loop detection) via the compiler, not a
  string search for `.findMany(`.
- **`component_tree`** — a React component tree with opt-in annotation modes (`state`,
  `boundaries`, `events`, `attributes`); each mode only claims what it can verify statically —
  attributes never claims to know a computed style, for example.
- **`hook_dependencies` / `client_boundary`** — hook dependency-array correctness and
  server/client boundary violations in a Next.js-style app.
- **`layout_analysis`** — a layout hierarchy plus overflow/sizing/stacking sections for one file
  (optionally focused on one `selector`).
- **`scaffold`** — creates a new project from a bundled template (`vite-react`, `next-app`,
  `next-saas`). Use `dry_run: true` to preview created files and commands without touching disk.

## When native tools are the better choice

Editing, writing, and running commands are native Edit/Write/Bash's job — goodvibes-intel is a
search/read/analysis server, not a write path (that's a deliberate scope cut from v1, which
retired its own edit/write/exec tools after field-tested defects in that area). A one-off search
in a tiny directory, or anything intel's analyzers don't cover, is often faster with native
Grep/Glob/Read directly — reach for intel when its structure-awareness actually buys you
something (caps you can trust, compiler-verified references, a real API/schema map), not by
default.

## Batch, don't loop

When you know you need several files or several search patterns, batch them into one call
(`code_read`'s file array, `code_grep`'s pattern/query batching) instead of making sequential
calls — plan the batch by reading `with_stats`/`count_only` output first, act on it in one
follow-up call. This is the one paragraph of v1's `gather-plan-apply` doctrine worth keeping;
the rest of that ritual (a strict 3-call-per-cycle loop enforced everywhere) didn't survive the
carve-out review.
