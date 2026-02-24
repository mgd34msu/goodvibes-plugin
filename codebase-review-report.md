# Runtime Engine Codebase Review Report

**Project**: plugins/goodvibes/tools/implementations/runtime-engine
**Generated**: 2026-02-23
**Overall Score**: 8.0/10
**Reviewers**: 5 parallel agents (core, directives, triggers, IPC/lifecycle, tests)

## Executive Summary

- Critical: 0 issues
- Major: 21 issues (deduplicated from 21 raw)
- Minor: 40 issues
- Nitpick: 22 issues

## Score Breakdown

| Area | Score | Key Issues |
|------|-------|------------|
| Core Modules (events, shared) | 8.1/10 | since() full file read, O(n) queue splice, write index overflow |
| Directives & WRFC | 8.2/10 | NaN propagation, unsafe casts, duplicate sendEvent |
| Triggers & Workflow | 8.2/10 | Sequential evaluation, proto traversal, fire-and-forget actions |
| IPC & Lifecycle | 8.5/10 | O(n^2) buffer concat, PID perms, trigger dedup fragility |
| Test Suite | 6.5/10 | 23+ modules untested, 3 entire domains with zero coverage |

---

## Major Issues (All 21)

### Correctness

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| M1 | wrfc-handlers.ts:599 | `Number(rawScore ?? 0)` allows NaN, silently routes to fix path | Validate with `parseFloat` + `isNaN` guard |
| M2 | wrfc-handlers.ts:703-704 | `Number(rawFix ?? 0)` NaN for fix_attempts causes infinite re-review loops | Same NaN guard |
| M3 | wrfc-handlers.ts:411 | `workflow.current_state.toUpperCase()` without null check | Guard with `(workflow.current_state ?? '').toUpperCase()` |
| M4 | workflow-engine.ts:164,258,263,273 | `void this.executeActions()` fires async without await; action ordering not guaranteed | Await actions or document behavior |
| M5 | workflow-engine.ts:575 | Expression parser `indexOf` matches operator chars inside field names (e.g. `gt_value`) | Use regex with whitespace boundaries |
| M6 | event-log.ts:310-318 | `since()` reads entire log then filters; should stream-filter | Implement since_sequence filter in query() |
| M7 | event-queue.ts:452-455 | `all_errors` not accumulated across retries; only last error captured | Carry `all_errors` through re-queued entries |
| M8 | event-bus.ts:206-217 | `once()` wrapper causes sync errors to be double-logged | Wrap handler in try/catch inside once wrapper |

### Performance

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| M9 | event-queue.ts:353-363 | O(n) insertion via `Array.splice()` for 10k queue | Use priority-bucketed FIFO queues or min-heap |
| M10 | ipc-server.ts:225-227 | O(n^2) string concatenation for buffer up to 1MB | Use `Buffer[]` array + `Buffer.concat()` |
| M11 | trigger-registry.ts:137-153 | Sequential async trigger evaluation blocks on slow handlers | Use `Promise.allSettled` for parallel evaluation |

### Safety

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| M12 | wrfc-handlers.ts:388-390 | Unsafe `as Record<string, unknown>` on hookInput without runtime guard | Add `typeof hookInput === 'object' && hookInput !== null` |
| M13 | wrfc-handlers.ts:632-638 | IIFE fallback doesn't guard empty-string workflow_id | Add `.length > 0` check |
| M14 | action-executor.ts:49-57 | Template path traversal allows reading `__proto__`, `constructor` | Add deny-list for prototype chain segments |
| M15 | process-manager.ts:572 | PID file written with world-readable 0o644 permissions | Add `{ mode: 0o600 }` |
| M16 | condition-evaluator.ts:69 | `recentEventsHead` monotonically increases, overflows MAX_SAFE_INTEGER | Wrap with modulo arithmetic |
| M17 | event-bus.ts:151-153 | `historyWriteIndex` same overflow issue | Same modulo fix |

### Design

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| M18 | builtins.ts:79-89 | `builtin_budget_warning` fires on EVERY agent:progress, event amplification | Use invoke_handler with threshold check |
| M19 | event-queue.ts:446 | `max_attempts ?? this.maxAttempts` fallback is dead code (required field) | Remove fallback or make field optional |

### Test Coverage

| # | Issue | Fix |
|---|-------|-----|
| M20 | 23+ source modules with zero tests; 3 entire domains untested (agents/, lifecycle/, persistence/) | Add tests for P0 modules |
| M21 | ipc-router.test.ts covers only ~20% of routing paths (config:loaded only) | Expand to all message types |

---

## Minor Issues (40) — See remediation-plan.md for full list

Key themes:
- 7 empty catch blocks in event-log.ts
- Missing `node:` prefix on imports (config.ts, utils.ts)
- DRY violations (duplicate sendEvent in handleFixResult, duplicate agentType substring matching)
- Voided parameters in directive-builder.ts
- deepMerge treats null as object
- Health checker returns hardcoded zeros
- Log level resolved on every call

## Nitpick Issues (22) — See remediation-plan.md for full list
