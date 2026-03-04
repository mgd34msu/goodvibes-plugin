# WRFC Flow Trace v2 — Review Findings

Verified against actual source code in handlers.ts, agent-workflow-map.ts, and ipc-router.ts.

## Issues Found

### 1. Escalation Path Description Is Wrong (Flow Error)

**Location**: Escalation Path, steps 1-4

The flow says: "Fix attempt 3 completes → reviewer scores 6.0 → REVIEWING handler checks fix_attempts = 3"

This is incorrect. Tracing the actual code:

- `fix_attempts` is ONLY incremented in the **FIXING handler** (`newFixAttempts = fixAttempts + 1`)
- The REVIEWING handler does NOT increment `fix_attempts` — it just spawns a fixer
- So the actual sequence is:

```
Initial:           fix_attempts = 0
Review 1 fails:    spawns fixer, NO increment,       phase → FIXING
Fix 1 completes:   fix_attempts 0→1, 1 < 3,          phase → REVIEWING
Review 2 fails:    spawns fixer, NO increment,       phase → FIXING  
Fix 2 completes:   fix_attempts 1→2, 2 < 3,          phase → REVIEWING
Review 3 fails:    spawns fixer, NO increment,       phase → FIXING
Fix 3 completes:   fix_attempts 2→3, 3 >= 3,         → ESCALATE
```

**Fix 3 escalates directly from the FIXING handler. No reviewer ever runs after fix 3.** The flow's description of a reviewer scoring 6.0 after fix attempt 3 is impossible.

The flow's step 4 self-correction ("Actually wait...") tries to address this but gets it wrong — it claims the REVIEWING handler computes `newFixAttempts = fixAttempts + 1 = 4`, but the REVIEWING handler never computes `newFixAttempts`.

**Severity**: Documentation error only — the code is correct.

---

### 2. Flow Step 8 (Reviewer 7.2) Incorrectly Claims `wrfc:review_completed` Is Emitted on Fail (Flow Error)

**Location**: "Reviewer Completes — Score 7.2", step 8

The flow says: "handleAgentCompleted also emits wrfc:review_completed chain event"

This is wrong. Verified in code:
- **Pass path** (score >= minScore): returns `{ actions, state_updates, events: [makeChainEvent('wrfc:review_completed', ...)] }`
- **Fail path** (score < minScore): returns `{ actions, state_updates }` — **no `events` field**

`wrfc:review_completed` is only emitted on PASS. This means the quality gate double-fire concern for the fail case is moot — `handleQualityGate` never fires when a review fails.

**Severity**: Documentation error. The quality gate terminal guard (COMPLETED/ESCALATED) is sufficient since it only fires on pass when phase is already COMPLETED.

---

### 3. `clearForSession` Does Not Clear Active Map Bindings (Minor, By Design)

**Location**: agent-workflow-map.ts, `clearForSession()`

The method only clears `pendingBinds` filtered by sessionId. The active `map` (agentId → workflowId) is NOT cleared.

The code comment explains: "agentIds are unique per session. However, we still clear any pending binds so stale type-keyed entries don't cross sessions."

This means stale map entries from dead agents accumulate in memory. Not a correctness bug (new agents get new IDs and will never collide), but a minor memory leak for long-running runtime processes with many session restarts.

**Severity**: Low — memory leak, not correctness.

---

### 4. `'default'` Session Bucket Still Allows Cross-Session Contamination

**Location**: handlers.ts `eventSessionId()`, agent-workflow-map.ts `addPendingBind()`

When `session_id` is missing from hook input:
- `eventSessionId()` falls back to `'default'` with a WARN log
- `addPendingBind()` defaults sessionId to `'default'`

If multiple sessions simultaneously fail to provide session_id, they all land in `wrfc.sessions.default.*` — shared namespace, cross-session contamination of state and pending binds.

The flow acknowledges this (step 176: "degraded but functional"), but in practice two sessions with missing IDs would interfere with each other's WRFC chains.

**Severity**: Medium — silent isolation failure, but requires two sessions both missing session_id simultaneously (unlikely).

---

## Fixes Verified as Correct

| Fix | Status | Notes |
|-----|--------|-------|
| `clearForSession(sessionId)` on session:started | ✅ Correct | Session-scoped, only clears that session's pending binds |
| `consume_pending_bind` after Priority 1 success | ✅ Correct | Prevents stale entries from causing wrong wid assignment |
| Quality gate terminal phase guard (COMPLETED/ESCALATED) | ✅ Sufficient | `wrfc:review_completed` only emits on pass, so guard always sees COMPLETED |
| Session-scoped pending binds (`addPendingBind` with sessionId) | ✅ Correct | `resolvePendingBind` filters by sessionId when provided |
| `extractWorkflowId` rejects empty/whitespace `[WRFC:]` | ✅ Correct | Prevents malformed state keys |
| WARN log for missing session_id | ✅ Correct | Better observability, though fallback to 'default' is still risky |

## Summary

The 6 original fixes are all correctly implemented. The remaining issues are:
- Two documentation errors in the flow trace (escalation path + review_completed emission)
- One minor memory leak (stale map entries)
- One medium-risk edge case (default session bucket)

No new bugs introduced by the fixes.
