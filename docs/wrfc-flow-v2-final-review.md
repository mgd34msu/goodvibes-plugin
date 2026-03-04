# WRFC Flow Trace v2 — Final Accuracy Check

Verified every claim against handlers.ts, ipc-router.ts, agent-workflow-map.ts, action-executor.ts.

## 3 Remaining Inaccuracies

### 1. Line 101: REVIEWING fail path does NOT check fix budget (Incorrect claim)

**Flow says**: "Reads fix_attempts = 0, max_fix_attempts = 3 → budget remaining"

**Code reality**: The REVIEWING fail branch spawns a fixer **unconditionally** — no budget check. `fixAttempts` and `maxFix` are read in the function prologue (shared across all branches), but the REVIEWING fail branch ignores them entirely:

```typescript
// REVIEWING fail path — lines 433-448
} else {
  const issuesSummary = agentOutput?.trim() || FALLBACK_NO_REVIEW_OUTPUT;
  const task = `[WRFC:${wid}] Fix the issues...`;
  const actions = [buildSpawnAction({ wid, type: 'engineer', task, files: filesModified })];
  const state_updates = [
    ...phaseUpdate(sid, wid, 'FIXING'),
    { key: WS(sid, wid, 'review_score'), value: score, op: 'set' },
  ];
  return { actions, state_updates };
}
```

No `fixAttempts` or `maxFix` reference. Budget exhaustion is ONLY checked in the FIXING handler.

**Fix**: Remove "budget remaining" from the flow. Replace with: "REVIEWING fail path spawns fixer unconditionally — budget check happens later in the FIXING handler."

---

### 2. Line 171: Escalation state_updates missing agent_map deletion

**Flow says**: "State updates: `.phase = ESCALATED`, `.fix_attempts = 3`"

**Code reality** (FIXING branch, budget exhausted — lines 474-479):

```typescript
const state_updates = [
  ...phaseUpdate(sid, wid, 'ESCALATED'),
  { key: WS(sid, wid, 'fix_attempts'), value: newFixAttempts, op: 'set' },
  { key: WS(sid, wid, 'files_modified'), value: mergedFiles, op: 'set' },
  { key: AM(sid, agentId), value: null, op: 'delete' },  // <-- MISSING FROM FLOW
];
```

**Fix**: Add `.files_modified = mergedFiles` and `deletes fixer's agent_map entry` to the escalation state_updates.

---

### 3. Line 129: FIXING within-budget path also leaves stale agent_map entry (missing note)

**Flow says**: "State updates: `.phase = REVIEWING`, `.fix_attempts = 1`, merges any new files"

**Code reality** (FIXING branch, within budget — lines 492-496):

```typescript
const state_updates = [
  ...phaseUpdate(sid, wid, 'REVIEWING'),
  { key: WS(sid, wid, 'fix_attempts'), value: newFixAttempts, op: 'set' },
  { key: WS(sid, wid, 'files_modified'), value: mergedFiles, op: 'set' },
];
```

No `AM(sid, agentId)` delete — same pattern as reviewer fail (line 106). Harmless (dead agent, unique ID), but the flow documents this for the reviewer case and should document it here too for consistency.

**Fix**: Add note similar to line 106: "Fixer's agent_map entry is NOT deleted (within-budget case) — same pattern as reviewer fail, stale entry is harmless."

---

## Everything Else: Verified Correct

| Section | Status |
|---------|--------|
| Session Start (clearForSession, state cleanup, trigger reset) | ✅ |
| SubagentStart eng1/eng2 (auto-wid, state writes, Priority 1/2) | ✅ |
| eng1 Completes (agent_map lookup, WRITING→REVIEWING, wrfc:review_started) | ✅ |
| ActionExecutor (session_id propagation, dual pending binds) | ✅ |
| Directive Delivery (UPS drain ALL when no agent_id) | ✅ |
| SubagentStart Reviewer (Priority 1, consume_pending_bind cleanup) | ✅ |
| Reviewer fail (no agent_map delete, no wrfc:review_completed emitted) | ✅ |
| Fix Engineer SubagentStart (Priority 1, consume, bind) | ✅ |
| Re-Review pass (COMPLETED, agent_map delete, wrfc:review_completed) | ✅ |
| Quality gate terminal guard (COMPLETED/ESCALATED → return {}) | ✅ |
| Escalation sequence (FIXING handler escalates, no reviewer after fix 3) | ✅ |
| Cross-session isolation (clearForSession, session-scoped state/binds) | ✅ |
| Error paths (score parse, missing agent_type, missing session_id, TTL) | ✅ |
| Parallel chains (FIFO + session filter, sibling cleanup by workflowId) | ✅ |
