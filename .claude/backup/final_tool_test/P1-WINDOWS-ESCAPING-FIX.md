# P1 Fix: Windows JSON Escaping in precision_fetch

## Issue Description

**Priority:** P1
**File:** `precision-engine/src/handlers/precision-fetch.ts`
**Bug:** POST/PUT requests with `body` parameter fail on Windows due to JSON escaping issues

The `body_base64` parameter works correctly as a workaround, but the plain `body` parameter fails when JSON strings are passed through Windows CLI with shell escaping.

## Root Cause

When JSON is passed through the Windows command line (via mcp-cli), the shell can wrap the JSON string in quotes and escape internal quotes:

```bash
# What the user intends:
{"name":"test","value":123}

# What Windows CLI might pass:
"{\"name\":\"test\",\"value\":123}"
```

The original code didn't handle this wrapping, causing malformed request bodies.

## Solution Implemented

### 1. Windows CLI Escaping Detection

Added logic to detect and unwrap JSON strings that are wrapped in quotes (lines 293-300):

```typescript
// Handle Windows CLI escaping: if body is wrapped in quotes, unwrap it
if (requestBody.startsWith('"') && requestBody.endsWith('"')) {
  try {
    requestBody = JSON.parse(requestBody);
  } catch {
    // Not JSON-encoded, use as-is
  }
}
```

This safely unwraps the outer quotes and unescapes the internal quotes using JavaScript's built-in JSON.parse, which handles all JSON escaping correctly.

### 2. Auto Content-Type Detection

Added automatic Content-Type header for JSON bodies (lines 306-316):

```typescript
// Auto-set Content-Type for JSON bodies if not provided
if (!request.headers?.['Content-Type'] && !request.headers?.['content-type']) {
  try {
    JSON.parse(requestBody);
    fetchOptions.headers = {
      ...fetchOptions.headers,
      'Content-Type': 'application/json',
    };
  } catch {
    // Not JSON, don't set Content-Type
  }
}
```

This ensures JSON bodies are sent with the correct Content-Type header, even if the user doesn't specify it.

### 3. Improved Error Messages

Added body-specific error handling (lines 372-373):

```typescript
} else if (error.message.includes('body') || error.message.includes('Body')) {
  errorMessage = `Body error: ${error.message}. Try using body_base64 instead.`;
```

This provides helpful guidance when body-related errors occur, directing users to the reliable `body_base64` parameter.

## Changes Made

### File: `precision-engine/src/handlers/precision-fetch.ts`

**Lines 285-319:** Enhanced body parameter handling
- Detect and unwrap Windows CLI quoted JSON
- Auto-detect and set Content-Type for JSON bodies
- Improved variable scoping with explicit typing

**Lines 368-376:** Enhanced error handling
- Detect body-related errors
- Provide helpful message suggesting body_base64 alternative

**Lines 1-14:** Updated documentation
- Added feature notes about Windows CLI escaping handling
- Added feature notes about auto Content-Type detection

## Testing

Created comprehensive test suite: `final_tool_test/test-windows-escaping.mjs`

### Test Results

All tests pass:

1. **Normal JSON** - Works as expected
2. **Double-escaped JSON** (Windows CLI issue) - Now handled correctly
3. **JSON with newlines** - Properly preserved
4. **Base64 encoding** - Continues to work reliably
5. **JSON with quotes** - Properly escaped and parsed
6. **Nested JSON** - Complex structures handled correctly

## Backward Compatibility

- **Fully backward compatible** - All existing usage patterns continue to work
- **body_base64** parameter unchanged - Still the most reliable method
- **No breaking changes** - Only improvements to plain `body` handling

## Usage Examples

### Before (Required body_base64 workaround)

```bash
# Had to use base64 encoding
echo '{"name":"test","value":123}' | base64
# Then: mcp-cli call plugin/.../precision_fetch '{"urls":[{"url":"...","method":"POST","body_base64":"eyJuYW1lIjoidGVzdCIsInZhbHVlIjoxMjN9"}]}'
```

### After (Plain body now works on Windows)

```bash
# Can now use plain body parameter
mcp-cli call plugin/.../precision_fetch '{"urls":[{"url":"...","method":"POST","body":"{\"name\":\"test\",\"value\":123}"}]}'

# Or even simpler if your shell supports it
mcp-cli call plugin/.../precision_fetch '{"urls":[{"url":"...","method":"POST","body":{"name":"test","value":123}}]}'
```

### Auto Content-Type

```bash
# Content-Type: application/json is now set automatically for JSON bodies
# No need to manually specify headers for standard JSON API calls
```

## Build Verification

```bash
✓ TypeScript compilation successful
✓ Build completed: dist/index.cjs
✓ All tests passing
```

## Recommendation

- **body_base64** remains the recommended approach for complex JSON or when reliability is critical
- **body** parameter now safe to use for simple JSON on Windows CLI
- Auto Content-Type detection simplifies common use cases

## Related

- Original issue: P1 - POST/PUT body parameter Windows JSON escaping issue
- Workaround: body_base64 parameter (still recommended for complex cases)
- Impact: Improves Windows CLI user experience, reduces friction
