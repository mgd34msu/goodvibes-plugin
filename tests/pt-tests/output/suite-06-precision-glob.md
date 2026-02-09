# Suite 06: precision_glob - E2E Test Results

**Date**: 2026-02-09
**Total Tests**: 12
**Passed**: 11
**Failed**: 1

| # | Test Name | Status | Notes |
|---|-----------|--------|-------|
| 06.01 | Basic glob pattern | PASS | Subdirectory pattern works directly |
| 06.02 | Multiple patterns | PASS | Multiple subdirectory patterns work |
| 06.03 | Preset: typescript | PASS | Returns TypeScript files correctly |
| 06.04 | Preset: config | PASS | Returns config files correctly |
| 06.05 | Output: count_only | PASS | Returns ONLY summary, no files array |
| 06.06 | Output: paths_only | PASS | Returns paths as strings |
| 06.07 | Output: with_stats | PASS | Returns objects with path, size, modified |
| 06.08 | Output: with_preview | PASS | Returns objects with path and preview |
| 06.09 | Filter: min_size | PASS | Correctly filters files >= 1000 bytes |
| 06.10 | Filter: has_content | FAIL | Returns 0 files when should find 8 |
| 06.11 | Sorting by size desc | PASS | Sorted by size descending correctly |
| 06.12 | Deprecated cwd param | PASS | Backward compat works |

## Detailed Results

### 06.01 - Basic glob pattern ✓ PASS

**Call**:
```json
{"patterns": ["pt-tests/fixtures/typescript/*.ts"]}
```

**Expected**: Returns 6+ TypeScript files

**Actual**: Returned 10 files:
- pt-tests/fixtures/typescript/classes.ts
- pt-tests/fixtures/typescript/error-file.ts
- pt-tests/fixtures/typescript/imports-example.ts
- pt-tests/fixtures/typescript/interfaces.ts
- pt-tests/fixtures/typescript/large-file.ts
- pt-tests/fixtures/typescript/no-classes.ts
- pt-tests/fixtures/typescript/sample-classes.ts
- pt-tests/fixtures/typescript/sample-exports.ts
- pt-tests/fixtures/typescript/sample-functions.ts
- pt-tests/fixtures/typescript/sample-imports.ts

**Validation**:
- ✓ success: true
- ✓ Subdirectory pattern works WITHOUT base_path workaround
- ✓ Returned 10 files (>= 6 expected)
- ✓ All paths are TypeScript files in correct directory

**Verdict**: PASS

---

### 06.02 - Multiple patterns ✓ PASS

**Call**:
```json
{
  "patterns": [
    "pt-tests/fixtures/config/*.json",
    "pt-tests/fixtures/config/*.yaml",
    "pt-tests/fixtures/config/*.toml"
  ]
}
```

**Expected**: Returns 3 config files

**Actual**: Returned 3 files:
- pt-tests/fixtures/config/sample.json
- pt-tests/fixtures/config/sample.toml
- pt-tests/fixtures/config/sample.yaml

**Validation**:
- ✓ success: true
- ✓ Subdirectory patterns work WITHOUT base_path workaround
- ✓ Returned exactly 3 files
- ✓ Each file type represented (json, yaml, toml)

**Verdict**: PASS

---

### 06.03 - Preset: typescript ✓ PASS

**Call**:
```json
{"preset": "typescript", "base_path": "pt-tests/fixtures"}
```

**Expected**: Returns TypeScript files

**Actual**: Returned 10 TypeScript files (relative to base_path):
- typescript/classes.ts
- typescript/error-file.ts
- typescript/imports-example.ts
- typescript/interfaces.ts
- typescript/large-file.ts
- typescript/no-classes.ts
- typescript/sample-classes.ts
- typescript/sample-exports.ts
- typescript/sample-functions.ts
- typescript/sample-imports.ts

**Validation**:
- ✓ success: true
- ✓ All files are TypeScript (.ts extension)
- ✓ Paths are relative to base_path

**Verdict**: PASS

---

### 06.04 - Preset: config ✓ PASS

**Call**:
```json
{"preset": "config", "base_path": "pt-tests/fixtures"}
```

**Expected**: Returns config files (json, yaml, toml)

**Actual**: Returned 3 config files:
- config/sample.json
- config/sample.toml
- config/sample.yaml

**Validation**:
- ✓ success: true
- ✓ All files are config types
- ✓ Paths are relative to base_path

**Verdict**: PASS

---

### 06.05 - Output: count_only ✓ PASS

**Call**:
```json
{
  "patterns": ["pt-tests/fixtures/**/*"],
  "output": {"format": "count_only"}
}
```

**Expected**: Returns ONLY a summary/count, NO file list

