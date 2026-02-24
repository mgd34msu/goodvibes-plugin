# Remediation Plan

**Total Tasks**: 18
**Max Concurrent Agents**: 6

## Execution Rules

- Max concurrent agents: 6
- Agent type: goodvibes background ONLY
- Context: Fresh context per task
- Tool priority: precision_engine > native (mandatory)
- Monitoring: SubagentStop hook auto-notifies

---

## Wave 1: Critical Correctness & Safety [P0]

- [x] TASK-001: Fix NaN propagation in wrfc_review_response and wrfc_fix_response | Severity: major | Files: `src/directives/wrfc-handlers.ts`
  - wrfc-handlers.ts:599 — validate rawScore with parseFloat + isNaN guard, bail on NaN
  - wrfc-handlers.ts:703-704 — same for fix_attempts Number() conversion
  - wrfc-handlers.ts:411 — null guard on workflow.current_state before toUpperCase()
  - wrfc-handlers.ts:388-390 — runtime type guard on hookInput (typeof === 'object' && !== null)
  - wrfc-handlers.ts:632-638 — empty-string workflow_id guard

- [x] TASK-002: Fix template path traversal in action-executor | Severity: major | Files: `src/triggers/action-executor.ts`
  - action-executor.ts:49-57 — add deny-list rejecting __proto__, constructor, prototype in path segments
  - action-executor.ts:62-63 — log warning when template resolves to empty string for missing fields

- [x] TASK-003: Fix PID file permissions | Severity: major | Files: `src/lifecycle/process-manager.ts`
  - process-manager.ts:572 — add { mode: 0o600 } to writeFileSync
  - process-manager.ts:545-563 — add process.kill(pid, 0) stale PID liveness check

- [x] TASK-004: Fix integer overflow in ring buffers | Severity: major | Files: `src/events/event-bus.ts`, `src/triggers/condition-evaluator.ts`
  - event-bus.ts:151-153 — wrap historyWriteIndex with modulo arithmetic
  - condition-evaluator.ts:69 — wrap recentEventsHead with modulo arithmetic

- [x] TASK-005: Fix expression parser operator detection | Severity: major | Files: `src/workflow/workflow-engine.ts`
  - workflow-engine.ts:575-581 — replace indexOf with regex /\s*(>=|<=|===|!==|>|<)\s*/ for operator detection
  - workflow-engine.ts:502 — exclude `type` key from Object.assign in update_context
  - workflow-engine.ts:519-524 — make spawn_agent stub throw or return error instead of silent warning

- [x] TASK-006: Fix fire-and-forget async actions in workflow engine | Severity: major | Files: `src/workflow/workflow-engine.ts`
  - workflow-engine.ts:164,258,263,273 — document ordering behavior explicitly with JSDoc
  - OR await the actions (making sendEvent async) — discuss trade-offs in commit message

## Wave 2: Performance [P1]

- [ ] TASK-007: Fix O(n) queue insertion | Severity: major | Files: `src/events/event-queue.ts`
  - event-queue.ts:353-363 — replace splice-based sorted insert with 4 priority-bucketed FIFO arrays
  - event-queue.ts:398 — dequeue becomes shift() from highest non-empty bucket (O(1))
  - event-queue.ts:452-455 — fix all_errors accumulation across retries
  - event-queue.ts:371-383 — fix misleading setImmediate comment
  - event-queue.ts:446 — remove dead nullish coalescing on max_attempts

- [ ] TASK-008: Fix O(n^2) IPC buffer concatenation | Severity: major | Files: `src/ipc/ipc-server.ts`
  - ipc-server.ts:225-227 — use Buffer[] array + Buffer.concat() instead of string concatenation
  - ipc-server.ts:127-135 — remove error listener after successful listen
  - ipc-server.ts:162-168 — move server=null inside close callback

- [ ] TASK-009: Fix sequential trigger evaluation | Severity: major | Files: `src/triggers/trigger-registry.ts`
  - trigger-registry.ts:137-153 — parallel evaluation with Promise.allSettled for action execution
  - trigger-registry.ts:209-211 — store last_fired as numeric epoch instead of ISO string
  - trigger-registry.ts:254 — document single-thread assumption for fires_count increment

## Wave 3: DRY & Maintainability [P1]

