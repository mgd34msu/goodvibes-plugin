# WRFC Plugin Full Flow Trace (Post-Fix v2)

Scenario: Session A starts, orchestrator spawns 2 parallel engineers (eng1, eng2), each goes through the full WRFC cycle.

## Session Start

1. Session A connects → `session:started` hook fires → IPC router receives it
2. Router resets trigger fire counts via `triggerRegistry.resetAllFireCounts()`
3. Router calls `stateStore.keys('wrfc.sessions.{sessionA}')` — finds any stale keys from a previous incarnation of session A
4. Deletes only those keys. Session B's keys at `wrfc.sessions.{sessionB}.*` are untouched
5. Router calls `agentWorkflowMap.clearForSession(sessionA)` — removes stale pending binds tagged with sessionA's ID. Pending binds from session B are untouched. Note: only pending binds are cleared per-session; the active `map` (agentId → workflowId) is NOT cleared since agent IDs are globally unique and never collide across sessions.
6. Writes session pointer file `runtime-{sessionA}.socket`

## Orchestrator Spawns 2 Engineers in Parallel

1. Orchestrator sends one message with two Agent tool calls (eng1, eng2)
2. Claude Code launches both agents, fires SubagentStart for each

## SubagentStart — eng1

1. Hook fires with `agent_id=eng1_id`, `agent_type=goodvibes:engineer`
2. Sends IPC `hook_event` with `agent:spawned` to runtime
3. Runtime's `processHookEvent` runs synchronously (processImmediate) — BEFORE the IPC ack is returned
4. EventProcessor evaluates triggers → matches `wrfc_agent_spawned`
5. Calls `handleWorkflowCreated(event, trigger, store)`
6. Handler calls `eventSessionId(event)` → extracts `event.metadata.session_id` (session A's UUID). **If missing, logs a WARN and falls back to 'default'.**
7. No `[WRFC:wid]` tag (initial spawn) → agent type matches `REQUIRE_REVIEW_AGENT_TYPES` → auto-generates `wid = wrfc_auto_{timestamp}_{eng1_id_prefix}_{random}`
8. Writes state:
   - `wrfc.sessions.{A}.agent_map.{eng1_id} = wid1`
   - `wrfc.sessions.{A}.workflows.{wid1}.phase = WRITING`
   - `wrfc.sessions.{A}.workflows.{wid1}.agent_type = goodvibes:engineer`
   - `wrfc.sessions.{A}.workflows.{wid1}.fix_attempts = 0`
   - `wrfc.sessions.{A}.workflows.{wid1}.min_review_score = 9.5`
   - `wrfc.sessions.{A}.workflows.{wid1}.max_fix_attempts = 3`
9. SubagentStart hook checks PRIORITY 1 (task fields) — no `[WRFC:wid]` tag (initial spawn has none)
10. PRIORITY 2: IPC `resolve_pending_bind("goodvibes:engineer", session_id=A)` — no pending binds yet (initial spawn, not WRFC-chained)
11. No workflow_id injected into agent's context — that's expected for initial spawns

## SubagentStart — eng2

12. Same flow as eng1 → generates `wid2`, writes `wrfc.sessions.{A}.agent_map.{eng2_id} = wid2`, etc.
13. Both workflows now exist independently in session A's state namespace

## eng1 Completes Its Work

1. Agent finishes writing code → Claude Code fires SubagentStop
2. SubagentStop resolves `workflow_id` — for initial spawns without a wid in tracking, falls back to `extractWorkflowIdFromFile()` (agent's own transcript) or `extractWorkflowIdFromTranscript()` (parent's JSONL)
3. **`extractWorkflowId()` now trims matched values and rejects empty/whitespace-only strings** (defense against `[WRFC: ]`)
4. For initial spawns that truly have no wid, SubagentStop sends `agent:completed` WITHOUT a workflow_id
5. Runtime receives `agent:completed` → EventProcessor → matches `wrfc_agent_completed` → calls `handleAgentCompleted(event, trigger, store)`
6. Handler calls `eventSessionId(event)` → gets session A's UUID
7. Extracts `agentId = eng1_id`
8. Looks up `store.get('wrfc.sessions.{A}.agent_map.{eng1_id}')` → finds `wid1`
9. **If lookup fails and agent type is in ENGINEER/REVIEWER/REQUIRE_REVIEW types → logs WARN (not debug)** — "no workflow binding found for expected agent type"
10. Reads `wrfc.sessions.{A}.workflows.{wid1}.phase` → `WRITING`
11. Phase is WRITING, agent type matches REQUIRE_REVIEW_AGENT_TYPES → force-review path
12. Builds task string: `[WRFC:wid1] Review the work completed in workflow wid1. Minimum score: 9.5. Files modified: ...`
13. Calls `buildSpawnAction({ wid: wid1, type: 'reviewer', task, files })` → returns Action with `type: 'send_message'`, `params.agent_type: 'reviewer'`
14. Returns state updates: `wrfc.sessions.{A}.workflows.{wid1}.phase = REVIEWING`
15. Emits chain event `wrfc:review_started` with `workflow_id: wid1`

## ActionExecutor Processes the Spawn Action

16. EventProcessor passes action to ActionExecutor with context: `{ workflow_id: wid1, session_id: A }` (**session_id now flows from event.metadata through EventProcessor**)
17. ActionExecutor enqueues directive to DirectiveQueue (target: `subagent_stop`)
18. ActionExecutor sees `agent_type = 'reviewer'` and `workflow_id = wid1` → calls:
    - `agentWorkflowMap.addPendingBind('reviewer', wid1, sessionA)` — **pending bind now tagged with session_id**
    - `agentWorkflowMap.addPendingBind('goodvibes:reviewer', wid1, sessionA)` — dual-key for normalized matching
19. Pending bind queue: `[{reviewer, wid1, sessionA}, {goodvibes:reviewer, wid1, sessionA}]`

## Directive Delivery to Orchestrator

20. Orchestrator's next message triggers UserPromptSubmit (UPS) hook
21. UPS hook (`user-prompt-submit-directives.mjs`) calls IPC `get_directives`
22. IPC router's `buildDirectivesResponse()` is called. Since the UPS hook does NOT pass an `agent_id` (it's the orchestrator, not a subagent), no workflow scoping applies — `holdDrain('subagent_stop')` drains ALL pending directives for that target. If both eng1 and eng2 completed before this UPS call, both spawn-reviewer directives are returned in one response.
23. Returns `<gv>{"action":"spawn","wid":"wid1","type":"reviewer","task":"[WRFC:wid1] Review..."}</gv>` via `additionalContext`
24. Orchestrator reads the `<gv>` tag → spawns a reviewer agent with `[WRFC:wid1]` in its prompt

