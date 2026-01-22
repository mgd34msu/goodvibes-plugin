# Batch Examples

This directory contains working examples of batch files demonstrating the capabilities of the GoodVibes batch system. Each example is a complete, runnable YAML specification that showcases different patterns and use cases.

## Overview

Batch files are declarative YAML specifications that orchestrate complex, multi-step operations across your codebase. They enable you to:

- Coordinate multiple agents (architect, engineer, reviewer)
- Execute operations in parallel with dependency management
- Validate changes incrementally with automatic rollback
- Track architectural decisions and patterns
- Handle errors with retry strategies and checkpoints

These examples follow the SPEC-v2 specification and serve as both documentation and templates for creating your own batches.

## Quick Start

### Running a Batch File

Use the MCP CLI to execute batch files:

```bash
# Run a batch from file
mcp-cli call plugin_goodvibes_batch-engine/batch - < batches/rename-function.yaml

# Monitor batch progress
mcp-cli call plugin_goodvibes_batch-engine/batch_status '{"batch_id": "your-batch-id"}'

# List all batches
mcp-cli call plugin_goodvibes_batch-engine/batch_list '{}'

# Recover from checkpoint
mcp-cli call plugin_goodvibes_batch-engine/batch_recover '{"batch_id": "your-batch-id", "checkpoint": "pre-implementation"}'
```

### Testing Without Making Changes

Add `dry_run` to preview what a batch will do:

```yaml
config:
  preview:
    dry_run: true
    diff: true
```

## Example Batch Files

### 1. `auth-feature.yaml` - Full Feature Implementation

**Purpose**: Implement a complete user authentication feature across backend and frontend.

**Use Case**: When you need to add a major feature that spans multiple layers of your application.

**Key Features Demonstrated**:
- Multi-phase operations with clear dependencies
- Agent coordination using `goodvibes:engineer`
- Discovery phase (analyzing existing patterns before implementing)
- Context injection (passing discovery results to agents)
- Incremental validation (typecheck → lint → build)
- State tracking for architectural decisions
- Comprehensive error handling and recovery
- Checkpoint creation for rollback capability

**What It Creates**:
- **Backend**: Authentication API endpoints (register, login, logout, refresh, /me)
- **Frontend**: LoginForm, RegisterForm, AuthProvider, ProtectedRoute components
- **Security**: JWT tokens, bcrypt password hashing, rate limiting
- **Validation**: Zod schemas for request validation
- **State Management**: Auth context with token refresh and persistence

**Prerequisites**:
- Node.js project with TypeScript
- Package manager (npm/yarn/pnpm)
- Database setup (Prisma/ORM configured)
- Existing API route structure

**Complexity**: High (10-15 minutes estimated)

**Configuration Highlights**:
```yaml
transaction:
  mode: atomic  # All-or-nothing execution
  checkpoints:  # Recovery points
    - after: find-user-models
      name: discovery-complete
    - after: backend-implementation
      name: backend-complete

validation:
  after: [typecheck, lint, build]
  rules:
    - name: no-any-types
      severity: error
```

---

### 2. `repository-pattern.yaml` - Large-Scale Refactoring

**Purpose**: Refactor direct database calls to use repository pattern across the entire codebase.

**Use Case**: When you need to improve architecture by introducing abstraction layers or changing patterns throughout your codebase.

**Key Features Demonstrated**:
- Multi-agent coordination (architect → engineer → reviewer)
- Pattern detection (finding all database access points)
- Large-scale code transformation
- Post-refactor verification (ensuring no direct DB calls remain)
- Custom validation rules
- Database schema analysis
- Test suite execution for regression prevention

**What It Does**:
1. **Discovery**: Finds all direct Prisma calls, database imports, existing repo patterns
2. **Architecture**: Architect designs repository interfaces and migration strategy
3. **Implementation**: Engineer creates repositories and migrates all callers
4. **Review**: Reviewer checks completeness, quality, and architecture adherence
5. **Validation**: Verifies no direct DB calls outside repositories, runs full test suite
6. **Tracking**: Records repository pattern decision for future reference

**Prerequisites**:
- Existing database layer (Prisma, Drizzle, etc.)
- Test suite configured
- TypeScript project

**Complexity**: Very High (15-20 minutes estimated)

