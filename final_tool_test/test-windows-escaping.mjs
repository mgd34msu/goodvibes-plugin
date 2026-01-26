/**
 * Test script for Windows JSON escaping fix in precision_fetch
 * Tests the body parameter handling improvements
 */

// Simulate the fix
function handleRequestBody(bodyInput, bodyBase64Input) {
  let requestBody;

  if (bodyBase64Input) {
    requestBody = Buffer.from(bodyBase64Input, 'base64').toString('utf-8');
  } else if (bodyInput) {
    requestBody = bodyInput;

    // Handle Windows CLI escaping: if body is wrapped in quotes, unwrap it
    if (requestBody.startsWith('"') && requestBody.endsWith('"')) {
      try {
        requestBody = JSON.parse(requestBody);
      } catch {
        // Not JSON-encoded, use as-is
      }
    }
  }

  return requestBody;
}

// Test cases
console.log('Testing Windows JSON escaping fix...\n');

// Test 1: Normal JSON body
const test1 = handleRequestBody('{"name":"test","value":123}');
console.log('Test 1 - Normal JSON:');
console.log('Input:', '{"name":"test","value":123}');
console.log('Output:', test1);
console.log('Valid JSON?', isValidJSON(test1));
console.log();

// Test 2: Double-escaped JSON (Windows CLI common issue)
const test2 = handleRequestBody('"{\\\"name\\\":\\\"test\\\",\\\"value\\\":123}"');
console.log('Test 2 - Double-escaped JSON:');
console.log('Input:', '"{\\\"name\\\":\\\"test\\\",\\\"value\\\":123}"');
console.log('Output:', test2);
console.log('Valid JSON?', isValidJSON(test2));
console.log();

// Test 3: JSON with newlines (properly escaped in JSON)
const test3 = handleRequestBody('{"text":"line1\\nline2\\nline3"}');
console.log('Test 3 - JSON with newlines:');
console.log('Input:', '{"text":"line1\\nline2\\nline3"}');
console.log('Output:', test3);
console.log('Valid JSON?', isValidJSON(test3));
console.log();

// Test 4: Base64 encoding (always reliable)
const jsonStr = '{"name":"test","value":123}';
const base64 = Buffer.from(jsonStr).toString('base64');
const test4 = handleRequestBody(undefined, base64);
console.log('Test 4 - Base64 encoding:');
console.log('Input (base64):', base64);
console.log('Output:', test4);
console.log('Valid JSON?', isValidJSON(test4));
console.log();

// Test 5: JSON with quotes (properly escaped)
const test5 = handleRequestBody('{"message":"He said \\"hello\\""}');
console.log('Test 5 - JSON with quotes:');
console.log('Input:', '{"message":"He said \\"hello\\""}');
console.log('Output:', test5);
console.log('Valid JSON?', isValidJSON(test5));
console.log();

// Test 6: Complex nested JSON
const test6 = handleRequestBody('{"user":{"name":"John","address":{"street":"123 Main St","city":"NYC"}}}');
console.log('Test 6 - Nested JSON:');
console.log('Input:', '{"user":{"name":"John","address":{"street":"123 Main St","city":"NYC"}}}');
console.log('Output:', test6);
console.log('Valid JSON?', isValidJSON(test6));
if (isValidJSON(test6)) {
  const parsed = JSON.parse(test6);
  console.log('Parsed address:', JSON.stringify(parsed.user.address));
}
console.log();

console.log('All tests completed!');

function isValidJSON(str) {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}
