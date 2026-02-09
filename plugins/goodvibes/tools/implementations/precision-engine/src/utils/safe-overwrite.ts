/**
 * Safe overwrite utilities for precision_write - Item 9 implementation
 * 
 * Provides automatic backup and recovery for first-time overwrites.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { FileStateCache } from '../state/file-cache.js';
import { getBackupDir, getBackupGitCleanSkip, getSafeOverwrite } from '../runtime-config.js';

const GIT_TIMEOUT_MS = 5000;
const MAX_BACKUP_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export interface GitStatus {
  status: 'clean' | 'dirty' | 'staged' | 'untracked' | null;
  inRepo: boolean;
}

export interface SafeOverwriteResult {
  backupPath?: string;
  gitStatus: GitStatus;
  snapshotVersion?: number;
  warning?: string;
  recoverableVia?: string;
}

/**
 * Check git status for a specific file
 * Returns null if not in a git repo or git not available
 * @param filePath - Absolute path to the file to check
 * @returns GitStatus object indicating file status and repository state
 */
export async function checkGitStatus(filePath: string): Promise<GitStatus> {
  try {
    // Check if we're in a git repo
    const checkRepo = await new Promise<boolean>((resolve) => {
      const proc = spawn('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: path.dirname(filePath),
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      
      const timeout = setTimeout(() => {
        proc.kill();
        resolve(false);
      }, GIT_TIMEOUT_MS);
      
      let output = '';
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve(code === 0 && output.trim() === 'true');
      });
      
      proc.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
    
    if (!checkRepo) {
      return { status: null, inRepo: false };
    }
    
    // Get porcelain status for this specific file
    const status = await new Promise<string>((resolve) => {
      const proc = spawn('git', ['status', '--porcelain', '--', filePath], {
        cwd: path.dirname(filePath),
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      
      const timeout = setTimeout(() => {
        proc.kill();
        resolve('');
      }, GIT_TIMEOUT_MS);
      
      let output = '';
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      proc.on('close', () => {
        clearTimeout(timeout);
        resolve(output.trim());
      });
      
      proc.on('error', () => {
        clearTimeout(timeout);
        resolve('');
      });
    });
    
    if (!status) {
      // No output = committed and clean
      return { status: 'clean', inRepo: true };
    }
    
    // Parse porcelain status
    const statusCode = status.substring(0, 2);
    // Non-standard statuses (R=renamed, C=copied, U=conflict) default to 'dirty'
    // This is acceptable for safety purposes — the question is "do we need a backup?"
    
    if (statusCode.includes('?')) {
      return { status: 'untracked', inRepo: true };
    } else if (statusCode[0] !== ' ' && statusCode[0] !== '?') {
      return { status: 'staged', inRepo: true };
    } else {
      return { status: 'dirty', inRepo: true };
    }
  } catch {
    return { status: null, inRepo: false };
  }
}

/**
 * Generate backup path with timestamp
 * @param filePath - Absolute path to the file being backed up
 * @param workDir - Working directory for path resolution
 * @returns Absolute path to the backup file location
 */
export function generateBackupPath(filePath: string, workDir: string): string {
  const backupDir = getBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // Make the backup path relative to workDir
  const relativePath = path.isAbsolute(filePath)
    ? path.relative(workDir, filePath)
    : filePath;
  
  const backupFilePath = path.join(
    backupDir,
    `${relativePath}.${timestamp}.bak`
  );
  
  const resolvedBackup = path.resolve(workDir, backupFilePath);
  const resolvedBackupDir = path.resolve(workDir, getBackupDir());
  if (!resolvedBackup.startsWith(resolvedBackupDir + path.sep)) {
    throw new Error(`Backup path escapes backup directory: ${resolvedBackup}`);
  }
  return resolvedBackup;
}

/**
 * Create backup of existing file
 * @param filePath - Absolute path to the file to back up
 * @param backupPath - Absolute path where the backup will be created
 * @returns Promise that resolves when backup is complete
 */
export async function createBackup(
  filePath: string,
  backupPath: string
): Promise<void> {
  // Check file size before backup
  const stats = await fs.stat(filePath);
  if (stats.size > MAX_BACKUP_SIZE_BYTES) {
    // Skip backup for files > 50MB
    throw new Error('File too large for backup (>50MB)');
  }
  
  // Ensure backup directory exists
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  
  // Copy file to backup location
  await fs.copyFile(filePath, backupPath);
}

/**
 * Perform safe overwrite check and backup if needed
 * 
 * Returns SafeOverwriteResult with backup info and git status
 * @param filePath - Absolute path to the file being overwritten
 * @param workDir - Working directory for backup path resolution
 * @param fileExists - Whether the file currently exists
 * @returns SafeOverwriteResult containing backup info, git status, and warnings
 */
export async function performSafeOverwrite(
  filePath: string,
  workDir: string,
  fileExists: boolean
): Promise<SafeOverwriteResult> {
  const result: SafeOverwriteResult = {
    gitStatus: { status: null, inRepo: false },
  };
  
  // Check if safe overwrite is enabled
  if (!getSafeOverwrite()) {
    return result;
  }
  
  // Only applies to existing files
  if (!fileExists) {
    return result;
  }
  
  // Check if file has been read this session
  const cache = FileStateCache.getInstance();
  const entry = cache.getEntryInfo(filePath);
  
  if (entry) {
    // File has been read before - no first-time overwrite
    return result;
  }
  
  // Layer 1: Cache snapshot (always)
  try {
    const existingContent = await fs.readFile(filePath, 'utf-8');
    const updateResult = cache.update(
      filePath,
      existingContent,
      'pre_overwrite_snapshot',
      undefined,
      'Automatic snapshot before first overwrite'
    );
    result.snapshotVersion = updateResult.version;
  } catch (error) {
    const cacheMsg = `Failed to create cache snapshot: ${(error as Error).message}`;
    result.warning = result.warning ? `${result.warning}; ${cacheMsg}` : cacheMsg;
  }
  
  // Layer 2: Persistent backup (conditional on git status)
  const gitStatus = await checkGitStatus(filePath);
  result.gitStatus = gitStatus;
  
  const skipGitClean = getBackupGitCleanSkip();
  const needsBackup = 
    !gitStatus.inRepo || 
    gitStatus.status !== 'clean' || 
    !skipGitClean;
  
  if (needsBackup) {
    try {
      const backupPath = generateBackupPath(filePath, workDir);
      await createBackup(filePath, backupPath);
      result.backupPath = backupPath;
      const backupMsg = `First-time overwrite: backup created at ${backupPath}`;
      result.warning = result.warning ? `${result.warning}; ${backupMsg}` : backupMsg;
    } catch (error) {
      const backupMsg = `Failed to create backup: ${(error as Error).message}`;
      result.warning = result.warning ? `${result.warning}; ${backupMsg}` : backupMsg;
    }
  } else {
    result.recoverableVia = 'git checkout (file is committed and clean)';
  }
  
  return result;
}
