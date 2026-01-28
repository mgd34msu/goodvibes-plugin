# GoodVibes Plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/mgd34msu/goodvibes-plugin)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)](https://claude.com/claude-code)

> Plug in. Receive good vibes.

GoodVibes is a comprehensive Claude Code plugin that transforms AI-assisted development through batch-first operations, precision tools, and autonomous execution. Built for high-quality, low(ish)-effort development, it provides a complete ecosystem of agents, skills, and tools for maximum efficiency and quality.

## 📊 At a Glance

**Autonomous AI development that actually works.**

Most AI coding tools fail silently. They hit an error, give up, and hand you back a broken mess. GoodVibes doesn't. It recovers, learns, and delivers verified code.

| Component | Count | Description |
|-----------|-------|-------------|
| 🤖 **Agents** | 9 | Specialized roles (engineer, reviewer, tester, etc.) |
| 📚 **Skills** | 173 | Reusable knowledge modules across all tech stacks (honestly, skills are becoming less important) |
| 🔧 **MCP Tools** | 74 | Precision tools across 6 specialized engines |
| 🪝 **Hooks** | 9 | Lifecycle event handlers for automation (can use all 13 hook types) |
| 🎨 **Output Styles** | 2 | vibecoding (interactive) and justvibes (autonomous) |
| 📦 **Templates** | 3 | Production-ready project scaffolds (changing this soon - more targeted) |

---

## Table of Contents

