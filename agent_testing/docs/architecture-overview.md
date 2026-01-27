# Architecture Overview

**GoodVibes Plugin for Claude Code**

This document provides a technical overview of the GoodVibes plugin architecture, component interactions, and data flow patterns.

## Table of Contents

- [System Overview](#system-overview)
- [Plugin Architecture](#plugin-architecture)
- [Component Types](#component-types)
- [Data Flow](#data-flow)
- [Memory System](#memory-system)
- [WRFC Loop](#wrfc-loop)
- [Integration Points](#integration-points)

## System Overview

GoodVibes is a comprehensive plugin for Claude Code that enhances AI-assisted development through specialized tools, agents, and workflows. It extends Claude Code's capabilities with 74 MCP tools across 6 engines, 9 specialized agents, 173 skills, and 9 lifecycle hooks.

```
┌─────────────────────────────────────────────────────────────┐
│                        Claude Code                          │
│                     (Host Environment)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                    GoodVibes Plugin                         │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ MCP Engines  │  │    Agents    │  │    Skills    │     │
│  │  (6 engines) │  │  (9 agents)  │  │ (173 skills) │     │
│  │   74 tools   │  └──────┬───────┘  └──────┬───────┘     │
│  └──────┬───────┘         │                  │             │
│         │                 │                  │             │
│         └─────────────────┼──────────────────┘             │
│                           │                                │
│  ┌────────────────────────┼──────────────────────────┐     │
│  │         Lifecycle Hooks (9 hooks)                 │     │
│  │  - Output Styles  - State Management              │     │
│  └────────────────────────┼──────────────────────────┘     │
│                           │                                │
│  ┌────────────────────────┼──────────────────────────┐     │
│  │           Memory System (2-tier)                  │     │
│  │  - Activity Logs    - Structured Memory           │     │
│  └───────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                           │
                           ↓
                  ┌────────────────┐
                  │   Codebase     │
                  │   (Target)     │
                  └────────────────┘
```

## Plugin Architecture

### Integration with Claude Code

GoodVibes integrates with Claude Code through the Model Context Protocol (MCP), which enables:

1. **Tool Registration** - MCP engines expose tools to Claude Code
2. **Agent Orchestration** - Specialized agents with domain expertise
3. **Context Injection** - Skills provide just-in-time knowledge
4. **Lifecycle Hooks** - Intercept and modify agent behavior
5. **Memory Persistence** - Track decisions, patterns, and learnings

### Directory Structure

```
plugins/goodvibes/
├── engines/           # MCP servers (6 engines, 74 tools)
├── agents/            # Specialized agent personas (9 agents)
├── skills/            # Domain knowledge library (173 skills)
├── hooks/             # Lifecycle event handlers (9 hooks)
└── .goodvibes/        # Runtime state and memory
    ├── logs/          # Activity and operation logs
    └── memory/        # Structured memory store
```

## Component Types

### 1. MCP Engines (6 Engines, 74 Tools)

MCP engines are specialized tool servers that expose capabilities through the Model Context Protocol.

#### **Precision Engine** (9 tools)
High-performance file operations with modes, filters, and batch support.

- `precision_read` - Read files with extract modes (content, outline, symbols)
- `precision_write` - Write files atomically with validation
- `precision_edit` - Edit files with find/replace and transaction support
- `precision_grep` - Search with output modes (content, files_only, count)
- `precision_glob` - Pattern-based file discovery
- `precision_symbols` - Symbol extraction (functions, classes, types)
- `precision_exec` - Execute commands with expectations
- `precision_fetch` - Fetch URLs with processing
- `discover` - Parallel multi-query discovery

**Use Cases**: File operations, code search, symbol navigation, command execution

#### **Batch Engine** (5 tools)
Multi-operation batching with atomic transactions and checkpoints.

- `batch` - Execute multi-phase operations (read, write, exec, query)
- `batch_status` - Check batch execution status
- `batch_list` - List all batches
- `batch_recover` - Recover from batch failures
- `batch_checkpoints` - Manage checkpoints

**Use Cases**: Feature implementation, refactoring, migration, multi-file operations

#### **Registry Engine** (6 tools)
Skill and agent discovery with recommendation engine.

- `search_skills` - Find skills by query, tags, category
- `search_agents` - Find agents by query, tags
- `search_tools` - Find MCP tools
- `recommend_skills` - Get skill recommendations based on context
- `get_skill_content` - Load skill content
- `skill_dependencies` - Resolve skill dependencies

**Use Cases**: Just-in-time learning, agent spawning, capability discovery

#### **Frontend Engine** (11 tools)
React and frontend-specific analysis tools.

- `get_react_component_tree` - Visualize component hierarchy
- `analyze_stacking_context` - Debug z-index issues
- `analyze_responsive_breakpoints` - Check responsive behavior
- `trace_component_state` - Track state flow
- `analyze_render_triggers` - Identify re-render causes
- `analyze_layout_hierarchy` - Debug layout issues
- `diagnose_overflow` - Find overflow sources
- `get_accessibility_tree` - Audit a11y
- `get_sizing_strategy` - Understand sizing approach
- `analyze_event_flow` - Trace event propagation
- `analyze_tailwind_conflicts` - Detect Tailwind conflicts

**Use Cases**: Frontend debugging, component analysis, performance optimization

#### **Analysis Engine** (24 tools)
Static analysis, validation, and security auditing.

- `detect_stack` - Identify framework and libraries
- `check_versions` - Check package versions
- `scan_patterns` - Find code patterns
- `read_config` - Parse configuration files
- `get_conventions` - Extract codebase conventions
- `find_dead_code` - Detect unused code
- `get_api_surface` - Document public APIs
- `safe_delete_check` - Verify safe deletion
- `detect_breaking_changes` - Find breaking changes
- `semantic_diff` - Semantic code comparison
- `validate_implementation` - Validate against spec
- `validate_edits_preview` - Preview edit impact
- `validate_api_contract` - Validate API contracts
- `env_audit` - Audit environment variables
- `scan_for_secrets` - Detect secrets in code
- `check_permissions` - Verify file permissions
- `parse_error_stack` - Parse error messages
- `explain_type_error` - Explain TypeScript errors
- `find_circular_deps` - Detect circular dependencies

**Use Cases**: Codebase analysis, security audits, validation, refactoring safety

#### **Project Engine** (19 tools)
Project scaffolding, database introspection, and workflow automation.

- `scaffold_project` - Generate project from template
- `list_templates` - List available templates
- `plugin_status` - Check plugin health
- `project_issues` - Scan for common issues
- `generate_openapi` - Generate OpenAPI specs
- `get_database_schema` - Introspect database schema
- `get_api_routes` - List API routes
- `get_prisma_operations` - List Prisma operations
- `query_database` - Execute database queries
- `upgrade_package` - Upgrade dependencies safely
- `explain_codebase` - Generate codebase overview
- `find_tests_for_file` - Find related tests
- `get_test_coverage` - Get coverage report
- `suggest_test_cases` - Generate test suggestions
- `generate_types` - Generate TypeScript types
- `generate_fixture` - Generate test fixtures
- `sync_api_types` - Sync API type definitions
- `create_pull_request` - Create PR with context
- `analyze_bundle` - Analyze bundle size
- `analyze_dependencies` - Analyze dependency tree
- `find_circular_deps` - Find circular dependencies

**Use Cases**: Project setup, database operations, testing, type generation, CI/CD

### 2. Agents (9 Specialized Agents)

Agents are persona-based AI assistants with specialized knowledge and capabilities.

| Agent | Role | Key Capabilities |
|-------|------|------------------|
| **engineer** | Full-stack implementation | Backend APIs, frontend components, database design |
| **deployer** | Infrastructure & deployment | Docker, CI/CD, cloud platforms, monitoring |
| **designer** | UI/UX design | Figma analysis, design systems, accessibility |
| **tester** | Test automation | Unit/integration/e2e tests, coverage, test generation |
| **reviewer** | Code review | Type safety, error handling, security, performance |
| **architect** | System design | Architecture decisions, design patterns, scalability |
| **optimizer** | Performance tuning | Bundle size, rendering, queries, caching |
| **documenter** | Documentation | API docs, guides, README files, diagrams |
| **debugger** | Issue resolution | Bug diagnosis, error analysis, root cause finding |

**Agent Spawning**: Agents are spawned by the batch engine or registry engine when specialized expertise is needed.

### 3. Skills (173 Skills)

Skills are just-in-time knowledge modules that inject domain expertise into agent context.

#### **Skill Categories**

- **Frameworks** (25 skills) - Next.js, React, Vue, Svelte, Astro, Remix, etc.
- **Backend** (35 skills) - tRPC, GraphQL, REST, Prisma, Drizzle, Redis, etc.
- **Frontend** (28 skills) - Tailwind, shadcn/ui, Radix, Framer Motion, etc.
- **Testing** (18 skills) - Jest, Vitest, Playwright, Cypress, testing strategies
- **DevOps** (22 skills) - Docker, Kubernetes, GitHub Actions, Vercel, AWS
- **Code Review** (12 skills) - Type safety, error handling, async patterns, etc.
- **Languages** (15 skills) - TypeScript, JavaScript, Python, Go, Rust, etc.
- **Architecture** (18 skills) - Design patterns, DDD, microservices, event sourcing

#### **Skill Structure**

```yaml
# Example skill file
name: "nextjs"
category: "frameworks"
tags: ["react", "fullstack", "ssr"]
description: "Next.js App Router, Server Components, Server Actions"

# Content includes:
# - Core concepts
# - Best practices
# - Common patterns
# - Anti-patterns to avoid
# - Decision frameworks
```

**Skill Loading**: Skills are loaded via `recommend_skills` or `get_skill_content` when relevant to the task.

### 4. Hooks (9 Lifecycle Hooks)

Hooks intercept lifecycle events to modify behavior, inject context, or enforce policies.

| Hook | Event | Purpose |
|------|-------|---------|
| **output-styles** | Pre-response | Apply vibecoding/justvibes output formatting |
| **state-tracking** | Post-operation | Track decisions, patterns, failures to memory |
| **notification-idle** | Idle detection | Notify agents of pending tasks when idle |
| **context-injection** | Pre-spawn | Inject relevant context into agent spawn |
| **validation-gates** | Pre-write | Enforce validation rules before file writes |
| **memory-query** | Pre-read | Query memory for relevant context |
| **checkpoint-auto** | Post-batch | Auto-create checkpoints at safe points |
| **error-recovery** | On-error | Attempt recovery or rollback on failures |
| **metrics-collection** | Post-operation | Collect performance metrics |

### 5. Output Styles (vibecoding vs justvibes)

Output styles control agent communication and autonomy levels.

#### **vibecoding Mode**
```yaml
behavior:
  communicate: verbose
  ask_on_ambiguity: true
  show_diffs: true
  checkpoint: per_batch
```

**Use Case**: Collaborative development, learning, transparency

#### **justvibes Mode**
```yaml
behavior:
  communicate: minimal
  ask_on_ambiguity: false
  show_diffs: false
  checkpoint: on_risk
  auto_chain: true
```

**Use Case**: Autonomous execution, batch operations, background tasks

**Switching**: Use `output-style` hook to set mode for agent or operation.

## Data Flow

### Request Flow

```
1. User Request
   ↓
2. Claude Code (primary agent)
   ↓
3. Registry Engine (recommend skills/agents)
   ↓
4. Skill Loading (inject knowledge)
   ↓
5. Agent Selection (spawn specialist if needed)
   ↓
6. Discovery Phase (discover tool, precision_grep, precision_glob)
   ↓
7. Batch Planning (batch engine)
   ↓
8. Execution (MCP tools: precision_*, analysis_*, project_*)
   ↓
9. Validation (WRFC loop)
   ↓
10. State Tracking (hooks write to memory)
    ↓
11. Response to User
```

### Tool Call Pattern

```
Agent
  ↓
1. Check MCP schema: mcp-cli info <server>/<tool>
  ↓
2. Call tool: mcp-cli call <server>/<tool> '<json>'
  ↓
3. Process result
  ↓
4. Log to memory (state-tracking hook)
  ↓
5. Continue or return
```

### Batch Execution Flow

```
1. Batch Request
   ↓
2. Discovery Phase (parallel queries)
   │  - discover tool
   │  - precision_grep
   │  - precision_glob
   ↓
3. Read Phase (gather context)
   │  - precision_read
   │  - precision_symbols
   ↓
4. Checkpoint (before writes)
   ↓
5. Write Phase (apply changes)
   │  - precision_write
   │  - precision_edit
   ↓
6. Exec Phase (validate)
   │  - precision_exec (typecheck, lint, test)
   ↓
7. Checkpoint (after validation)
   ↓
8. Return results
```

## Memory System

GoodVibes uses a two-tier memory architecture for different types of persistence.

### Tier 1: Activity Logs

**Purpose**: Append-only operation logs for debugging and auditing

**Location**: `.goodvibes/logs/`

**Files**:
- `activity.md` - All operations (file edits, commands, tool calls)
- `decisions.md` - Decision rationale and context
- `failures.md` - Errors and recovery attempts

**Format**: Markdown with timestamps

**Use Case**: Debugging, audit trail, understanding past actions

**Example**:
```markdown
## 2026-01-27 10:23:45 - File Edit

**Operation**: precision_edit
**File**: src/components/Button.tsx
**Change**: Added loading state prop
**Reason**: User requested loading indicator

### Result
✓ Edit successful
✓ TypeScript validation passed
✓ Tests passed
```

### Tier 2: Structured Memory

**Purpose**: Queryable knowledge base for decision support

**Location**: `.goodvibes/memory/`

**Files**:
- `decisions.json` - Structured decision records
- `patterns.json` - Discovered code patterns
- `failures.json` - Failure patterns and resolutions
- `context.json` - Project-specific context

**Format**: JSON with query indices

**Use Case**: Context injection, decision consistency, pattern reuse

**Example**:
```json
{
  "decisions": [
    {
      "id": "dec_2026_01_27_001",
      "timestamp": "2026-01-27T10:23:45Z",
      "kind": "library",
      "what": "Use Zustand for state management",
      "why": "Simpler API, better TypeScript support, smaller bundle",
      "confidence": "high",
      "tags": ["state", "react", "library-choice"]
    }
  ]
}
```

### Memory Query Pattern

```javascript
// Hook: memory-query (pre-read)
const relevantDecisions = await queryMemory({
  kind: "decision",
  tags: ["state", "react"],
  confidence: "high"
});

// Inject into agent context
agentContext.relevantDecisions = relevantDecisions;
```

## WRFC Loop

**Write-Review-Fix-Check** - A continuous validation cycle ensuring code quality.

### Loop Phases

```
┌─────────────────────────────────────────┐
│          1. WRITE                       │
│  - precision_write / precision_edit     │
│  - Implement feature                    │
│  - Apply changes atomically             │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│          2. REVIEW                      │
│  - Load review skills                   │
│  - Static analysis (analysis_* tools)   │
│  - Pattern validation                   │
│  - Security scan                        │
└──────────────┬──────────────────────────┘
               ↓
       ┌───────────────┐
       │  Issues Found?│
       └───┬───────┬───┘
           │ YES   │ NO
           ↓       ↓
┌──────────────┐  │
│   3. FIX     │  │
│ - Apply      │  │
│   review     │  │
│   fixes      │  │
└──────┬───────┘  │
       │          │
       └──────────┼───────────┐
                  ↓           │
         ┌────────────────────┴────┐
         │     4. CHECK            │
         │  - precision_exec       │
         │  - npm run typecheck    │
         │  - npm run lint         │
         │  - npm run test         │
         └─────────┬───────────────┘
                   ↓
            ┌──────────────┐
            │  All Pass?   │
            └──┬───────┬───┘
               │ YES   │ NO
               ↓       ↓
           ┌───────┐  │
           │ DONE  │  │
           └───────┘  │
               │      │
               └──────┴─────→ (Loop back to FIX)
```

### Review Skills Mapping

| Code Type | Review Skills |
|-----------|---------------|
| TypeScript/JavaScript | type-safety, error-handling, async-patterns |
| API routes | type-safety, error-handling, security |
| Components | type-safety, naming-conventions, accessibility |
| New files | import-ordering, documentation |
| Configuration | config-hygiene |

### WRFC in Practice

```yaml
# Example batch with WRFC
batch:
  id: implement-auth-endpoint

  operations:
    # WRITE
    write:
      - id: create-endpoint
        type: create
        files:
          - path: "src/api/auth/login.ts"
            content: "..."

    # REVIEW (automated via hooks)
    # - type-safety skill loaded
    # - error-handling skill loaded
    # - security skill loaded

    # FIX (if issues found)
    # - Automatic fixes applied
    # - Manual review if needed

    # CHECK
    exec:
      - id: validate
        type: command
        commands:
          - cmd: "npm run typecheck"
            expect: { exit_code: 0 }
          - cmd: "npm run lint"
            expect: { exit_code: 0 }
          - cmd: "npm run test"
            expect: { exit_code: 0 }
```

### WRFC Continuity Rule

**Critical**: The WRFC loop MUST continue until all checks pass.

- If CHECK fails, loop back to FIX
- If FIX introduces new issues, loop back to REVIEW
- Never stop mid-loop
- Never report completion until all checks pass

**Enforced by**: `output-styles` hook, `validation-gates` hook

## Integration Points

### With Claude Code

- **Tool Discovery**: MCP protocol exposes tools to Claude Code
- **Agent Spawning**: Claude Code spawns specialized agents via registry
- **Context Sharing**: Memory system provides context to agents
- **Lifecycle Hooks**: Modify behavior at key lifecycle events

### With External Systems

- **Version Control**: Git operations via `precision_exec` and `project_engine`
- **Package Managers**: npm, pnpm, yarn via `project_engine` tools
- **Databases**: Query and introspection via `project_engine/query_database`
- **CI/CD**: Integration via `deployer` agent and `project_engine` tools
- **Browser DevTools**: Chrome DevTools MCP for frontend debugging

### With User Workspace

- **File System**: All engines operate within workspace boundaries
- **Configuration**: Read project configs via `analysis_engine/read_config`
- **Environment**: Audit and validate via `analysis_engine/env_audit`

## Best Practices

### For Agent Developers

1. **Always discover before batching** - Use `discover` tool to understand scope
2. **Check schemas before MCP calls** - Run `mcp-cli info` before `mcp-cli call`
3. **Load relevant skills** - Use `recommend_skills` for just-in-time knowledge
4. **Follow WRFC loop** - Never skip validation phases
5. **Write to memory** - Track decisions and patterns for future reference
6. **Use precision tools** - Never fall back to basic tools (Read, Grep, etc.)

### For Plugin Developers

1. **Keep tools focused** - Each tool should do one thing well
2. **Provide clear schemas** - Well-documented JSON schemas for all tools
3. **Support batch operations** - Enable multi-operation batching where possible
4. **Emit lifecycle events** - Allow hooks to intercept and modify behavior
5. **Write to activity logs** - Provide audit trail for debugging

### For End Users

1. **Choose output style wisely** - vibecoding for collaboration, justvibes for autonomy
2. **Review activity logs** - Understand what agents are doing
3. **Query memory** - Leverage past decisions and patterns
4. **Trust the WRFC loop** - Let validation cycles complete
5. **Provide feedback** - Help agents learn and improve

## Conclusion

The GoodVibes plugin architecture provides a comprehensive framework for AI-assisted development through:

- **Specialized Tools**: 74 MCP tools across 6 engines for every development task
- **Expert Agents**: 9 specialized agents with domain expertise
- **Just-in-Time Knowledge**: 173 skills loaded dynamically based on context
- **Lifecycle Hooks**: 9 hooks for behavior customization and enforcement
- **Memory System**: Two-tier persistence for logs and structured knowledge
- **Quality Assurance**: WRFC loop ensures production-ready code

This architecture enables autonomous, high-quality code generation while maintaining transparency, consistency, and safety.

---

**Next Steps**:
- Read [Quick Start Guide](./quick-start.md) for getting started
- Explore [Project Documentation](./vibeplug-docs-project.md) for detailed specs
- Review [API Reference](./api-reference.md) for tool schemas
