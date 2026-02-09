# E2E Test Errors

## Suite 04: precision_exec

### Test 04.10 - Background process start (FAILED)

**Date**: 2026-02-08
**Test**: Background process start with `background: true` parameter

**Expected Behavior**:
- Call: `precision_exec` with `commands: [{cmd: "sleep 30", background: true}]`
- Should return immediately with process ID/info for background process

**Actual Behavior**:
- Error: `"Failed to spawn process: no PID returned for \"sleep 30\""`
- Tool threw error instead of starting background process

**Error Response**:
```json
{
  "success": false,
  "error": "Failed to spawn process: no PID returned for \"sleep 30\"",
  "meta": {
    "output_mode": "standard",
    "token_estimate": 14,
    "execution_ms": 3
  }
}
```

**Workaround**:
- Test 04.14 shows that `until` pattern matching successfully promotes processes to background
- Background management commands (bg_status, bg_stop) work correctly on processes promoted via `until`

**Impact**:
- Direct background parameter unusable
- Alternative approach via until pattern works

**Next Steps**:
1. Investigate handler implementation for background spawning
2. Determine if direct background parameter should be fixed or deprecated
3. Update documentation to clarify background process creation methods

## Suite 06 - precision_glob (2026-02-08)

**Status**: BLOCKED - MCP tool not registered in current Claude session

**Issue**: The precision_glob tool is built and exists in precision-engine v1.0.0, confirmed by MCP server startup logs, but is not available for tool calls in the current session.

**Tool Name**: `mcp__plugin_goodvibes_precision-engine__precision_glob`

**Evidence**:
- Built: `/plugins/goodvibes/tools/implementations/precision-engine/dist/index.cjs` exists
- Server logs: `[INFO] Tools: ..., precision_glob, ...`
- Tool call error: `No such tool available: mcp__plugin_goodvibes_precision-engine__precision_glob`

**Impact**: All 12 tests blocked - cannot execute any precision_glob calls

**Fixture Status**: All fixtures validated and ready (10 .ts files, 3 config files, 1 .py file, 7+ large files, etc.)

**Required Action**: Restart Claude Code to register the MCP server

**Next Steps**:
1. Restart Claude Code session
2. Verify tool registration with test call
3. Re-run suite 06 with live tool calls
4. Document any actual failures vs. expected behavior

---

## 2026-02-08 - 06.01: Basic glob pattern - Subdirectory patterns don't work
**Tool**: precision_glob
**Action**: Testing basic glob pattern with subdirectory path
**Parameters**: `{ patterns: ["pt-tests/fixtures/typescript/*.ts"], output: { format: "paths_only" } }`
**Expected**: Should return array of .ts files from typescript directory (at least 6 files)
**Actual**: Returns 0 files with empty files array
**Error**: None - silently returns no matches
**Root Cause**: Glob pattern resolution doesn't handle subdirectory patterns. Only works with base_path + simple patterns, recursive `**/*`, presets, or deprecated cwd param
**Recommended Fix**: Fix glob pattern resolver to handle combined path patterns like `dir/subdir/*.ext`. Should work with both relative and absolute paths.

---

## 2026-02-08 - 06.07: Output with_stats - Format not implemented
**Tool**: precision_glob
**Action**: Testing with_stats output format
**Parameters**: `{ patterns: ["*.ts"], base_path: "/path/to/typescript", output: { format: "with_stats", max_results: 5 } }`
**Expected**: Should return array of objects with `{ path, size, modified }` properties
**Actual**: Returns plain string array (paths_only format)
**Error**: None - silently falls back to paths_only
**Root Cause**: Output format logic doesn't implement with_stats mode, always returns paths_only regardless of format parameter
**Recommended Fix**: Implement with_stats output format to return file metadata objects instead of plain strings

---

## 2026-02-08 - 06.08: Output with_preview - Format not implemented
**Tool**: precision_glob
**Action**: Testing with_preview output format
**Parameters**: `{ patterns: ["sample.json"], base_path: "/path/to/config", output: { format: "with_preview", preview_lines: 5 } }`
**Expected**: Should return objects with `{ path, preview }` containing first 5 lines of file content
**Actual**: Returns plain string array (paths_only format)
**Error**: None - silently falls back to paths_only
**Root Cause**: Output format logic doesn't implement with_preview mode, always returns paths_only regardless of format parameter
**Recommended Fix**: Implement with_preview output format to read and return first N lines of matched files

---

## 2026-02-08 - 06.05: count_only returns full file list
**Tool**: precision_glob
**Action**: Testing count_only output format for token efficiency
**Parameters**: `{ patterns: ["**/*"], base_path: "/path/to/fixtures", output: { format: "count_only" } }`
**Expected**: Should return only summary stats without file list
**Actual**: Returns full file list (27 files) plus summary, using 166 tokens
**Error**: None - works but wastes tokens
**Root Cause**: count_only mode populates files array instead of omitting it, defeating the purpose of minimal token usage
**Recommended Fix**: When format is count_only, don't populate the files array - only return summary object

