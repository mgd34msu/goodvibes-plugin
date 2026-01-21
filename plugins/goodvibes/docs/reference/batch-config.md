# Batch Configuration Reference

Complete reference for batch operation configuration.

## Overview

Every batch operation accepts a configuration object that controls transaction behavior, execution modes, validation, recovery, and output. This reference documents all available options with examples.

## Full Configuration Schema

```typescript
interface BatchConfig {
  // Transaction control
  transaction: {
    mode: 'atomic' | 'partial' | 'none';
    isolation: 'strict' | 'relaxed';
    timeout_ms: number;
  };

  // Execution control
  execution: {
    mode: 'parallel' | 'sequential' | 'adaptive';
    max_workers: number;
    fail_fast: boolean;
    retry: {
      attempts: number;
      backoff: 'linear' | 'exponential' | 'fixed';
      delay_ms: number;
    };
  };

  // Preview & validation
  preview: {
    dry_run: boolean;
    diff: boolean;
    impact: boolean;
  };

  validation: {
    before: ValidationStep[];
    after: ValidationStep[];
    on_fail: 'rollback' | 'warn' | 'ignore';
  };

  // Recovery
  recovery: {
    checkpoint: boolean;
    rollback_on_fail: boolean;
    cleanup_on_success: boolean;
  };
}

interface OutputConfig {
  mode: 'count_only' | 'minimal' | 'standard' | 'verbose';
  include: string[];
  exclude: string[];
  max_tokens?: number;
}
```

## Transaction Configuration

Controls how operations are committed and rolled back.

### `transaction.mode`
- **Type**: `'atomic' | 'partial' | 'none'`
- **Default**: `'atomic'`
- **Description**: Transaction behavior for the batch

#### `'atomic'`
All-or-nothing execution. If any operation fails, all changes are rolled back.

**Use Cases**:
- Multi-file refactoring
- Database migrations
- Critical updates

**Example**:
```yaml
config:
  transaction:
    mode: atomic
```

**Behavior**:
- All operations must succeed
- Single failure triggers full rollback
- Original state restored on failure
- Slowest but safest mode

#### `'partial'`
Best-effort execution. Successful operations are committed, failures are isolated.

**Use Cases**:
- Batch updates where some may fail
- Optional enhancements
- Non-critical changes

**Example**:
```yaml
config:
  transaction:
    mode: partial
```

**Behavior**:
- Each operation commits independently
- Failures don't affect successful operations
- No rollback of successful operations
- Fastest but least safe mode

#### `'none'`
No transaction management. Changes are applied immediately.

**Use Cases**:
- Read-only operations
- Idempotent operations
- Performance-critical paths

**Example**:
```yaml
config:
  transaction:
    mode: none
```

**Behavior**:
- No commit/rollback
- Changes apply immediately
- No recovery on failure
- Maximum performance

### `transaction.isolation`
- **Type**: `'strict' | 'relaxed'`
- **Default**: `'strict'`
- **Description**: Isolation level for concurrent operations

#### `'strict'`
Full isolation. Operations see consistent snapshot of data.

**Example**:
```yaml
config:
  transaction:
    isolation: strict
```

**Behavior**:
- Operations see consistent state
- Conflicts detected and prevented
- Slower but safer

#### `'relaxed'`
Relaxed isolation. Operations may see intermediate states.

**Example**:
```yaml
config:
  transaction:
    isolation: relaxed
```

**Behavior**:
- Operations may see partial updates
- Better performance
- Risk of inconsistent reads

### `transaction.timeout_ms`
- **Type**: `number` (milliseconds)
- **Default**: `300000` (5 minutes)
- **Description**: Maximum time for batch execution

**Example**:
```yaml
config:
  transaction:
    timeout_ms: 60000  # 1 minute
```

**Recommendations**:
- Quick operations: 30000 (30 seconds)
- Standard operations: 300000 (5 minutes)
- Long operations: 600000 (10 minutes)
- Very long operations: 1800000 (30 minutes)

