#!/bin/bash
# Comprehensive test suite for mcp-cli-wrapper

set -e

echo "=== mcp-cli-wrapper Test Suite ==="
echo ""

echo "Test 1: --json-file with simple JSON"
node scripts/mcp-cli-wrapper.cjs call plugin_goodvibes_precision-engine/discover --json-file scripts/test-json-input.json > /dev/null
echo "✓ Simple JSON test passed"
echo ""

echo "Test 2: --json-file with complex JSON"
node scripts/mcp-cli-wrapper.cjs call plugin_goodvibes_precision-engine/discover --json-file scripts/test-complex-json.json > /dev/null
echo "✓ Complex JSON test passed"
echo ""

echo "Test 3: stdin input (pass-through)"
echo '{"queries":[{"id":"test","type":"glob","patterns":["*.md"]}],"output_mode":"count_only"}' | \
  node scripts/mcp-cli-wrapper.cjs call plugin_goodvibes_precision-engine/discover - > /dev/null
echo "✓ Stdin test passed"
echo ""

echo "Test 4: Non-call command (pass-through)"
node scripts/mcp-cli-wrapper.cjs servers > /dev/null
echo "✓ Pass-through test passed"
echo ""

echo "Test 5: Invalid file path (should fail gracefully)"
if node scripts/mcp-cli-wrapper.cjs call plugin_goodvibes_precision-engine/discover --json-file nonexistent.json 2>&1 | grep -q "Failed to read JSON file"; then
  echo "✓ Error handling test passed"
else
  echo "✗ Error handling test failed"
  exit 1
fi
echo ""

echo "=== All tests passed! ==="
