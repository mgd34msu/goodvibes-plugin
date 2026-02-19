# Mode Configuration Reference

Complete reference for output style modes: vibecoding and justvibes.

## Overview

GoodVibes supports two execution modes that fundamentally change agent behavior, communication patterns, and output verbosity. Modes are configured via output style markdown files in the `output-styles/` directory.

## Mode Files

### Location
`.claude-plugin/output-styles/`

### File Format
Markdown files with frontmatter and mode configuration.

### Available Modes
- `vibecoding.md` - Communicative autonomous mode
- `justvibes.md` - Silent autonomous mode

## vibecoding Mode

**Philosophy**: Autonomous coding with user communication and guidance.

**Location**: `output-styles/vibecoding.md`

### Frontmatter

```yaml
---
name: vibecoding
description: Autonomous coding with communication
---
```

### Full Configuration

```yaml
communication:
  show_progress: true
  explain_decisions: true
  ask_on_ambiguity: true
  report_results: detailed

execution:
  auto_chain: false
  max_autonomous_batches: 1
  checkpoint_frequency: per_batch
  parallel_agents: 6

recovery:
  on_error: ask
  on_ambiguity: ask
  on_risk: ask
  max_fix_attempts: 3

output:
  default_mode: standard
  show_diffs: true
  show_telemetry: summary

logging:
  log_decisions: true
  log_errors: true
  log_activity: false
  log_path: .goodvibes/logs/
```

### Configuration Fields

#### Communication Settings

##### `communication.show_progress`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Show progress updates during execution

**When `true`**:
```
Reading 5 files...
✓ Read complete (450 lines)
Applying edits...
✓ 3 files modified
Running validation...
✓ Typecheck passed
```

**When `false`**:
```
[no output until complete]
```

##### `communication.explain_decisions`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Explain reasoning and decisions

**When `true`**:
```
I'll use the precision_edit tool to rename the function across all files.
This is safer than manual edits because it's atomic and can be rolled back.
```

**When `false`**:
```
[proceeds without explanation]
```

##### `communication.ask_on_ambiguity`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Ask user for clarification when requirements unclear

**When `true`**:
```
I found two possible approaches:
1. Update the API endpoint
2. Add a new endpoint

Which approach would you prefer?
```

**When `false`**:
```
[makes best guess and proceeds]
```

##### `communication.report_results`
- **Type**: `'detailed' | 'summary' | 'minimal' | 'none'`
- **Default**: `'detailed'`
- **Description**: How to report results after completion

**`'detailed'`**:
```
Refactoring complete!

Changes made:
- Renamed getData to fetchData (5 files)
- Updated 12 function calls
- Added error handling (3 locations)

Files modified:
- src/api.ts (45 lines)
- src/db.ts (32 lines)
- src/types.ts (18 lines)
- src/components/DataList.tsx (8 lines)
- src/hooks/useData.ts (15 lines)

Validation:
✓ TypeScript: 0 errors
✓ ESLint: 0 warnings
✓ Tests: All passing (12/12)

Ready for review. Run `git diff` to see changes.
```

**`'summary'`**:
```
✓ Renamed getData to fetchData (5 files, 12 calls)
✓ Validation passed
```

**`'minimal'`**:
```
✓ Complete (5 files)
```

**`'none'`**:
```
[no output]
```

#### Execution Settings

##### `execution.auto_chain`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Automatically chain to next logical batch

**When `false`**:
```
✓ API endpoint created.

What would you like to work on next?
```

**When `true`**:
```
✓ API endpoint created.
→ Spawning reviewer agent...
→ Spawning tester agent...
[continues automatically]
```

##### `execution.max_autonomous_batches`
- **Type**: `number`
- **Default**: `1`
- **Description**: Maximum batches to execute before asking user

**Value: `1`**:
```
✓ Batch 1 complete.
Continue with Batch 2?
```

**Value: `unlimited`**:
```
✓ Batch 1 complete.
→ Starting Batch 2...
→ Starting Batch 3...
[continues until done]
```

