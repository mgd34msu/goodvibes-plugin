# GoodVibes Plugin v1.0.0

> **Release Date:** January 28, 2026
> **Type:** Initial Public Release
> **Status:** Stable

---

## Introducing GoodVibes

**Plug in. Receive good vibes.**

GoodVibes is a comprehensive Claude Code plugin that transforms AI-assisted development through batch-first operations, precision tools, and autonomous execution. This initial release delivers a complete ecosystem for enterprise-grade, AI-powered software development.

### What Makes GoodVibes Different?

Most AI coding tools fail silently. They hit an error, give up, and hand you back a broken mess. **GoodVibes doesn't.** It recovers, learns, and delivers verified code.

---

## Release Overview

| Component | Count | Description |
|-----------|-------|-------------|
| **Agents** | 9 | Specialized roles (engineer, reviewer, tester, architect, deployer, integrator, planner, factories) |
| **Skills** | 173 | Reusable knowledge modules across all tech stacks |
| **MCP Tools** | 74 | Precision tools across 6 specialized engines |
| **Hooks** | 9 | Lifecycle event handlers for automation |
| **Output Styles** | 2 | vibecoding (interactive) and justvibes (autonomous) |
| **Templates** | 3 | Production-ready project scaffolds |

---

## Key Features

### 1. Token-Efficient Precision Tools

Native Claude Code tools return verbose output that rapidly consumes context. GoodVibes' Precision Engine provides graduated output modes:

```yaml
precision_read:
  files: ["src/auth.ts"]
  extract: outline  # Just the structure, not full content

precision_grep:
  pattern: "useState"
  output: { format: "files_only" }  # 45x token reduction
```

### 2. WRFC Loop (Write-Review-Fix-Check)

Every code change goes through systematic quality assurance:

```
WORK → REVIEW → FIX → CHECK
                 ↑      |
                 └──────┘ (repeat until verified)
```

When the loop completes, code is committed. No unverified changes reach your codebase.

### 3. Specialized Agents

| Agent | Specialty | Best For |
|-------|-----------|----------|
| `engineer` | Full-stack implementation | Features, APIs, components |
| `reviewer` | Quality assessment | Code review, security audit |
| `tester` | Test engineering | Unit, integration, E2E tests |
| `architect` | System design | Planning, refactoring |
| `deployer` | DevOps | CI/CD, Docker, cloud |
| `integrator` | Complex features | State, real-time, AI |
| `planner` | Project planning | Task breakdown |
| `agent-factory` | Meta-agent | Create new agents |
| `skill-factory` | Meta-agent | Create new skills |

### 4. Persistent Memory System

Two-tier memory that persists across sessions:

- **Decisions**: Architectural choices and rationale, searchable forever
- **Patterns**: Code conventions discovered in your codebase
- **Failures**: Past errors and their solutions—same bug? Already knows the fix

### 5. Two Execution Modes

**vibecoding** (Interactive)
- User sees every decision
- Asks on ambiguity
- Best for learning and exploration

**justvibes** (Autonomous)
- Silent execution with file logging
- Up to 6 parallel agents
- Best for large refactors and batch operations

---

## Installation

### Prerequisites

- Claude Code CLI (latest version)
- Node.js 20+ (for MCP servers)
- Git (for version control integration)

### Install via Marketplace

```bash
claude plugin marketplace add mgd34msu/goodvibes-plugin
claude plugin install goodvibes@goodvibes-market
```

### Or Clone Directly

```bash
git clone https://github.com/mgd34msu/goodvibes-plugin ~/.claude/plugins/goodvibes
cd ~/.claude/plugins/goodvibes
npm install && npm run build
```

### First Run

```bash
# Start Claude Code (recommended: bypass permissions for full power)
claude --dangerously-skip-permissions

# Set your output style
/output-style goodvibes:vibecoding  # Interactive mode
# or
/output-style goodvibes:justvibes   # Autonomous mode
```

---

## Quick Start

### 1. Detect Your Stack

```
You: "Detect the stack for this project"

GoodVibes: Uses detect_stack to identify frameworks, libraries, and tools
```

### 2. Find Relevant Skills

```
You: "Find skills related to authentication with NextAuth"

GoodVibes: Searches 173 skills and loads the relevant ones into context
```

### 3. Build a Feature

```
You: "Add user authentication with email/password"

GoodVibes:
1. Planner breaks down: schema, API routes, middleware, UI components
2. Engineer implements each task
3. Reviewer verifies against requirements
4. Fix loop if issues found
5. Commits verified code
6. Reports completion
```

---

## MCP Tool Engines

### Precision Engine (9 tools)
| Tool | Purpose |
|------|---------|
| `precision_read` | Read files with extract modes (outline, symbols, content) |
| `precision_write` | Batch file creation with backup modes |
| `precision_edit` | Atomic edits with transactions |
| `precision_grep` | Pattern search with output control |
| `precision_glob` | File finding with filters |
| `precision_symbols` | Extract code symbols |
| `precision_exec` | Command execution with validation |
| `precision_fetch` | Web content fetching |
| `discover` | Parallel multi-query discovery |

### Batch Engine (6 tools)
Orchestrate multi-operation workflows with atomic transactions, checkpoints, and recovery.

