# CheckpointManager Documentation

## Overview

The `CheckpointManager` provides a robust checkpoint and restore system for the Batch Engine. It creates snapshot backups of files and state, enabling safe rollback operations when needed.

## Architecture

### File Structure

```
.goodvibes/checkpoints/
├── index.json                    # Global checkpoint index
├── cp_20260121_120000/
│   ├── manifest.json             # Checkpoint metadata
│   ├── state.json                # State snapshot
│   └── files/                    # File backups
│       ├── src_components_Button.tsx
│       └── src_utils_helper.ts
└── cp_20260121_130000/
    ├── manifest.json
    ├── state.json
    └── files/
```

### Key Components

1. **CheckpointManager** - Main interface for checkpoint operations
2. **CheckpointFileManager** - Handles file system operations
3. **Checkpoint Manifest** - Metadata about each checkpoint
4. **State Snapshot** - Captured state at checkpoint time
5. **Index** - Fast lookup of all checkpoints

## API Reference

### Creating Checkpoints

#### `create(config: CheckpointConfig): Promise<Checkpoint>`

Creates a new checkpoint with file backups and state snapshot.

```typescript
const checkpoint = await checkpointManager.create({
  type: 'manual',
  reason: 'manual_request',
  batch_id: 'batch_001',
  include: {
    files: ['src/index.ts', 'src/utils/helper.ts'],
    state: ['session', 'locks'],
    memory: true,
  },
  expires_after_hours: 24,
});
```

**Parameters:**

- `type`: `'automatic' | 'manual'` - How the checkpoint was triggered
- `reason`: `'batch_start' | 'before_risky_operation' | 'manual_request' | 'scheduled'`
- `batch_id`: Optional batch identifier
- `include`: What to include in the checkpoint
  - `files`: Array of file paths to backup
  - `state`: Array of state keys to snapshot (default: all)
  - `memory`: Whether to include memory snapshot (default: true)
- `expires_after_hours`: Auto-cleanup time (default: 24)

**Returns:** A `Checkpoint` object with:
- `id`: Unique identifier (format: `cp_YYYYMMDD_HHMMSS`)
- `created_at`: ISO timestamp
- `expires_at`: ISO timestamp for expiration
- `files`: Array of backed up files with hashes
- `state_snapshot`: Captured state data
- `memory_snapshot`: Summary of memory state
- `size_bytes`: Total checkpoint size

### Restoring Checkpoints

#### `restore(checkpoint_id: string, options?: RestoreOptions): Promise<RestoreResult>`

Restores files and/or state from a checkpoint.

```typescript
// Full restore
const result = await checkpointManager.restore('cp_20260121_120000');

// Dry run (preview without applying)
const dryRun = await checkpointManager.restore('cp_20260121_120000', {
  dry_run: true,
});

// Restore only specific files
const selective = await checkpointManager.restore('cp_20260121_120000', {
  specific_files: ['src/index.ts'],
  files_only: true,
});

// Restore only state
const stateOnly = await checkpointManager.restore('cp_20260121_120000', {
  state_only: true,
  specific_state: ['session', 'locks'],
});
```

**Options:**

- `dry_run`: Preview without applying changes
- `files_only`: Restore files but not state
- `state_only`: Restore state but not files
- `specific_files`: Array of specific files to restore
- `specific_state`: Array of specific state keys to restore

**Returns:** A `RestoreResult` with:
- `success`: Whether restore succeeded
- `checkpoint_id`: ID that was restored
- `files_restored`: List of files restored
- `state_restored`: List of state keys restored
- `errors`: Any errors encountered
- `duration_ms`: Time taken

### Listing Checkpoints

#### `listAsync(filter?: CheckpointFilter): Promise<Checkpoint[]>`

Lists available checkpoints with optional filtering.

```typescript
// List all checkpoints
const all = await checkpointManager.listAsync();

// Filter by batch
const batchCheckpoints = await checkpointManager.listAsync({
  batch_id: 'batch_001',
});

// Filter by type
const manualCheckpoints = await checkpointManager.listAsync({
  type: 'manual',
});

// Filter by date range
const recent = await checkpointManager.listAsync({
  created_after: '2026-01-20T00:00:00Z',
  limit: 10,
});
```

**Filter Options:**

- `batch_id`: Filter by associated batch
- `type`: Filter by checkpoint type
- `reason`: Filter by creation reason
- `created_after`: Only checkpoints after this date
- `created_before`: Only checkpoints before this date
- `limit`: Maximum number to return

### Getting a Checkpoint

#### `getAsync(checkpoint_id: string): Promise<Checkpoint | undefined>`

Retrieves a specific checkpoint by ID.

```typescript
const checkpoint = await checkpointManager.getAsync('cp_20260121_120000');
if (checkpoint) {
  console.log('Files:', checkpoint.files.length);
  console.log('Size:', checkpoint.size_bytes);
}
```

### Deleting Checkpoints

#### `deleteAsync(checkpoint_id: string): Promise<boolean>`

Manually deletes a checkpoint and all its data.

```typescript
const deleted = await checkpointManager.deleteAsync('cp_20260121_120000');
console.log('Deleted:', deleted);
```

### Cleanup

