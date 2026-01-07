# The Usual Suspects: Top 20 Code Issues to Absolutely Avoid

**Source:** Analysis of code reviews in this codebase (code-review.md, code-fix-plan.md)
**Purpose:** Actionable guidance for agents to prevent common errors in future code
**Last Updated:** 2026-01-06

This document catalogs the 20 most frequently found issues in code reviews of this project. Each issue includes detection criteria, specific examples from our codebase, and concrete prevention strategies.

---

## Critical Issues [P0] - Never Do These

### 1. Type Safety Violations: Using `as any` in Production Code

**Why This Matters:** Completely defeats TypeScript's type safety, masks bugs, and spreads type unsafety throughout the codebase.

**Evidence From Reviews:**
- 156 instances of `as any` found in test files across 116 test files
- Worst offender: `todo-scanner.test.ts` with 95 instances
- Mostly used to bypass proper mocking types

**How to Detect:**
```bash
grep -r "as any" src/ --exclude-dir=__tests__
```

**Prevention Strategy:**
```typescript
// WRONG - Bypasses all type safety
vi.mocked(fs.readdir).mockResolvedValue(['file.ts'] as any);

// RIGHT - Use proper mock factories
import { createMockReaddirResult } from './test-utils/mock-factories';
vi.mocked(fs.readdir).mockResolvedValue(
  createMockReaddirResult([{ name: 'file.ts', type: 'file' }])
);

// WRONG - Lazy parameter typing
async function handler(input: any) { }

// RIGHT - Proper type definitions
async function handler(input: HookInput) { }
```

**Rule for Agents:**
- NEVER use `as any` in production code under any circumstances
- In tests, create proper mock factories instead of type assertions
- If you think you need `as any`, you need to solve the actual type problem

---

### 2. Deprecated Code Left in Codebase

**Why This Matters:** Creates confusion, increases maintenance burden, and signals incomplete refactoring work.

**Evidence From Reviews:**
- 5 deprecated functions found across codebase
- `env-checker.ts` - entire 35-line module marked deprecated but still present
- `checkEnvironment()` - deprecated alias still in environment.ts
- `respond()` function deprecated despite being used 60+ times

**How to Detect:**
```bash
grep -r "@deprecated" src/ -A 3
```

**Prevention Strategy:**
```typescript
// WRONG - Leaving deprecated code
/**
 * @deprecated Use analyzeEnvironment instead
 */
export function checkEnvironment() { }

// RIGHT - Either remove it or remove the @deprecated tag
// Option 1: If truly deprecated, DELETE IT
// Option 2: If still needed, remove @deprecated and document properly
/**
 * Analyzes environment configuration comprehensively.
 */
export function analyzeEnvironment() { }
```

**Rule for Agents:**
- NEVER add `@deprecated` tags to new code you write
- If you find deprecated code, either delete it or update callers and remove the tag
- Don't create aliases "for backwards compatibility" - make the breaking change

---

### 3. Hardcoded Secrets and Sensitive Data

**Why This Matters:** Security vulnerability, credential leaks, compliance violations.

**Evidence From Reviews:**
- 0 instances found (good!) but explicitly checked in every review
- Comprehensive security gitignore patterns (319 lines)
- Active scanning for sensitive patterns

**How to Detect:**
```bash
# Check for common secret patterns
grep -rE "(api[_-]?key|secret|password|token|credential).*=.*['\"]" src/
grep -rE "sk[-_][a-zA-Z0-9]{20,}" src/  # API key patterns
```

**Prevention Strategy:**
```typescript
// WRONG - Hardcoded secrets
const apiKey = "sk_live_abc123def456";
const dbPassword = "MySecretPass123";

// RIGHT - Environment variables
const apiKey = process.env.API_KEY;
const dbPassword = process.env.DB_PASSWORD;

// EVEN BETTER - Validate they exist
if (!process.env.API_KEY) {
  throw new Error('API_KEY environment variable is required');
}
```

