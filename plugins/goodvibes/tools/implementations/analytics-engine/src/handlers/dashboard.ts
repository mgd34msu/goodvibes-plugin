/**
 * analytics_dashboard handler — launch, stop, or check status of analytics TUI panes.
 *
 * Manages mini (4-line status bar) and full (3-page interactive) dashboard
 * tmux panes. A module-level TmuxManager singleton tracks live panes across
 * handler invocations so that start/stop/status are consistent.
 */

import { join } from 'node:path';
import type { AnalyticsDashboardInput } from '../schemas/tools.js';
import type { Aggregator } from '../daemon/aggregator.js';
import { TmuxManager } from '../tmux/manager.js';
import { getFallbackMode, detectTmux } from '../tmux/detect.js';
import { DEFAULT_CONFIG } from '../config.js';
import { type HandlerResponse, text } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Handler function signature for analytics_dashboard. */
export type DashboardHandler = (
  aggregator: Aggregator,
  input: AnalyticsDashboardInput,
) => Promise<HandlerResponse>;

// ─────────────────────────────────────────────────────────────────────────────
// Module-level singleton
// ─────────────────────────────────────────────────────────────────────────────

/** Lazily-created TmuxManager instance, shared across calls. */
let _manager: TmuxManager | null = null;

/**
 * Return the module-level TmuxManager, creating it with the default tmux
 * config on first access. The config tmux section can be overridden per-call
 * via the input options, but the manager itself is reused.
 */
function getManager(): TmuxManager {
  if (_manager === null) {
    _manager = new TmuxManager(DEFAULT_CONFIG.tmux);
  }
  return _manager;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an absolute path to the bundled dist script for the given target.
 * mini → node <dist>/mini.cjs, full → node <dist>/full.mjs
 */
function buildCommand(target: 'mini' | 'full'): string {
  // Resolve absolute path to the CJS dist file.
  // In CJS bundle (server.cjs), __dirname points to dist/.
  // Fallback: derive from PLUGIN_ROOT env var set in .mcp.json.
  let distDir: string;
  if (typeof __dirname !== 'undefined') {
    distDir = __dirname;
  } else {
    const pluginRoot = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || '';
    distDir = join(pluginRoot, 'tools', 'implementations', 'analytics-engine', 'dist');
  }
  const ext = target === 'full' ? 'mjs' : 'cjs';
  return `node "${join(distDir, `${target}.${ext}`)}"`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle the `analytics_dashboard` MCP tool.
 *
 * Actions:
 *   - start  — spawn mini/full panes via TmuxManager; fall back gracefully
 *              when tmux is unavailable.
 *   - stop   — kill tracked pane(s) and clear internal state.
 *   - status — report live / dead state for each target slot.
 *
 * @param _aggregator - Aggregator instance (unused for dashboard management;
 *                      included for consistent handler signature).
 * @param input       - Validated AnalyticsDashboardInput.
 * @returns MCP response with descriptive text.
 */
export const handleDashboard: DashboardHandler = async (
  _aggregator: Aggregator,
  input: AnalyticsDashboardInput,
): Promise<HandlerResponse> => {
  try {
    switch (input.action) {
      case 'start':
        return handleStart(input);
      case 'stop':
        return handleStop(input);
      case 'status':
        return handleStatus();
      default: {
        const _exhaustive: never = input.action;
        return text(`Unknown action: ${_exhaustive as string}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return text(`analytics_dashboard error: ${message}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Action handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start one or both dashboard panes.
 *
 * Checks tmux availability first. When unavailable, returns the fallback mode
 * so callers know the dashboard cannot be displayed as a pane.
 */
function handleStart(input: AnalyticsDashboardInput): HandlerResponse {
  const detection = detectTmux();
  if (!detection.inSession) {
    const fallback = getFallbackMode();
    const reason = !detection.available
      ? 'tmux is not available on PATH'
      : 'not running inside a tmux session';
    let fallbackMsg: string;
    if (fallback === 'file') {
      fallbackMsg = 'Analytics data is being written to disk; use analytics_query to read it.';
    } else if (fallback === 'terminal') {
      fallbackMsg = 'Use analytics_query to query metrics directly in the terminal.';
    } else {
      fallbackMsg = 'Dashboard display is not available in this environment.';
    }
    return text(
      `Cannot start dashboard pane: ${reason}.\n` +
      `Fallback mode: ${fallback}.\n` +
      fallbackMsg,
    );
  }

  const manager = getManager();
  const targets = resolveTargets(input.target);
  const lines: string[] = [];

  for (const target of targets) {
    try {
      const paneInfo = manager.createPane(target, buildCommand(target));
      lines.push(
        `Started ${target} dashboard in pane ${paneInfo.paneId} (PID ${paneInfo.pid}).`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lines.push(`Failed to start ${target} dashboard: ${message}`);
    }
  }

  return text(lines.join('\n'));
}

/**
 * Stop one or both dashboard panes.
 */
function handleStop(input: AnalyticsDashboardInput): HandlerResponse {
  const manager = getManager();
  const targets = resolveTargets(input.target);
  const lines: string[] = [];

  for (const target of targets) {
    const wasAlive = manager.isPaneAlive(target);
    manager.closePane(target);
    if (wasAlive) {
      lines.push(`Stopped ${target} dashboard.`);
    } else {
      lines.push(`${target} dashboard was not running.`);
    }
  }

  return text(lines.join('\n'));
}

/**
 * Report live/dead status for both slots.
 */
function handleStatus(): HandlerResponse {
  const detection = detectTmux();
  if (!detection.inSession) {
    const fallback = getFallbackMode();
    return text(
      `tmux status: not in a session (fallback mode: ${fallback}).\n` +
      'Dashboard panes are only available inside a tmux session.',
    );
  }

  const manager = getManager();
  const status = manager.getStatus();

  const lines: string[] = [
    `tmux session: ${detection.sessionName ?? 'unknown'} (${detection.version ?? 'version unknown'})`,
  ];

  for (const target of ['mini', 'full'] as const) {
    const info = status[target];
    if (info === null) {
      lines.push(`${target}: not running`);
    } else {
      const alive = manager.isPaneAlive(target);
      lines.push(
        `${target}: pane ${info.paneId}, PID ${info.pid} — ${alive ? 'alive' : 'dead (process exited)'}`,
      );
    }
  }

  return text(lines.join('\n'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the `target` field of the input to an array of concrete targets.
 */
function resolveTargets(target: AnalyticsDashboardInput['target']): Array<'mini' | 'full'> {
  switch (target) {
    case 'mini': return ['mini'];
    case 'full': return ['full'];
    case 'both': return ['mini', 'full'];
    default: {
      const _exhaustive: never = target;
      return [_exhaustive];
    }
  }
}
