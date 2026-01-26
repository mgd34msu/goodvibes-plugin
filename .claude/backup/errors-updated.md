# Precision Engine Errors (Updated)

Remaining issues after tool updates. Internal bugs have been fixed.

---

## Error 1: CRLF Line Ending Mismatch

**Problem:**
When editing Windows files (CRLF/`\r\n`), patterns using Unix line endings (LF/`\n`) fail to match.

```bash
mcp-cli call plugin_goodvibes_precision-engine/precision_edit - <<'EOF'
{
  "edits": [{
    "file": "windows-file.ts",
    "find": "function test() {\n  console.log('hello');\n}",
    "replace": "function test() {\n  console.log('world');\n}"
  }]
}
EOF
```

**Error:**
```json
{
  "status": "not_found",
  "error": "{\"message\":\"Pattern not found\",\"closest_matches\":[{\"line\":1,\"similarity\":1,\"preview\":\"function test() {\\r\"}]}"
}
```

**Cause:**
The file contains `\r\n` (CRLF) but the pattern uses `\n` (LF). The `whitespace_sensitive: false` option only affects spaces/tabs, not line endings.

**Solution:**
Use `find_base64` and `replace_base64` with properly encoded CRLF content:

```bash
# Generate base64 with CRLF line endings
printf 'function test() {\r\n  console.log('\''hello'\'');\r\n}' | base64 -w0
# Output: ZnVuY3Rpb24gdGVzdCgpIHsNCiAgY29uc29sZS5sb2coJ2hlbGxvJyk7DQp9

printf 'function test() {\r\n  console.log('\''world'\'');\r\n}' | base64 -w0
# Output: ZnVuY3Rpb24gdGVzdCgpIHsNCiAgY29uc29sZS5sb2coJ3dvcmxkJyk7DQp9

# Use base64 in the edit
mcp-cli call plugin_goodvibes_precision-engine/precision_edit - <<'EOF'
{
  "edits": [{
    "file": "windows-file.ts",
    "find_base64": "ZnVuY3Rpb24gdGVzdCgpIHsNCiAgY29uc29sZS5sb2coJ2hlbGxvJyk7DQp9",
    "replace_base64": "ZnVuY3Rpb24gdGVzdCgpIHsNCiAgY29uc29sZS5sb2coJ3dvcmxkJyk7DQp9"
  }]
}
EOF
```

---

## Error 2: Regex Escapes Fail with Heredoc/Stdin

**Problem:**
When using heredoc (`<<'EOF'`) or stdin (`-`), regex escape sequences like `\(`, `\)`, `\s` cause JSON parse errors.

```bash
mcp-cli call plugin_goodvibes_precision-engine/precision_edit - <<'EOF'
{
  "edits": [{
    "file": "test.ts",
    "find": "console\\.log\\(.*\\)",
    "replace": "console.log('updated')"
  }],
  "match": {"mode": "regex"}
}
EOF
```

**Error:**
```
Error: Invalid JSON arguments
SyntaxError: Bad escaped character in JSON at position 69 (line 4 column 26)
```

**Cause:**
The heredoc bypasses the tool-update hook which normally fixes escape sequences. The hook only intercepts inline JSON arguments (`mcp-cli call tool '{...}'`), not stdin input.

**Solution 1: Use Inline JSON (Recommended)**
The hook automatically fixes escapes for inline JSON:

```bash
mcp-cli call plugin_goodvibes_precision-engine/precision_edit '{"edits": [{"file": "test.ts", "find": "console\\.log\\(.*\\)", "replace": "console.log(\"updated\")"}], "match": {"mode": "regex"}}'
```

**Solution 2: Double-Escape for Heredoc**
If you must use heredoc, manually double-escape all backslashes:

```bash
mcp-cli call plugin_goodvibes_precision-engine/precision_edit - <<'EOF'
{
  "edits": [{
    "file": "test.ts",
    "find": "console\\\\.log\\\\(.*\\\\)",
    "replace": "console.log('updated')"
  }],
  "match": {"mode": "regex"}
}
EOF
```

Escape mapping:
- `\s` → `\\s` (regex whitespace)
- `\(` → `\\(` (literal parenthesis)
- `\.` → `\\.` (literal dot)
- `\r?\n` → `\\r?\\n` (line endings)

---

## Quick Reference

| Scenario | Solution |
|----------|----------|
| Windows CRLF files | Use `find_base64`/`replace_base64` |
| Regex with special chars | Use inline JSON (not heredoc) |
| Complex multiline edits | Use `find_base64`/`replace_base64` |
| Simple exact match | Standard `find`/`replace` works fine |