- [ ] TASK-010: Fix wrfc-handlers DRY violations and type safety | Severity: minor | Files: `src/directives/wrfc-handlers.ts`
  - wrfc-handlers.ts:246-260 — extract duplicate sendEvent for wrfc:fix_completed into local helper
  - wrfc-handlers.ts:488,531 — replace agentType.includes() with strict equality comparison
  - wrfc-handlers.ts:626 — add debug log for rawFiles JSON parse failure
  - wrfc-handlers.ts:304 — remove unused agentCoordinator parameter or document planned usage
  - wrfc-handlers.ts:89 — multi-line destructure for readability

- [ ] TASK-011: Fix directive-builder voided params and queue SRP | Severity: minor | Files: `src/directives/directive-builder.ts`, `src/directives/directive-queue.ts`
  - directive-builder.ts:48,72 — make budget and state params optional + @deprecated
  - directive-builder.ts:54 — use concrete type for spawn directive object
  - directive-queue.ts:78-95 — document SRP concern (WRFC config in queue) for v2 extraction
  - directive-queue.ts:15 — document MAX_QUEUE_DEPTH not configurable

- [ ] TASK-012: Fix event-log error handling and performance | Severity: minor | Files: `src/events/event-log.ts`
  - event-log.ts:310-318 — implement since_sequence filter in query() for stream filtering
  - event-log.ts:239,411 — add debug logging to silent catch blocks
  - event-log.ts:405-413 — use appendFileSync for archive instead of read-rewrite
  - event-log.ts:483 — use path.dirname() instead of hardcoded /
  - event-log.ts:362 — document UTC assumption for timestamp comparison

- [ ] TASK-013: Fix config and shared module issues | Severity: minor | Files: `src/shared/config.ts`, `src/shared/utils.ts`, `src/shared/logger.ts`
  - config.ts:9,11,12 — add node: prefix to fs, path, os imports
  - config.ts:186-204 — handle null in deepMerge (add null check)
  - config.ts:128-133 — wrap IIFE in try/catch with full fallback
  - config.ts:231 — add runtime validation for JSON.parse config shape
  - utils.ts:8 — add node: prefix to crypto import
  - logger.ts:73-74 — cache resolved log level with TTL

## Wave 4: Design & Cleanup [P2]

- [ ] TASK-014: Fix builtins and WRFC loop design issues | Severity: minor | Files: `src/triggers/builtins.ts`, `src/workflow/definitions/wrfc-loop.ts`
  - builtins.ts:79-89 — change budget_warning to invoke_handler with threshold check
  - builtins.ts:203 — remove FIX-TRACE-A debug marker
  - wrfc-loop.ts:95-99 — rename on_enter event to wrfc:reviewing_entered to avoid re-emit
  - wrfc-loop.ts:45 — reduce max_transitions from 100 to 50

- [ ] TASK-015: Fix IPC router and health checker issues | Severity: minor | Files: `src/ipc/ipc-router.ts`, `src/lifecycle/health.ts`, `src/server/handlers/schemas.ts`
  - ipc-router.ts:82-139 — add cross-reference comment for hook event dedup with ProcessManager
  - ipc-router.ts:160-167 — add explicit serialization for workflow instance
  - health.ts:73-77 — inject real subsystem accessors (event queue depth, active workflows, etc.)
  - schemas.ts:186 — add additionalProperties: false to workflow filter

## Wave 5: Test Coverage [P1]

- [ ] TASK-016: Add tests for gv-tag-parser and directive-builder | Severity: major | Files: `src/directives/__tests__/gv-tag-parser.test.ts` (new), `src/directives/__tests__/directive-builder.test.ts` (new)
  - gv-tag-parser: valid tags, malformed JSON, missing fields, score clamping, multiple tags, legacy regex fallback, empty input
  - directive-builder: spawn message format, complete message, escalation message, context passthrough

- [ ] TASK-017: Add tests for event-log | Severity: major | Files: `src/events/__tests__/event-log.test.ts` (new)
  - append and read back, query by time range, rotation trigger, malformed JSON recovery, since() filtering, archive compaction

- [ ] TASK-018: Expand ipc-router tests | Severity: major | Files: `src/ipc/__tests__/ipc-router.test.ts`
  - All message types: hook_event (various hook names), query (get_directives, get_workflow_state), state_update, heartbeat
  - Error paths, disabled subsystems, invalid messages
