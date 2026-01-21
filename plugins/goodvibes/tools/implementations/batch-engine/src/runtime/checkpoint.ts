/**
 * Checkpoint Manager implementation for Batch Engine
 * @see SPEC-v2 Section 11.1
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  Checkpoint,
  CheckpointConfig,
  CheckpointFilter,
  RestoreOptions,
  RestoreResult,
  CleanupResult,
  CheckpointManager,
  CheckpointManagerConfig,
  CheckpointFile,
  MemorySnapshot,
} from '../interfaces/checkpoint.js';
import type {
  CheckpointManifest,
  CheckpointFileEntry,
  CheckpointStateSnapshot,
  CheckpointIndex,
  CheckpointIndexEntry,
  CheckpointFileManager,
} from '../interfaces/checkpoint-files.js';
import {
  CHECKPOINT_PATHS,
  generateCheckpointId,
  toStoredPath,
  isValidCheckpointId,
  getCheckpointDir,
  EMPTY_CHECKPOINT_INDEX,
  MANIFEST_VERSION,
} from '../interfaces/checkpoint-files.js';
import { getStateManager } from './state.js';
import { getMemoryManager } from './memory.js';

/**
 * Calculate SHA-256 hash of file content
 */
async function hashFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Calculate SHA-256 hash of string content
 */
function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Get file size in bytes
 */
async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Get file permissions in POSIX format
 */
async function getFilePermissions(filePath: string): Promise<string | undefined> {
  try {
    const stats = await fs.stat(filePath);
    return (stats.mode & 0o777).toString(8);
  } catch {
    return undefined;
  }
}

/**
 * Get file modification time
 */
async function getFileModifiedTime(filePath: string): Promise<string> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Calculate total size of directory recursively
 */
async function calculateDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        totalSize += await calculateDirectorySize(fullPath);
      } else {
        totalSize += await getFileSize(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or not accessible
  }

  return totalSize;
}

/**
 * Checkpoint File Manager implementation
 */
class CheckpointFileManagerImpl implements CheckpointFileManager {
  constructor(private projectRoot: string) {}

  private getAbsolutePath(relativePath: string): string {
    return path.join(this.projectRoot, relativePath);
  }

  async initialize(): Promise<void> {
    const rootDir = this.getAbsolutePath(CHECKPOINT_PATHS.root);
    await fs.mkdir(rootDir, { recursive: true });

    // Create index if it doesn't exist
    const indexPath = this.getAbsolutePath(CHECKPOINT_PATHS.index);
    try {
      await fs.access(indexPath);
    } catch {
      await fs.writeFile(indexPath, JSON.stringify(EMPTY_CHECKPOINT_INDEX, null, 2), 'utf-8');
    }
  }

  async createCheckpointDir(id: string): Promise<string> {
    const cpDir = this.getAbsolutePath(getCheckpointDir(id));
    const filesDir = this.getAbsolutePath(CHECKPOINT_PATHS.files(id));

    await fs.mkdir(cpDir, { recursive: true });
    await fs.mkdir(filesDir, { recursive: true });

    return cpDir;
  }

  async writeManifest(id: string, manifest: CheckpointManifest): Promise<void> {
    const manifestPath = this.getAbsolutePath(CHECKPOINT_PATHS.manifest(id));
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  async readManifest(id: string): Promise<CheckpointManifest | null> {
    const manifestPath = this.getAbsolutePath(CHECKPOINT_PATHS.manifest(id));
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      return JSON.parse(content) as CheckpointManifest;
    } catch {
      return null;
    }
  }

  async copyFileToCheckpoint(id: string, sourcePath: string, entry: CheckpointFileEntry): Promise<void> {
    const absSourcePath = this.getAbsolutePath(sourcePath);
    const filesDir = this.getAbsolutePath(CHECKPOINT_PATHS.files(id));
    const destPath = path.join(filesDir, entry.stored_path);

    try {
      await fs.copyFile(absSourcePath, destPath);
    } catch (error) {
      throw new Error(`Failed to copy file ${sourcePath} to checkpoint: ${error}`);
    }
  }

