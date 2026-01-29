# GoodVibes Plugin: Architecture Deep Dive

> A comprehensive analysis of the architectural decisions, patterns, and innovations that power the GoodVibes plugin for Claude Code.

---

## Executive Summary

GoodVibes is an opinionated orchestration layer for Claude Code that transforms how AI agents approach software development. It addresses three fundamental challenges in AI-assisted development:

1. **Context Efficiency**: LLM context windows are expensive and finite. Native tools like `Read`, `Grep`, and `Glob` return verbose output that rapidly consumes tokens.
2. **Quality Assurance**: AI-generated code needs systematic verification before it reaches production.
3. **Autonomous Execution**: Complex projects require coordinated multi-agent workflows without constant human intervention.

The plugin solves these through three interconnected systems: the **Precision Engine** (token-efficient tools), the **WRFC Loop** (quality enforcement), and **Domain-Segmented Agents** (specialized autonomous workers).

---

## Part 1: The Token Economy Problem

### Why Native Tools Fail at Scale

Claude Code's built-in tools (`Read`, `Write`, `Edit`, `Grep`, `Glob`) are designed for general use. They return complete, unfiltered output:

```
# Native Read returns everything
Read("src/components/Button.tsx")
→ 847 lines, ~12,000 tokens

# Native Grep returns full context
Grep("useState")
→ 340 matches, ~8,000 tokens with context lines
```

On a modest codebase (50,000 lines), a single exploration phase can consume 30-40% of the context window before any real work begins. This creates a cascade of problems:

- **Context compaction triggers early**, losing important context
- **Agents forget prior decisions** as early conversation scrolls out
- **Parallel operations become impossible** due to context contention

### The Precision Engine Solution

GoodVibes replaces every native tool with a precision equivalent that supports **graduated output modes**:

| Mode | Description | Use Case | Token Ratio |
|------|-------------|----------|-------------|
| `count_only` | Just the count | "How many files match?" | 1-5 tokens |
| `files_only` / `paths_only` | Just paths | "Which files have this pattern?" | ~50 tokens |
| `locations` | Paths + line numbers | "Where exactly?" | ~100 tokens |
| `matches` / `content` | Actual content | "What does it say?" | Full cost |
| `outline` / `symbols` | Structural view | "What's the shape?" | 10-20% of full |

**Real-world comparison:**

```
# Native approach: Find all React components using useState
Grep("useState", type="tsx")  → 8,000 tokens

# Precision approach: Same query
precision_grep({
  queries: [{ id: "hooks", pattern: "useState", glob: "*.tsx" }],
  output: { format: "files_only" }
})  → 180 tokens (45x reduction)
```

### The Discover Tool: Parallel Context Gathering

The most powerful precision tool is `discover`, which executes multiple queries in a single call:

```json
{
  "queries": [
    { "id": "components", "type": "glob", "patterns": ["src/components/**/*.tsx"] },
    { "id": "hooks", "type": "grep", "pattern": "use[A-Z]\\w+", "glob": "*.ts" },
    { "id": "api", "type": "symbols", "query": "fetch", "kinds": ["function"] }
  ],
  "verbosity": "files_only"
}
```

One tool call replaces three sequential operations. Results are keyed by ID for structured processing.

---

## Part 2: The WRFC Loop — Quality as Architecture

### The Core Problem with AI Code

AI-generated code has a characteristic failure mode: it *looks correct* but contains subtle issues:

- Type mismatches that TypeScript would catch
- Import statements for packages that don't exist
- Logic that handles the happy path but not edge cases
- Patterns that violate project conventions

Left unchecked, these compound. A 10-file feature with 2% error rate per file means ~18% chance of at least one broken file.

### Write → Review → Fix → Check

The WRFC Loop makes verification a *structural requirement*, not an optional step:

