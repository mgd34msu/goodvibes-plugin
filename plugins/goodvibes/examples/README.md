# GoodVibes Batch Examples

This directory contains working examples of batch operations demonstrating the capabilities of the GoodVibes batch system (SPEC-v2).

## Overview

Each example batch file is a complete, runnable YAML specification that demonstrates different use cases and patterns. These examples follow SPEC-v2 Appendix B and serve as both documentation and templates for creating your own batches.

## Examples

### 1. Feature Implementation (`batches/auth-feature.yaml`)

**Use case:** Implementing a complete feature across backend and frontend

**Demonstrates:**
- Multi-phase operations with clear dependencies
- Agent coordination (using `goodvibes:engineer` agent)
- Discovery phase before implementation
- Validation after each major phase
- State tracking for architectural decisions
- Comprehensive error handling and recovery

**What it does:**
1. **Discovery**: Scans codebase for existing auth patterns, checks dependencies
2. **Backend**: Creates authentication API endpoints (login, register, logout, refresh)
3. **Frontend**: Builds login/register forms and auth state management
4. **Validation**: Runs typecheck, lint, and build
5. **Tracking**: Records the auth approach decision for future reference

**Key features:**
- JWT-based authentication
- Bcrypt password hashing
- Input validation with Zod
- Protected routes
- Comprehensive error handling

**Complexity:** High (600-900 seconds estimated)

**Run with:**
```bash
mcp-cli call plugin_goodvibes_batch-engine/batch - < batches/auth-feature.yaml
```

---

### 2. Codebase Refactor (`batches/repository-pattern.yaml`)

**Use case:** Large-scale architectural refactoring

**Demonstrates:**
- Multi-agent coordination (architect → engineer → reviewer)
- Pattern detection and validation
- Comprehensive search for code patterns
- Post-refactor verification
- No regression guarantee through testing

**What it does:**
1. **Discovery**: Finds all direct database calls (Prisma usage)
2. **Architecture**: Architect agent designs repository pattern
3. **Implementation**: Engineer creates repositories and migrates all callers
4. **Review**: Reviewer checks quality and completeness
5. **Validation**: Verifies no direct DB calls remain, runs full test suite
6. **Tracking**: Records pattern decision

**Key features:**
- Repository pattern implementation
- Complete migration of data access layer
- Custom validation rule (no direct DB calls outside repos)
- Comprehensive test coverage requirement

**Complexity:** Very High (900-1200 seconds estimated)

**Run with:**
```bash
mcp-cli call plugin_goodvibes_batch-engine/batch - < batches/repository-pattern.yaml
```

---

### 3. Quick Multi-Edit (`batches/rename-function.yaml`)

**Use case:** Fast, focused refactoring task

**Demonstrates:**
- Minimal verbosity mode for quick operations
- Search-and-replace workflow
- Post-edit validation
- Simple atomic transaction

**What it does:**
1. **Find**: Locates all usages of `getUserData` function
2. **Rename**: Replaces with `fetchUserProfile` across all files
3. **Verify**: Confirms old name no longer exists
4. **Validate**: Runs typecheck to ensure no broken references

**Key features:**
- Word boundary matching (avoids partial matches)
- Atomic rename (all or nothing)
- Fast validation (typecheck only)
- Minimal output mode

**Complexity:** Low (60-120 seconds estimated)

**Run with:**
```bash
mcp-cli call plugin_goodvibes_batch-engine/batch - < batches/rename-function.yaml
```

---

### 4. API Endpoint (`batches/add-api-endpoint.yaml`)

**Use case:** Adding new API functionality

**Demonstrates:**
- Following existing codebase patterns
- Schema validation (Zod)
- OpenAPI spec validation
- Incremental validation strategy
- API documentation tracking

**What it does:**
1. **Analyze**: Studies existing API routes, validation, error handling
2. **Implement**: Creates POST /api/posts endpoint with full validation
3. **Validate**: Runs typecheck, lint, API tests
4. **Verify**: Checks OpenAPI spec compliance
5. **Track**: Records API endpoint for documentation

**Key features:**
- Zod schema validation
- JWT authentication
- Proper error handling (400, 401, 500)
- OpenAPI specification validation
- Custom validation rules for APIs

**Complexity:** Medium (300-600 seconds estimated)

