# goodvibes

Structure-aware code intelligence, token/cost analytics, and registered HTTP/database access for
Claude Code — **25 tools across three MCP servers**, in one plugin. The three servers are
independent stdio processes (`intel`, `analytics`, `connect`); each runs only for the life of the
session that started it.

> Status: **v2.0.0**. Numbers below are measured on this build; where a number could not be
> reproduced in the build environment, this README says so plainly instead of quoting it.

## The three servers

| Server | Tools | Role |
|---|---|---|
| `intel` | 15 | Structure-aware code search/read + verified static analyzers, plus one preview-gated editor. Read-only except `structural_edit`. |
| `analytics` | 7 | Token and cost analytics with a self-contained HTML report. Observe-and-report only. |
| `connect` | 3 | Registered HTTP and database access under an explicit trust boundary — the only server that holds credentials. |

Tools surface under the `.mcp.json` server key: `mcp__intel__code_grep`, `mcp__analytics__query`,
`mcp__connect__api_request`, and so on.

### intel — 15 tools

Every filesystem tool takes a `base_path` and echoes the absolute `resolved_path` for each file it
touches, so results are unambiguous across working directories. Every response is a compact
envelope with an honest token estimate, `output.max_tokens` enforcement, and truthful
`truncated` / `effective_caps` accounting.

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

**intel is read-only except `structural_edit`, which is preview-gated.** Every other tool only
reads, searches, and analyzes. `structural_edit` cannot write blind: a `preview` call writes
nothing (it returns diffs, a single-use token, and per-file content hashes), and an `apply` call
only writes when the caller passes that token back AND every target file's hash still matches — a
file that changed since preview is refused per-entry (`refused_stale`), never silently re-matched.
Edits are byte-exact outside the changed span (newlines/CRLF preserved), and an atomic batch rolls
back from pre-apply snapshots if any entry cannot apply. Modes are `exact`, `ast`
(TypeScript-compiler node matching), and `ast_pattern` (ast-grep, active only when `@ast-grep/napi`
is installed) — no fuzzy, no regex.

### analytics — 7 tools

| Tool | What it does |
|---|---|
| `query` | Query recorded usage (tokens, calls, timings) from the telemetry store |
| `dashboard` | `action: report` writes a self-contained HTML analytics report to `.goodvibes/reports/analytics-report.html`; `doctor` reports host health and orphaned processes; `status` reports engine state |
| `budget` | Cost against a per-model, cache-aware pricing table |
| `export` | Export usage data |
| `tag` | Tag sessions / spans for grouping |
| `sync` | Sync the telemetry store |
| `config` | Read analytics configuration |

Analytics is purely additive — it observes and reports token/cost history (which Claude Code does
not track natively) and never changes model behavior. The HTML report is fully self-contained
(inline CSS/JS/SVG, no external URLs) and follows the viewer's light/dark preference.

### connect — 3 tools

| Tool | What it does |
|---|---|
| `api_request` | Batched HTTP requests to a **registered** service (or an allowlisted URL), with per-entry error isolation, response capping, and a redaction pass over echoed responses |
| `service` | Manage the service registry: register a service, store credentials (0600, `{$env}` indirection), set per-service read-only vs write-methods, remove/purge |
| `db_query` | Query a **registered** database connection (Postgres / MySQL / SQLite), read-only by default, drivers resolved from the target project |

**connect trust boundary** — connect is the only server that holds credentials, so its defaults are
conservative:

- Credentials are pinned to their registered origin and never sent elsewhere (not toggleable).
- Destination allowlist is on by default — registered services and explicitly allowlisted URLs only.
- Read-only by default per service / connection; write methods are an explicit opt-in.
- Open mode is human-only and out-of-band (a config-file edit), announced at session start, and
  reverts to restricted next session unless a separate, loud `dangerously_persist_across_sessions`
  flag is set. Agents cannot toggle it.
- Every response carries a `mode: restricted | open` stamp; `set_auth` is write-only (0600, never
  echoed back).

## Token cost

Tool schemas are **deferred behind Tool Search**, which is on by default in current Claude Code —
so the 25 schemas are not loaded into every session; the model pulls a tool's schema when it
decides to call it. What *is* always-on is a small amount of skill/command metadata (measured via
`claude plugin details`): intel ~484, analytics ~33, connect ~19 tokens. For comparison, the v1
monolith carried a ~13,530-token always-on tax. If your client has Tool Search disabled, the tool
schemas load eagerly — that cost is your client's configuration, not something this plugin's
manifest can change.

