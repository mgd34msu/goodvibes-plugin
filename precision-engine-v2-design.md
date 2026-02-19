# Precision Engine v2 — Design Document

> Absorbing batch engine concepts, adding agent orchestration, telemetry, hooks, and runtime.
> Date: 2026-02-18

---

## Table of Contents

1. [Overview](#1-overview)
2. [precision_exec File Operations](#2-precision_exec-file-operations)
3. [precision_agent](#3-precision_agent)
4. [precision_config Extensions](#4-precision_config-extensions)
5. [Telemetry / precision_id](#5-telemetry--precision_id)
6. [Precision Engine Hooks](#6-precision-engine-hooks)
7. [Runtime Architecture](#7-runtime-architecture)
8. [Agent Dossier Format](#8-agent-dossier-format)
9. [Project Index Enhancement](#9-project-index-enhancement)
10. [Batch Engine Removal Plan](#10-batch-engine-removal-plan)
11. [Migration / Rollout Order](#11-migration--rollout-order)

---

## 1. Overview

### What We're Building

Precision engine upgrades that absorb the valuable concepts from the batch engine while eliminating its complexity:

| New Capability | Source |
|---------------|--------|
| File operations (copy, move, delete) | Batch write operations (delete, move, copy) |
| AI agent spawning (precision_agent) | Batch agent operations + new multi-provider concept |
| Telemetry / precision_id | Batch telemetry system (simplified) |
| Precision hooks system | Batch hooks (30+ events → focused set) |
| Runtime lifecycle | Batch runtime layer (formalized) |
| Agent dossier format | Batch prompt builder + context injection |
| State management | Batch state operations → precision_config |
| Token estimates in project index | New |

### What We're Removing

- **batch-engine MCP server** — entire separate process (~5,000+ lines)
- **6 batch tools** — batch, batch_status, batch_list, batch_checkpoints, batch_recover, batch_state
- **~65 interface files** — replaced by ~2-3 slim type files in precision engine
- **Checkpoint system** — git + precision_edit rollback covers all cases
- **Agent pool/communication** — orchestrator + Task tool handles this
- **Mode system in tool** — moved to precision_config, not removed (see Section 4)
- **Fix loop** — WRFC loop handles retry logic

### Why

1. Batch engine reimplements file operations independently (raw `fs.readFile`, `child_process.exec`) instead of delegating to precision engine
2. Session state shows `batches_completed: 0` — zero usage in production
3. Read/write operations literally return "handled by precision-engine" — the delegation was intended but never built
4. Discovery phase interface exists but handler is NOT implemented
5. The concepts are sound but the architecture is wrong — a second MCP server reimplementing everything creates friction, not value

### Design Principles

- **One server** — all tool operations through precision engine
- **Compose, don't reimplement** — new tools use existing handlers internally
- **Lightweight over comprehensive** — 80% of value at 20% of complexity
- **Git is the checkpoint system** — no custom snapshot infrastructure
- **Budget-ready** — optional cost/token params that budget engine plugs into later
- **Graceful degradation** — runtime features enhance but tools work without them

---

## 2. precision_exec File Operations

### Motivation

Copy, move/rename, and delete are filesystem mutations not covered by precision_write (content creation) or precision_edit (content modification). Adding them to precision_exec keeps the tool count low and groups all "do things" operations together.

### Schema Addition

```json
{
  "file_ops": [
    {
      "op": "copy",
      "source": "/absolute/path/to/file_or_directory",
      "destination": "/absolute/path/to/target",
      "options": {
        "recursive": true,
        "overwrite": false
      }
    },
    {
      "op": "move",
      "source": "/absolute/path/to/file_or_directory",
      "destination": "/absolute/path/to/new_location",
      "options": {
        "overwrite": false,
        "update_imports": true
      }
    },
    {
      "op": "delete",
      "source": "/absolute/path/to/file_or_directory",
      "options": {
        "recursive": false,
        "dry_run": false
      }
    }
  ]
}
```

### Parameters

| Op | Required | Options | Notes |
|----|----------|---------|-------|
| `copy` | source, destination | recursive (default: false), overwrite (default: false) | Works with files and directories |
| `move` | source, destination | overwrite (default: false), update_imports (default: false) | update_imports rewrites import paths in affected files |
| `delete` | source | recursive (default: false), dry_run (default: false) | **PROJECT ROOT RESTRICTION** — see safety rules |

### Safety Rules

**Delete is restricted to project root:**

```typescript
const projectRoot = await getProjectRoot(); // git root, fallback to cwd
const resolvedPath = path.resolve(source);

if (!resolvedPath.startsWith(projectRoot + path.sep)) {
  return error("Delete restricted to project root. Use Bash rm for paths outside project.");
}
```

Project root determination:
1. `git rev-parse --show-toplevel` (primary)
2. `process.cwd()` (fallback)

Copy and move are NOT restricted to project root — they may legitimately need to work with external paths (e.g., copying a config template from a shared location).

### Batching

Multiple file_ops in one call are executed sequentially (order matters for moves/deletes). They participate in precision_apply's atomic rollback if used within that context.

### Interaction with Existing Params

`file_ops` is a new top-level param alongside `commands`. A single precision_exec call can include both:

```json
{
  "file_ops": [
    { "op": "move", "source": "src/old.ts", "destination": "src/new.ts" }
  ],
  "commands": [
    { "cmd": "npx tsc --noEmit", "expect": { "exit_code": 0 } }
  ]
}
```

Execution order: file_ops first, then commands.

---

## 3. precision_agent

### Motivation

Enable the precision engine to spawn headless AI sessions across multiple providers. This makes orchestration available at the MCP tool level — any MCP client (not just Claude Code) can coordinate AI agents.

### Schema

```json
{
  "prompt": "Review this code for security vulnerabilities in src/auth/",
  "context_files": ["src/auth/middleware.ts", "src/auth/session.ts"],
  "options": {
    "provider": "claude",
    "model": "sonnet",
    "cli_flags": {
      "disallowedTools": ["Write", "Edit"]
    },
    "max_cost": null,
    "max_tokens": null,
    "background": true,
    "dossier": {
      "include": true,
      "extra_reminders": ["Focus on auth bypass vectors"]
    }
  }
}
```

### Parameters

| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `prompt` | Yes | — | The task for the agent to perform |
| `context_files` | No | [] | Files to include as context (read and injected into prompt) |
| `options.provider` | No | `"claude"` | AI provider: `claude`, `gemini`, `codex` |
| `options.model` | No | Provider default | Model to use (provider-specific) |
| `options.cli_flags` | No | {} | Provider-specific CLI flags (passthrough) |
| `options.max_cost` | No | null | Max cost in USD (optional — budget engine plugs in later) |
| `options.max_tokens` | No | null | Max tokens (optional — budget engine plugs in later) |
| `options.background` | No | See rules | Run in background or block for result |
| `options.dossier` | No | { include: true } | Whether to generate and include agent dossier |

### Background vs Blocking

| Caller Context | Default | Behavior |
|---------------|---------|----------|
| Main conversation | background: true | Non-blocking, returns agent_id for tracking |
| Subagent | background: false | Blocks until result returns |
| Explicit override | As specified | Respects the flag regardless of context |

### No Timeout

AI calls are non-deterministic — no fixed timeout. The agent runs until:
- Task completes (agent returns result)
- Budget limit reached (when budget engine is active)
- Explicit cancellation (via precision_exec background management)
- Provider-side timeout (provider's own limits)

### Provider CLI Mappings

#### Claude
```bash
claude --print \
  --dangerously-skip-permissions \
  --disallowedTools "Write,Edit" \
  --model sonnet \
  --max-turns 30 \
  "${prompt_with_dossier}"
```

Key flags:
- `--dangerously-skip-permissions` — REQUIRED for headless execution, agent would stall otherwise
- `--disallowedTools` — blocklist approach (permissive by default)
- `--print` / `-p` — headless mode, returns result to stdout

#### Gemini
```bash
# CLI details TBD — user to research
gemini [flags] "${prompt_with_dossier}"
```

#### Codex
```bash
# CLI details TBD — user to research
# Known constraints: stream: true, store: false, instructions field, input as array
codex [flags] "${prompt_with_dossier}"
```

### Response

```json
{
  "agent_id": "agent_596dc714_a1b2c3d4",
  "status": "running",
  "provider": "claude",
  "model": "sonnet",
  "started_at": "2026-02-18T15:30:00Z"
}
```

When complete (or when queried via precision_exec background status):

```json
{
  "agent_id": "agent_596dc714_a1b2c3d4",
  "status": "completed",
  "result": "Agent's output text...",
  "tokens_used": 45000,
  "cost": 0.12,
  "duration_ms": 34000
}
```

### Dossier Integration

When `dossier.include` is true (default), precision_agent:
1. Reads project index for file tree + token estimates
2. Pulls relevant decisions/patterns/failures from `.goodvibes/memory/`
3. Reads current session state from runtime
4. Assembles dossier JSON (see Section 8)
5. Appends dossier to the prompt before sending to provider

---

## 4. precision_config Extensions

### Motivation

Absorb batch_state functionality and become the central hub for configuration, state, and runtime parameters. All backed by `{project_root}/.goodvibes/goodvibes.json`.

### New Actions

| Action | Purpose | Example |
|--------|---------|--------|
| `get` | Get config value (existing) | `key=sandbox` |
| `set` | Set config value (existing) | `key=sandbox, value=false` |
| `reload` | Reload config from disk (existing) | — |
| `state` | Session state operations (NEW) | `operation=get, keys=["session.tokens_used"]` |
| `telemetry` | Query telemetry data (NEW) | `operation=summary` or `operation=query, filter={tool: "read"}` |
| `hooks` | Manage precision hooks (NEW) | `operation=list` or `operation=enable, hook=after_write.format` |

### State Action Schema

```json
{
  "action": "state",
  "operation": "get",
  "keys": ["session.files_modified", "session.tokens_used", "session.current_task"]
}

{
  "action": "state",
  "operation": "set",
  "values": {
    "session.current_task": "implement-auth",
    "session.phase": "gather"
  }
}

{
  "action": "state",
  "operation": "list",
  "prefix": "session."
}

{
  "action": "state",
  "operation": "clear",
  "keys": ["session.current_task"]
}
```

### State Storage

State lives in **separate session files**, NOT in goodvibes.json (which would bloat the config with ephemeral data):

```
.goodvibes/state/
  ├── session_596dc714.json    # Current session
  ├── session_a1b2c3d4.json    # Previous session (retained for debugging)
  └── ...
```

Session state file structure:

```json
{
  "id": "596dc714",
  "started_at": "2026-02-18T15:00:00Z",
  "files_modified": ["src/auth.ts", "src/types.ts"],
  "tokens_used": 45000,
  "current_task": null,
  "agents_spawned": 3,
  "commands_run": 12
}
```

`goodvibes.json` remains for **configuration only** (sandbox, cache_mode, service registry, hook config, mode defaults). No session-specific data.

### Integration with All Tools

Every precision tool interacts with precision_config:

| Tool | Reads | Writes |
|------|-------|--------|
| precision_read | verbosity defaults, cache settings | state.tokens_used, telemetry |
| precision_write | verbosity defaults | state.files_modified, project index, telemetry |
| precision_edit | verbosity defaults, transaction mode | state.files_modified, project index, telemetry |
| precision_exec | timeout defaults, safety settings | state.commands_run, telemetry |
| precision_grep | output format defaults | state.tokens_used, telemetry |
| precision_glob | output format defaults | telemetry |
| precision_fetch | service registry, auth config | telemetry |
| precision_agent | provider defaults, budget limits | state.agents_spawned, telemetry |
| precision_symbols | output format defaults | telemetry |
| discover | verbosity, project index path | telemetry |

---

## 5. Telemetry / precision_id

### Motivation

Every precision tool call gets a unique ID for tracking, cost attribution, debugging, and performance analysis. Lightweight append-only logging replaces batch engine's complex telemetry system.

### precision_id Format

```
{tool}_{session_short}_{unique_id}
```

Examples:
- `read_596dc714_a1b2c3d4`
- `edit_596dc714_b2c3d4e5`
- `exec_596dc714_c3d4e5f6`
- `agent_596dc714_d4e5f6a7`

Components:
- `tool` — short tool name (read, write, edit, exec, grep, glob, fetch, agent, symbols, discover, config, apply, notebook)
- `session_short` — first 8 chars of session ID
- `unique_id` — 8-char hex from crypto.randomBytes(4)

### Storage: SQLite Database

Telemetry is stored in an embedded SQLite database (via `better-sqlite3`) at `.goodvibes/telemetry/telemetry.db`. All recording happens **entirely server-side** with **zero LLM token cost** — the LLM only receives the precision_id back in the tool response for correlation.

```sql
CREATE TABLE calls (
  id TEXT PRIMARY KEY,          -- precision_id
  session_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  status TEXT NOT NULL,          -- success, failed, partial
  tokens_in INTEGER,             -- estimated from request payload size
  tokens_out INTEGER,            -- estimated from response payload size
  cache_hit BOOLEAN,             -- precision engine internal cache
  cache_bytes_saved INTEGER,     -- bytes avoided by cache hit
  duration_ms INTEGER,
  error TEXT,
  metadata JSON,                 -- tool-specific fields (files, edits, cmd, etc.)
  created_at TEXT NOT NULL
);

CREATE INDEX idx_calls_session ON calls(session_id);
CREATE INDEX idx_calls_tool ON calls(tool);
CREATE INDEX idx_calls_status ON calls(status);
```

### Recording Flow (Zero LLM Tokens)

```
Tool call arrives
  ↓
Generate precision_id (server-side, crypto.randomBytes)
  ↓
Execute tool handler
  ↓
Record to SQLite (server-side, synchronous write via better-sqlite3)
  ↓
Return result with only precision_id included (~1 token)
```

The LLM never outputs telemetry data. It never sees token counts, durations, or cache stats. All tracking is internal to the precision engine process.

### What Gets Tracked Per Call

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | precision_id |
| `session_id` | string | 8-char session identifier |
| `tool` | string | Tool short name |
| `tokens_in` | integer | Estimated input tokens (request payload size / 4) |
| `tokens_out` | integer | Estimated output tokens (response payload size / 4) |
| `cache_hit` | boolean | Whether precision engine's internal cache was used |
| `cache_bytes_saved` | integer | Bytes avoided via cache hit |
| `duration_ms` | integer | Wall clock time |
| `status` | string | success, failed, partial |
| `error` | string? | Error message if failed |
| `metadata` | JSON | Tool-specific fields (`files`, `edits`, `cmd`, `queries`, `urls`, etc.) |

**Note on token estimates**: `tokens_in` and `tokens_out` are rough estimates (payload_bytes / 4) of the MCP tool call data, NOT LLM-level token accounting. LLM-level cache reads/writes and actual model token consumption are tracked at the API layer, not here. These estimates are retained for the future budget engine, which can use them to approximate per-tool-call costs. The overhead is negligible (one string length calculation + integer division, stored as two integers in SQLite).

### Session Summary

Runtime maintains an in-memory session summary, updated on each call. Queryable via `precision_config action=telemetry operation=summary`:

```json
{
  "session_id": "596dc714",
  "total_calls": 47,
  "by_tool": {
    "read": { "calls": 12, "tokens": 15000, "cache_hits": 4, "avg_ms": 34 },
    "edit": { "calls": 8, "tokens": 2400, "cache_hits": 0, "avg_ms": 28 },
    "exec": { "calls": 5, "tokens": 1200, "cache_hits": 0, "avg_ms": 3200 }
  },
  "total_tokens": 52000,
  "total_cache_hits": 4,
  "total_duration_ms": 45000,
  "success_rate": 0.94
}
```

### Cost Tracking (Future — Budget Engine)

The telemetry system records token estimates and cache stats. When the budget engine is active, it can:
- Apply per-model pricing to approximate costs per tool call
- Enforce budget limits per session/agent
- Alert on spending thresholds
- Correlate with API-level token data for accurate cost attribution

For now, raw estimates are sufficient — zero overhead to collect, stored for future use.

---

## 6. Precision Engine Hooks

### Motivation

Control flow at tool boundaries — run custom logic before/after precision tool calls. Replaces batch engine's 30+ internal hooks with a focused, configurable set.

### Hook Events

4 unified events instead of per-tool events. CamelCase to match Claude Code convention (PreToolUse, PostToolUse).

| Event | When It Fires | Use Cases |
|-------|--------------|----------|
| `PrePrecisionTool` | Before ANY precision tool call | Cache check, permission check, budget validation, command safety |
| `PostPrecisionTool` | After ANY precision tool call | Telemetry recording, result caching, index updates |
| `OnPrecisionError` | On ANY precision tool error | Error logging, failure recording to memory |
| `OnPrecisionMutation` | After any write/edit/exec/file_op | Project index update, cache invalidation, auto-format |

Hook handlers receive a context object with `tool_name` and use the `filter` field to scope to specific tools if needed. Adding new precision tools never requires new hook events.

### Hook Types

| Type | Execution | Use Case |
|------|-----------|----------|
| **Built-in** | In-process function call | Telemetry recording, index updates, cache operations |
| **Script** | Shell command execution | Custom validation, formatting, external integrations |
| **MCP** | Call another MCP tool | Cross-engine coordination (e.g., trigger analysis after edit) |

### Hook Configuration

Stored in `.goodvibes/goodvibes.json` under `hooks` key:

```json
{
  "hooks": {
    "PrePrecisionTool": [
      { "type": "builtin", "name": "command_safety_check", "filter": { "tool": ["exec"] }, "enabled": true }
    ],
    "PostPrecisionTool": [
      { "type": "builtin", "name": "record_telemetry", "enabled": true },
      { "type": "builtin", "name": "update_index", "filter": { "tool": ["write", "edit", "exec"] }, "enabled": true },
      { "type": "script", "cmd": "npx prettier --write {{path}}", "filter": { "tool": ["write", "edit"] }, "enabled": false }
    ],
    "OnPrecisionError": [
      { "type": "builtin", "name": "log_failure", "enabled": true }
    ]
  }
}
```

### Hook Execution

- **PrePrecisionTool** hooks run sequentially before the tool operation. If any hook returns `{ abort: true, reason: "..." }`, the operation is cancelled.
- **PostPrecisionTool** hooks run sequentially after the tool operation. They receive the tool's result.
- **OnPrecisionError** hooks run when a tool call fails. They receive the error context.
- **OnPrecisionMutation** fires after any write/edit/exec/file_op. Consolidates index updates.

All hooks receive the `tool_name` in context. Use the `filter` field in hook config to scope hooks to specific tools without needing separate events.

Hook context object:

```typescript
interface HookContext {
  precision_id: string;       // The call's unique ID
  tool_name: string;          // Tool short name (read, write, edit, exec, etc.)
  input: unknown;             // Tool input params
  result?: unknown;           // Tool result (PostPrecisionTool only)
  error?: Error;              // Error (OnPrecisionError only)
  paths_affected?: string[];  // Files touched (OnPrecisionMutation only)
  session: SessionState;      // Current session state
  runtime: PrecisionRuntime;  // Runtime reference
}
```

### Built-in Hooks (Active by Default)

| Hook | Event | What It Does |
|------|-------|--------------|
| `record_telemetry` | PostPrecisionTool | Records to SQLite, updates session summary |
| `update_index` | OnPrecisionMutation | Updates project index (upsertFile/removeFile) |
| `invalidate_cache` | OnPrecisionMutation | Clears cache for modified files |
| `log_failure` | OnPrecisionError | Writes to `.goodvibes/memory/failures.json` |

### Management

Via `precision_config action=hooks`:

```json
{ "action": "hooks", "operation": "list" }
{ "action": "hooks", "operation": "enable", "event": "PostPrecisionTool", "hook": "auto_format" }
{ "action": "hooks", "operation": "disable", "event": "PostPrecisionTool", "hook": "auto_format" }
{ "action": "hooks", "operation": "add", "event": "PostPrecisionTool", "hook": { "type": "script", "cmd": "npx eslint --fix {{path}}", "filter": { "tool": ["edit"] } } }
```

---

## 7. Runtime Architecture

### Motivation

Hooks, telemetry, state, and configuration all need a shared lifecycle. Currently precision_engine has scattered singletons (`runtime-config.ts`, `project-index.ts`). The runtime formalizes these under one roof.

### Initialization

Triggered by **SessionStart hook** in Claude Code:

```
Claude Code session starts
  ↓
SessionStart hook fires
  ├── Project indexer (existing)
  └── Runtime initialization (new)
       ├── Load config from .goodvibes/goodvibes.json
       ├── Restore state from config state key
       ├── Generate session ID (8-char hex)
       ├── Initialize telemetry (open calls.jsonl for append)
       ├── Register precision hooks (built-in + configured)
       └── Set runtime_ready = true
```

### Singleton Structure

```typescript
class PrecisionRuntime {
  // Lifecycle
  static instance: PrecisionRuntime | null;
  static async initialize(): Promise<PrecisionRuntime>;
  static get(): PrecisionRuntime | null;  // Returns null if not initialized

  // Components
  readonly config: RuntimeConfig;          // Existing — unified under runtime
  readonly state: StateManager;            // New — session state KV store
  readonly telemetry: TelemetryManager;    // New — precision_id + call logging
  readonly hooks: HookManager;             // New — before/after/error dispatch
  readonly index: ProjectIndex;            // Existing — unified under runtime
  readonly mode: ModeManager;              // New — mode-specific defaults
  readonly session: SessionInfo;           // New — session ID, start time, etc.

  // Convenience
  generateId(tool: string): string;        // Generate precision_id
  getState(key: string): unknown;
  setState(key: string, value: unknown): void;
}
```

### Graceful Degradation

If SessionStart doesn't fire (e.g., MCP server used outside Claude Code), or if initialization fails:

- **Config**: Falls back to reading goodvibes.json on demand (current behavior)
- **State**: In-memory only, not persisted
- **Telemetry**: Disabled, precision_ids still generated but not logged
- **Hooks**: Only built-in hooks active, no script/MCP hooks
- **Index**: Loads lazily on first access (current behavior)

Every tool checks `PrecisionRuntime.get()` — if null, operates in degraded mode. No tool ever fails because the runtime isn't initialized.

### Tool Call Flow (with Runtime)

```
Tool call arrives
  ↓
Generate precision_id → runtime.generateId("read")
  ↓
Fire before hooks → runtime.hooks.fire("before_read", context)
  ↓ (abort if any hook returns abort: true)
Execute tool handler (existing precision_* logic)
  ↓
Fire after hooks → runtime.hooks.fire("after_read", context)
  ↓
Record telemetry → runtime.telemetry.record(callData)
  ↓
Return result (with precision_id included)
```

### Shutdown

Triggered by SessionEnd / Stop hooks:

```
Session ending
  ↓
Flush telemetry (write any buffered entries)
  ↓
Persist state to goodvibes.json
  ↓
Flush project index
  ↓
Clear runtime singleton
```

---

## 8. Agent Dossier Format

### Motivation

Standardize the context package every AI agent receives. The dossier is a structured JSON supplement to the orchestrator's natural language instructions — it does NOT replace orchestrator prompts, it augments them.

### When Used

- **precision_agent**: Automatically generated and appended to prompt (when `dossier.include: true`)
- **Orchestrator's Task tool calls**: Orchestrator can manually include dossier content in agent prompts
- **Future**: May transition to primary agent communication format once proven

### Schema

```json
{
  "dossier": {
    "task": {
      "description": "Implement JWT authentication middleware",
      "acceptance_criteria": [
        "Token generation on login",
        "Token validation middleware",
        "Refresh token flow",
        "Logout invalidation"
      ],
      "scope": ["src/auth/", "src/middleware/"]
    },
    "constraints": {
      "tools": "precision_engine only, DPB pattern mandatory",
      "quality": "Enterprise-grade, no mocks, no placeholders",
      "budget": {
        "max_tokens": null,
        "max_cost": null
      }
    },
    "context": {
      "decisions": [
        {
          "id": "dec_20260218_143052",
          "what": "Using jose library for JWT",
          "why": "Edge runtime compatible, maintained"
        }
      ],
      "patterns": [
        {
          "name": "Handler export style",
          "description": "All handlers use export const handleX: ToolHandler = async (args) => { pattern"
        }
      ],
      "failures": [
        {
          "error": "Import extension missing",
          "resolution": "Always use .js extension for ESM imports"
        }
      ],
      "prior_results": []
    },
    "project": {
      "stack": ["next", "prisma", "tailwind", "typescript"],
      "index_summary": "47 TS files, 12 components, ~15k tokens total",
      "key_files": [
        { "path": "src/auth/config.ts", "tokens": 340, "role": "Auth configuration" },
        { "path": "src/middleware.ts", "tokens": 520, "role": "Request middleware chain" }
      ]
    },
    "reminders": [
      "Use precision_engine tools, not native (Read, Write, Edit, Glob, Grep, WebFetch)",
      "Follow DPB loops: D(1 call) → P(0 calls) → B(1-2 calls)",
      "precision_exec is for build/test/deploy ONLY — never for file search/read",
      "Check .goodvibes/memory/ before implementing",
      "Always use .js extensions for ESM imports",
      "Handler pattern: export const handleX: ToolHandler = async (args) => {"
    ],
    "output_format": null
  }
}
```

### Field Details

| Field | Required | Description |
|-------|----------|-------------|
| `task` | Yes | What to do — description, acceptance criteria, file scope |
| `constraints` | Yes | How to do it — tools, quality bar, budget limits |
| `context.decisions` | Auto | Relevant architectural decisions from `.goodvibes/memory/decisions.json` |
| `context.patterns` | Auto | Relevant patterns from `.goodvibes/memory/patterns.json` |
| `context.failures` | Auto | Relevant past failures from `.goodvibes/memory/failures.json` |
| `context.prior_results` | Auto | Output from dependency agents in the current workflow |
| `project` | Auto | Stack, index summary, key files with token estimates |
| `reminders` | Yes | SUBAGENT-PROTOCOL content + project-specific conventions |
| `output_format` | **Optional** | When set, specifies exact response structure expected from agent |

### output_format (Optional)

When the orchestrator needs agent output in a specific structure:

```json
"output_format": {
  "type": "structured",
  "schema": {
    "files_modified": ["string"],
    "decisions_made": [{ "what": "string", "why": "string" }],
    "issues_found": [{ "severity": "string", "description": "string" }],
    "summary": "string"
  }
}
```

When null/omitted, the agent responds naturally and the orchestrator interprets the result.

### Memory Injection

The dossier generator automatically queries `.goodvibes/memory/` for relevant entries:

1. **Decisions**: Filter by `scope` overlap with task scope, most recent 5
2. **Patterns**: Filter by `keywords` matching task description, most relevant 3
3. **Failures**: Filter by `keywords` matching task scope/description, most recent 3

This replaces batch engine's prompt builder context injection concept.

### SUBAGENT-PROTOCOL Integration

The `reminders` array incorporates key rules from SUBAGENT-PROTOCOL.md:
- Precision tool usage requirements
- DPB loop enforcement
- precision_exec restrictions
- Memory/logging requirements
- Sandbox prohibition

These are always included. The orchestrator can add task-specific reminders.

### Prompt Assembly

```
[Orchestrator's natural language task description]

--- AGENT DOSSIER ---
[Dossier JSON, minified]
```

The orchestrator writes *what* to do. The dossier provides *how*, *context*, and *constraints*.

---

## 9. Project Index Enhancement

### Token Estimates

The project indexer already walks the filesystem via `fs.stat()`. Adding `stat.size` to the index enables token estimation.

**Current format (v2)**:
```json
{
  "version": 2,
  "tree": {
    "src": ["index.ts", "types.ts", "auth.ts"],
    "src/components": ["Button.tsx", "Modal.tsx"]
  }
}
```

**Proposed format (v3)**:
```json
{
  "version": 3,
  "tree": {
    "src": [
      { "name": "index.ts", "size": 1240, "tokens": 310 },
      { "name": "types.ts", "size": 3400, "tokens": 850 },
      { "name": "auth.ts", "size": 8200, "tokens": 2050 }
    ],
    "src/components": [
      { "name": "Button.tsx", "size": 2100, "tokens": 525 },
      { "name": "Modal.tsx", "size": 4800, "tokens": 1200 }
    ]
  }
}
```

Token estimation: `Math.ceil(size_bytes / 4)` — rough but sufficient for planning.

**Backward compatibility**: `load()` detects version and migrates (v1 → v2 migration already exists).

### Benefits

- Agents see file sizes before deciding what to read
- Dossier includes token estimates for key files
- Discover results include token estimates
- Agents can plan reads to stay within token budgets

---

## 10. Batch Engine Removal Plan

### Phase 1: Verify (COMPLETE)

- [x] Batch engine hooks are NOT firing during sessions
- [x] No cross-engine dependencies on batch interfaces
- [x] Only 3 files reference batch types outside batch-engine itself

### Phase 2: Clean Up Integration Layer

| File | Action | Details |
|------|--------|---------|
| `src/engines/batch-engine.ts` | Delete | Local type proxy (~665 lines) |
| `src/engines/index.ts` | Edit | Remove batch exports |
| `src/integration/index.ts` | Edit | Remove `BatchEngine` import, instantiation, and `executeBatch()` method |

### Phase 3: Remove Batch Engine

| Action | Target |
|--------|--------|
| Delete directory | `plugins/goodvibes/tools/implementations/batch-engine/` |
| Remove from MCP config | `plugins/goodvibes/.mcp.json` — remove batch-engine server entry |
| Remove tool definitions | `plugins/goodvibes/tools/definitions/batch-engine/` — all 6 YAML files |
| Remove examples | `plugins/goodvibes/examples/batches/` |
| Update ToolSearch | Batch tools no longer appear in deferred tools list |

### Phase 4: Update Documentation

| File | Action |
|------|--------|
| Prompt files referencing batch | Update to use precision_apply / GPA terminology |
| Agent .md files | Remove batch_engine references |
| MEMORY.md | Add batch removal decision record |
| Skills referencing batch | Update to precision tools only |

### Phase 5: Verification

- Run full test suite (`npx vitest run` in precision-engine)
- Verify MCP server starts without batch-engine
- Verify no ToolSearch results reference batch tools
- Verify all hooks still fire correctly

---

## 11. Migration / Rollout Order

### Priority and Dependencies

```
Phase 1 (Non-blocking — can run in parallel):
  A. precision_exec file_ops — small, self-contained
  B. Project index v3 (token estimates) — small, self-contained
  C. Batch engine removal — no dependencies on new features

Phase 2 (Depends on nothing, but benefits from Phase 1C):
  D. Telemetry / precision_id — needs runtime (Phase 3) for full value,
     but basic call logging can work standalone
  E. precision_config state extension — standalone

Phase 3 (Depends on D + E):
  F. Runtime architecture — unifies config, state, telemetry, index
     under one lifecycle. Requires SessionStart hook integration.

Phase 4 (Depends on F):
  G. Precision engine hooks — requires runtime for lifecycle management

Phase 5 (Depends on F + G):
  H. Agent dossier format — requires runtime for memory injection,
     project index for token estimates
  I. precision_agent — requires dossier, hooks, telemetry

Phase 6 (Depends on I):
  J. GPA loop documentation update — update DPB → GPA, reference
     precision_apply if built, update all prompt files
```

### Estimated Effort

| Phase | Items | New Lines (est.) | Complexity |
|-------|-------|-----------------|------------|
| 1A | file_ops in precision_exec | ~150-200 | Low |
| 1B | Project index v3 | ~80-100 | Low |
| 1C | Batch engine removal | Net negative (~5000 deleted, ~20 edited) | Low |
| 2D | Telemetry / precision_id | ~200-300 | Medium |
| 2E | precision_config state | ~150-200 | Medium |
| 3F | Runtime architecture | ~300-400 | Medium-High |
| 4G | Hooks system | ~300-400 | Medium-High |
| 5H | Dossier format | ~200-300 | Medium |
| 5I | precision_agent | ~400-500 | High |
| 6J | Documentation | ~500 edited | Low |
| **Total** | | **~2000-2500 new** | |

Compare: batch engine was ~5000+ lines. We're replacing it with ~2000-2500 lines that do more, integrate properly, and don't reimplement existing functionality.

---

## Open Items

1. **Gemini CLI flags** — user to research
2. **Codex CLI flags** — user to research
3. **precision_apply** — still a candidate for Phase 5 (unified write+edit+exec output call). Design is ready in batch-and-precision-notes.md. Implementation deferred until runtime + hooks are in place to properly support it.
4. **Budget engine** — future work. precision_agent max_cost/max_tokens are optional placeholders. Telemetry token counts feed into it when ready.
5. **Mode enforcement** — precision_config mode action. Lower priority. Modes currently work via prompt; config enforcement adds guarantees.