## Execution Configuration

Controls how operations are executed and scheduled.

### `execution.mode`
- **Type**: `'parallel' | 'sequential' | 'adaptive'`
- **Default**: `'parallel'`
- **Description**: Execution strategy for operations

#### `'parallel'`
Execute independent operations concurrently.

**Use Cases**:
- Operations with no dependencies
- I/O-bound operations
- Maximum throughput

**Example**:
```yaml
config:
  execution:
    mode: parallel
    max_workers: 6
```

**Behavior**:
- Operations run concurrently
- Dependencies respected automatically
- Maximum parallelism up to `max_workers`

#### `'sequential'`
Execute operations one at a time in order.

**Use Cases**:
- Operations with implicit dependencies
- Resource-constrained environments
- Debugging

**Example**:
```yaml
config:
  execution:
    mode: sequential
```

**Behavior**:
- Operations run in definition order
- One operation at a time
- Predictable execution order

#### `'adaptive'`
Dynamically adjust parallelism based on system resources and operation characteristics.

**Use Cases**:
- Mixed I/O and CPU operations
- Variable load environments
- Optimal resource utilization

**Example**:
```yaml
config:
  execution:
    mode: adaptive
    max_workers: 6
```

**Behavior**:
- Analyzes operation types
- Adjusts parallelism dynamically
- Respects `max_workers` limit

### `execution.max_workers`
- **Type**: `number`
- **Default**: `4`
- **Description**: Maximum concurrent operations

**Example**:
```yaml
config:
  execution:
    max_workers: 6
```

**Recommendations**:
- Light operations: 8-12
- Standard operations: 4-6
- Heavy operations: 2-4
- Single operation: 1

### `execution.fail_fast`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Stop execution on first failure

**Example**:
```yaml
config:
  execution:
    fail_fast: true
```

**When `true`**:
- Stop immediately on first error
- Cancel pending operations
- Faster failure detection
- Use with `transaction.mode: atomic`

**When `false`**:
- Continue executing remaining operations
- Collect all errors
- See all failures at once
- Use with `transaction.mode: partial`

### `execution.retry`

Retry configuration for failed operations.

#### `execution.retry.attempts`
- **Type**: `number`
- **Default**: `3`
- **Description**: Number of retry attempts

**Example**:
```yaml
config:
  execution:
    retry:
      attempts: 3
```

**Recommendations**:
- Network operations: 3-5
- File operations: 2-3
- Database operations: 3-5
- No retries: 0

#### `execution.retry.backoff`
- **Type**: `'linear' | 'exponential' | 'fixed'`
- **Default**: `'exponential'`
- **Description**: Backoff strategy between retries

**`'linear'`**: Delay increases linearly (delay, 2*delay, 3*delay, ...)
```yaml
retry:
  backoff: linear
  delay_ms: 1000  # 1s, 2s, 3s, ...
```

**`'exponential'`**: Delay doubles each retry (delay, 2*delay, 4*delay, ...)
```yaml
retry:
  backoff: exponential
  delay_ms: 1000  # 1s, 2s, 4s, 8s, ...
```

**`'fixed'`**: Same delay for all retries
```yaml
retry:
  backoff: fixed
  delay_ms: 1000  # 1s, 1s, 1s, ...
```

#### `execution.retry.delay_ms`
- **Type**: `number` (milliseconds)
- **Default**: `1000` (1 second)
- **Description**: Initial delay between retries

**Example**:
```yaml
config:
  execution:
    retry:
      delay_ms: 2000  # 2 seconds
```

## Preview Configuration

Controls preview and dry-run behavior.

### `preview.dry_run`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Execute without making changes

**Example**:
```yaml
config:
  preview:
    dry_run: true
```

**Behavior**:
- Operations simulate execution
- No actual changes made
- Shows what would happen
- Use for testing and validation

