# Release Notes: v1.3.0

**Release Date:** 2026-02-21

This is a major release featuring an entirely new Analytics Engine (7 MCP tools, SQLite global DB, full TUI), Project Engine v2 consolidating 26 tools under the project_* convention (replacing analysis-engine), Precision Engine v2 with new subsystems (file_ops, PrecisionRuntime, hooks, telemetry, precision_agent), Frontend Engine v2 with 3 new tools and consistent frontend_* naming, a complete Skills Architecture overhaul (25 skills at 10/10), and deep infrastructure improvements (GPA Loop, subagent protocol, native tool blocking, sandbox protection). 283 commits, 1,448 files changed, 326,620 insertions, 652,731 deletions.

---

## Highlights

### 1. Analytics Engine (Entirely New)

Built from scratch with 7 MCP tools: analytics_dashboard, analytics_query, analytics_budget, analytics_tag, analytics_export, analytics_config, analytics_sync. Features a global SQLite database (sql.js replacing better-sqlite3 for portability), JSONL session parser, daemon system (watcher + aggregator + archiver), mini dashboard (tmux-based with progress bars and configurable width), full TUI (Ink/React with 4 pages: overview, sessions, trends, config), sync engine for JSONL history backfill, tag system, budget system, and a /goodvibes:analytics slash command.

### 2. Project Engine v2 (Consolidated from Analysis Engine)

Replaced the old analysis-engine entirely with 26 tools using the project_* naming convention. Categories: Code analysis (project_code_dead, project_code_safe_delete, project_code_preview_edits, project_code_breaking, project_code_semantic_diff, project_code_surface), Security (project_security_secrets, project_security_permissions, project_security_env), Database (project_db_schema, project_db_query, project_db_prisma), API (project_api_routes, project_api_spec, project_api_validate, project_api_sync), Dependencies (project_deps_analyze, project_deps_circular, project_deps_upgrade), Testing (project_test_coverage, project_test_find), Runtime (project_runtime_memory, project_runtime_profile, project_runtime_logs), plus scaffold and bundle_analyze. Includes TypeScript Language Service integration, multi-DB support (PostgreSQL, MySQL, SQLite), and shell injection eliminated.

### 3. Precision Engine v2

Major subsystem additions: file_ops (copy, move, delete with import rewriting) added to precision_exec. ProjectIndex singleton upgraded to v3 with size and token estimates. PrecisionRuntime singleton unifying all engine subsystems. Hooks system for precision tool lifecycle. Telemetry with precision_id tracking. Session state KV store. ModeManager for verbosity/mode management. precision_agent with dossier format and memory injection for headless Claude sessions. Batch engine removed (functionality absorbed into precision_exec file_ops). Project indexer parallelized with stat() calls.

### 4. Frontend Engine v2

3 new tools: frontend_client_boundary (Next.js client/server boundary analysis), frontend_hook_dependencies (React hook dependency chain analysis), frontend_error_boundaries (React error boundary coverage analysis). All 14 tools renamed from verb-based naming (get_*, analyze_*, trace_*, diagnose_*, audit_*) to a consistent frontend_* prefix convention. Improved detection using DRY shared utilities.

### 5. Skills Architecture Overhaul

All 25 skills rewritten to achieve 10/10 review scores. 5 protocol skills (always-active): precision-mastery, gather-plan-apply, review-scoring, goodvibes-memory, error-recovery. Tiered architecture with proactive execution triggers. 80% token reduction through skill compression. Progressive disclosure alignment with Anthropic spec. Skill delivery architecture for subagents. Skill catalog and awareness in context injection.

### 6. Infrastructure & Workflow

GPA Loop (Gather-Plan-Apply) introduced, renamed from DPB (Discover-Plan-Batch), and relaxed from strict 3-call cycle to practical batching. Setup hook for session initialization. Subagent protocol split into chain-loaded files. Progressive disclosure model for context injection. Native tool blocking (WebFetch, Update redirected to precision equivalents). Sandbox mode protection (agents prohibited from enabling). Deep-dive documentation for all 6 engines.

---

## Features

### Analytics Engine

