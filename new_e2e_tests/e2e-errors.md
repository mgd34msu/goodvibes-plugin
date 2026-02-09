# E2E Test Errors & Failures Report

**Date**: 2026-02-09
**Total Tests**: 129
**Passed**: 123
**Failed**: 6
**Pass Rate**: 95.3%

---

## Summary by Suite

| Suite | Tool | Pass | Fail | Total |
|-------|------|------|------|-------|
| 01 | precision_read | 14 | 1 | 15 |
| 02 | precision_write | 15 | 0 | 15 |
| 03 | precision_edit | 13 | 2 | 15 |
| 04 | precision_exec | 12 | 0 | 12 |
| 05 | precision_glob | 15 | 0 | 15 |
| 06 | precision_grep | 15 | 0 | 15 |
| 07 | precision_symbols | 11 | 1 | 12 |
| 08 | discover | 9 | 1 | 10 |
| 09 | cross-tool stress | 9 | 1 | 10 |
| 10 | edge cases | 10 | 0 | 10 |
| **Total** | | **123** | **6** | **129** |

---

## Previously Fixed (Plugin Update 2026-02-09)

These failures were resolved after the plugin update:

- **03.10** — `in_function` hint crashed with `Cannot read properties of undefined (reading 'includes')`. Now passes.
- **07.01** — Workspace symbol search for "Dog" timed out at 60s. Now passes (found 100 symbols).
- **09.06** — Atomic edit + read back crashed with same undefined `.includes()`. Now passes.

---

## Remaining Failure Details

### 1. Test 01.06 — precision_read: count_only verbosity still returns content

**What I was doing**: Testing that `verbosity: 'count_only'` suppresses file content and returns only metadata.

**What I was trying to do**: Call `precision_read` with `verbosity: 'count_only'` and verify the response contains no `content` field — only `exists`, `line_count`, `size_bytes`.

**What happened**: The response still includes the full `content` field (1333 chars). Response keys: `exists, content, line_count, encoding, context, cache_version`. The `size_bytes` field is also missing.

**Recommended fix**: In `src/handlers/precision-read.ts`, after the per-file result object is built, add verbosity-based field stripping:
- `count_only`: Only keep `exists`, `line_count`, `size_bytes`. Delete `content`, `encoding`, `context`, `cache_version`, `outline`, `symbols`.
- `minimal`: Keep core fields, omit `context` and `cache_version`.

**Severity**: P1 — count_only mode is useless for token savings if it returns full content.

---

### 2. Test 03.09 — precision_edit: near_line hint doesn't target correctly

**What I was doing**: Testing that the `hints.near_line` parameter correctly targets a specific occurrence of duplicate text.

**What I was trying to do**: Create a file with the same string appearing on two different lines, use `near_line` hint to target only the second occurrence, and verify only that occurrence was changed.

**What happened**: The first occurrence was also changed. The `near_line` hint either isn't being used for disambiguation or isn't restricting the match to the nearest occurrence.

**Recommended fix**: In `precision-edit.ts`, the `near_line` hint should sort candidate matches by distance from the target line and select the closest one, not just use it as a tiebreaker.

**Severity**: P1 — near_line hint is a core feature for editing files with repeated patterns.

---

### 3. Test 03.14 — precision_edit: whitespace-insensitive matching broken

**What I was doing**: Testing that `match.whitespace_sensitive: false` allows matching text with different whitespace.

**What I was trying to do**: Find `a  b` (two spaces) and match it against `a b` (one space) in the file, then replace with `X`.

**What happened**: The replacement produced `a b c` instead of `X c`. The whitespace-insensitive matching found the right location but replaced incorrectly — or the match was off by whitespace characters.

**Recommended fix**: In the fuzzy/whitespace-insensitive match path, ensure the replacement covers the exact matched range in the original text, not the normalized version. The match boundaries in the original content need to encompass all the whitespace.

**Severity**: P1 — whitespace-insensitive mode is unreliable.

---

### 4. Test 07.02 — precision_symbols: workspace mode timeout (IAnimal interface)

**What I was doing**: Testing workspace-wide symbol search filtering by kind (interface) for "IAnimal".

**What I was trying to do**: Call `precision_symbols` in `workspace` mode with `query: 'IAnimal'` and `kinds: ['interface']`.

**What happened**: Timeout after 60 seconds. Note: 07.01 (workspace search for "Dog" without kind filter) now passes after the plugin update, but adding `kinds: ['interface']` filter causes the timeout.

**Recommended fix**: The `kinds` filter in workspace mode may be triggering a different/slower code path. Investigate whether kind filtering is applied post-search (slowing full scan) vs pre-search (limiting scope).

**Severity**: P1 — workspace symbol search with kind filtering is unusable.

---

### 5. Test 08.03 — discover: symbols query timeout

**What I was doing**: Testing `discover` tool with a single symbols query.

**What I was trying to do**: Call `discover` with a symbols-type query for "Dog" class.

**What happened**: Timeout after 60 seconds. The discover tool delegates to workspace symbol search, inheriting the timeout issue. Note: 08.07 (mixed batch with 1 symbols query) passes, suggesting the issue is specific to standalone symbol queries through discover.

**Recommended fix**: Check if discover's symbol query handler has a different timeout or code path than precision_symbols direct calls. 07.01 passes but 08.03 doesn't for the same "Dog" search.

**Severity**: P1 — discover symbols queries are unreliable.

---

### 6. Test 09.07 — cross-tool: glob has_content filter returns wrong count

**What I was doing**: Stress testing glob with content filtering: write 20 files with varying content, use `has_content` filter to find specific files.

**What I was trying to do**: Write 20 files where 6 contain a specific marker string, then use `precision_glob` with `filters.has_content` regex to find only those 6 files.

**What happened**: Expected 6 filtered files but found only 1. The `has_content` filter is not scanning all files or has path resolution issues.

**Recommended fix**: Check the `has_content` path normalization in `precision-glob.ts`. Known bug pattern (from .goodvibes memory): ripgrep returns absolute OR relative paths — need to use `path.isAbsolute()` before `path.resolve()`. This may be a regression or an edge case with temp directory paths.

**Severity**: P1 — content filtering returns incomplete results.

---

## Bug Categories

### Timeouts (P1) — 2 failures
- 07.02: Workspace symbol search with kind filter times out
- 08.03: Discover symbols query times out

### Incorrect Behavior (P1) — 4 failures
- 01.06: count_only verbosity doesn't suppress content
- 03.09: near_line hint doesn't disambiguate correctly
- 03.14: Whitespace-insensitive matching produces wrong replacements
- 09.07: has_content glob filter returns incomplete results

---

## Tools with Zero Failures

- precision_write (15/15)
- precision_exec (12/12)
- precision_glob (15/15)
- precision_grep (15/15)
- edge cases (10/10)
