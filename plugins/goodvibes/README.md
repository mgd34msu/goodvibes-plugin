# goodvibes

Structure-aware code intelligence, token/cost analytics, and registered HTTP/database access for
Claude Code: **25 tools across three MCP servers**, in one plugin. The three servers are
independent stdio processes (`intel`, `analytics`, `connect`); each runs only for the life of the
session that started it.

> Status: **v2.3.4**. Every number below was reproduced against this build with
> `node packages/intel/bench/run-all.mjs`. Nothing here is carried over from an older run.

## The three servers

| Server | Tools | Role |
|---|---|---|
| `intel` | 15 | Structure-aware code search/read + verified static analyzers, plus one preview-gated editor. Read-only except `structural_edit`. |
| `analytics` | 7 | Token and cost analytics with a self-contained HTML report. Observe-and-report only. |
| `connect` | 3 | Registered HTTP and database access under an explicit trust boundary. The only server that holds credentials. |

Tools surface under the `.mcp.json` server key: `mcp__intel__code_grep`, `mcp__analytics__query`,
`mcp__connect__api_request`, and so on.

### intel: 15 tools

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
only writes when the caller passes that token back AND every target file's hash still matches. A
file that changed since preview is refused per-entry (`refused_stale`), never silently re-matched.
Edits are byte-exact outside the changed span (newlines/CRLF preserved), and an atomic batch rolls
back from pre-apply snapshots if any entry cannot apply. Modes are `exact`, `ast`
(TypeScript-compiler node matching), and `ast_pattern` (ast-grep, active only when `@ast-grep/napi`
is installed). No fuzzy matching, no regex.

### analytics: 7 tools

| Tool | What it does |
|---|---|
| `query` | Query recorded usage (tokens, calls, timings) from the telemetry store |
| `dashboard` | `action: report` writes a self-contained HTML analytics report to `.goodvibes/reports/analytics-report.html`; `doctor` reports host health and orphaned processes; `status` reports engine state |
| `budget` | Cost against a per-model, cache-aware pricing table |
| `export` | Export usage data |
| `tag` | Tag sessions / spans for grouping |
| `sync` | Sync the telemetry store |
| `config` | Read analytics configuration |

Analytics is purely additive. It observes and reports token/cost history (which Claude Code does
not track natively) and never changes model behavior. The HTML report is fully self-contained
(inline CSS/JS/SVG, no external URLs) and follows the viewer's light/dark preference.

### connect: 3 tools

| Tool | What it does |
|---|---|
| `api_request` | Batched HTTP requests to a **registered** service (or an allowlisted URL), with per-entry error isolation, response capping, and a redaction pass over echoed responses |
| `service` | Manage the service registry: register a service, store credentials (0600, `{$env}` indirection), set per-service read-only vs write-methods, remove/purge |
| `db_query` | Query a **registered** database connection (Postgres / MySQL / SQLite), read-only by default, drivers resolved from the target project |

**connect trust boundary.** connect is the only server that holds credentials, so its defaults are
conservative:

- Credentials are pinned to their registered origin and never sent elsewhere (not toggleable).
- Destination allowlist is on by default: registered services and explicitly allowlisted URLs only.
- Read-only by default per service / connection; write methods are an explicit opt-in.
- Open mode is human-only and out-of-band (a config-file edit), announced at session start, and
  reverts to restricted next session unless a separate, loud `dangerously_persist_across_sessions`
  flag is set. Agents cannot toggle it.
- Every response carries a `mode: restricted | open` stamp; `set_auth` is write-only (0600, never
  echoed back).

## Token cost

Tool schemas are **deferred behind Tool Search**, which is on by default in current Claude Code,
so the 25 schemas are not loaded into every session. The model pulls a tool's schema when it
decides to call it.

What is always-on is the metadata for skills, agents, and commands, which the model must see to
know they exist. Measured with `claude plugin details` on 2026-08-21 against the installed
2.3.3 build:

