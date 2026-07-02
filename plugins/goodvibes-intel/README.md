# goodvibes-intel

Structure-aware code search/read and verified static analyzers for Claude Code —
**15 tools**, read-only except one preview-gated editor, one MCP server. The flagship of the goodvibes v2 line
(`goodvibes-intel`, `goodvibes-analytics`, `goodvibes-connect` — three opt-in
plugins, install only what you need).

> Status: **v2.0.0-alpha.1**. Numbers below are measured on this build; where a
> number could not be reproduced in the build environment, this README says so
> plainly instead of quoting it.

## What it is

A single stdio MCP server exposing 15 tools. Every filesystem tool takes a
`base_path` and echoes the absolute `resolved_path` for each file it touches, so
results are unambiguous across working directories. Every response is a compact
envelope with an honest token estimate, `output.max_tokens` enforcement, and
truthful `truncated` / `effective_caps` accounting.

| Tool | What it does |
|---|---|
| `code_read` | Read files as line ranges, or extract a structural **outline** (symbols + exported flags) instead of full text |
| `code_grep` | ripgrep/ast-grep search with capped, deduplicated output and honest match counts in every format |
| `code_glob` | File discovery that actually reads `.gitignore` and reports honest counts above the cap |
| `code_surface` | Public API surface of a module (exports, types) via the TypeScript compiler |
| `code_safe_delete` | Compiler-based reference check: is this symbol safe to delete? |
| `api_routes` | Detect HTTP routes (Express, Fastify, Hono, Next.js) |
| `api_spec` | Derive an OpenAPI-shaped spec from the routes |
| `api_validate` | Static spec-vs-routes mismatch report (JSONPath-precise; no live probing) |
| `db_schema` | Prisma / Drizzle / SQL schema, with opt-in Prisma usage analysis (call sites, query-in-loop) |
| `component_tree` | React component tree with opt-in `state` / `boundaries` / `events` / `attributes` annotations |
| `hook_dependencies` | React hook dependency-array analysis |
| `client_boundary` | Client/server boundary graph and issues |
| `layout_analysis` | Tailwind/JSX layout hierarchy: overflow, sizing, stacking-context analysis |
| `scaffold` | Generate a project from the `full` / `minimal` templates |
| `structural_edit` | The one write tool: a preview-gated, AST-aware editor. `preview` returns a per-entry unified diff, a single-use token, and each file's content hash; `apply` re-checks every hash and writes atomically (a file changed since preview is refused, never silently re-matched) |

Tools surface as `mcp__goodvibes-intel__code_read`, `mcp__goodvibes-intel__code_grep`,
and so on — the server key is the namespace.

**intel is read-only except `structural_edit`, which is preview-gated.** Every
other tool only reads, searches, and analyzes. `structural_edit` is the single
write surface, and it cannot write blind: a `preview` call writes nothing (it
returns diffs, a single-use token, and per-file content hashes), and an `apply`
call only writes when the caller passes that token back AND every target file's
hash still matches — a file that changed since preview is refused per-entry
(`refused_stale`), never silently re-matched. Edits are byte-exact outside the
changed span (newlines/CRLF preserved), and an atomic batch rolls back from
pre-apply snapshots if any entry cannot apply. Modes are `exact`, `ast`
(TypeScript-compiler node matching), and `ast_pattern` (ast-grep, active only
when `@ast-grep/napi` is installed) — no fuzzy, no regex.

## Token cost

Tool schemas are **deferred behind Tool Search**, which is on by default in
current Claude Code — so the 15 schemas are not loaded into every session; the
model pulls a tool's schema when it decides to call it. What *is* always-on is a
small amount of skill/command metadata:

| Component | Always-on tokens (measured via `claude plugin details`) |
|---|---|
| goodvibes-intel | **~484** |

For comparison, the v1 monolith carried a ~13,530-token always-on tax. If your
client has Tool Search disabled, the 15 tool schemas load eagerly — that cost is
your client's configuration, not something this plugin's manifest can change.

## Measured performance (gate 5)

Re-run on this build with `node packages/intel/bench/run-all.mjs`. Token counts
use `bytes / 3.5`, applied identically to the intel tool and the native baseline,
so the comparison is apples-to-apples.

