# Tool Migration Guide: v1 → v2

## Overview

GoodVibes v2 consolidates individual tools into batch operations for better efficiency and parallelism. This guide maps v1 system tools to their v2 equivalents and shows how to migrate your usage patterns.

## Key Changes

### Batch-First Architecture
- **v1**: Individual tool calls, sequential execution
- **v2**: Batch operations with parallel execution by default

### Token Efficiency
- **v1**: Full output, limited control
- **v2**: Precision output modes (`count_only`, `files_only`, `minimal`)

### Transaction Safety
- **v1**: No rollback, manual error handling
- **v2**: Atomic transactions with automatic rollback

## Tool Mappings

### File Operations

| v1 Tool | v2 Equivalent | Migration Notes |
|---------|---------------|-----------------|
| `Read` | `precision_read` | Use `extract` modes for token efficiency |
| `Read` (multiple files) | `batch.operations.read.files` | Batch reads in single operation |
| `Write` | `precision_write` | Atomic writes with validation |
| `Write` (multiple files) | `batch.operations.write.create` | Batch creates with transaction support |
| `Edit` | `precision_edit` | Atomic edits with conflict detection |
| `Edit` (multiple files) | `batch.operations.write.edit` | Batch edits in single transaction |
| N/A | `batch.operations.write.delete` | New: Safe delete with guards |
| N/A | `batch.operations.write.move` | New: Move with import updates |
| N/A | `batch.operations.write.copy` | New: Copy operations |

### Search Operations

| v1 Tool | v2 Equivalent | Migration Notes |
|---------|---------------|-----------------|
| `Grep` | `precision_grep` | Output modes for token control |
| `Grep` (multiple patterns) | `batch.operations.read.search` | Batch search with aggregation |
| `Glob` | `precision_glob` | Output modes and filters |
| `Glob` (multiple patterns) | `batch.operations.read.glob` | Batch glob operations |
| N/A | `precision_symbols` | New: Symbol extraction (replaces full reads) |
| N/A | `batch.operations.read.symbols` | New: Batch symbol queries |
| N/A | `discover` | New: Multi-query discovery tool |

### Execution

| v1 Tool | v2 Equivalent | Migration Notes |
|---------|---------------|-----------------|
| `Bash` | `precision_exec` | Batch commands, expectations checking |
| `Bash` (validation) | `batch.operations.exec.command` | Integrated with lifecycle hooks |
| N/A | `batch.operations.exec.agent` | New: Spawn agents in batch |
| N/A | `batch.operations.exec.script` | New: Execute scripts |

### Analysis

| v1 Tool | v2 Equivalent | Migration Notes |
|---------|---------------|-----------------|
| N/A | `analysis-engine/detect_stack` | New: Technology stack detection |
| N/A | `analysis-engine/find_dead_code` | New: Dead code detection |
| N/A | `analysis-engine/scan_patterns` | New: Pattern discovery |
| N/A | `analysis-engine/check_versions` | New: Version checking |
| N/A | `analysis-engine/find_circular_deps` | New: Circular dependency detection |
| N/A | `batch.operations.read.analyze` | New: Batch analysis operations |

### Web Operations

| v1 Tool | v2 Equivalent | Migration Notes |
|---------|---------------|-----------------|
| `WebFetch` | `precision_fetch` | Batch fetching, extraction modes |
| `WebFetch` (multiple URLs) | `batch.operations.read.url` | Batch URL fetching |

### State & Memory

| v1 Tool | v2 Equivalent | Migration Notes |
|---------|---------------|-----------------|
| N/A | `batch_state` | New: State management tool |
| N/A | `batch.operations.state.get` | New: Get state values |
| N/A | `batch.operations.state.set` | New: Set state values |
| N/A | `batch.operations.state.track` | New: Track decisions/patterns/failures |
| N/A | `batch.operations.state.query` | New: Query memory system |

## Migration Examples

### Example 1: Reading Multiple Files

**v1 Pattern:**
```markdown
1. Call Read for file1.ts
2. Call Read for file2.ts
3. Call Read for file3.ts
4. Manually aggregate results
```

