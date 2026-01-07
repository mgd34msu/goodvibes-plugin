#!/usr/bin/env node
/**
 * @module error-handling/fix-floating-promises
 * @description Semi-automated fix for floating promises.
 * Identifies floating promises and suggests fixes.
 */

const fs = require('fs');

/**
 * Patterns that indicate a floating promise
 */
const ASYNC_PATTERNS = [
  // Known async function name patterns
  /^\s*(fetch|save|load|update|delete|create|send|post|get|put|init|start|stop|connect|disconnect)/i,
  // Method calls on known async objects
  /\.(query|execute|save|find|findOne|create|update|delete|remove|send|fetch)\s*\(/,
];

/**
 * Analyze a line for floating promise potential
 * @param {string} line - Source line
 * @param {number} lineNum - Line number
 * @returns {object|null} Fix suggestion or null
 */
function analyzeLine(line, lineNum) {
  const trimmed = line.trim();

  // Skip non-statements
  if (
    !trimmed ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('import') ||
    trimmed.startsWith('export') ||
    trimmed.startsWith('const') ||
    trimmed.startsWith('let') ||
    trimmed.startsWith('var') ||
    trimmed.startsWith('return') ||
    trimmed.startsWith('await') ||
    trimmed.startsWith('void') ||
    trimmed.startsWith('if') ||
    trimmed.startsWith('for') ||
    trimmed.startsWith('while') ||
    trimmed.startsWith('}') ||
    trimmed.startsWith('{')
  ) {
    return null;
  }

  // Check for function call pattern
  const funcCallMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$.]*)\s*\(/);
  if (!funcCallMatch) {
    return null;
  }

  // Check if it matches async patterns
  const isLikelyAsync = ASYNC_PATTERNS.some(pattern => pattern.test(trimmed));
  if (!isLikelyAsync) {
    return null;
  }

  // Determine fix type
  const funcName = funcCallMatch[1];
  const indent = line.match(/^(\s*)/)[1];

  // Suggest fix based on context
  return {
    line: lineNum,
    original: line,
    suggestions: [
      {
        type: 'await',
        description: 'Await the promise (if in async function)',
        code: `${indent}await ${trimmed}`,
      },
      {
        type: 'void-catch',
        description: 'Fire-and-forget with error handling',
        code: `${indent}void ${funcName}(...).catch((error: unknown) => {\n${indent}  console.error('${funcName} failed', { error });\n${indent}});`,
      },
      {
        type: 'assign',
        description: 'Assign to variable for later handling',
        code: `${indent}const ${funcName}Promise = ${trimmed}`,
      },
    ],
  };
}

/**
 * Process a file and generate fix suggestions
 * @param {string} filePath - Path to source file
 */
function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const suggestions = [];

  lines.forEach((line, index) => {
    const suggestion = analyzeLine(line, index + 1);
    if (suggestion) {
      suggestions.push(suggestion);
    }
  });

  if (suggestions.length === 0) {
    console.log('No floating promises detected.');
    return;
  }

  console.log(`Found ${suggestions.length} potential floating promises:\n`);

  suggestions.forEach((s, i) => {
    console.log(`--- Issue ${i + 1} (line ${s.line}) ---`);
    console.log(`Original: ${s.original.trim()}`);
    console.log('\nSuggested fixes:');
    s.suggestions.forEach((fix, j) => {
      console.log(`\n  ${j + 1}. ${fix.description}`);
      console.log(`     ${fix.code.split('\n').join('\n     ')}`);
    });
    console.log('\n');
  });
}

/**
 * Main entry point
 */
function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: fix-floating-promises.js <file.ts>');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  processFile(filePath);
}

main();
