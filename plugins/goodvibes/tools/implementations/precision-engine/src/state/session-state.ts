/**
 * SessionState singleton - persists working directory across precision_exec calls.
 */

import * as path from 'path';
import { existsSync, realpathSync } from 'fs';
import { getConfigValue } from '../runtime-config.js';

/**
 * SessionState manages the persistent working directory state across precision_exec calls.
 * Singleton pattern ensures a single source of truth for the session's current directory.
 */
class SessionState {
  /** Singleton instance holder */
  private static instance: SessionState;
  
  /** Current working directory for the session */
  private _cwd: string = process.cwd();

  /** Private constructor enforces singleton pattern */
  private constructor() {}

  /**
   * Get the singleton instance of SessionState.
   * Creates the instance on first call.
   * @returns The SessionState singleton instance
   */
  static getInstance(): SessionState {
    if (!SessionState.instance) {
      SessionState.instance = new SessionState();
    }
    return SessionState.instance;
  }

  /**
   * Get the current working directory for this session.
   * @returns The current working directory path
   */
  get cwd(): string {
    return this._cwd;
  }

  /**
   * Set the current working directory.
   * Resolves relative paths against current cwd.
   * Only updates if the resolved path exists and is within sandbox boundaries.
   * 
   * Silently returns (no-op) if:
   * - The resolved path does not exist
   * - The path is outside sandbox boundaries (when sandbox is enabled)
   * - Symlink resolution fails (e.g., permission denied, ELOOP)
   * 
   * @param newCwd The new working directory path (absolute or relative)
   */
  setCwd(newCwd: string): void {
    const resolved = path.resolve(this._cwd, newCwd);
    
    // Check if path exists
    if (!existsSync(resolved)) {
      return;
    }
    
    // Resolve symlinks to get the real path
    try {
      const realPath = realpathSync(resolved);
      const sandboxEnabled = getConfigValue<boolean>('sandbox');
      
      // Enforce sandbox boundary if sandbox is enabled
      // Sandbox is only enabled when explicitly true (getConfigValue coerces strings at source)
      if (sandboxEnabled === true) {
        const projectRoot = process.cwd();
        const normalizedReal = path.normalize(realPath);
        const normalizedRoot = path.normalize(projectRoot);
        
        // Append path.sep to prevent prefix collision (e.g., /project vs /project-other)
        // This matches the pattern in discover.ts validateBasePath()
        const rootWithSep = normalizedRoot.endsWith(path.sep)
          ? normalizedRoot
          : normalizedRoot + path.sep;
        
        // Check if real path is within sandbox
        if (normalizedReal !== normalizedRoot && !normalizedReal.startsWith(rootWithSep)) {
          // Path is outside sandbox - reject
          return;
        }
      }
      
      this._cwd = realPath;
    } catch {
      // If realpathSync fails (e.g., EACCES permission denied, ELOOP symlink loop), don't update
      return;
    }
  }

  /**
   * Reset the session working directory to the process working directory.
   * Useful for testing or restoring default state.
   */
  reset(): void {
    this._cwd = process.cwd();
  }
}

/**
 * Singleton instance of SessionState for managing persistent working directory.
 * Use this export to access the session state across the application.
 */
export const sessionState = SessionState.getInstance();
