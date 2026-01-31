# Shell Escaping Errors Analysis

Documentation of errors encountered during the cost analysis article writing session.

---

## Error 1: Heredoc with JavaScript Template Literals

### Goal
Write a Node.js script to file that uses template literals for string interpolation.

### Approach
```bash
cat > script.js << 'ENDSCRIPT'
const x = `Value: ${data.value}`;
ENDSCRIPT
```

### Error
```
Bad substitution: result.subagents.mcpCallPercent.toFixed
```

### Root Cause
Bash interprets `${...}` as variable substitution even inside single-quoted heredocs.

### Solutions
1. **Base64 encode content**: Encode the entire script content as base64, then decode when writing
2. **Use precision_write with content_base64**: The MCP tool supports base64 input to avoid shell parsing

---

## Error 2: Node.js /dev/stdin on Windows

### Goal
Pipe content to Node.js for base64 encoding.

### Error
```
Error: ENOENT: no such file or directory, open 'C:\dev\stdin'
```

### Root Cause
Windows does not have /dev/stdin. Node.js on Windows interprets it as a literal file path.

### Solutions
1. **Use process.stdin**: Instead of readFileSync('/dev/stdin'), use Node's process.stdin stream
2. **Platform detection**: Check process.platform === 'win32' and use appropriate method
3. **Windows temp directory**: Use %TEMP% or C:/Users/<user>/AppData/Local/Temp instead of /tmp

---

## Error 3: Bash History Expansion with !

### Goal
Run inline JavaScript with conditional logic.

### Error
```
Expected unicode escape
SyntaxError: Invalid or unexpected token
```

### Root Cause
Bash interprets ! in double quotes as history expansion.

### Solutions
1. **Use single quotes**: node -e 'if(!s) continue;'
2. **Escape the !**: set +H to disable history expansion

---

## Error 4: mcp-cli call with Complex JSON

### Goal
Call precision_write with multi-line content containing special characters.

### Error
```
unexpected EOF while looking for matching '"
```

### Root Cause
Double quotes inside JSON conflict with shell quoting.

### Solutions
1. **Use content_base64**: Encode content as base64 to avoid all escaping issues
2. **Use stdin**: mcp-cli call tool - <<'EOF'\n{json}\nEOF

---

## Error 5: Windows Path for /tmp

### Error
```
ENOENT: no such file or directory, open 'C:\tmp\output.json'
```

### Solutions
1. **Platform-aware temp directory**: Use os.tmpdir() in Node.js or $TEMP in bash
2. **Project-relative paths**: Use ./tmp/ or ./scripts/ within the project

---

## Error 6: PowerShell Variable Interpolation

### Root Cause
Nested shell calls (bash -> PowerShell) create multiple layers of interpretation.

### Solutions
1. **Avoid nested shells**: Do not call PowerShell from bash
2. **Write PowerShell script to file first**: Then execute it

---

## Error 7: JavaScript Backticks in Bash

### Root Cause
Backticks are legacy command substitution in bash. They are interpreted before the string is passed to node.

### Solutions
1. **Escape backticks**: \`
2. **Write to file**: Avoid inline code entirely

---

# Generalized Solutions

## 1. Base64 Encoding Layer (P1)

Build a pre-processing layer that detects shell-unsafe characters and automatically base64 encodes.

## 2. Platform-Aware Path Handling (P1)

Map Unix paths to Windows equivalents: /tmp -> %TEMP%, /dev/stdin -> process.stdin

## 3. Shell-Safe JSON Serialization (P2)

Detect if JSON contains shell-unsafe characters and use stdin or file-based approach.

## 4. Pre-Execution Command Validation (P2)

Parse commands before execution to identify potential escaping issues.

## Implementation Priority

| Solution | Impact | Effort | Priority |
|----------|--------|--------|----------|
| Base64 Encoding Layer | High | Low | P1 |
| Platform-Aware Paths | Medium | Low | P1 |
| Shell-Safe JSON | High | Medium | P2 |
| Pre-Execution Validation | Medium | Medium | P2 |

The highest ROI is **base64 encoding** and **platform-path mapping** - both solve multiple error classes with minimal implementation effort.