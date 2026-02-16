# Common Error Patterns and Recovery Strategies

This reference provides detailed examples of error patterns, diagnostic approaches, and targeted recovery strategies for each error category.

## Error Categories Overview

Every error must be categorized before attempting recovery:

- **TOOL_FAILURE** - Precision engine tools, MCP tools, native tools fail
- **BUILD_ERROR** - Compilation, bundling, or build process failures
- **TEST_FAILURE** - Unit tests, integration tests, or E2E tests fail
- **TYPE_ERROR** - TypeScript type checking errors
- **RUNTIME_ERROR** - Errors during code execution (Node.js, browser)
- **EXTERNAL_ERROR** - Network failures, API errors, service unavailability

## Common Error Patterns by Category

### TOOL_FAILURE

#### Pattern: Precision Tool Path Sandbox Violation

```
Error: Path "/tmp/screenshot.png" is outside allowed base path "/home/user/project"
```

**Likely Causes:**
- Sandbox mode is enabled (default)
- Attempting to read/write files outside project root
- Temporary files from user (screenshots, downloads)

**Recovery Approach:**
1. Check if path is legitimately outside project (temp files, global configs)
2. If legitimate external access needed, use native tools (Read, Write, Edit) instead of precision tools
3. If file should be in project, verify working directory with `pwd` via precision_exec
4. For images/PDFs pasted by user, ALWAYS use native Read tool (precision_read will fail)

**Log Entry Example:**
```json
{
  "error_type": "TOOL_FAILURE",
  "pattern": "precision_read sandbox violation for temp files",
  "diagnostic": "User pasted image creates temp file at /tmp/*, sandbox blocks access",
  "resolution": "Use native Read tool for paths outside project root",
  "timestamp": "2026-02-15T10:30:00Z"
}
```

#### Pattern: Precision Edit Find String Not Unique

```
Error: Multiple matches found for find string (3 occurrences). Use hints or occurrence parameter.
```

**Likely Causes:**
- Find string appears multiple times in file
- Insufficient context in find string
- Common patterns (import statements, function signatures)

**Recovery Approach:**
1. Use `hints` parameter with `near_line`, `in_function`, or `in_class`
2. Use `occurrence: "first" | "last" | 1-N` to target specific instance
3. Expand find string to include more unique context (surrounding lines)
4. Use `match.mode: "regex"` with more specific pattern

#### Pattern: Precision Exec Command Timeout

```
Error: Command exceeded timeout of 120000ms
```

**Likely Causes:**
- Long-running build or test command
- Infinite loop in executed code
- Network request hanging
- Large file processing

**Recovery Approach:**
1. Increase `timeout_ms` parameter (max 600000ms = 10 minutes)
2. Use `background: true` for commands that don't need immediate output
3. Use `until.pattern` for early termination on success indicators
4. Use `progress: true` for long commands to stream milestones
5. Break into smaller incremental commands

### BUILD_ERROR

#### Pattern: TypeScript Module Not Found

```
Error: Cannot find module './utils' or its corresponding type declarations.
TS2614
```

**Likely Causes:**
- Missing file extension in import (.js for ESM, .ts source)
- File doesn't exist at expected path
- Incorrect relative path (../../ vs ./)
- Case sensitivity mismatch (Utils.ts vs utils.ts)

**Recovery Approach:**
1. Use precision_glob to verify file exists: `{"patterns": ["**/utils.ts", "**/utils.js"]}`
2. Check import statements match actual file structure
3. Verify ESM requires `.js` extension in imports even for `.ts` source files
4. Check tsconfig.json `paths` aliases and `baseUrl` settings

#### Pattern: ESM/CommonJS Module Interop

```
Error: require() of ES Module not supported
ERR_REQUIRE_ESM
```

**Likely Causes:**
- Mixing `require()` with ES modules
- package.json has `"type": "module"` but code uses CommonJS
- Importing `.mjs` file with `require()`

**Recovery Approach:**
1. Check package.json `"type"` field ("module" = ESM, absent/"commonjs" = CJS)
2. Convert imports: `const x = require('y')` -> `import x from 'y'`
3. Use dynamic imports for ESM in CJS: `await import('module')`
4. Check if dependencies support ESM (some packages are CJS-only)

### TEST_FAILURE

#### Pattern: Vitest Snapshot Mismatch

```
Error: Snapshot 1 mismatched
Expected: "foo"
Received: "bar"
```

**Likely Causes:**
- Code behavior legitimately changed
- Snapshot needs updating
- Non-deterministic output (timestamps, UUIDs)
- Environment-specific differences