## SubagentStart — Reviewer for wid1

25. Hook fires with `agent_type=goodvibes:reviewer`
26. Sends `agent:spawned` to runtime → `handleWorkflowCreated` fires
27. Handler finds `incomingWid = wid1` from `[WRFC:wid1]` in event data → binds reviewer to existing workflow (no new state created)
28. Writes `wrfc.sessions.{A}.agent_map.{reviewer_id} = wid1`
29. SubagentStart hook PRIORITY 1: finds `[WRFC:wid1]` in task fields → resolved immediately
30. Hook calls IPC `consume_pending_bind(workflow_id=wid1)` → **cleans up the pending bind entries for wid1** from the queue. This prevents stale entries if PRIORITY 1 succeeds.
31. PRIORITY 2 not needed — but if PRIORITY 1 had missed, `resolve_pending_bind("goodvibes:reviewer", session_id=A)` → FIFO dequeue returns `wid1`, **filtered by session_id**. Sibling cleanup removes the `reviewer` (non-prefixed) entry for same workflow.
32. Injects `[WRFC:wid1]` into reviewer's additionalContext

## Reviewer Completes — Score 7.2 (Below 9.5 Threshold)

1. Reviewer finishes, Claude Code fires SubagentStop
2. SubagentStop resolves `workflow_id = wid1` from tracking entry (set by SubagentStart step 29)
3. Sends `agent:completed` to runtime with `workflow_id: wid1`, reviewer output containing score
4. `handleAgentCompleted` fires:
   - Extracts `sid = A`, looks up `wrfc.sessions.{A}.agent_map.{reviewer_id}` → `wid1`
   - Reads `wrfc.sessions.{A}.workflows.{wid1}.phase` → `REVIEWING`
   - Agent type matches `REVIEWER_AGENT_TYPES` → enters REVIEWING branch
   - `extractScore(agentOutput)` → 7.2
   - 7.2 < 9.5 → review **failed**
