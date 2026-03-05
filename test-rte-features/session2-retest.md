# Session 2 Retest Results

**Date**: 2026-03-05

## Test 1: Agent Tracker State
**Result: PASS**
- `runtime_state snapshot namespace=agent_tracker` returned full roster
- 60+ tracked agent IDs in state store
- Includes real agent IDs (hex format) + test-agent-001 from earlier testing
- State persists correctly across sessions

## Test 2: Workflow State Transitions (create + advance)
**Result: PASS**
- `workflow create wrfc_loop` → created `wf_8ca9a313-6194-4e65-9ef5-df22e1331823`
- `workflow advance workflow:created` → **IDLE → GATHERING** ✓
  - Transition recorded with timestamp and context_changes
- `workflow advance wrfc:plan_submitted` → **GATHERING → PLANNING** ✓
  - History now shows 2 transitions
- Instance correctly tracks: definition_id, current_state, context, history, timestamps, status=active

## Test 3: Workflow Cancel (transport fix verification)
**Result: FAIL — transport fix not deployed yet**
- `workflow cancel wf_8ca9a313...` → `Unknown RPC method: cancelWorkflow`
- The handler is sending `cancelWorkflow` over RPC but the daemon doesn't have the method registered yet
- **Root cause**: Daemon needs rebuild + restart with the transport fix
- Previous error was `Workflow engine is disabled` (direct engine call). New error is `Unknown RPC method` (transport call) — confirms the handler IS now routing through transport, but daemon side doesn't have the handler yet

## Test 4: Workflow History
**Result: PASS**
- `workflow history wf_8ca9a313...` → returned 2 transitions
- Transition 1: IDLE → GATHERING via `workflow:created` (ts: 1772731516795)
- Transition 2: GATHERING → PLANNING via `wrfc:plan_submitted` (ts: 1772731520055)
- Both include context_changes with files array
- History action works correctly (likely using local instance data, not RPC)

## Test 5: Triggers List
**Result: PASS — 10 triggers total**

| # | ID | Type | Event | Action |
|---|------|------|-------|--------|
| 1 | builtin_auto_fix_build | threshold(2/60s) | build:failed | start_workflow(fix_loop) |
| 2 | builtin_auto_fix_test | sequence | agent:completed→test:failed | start_workflow(fix_loop) |
| 3 | builtin_budget_warning | event | agent:progress | emit(agent:budget_warning) |
| 4 | builtin_sequential_spawn_alert | threshold(3/30s) | agent:spawned | emit(system:error) |
| 5 | builtin_devserver_recovery | event | devserver:error | invoke(restartDevServer) |
| 6 | builtin_webhook_received | event | webhook:* | emit(external:webhook_received) |
| 7 | builtin_ci_failure | event | webhook:ci:* | invoke(bridgeCIFailure) |
| 8 | wrfc:agent_spawned | event | agent:spawned | sequence([]) |
| 9 | wrfc:agent_completed | event | agent:completed | sequence([]) |
| 10 | wrfc:review_completed | event | wrfc:review_completed | sequence([]) |

All 7 builtins + 3 WRFC plugin triggers present. `builtin_ci_failure` correctly wired to `bridgeCIFailure` handler.

## Summary

| Test | Result | Notes |
|------|--------|-------|
| 1. Agent Tracker | **PASS** | Full roster, persistent state |
| 2. Workflow Transitions | **PASS** | IDLE→GATHERING→PLANNING correct |
| 3. Workflow Cancel | **FAIL** | Transport fix not deployed to daemon yet |
| 4. Workflow History | **PASS** | Full transition history returned |
| 5. Triggers List | **PASS** | 10/10 triggers, all correctly configured |

**Score: 4/5 PASS, 1 FAIL (deployment gap)**

The cancel failure is expected — the MCP handler now correctly routes through transport (changed from `Workflow engine is disabled` to `Unknown RPC method: cancelWorkflow`), but the daemon hasn't been rebuilt with the new `cancelWorkflow` RPC method. Once daemon is rebuilt + restarted, cancel should work.