- feat(analytics-engine): Phase 0 -- global DB foundation (sql.js SQLite)
- feat(analytics-engine): Phase 1 -- project setup, types, data layer, schemas
- feat(analytics-engine): Phase 2 Batch 1 -- daemon core + tmux integration
- feat(analytics-engine): Phase 2 Batch 2 -- aggregator, archiver, barrel exports
- feat(analytics-engine): Phase 3 -- mini dashboard + full TUI (Ink/React, 4 pages)
- feat(analytics-engine): Phase 4 -- MCP handlers, entry point, build config
- feat(analytics-engine): Phase 5 -- dashboard & TUI updates with cross-project view
- feat(analytics-engine): Phase 6 -- sync engine for JSONL history backfill
- feat(analytics-engine): Phase 7 -- slash command rewrite for new nomenclature
- feat(analytics-engine): add analytics_sync tool and update descriptions
- feat(analytics-engine): add ESM/CJS build outputs and improve build pipeline
- feat(analytics-engine): add MCP server entry point and plugin registration
- feat(analytics-engine): add progress bars to mini dashboard
- feat(analytics-engine): make mini dashboard section width and min width configurable
- feat(analytics-engine): overhaul mini dashboard layout and data sources
- feat(analytics-engine): harden mini renderer with tests and error handling
- feat(analytics-engine): auto-close dashboard panes on session exit, 1s refresh
- feat(analytics-engine): use configured max_parallel_agent_chains in mini dashboard
- feat(analytics-engine): rename Commands->Tools metric
- feat(goodvibes): add /goodvibes:analytics slash command
- feat: overhaul analytics-engine spec and streamline tools registry

### Project Engine

- feat(project-engine): bootstrap v2.0.0 skeleton for engine consolidation
- feat(project-engine): migrate security, deps, testing domains (phases 3, 6, 7)
- feat(project-engine): wire 26 tool schemas and handler registry (phase 10)
- feat(project-engine): delete analysis-engine, clean old files, update refs (phase 11)
- feat(project-engine): replace tool definition YAMLs with project_* naming (26 tools)
- TypeScript Language Service integration for code analysis
- Multi-DB support: PostgreSQL, MySQL, SQLite
- Shell injection eliminated across all tool handlers

### Precision Engine v2

- feat: add file_ops (copy, move, delete with import rewriting) to precision_exec (v2, phase 1A)
- feat: upgrade ProjectIndex to v3 with size and token estimates (v2, phase 1B)
- feat: remove batch engine entirely -- functionality absorbed into precision_exec file_ops (v2, phase 1C)
- feat: add telemetry/precision_id and session state KV store (v2, phase 2D+2E)
- feat: add PrecisionRuntime singleton unifying engine subsystems (v2, phase 3F)
- feat: add precision engine hooks system for tool lifecycle (v2, phase 4G)
- feat: add precision_agent with dossier format and memory injection (v2, phase 5H)
- feat: integrate ProjectIndex into discover handler (Phase 2A)
- feat: wire ProjectIndex into write and edit handlers (Phase 2B)
- feat: add ProjectIndex singleton for in-memory project file index
- feat: add project file indexer for session-start hook
- feat(project-index): convert to v2 tree format for token efficiency
- perf: parallelize stat() calls in project indexer

### Frontend Engine v2

- feat(frontend-engine): implement v2 -- new tools, improved detection, cleanup
- feat(frontend-engine): add frontend_hook_dependencies tool (React hook dependency chain analysis)
- feat(frontend-engine): add frontend_client_boundary tool (Next.js client/server boundary)
- feat(frontend-engine): add frontend_error_boundaries tool (React error boundary coverage)
- Improved detection with DRY shared utility functions

### Skills & Agents

- feat: Phase 1 protocol skills -- all 5 at 10/10 with Anthropic spec compliance
- feat: complete skill overhaul -- 25 skills at 10/10, regenerate registry
- feat: add debugging quality skill
- feat: add performance-audit quality skill
- feat: add api-design outcome skill
- feat: add proactive execution triggers to all 25 SKILL.md descriptions
- feat: complete skill delivery architecture for subagents
- feat: add skill catalog and awareness to subagent context injection
- feat: enrich fallback protocol skill content in session-start hook
- 80% token reduction through skill compression

### Infrastructure

- feat: add setup hook and session initialization
- feat: enforce GPA (Gather-Plan-Apply) workflow with practical batching
- feat: block native Update tool, redirect to precision_edit
- feat(hooks): block native WebFetch tool, redirect to precision_fetch
- feat: prevent agents from activating sandbox mode
- feat: add wrfc_binding config to output styles
- feat: add implicit permissions to output styles
- feat: split subagent protocol into chain-loaded files for progressive disclosure
- feat: update plugin registries and rebuild subagent hooks

---

## Bug Fixes

### Analytics Engine

