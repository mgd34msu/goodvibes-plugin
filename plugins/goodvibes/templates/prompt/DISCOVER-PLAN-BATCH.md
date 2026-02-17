## DISCOVER-PLAN-BATCH (Auto-loaded for all subagents)

MANDATORY execution pattern. 3 tool calls per cycle maximum.

## THE EXACT WORKFLOW

```
0. LOAD SKILLS (once, before any DPB cycle) — NOT part of DPB itself
1. D — DISCOVER (1 call): Single discover call, ALL queries batched, output: files_only or locations
2. P — PLAN (0 calls): Cognitive only — plan exact input batch call
3. B — BATCH INPUT (1 call): Single precision_read/precision_grep/batch — everything batched
4. P — PLAN (0 calls): Cognitive only — plan exact output batch call
5. B — BATCH OUTPUT (1 call): Single precision_write/precision_edit/batch — everything batched
6. LOOP — Back to D if needed
```

## CALL BUDGET PER CYCLE

| Phase | Tool Calls | Type |
|-------|-----------|------|
| **D** (Discover) | 1 | `discover` |
| **P** (Plan) | 0 | Cognitive |
| **B** (Batch Input) | 1 | `precision_*` |
| **P** (Plan) | 0 | Cognitive |
| **B** (Batch Output) | 1 | `precision_*` |
| **TOTAL** | **3** | |

## KEY RULES (NON-NEGOTIABLE)

1. **`discover` batches ALL discovery queries into 1 call** — NEVER use separate `precision_glob`, `precision_grep` for discovery
2. **Plan steps produce ZERO tool calls** — they are cognitive (agent thinks in text)
3. **Batch input = 1 call** — use internal batching (`files` array, `queries` array)
4. **Batch output = 1 call** — use internal batching (`files` array, `edits` array)
5. **NEVER make sequential calls of the same tool type** — batch them
6. **ToolSearch is NOT part of DPB** — load tools once at start

## Phase 1: DISCOVER

Prevents blind implementation — understand what exists before writing anything.

**Query types:**
- **glob** — Find files by path patterns ("what files exist here?")
- **grep** — Find files containing patterns ("where is this used?")
- **symbols** — Find exported functions/types/classes ("what can I import?")
- **structural** — Find AST patterns ("where is console.log called?")

**Verbosity:** Use `files_only` or `locations`. Use `count_only` first for large scopes.

**Skip discovery only when:**
- Task is 1-2 files you already have full context for
- Task has zero file I/O (pure analysis/reporting)

**Always check memory before implementing:**
- `failures.json` — Has this been attempted before? What failed?
- `patterns.json` — Are there proven approaches for this type of work?
- `decisions.json` — What architectural constraints apply?

## Phase 2: PLAN

Prevents execution churn — plan exactly what will be batched before touching tools.

**Plan checklist (list exact paths, not vague descriptions):**
- Files to create: full paths + 1-line description each
- Files to modify: full paths + specific change each
- Files to read (full content needed): full paths + why
- Commands to run: cmd + expected outcome
- Dependencies: which operations block which
- Batch opportunities: which steps collapse into 1 call

**Dependency labeling pattern:**
```
Phase 1 (Non-blocking — run in parallel): create types.ts, auth.ts, api.ts
Phase 2 (Blocks Phase 3 — depends on Phase 1): create useAuth.ts, useApi.ts
Phase 3 (Blocked by Phase 2): create index.ts barrel export
Phase 4 (Blocked by Phase 3): run typecheck + lint
```

## Phase 3: BATCH

Minimize tool calls by grouping operations. Ranked by efficiency:

1. **batch_engine wrapping precision_engine** (best) — Single call, atomic transaction, rollback support, all operation types in one
2. **precision_engine built-in batching** (good) — Multiple files/edits/commands in one precision tool call
3. **Sequential precision_engine** (acceptable only when dependent) — read→edit→verify chains where output determines next input

**Failure handling:**
- `batch_engine` atomic mode: all ops roll back on any failure
- `batch_engine` partial mode: successful ops kept, failed ops reported
- `precision_engine`: successful ops complete, failures reported per file/edit
- Fix only the failed operations — never re-run successful ones
- If root cause was bad assumptions, LOOP back to DISCOVER

**Post-execution validation:**
```yaml
precision_exec:
  commands:
    - cmd: "npm run typecheck"
      expect: { exit_code: 0 }
    - cmd: "npm run lint"
      expect: { exit_code: 0 }
  verbosity: minimal
```

## LOOP: When to Return to Discovery

- **Scope changed** — discovery reveals situation differs from expected (e.g., feature already exists)
- **Results don't match plan** — execution output differs from expected (e.g., typecheck fails with import error)
- **New information** — task requirements clarified mid-execution (e.g., must integrate with existing system)

When looping, re-discover with refined queries targeting the new information.

## Common Mistakes

- Don't write vague plans — always list exact file paths, not "add authentication"
- Don't plan without identifying batch opportunities — missed batching = 10x token waste
- Don't skip dependency analysis — parallel when dependent causes errors
- Don't re-run successful operations after partial failure — fix only what failed
- Don't skip memory checks — repeats past mistakes and violates architectural decisions
- Don't use separate precision_glob/precision_grep for discovery — always use `discover`

## Examples and Reference

For a complete worked example of the DPB loop, anti-patterns summary, checklists, and implementation tips, see:

**[references/examples-and-checklists.md](references/examples-and-checklists.md)**

---
