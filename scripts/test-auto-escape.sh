#!/bin/bash

# Test script for mcp-cli-auto JSON auto-escaping

echo "Testing mcp-cli-auto JSON auto-escaping"
echo "========================================"
echo

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRAPPER="$SCRIPT_DIR/mcp-cli-auto.cjs"

# Test 1: Valid JSON passes through
echo "Test 1: Valid JSON (should pass through unchanged)"
echo "{\"test\": \"hello\"}" | node "$WRAPPER" call plugin_goodvibes_precision-engine/discover -
echo

# Test 2: Invalid backslash-dot (regex literal dot)
echo "Test 2: Invalid \\. pattern (should auto-fix)"
cat > /tmp/test-invalid.json << "EOF"
{"queries": [{"id": "test", "type": "glob", "patterns": ["*.md"]}], "output_mode": "count_only"}
EOF
MCP_CLI_AUTO_DEBUG=1 node "$WRAPPER" call plugin_goodvibes_precision-engine/discover --json-file /tmp/test-invalid.json
echo

echo "All tests completed!"