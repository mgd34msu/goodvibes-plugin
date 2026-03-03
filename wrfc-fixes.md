# WRFC Handler Never Fires — Root Cause Investigation

**Date**: 2026-03-03
**Status**: Investigation complete, fix pending
**Symptom**: Reviewer agents complete but no fixer agents are spawned. Zero `<gv>` spawn directives delivered in production sessions.

---

## Confirmed Facts

### 1. Handler Never Executes in Production

`handleAgentCompleted` has a trace function `_T()` at its entry point that appends to `/tmp/wrfc-trace.log` via `appendFileSync`. The trace log has **234 entries, ALL from a test run at 15:34:49 — ZERO production entries**. The handler literally never fires.

### 2. Session JSONL Confirms Zero Spawn Directives

Analysis of session `ea3f69bd-cd5d-4e9a-95ab-40ad711d3401.jsonl` shows **only 2 `<gv>` directive deliveries**: a `complete` from a previous session summary and a `workflow_bind`. **ZERO spawn directives** were ever delivered. The orchestrator's 28 `spawn:reviewer` references in thinking blocks were hallucinated — no actual `<gv>` tags backed them.

### 3. Code Wiring Is Correct (All Verified)

| Component | Status | Detail |
|-----------|--------|--------|
| DirectiveQueue | Shared instance | Same queue between ActionExecutor and IPCRouter |
| Drain target | Matches | Both enqueue/drain use `'subagent_stop'` |
| UPS hook | Correct | Queries `get_directives`, wraps in `<gv>` tags |
| Trigger registration | Correct | `event_type: 'agent:completed'` maps properly |
| Bootstrap init order | Correct | Step 5 directives → Step 13 coreRuntime → Step 14 WRFC → Step 22 IPC |
| eventMatcherToCondition | Correct | Produces `{ type: 'event', event_type: 'agent:completed' }` |
| ConditionEvaluator | Correct | `matchEventType('agent:completed', 'agent:completed')` → exact string match → true |
| IPC handleHookEvent | Correct | Creates event with `type: msg.hook_name as EventType`, calls `processHookEvent` (awaited) |
| processHookEvent callback | Correct | Gets `this.coreRuntime.eventProcessor`, calls `processImmediate(event)` |

---

## Root Cause: L1 processEvent() Uses L1 match() Shim

### The Architecture

```
Layer 1 (Core):     EventProcessor.processEvent() → TriggerRegistry.match() (L1 shim)
Layer 2 (Extensions): TriggerRegistry.evaluate() (full L2 with action execution)
Layer 3 (Plugins):   WRFCPlugin registers triggers + handlers
```

### The Problem

`EventProcessor.processEvent()` (L1, line 531 of event-processor.ts) calls:
```typescript
const matchedTriggers = this.registry.match(event, this.store);
```

This is the **L1 compatibility shim** (`TriggerRegistry.match()` at line 105 of trigger-registry.ts), NOT the L2 `evaluate()` method (line 275).

The L1 `match()` shim:
1. Iterates triggers, checks guards (`passesGuards`)
2. Evaluates conditions via `this.evaluator.evaluate(trigger.condition, event)`
3. Returns L1 `Trigger[]` stubs via `toL1Trigger()`

Then `processEvent` looks up handlers: `this.handlers.get(trigger.id)`

### Two Registration Paths in wrfc-plugin.ts

There are **two separate registration mechanisms**:

#### Path 1: `registerWRFCPlugin()` (line 103) — BROKEN
```typescript
registry.register(
  createWRFCTrigger({ id: TRIGGER_IDS.AGENT_COMPLETED, ... })
    as unknown as TriggerDefinition  // UNSAFE CAST
);
```
The `Trigger` (L1) object has `event_match` but **NOT** `condition`. The `as unknown as TriggerDefinition` cast creates a TriggerDefinition where `condition` is `undefined`. When `evaluator.evaluate(trigger.condition, event)` runs, it accesses `undefined.type` → **TypeError silently caught** in bootstrap's try/catch.

#### Path 2: `WRFCPlugin.register()` (line 269) — CORRECT
```typescript
services.registerTrigger(
  TRIGGER_IDS.AGENT_COMPLETED,
  { id: TRIGGER_IDS.AGENT_COMPLETED, event_type: 'agent:completed', ... },
  agentCompletedHandler,
);
```
Goes through bootstrap's `registerTrigger` → `createWRFCTrigger()` → `toTriggerDefinitionBase()` → proper `condition: { type: 'event', event_type: 'agent:completed' }` field.