```
┌─────────────────────────────────────────────────────────────────┐
│                         WRFC LOOP                               │
│                                                                 │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐      │
│   │  WORK   │───►│ REVIEW  │    │   FIX   │───►│  CHECK  │      │
│   │ (Agent) │    │ (Agent) │    │ (Agent) │    │ (Agent) │      │
│   └─────────┘    └────┬────┘    └────▲────┘    └────┬────┘      │
│                       │              |              │           │
│                  ┌────▼────┐    NO   |         ┌────▼────┐      │
│                  │  PASS?  │─────────┘         │ VERIFY  │      │
│                  └────┬────┘                   │ ISSUES  │      │
│                       │                        │ RESOLVED│      │
│                   YES │                        └──┬──┬───┘      │
│                       │                           │  |          │
│                       │                           |  |          │
│                       ▼                           │  |          │
│                  ┌─────────┐                 YES  │  | NO       │
│                  │ COMMIT  │◄─────────────────────┘  |          │
│                  └─────────┘                         │          │
│                                                      │          │
│                                             ┌────────▼────────┐ │
│                                             │  RETURN TO FIX  │ │
│                                             └─────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation: fix-loop.ts

The fix loop (`batch-engine/src/runtime/fix-loop.ts`) implements error recovery with **strategy escalation**:

```typescript
// Error categories map to recovery strategies
const ERROR_STRATEGIES = {
  typescript_error: ['auto_fix', 'agent_fix', 'targeted_fix'],
  lint_error: ['auto_fix', 'targeted_fix'],
  format_error: ['auto_fix'],
  test_failure: ['agent_fix', 'targeted_fix'],
  build_error: ['auto_fix', 'agent_fix'],
  runtime_error: ['agent_fix', 'targeted_fix']
};

// Strategy implementations
const FIXERS = {
  auto_fix: async (error) => {
    // ESLint --fix, Prettier --write, tsc for type errors
    return runAutoFixers(error.files);
  },
  agent_fix: async (error, context) => {
    // Spawn engineer agent with full error context
    return spawnFixAgent(error, context);
  },
  targeted_fix: async (error) => {
    // Precision edit at exact error location
    return precisionEdit(error.file, error.line, error.suggestion);
  }
};
```

Key design decisions:

1. **Start cheap, escalate expensive**: Auto-fixers run in <1 second. Agent fixes take 30-60 seconds. Try fast solutions first.
2. **Max 3 attempts**: Infinite loops are prevented. After 3 failures, the issue is logged and the loop continues with other work.
3. **Error categorization**: Different error types need different solutions. A linting error shouldn't spawn an agent; a logic bug shouldn't run Prettier.

### Why Review Agents, Not Just Linting?

Linters catch syntax and style. Review agents catch *semantic* issues:

```typescript
// Passes all linters, but review agent catches:
// - "fetchUser" is called but result is never awaited
// - "users" state is set but component unmounts before setState completes
// - No error boundary for the async operation

function UserProfile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetchUser(userId).then(setUser);  // ⚠️ Missing await, no cleanup
  }, [userId]);

  return <div>{user?.name}</div>;
}
```

The `goodvibes:reviewer` agent is trained to catch patterns that static analysis misses.

---

## Part 3: Domain-Segmented Agents

### The Specialization Principle

A general-purpose agent trying to do everything performs worse than specialized agents doing one thing well. GoodVibes segments agents by technical domain:

| Agent | Model | Specialty | Typical Tasks |
|-------|-------|-----------|---------------|
| `engineer` | Sonnet | Full-stack implementation | Building features, components, APIs |
| `reviewer` | Opus | Quality assessment | Code review, security audit |
| `tester` | Sonnet | Test engineering | Unit tests, integration tests, coverage |
| `architect` | Opus | System design | Planning, refactoring, scalability |
| `deployer` | Sonnet | DevOps | CI/CD, Docker, cloud deployment |
| `integrator` | Opus | Complex features | State management, real-time, AI integration |
| `planner` | Opus | Project planning | Task breakdown, dependency mapping |

### Model Selection Strategy

Not all agents need the same model:

- **Opus for decision-making**: Reviewer, architect, integrator handle ambiguous situations requiring judgment
- **Sonnet for execution**: Engineer, tester, deployer follow clear patterns with speed

This optimizes cost-performance. An engineer agent implementing a well-defined component doesn't need Opus-level reasoning.

### Agent Anatomy

Each agent is defined as a Markdown file with YAML frontmatter:

```yaml
---
name: engineer
model: sonnet
triggers:
  - api
  - rest
  - database
  - react
  - component
  - form
