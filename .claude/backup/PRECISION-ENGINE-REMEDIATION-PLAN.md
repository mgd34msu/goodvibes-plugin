# Precision-Engine Remediation Plan

**Date:** 2026-01-25
**Based on:** PRECISION-BATCH-ENGINE-TEST-REPORT.md
**Source Path:** `plugins/goodvibes/tools/implementations/precision-engine/src/handlers/`

---

## Executive Summary

After analyzing all 9 precision-engine handlers, I've identified **23 issues** requiring fixes. The root cause of ~40% of issues is a **verbosity vs output.mode architectural mismatch**—the code parses `verbosity` but uses `output.mode` for formatting decisions.

| Priority | Count | Estimated Effort |
|----------|-------|------------------|
| P0 - Critical | 3 | ~4 hours |
| P1 - Major | 7 | ~8 hours |
| P2 - Minor | 6 | ~4 hours |
| P3 - Enhancement | 7 | ~6 hours |

---

## Fix Categories

### Category A: Verbosity/Output.mode Unification (Cross-cutting)

**Problem:** Each tool has two verbosity systems:
1. Global `verbosity` parameter parsed by `parseOutputMode()`
2. Tool-specific `output.mode` used in switch statements

**Files Affected:** ALL handlers

**Solution:** Modify each handler to:
1. Use `parseOutputMode()` result to SET `output.mode` if not explicitly provided
2. Ensure the tool-specific output.mode switch cases match the verbosity options

---

## P0 - Critical Fixes

### 1. precision_exec: Timeout Not Enforced on Windows
**File:** `precision-exec.ts:151-157`
**Problem:** `proc.kill('SIGTERM')` and `proc.kill('SIGKILL')` don't work on Windows.
**Fix:**
```typescript
const timeoutId = setTimeout(() => {
  timedOut = true;
  if (process.platform === 'win32') {
    // Windows: use taskkill for reliable process termination
    exec(`taskkill /pid ${proc.pid} /T /F`, (err) => {
      if (err) proc.kill(); // Fallback
    });
  } else {
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL');
    }, 5000);
  }
}, timeout);
```

### 2. precision_write: Mode Parameter Ignored
**File:** `precision-write.ts:39-46, 250-258`
**Problem:** `WriteSpec` interface lacks `mode` field; code uses global `overwrite`/`backup` booleans.
**Fix:**
1. Add to `WriteSpec` interface:
```typescript
interface WriteSpec {
  path: string;
  content?: string;
  content_base64?: string;
  content_file?: string;
  encoding?: BufferEncoding;
  mode?: 'fail_if_exists' | 'overwrite' | 'backup'; // ADD THIS
}
```
2. In `writeFile()`, check `spec.mode` and handle:
   - `fail_if_exists`: current behavior when `overwrite=false`
   - `overwrite`: set `overwrite=true`, `backup=false`
   - `backup`: set `overwrite=true`, `backup=true`

### 3. discover: Symbols Query Crashes ("socket hang up")
**File:** `discover.ts:282-357`
**Problem:** `executeSymbolsQuery` can crash on large workspaces due to unbounded processing.
**Fix:**
1. Add timeout wrapper around `handlePrecisionSymbols` call
2. Add try/catch with graceful degradation
3. Limit files scanned in workspace mode:
```typescript
async function executeSymbolsQuery(...): Promise<QueryResult> {
  const timeout = 30000; // 30 second timeout for symbols
  try {
    const result = await Promise.race([
      handlePrecisionSymbols({...}),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Symbol search timeout')), timeout)
      )
    ]);
    // ... process result
  } catch (e) {
    return { type: 'symbols', count: 0, error: (e as Error).message };
  }
}
```

---

## P1 - Major Functionality Fixes