#### Which Path Runs?

Bootstrap uses `WRFCPlugin.register()` (Path 2, the correct one). The class docstring at line 234 misleadingly says it "delegates to registerWRFCPlugin() internally" but the actual code at line 269 uses `services.registerTrigger()` directly.

**However**, `registerWRFCPlugin()` is still exported (index.ts line 41). If it's called elsewhere (test setup, hot reload, etc.), it would overwrite the correctly-registered triggers with broken ones.

---

## Remaining Investigation Items

### 1. Does SubagentStop Actually Connect to the Runtime?

**Not yet verified.** SubagentStop at line 282 creates a `RuntimeClient` and checks `isAvailable()`, which only verifies the socket file exists (not a live connection). If the socket isn't found or the connection fails silently, the `agent:completed` event never reaches the IPC router.

Need to verify: Does SubagentStop's `RuntimeClient.discoverSocket()` find the same socket the runtime is listening on?

### 2. Is `registerWRFCPlugin()` Called Anywhere Besides Tests?

If it runs after `WRFCPlugin.register()`, it overwrites the triggers with broken ones (missing `condition` field). Need to grep all call sites.

### 3. Does the `match()` L1 Shim Have Silent Failures?

The L1 `match()` shim logs a warning about state-store conditions on first call. If ANY trigger in the registry has a broken `condition` (e.g., from Path 1), it would throw during iteration and fail the entire `match()` call — blocking ALL triggers from matching, not just the broken one.

This is the most likely **compounding failure mode**: one broken trigger poisons the entire match loop.

---

## Proposed Fixes

### Fix 1: Remove the Broken Registration Path

Delete or deprecate `registerWRFCPlugin()` (the standalone function at line 103). It uses an unsafe `as unknown as TriggerDefinition` cast that creates objects without the required `condition` field.

### Fix 2: Make `match()` Resilient to Condition Errors

Wrap the per-trigger evaluation in `match()` with try/catch so one broken trigger doesn't poison the entire match loop:

```typescript
// In TriggerRegistry.match():
for (const trigger of this.triggers.values()) {
  try {
    if (this.passesGuards(trigger, now) !== true) continue;
    const conditionMet = this.evaluator.evaluate(trigger.condition, event);
    if (!conditionMet) continue;
    matched.push(this.toL1Trigger(trigger));
  } catch (err) {
    log.error('Trigger evaluation failed', { id: trigger.id, error: err });
  }
}
```

### Fix 3: Add Runtime Validation in `register()`

Validate that `TriggerDefinition.condition` is not undefined/null when registering:

```typescript
register(trigger: TriggerDefinition): void {
  if (!trigger.condition || typeof trigger.condition.type !== 'string') {
    throw new Error(`Invalid trigger: missing condition (id: ${trigger.id})`);
  }
  // ... existing logic
}
```

### Fix 4: Verify SubagentStop IPC Connectivity

Add logging/tracing to SubagentStop's Phase 6 to confirm the `agent:completed` event is actually sent and received by the runtime.

---

## Key Files

| File | Lines | Relevance |
|------|-------|-----------|
| `runtime-engine/src/core/processing/event-processor.ts` | 531-600 | L1 processEvent with match() call |
| `runtime-engine/src/core/trigger-registry.ts` | 105-144, 275-303 | L1 match() shim vs L2 evaluate() |
| `runtime-engine/src/extensions/triggers/condition-evaluator.ts` | 86-137 | Condition evaluation logic |
| `runtime-engine/src/plugins/wrfc/wrfc-plugin.ts` | 103-193, 269-323 | Two registration paths |
| `runtime-engine/src/plugins/wrfc/handlers.ts` | 442-575, 592-596 | handleAgentCompleted + TRIGGER_IDS |
| `runtime-engine/src/bootstrap.ts` | 73-83, 96-117, 280-327, 441-449 | eventMatcherToCondition, toTriggerDefinitionBase, registerTrigger, processHookEvent |
| `runtime-engine/src/extensions/ipc/ipc-router.ts` | 249-290 | handleHookEvent |
| `hooks/scripts/src/subagent-stop/index.ts` | 270-330 | Phase 6 runtime integration |