**Configuration Highlights**:
```yaml
validation:
  rules:
    - name: no-direct-db-access
      pattern: "prisma\\.(\\w+)\\."
      exclude: ["**/repositories/**"]
      severity: error

query:
  - id: verify-no-direct-db
    validation:
      expect:
        count: 0  # Must find zero direct DB calls
      on_fail:
        action: error
```

---

### 3. `rename-function.yaml` - Quick Multi-File Edit

**Purpose**: Rename a function across the entire codebase with validation.

**Use Case**: When you need to perform a focused refactoring task quickly and safely.

**Key Features Demonstrated**:
- Minimal verbosity mode for fast operations
- Search-and-replace workflow
- Word boundary matching (prevents partial matches)
- Post-edit verification (confirms old name no longer exists)
- Atomic transaction (all files renamed or none)
- Fast validation strategy (typecheck only)

**What It Does**:
1. **Find**: Locates all usages of `getUserData` function (definitions, calls, type references)
2. **Rename**: Replaces all occurrences with `fetchUserProfile` across all files
3. **Verify**: Confirms old function name no longer exists in codebase
4. **Validate**: Runs TypeScript compiler to ensure no broken references

**Prerequisites**:
- TypeScript/JavaScript project
- Function exists in codebase

**Complexity**: Low (1-2 minutes estimated)

**Configuration Highlights**:
```yaml
output:
  mode: minimal  # Reduced output for quick ops
  show_diffs: false
  include_reasoning: false

write:
  - type: edit
    edits:
      - find: "getUserData"
        replace: "fetchUserProfile"
        occurrence: all  # Replace all instances
    options:
      match_mode: exact
      preserve_formatting: true
```

---

### 4. `add-api-endpoint.yaml` - API Endpoint Implementation

**Purpose**: Add a new REST API endpoint with proper validation, authentication, and error handling.

**Use Case**: When you need to add new API functionality following existing patterns.

**Key Features Demonstrated**:
- Following existing codebase patterns
- Schema validation with Zod
- OpenAPI specification validation
- Authentication middleware
- Incremental validation strategy
- API documentation tracking
- Custom validation rules for API security

**What It Creates**:
- **Endpoint**: POST /api/posts with full CRUD operations
- **Validation**: Zod schema for request body validation
- **Authentication**: JWT token verification
- **Error Handling**: Proper HTTP status codes (201, 400, 401, 500)
- **Types**: TypeScript interfaces for request/response
- **Tests**: API endpoint tests (if test suite exists)

**Prerequisites**:
- Node.js project with API routes (Next.js App Router, Express, Fastify, etc.)
- TypeScript configured
- Authentication system in place
- Database/ORM configured

**Complexity**: Medium (5-10 minutes estimated)

**Configuration Highlights**:
```yaml
query:
  - id: validate-openapi
    type: analyze
    kind: openapi_validate
    target: "src/app/api/posts/route.ts"

validation:
  rules:
    - name: has-error-handling
      pattern: "try.*catch|Response\\.json.*error"
      severity: error
    - name: has-auth-check
      pattern: "Authorization|token|auth"
      severity: error
    - name: has-validation
      pattern: "z\\.object|parse|safeParse"
      severity: error
```

## Batch File Structure

All batch files follow this standard structure:

```yaml
# Metadata: Information about the batch
metadata:
  name: batch-name
  description: What this batch does
  author: your-name
  version: 1.0.0
  tags: [category, type]

# Operations: Grouped by type and phase
operations:

  # Read operations: Discovery and analysis
  read:
    - id: operation-id
      type: search|files|analyze
      # Operation-specific parameters
      depends_on: []  # Optional dependencies

  # Write operations: File modifications
  write:
    - id: operation-id
      type: create|edit|delete
      # Files and content
      depends_on: []

  # Exec operations: Commands and agents
  exec:
    - id: operation-id
      type: command|agent
      # Command or agent configuration
      depends_on: []
      inject: {}  # Pass data from previous operations
      config:
        timeout_ms: 600000
        max_turns: 50

  # Query operations: Validation and state tracking
  query:
    - id: operation-id
      type: search|analyze|state_write
      validation:
        expect: {}
        on_fail: {}
      depends_on: []

# Transaction configuration
transaction:
  mode: atomic|partial|none
  checkpoints:
    - after: operation-id
      name: checkpoint-name

# Validation configuration
validation:
  after: [typecheck, lint, test, build]
  rules:
    - name: rule-name
      pattern: "regex-pattern"
      severity: error|warning
      exclude: ["**/test/**"]

# Recovery configuration
recovery:
  checkpoint: true
  rollback_on_fail: true
  retry:
    max_attempts: 3
    backoff: exponential|linear|fixed
    initial_delay_ms: 1000
  on_fail:
    - action: create_report|notify|rollback
      output: ".goodvibes/logs/failure.md"

# Output configuration
output:
  mode: count_only|minimal|standard|verbose
  show_diffs: true
  include_reasoning: true
  report:
    format: markdown
    output: ".goodvibes/logs/report.md"
    sections: [summary, changes, validation_results, metrics]
```

