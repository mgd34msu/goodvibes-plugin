/**
 * Example usage of CheckpointManager
 * This demonstrates how to create, restore, and manage checkpoints
 */

import {
  createCheckpointManager,
  type CheckpointConfig,
  type RestoreOptions,
} from '../src/runtime/index.js';

async function main() {
  // Create a checkpoint manager for the current project
  const checkpointManager = createCheckpointManager(process.cwd());

  // Initialize the checkpoint manager
  await checkpointManager.initialize();

  console.log('Checkpoint Manager initialized');

  // Example 1: Create a manual checkpoint
  const manualConfig: CheckpointConfig = {
    type: 'manual',
    reason: 'manual_request',
    include: {
      files: [
        'src/index.ts',
        'src/utils/helper.ts',
        'package.json',
      ],
      memory: true,
    },
    expires_after_hours: 48, // Expire after 2 days
  };

  console.log('\n--- Creating Manual Checkpoint ---');
  const manualCheckpoint = await checkpointManager.create(manualConfig);
  console.log('Created checkpoint:', manualCheckpoint.id);
  console.log('Files backed up:', manualCheckpoint.files.length);
  console.log('Size:', (manualCheckpoint.size_bytes / 1024).toFixed(2), 'KB');

  // Example 2: Create an automatic checkpoint before a batch
  const batchConfig: CheckpointConfig = {
    batch_id: 'batch_001',
    type: 'automatic',
    reason: 'batch_start',
    include: {
      files: [
        'src/components/Button.tsx',
        'src/components/Input.tsx',
      ],
      memory: false,
    },
  };

  console.log('\n--- Creating Batch Checkpoint ---');
  const batchCheckpoint = await checkpointManager.create(batchConfig);
  console.log('Created checkpoint:', batchCheckpoint.id);
  console.log('Associated batch:', batchCheckpoint.batch_id);

  // Example 3: Create a checkpoint before risky operation
  const riskyConfig: CheckpointConfig = {
    type: 'automatic',
    reason: 'before_risky_operation',
    include: {
      files: ['src/database/schema.ts'],
    },
  };

  console.log('\n--- Creating Pre-Risky-Operation Checkpoint ---');
  const riskyCheckpoint = await checkpointManager.create(riskyConfig);
  console.log('Created checkpoint:', riskyCheckpoint.id);

  // Example 4: List all checkpoints
  console.log('\n--- Listing All Checkpoints ---');
  const allCheckpoints = await checkpointManager.listAsync();
  console.log(`Total checkpoints: ${allCheckpoints.length}`);
  for (const cp of allCheckpoints) {
    console.log(`- ${cp.id} (${cp.type}, ${cp.reason})`);
  }

  // Example 5: List checkpoints with filter
  console.log('\n--- Filtering Checkpoints by Type ---');
  const manualCheckpoints = await checkpointManager.listAsync({
    type: 'manual',
  });
  console.log(`Manual checkpoints: ${manualCheckpoints.length}`);

  // Example 6: Get a specific checkpoint
  console.log('\n--- Getting Specific Checkpoint ---');
  const retrieved = await checkpointManager.getAsync(manualCheckpoint.id);
  if (retrieved) {
    console.log('Retrieved checkpoint:', retrieved.id);
    console.log('Created at:', retrieved.created_at);
    console.log('Expires at:', retrieved.expires_at);
  }

  // Example 7: Restore checkpoint (dry run)
  console.log('\n--- Dry Run Restore ---');
  const dryRunOptions: RestoreOptions = {
    dry_run: true,
  };
  const dryRunResult = await checkpointManager.restore(
    manualCheckpoint.id,
    dryRunOptions
  );
  console.log('Dry run result:', dryRunResult.success);
  console.log('Would restore files:', dryRunResult.files_restored);
  console.log('Would restore state:', dryRunResult.state_restored);

  // Example 8: Selective file restore
  console.log('\n--- Selective File Restore (Dry Run) ---');
  const selectiveOptions: RestoreOptions = {
    dry_run: true,
    specific_files: ['src/index.ts'],
    files_only: true,
  };
  const selectiveResult = await checkpointManager.restore(
    manualCheckpoint.id,
    selectiveOptions
  );
  console.log('Would restore:', selectiveResult.files_restored);

  // Example 9: State-only restore
  console.log('\n--- State-Only Restore (Dry Run) ---');
  const stateOnlyOptions: RestoreOptions = {
    dry_run: true,
    state_only: true,
  };
  const stateOnlyResult = await checkpointManager.restore(
    manualCheckpoint.id,
    stateOnlyOptions
  );
  console.log('Would restore state:', stateOnlyResult.state_restored);

  // Example 10: Cleanup expired checkpoints
  console.log('\n--- Cleanup Expired Checkpoints ---');
  const cleanupResult = await checkpointManager.cleanupAsync();
  console.log('Removed:', cleanupResult.removed);
  console.log('Freed bytes:', cleanupResult.freed_bytes);
  console.log('Remaining:', cleanupResult.remaining);

  // Example 11: Delete a specific checkpoint
  console.log('\n--- Deleting Checkpoint ---');
  const deleted = await checkpointManager.deleteAsync(riskyCheckpoint.id);
  console.log('Deleted checkpoint:', deleted);

  // Example 12: Verify checkpoint integrity
  console.log('\n--- Verifying Checkpoint Integrity ---');
  const fileManager = (checkpointManager as any).fileManager;
  const integrity = await fileManager.verifyIntegrity(manualCheckpoint.id);
  console.log('Integrity check:', integrity.valid);
  if (integrity.errors.length > 0) {
    console.log('Errors:', integrity.errors);
  }

  // Shutdown the checkpoint manager
  await checkpointManager.shutdown();
  console.log('\n--- Checkpoint Manager Shutdown ---');
}

// Run the example
main().catch(console.error);