5. REVIEWING fail path spawns fixer **unconditionally** — no budget check here. Budget exhaustion is only checked later in the FIXING handler when the fixer completes.
6. Builds fix task: `[WRFC:wid1] Fix the issues found in review. Score: 7.2/10. Minimum: 9.5...`
7. Returns state updates:
   - `wrfc.sessions.{A}.workflows.{wid1}.phase = FIXING`
   - `wrfc.sessions.{A}.workflows.{wid1}.review_score = 7.2`
   - Note: reviewer's agent_map entry is NOT deleted on fail — only on pass (COMPLETED path). The stale entry is harmless since the reviewer agent is done and its ID will never reappear.
8. **NOTE**: `wrfc:review_completed` is only emitted on the **pass** path (score >= minScore). On fail, no chain event is emitted — so `handleQualityGate` never fires for failed reviews. The quality gate terminal phase guard (COMPLETED/ESCALATED early return) handles the pass case where `handleAgentCompleted` already set phase=COMPLETED.
9. ActionExecutor enqueues spawn-engineer directive + `addPendingBind('engineer', wid1, sessionA)` + `addPendingBind('goodvibes:engineer', wid1, sessionA)`

## Directive Delivery — Fix Engineer

10. UPS hook drains directive → injects `<gv>{"action":"spawn","wid":"wid1","type":"engineer","task":"[WRFC:wid1] Fix..."}</gv>`
11. Orchestrator spawns fix engineer with `[WRFC:wid1]` in prompt

## SubagentStart — Fix Engineer

12. Same resolution chain as reviewer: PRIORITY 1 finds `[WRFC:wid1]` in task fields → bound to wid1
13. `consume_pending_bind(wid1)` cleans up pending bind queue
14. `handleWorkflowCreated` binds fixer to existing workflow: `wrfc.sessions.{A}.agent_map.{fixer_id} = wid1`

## Fix Engineer Completes