## How to Create Your Own Batch File

### Step 1: Define Your Goal

Be specific about what you want to accomplish:
- Add a new feature
- Refactor existing code
- Fix a pattern across the codebase
- Migrate to a new library/pattern

### Step 2: Plan Your Phases

Break down the work into phases:
1. **Discovery**: What do you need to know about the codebase?
2. **Planning**: Do you need an architect to design the solution?
3. **Implementation**: What needs to be created or modified?
4. **Validation**: How will you verify success?
5. **Documentation**: What decisions should be tracked?

### Step 3: Start with a Template

Copy the most similar example and modify it:

```bash
# Copy an example
cp batches/rename-function.yaml batches/my-batch.yaml

# Edit the file
# Update metadata, operations, and configuration
```

### Step 4: Define Discovery Operations

Always start by understanding the current state:

```yaml
read:
  # Find existing patterns
  - id: find-existing
    type: search
    pattern: "pattern-to-find"
    glob: "src/**/*.{ts,tsx}"
    output:
      mode: content

  # Analyze structure
  - id: analyze-structure
    type: files
    targets: ["src/"]
    extract: outline
```

### Step 5: Add Implementation Operations

Use agents or write operations:

```yaml
exec:
  # Agent-based implementation
  - id: implement
    type: agent
    agent: goodvibes:engineer
    task: |
      Detailed instructions for what to implement.

      Requirements:
      - Specific requirement 1
      - Specific requirement 2
    depends_on: [find-existing]
    inject:
      context: "{{find-existing.results}}"
```

### Step 6: Add Validation

Validate incrementally:

```yaml
exec:
  - id: typecheck
    type: command
    commands:
      - cmd: "npm run typecheck"
        expect:
          exit_code: 0
    depends_on: [implement]

validation:
  after: [typecheck, lint]
  rules:
    - name: custom-rule
      pattern: "..."
      severity: error
```

### Step 7: Configure Transaction Behavior

Choose the right transaction mode:

```yaml
transaction:
  mode: atomic  # For critical changes
  # mode: partial  # For best-effort updates

  checkpoints:
    - after: implement
      name: post-implementation
```

### Step 8: Test Your Batch

Always test with dry_run first:

```yaml
config:
  preview:
    dry_run: true
    diff: true
    impact: true
```

Run it:

```bash
mcp-cli call plugin_goodvibes_batch-engine/batch - < batches/my-batch.yaml
```

## Common Patterns and Best Practices

### Pattern: Discovery Before Action

Never make assumptions about the codebase. Always discover first:

```yaml
read:
  - id: find-patterns
    type: search
    pattern: "existing-pattern"

exec:
  - id: implement
    depends_on: [find-patterns]
    inject:
      existing: "{{find-patterns.results}}"
```

**Why**: Prevents conflicts, ensures consistency, adapts to actual codebase structure.

### Pattern: Agent Chain

Use multiple specialized agents for complex tasks:

```yaml
exec:
  # Architect designs the solution
  - id: design
    agent: goodvibes:architect
    task: "Design the architecture"

  # Engineer implements
  - id: implement
    agent: goodvibes:engineer
    task: "Implement the design"
    depends_on: [design]
    inject:
      plan: "{{design.outputs.plan}}"

  # Reviewer checks quality
  - id: review
    agent: goodvibes:reviewer
    task: "Review the implementation"
    depends_on: [implement]
```

**Why**: Separation of concerns, better quality, catches issues early.

### Pattern: Incremental Validation

Validate after each major step, not just at the end:

```yaml
exec:
  - id: backend
    # Implementation

  - id: typecheck-backend
    type: command
    commands: [{ cmd: "npm run typecheck" }]
    depends_on: [backend]

  - id: frontend
    depends_on: [typecheck-backend]  # Only if backend is valid
```

