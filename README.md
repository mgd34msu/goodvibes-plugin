# GoodVibes Plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.2.30-blue.svg)](https://github.com/mgd34msu/goodvibes-plugin)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)](https://claude.com/claude-code)

> Plug in. Receive good vibes.

A Claude Code plugin that replaces native tools with token-efficient precision equivalents, adds 70 MCP tools across 5 engines, and orchestrates 11 specialized agents with persistent cross-session memory.

## At a Glance

| Component | Count | What You Get |
|-----------|-------|--------------|
| Agents | 11 | Specialized roles (Opus/Sonnet) for engineering, review, testing, architecture, deployment, integration, planning |
| Skills | 25 | Tiered knowledge modules: protocol, orchestration, outcome, quality |
| MCP Tools | 70 | Token-efficient tools across 5 specialized engines |
| Hooks | 10 | Lifecycle automation (tool redirection, context injection, error recovery) |
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

On first session, the SessionStart hook:
- Detects your project stack (frameworks, languages, tools)
- Analyzes git status (branch, uncommitted changes)
- Checks project health (missing dependencies, build issues)
- Creates or updates CLAUDE.md with GoodVibes instructions
- Injects project context into Claude's system message

Set your output style:
```bash
/output-style goodvibes:vibecoding   # Interactive mode
/output-style goodvibes:justvibes    # Autonomous mode
```

## Precision Engine - 12 Tools

The core of GoodVibes. 12 tools that replace Claude Code's native tools with enhanced, token-efficient alternatives.

### Tool Overview

| Tool | Replaces | Key Enhancements |
|------|----------|------------------|
| precision_read | Read | Batch reads, extract modes (content/outline/symbols/ast/lines), image viewing (PNG/JPG/GIF/WebP/BMP/ICO/TIFF/AVIF/SVG as visual blocks with magic byte validation), PDF text extraction with page ranges, Jupyter notebook cells, token budgets with pagination, file state caching |
| precision_write | Write | Batch writes, fail_if_exists/overwrite/backup modes, atomic transactions with rollback, dry run, auto directory creation, base64 content support |
| precision_edit | Edit | Batch edits, match modes (exact/fuzzy/regex/ast_pattern with AST-Grep captures), occurrence selection (first/last/Nth/all), context hints (near_line/in_function/in_class/after/before), atomic transactions with rollback, dry run, whitespace/case sensitivity toggles |
| precision_grep | Grep | Batch queries with parallel execution, output modes (count_only/files_only/locations/matches/context), context expansion (line/block/function/class), negation search, find-replace preview with backreference support, relevance ranking, cross-file relationship tracing, whole word matching |
| precision_glob | Glob | Presets (typescript/javascript/styles/config/tests), size/date/content filters, output modes (count_only/paths_only/with_stats/with_preview), backend selection (fast-glob/ripgrep), symlink following |
| precision_exec | Bash | Batch commands with parallel execution, expectation checking (exit code/stdout/stderr), retry engine (configurable backoff for transient failures), pattern-based termination, safe mode (blocks rm -rf, dd, etc.), background process lifecycle management |
| precision_fetch | WebFetch | Full HTTP client: 7 methods (GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS), service registry with auto-auth, per-request auth (none/bearer/basic/api-key/custom-headers), 12 extraction modes (raw/text/json/markdown/structured/summary/code_blocks/tables/links/metadata/readable/pdf), body encoding (json/form/multipart/raw), query params, CSS selectors, response headers/cookies/redirect chains/timing, 15-min TTL cache |
| precision_notebook | NotebookEdit | Batch operations with auto-index adjustment, cell targeting by cell_id (with metadata.id fallback), output clearing per cell, auto cell_id generation for nbformat 4.5+ |
| precision_agent | (unique) | Spawn headless Claude sessions with dossier-based context injection. Background-only execution, multi-provider support (Claude, Gemini, Codex), project context auto-injection, scope/acceptance criteria definition, model override per call |
| discover | (unique) | Parallel multi-query: run grep + glob + symbol + structural (AST pattern) queries simultaneously, results keyed by query ID |
| precision_symbols | (unique) | Workspace-wide or per-file symbol search, kind filtering (10 kinds), export/private filtering, signature extraction with JSDoc/docstrings, grouping by file/kind, multi-language (TypeScript, JavaScript, Python, Rust, Go) |
| precision_config | (unique) | Runtime configuration for precision engine (get/set/reload), sandbox mode, cache tuning, execution defaults, session state KV store, telemetry queries, hook management |

### Batch Operations

Read 10 files, edit 5 files, run 3 commands, fetch 5 URLs — each in a single tool call. Reduces round trips and context overhead.

### Atomic Transactions

precision_edit and precision_write support transaction modes (atomic/partial/none). In atomic mode, if any operation fails, all changes roll back. Every edit generates a rollback ID for manual undo.

### Advanced Matching