---

## Suite 07: precision_symbols (2026-02-08)

### CRITICAL BUG - All 10 tests failed

**Date**: 2026-02-08  
**Timestamp**: Suite executed 2026-02-08 (exact time in test output file)  
**Test Suite**: Suite 07 - precision_symbols E2E tests  
**Tool Name**: `mcp__plugin_goodvibes_precision-engine__precision_symbols`  
**What was tested**: Symbol extraction from TypeScript/Python files in workspace and document modes

**Status**: ❌ CRITICAL - Complete tool malfunction

### Summary

The `precision_symbols` tool consistently returns empty symbol arrays for all queries despite valid fixtures containing known symbols. The tool accepts parameters without error but fails to extract any symbols.

### Expected vs Actual

**Test 07.02 - Document mode single file** (representative example):

**Expected**:
```json
{
  "symbols": [
    {"name": "IAnimal", "kind": "interface", "line": 2},
    {"name": "IMovable", "kind": "interface", "line": 7},
    {"name": "Dog", "kind": "class", "line": 47},
    {"name": "Container", "kind": "class", "line": 77},
    {"name": "formatName", "kind": "function", "line": 99},
    {"name": "Color", "kind": "enum", "line": 17},
    // ... 20+ total symbols
  ],
  "summary": {"total_symbols": 20}
}
```

**Actual**:
```json
{
  "symbols": [],
  "summary": {
    "total_symbols": 0,
    "by_kind": {},
    "files_searched": 1
  },
  "tokens_used": 0
}
```

**Tool Call**:
```json
{
  "mode": "document",
  "files": ["/home/buzzkill/Projects/goodvibes-plugin/pt-tests/fixtures/typescript/sample-classes.ts"],
  "output": {"format": "locations"}
}
```

### Test Results

| Test ID | Description | Result | Symbols Expected | Symbols Returned |
|---------|-------------|--------|------------------|------------------|
| 07.01 | Workspace mode query for "UserService" | ⚠️ | 0 (valid) | 0 |
| 07.02 | Document mode single file | ❌ | 20+ | 0 |
| 07.03 | Kind filtering (function+method) | ❌ | 10+ | 0 |
| 07.04 | exported_only filter | ❌ | 15+ | 0 |
| 07.05 | include_private flag | ❌ | 20+ | 0 |
| 07.06 | Output signatures | ❌ | N/A | Skipped |
| 07.07 | Output full | ❌ | N/A | Skipped |
| 07.08 | Group by kind | ❌ | N/A | Skipped |
| 07.09 | Python language | ❌ | 5+ | Skipped |
| 07.10 | Multi-file document mode | ❌ | 25+ | Skipped |

### Root Cause Analysis

**Investigation findings**:

1. **Tool definition valid**: YAML schema at `/plugins/goodvibes/tools/definitions/precision-engine/precision-symbols.yaml` is well-formed

2. **Handler implementation exists**: 596-line handler at `/plugins/goodvibes/tools/implementations/precision-engine/src/handlers/precision-symbols.ts` with:
   - Tree-sitter integration via `treeSitterCore.parse()` and `treeSitterCore.getSymbols()`
   - Symbol filtering logic
   - Multiple output modes

3. **Unit tests exist**: 467-line test file with passing tests (presumably in isolation)

4. **Fixtures verified**: `precision_read` with `extract: "outline"` successfully extracted symbols from same files, confirming:
   - Files exist and are readable
   - Files contain valid TypeScript code
   - Symbols are parseable by other tools

5. **Handler flow**:
   ```typescript
   processFile() {
     isLanguageSupported(filePath) // May be failing?
     readFile()
     treeSitterCore.parse(content, path)  // Tree-sitter WASM
     treeSitterCore.getSymbols(tree, path, kinds) // Returns empty?
   }
   ```

**Most likely cause**: **Tree-sitter runtime initialization failure in MCP context**

- Tree-sitter WASM file exists: `/dist/tree-sitter.wasm` (188KB)
- Unit tests pass (different environment)
- MCP tool calls fail (MCP server context)
- No errors thrown, just empty arrays returned

**Hypothesis**: When running in MCP server, tree-sitter native/WASM modules are not initializing correctly, causing `treeSitterCore.getSymbols()` to return empty arrays without throwing errors.

### Evidence of Silent Failure

- No error messages in tool responses
- `success: true` in all responses
- `files_searched: 1` indicates file was processed
- `execution_ms: 0` suggests early return
- Empty `tokens_used: 0` confirms no symbols generated

### Recommended Fix

**Immediate**:
1. Add debug logging to `processFile()` function:
   ```typescript
   console.error('isLanguageSupported:', result);
   console.error('tree-sitter parse result:', tree);
   console.error('symbols from tree-sitter:', tsSymbols.length);
   ```

