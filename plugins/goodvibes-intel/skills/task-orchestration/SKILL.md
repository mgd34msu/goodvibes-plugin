---
name: task-orchestration
description: Decomposing work into parallel subagent tasks using native Workflow/Task tooling and the Write-Review-Fix-Confirm (WRFC) template — no background daemon, no runtime engine. Load when planning how to split work across multiple agents.
---

# task-orchestration

v1's orchestration text predates native multi-agent workflow support and was written around a
bespoke runtime engine (a background daemon coordinating agents via IPC, directives, and a
phase-machine). That daemon is cut for v2 — the deep review found no standing usage that
justified keeping a background process running per session, and native Task/Workflow tooling
already covers the observed needs. This skill is the rebuild: orchestration using what the
platform gives you directly, plus the WRFC template as a pattern, not infrastructure.

## Decomposing work

Break a task into steps where each step:
- Has a single agent type responsible for it (engineer, tester, refutation-reviewer, architect).
- Has an explicit "done" condition, not a vague direction ("implement the API" is not a step;
  "implement POST /api/posts per the spec architect produced, with the validation and error
  cases it lists" is).
- States its real dependencies — which steps must finish first, and what output they hand off.

Independent steps (no shared dependency) can run as parallel Task-tool calls in the same turn.
Dependent steps run sequentially, with each agent's output feeding the next agent's task
description directly — don't route it through a shared mutable file unless the next agent
actually needs to read that file itself.

## The WRFC pattern: Write → Review → Fix → Confirm

For any change worth reviewing before it ships:

1. **Write** — the engineer agent implements the change.
2. **Review** — the refutation-reviewer agent reviews the actual diff (see the `review-scoring`
   skill for the rubric: a defect list with severity, not a scalar score).
3. **Fix** — if the review found `CONFIRMED critical`/`high` defects, the engineer addresses
   them. Cap this at a small, explicit number of iterations (2-3) — an unbounded fix loop is a
   sign the task needs re-scoping, not more iterations.
4. **Confirm** — the FIX gets reviewed too, not assumed correct. Only after a fix iteration
   passes review (or the loop is explicitly capped and escalated to the user) is the change done.

This is a workflow *pattern* you run in-band as the orchestrator — spawning the engineer, then
the reviewer, then (conditionally) another engineer pass, then a final reviewer pass — using
native Task calls. It needs no daemon, no directive-delivery IPC, and no phase-machine state
file: the orchestrating session's own turn sequence *is* the state machine.

`/goodvibes-intel:codebase-review` is the packaged entry point for this pattern applied to a
whole diff/PR — see that command for the concrete workflow.

## When not to use the full loop

A one-line typo fix or a change with no meaningful failure surface doesn't need a dedicated
review agent — use judgment. WRFC earns its cost on changes where "did this actually work"
is a real question, not on everything unconditionally (v1's automatic-review-on-every-agent
behavior was one of the field-identified sources of wasted review cycles on read-only work).
