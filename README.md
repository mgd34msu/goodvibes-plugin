# GoodVibes Plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](https://github.com/mgd34msu/goodvibes-plugin)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)](https://claude.com/claude-code)

> Plug in. Receive good vibes.

A Claude Code plugin that replaces native tools with token-efficient precision equivalents, adds 75 MCP tools across 6 engines, and orchestrates 11 specialized agents with persistent cross-session memory.

## At a Glance

| Component | Count | What You Get |
|-----------|-------|-------------|
| Agents | 11 | Specialized roles (Opus/Sonnet) for engineering, review, testing, architecture, deployment, integration, planning |
| Skills | 173 | Technology-specific knowledge modules covering modern web stacks |
| MCP Tools | 75 | Token-efficient tools across 6 specialized engines |
| Hooks | 10 | Lifecycle automation (tool redirection, context injection, error recovery) |
| Output Styles | 2 | Interactive (vibecoding) or fully autonomous (justvibes) |
| Templates | 3 | Production scaffolds for Next.js and React |

## Why GoodVibes?

### Token Efficiency

Native Claude Code tools are all-or-nothing. `Read` returns the entire file. `Grep` returns every match with full context. There's no way to say "just give me the count" or "just give me the file paths." Every operation consumes the maximum amount of tokens whether you need that information or not.

Precision tools fix this. Every tool lets the AI request exactly the amount of information needed to fulfill a task:

- **Need a file count?** `precision_glob` with `count_only` returns just the number — not hundreds of file paths
- **Need file paths?** `paths_only` returns paths without file contents or metadata
- **Need a function signature?** `precision_read` with `symbols` extract mode returns signatures without reading the entire file
- **Need specific lines?** Read a range instead of the whole document
- **Need to check if a pattern exists?** `precision_grep` with `count_only` tells you how many matches without returning any content

#### Savings at a Glance

| Operation | Native Tool | Precision Tool | Savings |
|-----------|-------------|----------------|---------------|
| Check if a file exists | `Read` returns full content (~500+ tokens) | `precision_read` with `count_only` (~15 tokens) | ~97% |
| Count files matching a pattern | `Glob` returns all paths (~200+ tokens) | `precision_glob` with `count_only` (~15 tokens) | ~92% |
| Check if a pattern exists in code | `Grep` returns all matches with context (~300+ tokens) | `precision_grep` with `count_only` (~15 tokens) | ~95% |
| Re-read an unchanged file | `Read` returns full content again (~500+ tokens) | `precision_read` returns cache hit (~20 tokens) | ~96% |
| Read 10 files | 10 separate `Read` calls (~5000+ tokens + 10 round trips) | 1 `precision_read` call (~5000 tokens + 1 round trip) | 9 fewer round trips |
| Search 5 patterns | 5 separate `Grep` calls (~1500+ tokens + 5 round trips) | 1 `precision_grep` call (~1500 tokens + 1 round trip) | 4 fewer round trips |
| Get function signatures from a file | `Read` returns entire file (~500+ tokens) | `precision_read` with `symbols` extract (~50 tokens) | ~90% |

#### How It Adds Up

In a typical coding session, an agent reads files 50+ times, searches code 20+ times, and runs commands 10+ times. With native tools, every operation returns maximum output regardless of what's actually needed. With precision tools:

- **Verbosity control** (4-6 levels per tool) means you only pay for the detail level you need. A `count_only` response averages ~15 tokens vs ~500+ for full output.
- **Batch operations** collapse N tool calls into 1. Each round trip costs latency plus request/response overhead. Reading 10 files in 1 call instead of 10 eliminates 9 round trips.
- **File state caching** tracks content hashes. Re-reading an unchanged file returns a cache hit (~20 tokens) instead of the full content again. In edit-verify-edit cycles where the same files are read repeatedly, this compounds rapidly.
- **Token budgets** automatically paginate large results to fit within a specified limit, preventing single responses from consuming disproportionate context.

For API users paying per token, this directly reduces cost. For Pro/Max subscribers, it means less of your weekly allocation consumed per session, allowing more work before hitting limits.

The best part: you get these savings without changing how you work.

### Transparent Tool Upgrade

A PreToolUse hook intercepts Claude's native Read, Edit, Write, Glob, and Grep calls and redirects them to precision equivalents. The hook fires on every tool call — Claude requests `Read`, the hook blocks it and tells Claude to use `precision_read` instead. This happens for all agents including subagents.

This means the efficiency gains are automatic — Claude uses precision tools automatically. No configuration needed.

### 11 Specialized Agents

Domain-specific agents (engineer, reviewer, tester, architect, deployer, 3 integrators, planner, 2 factories) each bring focused expertise. Opus-powered agents handle complex work; Sonnet-powered agents handle high-volume tasks.

### Persistent Memory

A two-tier memory system stores decisions, patterns, failures, and preferences in `.goodvibes/memory/`. Agents read these files before acting. The PostToolUseFailure hook automatically logs failures after exhausting its 3-phase fix loop. Same bug next session? Already documented.

