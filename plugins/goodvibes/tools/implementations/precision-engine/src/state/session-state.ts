/**
 * SessionState singleton - persists working directory across precision_exec calls.
 */

import * as path from 'path';
import { existsSync, realpathSync } from 'fs';
import { getConfigValue } from '../runtime-config.js';

class SessionState {
  private static instance: SessionState;
  private _cwd: string = process.cwd();

  private constructor() {}

  static getInstance(): SessionState {
    if (!SessionState.instance) {
      SessionState.instance = new SessionState();
    }
    return SessionState.instance;
  }

  get cwd(): string {
    return this._cwd;
  }

  /**
   * Set the current working directory.
   * Resolves relative paths against current cwd.
   * Only updates if the resolved path exists and is within sandbox boundaries.
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
      if (sandboxEnabled !== false) {
        const projectRoot = process.cwd();
        const normalizedReal = path.normalize(realPath);
        const normalizedRoot = path.normalize(projectRoot);
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
      // If realpathSync fails (e.g., permission denied), don't update
      return;
    }
  }

  /**
   * Reset to process.cwd().
   */
  reset(): void {
    this._cwd = process.cwd();
  }
}

export const sessionState = SessionState.getInstance();