- [GoodVibes Plugin](#goodvibes-plugin)
  - [📊 At a Glance](#-at-a-glance)
  - [Table of Contents](#table-of-contents)
  - [Features Overview](#features-overview)
    - [Philosophy](#philosophy)
      - [1. Errors Are Recoverable, Not Terminal](#1-errors-are-recoverable-not-terminal)
      - [2. Memory That Persists](#2-memory-that-persists)
      - [3. Verified Before Committed](#3-verified-before-committed)
      - [4. Tools That Respect Your Context](#4-tools-that-respect-your-context)
      - [5. Domain Knowledge Built In](#5-domain-knowledge-built-in)
  - [Installation](#installation)
    - [Prerequisites](#prerequisites)
    - [Getting the Plugin](#getting-the-plugin)
    - [First Run](#first-run)
    - [Basic Usage](#basic-usage)
  - [Quick Start](#quick-start)
    - [Examples](#examples)
    - [Running Your First Skill](#running-your-first-skill)
    - [Using an Agent](#using-an-agent)
  - [Core Concepts](#core-concepts)
    - [Batch-First Architecture](#batch-first-architecture)
    - [WRFC Loop (Write-Review-Fix-Check)](#wrfc-loop-write-review-fix-check)
    - [Output Modes](#output-modes)
    - [Transaction Modes](#transaction-modes)
    - [Execution Modes](#execution-modes)
  - [MCP Tools](#mcp-tools)
    - [Precision Engine (9 tools)](#precision-engine-9-tools)
    - [Batch Engine (6 tools)](#batch-engine-6-tools)
    - [Registry Engine (7 tools)](#registry-engine-7-tools)
    - [Analysis Engine (19 tools)](#analysis-engine-19-tools)
    - [Project Engine (22 tools)](#project-engine-22-tools)
    - [Frontend Engine (11 tools)](#frontend-engine-11-tools)
  - [Agents](#agents)
    - [Agent Spawning](#agent-spawning)
    - [When to Use Each Agent](#when-to-use-each-agent)
  - [Skills](#skills)
    - [Skills Overview](#skills-overview)
    - [Common Skills (29)](#common-skills-29)
    - [WebDev Skills (138)](#webdev-skills-138)
    - [Creation Skills (5)](#creation-skills-5)
    - [Special Skills](#special-skills)
    - [Discovering Skills](#discovering-skills)
    - [Using Skills](#using-skills)
  - [Slash Commands](#slash-commands)
  - [Hooks](#hooks)
    - [Hook Configuration](#hook-configuration)
    - [Hook Execution Flow](#hook-execution-flow)
  - [Output Styles](#output-styles)
    - [vibecoding (Interactive)](#vibecoding-interactive)
    - [justvibes (Autonomous)](#justvibes-autonomous)
    - [Comparison](#comparison)
    - [Switching Modes](#switching-modes)
  - [Memory System](#memory-system)
    - [Directory Structure](#directory-structure)
    - [Logs (Session-Level)](#logs-session-level)
    - [Memory (Cross-Session)](#memory-cross-session)
    - [Memory Operations](#memory-operations)
  - [Templates](#templates)
    - [1. next-saas](#1-next-saas)
    - [2. next-app](#2-next-app)
    - [3. vite-react](#3-vite-react)
    - [Using Templates](#using-templates)
  - [Configuration](#configuration)
    - [plugin.json](#pluginjson)
    - [.mcp.json](#mcpjson)
    - [hooks.json](#hooksjson)
  - [Best Practices](#best-practices)
    - [Before Any Task](#before-any-task)
    - [During Execution](#during-execution)
    - [After Execution](#after-execution)
  - [Troubleshooting](#troubleshooting)
    - [Common Issues](#common-issues)
  - [License](#license)

---

## Features Overview

GoodVibes provides:

- **🚀 Batch-First Operations**: Execute multi-file operations atomically with automatic rollback
- **🎯 Precision Tools**: Enhanced file operations with extract modes, context control, and validation
- **🤖 Specialized Agents**: 9 role-specific agents (engineer, reviewer, tester, architect, deployer, integrator, planner, factories)
- **📚 Massive Skills Library**: 173 curated skills covering modern web development, AI integration, databases, authentication, deployment, and more
- **🔍 Advanced Analysis**: Stack detection, pattern scanning, breaking change detection, dependency analysis
- **🎨 Frontend Mastery**: Component tree analysis, accessibility auditing, responsive breakpoint analysis, Tailwind conflict resolution
- **💾 Persistent Memory**: Two-tier memory system (session logs + cross-session memory) for decision tracking and pattern recognition
- **🔄 Quality Assurance**: Built-in WRFC loop (Write-Review-Fix-Check) with automatic validation
- **⚡ Token Efficiency**: Output verbosity controls (count_only, minimal, standard, verbose) for optimal performance
- **🛡️ Enterprise Standards**: No mocks, no placeholders, production-ready code only

### Philosophy

#### 1. Errors Are Recoverable, Not Terminal

When something fails, GoodVibes doesn't stop. It escalates through three recovery phases:

| Phase | Action |
|-------|--------|
| **Phase 1** | Attempt fix with existing knowledge |
| **Phase 2** | Search official documentation, inject solutions |
| **Phase 3** | Search community (Stack Overflow, GitHub), apply proven fixes |

Most errors resolve without human intervention. Your project keeps moving.

#### 2. Memory That Persists

Every session starts fresh with most AI tools. Not GoodVibes.

**Decisions** — Architectural choices and their rationale, searchable forever.
**Patterns** — Code conventions discovered in your codebase, applied consistently.
**Failures** — Past errors and their solutions. Same bug? Already knows the fix.

Your AI gets smarter the more you use it.

#### 3. Verified Before Committed

The WRFC Loop ensures nothing ships unverified:

```
WORK → REVIEW → FIX → CHECK
                 ↑      |
                 └──────┘ (repeat until verified)
```

- **Work**: Agent completes the task
- **Review**: Separate reviewer agent evaluates against spec
- **Fix**: If issues found, fix agent addresses them
- **Check**: Reviews fix agent work, sends it back if necessary

When the loop ends for a task, it is committed and we move on.

#### 4. Tools That Respect Your Context

Token-efficient operations with output control:

```typescript
// Need just file paths? Get paths only.
precision_glob({ patterns: ["**/*.ts"], output: "paths_only" })

// Need full content? Get full content.
precision_read({ files: ["src/auth.ts"], extract: "content" })

// Need just the function signatures? Get outlines.
precision_read({ files: ["src/auth.ts"], extract: "outline" })
```

Give agents the ability to use only the context they need.

#### 5. Domain Knowledge Built In

170+ skills, most with progressive disclosure, covering real-world development:

- **Frameworks**: Next.js, Nuxt, Remix, Astro, SvelteKit
- **Databases**: Prisma, Drizzle, PostgreSQL, MongoDB
- **Auth**: Clerk, NextAuth, Auth0, Firebase, Lucia
- **Payments**: Stripe, LemonSqueezy, Paddle
- **Testing**: Vitest, Playwright, Jest, Testing Library
- **Deployment**: Vercel, Netlify, Cloudflare, Docker, Railway

Distilled directly from 1st-party documentation, not hallucinated patterns. Documented best practices with implementation examples.

---

## Installation

### Prerequisites

- Claude Code CLI (latest version)
- Node.js 20+ (for MCP servers)
- Git (for version control integration)

### Getting the Plugin

```bash
# Install via marketplace
claude plugin marketplace add mgd34msu/goodvibes-plugin
claude plugin install goodvibes@goodvibes-market

# Or clone the plugin repo
git clone https://github.com/goodvibes/goodvibes-plugin ~/.claude/plugins/goodvibes
```

### First Run

```bash
# Start Claude Code in your project (recommend: bypass permissions mode)
claude --dangerously-skip-permissions

# GoodVibes auto-injects context on session start:
# - Stack detection (frameworks, languages, tools)
# - Git context (branch, uncommitted changes, recent commits)
# - Project health (missing deps, env issues, TypeScript errors)
# - TODOs and FIXMEs found in codebase

# Set your output style
# - vibecoding mode for an interactive experience
/output-style goodvibes:vibecoding

# - justvibes mode for exactly that, just vibes, total automation
/output-style goodvibes:justvibes
```

### Basic Usage

```
You: "Add user authentication with email/password"

GoodVibes:
1. Planner or Architect (based on complexity) breaks down: schema, API routes, middleware, UI components
2. Engineer implements each task
3. Reviewer verifies against requirements
4. Fix loop if issues found
5. Commits verified code with descriptive messages
6. Reports completion with summary
```

---

## Quick Start

### Examples

**Example 1: Stack Detection**

Before starting any task, detect the project's technology stack:

```yaml
# Ask Claude Code:
"Detect the stack for this project"

# Claude Code will use:
mcp-cli call plugin_goodvibes_analysis-engine/detect_stack
```

**Example 2: Find Relevant Skills**

Discover skills for your task:

```yaml
# Ask Claude Code:
"Find skills related to authentication with NextAuth"

# Claude Code will use:
mcp-cli call plugin_goodvibes_registry-engine/search_skills '{"query": "nextauth authentication"}'
```

**Example 3: Run a Batch Operation**

Execute multi-file changes atomically:

```yaml
# Ask Claude Code:
"Create a new API route for user management with Prisma"

# Claude Code will use the batch engine to:
# 1. Read existing patterns
# 2. Create route files
# 3. Update database schema
# 4. Validate with TypeScript
# All in a single atomic transaction
```

### Running Your First Skill

Load a skill to access specialized knowledge:

```bash
# In Claude Code:
/load-skill nextjs

# Or ask:
"Load the Next.js skill and help me implement Server Actions"
```

### Using an Agent

Delegate specialized work to an agent:

```yaml
# Ask Claude Code:
"Use the reviewer agent to check this API endpoint for security issues"

# The main agent will spawn the reviewer agent with:
# - Focused context (the API file)
# - Specialized instructions (security review)
# - Budget limits (tokens and turns)
```

---

## Core Concepts

### Batch-First Architecture

GoodVibes executes operations in **batches** rather than individual tool calls. This provides:

- **Atomicity**: All operations succeed or all fail (with rollback)
- **Efficiency**: Parallel execution where possible, sequential where dependencies exist
- **Checkpoints**: Automatic state snapshots before critical operations
- **Recovery**: Resume from last checkpoint on failure

**Batch Structure**:

```yaml
batch:
  id: implement-feature

  operations:
    read:      # Gather context
      - id: analyze
        type: files
        targets: ["src/**/*.ts"]
        extract: outline

    write:     # Make changes
      - id: create
        type: create
        files:
          - path: "src/feature.ts"
            content: "..."

    exec:      # Validate
      - id: validate
        type: command
        commands:
          - cmd: "npm run typecheck"
            expect: { exit_code: 0 }

  config:
    transaction:
      mode: atomic           # atomic | partial | none
    execution:
      mode: parallel         # parallel | sequential
    checkpoint:
      enabled: true
      before: ["write"]
      after: ["validate"]
```

### WRFC Loop (Write-Review-Fix-Check)

Every code change goes through a quality assurance cycle:

```
┌─────────────┐
│   WORK      │  Engineer / Architect / Other agent writes/edits files
└──────┬──────┘
       │
       v
┌─────────────┐
│   REVIEW    │  Reviewer agent checks all changes
└──────┬──────┘
       │
       v
┌─────────────┐
│    FIX      │  Engineer / Architect / Other agent fixes problems
└──────┬──────┘
       │
       v
┌─────────────┐
│   CHECK     │  Reviewer agent checks fixes ... cycle continues
└─────────────┘
```

**Review Skills Applied by Edit Type**:

| Edit Type | Review Skills |
|-----------|---------------|
| TypeScript/JavaScript | type-safety, error-handling, async-patterns |
| API routes | type-safety, error-handling, async-patterns |
| Components | type-safety, naming-conventions |
| New files | import-ordering, documentation |
| Configuration | config-hygiene |

### Output Modes

Control response verbosity to optimize token usage:

| Mode | Use Case | Token Usage | Output Includes |
|------|----------|-------------|------------------|
| `count_only` | Quick validation, large datasets | Minimal | Counts, summaries only |
| `minimal` | Batch operations, background tasks | Low | Essential results, no details |
| `standard` | Normal operations | Medium | Full results, basic context |
| `verbose` | Debugging, exploration | High | Complete details, context, metadata |

**Example**:

```yaml
precision_grep:
  queries:
    - pattern: "export function"
      glob: "src/**/*.ts"
  output:
    mode: count_only  # Returns: { count: 42 }
```

### Transaction Modes

Control rollback behavior for batch operations:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `atomic` | All succeed or all rollback | Critical changes, database migrations |
| `partial` | Continue on failure, report errors | Independent operations, bulk updates |
| `none` | No rollback, best effort | Read-only, exploratory operations |

### Execution Modes

GoodVibes supports two execution modes via output styles:

| Mode | Communication | Decisions | Checkpoints | Output |
|------|---------------|-----------|-------------|--------|
| **vibecoding** | Verbose, explanatory | Ask user on ambiguity | Manual | Standard verbosity, show diffs |
| **justvibes** | Silent, logs only | Autonomous, best-guess | Automatic | Minimal verbosity, no diffs |

Switch modes with:

```bash
# In Claude Code settings or config
"outputStyle": "goodvibes:vibecoding"  # or "goodvibes:justvibes"
```

---

## MCP Tools

GoodVibes provides **74 MCP tools** across 6 specialized engines.

### Precision Engine (9 tools)

Enhanced file and command operations with advanced features:

| Tool | Purpose | Key Features |
|------|---------|--------------|
| `precision_read` | Read files with extract modes | outline, symbols, lines, full content |
| `precision_write` | Create/write files | Batch writes, backup mode, encoding support |
| `precision_edit` | Edit files atomically | Transaction support, validation, hints |
| `precision_grep` | Advanced content search | Output modes, context control, multiline |
| `precision_glob` | Pattern-based file finding | Filters, preview mode, sorted results |
| `precision_symbols` | Extract code symbols | Functions, classes, interfaces, types |
| `precision_exec` | Execute commands with validation | Expectations, batch commands, output control |
| `precision_fetch` | Fetch web content | Markdown conversion, caching |
| `discover` | Parallel discovery queries | Multi-query, aggregated results |

**Example Usage**:

```yaml
# Read file structure without full content
precision_read:
  files: ["src/index.ts", "src/app.ts"]
  extract: outline
  output:
    mode: minimal

# Batch edit with atomic transaction
precision_edit:
  edits:
    - file: "src/api.ts"
      find: "const API_URL = 'localhost'"
      replace: "const API_URL = process.env.API_URL"
    - file: "src/config.ts"
      find: "debug: true"
      replace: "debug: false"
  transaction:
    mode: atomic
    rollback_on_fail: true

# Discover patterns across codebase
discover:
  queries:
    - id: find_components
      type: glob
      patterns: ["src/components/**/*.tsx"]
    - id: find_hooks
      type: symbols
      query: "use"
      kinds: ["function"]
  output_mode: files_only
```

### Batch Engine (6 tools)

Orchestrate multi-operation workflows:

| Tool | Purpose |
|------|----------|
| `batch` | Execute batch operations (read, write, exec, query) |
| `batch_status` | Check status of running batch |
| `batch_list` | List all batches (active, completed, failed) |
| `batch_recover` | Recover from checkpoint after failure |
| `batch_checkpoints` | List checkpoints for a batch |
| `batch_state` | Query batch execution state |

**Example**:

```yaml
batch:
  id: refactor-imports
  operations:
    read:
      - id: scan
        type: grep
        pattern: "^import"
        glob: "src/**/*.ts"
    write:
      - id: update
        type: edit
        edits: [ ... ]
    exec:
      - id: validate
        type: command
        commands:
          - cmd: "npm run lint -- --fix"
  config:
    transaction:
      mode: atomic
    checkpoint:
      enabled: true
      before: ["write"]
```

### Registry Engine (7 tools)

Discover and manage skills, agents, and tools:

| Tool | Purpose |
|------|----------|
| `search_skills` | Search skills by query |
| `search_agents` | Search agents by capability |
| `search_tools` | Search MCP tools |
| `recommend_skills` | Get skill recommendations based on context |
| `get_skill_content` | Load skill content |
| `get_agent_content` | Load agent definition |
| `skill_dependencies` | Find skill dependencies |

**Example**:

```yaml
# Find authentication skills
search_skills:
  query: "authentication nextauth clerk"
  filters:
    category: ["webdev/auth"]
    max_results: 5

# Get recommendations for current task
recommend_skills:
  context:
    task: "Implement OAuth with Google"
    stack: ["nextjs", "prisma", "postgresql"]
  max_recommendations: 3
```

### Analysis Engine (19 tools)

Comprehensive codebase analysis and validation:

| Tool | Category | Purpose |
|------|----------|----------|
| `detect_stack` | Detection | Identify frameworks, libraries, tools |
| `check_versions` | Detection | Check dependency versions |
| `scan_patterns` | Detection | Find code patterns |
| `read_config` | Detection | Parse config files (tsconfig, eslint, etc.) |
| `get_conventions` | Detection | Extract coding conventions |
| `find_dead_code` | Code Quality | Identify unused exports |
| `get_api_surface` | Code Quality | Extract public API |
| `safe_delete_check` | Code Quality | Verify safe to delete |
| `detect_breaking_changes` | Validation | Find breaking changes |
| `semantic_diff` | Validation | Semantic code comparison |
| `validate_implementation` | Validation | Verify implementation matches spec |
| `validate_edits_preview` | Validation | Preview edit impact |
| `validate_api_contract` | Validation | Check API contract compliance |
| `env_audit` | Security | Audit environment variables |
| `scan_for_secrets` | Security | Detect hardcoded secrets |
| `check_permissions` | Security | Verify file permissions |
| `parse_error_stack` | Debugging | Parse error stack traces |
| `explain_type_error` | Debugging | Explain TypeScript errors |
| `find_circular_deps` | Debugging | Detect circular dependencies |

**Example**:

```yaml
# Detect project stack
detect_stack:
  path: "."
  include_versions: true

# Find breaking changes
detect_breaking_changes:
  base_ref: "main"
  head_ref: "feature-branch"
  scope: ["src/api/**/*.ts"]

# Security audit
env_audit:
  check_missing: true
  check_unused: true
  suggest_defaults: true
```

### Project Engine (22 tools)

Project scaffolding, database management, and workflow automation:

| Tool | Category | Purpose |
|------|----------|----------|
| `scaffold_project` | Scaffolding | Create project from template |
| `list_templates` | Scaffolding | List available templates |
| `plugin_status` | Status | Check plugin health |
| `project_issues` | Status | Find project issues |
| `generate_openapi` | API | Generate OpenAPI spec |
| `get_database_schema` | Database | Extract DB schema |
| `get_api_routes` | API | List API routes |
| `get_prisma_operations` | Database | List Prisma operations |
| `query_database` | Database | Execute DB query |
| `upgrade_package` | Maintenance | Upgrade dependencies |
| `explain_codebase` | Documentation | Generate codebase overview |
| `find_tests_for_file` | Testing | Find tests for file |
| `get_test_coverage` | Testing | Get coverage report |
| `suggest_test_cases` | Testing | Suggest test cases |
| `generate_types` | TypeScript | Generate type definitions |
| `generate_fixture` | Testing | Generate test fixtures |
| `sync_api_types` | TypeScript | Sync API types between frontend/backend |
| `create_pull_request` | Git | Create PR with analysis |
| `resolve_merge_conflict` | Git | Assist merge conflict resolution |
| `analyze_bundle` | Performance | Analyze bundle size |
| `analyze_dependencies` | Maintenance | Analyze dependency tree |
| `find_circular_deps` | Debugging | Find circular dependencies |

**Example**:

```yaml
# Scaffold new project
scaffold_project:
  template: "next-saas"
  name: "my-app"
  options:
    auth: "clerk"
    database: "prisma"
    styling: "tailwind"

# Get database schema
get_database_schema:
  format: "prisma"
  include_relations: true

# Analyze bundle
analyze_bundle:
  build_command: "npm run build"
  threshold_kb: 500
```

### Frontend Engine (11 tools)

Specialized React/frontend analysis:

| Tool | Purpose |
|------|----------|
| `get_react_component_tree` | Extract component hierarchy |
| `analyze_stacking_context` | Debug z-index issues |
| `analyze_responsive_breakpoints` | Audit responsive design |
| `trace_component_state` | Trace state flow |
| `analyze_render_triggers` | Find unnecessary re-renders |
| `analyze_layout_hierarchy` | Debug layout issues |
| `diagnose_overflow` | Find overflow causes |
| `get_accessibility_tree` | Generate a11y tree |
| `get_sizing_strategy` | Analyze sizing approach |
| `analyze_event_flow` | Trace event propagation |
| `analyze_tailwind_conflicts` | Find conflicting Tailwind classes |

**Example**:

```yaml
# Analyze component tree
get_react_component_tree:
  entry_point: "src/app/page.tsx"
  depth: 3
  include_props: true

# Debug Tailwind conflicts
analyze_tailwind_conflicts:
  component: "src/components/Button.tsx"
  suggest_fixes: true

# Accessibility audit
get_accessibility_tree:
  component: "src/components/Form.tsx"
  check_aria: true
```

---

## Agents

GoodVibes provides **9 specialized agents** for different development tasks:

| Agent | Specialization | Use Cases | Key Capabilities |
|-------|----------------|-----------|------------------|
| **engineer** | Full-stack development | Features, APIs, components, DB schemas | Backend (APIs, databases, auth) + Frontend (components, routing, styling) |
| **reviewer** | Code quality & security | Code review, security audit, type safety | WRFC loop, review skills, vulnerability detection |
| **tester** | Testing & validation | Unit tests, integration tests, E2E tests | Test generation, coverage analysis, fixture creation |
| **architect** | System design | Architecture decisions, patterns, refactoring | Design patterns, scalability analysis, tech stack recommendations |
| **deployer** | Deployment & DevOps | CI/CD, containerization, cloud deployment | Docker, GitHub Actions, Vercel/Netlify, environment management |
| **integrator** | Third-party integrations | API integration, SDK setup, webhooks | OAuth, webhooks, SDK configuration, API client generation |
| **planner** | Project planning | Task breakdown, estimation, prioritization | Dependency analysis, milestone planning, risk assessment |
| **agent-factory** | Agent creation | Create new specialized agents | Agent SDK, role definition, context injection |
| **skill-factory** | Skill creation | Create new skills | Skill templates, knowledge extraction, dependency management |

### Agent Spawning

Agents are spawned with focused context and budget:

```yaml
# Main agent spawns reviewer for focused task
spawn:
  agent: reviewer
  task: "Review API endpoint for security issues"
  scope:
    files: ["src/app/api/users/route.ts"]
  constraints:
    focus: ["authentication", "input-validation", "sql-injection"]
  budget:
    tokens: 50000
    turns: 10
  relevant_decisions:
    - "Using NextAuth for authentication"
    - "Prisma for database access"
```

### When to Use Each Agent

| Task | Agent | Why |
|------|-------|-----|
| Implement new feature | engineer | Full-stack implementation with validation |
| Review PR | reviewer | Security, type safety, error handling checks |
| Add test coverage | tester | Test generation with best practices |
| Plan refactoring | architect | System design and pattern analysis |
| Set up CI/CD | deployer | Deployment expertise |
| Add Stripe integration | integrator | Third-party API integration |
| Break down epic | planner | Task decomposition and estimation |
| Create custom agent | agent-factory | Agent creation with SDK |
| Document new framework | skill-factory | Knowledge capture as skill |

---

## Skills

GoodVibes includes **173 curated skills** organized into categories:

### Skills Overview

**Total: 173 skills**

| Category | Count | Description |
|----------|-------|-------------|
| **Common** | 29 | Development, quality, review, tooling, workflow |
| **WebDev** | 138 | Modern web development (frameworks, libraries, tools) |
| **Special** | 1 | goodvibes-codebase-review (comprehensive codebase audit) |
| **Creation** | 5 | Agent SDK, hooks, scripts, workflows, descriptions |

### Common Skills (29)

Foundational skills for all development:

**Development (9)**:
- architecture-assessment, code-critique, code-organization, code-scoring, debugging, dependency-management, improvement-roadmap, project-understanding, refactoring

**Quality (5)**:
- code-quality, code-smell-detector, review-scoring-rubric, security-audit-checklist, testing

**Review (8)**:
- async-patterns, code-organization, config-hygiene, documentation, error-handling, import-ordering, naming-conventions, type-safety

**Tooling (1)**:
- mcp-mastery

**Workflow (6)**:
- agent-monitoring, documentation, git-workflows, planning/dependency-mapping, planning/risk-assessment, planning/task-decomposition

### WebDev Skills (138)

Comprehensive modern web development:

**AI Integration (1)**:
- vercel-ai-sdk

**Animation (1)**:
- framer-motion

**API Layer (8)**:
- apollo-server, express, fastify, graphql, hono, openapi, rest-api-design, trpc

**Authentication (7)**:
- auth0, clerk, firebase-auth, lucia, nextauth, passport, supabase-auth

**Build Tools (7)**:
- bun, esbuild, rollup, tsup, turbopack, vite, webpack

**CMS & Content (1)**:
- mdx

**Component Libraries (8)**:
- ant-design, ark-ui, chakra-ui, headless-ui, mantine, material-ui, radix-ui, shadcn-ui

**Databases & ORMs (10)**:
- drizzle, kysely, mongodb, planetscale, postgresql, prisma, redis, sqlite, supabase-db, turso

**Deployment (8)**:
- aws-amplify, cloudflare-pages, docker-web, fly-io, netlify, railway, render, vercel

**Email (1)**:
- resend

**Forms & Validation (6)**:
- conform, formik, react-hook-form, valibot, yup, zod

**Frontend Core (10)**:
- alpine-js, htmx, javascript-modern, preact, react, solidjs, svelte, typescript, vue, web-components

**Meta Frameworks (8)**:
- astro, gatsby, nextjs, nuxt, qwik, remix, solidstart, sveltekit

**Monitoring & Analytics (1)**:
- sentry

**Payments (1)**:
- stripe

**Real-time & WebSockets (1)**:
- socket-io

**State Management (7)**:
- jotai, nanostores, pinia, redux-toolkit, tanstack-query, valtio, zustand

**Styling (8)**:
- css-modules, css-variables, panda-css, sass-scss, styled-components, tailwindcss, unocss, vanilla-extract

**Testing (8)**:
- chromatic, cypress, jest, msw, playwright, storybook, testing-library, vitest

**Additional Skills (36)**:

Located in webdev/skills subdirectory:
- ably, anthropic-api, auto-animate, aws-s3, axiom, cloudinary, contentful, css-animations, gsap, huggingface-js, imgix, keystonejs, langchain-js, lemonsqueezy, liveblocks, logrocket, lottie, nodemailer, openai-api, paddle, partykit, and 15 more

> Note: Skills are organized by technology. Each skill is defined in a SKILL.md file within its category directory. The "Additional Skills" category contains 36 specialized tools and libraries that don't fit neatly into the main categories above.

### Creation Skills (5)

Meta-skills for extending GoodVibes:

- agent-sdk-definitions, hook-integration, script-best-practices, workflow-patterns, writing-descriptions

### Special Skills

**goodvibes-codebase-review**:

Comprehensive codebase audit with parallel agent remediation:
- Analyzes 10 quality dimensions
- Generates master report with quantified metrics
- Creates prioritized remediation plan
- Executes fixes with max 6 parallel agents

### Discovering Skills

**Search by keyword**:
```yaml
search_skills:
  query: "authentication oauth"
  filters:
    category: ["webdev/auth"]
```

**Get recommendations**:
```yaml
recommend_skills:
  context:
    task: "Build a SaaS with subscriptions"
    stack: ["nextjs", "prisma", "stripe"]
  max_recommendations: 5
```

### Using Skills

**Load via slash command**:
```bash
/load-skill nextjs
```

**Load programmatically**:
```yaml
get_skill_content:
  skill_id: "webdev/nextjs"
  include_examples: true
```

---

## Slash Commands

GoodVibes provides 4 slash commands:

| Command | Purpose | Usage |
|---------|---------|-------|
| `/codebase-review` | Full codebase audit with parallel remediation | `/codebase-review` |
| `/load-skill` | Load skill content into context | `/load-skill <skill-name>` |
| `/plugin-status` | Check GoodVibes plugin status | `/plugin-status` |
| `/search` | Search skills, agents, or tools | `/search skills authentication` |

**Examples**:

```bash
# Review entire codebase
/codebase-review

# Load Next.js skill
/load-skill nextjs

# Check plugin health
/plugin-status

# Search for auth skills
/search skills auth
```

---

## Hooks

GoodVibes provides **9 lifecycle hooks** for automation:

| Hook | Trigger | Purpose | Use Cases |
|------|---------|---------|-----------|
| `SessionStart` | Session begins | Initialize session context | Load preferences, detect stack, scan patterns |
| `SessionEnd` | Session ends | Cleanup and persist state | Save decisions, update memory, generate summary |
| `SubagentStart` | Subagent spawned | Initialize subagent context | Inject relevant decisions, load skills, set budget |
| `SubagentStop` | Subagent completes | Harvest subagent results | Merge learnings, update memory, log results |
| `PreToolUse` | Before tool execution | Validate/modify tool calls | Add default parameters, validate inputs |
| `PreCompact` | Before context compaction | Preserve important context | Save key decisions, mark critical context |
| `UserPromptSubmit` | User sends message | Pre-process user input | Detect task type, recommend skills/agents |
| `Stop` | Stop button pressed | Handle interruption | Save state, create checkpoint |
| `Notification` | External event | Handle notifications | Process GitHub webhooks, CI/CD events |

### Hook Configuration

Hooks are defined in `hooks.json`:

```json
{
  "hooks": [
    {
      "name": "SessionStart",
      "enabled": true,
      "script": "hooks/session-start.js",
      "priority": 1
    },
    {
      "name": "PreToolUse",
      "enabled": true,
      "script": "hooks/pre-tool-use.js",
      "filters": {
        "tools": ["precision_write", "precision_edit"]
      }
    }
  ]
}
```

### Hook Execution Flow

```
User Input
   |
   v
[UserPromptSubmit] ─> Process/enhance input
   |
   v
Agent Processing
   |
   v
[PreToolUse] ─> Validate tool call
   |
   v
Tool Execution
   |
   v
Result
```

---

## Output Styles

GoodVibes provides two output styles for different workflows:

### vibecoding (Interactive)

**Best for**: Active development, learning, exploration

```yaml
communication:
  verbosity: standard
  show_thinking: true
  explain_decisions: true
  ask_on_ambiguity: true

execution:
  checkpoints: manual
  auto_chain: false
  autonomous_decisions: false

recovery:
  on_error: ask
  on_conflict: ask

output:
  default_mode: standard
  show_diffs: true
  show_validation: true
  log_location: terminal
```

### justvibes (Autonomous)

**Best for**: Large refactors, batch operations, background tasks

```yaml
communication:
  verbosity: minimal
  show_thinking: false
  explain_decisions: false
  ask_on_ambiguity: false

execution:
  checkpoints: automatic
  auto_chain: true
  autonomous_decisions: true

recovery:
  on_error: checkpoint_and_retry
  on_conflict: auto_resolve

output:
  default_mode: minimal
  show_diffs: false
  show_validation: false
  log_location: .goodvibes/logs/activity.md
```

### Comparison

| Aspect | vibecoding | justvibes |
|--------|------------|------------|
| **Communication** | Verbose, explanatory | Silent, logs only |
| **Decisions** | Ask user on ambiguity | Autonomous, best-guess |
| **Checkpoints** | Manual | Automatic |
| **Auto-chain** | No, wait for confirmation | Yes, continue automatically |
| **Output** | Standard verbosity, show diffs | Minimal verbosity, no diffs |
| **Logging** | Terminal | `.goodvibes/logs/activity.md` |
| **Best For** | Active development, learning | Large refactors, batch tasks |

### Switching Modes

Set in Claude Code configuration:

```json
{
  "outputStyle": "goodvibes:vibecoding"
}
```

Or:

```json
{
  "outputStyle": "goodvibes:justvibes"
}
```

---

## Memory System

GoodVibes uses a **two-tier memory system** for persistent knowledge:

### Directory Structure

```
.goodvibes/
├── logs/              # Session-level logs (cleared periodically)
│   ├── decisions.md   # Decisions made in current session
│   ├── errors.md      # Errors encountered in current session
│   └── activity.md    # Activity log (justvibes mode)
│
└── memory/            # Cross-session memory (persistent)
    ├── patterns.json  # Code patterns discovered
    ├── failures.json  # Failed approaches to avoid
    ├── decisions.json # Important decisions with context
    └── preferences.json # User preferences and conventions
```

### Logs (Session-Level)

**decisions.md**:
```markdown
# Decisions - 2026-01-25

## Use Zustand for State Management
- **When**: 14:32
- **Why**: Simpler API than Redux, better TypeScript support
- **Category**: library
- **Confidence**: high
```

**errors.md**:
```markdown
# Errors - 2026-01-25

## TypeScript Error in API Route
- **When**: 15:45
- **File**: src/app/api/users/route.ts
- **Error**: Type 'string | undefined' not assignable to 'string'
- **Fix**: Added null check with early return
```

**activity.md** (justvibes mode only):
```markdown
# Activity Log - 2026-01-25

14:30 - Started batch: refactor-imports
14:32 - Read 42 files
14:33 - Updated 38 files
14:35 - Validation passed
14:35 - Batch completed successfully
```

### Memory (Cross-Session)

**patterns.json**:
```json
{
  "patterns": [
    {
      "id": "api-route-structure",
      "pattern": "export async function GET/POST/PUT/DELETE",
      "context": "Next.js App Router API routes",
      "examples": ["src/app/api/users/route.ts"],
      "confidence": 0.95,
      "last_seen": "2026-01-25T14:30:00Z"
    }
  ]
}
```

**failures.json**:
```json
{
  "failures": [
    {
      "id": "prisma-client-import",
      "approach": "Import PrismaClient in API route",
      "why_failed": "Edge runtime doesn't support Prisma",
      "alternative": "Use Prisma Data Proxy or switch to Node runtime",
      "occurrences": 2,
      "last_failed": "2026-01-25T15:00:00Z"
    }
  ]
}
```

**decisions.json**:
```json
{
  "decisions": [
    {
      "id": "auth-provider",
      "what": "Use Clerk for authentication",
      "why": "Fastest setup, includes UI components, supports all OAuth providers",
      "category": "architecture",
      "confidence": "high",
      "alternatives_considered": ["NextAuth", "Lucia"],
      "created": "2026-01-20T10:00:00Z"
    }
  ]
}
```

**preferences.json**:
```json
{
  "preferences": {
    "code_style": {
      "quotes": "single",
      "semicolons": true,
      "trailing_comma": "es5"
    },
    "naming": {
      "components": "PascalCase",
      "files": "kebab-case",
      "functions": "camelCase"
    },
    "patterns": {
      "prefer_named_exports": true,
      "prefer_const": true
    }
  }
}
```

### Memory Operations

**Read memory**:
```yaml
state:
  type: query
  filters:
    kinds: [decision, pattern]
    keywords: ["authentication", "database"]
```

**Write memory**:
```yaml
state:
  type: track
  entries:
    - kind: decision
      data:
        what: "Use tRPC for API layer"
        why: "End-to-end type safety, same repo as frontend"
        category: "architecture"
        confidence: "high"
```

---

## Templates

GoodVibes includes **3 production-ready templates**:

### 1. next-saas

**Full-featured SaaS starter**

```yaml
Features:
  - Next.js 14+ (App Router)
  - Authentication (NextAuth)
  - Database (Prisma + PostgreSQL)
  - Payments (Stripe)
  - UI (shadcn/ui + Tailwind)
  - Email (Resend + React Email)
  - Analytics (Vercel Analytics)
  - Monitoring (Sentry)

Structure:
  src/
    app/           # App Router pages
    components/    # React components
    lib/          # Utilities
    server/       # tRPC API
  prisma/         # Database schema
  emails/         # Email templates
```

**Use when**: Building a SaaS product from scratch

### 2. next-app

**Minimal Next.js starter**

```yaml
Features:
  - Next.js 14+ (App Router)
  - TypeScript
  - Tailwind CSS
  - ESLint + Prettier

Structure:
  src/
    app/           # App Router pages
    components/    # React components
    lib/          # Utilities
```

**Use when**: Starting a simple Next.js project

### 3. vite-react

**Minimal Vite + React starter**

```yaml
Features:
  - Vite 5+
  - React 18+
  - TypeScript
  - Tailwind CSS (optional)
  - Vitest (optional)

Structure:
  src/
    components/
    App.tsx
    main.tsx
```

**Use when**: Building a client-side React app

### Using Templates

```yaml
# Scaffold new project
scaffold_project:
  template: "next-saas"
  name: "my-saas"
  options:
    auth: "clerk"
    database: "prisma"
    payments: "stripe"
    styling: "tailwind"

# List available templates
list_templates: {}
```

---

## Configuration

### plugin.json

Main plugin configuration:

```json
{
  "name": "goodvibes",
  "version": "1.0.0",
  "description": "Comprehensive Claude Code plugin",
  "engines": [
    {
      "name": "precision-engine",
      "command": "node",
      "args": ["dist/precision-engine/server.js"],
      "env": {}
    },
    {
      "name": "batch-engine",
      "command": "node",
      "args": ["dist/batch-engine/server.js"],
      "env": {}
    }
  ],
  "agents": [
    {
      "id": "engineer",
      "name": "Engineer",
      "description": "Full-stack development",
      "prompt_file": "agents/engineer.md"
    }
  ],
  "outputStyles": [
    {
      "id": "goodvibes:vibecoding",
      "name": "vibecoding",
      "prompt_file": "output-styles/vibecoding.md"
    },
    {
      "id": "goodvibes:justvibes",
      "name": "justvibes",
      "prompt_file": "output-styles/justvibes.md"
    }
  ]
}
```

### .mcp.json

MCP server configuration (auto-generated):

```json
{
  "mcpServers": {
    "plugin_goodvibes_precision-engine": {
      "command": "node",
      "args": ["dist/precision-engine/server.js"],
      "env": {},
      "disabled": false
    },
    "plugin_goodvibes_batch-engine": {
      "command": "node",
      "args": ["dist/batch-engine/server.js"],
      "env": {},
      "disabled": false
    }
  }
}
```

### hooks.json

Hook configuration:

```json
{
  "hooks": [
    {
      "name": "SessionStart",
      "enabled": true,
      "script": "hooks/session-start.js",
      "priority": 1,
      "config": {
        "auto_detect_stack": true,
        "load_preferences": true
      }
    },
    {
      "name": "PreToolUse",
      "enabled": true,
      "script": "hooks/pre-tool-use.js",
      "filters": {
        "tools": ["precision_write", "precision_edit"]
      }
    }
  ]
}
```

---

## Best Practices

### Before Any Task

1. **Detect the stack**:
   ```yaml
   detect_stack:
     path: "."
     include_versions: true
   ```

2. **Find relevant skills**:
   ```yaml
   recommend_skills:
     context:
       task: "Your task description"
       stack: ["detected", "frameworks"]
   ```

3. **Scan for patterns**:
   ```yaml
   scan_patterns:
     scope: ["src/**/*.ts"]
     patterns: ["api-routes", "components", "hooks"]
   ```

### During Execution

1. **Use precision tools** instead of system tools:
   - `precision_read` over `Read`
   - `precision_grep` over `Grep`
   - `precision_edit` over `Edit`
   - `precision_exec` over `Bash`

2. **Batch related operations**:
   ```yaml
   batch:
     id: task-name
     operations:
       read: [ ... ]
       write: [ ... ]
       exec: [ ... ]
   ```

3. **Enable checkpoints** for critical operations:
   ```yaml
   config:
     checkpoint:
       enabled: true
       before: ["write", "exec"]
       after: ["validate"]
   ```

4. **Use appropriate output modes**:
   - `count_only` for large scans
   - `minimal` for batch operations
   - `standard` for normal operations
   - `verbose` for debugging

### After Execution

1. **Validate changes**:
   ```yaml
   precision_exec:
     commands:
       - cmd: "npm run typecheck"
         expect: { exit_code: 0 }
       - cmd: "npm run lint"
         expect: { exit_code: 0 }
       - cmd: "npm run build"
         expect: { exit_code: 0 }
   ```

2. **Update memory**:
   ```yaml
   state:
     type: track
     entries:
       - kind: decision
         data: { ... }
       - kind: pattern
         data: { ... }
   ```

3. **Create meaningful commits**:
   - Follow conventional commits
   - Reference the batch ID in commit message
   - Include co-author tag

---

## Troubleshooting

### Common Issues

**Issue: MCP engine not starting**

```bash
# Check plugin status
/plugin-status

# Rebuild engines
npm run build

# Restart Claude Code
```

**Issue: Tool schema mismatch**

```bash
# Always check schema before calling
mcp-cli info <server>/<tool>

# Then make the call with correct parameters
mcp-cli call <server>/<tool> '<json>'
```

**Issue: Batch operation failed**

```yaml
# Check batch status
batch_status:
  batch_id: "your-batch-id"

# List checkpoints
batch_checkpoints:
  batch_id: "your-batch-id"

# Recover from checkpoint
batch_recover:
  batch_id: "your-batch-id"
  checkpoint_id: "checkpoint-id"
```

**Issue: Memory not persisting**

```bash
# Verify .goodvibes directory exists
ls -la .goodvibes/

# Check file permissions
ls -la .goodvibes/memory/

# Verify JSON is valid
cat .goodvibes/memory/decisions.json | jq .
```

**Issue: Skill not found**

```yaml
# Search for skill
search_skills:
  query: "skill-name"

# List all skills in category
search_skills:
  filters:
    category: ["webdev"]
    max_results: 100
```

---

## License

MIT License

Copyright (c) 2026 GoodVibes Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

---

<p align="center">
  <b>Plug in, receive good vibes</b>
  <br>
  <br>
  <code>claude plugin marketplace add mgd34msu/goodvibes-plugin</code>
  <br>
  <code>claude plugin install goodvibes@goodvibes-market</code>
</p>