# Batch Engine Integration Tests

Comprehensive integration test suite for the batch-engine MCP server per SPEC-v2 requirements.

## Test Structure

```
__tests__/
├── batch-lifecycle.test.ts    # Complete pipeline tests
├── operation-phases.test.ts   # READ/WRITE/EXEC/QUERY/STATE operations
├── recovery.test.ts           # Checkpoint, rollback, fix loops
├── state.test.ts              # Session state, agent tracking, locks
├── memory.test.ts             # Decision/pattern/failure recording
├── mode.test.ts               # Vibecoding vs justvibes behaviors
├── setup.ts                   # Test utilities and helpers
└── __fixtures__/              # Test data
    ├── sample-batch.json
    └── sample-memory.json
```

## Test Coverage

### 1. Batch Lifecycle (`batch-lifecycle.test.ts`)

Tests the complete batch execution pipeline:

- **Phase Execution**: INTENT → PLAN → PREPARE → VALIDATE → EXECUTE → VERIFY → COMMIT → CHAIN
- **Hook Firing**: Verifies hooks fire at correct points
- **Error Handling**: Tests rollback on validation failure
- **Operation Hooks**: Before/after operation execution
- **Checkpoint Integration**: Automatic checkpoint creation

**Key Tests:**
- Complete pipeline execution with all phases
- Pipeline interruption on validation failure
- Hook execution order verification
- Operation-level hook firing
- Checkpoint creation based on config

### 2. Operation Phases (`operation-phases.test.ts`)

Tests all operation types across categories:

**READ Operations:**
- `files`: Content extraction with line numbers
- `search`: Regex/semantic/fuzzy pattern matching
- `glob`: File finding with filters
- `symbols`: Symbol search with kind filters
- `url`: Web content fetching and extraction
- `analyze`: Dependency/dead code/tech debt analysis

**WRITE Operations:**
- `create`: File creation with templates
- `edit`: Multi-edit with occurrence control
- `delete`: Safe deletion with blocklist
- `move`: File moving with import updates
- `copy`: File copying with transformations
- `atomic`: Transactional multi-operation

**EXEC Operations:**
- `command`: Shell command execution with expectations
- `agent`: Background agent spawning with budgets
- `script`: Multi-language script execution

**QUERY Operations:**
- `validate`: Typecheck/lint/test validation
- `diagnose`: Error analysis and suggestions

**STATE Operations:**
- `get`: State retrieval by keys
- `set`: State storage with merge options
- `delete`: State key removal
- `list`: State key enumeration
- `track`: Decision/pattern/failure recording
- `query`: Memory search with filters

### 3. Recovery Flow (`recovery.test.ts`)

Tests checkpoint and rollback functionality:

**Checkpoint Creation:**
- Automatic checkpoints before batches
- Manual checkpoint creation
- Checkpoint before risky operations
- Content hash verification

**Rollback:**
- Full rollback on failure
- Partial rollback (files-only, state-only)
- Selective file/state restoration
- Dry-run restore preview

**Fix Loop:**
- Retry with max attempts
- Checkpoint before each attempt
- Rollback on failed attempt
- Loop termination after max attempts

**Checkpoint Management:**
- List with filters (batch_id, type, reason)
- Automatic cleanup of expired checkpoints
- Manual checkpoint deletion
- Size calculation

### 4. State Management (`state.test.ts`)

Tests state persistence and tracking:

**Session State:**
- Key-value storage and retrieval
- Nested key support
- State merging vs replacement
- State persistence across sessions
- Prefix-based listing
- Key deletion

**Agent Tracking:**
- Agent spawn tracking
- Status updates (spawned → running → completed)
- Result recording
- Batch-level agent listing
- Active agent counting

**Lock Management:**
- Lock acquisition and release
- Concurrent access prevention
- Lock timeout and auto-release
- Owner-based lock listing
- Bulk lock release

**Checkpoint State:**
- Checkpoint metadata storage
- Active checkpoint tracking
- Checkpoint reference cleanup

**Batch Tracking:**
- Progress tracking
- Configuration storage
- Start/end time recording

### 5. Memory System (`memory.test.ts`)

Tests decision, pattern, and failure recording:

**Decision Recording:**
- Record with category and confidence
- Retrieve by ID
- Supersede old decisions
- Revert decisions
- Search by category, status, file
- Date range filtering

**Pattern Tracking:**
- Record code patterns with examples
- Usage count increment
- Keyword search
- Most-used pattern ranking

**Failure Recording:**
- Record with stack trace
- Mark as resolved with details
- Search by resolution status
- Search by error type

**Search:**
- Cross-category search
- Date range filtering
- Result limiting
- File reference search

**Export/Import:**
- Export all memory to JSON
- Import memory from JSON

### 6. Mode Behavior (`mode.test.ts`)

Tests vibecoding vs justvibes differences:

**Vibecoding Mode:**
- Detailed progress messages
- Strategy explanations
- Clarification prompts on ambiguity
- Detailed coverage metrics
- Validation result display
- Interactive feedback

**Justvibes Mode:**
- Silent execution (no output)
- Auto-fix without prompting
- Automatic retry (up to 3 attempts)
- Best-guess on ambiguity
- Decision logging to file
- Minimal token output

**Mode Switching:**
- Mid-batch mode changes
- Preference persistence

**Error Handling:**
- Vibecoding: Detailed error display
- Justvibes: Silent logging

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test batch-lifecycle

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

## Coverage Targets

- **Statements**: 80%
- **Branches**: 75%
- **Functions**: 80%
- **Lines**: 80%

## Mock Infrastructure

All tests use mock implementations to ensure:

1. **Isolation**: Each test is independent
2. **Speed**: No real I/O or network operations
3. **Reliability**: Deterministic behavior
4. **Cleanup**: Automatic cleanup after each test

## Test Utilities

Located in `setup.ts`:

- `createTestBatchId()`: Generate unique batch IDs
- `createTestCheckpointId()`: Generate checkpoint IDs
- `wait(ms)`: Async delay helper
- `MockFileSystem`: In-memory file system

## Writing New Tests

1. Import from setup: `import { createTestBatchId } from './setup'`
2. Use `beforeEach` to create fresh mocks
3. Use `afterEach` to cleanup
4. Follow AAA pattern: Arrange, Act, Assert
5. Use descriptive test names: `it('does something specific', ...)`

## SPEC-v2 Compliance

All tests verify compliance with SPEC-v2:

- Section 3: Batch Definition
- Section 4: Operations (READ/WRITE/EXEC/QUERY/STATE)
- Section 5: Lifecycle Hooks
- Section 7: State Management
- Section 8: Memory Structure
- Section 10: Mode Behaviors
- Section 11: Recovery & Checkpoints

## CI/CD Integration

These tests are designed to run in CI:

- Fast execution (< 30s total)
- No external dependencies
- Deterministic results
- Clear failure messages
