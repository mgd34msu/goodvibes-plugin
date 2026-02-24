# Runtime Engine v3 — Hook Processing System Implementation Plan

> Date: 2026-02-24 | Status: Ready for Implementation
> Prerequisite: v2 Tier 2 (durability) recommended but not blocking
> Full design: `.goodvibes/memory/v3-hook-system-design.md` (43KB)

---

## Overview

v3 moves hook processing logic from external shell scripts into the runtime engine. External scripts become ~5-line IPC bridges that relay structured `ClaudeHookResponse` objects. The runtime engine gains a HookProcessor + HookRegistry that makes runtime-aware decisions (block native tools, inject directives, enforce quality gates).

**Core Problem**: 17 external hook scripts contain duplicated IPC boilerplate (~50 lines each), cannot make runtime-aware decisions, and the WRFC directive pipeline requires a fragile multi-hop IPC chain adding 1-2 tool-call latency.

**Solution**: Single `HookProcessor.process()` entry point receives all hook events, delegates to registered handlers via HookRegistry, returns properly formatted Claude Code native `ClaudeHookResponse`.

---

## Architecture

```
Claude Code -> Hook Script (bridge) -> IPC -> IPCRouter -> HookProcessor
                                                              |
                                                              v
                                                         HookRegistry
                                                              |
                                                     +--------+--------+
                                                     |        |        |
                                                PreToolUse  SubStop  SubStart  ...
                                                 handlers   handlers handlers
                                                     |        |        |
                                                     v        v        v
                                              EventBus, WorkflowEngine, DirectiveQueue,
                                              AgentCoordinator, TriggerRegistry
                                                              |
                                                              v
                                                     Merged ClaudeHookResponse
                                                              |
                                              IPC <- IPCRouter <- HookProcessor
                                                              |
                                              Hook Script (bridge) -> stdout -> Claude Code
```

---

## Migration Strategy

### Guiding Principles

1. **Additive first**: New hook processing is added alongside existing behavior. No existing code is removed until feature parity is verified.
2. **One handler at a time**: Each handler is implemented, tested, and verified independently.
3. **Bridge scripts coexist**: External scripts keep working during migration. Internal handlers produce the same results.
4. **Rollback at any point**: HookProcessor can be disabled (set to null in IPCRouterDeps) to revert to v1 behavior.

### Phase Overview

| Phase | Name | Risk | What Changes |
|-------|------|------|--------------|
| 1 | Foundation | Low | New module, no behavior change |
| 2 | Core Handlers | Medium | Internal handlers produce responses |
| 3 | Script Thinning | Medium | External scripts simplified to bridges |
| 4 | Verification | Low | End-to-end testing, feature parity |

---

## Phase 1: Foundation (Non-Breaking)

**Risk**: Low — purely additive, no behavior changes.

### New Files

#### 1.1 `src/hooks/types.ts` (CREATE, ~280 lines)

All type definitions from the v3 design doc:

- `HookType` — Union of all Claude Code hook types (PreToolUse, PostToolUse, SubagentStart, SubagentStop, SessionStart, SessionEnd, PreCompact, Stop, Notification, UserPromptSubmit, Setup)
- `HOOK_NAME_MAP` — Canonical mapping from all known hook_name variants to HookType (snake_case, PascalCase, legacy event names)
- `HookInput` — Normalized input: hookType, rawHookName, payload, messageId, timestamp
- `PreToolUseOutput`, `PostToolUseOutput`, `SubagentStartOutput`, `SubagentStopOutput`, `UserPromptSubmitOutput`, `SessionStartOutput` — Per-hook-type `hookSpecificOutput` shapes
- `HookSpecificOutput` — Union of all output types
- `ClaudeHookResponse` — Final response format: `{ continue: boolean, hookSpecificOutput? }`
- `HandlerResponse` — Internal: `{ hookOutput?, priority, source }`
- `HookContext` — DI container: `{ eventBus, workflowEngine, agentCoordinator, directiveQueue, triggerRegistry, agentWorkflowMap, logger }`
- `HookHandlerFn` — `(input: HookInput, ctx: HookContext) => Promise<HandlerResponse>`
- `HookHandlerRegistration` — `{ id, hookTypes, priority, handler, enabled }`

#### 1.2 `src/hooks/hook-registry.ts` (CREATE, ~80 lines)

