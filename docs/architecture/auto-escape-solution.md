# Automatic JSON Escaping Solution

## Problem Statement

When agents use MCP tools via `mcp-cli`, they write JSON like:
```json
{"pattern": "model-pricing\\.json"}
```

This fails because `\.` is not a valid JSON escape sequence. The agent is expected to either:
1. Double-escape: `"pattern": "model-pricing\\\\.json"` (ugly, error-prone)
2. Use base64: `"pattern_base64": "bW9kZWwtcHJpY2luZ1wuanNvbg"` (agent will forget)

**Core insight**: The agent will NEVER remember to encode. The solution must be automatic and invisible.

## Solution Architecture

### Option A: Pre-Processing Wrapper (RECOMMENDED)

**Location**: `scripts/mcp-cli-auto.cjs` - A wrapper that intercepts JSON before parsing.

**Strategy**: Use a lenient JSON parser that auto-fixes common escaping issues.

```
Agent writes JSON -> mcp-cli-auto intercepts -> Fixes escaping -> mcp-cli receives valid JSON
```

### Option B: Hook-Based Interception

**Location**: Claude Code plugin hooks system

**Pros**: Integrated into existing system
**Cons**: Hooks fire AFTER JSON is already parsed by Claude Code

### Option C: Handler-Level Smart Parsing (RECOMMENDED SUPPLEMENT)

**Location**: Each precision-engine handler

**Strategy**: Handlers accept "lenient" input and auto-fix internally.

## Recommended Implementation: Smart Wrapper

### Key Insight

The JSON parsing fails BEFORE it reaches the handlers. The `pattern_base64` support in handlers is useless if the JSON never parses.

Therefore, the fix MUST happen at the wrapper level, BEFORE JSON.parse().

### Implementation Plan

#### Step 1: Create `scripts/mcp-cli-auto.cjs`

This wrapper will:
1. Intercept `mcp-cli call` commands
2. Extract the JSON argument
3. Apply lenient parsing with auto-escaping
4. Pass fixed JSON to real mcp-cli via stdin

#### Step 2: Lenient JSON Parsing Algorithm

```javascript
function fixJsonEscaping(jsonString) {
  // Fast path: valid JSON
  try {
    JSON.parse(jsonString);
    return jsonString;
  } catch (e) {
    // Continue to fix
  }

  // Strategy: Identify string values and fix backslash escaping
  // We use a state machine approach to find string boundaries
  let result = '';
  let inString = false;
  let i = 0;

  while (i < jsonString.length) {
    const char = jsonString[i];
    const nextChar = jsonString[i + 1];

    if (char === '"' && (i === 0 || jsonString[i - 1] !== '\\')) {
      inString = !inString;
      result += char;
      i++;
      continue;
    }

    if (inString && char === '\\') {
      // Check if this is a valid JSON escape
      const validEscapes = ['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'];

      if (nextChar && !validEscapes.includes(nextChar)) {
        // Invalid escape - this is likely a regex pattern
        // Double the backslash to make it valid JSON
        result += '\\\\';
        i++;
        continue;
      }
    }

    result += char;
    i++;
  }

  // Verify the fix worked
  try {
    JSON.parse(result);
    return result;
  } catch (e) {
    // If still failing, return original and let mcp-cli report the error
    return jsonString;
  }
}
```

#### Step 3: Update Shell Alias

In `.bashrc` or `.zshrc`:
```bash
alias mcp-cli='node /path/to/vibeplug/scripts/mcp-cli-auto.cjs'
```

## Technical Details

### JSON Escape Sequences (Valid)

| Sequence | Meaning |
|----------|---------|
| `\"` | Double quote |
| `\\` | Backslash |
| `\/` | Forward slash |
| `\b` | Backspace |
| `\f` | Form feed |
| `\n` | Newline |
| `\r` | Carriage return |
| `\t` | Tab |
| `\uXXXX` | Unicode |

### Regex Escapes (INVALID in JSON)

| Sequence | Regex Meaning | Auto-Fix |
|----------|---------------|----------|
| `\.` | Literal dot | `\\.` |
| `\d` | Digit | `\\d` |
| `\w` | Word char | `\\w` |
| `\s` | Whitespace | `\\s` |
| `\[` | Literal bracket | `\\[` |
| `\(` | Literal paren | `\\(` |

### Edge Case: `\b`

`\b` is valid JSON (backspace) but also a regex word boundary.

The auto-fix will NOT modify `\b` because it's technically valid JSON.

If users need `\b` as a word boundary in regex, they must write `\\b` or use base64.

## File Structure

```
scripts/
  mcp-cli-auto.cjs         # Main wrapper with auto-escaping (NEW)
  mcp-cli-wrapper.cjs      # Existing --json-file wrapper (keep as backup)
  test-auto-escape.sh      # Test script for auto-escaping (NEW)
```

## Success Criteria

- [ ] Agent can write: `"pattern": "model-pricing\\.json"`
- [ ] System automatically converts to valid JSON
- [ ] No manual encoding required
- [ ] Clear error messages when auto-fix fails
- [ ] Tests pass for common regex patterns

## Decision Record

**ID**: ADR-001
**Date**: 2026-01-23
**Status**: Proposed

### Context
Agents using MCP tools consistently fail to properly escape regex patterns in JSON. The `pattern_base64` workaround is never used because agents don't remember to encode.

### Decision
Implement automatic JSON escaping at the wrapper level via `mcp-cli-auto.cjs`.

### Consequences

#### Positive
- Agents can write natural regex patterns
- No manual intervention required
- Backwards compatible (valid JSON passes through unchanged)

#### Negative
- Slight overhead for JSON validation/fixing
- Edge cases with `\b` may confuse users
- Another layer in the stack