- fix(analytics-engine): fix full dashboard crash from stale .commands references
- fix(analytics-engine): fix session ID mismatch in pane cleanup
- fix(analytics-engine): fix commands scoping error and telemetry WASM URL in CJS
- fix(analytics-engine): getState() re-aggregates on every call for live metrics
- fix(analytics-engine): compute uptime live from Date.now()
- fix(analytics-engine): adaptive commands label shortens to Cmds at 1000+
- fix(analytics-engine): commands section shows pass/fail with colored icons
- fix(analytics-engine): update mini dashboard labels and layout per user feedback
- fix(analytics-engine): distinguish precision vs API labels
- fix(analytics-engine): separate precision engine and API cache metrics
- fix(analytics-engine): fix dashboard currency format, project names, cache hit rate
- fix(analytics-engine): comprehensive dashboard data + UI overhaul (8.5 -> 10)
- fix(analytics-engine): add __dirname/__filename shims to ESM dashboard bundles
- fix(analytics-engine): use config-driven min width in error fallback path
- fix(analytics-engine): redesign mini dashboard lines 2-3
- fix(analytics-engine): address trends review nitpicks
- fix(analytics-engine): fix dashboard health trends with real baselines
- fix(analytics-engine): distinguish unrecognized JSONL types from malformed lines
- fix(analytics-engine): Phase 1, 2, 3 quality fixes
- fix(analytics-engine): auto-detect terminal width in mini dashboard renderer
- fix(analytics-engine): add error logging to draw catch
- fix(registries): add missing YAML defs and fix analysis->analytics-engine ref

### Frontend Engine

- fix(frontend-engine): resolve critical issues across 4 submodules to 10/10

### Project Engine

- fix(project-engine): eliminate shell injection and fix return types (phases 2, 8)

### Precision Engine v2

- fix: replace better-sqlite3 with sql.js and fix env variable leaks
- fix: wire mergeDefaults into ModeManager.applyDefaults to eliminate dead code
- fix: KVState review polish -- readCounter helper, fire-and-forget docs
- fix: ModeManager review polish -- ModeConfigResult type, @public mergeDefaults
- fix: address review issues across 5 WRFC streams
- fix: final precision_agent review fixes (phase 5I, 10/10)
- fix: close precision_exec loophole for file search commands
- fix(discover): achieve 10/10 review score
- fix: resolve all 7 issues in ProjectIndex singleton
- fix: resolve 3 major + 4 minor issues in session-start project indexer

### Skills

- fix: bring fullstack-feature and component-architecture to 10/10
- fix(debugging-skill): fix all review issues to achieve 10/10
- fix: payment-integration skill -- all major and minor issues (6.6 -> 9.5)
- fix: resolve all major and minor issues in security-audit quality skill
- fix(code-review): fix all major and minor issues from 8.4/10
- fix(deployment-skill): fix all review issues for 9.5+
- fix: resolve 18 review issues in task-orchestration skill
- fix(api-design): resolve 11 review issues, score 8.4 -> 10.0
- fix(review-scoring): resolve all review issues for 10/10
- fix: complete ASCII compliance across all skill files
- fix: integration test remediation -- ASCII compliance and script hardening

### Infrastructure

- fix: align subagent context-injection with progressive disclosure model
- fix: update fallback prompt files with precision_exec prohibition
- fix: update fallback prompt files for fresh auto-population
- fix: address CHECK review feedback for context-injection
- fix(output-styles): use absolute paths for @ imports

---

## Refactoring

- refactor(frontend-engine): rename all 14 tools to frontend_* convention
- refactor(analytics-engine): extract esmBundleBanner constant to eliminate duplication
- refactor: relax GPA loop from strict 3-call cycle to practical batching
- refactor: rename DPB (Discover-Plan-Batch) to GPA (Gather-Plan-Apply)
- refactor: remove precision_agent blocking mode, background-only
- refactor: compress protocol skills for 80% token reduction
- refactor: align skills and agents with Anthropic progressive disclosure model
- refactor: split SUBAGENT-PROTOCOL.md into chain-loaded files
- refactor: load prompt files from external templates instead of hardcoding
- refactor: rename parallel_agents to max_parallel_agent_chains
- refactor: inline prompt fragments into output styles, remove stale docs
- refactor: improve project indexer and precision engine internals

---

## Documentation

- docs: add deep-dive docs for all 5 engines and update README
- docs(frontend-engine): add v2 analysis document and update tracking
- docs: update README to reflect current project state
- docs: add project_engine analysis, clean up old test artifacts
- docs: add project_engine deep analysis with overlap assessment
- docs: add find-circular-deps to analysis engine table
- docs: update tool counts and add precision_notebook/precision_agent to all docs
- docs: remove batch_engine references from all plugin docs