```typescript
export class HookRegistry {
  private readonly handlers: Map<HookType, HookHandlerRegistration[]>;

  register(registration: HookHandlerRegistration): void;   // Inserts sorted by priority desc
  unregister(handlerId: string): void;                     // Removes by id
  getHandlers(hookType: HookType): HookHandlerRegistration[];  // Returns enabled, sorted
  setEnabled(handlerId: string, enabled: boolean): void;   // Runtime toggle
  hasHandlers(hookType: HookType): boolean;                // Quick check
}
```

#### 1.3 `src/hooks/hook-processor.ts` (CREATE, ~250 lines)

```typescript
export class HookProcessor {
  constructor(registry: HookRegistry, context: HookContext);

  /**
   * Main entry point. Called by IPCRouter for hook_event messages.
   *
   * Steps:
   * 1. Normalize hook_name -> HookType via HOOK_NAME_MAP
   * 2. Build HookInput from IPC message
   * 3. Emit RuntimeEvent to EventBus (preserves v1 behavior)
   * 4. Evaluate triggers via TriggerRegistry (preserves v1 behavior)
   * 5. Get handlers from HookRegistry for this HookType
   * 6. Run handlers in priority order with HookContext
   * 7. Merge HandlerResponses -> ClaudeHookResponse
   * 8. Wrap in IPCResponse and return
   */
  async process(msg: HookEventMessage): Promise<IPCResponse>;

  /**
   * Handle hook-aware queries (should_block_tool, get_directives).
   * Returns null if query is not hook-related (IPCRouter handles it).
   */
  async processQuery(query: IPCQuery, messageId: string): Promise<IPCResponse | null>;

  /**
   * Internal merge. Rules:
   * - PreToolUse: deny > ask > allow (strictest wins). All additionalContext concatenated.
   * - SubagentStop: block wins. All additionalContext concatenated.
   * - All others: additionalContext concatenated, deduplicated by content hash.
   */
  private mergeResponses(responses: HandlerResponse[], hookType: HookType): ClaudeHookResponse;
}
```

#### 1.4 `src/hooks/index.ts` (CREATE, ~10 lines)

Barrel exports for types, HookRegistry, HookProcessor.

### Modified Files

#### 1.5 `src/ipc/ipc-router.ts` (MODIFY)

Add `hookProcessor: HookProcessor | null` to IPCRouterDeps. When non-null, delegate `hook_event` messages to `hookProcessor.process()` and try `hookProcessor.processQuery()` before handling queries directly.

```typescript
// In route():
if (msg.type === 'hook_event' && this.deps.hookProcessor) {
  return this.deps.hookProcessor.process(msg);
}
// Existing behavior as fallback when hookProcessor is null
```

#### 1.6 `src/index.ts` (MODIFY)

Wire HookProcessor into engine startup:

```typescript
const hookRegistry = new HookRegistry();
const hookContext: HookContext = {
  eventBus, workflowEngine, agentCoordinator,
  directiveQueue, triggerRegistry, agentWorkflowMap,
  logger: createLogger('hooks'),
};
const hookProcessor = new HookProcessor(hookRegistry, hookContext);

// Pass to IPCRouter
const routerDeps: IPCRouterDeps = {
  ...existingDeps,
  hookProcessor,
};
```

### Phase 1 Tests

| Test File | What It Tests |
|-----------|---------------|
| `src/hooks/__tests__/hook-registry.test.ts` | Registration, priority sorting, enable/disable, unregister |
| `src/hooks/__tests__/hook-processor.test.ts` | Event emission, trigger evaluation, handler execution, response merging |
| `src/hooks/__tests__/types.test.ts` | HOOK_NAME_MAP normalization for all known variants |

### Phase 1 Files Summary

| File | Action | LOC Est. |
|------|--------|----------|
| `src/hooks/types.ts` | CREATE | ~280 |
| `src/hooks/hook-registry.ts` | CREATE | ~80 |
| `src/hooks/hook-processor.ts` | CREATE | ~250 |
| `src/hooks/index.ts` | CREATE | ~10 |
| `src/ipc/ipc-router.ts` | MODIFY | +15 |
| `src/index.ts` | MODIFY | +15 |
| Tests (3 files) | CREATE | ~400 |
| **Total** | | **~1050** |

---

## Phase 2: Core Handlers (Additive)