---

# Engineer Agent

You are a full-stack implementation specialist. Your job is to write
production-ready code that follows project conventions.

## Capabilities
- React/Vue/Svelte component development
- REST/GraphQL API implementation
- Database schema and query optimization
- Form handling with validation

## Constraints
- Write to project root only (write-local)
- Read from anywhere (read-global)
- Always use precision tools, never native equivalents
- Follow existing patterns in the codebase

## Tool Preferences
- Use `precision_read` with `outline` mode before full reads
- Use `precision_grep` with `files_only` before content extraction
- Batch all writes into single `precision_write` calls
```

### Filesystem Boundaries

A critical safety feature: agents have different read/write permissions:

- **Write-local**: Can only write to project root and subdirectories
- **Read-global**: Can read from anywhere for reference

This prevents agents from accidentally modifying system files or other projects while allowing them to reference documentation, examples, or configuration outside the project.

---

## Part 4: Skills and Selective Disclosure

### The Context Injection Problem

A comprehensive skill library (173 skills in GoodVibes) cannot be loaded into context upfront. Even as references, 173 skill descriptions would consume significant context.

### Lazy-Loaded Knowledge

Skills are loaded *on-demand* through the Registry Engine:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SKILL DISCOVERY FLOW                          │
│                                                                  │
│   Agent Task:                Registry Engine:                    │
│   "Add Stripe payments"      ┌─────────────────────┐            │
│          │                   │ search_skills({     │            │
│          ▼                   │   query: "stripe",  │            │
│   ┌─────────────┐            │   category: "payment"│           │
│   │ Detect need │───────────►│ })                   │           │
│   │ for payment │            └──────────┬──────────┘            │
│   │ knowledge   │                       │                        │
│   └─────────────┘                       ▼                        │
│                              ┌─────────────────────┐            │
│                              │ Returns:            │            │
│                              │ - stripe-checkout   │            │
│                              │ - stripe-subscriptions│          │
│                              │ - stripe-webhooks   │            │
│                              └──────────┬──────────┘            │
│                                         │                        │
│                                         ▼                        │
│                              ┌─────────────────────┐            │
│                              │ get_skill_content({ │            │
│                              │   skill: "stripe-   │            │
│                              │   checkout"         │            │
│                              │ })                   │            │
│                              └──────────┬──────────┘            │
│                                         │                        │
│                                         ▼                        │
│                              ┌─────────────────────┐            │
│   Full skill loaded ◄────────│ Complete skill with │            │
│   into agent context         │ implementation      │            │
│                              │ patterns, examples, │            │
│                              │ and best practices  │            │
│                              └─────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

### Skill Categories

Skills are organized by domain:

```
skills/
├── common/           # 29 skills - Cross-cutting concerns
│   ├── debugging/
│   ├── refactoring/
│   └── security-audit/
└── webdev/           # 144 skills - Web development
    ├── ai/           # vercel-ai-sdk
    ├── auth/         # nextauth, clerk, lucia, etc.
    ├── database/     # prisma, drizzle, postgresql, etc.
    ├── frontend/     # react, vue, svelte, nextjs, etc.
    ├── styling/      # tailwind, css-modules, etc.
    ├── api/          # rest, graphql, trpc, etc.
    └── deployment/   # vercel, docker, railway, etc.
```

### Dependency Resolution

Skills can depend on other skills. The `skill_dependencies` tool resolves the full graph:

```json
// Request
{ "skill": "nextauth" }