**Rule for Agents:**
- NEVER hardcode API keys, tokens, passwords, or credentials
- ALWAYS use environment variables for secrets
- ALWAYS validate required environment variables at startup
- Use .env.example to document required variables (without values)

---

## Major Issues [P1] - Fix Before Merge

### 4. Sequential Async Operations Instead of Parallel

**Why This Matters:** Massive performance penalty - 8 sequential awaits = 8x slower than parallel.

**Evidence From Reviews:**
- `environment.ts:194-201` - 8 sequential `await fileExists()` calls
- `environment.ts:210-217` - 3 sequential checks in loop
- Deduction: 1.0 point from Performance category

**How to Detect:**
```bash
# Look for await inside loops
grep -rn "for.*await" src/
# Look for sequential awaits
grep -B2 -A2 "await.*await" src/
```

**Prevention Strategy:**
```typescript
// WRONG - Sequential (8x slower)
for (const file of files) {
  if (await fileExists(file)) {
    const content = await readFile(file);
    results.push(content);
  }
}

// RIGHT - Parallel (8x faster)
const checks = await Promise.all(
  files.map(async (file) => {
    const exists = await fileExists(file);
    if (exists) {
      const content = await readFile(file);
      return { file, content };
    }
    return null;
  })
);
const results = checks.filter(Boolean);
```

**Rule for Agents:**
- ALWAYS use `Promise.all()` for independent async operations
- ONLY use sequential awaits when operations depend on each other
- If you see a loop with `await` inside, ask: "Can these run in parallel?"

---

### 5. Long Functions (>50 Lines)

**Why This Matters:** High cognitive load, hard to test, violates Single Responsibility Principle.

**Evidence From Reviews:**
- `context-builder.ts:87-190` - 103-line function `formatContextSections()`
- Deduction: 0.5 points from Maintainability
- Threshold: 50 lines maximum

**How to Detect:**
```bash
# Find functions longer than 50 lines
awk '/function.*\{|=>.*\{/{start=NR} /^\}/{if(NR-start>50) print FILENAME":"start":"NR-start}' src/**/*.ts
```

**Prevention Strategy:**
```typescript
// WRONG - 103-line monolith
function formatContextSections(...args) {
  const parts = [];
  // ... 100+ lines of logic ...
  return parts.join('\n');
}

// RIGHT - Extract smaller functions
function formatHeader(): string[] { /* 5 lines */ }
function formatRecoverySection(recovery: RecoveryInfo): string[] { /* 8 lines */ }
function formatProjectSection(stack: StackInfo): string[] { /* 12 lines */ }

function formatContextSections(...args): string {
  return [
    ...formatHeader(),
    ...formatRecoverySection(recoveryInfo),
    ...formatProjectSection(stackInfo),
  ].join('\n');
}
```

**Rule for Agents:**
- Keep functions under 50 lines
- If a function has "and" in its description, it's doing too much
- Extract helper functions with clear single responsibilities
- Aim for one level of abstraction per function

---

### 6. Missing Error Logging in Catch Blocks

**Why This Matters:** Silent failures make debugging impossible, errors go unnoticed.

**Evidence From Reviews:**
- `todo-scanner.ts:50,83` - 2 catches using `_error` pattern (silently ignored)
- `memory-loader.ts:20` - catch without proper error logging
- Deduction: 1.0 point from Error Handling

**How to Detect:**
```bash
# Find catch blocks with underscore-prefixed error
grep -rn "catch.*_error" src/
# Find empty catch blocks
grep -A1 "catch.*{" src/ | grep "^\s*}\s*$"
```

**Prevention Strategy:**
```typescript
// WRONG - Silent failure
try {
  await operation();
} catch (_error) {
  // Silently ignored - debugging nightmare
}

// WRONG - Generic error variable without logging
try {
  await operation();
} catch (error) {
  return null; // What went wrong?
}

// RIGHT - Proper error handling
import { debug } from './logging.js';

try {
  await operation();
} catch (error: unknown) {
  debug('Operation failed', {
    error: error instanceof Error ? error.message : String(error),
    context: { filePath, operation: 'readConfig' }
  });
  return null; // Graceful degradation with visibility
}
```