#### `cleanupAsync(): Promise<CleanupResult>`

Removes expired checkpoints based on `expires_at` timestamps.

```typescript
const result = await checkpointManager.cleanupAsync();
console.log('Removed:', result.removed);
console.log('Freed bytes:', result.freed_bytes);
console.log('Remaining:', result.remaining);
```

**Note:** Cleanup also runs automatically on initialization if `auto_cleanup` is enabled.

### Lifecycle Methods

#### `initialize(): Promise<void>`

Initializes the checkpoint manager and creates necessary directories.

```typescript
await checkpointManager.initialize();
```

#### `shutdown(): Promise<void>`

Gracefully shuts down the checkpoint manager.

```typescript
await checkpointManager.shutdown();
```

## Configuration

The checkpoint manager can be configured during creation:

```typescript
const checkpointManager = createCheckpointManager(process.cwd(), {
  max_checkpoints: 10,        // Maximum checkpoints to keep
  default_expiry_hours: 24,   // Default expiration time
  auto_cleanup: true,         // Cleanup on initialization
  checkpoint_dir: '.goodvibes/checkpoints',
});
```

## Best Practices

### 1. Create Checkpoints Before Risky Operations

```typescript
// Before destructive operations
const checkpoint = await checkpointManager.create({
  type: 'automatic',
  reason: 'before_risky_operation',
  include: {
    files: affectedFiles,
  },
});

// Perform risky operation
try {
  await performRiskyOperation();
} catch (error) {
  // Restore checkpoint on failure
  await checkpointManager.restore(checkpoint.id);
  throw error;
}
```

### 2. Use Batch Checkpoints

```typescript
// At batch start
const checkpoint = await checkpointManager.create({
  batch_id: batchId,
  type: 'automatic',
  reason: 'batch_start',
  include: {
    files: batchContext.affected_files,
    memory: true,
  },
});
```

### 3. Verify Before Restoring

```typescript
// Dry run to preview
const preview = await checkpointManager.restore(checkpointId, {
  dry_run: true,
});

if (preview.success) {
  console.log('Will restore:', preview.files_restored);

  // Actual restore
  await checkpointManager.restore(checkpointId);
}
```

### 4. Selective Restoration

```typescript
// Only restore critical files
await checkpointManager.restore(checkpointId, {
  specific_files: ['src/database/schema.ts'],
  files_only: true,
});
```

### 5. Regular Cleanup

```typescript
// Cleanup old checkpoints periodically
setInterval(async () => {
  await checkpointManager.cleanupAsync();
}, 24 * 60 * 60 * 1000); // Daily
```

## Integration with Batch Engine

The CheckpointManager integrates seamlessly with the Batch Engine runtime:

```typescript
import { createRuntimeContext, initializeRuntime } from './runtime/index.js';

// Create runtime context (includes checkpoint manager)
const context = createRuntimeContext(process.cwd());

// Initialize all managers
await initializeRuntime(context);

// Use checkpoint manager
const checkpoint = await context.checkpoint.create({
  type: 'manual',
  reason: 'manual_request',
  include: { files: ['src/index.ts'] },
});
```

## Error Handling

The CheckpointManager handles errors gracefully:

```typescript
try {
  const result = await checkpointManager.restore(checkpointId);

  if (!result.success) {
    console.error('Restore failed:', result.errors);

    // Handle partial success
    console.log('Files restored:', result.files_restored);
    console.log('State restored:', result.state_restored);
  }
} catch (error) {
  console.error('Critical restore error:', error);
}
```

## Integrity Verification

Checkpoints include hash-based integrity verification:

```typescript
// Access internal file manager for advanced operations
const fileManager = (checkpointManager as any).fileManager;

const integrity = await fileManager.verifyIntegrity(checkpointId);
if (!integrity.valid) {
  console.error('Checkpoint corrupted:', integrity.errors);
}
```

## Performance Considerations

1. **File Size**: Large files increase checkpoint creation time and storage
2. **Max Checkpoints**: Limit helps prevent disk space issues
3. **Expiration**: Set appropriate expiry times based on project needs
4. **Selective Backups**: Only include files that need restoration

## Troubleshooting

### Checkpoint Not Found

```typescript
const checkpoint = await checkpointManager.getAsync(checkpointId);
if (!checkpoint) {
  console.error('Checkpoint not found or expired');
}
```

### Restore Failures

```typescript
const result = await checkpointManager.restore(checkpointId);
if (result.errors) {
  for (const error of result.errors) {
    console.error('Restore error:', error);
  }
}
```

### Disk Space Issues

```typescript
// Check total checkpoint size
const index = await fileManager.readIndex();
console.log('Total size:', index.total_size_bytes);

// Cleanup to free space
await checkpointManager.cleanupAsync();
```

## Examples

See `examples/checkpoint-example.ts` for comprehensive usage examples including:

- Creating different types of checkpoints
- Listing and filtering checkpoints
- Dry run restores
- Selective file and state restoration
- Integrity verification
- Cleanup operations

## See Also

- [State Manager Documentation](./STATE_MANAGER.md)
- [Memory Manager Documentation](./MEMORY_MANAGER.md)
- [Batch Engine Specification](./SPEC-v2.md) - Section 11.1
