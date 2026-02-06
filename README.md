# GoodVibes Plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.1.11-blue.svg)](https://github.com/mgd34msu/goodvibes-plugin)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)](https://claude.com/claude-code)

> Plug in. Receive good vibes.

A comprehensive Claude Code plugin that transforms AI-assisted development through intelligent automation, persistent memory, and production-ready tooling. Built for developers who want AI that learns from mistakes, recovers from errors, and delivers verified code.

## At a Glance

| Component | Count | What You Get |
|-----------|-------|-------------|
| **Agents** | 11 | Specialized roles with Opus/Sonnet models optimized for quality |
| **Skills** | 173 | Curated knowledge modules covering modern web stacks |
| **MCP Tools** | 75 | Enhanced precision tools across 6 specialized engines |
| **Hooks** | 10 | Lifecycle automation that runs transparently |
| **Output Styles** | 2 | Interactive (vibecoding) or fully autonomous (justvibes) |
| **Templates** | 3 | Production-ready scaffolds for Next.js and React projects |

## Why GoodVibes?

**Transparent Tool Enhancement** - PreToolUse hooks intercept native Claude Code tools (Read, Write, Edit, Grep, Glob) and automatically upgrade them to precision equivalents. Claude doesn't even know it's happening — you get token-efficient operations, batch support, and atomic transactions without changing how you work.

**Memory That Persists** - Two-tier memory system tracks decisions, patterns, failures, and preferences across sessions. The AI learns from past mistakes and applies discovered patterns consistently. Your second session is smarter than your first.

**Quality Without Friction** - WRFC loops (Write-Review-Fix-Check) ensure all code is reviewed before commit. Agents spawn reviewers automatically, fix issues in place, and only move forward when verified. No mocks, no placeholders, production-ready only.

**Autonomous When You Want It** - Switch between vibecoding (interactive, explanatory) and justvibes (silent, autonomous). Justvibes mode chains tasks automatically, makes best-guess decisions, and logs everything to `.goodvibes/logs` while you do something else.

**Specialized Intelligence** - 11 agents with distinct expertise (engineer, reviewer, tester, architect, deployer, three integrators, planner, two factories). Spawn them with focused context and budget. They consult memory, apply relevant skills, and return results.

## Installation

```bash
claude plugin marketplace add mgd34msu/goodvibes-plugin
claude plugin install goodvibes@goodvibes-market
```

That's it. Start Claude Code and GoodVibes auto-injects on session start:
- Stack detection (frameworks, languages, tools)
- Git context (branch, uncommitted changes)
- Project health check (missing deps, TypeScript errors)
- Memory loading (past decisions, patterns, failures)

Set your output style:
```bash
# Interactive mode
/output-style goodvibes:vibecoding

# Autonomous mode
/output-style goodvibes:justvibes
```

## What You Get

### Precision Engine (10 tools)

Enhanced file and command operations that replace Claude Code's native tools:

| Tool | Purpose |
|------|----------|
| `precision_read` | Read files with extract modes (content/outline/symbols/lines), image viewing (PNG/JPG/GIF/WebP/SVG), PDF text extraction, Jupyter notebook cells |
| `precision_write` | Batch writes, atomic transactions, backup mode, base64 encoding for special characters |
| `precision_edit` | Atomic edits with rollback, transaction support, validation hooks |
| `precision_grep` | Advanced search with output modes (content/files/count), context control, multiline patterns |
| `precision_glob` | Pattern matching with filters, sorted results, multiple output formats |
| `precision_symbols` | Extract functions, classes, interfaces, types from code |
| `precision_exec` | Execute commands with expectations (exit codes, output patterns), batch execution |
| `precision_fetch` | Fetch web content with markdown conversion, 15-min cache |
| `discover` | Run multiple grep/glob/symbol queries in parallel, aggregated results |
| `precision_config` | Toggle path sandboxing, configure precision engine behavior |

