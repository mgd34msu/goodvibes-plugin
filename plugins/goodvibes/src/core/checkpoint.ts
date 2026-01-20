import { randomUUID, createHash } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Represents a file in a checkpoint.
 */
export interface CheckpointFile {
  /** Relative path from project root */
  path: string;
  /** SHA-256 hash of content */
  hash: string;
  /** File content (only stored if < 100KB) */
  content?: string;
  /** File size in bytes */
  size: number;
}

/**
 * Represents a checkpoint snapshot.
 */
export interface Checkpoint {
  /** Unique checkpoint identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** ISO timestamp when created */
  created_at: string;
  /** Git stash reference (if using git) */
  git_stash_ref?: string;
  /** Files included in checkpoint */
  files: CheckpointFile[];
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Result of a rollback operation.
 */
export interface RollbackResult {
  /** Whether rollback succeeded overall */
  success: boolean;
  /** Checkpoint that was rolled back to */
  checkpoint_id: string;
  /** Files successfully restored */
  files_restored: string[];
  /** Files that failed to restore */
  files_failed: string[];
  /** Error messages */
  errors: string[];
}

/** Maximum file size to store content (100KB) */
const MAX_CONTENT_SIZE = 100 * 1024;

/**
 * Manages checkpoints for rollback capability.
 */
export class CheckpointManager {
  private checkpoints: Map<string, Checkpoint>;
  private projectRoot: string;

  /**
   * Creates a new CheckpointManager.
   * @param projectRoot - The project root directory
   */
  constructor(projectRoot: string) {
    this.checkpoints = new Map();
    this.projectRoot = projectRoot;
  }

  /**
   * Computes SHA-256 hash of content.
   */
  private hashContent(content: string): string {
    return createHash("sha256").update(content, "utf8").digest("hex");
  }

  /**
   * Creates a new checkpoint from the specified files.
   * @param name - Human-readable checkpoint name
   * @param files - Array of file paths (relative or absolute)
   * @param metadata - Optional metadata to store with checkpoint
   */
  async createCheckpoint(
    name: string,
    files: string[],
    metadata: Record<string, unknown> = {}
  ): Promise<Checkpoint> {
    const id = randomUUID();
    const checkpointFiles: CheckpointFile[] = [];

    for (const filePath of files) {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(this.projectRoot, filePath);

      const relativePath = path.relative(this.projectRoot, absolutePath);

      try {
        const content = await fs.readFile(absolutePath, "utf8");
        const hash = this.hashContent(content);
        const size = Buffer.byteLength(content, "utf8");

        const checkpointFile: CheckpointFile = {
          path: relativePath,
          hash,
          size,
        };

        // Only store content if under size limit
        if (size < MAX_CONTENT_SIZE) {
          checkpointFile.content = content;
        }

        checkpointFiles.push(checkpointFile);
      } catch (error) {
        // Skip files that can't be read (deleted, permissions, etc.)
        console.warn(`Could not read file for checkpoint: ${filePath}`, error);
      }
    }

    const checkpoint: Checkpoint = {
      id,
      name,
      created_at: new Date().toISOString(),
      files: checkpointFiles,
      metadata,
    };

    this.checkpoints.set(id, checkpoint);
    return checkpoint;
  }

  /**
   * Gets a checkpoint by ID.
   */
  getCheckpoint(id: string): Checkpoint | undefined {
    const checkpoint = this.checkpoints.get(id);
    return checkpoint ? { ...checkpoint, files: [...checkpoint.files] } : undefined;
  }

  /**
   * Gets a checkpoint by name.
   */
  getCheckpointByName(name: string): Checkpoint | undefined {
    for (const checkpoint of this.checkpoints.values()) {
      if (checkpoint.name === name) {
        return { ...checkpoint, files: [...checkpoint.files] };
      }
    }
    return undefined;
  }

  /**
   * Lists all checkpoints, sorted by creation time (newest first).
   */
  listCheckpoints(): Checkpoint[] {
    return Array.from(this.checkpoints.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((c) => ({ ...c, files: [...c.files] }));
  }

  /**
   * Deletes a checkpoint.
   * @returns true if deleted, false if not found
   */
  deleteCheckpoint(id: string): boolean {
    return this.checkpoints.delete(id);
  }

  /**
   * Gets the most recent checkpoint.
   */
  getLatestCheckpoint(): Checkpoint | undefined {
    const checkpoints = this.listCheckpoints();
    return checkpoints.length > 0 ? checkpoints[0] : undefined;
  }

  /**
   * Rolls back to a checkpoint by ID.
   */
  async rollbackTo(checkpoint_id: string): Promise<RollbackResult> {
    const checkpoint = this.checkpoints.get(checkpoint_id);

    if (!checkpoint) {
      return {
        success: false,
        checkpoint_id,
        files_restored: [],
        files_failed: [],
        errors: [`Checkpoint not found: ${checkpoint_id}`],
      };
    }

    const result: RollbackResult = {
      success: true,
      checkpoint_id,
      files_restored: [],
      files_failed: [],
      errors: [],
    };

    for (const file of checkpoint.files) {
      const absolutePath = path.resolve(this.projectRoot, file.path);

      if (!file.content) {
        // Can't restore - content wasn't stored
        result.files_failed.push(file.path);
        result.errors.push(
          `Cannot restore ${file.path}: content not stored (file was > ${MAX_CONTENT_SIZE / 1024}KB)`
        );
        continue;
      }

      try {
        // Ensure directory exists
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        // Write content
        await fs.writeFile(absolutePath, file.content, "utf8");
        result.files_restored.push(file.path);
      } catch (error) {
        result.files_failed.push(file.path);
        result.errors.push(
          `Failed to restore ${file.path}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    result.success = result.files_failed.length === 0;
    return result;
  }

  /**
   * Rolls back to a checkpoint by name.
   */
  async rollbackToName(name: string): Promise<RollbackResult> {
    const checkpoint = this.getCheckpointByName(name);

    if (!checkpoint) {
      return {
        success: false,
        checkpoint_id: "",
        files_restored: [],
        files_failed: [],
        errors: [`Checkpoint not found with name: ${name}`],
      };
    }

    return this.rollbackTo(checkpoint.id);
  }

  /**
   * Verifies a checkpoint's files still match their hashes.
   */
  async verifyCheckpoint(
    checkpoint_id: string
  ): Promise<{ valid: boolean; issues: string[] }> {
    const checkpoint = this.checkpoints.get(checkpoint_id);

    if (!checkpoint) {
      return { valid: false, issues: [`Checkpoint not found: ${checkpoint_id}`] };
    }

    const issues: string[] = [];

    for (const file of checkpoint.files) {
      const absolutePath = path.resolve(this.projectRoot, file.path);

      try {
        const content = await fs.readFile(absolutePath, "utf8");
        const currentHash = this.hashContent(content);

        if (currentHash !== file.hash) {
          issues.push(`${file.path}: content has changed`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          issues.push(`${file.path}: file no longer exists`);
        } else {
          issues.push(
            `${file.path}: error reading file - ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Prunes old checkpoints, keeping only the N most recent.
   * @returns Number of checkpoints deleted
   */
  pruneOldCheckpoints(keep_count: number): number {
    const sorted = this.listCheckpoints();
    let deleted = 0;

    if (sorted.length > keep_count) {
      const toDelete = sorted.slice(keep_count);
      for (const checkpoint of toDelete) {
        this.checkpoints.delete(checkpoint.id);
        deleted++;
      }
    }

    return deleted;
  }
}