**Risk**: Medium — handlers produce responses alongside existing external scripts.

### Migration Order (by risk, lowest first)

This order is chosen to validate the pipeline incrementally:

1. **PreToolUse: native-tool-blocker** — Lowest risk. Stateless. Just a Set lookup. Easy to verify: tool gets blocked or it doesn't.
2. **PreToolUse: directive-delivery** — Low risk. Drains DirectiveQueue. Same logic as existing directive-delivery external script.
3. **SessionStart** — Low risk. One-shot initialization. No complex state.
4. **SessionEnd** — Low risk. Cleanup only. No response needed.
5. **PreCompact** — Low risk. State preservation. Returns additionalContext.
6. **SubagentStart** — Medium risk. Agent registration + WRFC workflow creation. Must produce same workflow bindings as external script.
7. **SubagentStop** — Highest risk. Quality gates + WRFC chain advancement. This is the critical path for the entire WRFC pipeline.
8. **PostToolUse** — Medium risk. File tracking and build automation.
9. **PostToolUseFailure** — Low risk. Error categorization.
10. **UserPromptSubmit** — Low risk. Prompt analysis.
11. **Stop / Notification** — Low risk. Simple event emission.

### Handler Implementations

#### 2.1 PreToolUse Handlers: `src/hooks/handlers/pre-tool-use.ts` (CREATE, ~120 lines)

Two handlers registered:

**Handler 1: `native-tool-blocker` (priority: 100)**

```typescript
// Logic:
// 1. Check tool_name against BLOCKED_NATIVE_TOOLS set:
//    Read, Write, Edit, Grep, Glob, WebFetch, NotebookEdit
// 2. If blocked: return permissionDecision: 'deny' with reason
//    suggesting precision_engine equivalent
// 3. For Bash tool: check command string for grep/find/cat/rg/ls
//    Return deny if detected
// 4. If not blocked: return empty (passthrough)

const BLOCKED_NATIVE_TOOLS = new Set([
  'Read', 'Write', 'Edit', 'Grep', 'Glob', 'WebFetch', 'NotebookEdit',
]);

const TOOL_ALTERNATIVES: Record<string, string> = {
  'Read': 'precision_read',
  'Write': 'precision_write',
  'Edit': 'precision_edit',
  'Grep': 'precision_grep',
  'Glob': 'precision_glob',
  'WebFetch': 'precision_fetch',
  'NotebookEdit': 'precision_notebook',
};
```

**Handler 2: `directive-delivery` (priority: 50)**

```typescript
// Logic:
// 1. Drain DirectiveQueue for target 'pre_tool_use'
// 2. If directives found: format as <gv> JSON tags
// 3. Return additionalContext with formatted directives
// 4. If no directives: return empty (passthrough)
```

#### 2.2 SubagentStart Handler: `src/hooks/handlers/subagent-start.ts` (CREATE, ~100 lines)

**Handler: `subagent-lifecycle` (priority: 50)**

```typescript
// Logic:
// 1. Extract agent_id, agent_type, task from payload
// 2. Register agent with AgentCoordinator
// 3. Emit hook:subagent_start event to EventBus
// 4. Let TriggerRegistry evaluate (fires wrfc_agent_spawned)
// 5. Look up WRFC workflow_id from AgentWorkflowMap
// 6. Build additionalContext:
//    - WRFC workflow ID
//    - Agent role and instructions
//    - Project reminders
// 7. Return { hookOutput: { additionalContext }, priority: 50, source }
```

#### 2.3 SubagentStop Handler: `src/hooks/handlers/subagent-stop.ts` (CREATE, ~200 lines)

**Handler: `subagent-lifecycle` (priority: 50)**

This is the most complex handler. It handles:

```typescript
// Logic:
// 1. Extract agent_id, agent_type, success, last_assistant_message
// 2. Update agent status in AgentCoordinator
//
// 3. QUALITY GATE (for reviewer agents):
//    a. Parse review score from last_assistant_message (<gv> tag)
//    b. If score < threshold (configurable, default 8.0):
//       Return { hookOutput: { decision: 'block', reason: '...' } }
//       -> Claude Code prevents agent from stopping
//       -> Reason injected into agent's context
//       -> Agent continues working
//
// 4. WRFC ADVANCEMENT (if quality gate passes):
//    a. Emit hook:subagent_stop or hook:agent:completed event
//    b. Let TriggerRegistry evaluate (fires wrfc_chain_next)
//    c. Drain DirectiveQueue('subagent_stop')
//    d. Return { hookOutput: { additionalContext: '<gv>...</gv>' } }
//       -> Orchestrator receives directive immediately
//
// KEY INSIGHT: Steps 3-4 happen in ONE process() call.
// DirectiveQueue is drained AFTER trigger evaluation.
// Zero extra IPC round-trips. Eliminates the directive-delivery double-hop.
```