// Response
{
  "skill": "nextauth",
  "dependencies": [
    "prisma",           // For session/user storage
    "typescript-config" // For strict type checking
  ],
  "conflicts": [
    "lucia"             // Different auth paradigm
  ]
}
```

This prevents loading incompatible skills or missing required foundations.

---

## Part 5: The Hook System

### Lifecycle Events

Hooks allow code to run at key moments in the Claude Code lifecycle:

| Hook | Trigger | Common Uses |
|------|---------|-------------|
| `SessionStart` | Session begins | Load memory, initialize state, check project health |
| `SessionEnd` | Session ends | Persist decisions, summarize activity, clean up |
| `PreToolUse` | Before any tool | Inject context, validate permissions, log operations |
| `PostToolUse` | After tool completes | Update state, track changes, handle errors |
| `SubagentStart` | Agent spawns | Track active agents, allocate resources |
| `SubagentStop` | Agent completes | Record results, update telemetry |
| `UserPromptSubmit` | User sends message | Analyze intent, preload relevant skills |
| `PreCompact` | Before context compaction | Preserve critical information |
| `Notification` | System notification | Handle async completions, agent signals |

### Hook Implementation

Hooks are configured in `hooks/hooks.json`:

```json
{
  "hooks": [
    {
      "event": "SessionStart",
      "script": "./scripts/dist/session-start.cjs",
      "timeout": 5000
    },
    {
      "event": "PreToolUse",
      "script": "./scripts/dist/pre-tool-use.cjs",
      "tools": ["Bash", "Read", "Edit", "Write", "Glob", "Grep"],
      "timeout": 1000
    }
  ]
}
```

### Context Injection Example

The `PreToolUse` hook injects relevant context before tool execution:

```javascript
// pre-tool-use.js
export async function preToolUse(event) {
  const { tool, parameters } = event;

  if (tool === 'Read' && parameters.file_path.includes('components/')) {
    // Inject component conventions before reading
    const conventions = await loadMemory('patterns', 'react-components');
    return {
      context: `Project uses: ${conventions.summary}`,
      proceed: true
    };
  }

  return { proceed: true };
}
```

### Memory Persistence

The `SessionEnd` hook persists learning:

```javascript
// session-end.js
export async function sessionEnd(event) {
  const { decisions, errors, patterns } = event.session;

  // Write to cross-session memory
  await appendMemory('decisions', decisions.map(formatDecision));
  await appendMemory('failures', errors.map(formatFailure));
  await updatePatterns(patterns);

  // Generate session summary
  await writeSessionSummary(event.session);
}
```

---

## Part 6: Execution Modes

### vibecoding vs justvibes

GoodVibes supports two execution modes with fundamentally different philosophies:

#### vibecoding Mode (Interactive)

```yaml
communication:
  show_progress: true
  explain_decisions: true
  ask_on_ambiguity: true

execution:
  auto_chain: false
  max_autonomous_batches: 1

recovery:
  on_issue: ask_user_with_options
```

- User sees every decision
- User approves each batch
- Errors prompt for user guidance
- Best for: Learning, sensitive changes, unfamiliar codebases

#### justvibes Mode (Autonomous)

```yaml
communication:
  show_progress: false
  explain_decisions: false
  ask_on_ambiguity: false

execution:
  auto_chain: true
  max_autonomous_batches: unlimited

recovery:
  on_issue: fix_review_loop
  on_other: choose_best_option_silent
```

- Fully silent execution
- Automatic error recovery
- Best guess on ambiguity
- Best for: Well-defined tasks, bulk operations, overnight runs

### The WRFC Loop in justvibes

In autonomous mode, the WRFC loop runs continuously with up to 6 parallel agents:

```
Time ────────────────────────────────────────────────────────►

Agent 1: ████ WORK ████ → ██ REVIEW ██ → █ FIX █ → ██ CHECK ██ → COMMIT ✓
Agent 2: ████ WORK ████ → ██ REVIEW ██ → PASS ✓ → COMMIT
Agent 3: ████ WORK ████ → ██ REVIEW ██ → █ FIX █ → ██ CHECK ██ → COMMIT ✓
Agent 4:      ████ WORK ████ → ██ REVIEW ██ → PASS ✓ → COMMIT
Agent 5:           ████ WORK ████ → ██ REVIEW ██ → █ FIX █ → ...
Agent 6:                ████ WORK ████ → ...