**Why**: Fail fast, easier debugging, prevents cascading errors.

### Pattern: Custom Validation Rules

Define rules specific to your codebase:

```yaml
validation:
  rules:
    # Security: No credentials in code
    - name: no-credentials
      pattern: "password|api[_-]?key|secret"
      exclude: ["**/*.test.ts"]
      severity: error

    # Architecture: No direct DB access outside repos
    - name: no-direct-db
      pattern: "prisma\\."
      exclude: ["**/repositories/**"]
      severity: error

    # Quality: No TODO comments
    - name: no-todos
      pattern: "TODO|FIXME"
      severity: warning
```

**Why**: Enforce standards, catch issues automatically, maintain consistency.

### Pattern: State Injection

Pass data between operations:

```yaml
read:
  - id: analyze
    type: search
    pattern: "..."

exec:
  - id: implement
    inject:
      # Pass specific results
      results: "{{analyze.results}}"
      files: "{{analyze.files}}"
      count: "{{analyze.count}}"

      # Pass custom context
      constraints: "Follow TypeScript strict mode"
      style: "Use functional programming patterns"
```

**Why**: Context-aware implementation, follows existing patterns, better quality.

### Pattern: Checkpoint Strategy

Create checkpoints at logical boundaries:

```yaml
transaction:
  checkpoints:
    - after: discovery-complete
      name: pre-implementation

    - after: backend-complete
      name: post-backend

    - after: frontend-complete
      name: post-frontend

    - after: validation-complete
      name: post-validation
```

**Recover from checkpoint**:

```bash
mcp-cli call plugin_goodvibes_batch-engine/batch_recover '{
  "batch_id": "your-batch-id",
  "checkpoint": "post-backend"
}'
```

**Why**: Recovery points, iterative development, safe experimentation.

### Pattern: Output Mode Selection

Choose output mode based on operation type:

```yaml
# For quick operations: minimal
output:
  mode: minimal
  show_diffs: false

# For standard operations: standard
output:
  mode: standard
  show_diffs: true

# For debugging: verbose
output:
  mode: verbose
  include_reasoning: true
```

**Why**: Token efficiency, appropriate detail level, better readability.

## Transaction Modes

### Atomic Mode (Safest)

All operations succeed or all are rolled back:

```yaml
transaction:
  mode: atomic
  rollback_on_fail: true
```

**Use for**:
- Critical refactoring
- Database migrations
- Breaking changes
- Production deployments

**Behavior**:
- Single failure triggers full rollback
- Original state restored
- Slowest but safest

### Partial Mode (Fastest)

Successful operations commit, failures are isolated:

```yaml
transaction:
  mode: partial
  continue_on_error: true
```

**Use for**:
- Batch updates
- Optional enhancements
- Non-critical changes
- Independent operations

**Behavior**:
- Each operation commits independently
- Failures don't affect successful operations
- No rollback of successful operations

### None Mode (Read-Only)

No transaction management:

```yaml
transaction:
  mode: none
```

**Use for**:
- Read-only operations
- Analysis tasks
- Discovery operations
- Performance-critical paths

## Dependency Management

Operations can depend on previous operations:

```yaml
operations:
  read:
    - id: step1

  exec:
    # Waits for step1
    - id: step2
      depends_on: [step1]

    # Also waits for step1 (runs in parallel with step2)
    - id: step3
      depends_on: [step1]

    # Waits for both step2 and step3
    - id: step4
      depends_on: [step2, step3]
```

**Execution Flow**:
```
step1
  ├─> step2 ─┐
  └─> step3 ─┴─> step4
```

**Rules**:
- Operations without dependencies run immediately
- Dependencies enforce execution order
- Parallel execution when possible
- Circular dependencies are rejected

## Recovery Strategies

### Retry Configuration

```yaml
recovery:
  retry:
    max_attempts: 3
    backoff: exponential  # 1s, 2s, 4s, 8s...
    initial_delay_ms: 1000
```

**Backoff strategies**:
- `exponential`: Doubles each retry (best for rate limits)
- `linear`: Increases linearly (predictable timing)
- `fixed`: Same delay every time (simple operations)

### Failure Actions

```yaml
recovery:
  on_fail:
    - action: create_report
      output: ".goodvibes/logs/failure-{batch_id}.md"

    - action: notify
      level: error
      message: "Batch {batch_id} failed: {error}"

    - action: rollback
      to: last_checkpoint
```