### 4. precision_edit: Hints Don't Constrain Scope
**File:** `precision-edit.ts:565-609`
**Problem:** Hints are used for scoring but ALL matches are pushed to candidates. Sorting by score is NOT implemented (see comment at line 605-607).
**Fix:**
```typescript
// Line 565-609 - Replace the hint scoring section:

interface ScoredMatch extends MatchResult {
  score: number;
}

// Apply hints to score and filter candidates
const scoredMatches: ScoredMatch[] = [];
for (const match of allMatches) {
  const lineNumber = content.substring(0, match.index).split('\n').length;
  let score = 100; // Base score

  // near_line hint - closer is better
  if (hints.near_line !== undefined) {
    const distance = Math.abs(lineNumber - hints.near_line);
    score += Math.max(0, 50 - distance * 5);
  }

  // in_function hint - MUST be in function
  if (hints.in_function) {
    const funcPattern = new RegExp(`function\\s+${hints.in_function}|const\\s+${hints.in_function}\\s*=`);
    const beforeContent = content.substring(0, match.index);
    if (!funcPattern.test(beforeContent)) {
      score = 0; // Disqualify if not in specified function
    } else {
      score += 50;
    }
  }

  // in_class hint - MUST be in class
  if (hints.in_class) {
    const classPattern = new RegExp(`class\\s+${hints.in_class}`);
    const beforeContent = content.substring(0, match.index);
    if (!classPattern.test(beforeContent)) {
      score = 0; // Disqualify
    } else {
      score += 50;
    }
  }

  // after/before hints
  if (hints.after) {
    const afterIdx = content.indexOf(hints.after);
    if (afterIdx === -1 || match.index <= afterIdx) score = 0;
    else score += 30;
  }
  if (hints.before) {
    const beforeIdx = content.indexOf(hints.before);
    if (beforeIdx === -1 || match.index >= beforeIdx) score = 0;
    else score += 30;
  }

  if (score > 0) {
    scoredMatches.push({ ...match, score });
  }
}

// Sort by score (highest first) and return
const candidates = scoredMatches
  .sort((a, b) => b.score - a.score)
  .map(({ score, ...match }) => match);

return candidates;
```

### 5. precision_edit: whitespace_sensitive Not Used in Exact Mode
**File:** `precision-edit.ts:547-558`
**Problem:** `whitespace_sensitive: false` only works in fuzzy mode, not exact.
**Fix:**
```typescript
} else {
  // exact match
  let searchContent = content;
  let searchFind = find;

  if (matchConfig.case_sensitive === false) {
    searchContent = content.toLowerCase();
    searchFind = find.toLowerCase();
  }

  // ADD: whitespace normalization for exact mode
  if (matchConfig.whitespace_sensitive === false) {
    searchContent = normalizeWhitespace(searchContent);
    searchFind = normalizeWhitespace(searchFind);
  }

  let pos = 0;
  while ((pos = searchContent.indexOf(searchFind, pos)) !== -1) {
    allMatches.push({ index: pos, length: searchFind.length });
    pos++;
  }
}
```

### 6. precision_grep: Output Formats Return files_only Data
**File:** `precision-grep.ts:399-413`
**Problem:** `locations`, `matches`, `context` modes fall through to default which should work, but the verbosity/output.mode mismatch means they never activate.
**Fix:**
1. At top of handler, unify verbosity with output.mode:
```typescript
// After line 439
const parsedVerbosity = parseOutputMode(args, "precision_grep");
const output: GrepOutput = {
  mode: input.output?.mode ?? parsedVerbosity as GrepOutputMode ?? 'files_only',
  // ... rest
};
```