### Registry Engine (7 tools)
Discover and load skills, agents, and tools on-demand.

### Analysis Engine (19 tools)
Stack detection, pattern scanning, breaking change detection, security auditing, and debugging.

### Project Engine (22 tools)
Project scaffolding, database operations, Git workflows, and documentation.

### Frontend Engine (11 tools)
React component analysis, accessibility auditing, CSS debugging, and Tailwind conflict resolution.

---

## Skills Library

**173 curated skills** covering:

- **AI Integration**: Vercel AI SDK, OpenAI, Anthropic, LangChain
- **Authentication**: NextAuth, Clerk, Auth0, Firebase, Lucia, Supabase
- **Databases**: Prisma, Drizzle, PostgreSQL, MongoDB, Redis, Turso
- **Frameworks**: Next.js, Nuxt, Remix, Astro, SvelteKit, SolidStart
- **Styling**: Tailwind, CSS Modules, Sass, styled-components, Panda CSS
- **Testing**: Vitest, Playwright, Jest, Testing Library, Cypress
- **Deployment**: Vercel, Netlify, Cloudflare, Docker, Railway, Fly.io
- **Payments**: Stripe, LemonSqueezy, Paddle
- **And much more...**

Skills are loaded on-demand to preserve context. Use `/load-skill <name>` or let GoodVibes auto-recommend based on your task.

---

## Templates

### next-saas
Full-featured SaaS starter with Next.js 14+, NextAuth, Prisma, Stripe, shadcn/ui, and more.

### next-app
Minimal Next.js starter with TypeScript, Tailwind, and ESLint.

### vite-react
Client-side React app with Vite 5+, TypeScript, and optional Tailwind/Vitest.

```yaml
scaffold_project:
  template: "next-saas"
  name: "my-app"
  options:
    auth: "clerk"
    database: "prisma"
    payments: "stripe"
```

---

## Project Structure

```
plugins/goodvibes/
├── agents/           # 9 specialized agent definitions
├── commands/         # 4 slash commands
├── hooks/            # 9 lifecycle hooks
├── output-styles/    # vibecoding & justvibes modes
├── skills/           # 173 skills (common + webdev)
├── templates/        # 3 project templates
├── tools/            # 6 MCP engine implementations
└── docs/             # Reference documentation
```

---

## Configuration

### Output Style (settings.json)

```json
{
  "outputStyle": "goodvibes:vibecoding"
}
```

### MCP Servers (auto-configured)

```json
{
  "mcpServers": {
    "plugin_goodvibes_precision-engine": { ... },
    "plugin_goodvibes_batch-engine": { ... },
    "plugin_goodvibes_registry-engine": { ... },
    "plugin_goodvibes_analysis-engine": { ... },
    "plugin_goodvibes_project-engine": { ... },
    "plugin_goodvibes_frontend-engine": { ... }
  }
}
```

---

## Known Limitations

- **LSP integration**: Symbol extraction relies on TypeScript language service; other languages have partial support
- **Large monorepos**: Projects with 100k+ files may experience slower initial stack detection
- **Windows paths**: Some edge cases with Windows path handling in batch operations (workarounds documented)

---

## Changelog Highlights (v0.1.0 to v1.0.0)

### Added
- Complete GoodVibes Enhancement Implementation (74 tasks across 10 feature areas)
- Vibecoding and JustVibes output styles
- Subagent telemetry and lifecycle hooks
- Smart context injection on session start
- Persistent memory system (`.goodvibes/memory/`)
- 3-phase PostToolUseFailure smart recovery
- Agent chaining and auto-checkpoint commits
- Pre-commit quality gates (TypeScript, ESLint, Prettier, tests)
- 262 tests with comprehensive coverage

### Changed
- Enterprise-grade code standards enforced (no mocks, no placeholders)
- Context window management optimized (150k target, 175k max)
- All registries rebuilt (9 agents, 173 skills, 74 tools)

### Security
- Command injection vulnerabilities fixed
- Cross-platform compatibility improvements
- 200+ credential patterns in security-hardened .gitignore

See [CHANGELOG.md](./CHANGELOG.md) for full version history.

---

## Resources

- **Documentation**: [README.md](./README.md)
- **Architecture Deep Dive**: [docs/GOODVIBES-ARCHITECTURE-DEEP-DIVE.md](./docs/GOODVIBES-ARCHITECTURE-DEEP-DIVE.md)
- **Skills Reference**: [agent_testing/docs/skills-reference.md](./agent_testing/docs/skills-reference.md)
- **Agents Guide**: [agent_testing/docs/agents-guide.md](./agent_testing/docs/agents-guide.md)
- **Issues**: [GitHub Issues](https://github.com/mgd34msu/goodvibes-plugin/issues)

---

## Contributing

We welcome contributions! Please see our contributing guidelines and code of conduct.

---

## License

MIT License - See [LICENSE](./LICENSE) for details.

---

<p align="center">
  <b>Plug in, receive good vibes.</b>
  <br><br>
  <code>claude plugin marketplace add mgd34msu/goodvibes-plugin</code>
  <br>
  <code>claude plugin install goodvibes@goodvibes-market</code>
</p>

---

**Full Changelog**: https://github.com/mgd34msu/goodvibes-plugin/commits/v1.0.0