### Quality Loops

WRFC (Write-Review-Fix-Check) loops ensure code is reviewed before commit. The orchestrator spawns a reviewer after implementation, fixes issues, and re-reviews until verified, then creates a commit.

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

## Precision Engine - 11 Tools

The core of GoodVibes. 11 tools that replace Claude Code's native tools with enhanced, token-efficient alternatives.

### Tool Overview

| Tool | Replaces | Key Enhancements |
|------|----------|------------------|
| precision_read | Read | Batch reads, extract modes (content/outline/symbols/ast/lines), image viewing (PNG/JPG/GIF/WebP/BMP/ICO/TIFF/AVIF/SVG as visual blocks with magic byte validation), PDF text extraction with page ranges, Jupyter notebook cells, token budgets with pagination, file state caching |
| precision_write | Write | Batch writes, fail_if_exists/overwrite/backup modes, atomic transactions with rollback, Handlebars/EJS templates, dry run, auto directory creation, base64 content support |
| precision_edit | Edit | Batch edits, match modes (exact/fuzzy/regex/ast_pattern with AST-Grep captures), occurrence selection (first/last/Nth/all), context hints (near_line/in_function/in_class/after/before), atomic transactions with rollback, dry run, whitespace/case sensitivity toggles |
| precision_grep | Grep | Batch queries with parallel execution, output modes (count_only/files_only/locations/matches/context), context expansion (line/block/function/class), negation search, find-replace preview with backreference support, relevance ranking, cross-file relationship tracing, whole word matching |
| precision_glob | Glob | Presets (typescript/javascript/styles/config/tests), size/date/content filters, output modes (count_only/paths_only/with_stats/with_preview), backend selection (fast-glob/ripgrep), symlink following |
| precision_exec | Bash | Batch commands with parallel execution, expectation checking (exit code/stdout/stderr), retry engine (configurable backoff for transient failures), progress tracking with milestones, pattern-based termination, safe mode (blocks rm -rf, dd, etc.), background process lifecycle management |
| precision_fetch | WebFetch | Full HTTP client: 7 methods (GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS), service registry with auto-auth, per-request auth (none/bearer/basic/api-key/custom-headers), 12 extraction modes (raw/text/json/markdown/structured/summary/code_blocks/tables/links/metadata/readable/pdf), body encoding (json/form/multipart/raw), query params, CSS selectors, response headers/cookies/redirect chains/timing, 15-min TTL cache |
| precision_notebook | NotebookEdit | Batch operations with auto-index adjustment, cell targeting by cell_id (with metadata.id fallback), output clearing per cell, auto cell_id generation for nbformat 4.5+ |
| discover | (unique) | Parallel multi-query: run grep + glob + symbol + structural (AST pattern) queries simultaneously, results keyed by query ID |
| precision_symbols | (unique) | Workspace-wide or per-file symbol search, kind filtering (10 kinds), export/private filtering, signature extraction with JSDoc/docstrings, grouping by file/kind, multi-language (TypeScript, JavaScript, Python, Rust, Go) |
| precision_config | (unique) | Runtime configuration for precision engine (get/set/reload), sandbox mode, cache tuning, execution defaults |

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

## Analysis Engine - 19 Tools

| Category | Tools |
|----------|-------|
| Detection | detect-stack, check-versions, scan-patterns, read-config, get-conventions |
| Code Quality | find-dead-code, get-api-surface, safe-delete-check, identify-tech-debt |
| Validation | detect-breaking-changes, semantic-diff, validate-implementation, validate-edits-preview, validate-api-contract |
| Security | env-audit, scan-for-secrets, check-permissions |
| Debugging | parse-error-stack, explain-type-error |

## Project Engine - 22 Tools

| Category | Tools |
|----------|-------|
| Scaffolding | scaffold-project, list-templates |
| Status | plugin-status, project-issues |
| API | generate-openapi, get-api-routes |
| Database | get-database-schema, get-prisma-operations, query-database |
| Maintenance | upgrade-package, analyze-bundle, analyze-dependencies, find-circular-deps |
| Testing | find-tests-for-file, get-test-coverage, suggest-test-cases, generate-fixture |
| TypeScript | generate-types, sync-api-types, explain-codebase |
| Git | create-pull-request, resolve-merge-conflict |

## Frontend Engine - 11 Tools

| Tool | Purpose |
|------|----------|
| get-react-component-tree | Extract component hierarchy |
| analyze-stacking-context | Debug z-index issues |
| analyze-responsive-breakpoints | Audit responsive design |
| trace-component-state | Trace state flow through components |
| analyze-render-triggers | Find unnecessary re-renders |
| analyze-layout-hierarchy | Debug layout issues |
| diagnose-overflow | Find overflow causes |
| get-accessibility-tree | Generate accessibility tree |
| get-sizing-strategy | Analyze CSS sizing approach |
| analyze-event-flow | Trace event propagation |
| analyze-tailwind-conflicts | Find conflicting Tailwind classes |

