# Discover Handler - Locations Mode Implementation

## Summary
Fixed the `discover` handler to properly implement the `locations` output mode for grep, glob, and symbols queries.

## Location
`plugins/goodvibes/tools/implementations/precision-engine/src/handlers/discover.ts`

## Changes Made

### 1. Added LocationInfo Interface
```typescript
interface LocationInfo {
  file: string;
  line: number;
  column: number;
  match?: string;
}
```

### 2. Updated QueryResult Interface
```typescript
interface QueryResult {
  type?: 'grep' | 'glob' | 'symbols';  // Added type field
  count: number;
  files?: string[];
  locations?: LocationInfo[];  // Added locations field
  error?: string;
}
```

### 3. Grep Query Locations Support
- When `output_mode === 'locations'`, use `locations` mode for precision_grep
- Extract file path, line number, column number, and match content from grep results
- Return format:
  ```json
  {
    "type": "grep",
    "count": 2,
    "locations": [
      { "file": "src/utils.ts", "line": 42, "column": 8, "match": "export const" },
      { "file": "src/helpers.ts", "line": 15, "column": 12, "match": "export const" }
    ]
  }
  ```

### 4. Glob Query Locations Support
- When `output_mode === 'locations'`, use `with_stats` mode for precision_glob
- For glob results, return file-level locations (line 1, column 1)
- Return format:
  ```json
  {
    "type": "glob",
    "count": 3,
    "locations": [
      { "file": "src/index.ts", "line": 1, "column": 1 },
      { "file": "src/app.ts", "line": 1, "column": 1 },
      { "file": "src/utils.ts", "line": 1, "column": 1 }
    ]
  }
  ```

### 5. Symbols Query Locations Support
- When `output_mode === 'locations'`, use `locations` mode for precision_symbols
- Extract symbol name, file path, line, and column from symbol results
- Return format:
  ```json
  {
    "type": "symbols",
    "count": 2,
    "locations": [
      { "file": "src/api.ts", "line": 10, "column": 14, "match": "handleRequest" },
      { "file": "src/utils.ts", "line": 25, "column": 14, "match": "handleError" }
    ]
  }
  ```

### 6. Error Handling Improvements
- Added proper handling for empty results based on output mode
- Return `locations: []` for locations mode when no results
- Return `files: []` for files_only mode when no results
- Return `count: 0` for count_only mode when no results

## Testing

### Test 1: Grep Query with Locations
```bash
mcp-cli call plugin_goodvibes_precision-engine/discover - <<'EOF'
{
  "queries": [
    {
      "id": "find-functions",
      "type": "grep",
      "pattern": "export.*function",
      "glob": "**/*.ts"
    }
  ],
  "output_mode": "locations"
}
EOF
```

Expected output includes `locations` array with file, line, column, and match.

### Test 2: Glob Query with Locations
```bash
mcp-cli call plugin_goodvibes_precision-engine/discover - <<'EOF'
{
  "queries": [
    {
      "id": "find-ts-files",
      "type": "glob",
      "patterns": ["**/*.ts"]
    }
  ],
  "output_mode": "locations"
}
EOF
```

Expected output includes `locations` array with file paths and line 1, column 1.

### Test 3: Symbols Query with Locations
```bash
mcp-cli call plugin_goodvibes_precision-engine/discover - <<'EOF'
{
  "queries": [
    {
      "id": "find-handlers",
      "type": "symbols",
      "query": "handle",
      "kinds": ["function"]
    }
  ],
  "output_mode": "locations"
}
EOF
```

Expected output includes `locations` array with symbol locations.

### Test 4: Mixed Queries with Locations
```bash
mcp-cli call plugin_goodvibes_precision-engine/discover - <<'EOF'
{
  "queries": [
    {
      "id": "grep-exports",
      "type": "grep",
      "pattern": "export const",
      "glob": "**/*.ts"
    },
    {
      "id": "glob-handlers",
      "type": "glob",
      "patterns": ["**/handlers/*.ts"]
    }
  ],
  "output_mode": "locations"
}
EOF
```

Expected output includes results for both queries with their respective locations arrays.

## Build Status
✅ TypeScript compilation successful
✅ Dist file correctly generated with locations mode support
✅ All output modes (count_only, files_only, locations) properly implemented

## Note
After deploying these changes, the MCP server (precision-engine) needs to be restarted for the changes to take effect in Claude Code or any other MCP client.

## Verification
Run the verification script to confirm the dist file includes the changes:
```bash
node test-discover-direct.cjs
```

All three checks should pass:
- Dist file includes locations mode code: true
- Dist file includes glob locations code: true
- Dist file includes symbols locations code: true
