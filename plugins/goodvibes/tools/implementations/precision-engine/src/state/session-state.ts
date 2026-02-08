/**
 * SessionState singleton - persists working directory across precision_exec calls.
 */

import * as path from 'path';
import { existsSync } from 'fs';

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
   * Only updates if the resolved path exists.
   */
  setCwd(newCwd: string): void {
    const resolved = path.resolve(this._cwd, newCwd);
    if (existsSync(resolved)) {
      this._cwd = resolved;
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