**v2 Pattern:**
```yaml
batch:
  operations:
    read:
      - type: files
        targets:
          - src/file1.ts
          - src/file2.ts
          - src/file3.ts
        extract: outline  # Token-efficient
        output:
          mode: minimal
```

**Benefits:**
- Single operation (3 tool calls → 1 tool call)
- Parallel execution (3x faster)
- Token reduction: ~90% (outline vs full content)

### Example 2: Search and Edit Pattern

**v1 Pattern:**
```markdown
1. Grep for pattern
2. Read each matching file
3. Edit each file individually
4. Run validation command
```

**v2 Pattern:**
```yaml
batch:
  operations:
    read:
      - id: search
        type: search
        pattern: "oldFunction"
        glob: "src/**/*.ts"
        output:
          mode: files_only

    write:
      - id: edits
        type: edit
        depends_on: [search]
        targets: "{{search.files}}"  # Template injection
        find: "oldFunction"
        replace: "newFunction"

    exec:
      - id: validate
        type: command
        depends_on: [edits]
        commands:
          - cmd: "npm run typecheck"
            expect:
              exit_code: 0

  config:
    transaction:
      mode: atomic
      rollback_on_fail: true
```

**Benefits:**
- Automatic dependency ordering
- Parallel where possible
- Atomic transaction (all-or-nothing)
- Automatic rollback on failure
- Template injection from prior results

### Example 3: Discovery Before Action

**v1 Pattern:**
```markdown
1. Grep to find files
2. Count results
3. Decide if scope is correct
4. Read files
5. Make changes
```

**v2 Pattern:**
```yaml
# Step 1: Discovery
discover:
  queries:
    - id: components
      type: glob
      patterns: ["src/components/**/*.tsx"]
    - id: api_routes
      type: glob
      patterns: ["src/api/**/*.ts"]
    - id: auth_usage
      type: grep
      pattern: "useAuth"
      glob: "src/**/*.ts"
  output_mode: count_only  # Just counts

# Step 2: Use results in batch
batch:
  operations:
    read:
      - type: files
        targets: "{{components.files}}"  # From discovery
        extract: symbols
```

**Benefits:**
- Two-phase: discover → act
- Count-only mode for scope verification
- Template resolution from discovery
- No wasted reads

### Example 4: Multi-File Edit with Validation

**v1 Pattern:**
```markdown
1. Edit file1.ts
2. Edit file2.ts
3. Edit file3.ts
4. Run typecheck (fails on file2.ts)
5. Manually fix file2.ts
6. Run typecheck again
```

**v2 Pattern:**
```yaml
batch:
  operations:
    write:
      - type: edit
        targets:
          - path: src/file1.ts
            find: "old"
            replace: "new"
          - path: src/file2.ts
            find: "old"
            replace: "new"
          - path: src/file3.ts
            find: "old"
            replace: "new"

  config:
    transaction:
      mode: atomic
      rollback_on_fail: true

    validation:
      after:
        - hook: typecheck
        - hook: lint
      on_fail: fix_loop  # Automatic fix attempts

    recovery:
      checkpoint: true
      max_fix_attempts: 3
```

**Benefits:**
- All edits in one transaction
- Automatic validation
- Fix loop attempts automatic repairs
- Checkpoint for manual recovery if needed
- Rollback on failure

### Example 5: Agent Spawning

**v1 Pattern:**
```markdown
N/A - No batch agent spawning in v1
```

**v2 Pattern:**
```yaml
batch:
  operations:
    exec:
      - type: agent
        agents:
          - agent: engineer
            task: "Implement authentication"
            budget:
              turns: 10
              tokens: 50000
            inject:
              - "{{patterns.auth}}"

          - agent: tester
            task: "Write tests for authentication"
            depends_on: [engineer_agent]
            budget:
              turns: 5
              tokens: 20000
```

**Benefits:**
- Parallel agent execution (where dependencies allow)
- Budget control per agent
- Automatic result passing between agents
- Context injection from memory

## Output Mode Strategy

### When to Use Each Mode

| Output Mode | Use When | Token Savings |
|-------------|----------|---------------|
| `count_only` | Just need to know "how many" | ~99% |
| `files_only` | Need file paths for next operation | ~95% |
| `locations` | Need to know where matches are | ~90% |
| `minimal` | Need results but not verbose output | ~80% |
| `standard` | Need full context for analysis | baseline |

