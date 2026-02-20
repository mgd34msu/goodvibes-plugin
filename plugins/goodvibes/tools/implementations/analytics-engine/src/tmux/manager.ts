import { execFileSync } from 'node:child_process';
import type { TmuxConfig } from '../types.js';
import { detectTmux } from './detect.js';

// === tmux Pane Lifecycle Management ===

/**
 * Describes a managed tmux pane.
 */
export interface PaneInfo {
  /** The tmux pane identifier (e.g. `%3`). */
  paneId: string;
  /** Which slot this pane occupies. */
  target: 'mini' | 'full';
  /** PID of the process running inside the pane. */
  pid: number;
}

/** Map a position string to the tmux split-window direction flag arguments. */
function _positionFlags(position: TmuxConfig['mini_position']): string[] {
  switch (position) {
    case 'bottom': return ['-v'];
    case 'top':    return ['-v', '-b'];
    case 'right':  return ['-h'];
    case 'left':   return ['-h', '-b'];
    default: {
      const _exhaustive: never = position;
      throw new Error(`Unknown position: ${_exhaustive}`);
    }
  }
}

/**
 * Manages the lifecycle of analytics tmux panes (mini and full).
 *
 * Non-critical operations (close, resize, status) are wrapped in try/catch
 * and never throw. createPane throws when tmux is unavailable or pane
 * creation fails.
 */
export class TmuxManager {
  private readonly config: TmuxConfig;
  private readonly panes: Map<'mini' | 'full', PaneInfo>;

  /**
   * Create a new TmuxManager.
   *
   * @param config - The tmux configuration section from AnalyticsConfig.
   */
  constructor(config: TmuxConfig) {
    this.config = config;
    this.panes = new Map();
  }

  /**
   * Create a new tmux pane for the given target slot and start the supplied
   * command inside it.
   *
   * If the slot already has a live pane, it is closed before the new one is
   * opened. Returns a PaneInfo describing the newly created pane, or throws
   * if tmux is unavailable or pane creation fails.
   *
   * @param target  - Which slot to use: `'mini'` (status bar) or `'full'` (dashboard).
   * @param command - Shell command to run inside the pane.
   * @returns PaneInfo for the created pane.
   * @throws Error when tmux is not available or pane creation fails.
   */
  createPane(target: 'mini' | 'full', command: string): PaneInfo {
    const detection = detectTmux();
    if (!detection.inSession) {
      throw new Error(
        'TmuxManager.createPane: cannot create a pane outside of a tmux session.',
      );
    }

    // Tear down any existing pane in this slot before creating a new one.
    if (this.isPaneAlive(target)) {
      this.closePane(target);
    }

    const isMini = target === 'mini';
    const position = isMini ? this.config.mini_position : this.config.full_position;
    const size = isMini ? this.config.mini_pane_size : this.config.full_pane_size;
    const dirFlags = _positionFlags(position);

    // Validate size before use.
    const sizeStr = String(size);
    if (!/^\d+%?$/.test(sizeStr)) {
      throw new Error(
        `TmuxManager.createPane: invalid size value "${sizeStr}". Must match /^\\d+%?$/.`,
      );
    }

    // Split the current window and run the command. Wrap all three execFileSync
    // calls in a single try/catch so that if ID or PID capture fails after a
    // successful split, we attempt to kill the orphaned pane before throwing.
    try {
      // Split window and capture new pane's ID and PID in one shot.
      // -P prints pane info, -F sets the format string.
      const raw = execFileSync('tmux', [
        'split-window', ...dirFlags, '-l', sizeStr,
        '-P', '-F', '#{pane_id} #{pane_pid}',
        command,
      ], { stdio: 'pipe', encoding: 'utf-8' }).trim();

      const parts = raw.split(/\s+/);
      const rawId = parts[0] ?? '';
      const rawPid = parts[1] ?? '';

      // Validate pane ID format.
      if (!/^%\d+$/.test(rawId)) {
        throw new Error(
          `TmuxManager.createPane: unexpected pane ID format "${rawId}". Expected /^%\\d+$/.`,
        );
      }

      const pid = parseInt(rawPid, 10);
      if (Number.isNaN(pid)) {
        throw new Error(
          `TmuxManager.createPane: tmux returned non-numeric PID "${rawPid}" for pane ${rawId}.`,
        );
      }

      // split-window with -P doesn't switch focus, but ensure Claude Code
      // retains focus by selecting the previous pane.
      try {
        execFileSync('tmux', ['select-pane', '-t', '{last}'], { stdio: 'pipe' });
      } catch {
        // Best effort — focus may already be correct.
      }

      const paneInfo: PaneInfo = { paneId: rawId, target, pid };
      this.panes.set(target, paneInfo);
      return paneInfo;
    } catch (err) {
      // If something failed, try to clean up any orphaned pane.
      try {
        execFileSync('tmux', ['kill-pane', '-t', '{last}'], { stdio: 'pipe' });
      } catch {
        // Best-effort cleanup; original error is still thrown below.
      }
      throw err;
    }
  }

