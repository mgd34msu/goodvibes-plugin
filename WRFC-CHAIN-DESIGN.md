# WRFC Chain Architecture Design

## Date: 2026-02-23
## Status: V1 Complete — All decisions implemented, all questions resolved. Non-WRFC chains deferred to v2.

---

## Problem Statement

The runtime engine has all WRFC infrastructure (triggers, handlers, directive queue, workflow engine) but the chain doesn't work end-to-end because:
- No workflow is created when agents spawn
- No binding between agents and workflows
- Concurrent agent chains can't be distinguished
- Event data arrives null (no agent metadata flows through)
- Orchestrator doesn't know how to act on directives

---

## Decision 1: Workflow ID Convention

**Format:** `wrfc_{agent_id}`

- Deterministic — derived from the originating agent's ID
- Traceable — you can always find which agent started the chain
- No coordination needed at creation time
- Workflow IDs are NEVER modified by subsequent agents in the chain
- Only the first agent (the "originator") determines the workflow_id

## Decision 2: Agent-to-Workflow Binding

**The runtime engine maintains an `agent_id → workflow_id` mapping in memory.**

Flow:
1. `hook:agent:spawned` fires with `{agent_id, agent_type, prompt_text, ...}`
2. Runtime checks: does the event data contain a `workflow_id`?
   - **Yes** → this agent is part of an existing chain (reviewer/fixer). Bind `agent_id → workflow_id`.
   - **No** → this is a new chain originator. Create workflow `wrfc_{agent_id}`, bind it.
3. `hook:agent:completed` fires with `{agent_id, output, ...}`
4. Runtime looks up workflow by `agent_id` mapping → processes WRFC chain next
5. Enqueued directives include `workflow_id` for the orchestrator to pass through
6. Orchestrator passes `workflow_id` when spawning the next agent in the chain
7. Repeat from step 1

**Key principle:** Agents themselves have ZERO awareness of WRFC. They just do their work. All intelligence lives in the runtime engine + orchestrator directive protocol.

## Decision 3: All Agents Create Workflows

Every spawned agent gets a workflow — but not every workflow triggers a full WRFC review cycle.

**Pre-spawn judgment:** Before a workflow enters the review phase, the runtime evaluates whether the agent's work warrants review. If not, the workflow auto-completes after the agent finishes.

**Rule: Review everything by default.** Only auto-complete for a tight, conservative whitelist of agent types known to be non-work (e.g., explore, bash-only). No orchestrator input required — fully programmatic.

- False negatives (reviewing something that didn't need it) = harmless, just extra review
- False positives (skipping review on real work) = dangerous, must avoid
- Bias: always toward "review everything"
- Whitelist is tuned over time based on log data

The `hook:agent:completed` handler checks agent_type against the whitelist. If whitelisted → auto-complete. Otherwise → WRFC review cycle.

## Decision 4: Directive Protocol (Structured)

Directives must be structured data the orchestrator can parse mechanically, not prose.

The orchestrator should be able to act on directives without interpretation — just read the fields and execute.

Format: `<gv>` JSON tags. Implemented in `4e8df933`.

**Runtime → Orchestrator:**
```
<gv>{"action":"spawn","wid":"wrfc_abc","type":"goodvibes:reviewer","task":"..."}</gv>
<gv>{"action":"complete","wid":"wrfc_abc"}</gv>
<gv>{"action":"escalate","wid":"wrfc_abc","reason":"..."}</gv>
```

**Agent → Runtime:**
```
<gv>{"score":9.5,"pass":true}</gv>          (reviewer)
<gv>{"files":["a.ts","b.ts"]}</gv>           (engineer/deployer/integrators)
<gv>{"pass":true,"count":45}</gv>             (tester)
```

Fields kept minimal — only what the consumer needs to act mechanically.

## Decision 5: Orchestrator System Prompt Changes [IMPLEMENTED]

Applied to `plugins/goodvibes/output-styles/justvibes.md` (commit c5564d70):
- YAML config: `wrfc_binding` → `wrfc_mode: directive_driven`
- Execution: Runtime engine manages WRFC via `<gv>` directives
- Recovery: `directive_driven` replaces `fix_review_loop`
- Core Principle #3: Execute `<gv>` directives (was: maintain WRFC loops)
- Core Principle #5: Runtime decides when to review (was: manually spawn reviewer)
- WRFC Loop: Full replacement with directive-driven approach (spawn/complete/escalate)
- Prohibited Actions: "Ignoring directives" + "Manually spawning reviewers" replace old entries

## Decision 6: Beyond WRFC

The chain architecture should support OTHER chain types, not just WRFC:
- Fix loops
- Test-then-fix loops
- Review-only chains
- Custom chains

The workflow engine already supports multiple workflow definitions. The chain binding (agent_id → workflow_id) is generic and works for any chain type.

## Decision 7: Never Edit Dist Files

**CRITICAL RULE:** Never edit dist files or files in `~/.claude/` plugin cache.
- Only update source code for the plugin
- Dist files are overwritten every time the user reinstalls
- Hook dist files are build artifacts, not source of truth

---

## Open Questions

1. ~~**Event data null:**~~ RESOLVED — field name mismatch (`last_assistant_message` vs `task_output`). Fixed in commit 89dddcf5.

2. ~~**Auto-complete criteria:**~~ RESOLVED — Decision 3 whitelist: Explore, Plan, Bash, general-purpose auto-complete. All others enter WRFC. Implemented in commit 4de4c5e1.

3. ~~**Review score trigger:**~~ RESOLVED — `<gv>` tag parser (`gv-tag-parser.ts`) extracts structured JSON from agent output. `extractReviewScore()` tries `<gv>` tag first, falls back to legacy `SCORE: X/10` regex. Score fed to `handleReviewResult()` which writes to workflow context and fires `wrfc:review_completed`. Implemented in commit c3cd65ff.

4. ~~**Multiple chain types:**~~ DEFERRED TO V2 — Only WRFC loop implemented for v1. Fix loop, test-then-fix, review-only, and custom chains deferred until WRFC is validated end-to-end. Builtin triggers 1-2 reference `fix_loop` definition but are inert (no `build:failed`/`test:failed` events emitted yet).

5. ~~**State machine transitions:**~~ RESOLVED — All WRFC transitions fully wired in v1:
   - REVIEWING → FIXING: `handleReviewResult` writes `review_score` to context, fires `wrfc:review_completed`, guard evaluates `score < min`
   - FIXING → REVIEWING: `handleFixResult` increments `fix_attempts`, fires `wrfc:fix_completed`, guard evaluates `attempts < max`
   - FIXING → ESCALATED: same event, guard `attempts >= max`
   - REVIEWING → COMPLETE: same event, guard `score >= min`
   - Non-WRFC chain transitions deferred to v2.