| | Always-on | Notes |
|---|---|---|
| Whole plugin | **~882 tokens** | Added to every session |
| Six skills | ~470 tokens | Largest are `intel-mastery` and `service-integration`, ~90 each |
| Four agents | ~200 tokens | ~50 each |
| Five commands | ~230 tokens | ~30 to ~70 each |
| 25 tool schemas | 0 | Resolved at runtime, not counted |
| Nine hooks | 0 | Harness-only, no model context cost |

Invoking a skill or agent costs more, and costs it again each time it fires: roughly 620 to 1,600
tokens depending on the component. That is the deal on offer. Nothing is loaded until you ask for
it, and asking for it is not free.

If your client has Tool Search disabled, the tool schemas load eagerly. That cost is your
client's configuration, not something this plugin's manifest can change.

## Measured performance

Re-run on this build with `node packages/intel/bench/run-all.mjs`. Token counts use `bytes / 3.5`,
applied identically to the intel tool and the native baseline.

### code_grep vs native `git grep`: **PASS**

At defaults, `code_grep`'s `files_only` output returned the **same 76 matches** as `git grep` in
**902 tokens vs 2,420, a 62.7% reduction** (2.68x fewer tokens). Identical match counts are the
point: the saving comes from how the result is rendered, not from returning less of it.

### code_read outline vs a native full read: **PASS**

Outline extraction beat a full native read on every file measured. The spread is not noise. The
win tracks how much of a file is body rather than signature, so a dense implementation file saves
more than a small one that is mostly declarations.

| File | Lines | Native full read | `code_read` outline | Change |
|---|---|---|---|---|
| `packages/intel/src/tools/code_read.ts` | 764 | 8,851t | 2,378t | **−73.1%** |
| `packages/intel/src/tools/code_grep.ts` | 661 | 7,314t | 2,595t | **−64.5%** |
| `packages/core/src/cache/index.ts` | 388 | 3,783t | 2,251t | **−40.5%** |

## When native tools are the right choice

Be honest with yourself about the operation:

- **A plain full-file read.** Use the native `Read` tool. `code_read` earns its keep on
  *structural outline* extraction and line-range reads of large files.

- **A one-shot grep whose every hit you're going to read anyway.** Native `Grep` is simpler.
  `code_grep` pays off when you want capped, deduplicated results or batched queries in one call.

- **A quick one-off edit.** Native `Edit`/`Write` are simpler. `structural_edit` earns its keep on
  AST-scoped or batched changes where you want a diff preview, a stale-file guard, and atomic
  rollback before any bytes are written.

- **Reading a public web page or a one-off unauthenticated URL.** Use the native `WebFetch` tool.
  connect is not a general web reader; reach for it only for authenticated, registered-service calls
  or live database access under the trust boundary above.

- **Per-session token/cost accounting you don't need.** Skip analytics; it is purely additive.

## Content

### Commands

Five slash commands ship in `commands/`. Each is an entry point to a capability the servers
already expose, not a separate feature.

| Command | What it does |
|---|---|
| `/goodvibes:plugin` | Plugin management: health status, native-dependency repair, and the optional prompt-pointer install and uninstall |
| `/goodvibes:setup` | Re-runs the native dependency install in the foreground. This is the manual repair path when the automatic background install did not finish |
| `/goodvibes:analytics` | Session cost and token views, the HTML report, budgets, tags, export, and sync |
| `/goodvibes:services` | Manages the connect registry: register services and database connections, store credentials, set read-only against write access, manage the destination allowlist, and report trust status |
| `/goodvibes:codebase-review` | Runs the review-then-fix workflow over the current diff, with grounded checks and a refutation-based defect list |

### Agents

Four subagents are auto-discovered from `agents/`. They are role definitions with their own tool
sets and prompts, invoked through the native Agent tool.

| Agent | Use it for |
|---|---|
| `architect` | Designing an approach, breaking a task into a plan others execute, or mapping an unfamiliar codebase before work starts |
| `engineer` | Backend and frontend implementation once the approach is decided |
| `refutation-reviewer` | Reviewing a change by trying to disprove it works, producing an honest defect list |
| `tester` | Writing and running tests that verify real behavior, on risk rather than a coverage percentage |

