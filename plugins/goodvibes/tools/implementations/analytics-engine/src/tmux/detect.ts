import { execSync } from 'node:child_process';

// === tmux Detection ===

/**
 * Describes the result of probing the current tmux environment.
 */
export interface TmuxDetection {
  /** True when the tmux binary is present on PATH. */
  available: boolean;
  /** True when the current process is running inside a tmux session. */
  inSession: boolean;
  /** The version string returned by `tmux -V`, or null on failure. */
  version: string | null;
  /** The name of the current tmux session, or null when not in a session. */
  sessionName: string | null;
}

/**
 * The fallback rendering mode to use when tmux pane display is unavailable.
 *
 * - `'file'`     — write output to a file on disk.
 * - `'terminal'` — write output to the current terminal (stdout).
 * - `'none'`     — no fallback; skip display entirely.
 */
export type FallbackMode = 'file' | 'terminal' | 'none';

// Module-level cache — tmux state is stable within a process lifetime.
let _cachedDetection: TmuxDetection | null = null;

/**
 * Probe the tmux environment and return detection results.
 *
 * Results are cached after the first call: subsequent calls are free.
 * All subprocess invocations are wrapped in try/catch and will never throw.
 */
export function detectTmux(): TmuxDetection {
  if (_cachedDetection !== null) {
    return _cachedDetection;
  }

  const inSession = Boolean(process.env['TMUX']);

  let available = false;
  let version: string | null = null;
  let sessionName: string | null = null;

  // Check for tmux binary on PATH.
  try {
    execSync('which tmux', { stdio: 'pipe' });
    available = true;
  } catch {
    // Binary not found — leave available as false.
  }

  // Retrieve version string only when binary is available.
  if (available) {
    try {
      const raw = execSync('tmux -V', { stdio: 'pipe', encoding: 'utf-8' });
      version = raw.trim();
    } catch {
      // Version probe failed — leave version as null.
    }
  }

  // Retrieve session name only when actually inside a session.
  if (inSession) {
    try {
      const raw = execSync("tmux display-message -p '#S'", {
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      const name = raw.trim();
      if (name.length > 0) {
        sessionName = name;
      }
    } catch {
      // Session name probe failed — leave sessionName as null.
    }
  }

  _cachedDetection = { available, inSession, version, sessionName };
  return _cachedDetection;
}

/**
 * Determine the appropriate fallback rendering mode based on the current
 * tmux environment.
 *
 * Decision table:
 * - In a tmux session                  → pane mode is available; no fallback needed (`'none'`)
 * - tmux available but not in session  → `'none'` (launching a pane is not meaningful)
 * - tmux unavailable                   → `'file'` (write output to disk)
 */
export function getFallbackMode(): FallbackMode {
  const { available, inSession } = detectTmux();

  if (inSession) {
    // Pane mode is the primary path; a fallback is not required.
    return 'none';
  }

  if (available) {
    // tmux exists but we're not inside a session — can't split panes.
    return 'none';
  }

  // No tmux at all — degrade to file-based output.
  return 'file';
}