### Progressive Discovery Pattern

```yaml
# Phase 1: Count to assess scope
discover:
  queries:
    - id: scope
      type: grep
      pattern: "deprecated"
  output_mode: count_only

# User sees: "Found 45 matches"

# Phase 2: Get files to plan
discover:
  queries:
    - id: files
      type: grep
      pattern: "deprecated"
  output_mode: files_only

# User sees: List of 12 files

# Phase 3: Get specific matches to act
batch:
  operations:
    read:
      - type: search
        pattern: "deprecated"
        output:
          mode: locations
```

## Transaction Modes

### v2 Transaction Options

| Mode | Behavior | Use When |
|------|----------|----------|
| `atomic` | All-or-nothing, rollback on any failure | Critical changes, must be consistent |
| `isolated` | Per-operation checkpoints, continue on failure | Independent changes, want partial success |
| `best_effort` | No rollback, record failures | Exploratory work, failures acceptable |

### Example: Atomic Transaction

```yaml
batch:
  config:
    transaction:
      mode: atomic
      isolation: serializable
      timeout_ms: 30000
      rollback_on_fail: true
```

## Validation Hooks

### Built-in Hooks (v2)

| Hook | Purpose | When to Use |
|------|---------|-------------|
| `typecheck` | Run TypeScript type checking | After code changes |
| `lint` | Run linter | After code changes |
| `test` | Run test suite | After logic changes |
| `build` | Run build process | Before considering done |
| `checkpoint` | Create restore point | Before risky operations |

### Example: Full Validation Pipeline

```yaml
batch:
  config:
    validation:
      before:
        - hook: checkpoint  # Create restore point

      after:
        - hook: typecheck
        - hook: lint
        - hook: test

      on_fail: fix_loop  # Attempt automatic fixes
```

## Fix Loop (v2 Only)

The fix loop automatically attempts to repair failures using:

1. **Auto-fix**: Known patterns (imports, formatting, types)
2. **Agent-fix**: Spawn reviewer agent to fix
3. **Targeted-fix**: Isolate and retry
4. **Rollback**: Restore checkpoint

```yaml
batch:
  config:
    recovery:
      checkpoint: true
      rollback_on_fail: true
      max_fix_attempts: 3
      fix_strategies:
        - auto_fix
        - agent_fix
        - rollback
```

## Migration Checklist

When migrating from v1 to v2:

- [ ] Replace individual `Read` calls with `batch.operations.read.files`
- [ ] Replace individual `Edit` calls with `batch.operations.write.edit`
- [ ] Use `discover` for scope assessment before batch operations
- [ ] Add `output.mode: minimal` to reduce tokens
- [ ] Use `extract: outline` for structure-only reads
- [ ] Use `extract: symbols` for API surface analysis
- [ ] Enable `transaction.mode: atomic` for critical changes
- [ ] Add validation hooks: `typecheck`, `lint`, `test`
- [ ] Enable `recovery.checkpoint: true` for safety
- [ ] Use template injection `{{operation_id.path}}` for chaining
- [ ] Replace sequential operations with dependency graph
- [ ] Use `depends_on` instead of manual ordering

## Common Patterns

### Pattern: Rename Across Codebase

**v2 Implementation:**
```yaml
batch:
  operations:
    read:
      - id: find_usage
        type: search
        pattern: "oldName"
        mode: regex
        glob: "src/**/*.ts"
        output:
          mode: locations

    write:
      - id: rename
        type: edit
        depends_on: [find_usage]
        targets: "{{find_usage.files}}"
        find: "\\boldName\\b"
        replace: "newName"

    exec:
      - id: validate
        type: command
        depends_on: [rename]
        commands:
          - cmd: "npm run typecheck"
            expect:
              exit_code: 0

  config:
    transaction:
      mode: atomic
    validation:
      after: [typecheck, test]
    recovery:
      checkpoint: true
      rollback_on_fail: true
```

### Pattern: Feature Implementation