**Rule for Agents:**
- NEVER use `_error` or `_err` in catch blocks
- ALWAYS type errors as `error: unknown`
- ALWAYS log the error with context before swallowing it
- If you're catching just to return null, log why the error is acceptable

---

### 7. Switch Statements Instead of Strategy Pattern

**Why This Matters:** Open-closed principle violation, requires modification for extension.

**Evidence From Reviews:**
- `pre-tool-use.ts:259-278` - 19-line switch statement for tool validation
- Deduction: 0.5 points from Maintainability
- Violates open-closed principle (open for extension, closed for modification)

**How to Detect:**
```bash
grep -rn "switch.*{" src/ -A 20 | grep "case"
```

**Prevention Strategy:**
```typescript
// WRONG - Switch statement requires modification
switch (toolName) {
  case 'detect_stack':
    await validateDetectStack(input);
    break;
  case 'get_schema':
    await validateGetSchema(input);
    break;
  // Adding new tool? Modify this switch.
  default:
    respond(allowTool('PreToolUse'));
}

// RIGHT - Strategy pattern with lookup table
const TOOL_VALIDATORS: Record<string, (input: HookInput) => Promise<void>> = {
  detect_stack: validateDetectStack,
  get_schema: validateGetSchema,
  run_smoke_test: validateRunSmokeTest,
  // Adding new tool? Just add to this object.
};

const validator = TOOL_VALIDATORS[toolName];
if (validator) {
  await validator(input);
} else {
  debug(`Unknown tool '${toolName}', allowing by default`);
  respond(allowTool('PreToolUse'));
}
```

**Rule for Agents:**
- Use lookup tables (objects/maps) instead of switch statements
- Reserve switch for true type discrimination with exhaustiveness checking
- If switch cases all call different functions, use a strategy map

---

### 8. Missing JSDoc on Public APIs

**Why This Matters:** Poor developer experience, no IDE hints, unclear API contracts.

**Evidence From Reviews:**
- Only 45.5% of source files have JSDoc (46 of 101 files)
- Threshold: 100% file coverage
- Deduction: 1.0 point from Documentation
- 510 JSDoc tags exist but coverage is incomplete

**How to Detect:**
```bash
# Count files with JSDoc
grep -l "\/\*\*" src/**/*.ts | wc -l
# Count total source files
find src -name "*.ts" -not -path "*/test*" | wc -l
```

**Prevention Strategy:**
```typescript
// WRONG - No documentation
export async function gatherProjectContext(cwd: string) {
  // What does this return? What does cwd mean?
}

// RIGHT - Complete JSDoc
/**
 * Gathers comprehensive project context including git status, environment,
 * stack detection, and active todos.
 *
 * @param cwd - Absolute path to project root directory
 * @returns Promise resolving to complete project context
 *
 * @example
 * const context = await gatherProjectContext('/home/user/project');
 * // context.git.branch === 'main'
 * // context.stack.framework === 'nextjs'
 */
export async function gatherProjectContext(
  cwd: string
): Promise<ProjectContext> {
  // ...
}
```

**Rule for Agents:**
- ALWAYS add JSDoc to all exported functions, types, and interfaces
- Include @param tags for all parameters with descriptions
- Include @returns tag describing the return value
- Add @example showing realistic usage (no console.log)
- Document what, why, and important caveats - not how

---

### 9. Duplicate Code Without DRY Refactoring

**Why This Matters:** Copy-paste bugs, inconsistent updates, maintenance multiplication.

**Evidence From Reviews:**
- `state.ts:94-171` - 4 nearly identical `updateXState` functions
- Deduction: 0.5 points from SOLID/DRY
- Pattern: Same structure, different property names

