# GoodVibes Plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)](https://github.com/mgd34msu/goodvibes-plugin)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)](https://claude.com/claude-code)

> Plug in. Receive good vibes.

A Claude Code plugin that replaces native tools with token-efficient precision equivalents, adds 73 MCP tools across 6 engines, and orchestrates 11 specialized agents with persistent cross-session memory.

## At a Glance

| Component | Count | What You Get |
|-----------|-------|--------------|
| Agents | 11 | Specialized roles (Opus/Sonnet) for engineering, review, testing, architecture, deployment, integration, planning |
| Skills | 25 | Tiered knowledge modules: protocol, orchestration, outcome, quality |
| MCP Tools | 73 | Token-efficient tools across 6 specialized engines |
| Hooks | 11 | Lifecycle automation (tool redirection, context injection, error recovery, setup) |
| Output Styles | 2 | Interactive (vibecoding) or fully autonomous (justvibes) |
| Templates | 3 | Production scaffolds |

## Why GoodVibes?

### Token Efficiency

Token consumption in AI coding sessions follows a layered pattern: individual operations add tokens, round trips resend conversation context, sessions accumulate state, and knowledge either persists or gets rediscovered. GoodVibes optimizes all seven layers.

#### Layer 1: Per-Operation Savings

Native tools return maximum output regardless of need. Precision tools let you request exactly the detail level required.

*Note: Token estimates below are for typical small-to-medium files (~50-100 lines). Savings scale linearly with file size (e.g., a 500-line file would be ~5,000 tokens native vs. the same low precision overhead).*

| Operation | Native Tool | Precision Tool | Savings |
|-----------|-------------|----------------|---------|
| Check if a file exists | `Read` returns full content (~500+ tokens) | `precision_read` with `count_only` (~15 tokens) | ~97% |
| Count files matching a pattern | `Glob` returns all paths (~200+ tokens) | `precision_glob` with `count_only` (~15 tokens) | ~92% |
| Check if a pattern exists in code | `Grep` returns all matches with context (~300+ tokens) | `precision_grep` with `count_only` (~15 tokens) | ~95% |
| Re-read an unchanged file | `Read` returns full content again (~500+ tokens) | `precision_read` returns cache hit (~20 tokens) | ~96% |
| Get function signatures from a file | `Read` returns entire file (~500+ tokens) | `precision_read` with `symbols` extract (~50 tokens) | ~90% |

**Mechanisms:**
- **Verbosity levels** (4-6 per tool): `count_only`, `files_only`, `minimal`, `standard`, `verbose`. Tools default to minimal output automatically — `precision_edit` defaults to `minimal`, `precision_grep` to `files_only`, `precision_glob` to `paths_only`. Savings are automatic even without explicit requests.
- **Extract modes** (`precision_read`): `content`, `outline`, `symbols`, `ast`, `lines`. Get function signatures (~50 tokens) instead of full file content (~500+ tokens). 75-95% savings.
- **Token budget pagination**: Large results auto-paginate to stay within a specified token limit. Prevents single responses from consuming disproportionate context.
- **AST pattern matching** (`precision_edit`): More precise than regex, fewer false positives, fewer failed edits requiring retry.

#### Layer 2: Per-Round-Trip Savings

Every API call resends the entire conversation (system prompt + tool definitions + all messages). Fewer calls = less overhead.

- **Batch operations**: Read 10 files, edit 5 files, run 3 commands, fetch 5 URLs — each in a single tool call. Eliminates N-1 round trips.
- **discover tool**: Runs grep + glob + symbol queries simultaneously in one call. Results keyed by query ID. 5 searches in 1 round trip instead of 5.
- **Atomic transactions**: `precision_edit` and `precision_write` in atomic mode. If any operation fails, all roll back. Prevents partial failures that require re-investigation (which costs more round trips).

Quick example:
```
Reading 10 files:
  Native: 10 calls x (full conversation prefix resent each time)
  Precision: 1 call x (conversation prefix sent once)
  = 9 fewer prefix resends
```

#### Layer 3: Per-Session Savings

State tracked within a session avoids redundant work.