#### 2.4 SessionStart Handler: `src/hooks/handlers/session-start.ts` (CREATE, ~60 lines)

```typescript
// Logic:
// 1. Emit session:started event
// 2. Build session context (active workflows, pending directives, config)
// 3. Return { hookOutput: { additionalContext: sessionContext } }
```

#### 2.5 SessionEnd Handler: `src/hooks/handlers/session-end.ts` (CREATE, ~40 lines)

```typescript
// Logic:
// 1. Emit session:ended event
// 2. Flush telemetry
// 3. Take final snapshot (if Tier 2 durability is available)
// 4. Return empty (no context injection needed)
```

#### 2.6 PreCompact Handler: `src/hooks/handlers/pre-compact.ts` (CREATE, ~80 lines)

```typescript
// Logic:
// 1. Emit session:compact event
// 2. Build preserved state summary:
//    - Active workflow IDs and states
//    - Pending directive count
//    - Agent bindings
// 3. Return { hookOutput: { additionalContext: preservedState } }
//    -> Survives context compaction
```

#### 2.7 PostToolUse Handler: `src/hooks/handlers/post-tool-use.ts` (CREATE, ~100 lines)

```typescript
// Logic:
// 1. Track modified files (precision_write, precision_edit results)
// 2. Detect build/test command results from precision_exec
//    - If build failed: emit build:failed event
//    - If test failed: emit test:failed event
// 3. Optionally inject build results as additionalContext
```

#### 2.8 Other Handlers

| File | LOC | Logic |
|------|-----|-------|
| `src/hooks/handlers/post-tool-use-failure.ts` | ~50 | Classify error, emit event, return recovery hints as additionalContext |
| `src/hooks/handlers/user-prompt-submit.ts` | ~60 | Detect commands, drain directives, return additionalContext |
| `src/hooks/handlers/stop.ts` | ~30 | Emit system event, graceful shutdown |
| `src/hooks/handlers/notification.ts` | ~20 | Emit notification event, passthrough |

### Phase 2 Tests

Each handler gets its own test file:

| Test File | Key Scenarios |
|-----------|---------------|
| `src/hooks/handlers/__tests__/pre-tool-use.test.ts` | Block Read/Write/Edit, allow precision tools, Bash grep detection, directive injection |
| `src/hooks/handlers/__tests__/subagent-start.test.ts` | Agent registration, WRFC workflow creation, context injection |
| `src/hooks/handlers/__tests__/subagent-stop.test.ts` | Quality gate block, quality gate pass, WRFC advancement, directive drain |
| `src/hooks/handlers/__tests__/session-start.test.ts` | Event emission, context building |
| `src/hooks/handlers/__tests__/session-end.test.ts` | Event emission, telemetry flush |
| `src/hooks/handlers/__tests__/pre-compact.test.ts` | State preservation, context building |
| `src/hooks/handlers/__tests__/post-tool-use.test.ts` | File tracking, build/test event emission |

### Phase 2 Files Summary

| File | Action | LOC Est. |
|------|--------|----------|
| `src/hooks/handlers/pre-tool-use.ts` | CREATE | ~120 |
| `src/hooks/handlers/subagent-start.ts` | CREATE | ~100 |
| `src/hooks/handlers/subagent-stop.ts` | CREATE | ~200 |
| `src/hooks/handlers/session-start.ts` | CREATE | ~60 |
| `src/hooks/handlers/session-end.ts` | CREATE | ~40 |
| `src/hooks/handlers/pre-compact.ts` | CREATE | ~80 |
| `src/hooks/handlers/post-tool-use.ts` | CREATE | ~100 |
| `src/hooks/handlers/post-tool-use-failure.ts` | CREATE | ~50 |
| `src/hooks/handlers/user-prompt-submit.ts` | CREATE | ~60 |
| `src/hooks/handlers/stop.ts` | CREATE | ~30 |
| `src/hooks/handlers/notification.ts` | CREATE | ~20 |
| Tests (7 files) | CREATE | ~700 |
| **Total** | | **~1560** |