**How to Detect:**
```bash
# Look for repeated patterns in diffs
git diff HEAD~5 --stat
# Use tools like jscpd for duplicate detection
npx jscpd src/
```

**Prevention Strategy:**
```typescript
// WRONG - Copy-pasted update functions
export function updateSessionState(state: HooksState, updates: Partial<HooksState['session']>): HooksState {
  return { ...state, session: { ...state.session, ...updates } };
}
export function updateTestState(state: HooksState, updates: Partial<HooksState['tests']>): HooksState {
  return { ...state, tests: { ...state.tests, ...updates } };
}
export function updateBuildState(state: HooksState, updates: Partial<HooksState['build']>): HooksState {
  return { ...state, build: { ...state.build, ...updates } };
}
// ... 4 identical patterns

// RIGHT - Generic helper with type safety
function updateNestedState<K extends keyof HooksState>(
  state: HooksState,
  key: K,
  updates: Partial<HooksState[K]>
): HooksState {
  return { ...state, [key]: { ...state[key], ...updates } };
}

export function updateSessionState(state: HooksState, updates: Partial<HooksState['session']>) {
  return updateNestedState(state, 'session', updates);
}
// Same for other update functions - 1 implementation, 4 thin wrappers
```

**Rule for Agents:**
- If you copy-paste code and change 1-2 things, extract a generic helper
- Use TypeScript generics to maintain type safety in DRY code
- "Rule of Three" - First time: write it. Second time: note it. Third time: refactor it.

---

### 10. Underscore-Prefixed Unused Parameters

**Why This Matters:** Inconsistent style, may indicate the parameter should actually be used.

**Evidence From Reviews:**
- `pre-tool-use.ts:175,184` - 2 instances of `_input: HookInput`
- Deduction: 0.5 points from Naming
- Functions use `process.cwd()` instead of `input.cwd`

**How to Detect:**
```bash
grep -rn "function.*_[a-z].*:" src/
grep -rn "=.*_[a-z].*:" src/
```

**Prevention Strategy:**
```typescript
// WRONG - Parameter should be used
export async function validateDetectStack(_input: HookInput): Promise<void> {
  // Uses process.cwd() instead of input.cwd - WHY?
  if (!(await fileExistsRelative('package.json'))) {
    respond(blockTool('PreToolUse', 'No package.json found'), true);
  }
}

// RIGHT - Actually use the parameter
export async function validateDetectStack(input: HookInput): Promise<void> {
  const cwd = input.cwd || process.cwd();
  if (!(await fileExists(path.join(cwd, 'package.json')))) {
    respond(blockTool('PreToolUse', 'No package.json found'), true);
  }
}

// OR if truly unused in interface implementation
export async function validate(_input: HookInput): Promise<void> {
  // Use plain underscore for truly unused params
  respond(allowTool('PreToolUse'));
}
```

**Rule for Agents:**
- If a parameter looks like it should be used, use it
- If a function ignores important context (like `cwd`), that's usually a bug
- Only use `_param` when required by interface but truly not needed

---

## Minor Issues [P2] - Fix in Code Reviews

### 11. Large Files (>300 Lines)

**Why This Matters:** Indicates god objects, mixed responsibilities, hard to navigate.

**Evidence From Reviews:**
- `mock-factories.ts` - 445 lines (threshold: 300)
- Deduction: 0.5 points from Organization
- Recommendation: Split into multiple factory modules

**How to Detect:**
```bash
find src -name "*.ts" -exec wc -l {} \; | awk '$1 > 300 {print}'
```

**Prevention Strategy:**
```bash
# WRONG - One 445-line file
src/__tests__/test-utils/mock-factories.ts

# RIGHT - Split by concern
src/__tests__/test-utils/
  mock-factories/
    index.ts           # Barrel export
    fs-mocks.ts        # Dirent, Stats mocks (120 lines)
    state-mocks.ts     # State-related mocks (85 lines)
    telemetry-mocks.ts # Telemetry mocks (90 lines)
    git-mocks.ts       # Git mocks (65 lines)
```

