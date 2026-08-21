# GoodVibes v2.0-alpha — Carve-out Architecture

> **This is a dated design record, not current documentation.** It captures the 2026-07-02 ruling
> that turned [`docs/goodvibes-plan.md`](goodvibes-plan.md) into a build order. Parts of it
> describe an alpha tree that no longer exists, and its tool counts are the counts as planned,
> not as shipped. Where it disagrees with the code, the code is right. For what the plugin does
> today, read [`README.md`](../README.md) and
> [`plugins/goodvibes/README.md`](../plugins/goodvibes/README.md).
>
> Comments throughout `packages/` cite this file by section number, so its numbering is kept
> stable rather than tidied.

Date: 2026-07-02
Inputs: `docs/goodvibes-plan.md` (authoritative; §11 final surface, all 29 tribunal verdicts banked), `docs/history/deep-review-2026-07-01.md` Part 5, `docs/history/precision-engine-field-issues-2026-07-01.md` (issues 1–9, non-negotiable requirements on the new servers).
Status: design ruling for the alpha carve-out. Open rulings in §7 are vetoable; everything else restates plan decisions in implementation terms.

---

## 1. Repo layout

### 1.1 Alpha tree (v1 and v2 coexist; v1 stays runnable, untouched)

> **Updated 2026-07-02 (R1 vetoed by Mike):** the shape below is now a SINGLE plugin named
> `goodvibes` at `plugins/goodvibes/` carrying three server processes, and v1 was swept
> pre-release (permanent `v1` branch is the archive). The tree sketch reflects that; the original
> three-plugin decision is preserved in §7 R1/R6/R12/R14.

v2 source lives in **new top-level `packages/`**. v2 ships as **one plugin directory**
(`plugins/goodvibes/`) whose three server bundles are built *from* `packages/`.

```
goodvibes-plugin/
├── packages/                          # v2 engineering base (npm workspaces)
│   ├── core/                          # @goodvibes/core — shared infra (§3)
│   ├── intel/                         # @goodvibes/intel — 15-tool server source
│   ├── analytics/                     # @goodvibes/analytics — 7-tool server source
│   └── connect/                       # @goodvibes/connect — 3-tool server source
├── plugins/
│   └── goodvibes/                     # ONE plugin (name "goodvibes", version 2.0.0)
│       ├── .claude-plugin/plugin.json
│       ├── .mcp.json                  # three server entries: intel / analytics / connect
│       ├── server/
│       │   ├── intel/                 # committed esbuild output: index.cjs, wasm/, package.json (runtime deps only)
│       │   ├── analytics/             # index.cjs + mini.cjs + wasm/ + package.json
│       │   └── connect/               # index.cjs + wasm/ + package.json
│       ├── hooks/                     # plain .mjs union (intel + analytics + connect), no build step (§2.4)
│       └── skills/  agents/  commands/  templates/
├── .claude-plugin/marketplace.json    # ONE entry: goodvibes @ 2.0.0
└── .github/workflows/ci.yml           # v2 jobs only (§5.4)
```

Root `package.json` `workspaces` gains `"packages/*"`. The v1 workspaces stay listed until the
retire sweep. No SOURCE file is shared between the v1 and v2 trees — ports are **copies**, so v1 keeps
running from the same repo while v2 evolves. Runtime state is a different matter (R15,
verification finding): while both generations are installed, v2 servers and hooks write all
project state under a namespaced `.goodvibes/` (memory JSONs, telemetry DB, `.overflow/`,
logs) so the two never fight over the same files and analytics stays trustworthy; the v2.0
retire sweep migrates `.goodvibes/` up to the top-level paths once v1 is gone.

### 1.2 What "plugin dir" contains vs "package"

- `packages/<name>/` — TypeScript source, tests (`src/__tests__/`), `build.mjs`, `tsconfig.json`, `vitest.config.ts`. Never installed by users.
- `plugins/goodvibes-<name>/server/` — the committed esbuild bundle (`index.cjs` + `wasm/` for intel), plus a **runtime-only** `package.json` listing the unbundleable deps (`@ast-grep/napi`, `@vscode/ripgrep`, `sql.js` for intel; `ink`, `react`, `react-devtools-core`, `yoga-wasm-web`, `sql.js` for analytics; `sql.js` for connect — db drivers stay project-local per the v1 `drivers.ts` pattern). No `postinstall` chain (retired per plan §10): first-run native-dep install happens in the run-once Setup hook / `plugin` command with explicit consent.
- Tracked-dist strategy carries over from v1 (§8 cross-cutting): bundles are committed, CI verifies a byte-identical rebuild (§5.4).

### 1.3 v2.0 tree after the retire sweep

**The `v1` git branch is a permanent archive and is NEVER deleted, by Mike's explicit direction (2026-07-02)** — the sweep below is a commit on the v2/main line only; the complete v1 plugin remains forever recoverable at the `v1` branch.

Delete `plugins/goodvibes/` wholesale (all six engines, prompt chain, output styles, registry
pipeline, broken installers, `bin/`, root `src/` placeholders per plan §10). Delete the v1 entry
from `marketplace.json`. What remains: `packages/{core,intel,analytics,connect}`,
`plugins/goodvibes-{intel,analytics,connect}`, docs, scripts (only `check-versions.mjs`, release
script, dist-match check), CI. Version drift ends: each `plugin.json` is the single version source
for its plugin, all three lockstep at `2.0.0`; `check-versions.mjs` gates it.

---

## 2. Plugin shape

### 2.1 Ruling: three plugins, one marketplace — not one plugin with three servers

- **Opt-in is the thesis** (plan §0: "three opt-in products"). The native opt-in unit is the plugin. One plugin with three `.mcp.json` servers starts all three processes for every user; "connect on demand" (plan §11: 2 processes/session + connect on demand) is only achievable natively by making connect a separate plugin the user installs when they need it.