---

## Phase 3: External Script Thinning

**Risk**: Medium — external scripts are simplified but must still produce correct ClaudeHookResponse output.

### Target State

Every external hook script becomes a ~5-line IPC bridge:

```typescript
// Example: subagent-stop/index.ts (AFTER migration)
import { readHookInput, respond } from '../shared/index.js';
import { RuntimeClient } from '../shared/runtime-client.js';

const input = await readHookInput();
const client = new RuntimeClient();
const result = await client.sendHookEvent('SubagentStop', input);
respond(result?.response ?? { continue: true });
```

### Migration Order (same as Phase 2 handler order)

For each script:

1. **Verify internal handler produces identical output** to external script for all test cases
2. **Replace external script logic** with IPC bridge
3. **Run integration tests** to confirm behavior unchanged
4. **Keep external script as bridge** (Claude Code requires executable scripts)

### Scripts to Thin

| External Script | Internal Handler | Complexity |
|----------------|-----------------|------------|
| `pre-tool-use/index.ts` | PreToolUse handlers | Medium (native tool blocking + directive delivery) |
| `directive-delivery/index.ts` | PreToolUse directive-delivery handler | Low (becomes redundant) |
| `subagent-start/index.ts` | SubagentStart handler | Medium (agent registration + context) |
| `subagent-stop/index.ts` | SubagentStop handler | High (quality gates + WRFC chain) |
| `session-start/index.ts` | SessionStart handler | Low |
| `session-end/index.ts` | SessionEnd handler | Low |
| `pre-compact/index.ts` | PreCompact handler | Low |
| `post-tool-use/index.ts` | PostToolUse handler | Medium |
| `post-tool-use-failure/index.ts` | PostToolUseFailure handler | Low |

### Scripts That Stay External

Some scripts have logic that is NOT runtime-related and should remain external:

| Script | Why External |
|--------|-------------|
| `automation/index.ts` | Project-specific automation, not runtime |
| `context/index.ts` | Context building from local files |
| `cost-analysis/index.ts` | Token cost tracking, analytics-engine concern |
| `memory/index.ts` | Memory system operations |
| `state/index.ts` | Session state management |
| `telemetry/index.ts` | Telemetry collection, analytics-engine concern |
| `shared/index.ts` | Shared utilities (stays as bridge support) |
| `types/index.ts` | Type definitions |

### IPC Protocol Changes

The IPC protocol needs a new response kind:

```typescript
// In src/ipc/protocol.ts, add to IPCResponse.data:
interface HookResponseData {
  kind: 'hook_response';
  hookType: HookType;
  response: ClaudeHookResponse;
}
```

The bridge script extracts `data.response` and writes it to stdout.

### RuntimeClient Changes

The RuntimeClient in external scripts needs a new method:

```typescript
// In plugins/goodvibes/hooks/scripts/src/shared/runtime-client.ts
async sendHookEvent(
  hookName: string,
  hookInput: Record<string, unknown>,
): Promise<{ response: ClaudeHookResponse } | null> {
  // Send hook_event message via IPC
  // Wait for response
  // Extract ClaudeHookResponse from IPCResponse.data.response
  // Return it for the bridge to output
}
```

### Phase 3 Files Summary

| File | Action | LOC Change |
|------|--------|------------|
| 9 external hook scripts | SIMPLIFY | -50 lines each avg |
| `plugins/goodvibes/hooks/scripts/src/shared/runtime-client.ts` | MODIFY | +20 |
| `src/ipc/protocol.ts` | MODIFY | +10 |
| **Net LOC change** | | **-400** |

---

## Phase 4: Feature Parity Verification

**Risk**: Low — verification only, no code changes.

### Test Matrix

