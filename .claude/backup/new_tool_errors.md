# Precision Tool Errors Analysis

Documentation of errors encountered while using the `discover`, `batch`, and `precision_*` MCP tools during the pricing fetcher implementation and costUSD search tasks.

**Last Updated: 2026-01-25**

---

## Status Summary

| Issue | Status | Resolution |
|-------|--------|------------|
| precision_read parameter structure | ✅ FIXED | Schema now has defaults (`extract: content`, `output.mode: standard`) |
| precision_grep JSON escaping | ✅ FIXED | PreToolUse hook auto-fixes invalid escapes |
| precision_write JSON escaping | ✅ FIXED | PreToolUse hook auto-fixes invalid escapes |
| discover path scope | ✅ FIXED | Now supports `base_path` parameter |
| precision_grep output size | ✅ MITIGATED | `count_only` mode + `truncated` indicator |
| Schema inconsistencies | ⚠️ MINOR | Works but naming differs between tools |

---

## 1. precision_read - Parameter Structure Errors ✅ FIXED

### Original Error Sequence

**Attempt 1**: Used `output_mode` at top level
```json
{"files": [...], "extract": "full", "output_mode": "minimal"}
```
**Result**: `"output configuration is required"`

**Attempt 2**: Added `output` object but without `mode`
```json
{"files": [...], "output": {"mode": "minimal"}}
```
**Result**: `"extract mode is required"`

### Resolution
Schema now has proper defaults:
- `extract` defaults to `"content"`
- `output.mode` defaults to `"standard"`

**Working call (minimal params):**
```json
{"files": [{"path": "package.json"}]}
```

---

## 2. precision_grep - JSON Escaping Issues ✅ FIXED

### Original Error

```bash
mcp-cli call plugin_goodvibes_precision-engine/precision_grep '{"queries": [{"id": "test", "pattern": "\"costUSD\"\\s*:"}]}'
```
**Result**: `SyntaxError: Bad escaped character in JSON at position 61`

### Resolution
PreToolUse hook (`tool-update.mjs`) now auto-fixes invalid JSON escapes:
- Parses JSON, transforms string values, re-serializes
- Handles all RFC 8259 escape sequences
- Doubles backslashes to survive Claude Code's stripping

**Now works:**
```bash
mcp-cli call plugin_goodvibes_precision-engine/precision_grep '{"queries": [{"id": "test", "pattern": "\"costUSD\"\\s*:"}], "output": {"mode": "count_only"}}'
```

---

## 3. discover - Path Scope Limitation ✅ FIXED

### Original Error

```json
{"queries": [{"id": "user_sessions", "type": "glob", "patterns": ["**/*.jsonl"]}]}
```
**Result**: 0 files found (only searched cwd)

### Resolution
Schema now includes `base_path` parameter:
```json
{
  "queries": [{"id": "hooks", "type": "glob", "patterns": ["**/*.mjs"]}],
  "base_path": "plugins/goodvibes/hooks"
}
```

---

## 4. precision_grep - Output Too Large ✅ MITIGATED

### Original Error
```
Error: result (1,649,189 characters) exceeds maximum allowed tokens.
```

### Resolution
- Use `output: {"mode": "count_only"}` for initial triage
- Schema now includes `max_line_length` option for truncation
- Response includes `truncated: true` indicator when results are capped

---

## 5. precision_write - JSON Escaping ✅ FIXED

### Original Error
```
SyntaxError: Bad escaped character in JSON at position 2490
```

### Resolution
Same as precision_grep - PreToolUse hook handles escaping automatically.

**Now works:**
```json
{"files": [{"path": "test.txt", "content": "Test with \"quotes\" and \\backslashes\\"}]}
```

---

## 6. Remaining Minor Issues

### Schema Inconsistencies ⚠️ MINOR

Some tools use:
- `output_mode` (top-level string) - precision_grep, precision_write
- `output.mode` (nested object) - precision_read

Both work, but naming differs. Not a blocker.

### Recommendations (Nice to Have)

1. **Standardize parameter naming** across all precision tools
2. **Improve error messages** to show which specific parameter is missing
3. **Document escape requirements** with examples (less critical now that hook handles it)

---

## Hook Implementation

The JSON escape issues are fixed by the PreToolUse hook at:
`plugins/goodvibes/hooks/scripts/tool-update.mjs`

Key features:
- Intercepts `mcp-cli call` commands
- Fixes invalid JSON escape sequences (e.g., `\s` → `\\s`)
- Handles embedded quotes (e.g., `"\"value\""`)
- Doubles all backslashes to survive Claude Code's stripping
- Handles all RFC 8259 escapes: `\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`, `\uXXXX`

---

*Originally documented: 2026-01-23*
*Verified fixed: 2026-01-25*
