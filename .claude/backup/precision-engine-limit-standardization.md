# Precision Engine Limit Parameter Standardization

## Summary

Standardized max limit parameter names across precision-engine tools while maintaining full backward compatibility.

## Changes Made

### Schema Updates (`src/schemas/index.ts`)

#### 1. precision_grep
**Before:**
- `max_files` - Max files to return
- `max_matches_per_file` - Cap per file
- `max_total_matches` - Total cap

**After:**
- `max_results` - Max files to return (NEW, preferred)
- `max_files` - DEPRECATED: Use max_results
- `max_per_item` - Cap per file (NEW, preferred)
- `max_matches_per_file` - DEPRECATED: Use max_per_item
- `max_total_matches` - Total cap (unchanged)

#### 2. precision_read
**Before:**
- `max_lines_per_file` - Max lines per file

**After:**
- `max_per_item` - Max lines per file (NEW, preferred)
- `max_lines_per_file` - DEPRECATED: Use max_per_item

#### 3. precision_glob
**Before:**
- `max_files` - Maximum files to return

**After:**
- `max_results` - Maximum files to return (NEW, preferred)
- `max_files` - DEPRECATED: Use max_results

#### 4. precision_symbols
**No changes** - Already uses `max_results` (already standardized)

### Handler Updates

#### 1. `precision-grep.ts`
- Updated `GrepOutput` interface to include both new and old parameter names
- Updated parameter resolution to check new names first, then fall back to old names:
  ```typescript
  const maxFiles = output.max_results ?? output.max_files ?? 100;
  const maxMatchesPerFile = output.max_per_item ?? output.max_matches_per_file ?? 10;
  ```
- Updated defaults application to set both parameters

#### 2. `precision-read.ts`
- Updated `ReadOutput` interface to include both new and old parameter names
- Updated parameter resolution:
  ```typescript
  const maxLinesPerFile = output.max_per_item ?? output.max_lines_per_file ?? Infinity;
  ```

#### 3. `precision-glob.ts`
- Updated `GlobOutput` interface to include both new and old parameter names
- Updated parameter resolution:
  ```typescript
  const maxFiles = output.max_results ?? output.max_files ?? 100;
  ```

## Standardized Naming Convention

### Primary Names (Preferred)
- `max_results` - Total result cap (files, symbols, etc.)
- `max_per_item` - Per-file/per-query cap
- `max_tokens` - Token budget (already consistent)

### Deprecated Names (Backward Compatible)
- `max_files` → Use `max_results`
- `max_matches_per_file` → Use `max_per_item`
- `max_lines_per_file` → Use `max_per_item`

## Backward Compatibility

All existing parameter names continue to work. The handlers check for new names first, then fall back to old names:

```typescript
// New code (preferred)
{
  output: {
    max_results: 50,
    max_per_item: 5
  }
}

// Old code (still works)
{
  output: {
    max_files: 50,
    max_matches_per_file: 5
  }
}

// Mixed (also works - new names take precedence)
{
  output: {
    max_results: 50,
    max_files: 100  // Ignored in favor of max_results
  }
}
```

## Schema Documentation Updates

Updated comments in `precision_grep` schema to reflect new parameter names:
```typescript
/**
 * - output.max_results (or max_files): defaults to 100
 * - output.max_per_item (or max_matches_per_file): defaults to 10
 * - output.max_total_matches: defaults to 100
 */
```

## Verification

Build completed successfully:
```bash
cd plugins/goodvibes/tools/implementations/precision-engine
npm run build
# ✓ Build completed: dist/index.cjs
```

## Migration Guide

### For Tool Users

**No action required.** Existing code continues to work.

**To use new naming (recommended):**
1. Replace `max_files` with `max_results`
2. Replace `max_matches_per_file` with `max_per_item`
3. Replace `max_lines_per_file` with `max_per_item`

### For Tool Developers

When adding new limit parameters:
- Use `max_results` for total result caps
- Use `max_per_item` for per-item caps
- Use `max_tokens` for token budgets
- Mark old parameter names as DEPRECATED in schema descriptions
- Always check new parameter first, then fall back to old parameter

## Files Modified

1. `plugins/goodvibes/tools/implementations/precision-engine/src/schemas/index.ts`
   - Added new parameter aliases to schema definitions
   - Updated schema documentation

2. `plugins/goodvibes/tools/implementations/precision-engine/src/handlers/precision-grep.ts`
   - Updated GrepOutput interface
   - Updated parameter resolution logic
   - Updated defaults application

3. `plugins/goodvibes/tools/implementations/precision-engine/src/handlers/precision-read.ts`
   - Updated ReadOutput interface
   - Updated parameter resolution logic

4. `plugins/goodvibes/tools/implementations/precision-engine/src/handlers/precision-glob.ts`
   - Updated GlobOutput interface
   - Updated parameter resolution logic
   - Updated defaults application

## Testing Recommendations

Test cases to verify backward compatibility:
1. Call with only new parameter names
2. Call with only old parameter names
3. Call with mixed parameter names (verify new takes precedence)
4. Call with no parameters (verify defaults work)
5. Verify TypeScript compilation
6. Verify runtime behavior matches expectations
