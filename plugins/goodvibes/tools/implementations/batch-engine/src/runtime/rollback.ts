/**
 * Rollback System implementation for Batch Engine
 * @see SPEC-v2 Section 11.4
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  RollbackSystem,
  RollbackResult,
  RollbackScope,
  RollbackTarget,
  SelectiveRollbackOptions,
  RollbackPreview,
  RollbackManager,
  RollbackPlan,
  RollbackStep,
  RollbackHistoryEntry,
  RollbackConfig,
} from '../interfaces/rollback.js';
import type { Checkpoint } from '../interfaces/state.js';
import type { StateManager } from '../interfaces/state-api.js';
import { getStateManager } from './state.js';
import {
  type CheckpointManifest,
  type CheckpointFileEntry,
  type CheckpointStateSnapshot,
  CHECKPOINT_PATHS,
} from '../interfaces/checkpoint-files.js';

/**
 * Generate a unique ID with prefix
 */
function generateId(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Calculate SHA-256 hash of file content
 */
async function calculateFileHash(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Rollback System implementation
 */
export class RollbackSystemImpl implements RollbackManager {
  private stateManager: StateManager;
  private projectRoot: string;
  private rollbackLock: Promise<RollbackResult> | null = null;
  private history: RollbackHistoryEntry[] = [];
  private config: RollbackConfig;
  private operationFileMap: Map<string, Set<string>> = new Map();

  constructor(projectRoot: string = process.cwd(), stateManager?: StateManager) {
    this.projectRoot = projectRoot;
    this.stateManager = stateManager || getStateManager(projectRoot);
    this.config = {
      auto_rollback_on_error: true,
      keep_rollback_history: true,
      max_history_entries: 50,
      require_checkpoint: true,
    };
  }

  // =========================================================================
  // RollbackSystem Core Methods
  // =========================================================================

  async toCheckpoint(checkpoint_id: string, scope: RollbackScope = 'all'): Promise<RollbackResult> {
    const target: RollbackTarget = { type: 'checkpoint', checkpoint_id };
    return this.executeRollback(target, scope);
  }

  async lastBatch(): Promise<RollbackResult> {
    const state = this.stateManager.getState();
    const checkpoints = state.checkpoints.checkpoints;

    if (checkpoints.length === 0) {
      return this.createFailedResult(
        { type: 'checkpoint', checkpoint_id: '' },
        'all',
        ['No checkpoints available']
      );
    }

    // Get the most recent checkpoint
    const latestCheckpoint = checkpoints[checkpoints.length - 1];
    if (!latestCheckpoint) {
      return this.createFailedResult(
        { type: 'checkpoint', checkpoint_id: '' },
        'all',
        ['No checkpoint found']
      );
    }
    return this.toCheckpoint(latestCheckpoint.id, 'all');
  }

  async operations(operation_ids: string[]): Promise<RollbackResult> {
    const target: RollbackTarget = { type: 'operations', operation_ids };
    return this.executeRollback(target, 'selective');
  }

  async selective(options: SelectiveRollbackOptions): Promise<RollbackResult> {
    // Determine target from options
    let target: RollbackTarget;

    if (options.to_checkpoint) {
      target = { type: 'checkpoint', checkpoint_id: options.to_checkpoint };
    } else if (options.to_batch) {
      const checkpoint = this.findCheckpointByBatch(options.to_batch);
      if (!checkpoint) {
        return this.createFailedResult(
          { type: 'checkpoint', checkpoint_id: '' },
          'selective',
          [`No checkpoint found for batch: ${options.to_batch}`]
        );
      }
      target = { type: 'checkpoint', checkpoint_id: checkpoint.id };
    } else if (options.to_time) {
      target = { type: 'time', timestamp: options.to_time };
    } else {
      return this.createFailedResult(
        { type: 'checkpoint', checkpoint_id: '' },
        'selective',
        ['No valid target specified in selective options']
      );
    }

    return this.executeRollback(target, 'selective', options);
  }

  async preview(target: RollbackTarget, scope: RollbackScope = 'all'): Promise<RollbackPreview> {
    const checkpoint = await this.resolveTarget(target);
    if (!checkpoint) {
      return {
        files_to_restore: [],
        state_to_restore: [],
        warnings: ['No checkpoint found for target'],
        estimated_duration_ms: 0,
      };
    }

    const manifest = await this.readManifest(checkpoint.id);
    if (!manifest) {
      return {
        files_to_restore: [],
        state_to_restore: [],
        warnings: ['Checkpoint manifest not found'],
        estimated_duration_ms: 0,
      };
    }

    const filesToRestore: RollbackPreview['files_to_restore'] = [];
    const warnings: string[] = [];

    // Check which files would be restored
    for (const fileEntry of manifest.files) {
      const currentExists = await fileExists(this.getAbsolutePath(fileEntry.original_path));
      const currentHash = currentExists ? await calculateFileHash(this.getAbsolutePath(fileEntry.original_path)) : '';

      let changeType: 'modified' | 'deleted' | 'created' = 'modified';
      if (!currentExists) {
        changeType = 'deleted';
      } else if (currentHash !== fileEntry.hash) {
        changeType = 'modified';
      }

      if (changeType !== 'modified' || currentHash !== fileEntry.hash) {
        filesToRestore.push({
          path: fileEntry.original_path,
          current_hash: currentHash,
          target_hash: fileEntry.hash,
          change_type: changeType,
        });
      }
    }

    // Estimate duration based on file count
    const estimatedDurationMs = filesToRestore.length * 10 + 100;

    return {
      files_to_restore: filesToRestore,
      state_to_restore: [],
      warnings,
      estimated_duration_ms: estimatedDurationMs,
    };
  }

  canRollback(target: RollbackTarget): boolean {
    const checkpoint = this.findCheckpointSync(target);
    return checkpoint !== undefined;
  }

  // =========================================================================
  // RollbackManager Extended Methods
  // =========================================================================

  getAvailableTargets(): RollbackTarget[] {
    const state = this.stateManager.getState();
    const checkpoints = state.checkpoints.checkpoints;

    return checkpoints.map(cp => ({
      type: 'checkpoint' as const,
      checkpoint_id: cp.id,
    }));
  }

  getLatestCheckpoint(): Checkpoint | undefined {
    const state = this.stateManager.getState();
    const checkpoints = state.checkpoints.checkpoints;
    return checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : undefined;
  }

  createPlan(target: RollbackTarget, options?: SelectiveRollbackOptions): RollbackPlan {
    const checkpoint = this.findCheckpointSync(target);
    if (!checkpoint) {
      return {
        id: generateId('plan'),
        target,
        scope: 'all',
        steps: [],
        estimated_duration_ms: 0,
        created_at: new Date().toISOString(),
        valid_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
      };
    }

    const steps: RollbackStep[] = [];
    let order = 1;

    // Add file restore steps
    for (const file of checkpoint.files) {
      steps.push({
        order: order++,
        type: 'restore_file',
        target: file.path,
        source: file.backup_path,
        description: `Restore ${file.path}`,
      });
    }

    // Add state restore step
    steps.push({
      order: order++,
      type: 'restore_state',
      target: 'session',
      description: 'Restore session state',
    });

    return {
      id: generateId('plan'),
      target,
      scope: options ? 'selective' : 'all',
      steps,
      estimated_duration_ms: steps.length * 10 + 100,
      created_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }

  async executePlan(plan: RollbackPlan): Promise<RollbackResult> {
    // Check if plan is still valid
    if (new Date(plan.valid_until) < new Date()) {
      return this.createFailedResult(plan.target, plan.scope, ['Plan has expired']);
    }

    return this.executeRollback(plan.target, plan.scope);
  }

  // =========================================================================
  // Operation File Tracking
  // =========================================================================

  /**
   * Track that an operation modified specific files
   */
  trackOperationFiles(operation_id: string, files: string[]): void {
    if (!this.operationFileMap.has(operation_id)) {
      this.operationFileMap.set(operation_id, new Set());
    }
    const fileSet = this.operationFileMap.get(operation_id)!;
    for (const file of files) {
      fileSet.add(file);
    }
  }

  /**
   * Get files modified by specific operations
   */
  getOperationFiles(operation_ids: string[]): string[] {
    const allFiles = new Set<string>();
    for (const opId of operation_ids) {
      const files = this.operationFileMap.get(opId);
      if (files) {
        for (const file of files) {
          allFiles.add(file);
        }
      }
    }
    return Array.from(allFiles);
  }

  // =========================================================================
  // Private Implementation Methods
  // =========================================================================

  private async executeRollback(
    target: RollbackTarget,
    scope: RollbackScope,
    options?: SelectiveRollbackOptions
  ): Promise<RollbackResult> {
    // Serialize rollback operations
    if (this.rollbackLock) {
      await this.rollbackLock;
    }

    this.rollbackLock = this.doRollback(target, scope, options);
    const result = await this.rollbackLock;
    this.rollbackLock = null;

    return result;
  }

  private async doRollback(
    target: RollbackTarget,
    scope: RollbackScope,
    options?: SelectiveRollbackOptions
  ): Promise<RollbackResult> {
    const startTime = Date.now();
    const filesRestored: string[] = [];
    const filesFailed: string[] = [];
    const stateRestored: string[] = [];
    const stateFailed: string[] = [];
    const errors: string[] = [];

    try {
      // Resolve target to checkpoint
      const checkpoint = await this.resolveTarget(target);
      if (!checkpoint) {
        errors.push('No checkpoint found for target');
        return this.createFailedResult(target, scope, errors);
      }

      // Load checkpoint manifest
      const manifest = await this.readManifest(checkpoint.id);
      if (!manifest) {
        errors.push('Checkpoint manifest not found');
        return this.createFailedResult(target, scope, errors);
      }

      // Create backup before rollback
      const backupCheckpoint = this.stateManager.createCheckpoint(
        'rollback_backup',
        `Backup before rollback to ${checkpoint.id}`
      );

      // Restore files
      if (scope === 'all' || scope === 'files' || scope === 'selective') {
        const filesToRestore = this.filterFilesToRestore(manifest.files, options);

        for (const fileEntry of filesToRestore) {
          try {
            const restored = await this.restoreFile(checkpoint.id, fileEntry);
            if (restored) {
              filesRestored.push(fileEntry.original_path);
            } else {
              filesFailed.push(fileEntry.original_path);
              errors.push(`Failed to restore file: ${fileEntry.original_path}`);
            }
          } catch (error) {
            filesFailed.push(fileEntry.original_path);
            errors.push(`Error restoring ${fileEntry.original_path}: ${error}`);
          }
        }
      }

      // Restore state
      if (scope === 'all' || scope === 'state' || scope === 'selective') {
        try {
          const stateSnapshot = await this.readStateSnapshot(checkpoint.id);
          if (stateSnapshot) {
            await this.restoreState(stateSnapshot, options);
            stateRestored.push('session');
          } else {
            stateFailed.push('session');
            errors.push('State snapshot not found');
          }
        } catch (error) {
          stateFailed.push('session');
          errors.push(`Error restoring state: ${error}`);
        }
      }

      // Verify restored files
      for (const filePath of filesRestored) {
        const currentHash = await calculateFileHash(this.getAbsolutePath(filePath));
        const expectedEntry = manifest.files.find(f => f.original_path === filePath);
        if (expectedEntry && currentHash !== expectedEntry.hash) {
          errors.push(`Hash mismatch after restore: ${filePath}`);
        }
      }

      const duration = Date.now() - startTime;
      const success = filesFailed.length === 0 && stateFailed.length === 0;

      const result: RollbackResult = {
        success,
        scope,
        target,
        files_restored: filesRestored,
        files_failed: filesFailed,
        state_restored: stateRestored,
        state_failed: stateFailed,
        duration_ms: duration,
        checkpoint_used: checkpoint.id,
        errors: errors.length > 0 ? errors : undefined,
      };

      // Add to history
      if (this.config.keep_rollback_history) {
        this.addToHistory(target, scope, result);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      errors.push(`Rollback failed: ${error}`);

      return {
        success: false,
        scope,
        target,
        files_restored: filesRestored,
        files_failed: filesFailed,
        state_restored: stateRestored,
        state_failed: stateFailed,
        duration_ms: duration,
        errors,
      };
    }
  }

  private async resolveTarget(target: RollbackTarget): Promise<Checkpoint | undefined> {
    switch (target.type) {
      case 'checkpoint':
        return this.findCheckpointById(target.checkpoint_id);

      case 'batch':
        return this.findCheckpointByBatch(target.batch_id);

      case 'time':
        return this.findCheckpointByTime(target.timestamp);

      case 'operations':
        // For operations, we need to find the checkpoint before those operations
        return this.findCheckpointForOperations(target.operation_ids);

      default:
        return undefined;
    }
  }

  private findCheckpointSync(target: RollbackTarget): Checkpoint | undefined {
    const state = this.stateManager.getState();
    const checkpoints = state.checkpoints.checkpoints;

    switch (target.type) {
      case 'checkpoint':
        return checkpoints.find(cp => cp.id === target.checkpoint_id);

      case 'batch':
        return checkpoints.find(cp => cp.batch_id === target.batch_id);

      default:
        return undefined;
    }
  }

  private findCheckpointById(checkpoint_id: string): Checkpoint | undefined {
    const state = this.stateManager.getState();
    return state.checkpoints.checkpoints.find(cp => cp.id === checkpoint_id);
  }

  private findCheckpointByBatch(batch_id: string): Checkpoint | undefined {
    const state = this.stateManager.getState();
    return state.checkpoints.checkpoints.find(cp => cp.batch_id === batch_id);
  }

  private findCheckpointByTime(timestamp: string): Checkpoint | undefined {
    const state = this.stateManager.getState();
    const checkpoints = state.checkpoints.checkpoints;
    const targetTime = new Date(timestamp).getTime();

    // Find the most recent checkpoint before the target time
    let bestMatch: Checkpoint | undefined;
    let smallestDiff = Infinity;

    for (const cp of checkpoints) {
      const cpTime = new Date(cp.created_at).getTime();
      const diff = targetTime - cpTime;

      if (diff >= 0 && diff < smallestDiff) {
        smallestDiff = diff;
        bestMatch = cp;
      }
    }

    return bestMatch;
  }

  private findCheckpointForOperations(operation_ids: string[]): Checkpoint | undefined {
    // This would require tracking which checkpoint was active when operations ran
    // For now, return the latest checkpoint
    return this.getLatestCheckpoint();
  }

  private filterFilesToRestore(
    files: CheckpointFileEntry[],
    options?: SelectiveRollbackOptions
  ): CheckpointFileEntry[] {
    if (!options) {
      return files;
    }

    let filtered = files;

    // Include specific files
    if (options.files && options.files.length > 0) {
      filtered = filtered.filter(f => options.files!.includes(f.original_path));
    }

    // Exclude specific files
    if (options.exclude_files && options.exclude_files.length > 0) {
      filtered = filtered.filter(f => !options.exclude_files!.includes(f.original_path));
    }

    return filtered;
  }

  private async restoreFile(checkpoint_id: string, entry: CheckpointFileEntry): Promise<boolean> {
    const storedPath = this.getAbsolutePath(CHECKPOINT_PATHS.files(checkpoint_id) + '/' + entry.stored_path);
    const targetPath = this.getAbsolutePath(entry.original_path);

    try {
      // Ensure target directory exists
      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      // Copy file from checkpoint to original location
      await fs.copyFile(storedPath, targetPath);

      // Verify hash
      const restoredHash = await calculateFileHash(targetPath);
      return restoredHash === entry.hash;
    } catch {
      return false;
    }
  }

  private async restoreState(
    snapshot: CheckpointStateSnapshot,
    options?: SelectiveRollbackOptions
  ): Promise<void> {
    // Restore session state
    if (!options?.exclude_state || !options.exclude_state.includes('session')) {
      if (snapshot.session) {
        this.stateManager.updateSession(snapshot.session as any);
      }
    }

    // Note: Agent and lock state restoration would require more sophisticated handling
    // For now, we only restore session state which is the most critical
  }

  private async readManifest(checkpoint_id: string): Promise<CheckpointManifest | null> {
    const manifestPath = this.getAbsolutePath(CHECKPOINT_PATHS.manifest(checkpoint_id));
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      return JSON.parse(content) as CheckpointManifest;
    } catch {
      return null;
    }
  }

  private async readStateSnapshot(checkpoint_id: string): Promise<CheckpointStateSnapshot | null> {
    const statePath = this.getAbsolutePath(CHECKPOINT_PATHS.state(checkpoint_id));
    try {
      const content = await fs.readFile(statePath, 'utf-8');
      return JSON.parse(content) as CheckpointStateSnapshot;
    } catch {
      return null;
    }
  }

  private createFailedResult(
    target: RollbackTarget,
    scope: RollbackScope,
    errors: string[]
  ): RollbackResult {
    return {
      success: false,
      scope,
      target,
      files_restored: [],
      files_failed: [],
      state_restored: [],
      state_failed: [],
      duration_ms: 0,
      errors,
    };
  }

  private addToHistory(
    target: RollbackTarget,
    scope: RollbackScope,
    result: RollbackResult
  ): void {
    const entry: RollbackHistoryEntry = {
      id: generateId('rollback'),
      timestamp: new Date().toISOString(),
      target,
      scope,
      result,
      triggered_by: 'manual',
    };

    this.history.push(entry);

    // Trim history if exceeding max entries
    while (this.history.length > this.config.max_history_entries) {
      this.history.shift();
    }
  }

  private getAbsolutePath(relativePath: string): string {
    return path.join(this.projectRoot, relativePath);
  }

  // =========================================================================
  // Public Configuration
  // =========================================================================

  getConfig(): RollbackConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<RollbackConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getHistory(): RollbackHistoryEntry[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }
}

/**
 * Create a new RollbackSystem instance
 */
export function createRollbackSystem(projectRoot?: string, stateManager?: StateManager): RollbackManager {
  return new RollbackSystemImpl(projectRoot, stateManager);
}

/**
 * Singleton rollback system instance
 */
let globalRollbackSystem: RollbackManager | null = null;

/**
 * Get the global RollbackSystem instance
 */
export function getRollbackSystem(projectRoot?: string, stateManager?: StateManager): RollbackManager {
  if (!globalRollbackSystem) {
    globalRollbackSystem = createRollbackSystem(projectRoot, stateManager);
  }
  return globalRollbackSystem;
}

/**
 * Reset the global RollbackSystem (useful for testing)
 */
export function resetGlobalRollbackSystem(): void {
  globalRollbackSystem = null;
}