- **File state caching**: SHA256 hash-based. Re-reading an unchanged file returns ~20 tokens instead of full content. In edit-verify-edit cycles, this compounds rapidly.
- **Search cache**: Last 20 grep results stored by query ID. Enables incremental refinement without re-running expensive searches.
- **Stack detection caching**: `detect_stack` results cached to `.goodvibes/detected-stack.json`. Re-detection skipped within session.
- **Context injection at session start**: SessionStart hook gathers context types in parallel (stack, git, environment, TODOs, health, folder structure, memory, ports) and injects them upfront. Agents skip discovery.
- **Conditional context sections**: Context builder omits healthy sections entirely. If no health warnings exist, no health section is injected. Saves 200-500 tokens on healthy projects.
- **Subagent context pre-loading**: SubagentStart hook injects project name, git branch, and stack info into every subagent at spawn. No per-agent discovery needed.

#### Layer 4: Cross-Session Savings

Knowledge persists across conversations. Same problem next week? Already documented.

- **Memory system**: `.goodvibes/memory/` stores decisions, patterns, failures, and preferences in structured JSON. Agents read memory before acting. An agent that would spend 5K+ tokens debugging a known issue instead reads a 200-token failure record.
- **PostToolUseFailure logging**: Failed tool attempts are logged with root cause and prevention guidance. Future sessions inherit this knowledge automatically.
- **Learn-and-abandon pattern**: Fix attempts are capped. If the issue is upstream (in a package you can't change), you don't burn tokens trying to fix it again — every future session reads the failure record and skips the investigation entirely.

#### Layer 5: Infrastructure Savings (Dual-Layer Caching)

Precision engine's local file cache and Anthropic's remote prompt cache operate at different layers and compound:

| Layer | What It Does | Impact |
|-------|--------------|--------|
| **Local (MCP)** | Caches file state by content hash | Shrinks token volume added to conversation |
| **Remote (Anthropic)** | Caches conversation prefix | Discounts per-token cost for cached turns |

Without local caching, re-reading a file adds full content to the conversation every time. With local caching, only the first read adds full content; subsequent reads return cache hits (~20 tokens each). This keeps the conversation prefix smaller.

Since Anthropic's prompt cache pricing uses multipliers (cache reads at ~10% of base input price), a smaller prefix means cheaper cache operations on every turn.

```
Re-reading a 500-line file 3 times during a session:
  Native tools:  5,000 + 5,000 + 5,000 = 15,000 tokens added to conversation
  Precision:     5,000 + 20 + 20       = 5,040 tokens added

Over 20 files read multiple times:
  Native:    ~100K+ tokens x cache rates = expensive prefix
  Precision: ~20K tokens x cache rates   = 80% reduction in cache cost
```

**Context window longevity:** Slower conversation growth delays context compaction. Compaction rewrites the conversation prefix, which means the remote cache no longer matches, requiring a new cache write. Precision caching keeps the remote cache hot longer, avoiding repeated cold starts.

#### Layer 6: Prevention Savings

Structured error handling prevents expensive failure cascades.

- **3-phase fix loop**: Systematic escalation (internal -> docs -> community -> internet) with capped attempts instead of random debugging that burns tokens.
- **Blocker classification**: Output style classifies blockers by type (issue/error/other) with specific recovery strategies. Structured response = targeted fix = fewer wasted tokens.
- **Atomic transactions with rollback**: Failed batch operations roll back cleanly. No partial corruption requiring manual investigation.

#### Layer 7: Orchestration Savings

The output style enforces patterns that keep the entire agent tree efficient.

- **Orchestrator stays lean**: "You ARE the orchestrator. Coordination, NOT implementation." The main context — the most expensive one because it persists across the whole session — never bloats with file contents or grep results. All implementation happens in subagent contexts that are discarded after completion.
- **Mandatory precision tools for all agents**: The output style and PreToolUse hook force precision tools across the entire agent tree. One rogue subagent using native `Read` in a loop would burn thousands of tokens. This prevents it.
- **Planned execution**: "Plan all work" instruction means agents execute targeted operations instead of speculative exploration. Pre-meditated work = fewer wasted reads and searches.
- **Parallel agents with background execution**: Up to 6 agents run concurrently in background. Parallel execution plus explicit instructions not to monitor agents via Task Output unless absolutely necessary (and even then to use the non-blocking version), and to wait for a Task Completion notification means fewer wasted tokens and the ability to keep conversing and planning in the main conversation context while work is done in the background.

#### Summary

These seven layers compound: per-operation savings reduce round-trip overhead, which shrinks per-session context growth, which delays compaction, which keeps the remote cache hot, while cross-session memory prevents rediscovering solved problems, and orchestration patterns ensure the entire agent tree operates efficiently. For API users paying per token, this directly reduces cost. For Pro/Max subscribers, it means less of your weekly allocation consumed per session, allowing more work before hitting limits.

### Transparent Tool Upgrade

A PreToolUse hook intercepts Claude's native Read, Edit, Write, Glob, and Grep calls and redirects them to precision equivalents. The hook fires on every tool call — Claude requests `Read`, the hook blocks it and tells Claude to use `precision_read` instead. This happens for all agents including subagents.

This means the efficiency gains are automatic — Claude uses precision tools without configuration.

### 11 Specialized Agents

Domain-specific agents (engineer, reviewer, tester, architect, deployer, 3 integrators, planner, 2 factories) each bring focused expertise. Opus-powered agents handle complex work; Sonnet-powered agents handle high-volume tasks.

### Persistent Memory

A two-tier memory system stores decisions, patterns, failures, and preferences in `.goodvibes/memory/`. Agents read these files before acting. The PostToolUseFailure hook automatically logs failures after exhausting its 3-phase fix loop. Same bug next session? Already documented.

### Quality Loops

WRFC (Write-Review-Fix-Check) loops enforce a mandatory review cycle on every unit of work. No code reaches a commit without passing review.

**The loop:**

```
1. WORK   ->  Spawn agent to implement the task (background)
2. REVIEW ->  Spawn reviewer to check the work (background)
3. Evaluate:
   |  PASS -> Proceed to step 5
   |  FAIL -> Enter Fix-Check cycle:
   |         FIX   ->  Spawn agent to address all issues (background)
   |         CHECK ->  Spawn reviewer to re-check (background)
   |         Repeat until PASS (or max attempts reached)
4. COMMIT ->  Git commit the verified work
5. LOG    ->  Update .goodvibes/ memory and logs
6. REPORT ->  Report complete, loop for next task
```

**Key properties:**

- **Per-task, not per-batch.** Each unit of work gets its own WRFC cycle. A phase with 4 tasks runs 4 independent loops.
- **All agents run in background.** The orchestrator coordinates; it never implements. Up to 6 agents run concurrently.
- **No issue is too minor.** Reviewers flag everything — major, minor, nitpick. All must be addressed before the loop passes.
- **Fix-Check is iterative.** If the fix introduces new issues, the reviewer catches them. The loop continues until the reviewer returns zero issues.
- **Failures are logged.** If max fix attempts are exhausted, the failure is recorded in `.goodvibes/memory/failures.json` with root cause and prevention guidance.
- **Commit gates on review.** Code is only committed after the reviewer confirms zero issues. No exceptions.

The orchestrator maintains WRFC loops across concurrent tasks — when one task's reviewer returns PASS, the orchestrator commits that work and checks for newly unblocked tasks, keeping agent utilization high.

### Two Execution Modes

vibecoding (interactive: shows progress, explains decisions, asks on ambiguity) and justvibes (autonomous: silent execution, auto-chains tasks, logs everything).

## Installation

```bash
claude plugin marketplace add mgd34msu/goodvibes-plugin
claude plugin install goodvibes@goodvibes-market
```

After installation, run the Setup hook to pre-write CLAUDE.md chain files:
```bash
claude --init-only
```

This ensures all GoodVibes instruction files are in place before your first session. On each session start, the SessionStart hook:
- Detects your project stack (frameworks, languages, tools)
- Analyzes git status (branch, uncommitted changes)
- Checks project health (missing dependencies, build issues)
- Verifies CLAUDE.md chain files (writes any that are missing)
- Injects project context into Claude's system message

Set your output style:
```bash
/output-style goodvibes:vibecoding   # Interactive mode
/output-style goodvibes:justvibes    # Autonomous mode
```

## Precision Engine — 12 Tools

The core of GoodVibes. Replaces Claude Code's native tools with token-efficient alternatives that support batching, extract modes, caching, and atomic transactions.

| Tool | Replaces | Description |
|------|----------|-------------|
| `precision_read` | Read | Batch reads, extract modes (content/outline/symbols/ast/lines), image/PDF/notebook support, token budgets with pagination, file state caching |
| `precision_write` | Write | Batch writes, fail_if_exists/overwrite/backup modes, atomic transactions with rollback, auto directory creation |
| `precision_edit` | Edit | Batch edits, match modes (exact/fuzzy/regex/ast_pattern), occurrence selection, context hints, atomic transactions with rollback |
| `precision_grep` | Grep | Batch queries, output modes (count_only/files_only/locations/matches/context), block/function/class context expansion |
| `precision_glob` | Glob | Presets (typescript/javascript/styles/config/tests), size/date/content filters, output modes (count_only/paths_only/with_stats/with_preview) |
| `precision_exec` | Bash | Batch commands, expectation checking (exit/stdout/stderr), retry engine, safe mode (blocks rm -rf, dd), background process management |
| `precision_fetch` | WebFetch | Full HTTP client: 7 methods, service registry with auto-auth, 12 extraction modes, body encoding (json/form/multipart), 15-min TTL cache |
| `precision_notebook` | NotebookEdit | Batch operations, cell targeting by cell_id, output clearing, auto cell_id generation |
| `precision_agent` | (unique) | Spawn headless Claude sessions with dossier-based context injection, multi-provider support, background-only execution |
| `discover` | (unique) | Parallel multi-query: run grep + glob + symbol + structural (AST pattern) queries simultaneously, results keyed by query ID |
| `precision_symbols` | (unique) | Workspace-wide symbol search, kind filtering (10 kinds), export/private filtering, JSDoc extraction, multi-language support |
| `precision_config` | (unique) | Runtime configuration: sandbox mode, cache tuning, session state KV store, telemetry queries, hook management |

Key capabilities:
- **Batch operations**: read 10 files, edit 5 files, run 3 commands, fetch 5 URLs — each in a single tool call
- **Atomic transactions**: if any operation in a batch fails, all changes roll back (rollback ID provided for manual undo)
- **AST-Grep matching**: structural code patterns with captures across 18 languages
- **Multi-format reading**: images (returned as visual blocks), PDFs (per-page), Jupyter notebooks (structured cell output)

> Full details: [precision-engine.md](precision-engine.md)

## Project Engine — 26 Tools

Project-wide intelligence layer. Consolidates code analysis, API tooling, database tools, security scanning, runtime profiling, and scaffolding in a single MCP server with a consistent `project_*` naming convention.

| Tool | Description |
|------|-------------|
| `project_code_dead` | Find unused/dead exports using the TypeScript Language Service |
| `project_code_safe_delete` | Check if a symbol at file:line:column can be safely deleted |
| `project_code_preview_edits` | Validate proposed edits against TypeScript compiler in a virtual filesystem — no disk writes |
| `project_code_breaking` | Detect breaking API changes between two git refs using LLM analysis |
| `project_code_semantic_diff` | Summarize semantic meaning of code changes between git refs |
| `project_code_surface` | Extract the public and internal API surface of a project |
| `project_api_routes` | Discover all HTTP routes (Next.js, Express, Fastify, Hono) |
| `project_api_spec` | Generate OpenAPI 3.0.3 spec from discovered routes |
| `project_api_validate` | Validate a live API against an OpenAPI spec with real HTTP requests |
| `project_api_sync` | Detect type drift between backend route handlers and frontend fetch calls |
| `project_db_schema` | Extract schema from Prisma, Drizzle, or raw SQL migration files |
| `project_db_query` | Execute SQL queries against PostgreSQL, MySQL, or SQLite |
| `project_db_prisma` | Analyze Prisma client usage — operations, model stats, N+1 detection |
| `project_deps_analyze` | Analyze package dependencies: usage, outdated status, unused packages |
| `project_deps_circular` | Find circular import dependencies using depth-first search |
| `project_deps_upgrade` | Analyze and apply package upgrades with changelog and breaking change detection |
| `project_runtime_memory` | Profile memory usage of a running process with leak detection via linear regression |
| `project_runtime_profile` | Benchmark a specific function with statistical timing analysis |
| `project_runtime_logs` | Parse and analyze log files or command output with anomaly detection |
| `project_security_secrets` | Scan files for hardcoded secrets using 40+ patterns (AWS, Stripe, GitHub, etc.) |
| `project_security_permissions` | Detect sensitive API usage — filesystem, network, process, and crypto operations |
| `project_security_env` | Audit environment variable usage — missing, unused, undocumented, type mismatches |
| `scaffold` | Generate a new project from a template with variable substitution |
| `bundle_analyze` | Analyze build output for bundle size, large modules, duplicates, and optimizations |
| `project_test_coverage` | Parse test coverage reports (LCOV, Istanbul/c8) and return coverage metrics |
| `project_test_find` | Find test files that test a given source file, with confidence scoring |

Key capabilities:
- **TypeScript Language Service**: compiler-grade analysis for dead code, safe deletion, and virtual edit validation
- **Multi-ORM database support**: Prisma, Drizzle, raw SQL schema parsing; PostgreSQL, MySQL, SQLite query execution
- **LLM-powered analysis**: breaking change detection and semantic diff with configurable model (haiku/sonnet/opus)
- **Security scanning**: 40+ secret patterns, 330+ permission patterns, env var auditing

> Full details: [project-engine.md](project-engine.md)

## Frontend Engine — 14 Tools

Static analysis tools for React/TypeScript frontends. All analysis is AST-based — no runtime, no DOM, no browser required.

| Tool | Description |
|------|-------------|
| `frontend_component_tree` | Parse JSX/TSX and build a component hierarchy tree with props and parent-child relationships |
| `frontend_component_state` | Trace React state and props through component trees; detect prop drilling and anti-patterns |
| `frontend_render_triggers` | Identify what causes re-renders: state, props, inline definitions, context subscriptions |
| `frontend_layout_hierarchy` | Build a layout tree showing display types, sizing constraints, flex/grid properties, and overflow |
| `frontend_sizing_strategy` | Analyze how a specific element's dimensions are computed, walking the ancestor constraint chain |
| `frontend_overflow` | Diagnose CSS overflow issues and generate fix recommendations with trade-off explanations |
| `frontend_stacking_context` | Analyze z-index and stacking contexts; detect conflicts and portal destinations |
| `frontend_responsive_breakpoints` | Audit Tailwind responsive classes across breakpoints; detect missing base styles and gaps |
| `frontend_tailwind_conflicts` | Detect conflicting, redundant, and contradictory Tailwind classes |
| `frontend_accessibility_tree` | Build an ARIA accessibility tree with WCAG 2.1 AA compliance checking |
| `frontend_event_flow` | Analyze event propagation; detect nested clickable conflicts and missing keyboard alternatives |
| `frontend_client_boundary` | Analyze Next.js App Router `"use client"`/`"use server"` boundaries and optimization opportunities |
| `frontend_error_boundaries` | Audit React/Next.js error boundary coverage; detect missing `error.tsx` and coverage gaps |
| `frontend_hook_dependencies` | Audit React hook dependency arrays for stale closures, missing/unnecessary/unstable dependencies |

Key capabilities:
- **AST-based analysis**: all tools use the TypeScript compiler API — no runtime required
- **Tailwind-aware**: resolves breakpoints from `tailwind.config.js`, classifies utilities by CSS property group
- **Next.js App Router support**: client/server boundary analysis, route segment error boundary coverage
- **WCAG 2.1 AA**: checks roles, focus order, keyboard interactions, and ARIA composite patterns

> Full details: [frontend-engine.md](frontend-engine.md)

## Analytics Engine — 7 Tools

Session intelligence daemon. Tracks token usage, API costs, tool call metrics, agent lifecycle, file hotspots, and anomalies. Renders into tmux panes via a mini (4-line) or full (4-page interactive) TUI dashboard.

| Tool | Description |
|------|-------------|
| `analytics_dashboard` | Launch, stop, or check status of TUI dashboard panes in tmux |
| `analytics_query` | Ad-hoc queries against live session data: tokens, cache, commands, agents, files, cost, health |
| `analytics_budget` | Set, check, or clear a session spending/token budget with configurable warn thresholds |
| `analytics_tag` | Add, remove, or list session tags; auto-suggest tags from JSONL content analysis |
| `analytics_export` | Export session data in JSON, CSV, or markdown; supports current, historical, and cross-project scopes |
| `analytics_config` | View, update, or hot-reload analytics engine configuration |
| `analytics_sync` | Sync Claude JSONL session files into the global SQLite database |

Key capabilities:
- **Cost tracking**: per-model pricing map computed from Claude JSONL session files
- **Anomaly detection**: 6 rule types including cache degradation, error spikes, and token burn
- **Cross-session history**: global SQLite DB (`~/.claude/.goodvibes/analytics/analytics.db`) with tag filtering
- **TUI dashboards**: spawns standalone tmux pane processes (mini: 4-line statusline; full: 4-page interactive Ink/React app)

> Full details: [analytics-engine.md](analytics-engine.md)

## Registry Engine — 7 Tools

Discovery and search layer for skills, agents, and tools. Uses Fuse.js fuzzy search indexed over YAML registry files. Supports deferred loading — tools are registered only when activated via `ToolSearch`.

| Tool | Description |
|------|-------------|
| `search_skills` | Keyword/semantic search over the 25-skill registry |
| `search_agents` | Search the 11-agent registry by expertise area |
| `search_tools` | Search the 73-tool registry by functionality |
| `recommend_skills` | Analyze a task description and recommend relevant skills with context classification |
| `get_skill_content` | Load a skill's full content into context for immediate use |
| `get_agent_content` | Load an agent definition into context |
| `skill_dependencies` | Resolve a skill's dependency chain (all transitively required skills) |

Key capabilities:
- **Fuzzy search**: Fuse.js with weighted fields (description 0.4, name 0.3, keywords 0.3) and relevance scoring
- **Lazy loading**: server starts instantly; registry indexes are loaded on first use (single-flight pattern)
- **Deferred tools**: all 7 tools use `defer_loading: true` — loaded on-demand via `ToolSearch` to minimize startup cost
- **Three registries**: skills (25), agents (11), tools (73) — each indexed independently with Fuse.js

> Full details: [registry-engine.md](registry-engine.md)

## Runtime Engine — 7 Tools

Event-driven orchestration engine providing persistent state, workflow state machines, and hook IPC. Runs as a long-lived MCP server with Unix domain socket communication for sub-5ms hook latency. Feature-flagged 6-phase migration.

| Tool | Description |
|------|-------------|
| `runtime_status` | Engine health, uptime, component status, and resource usage |
| `runtime_config` | View, update, or hot-reload runtime engine configuration |
| `runtime_events` | Query event history, get stats, or inspect the dead-letter queue |
| `runtime_emit` | Emit custom events into the event bus with optional priority and metadata |
| `runtime_workflow` | Create, advance, query, or cancel workflow state machine instances |
| `runtime_triggers` | Register, list, enable/disable declarative event-driven triggers |
| `runtime_agents` | Spawn, track, cancel agents with budget enforcement and WRFC chain coordination |

Key capabilities:
- **EventBus**: Pub/sub with glob-pattern matching, O(1) circular buffer history, 59+ typed events across 13 namespaces
- **EventQueue**: Priority queue (CRITICAL/HIGH/NORMAL/LOW), 3-attempt retry with exponential backoff, dead-letter queue
- **EventLog**: JSONL append-only persistence with atomic compaction and crash recovery via replay
- **Workflow Engine**: Formal state machines — WRFC loop (8 states), fix loop (6 states), custom workflows with safe expression evaluation
- **Trigger System**: Declarative "when X do Y" automation with event, composite, threshold, and sequence conditions
- **IPC Channel**: Unix domain socket for hook-to-runtime communication with file-based fallback
- **Agent Coordinator**: Workflow-aware agent management with budget tracking at 50%/80%/95% thresholds

> Full details: [runtime-engine.md](runtime-engine.md)

## Agents

11 specialized agents with distinct expertise. The orchestrator spawns them for focused tasks — each consults memory, applies relevant skills, and returns results.

| Agent | Model | Specialization |
|-------|-------|----------------|
| engineer | Opus | Full-stack: APIs, databases, auth, components, routing, styling |
| reviewer | Opus | Code quality, security, type safety, WRFC loop execution |
| tester | Sonnet | Test generation, coverage analysis, fixture creation, 100% coverage goal |
| architect | Opus | System design, architecture decisions, dependency mapping |
| deployer | Sonnet | CI/CD, Docker, cloud deployment (Vercel, AWS, Railway, Fly.io) |
| integrator-ai | Opus | AI/LLM integrations (OpenAI, Anthropic, Vercel AI SDK, RAG, embeddings) |
| integrator-services | Sonnet | Payments (Stripe), email (Resend), CMS (Sanity, Contentful), uploads (S3, Cloudinary) |
| integrator-state | Sonnet | State management (Zustand, Redux, Jotai, TanStack Query), forms, real-time |
| planner | Opus | Task breakdown, batch planning, workflow orchestration |
| agent-factory | Opus | Create new specialized agents |
| skill-factory | Opus | Create new skills and slash commands |

## Skills - 25 Total

Organized into 4 tiers with progressive loading — protocol skills are always active, others load when relevant to the task.

| Tier | Count | Skills | Loading |
|------|-------|--------|---------|
| **Protocol** | 5 | precision-mastery, gather-plan-apply, review-scoring, goodvibes-memory, error-recovery | Always active |
| **Orchestration** | 2 | task-orchestration, fullstack-feature | On multi-agent tasks |
| **Outcome** | 11 | ai-integration, api-design, authentication, component-architecture, database-layer, deployment, payment-integration, service-integration, state-management, styling-system, testing-strategy | When task matches domain |
| **Quality** | 7 | accessibility-audit, code-review, debugging, performance-audit, project-onboarding, refactoring, security-audit | On review/audit tasks |

**Protocol skills** are embedded in every agent's context via the subagent protocol chain — they're too critical for token efficiency and execution patterns to depend on lazy loading.

**Outcome and quality skills** load proactively when Claude detects a matching task. Each skill includes a `## Resources` tree pointing to scripts and reference materials the agent can navigate as needed.

**Fallback**: If a skill doesn't load automatically, the registry engine's `get_skill_content` tool serves as an escape hatch.

## Hooks - 11 Types

Lifecycle hooks run transparently on every session. They're the mechanism behind tool redirection, context injection, and automatic error recovery.

| Hook | Trigger | What It Does |
|------|---------|-------------|
| Setup | `claude --init` / `claude --init-only` | Pre-writes CLAUDE.md chain files (import directives + prompt files) so they exist before any session starts. Matches `init` trigger. Avoids race conditions where SessionStart isn't fast enough to write files before Claude reads them |
| PreToolUse (Bash) | Before Bash execution | Platform path mapping (Windows/Linux), shell safety analysis, git commit quality gates |
| PreToolUse (Native) | Before Read/Edit/Write/Glob/Grep | Blocks native tool, redirects to precision-engine equivalent |
| PostToolUseFailure | After Bash failure | 3-phase progressive fix loop: Phase 1 (internal knowledge) -> Phase 2 (official docs hints) -> Phase 3 (community docs hints). Logs failures to `.goodvibes/memory/failures.json` after all phases exhausted |
| SessionStart | Session begins | Detects project stack, analyzes git status, checks project health, creates/updates CLAUDE.md, injects context into system message, builds project file index |
| SessionEnd | Session ends | Persists session state |
| SubagentStart | Agent spawns | Injects context for GoodVibes agents (stack info, git branch, project name), tracks agent telemetry |
| SubagentStop | Agent completes | Cleans up agent tracking, updates analytics |
| PreCompact | Before context compaction | Creates checkpoint commit if uncommitted changes exist, generates session summary |
| Stop | Stop button pressed | Saves current state |
| UserPromptSubmit | User sends message | Processes user input |

## Output Styles

Two execution modes for different workflows. Set via `/output-style goodvibes:vibecoding` or `/output-style goodvibes:justvibes`.

| Setting | vibecoding | justvibes |
|---------|-----------|------------|
| Description | Autonomous coding with communication | Fully autonomous silent execution |
| show_progress | true | false |
| explain_decisions | true | false |
| ask_on_ambiguity | true | false |
| auto_chain | false | true |
| max_autonomous_batches | 1 | unlimited |
| checkpoint_frequency | per_batch | per_phase |
| parallel_agents | 6 | 6 |
| recovery (issues/errors) | ask_user_with_options | fix_review_loop |
| recovery (other) | ask_user | choose_best_option_silent |
| max_fix_attempts | 3 | 3 |
| fix_attempt strategy | one_shot (all sources at once) | cumulative (staged escalation) |
| default output mode | standard | minimal |
| show_diffs | true | false |
| show_telemetry | summary | none |
| log_activity | false | true |

## Memory System

Two-tier persistent memory. Session logs track the current session. Cross-session memory persists across conversations.

### Session Logs (`.goodvibes/logs/`)

- `decisions.md` — Architectural choices with options considered, rationale, implications
- `errors.md` — Failures categorized by type (TOOL_FAILURE, BUILD_ERROR, TEST_FAILURE, etc.) with root cause and resolution
- `activity.md` — Completed work that passed review (primarily used in justvibes mode)

### Cross-Session Memory (`.goodvibes/memory/`)

- `decisions.json` — Decision records with category, scope, confidence (max 1000 entries, auto-prunes oldest)
- `patterns.json` — Proven approaches with example files and keywords (max 500)
- `failures.json` — Failed approaches with root cause and prevention guidance (max 500)
- `preferences.json` — User conventions (code style, naming, patterns)

Agents read memory before acting. The PostToolUseFailure hook automatically records failures after its 3-phase fix loop is exhausted.

## Telemetry

Built-in telemetry tracks tool usage, session activity, and performance metrics in a local SQLite database (sql.js WASM). Query via `precision_config action=telemetry` with filters for tool, status, session_id, and date range. All data stays local — nothing is sent externally.

## Configuration

GoodVibes works out of the box. Minimal configuration needed.

### Path Sandboxing

Controls whether precision tools can access files outside the project root. Disabled by default.

```bash
/goodvibes:sandbox true    # Enable (restrict to project root)
/goodvibes:sandbox false   # Disable (allow external paths, default)
```

### Service Registry

Named API services with stored credentials for precision_fetch auto-auth:

```bash
/goodvibes:services add OpenAI    # Configure a new API service
/goodvibes:services list           # Show registered services
/goodvibes:services test OpenAI    # Test service connectivity
```

### Output Style

Switch execution modes:

```bash
/output-style goodvibes:vibecoding
/output-style goodvibes:justvibes
```

## Slash Commands

| Command | Purpose |
|---------|---------|
| `/goodvibes:sandbox` | Toggle path sandboxing (true/false) |
| `/goodvibes:plugin` | Plugin management (update, status, config) |
| `/goodvibes:search` | Search skills, agents, or tools |
| `/goodvibes:services` | Manage precision_fetch service registry (add, remove, test, auth) |
| `/goodvibes:load-skill` | Load a skill's content into context |
| `/goodvibes:codebase-review` | Full codebase audit with parallel agent remediation |

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <b>Plug in, receive good vibes</b>
  <br><br>
  <code>claude plugin marketplace add mgd34msu/goodvibes-plugin</code>
  <br>
  <code>claude plugin install goodvibes@goodvibes-market</code>
</p>