## Validation Strategies

### After-Completion Validation

Run validation after all operations complete:

```yaml
validation:
  after:
    - typecheck
    - lint
    - test:
        filter: all
        coverage_threshold: 80
    - build
```

### Continuous Validation

Define rules that are checked throughout execution:

```yaml
validation:
  rules:
    - name: no-any-types
      pattern: ":\\s*any\\b"
      severity: error
      exclude: ["**/*.test.ts"]
```

### Custom Query Validation

Validate specific conditions:

```yaml
query:
  - id: verify-migration-complete
    type: search
    pattern: "old-pattern"
    validation:
      expect:
        count: 0
      on_fail:
        action: error
        message: "Migration incomplete: old pattern still exists"
```

## Best Practices Summary

1. **Always discover first** - Never assume codebase structure
2. **Use proper dependencies** - Ensure correct execution order
3. **Validate incrementally** - Catch errors early
4. **Use meaningful IDs** - Make batch files self-documenting
5. **Include context in injections** - Give agents what they need
6. **Configure appropriate timeouts** - Match operation complexity
7. **Choose right transaction mode** - Balance safety and speed
8. **Create logical checkpoints** - Enable recovery and iteration
9. **Test with dry_run** - Verify before executing
10. **Document your intent** - Add comments explaining why

## Troubleshooting

### Batch Fails Immediately

**Symptom**: Batch fails before any operations run

**Causes**:
- Invalid YAML syntax
- Circular dependencies
- Missing required fields

**Solution**:
```bash
# Validate YAML syntax
yamllint batches/my-batch.yaml

# Check dependencies
# Ensure no operation depends on itself or creates a cycle
```

### Operations Run in Wrong Order

**Symptom**: Operations execute before their dependencies

**Cause**: Missing or incorrect `depends_on` declarations

**Solution**:
```yaml
# Add explicit dependencies
exec:
  - id: step2
    depends_on: [step1]  # Ensure this is declared
```

### Agent Timeout

**Symptom**: Agent operation times out before completion

**Causes**:
- Task too complex for time limit
- Agent stuck in loop
- Insufficient turns allocated

**Solution**:
```yaml
config:
  timeout_ms: 1200000  # Increase to 20 minutes
  max_turns: 100       # Allow more iterations
```

Or break task into smaller operations:

```yaml
exec:
  - id: implement-part1
    task: "Implement first part"

  - id: implement-part2
    task: "Implement second part"
    depends_on: [implement-part1]
```

### Validation Fails

**Symptom**: Validation step reports errors

**Causes**:
- Implementation doesn't meet requirements
- Validation rules too strict
- Expected values incorrect

**Solution**:
```yaml
# Adjust validation rules
validation:
  rules:
    - name: my-rule
      severity: warning  # Change from error to warning

  # Or adjust expectations
query:
  - id: verify
    validation:
      expect:
        count: { min: 0, max: 5 }  # Allow range instead of exact
```

### Checkpoint Not Found

**Symptom**: Cannot recover from checkpoint

**Cause**: Checkpoint name doesn't exist

**Solution**:
```bash
# List available checkpoints
mcp-cli call plugin_goodvibes_batch-engine/batch_checkpoints '{"batch_id": "your-batch-id"}'

# Use correct checkpoint name
mcp-cli call plugin_goodvibes_batch-engine/batch_recover '{
  "batch_id": "your-batch-id",
  "checkpoint": "correct-checkpoint-name"
}'
```

## Related Documentation

- [../docs/reference/batch-config.md](../../docs/reference/batch-config.md) - Complete batch configuration reference
- [../../docs/reference/README.md](../../docs/reference/README.md) - All reference documentation
- [../../agents/README.md](../../agents/README.md) - Available agents and their capabilities
- [../../skills/README.md](../../skills/README.md) - Skills library for agents
- [../../../../SPEC-v2.md](../../../../SPEC-v2.md) - Complete batch system specification

## Contributing

To add more examples:

1. Create a new `.yaml` file in `batches/`
2. Follow the structure of existing examples
3. Add comprehensive comments explaining each section
4. Include realistic use cases and requirements
5. Test thoroughly with dry_run first
6. Update this README with your example

## License

These examples are part of the GoodVibes plugin and follow the same license.
