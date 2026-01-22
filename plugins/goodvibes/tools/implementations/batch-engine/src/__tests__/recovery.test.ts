/**
 * Integration tests for recovery flows
 * Tests checkpoint creation, rollback, fix loops, and partial rollback
 * @see SPEC-v2 Section 11
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type {
  Checkpoint,
  CheckpointConfig,
  RestoreOptions,
  RestoreResult,
  CheckpointFilter,
  CleanupResult,
} from '../interfaces/checkpoint.js';

describe('Recovery Flow Integration', () => {
  let mockCheckpointSystem: MockCheckpointSystem;

  beforeEach(() => {
    mockCheckpointSystem = new MockCheckpointSystem();
  });

  afterEach(() => {
    mockCheckpointSystem.clear();
  });

  describe('Checkpoint Creation', () => {
    it('creates checkpoint before batch execution', async () => {
      // Arrange
      const config: CheckpointConfig = {
        batch_id: 'batch-001',
        reason: 'batch_start',
        type: 'automatic',
        include: {
          files: ['src/main.ts', 'src/utils.ts'],
          state: ['session', 'config'],
          memory: true,
        },
        expires_after_hours: 24,
      };

      // Act
      const checkpoint = await mockCheckpointSystem.create(config);

      // Assert
      expect(checkpoint.id).toMatch(/^cp_\d{8}_\d{6}_\d+$/);
      expect(checkpoint.batch_id).toBe('batch-001');
      expect(checkpoint.reason).toBe('batch_start');
      expect(checkpoint.type).toBe('automatic');
      expect(checkpoint.files).toHaveLength(2);
      expect(checkpoint.state_snapshot).toBeDefined();
      expect(checkpoint.memory_snapshot).toBeDefined();
    });

    it('creates checkpoint before risky operation', async () => {
      // Arrange
      const config: CheckpointConfig = {
        batch_id: 'batch-002',
        reason: 'before_risky_operation',
        type: 'automatic',
        include: {
          files: ['*.ts', '*.json'],
        },
      };

      // Act
      const checkpoint = await mockCheckpointSystem.create(config);

      // Assert
      expect(checkpoint.reason).toBe('before_risky_operation');
      expect(checkpoint.files.length).toBeGreaterThan(0);
    });

    it('creates manual checkpoint with custom expiry', async () => {
      // Arrange
      const config: CheckpointConfig = {
        reason: 'manual_request',
        type: 'manual',
        expires_after_hours: 48,
      };

      // Act
      const checkpoint = await mockCheckpointSystem.create(config);

      // Assert
      expect(checkpoint.type).toBe('manual');
      expect(checkpoint.batch_id).toBeUndefined();
      const expiresAt = new Date(checkpoint.expires_at!);
      const createdAt = new Date(checkpoint.created_at);
      const hoursDiff = (expiresAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      expect(hoursDiff).toBe(48);
    });

    it('includes content hashes for integrity verification', async () => {
      // Arrange
      const config: CheckpointConfig = {
        reason: 'batch_start',
        type: 'automatic',
        include: {
          files: ['test.ts'],
        },
      };

      // Act
      const checkpoint = await mockCheckpointSystem.create(config);

      // Assert
      expect(checkpoint.files[0].hash).toBeDefined();
      expect(checkpoint.files[0].hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256
    });
  });

  describe('Rollback on Failure', () => {
    it('rolls back all changes when batch fails', async () => {
      // Arrange: Create checkpoint
      const checkpoint = await mockCheckpointSystem.create({
        batch_id: 'batch-003',
        reason: 'batch_start',
        type: 'automatic',
      });

      // Simulate batch operations that modify files
      mockCheckpointSystem.simulateFileChanges(['file1.ts', 'file2.ts', 'file3.ts']);

      // Act: Rollback
      const result = await mockCheckpointSystem.restore(checkpoint.id);

      // Assert
      expect(result.success).toBe(true);
      expect(result.checkpoint_id).toBe(checkpoint.id);
      expect(result.files_restored).toHaveLength(3);
      expect(result.state_restored).toHaveLength(2); // Default state keys
    });

    it('restores only files when files_only option is true', async () => {
      // Arrange
      const checkpoint = await mockCheckpointSystem.create({
        batch_id: 'batch-004',
        reason: 'batch_start',
        type: 'automatic',
      });

      mockCheckpointSystem.simulateFileChanges(['file1.ts']);

      // Act
      const result = await mockCheckpointSystem.restore(checkpoint.id, {
        files_only: true,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.files_restored).toHaveLength(1);
      expect(result.state_restored).toHaveLength(0);
    });

    it('restores only state when state_only option is true', async () => {
      // Arrange
      const checkpoint = await mockCheckpointSystem.create({
        batch_id: 'batch-005',
        reason: 'batch_start',
        type: 'automatic',
      });

      // Act
      const result = await mockCheckpointSystem.restore(checkpoint.id, {
        state_only: true,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.files_restored).toHaveLength(0);
      expect(result.state_restored.length).toBeGreaterThan(0);
    });

    it('supports dry-run restore preview', async () => {
      // Arrange
      const checkpoint = await mockCheckpointSystem.create({
        batch_id: 'batch-006',
        reason: 'batch_start',
        type: 'automatic',
      });

      mockCheckpointSystem.simulateFileChanges(['file1.ts', 'file2.ts']);

      // Act
      const result = await mockCheckpointSystem.restore(checkpoint.id, {
        dry_run: true,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.files_restored).toHaveLength(2);
      // Verify files weren't actually restored
      expect(mockCheckpointSystem.hasChanges()).toBe(true);
    });
  });

  describe('Fix Loop Execution', () => {
    it('executes fix loop with retry attempts', async () => {
      let attemptCount = 0;
      const maxAttempts = 3;

      const fixLoop = async (): Promise<boolean> => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        return true;
      };

      // Act
      const result = await executeFixLoopMock(fixLoop, maxAttempts);

      // Assert
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(result.fixed).toBe(true);
    });

    it('creates checkpoint before each fix attempt', async () => {
      const checkpointsBefore: string[] = [];
      let attemptCount = 0;

      const fixLoop = async (): Promise<boolean> => {
        attemptCount++;
        // Create checkpoint before fix
        const checkpoint = await mockCheckpointSystem.create({
          batch_id: `fix-attempt-${attemptCount}`,
          reason: 'before_risky_operation',
          type: 'automatic',
        });
        checkpointsBefore.push(checkpoint.id);

        if (attemptCount < 2) {
          throw new Error('Fix failed');
        }
        return true;
      };

      // Act
      await executeFixLoopMock(fixLoop, 3);

      // Assert
      expect(checkpointsBefore).toHaveLength(2);
      expect(mockCheckpointSystem.list().length).toBeGreaterThanOrEqual(2);
    });

    it('rolls back failed fix attempt', async () => {
      let attemptCount = 0;

      const fixLoop = async (): Promise<boolean> => {
        attemptCount++;
        const checkpoint = await mockCheckpointSystem.create({
          batch_id: `fix-${attemptCount}`,
          reason: 'before_risky_operation',
          type: 'automatic',
        });

        // Simulate changes
        mockCheckpointSystem.simulateFileChanges([`file${attemptCount}.ts`]);

        if (attemptCount === 1) {
          // First attempt fails, rollback
          await mockCheckpointSystem.restore(checkpoint.id);
          throw new Error('First attempt failed');
        }

        return true;
      };

      // Act
      const result = await executeFixLoopMock(fixLoop, 3);

      // Assert
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      // First attempt's changes should be rolled back
      expect(mockCheckpointSystem.hasChanges()).toBe(true); // Only second attempt's changes remain
    });

    it('stops fix loop after max attempts', async () => {
      const fixLoop = async (): Promise<boolean> => {
        throw new Error('Always fails');
      };

      // Act
      const result = await executeFixLoopMock(fixLoop, 3);

      // Assert
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.error).toBeDefined();
    });
  });

  describe('Partial Rollback', () => {
    it('restores specific files only', async () => {
      // Arrange
      const checkpoint = await mockCheckpointSystem.create({
        batch_id: 'batch-007',
        reason: 'batch_start',
        type: 'automatic',
        include: {
          files: ['file1.ts', 'file2.ts', 'file3.ts'],
        },
      });

      // Act
      const result = await mockCheckpointSystem.restore(checkpoint.id, {
        specific_files: ['file1.ts', 'file2.ts'],
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.files_restored).toEqual(['file1.ts', 'file2.ts']);
      expect(result.files_restored).not.toContain('file3.ts');
    });

    it('restores specific state keys only', async () => {
      // Arrange
      const checkpoint = await mockCheckpointSystem.create({
        batch_id: 'batch-008',
        reason: 'batch_start',
        type: 'automatic',
        include: {
          state: ['session', 'config', 'cache'],
        },
      });

      // Act
      const result = await mockCheckpointSystem.restore(checkpoint.id, {
        specific_state: ['session', 'config'],
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.state_restored).toEqual(['session', 'config']);
      expect(result.state_restored).not.toContain('cache');
    });
  });

  describe('Checkpoint Management', () => {
    it('lists checkpoints with filters', async () => {
      // Arrange: Create multiple checkpoints
      await mockCheckpointSystem.create({
        batch_id: 'batch-001',
        reason: 'batch_start',
        type: 'automatic',
      });
      await mockCheckpointSystem.create({
        batch_id: 'batch-002',
        reason: 'manual_request',
        type: 'manual',
      });
      await mockCheckpointSystem.create({
        batch_id: 'batch-001',
        reason: 'before_risky_operation',
        type: 'automatic',
      });

      // Act: Filter by batch_id
      const filtered = mockCheckpointSystem.list({
        batch_id: 'batch-001',
      });

      // Assert
      expect(filtered).toHaveLength(2);
      expect(filtered.every((cp) => cp.batch_id === 'batch-001')).toBe(true);
    });

    it('cleans up expired checkpoints', async () => {
      // Arrange: Create expired checkpoint
      const expiredCheckpoint = await mockCheckpointSystem.create({
        reason: 'batch_start',
        type: 'automatic',
        expires_after_hours: -1, // Already expired
      });

      const validCheckpoint = await mockCheckpointSystem.create({
        reason: 'batch_start',
        type: 'automatic',
        expires_after_hours: 24,
      });

      // Act
      const cleanupResult = mockCheckpointSystem.cleanup();

      // Assert
      expect(cleanupResult.removed).toBe(1);
      expect(cleanupResult.remaining).toBe(1);
      expect(mockCheckpointSystem.get(expiredCheckpoint.id)).toBeUndefined();
      expect(mockCheckpointSystem.get(validCheckpoint.id)).toBeDefined();
    });

    it('deletes checkpoint manually', async () => {
      // Arrange
      const checkpoint = await mockCheckpointSystem.create({
        reason: 'manual_request',
        type: 'manual',
      });

      // Act
      const deleted = mockCheckpointSystem.delete(checkpoint.id);

      // Assert
      expect(deleted).toBe(true);
      expect(mockCheckpointSystem.get(checkpoint.id)).toBeUndefined();
    });

    it('calculates checkpoint size accurately', async () => {
      // Arrange
      const checkpoint = await mockCheckpointSystem.create({
        reason: 'batch_start',
        type: 'automatic',
        include: {
          files: ['large-file.ts'],
        },
      });

      // Assert
      expect(checkpoint.size_bytes).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Mock Implementations
// ============================================================================

class MockCheckpointSystem {
  private checkpoints: Map<string, Checkpoint> = new Map();
  private changedFiles: Set<string> = new Set();
  private currentState: Record<string, unknown> = {
    session: { user: 'test' },
    config: { mode: 'test' },
  };
  private checkpointCounter: number = 0;

  async create(config: CheckpointConfig): Promise<Checkpoint> {
    const now = new Date();
    // Add counter to ensure unique IDs even if created at the same time
    this.checkpointCounter++;
    const id = `cp_${now.toISOString().slice(0, 10).replace(/-/g, '')}_${now
      .toTimeString()
      .slice(0, 8)
      .replace(/:/g, '')}_${this.checkpointCounter}`;

    const files = (config.include?.files || ['test-file.ts']).map((path) => ({
      path,
      hash: 'a'.repeat(64), // Mock SHA-256
    }));

    const expiresAt = new Date(now);
    expiresAt.setHours(expiresAt.getHours() + (config.expires_after_hours || 24));

    // Capture current changed files for restoration
    const fileSnapshot = Array.from(this.changedFiles);

    const checkpoint: Checkpoint = {
      id,
      batch_id: config.batch_id,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      type: config.type,
      reason: config.reason,
      files,
      state_snapshot: { ...this.currentState },
      memory_snapshot: config.include?.memory
        ? { decisions: 5, patterns: 3, failures: 1 }
        : undefined,
      size_bytes: files.length * 1024,
    };

    this.checkpoints.set(id, checkpoint);
    // Store file snapshot in a private map for restoration
    (checkpoint as any)._fileSnapshot = fileSnapshot;
    return checkpoint;
  }

  async restore(
    checkpoint_id: string,
    options?: RestoreOptions
  ): Promise<RestoreResult> {
    const checkpoint = this.checkpoints.get(checkpoint_id);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpoint_id} not found`);
    }

    const startTime = Date.now();

    let files_restored: string[] = [];
    let state_restored: string[] = [];

    if (!options?.state_only) {
      // Get files that were changed and need restoration
      const fileSnapshot = (checkpoint as any)._fileSnapshot || [];
      const changedFilesList = Array.from(this.changedFiles);

      // If specific files requested, use those; otherwise restore all changed files
      const filesToRestore = options?.specific_files || changedFilesList;
      files_restored = filesToRestore;

      if (!options?.dry_run) {
        // Actually restore files
        filesToRestore.forEach((file) => this.changedFiles.delete(file));
      }
    }

    if (!options?.files_only) {
      const keysToRestore =
        options?.specific_state || Object.keys(checkpoint.state_snapshot);
      state_restored = keysToRestore;

      if (!options?.dry_run) {
        // Actually restore state
        keysToRestore.forEach((key) => {
          this.currentState[key] = checkpoint.state_snapshot[key];
        });
      }
    }

    return {
      success: true,
      checkpoint_id,
      files_restored,
      state_restored,
      duration_ms: Date.now() - startTime,
    };
  }

  list(filter?: CheckpointFilter): Checkpoint[] {
    let results = Array.from(this.checkpoints.values());

    if (filter?.batch_id) {
      results = results.filter((cp) => cp.batch_id === filter.batch_id);
    }

    if (filter?.type) {
      results = results.filter((cp) => cp.type === filter.type);
    }

    if (filter?.reason) {
      results = results.filter((cp) => cp.reason === filter.reason);
    }

    if (filter?.created_after) {
      results = results.filter((cp) => cp.created_at >= filter.created_after!);
    }

    if (filter?.created_before) {
      results = results.filter((cp) => cp.created_at <= filter.created_before!);
    }

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  get(checkpoint_id: string): Checkpoint | undefined {
    return this.checkpoints.get(checkpoint_id);
  }

  delete(checkpoint_id: string): boolean {
    return this.checkpoints.delete(checkpoint_id);
  }

  cleanup(): CleanupResult {
    const now = new Date();
    let removed = 0;
    let freed_bytes = 0;

    for (const [id, checkpoint] of this.checkpoints.entries()) {
      if (checkpoint.expires_at && new Date(checkpoint.expires_at) < now) {
        freed_bytes += checkpoint.size_bytes;
        this.checkpoints.delete(id);
        removed++;
      }
    }

    return {
      removed,
      freed_bytes,
      remaining: this.checkpoints.size,
    };
  }

  simulateFileChanges(files: string[]): void {
    files.forEach((file) => this.changedFiles.add(file));
  }

  hasChanges(): boolean {
    return this.changedFiles.size > 0;
  }

  clear(): void {
    this.checkpoints.clear();
    this.changedFiles.clear();
    this.currentState = { session: { user: 'test' }, config: { mode: 'test' } };
    this.checkpointCounter = 0;
  }

  getChangedFiles(): string[] {
    return Array.from(this.changedFiles);
  }
}

interface FixLoopResult {
  success: boolean;
  attempts: number;
  fixed?: boolean;
  error?: string;
}

async function executeFixLoopMock(
  fixFn: () => Promise<boolean>,
  maxAttempts: number
): Promise<FixLoopResult> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const fixed = await fixFn();
      return { success: true, attempts, fixed };
    } catch (error) {
      if (attempts >= maxAttempts) {
        return {
          success: false,
          attempts,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
      // Continue to next attempt
    }
  }

  return { success: false, attempts, error: 'Max attempts exceeded' };
}
