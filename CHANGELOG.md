# Changelog

All notable changes to the GoodVibes Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.2.0] - 2026-07-02

Setup runs once, ever.

### Added
- **Native dependencies survive plugin updates.** `/goodvibes:setup` now
  installs into a durable home — `~/.claude/.goodvibes/deps/<server>/` — and
  leaves each `server/<name>/node_modules` in the plugin copy as a symlink to
  it. A plugin update replaces the plugin copy (dropping the symlinks) but not
  the durable home; the SessionStart hook detects the missing link, verifies
  the durable install still matches the new version's dependency list, and
  silently relinks. No output, no nudge, no re-running setup. The nudge only
  returns when setup genuinely needs to run: never ran, or an update actually
  changed a server's dependency list (it names the affected servers).
  Covered by hook tests for the relink, the changed-dependency refusal, and
  the nothing-to-relink case.

### Changed
- The native-dependency error envelope and all setup prose now say what is
  true: `run /goodvibes:setup (once; the install survives plugin updates)` —
  the "re-run after every update" instruction is retired everywhere.

## [2.1.0] - 2026-07-02

Nothing clutters the conversation, and the obvious command works.

### Added
- **`/goodvibes:setup`.** The native-dependency install now has a top-level
  command — the word "setup" gets you setup. It is the same consent-gated flow
  as `/goodvibes:plugin setup` (which still works); every pointer in the
  product (the SessionStart nudge, error envelopes, docs) now names
  `/goodvibes:setup`.

### Changed
- **The PostToolUseFailure "Fix Loop" banner is gone.** The hook now emits
  nothing to the conversation, ever. Its remaining job is silent bookkeeping:
  it counts repeated failures per (tool, error) signature and, when the same
  failure recurs six times within 24h, documents it once to
  `.goodvibes/memory/failures.json` for the goodvibes-memory skill. The
  v1-ported suggestion/research-hint machinery was deleted with the banner.
  (The retired banner also had a display defect — every attempt listed its own
  current suggestion under "Previously attempted (failed)" — which is moot now.)
