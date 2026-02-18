# Batch + Precision Engine Merge Notes

## Date: 2026-02-18 (continued from batch-middleware-ideas.md)

## Key Insight: Absorb Batch Into Precision (Not the Reverse)

Instead of fixing batch_engine to delegate to precision_engine, absorb batch's valuable features into precision_engine and eliminate the second MCP server.

## What Batch Has That Precision Doesn't

| Feature | Integration Approach |
|---------|---------------------|
| Checkpoint/rollback (cross-call) | Optional params on precision_write/precision_edit, or standalone tool |
| Multi-phase execution | New tool (precision_batch or precision_apply) |
| Dry run / preview | Add dry_run param to existing tools |
| Validation (typecheck/lint/test) | Add validate.after param to precision_write/precision_edit |
| Recovery (retry/restore/fix) | New precision_recover tool or fold into precision_config |
| State/memory management | Extend precision_config |
| Fix loop | Internal to apply tool |
| Transaction modes (atomic/partial/none) | precision_edit already has this |

## Existing Rollback in Precision Engine

precision_edit already has:
- `transaction.mode: atomic` - all edits succeed or all roll back
- `transaction.rollback_on_fail: true` - auto-rollback on failure
- Returns `rollback_id` in response
- Scope: within that single tool call only
- Mechanism: in-memory (reads original content before editing, restores on failure)

precision_write has:
- `mode: backup` - creates backup before overwriting
- No atomic transaction across multiple files

Batch checkpoint system adds:
- Cross-call persistence (roll back multiple calls)
- On-disk snapshots with SHA-256 verification
- Selective restore (specific files, not all-or-nothing)
- Post-completion undo
- State + memory snapshots

Conclusion: precision_edit's existing rollback covers ~80-90% of cases. Cross-call checkpoints are nice-to-have for long workflows and post-completion undo. Can add later if needed.

## Critical Problem: Double-Read on Batched Gather

The "one big precision_batch call" has a fundamental flaw for the GATHER phase:

1. If precision_batch returns gather results for 5 file reads + 3 greps, that's 10-15K tokens
2. Response gets filed (too large for inline return)
3. Agent needs to READ the filed results to plan the apply phase
4. That's MORE calls than just doing precision_read directly and getting content inline

Gather-phase results need to be SEEN by the agent to plan edits. Stuffing them into a batch doesn't help - it makes things worse.

## Where Batching Genuinely Helps: Apply Phase Only

The apply phase is different:
- Agent doesn't need to read back what it just wrote
- Response is just confirmation (count_only/minimal) - tiny, no truncation risk
- Currently: precision_write + precision_edit + precision_exec = 3 calls
- Unified: 1 call with atomic rollback + validation

## Revised Design: precision_apply

Instead of a full precision_batch tool, create a lightweight `precision_apply` that unifies the output phase:

```json
precision_apply({
  "write": [{"path": "...", "content": "..."}],
  "edit": [{"path": "...", "find": "...", "replace": "..."}],
  "exec": [{"cmd": "npx tsc --noEmit", "expect": {"exit_code": 0}}],
  "checkpoint": true,
  "validate": {"after": ["typecheck"]},
  "rollback_on_fail": true,
  "verbosity": "minimal"
})
```

Uses precision_write, precision_edit, and precision_exec handlers internally. No reimplementation.

## Revised GPA Loop

- **G (Gather)**: discover + precision_read (separate calls, agent sees results inline) - 1-2 calls
- **P (Plan)**: cognitive - 0 calls
- **A (Apply)**: precision_apply({write: [...], edit: [...], exec: [...]}) - 1 call

Total: 2-3 calls. Apply phase is genuinely one atomic call. No double-read problem.

## Architecture

```
Before:  Agent -> batch_engine MCP (reimplements everything)
               -> precision_engine MCP (real implementations)

After:   Agent -> precision_engine MCP
                  |-- precision_read/write/edit/grep/glob/exec/fetch (unchanged)
                  |-- precision_apply (new: unified output with rollback+validation)
                  +-- checkpoint/recovery runtime (absorbed from batch, optional)
```

One server. One set of implementations. No double-read problem.

## What Gets Eliminated

- batch-engine MCP server (entire separate process)
- ~2172 lines of reimplemented file operations in batch.ts
- 6 separate batch_* tools
- ToolSearch friction (batch tools were deferred)

## What Gets Kept (Absorbed)

- Checkpoint manager (if cross-call rollback is needed later)
- Transaction modes (precision_edit already has atomic)
- Validation integration (add validate.after to precision_apply)
- Recovery basics (rollback_on_fail in precision_apply)

## What Gets Dropped (Not Worth Complexity)

- Agent pool/spawning (orchestrator handles this, not the tool)
- Mode system (vibecoding/justvibes lives in prompt, not tool)
- Telemetry system (overkill for tool-level concerns)
- Fix loop (orchestrator/WRFC handles retry logic)
- Hooks system (30+ hooks is over-engineered for what's needed)
- State management beyond precision_config (memory files handled by agents directly)

## Open Questions

1. Should precision_apply be a new tool, or should precision_edit be extended to also accept write and exec operations?
2. Should discover be enhanced to also accept precision_read file specs (gather in one call when results are small)?
3. Is the checkpoint system worth absorbing now, or defer until cross-call rollback is actually needed?
4. What happens to batch_engine's test suite? Port relevant tests to precision_engine?
5. Token estimate in project index - still useful for discover/precision_read to help agents plan which files to request?