## Batch Engine - 6 Tools

| Tool | Purpose |
|------|----------|
| batch | Execute batch operations with checkpoints |
| batch-status | Check running batch status |
| batch-list | List all batches |
| batch-recover | Recover from checkpoint after failure |
| batch-checkpoints | List available checkpoints |
| batch-state | Query batch execution state |

## Registry Engine - 7 Tools

| Tool | Purpose |
|------|----------|
| search-skills | Search skills by query and category |
| search-agents | Search agents by capability |
| search-tools | Search MCP tools |
| recommend-skills | Context-aware skill recommendations |
| get-skill-content | Load skill content into context |
| get-agent-content | Load agent definition |
| skill-dependencies | Resolve skill dependency chain |

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

## Skills - 173 Total

| Category | Count | Coverage |
|----------|-------|----------|
| Common | 29 | Development, quality, review, tooling, workflow |
| WebDev | 138 | 20+ subcategories covering modern web stack |
| Creation | 5 | Agent SDK, hooks, scripts, workflow patterns |
| Special | 1 | goodvibes-codebase-review (full audit with parallel remediation) |

### WebDev Breakdown (Selected Subcategories)

- **API Layer** (8): tRPC, GraphQL, REST, Express, Fastify, Hono, Apollo, OpenAPI
- **Authentication** (7): Clerk, NextAuth, Lucia, Auth0, Firebase Auth, Supabase Auth, Passport
- **Databases & ORMs** (10): Prisma, Drizzle, Kysely, PostgreSQL, MongoDB, Redis, Supabase, PlanetScale, Turso, SQLite
- **Frontend Core** (10): React, Vue, Svelte, TypeScript, SolidJS, Preact, htmx, Alpine.js, Web Components
- **Meta Frameworks** (8): Next.js, Remix, Nuxt, Astro, SvelteKit, Qwik, SolidStart, Gatsby
- **State Management** (7): Zustand, Jotai, Redux Toolkit, TanStack Query, Valtio, Nanostores, Pinia
- **Styling** (8): Tailwind, Styled Components, CSS Modules, Sass, Panda CSS, Vanilla Extract, UnoCSS
- **Testing** (8): Vitest, Playwright, Jest, Testing Library, Cypress, Storybook, MSW, Chromatic
- **Plus 50+ specialized skills**: Stripe, Resend, Sentry, Socket.IO, MDX, Framer Motion, and more

## Hooks - 10 Types

Lifecycle hooks run transparently on every session. They're the mechanism behind tool redirection, context injection, and automatic error recovery.

| Hook | Trigger | What It Does |
|------|---------|-------------|
| PreToolUse (Bash) | Before Bash execution | Platform path mapping (Windows/Linux), shell safety analysis, git commit quality gates |
| PreToolUse (Native) | Before Read/Edit/Write/Glob/Grep | Blocks native tool, redirects to precision-engine equivalent |
| PostToolUseFailure | After Bash failure | 3-phase progressive fix loop: Phase 1 (internal knowledge) -> Phase 2 (official docs hints) -> Phase 3 (community docs hints). Logs failures to `.goodvibes/memory/failures.json` after all phases exhausted |
| SessionStart | Session begins | Detects project stack, analyzes git status, checks project health, creates/updates CLAUDE.md, injects context into system message |
| SessionEnd | Session ends | Persists session state |
| SubagentStart | Agent spawns | Injects context for GoodVibes agents (stack info, git branch, project name), tracks agent telemetry |
| SubagentStop | Agent completes | Cleans up agent tracking, updates analytics |
| PreCompact | Before context compaction | Creates checkpoint commit if uncommitted changes exist, generates session summary, backs up analytics |
| Stop | Stop button pressed | Saves current state |
| Notification | External event | Processes notifications |
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

## Templates

| Template | Stack | Use Case |
|----------|-------|----------|
| next-saas | Next.js 15, NextAuth, Prisma, Stripe, shadcn/ui, Tailwind, Resend, Sentry | Full SaaS starter |
| next-app | Next.js 15, TypeScript, Tailwind, ESLint | Minimal App Router starter |
| vite-react | Vite, React, TypeScript, Tailwind | Client-side React app |

## Configuration

GoodVibes works out of the box. Minimal configuration needed.

### Path Sandboxing

Controls whether precision tools can access files outside the project root. Disabled by default.

```bash
/goodvibes:sandbox true    # Enable (restrict to project root)
/goodvibes:sandbox false   # Disable (allow external paths, default)
```

### Output Style

Switch execution modes:

```bash
/output-style goodvibes:vibecoding
/output-style goodvibes:justvibes
```

## Slash Commands

| Command | Purpose |
|---------|----------|
| `/goodvibes:sandbox` | Toggle path sandboxing (true/false) |
| `/goodvibes:plugin` | Plugin management (update, status, config) |
| `/goodvibes:search` | Search skills, agents, or tools |
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