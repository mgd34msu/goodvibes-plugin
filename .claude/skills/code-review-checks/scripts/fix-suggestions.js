#!/usr/bin/env node
/**
 * Provides fix suggestions for common code issues.
 * Reads output from check-all.js and suggests remediation.
 *
 * @example
 * node check-all.js --path src/ --json | node fix-suggestions.js
 * node fix-suggestions.js --file issues.json
 */

import { readFileSync, existsSync } from 'fs';
import { relative } from 'path';

const FIX_TEMPLATES = {
  asAny: {
    title: 'Replace "as any" with proper types',
    steps: [
      '1. Identify the actual type of the value',
      '2. Create an interface or type alias if needed',
      '3. Use that type instead of "as any"',
      '4. For test mocks, create mock factories with proper types'
    ],
    example: `// WRONG
const data = response as any;

// RIGHT
interface ApiResponse { id: string; name: string; }
const data = response as ApiResponse;

// For tests - create mock factories
import { createMockResponse } from './test-utils/mock-factories';
const mockData = createMockResponse({ id: '1', name: 'Test' });`
  },

  deprecated: {
    title: 'Remove or update deprecated code',
    steps: [
      '1. Check if the deprecated function is still used',
      '2. If used: update all callers to use the replacement',
      '3. Delete the deprecated function',
      '4. If no replacement exists, remove @deprecated tag'
    ],
    example: `// WRONG - deprecated function still exists
/** @deprecated Use newFunction instead */
export function oldFunction() { }

// RIGHT - delete it after updating callers
// (file: oldFunction.ts deleted)
// All callers now use newFunction()`
  },

  hardcodedSecrets: {
    title: 'Use environment variables for secrets',
    steps: [
      '1. Move secret to .env file (add to .gitignore)',
      '2. Add variable name to .env.example (without value)',
      '3. Read from process.env in code',
      '4. Add validation for required env vars at startup'
    ],
    example: `// WRONG
const apiKey = "sk_live_abc123";

// RIGHT
// .env (gitignored)
API_KEY=sk_live_abc123

// .env.example (committed)
API_KEY=

// code
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY environment variable is required');
}`
  },

  silentCatch: {
    title: 'Add proper error logging in catch blocks',
    steps: [
      '1. Remove the underscore prefix from error parameter',
      '2. Import the debug/logging utility',
      '3. Log the error with context',
      '4. Then handle gracefully (return null, throw, etc.)'
    ],
    example: `// WRONG
catch (_error) {
  return null;
}

// RIGHT
import { debug } from './shared/logging.js';

catch (error: unknown) {
  debug('Operation failed', {
    error: error instanceof Error ? error.message : String(error),
    context: { filePath, operation: 'readConfig' }
  });
  return null;
}`
  },

  emptyCatch: {
    title: 'Handle or log errors in catch blocks',
    steps: [
      '1. Add error logging at minimum',
      '2. Consider if the error should propagate',
      '3. Document why ignoring is acceptable if truly ok'
    ],
    example: `// WRONG
catch (error) { }

// RIGHT (if truly ignorable)
catch (error: unknown) {
  // Expected: file may not exist on first run
  debug('File not found, using defaults', { error });
}`
  },

  consoleLog: {
    title: 'Replace console.log with proper logging',
    steps: [
      '1. Import the debug utility from shared/logging.js',
      '2. Replace console.log with debug()',
      '3. Add structured context object',
      '4. Use appropriate log level (debug, info, warn, error)'
    ],
    example: `// WRONG
console.log('Processing file:', filePath);

// RIGHT
import { debug } from './shared/logging.js';
debug('Processing file', { filePath, size: stats.size });`
  },

  anyType: {
    title: 'Replace any with unknown and narrow',
    steps: [
      '1. Change "any" to "unknown"',
      '2. Add type guards before using the value',
      '3. Create proper types for known shapes',
      '4. Use generics for flexible functions'
    ],
    example: `// WRONG
function parse(data: any) {
  return data.value;
}

// RIGHT
function parse(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return String((data as { value: unknown }).value);
  }
  throw new Error('Invalid data format');
}`
  },

  mutableDefault: {
    title: 'Use immutable default pattern',
    steps: [
      '1. Make parameter optional with ?',
      '2. Use nullish coalescing inside function',
      '3. Create new array/object, never mutate'
    ],
    example: `// WRONG
function addItem(items = []) {
  items.push('new');  // Mutates shared default!
  return items;
}

// RIGHT
function addItem(items?: string[]): string[] {
  const list = items ?? [];
  return [...list, 'new'];  // Returns new array
}`
  },

  sequentialAsync: {
    title: 'Use Promise.all for independent operations',
    steps: [
      '1. Identify if operations are truly independent',
      '2. Wrap in Promise.all with map',
      '3. Handle individual failures if needed'
    ],
    example: `// WRONG - 8x slower
for (const file of files) {
  await processFile(file);
}

// RIGHT - 8x faster
await Promise.all(files.map(file => processFile(file)));

// With error handling
const results = await Promise.allSettled(
  files.map(file => processFile(file))
);`
  },

  functionLength: {
    title: 'Extract helper functions',
    steps: [
      '1. Identify distinct logical sections',
      '2. Create named helper for each section',
      '3. Main function calls helpers in sequence',
      '4. Each helper should do ONE thing'
    ],
    example: `// WRONG - 100+ line function
function processRequest(req) {
  // validation (30 lines)
  // parsing (25 lines)
  // transformation (35 lines)
  // formatting (20 lines)
}

// RIGHT - composed small functions
function validateRequest(req): ValidationResult { /* 15 lines */ }
function parseRequestData(req): ParsedData { /* 12 lines */ }
function transformData(data): TransformedData { /* 18 lines */ }
function formatResponse(data): Response { /* 10 lines */ }

function processRequest(req): Response {
  const validation = validateRequest(req);
  if (!validation.ok) return errorResponse(validation.error);
  const parsed = parseRequestData(req);
  const transformed = transformData(parsed);
  return formatResponse(transformed);
}`
  },

  fileLength: {
    title: 'Split large file into modules',
    steps: [
      '1. Identify logical groupings (by feature, type, responsibility)',
      '2. Create subdirectory with focused files',
      '3. Create barrel index.ts for public API',
      '4. Update imports in other files'
    ],
    example: `// WRONG - 500 line file
// src/handlers.ts (contains auth, user, admin handlers)

// RIGHT - split by domain
src/handlers/
  index.ts        # export { authHandler, userHandler, adminHandler }
  auth.ts         # auth-related handlers
  user.ts         # user-related handlers
  admin.ts        # admin-related handlers`
  },

  missingBarrel: {
    title: 'Create barrel file for module',
    steps: [
      '1. Create index.ts in the directory',
      '2. Export public functions and types',
      '3. Use "export type" for type-only exports',
      '4. Re-export from subdirectories if needed'
    ],
    example: `// src/context/index.ts
export { analyzeEnvironment, formatEnvStatus } from './environment.js';
export { gatherProjectContext } from './context-builder.js';
export type { EnvironmentContext, EnvStatus } from './types.js';`
  },

  magicNumber: {
    title: 'Extract to named constant',
    steps: [
      '1. Create descriptive SCREAMING_SNAKE_CASE name',
      '2. Add comment explaining the value',
      '3. Group related constants together',
      '4. Consider creating constants file for shared values'
    ],
    example: `// WRONG
if (retries > 3) { }
setTimeout(fn, 30000);

// RIGHT
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 30000;

if (retries > MAX_RETRY_ATTEMPTS) { }
setTimeout(fn, DEFAULT_TIMEOUT_MS);`
  }
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    file: null,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':
        result.file = args[++i];
        break;
      case '--verbose':
      case '-v':
        result.verbose = true;
        break;
    }
  }
  return result;
}

