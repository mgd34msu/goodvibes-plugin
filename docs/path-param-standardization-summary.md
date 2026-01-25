# Path Parameter Standardization

## Summary
Standardized path parameter names across precision-engine tools to improve consistency and clarity. Both old and new parameter names are supported with backward compatibility.

## Changes Made

### 1. precision_glob (schemas/index.ts)
**New parameter:** `base_path`
- Description: "Base directory for glob patterns (defaults to process.cwd())"
- Type: string
- Optional

**Deprecated parameter:** `cwd`
- Description: "DEPRECATED: Use base_path instead. Working directory for glob patterns (defaults to process.cwd())"
- Still functional with deprecation warning

**Handler updates (handlers/precision-glob.ts):**
- Updated interface `PrecisionGlobInput` to include both `base_path` and `cwd`
- Modified handler logic:
  ```typescript
  const workDir = input.base_path ?? input.cwd ?? process.cwd();

  if (input.cwd && !input.base_path) {
    console.warn('[precision_glob] DEPRECATION WARNING: Parameter "cwd" is deprecated. Use "base_path" instead.');
  }
  ```

### 2. precision_edit (schemas/index.ts)
**New parameter:** `edits[].path`
- Description: "Path to the file to edit"
- Type: string
- Optional (but one of path or file must be provided)

**Deprecated parameter:** `edits[].file`
- Description: "DEPRECATED: Use path instead. Path to the file to edit"
- Still functional with deprecation warning

**Handler updates (handlers/precision-edit.ts):**
- Updated interface `EditSpec` to include both `path` and `file`
- Modified validation logic:
  ```typescript
  const filePath = edit.path ?? edit.file;
  if (!filePath || typeof filePath !== 'string') {
    return toCallToolResult(errorResult(`edits[${i}].path (or deprecated .file) is required...`));
  }

  if (edit.file && !edit.path) {
    console.warn(`[precision_edit] DEPRECATION WARNING: edits[${i}].file is deprecated...`);
  }
  ```
- Updated all references to use `edit.path ?? edit.file!`

## Backward Compatibility

All changes maintain 100% backward compatibility:

1. **Old code continues to work**: Existing calls using `cwd` or `file` will function exactly as before
2. **Deprecation warnings**: Console warnings guide users to migrate to new parameter names
3. **Fallback logic**: Handlers check for new parameters first, then fall back to deprecated ones
4. **No breaking changes**: Schema required fields remain unchanged

## Migration Guide

### For precision_glob users:
```typescript
// Old (still works, but deprecated)
{
  patterns: ["src/**/*.ts"],
  cwd: "/path/to/project"
}

// New (recommended)
{
  patterns: ["src/**/*.ts"],
  base_path: "/path/to/project"
}
```

### For precision_edit users:
```typescript
// Old (still works, but deprecated)
{
  edits: [{
    file: "src/index.ts",
    find: "old",
    replace: "new"
  }]
}

// New (recommended)
{
  edits: [{
    path: "src/index.ts",
    find: "old",
    replace: "new"
  }]
}
```

## Files Modified

1. `plugins/goodvibes/tools/implementations/precision-engine/src/schemas/index.ts`
   - Added `base_path` to `precisionGlobSchema`
   - Marked `cwd` as deprecated in `precisionGlobSchema`
   - Added `path` to `precisionEditSchema` edit items
   - Marked `file` as deprecated in `precisionEditSchema` edit items

2. `plugins/goodvibes/tools/implementations/precision-engine/src/handlers/precision-glob.ts`
   - Updated `PrecisionGlobInput` interface
   - Added fallback logic with deprecation warning
   - Updated handler to use `base_path ?? cwd ?? process.cwd()`

3. `plugins/goodvibes/tools/implementations/precision-engine/src/handlers/precision-edit.ts`
   - Updated `EditSpec` interface
   - Added validation and fallback logic with deprecation warnings
   - Updated all references to use new parameter names with fallback

## Build Status

✓ Project builds successfully
✓ TypeScript compilation passes
✓ No breaking changes introduced

## Testing Recommendations

1. Test with `base_path` parameter in precision_glob
2. Test with deprecated `cwd` parameter to verify warning appears
3. Test with `path` parameter in precision_edit
4. Test with deprecated `file` parameter to verify warning appears
5. Verify both parameters work correctly when only old or only new is provided