**Rule for Agents:**
- Keep files under 300 lines
- If a file exceeds 300 lines, look for natural split points
- Group related functions into modules, re-export via index.ts
- Exception: Data files (e.g., security patterns, config) can be larger

---

### 12. No Barrel Files (index.ts) for Module Groups

**Why This Matters:** Messy imports, unclear module boundaries, poor API surface.

**Evidence From Reviews:**
- 13 barrel index.ts files found (good practice)
- Clear module boundaries: automation/, context/, memory/
- Organized exports prevent deep import paths

**How to Detect:**
```bash
# Check for directories without index.ts
find src -type d -not -path "*/test*" | while read dir; do
  [ ! -f "$dir/index.ts" ] && echo "Missing: $dir/index.ts"
done
```

**Prevention Strategy:**
```typescript
// WRONG - Deep imports throughout codebase
import { gatherProjectContext } from './session-start/context-builder.js';
import { analyzeEnvironment } from './context/environment.js';
import { formatContextSections } from './session-start/formatters/context-formatter.js';

// RIGHT - Clean public API via barrel file
// src/context/index.ts
export { analyzeEnvironment, formatEnvStatus } from './environment.js';
export { gatherProjectContext } from './context-builder.js';
export type { EnvironmentContext, EnvStatus } from './types.js';

// Usage
import { analyzeEnvironment, gatherProjectContext } from './context/index.js';
```

**Rule for Agents:**
- Create index.ts in every directory with multiple related files
- Export public API, hide internal implementation files
- Re-export types alongside functions for convenience
- Barrel files should only export, not contain logic

---

### 13. Console.log in Production Code

**Why This Matters:** Debugging statements left in, no log levels, clutters output.

**Evidence From Reviews:**
- JSDoc examples use console.log (65 instances)
- Should show return value usage instead
- Production code clean, but examples set bad pattern

**How to Detect:**
```bash
grep -rn "console\\.log" src/ --exclude-dir=__tests__
```

**Prevention Strategy:**
```typescript
// WRONG - Console.log in examples
/**
 * @example
 * const input = await readHookInput();
 * console.log(input.hook_event_name);
 */

// RIGHT - Show return value usage
/**
 * @example
 * const input = await readHookInput();
 * // input.hook_event_name === 'PreToolUse'
 * // input.tool_name === 'Bash'
 * if (input.tool_name === 'Bash') {
 *   // Handle bash tool
 * }
 */

// WRONG - Production console.log
console.log('Processing file:', filePath);

// RIGHT - Use proper logging with levels
import { debug, info, error } from './logging.js';
debug('Processing file', { filePath, size: stats.size });
```

**Rule for Agents:**
- NEVER use console.log/warn/error in production code
- Use a proper logging framework with levels (debug, info, warn, error)
- In JSDoc examples, show return values and usage patterns, not console output
- If you need debugging output, use a `debug()` function that respects DEBUG env var

---

### 14. Magic Numbers Without Named Constants

**Why This Matters:** Unclear intent, hard to maintain, duplicate values drift.

**Evidence From Reviews:**
- Proper use of constants: `SECTION_SEPARATOR_LENGTH = 80`
- Timeout values properly defined: `DEFAULT_EXEC_TIMEOUT = 30000`
- Good pattern to follow consistently

**How to Detect:**
```bash
# Look for numeric literals in conditions/assignments
grep -rn "[^a-zA-Z0-9_][0-9]\{2,\}[^0-9]" src/ | grep -v "^//" | grep -v "*"
```