**v2 Implementation:**
```yaml
batch:
  operations:
    read:
      - id: analyze_structure
        type: analyze
        kind: stack

      - id: find_patterns
        type: search
        pattern: "export (class|function|const)"
        glob: "src/features/**/*.ts"
        output:
          mode: files_only

    write:
      - id: create_files
        type: create
        depends_on: [analyze_structure]
        files:
          - path: src/features/auth/index.ts
            content: "{{template:feature-index}}"
          - path: src/features/auth/types.ts
            content: "{{template:feature-types}}"

    exec:
      - id: validate
        type: command
        depends_on: [create_files]
        commands:
          - cmd: "npm run typecheck"
          - cmd: "npm run build"

  config:
    transaction:
      mode: atomic
    validation:
      after: [typecheck, build]
```

## Performance Comparison

### Token Usage

| Operation | v1 Tokens | v2 Tokens | Savings |
|-----------|-----------|-----------|---------|
| Read 10 files (full) | 50,000 | 5,000 (outline) | 90% |
| Search 1000 files | 30,000 | 500 (files_only) | 98% |
| Edit 20 files | 40,000 | 2,000 (minimal) | 95% |
| Structure analysis | 100,000 | 5,000 (symbols) | 95% |

### Execution Time

| Operation | v1 Time | v2 Time | Improvement |
|-----------|---------|---------|-------------|
| Read 10 files | 10s | 2s | 5x faster |
| Search + Edit | 15s | 3s | 5x faster |
| Multi-file edit | 20s | 4s | 5x faster |

## Best Practices

### 1. Always Discover First

```yaml
# Good
discover:
  queries:
    - id: scope
      type: grep
      pattern: "target"
  output_mode: count_only

# Then use in batch
batch:
  operations:
    read:
      - targets: "{{scope.files}}"
```

### 2. Use Appropriate Output Modes

```yaml
# Good - progressive detail
read:
  - id: count
    output: { mode: count_only }

  - id: files
    output: { mode: files_only }

  - id: content
    output: { mode: minimal }

# Bad - always full output
read:
  - id: everything
    output: { mode: standard }  # Wasteful
```

### 3. Enable Safety Features

```yaml
# Good - safe by default
batch:
  config:
    transaction:
      mode: atomic
      rollback_on_fail: true
    recovery:
      checkpoint: true
      max_fix_attempts: 3
    validation:
      after: [typecheck, lint, test]

# Bad - no safety nets
batch:
  config:
    transaction:
      mode: best_effort  # Risky
```

### 4. Use Template Injection

```yaml
# Good - data flows through templates
batch:
  operations:
    read:
      - id: search
        type: search

    write:
      - id: edit
        targets: "{{search.files}}"  # From search

# Bad - hardcoded
batch:
  operations:
    write:
      - id: edit
        targets: [file1.ts, file2.ts]  # Manual
```

## Troubleshooting

### Issue: Transaction Rollback

**Symptom**: All changes reverted after failure

**Solution**: Check validation hooks, review fix loop settings

```yaml
batch:
  config:
    recovery:
      max_fix_attempts: 3  # Try fixes first
      rollback_on_fail: false  # Keep partial progress
```

### Issue: Token Limit Exceeded

**Symptom**: Operation fails with token error

**Solution**: Use more aggressive output modes

```yaml
batch:
  operations:
    read:
      - extract: symbols  # Not content
        output:
          mode: minimal
          max_tokens: 5000
```

### Issue: Operation Timeout

**Symptom**: Batch times out

**Solution**: Increase timeout, reduce parallelism

```yaml
batch:
  config:
    transaction:
      timeout_ms: 60000
    execution:
      max_workers: 4  # Reduce from default
```

## Further Reading

- [Batch Engine Specification](../../SPEC-v2.md#3-batch-engine-core)
- [Operation Types Reference](../../SPEC-v2.md#4-operation-types)
- [Precision Tools Guide](../guides/precision-tools.md)
- [Transaction Safety Guide](../guides/transactions.md)

---

**Next Steps:**
1. Review [Agent Migration Guide](./agent-migration.md)
2. Review [Configuration Migration Guide](./config-migration.md)
3. Start with simple batch operations
4. Progressively add safety features
5. Optimize with output modes

---

*Last updated: 2026-01-21*
*SPEC version: v2.0.0*