Orchestrator monitors completions and spawns new agents to maintain 6 active
```

---

## Part 7: Memory and State

### The Two-Tier Memory System

```
┌─────────────────────────────────────────────────────────────────┐
│                     MEMORY ARCHITECTURE                          │
│                                                                  │
│   Session (Ephemeral)              Cross-Session (Persistent)   │
│   ──────────────────               ─────────────────────────    │
│                                                                  │
│   logs/                            memory/                       │
│   ├── activity.md                  ├── decisions.json            │
│   ├── decisions.md                 │   - Strategic choices       │
│   └── errors.md                    │   - Rationale preserved     │
│       │                            │                             │
│       │ Session-specific           ├── patterns.json             │
│       │ detailed records           │   - Recurring solutions     │
│       │                            │   - Usage frequency         │
│       │                            │                             │
│       │                            ├── failures.json             │
│       │                            │   - Error history           │
│       │                            │   - Resolution patterns     │
│       │                            │                             │
│       ▼                            └── index.json                │
│   Summarized at                        - Keyword search index    │
│   session end                          - Quick lookups           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Memory Schema: Decisions

```json
{
  "id": "dec_20260127_143052",
  "date": "2026-01-27T14:30:52Z",
  "category": "library",
  "what": "Use Zustand for state management",
  "why": "Lighter than Redux, better TypeScript support, simpler mental model",
  "scope": ["src/store/", "src/hooks/"],
  "confidence": "high",
  "status": "active"
}
```

### Memory Schema: Failures

```json
{
  "id": "fail_20260127_091523",
  "date": "2026-01-27T09:15:23Z",
  "error": "Cannot find module '@/components/Button'",
  "context": "Adding new feature to dashboard",
  "root_cause": "Path alias not configured in tsconfig",
  "resolution": "Added paths config: { '@/*': ['./src/*'] }",
  "prevention": "Check tsconfig.json paths when using @ imports",
  "keywords": ["import", "path", "alias", "tsconfig"]
}
```

### State Management

Real-time state is tracked in `.goodvibes/state/`:

```json
// state/session.json
{
  "id": "sess_20260127_140000",
  "started_at": "2026-01-27T14:00:00Z",
  "mode": "justvibes",
  "batches_completed": 12,
  "operations_completed": 147,
  "tokens_used": 245000,
  "health": {
    "typecheck": "passing",
    "lint": "passing",
    "test": "passing",
    "build": "passing"
  }
}

// state/agents.json
{
  "active": {
    "agent_001": { "type": "engineer", "task": "Implement user profile", "started": "..." },
    "agent_002": { "type": "reviewer", "task": "Review user profile", "started": "..." }
  },
  "completed": [...],
  "total_spawned": 24,
  "tokens_used_by_agents": 180000
}
```

---

## Part 8: The Six MCP Engines

GoodVibes is built on six Model Context Protocol servers, each with a distinct responsibility:

### 1. Precision Engine (9 tools)
**Purpose**: Token-efficient file and code operations

Tools: `precision_read`, `precision_write`, `precision_edit`, `precision_grep`, `precision_glob`, `precision_symbols`, `precision_exec`, `precision_fetch`, `discover`

### 2. Batch Engine (6 tools)
**Purpose**: Multi-phase atomic operations with transactions

Tools: `batch`, `batch_status`, `batch_list`, `batch_recover`, `batch_checkpoints`, `batch_state`

### 3. Registry Engine (7 tools)
**Purpose**: Skill and agent discovery with lazy loading

Tools: `search_skills`, `search_agents`, `search_tools`, `recommend_skills`, `get_skill_content`, `get_agent_content`, `skill_dependencies`

### 4. Analysis Engine (17 tools)
**Purpose**: Code intelligence and validation

Categories:
- **Context**: `detect_stack`, `check_versions`, `scan_patterns`, `read_config`, `get_conventions`
- **Intelligence**: `find_dead_code`, `get_api_surface`, `safe_delete_check`, `detect_breaking_changes`
- **Security**: `env_audit`, `scan_for_secrets`, `check_permissions`
- **Debugging**: `parse_error_stack`, `explain_type_error`, `find_circular_deps`