**Prevention Strategy:**
```typescript
// WRONG - Magic numbers
if (lines.length > 50) {
  errors.push('Function too long');
}
setTimeout(cleanup, 30000);
if (status === 429) {
  await sleep(60000);
}

// RIGHT - Named constants
const MAX_FUNCTION_LINES = 50;
const DEFAULT_TIMEOUT_MS = 30000;
const HTTP_TOO_MANY_REQUESTS = 429;
const RATE_LIMIT_BACKOFF_MS = 60000;

if (lines.length > MAX_FUNCTION_LINES) {
  errors.push('Function too long');
}
setTimeout(cleanup, DEFAULT_TIMEOUT_MS);
if (status === HTTP_TOO_MANY_REQUESTS) {
  await sleep(RATE_LIMIT_BACKOFF_MS);
}
```

**Rule for Agents:**
- Replace all magic numbers with named constants
- Group related constants at module top or in constants file
- Use SCREAMING_SNAKE_CASE for constants
- Exceptions: 0, 1, -1 in array operations, 100 for percentages

---

### 15. Missing Input Validation

**Why This Matters:** Crashes on invalid input, poor error messages, security risks.

**Evidence From Reviews:**
- Good use of Zod for validation in some areas
- Sanitization functions for git commands (`sanitizeForGit`)
- Pattern should be applied consistently

**How to Detect:**
```bash
# Functions with external input but no validation
grep -rn "export.*function.*(" src/ | grep -v "validate"
```

**Prevention Strategy:**
```typescript
// WRONG - No validation
export async function processConfig(config: any) {
  const port = config.server.port; // What if config is null? What if server is missing?
  await startServer(port);
}

// RIGHT - Validate at boundary
import { z } from 'zod';

const ConfigSchema = z.object({
  server: z.object({
    port: z.number().min(1024).max(65535),
    host: z.string().default('localhost'),
  }),
});

export async function processConfig(input: unknown) {
  const result = ConfigSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid config: ${result.error.message}`);
  }
  const { port, host } = result.data.server;
  await startServer(port, host);
}
```

**Rule for Agents:**
- Validate all external input at system boundaries (API, CLI args, config files)
- Use Zod schemas for complex validation
- Provide helpful error messages that guide users to fix the problem
- Sanitize input used in shell commands, SQL, or file paths

---

### 16. Circular Dependencies

**Why This Matters:** Build failures, initialization order bugs, tight coupling.

**Evidence From Reviews:**
- 0 circular dependencies detected with madge
- Clean dependency graph maintained
- Use madge to verify this

**How to Detect:**
```bash
npx madge --circular src/
```

**Prevention Strategy:**
```typescript
// WRONG - Circular dependency
// user.ts
import { Order } from './order.js';
export class User {
  orders: Order[];
}

// order.ts
import { User } from './user.js';
export class Order {
  user: User;  // Circular!
}

// RIGHT - Shared types file
// types.ts
export interface User {
  id: string;
  orders: Order[];
}
export interface Order {
  id: string;
  userId: string;
}

// user.ts
import type { User, Order } from './types.js';
export function createUser(...): User { }

// order.ts
import type { User, Order } from './types.js';
export function createOrder(...): Order { }
```

**Rule for Agents:**
- Extract shared types to a types.ts file
- Use `import type` for type-only imports
- Run `npx madge --circular src/` before committing
- If two modules import each other, introduce a third module for shared concerns

---

### 17. Catch-All Types (any, unknown without narrowing)

**Why This Matters:** Type safety erosion, runtime errors, poor IDE support.

**Evidence From Reviews:**
- 18 source files reference "any" (mostly in comments/patterns)
- TypeScript strict mode enabled and enforced
- Zero compilation errors

**How to Detect:**
```bash
grep -rn ": any" src/ --exclude-dir=__tests__
grep -rn "<any>" src/ --exclude-dir=__tests__
```

**Prevention Strategy:**
```typescript
// WRONG - any spreads through codebase
function parseJSON(text: string): any {
  return JSON.parse(text);
}
const data = parseJSON(response); // data is any - type safety lost

// RIGHT - Generic with constraint
function parseJSON<T = unknown>(text: string): T {
  return JSON.parse(text) as T;
}
interface User { name: string; }
const data = parseJSON<User>(response); // data is User