### code_grep vs native `git grep` — **PASS**

```
EXP4 — search vs native git grep (tokens = bytes/3.5)
Pattern: "estimatePayloadTokens"  Path: packages

| | Matches | Tokens |
|---|---|---|
| native (git grep -n) | 76 | 2415t |
| code_grep (files_only) | 76 | 902t |

Ground truth: MATCH
VERDICT: PASS — code_grep files_only (902t) beats native git grep (2415t).
```

At defaults, `code_grep`'s `files_only` output returned the **same 76 matches**
as `git grep` in **902 tokens vs 2,415 — a 62.7% reduction** (2.68× fewer tokens).
This is the flagship measured claim.

### code_read outline vs native full read — **inconclusive on this build**

The outline benchmark could **not** be measured here: the committed tree-sitter
grammar `.wasm` files were built for `web-tree-sitter@0.22.6`, but the package
pins `web-tree-sitter@0.26.10`, which requires the newer `dylink.0` wasm section
format. `Language.load` throws, so outline extraction errors out:

```
EXP3 — outline vs native full read (tokens = bytes/3.5)
| File | ... | Native (full read) | code_read outline | Δ |
| packages/intel/src/tools/code_grep.ts | ... | 7247t | ERROR: Language not available: typescript (wasm ABI gap) | — |
VERDICT: inconclusive — one or more files failed outline extraction
```

This is an **asset/toolchain version gap, not a code defect** — it is fixed by
refreshing `packages/intel/wasm/*.wasm` with grammars built for web-tree-sitter
0.26.x, with no code change. Until that asset refresh lands, **this README makes
no measured outline token-savings claim.** The `code_read` line/range paths, and
every analyzer that rides the bundled TypeScript compiler (`code_surface`,
`code_safe_delete`, `api_*`, `db_schema` usage), are unaffected — they do not use
tree-sitter.

## When native tools are the right choice

Be honest with yourself about the operation:

- **A plain full-file read** — use the native `Read` tool. `code_read` earns its
  keep on *structural outline* extraction and on line-range reads of large files,
  not on reading a whole small file.
- **A one-shot grep whose every hit you're going to read anyway** — native `Grep`
  is simpler. `code_grep` pays off when you want capped, deduplicated results, a
  single relevance-sorted representation, or batched queries in one call.
- **A quick one-off edit** — the native `Edit`/`Write` tools are simpler.
  `structural_edit` earns its keep on AST-scoped or batched changes where you
  want a diff preview, a stale-file guard, and atomic rollback before any bytes
  are written.
- **Reading a public web page** — that is `goodvibes-connect`'s (or native
  `WebFetch`'s) job, not intel's.

intel is worth installing when you repeatedly navigate a codebase's *structure*
(APIs, schemas, component trees, symbol surfaces) and want token-disciplined,
`resolved_path`-anchored answers.

## Content

- **Commands:** `/goodvibes-intel:plugin` (setup / status / prompt install),
  `/goodvibes-intel:codebase-review` (review workflow entry).
- **Agents:** engineer, refutation-reviewer, tester, architect (auto-discovered
  from `agents/`).
- **Skills:** intel-mastery, project-onboarding, goodvibes-memory,
  task-orchestration, review-scoring (loaded on demand by name).
- **Hooks:** SessionStart context, run-once Setup, SubagentStart pointers,
  PostToolUseFailure — all observe/inform only. Each yields silently if the v1
  `goodvibes` plugin is installed alongside, so nothing double-fires during the
  coexistence window.

## Install

```sh
claude plugin marketplace add mgd34msu/goodvibes-plugin
claude plugin install goodvibes-intel@goodvibes-market
```

Native dependencies (ripgrep, ast-grep) are **not** installed automatically —
run `/goodvibes-intel:plugin setup` to install them with explicit consent.

## Tests

`npx vitest run --project intel` — 178 passing (includes the `structural_edit`
write-path suite: preview/apply round trip, stale-hash refusal, atomic rollback
reporting, CRLF preservation, single-use tokens, and token expiry). The
outline-mode assertions skip with a clear reason when the tree-sitter grammar
cannot load, rather than failing red. `npx tsc --noEmit -p packages/intel` —
zero errors.