precision_edit supports 4 match modes:
- **exact**: literal string match (default)
- **fuzzy**: whitespace-insensitive matching
- **regex**: full regex with capture group support ($1-$9, $$, $&, $`, $')
- **ast_pattern**: AST-Grep structural patterns with captures ($VAR for single nodes, $$$VAR for sequences) across 18 languages (JavaScript, TypeScript, Python, Rust, Go, C, C++, Java, Kotlin, Swift, Ruby, PHP, C#, Scala, Bash, HTML, CSS, Lua)

### Multi-Format Reading

precision_read handles more than text:
- **Images** (.png, .jpg, .gif, .webp, .svg): returned as MCP ImageContent blocks — Claude sees them visually
- **PDFs**: per-page text extraction via pdf-parse, `pages` parameter for ranges (e.g., "1-5"), max 20 pages per request
- **Jupyter notebooks** (.ipynb): parsed as JSON, formatted with cell types (code/markdown) and outputs
- **SVG files** get both text content and visual image representation

### Safety

precision_exec includes a safe mode that blocks destructive commands matching patterns like `rm -rf /`, `rmdir /`, `dd if=/dev/`. Expectation checking verifies exit codes and output content after execution.

### Context Expansion

precision_grep can expand matches beyond the matched line to enclosing block, function, or class scope using Tree-Sitter AST analysis.

### HTTP Client & Authentication

precision_fetch operates as a full HTTP client, not just a page fetcher:
- **Service registry**: Named API services with stored base URLs and credentials. Auto-auth resolves service name to authenticated requests without passing credentials each time
- **Per-request auth**: 5 auth types (none, bearer, basic, api-key, custom-headers) configurable per URL
- **Body encoding**: 4 body types (json, form, multipart, raw) with automatic content-type headers
- **Query parameters**: Key-value params auto-appended to URLs
- **Response inspection**: Response headers, cookies (with domain/path/expiry), redirect chains, and request timing (DNS/connect/TTFB/total)
- **401 retry**: Automatic token refresh and retry on authentication failures

## Analysis Engine - 20 Tools

| Category | Tools |
|----------|-------|
| Detection | detect_stack, check_versions, scan_patterns, read_config, get_conventions |
| Code Quality | find_dead_code, get_api_surface, safe_delete_check, find_circular_deps |
| Validation | detect_breaking_changes, semantic_diff, validate_implementation, validate_edits_preview, validate_api_contract |
| Security | env_audit, scan_for_secrets, check_permissions |
| Debugging | parse_error_stack, explain_type_error |

Key capabilities:
- **TypeScript Language Service** for precise reference tracking, dead code detection, and breaking change analysis
- **40+ secret patterns** covering AWS, Azure, Google, GitHub, Stripe, Slack, private keys, and database connection strings
- **LLM-powered analysis** for convention detection, breaking change assessment, and type error explanation
- **Virtual snapshot validation** — preview edit impact without modifying files

## Project Engine - 20 Tools

| Category | Tools |
|----------|-------|
| Scaffolding | scaffold_project, list_templates |
| Status | plugin_status, project_issues |
| API | generate_openapi, get_api_routes |
| Database | get_database_schema, get_prisma_operations, query_database |
| Maintenance | upgrade_package, analyze_bundle, analyze_dependencies, find_circular_deps |
| Testing | find_tests_for_file, get_test_coverage, suggest_test_cases, generate_fixture |
| Types | generate_types, sync_api_types |
| Git | create_pull_request, resolve_merge_conflict |

Key capabilities:
- **Multi-ORM schema parsing**: Prisma, Drizzle, TypeORM, and raw SQL
- **Multi-database query execution**: PostgreSQL, MySQL, SQLite with safety guards (readonly mode, auto-LIMIT, EXPLAIN plans)
- **Route extraction**: Next.js, Express, Fastify, Hono
- **Coverage report parsing**: lcov and istanbul formats
- **Bundle analysis**: size analysis, duplicate detection, tree-shaking impact, optimization suggestions
- **OpenAPI 3.0.3 generation** from discovered API routes


## Frontend Engine - 11 Tools

| Tool | Purpose |
|------|---------|
| get_react_component_tree | Extract component hierarchy with props and parent-child relationships |
| analyze_stacking_context | Debug z-index issues and stacking context creation |
| analyze_responsive_breakpoints | Audit Tailwind responsive classes across breakpoints |
| trace_component_state | Trace state and props through component trees, detect prop drilling |
| analyze_render_triggers | Find unnecessary re-renders, missing memoization, unstable references |
| analyze_layout_hierarchy | Debug CSS layout with sizing constraints and Tailwind class parsing |
| diagnose_overflow | Find overflow causes with constraint chain analysis |
| get_accessibility_tree | Generate accessibility tree with WCAG 2.1 AA compliance checking |
| get_sizing_strategy | Analyze how element size is determined (fixed, flex, grid, content) |
| analyze_event_flow | Trace event propagation, detect nested clickable conflicts |
| analyze_tailwind_conflicts | Find conflicting and redundant Tailwind classes |

## Registry Engine - 7 Tools

| Tool | Purpose |
|------|---------|
| search_skills | Search skills by query and category |
| search_agents | Search agents by capability |
| search_tools | Search MCP tools |
| recommend_skills | Context-aware skill recommendations |
| get_skill_content | Load skill content into context |
| get_agent_content | Load agent definition |
| skill_dependencies | Resolve skill dependency chain |

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

## Hooks - 10 Types

Lifecycle hooks run transparently on every session. They're the mechanism behind tool redirection, context injection, and automatic error recovery.

| Hook | Trigger | What It Does |
|------|---------|-------------|
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
