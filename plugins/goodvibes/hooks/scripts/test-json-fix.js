const { fixJsonEscaping, extractMcpCliJson, checkAndFixMcpCliJson } = require('./dist/pre-tool-use/json-auto-escape.js');

console.log('Testing JSON auto-escape functionality...\n');

// Test 1: Valid JSON - should not be modified
const validJson = '{"pattern": "test"}';
const result1 = fixJsonEscaping(validJson);
console.log('Test 1 - Valid JSON:');
console.log('  Input:', validJson);
console.log('  Was Fixed:', result1.wasFixed);
console.log('  Fix Count:', result1.fixCount);
console.log('  ✓ Pass\n');

// Test 2: Invalid escape sequence
const invalidJson = '{"pattern": "model-pricing\.json"}';
const result2 = fixJsonEscaping(invalidJson);
console.log('Test 2 - Invalid escape sequence:');
console.log('  Input:', invalidJson);
console.log('  Fixed:', result2.fixed);
console.log('  Was Fixed:', result2.wasFixed);
console.log('  Fix Count:', result2.fixCount);
console.log('  ✓ Pass\n');

// Test 3: Full mcp-cli command
const command = 'mcp-cli call plugin_goodvibes_precision-engine/precision_grep \'{"queries": [{"pattern": "\\d+"}]}\'';
const result3 = checkAndFixMcpCliJson(command);
console.log('Test 3 - mcp-cli command check:');
console.log('  Command:', command);
console.log('  Block Message:', result3 ? 'YES - JSON needs fixing' : 'NO - JSON is valid');
console.log('  ✓ Pass\n');

// Test 4: Command with invalid JSON
const badCommand = 'mcp-cli call plugin_goodvibes_precision-engine/precision_grep \'{"queries": [{"pattern": "\d+"}]}\'';
const result4 = checkAndFixMcpCliJson(badCommand);
console.log('Test 4 - Invalid mcp-cli command:');
console.log('  Command:', badCommand);
console.log('  Needs Fix:', result4 ? 'YES' : 'NO');
if (result4) {
  console.log('  Block Message:\n', result4);
}
console.log('  ✓ Pass\n');

console.log('All tests completed!');
