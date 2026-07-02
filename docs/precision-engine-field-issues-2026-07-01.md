# Precision Engine — Field Issues Report

Date: 2026-07-01
Source: live orchestration session on goodvibes-tui (multi-agent panel remediation running worktree-per-agent implementation waves). Every issue below was hit in real work by the orchestrator or by engineer subagents, against the precision-engine MCP server shipped in the goodvibes plugin. Cross-references: goodvibes-tui/.goodvibes/memory/failures.json (fail_20260701_wo003_precision_cwd) and .goodvibes/logs/errors.md.

## Summary

| # | Severity | Tool(s) | Issue |
|---|----------|---------|-------|
| 1 | CRITICAL | precision_read, precision_edit, precision_write, precision_grep | No working-directory concept; relative paths resolve against the MCP server process cwd, causing silent cross-tree writes when working in git worktrees |
| 2 | HIGH | precision_grep | Silent truncation below the declared caps (files_only / count_only modes) |
| 3 | MEDIUM | precision_read | Batch entries for the same path are deduplicated; distinct range reads of one file are dropped |
| 4 | MEDIUM | precision_read | Cache hit returns a stub with no content even when a specific lines/range extract was requested |
| 5 | MEDIUM | precision_exec | verbosity=minimal omits stdout entirely, even for tiny outputs |
| 6 | LOW | precision_read | token_budget pagination returns the same data twice (content string AND lines array), roughly doubling token cost |
| 7 | LOW | precision_edit | Atomic rollback: rolled-back edits still report status=applied, and the envelope reports success=true |

---

## Issue 1 — File tools have no working-directory parameter (CRITICAL)

**Affected:** precision_read, precision_edit, precision_write, precision_grep.
**Not affected:** precision_exec (has per-call working_dir plus a persistent session cwd), precision_glob and discover (have base_path).

**Observed:** An engineer subagent assigned to an isolated git worktree (goodvibes-tui/.claude/worktrees/wf_b7a692b4-fc3-2) passed relative paths to precision_edit and precision_write. Every call reported success, but the edits landed in the MAIN checkout (/home/buzzkill/Projects/goodvibes-tui), not the worktree. precision_exec in the same session correctly tracked the worktree after an explicit working_dir arg, which made the divergence invisible until the agent ran git status in the worktree and found zero changes.

**Why it is critical:** it breaks isolation silently. Two agents in separate worktrees both writing relative paths will race on the same main checkout while believing they are isolated. In this session the agent caught it, reverted the stray main-checkout edits with git checkout --, and re-applied everything with absolute paths — but only because it thought to verify with git status.

**Suggested fixes (any subset helps):**
1. Add a base_path / working_dir parameter to all four tools, matching precision_glob and discover.
2. Have the four file tools default their path resolution to the persistent precision_exec session cwd when one has been set, so a single working_dir declaration governs the whole session.
3. Always echo the RESOLVED absolute path for every file in every response (read, edit, write, grep). Callers can then detect mis-resolution immediately instead of after a no-op git status.
4. Optional hardening: when a relative path is received and the server cwd differs from the exec session cwd, emit a warning field in the response.

**Current workaround (documented in failures.json):** always pass fully qualified absolute paths inside worktrees, and verify with git status --porcelain in the intended tree right after the first write.

---

## Issue 2 — precision_grep silently truncates below declared caps (HIGH)

**Observed (two occurrences by an engineer subagent):**
1. A registry-count grep in count_only mode returned a count capped at 35 even though no cap near 35 was requested; re-issuing with explicit higher max_per_item / max_total_matches produced the correct larger count.
2. A files_only query returned exactly 10 files with no truncation indicator, while the documented default for max_results is 100; the true match set was larger.

**Why it matters:** grep results feed coverage decisions. A silently capped result reads as covered everything when it did not. The agent only caught the first case because the number contradicted a manual count.

**Suggested fixes:**
1. Audit cap application in count_only and files_only paths (per-file cap appears to leak into the file-count and total-count paths).
2. Whenever ANY cap trims output, set truncated=true and include effective_caps {max_results, max_per_item, max_total_matches} in the response, in every output format including count_only.

---

## Issue 3 — Same-path batch entries collapse to one result (MEDIUM)

**Observed:** A batch read with two entries for the SAME file but different ranges:

    files: [
      { path: X, extract: lines, range: {start: 20, end: 30} },
      { path: X, extract: lines, range: {start: 86, end: 94} }
    ]