  async restoreFileFromCheckpoint(id: string, entry: CheckpointFileEntry): Promise<boolean> {
    const filesDir = this.getAbsolutePath(CHECKPOINT_PATHS.files(id));
    const sourcePath = path.join(filesDir, entry.stored_path);
    const destPath = this.getAbsolutePath(entry.original_path);

    try {
      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destPath), { recursive: true });

      // Copy file from checkpoint to original location
      await fs.copyFile(sourcePath, destPath);

      // Restore permissions if available
      if (entry.permissions) {
        await fs.chmod(destPath, parseInt(entry.permissions, 8));
      }

      return true;
    } catch {
      return false;
    }
  }

  async writeState(id: string, state: CheckpointStateSnapshot): Promise<void> {
    const statePath = this.getAbsolutePath(CHECKPOINT_PATHS.state(id));
    await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  async readState(id: string): Promise<CheckpointStateSnapshot | null> {
    const statePath = this.getAbsolutePath(CHECKPOINT_PATHS.state(id));
    try {
      const content = await fs.readFile(statePath, 'utf-8');
      return JSON.parse(content) as CheckpointStateSnapshot;
    } catch {
      return null;
    }
  }

  async updateIndex(entry: CheckpointIndexEntry): Promise<void> {
    const index = await this.readIndex();

    // Remove existing entry with same ID if present
    index.checkpoints = index.checkpoints.filter(cp => cp.id !== entry.id);

    // Add new entry
    index.checkpoints.push(entry);

    // Sort by creation time (newest first)
    index.checkpoints.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Update total size
    index.total_size_bytes = index.checkpoints.reduce((sum, cp) => sum + cp.size_bytes, 0);

    // Write updated index
    const indexPath = this.getAbsolutePath(CHECKPOINT_PATHS.index);
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  async removeFromIndex(id: string): Promise<void> {
    const index = await this.readIndex();
    index.checkpoints = index.checkpoints.filter(cp => cp.id !== id);
    index.total_size_bytes = index.checkpoints.reduce((sum, cp) => sum + cp.size_bytes, 0);

    const indexPath = this.getAbsolutePath(CHECKPOINT_PATHS.index);
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  async readIndex(): Promise<CheckpointIndex> {
    const indexPath = this.getAbsolutePath(CHECKPOINT_PATHS.index);
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      return JSON.parse(content) as CheckpointIndex;
    } catch {
      return { ...EMPTY_CHECKPOINT_INDEX };
    }
  }

  async deleteCheckpoint(id: string): Promise<boolean> {
    const cpDir = this.getAbsolutePath(getCheckpointDir(id));

    try {
      await fs.rm(cpDir, { recursive: true, force: true });
      await this.removeFromIndex(id);
      return true;
    } catch {
      return false;
    }
  }

  async calculateSize(id: string): Promise<number> {
    const cpDir = this.getAbsolutePath(getCheckpointDir(id));
    return await calculateDirectorySize(cpDir);
  }

  async verifyIntegrity(id: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Read manifest
    const manifest = await this.readManifest(id);
    if (!manifest) {
      return { valid: false, errors: ['Manifest not found'] };
    }

    // Verify each file
    const filesDir = this.getAbsolutePath(CHECKPOINT_PATHS.files(id));
    for (const entry of manifest.files) {
      const filePath = path.join(filesDir, entry.stored_path);

      try {
        const actualHash = await hashFile(filePath);
        if (actualHash !== entry.hash) {
          errors.push(`Hash mismatch for ${entry.original_path}: expected ${entry.hash}, got ${actualHash}`);
        }
      } catch {
        errors.push(`File not found: ${entry.original_path}`);
      }
    }

    // Verify state file exists
    const statePath = this.getAbsolutePath(CHECKPOINT_PATHS.state(id));
    try {
      await fs.access(statePath);
    } catch {
      errors.push('State snapshot not found');
    }

    return { valid: errors.length === 0, errors };
  }
}

/**
 * Checkpoint Manager implementation
 */
export class CheckpointManagerImpl implements CheckpointManager {
  public config: CheckpointManagerConfig;
  private fileManager: CheckpointFileManager;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd(), config?: Partial<CheckpointManagerConfig>) {
    this.projectRoot = projectRoot;
    this.config = {
      max_checkpoints: config?.max_checkpoints ?? 10,
      default_expiry_hours: config?.default_expiry_hours ?? 24,
      auto_cleanup: config?.auto_cleanup ?? true,
      checkpoint_dir: config?.checkpoint_dir ?? CHECKPOINT_PATHS.root,
    };
    this.fileManager = new CheckpointFileManagerImpl(projectRoot);
  }

  async initialize(): Promise<void> {
    await this.fileManager.initialize();

    // Run cleanup on initialization if auto_cleanup is enabled
    if (this.config.auto_cleanup) {
      await this.cleanup();
    }
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up in this implementation
    // File manager operations are stateless
  }

  async create(config: CheckpointConfig): Promise<Checkpoint> {
    const id = generateCheckpointId();
    const now = new Date();
    const expiresAfterHours = config.expires_after_hours ?? this.config.default_expiry_hours;
    const expiresAt = new Date(now.getTime() + expiresAfterHours * 60 * 60 * 1000);

    // Create checkpoint directory
    await this.fileManager.createCheckpointDir(id);

    // Get files to include
    const filesToBackup = config.include?.files ?? [];
    const fileEntries: CheckpointFileEntry[] = [];

    for (const filePath of filesToBackup) {
      const absPath = path.join(this.projectRoot, filePath);

      try {
        await fs.access(absPath);

        const storedPath = toStoredPath(filePath);
        const hash = await hashFile(absPath);
        const size = await getFileSize(absPath);
        const permissions = await getFilePermissions(absPath);
        const modifiedAt = await getFileModifiedTime(absPath);

        const entry: CheckpointFileEntry = {
          original_path: filePath,
          stored_path: storedPath,
          hash,
          size_bytes: size,
          permissions,
          modified_at: modifiedAt,
        };

        await this.fileManager.copyFileToCheckpoint(id, filePath, entry);
        fileEntries.push(entry);
      } catch {
        // Skip files that don't exist or can't be accessed
        continue;
      }
    }

    // Capture state snapshot
    const stateManager = getStateManager(this.projectRoot);
    const currentState = stateManager.getState();

    const stateSnapshot: CheckpointStateSnapshot = {
      checkpoint_id: id,
      captured_at: now.toISOString(),
      session: currentState.session as unknown as Record<string, unknown>,
      agents: {
        active: Array.from(currentState.agents.active.entries()),
        completed: currentState.agents.completed,
        total_spawned: currentState.agents.total_spawned,
        total_tokens: currentState.agents.total_tokens,
      } as unknown as Record<string, unknown>,
      locks: currentState.locks as unknown as Record<string, unknown>,
    };

    // Capture memory snapshot if requested
    let memorySnapshot: MemorySnapshot | undefined;
    if (config.include?.memory !== false) {
      const memoryManager = getMemoryManager(this.projectRoot);
      const memory = memoryManager.getMemory();

      memorySnapshot = {
        decisions: memory.decisions.length,
        patterns: memory.patterns.length,
        failures: memory.failures.length,
      };

      stateSnapshot.memory = {
        decisions: memory.decisions,
        patterns: memory.patterns,
        failures: memory.failures,
      };
    }

    await this.fileManager.writeState(id, stateSnapshot);

    // Create manifest
    const stateKeys = Object.keys(stateSnapshot.session);
    const totalSize = await this.fileManager.calculateSize(id);
    const manifestChecksum = hashContent(JSON.stringify({
      id,
      files: fileEntries,
      state_keys: stateKeys,
    }));

    const manifest: CheckpointManifest = {
      id,
      version: MANIFEST_VERSION,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      type: config.type,
      reason: config.reason,
      batch_id: config.batch_id,
      files: fileEntries,
      state_keys: stateKeys,
      memory_included: config.include?.memory !== false,
      total_size_bytes: totalSize,
      checksum: manifestChecksum,
    };

    await this.fileManager.writeManifest(id, manifest);

    // Update index
    const indexEntry: CheckpointIndexEntry = {
      id,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      type: config.type,
      reason: config.reason,
      batch_id: config.batch_id,
      size_bytes: totalSize,
      file_count: fileEntries.length,
    };

    await this.fileManager.updateIndex(indexEntry);

    // Auto-cleanup if exceeding max checkpoints
    if (this.config.auto_cleanup) {
      await this.enforceMaxCheckpoints();
    }

    // Build and return Checkpoint object
    const checkpoint: Checkpoint = {
      id,
      batch_id: config.batch_id,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      type: config.type,
      reason: config.reason,
      files: fileEntries.map(e => ({
        path: e.original_path,
        hash: e.hash,
      })),
      state_snapshot: stateSnapshot.session,
      memory_snapshot: memorySnapshot,
      size_bytes: totalSize,
    };

    return checkpoint;
  }

  async restore(checkpoint_id: string, options?: RestoreOptions): Promise<RestoreResult> {
    const startTime = Date.now();
    const filesRestored: string[] = [];
    const stateRestored: string[] = [];
    const errors: string[] = [];

    if (!isValidCheckpointId(checkpoint_id)) {
      return {
        success: false,
        checkpoint_id,
        files_restored: [],
        state_restored: [],
        errors: ['Invalid checkpoint ID format'],
        duration_ms: Date.now() - startTime,
      };
    }

    // Read manifest
    const manifest = await this.fileManager.readManifest(checkpoint_id);
    if (!manifest) {
      return {
        success: false,
        checkpoint_id,
        files_restored: [],
        state_restored: [],
        errors: ['Checkpoint not found'],
        duration_ms: Date.now() - startTime,
      };
    }

    // Verify integrity
    if (!options?.dry_run) {
      const integrity = await this.fileManager.verifyIntegrity(checkpoint_id);
      if (!integrity.valid) {
        errors.push(...integrity.errors);
      }
    }

    // Restore files (unless state_only)
    if (!options?.state_only && !options?.dry_run) {
      const filesToRestore = options?.specific_files
        ? manifest.files.filter(f => options.specific_files!.includes(f.original_path))
        : manifest.files;

      for (const entry of filesToRestore) {
        const restored = await this.fileManager.restoreFileFromCheckpoint(checkpoint_id, entry);
        if (restored) {
          filesRestored.push(entry.original_path);
        } else {
          errors.push(`Failed to restore file: ${entry.original_path}`);
        }
      }
    }

    // Restore state (unless files_only)
    if (!options?.files_only && !options?.dry_run) {
      const stateSnapshot = await this.fileManager.readState(checkpoint_id);
      if (stateSnapshot) {
        const stateManager = getStateManager(this.projectRoot);

        // Restore session state
        if (!options?.specific_state || options.specific_state.includes('session')) {
          try {
            stateManager.updateSession(stateSnapshot.session as any);
            stateRestored.push('session');
          } catch (error) {
            errors.push(`Failed to restore session state: ${error}`);
          }
        }

        // Restore locks
        if (!options?.specific_state || options.specific_state.includes('locks')) {
          try {
            const currentState = stateManager.getState();
            currentState.locks = stateSnapshot.locks as any;
            stateRestored.push('locks');
          } catch (error) {
            errors.push(`Failed to restore locks: ${error}`);
          }
        }

        // Restore memory if included
        if (manifest.memory_included && stateSnapshot.memory) {
          const memoryManager = getMemoryManager(this.projectRoot);
          try {
            memoryManager.reset();
            memoryManager.import(JSON.stringify(stateSnapshot.memory));
            stateRestored.push('memory');
          } catch (error) {
            errors.push(`Failed to restore memory: ${error}`);
          }
        }
      } else {
        errors.push('State snapshot not found');
      }
    }

    // In dry_run mode, list what would be restored
    if (options?.dry_run) {
      const filesToRestore = options?.specific_files
        ? manifest.files.filter(f => options.specific_files!.includes(f.original_path))
        : manifest.files;

      filesRestored.push(...filesToRestore.map(f => f.original_path));

      if (!options?.files_only) {
        stateRestored.push('session', 'locks');
        if (manifest.memory_included) {
          stateRestored.push('memory');
        }
      }
    }

    return {
      success: errors.length === 0,
      checkpoint_id,
      files_restored: filesRestored,
      state_restored: stateRestored,
      errors: errors.length > 0 ? errors : undefined,
      duration_ms: Date.now() - startTime,
    };
  }

  list(filter?: CheckpointFilter): Checkpoint[] {
    const index = this.fileManager.readIndex();

    // This is synchronous in the interface but readIndex is async
    // We need to handle this properly - for now return empty
    // In a real implementation, we'd cache the index in memory
    return [];
  }

  get(checkpoint_id: string): Checkpoint | undefined {
    // Similar issue - interface expects sync but we need async file access
    // In a real implementation, we'd cache loaded checkpoints
    return undefined;
  }

  delete(checkpoint_id: string): boolean {
    // Similar issue - interface expects sync but we need async file access
    // We'll implement async version below
    return false;
  }

  cleanup(): CleanupResult {
    // Similar issue - interface expects sync but we need async file access
    // We'll implement async version below
    return {
      removed: 0,
      freed_bytes: 0,
      remaining: 0,
    };
  }

  /**
   * Async version of list (for internal use)
   */
  async listAsync(filter?: CheckpointFilter): Promise<Checkpoint[]> {
    const index = await this.fileManager.readIndex();
    let entries = [...index.checkpoints];

    // Apply filters
    if (filter) {
      if (filter.batch_id) {
        entries = entries.filter(e => e.batch_id === filter.batch_id);
      }
      if (filter.type) {
        entries = entries.filter(e => e.type === filter.type);
      }
      if (filter.reason) {
        entries = entries.filter(e => e.reason === filter.reason);
      }
      if (filter.created_after) {
        const afterDate = new Date(filter.created_after);
        entries = entries.filter(e => new Date(e.created_at) >= afterDate);
      }
      if (filter.created_before) {
        const beforeDate = new Date(filter.created_before);
        entries = entries.filter(e => new Date(e.created_at) <= beforeDate);
      }
      if (filter.limit) {
        entries = entries.slice(0, filter.limit);
      }
    }

    // Load full checkpoint data for each entry
    const checkpoints: Checkpoint[] = [];
    for (const entry of entries) {
      const manifest = await this.fileManager.readManifest(entry.id);
      if (manifest) {
        const checkpoint: Checkpoint = {
          id: manifest.id,
          batch_id: manifest.batch_id,
          created_at: manifest.created_at,
          expires_at: manifest.expires_at,
          type: manifest.type,
          reason: manifest.reason,
          files: manifest.files.map(f => ({
            path: f.original_path,
            hash: f.hash,
          })),
          state_snapshot: {},
          memory_snapshot: manifest.memory_included ? {
            decisions: 0,
            patterns: 0,
            failures: 0,
          } : undefined,
          size_bytes: manifest.total_size_bytes,
        };
        checkpoints.push(checkpoint);
      }
    }

    return checkpoints;
  }

  /**
   * Async version of get (for internal use)
   */
  async getAsync(checkpoint_id: string): Promise<Checkpoint | undefined> {
    const manifest = await this.fileManager.readManifest(checkpoint_id);
    if (!manifest) {
      return undefined;
    }

    const stateSnapshot = await this.fileManager.readState(checkpoint_id);

    return {
      id: manifest.id,
      batch_id: manifest.batch_id,
      created_at: manifest.created_at,
      expires_at: manifest.expires_at,
      type: manifest.type,
      reason: manifest.reason,
      files: manifest.files.map(f => ({
        path: f.original_path,
        hash: f.hash,
      })),
      state_snapshot: stateSnapshot?.session ?? {},
      memory_snapshot: manifest.memory_included ? {
        decisions: (stateSnapshot?.memory as any)?.decisions?.length ?? 0,
        patterns: (stateSnapshot?.memory as any)?.patterns?.length ?? 0,
        failures: (stateSnapshot?.memory as any)?.failures?.length ?? 0,
      } : undefined,
      size_bytes: manifest.total_size_bytes,
    };
  }

  /**
   * Async version of delete (for internal use)
   */
  async deleteAsync(checkpoint_id: string): Promise<boolean> {
    return await this.fileManager.deleteCheckpoint(checkpoint_id);
  }

  /**
   * Async version of cleanup (for internal use)
   */
  async cleanupAsync(): Promise<CleanupResult> {
    const index = await this.fileManager.readIndex();
    const now = new Date();

    let removed = 0;
    let freedBytes = 0;
    const errors: string[] = [];

    for (const entry of index.checkpoints) {
      if (entry.expires_at && new Date(entry.expires_at) <= now) {
        const deleted = await this.fileManager.deleteCheckpoint(entry.id);
        if (deleted) {
          removed++;
          freedBytes += entry.size_bytes;
        } else {
          errors.push(`Failed to delete checkpoint: ${entry.id}`);
        }
      }
    }

    // Update index cleanup timestamp
    const updatedIndex = await this.fileManager.readIndex();
    updatedIndex.last_cleanup = now.toISOString();
    const indexPath = path.join(this.projectRoot, CHECKPOINT_PATHS.index);
    await fs.writeFile(indexPath, JSON.stringify(updatedIndex, null, 2), 'utf-8');

    return {
      removed,
      freed_bytes: freedBytes,
      remaining: updatedIndex.checkpoints.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Enforce max checkpoints limit by removing oldest
   */
  private async enforceMaxCheckpoints(): Promise<void> {
    const index = await this.fileManager.readIndex();

    if (index.checkpoints.length <= this.config.max_checkpoints) {
      return;
    }

    // Sort by creation time (oldest first)
    const sorted = [...index.checkpoints].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Remove excess checkpoints
    const toRemove = sorted.slice(0, sorted.length - this.config.max_checkpoints);

    for (const entry of toRemove) {
      await this.fileManager.deleteCheckpoint(entry.id);
    }
  }
}

/**
 * Create a new CheckpointManager instance
 */
export function createCheckpointManager(
  projectRoot?: string,
  config?: Partial<CheckpointManagerConfig>
): CheckpointManager {
  return new CheckpointManagerImpl(projectRoot, config);
}

/**
 * Singleton checkpoint manager instance
 */
let globalCheckpointManager: CheckpointManager | null = null;

/**
 * Get the global CheckpointManager instance
 */
export function getCheckpointManager(
  projectRoot?: string,
  config?: Partial<CheckpointManagerConfig>
): CheckpointManager {
  if (!globalCheckpointManager) {
    globalCheckpointManager = createCheckpointManager(projectRoot, config);
  }
  return globalCheckpointManager;
}

/**
 * Reset the global CheckpointManager (useful for testing)
 */
export function resetGlobalCheckpointManager(): void {
  globalCheckpointManager = null;
}