**Key Features:**
- Token efficiency: verbosity levels (count_only → minimal → standard → verbose)
- Batch operations: read/write/edit multiple files in one call
- Atomic transactions: all succeed or all rollback
- Path sandboxing: toggleable security boundary enforcement
- Mixed content: returns images as visual blocks + text content

### Analysis Engine (19 tools)

Codebase intelligence and validation:

| Category | Tools |
|----------|-------|
| **Detection** | detect-stack, check-versions, scan-patterns, read-config, get-conventions |
| **Code Quality** | find-dead-code, get-api-surface, safe-delete-check, identify-tech-debt |
| **Validation** | detect-breaking-changes, semantic-diff, validate-implementation, validate-edits-preview, validate-api-contract |
| **Security** | env-audit, scan-for-secrets, check-permissions |
| **Debugging** | parse-error-stack, explain-type-error |

### Project Engine (22 tools)

Full project lifecycle management:

| Category | Tools |
|----------|-------|
| **Scaffolding** | scaffold-project, list-templates |
| **Status** | plugin-status, project-issues |
| **API** | generate-openapi, get-api-routes |
| **Database** | get-database-schema, get-prisma-operations, query-database |
| **Maintenance** | upgrade-package, analyze-bundle, analyze-dependencies, find-circular-deps |
| **Testing** | find-tests-for-file, get-test-coverage, suggest-test-cases, generate-fixture |
| **TypeScript** | generate-types, sync-api-types, explain-codebase |
| **Git** | create-pull-request, resolve-merge-conflict |

### Frontend Engine (11 tools)

React and CSS deep analysis:

| Tool | Purpose |
|------|----------|
| `get-react-component-tree` | Extract component hierarchy |
| `analyze-stacking-context` | Debug z-index issues |
| `analyze-responsive-breakpoints` | Audit responsive design |
| `trace-component-state` | Trace state flow |
| `analyze-render-triggers` | Find unnecessary re-renders |
| `analyze-layout-hierarchy` | Debug layout issues |
| `diagnose-overflow` | Find overflow causes |
| `get-accessibility-tree` | Generate a11y tree |
| `get-sizing-strategy` | Analyze sizing approach |
| `analyze-event-flow` | Trace event propagation |
| `analyze-tailwind-conflicts` | Find conflicting Tailwind classes |

### Batch Engine (6 tools)

Orchestrated multi-operation workflows:

| Tool | Purpose |
|------|----------|
| `batch` | Execute batch operations (read, write, exec, query) with checkpoints |
| `batch-status` | Check running batch status |
| `batch-list` | List all batches (active, completed, failed) |
| `batch-recover` | Recover from checkpoint after failure |
| `batch-checkpoints` | List available checkpoints |
| `batch-state` | Query batch execution state |

### Registry Engine (7 tools)

Discover and manage skills, agents, and tools:

| Tool | Purpose |
|------|----------|
| `search-skills` | Search skills by query, filter by category |
| `search-agents` | Search agents by capability |
| `search-tools` | Search MCP tools |
| `recommend-skills` | Get context-aware skill recommendations |
| `get-skill-content` | Load skill content into context |
| `get-agent-content` | Load agent definition |
| `skill-dependencies` | Resolve skill dependencies |

## Agents

GoodVibes provides **11 specialized agents** with distinct expertise:

| Agent | Model | Specialization |
|-------|-------|----------------|
| **engineer** | Opus | Full-stack development (APIs, databases, auth, components, routing, styling) |
| **reviewer** | Opus | Code quality, security, type safety, WRFC loop execution |
| **tester** | Sonnet | Test generation, coverage analysis, fixture creation |
| **architect** | Opus | System design, architecture decisions, refactoring patterns |
| **deployer** | Sonnet | CI/CD, Docker, GitHub Actions, cloud deployment |
| **integrator-ai** | Opus | AI/ML integrations (OpenAI, Anthropic, Hugging Face, Vercel AI SDK) |
| **integrator-services** | Sonnet | Third-party services (Stripe, Clerk, Resend, Cloudinary, S3) |
| **integrator-state** | Sonnet | State management setup (Redux, Zustand, Jotai, TanStack Query) |
| **planner** | Opus | Task breakdown, dependency mapping, risk assessment |
| **agent-factory** | Opus | Create new specialized agents with Agent SDK |
| **skill-factory** | Opus | Create new skills, knowledge extraction |