| Scenario | What to Verify | How |
|----------|---------------|-----|
| Native tool blocking | `Read` tool returns deny | Spawn engineer, observe PreToolUse hook blocks Read |
| Directive delivery | WRFC directives reach orchestrator | Spawn engineer, complete, observe spawn directive in SubagentStop response |
| Quality gate | Low-score reviewer is blocked | Spawn reviewer with score < threshold, observe decision: 'block' |
| WRFC chain | Full W-R-F-C cycle completes | Run a task end-to-end, verify correct state transitions |
| Context injection | SubagentStart injects WRFC context | Spawn agent, verify additionalContext contains workflow ID |
| Session lifecycle | SessionStart/End produce correct events | Start/end session, verify events in EventLog |
| Pre-compact | State preserved across compaction | Trigger compact, verify additionalContext contains active workflow state |
| Directive latency | 0 extra tool-call latency | Verify SubagentStop response contains directive (no PreToolUse needed) |
| Error resilience | Handler failure doesn't break tool call | Inject handler error, verify passthrough response |
| Backward compat | External-only scripts still work | Disable HookProcessor, verify v1 behavior unchanged |

### Integration Test Script

```bash
#!/bin/bash
# Run from runtime-engine directory
cd plugins/goodvibes/tools/implementations/runtime-engine

# 1. Type check
npx tsc --noEmit

# 2. Unit tests
npx vitest run

# 3. Build
node build.mjs

# 4. Verify hook responses match expected format
# (manual or automated end-to-end test with mock Claude Code)
```

---

## Key Design Decisions (from v3 design doc)

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | HookProcessor owns EventBus emission + trigger evaluation | Handlers run AFTER triggers, can drain directives triggers just enqueued. Eliminates directive-delivery double-hop. |
| D2 | "Strictest wins" merge semantics | PreToolUse: deny > ask > allow. SubagentStop: block > allow. Safety-first. |
| D3 | Handlers receive HookContext (DI container) | Stable handler signatures. Adding subsystem = update HookContext only. |
| D4 | HookRegistry supports runtime enable/disable | Feature flags for safe rollout. |
| D5 | External scripts remain as IPC bridges | Claude Code requires executable scripts. Cannot be eliminated. |
| D6 | HOOK_NAME_MAP handles all known variants | Prevents handler misses during migration. |
| D7 | PreToolUse handlers: 100ms latency budget | PreToolUse fires on every tool call. Must be fast. |
| D8 | additionalContext for ALL context injection | systemMessage only appears in terminal UI. Claude never sees it. |
| D9 | SubagentStop uses native decision:block for quality gates | Claude Code enforces the block. Far more reliable than hoping agent self-corrects. |
| D10 | No standalone ResponseMerger | Claude Code merges across hooks natively. We only merge within our single response. |

---

## Risk Assessment

| Risk | Prob. | Impact | Mitigation |
|------|-------|--------|------------|
| Handler throws, breaks tool call | Med | High | Mandatory try/catch in HookProcessor; failed handlers return passthrough |
| Directive drain race condition | Low | Med | DirectiveQueue is synchronous; drain in same event loop tick as trigger eval |
| Migration breaks existing behavior | Med | High | Phase 1-2 additive; external scripts work until Phase 3 |
| PreToolUse latency increase | Low | Med | 100ms budget; native-tool-blocker is a synchronous Set lookup |
| Quality gate blocks agent indefinitely | Low | High | Max-retry counter; after N blocks, allow with warning |
| Hook name normalization misses variant | Med | Low | HOOK_NAME_MAP is exhaustive; unknown names logged and passed through |

---

## Total Scope Estimate

| Phase | New Files | Modified Files | LOC |
|-------|-----------|---------------|-----|
| Phase 1: Foundation | 4 + 3 tests | 2 | ~1050 |
| Phase 2: Core Handlers | 11 + 7 tests | 0 | ~1560 |
| Phase 3: Script Thinning | 0 | ~11 | -400 (net) |
| Phase 4: Verification | 0 | 0 | 0 |
| **Total** | **25** | **13** | **~2210** |

---

## Implementation Timeline

| Phase | Estimated Effort | Can Parallelize? |
|-------|-----------------|------------------|
| Phase 1 | 2-3 hours | Foundation must be first |
| Phase 2 | 4-6 hours | Handlers 1-5 can parallel with 6-11 |
| Phase 3 | 2-3 hours | After Phase 2 verified |
| Phase 4 | 1-2 hours | After Phase 3 |

Phase 1 should be implemented first as it provides the framework. Phase 2 handlers can be implemented in the risk-ordered sequence above, with each handler independently testable. Phase 3 follows only after Phase 2 is verified. Phase 4 is final validation.