**Actual**:
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_files": 27,
      "total_size": 927822,
      "truncated": false
    },
    "tokens_used": 14
  },
  "meta": {
    "output_mode": "count_only",
    "token_estimate": 22,
    "execution_ms": 2
  }
}
```

**Validation**:
- ✓ success: true
- ✓ NO files array in response
- ✓ summary object present with total_files count
- ✓ Extremely low token usage (14 tokens)

**Verdict**: PASS

---

### 06.06 - Output: paths_only ✓ PASS

**Call**:
```json
{
  "patterns": ["pt-tests/fixtures/python/*.py"],
  "output": {"format": "paths_only"}
}
```

**Expected**: Returns file paths as strings, subdirectory pattern works

**Actual**: Returned 1 file:
- pt-tests/fixtures/python/sample_classes.py

**Validation**:
- ✓ success: true
- ✓ Subdirectory pattern works WITHOUT base_path workaround
- ✓ files array contains plain strings (not objects)

**Verdict**: PASS

---

### 06.07 - Output: with_stats ✓ PASS

**Call**:
```json
{
  "patterns": ["pt-tests/fixtures/typescript/*.ts"],
  "output": {"format": "with_stats"}
}
```

**Expected**: Returns array of objects with path, size, and modified properties

**Actual**: Returned 10 objects. Sample:
```json
{
  "path": "pt-tests/fixtures/typescript/classes.ts",
  "size": 368,
  "modified": "2026-02-09T02:31:35.553Z",
  "created": "2026-02-09T02:31:35.553Z",
  "is_symlink": false
}
```

**Validation**:
- ✓ success: true
- ✓ files array contains objects (NOT plain strings)
- ✓ Each object has path property (string)
- ✓ Each object has size property (number in bytes)
- ✓ Each object has modified property (ISO timestamp)
- ✓ Bonus: created and is_symlink also included

**Verdict**: PASS

---

### 06.08 - Output: with_preview ✓ PASS

**Call**:
```json
{
  "patterns": ["pt-tests/fixtures/typescript/*.ts"],
  "output": {"format": "with_preview", "preview_lines": 3}
}
```

**Expected**: Returns array of objects with path and preview (first 3 lines)

**Actual**: Returned 10 objects. Sample:
```json
{
  "path": "pt-tests/fixtures/typescript/classes.ts",
  "stats": {
    "size": 368,
    "modified": "2026-02-09T02:31:35.553Z",
    "created": "2026-02-09T02:31:35.553Z",
    "is_symlink": false
  },
  "preview": [
    "// Class definitions",
    "",
    "export class Dog {"
  ]
}
```

**Validation**:
- ✓ success: true
- ✓ files array contains objects (NOT plain strings)
- ✓ Each object has path property
- ✓ Each object has preview property (array of strings)
- ✓ Preview contains exactly 3 lines as requested
- ✓ Bonus: stats object also included

**Verdict**: PASS

---

### 06.09 - Filter: min_size ✓ PASS

**Call**:
```json
{
  "patterns": ["pt-tests/fixtures/typescript/*.ts"],
  "filters": {"min_size": 1000},
  "output": {"format": "with_stats"}
}
```

**Expected**: Returns only files >= 1000 bytes (e.g., large-file.ts, sample-classes.ts)

**Actual**: Returned 2 files:
- pt-tests/fixtures/typescript/large-file.ts (43060 bytes)
- pt-tests/fixtures/typescript/sample-classes.ts (1475 bytes)

**Validation**:
- ✓ success: true
- ✓ Both files are >= 1000 bytes
- ✓ Format is with_stats (objects with size property)
- ✓ No files < 1000 bytes included

**Verdict**: PASS

---

### 06.10 - Filter: has_content ✗ FAIL

**Call**:
```json
{
  "patterns": ["pt-tests/fixtures/**/*"],
  "filters": {"has_content": "class"},
  "output": {"format": "paths_only"}
}
```

**Expected**: Returns only files containing "class"

**Actual**: Returned 0 files:
```json
{
  "success": true,
  "data": {
    "files": [],
    "summary": {
      "total_files": 0,
      "total_size": 0,
      "truncated": false
    },
    "tokens_used": 0
  },
  "meta": {
    "output_mode": "paths_only",
    "token_estimate": 23,
    "execution_ms": 270
  }
}
```

**Verification**:
Used precision_grep to verify files with "class" exist:
- pt-tests/fixtures/python/sample_classes.py (9 matches)
- pt-tests/fixtures/typescript/no-classes.ts (1 match)
- pt-tests/fixtures/typescript/imports-example.ts (1 match)
- pt-tests/fixtures/typescript/classes.ts (3 matches)
- pt-tests/fixtures/typescript/sample-exports.ts (3 matches)
- pt-tests/fixtures/typescript/large-file.ts (10 matches)
- pt-tests/fixtures/typescript/sample-imports.ts (4 matches)
- pt-tests/fixtures/typescript/sample-classes.ts (3 matches)

**Total**: 8 files with 34 matches

**Validation**:
- ✓ success: true
- ✗ Should return 8 files, returned 0
- ✗ has_content filter appears to be broken

**Verdict**: FAIL

---

### 06.11 - Sorting by size desc ✓ PASS

**Call**:
```json
{
  "patterns": ["pt-tests/fixtures/typescript/*.ts"],
  "output": {"format": "with_stats", "sort_by": "size", "sort_order": "desc"}
}
```

**Expected**: Returns files with stats, sorted by size descending (largest first)

**Actual**: Returned 10 files sorted by size:
1. large-file.ts (43060 bytes)
2. sample-classes.ts (1475 bytes)
3. sample-functions.ts (997 bytes)
4. sample-exports.ts (826 bytes)
5. sample-imports.ts (751 bytes)
6. error-file.ts (473 bytes)
7. classes.ts (368 bytes)
8. imports-example.ts (357 bytes)
9. no-classes.ts (242 bytes)
10. interfaces.ts (211 bytes)

**Validation**:
- ✓ success: true
- ✓ Format is with_stats (objects with path, size, modified)
- ✓ Files are sorted by size in descending order
- ✓ Largest file first (43060 bytes), smallest last (211 bytes)

**Verdict**: PASS

---

### 06.12 - Deprecated cwd param ✓ PASS

**Call**:
```json
{
  "patterns": ["*.txt"],
  "cwd": "pt-tests/fixtures/edge-cases"
}
```

**Expected**: Returns .txt files from edge-cases directory (backward compat)

**Actual**: Returned 6 files:
- deeply/nested/path/file.txt
- empty.txt
- mixed-endings.txt
- special-chars.txt
- unicode.txt
- very-long-lines.txt

**Validation**:
- ✓ success: true
- ✓ All files have .txt extension
- ✓ Files are from edge-cases directory (paths relative to cwd)
- ✓ Deprecated cwd parameter works for backward compatibility

**Verdict**: PASS

---

## Summary

**Overall**: 11/12 tests PASS (91.7% pass rate)

**Key Achievements**:
- ✓ Subdirectory patterns work WITHOUT base_path workaround (06.01, 06.02, 06.06)
- ✓ All output formats work correctly (count_only, paths_only, with_stats, with_preview)
- ✓ Presets work correctly (typescript, config)
- ✓ Filters work (min_size)
- ✓ Sorting works (size desc)
- ✓ Backward compatibility maintained (deprecated cwd param)

**Regressions Fixed**:
- 06.01: Basic glob pattern now works with subdirectory patterns directly
- 06.02: Multiple patterns now work with subdirectory patterns
- 06.05: count_only format correctly returns NO file list
- 06.06: paths_only works with subdirectory patterns
- 06.07: with_stats returns proper objects with path/size/modified fields
- 06.08: with_preview returns proper objects with path/preview fields
- 06.11: Sorting returns with_stats format correctly

## Bugs Found

### Bug #1: has_content Filter Returns 0 Results

**Test**: 06.10 - Filter: has_content

**Severity**: High

**Description**:
The `has_content` filter in precision_glob returns 0 files when it should find 8 files containing the pattern "class".

**Call**:
```json
{
  "patterns": ["pt-tests/fixtures/**/*"],
  "filters": {"has_content": "class"},
  "output": {"format": "paths_only"}
}
```

**Expected**: 8 files with "class" pattern

**Actual**: 0 files returned after 270ms execution

**Verification**:
Using precision_grep with same pattern finds 8 files:
- pt-tests/fixtures/python/sample_classes.py (9 matches)
- pt-tests/fixtures/typescript/no-classes.ts (1 match)
- pt-tests/fixtures/typescript/imports-example.ts (1 match)
- pt-tests/fixtures/typescript/classes.ts (3 matches)
- pt-tests/fixtures/typescript/sample-exports.ts (3 matches)
- pt-tests/fixtures/typescript/large-file.ts (10 matches)
- pt-tests/fixtures/typescript/sample-imports.ts (4 matches)
- pt-tests/fixtures/typescript/sample-classes.ts (3 matches)

**Root Cause Hypothesis**:
The has_content filter implementation is likely:
1. Not reading file contents for matching
2. Using incorrect pattern matching logic
3. Silently failing during content search

**Suggested Fix**:
1. Review the has_content filter implementation in precision_glob handler
2. Ensure file contents are being read when has_content is specified
3. Verify the pattern matching logic (likely needs regex search, not exact match)
4. Add debug logging to trace filter execution
5. Consider using ripgrep backend when has_content is specified

**Location to Investigate**:
- File: `precision-engine/src/handlers/precision_glob.ts`
- Function: Content filtering logic in the glob handler
- Look for: has_content filter implementation

**Impact**:
- Users cannot filter files by content using precision_glob
- This is a documented feature that doesn't work
- Workaround: Use precision_grep with format: "files_only" instead
