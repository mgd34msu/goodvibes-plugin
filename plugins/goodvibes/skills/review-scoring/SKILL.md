---
name: review-scoring
description: The refutation-based review rubric used by the refutation-reviewer agent and the Write-Review-Fix-Confirm (WRFC) workflow template. A defect list with severity, not a single pass/fail score. Load when reviewing a change or deciding whether a review's findings clear the bar to merge.
---

# review-scoring

v1's review rubric was a single scalar score (0-10, threshold 9.9) computed by an automated
runtime daemon. That daemon is cut for v2 (no standing usage justified keeping a background
process for it) and the scalar-score design itself didn't survive review: a single number hides
which specific claims were checked and which weren't. v2's rubric is a **defect list with
severity**, produced by a human-in-the-loop review (the refutation-reviewer agent, or you
reviewing your own or another agent's work). This skill is that rubric.

## The rubric

A review is not "does this look right." It's "what would prove this wrong, and did I check for
it." For the change under review:

1. **List the claims.** What does the implementer say the change does? (Handles the empty-input
   case. Covered by a test. Matches the existing error-handling pattern. Doesn't leak the new
   field to unauthorized users.)

2. **Try to falsify each one.** For each claim, find the concrete input, state, or code path that
   would make it false. Actually trace it or run it, don't just judge plausibility.

3. **Record what survived and what didn't**, each with:
   - **File/line.** Where the defect is, precisely.
   - **Failure scenario.** The concrete input/state that triggers wrong output, a crash, or
     data loss. "This looks fragile" is not a failure scenario; "calling this with an empty
     array throws because `arr[0]` is accessed unconditionally" is.
   - **Severity.** `critical` (data loss/security/crash on common paths), `high` (wrong
     behavior on a real path), `medium` (wrong behavior on an edge case), `low` (style,
     maintainability, non-functional).
   - **Verdict.** `CONFIRMED` (you reproduced it or traced it definitively) or `PLAUSIBLE`
     (strong reasoning, not independently verified). Never present a `PLAUSIBLE` finding as if
     it were `CONFIRMED`.

## Grounded checks come first

Before opinion-based review, run what can actually be run: typecheck, the relevant tests, a
manual exercise of the changed behavior. A defect a test or typecheck catches outranks a defect
found by reading. Cite the tool output, don't restate an opinion a machine already settled.

## The merge gate

There is no fixed numeric threshold. The gate is: **zero `CONFIRMED critical`/`high` findings**
remain unaddressed. `PLAUSIBLE` findings and `low`/`medium` findings are judgment calls for the
orchestrator/user. Surface them, don't silently drop them, but don't block on them
unconditionally either.

## Fix loop discipline

When a review finds defects and the engineer fixes them, the FIX gets reviewed again before
confirming. The file version of the "final fix ships unreviewed" off-by-one bug is a known trap:
always review the version of the code that's actually about to ship, not the version that was
reviewed two edits ago.