### `preview.diff`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Show diffs for changes

**Example**:
```yaml
config:
  preview:
    diff: true
```

**Output**:
- Shows before/after for edits
- Displays added/removed files
- Includes line-level diffs
- Useful for review

### `preview.impact`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Analyze and report impact

**Example**:
```yaml
config:
  preview:
    impact: true
```

**Analysis**:
- Files affected
- Lines changed
- Dependencies impacted
- Breaking changes detected

## Validation Configuration

Controls validation steps and error handling.

### `validation.before`
- **Type**: `ValidationStep[]`
- **Default**: `[]`
- **Description**: Validation to run before operations

**Example**:
```yaml
validation:
  before:
    - typecheck
    - lint
    - test:
        filter: related
```

**Common Steps**:
- `typecheck` - TypeScript type checking
- `lint` - ESLint/linter
- `format` - Prettier/formatter
- `test` - Run tests
- `build` - Build check

### `validation.after`
- **Type**: `ValidationStep[]`
- **Default**: `[]`
- **Description**: Validation to run after operations

**Example**:
```yaml
validation:
  after:
    - typecheck
    - test:
        filter: all
    - build
```

**Common Steps**:
- `typecheck` - Verify types still pass
- `lint` - Check code style
- `test` - Run test suite
- `build` - Verify buildable
- `e2e` - End-to-end tests

### `validation.on_fail`
- **Type**: `'rollback' | 'warn' | 'ignore'`
- **Default**: `'rollback'`
- **Description**: What to do when validation fails

#### `'rollback'`
Rollback all changes on validation failure.

**Example**:
```yaml
validation:
  on_fail: rollback
```

**Behavior**:
- Undo all operations
- Restore original state
- Report failure
- Safest option

#### `'warn'`
Report validation failure but keep changes.

**Example**:
```yaml
validation:
  on_fail: warn
```

**Behavior**:
- Keep changes
- Display warnings
- Allow user to fix
- Useful for development

#### `'ignore'`
Ignore validation failures completely.

**Example**:
```yaml
validation:
  on_fail: ignore
```

**Behavior**:
- Keep changes
- No warnings
- Continue execution
- Use with caution

## Recovery Configuration

Controls checkpointing and recovery behavior.

### `recovery.checkpoint`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Create checkpoints during execution

**Example**:
```yaml
config:
  recovery:
    checkpoint: true
```

**Behavior**:
- Save state at phase boundaries
- Enable recovery from failures
- Allow resuming interrupted batches
- Slight performance overhead

### `recovery.rollback_on_fail`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Automatically rollback on failure

**Example**:
```yaml
config:
  recovery:
    rollback_on_fail: true
```

**Behavior**:
- Restore checkpoint on failure
- Undo partial changes
- Return to known good state
- Use with `transaction.mode: atomic`

### `recovery.cleanup_on_success`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Remove checkpoints after successful completion

**Example**:
```yaml
config:
  recovery:
    cleanup_on_success: true
```

**Behavior**:
- Delete checkpoints after success
- Save disk space
- Keep checkpoints on failure
- Allow manual recovery

## Output Configuration

Controls verbosity and output format.

### `output.mode`
- **Type**: `'count_only' | 'minimal' | 'standard' | 'verbose'`
- **Default**: Depends on mode (see [Mode Configuration](./mode-config.md))
- **Description**: Output verbosity level

#### `'count_only'`
Only counts and statistics.

**Example**:
```yaml
output:
  mode: count_only
```

**Output**:
```
5 operations completed
3 files modified
```

**Token Usage**: ~5-10 tokens

#### `'minimal'`
Counts plus summary information.

**Example**:
```yaml
output:
  mode: minimal
```

**Output**:
```
5 operations completed
Files: src/api.ts, src/db.ts, src/types.ts
Changes: 127 lines modified
```

