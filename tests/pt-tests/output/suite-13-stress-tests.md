# Suite 13: Stress Tests - E2E Results

**Test Runner:** Precision Engine MCP Tools
**Date:** 2026-02-08
**Total Tests:** 10
**Status:** 8 PASS, 1 FAIL, 1 PARTIAL

---

## 13.01 - Large file read with pagination ❌ FAIL

**Steps:**
1. Read large-file.ts with token_budget: 1000, page: 1
2. Read large-file.ts with token_budget: 1000, page: 2

**Expected:** Page 1 and Page 2 return DIFFERENT content. Check total_pages > 1 on page 1.

**Result:** FAIL

**Details:**
- Page 1: Returned all 2171 lines despite budget being 1000 tokens
- Page 2: Same as page 1, with warning "Requested page 2 exceeds total pages (1)"
- Pagination metadata shows: `total_pages: 1`, `tokens_used: 15701`, `budget_exceeded: true`
- **Bug:** When token_budget is exceeded, tool should split content into multiple pages but returns everything in page 1

**Evidence:**
```json
{
  "pagination": {
    "page": 1,
    "total_pages": 1,
    "pending_files": [],
    "token_budget": 1000,
    "tokens_used": 15701,
    "budget_exceeded": true
  }
}
```

---

## 13.02 - Batch write 50 files ✅ PASS

**Steps:** Write 50 files (bulk-01.txt through bulk-50.txt) in ONE call

**Expected:** All 50 written

**Result:** PASS

**Details:**
- All 50 files written successfully
- Summary: `files_overwritten: 50, files_failed: 0`
- Total bytes: 600
- Execution time: 706ms

**Evidence:**
```json
{
  "summary": {
    "files_created": 0,
    "files_overwritten": 50,
    "files_failed": 0,
    "bytes_written": 600
  }
}
```

---

## 13.03 - Batch read 20 files ✅ PASS

**Steps:** Read 20 bulk files (bulk-01.txt through bulk-20.txt) with verbosity: count_only

**Expected:** All 20 succeed

**Result:** PASS

**Details:**
- All 20 files read successfully
- Summary: `files_read: 20, files_not_found: 0`
- Cache working correctly (all showed "unchanged" status)
- Total tokens used: 1356
- Execution time: 1ms

**Evidence:**
```json
{
  "summary": {
    "files_read": 20,
    "files_not_found": 0,
    "total_lines": 20,
    "truncated": false
  }
}
```

---

## 13.04 - Large grep (whole project) ✅ PASS

**Steps:** Grep for "export" pattern across entire project with output.format: count_only

**Expected:** Count returned, no timeout

**Result:** PASS

**Details:**
- Query completed successfully
- Found: 25 files, 100 matches (truncated at default limit)
- Execution time: 257ms
- No timeout or errors

**Evidence:**
```json
{
  "queries": {
    "q1": {
      "truncated": true,
      "file_count": 25,
      "match_count": 100,
      "tokens_used": 13
    }
  }
}
```

---

## 13.05 - Concurrent grep queries ✅ PASS

**Steps:** Execute 5 grep queries in parallel (class, function, interface, import, export)

**Expected:** All 5 succeed

**Result:** PASS

**Details:**
- All 5 queries executed in parallel successfully
- Query results:
  - q1 (class): 34 files, 100 matches
  - q2 (function): 25 files, 100 matches
  - q3 (interface): 28 files, 100 matches
  - q4 (import): 23 files, 100 matches
  - q5 (export): 24 files, 100 matches
- Total: 134 files, 500 matches
- Execution time: 1239ms
- Tokens used: 65

**Evidence:**
```json
{
  "summary": {
    "total_files": 134,
    "total_matches": 500,
    "truncated": true
  },
  "execution_ms": 1239
}
```

---

## 13.06 - Large edit batch ✅ PASS

**Steps:**
1. Write test file with content: "AAA BBB CCC DDD EEE"
2. Apply 5 edits sequentially: AAA→111, BBB→222, CCC→333, DDD→444, EEE→555

**Expected:** Final content is "111 222 333 444 555"

**Result:** PASS

**Details:**
- File created successfully
- All 5 edits applied sequentially
- Final content verified: "111 222 333 444 555"
- Atomic transaction with rollback_id provided
- Total execution time: 1ms

**Evidence:**
```json
{
  "summary": {
    "files_modified": 1,
    "edits_applied": 5,
    "edits_failed": 0
  },
  "rollback_id": "rb_1770610685207_291lqm"
}
```

Final content:
```
111 222 333 444 555
```

---

## 13.07 - Discover with 5+ queries ✅ PASS

**Steps:** Run discover with 5 queries: 2 greps, 2 globs, 1 grep

**Expected:** All 5 results keyed by ID

**Result:** PASS

**Details:**
- All 5 queries executed successfully
- Results properly keyed by query ID (g1, g2, g3, g4, g5)
- Query results:
  - g1 (grep "export"): 10 files
  - g2 (glob "**/*.ts"): 10 files
  - g3 (grep "class"): 8 files
  - g4 (glob "**/*.json"): 1 file
  - g5 (grep "function"): 9 files
