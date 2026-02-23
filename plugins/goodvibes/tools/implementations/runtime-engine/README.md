# Runtime Engine

The runtime engine is a long-lived MCP server that provides workflow orchestration, event
pub/sub, trigger automation, agent coordination, and IPC for the GoodVibes plugin. Hook
scripts (short-lived processes spawned by Claude Code) communicate with the engine over a
Unix domain socket; Claude Code interacts with it through seven MCP tools.

## Architecture

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │                        Runtime Engine Process                        │
 │                                                                      │
 │  ┌─────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
 │  │  MCP Server │    │  IPC Server  │    │   ProcessManager     │   │
 │  │ (stdio/MCP) │    │ (Unix socket)│    │ (lifecycle + config) │   │
 │  └──────┬──────┘    └──────┬───────┘    └──────────────────────┘   │
 │         │                  │                                         │
 │         ▼                  ▼                                         │
 │  ┌─────────────────────────────────────────────────────────┐        │
 │  │                      EventBus                           │        │
 │  │            (in-memory pub/sub + history)                │        │
 │  └───┬──────────────┬──────────────────┬───────────────────┘        │
 │      │              │                  │                             │
 │      ▼              ▼                  ▼                             │
 │  ┌────────┐  ┌─────────────┐  ┌────────────────┐                   │
 │  │EventLog│  │TriggerRegistr│  │ WorkflowEngine │                   │
 │  │(JSONL) │  │(conditions + │  │(state machines)│                   │
 │  └────────┘  │ actions)    │  └───────┬────────┘                   │
 │              └──────┬───────┘          │                             │
 │                     │                  ▼                             │
 │              ┌──────┴───────┐  ┌────────────────┐                  │
 │              │DirectiveQueue│  │AgentCoordinator│                   │
 │              │(WRFC inject) │  │(budget + deps) │                   │
 │              └──────────────┘  └────────────────┘                  │
 │                                                                      │
 │  ┌──────────────┐    ┌─────────────┐    ┌──────────────────────┐   │
 │  │  EventQueue  │    │ StateStore  │    │    BudgetTracker      │   │
 │  │ (priority    │    │ (JSON file  │    │  (session tokens)     │   │
 │  │  processing) │    │  persist.)  │    └──────────────────────┘   │
 │  └──────────────┘    └─────────────┘                               │
 └──────────────────────────────────────────────────────────────────────┘
          ▲                       ▲
          │ MCP (stdio)           │ IPC (Unix socket, newline-delimited JSON)
          │                       │
  ┌───────┴──────┐       ┌────────┴────────┐
  │  Claude Code │       │  Hook Scripts   │
  │  (MCP client)│       │ (pre/post hooks)│
  └──────────────┘       └─────────────────┘
