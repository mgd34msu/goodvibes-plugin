# Handoff: GPA Loop + Batch Engine Documentation & Upgrade

## Date: 2026-02-18

## Context

Started as a documentation improvement effort, evolved into discovering a fundamental gap in the batch_engine implementation.

## What We Did

### 1. Analyzed Current Prompt Effectiveness
- Asked Claude what it sees in system prompts about batch_engine
- Found: two vague YAML examples, a preference ranking, and zero schema docs
- Claude admitted it would never proactively call ToolSearch to load batch because precision built-in batching was better documented and "good enough"
- Identified that the real barrier was documentation quality, not capability awareness

### 2. Created batch-prompt.md (project root)
- First version: ~1,200 tokens with comparison table, schema, examples, decision tree
- Sent to reviewer agent who recommended cuts and additions
- Key reviewer insight: add before/after call count comparison ("3 calls -> 1 call") and note that batch collapses DPB B-input + B-output
- Compressed to ~800 tokens after review

### 3. Renamed DPB to GPA (Gather-Plan-Apply)
- DPB was actually DPBPB (Discover, Plan, Batch-input, Plan, Batch-output) — confusing
- GPA: 3 letters, 3 phases, 2 calls. Honest naming.
  - **Gather** (1 call): all discovery + reads in parallel
  - **Plan** (0 calls): cognitive only
  - **Apply** (1 call): all writes + edits + exec in parallel
- Created gpa-prompt.md (project root) — replacement for DISCOVER-PLAN-BATCH.md
- Updated batch-prompt.md to use GPA terminology
- dpb-prompt.md still exists (intermediate draft, can be deleted)

### 4. Key Insight: Batch for Independent Operations
- Original batch examples showed read+write+exec in one call — misleading because writes usually depend on read results
- Better framing: batch is for **independent operations within a phase**
  - Gather: precision_read + precision_grep + precision_glob + precision_fetch (all independent inputs)
  - Apply: precision_write + precision_edit + precision_exec (all independent outputs)
- This is the honest, accurate argument for batch — no dependency handwaving

### 5. Considered GPAV (Gather-Plan-Apply-Verify) — Rejected
- Plan phase would write to .goodvibes/gpav/{subagent-id}.md (1 call)
- Verify phase would precision_read to check execution (1 call)
- Rejected because: doubles call count (2 -> 4), plan already in conversation text, verify redundant with WRFC reviewer and exec validation in Apply

### 6. Deep Dive on Batch Engine — Critical Finding

**Batch_engine does NOT call precision_engine tools.** It has completely independent implementations:
- `fs.readFile`/`fs.writeFile` instead of precision_read/precision_write
- `child_process.exec` instead of precision_exec
- `rg` via shell instead of precision_grep
- `glob` npm package instead of precision_glob
- Simple regex for symbols instead of tree-sitter/TS compiler API

**Discovery phase is NOT implemented** — interface exists, handler returns empty array.

**What works:** basic file read/write/edit/delete/move, command exec, script exec, state management, validate (typecheck/lint/test/build)

**What doesn't work:** discovery as batch phase, precision_fetch (url), agent spawning (stub), LSP (stub), diagnostics (stub)

**Key implication:** The GPA documentation as written is inaccurate — it promises `batch({discovery: ..., operations: {read: [...]}})` but discovery silently does nothing.

**Source files:**
- Main handler: `plugins/goodvibes/tools/implementations/batch-engine/src/handlers/batch.ts` (2172 lines)
- Operation interfaces: `plugins/goodvibes/tools/implementations/batch-engine/src/interfaces/operations/` (read.ts, write.ts, exec.ts, results.ts)
- Routing: `executeOperationByType()` function (line 756-817)
- Phase order: `PHASE_ORDER` in batch-tool.ts line 14

## Files Created/Modified

| File | Status | Purpose |
|------|--------|---------|
| `batch-prompt.md` | Created | Batch engine reference doc (~800 tokens) — needs update after decision |
| `gpa-prompt.md` | Created | GPA loop doc to replace DPB — needs update after decision |
| `dpb-prompt.md` | Created (deletable) | Intermediate draft, superseded by gpa-prompt.md |
| `MEMORY.md` | Updated | Added "TaskOutput & Main Conversation" section |

## Decision Needed: Fork in the Road

**Option A: Upgrade batch_engine** to delegate to precision_engine tools instead of reimplementing. Makes batch a true orchestration layer. Documentation becomes accurate.

**Option B: Document batch as-is** — simpler independent tool with transaction/rollback but without precision_engine features. GPA uses `discover` + `batch(read+write+edit+exec)` = 2 calls.

**Option C: Hybrid** — implement discovery phase in batch (interface already exists, just needs handler case), have batch delegate to precision_engine for operations. Biggest bang for buck.

## Lessons Learned (Noted in MEMORY.md)

- **TaskOutput must be non-blocking** — blocking the main conversation kills collaboration value
- **TaskOutput is usually unnecessary** — agents notify on completion automatically
- **Haiku needs higher max_turns for broad exploration** — 25 wasn't enough, it was still searching at the end
- **Always verify tool capabilities before documenting them** — we wrote docs for features that don't work

## To Resume

1. Decide on Option A, B, or C above
2. If upgrading (A or C): plan the batch_engine changes
3. Update gpa-prompt.md and batch-prompt.md to match reality
4. Review updated docs
5. Integrate into actual prompt chain (replace DISCOVER-PLAN-BATCH.md, update SUBAGENT-PROTOCOL.md, PRECISION-MASTERY.md, etc.)
6. Delete dpb-prompt.md