- Execution time: 47ms

**Evidence:**
```json
{
  "total_queries": 5,
  "successful": 5,
  "failed": 0,
  "execution_ms": 47
}
```

---

## 13.08 - Exec parallel 10 commands ✅ PASS

**Steps:** Execute 10 "echo" commands in parallel

**Expected:** All 10 succeed

**Result:** PASS

**Details:**
- All 10 commands executed in parallel successfully
- Summary: `total: 10, succeeded: 10, failed: 0`
- Total duration: 373ms (includes parallel overhead)
- Execution time: 72ms

**Evidence:**
```json
{
  "summary": {
    "total": 10,
    "succeeded": 10,
    "failed": 0,
    "total_duration_ms": 373
  }
}
```

---

## 13.09 - Read with all extract modes ✅ PASS

**Steps:** Read sample-classes.ts with each extract mode: content, outline, symbols, ast, lines

**Expected:** All 5 return valid data

**Result:** PASS

**Details:**
- **content**: Returned full file with line numbers (619 tokens)
- **outline**: Returned hierarchical structure with 11 top-level symbols (327 tokens)
- **symbols**: Returned 27 symbols with line/column info (619 tokens)
- **ast**: Returned Abstract Syntax Tree with node kinds (527 tokens)
- **lines**: Returned array of 88 lines without line numbers (464 tokens)

All extract modes returned valid, properly structured data.

**Evidence:**
All 5 calls succeeded with different output structures:
- outline: 11 top-level items with children
- symbols: 27 symbols including IAnimal, IMovable, Dog, Cat, Color, Priority, Utils, Container, etc.
- ast: Full AST with InterfaceDeclaration, ClassDeclaration, FunctionDeclaration nodes
- lines: Raw array of 88 strings

---

## 13.10 - Token budget edge cases ⚠️ PARTIAL PASS

**Steps:** Read large-file.ts with token_budget: 10

**Expected:** Handles gracefully (returns minimal or page info)

**Result:** PARTIAL PASS

**Details:**
- Tool handled edge case without crashing
- Returned full content despite 10-token budget
- Pagination metadata shows awareness of budget violation:
  - `token_budget: 10`
  - `tokens_used: 15701`
  - `budget_exceeded: true`
  - `total_pages: 1`
- **Issue:** Should have returned minimal data or paginated properly
- Tool handled gracefully (no crash), but pagination logic failed

**Evidence:**
```json
{
  "pagination": {
    "page": 1,
    "total_pages": 1,
    "pending_files": [],
    "token_budget": 10,
    "tokens_used": 15701,
    "budget_exceeded": true
  }
}
```

---

## Summary

**Overall Status:** 8/10 PASS, 1 FAIL, 1 PARTIAL

### Passing Tests (8)
- 13.02: Batch write 50 files ✅
- 13.03: Batch read 20 files ✅
- 13.04: Large grep (whole project) ✅
- 13.05: Concurrent grep queries ✅
- 13.06: Large edit batch ✅
- 13.07: Discover with 5+ queries ✅
- 13.08: Exec parallel 10 commands ✅
- 13.09: Read with all extract modes ✅

### Failed Tests (1)
- 13.01: Large file read with pagination ❌
  - **Critical bug:** Pagination not working when token_budget is exceeded
  - Tool returns all content in page 1 despite budget_exceeded: true
  - Should split into multiple pages when budget is exceeded

### Partial Pass (1)
- 13.10: Token budget edge cases ⚠️
  - Handled gracefully (no crash)
  - But pagination logic failed (returned full content with 10-token budget)
  - Should return minimal data or proper page info

### Key Findings

1. **Pagination Bug:** The token_budget pagination feature is broken. When budget is exceeded, tool should:
   - Split content into multiple pages
   - Return only page 1 content on first call
   - Allow subsequent calls with page: 2, 3, etc.
   - Currently: Returns ALL content in page 1 regardless of budget

2. **Batch Operations:** All batch operations (write, read, grep, edit, exec, discover) work flawlessly
   - 50-file batch write: 706ms
   - 20-file batch read: 1ms (cached)
   - 5 concurrent greps: 1239ms
   - 5-edit transaction: 1ms

3. **Extract Modes:** All 5 extract modes (content, outline, symbols, ast, lines) function correctly
   - Each returns properly structured data
   - Token usage varies appropriately by mode

4. **Performance:** Excellent performance across all stress tests
   - Large project grep: 257ms
   - Parallel commands: 72ms
   - Discover 5 queries: 47ms

### Recommendations

1. **Fix pagination:** Implement proper content splitting when token_budget is exceeded
2. **Consider cache impact:** Test pagination with force: true to ensure non-cached behavior works
3. **Document limitations:** Clearly document that pagination currently doesn't enforce budget limits

---

**Test Execution Method:** All tests used actual MCP tool calls (no mocks or workarounds)
**Tools Used:** precision_read, precision_write, precision_edit, precision_grep, precision_exec, discover
