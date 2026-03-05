# Runtime Engine — Remaining Gaps Master Plan v2

**Date**: 2026-03-05  
**Source**: Spec reconciliation + test results + manual audit + Session 2 feedback  
**Status**: PENDING REVIEW

---

## Pre-Flight Verification (before any code)

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 0a | `setupSignalHandlers()` called in bootstrap/daemon? | **NO** | Exported from `signals.ts:42` but never imported or called. P0 for daemon stability. |
| 0b | `queryEvents` IPC proxy exists? | **YES** | Already on transport interface (types.ts:83), local-transport, remote-transport, daemon-server. NOT a gap. |
| 0c | Workflow cleanup scheduled? | **STARTUP ONLY** | `bootstrap.ts:268` calls `cleanup()` once at startup. No periodic schedule. Worth verifying in Phase 4. |

---

## Task List (Prioritized)

### Tier 1A: Bootstrap Wiring (Phase 1, Agent A)

| # | Task | Severity | Effort |
|---|------|----------|--------|
| 1 | Wire `setupSignalHandlers()` in daemon startup | P0 | 15 min |
| 2 | Wire `createHumanEvent()` in UserPromptSubmit handler | MEDIUM | 30 min |
| 3 | Add trigger registry to reconfigurables map | LOW | 20 min |

**Files**: `bootstrap.ts`, `transport/daemon.ts`, `user-prompt-submit.ts`, trigger subsystem  
**No transport file conflicts with Tier 1B**

### Tier 1B: Transport Completeness (Phase 1, Agents B+C — parallel with 1A)

**Agent B — Schedule IPC (6 actions)**:

| # | Task | Severity | Effort |
|---|------|----------|--------|
| 4 | Proxy schedule `list`, `get`, `create`, `cancel`, `pause`, `resume` via IPC | LOW | 1.5 hr |

**Files**: `transport/types.ts`, `local-transport.ts`, `remote-transport.ts`, `daemon-server.ts`, `handlers/schedule.ts`

**Agent C — External + Triggers IPC (5 actions)**:

| # | Task | Severity | Effort |
|---|------|----------|--------|
| 5 | Proxy external `normalizers`, `test_normalize`, `stats`, `queue` via IPC | LOW | 45 min |
| 6 | Proxy trigger `test` action via IPC | LOW | 30 min |

**Files**: `transport/types.ts`, `local-transport.ts`, `remote-transport.ts`, `daemon-server.ts`, `handlers/external.ts`, `handlers/triggers.ts`

**Note**: Agents B and C both touch transport files. They must coordinate on `types.ts` — **run B first, then C**, or have C wait for B's interface additions. Alternative: combine into one agent.

### Tier 2: Test Coverage (Phase 2, depends on Phase 1)

| # | Task | Severity | Effort |
|---|------|----------|--------|
| 7 | Unit tests for all new transport methods (cancelWorkflow + 5 IPC proxy + new schedule/external/trigger methods) | MEDIUM | 1.5 hr |
| 8 | Fix pre-existing TS error in setup.test.ts:431 (fold into #7) | LOW | 15 min |
| 9 | Integration tests for trigger pipelines (build fail → detector → trigger → handler) | MEDIUM | 3-4 hr |

### Tier 3: Daemon-Mode Verification (Phase 3, depends on all)

| # | Task | Severity | Effort |
|---|------|----------|--------|
| 10 | Verify workflow persistence writes to disk | LOW | 15 min |
| 11 | Verify CI failure bridge end-to-end in daemon mode | LOW | 15 min |
| 12 | Verify DevServer + BuildTestDetector with real events | LOW | 20 min |
| 13 | Verify workflow cleanup runs and removes expired state | LOW | 10 min |

Requires plugin rebuild + daemon restart. Session 2 runs verification.

---

## Execution Plan

### Phase 1: Code Changes (Parallel)

```
Agent A (Tier 1A): Bootstrap wiring — items 1, 2, 3
Agent B (Tier 1B): Schedule IPC — item 4
  → then Agent C: External + Trigger IPC — items 5, 6

A runs parallel with B+C chain.
Review all after completion.
```

### Phase 2: Test Coverage

```
Agent D: Unit tests — items 7, 8
Agent E: Integration tests — item 9

D and E can run in parallel.
Review after completion.
```

### Phase 3: Verification

```
Rebuild + reinstall + restart daemon.
Session 2 runs items 10-13.
Document results.
```

---

## Conflict Analysis

| Agent | Files Modified | Conflicts? |
|-------|---------------|------------|
| A (bootstrap) | bootstrap.ts, daemon.ts, user-prompt-submit.ts, trigger subsystem | None with B/C |
| B (schedule IPC) | transport/*.ts, schedule.ts | types.ts shared with C |
| C (external+trigger IPC) | transport/*.ts, external.ts, triggers.ts | types.ts shared with B |

**Resolution**: Run B before C (sequential within the IPC chain), or combine B+C into one agent.

---

## Total Estimated Effort

- Phase 1: ~3 hours agent time (but parallel = ~1.5 hr wall clock)
- Phase 2: ~5 hours agent time (but parallel = ~4 hr wall clock)
- Phase 3: ~1 hour (manual verification)
- **Total wall clock: ~6.5 hours**
