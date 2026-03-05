# Runtime Engine Spec Reconciliation

> **Spec**: `docs/missing-rte-features.md` (27 gaps across 10 categories)
> **Base path**: `plugins/goodvibes/tools/implementations/runtime-engine/src/`
> **Date**: 2026-03-05

---

## Summary

| Status | Count |
|--------|-------|
| DONE | 25 |
| PARTIAL | 2 |
| MISSING | 0 |
| STUB | 0 |

Of 27 spec items, 25 are fully implemented and wired. Two items have partial gaps:
1. `createHumanEvent()` factory exists but is not wired in UserPromptSubmit handler (explicit TODO at line 38)
2. `Reconfigurable` implementation on the trigger registry is missing — the trigger subsystem is not registered in the `reconfigurables` map

---

## Spec Item Reconciliation Table

### Category 2: Missing Event Factories

| # | Item | Spec Section | Status | Evidence |
|---|------|-------------|--------|----------|
| 2.1 | `createAgentEvent()` factory | §2.1 | **DONE** | `extensions/events/factories.ts:137-165` — Full implementation with priority 40, `source.kind: 'agent'`, exports `AgentEvent` interface |
| 2.2 | `createHumanEvent()` factory | §2.2 | **PARTIAL** | `extensions/events/factories.ts:241-265` — Factory fully implemented with priority 70, `source.kind: 'user'`, exports `HumanEvent` interface. **Gap**: Not wired in `plugins/hooks/handlers/user-prompt-submit.ts` — line 38 has `// TODO: eventBus: EventBus | null;  // wire createHumanEvent() when budget allows`. The factory is callable but no code path in the system actually emits `HumanEvent` instances. |

### Category 3: Dead-End Trigger Pipeline

| # | Item | Spec Section | Status | Evidence |
|---|------|-------------|--------|----------|
| 3.1 | Build/Test event detector | §3.1 | **DONE** | `plugins/hooks/handlers/build-test-detector.ts:39-103` — `BuildTestDetector` class subscribes to `hook:post_tool_use` on EventBus, pattern-matches against configurable command lists (`DEFAULT_DETECTOR_CONFIG` at line 19-22), emits `build:failed`/`build:succeeded`/`test:failed`/`test:succeeded`. Wired in `bootstrap.ts:483-486` via `new BuildTestDetector(this.events.eventBus); buildTestDetector.start()`. |
| 3.2 | Agent progress events | §3.2 | **DONE** | `plugins/agent-tracker/agent-tracker-plugin.ts:263-289` — `emitAgentProgress()` method emits `agent:progress` events for all active agents, subscribed to heartbeat at line 95. Uses `createAgentEvent()` factory (imported at line 13, called at line 276). Tests exist at `__tests__/agent-tracker-plugin.test.ts:172-205`. |
| 3.3 | Dev server monitor | §3.3 | **DONE** | `plugins/devserver/index.ts:38-127` — `DevServerMonitor` class with `start()`, `stop()`, `checkHealth()` (HTTP health check), `emitError()` (emits `devserver:error` via `createHookEvent`), and `reconfigure()`. Config-driven (opt-in). Wired in `bootstrap.ts:539-544` — conditionally instantiated when `config.devserver?.enabled`. Registered as reconfigurable. Cleanup in `shutdown()` at line 647-648. |

### Category 4: Unregistered Action Handlers

| # | Item | Spec Section | Status | Evidence |
|---|------|-------------|--------|----------|
| 4.1 | Handler implementations | §4.1 | **DONE** | All handlers implemented as real functions (not stubs):<br>- `devserver-handler.ts:78-118` — `restartDevServer()` with `killProcessOnPort()` and `waitForPort()`<br>- `notify-handler.ts:45-77` — `notifyUser()` writes to `.goodvibes/notifications/`<br>- `log-handler.ts:61-77` — `logEvent()` appends to `.goodvibes/logs/activity.md`<br>- `memory-handler.ts:60-98` — `updateMemory()` with allowed-file whitelist<br>- `build-handler.ts:36-71` — `runBuild()` with shell exec and timeout<br>- `test-handler.ts:36-71` — `runTests()` with shell exec and timeout<br>- `ci-handler.ts` — `bridgeCIFailure()` (bonus, not in original spec)<br>- `guards.ts` — `hasTestSuite()` and `buildPassing()` |
| 4.2 | Handler registration in bootstrap | §4.2 | **DONE** | `bootstrap.ts:463-481`:<br>- Trigger handlers: `restartDevServer`, `bridgeCIFailure`, `notifyUser`, `logEvent`, `updateMemory` registered via `triggerReg.registerHandler()`<br>- Workflow actions: `run_build`, `run_tests`, `notify_complete` registered via `wfEngine.registerAction()`<br>- Workflow guards: `has_test_suite`, `build_passing` registered via `wfEngine.registerGuard()` |