```

## Modules

| Module | Path | Purpose |
|--------|------|---------|
| MCP Server | `src/server/mcp-server.ts` | Stdio MCP server; routes tool calls to handlers |
| Tool Handlers | `src/server/tool-handlers.ts` | Handler implementations for all 7 MCP tools |
| Process Manager | `src/lifecycle/process-manager.ts` | Full startup/shutdown orchestration, PID locking, checkpoints |
| Health Checker | `src/lifecycle/health.ts` | Memory, queue depth, and subsystem health checks |
| Signal Handlers | `src/lifecycle/signals.ts` | SIGTERM/SIGINT graceful shutdown wiring |
| EventBus | `src/events/event-bus.ts` | In-memory pub/sub with history ring buffer |
| EventLog | `src/events/event-log.ts` | Persistent JSONL event log with compaction |
| EventQueue | `src/events/event-queue.ts` | Priority queue for deferred event processing |
| IPC Server | `src/ipc/ipc-server.ts` | Unix domain socket server (newline-delimited JSON) |
| IPC Client | `src/ipc/client.ts` | Client used by hook scripts to talk to the engine |
| IPC Protocol | `src/ipc/protocol.ts` | All IPC message/response type definitions |
| File Fallback | `src/ipc/file-fallback.ts` | File-based fallback when the socket is unavailable |
| WorkflowEngine | `src/workflow/workflow-engine.ts` | Formal state machine executor (no eval) |
| Workflow Types | `src/workflow/types.ts` | WorkflowDefinition, WorkflowInstance, transitions |
| WRFC Definition | `src/workflow/definitions/wrfc-loop.ts` | Built-in Write-Review-Fix-Complete loop definition |
| Fix Loop | `src/workflow/definitions/fix-loop.ts` | Built-in iterative fix loop definition |
| TriggerRegistry | `src/triggers/trigger-registry.ts` | Registers, evaluates, and fires trigger definitions |
| ConditionEvaluator | `src/triggers/condition-evaluator.ts` | Evaluates event/composite/threshold/pattern conditions |
| ActionExecutor | `src/triggers/action-executor.ts` | Executes emit/spawn/workflow/handler actions |
| Builtins | `src/triggers/builtins.ts` | Default built-in trigger definitions |
| AgentCoordinator | `src/agents/agent-coordinator.ts` | Agent registry with WRFC chain tracking and dependency resolution |
| BudgetTracker | `src/agents/budget-tracker.ts` | Session-level token budget accounting |
| DirectiveQueue | `src/directives/directive-queue.ts` | Queues system-message directives for hook injection |
| WRFC Handlers | `src/directives/wrfc-handlers.ts` | Wires WRFC trigger actions to DirectiveQueue |
| State Store | `src/persistence/state-store.ts` | JSON file persistence for runtime state and checkpoints |
| Config | `src/shared/config.ts` | RuntimeConfig types, defaults, load/save helpers |
| Logger | `src/shared/logger.ts` | Structured JSON logger (writes to stderr) |
| Utils | `src/shared/utils.ts` | ID generation, timestamps, relative time parsing |
| Constants | `src/shared/constants.ts` | ENGINE_VERSION and other compile-time constants |
| Types | `src/types.ts` | Top-level RuntimeResult, HealthStatus, and related types |

## Startup Sequence

1. `src/server.ts` instantiates `RuntimeEngineServer` and calls `start()`.
2. **Load config** — reads `.goodvibes/runtime.config.json` from the project root; merges with `DEFAULT_CONFIG`.
3. **State store** — initialises `JsonStateStore`; writes `.goodvibes/state/runtime.checkpoint.json`.
4. **Event system** — creates `EventBus`, `EventLog` (opens JSONL file), and `EventQueue` (starts processor).
5. **Crash recovery** — checks for a stale PID file left by a previous crash; logs a warning if found.
6. **PID lock** — writes the current PID to `/tmp/goodvibes-runtime-engine-<hash>.pid`.
7. **Checkpoint timer** — starts a 30 s periodic timer that saves a checkpoint and prunes stale data.
8. **Workflow engine** — registers WRFC_LOOP and FIX_LOOP definitions; wires the `checkReviewScore` guard.
9. **Trigger registry** — registers built-in triggers; subscribes to `EventBus` for all events.
10. **Directive queue** — creates `DirectiveQueue`; wires it into the `ActionExecutor`.
11. **Agent coordinator** — creates `BudgetTracker` and `AgentCoordinator` if `agents_enabled`.
12. **WRFC handlers** — registers automation handlers that link triggers to the DirectiveQueue.
13. **IPC server** — binds a Unix domain socket at `/tmp/goodvibes-runtime-<hash>.sock`; writes the path to `.goodvibes/state/runtime.socket` for hook discovery.
14. **Startup event** — emits `system:startup` on the EventBus.
15. **MCP server** — starts stdio transport; begins handling tool calls.

## IPC Protocol

The IPC channel uses **newline-delimited JSON** over a Unix domain socket. Each message is a
single JSON object followed by `\n`. The runtime engine responds synchronously with a
correlated response (same `id` field).

### Message Types (Hook → Engine)

| Type | Purpose |
|------|---------|
| `hook_event` | Notify the engine that a hook fired; carries full hook input |
| `query` | Request state or a decision (directives, workflow state, tool block) |
| `state_update` | Push lightweight state key/value pairs into the engine |
| `heartbeat` | Confirm the connection is alive; engine replies with `ack` |

### Query Kinds

| Kind | Returns |
|------|---------|
| `get_system_message` | System message to inject into the next conversation turn |
| `get_directives` | Active directives for the current hook to apply |
| `get_workflow_state` | Serialised `WorkflowInstance` by ID |
| `get_agent_status` | Serialised `CoordinatedAgent` by ID |
| `should_block_tool` | Allow/block decision for a pending tool call |
| `get_context_injection` | Context text to inject at the next turn |

### Response Envelope

```json
{ "id": "<echoes request id>", "status": "ok", "data": { "kind": "...", ... } }
```

On error: `{ "id": "...", "status": "error", "error": "<message>" }`

## MCP Tools

| Tool | Description |
|------|-------------|
| `runtime_status` | Engine health, uptime, memory, feature flags |
| `runtime_config` | Read or modify runtime configuration (get/set/reset) |
| `runtime_events` | Query event log or tail EventBus history (query/tail/stats) |
| `runtime_emit` | Emit a custom event into the EventBus |
| `runtime_workflow` | Manage workflow instances (create/get/list/advance/cancel/history) |
| `runtime_triggers` | Manage trigger definitions (list/get/create/update/delete/enable/disable/test) |
| `runtime_agents` | Manage coordinated agents (status/list/get/spawn/cancel/budget/plan) |

## Build & Test

```bash
# Build (bundles to dist/index.cjs via esbuild)
node build.mjs

# Type-check without building
npm run typecheck

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

Test files live alongside their subjects in `src/**/__tests__/` directories.