**Recovery Approach:**
1. Review diff to determine if change is intentional
2. If intentional: `npx vitest run -u` to update snapshots
3. If unintentional: fix code to match expected behavior
4. Check for non-deterministic values and mock them (Date.now(), Math.random())

#### Pattern: Async Test Timeout

```
Error: Test timeout of 5000ms exceeded
```

**Likely Causes:**
- Missing `await` on async operations
- Promise never resolves/rejects
- Infinite retry loop
- External service not responding

**Recovery Approach:**
1. Add `await` to all async calls in test
2. Increase timeout: `test('name', async () => {...}, 10000)`
3. Add explicit Promise rejection for timeout cases
4. Mock external services to avoid network waits

### TYPE_ERROR

#### Pattern: Object Possibly Undefined

```
Error: Object is possibly 'undefined'.
TS2532
```

**Likely Causes:**
- Function returns `T | undefined` but code assumes T
- Optional chaining not used
- Array access without bounds check
- Nullable API response fields

**Recovery Approach:**
1. Add type guard: `if (value === undefined) return;`
2. Use optional chaining: `obj?.prop?.method?.()`
3. Use nullish coalescing: `value ?? defaultValue`
4. Add assertion if truly certain: `value!` (avoid if possible)
5. Update type definition if API always returns value

#### Pattern: Argument Type Mismatch

```
Error: Argument of type 'string' is not assignable to parameter of type 'number'.
TS2345
```

**Likely Causes:**
- Wrong variable passed to function
- Type narrowing insufficient
- API changed but call site not updated
- Generic type inference failed

**Recovery Approach:**
1. Check function signature in definition
2. Add explicit type conversion: `parseInt(str)`, `Number(str)`, `String(num)`
3. Update caller to pass correct type
4. Add type assertion if necessary: `value as TargetType` (verify safety)

### RUNTIME_ERROR

#### Pattern: Uncaught TypeError Access

```
TypeError: Cannot read property 'foo' of undefined
```

**Likely Causes:**
- Accessing property on undefined/null value
- Async race condition (value not loaded yet)
- API returned unexpected structure
- Destructuring non-existent properties

**Recovery Approach:**
1. Add runtime check: `if (!obj) return;`
2. Use optional chaining: `obj?.foo`
3. Add default values: `const {foo = 'default'} = obj ?? {}`
4. Validate API responses with Zod/Yup schema
5. Add loading states for async data

#### Pattern: ENOENT File Not Found

```
Error: ENOENT: no such file or directory, open '/path/to/file'
```

**Likely Causes:**
- File path typo
- File not created yet (race condition)
- Working directory different than expected
- Relative path resolved incorrectly

**Recovery Approach:**
1. Use precision_glob to verify file exists
2. Check working directory: precision_exec `pwd`
3. Use absolute paths: `path.resolve(__dirname, 'relative/path')`
4. Create parent directories: `fs.mkdirSync(dir, {recursive: true})`
5. Check file creation order in batch operations

### EXTERNAL_ERROR

#### Pattern: Network Request Timeout

```
Error: ETIMEDOUT
Connect timeout after 5000ms
```

**Likely Causes:**
- Slow network connection
- Service temporarily down
- Firewall blocking request
- Wrong endpoint URL

**Recovery Approach:**
1. Retry with exponential backoff (3 attempts)
2. Increase timeout if service is known to be slow
3. Check service status page
4. Verify URL correctness with precision_grep
5. Use precision_exec `curl -v` to diagnose connection

#### Pattern: API Rate Limit

```
Error: 429 Too Many Requests
Retry-After: 60
```

**Likely Causes:**
- Exceeded API quota
- Too many requests in time window
- Missing authentication (lower limits for anonymous)

**Recovery Approach:**
1. Respect Retry-After header value
2. Implement request throttling/queuing
3. Check if authenticated (higher limits)
4. Cache responses to reduce API calls
5. Use batch endpoints if available

## Recovery Decision Tree

### Step 1: Categorize Error

```
Is it a tool failure? -> TOOL_FAILURE
Is it a build/compile error? -> BUILD_ERROR  
Is it a test failure? -> TEST_FAILURE
Is it a TypeScript type error? -> TYPE_ERROR
Is it a runtime error? -> RUNTIME_ERROR
Is it a network/API error? -> EXTERNAL_ERROR
```

### Step 2: Check Known Patterns

```
Search failures.json for:
  1. Exact error message match
  2. Error type + file pattern match
  3. Similar diagnostic patterns

If known pattern found:
  -> Apply documented resolution
  -> Proceed to Step 4
  
If no match:
  -> Proceed to Step 3
```

### Step 3: Apply Category-Specific Strategy

#### TOOL_FAILURE Strategy