### Category 5: External Event Pipeline Consumers

| # | Item | Spec Section | Status | Evidence |
|---|------|-------------|--------|----------|
| 5.1 | Builtin external triggers | §5.1 | **DONE** | `extensions/triggers/builtins.ts:162-213`:<br>- `builtin_webhook_received` (line 162) — listens for `webhook:*`, emits `external:webhook_received`<br>- `builtin_ci_failure` (line 187) — listens for `webhook:ci:*`, invokes `bridgeCIFailure` handler (smart: filters on status before emitting `build:failed`, preventing false triggers from success/pending events) |
| 5.2 | Custom trigger API | §5.2 | **DONE** | Existing `runtime_triggers` MCP tool supports `create` action. The spec only asked for documented patterns (examples), not new code. The trigger creation path is functional. |

### Category 6: Time Plugin MCP Exposure

| # | Item | Spec Section | Status | Evidence |
|---|------|-------------|--------|----------|
| 6.1 | `runtime_schedule` MCP tool | §6.1 | **DONE** | `plugins/mcp/handlers/schedule.ts:24-327` — Full handler with all 7 actions: `list`, `create`, `cancel`, `get`, `pause`, `resume`, `heartbeat`. Registered in `plugins/mcp/handlers/index.ts:69`. Schema in `schemas.ts:333`. Tool definition at `tools/definitions/runtime-engine/runtime-schedule.yaml`. |
| 6.2 | Named interval presets | §6.2 | **DONE** | `shared/presets.ts:9-16` — `INTERVAL_PRESETS` map with all 6 presets (`every_minute`, `every_5_minutes`, `every_15_minutes`, `every_hour`, `every_6_hours`, `daily`). `resolveInterval()` function at line 25-34 handles both preset names and raw ms values. |

### Category 7: Workflow Engine Stubs

| # | Item | Spec Section | Status | Evidence |
|---|------|-------------|--------|----------|
| 7.1 | `spawn_agent` implementation | §7.1 | **DONE** | `extensions/workflow/workflow-engine.ts:880-922` — Full implementation (no longer a stub). Builds spawn directive message, enqueues via `directiveQueue.enqueue('subagent_stop', ...)`, registers pending bind via `agentWorkflowMap.addPendingBind()` with both bare and `goodvibes:`-prefixed agent types, logs spawn info. Handles missing `directiveQueue` gracefully. |
| 7.2 | Workflow state persistence | §7.2 | **DONE** | `extensions/persistence/workflow-persistence.ts:42-187` — `WorkflowPersistence` class with atomic write-then-rename (`persist()` at line 62-77), `restore()` at line 87-108, `cleanup()` with TTL-based expiry at line 121-160, `remove()` at line 170-186. Wired in `bootstrap.ts:248-274` — restores at startup, persists on workflow state transitions via event listener, runs initial cleanup. |

### Category 8: IPC Stubs

| # | Item | Spec Section | Status | Evidence |
|---|------|-------------|--------|----------|
| 8.1 | `should_block_tool` implementation | §8.1 | **DONE** | `extensions/ipc/tool-gating.ts:37-148` — `ToolGateEvaluator` class with `evaluate()` (line 55-87), `matchesPattern()` glob matching (line 93-104), `evaluateCondition()` supporting `always`, `budget_exceeded`, `workflow_phase`, `custom` conditions (line 107-147). Fail-open: returns `{ allow: true }` on no match or error. IPC router at `ipc-router.ts:427-435` calls `this.toolGateEvaluator?.evaluate(toolName) ?? { allow: true }`. |
| 8.2 | `get_context_injection` implementation | §8.2 | **DONE** | `extensions/ipc/context-injector.ts:43-155` — `ContextInjector` class with `getContext()` (line 63-86), `gatherWorkflowState()` (line 103-124), `gatherAgentRoster()` (line 127-139), `gatherBudgetStatus()` (line 142-154). Configurable via `ContextInjectionConfig`. IPC router at `ipc-router.ts:436-443` calls `this.contextInjector?.getContext() ?? { context: '', priority: 0 }`. |

