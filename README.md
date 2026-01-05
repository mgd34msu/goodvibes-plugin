# GoodVibes Plugin for Claude Code

A comprehensive automation plugin that supercharges Claude Code with intelligent context injection, persistent memory, smart error recovery, automated quality gates, and a library of 150+ development skills.

**Plug in. Receive good vibes.**

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
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Smart Context Injection
Automatically injects project context at session start:
- **Stack Detection**: Identifies frameworks, languages, and tools (Next.js, Vite, TypeScript, etc.)
- **Git Context**: Current branch, uncommitted changes, recent commits
- **Environment Status**: Missing env vars, .env file presence
- **Project Health**: node_modules status, lockfile issues, TypeScript config
- **TODO Scanner**: Finds TODOs/FIXMEs in codebase
- **Recent Activity**: Hotspots, recently modified files
- **Port Checker**: Active dev servers on common ports

### Persistent Memory System
Cross-session memory stored in `.goodvibes/memory/`:
- `decisions.md` - Architectural decisions and rationale
- `patterns.md` - Code patterns and conventions discovered
- `failures.md` - Past failures and solutions
- `preferences.md` - User preferences learned

### Smart Error Recovery
3-phase error recovery with escalating research:
- **Phase 1**: Fix attempts with existing knowledge
- **Phase 2**: Search official documentation
- **Phase 3**: Search community solutions (Stack Overflow, GitHub)

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

GoodVibes provides 18 MCP tools organized into categories:

### Core Discovery

| Tool | Description |
|------|-------------|
| `search_skills` | Search skill registry by keyword |
| `search_agents` | Search agent registry by expertise |
| `search_tools` | Search available tools |
| `recommend_skills` | Analyze task and recommend relevant skills |
| `get_skill_content` | Load full skill content by path |
| `get_agent_content` | Load full agent content by path |
| `skill_dependencies` | Show skill relationships and dependencies |

### Context Gathering

| Tool | Description |
|------|-------------|
| `detect_stack` | Analyze project technology stack |
| `check_versions` | Check installed package versions against skill assumptions |
| `scan_patterns` | Identify code patterns and conventions |

### Live Data

| Tool | Description |
|------|-------------|
| `fetch_docs` | Fetch current library documentation |
| `get_schema` | Introspect database schema |
| `read_config` | Parse configuration files (JSON, YAML, JS, TS) |

### Validation

| Tool | Description |
|------|-------------|
| `validate_implementation` | Check code matches skill patterns |
| `run_smoke_test` | Quick verification of generated code |
| `check_types` | Run TypeScript type checking |

### Project Management

| Tool | Description |
|------|-------------|
| `list_templates` | List available project templates |
| `scaffold_project` | Create project from template |
| `plugin_status` | Check GoodVibes plugin health |
| `project_issues` | Identify project issues and improvements |

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

GoodVibes includes **162 skills** organized by domain:

### Categories

```
skills/
├── common/              # Cross-cutting concerns
│   └── development/     # Architecture, code organization, debugging
├── create/              # Project creation skills
└── webdev/              # Web development (largest category)
    ├── ai-integration/       # AI/ML integrations
    ├── animation/            # Motion and transitions
    ├── api-layer/            # REST, GraphQL, tRPC
    ├── authentication/       # Auth providers and patterns
    ├── build-tools/          # Bundlers, compilers
    ├── cms-content/          # Content management
    ├── component-libraries/  # UI component systems
    ├── databases-orms/       # Database and ORM patterns
    ├── deployment/           # Hosting and deployment
    ├── email/                # Email services
    ├── forms/                # Form handling
    ├── frontend-core/        # Core frontend frameworks
    ├── meta-frameworks/      # Next.js, Nuxt, etc.
    ├── monitoring-analytics/ # Observability
    ├── payments/             # Payment processing
    ├── realtime-websockets/  # Real-time communication
    ├── state-management/     # State solutions
    ├── styling/              # CSS and styling
    └── testing/              # Testing frameworks
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
| `brutal-reviewer` | Honest, detailed code reviews |
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
- Context window management (keeps agents under 175k tokens)

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
│   ├── state/                  # Session state
│   └── telemetry/              # Telemetry logs
├── plugins/
│   └── goodvibes/              # Main plugin directory
│       ├── .claude-plugin/     # Plugin manifest
│       ├── .mcp.json           # MCP server config
│       ├── agents/             # 11 specialized agents
│       │   ├── _registry.yaml
│       │   ├── factory.md
│       │   ├── skill-creator.md
│       │   └── webdev/         # Web development agents
│       ├── commands/           # 3 slash commands
│       ├── hooks/              # Lifecycle hooks
│       │   ├── hooks.json      # Hook configuration
│       │   └── scripts/        # TypeScript implementations
│       │       ├── src/
│       │       │   ├── automation/
│       │       │   ├── context/
│       │       │   ├── memory/
│       │       │   ├── post-tool-use/
│       │       │   ├── pre-tool-use/
│       │       │   ├── session-start/
│       │       │   ├── subagent-*/
│       │       │   └── telemetry/
│       │       └── dist/
│       ├── output-styles/      # Vibecoding and JustVibes modes
│       ├── skills/             # 162 development skills
│       │   ├── _registry.yaml
│       │   ├── common/
│       │   ├── create/
│       │   └── webdev/
│       ├── templates/          # Project templates
│       │   ├── minimal/
│       │   └── full/
│       └── tools/              # MCP tools
│           ├── _registry.yaml
│           ├── definitions/    # 18 tool definitions (YAML)
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

## Contributing

Contributions are welcome! Here's how to get started:

### Adding a New Skill

1. Create a new markdown file in the appropriate `skills/` subdirectory
2. Follow the skill template structure:
   ```markdown
   ---
   name: skill-name
   description: What this skill does
   triggers:
     - keyword1
     - keyword2
   ---

   # Skill Name

   ## When to Use
   ...

   ## Prerequisites
   ...

   ## Implementation
   ...

   ## Examples
   ...
   ```
3. Run `npm run build:registries` to update the registry
4. Test with `/goodvibes:search skills <your-skill>`

### Adding a New Agent

1. Create a new markdown file in `agents/` or `agents/webdev/`
2. Follow the agent template in `agents/factory.md`
3. Run `npm run build:registries`
4. Test agent spawning

### Adding a New MCP Tool

1. Create a YAML definition in `tools/definitions/`
2. Implement the tool in `tools/implementations/tool-search-server/`
3. Run `npm run build:registries && npm run build:server`
4. Test with `mcp-cli call goodvibes-tools/<tool-name>`

### Code Style

- TypeScript for all implementations
- ESLint + Prettier for formatting
- Comprehensive error handling
- No placeholder or mock code

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Run validation: `npm run validate`
6. Submit a pull request

---

## Resources

- **Repository**: https://github.com/mgd34msu/goodvibes.sh
- **Website**: https://goodvibes.sh
- **Issues**: https://github.com/mgd34msu/goodvibes.sh/issues

---

## License

MIT License - see LICENSE file for details.

---

**Built with good vibes for the Claude Code community.**