```
1. Check tool documentation for parameter constraints
2. Verify input parameters match schema
3. Try with simplified inputs (minimal repro)
4. Check tool output mode/verbosity settings
5. Fallback to native tools if precision tool fails 2x
```

#### BUILD_ERROR Strategy

```
1. Read full error output (don't truncate stack traces)
2. Identify file and line number
3. Use precision_read with extract: outline to see structure
4. Check imports, exports, and dependencies
5. Validate package.json and tsconfig.json
```

#### TEST_FAILURE Strategy

```
1. Run single failing test in isolation
2. Check test dependencies and setup/teardown
3. Look for non-deterministic behavior
4. Compare expected vs actual values
5. Review recent code changes that could affect test
```

#### TYPE_ERROR Strategy

```
1. Read type definition of involved types
2. Trace type inference path
3. Add explicit type annotations for clarity
4. Check for type widening/narrowing issues
5. Validate generic type parameters
```

#### RUNTIME_ERROR Strategy

```
1. Identify exact line from stack trace
2. Check variable values at error point (add logging)
3. Verify assumptions about data shape
4. Add defensive checks (null checks, bounds checks)
5. Review async timing and race conditions
```

#### EXTERNAL_ERROR Strategy

```
1. Retry immediately (may be transient)
2. Check service status and connectivity
3. Verify credentials and permissions
4. Implement exponential backoff for retries
5. Escalate if service down (user intervention needed)
```

### Step 4: Implement Fix

```
Apply fix using precision tools:
  -> precision_edit for code changes
  -> precision_write for new files
  -> precision_exec to validate fix

Expect validation to pass:
  -> Build succeeds
  -> Tests pass
  -> Types check
```

### Step 5: Validate Recovery

```
Run validation commands:
  -> npm run typecheck (TYPE_ERROR)
  -> npm run test (TEST_FAILURE)
  -> npm run build (BUILD_ERROR)
  -> Re-run failed operation (TOOL_FAILURE, RUNTIME_ERROR)
  -> curl/ping test (EXTERNAL_ERROR)

If validation passes:
  -> Log to failures.json with resolution
  -> Mark task complete
  
If validation fails:
  -> Increment attempt counter
  -> If attempts < 3: return to Step 3 with new approach
  -> If attempts >= 3: Escalate (Step 6)
```

### Step 6: Escalation (Max Attempts Reached)

```
Mark task as BLOCKED
Report to orchestrator with:
  1. Error category and pattern
  2. All attempted resolutions
  3. Current failure state
  4. Specific blocker (missing info, external dependency, etc.)
  5. Recommended next action (user intervention, different approach)
```

## Failure Log Examples

### Good Entry: Complete Information

```json
{
  "error_type": "TYPE_ERROR",
  "pattern": "TS2532: Object possibly undefined in array access",
  "file": "src/utils/parser.ts",
  "line": 42,
  "diagnostic": "Array.find() returns T | undefined, but code assumes T exists. No bounds check before accessing .length property.",
  "resolution": "Added optional chaining: results.find(...)?.length ?? 0. TypeScript error cleared, build passes.",
  "attempts": 2,
  "timestamp": "2026-02-15T10:45:00Z",
  "commands_run": [
    "npm run typecheck",
    "npm run build"
  ],
  "validation_passed": true
}
```

**Why this is good:**
- Specific error type and TypeScript error code
- Exact file and line number
- Root cause analysis in diagnostic
- Concrete resolution with code snippet
- Validation confirmation
- Attempt count tracked

### Good Entry: External Service Failure

```json
{
  "error_type": "EXTERNAL_ERROR",
  "pattern": "GitHub API rate limit exceeded (403)",
  "diagnostic": "Unauthenticated requests limited to 60/hour. Hit limit during dependency analysis that called gh api 80 times.",
  "resolution": "Added GITHUB_TOKEN to precision_fetch service config. Rate limit increased to 5000/hour. Retry succeeded.",
  "attempts": 3,
  "timestamp": "2026-02-15T11:00:00Z",
  "validation_passed": true,
  "prevention": "Always authenticate GitHub API calls. Cache results for repeated queries."
}
```

**Why this is good:**
- Identifies external dependency
- Explains rate limit context
- Shows long-term fix (authentication) not just retry
- Includes prevention strategy for future

### Bad Entry: Insufficient Detail

```json
{
  "error_type": "BUILD_ERROR",
  "diagnostic": "Build failed",
  "resolution": "Fixed it",
  "timestamp": "2026-02-15T12:00:00Z"
}
```