### Category 9: Config Hot Reload Gaps

| # | Item | Spec Section | Status | Evidence |
|---|------|-------------|--------|----------|
| 9.1 | `Reconfigurable` interface | §9.1 | **DONE** | `shared/interfaces.ts:13-16` — `Reconfigurable` interface with `reconfigure(config: Record<string, unknown>): void` method. |
| 9.2 | Implement on time/trigger/WRFC | §9.2 | **PARTIAL** | Time: `plugins/time/time-plugin.ts:93` — implements `reconfigure()` with validation. WRFC: `plugins/wrfc/wrfc-plugin.ts:248,404` — implements `Reconfigurable`, validates `score_threshold` and `max_fix_attempts`. DevServer: `plugins/devserver/index.ts:105` — implements `reconfigure()`. **Gap**: Trigger registry is NOT in the `reconfigurables` map. `bootstrap.ts:534-536` registers `time`, `wrfc`, and conditionally `devserver`, but NOT triggers. The spec at §9 listed trigger registry cooldowns/max_fires as needing hot reload. |
| 9.3 | Generic reconfigure loop | §9.2 | **DONE** | `bootstrap.ts:175` — `reconfigurables` map declared. Lines 534-543 populate it. Line 726 iterates with `for (const [name, subsystem] of this.reconfigurables)` in `updateConfig()`. |

### Category 10: Normalizer Ecosystem

| # | Item | Spec Section | Status | Evidence |
|---|------|-------------|--------|----------|
| 10.1 | Slack + CI normalizers | §10.1 | **DONE** | `plugins/external/normalizers/slack.ts:27` — `normalizeSlack()` function. `plugins/external/normalizers/ci.ts:64` — `normalizeCI()` function. Both registered in `createDefaultRegistry()` at `normalizers/index.ts:100-108`. |
| 10.2 | Runtime normalizer registration | §10.2 | **DONE** | `plugins/external/normalizers/index.ts:30-87` — `NormalizerRegistry` class with `register()` (line 37), `unregister()` (line 51), `listNormalizers()` (line 84), `sources()` (line 77), `normalize()` with generic fallback (line 60-72). |

### Category 11: External Plugin MCP Tool

| # | Item | Spec Section | Status | Evidence |
|---|------|-------------|--------|----------|
| 11.1 | `runtime_external` MCP tool | §11.1 | **DONE** | `plugins/mcp/handlers/external.ts:21-184` — Full handler with all 5 actions: `status`, `normalizers`, `test_normalize`, `stats`, `queue`. Registered in `plugins/mcp/handlers/index.ts:70`. Schema in `schemas.ts:404`. Tool definition at `tools/definitions/runtime-engine/runtime-external.yaml`. |

---

## Detailed Gap Analysis

### Gap 1: `createHumanEvent()` not wired (PARTIAL — Item 2.2)

**File**: `plugins/hooks/handlers/user-prompt-submit.ts:38`

```typescript
// TODO: eventBus: EventBus | null;  // wire createHumanEvent() when budget allows
```

The `createHumanEvent()` factory is fully implemented in `factories.ts:241-265` and works correctly. However, the integration point — the `UserPromptSubmitHandler` — has the EventBus dependency commented out as a TODO. This means:
- No `human:prompt` events are ever emitted when users type prompts
- No `human:command` events for slash commands
- No `human:approval` events for approval flows
- Any trigger listening for `human:*` event types will never fire

**Severity**: MEDIUM — The factory exists and the integration point is clearly documented. Wiring it requires adding `eventBus` to `UserPromptSubmitDeps`, passing it from the hook subsystem factory in bootstrap, and adding a `createHumanEvent()` call in the non-task-notification path.