// WRONG - unknown without narrowing
function handleError(error: unknown) {
  console.log(error.message); // TS error - unknown has no message
}

// RIGHT - Type narrowing
function handleError(error: unknown) {
  if (error instanceof Error) {
    console.log(error.message); // Safe - narrowed to Error
  } else {
    console.log(String(error)); // Fallback
  }
}
```

**Rule for Agents:**
- NEVER use `any` - use `unknown` if type is truly unknown
- ALWAYS narrow `unknown` before accessing properties
- Use type guards (instanceof, typeof, custom predicates)
- Prefer generics over any for flexible functions

---

### 18. Missing Error Context

**Why This Matters:** Debugging in production requires context - file path, operation, input state.

**Evidence From Reviews:**
- Good error handling with debug logging in most places
- Pattern: `debug('Operation failed', { error, context })`
- Should be applied consistently

**How to Detect:**
```bash
# Find catch blocks without context
grep -A3 "catch.*unknown" src/ | grep -v "context\|filePath\|operation"
```

**Prevention Strategy:**
```typescript
// WRONG - No context
try {
  await fs.readFile(filePath);
} catch (error: unknown) {
  debug('Read failed'); // Which file? What operation? In what state?
  return null;
}

// RIGHT - Rich context
try {
  await fs.readFile(filePath, 'utf-8');
} catch (error: unknown) {
  debug('Failed to read configuration file', {
    error: error instanceof Error ? error.message : String(error),
    filePath,
    operation: 'loadConfig',
    cwd: process.cwd(),
    exists: await fileExists(filePath),
  });
  return null;
}
```

**Rule for Agents:**
- Include file paths, operation names, and relevant state in error logs
- Add `exists` check for file operations
- Include request IDs for API operations
- Add enough context to reproduce the error from logs alone

---

### 19. Mutable Default Parameters

**Why This Matters:** Shared state bugs, side effects, surprising behavior.

**Evidence From Reviews:**
- Not found in current codebase (good!)
- Common trap to avoid in future code

**How to Detect:**
```bash
grep -rn "= \[\]" src/
grep -rn "= {}" src/
```

**Prevention Strategy:**
```typescript
// WRONG - Shared mutable default
function addUser(users = []) {
  users.push('new user');
  return users;
}
const list1 = addUser(); // ['new user']
const list2 = addUser(); // ['new user', 'new user'] - SURPRISE!

// RIGHT - Create new default each time
function addUser(users?: string[]): string[] {
  const list = users ?? [];
  return [...list, 'new user'];
}
const list1 = addUser(); // ['new user']
const list2 = addUser(); // ['new user'] - correct

// WRONG - Mutable object default
function createConfig(options = { debug: false }) {
  options.debug = true; // Mutates shared default!
  return options;
}

// RIGHT - Immutable pattern
function createConfig(options?: { debug?: boolean }) {
  return { debug: false, ...options };
}
```

**Rule for Agents:**
- NEVER use `= []` or `= {}` as default parameters
- Use `?:` optional type and null coalescing: `const list = param ?? []`
- Create new objects/arrays inside the function
- Return new objects, don't mutate parameters

---

### 20. Tight Coupling to Implementation Details

**Why This Matters:** Brittle tests, hard to refactor, violates dependency inversion.

**Evidence From Reviews:**
- Good use of dependency injection through function parameters
- Tests mock at module boundaries
- Clear interfaces define contracts

**How to Detect:**
```bash
# Tests importing from ../implementation.js instead of ../index.js
grep -rn "from.*\.\./.*/" src/__tests__/ | grep -v "index.js"
```

**Prevention Strategy:**
```typescript
// WRONG - Tight coupling to file system
export class ConfigLoader {
  async load() {
    return JSON.parse(await fs.readFile('./config.json', 'utf-8'));
  }
}
// Hard to test, hard to use different storage