**Run with:**
```bash
mcp-cli call plugin_goodvibes_batch-engine/batch - < batches/add-api-endpoint.yaml
```

## Batch Structure Overview

All examples follow this common structure:

```yaml
# Metadata about the batch
metadata:
  name: batch-name
  description: What this batch does
  version: 1.0.0

# Operations grouped by type
operations:
  read:    # Discovery operations
  write:   # File modification operations
  exec:    # Command execution and agent spawning
  query:   # Validation and state operations

# Transaction control
transaction:
  mode: atomic
  checkpoints: [...]

# Validation rules
validation:
  after: [typecheck, lint, test]
  rules: [...]

# Recovery strategy
recovery:
  checkpoint: true
  rollback_on_fail: true
  retry: {...}

# Output configuration
output:
  mode: standard|minimal
  show_diffs: true
  report: {...}
```

## Common Patterns

### Pattern: Discovery Before Action

All examples start with a discovery phase:

```yaml
read:
  - id: find-existing
    type: search
    pattern: "some-pattern"

exec:
  - id: implement
    depends_on: [find-existing]
    inject:
      context: "{{find-existing.results}}"
```

### Pattern: Agent Coordination

Complex tasks use multiple specialized agents:

```yaml
exec:
  - id: design
    agent: goodvibes:architect
    task: "Design the solution"

  - id: implement
    agent: goodvibes:engineer
    task: "Implement the design"
    depends_on: [design]
    inject:
      plan: "{{design.outputs.plan}}"

  - id: review
    agent: goodvibes:reviewer
    task: "Review the implementation"
    depends_on: [implement]
```

### Pattern: Incremental Validation

Validate after each phase, not just at the end:

```yaml
exec:
  - id: implement
    # ... implementation

  - id: typecheck
    type: command
    commands: [{ cmd: "npm run typecheck" }]
    depends_on: [implement]

  - id: next-step
    depends_on: [typecheck]  # Won't run if typecheck fails
```

### Pattern: Custom Validation Rules

Define rules specific to your task:

```yaml
validation:
  rules:
    - name: no-direct-db-access
      pattern: "prisma\\."
      exclude: ["**/repositories/**"]
      severity: error

    - name: has-error-handling
      pattern: "try.*catch"
      location: "src/api/**"
      severity: error
```

## Dependency Management

Operations can depend on previous operations:

```yaml
operations:
  read:
    - id: step1
      # ...

  exec:
    - id: step2
      depends_on: [step1]  # Waits for step1

    - id: step3
      depends_on: [step1]  # Also waits for step1 (parallel with step2)

    - id: step4
      depends_on: [step2, step3]  # Waits for both
```

## State Injection

Pass data from one operation to another:

```yaml
read:
  - id: find-patterns
    type: search
    pattern: "..."

exec:
  - id: implement
    depends_on: [find-patterns]
    inject:
      patterns: "{{find-patterns.results}}"
      files: "{{find-patterns.files}}"
      count: "{{find-patterns.count}}"
```

## Transaction Modes

### Atomic Mode

All operations succeed or all are rolled back:

```yaml
transaction:
  mode: atomic
  rollback_on_fail: true
```

### Best-effort Mode

Continue even if some operations fail:

```yaml
transaction:
  mode: best-effort
  continue_on_error: true
```

## Checkpoints

Create recovery points:

```yaml
transaction:
  checkpoints:
    - after: discovery-complete
      name: pre-implementation
    - after: implementation
      name: post-implementation
```

Recover from checkpoint:

```bash
mcp-cli call plugin_goodvibes_batch-engine/batch_recover '{"batch_id": "...", "checkpoint": "pre-implementation"}'
```

## Output Modes

### Standard Mode

Full verbosity with diffs and reasoning:

```yaml
output:
  mode: standard
  show_diffs: true
  include_reasoning: true
```

### Minimal Mode

For quick operations, reduce output:

```yaml
output:
  mode: minimal
  show_diffs: false
  include_reasoning: false
```

## Recovery Strategies

### Retry Configuration

```yaml
recovery:
  retry:
    max_attempts: 3
    backoff: exponential  # or linear
    initial_delay_ms: 1000
```

### Failure Actions

```yaml
recovery:
  on_fail:
    - action: create_report
      output: ".goodvibes/logs/failure.md"
    - action: notify
      level: error
      message: "Batch failed"
    - action: rollback
      to: last_checkpoint
```