/**
 * Read issues from file or stdin
 */
async function readIssues(options) {
  let input;

  if (options.file && existsSync(options.file)) {
    input = readFileSync(options.file, 'utf-8');
  } else {
    // Read from stdin
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    input = Buffer.concat(chunks).toString('utf-8');
  }

  try {
    return JSON.parse(input);
  } catch {
    console.error('Error: Could not parse JSON input');
    console.error('Usage: node check-all.js --json | node fix-suggestions.js');
    process.exit(1);
  }
}

/**
 * Generate fix suggestions for issues
 */
function generateSuggestions(issues, options) {
  console.log('\n=== Fix Suggestions ===\n');

  // Group by check type
  const byCheck = {};
  for (const issue of issues) {
    if (!byCheck[issue.check]) byCheck[issue.check] = [];
    byCheck[issue.check].push(issue);
  }

  for (const [check, checkIssues] of Object.entries(byCheck)) {
    const template = FIX_TEMPLATES[check];
    const severityIcon = checkIssues[0].severity === 'critical' ? '[P0]' :
                         checkIssues[0].severity === 'major' ? '[P1]' : '[P2]';

    console.log(`${severityIcon} ${check} (${checkIssues.length} instances)`);
    console.log('='.repeat(50));

    if (template) {
      console.log(`\n${template.title}\n`);
      console.log('Steps:');
      for (const step of template.steps) {
        console.log(`  ${step}`);
      }

      if (options.verbose) {
        console.log('\nExample:');
        console.log(template.example.split('\n').map(l => '  ' + l).join('\n'));
      }
    } else {
      console.log('\nNo specific fix template available.');
      console.log('Review the code and apply best practices.');
    }

    console.log('\nLocations:');
    for (const issue of checkIssues.slice(0, 10)) {
      console.log(`  ${issue.file}:${issue.line}`);
    }
    if (checkIssues.length > 10) {
      console.log(`  ... and ${checkIssues.length - 10} more`);
    }

    console.log('');
  }

  // Priority summary
  const critical = issues.filter(i => i.severity === 'critical').length;
  const major = issues.filter(i => i.severity === 'major').length;
  const minor = issues.filter(i => i.severity === 'minor').length;

  console.log('=== Fix Priority ===');
  console.log(`1. Critical (${critical}): Fix immediately - blocks merge`);
  console.log(`2. Major (${major}): Fix before merge - impacts quality`);
  console.log(`3. Minor (${minor}): Fix when convenient - nice to have`);
  console.log('');
}

/**
 * Main entry point
 */
async function main() {
  const options = parseArgs();
  const issues = await readIssues(options);

  if (!Array.isArray(issues) || issues.length === 0) {
    console.log('\n[PASS] No issues to fix!\n');
    return;
  }

  generateSuggestions(issues, options);
}

main();