---

## New Components Added

### Analytics Engine (built from scratch)

- Global SQLite DB layer (sql.js) with JSONL session parser
- Daemon system: watcher, aggregator, archiver
- Mini dashboard: tmux-based renderer with progress bars, configurable width, auto-detect terminal width
- Full TUI: Ink/React app with 4 pages (overview, sessions, trends, config)
- Sync engine for JSONL history backfill
- Tag system and budget system
- 7 MCP tool handlers: analytics_dashboard, analytics_query, analytics_budget, analytics_tag, analytics_export, analytics_config, analytics_sync
- ESM/CJS dual build pipeline
- /goodvibes:analytics slash command

### Project Engine v2 (consolidated from analysis-engine)

- 26 tool handlers under project_* naming convention
- TypeScript Language Service integration
- Multi-DB adapter: PostgreSQL, MySQL, SQLite
- Shell-safe command execution throughout

### Precision Engine v2 Subsystems

- PrecisionRuntime singleton (engine unification)
- ProjectIndex v3 (in-memory project tree with size + token estimates)
- Hooks system (tool lifecycle callbacks)
- ModeManager (verbosity/mode configuration)
- Session state KV store
- Telemetry with precision_id tracking
- precision_agent handler with dossier format + memory injection
- File ops: copy, move, delete with import rewriting
- Session-start project indexer with parallelized stat() calls

### Skills (25 total, all new or rewritten)

- Protocol (5): precision-mastery, gather-plan-apply, review-scoring, goodvibes-memory, error-recovery
- Orchestration (2): task-orchestration, fullstack-feature
- Outcome (11): ai-integration, api-design, authentication, component-architecture, database-layer, deployment, payment-integration, service-integration, state-management, styling-system, testing-strategy
- Quality (7): accessibility-audit, code-review, debugging, performance-audit, project-onboarding, refactoring, security-audit

---

## Stats

| Metric | Value |
|--------|-------|
| Commits | 283 |
| Files changed | 1,448 |
| Insertions | 326,620 |
| Deletions | 652,731 |
| Features | 77 |
| Bug fixes | 76 |
| Refactors | 13 |
| New engines | 1 (Analytics) |
| Rebuilt engines | 2 (Project, Frontend) |
| Total MCP tools | 73 (across 6 engines) |
| Skills at 10/10 | 25 |
| Patch versions | v1.2.5 through v1.2.62 |

---

## Changes Since v1.2.0

- v1.2.5-v1.2.8: Infrastructure -- implicit permissions, WRFC binding, sandbox protection, native tool blocking
- v1.2.9-v1.2.14: Skills overhaul -- protocol skills, all 25 skills to 10/10, skill delivery architecture
- v1.2.15-v1.2.20: DPB workflow, ProjectIndex singleton, skill catalog, context injection improvements
- v1.2.21-v1.2.30: Precision Engine v2 phases -- file_ops, ProjectIndex v3, PrecisionRuntime, hooks, telemetry, precision_agent
- v1.2.31-v1.2.40: Project Engine v2 -- consolidation from analysis-engine, 26 tools with project_* naming
- v1.2.41-v1.2.55: Analytics Engine -- all 7 phases from scratch (DB, daemon, dashboard, TUI, MCP handlers, sync)
- v1.2.56-v1.2.60: Analytics refinement -- dashboard fixes, mini dashboard overhaul, sync engine polish
- v1.2.61-v1.2.62: Frontend Engine v2 -- 3 new tools, rename to frontend_* convention

---

## Upgrade Instructions

```bash
/goodvibes:plugin update
```

Then restart your Claude Code session. Note: frontend engine tool names have changed -- update any custom configurations referencing old tool names.

---

## Breaking Changes

- **Analysis Engine removed**: Replaced by Project Engine v2. All tools now use the `project_*` naming convention. Update any references to analysis-engine tools.
- **Batch Engine removed**: Functionality absorbed into `precision_exec` file_ops (copy, move, delete). Remove any direct batch_engine usage.
- **Frontend engine tools renamed**: All 14 tools renamed from verb-based prefixes (get_*, analyze_*, trace_*, diagnose_*, audit_*) to the `frontend_*` prefix convention. Old names no longer work -- update any custom configurations or scripts.
- **DPB workflow renamed to GPA**: Discover-Plan-Batch is now Gather-Plan-Apply. Documentation, skills, and prompt files have been updated. The workflow itself is also relaxed from a strict 3-call cycle to practical batching.
- **precision_agent blocking mode removed**: precision_agent is now background-only. Remove any usage of blocking mode parameters.