// RIGHT - Dependency injection
export class ConfigLoader {
  constructor(private reader: (path: string) => Promise<string>) {}

  async load(path: string) {
    return JSON.parse(await this.reader(path));
  }
}
// Test with: new ConfigLoader(async () => '{}')
// Production: new ConfigLoader((p) => fs.readFile(p, 'utf-8'))

// WRONG - Test depends on internal structure
import { internalHelper } from '../module/internal-helper.js';
test('should format correctly', () => {
  expect(internalHelper(input)).toBe(output);
});

// RIGHT - Test public API only
import { publicFunction } from '../module/index.js';
test('should format correctly', () => {
  expect(publicFunction(input)).toBe(output);
});
```

**Rule for Agents:**
- Accept dependencies as parameters, don't hardcode them
- Test public APIs, not internal implementation
- Import from index.ts barrel files, not deep paths
- If you need to mock it, inject it

---

## Quick Reference Checklist

Before submitting code, verify:

- [ ] No `as any` type assertions (tests or production)
- [ ] No `@deprecated` tags in new code
- [ ] No hardcoded secrets or API keys
- [ ] Independent async operations use `Promise.all()`
- [ ] All functions under 50 lines
- [ ] All catch blocks log errors with context
- [ ] Switch statements replaced with strategy maps
- [ ] All exported functions have JSDoc
- [ ] No copy-pasted code (extract to generic helper)
- [ ] No unused parameters (or use plain `_`)
- [ ] Files under 300 lines
- [ ] Module groups have barrel index.ts files
- [ ] No console.log in production code
- [ ] Magic numbers replaced with named constants
- [ ] External input validated at boundaries
- [ ] No circular dependencies (`npx madge --circular src/`)
- [ ] No `any` types (use `unknown` with narrowing)
- [ ] Error logs include file paths and context
- [ ] No mutable default parameters
- [ ] Dependencies injected, not hardcoded

---

## Automated Detection

Run before every commit:

```bash
# Type safety
grep -r "as any" src/ && echo "FAIL: as any found" || echo "PASS: no as any"

# Deprecated code
grep -r "@deprecated" src/ && echo "WARN: deprecated code found" || echo "PASS: no deprecated code"

# Secrets
grep -rE "(api[_-]?key|secret|password).*=.*['\"]" src/ && echo "FAIL: possible secret" || echo "PASS: no hardcoded secrets"

# Circular dependencies
npx madge --circular src/ && echo "FAIL: circular deps" || echo "PASS: no circular deps"

# Build and tests
npm run build && npm test && echo "PASS: build and tests" || echo "FAIL: build or tests failed"
```

---

## Scoring Impact Reference

Based on brutal code review scoring (10-point scale):

| Issue | Category | Deduction | Severity |
|-------|----------|-----------|----------|
| `as any` in tests | Testing | -0.5 to -1.0 | Major |
| Deprecated code | SOLID/DRY | -0.5 per function | Major |
| Sequential async | Performance | -0.5 to -1.0 | Minor |
| Long functions | Maintainability | -0.5 | Minor |
| Missing error logs | Error Handling | -0.5 to -1.0 | Minor |
| Switch statements | Maintainability | -0.25 to -0.5 | Minor |
| Missing JSDoc | Documentation | -0.5 to -2.0 | Minor |
| Duplicate code | SOLID/DRY | -0.5 | Minor |
| Underscore params | Naming | -0.25 to -0.5 | Nitpick |
| Large files | Organization | -0.5 | Minor |

---

## Final Note to Agents

This document represents real issues found in real code reviews of this project. These aren't theoretical problems - they cost 1.3 points on a 10-point scale in the last review (8.7/10 achieved, 10/10 possible).

**When in doubt, ask:**
1. "Would this pass TypeScript strict mode?"
2. "Can I test this easily?"
3. "Will the next person understand this?"
4. "Would a code review flag this?"

If the answer to any is "no" - refactor before committing.