1. SubagentStop → `agent:completed` with `workflow_id: wid1`
2. `handleAgentCompleted` → extracts sid, looks up agent_map → wid1
3. Reads phase = `FIXING`, agent type matches `ENGINEER_AGENT_TYPES`
4. Reads `fix_attempts = 0` from state (hasn't been incremented yet in FIXING phase) → `newFixAttempts = 1`
5. 1 < 3, within budget → spawns re-reviewer
6. Builds: `[WRFC:wid1] Re-review after fix attempt 1 of 3...`
7. State updates: `.phase = REVIEWING`, `.fix_attempts = 1`, `.files_modified = mergedFiles`. Note: fixer's agent_map entry is NOT deleted (within-budget case) — same pattern as reviewer fail, stale entry is harmless since the agent ID is unique and done.
8. ActionExecutor enqueues reviewer directive + registers pending binds with sessionA

## Re-Review — Score 9.7 (Above 9.5 Threshold)

1. Reviewer spawned, bound to wid1 via same flow (PRIORITY 1 → [WRFC:wid1])
2. Reviewer completes with score 9.7
3. `handleAgentCompleted` → phase = REVIEWING, score 9.7 >= 9.5 → **PASSED**
4. Builds `buildCompleteAction(wid1)` → directive: `<gv>{"action":"complete","wid":"wid1"}</gv>`
5. State updates: `.phase = COMPLETED`, `.review_score = 9.7`, deletes reviewer's agent_map entry
6. Emits `wrfc:review_completed` chain event
7. **`handleQualityGate` may fire on `wrfc:review_completed` — but now reads phase from state, sees COMPLETED, returns `{}` immediately (terminal phase guard). No duplicate complete action.**
8. Directive delivered to orchestrator via UPS hook
9. Orchestrator receives complete directive → commits files, updates .goodvibes/ logs

## Meanwhile, eng2's Chain Runs Independently

- eng2's entire WRFC chain (write → review → possibly fix → re-review → complete) runs on `wid2` with completely separate state at `wrfc.sessions.{A}.workflows.{wid2}.*`
- **Pending binds are FIFO per agent type AND tagged with session_id** — if both chains spawn reviewers simultaneously, `resolve_pending_bind("reviewer", sessionA)` dequeues the first entry for that session, the second call dequeues the second
- No cross-contamination because:
  1. State keys are session-scoped (`wrfc.sessions.{A}.*`)
  2. Pending binds are consumed (removed) on resolution, and sibling cleanup removes the `goodvibes:` prefixed duplicate
  3. `consume_pending_bind` after PRIORITY 1 success cleans up redundant entries
  4. Directive drain from the orchestrator's UPS hook is NOT workflow-scoped (orchestrator has no agent_id), but each directive's `<gv>` tag contains the correct `wid`, so the orchestrator spawns each agent with the right `[WRFC:wid]` in its prompt

## Escalation Path (Fix Budget Exhausted)

The escalation check happens in the **FIXING handler**, not the REVIEWING handler. The REVIEWING handler only spawns fixers (never increments fix_attempts). The full sequence:

```
Initial:           fix_attempts = 0
Review 1 fails:    spawns fixer, NO increment,       phase → FIXING
Fix 1 completes:   fix_attempts 0→1, 1 < 3,          phase → REVIEWING (spawns re-reviewer)
Review 2 fails:    spawns fixer, NO increment,       phase → FIXING
Fix 2 completes:   fix_attempts 1→2, 2 < 3,          phase → REVIEWING (spawns re-reviewer)
Review 3 fails:    spawns fixer, NO increment,       phase → FIXING
Fix 3 completes:   fix_attempts 2→3, 3 >= 3,         → ESCALATE directly
```

1. Fix engineer 3 completes → `handleAgentCompleted` → phase = FIXING
2. `newFixAttempts = fixAttempts + 1 = 3`, `3 >= maxFix (3)` → budget exhausted
3. Builds `buildEscalateAction(wid1, '3 fix attempts failed, last score {lastScore}/10')`
4. State updates: `.phase = ESCALATED`, `.fix_attempts = 3`, `.files_modified = mergedFiles`, deletes fixer's `agent_map` entry
5. Directive: `<gv>{"action":"escalate","wid":"wid1","reason":"3 fix attempts failed..."}</gv>`
6. Orchestrator receives escalate → notifies user, stops the chain
7. **No reviewer ever runs after fix 3** — escalation is immediate from the FIXING handler

## Cross-Session Isolation

- Session B starts while Session A is active → `session:started` handler clears only `wrfc.sessions.{B}.*` keys and calls `clearForSession(B)` on pending binds
- Session A's state, pending binds, and active workflows are completely untouched
- If Session A restarts, its stale state is cleaned but Session B is unaffected
- The `'default'` session bucket (for events without session_id) is isolated from all real sessions

## Error Paths

- **Score parse failure**: If `extractScore()` returns null, handler escalates immediately with `review score parse failed` reason. Phase → ESCALATED.
- **Missing agent_type**: Handler logs warn and cannot determine if review is required. Falls through to generic handling.
- **Missing session_id**: `eventSessionId()` logs WARN, falls back to `'default'` bucket. Events from different sessions with missing metadata collide in default — this is a degraded but functional state.
- **Pending bind TTL**: Entries older than 60s are pruned on next `resolvePendingBind()` call. This prevents leaked entries from abandoned workflows.