## Skills (173 total)

Curated knowledge modules organized by technology:

| Category | Count | Examples |
|----------|-------|----------|
| **Common** | 29 | Development, quality, review, tooling, workflow |
| **WebDev** | 138 | Frameworks, libraries, databases, auth, deployment, testing |
| **Creation** | 5 | Agent SDK, hooks, scripts, workflow patterns |
| **Special** | 1 | goodvibes-codebase-review (comprehensive audit with parallel remediation) |

**WebDev Skills Breakdown (138):**
- AI Integration (1): vercel-ai-sdk
- Animation (1): framer-motion
- API Layer (8): trpc, graphql, rest-api-design, express, fastify, hono, apollo-server, openapi
- Authentication (7): clerk, nextauth, lucia, auth0, firebase-auth, supabase-auth, passport
- Build Tools (7): vite, webpack, turbopack, esbuild, rollup, tsup, bun
- Component Libraries (8): shadcn-ui, radix-ui, chakra-ui, mantine, material-ui, ant-design, headless-ui, ark-ui
- Databases & ORMs (10): prisma, drizzle, kysely, postgresql, mongodb, redis, supabase-db, planetscale, turso, sqlite
- Deployment (8): vercel, netlify, cloudflare-pages, docker-web, railway, render, fly-io, aws-amplify
- Forms & Validation (6): zod, react-hook-form, valibot, yup, formik, conform
- Frontend Core (10): react, vue, svelte, typescript, javascript-modern, solidjs, preact, htmx, alpine-js, web-components
- Meta Frameworks (8): nextjs, remix, nuxt, astro, sveltekit, qwik, solidstart, gatsby
- State Management (7): zustand, jotai, redux-toolkit, tanstack-query, valtio, nanostores, pinia
- Styling (8): tailwindcss, styled-components, css-modules, sass-scss, panda-css, vanilla-extract, unocss, css-variables
- Testing (8): vitest, playwright, jest, testing-library, cypress, storybook, msw, chromatic
- Plus 50+ specialized skills: stripe, resend, sentry, socket-io, mdx, and more

## Hooks (10 types)

Lifecycle automation that runs transparently:

| Hook | Trigger | What It Does |
|------|---------|-------------|
| `PreToolUse` | Before tool execution | Redirects native tools to precision equivalents, validates inputs |
| `PostToolUseFailure` | Tool execution fails | Provides recovery guidance, suggests alternatives |
| `SessionStart` | Session begins | Auto-detects stack, loads memory, injects context |
| `SessionEnd` | Session ends | Persists decisions, updates memory, generates summary |
| `SubagentStart` | Subagent spawned | Injects context, loads relevant skills, sets budget |
| `SubagentStop` | Subagent completes | Harvests learnings, updates memory, logs results |
| `PreCompact` | Before context compaction | Preserves critical context (decisions, patterns) |
| `Stop` | Stop button pressed | Creates checkpoint, saves state |
| `Notification` | External event | Handles GitHub webhooks, CI/CD events |
| `UserPromptSubmit` | User sends message | Detects task type, recommends skills/agents |

## Output Styles

Two modes for different workflows:

| Aspect | vibecoding | justvibes |
|--------|------------|------------|
| **Communication** | Verbose, explanatory | Silent, logs only |
| **Decisions** | Ask user on ambiguity | Autonomous, best-guess |
| **Checkpoints** | Manual | Automatic |
| **Auto-chain Tasks** | No, wait for confirmation | Yes, continue automatically |
| **Output** | Standard verbosity, show diffs | Minimal verbosity, no diffs |
| **Logging** | Terminal | `.goodvibes/logs/activity.md` |
| **Max Parallel Agents** | 6 | 6 |
| **WRFC Loops** | Yes | Yes |
| **Best For** | Active development, learning | Large refactors, batch operations |

Switch modes in Claude Code config:
```json
{
  "outputStyle": "goodvibes:vibecoding"  // or "goodvibes:justvibes"
}
```

## Memory System

Two-tier memory that learns and persists:

**Session Logs** (cleared periodically):
- `.goodvibes/logs/decisions.md` - Decisions made in current session
- `.goodvibes/logs/errors.md` - Errors encountered and how they were fixed
- `.goodvibes/logs/activity.md` - Activity log (justvibes mode)

**Cross-Session Memory** (persistent):
- `.goodvibes/memory/patterns.json` - Code patterns discovered in your codebase
- `.goodvibes/memory/failures.json` - Failed approaches to avoid
- `.goodvibes/memory/decisions.json` - Important decisions with rationale
- `.goodvibes/memory/preferences.json` - User preferences and conventions

Agents consult memory before acting. Same bug? Already knows the fix. Same pattern? Applies it consistently.

## Templates

Production-ready project scaffolds:

| Template | Stack | Use Case |
|----------|-------|----------|
| **next-saas** | Next.js 15, NextAuth, Prisma, Stripe, shadcn/ui, Tailwind, Resend, Sentry | Full SaaS starter with auth, payments, email |
| **next-app** | Next.js 14+, TypeScript, Tailwind, ESLint | Minimal Next.js App Router starter |
| **vite-react** | Vite 5+, React 18+, TypeScript, Tailwind, Vitest | Client-side React app |

Scaffold with:
```bash
# In Claude Code:
"Create a new SaaS project using the next-saas template"
```

## Configuration

Minimal setup required. GoodVibes works out of the box.

**Toggle path sandboxing** (security boundary enforcement):
```bash
# In Claude Code:
/goodvibes:sandbox on   # Enable sandboxing (default)
/goodvibes:sandbox off  # Disable sandboxing
```

**Or use precision_config tool:**
```yaml
precision_config:
  action: "set"
  key: "allowExternalPaths"
  value: true  # Disable sandboxing
```

**Environment variable** (alternative):
```bash
ALLOW_EXTERNAL_PATHS=true claude
```

All other configuration happens automatically through hooks and memory.

## How It Works

**1. SessionStart Hook Fires**
- Detects your stack (frameworks, databases, tools)
- Loads memory (past decisions, patterns, failures)
- Scans for project health issues (missing deps, TypeScript errors)
- Injects context into Claude's system prompt

**2. PreToolUse Hook Intercepts Native Tools**
- Claude calls `Read` → hook redirects to `precision_read`
- Claude calls `Edit` → hook redirects to `precision_edit`
- Claude calls `Grep` → hook redirects to `precision_grep`
- Claude doesn't know, you get better tools automatically

**3. Agents Spawn With Context**
- Main agent spawns engineer for implementation
- Engineer consults memory for patterns
- Engineer loads relevant skills (nextjs, prisma, etc.)
- Engineer implements with DBE Loop (Discover-Batch-Execute)

**4. WRFC Loop Ensures Quality**
- Engineer completes work
- Reviewer agent spawns automatically
- Reviewer checks security, type safety, error handling
- If issues found, engineer fixes, reviewer checks again
- Loop continues until verified

**5. Memory Updates**
- Decisions logged to `.goodvibes/memory/decisions.json`
- Patterns logged to `.goodvibes/memory/patterns.json`
- Failures logged to `.goodvibes/memory/failures.json`
- Next session starts smarter

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