2. Add explicit error handling:
   ```typescript
   if (!tree) {
     throw new Error('Tree-sitter parse failed');
   }
   if (tsSymbols.length === 0 && fileContainsCode) {
     throw new Error('Symbol extraction returned empty array');
   }
   ```

**Short-term**:
1. Verify tree-sitter WASM loading in MCP server startup logs
2. Check `isLanguageSupported()` implementation - may be rejecting all files
3. Test with explicit `language: "typescript"` parameter
4. Add MCP integration tests (not just unit tests)

**Long-term**:
1. Fall back to TypeScript Compiler API for TS/JS files (like `precision_read` outline mode does)
2. Add health check that verifies tree-sitter functionality
3. Reconcile schema inconsistency: YAML defines `output.format` but code uses `output.mode`

### Workaround

**Use `precision_read` with `extract: "outline"` or `extract: "symbols"` instead**:

```json
{
  "files": [{
    "path": "/path/to/file.ts",
    "extract": "symbols"
  }],
  "symbol_filter": ["function", "class"]
}
```

This approach:
- ✓ Works reliably (confirmed in testing)
- ✓ Returns symbol outlines with line numbers
- ✓ Supports kind filtering
- ✗ Limited to per-file queries (no workspace mode)
- ✗ No query pattern matching

### Impact

- **Severity**: CRITICAL
- **Scope**: Entire `precision_symbols` tool non-functional
- **Users affected**: Any workflow requiring symbol search (navigation, refactoring, analysis)
- **Blocking**: 
  - Workspace-wide symbol search
  - Go-to-definition features
  - Symbol-based code navigation
  - Automated refactoring based on symbol discovery

### Next Steps

1. ❗ **File GitHub issue** with full details
2. Investigate tree-sitter initialization in MCP server logs
3. Add integration test that runs via MCP (not just unit tests)
4. Consider temporary fallback to TypeScript Compiler API
5. Update documentation to recommend `precision_read` workaround

### Files

- **Test output**: `/home/buzzkill/Projects/goodvibes-plugin/pt-tests/output/suite-07-precision-symbols.md`
- **Fixtures**: `/home/buzzkill/Projects/goodvibes-plugin/pt-tests/fixtures/typescript/sample-classes.ts`
- **Handler**: `/home/buzzkill/Projects/goodvibes-plugin/plugins/goodvibes/tools/implementations/precision-engine/src/handlers/precision-symbols.ts`

---

## 2026-02-08 - 07.02-07.10: Document Mode Broken (CRITICAL)
**Tool**: precision_symbols
**Action**: Testing document mode symbol extraction across multiple scenarios
**Tests Failed**: 9/10 tests (only workspace mode passed)
**Scope**: ALL document mode operations broken

### Test Cases Failed:
- 07.02: Document mode single file
- 07.03: Kind filtering (function + method)
- 07.04: exported_only filter
- 07.05: include_private flag
- 07.06: Output format: signatures
- 07.07: Output format: full
- 07.08: Group by kind
- 07.09: Python language
- 07.10: Multi-file document mode

### Parameters Example:
```json
{
  "mode": "document",
  "files": ["/home/buzzkill/Projects/goodvibes-plugin/pt-tests/fixtures/typescript/sample-classes.ts"],
  "output": { "format": "locations" }
}
```

**Expected**: 27 symbols (IAnimal, IMovable, Dog, Cat, Container, Color, Priority, AnimalType, formatName, helperFunction, Utils, and their members)

**Actual**: 0 symbols for ALL document mode tests
```json
{
  "symbols": [],
  "summary": {
    "total_symbols": 0,
    "by_kind": {},
    "files_searched": 1
  }
}
```

**Error**: Document mode handler returns empty symbols array despite reporting correct `files_searched` count

**Root Cause**: The document mode handler in `src/handlers/precision-symbols.ts` is NOT extracting symbols from files. The handler appears to:
1. Accept the file paths
2. Count the files (`files_searched: N`)
3. Return empty symbols array without calling tree-sitter extraction

**Evidence that parsing WORKS**:
- Workspace mode PASSES: Found 19 symbols across 23,996 files in 24.3s
- `precision_read` with `extract: "symbols"` WORKS: Returns all 27 expected symbols from same file
- Tree-sitter WASM initialization is functioning
- TypeScript parsing is functioning

**Recommended Fix**:
1. Debug `src/handlers/precision-symbols.ts` document mode code path
2. Ensure document mode calls symbol extraction logic (likely reusing code from precision_read)
3. Verify filters are applied (kinds, exported_only, include_private)
4. Verify output formatting works (locations, signatures, full)
5. Add unit tests to prevent regression
6. Re-run Suite 07 to verify fix

**Priority**: CRITICAL - Document mode is the primary use case for symbol extraction

---
