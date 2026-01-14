# GoodVibes Plugin for Claude Code

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-blueviolet)](https://github.com/anthropics/claude-code)

A comprehensive automation plugin that supercharges Claude Code with intelligent context injection, persistent memory, smart error recovery, automated quality gates, and a library of 170+ development skills.

**Plug in. Receive good vibes.**

---

## What's Inside

| Category | Count | Description |
|----------|-------|-------------|
| **Skills** | 172 | Production-ready patterns for frameworks, libraries, and tools |
| **MCP Tools** | 91 | Code intelligence, validation, and automation tools |
| **Agents** | 11 | Specialized AI agents for different development domains |
| **Hooks** | 12 | Lifecycle automation for sessions, tools, and agents |
| **Output Styles** | 2 | Autonomous development modes |
| **Templates** | 3 | Project scaffolding templates |

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [MCP Tools](#mcp-tools)
- [Hook Events](#hook-events)
- [Skills Library](#skills-library)
- [Agents](#agents)
- [Slash Commands](#slash-commands)
- [Output Styles](#output-styles)
- [Project Templates](#project-templates)
- [Configuration](#configuration)
- [Memory System](#memory-system)
- [Directory Structure](#directory-structure)
- [Development](#development)
- [License](#license)

---

## Features

### Smart Context Injection

Automatically injects project context at session start:

- **Stack Detection** - Identifies frameworks, languages, and tools (Next.js, Vite, TypeScript, etc.)
- **Git Context** - Current branch, uncommitted changes, recent commits
- **Environment Status** - Missing env vars, `.env` file presence
- **Project Health** - `node_modules` status, lockfile issues, TypeScript config
- **TODO Scanner** - Finds TODOs/FIXMEs in codebase
- **Recent Activity** - Hotspots, recently modified files
- **Port Checker** - Active dev servers on common ports

### Persistent Memory System

Cross-session memory stored in `.goodvibes/memory/`:

| File | Purpose |
|------|---------|
| `decisions.md` | Architectural decisions and rationale |
| `patterns.md` | Code patterns and conventions discovered |
| `failures.md` | Past failures and solutions |
| `preferences.md` | User preferences learned |

### Smart Error Recovery

3-phase error recovery with escalating research:

1. **Phase 1** - Fix attempts with existing knowledge
2. **Phase 2** - Search official documentation
3. **Phase 3** - Search community solutions (Stack Overflow, GitHub)

### Pre-Commit Quality Gates

Automatic quality checks before commits:

- TypeScript type checking
- ESLint with auto-fix
- Prettier formatting
- Test runner integration

### Subagent Telemetry

Comprehensive tracking of subagent activity:

- Start/stop timestamps and duration
- Task descriptions and outcomes
- Keyword extraction from transcripts
- Monthly JSONL telemetry logs

### Auto-Checkpoint Commits

Automatic checkpoint commits based on:

- File modification count thresholds
- Time intervals
- Agent completion events

### Crash Recovery

Detects unclean session terminations and provides recovery context.

---

## Installation

### From Plugin Marketplace

```bash
# Add the marketplace
claude plugin marketplace add mgd34msu/goodvibes-plugin

# Install the plugin
claude plugin install goodvibes@goodvibes-market
```

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/mgd34msu/goodvibes.sh vibeplug
cd vibeplug

# Install for current project
claude plugin install ./plugins/goodvibes --scope project

# Or install user-wide
claude plugin install ./plugins/goodvibes --scope user
```

### Build from Source

```bash
cd plugins/goodvibes

# Install dependencies and build everything
npm install
npm run build

# Or build components individually:
npm run build:registries    # Build skill/agent/tool registries
npm run build:server        # Build MCP server
npm run build:hooks         # Build hook scripts
```

---

## Quick Start

Once installed, GoodVibes automatically enhances your Claude Code sessions:

1. **Start a session** - Context is automatically injected
2. **Use slash commands** - `/goodvibes:search`, `/goodvibes:load-skill`, `/goodvibes:plugin-status`
3. **Let agents help** - Specialists are available for backend, frontend, testing, and more
4. **Enable output styles** - Try `vibecoding` or `justvibes` for autonomous development

---

## MCP Tools

GoodVibes provides **91 MCP tools** organized into categories:

### Discovery & Search (7 tools)

| Tool | Description |
|------|-------------|
| `search_skills` | Search skill registry by keyword |
| `search_agents` | Search agent registry by expertise |
| `search_tools` | Search available tools |
| `recommend_skills` | Analyze task and recommend relevant skills |
| `get_skill_content` | Load full skill content by path |
| `get_agent_content` | Load full agent content by path |
| `skill_dependencies` | Show skill relationships and dependencies |

### Context Gathering (6 tools)

| Tool | Description |
|------|-------------|
| `detect_stack` | Analyze project technology stack |
| `check_versions` | Get installed package versions |
| `scan_patterns` | Identify code patterns and conventions |
| `fetch_docs` | Fetch library documentation |
| `read_config` | Parse configuration files (JSON, YAML, JS, TS) |
| `get_conventions` | LLM-powered convention analysis |

### Schema & API (5 tools)

| Tool | Description |
|------|-------------|
| `generate_openapi` | Generate OpenAPI spec from routes |
| `get_schema` | Introspect database schema |
| `get_database_schema` | Auto-detect and extract DB schema |
| `get_api_routes` | Extract API routes from frameworks |
| `get_prisma_operations` | Find Prisma usages and N+1 patterns |

### LSP Code Navigation (18 tools)

| Tool | Description |
|------|-------------|
| `find_references` | Find all references to symbol |
| `go_to_definition` | Go to symbol definition |
| `get_implementations` | Find interface implementations |
| `rename_symbol` | Get edits for safe rename |
| `get_code_actions` | Get quick fixes and refactorings |
| `apply_code_action` | Get file edits for code action |
| `get_symbol_info` | Get detailed symbol information |
| `get_call_hierarchy` | Get call hierarchy (incoming/outgoing) |
| `get_type_hierarchy` | Get type inheritance hierarchy |
| `get_document_symbols` | Get structural outline of document |
| `get_signature_help` | Get signature help at call site |
| `get_diagnostics` | Get TypeScript diagnostics |
| `find_dead_code` | Find unused exports and functions |
| `get_api_surface` | Analyze public vs internal API |
| `safe_delete_check` | Confirm zero external usages |
| `get_inlay_hints` | Get inferred types where implicit |
| `workspace_symbols` | Search symbols across workspace |
| `semantic_diff` | LLM-powered type-aware diff |

### Frontend Analysis (11 tools)

| Tool | Description |
|------|-------------|
| `get_react_component_tree` | Build React component hierarchy |
| `analyze_stacking_context` | Analyze z-index and stacking contexts |
| `analyze_responsive_breakpoints` | Analyze Tailwind responsive classes |
| `trace_component_state` | Trace React state through component trees |
| `analyze_render_triggers` | Analyze React re-render causes |
| `analyze_layout_hierarchy` | Analyze CSS layout hierarchy |
| `diagnose_overflow` | Diagnose CSS overflow issues |
| `get_accessibility_tree` | Build a11y tree and detect WCAG issues |
| `get_sizing_strategy` | Analyze element sizing strategy |
| `analyze_event_flow` | Analyze event handling and propagation |
| `analyze_tailwind_conflicts` | Detect conflicting Tailwind classes |

### Validation & Testing (7 tools)

| Tool | Description |
|------|-------------|
| `validate_implementation` | Check code matches skill patterns |
| `run_smoke_test` | Quick verification of generated code |
| `check_types` | Run TypeScript type checking |
| `validate_edits_preview` | Preview edit impact before applying |
| `find_tests_for_file` | Find tests covering a source file |
| `get_test_coverage` | Parse test coverage reports |
| `suggest_test_cases` | LLM-powered test case suggestions |

### Error & Debugging (4 tools)

| Tool | Description |
|------|-------------|
| `parse_error_stack` | Parse and analyze error stacks |
| `explain_type_error` | Explain TS errors with fixes |
| `detect_memory_leaks` | Monitor memory usage for leaks |
| `log_analyzer` | Analyze logs for patterns and anomalies |

### Dependency Analysis (3 tools)

| Tool | Description |
|------|-------------|
| `analyze_dependencies` | Find unused/missing/outdated packages |
| `find_circular_deps` | Detect circular import dependencies |
| `detect_breaking_changes` | LLM-powered breaking change detection |

### Security (2 tools)

| Tool | Description |
|------|-------------|
| `scan_for_secrets` | Scan for credentials and sensitive data |
| `check_permissions` | Analyze file/network/system access |

### Environment & Package (4 tools)

| Tool | Description |
|------|-------------|
| `get_env_config` | Find all env variable usages |
| `validate_env_complete` | Validate env vars complete and documented |
| `upgrade_package` | Upgrade npm package with breaking change detection |
| `query_database` | Execute SQL queries (PostgreSQL, MySQL, SQLite) |

### Build & Performance (2 tools)

| Tool | Description |
|------|-------------|
| `analyze_bundle` | Analyze bundle size and tree-shaking |
| `profile_function` | Profile function performance |

### Process Management (3 tools)

| Tool | Description |
|------|-------------|
| `start_dev_server` | Start dev server and return when ready |
| `health_monitor` | Monitor URL endpoint health |
| `watch_for_errors` | Monitor logs for errors |

### Runtime Verification (4 tools)

| Tool | Description |
|------|-------------|
| `browser_automation` | Automate browser with Puppeteer |
| `verify_runtime_behavior` | Execute code and verify results |
| `lighthouse_audit` | Run Lighthouse audits |
| `visual_regression` | Visual regression testing |

### Self-Correction (4 tools)

| Tool | Description |
|------|-------------|
| `retry_with_learning` | Retry with progressive fix strategies |
| `atomic_multi_edit` | Apply edits atomically with rollback |
| `auto_rollback` | Automatically rollback on failure |
| `validate_api_contract` | Validate API responses against OpenAPI |

### Type Generation (3 tools)

| Tool | Description |
|------|-------------|
| `sync_api_types` | Detect type drift between backend/frontend |
| `generate_fixture` | Generate test fixtures from schemas |
| `generate_types` | Generate TS types from various sources |

### Git & Documentation (3 tools)

| Tool | Description |
|------|-------------|
| `create_pull_request` | Create GitHub PR with auto-generated descriptions |
| `resolve_merge_conflict` | Analyze and suggest merge conflict resolutions |
| `explain_codebase` | Generate high-level codebase explanation |

### Project Management (3 tools)

| Tool | Description |
|------|-------------|
| `list_templates` | List available project templates |
| `scaffold_project` | Create project from template |
| `plugin_status` | Check GoodVibes plugin health |
| `project_issues` | Get detailed project issues |
| `identify_tech_debt` | Identify and grade technical debt |

---

## Hook Events

GoodVibes uses Claude Code's hook system to provide intelligent automation at key lifecycle moments:

| Hook | Trigger | Purpose |
|------|---------|---------|
| `SessionStart` | Session startup/resume | Context injection, crash recovery, memory loading |
| `SessionEnd` | Session termination | Cleanup, state persistence |
| `PreToolUse` | Before MCP tool execution | Quality gates, validation, caching |
| `PostToolUse` | After successful tool execution | File tracking, checkpoints, dev server monitoring |
| `PostToolUseFailure` | After tool failure | 3-phase error recovery with escalating research |
| `SubagentStart` | When subagent spawns | Telemetry capture, context injection |
| `SubagentStop` | When subagent completes | Output validation, test verification, telemetry |
| `PreCompact` | Before context compaction | State preservation, checkpoint creation |
| `Stop` | When user stops execution | Graceful shutdown, state saving |
| `UserPromptSubmit` | When user submits prompt | Input processing |
| `PermissionRequest` | When permission is requested | Auto-approval for known-safe operations |
| `Notification` | System notifications | Logging, monitoring |

### Hook Configuration

Hooks are configured in `plugins/goodvibes/hooks/hooks.json` and implemented as TypeScript scripts in `plugins/goodvibes/hooks/scripts/src/`.

---

## Skills Library

GoodVibes includes **172 skills** organized by domain:

### Categories

```
skills/
├── common/                   # Cross-cutting concerns (29 skills)
│   ├── development/          # Architecture, code organization, debugging
│   ├── quality/              # Code quality, security audits
│   ├── review/               # Code review patterns
│   ├── tooling/              # MCP mastery, tooling
│   └── workflow/             # Git workflows, planning, documentation
├── create/                   # Plugin creation skills (5 skills)
└── webdev/                   # Web development (138 skills)
    ├── ai-integration/       # Vercel AI SDK
    ├── animation/            # Framer Motion, GSAP, CSS animations
    ├── api-layer/            # REST, GraphQL, tRPC, Express, Fastify, Hono
    ├── authentication/       # Clerk, NextAuth, Auth0, Firebase, Lucia
    ├── build-tools/          # Vite, Webpack, esbuild, Turbopack
    ├── cms-content/          # MDX, Sanity, Contentful, Strapi
    ├── component-libraries/  # shadcn/ui, Radix, Chakra, MUI, Mantine
    ├── databases-orms/       # Prisma, Drizzle, PostgreSQL, MongoDB
    ├── deployment/           # Vercel, Netlify, Cloudflare, Docker, Railway
    ├── email/                # Resend, SendGrid, Nodemailer
    ├── forms/                # React Hook Form, Zod, Formik
    ├── frontend-core/        # React, Vue, Svelte, SolidJS, TypeScript
    ├── meta-frameworks/      # Next.js, Nuxt, Remix, Astro, SvelteKit
    ├── monitoring-analytics/ # Sentry, PostHog, Vercel Analytics
    ├── payments/             # Stripe, LemonSqueezy, Paddle
    ├── realtime-websockets/  # Socket.IO, Pusher, PartyKit
    ├── state-management/     # Zustand, TanStack Query, Jotai, Redux
    ├── styling/              # Tailwind CSS, CSS Modules, styled-components
    └── testing/              # Vitest, Playwright, Jest, Testing Library
```

### Using Skills

```bash
# Search for skills
/goodvibes:search skills authentication

# Load a specific skill
/goodvibes:load-skill webdev/authentication/clerk

# Let Claude recommend skills based on your task
# (Uses recommend_skills MCP tool automatically)
```

### Skill Structure

Each skill is a markdown file containing:

- Description and use cases
- Prerequisites and dependencies
- Implementation patterns
- Code examples
- Best practices
- Common pitfalls

---

## Agents

GoodVibes provides **11 specialized agents** for different development tasks:

### Meta Agents

| Agent | Description |
|-------|-------------|
| `factory` | Creates new specialized agents for specific domains |
| `skill-creator` | Creates and updates skills and slash commands |

### Web Development Agents

| Agent | Description |
|-------|-------------|
| `backend-engineer` | API design, databases, authentication |
| `frontend-architect` | UI components, styling, accessibility |
| `fullstack-integrator` | State management, forms, real-time, AI integration |
| `test-engineer` | Testing strategies and implementation |
| `brutally-honest-reviewer` | Honest, detailed code reviews |
| `code-architect` | Refactoring and architecture decisions |
| `devops-deployer` | CI/CD, deployment, infrastructure |
| `content-platform` | CMS, email, payments, uploads |
| `workflow-planner` | Complex task breakdown and planning |

### Using Agents

Agents are spawned automatically based on task context, or explicitly via the Task tool:

```
Use the backend-engineer agent to design the API for user authentication.
```

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/goodvibes:search [skills\|agents\|tools] <query>` | Search plugin resources |
| `/goodvibes:load-skill <skill-name-or-path>` | Load a skill's full content |
| `/goodvibes:plugin-status` | Show plugin health and statistics |

---

## Output Styles

GoodVibes includes two autonomous development modes:

### Vibecoding

Autonomous orchestration mode with rapid agent delegation:

- Makes reasonable assumptions instead of asking questions
- Proactively spawns specialist agents
- Ships enterprise-grade code (no mocks, no placeholders)
- Automatic agent chaining for complete workflows
- Context window management (keeps main context window clean)

### JustVibes

Fully autonomous silent execution mode:

- No questions - makes best decisions and executes
- No progress reports - user sees results when done
- All activity logged to `.goodvibes/logs/`
- Maximum autonomy for well-defined tasks

### Enabling Output Styles

Output styles are activated through Claude Code's output style settings.

---

## Project Templates

GoodVibes includes project templates for quick starts:

### Minimal Templates

| Template | Description |
|----------|-------------|
| `next-app` | Next.js 15 with TypeScript, Tailwind, ESLint |
| `vite-react` | Vite + React 19 with TypeScript, Tailwind |

### Full Templates

| Template | Description |
|----------|-------------|
| `next-saas` | Full-stack SaaS with NextAuth, Prisma, Stripe, Tailwind |

### Using Templates

```bash
# List available templates
mcp-cli call goodvibes-tools/list_templates '{}'

# Scaffold a new project
mcp-cli call goodvibes-tools/scaffold_project '{"template": "next-saas", "name": "my-app"}'
```

---

## Configuration

### Plugin Configuration

Configure via `.goodvibes/settings.json`:

```json
{
  "autoCheckpoint": {
    "enabled": true,
    "fileThreshold": 5,
    "timeThresholdMinutes": 30
  },
  "qualityGates": {
    "typeCheck": true,
    "lint": true,
    "format": true,
    "test": false
  },
  "contextInjection": {
    "stackDetection": true,
    "gitContext": true,
    "todoScanner": true,
    "healthCheck": true
  },
  "telemetry": {
    "enabled": true,
    "logPath": ".goodvibes/telemetry"
  }
}
```

### MCP Server Configuration

The MCP server is configured in `plugins/goodvibes/.mcp.json`:

```json
{
  "mcpServers": {
    "goodvibes-tools": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/tools/implementations/tool-search-server/dist/index.js"],
      "env": {
        "PLUGIN_ROOT": "${CLAUDE_PLUGIN_ROOT}",
        "NODE_ENV": "production"
      }
    }
  }
}
```

---

## Memory System

GoodVibes maintains persistent memory across sessions in `.goodvibes/memory/`:

| File | Purpose |
|------|---------|
| `decisions.md` | Architectural decisions with rationale |
| `patterns.md` | Code patterns and conventions discovered |
| `failures.md` | Past failures and their solutions |
| `preferences.md` | User preferences and settings |

Memory is automatically loaded at session start and updated as Claude learns about your project.

---

## Directory Structure

```
vibeplug/
├── .claude/                    # Claude Code configuration
├── .claude-plugin/             # Plugin marketplace configuration
│   └── marketplace.json
├── .goodvibes/                 # Local state (gitignored)
│   ├── memory/                 # Persistent memory files
│   ├── state/                  # Session state
│   ├── logs/                   # Activity logs
│   └── telemetry/              # Telemetry logs
├── plugins/
│   └── goodvibes/              # Main plugin directory
│       ├── .claude-plugin/     # Plugin manifest
│       ├── .mcp.json           # MCP server config
│       ├── .lsp.json           # LSP server config
│       ├── agents/             # 11 specialized agents
│       │   ├── _registry.yaml
│       │   ├── factory.md
│       │   ├── skill-creator.md
│       │   └── webdev/         # Web development agents
│       ├── commands/           # 3 slash commands
│       ├── hooks/              # Lifecycle hooks
│       │   ├── hooks.json      # Hook configuration
│       │   └── scripts/        # TypeScript implementations
│       ├── output-styles/      # Vibecoding and JustVibes modes
│       ├── skills/             # 172 development skills
│       │   ├── _registry.yaml
│       │   ├── common/
│       │   ├── create/
│       │   └── webdev/
│       ├── templates/          # Project templates
│       │   ├── minimal/
│       │   └── full/
│       └── tools/              # MCP tools
│           ├── _registry.yaml
│           ├── definitions/    # Tool definitions (YAML)
│           └── implementations/
│               └── tool-search-server/
└── README.md
```

---

## Development

### Prerequisites

- Node.js 18+
- npm 9+
- Claude Code CLI

### Building

```bash
cd plugins/goodvibes

# Build everything
npm run build

# Build individual components
npm run build:registries    # Rebuild skill/agent/tool registries
npm run build:server        # Rebuild MCP server
npm run build:hooks         # Rebuild hook scripts
```

### Testing

```bash
cd plugins/goodvibes/hooks/scripts

# Run all tests
npm test

# Run tests with coverage
npm run test:coverage
```

The test suite includes 262+ tests covering:

- State management
- Automation modules (fix-loop, git-operations, build/test runners)
- Context modules (stack-detector, git-context, health-checker)
- Memory system
- Hook utilities
- Telemetry

### Validation

```bash
cd plugins/goodvibes

# Validate plugin structure and registries
npm run validate
```

---

## Resources

- **Repository**: https://github.com/mgd34msu/goodvibes-plugin
- **Website**: https://goodvibes.sh
- **Issues**: https://github.com/mgd34msu/goodvibes-plugin/issues

---

## License

MIT License

Copyright (c) 2025 GoodVibes Contributors

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

**Built with good vibes for the Claude Code community.**