**Token Usage**: ~20-50 tokens

#### `'standard'`
Summary plus key details.

**Example**:
```yaml
output:
  mode: standard
```

**Output**:
```
Batch "refactor-api" completed

Operations:
  ✓ read (3 files)
  ✓ edit (5 changes)
  ✓ validate (typecheck, lint)

Files modified:
  - src/api.ts (45 lines)
  - src/db.ts (32 lines)
  - src/types.ts (50 lines)

Duration: 3.2s
```

**Token Usage**: ~100-300 tokens

#### `'verbose'`
Full details including diffs and logs.

**Example**:
```yaml
output:
  mode: verbose
```

**Output**:
```
Batch "refactor-api" completed

Phase 1: Read
  ✓ read-files (3 files, 2.1s)
    - src/api.ts (450 lines)
    - src/db.ts (320 lines)
    - src/types.ts (180 lines)

Phase 2: Edit
  ✓ rename-function (5 changes, 0.8s)
    src/api.ts:
      @@ -12,7 +12,7 @@
      -export function getData() {
      +export function fetchData() {
    ...

Phase 3: Validate
  ✓ typecheck (0 errors, 1.2s)
  ✓ lint (0 warnings, 0.9s)

Duration: 3.2s
Tokens: 450
```

**Token Usage**: ~500-2000 tokens

### `output.include`
- **Type**: `string[]`
- **Default**: `[]`
- **Description**: Include specific output sections

**Example**:
```yaml
output:
  mode: minimal
  include:
    - diffs
    - timing
```

**Available Sections**:
- `diffs` - Show file diffs
- `timing` - Show operation timing
- `tokens` - Show token usage
- `errors` - Show error details
- `warnings` - Show warnings
- `logs` - Show operation logs

### `output.exclude`
- **Type**: `string[]`
- **Default**: `[]`
- **Description**: Exclude specific output sections

**Example**:
```yaml
output:
  mode: standard
  exclude:
    - logs
    - warnings
```

### `output.max_tokens`
- **Type**: `number`
- **Default**: `undefined` (no limit)
- **Description**: Hard cap on output tokens

**Example**:
```yaml
output:
  max_tokens: 500
```

**Behavior**:
- Truncates output if exceeded
- Shows truncation notice
- Prioritizes important information
- Use to enforce strict token budgets

## Common Patterns

### Safe Refactoring

```yaml
config:
  transaction:
    mode: atomic
    isolation: strict
  execution:
    mode: parallel
    max_workers: 4
  validation:
    after:
      - typecheck
      - test
    on_fail: rollback
  recovery:
    checkpoint: true
    rollback_on_fail: true
output:
  mode: standard
```

### Fast Batch Updates

```yaml
config:
  transaction:
    mode: partial
  execution:
    mode: parallel
    max_workers: 8
    fail_fast: false
  validation:
    on_fail: warn
output:
  mode: minimal
```

### Critical Migration

```yaml
config:
  transaction:
    mode: atomic
    isolation: strict
    timeout_ms: 600000  # 10 minutes
  execution:
    mode: sequential
    retry:
      attempts: 5
      backoff: exponential
  preview:
    dry_run: true
    diff: true
    impact: true
  validation:
    before:
      - typecheck
      - test
    after:
      - typecheck
      - test
      - build
    on_fail: rollback
  recovery:
    checkpoint: true
    rollback_on_fail: true
    cleanup_on_success: false
output:
  mode: verbose
```

### Quick Exploration

```yaml
config:
  transaction:
    mode: none
  execution:
    mode: parallel
    max_workers: 12
  preview:
    dry_run: true
output:
  mode: count_only
```

## See Also

- [Mode Configuration Reference](./mode-config.md) - Mode-specific settings
- [.mcp.json Reference](./mcp-json.md) - MCP server configuration
- [SPEC-v2.md](../../../../SPEC-v2.md) - Complete specification