### 5. Frontend Engine (11 tools)
**Purpose**: React/CSS analysis and debugging

Tools: `get_react_component_tree`, `analyze_stacking_context`, `analyze_responsive_breakpoints`, `trace_component_state`, `analyze_render_triggers`, `diagnose_overflow`, `get_accessibility_tree`, `analyze_tailwind_conflicts`

### 6. Project Engine (22 tools)
**Purpose**: Project scaffolding, database, and Git operations

Categories: Analysis, Database (Prisma), Git, Docs, Fixtures, Framework, Package, Schema, Security, Sync, Test, Validation

---

## Part 9: Putting It All Together

### A Complete Workflow Example

User request: "Add user authentication with NextAuth and Prisma"

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION FLOW                            │
│                                                                  │
│  1. INTENT ANALYSIS (UserPromptSubmit hook)                     │
│     └─► Detect: authentication, nextauth, prisma                │
│                                                                  │
│  2. SKILL LOADING (Registry Engine)                             │
│     ├─► search_skills("nextauth") → nextauth skill              │
│     ├─► skill_dependencies("nextauth") → prisma required        │
│     └─► get_skill_content("nextauth", "prisma")                 │
│                                                                  │
│  3. PLANNING (Architect Agent)                                  │
│     └─► Generate implementation plan with phases                │
│                                                                  │
│  4. PARALLEL EXECUTION (6 agents max)                           │
│     ┌─────────────────────────────────────────────────────┐    │
│     │ Agent 1: Schema (prisma/schema.prisma)              │    │
│     │ Agent 2: NextAuth config (pages/api/auth/[...].ts)  │    │
│     │ Agent 3: Session provider (components/Providers.tsx)│    │
│     │ Agent 4: Login page (pages/login.tsx)               │    │
│     │ Agent 5: Protected route HOC (lib/withAuth.tsx)     │    │
│     │ Agent 6: User hooks (hooks/useUser.ts)              │    │
│     └─────────────────────────────────────────────────────┘    │
│                                                                  │
│  5. WRFC LOOP (per agent)                                       │
│     ├─► WORK: Engineer implements                               │
│     ├─► REVIEW: Reviewer checks code                            │
│     ├─► FIX: (if issues) Engineer fixes                         │
│     ├─► CHECK: Reviewer verifies                                │
│     └─► COMMIT: Changes committed                               │
│                                                                  │
│  6. INTEGRATION TEST                                             │
│     └─► Tester agent runs full auth flow test                   │
│                                                                  │
│  7. MEMORY UPDATE                                                │
│     ├─► decisions.json: "Used NextAuth over Lucia"              │
│     ├─► patterns.json: "Auth implementation pattern"            │
│     └─► activity.md: "Added authentication system"              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Architecture Works

1. **Token Efficiency**: Precision tools reduce context consumption by 90%+, allowing larger projects

2. **Quality Guarantee**: WRFC loop ensures every change is reviewed and verified before commit

3. **Parallel Speed**: 6 concurrent agents working on independent tasks complete features faster

4. **Domain Expertise**: Specialized agents (engineer, reviewer, tester) bring focused knowledge

5. **Institutional Memory**: Cross-session persistence means the system learns from every project

6. **Graceful Recovery**: Error strategies escalate from cheap (auto-fix) to expensive (agent-fix)

7. **Flexible Modes**: vibecoding for human collaboration, justvibes for autonomous execution

---

## Conclusion

GoodVibes represents a paradigm shift in AI-assisted development. Rather than treating Claude Code as a chat interface with tools, it treats it as an operating system for software development—with specialized processes (agents), efficient I/O (precision tools), quality assurance pipelines (WRFC), and persistent storage (memory).

The key insight is that AI development isn't about making a single model smarter. It's about orchestrating multiple specialized agents, managing context as a scarce resource, and enforcing quality through systematic verification.

The result: production-ready code at unprecedented speed, with enterprise-grade quality assurance built into every operation.

---

*Document generated from codebase analysis of the GoodVibes plugin, v1.0*
*Path: `plugins/goodvibes/` | 74 MCP tools | 9 agents | 173 skills*