- **Trust separation.** connect holds credentials, the open-mode toggle, and live-DB access. Users who never registered a service should not have that server on disk or in memory.

- **Install weight.** intel carries ripgrep + ast-grep natives + tree-sitter WASM (tens of MB). An analytics-only user pays none of it.

- **Failure isolation** (field issue 9): fewer processes per session, and a defect in one product cannot leak processes for the others.

- Marketplace UX: `goodvibes-market` lists four plugins during alpha (v1 `goodvibes` marked deprecated in its description at v2.0-alpha, removed at v2.0).

Cost accepted: command namespaces change to `/goodvibes-intel:*` etc. (§7 R6), and shared content
needs a home (ruling: intel hosts it, §2.4).

### 2.2 Manifests

`marketplace.json` — add three entries (`goodvibes-intel`, `goodvibes-analytics`,
`goodvibes-connect`), `source: ./plugins/goodvibes-<name>`, versions read from each `plugin.json`
at release time (no second hand-maintained copy; the version field is filled by the release script
and gated by `check-versions.mjs`).

Each `plugin.json` (spec-conformant like v1's, which is verified robust):

```json
{
  "name": "goodvibes-intel",
  "version": "2.0.0-alpha.1",
  "description": "Structure-aware code search/read + verified static analyzers (14 tools).",
  "mcpServers": "./.mcp.json",
  "commands": "./commands/", "skills": "./skills/", "agents": [ ... ]   // intel only
}
```

`.mcp.json` per plugin — one server each, **deferred schemas everywhere**:

```json
{
  "mcpServers": {
    "goodvibes-intel": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/server/index.cjs"],
      "env": { "PLUGIN_ROOT": "${CLAUDE_PLUGIN_ROOT}", "NODE_ENV": "production" }
    }
  }
}
```

Schema deferral is a CLIENT capability, not a manifest key (verification finding, 2026-07-02):
current Claude Code defers MCP tool schemas behind Tool Search by default, and the only documented
server-level override is `alwaysLoad: true` — which we set on nothing. A `defer_loading` key in
`.mcp.json` is a silent no-op and does not ship. The ≤1,500-token fixed-tax figure (plan §9.6/§11)
therefore holds when the user's client has Tool Search active (the default); with deferral disabled
the 24 schemas load eagerly and that cost is the client's configuration, not something these
manifests can enforce — the README states this plainly. v1's `.lsp.json` does **not** carry
forward (§7 R7).

### 2.3 Tool naming

Server keys are the product names, so tools surface as `mcp__goodvibes-intel__code_read`,
`mcp__goodvibes-analytics__query`, `mcp__goodvibes-connect__api_request`. Tool names inside each
server are the plan §11 names with no `precision_`/`project_`/`frontend_` prefixes: the server is
the namespace. Analytics drops its `analytics_` prefix for the same reason (`query`, `dashboard`,
`budget`, `export`, `tag`, `sync`, `config`).

### 2.4 Content and hook assignment (the §8/§9/§11 survivors, split by ownership)

| Plugin | Hooks (plain `.mjs`, no build — §7 R8) | Skills | Agents | Commands |
|---|---|---|---|---|
| goodvibes-intel | SessionStart context-gather (EXTRACT, background/cached, fixed injection schema) · Setup run-once (marker-guarded, consent-gated) · SubagentStart pointers (≤500 tok) · PostToolUseFailure (keep as-is) | intel-mastery (precision-mastery successor) · project-onboarding · goodvibes-memory · task-orchestration · review-scoring (WRFC rubric) | engineer, refutation-reviewer, tester, architect | `/goodvibes-intel:plugin` (setup/status/install-prompts+uninstall) · `/goodvibes-intel:codebase-review` (WRFC template entry) |
| goodvibes-analytics | SessionEnd flush (slim) · Stop (keep) · SubagentStop telemetry-only (injection deleted) · PreCompact observe-only (checkpoint commit deleted) | — | — | `/goodvibes-analytics:analytics` |
| goodvibes-connect | SessionStart open-mode announcement (tiny, connect-owned — §7 R9) · secrets-commit-guard *only if rebuilt warn-first with tests; nothing placebo ships* | service-integration | — | `/goodvibes-connect:services` (registry CRUD UX + restrict/open toggle + status) |

`.goodvibes/` state (§7.5): memory JSONs and `.overflow/` are written by intel + hooks; log rotation
and level-split logging land in `@goodvibes/core` so all three servers inherit them. The WRFC
workflow template ships under intel's `skills/`/`commands/` (it needs no daemon).

Coexistence guard (R16, verification finding): while the deprecated v1 plugin is installed
alongside v2 (the R14 window), SessionStart context injection, PostToolUseFailure, and the commit
guard would each fire twice. Every v2 hook therefore starts with a cheap v1-detection check (the
v1 plugin's cache directory) and exits silently when v1 is present, emitting a single line in the
SessionStart context ("v2 hooks yielding to v1 — uninstall goodvibes v1 to activate them")
instead. v2 state writes stay namespaced regardless (R15).

---

## 3. Shared infrastructure — `packages/core` (`@goodvibes/core`)

One internal package, consumed via subpath exports, **bundled into each server by esbuild** (no
runtime linkage, no version drift; a core change rebuilds three bundles). Only genuinely
cross-server code lives here. The TS compiler host does NOT (§3.7).

| Export | Contents | Ported from (v1 paths under `plugins/goodvibes/tools/implementations/`) |
|---|---|---|
| `core/envelope` | Envelope type; `renderEnvelope` (compact JSON, one representation per payload); `estimatePayloadTokens` (~3.5 chars/tok, computed from the rendered payload, must land ±10%); `output.max_tokens` enforcement with UTF-8-safe truncation; `truncated` true only when trimming happened; `effective_caps` echoed whenever any cap trims; per-response cost metadata; `mode: restricted|open` stamp slot (connect) | `precision-engine/src/utils/index.ts` (`renderPrecisionResult`, `estimatePayloadTokens`, `toCallToolResult`), `logging.ts` (`estimateTokens`, `startTimer`), `utils/errors.ts`, `utils/overflow-handler.ts` (spill dir, kept per §7.5 with age cleanup) |
| `core/fsx` | `base_path` resolution (plain `path.resolve`, **no** git-bash rewrite); **resolved absolute path echoed for every file in every response** (issue 1 fix #3); relative-path-without-base_path warning field; real `.gitignore` reader; UTF-8-safe slicing; path validation | `precision-engine/src/utils/path-validation.ts`, `utils/gitignore.ts` (rebuilt to actually read `.gitignore`), size-gate logic from `precision-read.ts` |
| `core/proc` | Process-hygiene layer (issue 9, mandatory in every server `main()`): (a) parent-liveness watchdog — exit on stdin close AND a 5s `ppid` poll catching reparent-to-1/systemd; (b) idle self-exit after `proc.idle_exit_minutes` (default 30) without a request; (c) per-request time budget — every handler runs under `withBudget(ms)` (defaults §3.1) returning a partial-result envelope with honest `truncated`/`budget_exceeded` accounting instead of hanging; (d) SIGTERM exits — **no keep-alive exception handlers, no blocking sync loops**; watchdog timers are `unref()`ed so they never hold the loop open | BUILD NEW (v1 has only the non-firing stdin-close path). The analytics TUI SQLite flush loop and precision telemetry loop — the issue-9 busy-loop suspects — are fixed at the source in their lanes (§6) |
| `core/config` | Config **file** loader (`.goodvibes/config.json` project, `~/.claude/.goodvibes/config.json` user) + defaults; keys documented generated-from-code (plan §1.12); read-only mode status echoed into every envelope; **no MCP config tool**; open-mode toggle is human-only, out-of-band, with `dangerously_persist_across_sessions` as a separate loud key | `precision-engine/src/runtime-config.ts` + `config.ts`, gutted: dotted-key get/set asymmetry and agent-reachable toggles do not port |
| `core/telemetry` | Telemetry writer (SQLite via sql.js) + the shared record schema analytics reads; atomic writes on every shared state file; `precision_id`-style call ids; token counts sourced from rendered payloads (never self-estimates) | `precision-engine/src/state/telemetry.ts`, `state/kv-state.ts`; atomic-write discipline extended to `agent-tracking.json` consumers (§8 cross-cutting) |
| `core/cache` | The §7.1 rebuild: freshness metadata (`unchanged_since_last_read` + content hash) attached to normal full responses; explicit `probe: true` mode returning change-status with no content; **stub-on-read and `tokens_saved` deleted** | `precision-engine/src/state/file-cache.ts` (rebuilt; `search-cache.ts` lazy-cache pattern optionally reused per §5-registry note) |
| `core/logging` | Level-routed log files (debug never interleaves into human logs), rotation + size caps | `precision-engine/src/logging.ts`, analytics logger; fixes plan §7.5 |

### 3.1 Per-call budget defaults (config-overridable, chosen — §7 R10)

intel analyzers 20s; `code_grep`/`code_glob`/`code_read` 15s; connect `api_request` per-request
`timeout_ms` default 30s max 120s (and the 401-retry gets its own timeout — §1.8 fix); analytics
20s; `db_query` 30s. Budget expiry returns whatever partial result exists with
`budget_exceeded: true` — a lost result degrades to an error, never an infinite client wait.

### 3.2 `base_path` contract (issue 1, non-negotiable)

Every intel and connect tool that touches the filesystem takes `base_path` (the
`precision_glob`/`discover` template that worked in the field). Relative inputs resolve against
`base_path`; absent `base_path`, against the server cwd **with a `warning` field** in the response.
Every per-file result echoes `resolved_path` (absolute). Regression test class F1 (§5.3) locks this.

### 3.3 One TypeScript compiler host (intel-internal)

The audit found `typescript` bundled twice (project-engine `^5.3.0` dep + frontend-engine `^5.9.3`).
v2 rule: **one `typescript` pin (~5.9.x) in `packages/intel` only**, one `CompilerHost` module
(`packages/intel/src/host/`) wrapping a single LanguageService/Program with the virtual-fs +
tsconfig discovery from project-engine. Ported base:
`project-engine/src/core/code-intel/{language-service,virtual-fs,tsconfig,ast-utils,position,file-utils,types}.ts`.
Every intel analyzer — code_surface, safe_delete, api_*, db_schema-usage, component_tree,
hook_dependencies, client_boundary, layout_analysis — consumes this host; the frontend analyzers
rewire off `frontend-engine/src/shared/ast.ts` onto it during their port. It lives in intel, not
core, because no other server needs a compiler (§7 R4).

---

## 4. Port map — all 24 tools

Paths abbreviated: `PE/` = `plugins/goodvibes/tools/implementations/precision-engine/src/`,
`PJ/` = `.../project-engine/src/`, `FE/` = `.../frontend-engine/src/`,
`AN/` = `.../analytics-engine/src/`. "→ tests" names v1 suites that port (rewritten to the new
tool names/envelope); project-engine and frontend-engine ship **zero tests** — every analyzer port
must add fixture tests (§5.3).

### 4.1 goodvibes-intel (14)

| v2 tool | Ports from | Required fixes/merges (plan ref) | Tests that port |
|---|---|---|---|
| `code_read` | `PE/handlers/precision-read.ts` (outline + lines/range paths ONLY — content/symbols/ast/pdf/notebook/image branches retire), `PE/core/tree-sitter.ts`, `PE/core/languages.ts` + wasm assets | §1.1: honest `exported` flags; enforce `output.max_tokens`; honor `include_line_numbers` in lines mode; key batch results by entry not path (issue 3); serve extracts from cache, no stub (issue 4 / §7.1 via `core/cache`); token_budget one-representation rebuild (issue 6); UTF-8-safe size gate; `base_path` (issue 1); normalizePath rewrite deleted | `PE/__tests__/handlers/precision-read.test.ts`, `precision-read-pagination.test.ts`, `__tests__/state/file-cache.test.ts` (rewritten no-stub — the test asserting stub behavior dies per §10 gate 2) |
| `code_grep` | `PE/handlers/precision-grep.ts`, `PE/core/ripgrep.ts`, `PE/core/ast-grep.ts`, `PE/core/tree-sitter.ts`, `PE/utils/{grep-pagination,grep-negation,grep-replace-preview,grep-stats}.ts`; `grep-ranking.ts` REBUILT cheap (in-place sort + one `relevance` scalar, no content duplication); `grep-relationships.ts` does NOT port | §1.2 (all root-caused): per-file `--max-count` leak out of `count_only`; `max_total_matches` vs `max_results` in `files_only`; `truncated` computed against the right cap incl. negate; `match_count` counts lines like caps do; real `.gitignore`; issue 2: `effective_caps` in **every** format incl. `count_only`. ABSORB: unique diff-preview bits of `PJ/extensions/code-intel/preview-edits.ts` fold into `preview_replace` (§2 table) | `precision-grep.test.ts`, `precision-grep-hidden.test.ts`, grep cases in `bug-fixes.test.ts` |
| `code_glob` | `PE/handlers/precision-glob.ts` | §1.3: `respect_gitignore` actually reads `.gitignore` (fast-glob never does); un-anchor `DEFAULT_EXCLUDES` (node_modules leak); honest counts above the 100 cap; keeps `with_stats` + filters + sorting | `precision-glob.test.ts`, `precision-glob-hidden.test.ts` |
| `code_surface` | `PJ/extensions/code-intel/api-surface.ts` + host modules (§3.3) incl. `PJ/core/code-intel/{exports,type-extraction,diagnostics,entry-points}.ts` | §2: rewire onto the shared host; envelope/base_path/budget wrappers | none exist — new fixture tests (mini TS project fixture asserting surface) |
| `code_safe_delete` | `PJ/extensions/code-intel/safe-delete.ts` + `PJ/core/code-intel/{references,position,validation}.ts` | §2: **verify during port** the reference engine is compiler-based (LanguageService references), not regex — port blocks on that check | new fixture tests (delete-safe vs delete-breaks cases) |
| `api_routes` | `PJ/extensions/api/routes.ts` + `PJ/core/api/{detection,constants,types,parsers/express,parsers/fastify,parsers/hono,parsers/nextjs,parsers/utils}.ts` | §2: rides shared host; envelope/base_path | new fixture tests (one fixture app per framework) |
| `api_spec` | `PJ/extensions/api/spec.ts` + `PJ/core/api/{openapi,type-extraction}.ts` | §2: pairs with routes; read-only (no `sync` — retired) | new fixture tests (spec snapshot per fixture app) |
| `api_validate` | `PJ/extensions/api/validate.ts` + `PJ/core/api/{matching,validation}.ts` | §2 tribunal: keep the JSONPath-precise mismatch reporting; stays static spec-vs-routes (no live probing — that's connect's trust model) (§7 R11) | new fixture tests reusing the tribunal's planted-mismatch fixture |
| `db_schema` | `PJ/extensions/database/schema.ts` + `PJ/core/database/parsers/{prisma-schema,drizzle-schema,sql-schema}.ts`, `PJ/core/database/types.ts`; **usage mode** merges `PJ/extensions/database/prisma.ts` + `PJ/core/database/{prisma-utils,query-analysis}.ts` | §2 tribunal MERGE — shape in §4.4.3; accuracy spot-check on a fixture required during porting (tribunal condition); usage mode rides the shared host | new fixture tests (prisma+drizzle+sql fixtures; usage fixture with a planted query-in-loop) |
| `component_tree` | `FE/extensions/component-tree.ts` + `FE/core/react/{component-analyzer,component-detector,relationship-builder,types}.ts`; annotation modes from `FE/core/component-state/*` (state), `FE/core/error-boundaries/*` (boundaries), `FE/core/event-flow/*` (events), `FE/core/accessibility/{rules,scanner,types}.ts` (attributes) | §3 tribunal MERGE — shape in §4.4.1; fix the state passed-to-children mapping; events keep ONLY the accurate predicates; attributes keep ONLY verified checks, never claims about computed styles | none exist — new fixture tests per annotation mode |
| `hook_dependencies` | `FE/extensions/hook-dependencies.ts` + `FE/core/hooks/{extractor,issue-detector,stability-analyzer,types}.ts` | §3 KEEP: straight port onto shared host + envelope | new fixture tests |
| `client_boundary` | `FE/extensions/client-boundary.ts` + `FE/core/client-boundary/{graph-builder,issue-detector,scanner,types}.ts` | §3 KEEP: straight port | new fixture tests |
| `layout_analysis` | Backbone: `FE/extensions/layout-hierarchy.ts` + `FE/core/layout/*`; overflow: `FE/core/overflow/*`; sizing: `FE/core/sizing/{analyzers,context}.ts`; stacking: `FE/core/stacking/*`; shared: `FE/core/jsx/*`, `FE/core/tailwind/{constants,identifier,parser,types}.ts` (corrected class dictionary); responsive: `FE/core/responsive/*` as REBUILD input only | §3 tribunal MERGE — shape in §4.4.2; keep nested-flex min-height detector + fix list, guard the absolute-positioning heuristic; sizing active only with `selector`; stacking ships as-is + lists all context-creation triggers per element; **responsive section ships only after the CSS-first rebuild** (`@theme` variables merged with config) — alpha ships without it | new fixture tests per section |
| `scaffold` | `PJ/extensions/standalone/scaffold.ts` + `PJ/shared/utils.ts` helpers; templates move to `plugins/goodvibes-intel/templates/{full,minimal}` | §9.5: fix 3 phantom manifest files; replace all-`latest` pins with tested versions; `_registry.yaml` not carried | new tests: manifest-vs-tree consistency + scaffold dry-run |

Retired precision/project/frontend files not listed above (edit/write/exec/notebook/symbols/agent
handlers, discover, fetch page-reading, deps/*, runtime/*, security/*, testing/*, standalone
bundle, render-triggers, tailwind-conflicts, project-indexer, mode-manager, dossier, etc.) do not
port; they die with the v1 tree at the retire sweep.

### 4.2 goodvibes-analytics (7)

The engine ports **whole** — it is v2's second product, surface unchanged (plan §4). Source:
`AN/handlers/{query,dashboard,budget,export,tag,sync,config}.ts`, `AN/data/*` (jsonl readers,
sync-engine, stores), `AN/daemon/`, `AN/tui/`, `AN/tmux/`, `AN/{server,dashboard,mini,full}.ts`.

| v2 tool | Fixes | Tests that port |
|---|---|---|
| `query` | token counts from transcript actuals, never tool self-estimates (§4 engine-level) | `AN/daemon/__tests__/aggregator.test.ts` |
| `dashboard` | document the tmux TUI; **fix the TUI SQLite flush busy-loop** (issue 9 suspect) and route its debug spam to level-split logs (§7.5) | `AN/tui/mini/__tests__/{format,renderer}.test.ts`, `AN/tui/full/components/__tests__/trend-line.test.ts` |
| `budget` | replace flat two-rate model with per-model + cache-aware pricing; ship maintained pricing table (`.cache/model-pricing.json` fetch exists) | new pricing-table tests |
| `export` / `tag` / `sync` / `config` | atomic writes on every shared state file ingested (incl. `agent-tracking.json`); clear production tsc errors; `core/proc` wired into `server.ts` | new atomic-write + smoke tests |

### 4.3 goodvibes-connect (3)

| v2 tool | Ports from | Required fixes/merges | Tests that port |
|---|---|---|---|
| `api_request` | HTTP-client core of `PE/handlers/precision-fetch.ts` + `PE/utils/fetch/{request-builder,rate-limiter,redirect-tracker,cookie-jar,content-type,format-negotiation}.ts`. Page-reading stack (`readability,turndown,html-utils,tables,links,css-selectors,code-blocks,structured-data,pdf-routing`) retires — WebFetch won | §1.8 REBUILD — shape in §4.4.4: per-URL error isolation (one malformed spec must not fail the batch); timeout on the 401-retry; working response capping/pagination via envelope `max_tokens`; honest extract-mode names; `mode: restricted\|open` envelope stamp + redaction pass for known secret values | `PE/__tests__/utils/{request-builder,cookie-jar,turndown→drop,structured-data→drop}.test.ts` (keep request-builder + cookie-jar), `envelope.test.ts` cases |
| `service` | `PE/utils/fetch/{service-registry,service-resolver,secrets-store,secrets-guard}.ts` + `PE/utils/fetch/auth/{auth-orchestrator,oauth2-browser,oauth2-refresh,session-auth,static-auth,index}.ts` (the best-engineered v1 feature: 0600 secrets, `{$env}` indirection, triple gitignore guard, bounded tiered 401 recovery, credential-free summaries, purge-on-remove — all KEEP) | §1.8 BUILD NEW trust boundary: credential pinning to registered origins (never toggleable); destination allowlist default-on; open mode human-only + ephemeral, envelope stamp + session-start announcement + optional statusline badge; `dangerously_persist_across_sessions` separate loud key, re-announced every session; per-service read-only default with explicit write-methods opt-in | `PE/__tests__/utils/{service-registry,service-resolver,secrets-store,secrets-guard}.test.ts`, `__tests__/utils/auth/*.test.ts` (5 suites) — the largest intact ported suite |
| `db_query` | `PJ/extensions/database/query.ts` + `PJ/core/database/{drivers,executors/postgres,executors/mysql,executors/sqlite,executors/index,url-parser,sqlite-pool,formatters,errors,constants}.ts` | §2: moves to connect's trust model — registered connection only, read-only default, writes opt-in, same open-mode toggle; keep the praised behavior (drivers loaded from target project, honest install hints) | none exist — new tests against sqlite fixture + driver-resolution unit tests |

### 4.4 Merged-tool shapes (tribunal specs honored)

#### 4.4.1 `component_tree` — four annotation modes

```jsonc
// input
{ "path": "src/App.tsx",            // file or directory
  "base_path": "/abs/project",
  "annotate": ["state","boundaries","events","attributes"],  // default [] = bare tree
  "depth": 5, "output": { "max_tokens": 4000 } }
// output: nodes carry annotation blocks ONLY for requested modes
{ "tree": [{ "name":"App", "resolved_path":"/abs/project/src/App.tsx", "children":[...],
  "state":      [{ "name":"query","kind":"useState","flows_to":[{"child":"SearchBox","prop":"value"}] }],
  "boundaries": { "is_boundary":true,"mechanism":"getDerivedStateFromError","has_fallback":true,"has_reset":false },
  "events":     [{ "handler":"onClick","element":"div","risks":["nested_interactive_double_fire"] }],
  "attributes": { "role":"button","issues":["click_without_role"] } }] }
```
Per tribunal: state mode fixes the passed-to-children mapping; boundaries carry
`has_fallback`/`has_reset` booleans and detect class + library wrappers; events keep only the two
accurate predicates (nested-interactive double-fire, handler-on-non-interactive); attributes are a
static overlay of the verified checks (role/tree construction, missing-alt, click-without-role,
ARIA required-attribute presence) and never claim computed-style knowledge.

#### 4.4.2 `layout_analysis` — tree backbone + sections

```jsonc
// input
{ "file": "src/Panel.tsx",          // required
  "base_path": "/abs/project",
  "selector": "div.results",         // optional — focuses sizing/constraint analysis on one node
  "sections": ["overflow","stacking"] } // default; "sizing" requires selector; "responsive" post-rebuild only
// output
{ "hierarchy": [ { "element":"div","classes":[...],"layout_role":"flex-col","children":[...] } ],
  "overflow":  { "risks":[{ "node":"div.results","pattern":"nested_flex_missing_min_height","fixes":["min-h-0 on ..."] }] },
  "sizing":    { "selector":"div.results","constraint_chain":[{ "ancestor":"main","constraint":"h-screen" }, ...] },
  "stacking":  { "contexts":[{ "node":"div.modal","z_index":50,"created_by":["position:fixed","z-50"] }] } }
```
Backbone from layout-hierarchy (input contract per tribunal: file + optional selector). Overflow
keeps the nested-flex min-height detector and the fix-option list, with the absolute-positioning
heuristic demoted to a guarded low-confidence flag. Sizing emits the ancestor constraint chain
using the shared corrected class dictionary and activates only with `selector`. Stacking ships
essentially unchanged plus the all-triggers-per-element enhancement. Responsive is absent until
its CSS-first rebuild lands (reads `@theme` breakpoint variables, merges with config).

#### 4.4.3 `db_schema` — with prisma usage mode

```jsonc
// input
{ "base_path": "/abs/project",
  "source": "auto",                  // auto | prisma | drizzle | sql
  "usage": false }                   // opt-in prisma usage analysis (tribunal merge)
// output
{ "models": [ { "name":"User","fields":[...],"relations":[...] } ],
  "usage":  { "call_sites":[{ "model":"User","operation":"findMany","resolved_path":"...","line":42,"in_loop":true }],
              "frequency":[{ "model":"User","count":17 }] } }   // present only when usage:true
```
Usage mode is the ported prisma call-chain mapping (real TS-compiler analysis: call chains,
query-in-loop detection, usage frequency) riding the shared host; tribunal requires an accuracy
spot-check on a fixture during porting before it ships.

#### 4.4.4 `api_request` — the fetch split's HTTP half

```jsonc
// input
{ "requests": [ { "id": "create",            // results keyed by id (or index) — never collapsed
    "service": "stripe", "path": "/v1/customers",  // OR "url" for unregistered targets (allowlist applies)
    "method": "POST", "headers": {...},
    "body": { "type": "json", "data": {...} },     // json | form | text | multipart
    "params": {...}, "timeout_ms": 30000,
    "extract": "json" } ],                    // honest names: json | text | headers | status — no "summary"
  "output": { "max_tokens": 4000 } }
// output
{ "mode": "restricted",                       // envelope stamp; "open" only via the human-only toggle
  "results": { "create": { "status": 201, "resolved_url": "https://api.stripe.com/v1/customers",
    "body": {...}, "truncated": false, "error": null } } }     // per-entry error isolation
```
Fixes wired in: one malformed spec fails only its own entry; the 401-retry carries its own
timeout; response capping/pagination via the shared envelope; extract modes named for what they
do; the redaction pass strips known secret values from echoed responses.

---

## 5. Build & test

### 5.1 Build

Per-package `build.mjs` matching v1's proven esbuild pattern (bundle, `platform: node`,
`format: cjs`, `keepNames`, sourcemap), updated: `target: node20` (CI's node), outfile
`../../plugins/goodvibes-<name>/server/index.cjs`. Externals differ per package:

- intel externals: `@ast-grep/napi`, `@vscode/ripgrep` (native), `sql.js`; the WASM copy step
  targets `plugins/goodvibes-intel/server/wasm/` and copies BOTH the tree-sitter grammars AND
  `sql-wasm.wasm` (mirroring v1 precision-engine's build.mjs — sql.js loads its WASM at
  runtime); `typescript` is bundled (pure JS, one copy, one version).
- analytics externals are exactly v1's proven list — `ink`, `react`, `react-devtools-core`,
  `yoga-wasm-web`, `sql.js` — none of which bundle cleanly; they ship as runtime deps with the
  sql-wasm copy.
- connect externals: `sql.js` (+ wasm copy); its db drivers resolve from the *target project*
  per the kept v1 pattern, so they are not deps at all.

All three servers import `core/telemetry`, hence the sql.js handling everywhere.
`@goodvibes/core` has no build — it is source consumed by the three server bundles.

### 5.2 Vitest

**One vitest major everywhere: ^4** (analytics and frontend are already there; the v1 v2/v4 skew
dies in v2 — §7 R12). Root `vitest.workspace.ts` covering `packages/*`; tests colocated at
`packages/<name>/src/__tests__/**` mirroring v1 precision-engine's layout. `npm run test` at
root runs the workspace; v1 suites keep their per-engine invocation until the sweep.

### 5.3 Regression suites (release gates 2–3, plan §10)

- **Envelope accounting** (`packages/core`): ports `PE/__tests__/utils/envelope.test.ts`; asserts `token_estimate` within 10% of rendered payload on fixtures, `max_tokens` enforcement, `truncated` truthfulness, `effective_caps` presence whenever trimmed.

- **Field-defect classes** — one named test per class, living where the fix lives: F1 base_path/resolved-path echo (`core/fsx` + one per-tool case); F2 cap honesty in every grep format (`intel` grep suite); F3 same-path batch entries (`intel` read suite); F4 no-stub cache / probe mode (`core/cache`); F5/F7/F8 retire with exec/edit — F8's lesson becomes an api_request alternate-field validation test (`connect`); F6 single-representation pagination (`intel` read suite); F9 process hygiene (`core/proc`: spawn a real server child, kill the parent, assert exit ≤10s; fake-clock idle-exit test; budget-expiry envelope test). The v1 test asserting stub-cache behavior is deleted, per gate 2.

- **Measurement suite**: the deep-review EXP harness ports to `packages/intel/bench/` (lane 1) and re-runs against v2 defaults in lane 8 (gate 5: intel beats native on kept operations at defaults, or the README claim comes off).

### 5.4 CI additions (`.github/workflows/ci.yml`; v1 jobs untouched until the sweep)

```yaml
v2-packages:            # gating, matrix: [core, intel, analytics, connect]
  - npm ci (root, workspaces)
  - npx tsc --noEmit -p packages/${m}     # 0 errors — new code starts clean (gate 1)
  - npx vitest run --project ${m}
v2-dist-match:          # gating
  - node packages/*/build.mjs && git diff --exit-code plugins/goodvibes-*/server
v2-manifests:           # gating
  - node scripts/check-versions.mjs   # plugin.json ↔ marketplace.json lockstep
```
The advisory job's known-red baselines stay scoped to v1 and are deleted with it.

---

## 6. Migration order — lane plan

Lane ownership is disjoint by source files; nothing edits another lane's tree. Model assignments
follow Mike's tiering (opus: subprocess/toolchain/design/trust; sonnet: file-bounded ports with a
clear brief). Every lane brief that shells out gets `timeout 300` wrappers.

| # | Lane | Scope (owns) | Depends on | Model |
|---|---|---|---|---|
| 0 | **Scaffold** (sequential, first) | workspaces, `packages/core` (envelope, fsx, proc, config, telemetry, cache, logging + their tests incl. F9), plugin dirs + manifests + `defer_loading`, build scripts, CI jobs | — | **opus** (toolchain orchestration + the process-hygiene design) |
| 1 | Search/read trio | `code_read`, `code_grep`, `code_glob` from PE; F2/F3/F6 regression tests (+ the code_read integration case for F4 — F4's unit home is core/cache in lane 0); EXP measurement-harness port to `packages/intel/bench/`; ported PE suites | 0 | **sonnet** (file-bounded, root-caused fixes enumerated, big test net) |
| 2 | Compiler host + code intel | `packages/intel/src/host/`, `code_surface`, `code_safe_delete` (+ its compiler-based-references verification) | 0 | **opus** (one-host refactor is design-adjacent; safe_delete verification is a ruling) |
| 3 | API + DB analyzers | `api_routes`, `api_spec`, `api_validate`, `db_schema`+usage (+ fixture apps) | 0; host rewire after 2 lands (parsers port meanwhile) | **sonnet** |
| 4 | Frontend analyzers | `component_tree`+4 annotations, `layout_analysis` (merge shapes §4.4.1–2), `hook_dependencies`, `client_boundary` | 0; host from 2 | **opus** for the two merges, **sonnet** subtasks for the two straight ports |
| 5 | Connect | `api_request`, `service` + BUILD-NEW trust boundary, `db_query`; connect's two hooks (open-mode SessionStart announcement, warn-first commit guard) since both are trust-boundary artifacts; ported auth/registry suites; F8-lesson test | 0 | **opus** (credential/trust judgment) with a **sonnet** sub-brief for `db_query` after the trust model exists |
| 6 | Analytics | whole-engine port, pricing fix, TUI busy-loop fix, atomic writes, tsc cleanup | 0 | **opus** (subprocess/TUI/busy-loop hunt), port mechanics delegable to **sonnet** |
| 7 | Scaffold tool + content | `scaffold` + template fixes; intel + analytics skills/agents/commands/hooks rewrite per §2.4 (connect's hooks live in lane 5) | 0 | **sonnet** (fully specified) |
| 8 | **Integration** (sequential, last) | manifest wiring + hook-registration smoke checks (authoring happened in lanes 5/7), measurement-suite rerun (gate 5; harness ported by lane 1), install-path smoke test (marketplace install of all three), version lockstep, README | 1–7 | **opus** |

Parallelism: lanes 1, 3-parsers, 5, 6, 7 start together the moment 0 lands; 2 starts with them;
3-rewire and 4 queue behind 2. Sequential spine: 0 → (2 → 3/4) → 8. Worst path: 0, 2, 4, 8.

---

## 7. Open rulings (vetoable — one line of reasoning each)

- **R1 — Three plugins, not one.** The plugin is the native opt-in/trust/install-weight unit, and it is the only native way to honor "connect on demand" (§2.1).
  - **VETOED by Mike 2026-07-02** — ship ONE plugin named `goodvibes` at `plugins/goodvibes/`, with all three server processes (`intel`/`analytics`/`connect`) kept as separate stdio servers under one `.mcp.json`. Opt-in-per-product is not exercised; consolidation wins on packaging simplicity.

- **R2 — v2 source in top-level `packages/`, plugin dirs carry committed bundles only.** Keeps v1 untouched-and-runnable, keeps installables lean, keeps the proven tracked-dist strategy with a CI byte-match.

- **R3 — One shared package (`@goodvibes/core`) bundled per server, not runtime-linked.** No version drift possible; a core fix is three rebuilds, which CI already forces.

- **R4 — TS compiler host lives in `packages/intel`, not core.** Only intel needs a compiler; putting it in core would bloat analytics/connect bundles for nothing.

- **R5 — `typescript` pinned once at ~5.9.x; `vitest` at ^4 workspace-wide.** Ends the audit's double-bundle and the v2/v4 skew in one move.

- **R6 — Command namespaces become `/goodvibes-intel:*` etc.** Forced by R1 (plugin name owns the namespace); UX change accepted and documented.
  - **Reverted 2026-07-02** (follows the R1 veto) — the single plugin owns one namespace, so commands are `/goodvibes:*` (`/goodvibes:plugin`, `/goodvibes:codebase-review`, `/goodvibes:analytics`, `/goodvibes:services`).

- **R7 — `.lsp.json` does not carry into v2.** The plan's whole symbols posture is "native LSP owns this"; shipping our own LSP wiring contradicts it.

- **R8 — v2 hooks are plain `.mjs` with no build step.** They shrink to trivial size in v2; deleting the hook build removes the src/dist-match burden for them entirely.

- **R9 — Connect ships its own tiny SessionStart hook for the open-mode announcement.** Hook ownership follows the feature; intel's context hook must not depend on connect's presence.

- **R10 — Concrete hygiene numbers** (30 min idle exit, 5 s ppid poll, 20 s analyzer / 30–120 s HTTP budgets): the plan mandates the mechanisms, not values — all config-overridable.
  - **Amended 2026-07-02 (Mike)** — the idle self-exit mechanism is REMOVED entirely (no 30-min idle timer). Servers run for the life of their session and rely on parent-liveness only; the ppid poll stays, the idle-exit clock is gone.

- **R11 — `api_validate` stays static (spec-vs-routes) in intel.** Live probing would need credentials, which is connect's trust model; the tribunal evidence was for the static check.

- **R12 — Intel hosts the shared content set (agents, WRFC template, memory/orchestration skills).** It is the flagship most users install; a fourth content-only plugin is marketplace clutter.
  - **Moot 2026-07-02** (follows the R1 veto) — with one plugin, there is no cross-plugin content-hosting question; all agents, skills, commands, and templates live in the single `goodvibes` plugin.

- **R13 — analytics tool names drop the `analytics_` prefix.** The server key already namespaces them; matches intel/connect naming.

- **R14 — v1 `goodvibes` marketplace entry stays through alpha, marked deprecated, removed at v2.0.** Same-repo users keep a working install until the sweep.
  - **Superseded 2026-07-02** — v1 was swept pre-release; there is no coexistence alpha window. The permanent `v1` git branch is the archive, and the `goodvibes` name/dir is reused by the consolidated v2 plugin. (The R15/R16 v1-yield guards are kept as dormant, fail-open safety.)

- **R15 — v2 runtime state namespaced under `.goodvibes/v2/` during coexistence** *(verification finding)*: v1 and v2 otherwise fight over the same memory/telemetry files; the retire sweep migrates it up.
  - **Retired 2.1.0 (2026-07-02)** — v1 is uninstallable, so the namespace subdirectory is gone: state lives directly under `.goodvibes/`. Both path resolvers (core/config `getStatePath`, hooks `statePath`) migrate a legacy `v2/` subdirectory up automatically, once per process, fail-open.

- **R16 — v2 hooks yield to v1 when both plugins are installed** *(verification finding)*: prevents double-fired SessionStart/failure/commit-guard handlers during the R14 window; one explanatory line in SessionStart context instead.

---

## 8. Addendum (2026-07-02) — follow-on lanes 9 and 10 (plan §14)

Launch after lanes 1–8 land (lane 9 needs lane 6's ported base; lane 10 needs lane 1's ast-grep/preview_replace).

| # | Lane | Scope | Depends on | Model |
|---|---|---|---|---|
| 9 | Analytics observability | `query` live mode (tail-tolerant JSONL reader over the CURRENT session, per-model pricing, main-vs-subagent split); host-health sampler (60s unref'd interval: loadavg, session children, orphan heuristic = ppid init/systemd + plugin-cache cmdline + sustained CPU) with `dashboard` health section + `doctor` listing offenders with ready-to-run kill commands, never auto-killing; agent-liveness scanner (transcript mtime + write-rate + tail-state → thinking/executing/wedged) as a `query`/`dashboard` mode; a health-state file under `.goodvibes/` that intel's SessionStart may read for a one-line threshold nudge (graceful when absent). Analytics stays 7 tools — modes, not new tools. | 6 (+7 for the nudge wiring) | **opus** (process scanning + heuristics), transcript-reader mechanics delegable to **sonnet** |
| 10 | `structural_edit` (intel tool 15) | Port the AST match/apply engine from v1 `precision-edit.ts` (ast + ast_pattern modes ONLY — no fuzzy, no plain-text find) onto lane 1's ast-grep/preview_replace base. Preview-first: `preview` returns per-match diffs + a preview token + per-file content hashes; `apply` requires token + hashes still matching (stale → per-entry `refused_stale`, never silent). Byte-exact newline/CRLF preservation outside edit spans (regression test on a CRLF fixture — the v1 defect). Per-entry status enum (`applied`/`refused_stale`/`rolled_back`/`failed`), envelope `success:false` when any atomic entry fails; rollback restores from pre-apply snapshots and reports `rolled_back` first-class (the v1 issue-7 lesson, inverted into a test). README states intel's posture: read-only except this one preview-gated editor. | 1 | **opus** (write-path atomicity + rollback design) |

Headline counts supersede to intel 15 / total 25 (plan §14).