- **Project state moved from `.goodvibes/v2/` to `.goodvibes/`.** The `v2`
  namespace existed so v1 and v2 installs could coexist; v1 is uninstallable,
  so the subdirectory is pure naming residue. Both path resolvers (core config
  `getStatePath` and the hooks' `statePath`) migrate a legacy `v2/`
  subdirectory up automatically — once per process, merge-preserving, fail-open
  — so existing recaps, retries, memory, and registries carry over untouched.
- **The deps-missing nudge no longer depends on `claude init`.** It previously
  keyed on the Setup hook's run-once marker (written during `claude init`);
  it now probes the one thing that matters — whether the installed plugin copy
  has its native dependencies — and points at `/goodvibes:setup`. Nothing in
  the product references `claude init` anymore.
- **The development surface dropped its v2 naming** (repo-side): work happens
  on `main` (the `v2` branch is deleted; `v1` remains the permanent archive),
  `npm run build` / `npm run test` replace the `:v2`-suffixed scripts, CI jobs
  are renamed, the architecture docs lost their v2 filename prefixes, and
  `release.sh` — which still built v1 servers that no longer exist — was
  rewritten around the real release pipeline.

## [2.0.5] - 2026-07-02

The "installed from GitHub, setup not run yet" release: a fresh clone whose
servers have no `node_modules` (setup hasn't run, or a plugin update just
replaced the installed deps) must boot, explain itself, and never crash.

### Fixed
- **Fresh install no longer crashes the servers.** Every top-level import of an
  externalized native/WASM dependency now loads lazily on first use with a
  cached failure state, so a missing dependency can never take down a server at
  module load. Previously intel died at boot on `require('web-tree-sitter')` and
  analytics on `require('sql.js')`. Lazified: `web-tree-sitter` (intel
  `lib/tree-sitter.ts`), `sql.js` (core `telemetry`, analytics `telemetry-reader`
  and — already lazy — `global-db`); `@vscode/ripgrep` and `@ast-grep/napi` were
  already loaded lazily. All three servers now boot from a bare directory and
  answer `initialize` + `tools/list` with zero dependencies installed.

### Added
- **Honest degradation for native-backed capabilities.** A tool call that needs
  a missing dependency returns a normal error envelope — "<capability> needs
  native dependencies that are not installed yet - run /goodvibes:plugin setup
  (one-time). This also happens after a plugin update, which replaces the
  installed dependencies." — never a crash or a hang. Everything that needs
  nothing native keeps working on a fresh install: `code_read` lines, all
  TypeScript-compiler analyzers, `api_*`/`db_schema`/`component_tree`/
  `hook_dependencies`/`client_boundary`/`layout_analysis`, `structural_edit`
  exact + ast modes, analytics `live_cost`/`doctor`/`agents`, and all of connect.
  Telemetry (core + analytics) degrades to marked-unavailable and never blocks a
  tool.
- **A session cost recap every session start.** SessionStart replaces its silence
  with one value line built from the recap SessionEnd now writes to
  `.goodvibes/v2/cache/last-session-summary.json`: `Last session: $X.XX over N
  calls (families) | project total: $Y.YY` (or, first time in a project, a
  pointer to the live-cost view). SessionEnd prices the just-ended session's
  transcript with a dependency-free port of the analytics token-summing + pricing
  math (per-model `message.usage`, priced via `~/.claude/model-pricing.json` or a
  small embedded fallback table), maintains a running project total, caps the
  read at the last 20MB, tolerates a truncated final line, and is fully
  fail-open. A native-deps-missing note appears only when this project has run
  setup once but the installed plugin copy has since lost a representative dep to
  an update.
- **Fresh-install gate test.** A new bundle-level test copies each committed
  server to a bare directory with no `node_modules`, boots all three, and asserts
  the handshake succeeds, a native call returns the setup pointer, and a dep-free
  call succeeds.

### Changed
- Swept stale per-product comment headers left over from the one-plugin merge:
  the `(goodvibes-intel)` / `(goodvibes-analytics)` origin labels on the shared
  hooks, and the "alpha scaffold / empty tools list" prose on the intel and
  connect server headers. Added the re-run-after-update guidance to the
  `/goodvibes:plugin setup` docs and both README install sections.
- Builds are now byte-identical regardless of the directory they are invoked
  from: all three `build.mjs` scripts pin esbuild's `absWorkingDir` to the repo
  root. Previously the module-key comments in the bundles were rendered
  relative to `process.cwd()`, so the byte-determinism release gate silently
  depended on where the build command ran.

## [2.0.4] - 2026-07-02

### Added
- **First-party pricing fetch restored, in its proper home.** v1 fetched the
  official platform.claude.com pricing page from the SessionStart hook (a
  timeout hazard); the fetcher died with that hook machinery, leaving v2 on
  its static fallback table. The fetcher now lives in the analytics engine:
  lazy, non-blocking (cost paths kick a background refresh on a 24h TTL; the
  current call never waits on the network), 10s abort timeout, atomic cache
  writes to `~/.claude/model-pricing.json`, and fetched rates merge OVER the
  fallback per model. Parser upgrades over v1: recognizes every model family
  (v1 silently skipped Claude 5), keeps all versions rather than latest-only,
  and resolves date-qualified rows to the rate effective today — which
  matters right now: the live page lists Sonnet 5 introductory pricing
  ($2/$10 through Aug 31, 2026) that the static table had as $3/$15.
- Cost output now states its pricing provenance: first-party page + fetch
  age, or fallback table, always.

## [2.0.3] - 2026-07-02

### Changed
- **SessionStart is silent by default.** The hook previously announced the
  package manager, git branch, a "ready" banner, and a code-TODO count — all
  either visible elsewhere or, in the TODO counter's case, wrong: 67 of the
  reported 73 were TODO comments inside our own committed server bundles
  (including the bundled TypeScript compiler's). The stack/branch/banner
  lines, the TODO walker, and its background-refresh cache machinery are all
  removed. The hook now emits ONLY things needing attention: quick project
  health notes (missing node_modules; .env.example without .env) and the
  host-health nudge. A healthy session start produces zero output — enforced
  by a new contract test.
- `SERVER_VERSION` is now injected at build time from plugin.json (the single
  version source), ending constant drift permanently.

## [2.0.2] - 2026-07-02

First dogfooding session found and fixed two defects within minutes of
first live use — exactly what dogfooding is for.

### Fixed
- **Analytics WASM resolution**: the v1-ported sql.js resolvers (global DB
  and telemetry reader) never tried the `wasm/` subdirectory where v2's
  build actually ships `sql-wasm.wasm`, so the first real `query` call
  failed with ENOENT. Both resolvers now try the shipped layout first.
- **Server death on failed engine init**: a failed lazy initialization left
  a half-started engine whose timers later threw outside any handler and
  killed the process. Init failure now tears the engine down, resets, and
  retries on the next call; fatal faults log a diagnostic to the error
  channel and exit gracefully instead of dying silently (no keep-alive —
  visible death, not immortality).
- `SERVER_VERSION` constants were still `2.0.0-alpha.1`; now track releases.
- Stale idle-exit mention removed from the analytics server docstring.

### Added
- Bundle-level regression gate: spawns the committed analytics bundle over
  stdio and makes a real `query` call, asserting a response and a surviving
  process — the test that would have caught both defects pre-release.

## [2.0.1] - 2026-07-02

A patch pass over 2.0.0 — corrections and coherence, no new behavior.

### Fixed
- Removed the vestigial v1-coexistence yield guard from every hook and the shared
  hook lib (`hooks/lib/common.mjs`, `session-start-open-mode.mjs`, `commit-guard.mjs`).
  v1 can no longer be installed from the marketplace, so the check and its yield path
  were dead code; hooks now do their real work unconditionally, with fail-open
  discipline and `.goodvibes/v2/` state namespacing unchanged.
- Corrected hook output and doc labels: `[goodvibes-intel]`-style prefixes and prose
  describing the analytics/connect servers as "separate plugins" are now plain
  `goodvibes` (the three are servers in the one plugin), and stale
  `/goodvibes-intel:plugin` references are now `/goodvibes:plugin`.
- Aligned each server's internal `serverInfo.name` with its `.mcp.json` key
  (`intel` / `analytics` / `connect`, dropping the `goodvibes-` prefix).
- Reviewed the connect `services` command and `service-integration` skill against the
  real implementation and corrected them: the `{ "$env": "VAR_NAME" }` credential
  reference shape, the `service status` vs `get` response split, the register `config`
  fields, the per-service `write_methods` opt-in, `set_url_pattern` semantics, and
  documented `db_query` `url_env` connections and origin-scoped credential pinning.

### Changed
- `/goodvibes:plugin setup` and `status` now install and report native dependencies for
  all three servers (intel, analytics, connect) — each carries its own runtime-only
  `package.json` — instead of intel alone. Still fully consent-gated: nothing installs
  unless the user invokes `setup`.

## [2.0.0] - 2026-07-02

A ground-up rewrite driven by a measured deep review of v1. One plugin
(`goodvibes`), three MCP servers (intel / analytics / connect), 25 tools.

### Added
- **intel** (15 tools): outline/ranged `code_read`, multi-query `code_grep`
  (honest caps, AST structural queries, `expand_to`, `preview_replace`,
  rebuilt `ranked`), `code_glob` with per-file stats, single-compiler-host
  code intelligence (`code_surface`, `code_safe_delete` with full-program
  reference search), API analyzers (`api_routes`/`api_spec`/`api_validate`),
  `db_schema` with merged Prisma usage analysis, React analyzers
  (`component_tree` with four annotation modes, `hook_dependencies`,
  `client_boundary`), merged `layout_analysis`, `scaffold`, and
  `structural_edit` — a preview-gated AST editor with apply tokens,
  content-hash preconditions, byte-exact newline preservation, and
  first-class rollback reporting.
- **analytics** (7 tools): transcript-actual token accounting, per-model
  cache-aware pricing, live session cost (`query mode=live_cost`), host-health
  doctor (orphan detection with never-auto-run cleanup commands), background
  agent liveness classification.
- **connect** (3 tools): batched `api_request` with per-entry error isolation,
  the `service` credential registry (origin-pinned credentials, restricted by
  default, human-only ephemeral open mode), `db_query` under the same trust
  model.
- Process hygiene in every server: parent-liveness watchdog, per-request time
  budgets with honest partial results, plain SIGTERM death. **No idle
  self-exit** — servers run for the life of their session (regression-tested).
- Measurement harness (`packages/intel/bench/`) — the README's numbers rerun
  on demand: outline −40% to −72%, grep −63% at identical ground truth.

### Changed
- Native tools are never blocked or redirected; all hooks observe/inform only
  and fail open. The always-on prompt chain is gone (~13,500 tokens/session →
  ~0; an optional ≤1,500-token pointer installs by explicit consent).
- Project state is namespaced under `.goodvibes/v2/`; logs are level-split
  and rotated. Response envelopes are compact JSON with payload-true
  `token_estimate`, enforced `output.max_tokens`, and truthful
  `truncated`/`effective_caps`.
- Skills flattened to the discoverable layout (6 remain); agents consolidated
  to 4; commands live under `/goodvibes:*`.

### Removed
- The v1 tree in its entirety — six engines, 77 tools, the native-tool
  blocking hooks, output styles, the WRFC daemon, the registry pipeline.
  Everything remains permanently archived on the
  [`v1` branch](https://github.com/mgd34msu/goodvibes-plugin/tree/v1).
- Retired tools whose survival tests failed (accuracy or redundancy), per the
  tribunal record in `docs/goodvibes-plan.md`.

### Fixed
- All nine v1 field-defect classes, each with a regression test: silent
  cross-tree writes (base_path + resolved-path echo everywhere), silent grep
  truncation, same-path batch collapse, content-stub cache reads, dropped
  stdout, doubled pagination payloads, rollback misreporting, mixed
  plain/encoded field rejection, and orphaned servers spinning after session
  death.

## [1.10.0] - 2026-03-29

### Added
- **IPC socket self-healing** — self-healing socket watcher with automatic reconnection on disconnect, IPC state cleanup pipeline consolidating `isPidAlive` checks for stale socket cleanup
- **IPC router WRFC directive handling** — directives now route through the IPC channel for daemon-mode operation
- **WRFC config management** — MCP-accessible config store for WRFC parameters with session file pruning for stale sessions
- **Crash guards** on all 6 MCP servers to prevent silent disconnections during long sessions
- **Cross-platform ast-grep binaries** bundled for broader platform support

### Changed
- IPC socket symlinks replaced with pointer files to fix Unix socket path length limits (108-char `sun_path`)
- `runtime_config` now persisted to disk and seeded into CoreStateStore with WRFC values on startup
- `wrfcConfigStore` seeded at bootstrap with support for `min_review_score` alias alongside `score_threshold`
- Directive priority enforcement added to output style configuration
- `ast-grep/napi` lazy-loaded at first use instead of eagerly imported

### Fixed
- Crash guards on all 6 MCP servers preventing silent disconnections
- IPC socket discoverability improved with retry resilience for daemon startup race conditions
- `ensureArray` now coerces single-object args to arrays, fixing `.map` crash on string args in `extractPathsAffected`
- `ensureArray` handles MCP serialization edge case where JSON objects arrive unwrapped
- ast-grep lazy-loaded to prevent crashes on platforms without pre-built native binaries

## [1.9.0] - 2026-03-06

### Added
- **Runtime Engine** — entirely new 4-layer architecture (L0 Shared → L1 Core → L2 Extensions → L3 Plugins) with dual-mode operation (MCP stdio + daemon Unix socket IPC), 11 MCP tools, EventBus/EventProcessor, Workflow Engine (5 definitions), Trigger Registry, State Store, Persistence layer
- **WRFC Autonomous Quality Pipeline** — Work→Review→Fix→Check loop with configurable score_threshold and max_fix_attempts, directive queue with session_id scoping, `<gv>` tag parser, 7 iteration evolution to production stability
- **Daemon Mode** — background process in tmux with Unix domain socket IPC, tick driver, heartbeat plugin, HTTP webhook listener, file watcher, lockfile mutex, health check polling, signal handlers, DaemonHookServer
- **Slack Integration** — URL verification challenge handling, event normalizer, message field formatting, Web API service registration, bidirectional communication
- **Webhook & External Events** — HTTP listener with direct EventBus delivery, normalizer registry (Slack, GitHub, CI, Generic), CI failure bridge, synchronous tmux delivery
- **Project Engine** restructured to plugin-based architecture with schema extraction
- **Frontend Engine** 4-layer decomposition with responsive breakpoint analysis tool
- **Registry Engine** registered in plugin tool registry with schema extraction
- **Hook Scripts** — 3 standalone ESM modules (UPS directives, PreToolUse drain, queue auditor)
- **Orchestration skills** overhauled for directive-driven WRFC model

### Changed
- Runtime engine introduced with 4-layer plugin architecture replacing ad-hoc WRFC orchestration
- Project engine restructured to plugin-based architecture
- Frontend engine decomposed into 4 layers with unified event types and trigger system
- Skills updated for directive-driven WRFC model

### Fixed
- 141 bug fix commits across IPC reliability, WRFC directive delivery timing, cross-session directive theft, daemon lockfile mutex, transport reconnection, hook data flow, project/frontend/registry engine quality

## [1.3.0] - 2026-02-21

### Added
- **Analytics Engine** — entirely new engine with 7 MCP tools (analytics_dashboard, analytics_query, analytics_budget, analytics_tag, analytics_export, analytics_config, analytics_sync), global SQLite database (sql.js), JSONL session parser, daemon system, tmux mini dashboard, Ink/React full TUI with 4 pages, sync engine, tag system, budget system
- **Project Engine v2** — consolidated from analysis-engine with 26 tools using project_* naming convention, TypeScript Language Service integration, multi-DB support
- **Precision Engine v2** — file_ops (copy/move/delete) in precision_exec, ProjectIndex v3 with token estimates, PrecisionRuntime singleton, hooks system, telemetry with precision_id, session state KV, ModeManager, precision_agent with dossier format
- **Frontend Engine v2** — 3 new tools (frontend_client_boundary, frontend_hook_dependencies, frontend_error_boundaries), improved detection with DRY shared utilities
- **Skills overhaul** — all 25 skills rewritten to 10/10 review scores, 5 always-active protocol skills, tiered loading architecture, 80% token reduction
- **GPA Loop** (Gather-Plan-Apply) — renamed from DPB with practical batching
- **Setup hook** for session initialization and project indexing
- **Deep-dive documentation** for all 5 engines (precision-engine.md, analytics-engine.md, project-engine.md, frontend-engine.md, registry-engine.md)
- **/goodvibes:analytics** slash command for dashboard management
- **Native tool blocking** — WebFetch and Update redirected to precision equivalents
- **Sandbox mode protection** — agents prohibited from enabling sandbox
- **Progressive disclosure** model for context injection

### Changed
- Frontend engine tools renamed from verb-based (get_*, analyze_*, etc.) to frontend_* prefix convention
- DPB (Discover-Plan-Batch) renamed to GPA (Gather-Plan-Apply), relaxed from strict 3-call cycle
- precision_agent restricted to background-only mode (blocking removed)
- Subagent protocol split into chain-loaded files for progressive disclosure
- All prompt files loaded from external templates instead of hardcoding
- max_parallel_agent_chains renamed from parallel_agents in output styles

### Fixed
- 14+ analytics engine dashboard fixes (crash prevention, live metrics, label clarity, terminal width detection)
- Frontend engine critical issues across 4 submodules resolved to 10/10
- Project engine shell injection eliminated, return types fixed
- Precision engine ProjectIndex 7 issues resolved, ModeManager polish, KVState polish
- 18 skills brought from various scores to 10/10 through systematic review fixes
- Context injection aligned with progressive disclosure model
- precision_exec loophole for file search commands closed
- better-sqlite3 replaced with sql.js for portability, env variable leaks fixed

### Removed
- **Analysis Engine** — replaced entirely by Project Engine v2
- **Batch Engine** — functionality absorbed into precision_exec file_ops
- Old verb-based frontend tool names (replaced by frontend_* convention)

## [1.2.0] - 2026-02-09

### Added
- **Precision Fetch Authentication** — service registry with auto-auth, OAuth2 browser flow, token refresh, cookie jar, rate limiting, 12 extraction modes
- **precision_notebook** tool for Jupyter notebook cell editing with cell_id targeting
- **precision_config** tool for runtime configuration management
- **FileStateCache** with optimistic concurrency control and LRU eviction
- **Context intelligence** for smart file suggestions and batch pagination
- **ProcessManager** for background execution with SessionState and CommandHistory
- Image, PDF, and notebook (.ipynb) support in precision_read
- Runtime sandbox toggle for external path access
- 3 new integrator agents (integrator-ai, integrator-services, integrator-state)

### Changed
- Integrator agent split into 3 domain-specific agents
- SEW Loop renamed to DBE Loop (Discover Batch Execute Loop)
- Enterprise-grade code standards enforced across all agents

### Fixed
- 34+ E2E bugs across 8 rounds of remediation (319 to 562 tests)
- Auth orchestrator edge cases, OAuth2 single-quote escaping
- Format/mode mismatch in MCP schema vs handlers
- Ripgrep --glob pattern issues, timer leaks, cache invalidation
- Zero-length regex guard, image magic byte validation

## [1.1.0] - 2026-01-31

### Added
- **Precision Engine** — 12 MCP tools replacing native Claude Code tools (precision_read, precision_write, precision_edit, precision_grep, precision_glob, precision_exec, precision_fetch, precision_symbols, precision_agent, precision_notebook, precision_config, discover)
- Token-efficient operations with verbosity levels (count_only, minimal, standard, verbose)
- Extract modes for precision_read (content, outline, symbols, ast, lines)
- Batch operations across all tools (files[], edits[], commands[], queries[])
- Transaction support in precision_edit (atomic, partial, none)
- Fuzzy and regex match modes for precision_edit
- Background execution support in precision_exec
- **Registry Engine** — 7 tools for skill/agent/tool discovery (search_skills, search_agents, search_tools, recommend_skills, get_skill_content, get_agent_content, skill_dependencies)
- Fuse.js-based fuzzy search for registry lookups
- DBE Loop (Discover-Batch-Execute) workflow
- WRFC Loop (Write-Review-Fix-Check) quality enforcement
- Output styles: vibecoding and justvibes modes

### Changed
- All native tool operations deprecated in favor of precision equivalents
- Agent architecture standardized with memory/logging integration

## [1.0.0] - 2026-01-15

### Added
- **Major version release** — production-ready plugin architecture
- MCP server with tool definitions, schemas, and handler dispatch
- 11 specialized subagents (engineer, reviewer, tester, architect, deployer, planner, integrator-ai, integrator-services, integrator-state, skill-factory, agent-factory)
- Comprehensive hook system (12 events: SessionStart, PreToolUse, PostToolUse, SubagentStart, SubagentStop, etc.)
- Persistent memory system in .goodvibes/memory/ (decisions, patterns, failures, preferences)
- Smart context injection on session start
- Plugin distribution via marketplace.json

### Changed
- Complete rewrite from v0.5 architecture
- All agents standardized with decision frameworks and memory integration

## [0.5.0] - 2026-01-04

### Added
- **Complete GoodVibes Enhancement Implementation** (74 tasks across 10 feature areas)
- **Vibecoding Output Style** - Autonomous orchestration mode with rapid agent delegation
- **JustVibes Output Style** - Silent execution mode for maximum autonomy with file logging
- **Subagent Telemetry Hooks** - Analytics and tracing for all subagent activity
- **Smart Context Injection** - Stack detection and context injection on session start
- **Persistent Memory System** - Cross-session project memory in `.goodvibes/memory/`
- **PostToolUseFailure Smart Recovery** - 3-phase fix loop with documentation research
- **Agent Chaining** - Automatic continuation after agent completion
- **Auto-Checkpoint Commits** - Milestone-based automatic commits
- **Pre-Commit Quality Gates** - TypeScript, ESLint, Prettier, and test verification
- **Comprehensive Automation Framework** - State management, test/build automation, git workflow, dev server monitoring, crash recovery
- New context gatherers: isEmptyProject, detectStack, getGitContext, loadMemory, checkEnvironment, getRecentActivity, scanTodos, checkProjectHealth, analyzeFolderStructure
- 40+ new module files for enhanced functionality
- 164 new tests (total: 262 tests) covering state, automation, and context modules
- Comprehensive plugin documentation README

### Changed
- Enterprise-grade code standards enforced (no mocks, no placeholders)
- Context window management with 150k target, 175k max tokens
- Orchestrator delegation rules clarified for vibecoding mode
- User interaction flow enhanced with proactive feature suggestions

### Fixed
- TODO scanner false positive on its own source code (obfuscated example patterns)
- README ecosystem reference corrected
- stack-detector formatStackInfo null check for edge cases

## [0.4.0] - 2026-01-03

### Added
- **Workflow-planner agent** for complex task breakdown with structured planning output
- **project_issues MCP tool** for detailed file:line level issue reporting
- Filesystem Boundaries section added to all 8 webdev agents and factory
- Persistent memory system storing decisions, patterns, failures, and preferences
- SubagentStart and SubagentStop telemetry hooks for lifecycle tracking
- Smart Context Injection for SessionStart hook with parallel context gathering
- Extensive trigger patterns for all webdev agents (proactive activation)
- 32 comprehensive tests for memory system

### Changed
- Workflow-planner removes all timeline/time estimates (meaningless for AI coding)
- All registries rebuilt (11 agents, 156 skills, 18 tools)
- Agent frontmatter fixed with YAML block scalars for descriptions with colons

### Fixed
- TODO scanner now skips test files and directories (reduced false positives from 3 to 0)
- .goodvibes directory added to gitignore
- Subagent-telemetry issues from code review (debug logging, error handling)
- Persistent-memory module issues (error handling, gitignore append bug, tsconfig emit)

### Security
- Lazy directory creation with security-hardened .gitignore (200+ credential patterns)
- ensureSecurityGitignore now appends only missing patterns instead of duplicating

## [0.3.0] - 2026-01-03

### Added
- **brutal-reviewer agent** for critical code review with supporting skills
- **code-architect agent** for refactoring and architecture decisions
- Comprehensive test coverage with major refactoring of MCP server
- Extracted handlers from god class pattern for better modularity

### Changed
- Codebase quality improvements: security, DRY principles, modularity
- Validation modules enhanced with actual implementation logic

### Fixed
- Placeholder/incomplete code in validation modules:
  - naming-checks.ts: Added actual PascalCase validation logic
  - best-practices-checks.ts: Added multi-line comment tracking for console.log detection
  - security-checks.ts: Enhanced SQL injection detection with template literals
  - docs.ts: Replaced empty catch blocks with proper error handling

### Security
- Command injection vulnerability fixed in git-operations.ts (spawnSync with array args)
- Cross-platform compatibility fixed (replaced Unix grep with Node.js fs)
- Type safety improvements (unknown vs any, proper type guards)

## [0.2.0] - 2026-01-02

### Added
- **plugin_status MCP tool** for real health checks
- All 12 hook events for comprehensive coverage
- Catch-all hook matchers for all MCP tools
- MCP server bundled with esbuild for distribution

### Changed
- MCP server refactored: extracted types, config, schemas, and handlers
- Hooks updated to comply with official Claude Code plugin spec
- All dependencies updated to latest versions
- Agents field updated to list individual .md files

### Fixed
- ESM __dirname error in MCP server
- Missing plugin-status.yaml tool definition
- MCP tool matcher patterns for plugin namespace
- Redundant hooks field removed from plugin.json
- plugin-status to show all 12 hooks explicitly
- plugin-status to actually read hooks.json

## [0.1.0] - 2026-01-02

### Added
- **Initial release** of GoodVibes Plugin
- marketplace.json for plugin distribution
- Basic README documentation
- Core plugin structure and configuration

---

## Version History Summary

| Version | Date | Highlights |
|---------|------|------------|
| 1.10.0 | 2026-03-29 | IPC self-healing, MCP crash guards, WRFC config management, cross-platform fixes |
| 1.9.0 | 2026-03-06 | Runtime Engine, Daemon Mode, WRFC Directives, Slack Integration, Webhook System |
| 1.3.0 | 2026-02-21 | Analytics Engine, Project Engine v2, Precision Engine v2, Frontend Engine v2, Skills overhaul |
| 1.2.0 | 2026-02-09 | Precision Fetch auth, precision_notebook, precision_config, FileStateCache, ProcessManager |
| 1.1.0 | 2026-01-31 | Precision Engine (12 tools), Registry Engine, DBE Loop, WRFC Loop |
| 1.0.0 | 2026-01-15 | Production-ready architecture, 11 subagents, hook system, persistent memory |
| 0.5.0 | 2026-01-04 | Complete enhancement implementation (74 tasks), 10 feature areas |
| 0.4.0 | 2026-01-03 | Workflow-planner, persistent memory, telemetry hooks |
| 0.3.0 | 2026-01-03 | brutal-reviewer, code-architect, major refactoring |
| 0.2.0 | 2026-01-02 | MCP server refactoring, hook system compliance |
| 0.1.0 | 2026-01-02 | Initial release |

[Unreleased]: https://github.com/mgd34msu/goodvibes-plugin/compare/v1.10.0...HEAD
[1.10.0]: https://github.com/mgd34msu/goodvibes-plugin/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/mgd34msu/goodvibes-plugin/compare/v1.3.0...v1.9.0
[1.3.0]: https://github.com/mgd34msu/goodvibes-plugin/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/mgd34msu/goodvibes-plugin/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/mgd34msu/goodvibes-plugin/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mgd34msu/goodvibes-plugin/compare/v0.5.0...v1.0.0
[0.5.0]: https://github.com/mgd34msu/goodvibes-plugin/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/mgd34msu/goodvibes-plugin/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/mgd34msu/goodvibes-plugin/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/mgd34msu/goodvibes-plugin/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/mgd34msu/goodvibes-plugin/releases/tag/v0.1.0