##### `execution.checkpoint_frequency`
- **Type**: `'per_batch' | 'per_phase' | 'per_operation' | 'manual'`
- **Default**: `'per_batch'`
- **Description**: How often to create recovery checkpoints

**`'per_batch'`**: Checkpoint after each complete batch
**`'per_phase'`**: Checkpoint after each phase (read, write, exec, etc.)
**`'per_operation'`**: Checkpoint after each individual operation
**`'manual'`**: Only checkpoint when explicitly requested

##### `execution.parallel_agents`
- **Type**: `number`
- **Default**: `6`
- **Description**: Maximum concurrent subagents

**Recommendations**:
- Standard: 4-6
- High complexity: 6-8
- Low resources: 2-4

#### Recovery Settings

##### `recovery.on_error`
- **Type**: `'ask' | 'fix_and_continue' | 'rollback' | 'ignore'`
- **Default**: `'ask'`
- **Description**: What to do when error occurs

**`'ask'`**:
```
Error: TypeScript compilation failed
  src/api.ts:45 - Type 'string' is not assignable to type 'number'

How would you like to proceed?
1. Attempt automatic fix
2. Rollback changes
3. Show me the error location
```

**`'fix_and_continue'`**:
```
Error: TypeScript compilation failed
→ Analyzing error...
→ Applying fix...
✓ Fixed, continuing...
```

**`'rollback'`**:
```
Error occurred. Rolling back all changes...
✓ Rolled back to checkpoint
```

**`'ignore'`**:
```
Error occurred. Continuing...
```

##### `recovery.on_ambiguity`
- **Type**: `'ask' | 'best_guess' | 'error'`
- **Default**: `'ask'`
- **Description**: What to do when requirements ambiguous

**`'ask'`**: Stop and ask user for clarification
**`'best_guess'`**: Make best guess and proceed
**`'error'`**: Treat as error

##### `recovery.on_risk`
- **Type**: `'ask' | 'proceed_with_checkpoint' | 'abort'`
- **Default**: `'ask'`
- **Description**: What to do when risky operation detected

**`'ask'`**:
```
⚠ This operation will delete 12 files.
Proceed? (y/n)
```

**`'proceed_with_checkpoint'`**:
```
⚠ Creating checkpoint before risky operation...
✓ Checkpoint created
→ Proceeding...
```

**`'abort'`**:
```
⚠ Risky operation detected. Aborting.
```

##### `recovery.max_fix_attempts`
- **Type**: `number`
- **Default**: `3`
- **Description**: Maximum automatic fix attempts before asking

#### Output Settings

##### `output.default_mode`
- **Type**: `'count_only' | 'minimal' | 'standard' | 'verbose'`
- **Default**: `'standard'`
- **Description**: Default output verbosity for precision tools