### Skills

Six skills load on demand by name. None is always-on; each costs nothing until it is invoked.

| Skill | What it teaches |
|---|---|
| `intel-mastery` | Token-efficient use of the intel tools, and when a native `Read`/`Grep`/`Glob` is the better call |
| `project-onboarding` | Mapping an unfamiliar codebase's architecture with the intel analyzers before changing it |
| `goodvibes-memory` | The `.goodvibes/memory/` cross-session files, what is written automatically, and the JSON shape of each |
| `task-orchestration` | Splitting work across parallel subagents using native Workflow and Task tooling |
| `review-scoring` | The refutation-based review rubric: a severity-ranked defect list rather than a pass/fail score |
| `service-integration` | Reaching authenticated APIs and project databases through the connect trust boundary |

### Hooks

Nine lifecycle events are registered in `hooks/hooks.json`, running ten plain `.mjs` scripts with
no build step. Every hook fails open, so a hook that throws can never break the session or the
tool call that triggered it.

| Event | Script | What it does |
|---|---|---|
| `SessionStart` | `session-start.mjs` | Relinks native dependencies after a plugin update and starts the background installer when they are missing |
| `SessionStart` | `session-start-open-mode.mjs` | Announces that connect is in open mode, every session that mode persists |
| `Setup` | `setup.mjs` | Starts the same background dependency installer on `claude init` |
| `SubagentStart` | `subagent-start.mjs` | Gives a starting subagent pointers to the relevant skills |
| `PreToolUse` | `commit-guard.mjs` | Watches `git add` / `commit` / `stage` on Bash for the plugin's credential files. **The one hook that can stop a command** |
| `PostToolUseFailure` | `post-tool-use-failure.mjs` | Adds context after a failed Bash call |
| `SessionEnd` | `session-end.mjs` | Records end-of-session analytics |
| `Stop` | `stop.mjs` | Records turn-level analytics |
| `SubagentStop` | `subagent-stop.mjs` | Records subagent analytics |
| `PreCompact` | `pre-compact.mjs` | Records analytics before a context compaction |

**The commit guard is the single exception to observe-and-inform.** It protects exactly two
files, `goodvibes.secrets.json` and `goodvibes.cookies.json`, and only against git commands that
would stage them, whether named explicitly or swept in by `git add -A`, `git add .`, `git add -u`,
or `git commit -a`. It is warn-first: the first risky attempt is allowed through with a warning
and leaves a marker at `.goodvibes/.commit-guard-warned`, and a repeat attempt is denied. If the
guard itself errors it allows the command, because a guard failure must never block real work.

Project state is written under the `.goodvibes/` directory.

## Install

```sh
claude plugin marketplace add mgd34msu/goodvibes-plugin
claude plugin install goodvibes@goodvibes-market
```

Native dependencies install automatically in the background: the first session after install
spawns a detached installer (nothing blocks, one line tells you it started), installs land in
`~/.claude/.goodvibes/deps/` and survive plugin updates. The SessionStart hook relinks them
after an update. If the background install fails, one line points at
`~/.claude/.goodvibes/deps/install.log` and `/goodvibes:setup`, the manual foreground repair
path. Until an install lands, the servers still boot and every non-native capability works;
native-backed capabilities return an honest "run /goodvibes:setup" message rather than
crashing. Database drivers for `db_query` are resolved from your target project (per the v1
pattern), so they are not bundled; `db_query` prints an honest install hint when a driver is
missing.

## Tests

- `npx vitest run --project intel`: the intel suite (includes the `structural_edit` write-path
  suite: preview/apply round trip, stale-hash refusal, atomic rollback, CRLF preservation,
  single-use tokens, token expiry).
- `npx vitest run --project analytics`: the analytics suite.
- `npx vitest run --project connect`: the connect suite (HTTP client, cookie jar, service
  registry/resolver, secrets store/guard, auth orchestrator, trust boundary, db driver resolution).
- `npx tsc --noEmit -p packages/<intel|analytics|connect>`: zero errors per package.
