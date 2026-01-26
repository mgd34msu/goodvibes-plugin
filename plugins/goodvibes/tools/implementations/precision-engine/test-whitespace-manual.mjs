/**
 * Manual test for whitespace-insensitive matching fix
 */

// Simulate the normalizeWhitespace function
function normalizeWhitespace(str) {
  return str.replace(/\s+/g, ' ').trim();
}

// The fixed implementation
function findWhitespaceInsensitiveMatches(content, pattern) {
  const normalizedPattern = normalizeWhitespace(pattern);
  const matches = [];

  let pos = 0;
  while (pos < content.length) {
    let scanPos = pos;
    let patternPos = 0;
    let matchStart = -1;
    let matchEnd = -1;

    while (scanPos < content.length && patternPos < normalizedPattern.length) {
      // Skip whitespace in content
      while (scanPos < content.length && /\s/.test(content[scanPos])) {
        if (matchStart === -1) scanPos++;
        else break;
      }

      // Skip whitespace in pattern
      while (patternPos < normalizedPattern.length && /\s/.test(normalizedPattern[patternPos])) {
        patternPos++;
        while (scanPos < content.length && /\s/.test(content[scanPos])) {
          scanPos++;
        }
      }

      if (patternPos >= normalizedPattern.length) break;
      if (scanPos >= content.length) break;

      if (matchStart === -1) matchStart = scanPos;

      if (content[scanPos] === normalizedPattern[patternPos]) {
        scanPos++;
        patternPos++;
        matchEnd = scanPos;
      } else {
        break;
      }
    }

    if (patternPos === normalizedPattern.length && matchStart !== -1) {
      matches.push({
        index: matchStart,
        length: matchEnd - matchStart
      });
      pos = matchEnd;
    } else {
      pos++;
    }
  }

  return matches;
}

// Test cases
const testCases = [
  {
    name: "Extra spaces in content",
    content: "Mixed   Spacing   Here",
    pattern: "Mixed Spacing Here",
    expectedMatches: 1
  },
  {
    name: "Tab characters",
    content: "Tab\tWhitespace\tIgnored",
    pattern: "Tab Whitespace Ignored",
    expectedMatches: 1
  },
  {
    name: "Mixed whitespace",
    content: "Hello  \t  World",
    pattern: "Hello World",
    expectedMatches: 1
  },
  {
    name: "Multiple matches",
    content: "Test   One and Test  Two",
    pattern: "Test One",
    expectedMatches: 1
  },
  {
    name: "Normal spacing (should still work)",
    content: "Normal Spacing",
    pattern: "Normal Spacing",
    expectedMatches: 1
  }
];

console.log('Testing whitespace-insensitive matching fix\n');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

for (const test of testCases) {
  console.log(`\nTest: ${test.name}`);
  console.log(`Content: "${test.content}"`);
  console.log(`Pattern: "${test.pattern}"`);

  const matches = findWhitespaceInsensitiveMatches(test.content, test.pattern);

  console.log(`Found ${matches.length} match(es):`);

  for (const match of matches) {
    const matched = test.content.substring(match.index, match.index + match.length);
    console.log(`  - Position ${match.index}, length ${match.length}: "${matched}"`);

    // Verify the match is correct by normalizing both
    const normalizedMatch = normalizeWhitespace(matched);
    const normalizedPattern = normalizeWhitespace(test.pattern);

    if (normalizedMatch === normalizedPattern) {
      console.log(`    ✅ Match is correct (normalizes to "${normalizedPattern}")`);
    } else {
      console.log(`    ❌ Match is WRONG! Got "${normalizedMatch}", expected "${normalizedPattern}"`);
    }
  }

  if (matches.length === test.expectedMatches) {
    console.log(`✅ PASSED`);
    passed++;
  } else {
    console.log(`❌ FAILED (expected ${test.expectedMatches} matches, got ${matches.length})`);
    failed++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`\nResults: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\n🎉 All tests passed! The fix works correctly.');
} else {
  console.log('\n❌ Some tests failed. There may be issues with the implementation.');
}