## Measured performance (intel gate 5)

Re-run on this build with `node packages/intel/bench/run-all.mjs`. Token counts use `bytes / 3.5`,
applied identically to the intel tool and the native baseline.

### code_grep vs native `git grep` — **PASS**

At defaults, `code_grep`'s `files_only` output returned the **same 76 matches** as `git grep` in
**902 tokens vs 2,415 — a 62.7% reduction** (2.68× fewer tokens). This is the flagship measured
claim.

### code_read outline — **inconclusive on this build**

The outline benchmark could not be measured here (a tree-sitter grammar `.wasm` / web-tree-sitter
ABI version gap — an asset/toolchain issue, not a code defect). Until the grammar assets are
refreshed for web-tree-sitter 0.26.x, this README makes no measured outline token-savings claim.
The `code_read` line/range paths and every analyzer that rides the bundled TypeScript compiler
(`code_surface`, `code_safe_delete`, `api_*`, `db_schema` usage) are unaffected — they do not use
tree-sitter.

## When native tools are the right choice

Be honest with yourself about the operation:

- **A plain full-file read** — use the native `Read` tool. `code_read` earns its keep on
  *structural outline* extraction and line-range reads of large files.
- **A one-shot grep whose every hit you're going to read anyway** — native `Grep` is simpler.
  `code_grep` pays off when you want capped, deduplicated results or batched queries in one call.
- **A quick one-off edit** — native `Edit`/`Write` are simpler. `structural_edit` earns its keep on
  AST-scoped or batched changes where you want a diff preview, a stale-file guard, and atomic
  rollback before any bytes are written.
- **Reading a public web page or a one-off unauthenticated URL** — use the native `WebFetch` tool.
  connect is not a general web reader; reach for it only for authenticated, registered-service calls
  or live database access under the trust boundary above.
- **Per-session token/cost accounting you don't need** — skip analytics; it is purely additive.

## Content

- **Commands:** `/goodvibes:plugin` (setup / status / prompt install), `/goodvibes:codebase-review`
  (review workflow entry), `/goodvibes:analytics` (session cost/token views), `/goodvibes:services`
  (connect service registry).
- **Agents:** engineer, refutation-reviewer, tester, architect (auto-discovered from `agents/`).
- **Skills:** intel-mastery, project-onboarding, goodvibes-memory, task-orchestration,
  review-scoring, service-integration (loaded on demand by name).
- **Hooks:** SessionStart context + open-mode announcement + silent native-dependency
  relink/background install, Setup (kicks the same background installer on `claude init`),
  SubagentStart pointers, PostToolUseFailure, a warn-first commit guard, and the analytics
  SessionEnd / Stop / SubagentStop / PreCompact telemetry hooks — all observe/inform only and
  fail open. Project state is written under the `.goodvibes/` directory.

## Install

```sh
claude plugin marketplace add mgd34msu/goodvibes-plugin
claude plugin install goodvibes@goodvibes-market
```

Native dependencies install automatically in the background: the first session after install
spawns a detached installer (nothing blocks, one line tells you it started), installs land in
`~/.claude/.goodvibes/deps/` and survive plugin updates — the SessionStart hook relinks them
after an update. If the background install fails, one line points at
`~/.claude/.goodvibes/deps/install.log` and `/goodvibes:setup`, the manual foreground repair
path. Until an install lands, the servers still boot and every non-native capability works;
native-backed capabilities return an honest "run /goodvibes:setup" message rather than
crashing. Database drivers for `db_query` are resolved from your target project (per the v1
pattern), so they are not bundled; `db_query` prints an honest install hint when a driver is
missing.

## Tests

- `npx vitest run --project intel` — the intel suite (includes the `structural_edit` write-path
  suite: preview/apply round trip, stale-hash refusal, atomic rollback, CRLF preservation,
  single-use tokens, token expiry).
- `npx vitest run --project analytics` — the analytics suite.
- `npx vitest run --project connect` — the connect suite (HTTP client, cookie jar, service
  registry/resolver, secrets store/guard, auth orchestrator, trust boundary, db driver resolution).
- `npx tsc --noEmit -p packages/<intel|analytics|connect>` — zero errors per package.
