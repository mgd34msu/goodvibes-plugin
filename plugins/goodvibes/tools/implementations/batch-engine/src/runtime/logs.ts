/**
 * Logs Manager implementation for Batch Engine
 * @see SPEC-v2 Section 14.2.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Logs directory and file paths
 */
export const LOGS_PATHS = {
  LOGS_DIR: '.goodvibes/logs',
  JUSTVIBES_LOG: '.goodvibes/logs/justvibes-log.md',
  JUSTVIBES_ERRORS: '.goodvibes/logs/justvibes-errors.md',
  ACTIVITY_LOG: '.goodvibes/logs/activity.log',
  DECISIONS_LOG: '.goodvibes/logs/decisions.log',
} as const;

export type LogsPath = typeof LOGS_PATHS[keyof typeof LOGS_PATHS];

/**
 * Logs Manager interface
 */
export interface LogsManager {
  /**
   * Ensure logs directory exists
   */
  ensureLogsDir(): Promise<void>;

  /**
   * Initialize all log files
   */
  initialize(): Promise<void>;

  /**
   * Append to justvibes log
   */
  appendJustvibesLog(message: string): Promise<void>;

  /**
   * Append to justvibes errors log
   */
  appendJustvibesError(error: string): Promise<void>;

  /**
   * Append to activity log
   */
  appendActivity(activity: string): Promise<void>;

  /**
   * Append to decisions log
   */
  appendDecision(decision: string): Promise<void>;

  /**
   * Read a log file
   */
  readLog(logPath: LogsPath): Promise<string>;

  /**
   * Clear a log file
   */
  clearLog(logPath: LogsPath): Promise<void>;
}

/**
 * LogsManager implementation
 */
export class LogsManagerImpl implements LogsManager {
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  async ensureLogsDir(): Promise<void> {
    const absPath = this.getAbsolutePath(LOGS_PATHS.LOGS_DIR);
    try {
      await fs.mkdir(absPath, { recursive: true });
    } catch {
      // Directory may already exist
    }
  }

  async initialize(): Promise<void> {
    await this.ensureLogsDir();

    // Create all log files if they don't exist
    const logFiles = [
      { path: LOGS_PATHS.JUSTVIBES_LOG, content: '# JustVibes Activity Log\n\n' },
      { path: LOGS_PATHS.JUSTVIBES_ERRORS, content: '# JustVibes Errors Log\n\n' },
      { path: LOGS_PATHS.ACTIVITY_LOG, content: '' },
      { path: LOGS_PATHS.DECISIONS_LOG, content: '' },
    ];

    for (const logFile of logFiles) {
      const absPath = this.getAbsolutePath(logFile.path);
      try {
        await fs.access(absPath);
        // File exists, don't overwrite
      } catch {
        // File doesn't exist, create it
        await fs.writeFile(absPath, logFile.content, 'utf-8');
      }
    }
  }

  async appendJustvibesLog(message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `## ${timestamp}\n\n${message}\n\n---\n\n`;
    await this.appendToFile(LOGS_PATHS.JUSTVIBES_LOG, logEntry);
  }

  async appendJustvibesError(error: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `## ${timestamp}\n\n${error}\n\n---\n\n`;
    await this.appendToFile(LOGS_PATHS.JUSTVIBES_ERRORS, logEntry);
  }

  async appendActivity(activity: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${activity}\n`;
    await this.appendToFile(LOGS_PATHS.ACTIVITY_LOG, logEntry);
  }

  async appendDecision(decision: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${decision}\n`;
    await this.appendToFile(LOGS_PATHS.DECISIONS_LOG, logEntry);
  }

  async readLog(logPath: LogsPath): Promise<string> {
    const absPath = this.getAbsolutePath(logPath);
    try {
      return await fs.readFile(absPath, 'utf-8');
    } catch {
      return '';
    }
  }

  async clearLog(logPath: LogsPath): Promise<void> {
    const absPath = this.getAbsolutePath(logPath);
    let initialContent = '';

    // Preserve headers for markdown files
    if (logPath === LOGS_PATHS.JUSTVIBES_LOG) {
      initialContent = '# JustVibes Activity Log\n\n';
    } else if (logPath === LOGS_PATHS.JUSTVIBES_ERRORS) {
      initialContent = '# JustVibes Errors Log\n\n';
    }

    await fs.writeFile(absPath, initialContent, 'utf-8');
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  private getAbsolutePath(relativePath: string): string {
    return path.join(this.projectRoot, relativePath);
  }

  private async appendToFile(relativePath: LogsPath, content: string): Promise<void> {
    const absPath = this.getAbsolutePath(relativePath);
    try {
      await fs.appendFile(absPath, content, 'utf-8');
    } catch {
      // If file doesn't exist, create it with the content
      await this.initialize();
      await fs.appendFile(absPath, content, 'utf-8');
    }
  }
}

/**
 * Create a new LogsManager instance
 */
export function createLogsManager(projectRoot?: string): LogsManager {
  return new LogsManagerImpl(projectRoot);
}

/**
 * Singleton logs manager instance
 */
let globalLogsManager: LogsManager | null = null;

/**
 * Get the global LogsManager instance
 */
export function getLogsManager(projectRoot?: string): LogsManager {
  if (!globalLogsManager) {
    globalLogsManager = createLogsManager(projectRoot);
  }
  return globalLogsManager;
}

/**
 * Reset the global LogsManager (useful for testing)
 */
export function resetGlobalLogsManager(): void {
  globalLogsManager = null;
}