  /**
   * Close the pane for the given target slot.
   *
   * If the pane is no longer alive (e.g. the process exited) the internal
   * state is cleaned up without running `tmux kill-pane`. Failures during
   * teardown are logged but not re-thrown.
   *
   * @param target - Which slot to close: `'mini'` or `'full'`.
   */
  closePane(target: 'mini' | 'full'): void {
    const info = this.panes.get(target);
    if (!info) return;

    try {
      execFileSync('tmux', ['kill-pane', '-t', info.paneId], { stdio: 'pipe' });
    } catch (err) {
      // Pane may have already exited — best-effort teardown.
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[TmuxManager] warn: kill-pane ${info.paneId} failed: ${message}\n`,
      );
    }

    this.panes.delete(target);
  }

  /**
   * Close all managed panes.
   *
   * Equivalent to calling `closePane` for every active slot. Useful during
   * daemon shutdown to ensure no orphaned panes are left behind.
   */
  closeAll(): void {
    for (const target of (['mini', 'full'] as const)) {
      this.closePane(target);
    }
  }

  /**
   * Check whether the pane for a given target slot is still alive.
   *
   * The check is performed by listing all current panes in the session and
   * testing whether the tracked pane ID is present. Returns `false` when
   * there is no tracked pane or when the tmux command fails.
   *
   * @param target - Which slot to check: `'mini'` or `'full'`.
   * @returns `true` when the pane exists and is alive, otherwise `false`.
   */
  isPaneAlive(target: 'mini' | 'full'): boolean {
    const info = this.panes.get(target);
    if (!info) return false;

    try {
      const raw = execFileSync(
        'tmux',
        ['list-panes', '-F', '#{pane_id}'],
        { stdio: 'pipe', encoding: 'utf-8' },
      );
      const ids = raw.split('\n').map((l) => l.trim()).filter(Boolean);
      return ids.includes(info.paneId);
    } catch {
      // If list-panes fails, assume the pane is gone.
      return false;
    }
  }

  /**
   * Resize the pane for a given target slot.
   *
   * Uses `tmux resize-pane` with the `-x` flag for horizontal splits and
   * `-y` for vertical splits. If the pane is no longer alive the internal
   * state is cleaned up and the method returns early without error.
   * Failures are logged but never propagate.
   *
   * @param target - Which slot to resize: `'mini'` or `'full'`.
   * @param size   - New size in lines/columns (number) or a percentage string (e.g. `'40%'`).
   */
  resizePane(target: 'mini' | 'full', size: number | string): void {
    const info = this.panes.get(target);
    if (!info) return;

    // If the pane is no longer alive, clean up state and return early.
    if (!this.isPaneAlive(target)) {
      this.panes.delete(target);
      return;
    }

    const sizeStr = String(size);
    if (!/^\d+%?$/.test(sizeStr)) {
      process.stderr.write(
        `[TmuxManager] warn: resize-pane skipped — invalid size "${sizeStr}". Must match /^\\d+%?$/.\n`,
      );
      return;
    }

    const position =
      target === 'mini' ? this.config.mini_position : this.config.full_position;

    // Vertical splits (top/bottom) → resize rows (-y); horizontal → resize columns (-x).
    const flag =
      position === 'top' || position === 'bottom' ? '-y' : '-x';

    try {
      execFileSync(
        'tmux',
        ['resize-pane', '-t', info.paneId, flag, sizeStr],
        { stdio: 'pipe' },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[TmuxManager] warn: resize-pane ${info.paneId} failed: ${message}\n`,
      );
    }
  }

  /**
   * Return a snapshot of the currently tracked panes.
   *
   * Note that a pane listed here may no longer be alive if its process has
   * exited since the last `isPaneAlive` check. Call `isPaneAlive` to confirm.
   *
   * @returns An object with `mini` and `full` slots, each holding a `PaneInfo`
   *          or `null` when no pane is tracked for that slot.
   */
  getStatus(): { mini: PaneInfo | null; full: PaneInfo | null } {
    return {
      mini: this.panes.get('mini') ?? null,
      full: this.panes.get('full') ?? null,
    };
  }
}