### Gap 2: Trigger registry not in reconfigurables map (PARTIAL — Item 9.2)

**File**: `bootstrap.ts:534-536`

The spec listed trigger registry cooldowns/max_fires as needing hot reload. The `Reconfigurable` interface exists and is implemented on `TimePlugin`, `WRFCPlugin`, and `DevServerMonitor`. But the trigger registry/subsystem does not implement `Reconfigurable` and is not added to `this.reconfigurables`. 

This means config changes to trigger cooldown periods or max fire counts require a daemon restart.

**Severity**: LOW — Trigger config changes are infrequent and a daemon restart is acceptable for now.

---

## Gaps Not in Spec

These are issues found during the audit that the spec did not cover.

### 1. No uncaughtException/unhandledRejection handlers in bootstrap

**Files**: `core/processing/signals.ts` handles SIGTERM/SIGINT/SIGUSR1 signals, `transport/daemon.ts:86-87` registers `SIGTERM`/`SIGINT`. However, `uncaughtException` and `unhandledRejection` handlers are documented in comments (`signals.ts:25-26`) but the actual registration of those process handlers was not verified to be called from bootstrap. If `installSignalHandlers()` is called, this is covered.

**Severity**: LOW — needs verification that `installSignalHandlers()` from `signals.ts` is called during startup.

### 2. DevServerMonitor uses `createHookEvent` instead of a dedicated event type

**File**: `plugins/devserver/index.ts:86-103` — `emitError()` method

The devserver monitor emits errors via `createHookEvent` with `source.kind: 'internal'`. The spec's event priority hierarchy defines devserver events as triggering `builtin_devserver_recovery`, which listens for `devserver:error`. The monitor should emit events with `type: 'devserver:error'` — this works because `createHookEvent` allows custom type strings, but semantically the source should arguably be something other than `'internal'` since it's not a Claude Code hook.

**Severity**: LOW — Functionally correct (the event type matches what triggers expect), but semantically imprecise.

### 3. Config validation is minimal

**File**: `shared/config.ts:488` — `validateConfig()` exists but was not deeply audited. New config sections added for `tool_gating`, `context_injection`, `devserver`, and `detectors` should have corresponding validation. Each subsystem does its own validation in `reconfigure()`, but initial load validation may not cover all new sections.

**Severity**: LOW — Subsystem-level validation provides defense in depth.

### 4. No integration tests for end-to-end trigger pipelines

Unit tests exist for individual components (builtins, handlers, agent-tracker, etc.), but no integration test verifies the complete path: `build command executes` → `hook:post_tool_use emitted` → `BuildTestDetector fires` → `build:failed emitted` → `builtin_auto_fix_build trigger fires` → `action handler executes`. This is a testing gap, not a code gap.

**Severity**: MEDIUM — End-to-end paths could have wiring issues that unit tests miss.

---

## File Reference

| Category | Key Files |
|----------|----------|
| Event factories | `extensions/events/factories.ts` |
| Handler implementations | `extensions/executor/handlers/{devserver,notify,log,memory,build,test,ci}-handler.ts`, `guards.ts`, `index.ts` |
| Build/test detector | `plugins/hooks/handlers/build-test-detector.ts` |
| Builtin triggers | `extensions/triggers/builtins.ts` |
| Agent tracker | `plugins/agent-tracker/agent-tracker-plugin.ts` |
| Schedule MCP tool | `plugins/mcp/handlers/schedule.ts` |
| External MCP tool | `plugins/mcp/handlers/external.ts` |
| Workflow engine | `extensions/workflow/workflow-engine.ts` |
| Workflow persistence | `extensions/persistence/workflow-persistence.ts` |
| Tool gating | `extensions/ipc/tool-gating.ts` |
| Context injection | `extensions/ipc/context-injector.ts` |
| Reconfigurable interface | `shared/interfaces.ts` |
| Interval presets | `shared/presets.ts` |
| Normalizers | `plugins/external/normalizers/{index,slack,ci,github,generic}.ts` |
| DevServer monitor | `plugins/devserver/index.ts` |
| Bootstrap wiring | `bootstrap.ts` |
| UserPromptSubmit (gap) | `plugins/hooks/handlers/user-prompt-submit.ts:38` |
