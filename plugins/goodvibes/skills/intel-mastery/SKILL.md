---
name: intel-mastery
description: Usage guide for the goodvibes intel server's 15 structure-aware tools (code_read, code_grep, code_glob, code_surface, code_safe_delete, api_routes, api_spec, api_validate, db_schema, component_tree, hook_dependencies, client_boundary, layout_analysis, scaffold, structural_edit). Load when working in a codebase and deciding between intel tools and native Read/Grep/Glob/Edit.
---

# intel-mastery

The goodvibes intel server ships 15 tools. They are opt-in, not mandatory. Reach for one on the
operations it is actually measured to beat a native tool on, among them structure-aware search,
safe-delete reference checking, and API, schema, and component analysis. Do not force one where a
native tool is simpler, or where intel does not cover the case at all.

Fourteen of the fifteen only read. The exception is `structural_edit`, which writes, and it is
covered at the end of this skill.

## The contract every filesystem tool follows

Every tool that touches the filesystem takes `base_path` and echoes `resolved_path` (absolute)
for every file in the response. Pass `base_path` explicitly. A relative path resolved without
one still works, but the response carries a `warning` field telling you it resolved against the
server's own working directory, which may not be what you meant.

Every response is an envelope: `{ success, data, error?, warning?, meta }`. `meta.token_estimate`
is computed from the actual rendered response, not a guess. If a cap trimmed the payload,
`meta.truncated` is `true` and `meta.effective_caps` names which cap did it. A response that
silently drops content without saying so is a bug, not intended behavior.

## `code_read`: outline or lines, not everything

Two extract modes: `outline` (structure: exports, top-level declarations, no bodies) and
`lines`/`range` (actual content, optionally with line numbers via `include_line_numbers`).
Start with `outline` when you're orienting yourself in a file you haven't read yet; only pull
`lines` for the specific ranges you need to act on. Batch multiple files in one call. Each
entry in the response is keyed by the request entry, not by path, so two requests for the same
path never collide.

## `code_grep`: the crown jewel, with honest caps

Supports `count_only`, `files_only`, and full match output, with real `.gitignore` respect (not
a partial implementation). Every cap (`max_results`, `max_total_matches`) is echoed in
`effective_caps` in every output format, including `count_only`. If you get a count, trust it;
if results were capped, `truncated` says so. Use `count_only` first to gauge scope on a broad
pattern before pulling full matches.

## `code_glob`: file discovery with real gitignore

`respect_gitignore` reads real `.gitignore` files, and `DEFAULT_EXCLUDES` keeps `node_modules`
matches out of results. Use `with_stats` when you need file sizes and modification times;
otherwise leave it off to keep the response small.

## Static analyzers

- **`code_surface`.** A file or directory's exported API surface (types, functions, entry
  points), computed from the TypeScript compiler, not regex.

- **`code_safe_delete`.** Checks whether removing a symbol breaks other files, using real
  compiler references (not a text search for the symbol name).

- **`api_routes` / `api_spec` / `api_validate`.** Route detection across Express/Fastify/Hono/
  Next.js, an OpenAPI-shaped spec extraction, and static spec-vs-routes mismatch checking.
  `api_validate` is static only. It never makes live requests (that's the `connect` server's
  trust model, for a reason).

- **`db_schema`.** Prisma/Drizzle/SQL schema extraction, with an opt-in `usage: true` mode that
  maps real Prisma call sites (including query-in-a-loop detection) via the compiler, not a
  string search for `.findMany(`.

- **`component_tree`.** A React component tree with opt-in annotation modes (`state`,
  `boundaries`, `events`, `attributes`); each mode only claims what it can verify statically.
  Attributes never claims to know a computed style, for example.

- **`hook_dependencies` / `client_boundary`.** Hook dependency-array correctness and
  server/client boundary violations in a Next.js-style app.

- **`layout_analysis`.** A layout hierarchy plus overflow/sizing/stacking sections for one file
  (optionally focused on one `selector`).

- **`scaffold`.** Creates a new project from a bundled template (`vite-react`, `next-app`,
  `next-saas`). Use `dry_run: true` to preview created files and commands without touching disk.

## `structural_edit`: the one write tool, preview-gated

The only intel tool that changes a file. It cannot write blind. A `preview` call writes nothing
and returns a unified diff per entry, a single-use token, and each target file's content hash. An
`apply` call needs that token back and re-checks every hash, so a file edited since the preview is
refused rather than silently re-matched.

Three matching modes: `exact` for a literal string, `ast` for TypeScript compiler node matching,
and `ast_pattern` for ast-grep patterns, which is active only when `@ast-grep/napi` is installed.
There is no fuzzy or regex matching, by design, because a near-match is how a structural edit
lands in the wrong place.

Reach for it on multi-site or AST-anchored changes where you want the diff, the stale-file guard,
and atomic rollback before any bytes move. For a single obvious edit, native `Edit` is simpler and
you should use it.

## When native tools are the better choice

Running commands is native `Bash`'s job, and intel does not execute anything. For a one-off search
in a small directory, or anything the analyzers do not cover, native `Grep`, `Glob`, and `Read` are
usually faster.

Reach for intel when its structure-awareness actually buys you something: caps you can trust,
compiler-verified references rather than string matches, or a real API and schema map. Not by
default.

## Batch, don't loop

When you know you need several files or several search patterns, batch them into one call
(`code_read`'s file array, `code_grep`'s pattern/query batching) instead of making sequential
calls. Plan the batch by reading `with_stats` or `count_only` output first, then act on it in one
follow-up call.

Gather, plan, then apply is worth keeping as a habit. It is not a quota: there is no required
number of calls per cycle, and padding a batch to hit one wastes the tokens batching saves.