### 7. precision_glob: Presets Non-functional
**File:** `precision-glob.ts:50-61, 116-126`
**Problem:** No `preset` parameter in interface or handling code.
**Fix:**
1. Add preset to interface:
```typescript
interface PrecisionGlobInput {
  patterns?: string[];
  patterns_base64?: string[];
  preset?: 'typescript' | 'javascript' | 'styles' | 'config' | 'tests' | 'all';
  // ... rest
}
```
2. Add preset expansion:
```typescript
const GLOB_PRESETS: Record<string, string[]> = {
  typescript: ['**/*.ts', '**/*.tsx'],
  javascript: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
  styles: ['**/*.css', '**/*.scss', '**/*.sass', '**/*.less'],
  config: ['**/*.json', '**/*.yaml', '**/*.yml', '**/*.toml', '**/*.xml'],
  tests: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**/*'],
  all: ['**/*'],
};

// In handler, before validation:
let patterns = input.patterns_base64
  ? input.patterns_base64.map(p => Buffer.from(p, 'base64').toString('utf-8'))
  : input.patterns;

// Expand preset if patterns not provided
if ((!patterns || patterns.length === 0) && input.preset) {
  patterns = GLOB_PRESETS[input.preset];
}

if (!patterns || patterns.length === 0) {
  return toCallToolResult(errorResult('patterns, patterns_base64, or preset is required', ...));
}
```

### 8. precision_read: Verbosity count_only Returns Full Content
**File:** `precision-read.ts:487-534`
**Problem:** The switch uses `output.mode` but `parseOutputMode()` sets a different variable.
**Fix:** Same pattern as #6 - unify at top of handler.

### 9. precision_glob: count_only Returns Full File List
**File:** `precision-glob.ts:287-294`
**Problem:** Same verbosity/output.mode mismatch.
**Fix:** Same pattern as #6.

### 10. precision_symbols: exported_only Returns 0 Symbols
**File:** `precision-symbols.ts:105-108, 193-201`
**Problem:** `isExported()` only checks for direct `export` keyword modifier. Misses:
- `export default foo`
- `export { foo }` re-exports
- Module-level exports

**Fix:**
```typescript
function isExported(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  // Check direct export modifier
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
    return true;
  }

  // Check if node name is in an export statement
  const nodeName = getNodeName(node);
  if (!nodeName) return false;

  // Walk source file for export declarations
  let isExportedViaStatement = false;
  function checkExports(n: ts.Node) {
    if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause)) {
      for (const element of n.exportClause.elements) {
        if (element.name.text === nodeName || element.propertyName?.text === nodeName) {
          isExportedViaStatement = true;
        }
      }
    }
    if (ts.isExportAssignment(n) && !n.isExportEquals) {
      // export default
      const expr = n.expression;
      if (ts.isIdentifier(expr) && expr.text === nodeName) {
        isExportedViaStatement = true;
      }
    }
    ts.forEachChild(n, checkExports);
  }
  checkExports(sourceFile);

  return isExportedViaStatement;
}
```

---

## P2 - Minor Functionality Fixes

### 11. precision_read: Binary File Handling
**File:** `precision-read.ts:345`
**Problem:** Reads all files as UTF-8, garbles binary content.
**Fix:**
```typescript
// Add binary detection helper
function isBinaryFile(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

const MAX_BINARY_SIZE = 5 * 1024 * 1024; // 5MB threshold

// In readSingleFile(), replace line 345:
const buffer = await fs.readFile(filePath);

if (isBinaryFile(buffer)) {
  if (buffer.length > MAX_BINARY_SIZE) {
    result.error = `Binary file too large (${buffer.length} bytes). Max: ${MAX_BINARY_SIZE}`;
    result.metadata = {
      size: buffer.length,
      modified: stats.mtime.toISOString(),
      is_binary: true,
    };
    return result;
  }

  result.content = buffer.toString('base64');
  result.encoding = 'base64';
  result.is_binary = true;
  result.line_count = undefined; // Not applicable for binary
  return result;
}

const content = buffer.toString('utf-8');
// ... rest of text handling
```

### 12. precision_glob: with_stats Missing Metadata
**File:** `precision-glob.ts:304-309`
**Problem:** `r.stats` might be undefined causing spread to fail silently.
**Fix:**
```typescript
case 'with_stats':
  data = {
    files: results.map(r => ({
      path: r.path,
      size: r.stats?.size ?? null,
      modified: r.stats?.modified ?? null,
      created: r.stats?.created ?? null,
      is_symlink: r.stats?.is_symlink ?? false,
    })),
    summary,
    tokens_used: totalTokens,
  };
  break;
```