See [Batch Configuration Reference](./batch-config.md#output-configuration) for details.

##### `output.show_diffs`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Show file diffs in output

**When `true`**:
```
src/api.ts:
  @@ -12,7 +12,7 @@
  -export function getData() {
  +export function fetchData() {
```

**When `false`**:
```
src/api.ts: modified (1 function renamed)
```

##### `output.show_telemetry`
- **Type**: `'none' | 'summary' | 'detailed'`
- **Default**: `'summary'`
- **Description**: Show performance and usage metrics

**`'summary'`**:
```
Duration: 3.2s | Tokens: 450 | Operations: 5
```

**`'detailed'`**:
```
Telemetry:
  Duration: 3.2s
  Tokens: 450 (300 input, 150 output)
  Operations: 5 (5 succeeded, 0 failed)
  Phases: 3 (read: 0.8s, write: 1.2s, validate: 1.2s)
```

**`'none'`**:
```
[no telemetry shown]
```

#### Logging Settings

##### `logging.log_decisions`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Log decisions to file

**File**: `.goodvibes/logs/decisions.md`

**Format**:
```markdown
## 2024-01-15 14:30:22 - Session abc123

### Decision: Use React Query for data fetching
**Context**: Need to fetch user data from API
**Options**:
1. React Query (recommended)
2. SWR
3. Custom hooks

**Chosen**: React Query
**Reasoning**:
- Better caching
- More features
- Better TypeScript support
```

##### `logging.log_errors`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Log errors to file

**File**: `.goodvibes/logs/errors.md`

**Format**:
```markdown
## 2024-01-15 14:32:45 - Refactor API

### Error: TypeScript Compilation Failed
**File**: src/api.ts
**Line**: 45
**Message**: Type 'string' is not assignable to type 'number'

**Stack**:
```
at refactorFunction (precision-engine:123)
at executeEdit (precision-engine:456)
```

**Resolution**: Fixed type annotation
```

##### `logging.log_activity`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Log all activity to file

**File**: `.goodvibes/logs/activity.md`

**Format**:
```markdown
## 2024-01-15 14:30:00 - Session abc123

14:30:05 - Batch started: refactor-api
14:30:06 - Phase: read (3 files)
14:30:08 - Phase: edit (5 changes)
14:30:10 - Phase: validate (typecheck)
14:30:12 - Batch complete (success)
```

##### `logging.log_path`
- **Type**: `string`
- **Default**: `'.goodvibes/logs/'`
- **Description**: Directory for log files

### Behavior Summary

| Aspect | vibecoding |
|--------|------------|
| **Communication** | Verbose, explanatory |
| **User Interaction** | Frequent, asks questions |
| **Autonomy** | Moderate (1 batch at a time) |
| **Error Handling** | Ask user |
| **Output** | Standard verbosity |
| **Diffs** | Shown |
| **Telemetry** | Summary shown |

## justvibes Mode

**Philosophy**: Fully autonomous silent execution with maximum efficiency.

**Location**: `output-styles/justvibes.md`

### Frontmatter

```yaml
---
name: justvibes
description: Fully autonomous silent execution
---
```

### Full Configuration

```yaml
communication:
  show_progress: false
  explain_decisions: false
  ask_on_ambiguity: false
  report_results: minimal

execution:
  auto_chain: true
  max_autonomous_batches: unlimited
  checkpoint_frequency: per_phase
  parallel_agents: 6

recovery:
  on_error: fix_and_continue
  on_ambiguity: best_guess
  on_risk: proceed_with_checkpoint
  max_fix_attempts: 3

output:
  default_mode: minimal
  show_diffs: false
  show_telemetry: none

logging:
  log_decisions: true
  log_errors: true
  log_activity: true
  log_path: .goodvibes/logs/
```

### Configuration Differences from vibecoding

All settings are the same as vibecoding except:

| Setting | vibecoding | justvibes |
|---------|------------|-----------|
| `communication.show_progress` | `true` | `false` |
| `communication.explain_decisions` | `true` | `false` |
| `communication.ask_on_ambiguity` | `true` | `false` |
| `communication.report_results` | `'detailed'` | `'minimal'` |
| `execution.auto_chain` | `false` | `true` |
| `execution.max_autonomous_batches` | `1` | `unlimited` |
| `execution.checkpoint_frequency` | `'per_batch'` | `'per_phase'` |
| `recovery.on_error` | `'ask'` | `'fix_and_continue'` |
| `recovery.on_ambiguity` | `'ask'` | `'best_guess'` |
| `recovery.on_risk` | `'ask'` | `'proceed_with_checkpoint'` |
| `output.default_mode` | `'standard'` | `'minimal'` |
| `output.show_diffs` | `true` | `false` |
| `output.show_telemetry` | `'summary'` | `'none'` |
| `logging.log_activity` | `false` | `true` |

### Behavior Summary

| Aspect | justvibes |
|--------|-----------|
| **Communication** | Silent |
| **User Interaction** | None (make best guess) |
| **Autonomy** | Maximum (unlimited batches) |
| **Error Handling** | Auto-fix and continue |
| **Output** | Minimal verbosity |
| **Diffs** | Hidden |
| **Telemetry** | Hidden |
| **Activity Logging** | Full log to file |

### Expected Output

**Typical justvibes session**:
```
[long pause]

Done.

Changes: 5 files modified, 2 created
Commits: 3 checkpoints
Tests: All passing

git diff HEAD~3 to review
```

## Mode Selection

### Activating a Mode

Modes are activated by selecting the output style in Claude Code:

1. Open Claude Code settings
2. Navigate to Output Style
3. Select `goodvibes:vibecoding` or `goodvibes:justvibes`

### When to Use vibecoding

**Use vibecoding when you want:**
- Explanations of what's happening
- To review changes before proceeding
- To provide input at decision points
- To learn how the system works
- To debug or troubleshoot
- More control over the process

**Examples**:
- Learning a new codebase
- Making critical changes
- Debugging complex issues
- Exploring different approaches
- Teaching or demonstrating

### When to Use justvibes

**Use justvibes when you want:**
- Maximum speed
- Hands-off operation
- To work on other tasks while agent works
- Minimal token usage
- To complete well-defined tasks
- Batch processing

**Examples**:
- Routine refactoring
- Bulk updates
- Test generation
- Documentation updates
- Repetitive tasks
- Overnight processing

## Creating Custom Modes

You can create custom modes by adding new markdown files to `output-styles/`:

### Example: `careful.md`

```yaml
---
name: careful
description: Extra cautious with validation
---

# Careful Mode

Extra validation and safety checks.

## Mode Configuration

```yaml
communication:
  show_progress: true
  explain_decisions: true
  ask_on_ambiguity: true
  report_results: detailed

execution:
  auto_chain: false
  max_autonomous_batches: 1
  checkpoint_frequency: per_operation  # More frequent checkpoints
  parallel_agents: 4  # Less parallelism

recovery:
  on_error: ask
  on_ambiguity: ask
  on_risk: ask
  max_fix_attempts: 1  # Ask sooner

output:
  default_mode: verbose  # More detailed output
  show_diffs: true
  show_telemetry: detailed

logging:
  log_decisions: true
  log_errors: true
  log_activity: true
  log_path: .goodvibes/logs/
```
```

### Example: `speed.md`

```yaml
---
name: speed
description: Maximum speed, minimal safety
---

# Speed Mode

Optimized for maximum throughput.

## Mode Configuration

```yaml
communication:
  show_progress: false
  explain_decisions: false
  ask_on_ambiguity: false
  report_results: none

execution:
  auto_chain: true
  max_autonomous_batches: unlimited
  checkpoint_frequency: manual  # No automatic checkpoints
  parallel_agents: 12  # High parallelism

recovery:
  on_error: ignore  # Keep going
  on_ambiguity: best_guess
  on_risk: proceed_with_checkpoint
  max_fix_attempts: 0  # No retries

output:
  default_mode: count_only  # Absolute minimum
  show_diffs: false
  show_telemetry: none

logging:
  log_decisions: false  # No logs
  log_errors: true
  log_activity: false
  log_path: .goodvibes/logs/
```
```

## Best Practices

### Mode Selection
- Start with vibecoding when learning
- Graduate to justvibes for routine tasks
- Use vibecoding for critical changes
- Use justvibes for bulk operations

### Configuration
- Adjust parallelism based on machine resources
- Use appropriate checkpoint frequency for task criticality
- Log activity in justvibes mode for debugging
- Show telemetry in development, hide in production

### Safety
- Always use validation in important modes
- Checkpoint before risky operations
- Log errors regardless of mode
- Test custom modes thoroughly

## Troubleshooting

### Mode Not Working

1. Check file exists in `output-styles/`
2. Verify frontmatter is valid YAML
3. Check configuration syntax
4. Restart Claude Code

### Wrong Behavior

1. Check active mode in settings
2. Verify configuration values
3. Check for conflicts with batch config
4. Review logs in `.goodvibes/logs/`

### Performance Issues

1. Reduce `parallel_agents`
2. Increase `checkpoint_frequency` interval
3. Use lower `output.default_mode`
4. Disable activity logging

## See Also

- [Batch Configuration Reference](./batch-config.md) - Batch-level configuration
- [plugin.json Reference](./plugin-json.md) - Plugin configuration
- [SPEC-v2.md](../../../../SPEC-v2.md) - Complete specification