**Why this is bad:**
- No error pattern (can't match in future)
- No file or location
- Vague diagnostic (what failed? why?)
- Vague resolution (how was it fixed?)
- No validation confirmation
- Can't learn from this entry

### Bad Entry: Missing Root Cause

```json
{
  "error_type": "TEST_FAILURE",
  "pattern": "user.test.ts failing",
  "resolution": "Re-ran tests, now passing",
  "timestamp": "2026-02-15T12:15:00Z"
}
```

**Why this is bad:**
- No diagnostic explaining WHY test failed
- Resolution is retry without fix (flaky test indicator)
- Missing root cause = likely to recur
- No prevention strategy

## Escalation Templates

### Template: Tool Constraint Blocker

```markdown
STATUS: BLOCKED

Category: TOOL_FAILURE

Problem:
Precision_read requires sandbox mode disabled to access user-provided screenshot at /tmp/screenshot-xyz.png, but sandbox mode cannot be disabled by subagents per SUBAGENT-PROTOCOL.md rule #7.

Attempts:
1. Tried precision_read with path - rejected by sandbox
2. Attempted precision_config to disable sandbox - blocked by protocol
3. Checked for alternative approach - no way to copy file into project automatically

Blocker:
Requires user action to either:
- Manually disable sandbox via /goodvibes:sandbox command
- Move screenshot file into project directory
- Grant permission for subagent to use native Read tool

Recommended Action:
User should run: /goodvibes:sandbox
Then retry task.
```

### Template: External Service Down

```markdown
STATUS: BLOCKED

Category: EXTERNAL_ERROR

Problem:
NPM registry returning 503 Service Unavailable for package installation. Required dependency '@testing-library/react' cannot be installed.

Attempts:
1. Retry with npm install --registry=https://registry.npmjs.org (503)
2. Retry with yarn add (503 - uses same registry)
3. Wait 60s and retry (503 - still down)

Blocker:
External service outage. NPM registry status page shows degraded performance.

Recommended Action:
Wait for NPM registry to recover (check status.npmjs.org).
Alternative: User can manually install from cached tarball or use alternative registry.

Estimated Resolution:
NPM incidents typically resolve within 30-60 minutes based on status page history.
```

### Template: Insufficient Information

```markdown
STATUS: BLOCKED

Category: BUILD_ERROR

Problem:
TypeScript compilation fails with module resolution error for '@company/internal-sdk'. Error indicates package not found.

Attempts:
1. Searched package.json - package not listed in dependencies
2. Searched for usage - imported in 3 files (src/api/*.ts)
3. Checked npm registry - package is private/scoped, requires authentication

Blocker:
Missing information:
- Is this package available? (private registry? deprecated?)
- What are the authentication credentials?
- Should we use a different package instead?
- Is there an alternative implementation approach?

Recommended Action:
User should clarify:
1. Is @company/internal-sdk accessible in this environment?
2. If yes, provide .npmrc configuration or authentication token
3. If no, specify alternative approach or replacement package
```

### Template: Design Decision Needed

```markdown
STATUS: BLOCKED

Category: TYPE_ERROR

Problem:
API endpoint /users/:id should return 404 when user not found, but current implementation returns 200 with null body. This causes TypeScript errors in consumers expecting User type.

Attempts:
1. Added type guard in consumers - works but inconsistent with REST conventions
2. Changed return type to User | null - fixes types but wrong HTTP semantics
3. Researched API design - 404 is correct status for missing resource

Blocker:
Design decision required:
- Option A: Return 404 status (requires API contract change, may break clients)
- Option B: Keep 200 + null, update all consumers (inconsistent but safe)
- Option C: Add API versioning, migrate gradually

Recommended Action:
User/architect should decide on API contract approach.
Provide guidance on:
- Breaking change policy
- Client migration strategy  
- Preferred option (A, B, or C)
```

## Prevention Strategies

After resolving errors, log prevention strategies to avoid recurrence:

### Tool Failures
- Document parameter constraints in tool usage patterns
- Create reusable tool configuration templates
- Add parameter validation before tool calls

### Build Errors  
- Set up pre-commit hooks for type checking
- Use consistent import style (check ESLint config)
- Document module resolution configuration

### Test Failures
- Mock non-deterministic functions (Date, Random, network)
- Use test fixtures for consistent data
- Isolate tests (no shared state)

### Type Errors
- Enable strict TypeScript mode
- Use type guards for runtime validation
- Prefer unknown over any for external data

### Runtime Errors
- Add input validation at boundaries (API, user input)
- Use optional chaining for nested access
- Implement defensive programming patterns

### External Errors
- Implement retry with exponential backoff
- Add circuit breakers for failing services
- Cache responses when possible
- Monitor service status pages