### 13. precision_glob: with_preview Missing Content
**File:** `precision-glob.ts:269-272`
**Problem:** Preview might not be populated if file read fails.
**Fix:** Already handled by `getFilePreview` returning `[]`. Issue is likely verbosity mismatch (same as #9).

### 14. precision_symbols: group_by Not Working
**File:** `precision-symbols.ts:365-382, 409-416`
**Problem:** Actually implemented correctly, but test likely hit verbosity mismatch.
**Fix:** Apply verbosity unification pattern.

### 15. precision_symbols: count_only Returns Full Data
**File:** `precision-symbols.ts:393-399`
**Problem:** Same verbosity/output.mode mismatch.
**Fix:** Same pattern.

### 16. discover: locations Verbosity Missing Line:Column
**File:** `discover.ts:327-347`
**Problem:** Code looks correct. Issue is that grep's `locations` mode doesn't return matches array.
**Fix:** In `executeGrepQuery`, ensure grep is called with the right mode to include matches.

---

## P3 - Enhancements

### 17. precision_grep: context_before/after Validation
Ensure non-negative integers, add documentation.

### 18. precision_grep: expand_to Scope Detection
Improve function/class boundary detection using AST.

### 19. precision_glob: respect_gitignore Behavior
Current behavior is correct (DEFAULT_EXCLUDES includes node_modules). Document that `respect_gitignore: false` removes default excludes but doesn't read .gitignore file.

### 20. Add File Read Result Interface Enhancement
Add `encoding` and `is_binary` fields to FileReadResult.

### 21. precision_write: content_base64 Binary Support
When writing binary content, detect base64 and write as buffer:
```typescript
if (spec.content_base64) {
  const decoded = Buffer.from(spec.content_base64, 'base64');
  // Check if it looks like it was binary (non-UTF8)
  await fs.writeFile(filePath, decoded);
}
```

### 22. Add Comprehensive Logging
Add structured logging for debugging verbosity flow.

### 23. Add Integration Tests
Add tests that verify verbosity parameter flows correctly through to output.

---

## Implementation Order

### Phase 1: Critical Security/Functionality (P0)
1. Fix Windows timeout enforcement (precision_exec)
2. Fix mode parameter handling (precision_write)
3. Fix symbols crash (discover)

### Phase 2: Verbosity Unification (Cross-cutting)
4. Create unified verbosity handling utility
5. Apply to all 9 handlers

### Phase 3: Major Fixes (P1)
6. Fix hint constraints (precision_edit)
7. Fix whitespace_sensitive (precision_edit)
8. Add preset support (precision_glob)
9. Fix exported_only detection (precision_symbols)

### Phase 4: Minor Fixes (P2)
10. Add binary file handling (precision_read)
11. Fix with_stats spread (precision_glob)
12. Fix locations in discover

### Phase 5: Enhancements (P3)
13. Documentation updates
14. Additional validation
15. Integration tests

---

## File Change Summary

| File | Changes |
|------|---------|
| precision-exec.ts | Windows timeout fix |
| precision-write.ts | Add mode to WriteSpec, handle in writeFile |
| precision-edit.ts | Fix hint scoring/filtering, whitespace_sensitive in exact mode |
| precision-grep.ts | Verbosity unification |
| precision-glob.ts | Add presets, verbosity unification, fix with_stats |
| precision-symbols.ts | Fix isExported, verbosity unification |
| precision-read.ts | Binary detection, base64 encoding, verbosity unification |
| discover.ts | Timeout wrapper, verbosity flow fix |
| utils/index.ts | Add verbosity unification helper |

---

## Testing Strategy

After fixes, re-run the original test suite with:
1. Explicit verbosity parameter tests
2. Explicit output.mode tests
3. Combination tests (both specified)
4. Default behavior tests (neither specified)

Each fix should include a specific test case that reproduces the original failure.
