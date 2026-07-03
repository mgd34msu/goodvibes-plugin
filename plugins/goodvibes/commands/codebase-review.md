---
description: |
  Entry point for the Write-Review-Fix-Confirm (WRFC) workflow template: reviews the current diff
  with grounded checks first and a refutation-based defect list, fixes confirmed high/critical
  findings, and re-reviews the fix before reporting.
argument-hint: "[base-branch-or-ref] (default: uncommitted working-tree changes)"
allowed-tools:
  - Bash
  - Task
---

# Codebase Review (WRFC)

Runs the Write-Review-Fix-Confirm loop against an actual diff. This is the productized version
of the deep-review architecture: diff-triggered (never runs against unchanged code, never
triggers off agent type), grounded checks weighted above model opinion, refutation-based
findings instead of a single approve/reject score. See the `task-orchestration` skill for the
WRFC pattern and the `review-scoring` skill for the rubric this command's reviewer step uses.

## Usage

```
/goodvibes:codebase-review              # review uncommitted working-tree changes
/goodvibes:codebase-review main         # review the diff against `main`
```

## Instructions

### Step 1 — Determine the diff (diff-triggered, not always-on)

```bash
# Uncommitted changes (default):
git diff --stat && git diff

# Against a base ref, if $ARGUMENTS names one:
git diff --stat "$ARGUMENTS"... && git diff "$ARGUMENTS"...
```

If the diff is empty, stop here and say so plainly:
```
No changes to review (diff against <target> is empty).
```
Do not spawn a reviewer over zero changes — that produces a meaningless 10/10-by-definition
"pass" and wastes a review cycle, which is exactly the failure mode this command is designed to
avoid.

### Step 2 — Grounded checks first

Before any model-opinion review, run whatever the project actually has configured — read
`package.json` `scripts` (or the equivalent for the project's language/toolchain) rather than
assuming `npm run typecheck` exists. Typical set, run only what's present:
```bash
npm run typecheck --if-present
npm run lint --if-present
npm test --if-present -- --run
```
Capture the real pass/fail output. These results outrank any subjective finding in the review
step below — a test failure or a type error is not a "finding to weigh," it's a fact.

### Step 3 — Refutation review

Spawn the `refutation-reviewer` agent (Task tool) with:
- The diff from Step 1 (or a summary + `code_grep`/`code_read` pointers if it's large — don't
  truncate silently, say what was omitted).
- The grounded-check results from Step 2.
- Instruction: apply the `review-scoring` rubric — a ranked defect list with severity and a
  CONFIRMED/PLAUSIBLE verdict per finding, not a scalar score.

### Step 4 — Fix confirmed high/critical findings

If the review reports any `CONFIRMED` finding at `critical` or `high` severity, spawn the
`engineer` agent (Task tool) with the specific findings to address — not the whole diff again,
just what needs fixing and why. Cap this at 2 fix iterations; if issues remain after 2 rounds,
stop and escalate to the user rather than looping indefinitely.

### Step 5 — Confirm (re-review the fix, not the original)

After a fix iteration, repeat Step 2 (grounded checks) and Step 3 (refutation review) against
the CURRENT diff — not the version that was reviewed before the fix. This is the deliberate fix
for the "final fix ships unreviewed" off-by-one bug the WRFC redesign specifically corrected.

### Step 6 — Report

```
## Codebase Review — <target>

### Grounded checks
- typecheck: pass/fail (summary)
- lint: pass/fail (summary)
- tests: pass/fail (summary)

### Findings (most severe first)
[the refutation-reviewer's defect list, verbatim — file/line, failure scenario, severity, verdict]

### Fix iterations
[what was fixed, what re-review found, or "no critical/high findings — nothing to fix"]

### Outstanding
[anything not addressed and why: capped iterations, PLAUSIBLE-only findings left for the user's judgment, etc.]
```

## Arguments

$ARGUMENTS