## Validation Strategies

### After-completion Validation

```yaml
validation:
  after:
    - typecheck
    - lint
    - test
    - build
```

### Continuous Validation

```yaml
validation:
  rules:
    - name: rule-name
      pattern: "regex-pattern"
      severity: error|warning
      exclude: ["**/test/**"]
```

### Custom Validation

```yaml
query:
  - id: custom-check
    type: search
    pattern: "..."
    validation:
      expect:
        count: 0
      on_fail:
        action: error
        message: "Custom validation failed"
```

## Best Practices

### 1. Always Discover First

Don't make assumptions about the codebase:

```yaml
# ❌ BAD: Assume file exists
write:
  - id: modify
    file: "src/config.ts"
    # What if it doesn't exist?

# ✅ GOOD: Discover first
read:
  - id: find-config
    type: files
    targets: ["src/config.ts"]

write:
  - id: modify
    depends_on: [find-config]
```

### 2. Use Proper Dependencies

Ensure operations run in correct order:

```yaml
# ✅ GOOD: Clear dependency chain
read: [{ id: discover }]
exec: [
  { id: implement, depends_on: [discover] },
  { id: validate, depends_on: [implement] }
]
```

### 3. Validate Incrementally

Don't wait until the end:

```yaml
exec:
  - id: backend
    # ...
  - id: typecheck-backend
    depends_on: [backend]

  - id: frontend
    depends_on: [typecheck-backend]  # Only proceed if backend is valid
```

### 4. Use Meaningful IDs

Operation IDs should be descriptive:

```yaml
# ❌ BAD
read: [{ id: r1 }, { id: r2 }]

# ✅ GOOD
read: [
  { id: find-auth-patterns },
  { id: check-dependencies }
]
```

### 5. Include Context in Injections

Give agents what they need:

```yaml
inject:
  existing_code: "{{find.results}}"
  patterns: "{{analyze.patterns}}"
  constraints: "Use TypeScript, follow ESLint rules"
```

### 6. Configure Appropriate Timeouts

```yaml
exec:
  - id: quick-task
    config:
      timeout_ms: 60000  # 1 minute

  - id: complex-task
    config:
      timeout_ms: 900000  # 15 minutes
```

## Customizing Examples

To adapt these examples for your use case:

1. **Change the search patterns** to match your code
2. **Update agent tasks** with your specific requirements
3. **Adjust validation rules** to your standards
4. **Modify file paths** to match your project structure
5. **Add/remove operations** as needed
6. **Configure timeouts** based on your project size

## Testing Batches

Test your batch without making changes:

```yaml
# Add to any batch
config:
  dry_run: true  # Preview without executing
```

Or use the batch status tool to monitor:

```bash
# Start batch
mcp-cli call plugin_goodvibes_batch-engine/batch - < your-batch.yaml

# Monitor progress
mcp-cli call plugin_goodvibes_batch-engine/batch_status '{"batch_id": "..."}'
```

## Troubleshooting

### Batch fails immediately

Check operation dependencies - circular or missing dependencies will fail:

```yaml
# ❌ Circular dependency
- id: a, depends_on: [b]
- id: b, depends_on: [a]
```

### Operations run in wrong order

Ensure proper `depends_on` declarations:

```yaml
# Operations without dependencies run in parallel
# Add dependencies to enforce order
```

### Agent timeout

Increase timeout or break task into smaller operations:

```yaml
config:
  timeout_ms: 1200000  # 20 minutes
  max_turns: 100  # More turns for complex tasks
```

### Validation fails

Check validation rules and expected values:

```yaml
validation:
  expect:
    count: 0  # Make sure this matches reality
```

## Further Reading

- **SPEC-v2.md** - Full batch specification
- **plugins/goodvibes/agents/** - Agent documentation
- **plugins/goodvibes/skills/** - Available skills
- **plugins/goodvibes/tools/implementations/batch-engine/** - Batch engine source

## Contributing

To add more examples:

1. Create a new `.yaml` file in `batches/`
2. Follow the structure of existing examples
3. Add comprehensive comments
4. Include realistic use cases
5. Test thoroughly
6. Update this README

## License

These examples are part of the GoodVibes plugin and follow the same license.
