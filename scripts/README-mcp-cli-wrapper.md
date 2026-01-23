# mcp-cli-wrapper

Enhanced mcp-cli with `--json-file` flag support for reading JSON input from files.

## Problem

Complex JSON with special characters can fail in heredocs due to shell escaping issues. For example:

```bash
# This can fail with certain special characters
mcp-cli call server/tool - <<'EOF'
{
  "pattern": "regex\with\backslashes",
  "data": "quotes \"and\" stuff"
}
EOF
```

## Solution

The `--json-file` flag allows you to store your JSON in a file and reference it, avoiding all heredoc escaping issues.

## Installation

The wrapper is located at `scripts/mcp-cli-wrapper.cjs` and automatically detects your mcp-cli installation.

## Usage

### 1. Using --json-file flag (NEW)

```bash
# Create a JSON file with your parameters
cat > my-query.json <<'EOF'
{
  "queries": [
    {
      "id": "find-components",
      "type": "glob",
      "patterns": ["src/**/*.tsx"]
    }
  ],
  "output_mode": "files_only"
}
EOF

# Call mcp-cli with the JSON file
node scripts/mcp-cli-wrapper.cjs call plugin_goodvibes_precision-engine/discover --json-file my-query.json
```

### 2. Using stdin (pass-through)

```bash
echo '{"queries":[{"id":"test","type":"glob","patterns":["*.md"]}],"output_mode":"count_only"}' | \
  node scripts/mcp-cli-wrapper.cjs call plugin_goodvibes_precision-engine/discover -
```

### 3. Using inline JSON (pass-through)

```bash
node scripts/mcp-cli-wrapper.cjs call server/tool '{"key":"value"}'
```

### 4. Other mcp-cli commands (pass-through)

All other mcp-cli commands work exactly the same:

```bash
node scripts/mcp-cli-wrapper.cjs servers
node scripts/mcp-cli-wrapper.cjs tools
node scripts/mcp-cli-wrapper.cjs info server/tool
```

## Features

- **JSON file validation**: Validates JSON before sending to mcp-cli
- **Error handling**: Clear error messages for missing files or invalid JSON
- **Full compatibility**: All existing mcp-cli commands work without changes
- **Auto-detection**: Automatically finds your mcp-cli installation on Windows
- **Cross-platform ready**: Designed to work on Windows with easy extension for other platforms

## Benefits of --json-file

1. **No escaping issues**: Store complex JSON with any special characters
2. **Reusability**: Save commonly used queries as files
3. **Version control**: Commit your JSON queries to git
4. **Better formatting**: Use proper JSON formatting tools
5. **Easier debugging**: Edit and test JSON files independently

## Examples

### Complex grep query

```bash
# Create query file
cat > find-todos.json <<'EOF'
{
  "queries": [
    {
      "id": "todos",
      "type": "grep",
      "pattern": "TODO|FIXME|XXX",
      "glob": "**/*.{ts,tsx,js,jsx}"
    }
  ],
  "output_mode": "locations"
}
EOF

# Execute
node scripts/mcp-cli-wrapper.cjs call plugin_goodvibes_precision-engine/discover --json-file find-todos.json
```

### Batch operation

```bash
# Create batch config
cat > refactor-batch.json <<'EOF'
{
  "id": "refactor-imports",
  "operations": {
    "read": [
      {
        "id": "scan-imports",
        "type": "glob",
        "patterns": ["src/**/*.ts"]
      }
    ]
  },
  "config": {
    "execution": {
      "mode": "parallel"
    }
  }
}
EOF

node scripts/mcp-cli-wrapper.cjs call plugin_goodvibes_batch-engine/batch --json-file refactor-batch.json
```

## Technical Details

### How it works

1. Detects `--json-file` flag in arguments
2. Reads and validates JSON from the specified file
3. Removes `--json-file` and the file path from arguments
4. Pipes the JSON content to mcp-cli via stdin
5. For all other cases, passes arguments directly to mcp-cli

### mcp-cli detection

The wrapper automatically finds mcp-cli by checking:
1. `%USERPROFILE%\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\cli.js`
2. `%USERPROFILE%\.npm-global\node_modules\@anthropic-ai\claude-code\cli.js`
3. Falls back to `mcp-cli` command if found in PATH

## Testing

Test files are provided:
- `scripts/test-json-input.json` - Simple test
- `scripts/test-complex-json.json` - Complex multi-query test

Run tests:
```bash
# Test with simple JSON
node scripts/mcp-cli-wrapper.cjs call plugin_goodvibes_precision-engine/discover --json-file scripts/test-json-input.json

# Test with complex JSON
node scripts/mcp-cli-wrapper.cjs call plugin_goodvibes_precision-engine/discover --json-file scripts/test-complex-json.json

# Test pass-through
node scripts/mcp-cli-wrapper.cjs servers
```

## Troubleshooting

### Error: Failed to read JSON file

Make sure the file path is correct and the file exists.

### Error: Invalid JSON in file

Validate your JSON using a tool like `jq`:
```bash
jq . my-query.json
```

### mcp-cli not found

The wrapper couldn't locate your mcp-cli installation. You may need to:
1. Ensure Claude Code CLI is installed
2. Update the `getMcpCliCommand()` function with your installation path

## Future Enhancements

- Support for YAML input files
- JSON schema validation
- Template variable substitution
- Multi-file support (combine multiple JSON files)