returned a single result containing only the SECOND range. The summary still claimed files_read: 2, so nothing signals that the first range was dropped.

**Suggested fix:** key batch results by entry index (or path+range), not by path alone; a repeated path with different range/extract is a legitimate and common pattern for reading two regions of a large file in one call.

---

## Issue 4 — Cache hit returns a stub instead of the requested content (MEDIUM)

**Observed:** After a file had been read earlier in the session, a later precision_read for a specific line range returned a cache stub — status: unchanged, read_count, tokens_saved, hint: use force true — with NO lines at all. The requested data only arrived after a second call with force: true, costing an extra round trip and making the first call pure overhead.

**Suggested fix:** on a cache hit, serve the requested extract/range FROM the cache (that is what a cache is for) and mark it cache_hit: true. Return a content-free stub only for an explicit cache-probe mode. As-is, callers must defensively add force: true, which defeats the cache entirely.

---

## Issue 5 — precision_exec minimal verbosity drops stdout (MEDIUM)

**Observed:** a trivial command whose entire purpose is its output —

    date +%Y%m%d_%H%M%S

run with verbosity: minimal returned success, exit_code 0, duration — and no stdout field. The identical command had to be re-run at verbosity: standard to obtain 15 characters of output.

**Suggested fix:** minimal should still include stdout/stderr up to a small cap (say 256 bytes each), or expose an explicit include_output flag that works at minimal. Minimal-but-no-output makes the recommended default verbosity unusable for any command whose result is its output.

---

## Issue 6 — Pagination duplicates payload (LOW)

**Observed:** precision_read with extract: content plus token_budget pagination returned BOTH a content string and a lines array carrying identical data for the same page. Measured ~7.6k tokens for a page whose content alone is ~3.8k. include_line_numbers: false did not suppress the lines array.

**Suggested fix:** one representation per response — content string when include_line_numbers is false, lines array when true. This halves the cost of paging through large files, which is exactly the case token_budget exists for.

---

## Issue 7 — Rollback status reporting is contradictory (LOW)

**Observed:** a two-file atomic precision_edit where the second edit had a stale find pattern: the transaction correctly rolled back both files, but the response showed the first edit as status: applied with only a hint string ([ROLLED BACK] Atomic transaction failed) revealing the truth, and the top-level envelope still said success: true with summary edits_applied: 1 in the per-edit block vs 0 in the summary.

**Suggested fix:** per-edit status should be rolled_back (a first-class enum value, not a hint string), and the envelope success should be false when an atomic transaction aborts. Machine consumers key off status and success; today they would conclude the first edit landed.

---

## Adjacent finding (NOT a precision-engine bug — for awareness)

The Claude Code Workflow tool worktree isolation snapshots the repository at workflow LAUNCH time, not at agent() call time. A later-phase agent inside the same workflow received a worktree based on a pre-integration commit even though the integration branch had advanced mid-workflow. Mitigation used: a mandatory step-0 git merge of the integration branch inside every worktree plus base verification. Mentioned here only because it compounds Issue 1: a stale worktree plus relative-path resolution to the main checkout produces especially confusing failure modes.

---

## Issue 8 — precision_edit rejects calls carrying both plain and base64 fields (LOW, added 2026-07-02)

**Observed (two independent agents, Phase 0.5 session):** an edits[] entry containing both `find`/`replace` and `find_base64`/`replace_base64` is rejected outright, even though the schema documents the plain fields as required and the base64 fields as the escape hatch for content with single quotes/backticks. Callers following the schema (always include the required fields, add base64 when needed) hit a validation error; the working pattern is to send ONLY the base64 fields, which contradicts the documented requirement.

**Suggested fix:** treat the pairs as mutually exclusive alternates in validation (exactly one of find/find_base64), update the schema's required-fields declaration to match, and when both arrive prefer base64 with a warning instead of rejecting.

---

## What worked well (keep these)

- Batched edits with atomic transactions (when the find patterns are fresh) — the rollback itself behaved correctly in Issue 7; only the reporting is wrong.
- extract modes (outline/symbols/lines) and token_budget pagination made a 288k-char artifact readable by many agents cheaply.
- base_path on precision_glob / discover worked exactly as expected — which is the template for fixing Issue 1.
- expect assertions on precision_exec caught gate regressions early across dozens of agent runs.
