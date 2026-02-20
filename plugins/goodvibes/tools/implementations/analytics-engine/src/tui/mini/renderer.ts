/**
 * Mini dashboard renderer — 4-line, auto-width ANSI box.
 *
 * Renders a compact analytics summary using raw ANSI escape codes.
 * Designed to run in a tmux pane refreshing every 2 seconds.
 * Auto-detects terminal width on each render tick.
 *
 * Layout:
 *   Line 1 (header): session ID, uptime, call count, success rate (or budget)
 *   Line 2: token usage, saved tokens (with dollar savings), cache rate, agent concurrency
 *   Line 3: file ops, command stats, net cost
 *   Line 4 (footer): bottom border
 */

import type { DashboardState } from '../../types.js';
import {
  ansi,
  colorForHealth,
  formatNumber,
  formatPercent,
  formatUptime,
  formatDollars,
  truncate,
} from './format.js';

/** Minimum width of the rendered box (characters). */
const MIN_WIDTH = 60;

/** Fallback terminal width when process.stdout.columns is unavailable. */
const DEFAULT_WIDTH = 80;

/** Maximum visible length of a session ID in the header. */
const SESSION_ID_TRUNCATE_LENGTH = 16;

/** Get the current terminal width, with a minimum floor. */
function getTerminalWidth(): number {
  const cols = process.stdout?.columns;
  return Math.max(MIN_WIDTH, (cols != null && cols > 0 ? cols : DEFAULT_WIDTH));
}

/**
 * Compute the visible length of a string, stripping ANSI escape sequences.
 * Used to pad lines to exact terminal width.
 */
function visibleLength(str: string): number {
  if (str == null) return 0;
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/**
 * Pad/truncate a string to exactly `width` visible characters.
 * If the string is shorter, pad with spaces on the right.
 * If longer, truncate (stripping trailing ANSI reset first, then re-appending).
 */
function fitToWidth(str: string, width: number): string {
  if (width <= 0) return '';
  const visible = visibleLength(str);
  if (visible === width) return str;
  if (visible < width) return str + ' '.repeat(width - visible);
  // Need to truncate — strip content to fit, preserving leading color code
  // Simple approach: truncate raw string chars to keep visible length == width
  let count = 0;
  let i = 0;
  const result: string[] = [];
  while (i < str.length && count < width) {
    if (str[i] === '\x1b' && str[i + 1] === '[') {
      // consume escape sequence
      const start = i;
      i += 2;
      while (i < str.length && str[i] !== 'm') i++;
      i++; // consume 'm'
      result.push(str.slice(start, i));
    } else {
      result.push(str[i]!);
      count++;
      i++;
    }
  }
  result.push(ansi.reset);
  return result.join('');
}

/**
 * Join content sections with a dim vertical separator and consistent spacing.
 * Each section is trimmed of leading/trailing spaces; the helper adds spacing
 * and the dim │ separator between them.
 */
function buildSections(sections: string[]): string {
  return sections
    .map((s, i) => (i === 0 ? ` ${s}` : `  ${ansi.dim}│${ansi.reset}  ${s}`))
    .join('') + ' ';
}

/**
 * Build a single row for the box interior.
 * Format: "│ {content padded to width-2} │"
 * The border chars use the active health color.
 */
function buildRow(content: string, borderColor: string, width: number): string {
  const innerWidth = width - 2; // subtract the two │ chars
  const inner = fitToWidth(content, innerWidth);
  return `${borderColor}${ansi.box.vertical}${ansi.reset}${inner}${borderColor}${ansi.box.vertical}${ansi.reset}`;
}

/**
 * Determine the health status from DashboardState.
 * Uses the pre-computed health_status field; anomalies and budget may escalate.
 */
function determineHealth(
  state: DashboardState,
): 'healthy' | 'warning' | 'alert' {
  return state.health_status;
}

/**
 * Derived metrics object computed from raw DashboardState.
 * Separates data derivation from rendering logic.
 */
interface ComputedMetrics {
  sessionId: string;
  uptime: string;
  toolCalls: string;
  successRate: string;
  tokensUsed: string;
  tokensSaved: string;
  savings: string;
  cacheRate: string;
  agentsActive: number;
  agentsMax: number;
  filesRead: string;
  filesWritten: string;
  conflicts: number;
  cmdTotal: string;
  cmdFails: string;
  cmdAvgSec: string;
  netCost: string;
}

/**
 * Extract and format all derived metric values from the dashboard state.
 * Handles null-safe access and guards numeric edge cases (NaN, Infinity).
 */
function computeMetrics(state: DashboardState): ComputedMetrics {
  const metrics = state.metrics;
  const tokens = metrics.tokens;
  const cost = metrics.cost;
  const cache = metrics.cache;
  const agents = metrics.agents;
  const files = metrics.files;
  const commands = metrics.commands;

  const sessionId = state.session_id
    ? truncate(state.session_id, SESSION_ID_TRUNCATE_LENGTH)
    : 'no-session';

  const uptime = formatUptime(state.uptime_ms);

  const toolCalls = formatNumber(
    (commands.total ?? 0) + (agents.spawned ?? 0),
  );

  const successRate = formatPercent(commands.success_rate ?? 0);
  const tokensUsed = formatNumber(tokens.total ?? 0);
  const tokensSaved = formatNumber(tokens.saved ?? 0);
  const savings = formatDollars(cost.saved ?? 0);
  const cacheRate = formatPercent(cache.hit_rate ?? 0);
  const agentsActive = agents.active ?? 0;
  const agentsMax = agents.max_concurrent ?? 0;

  const filesRead = formatNumber(files.unique_read ?? 0);
  const filesWritten = formatNumber(
    (files.modified ?? 0) + (files.created ?? 0),
  );
  const conflicts = files.conflicts ?? 0;

  const cmdTotal = formatNumber(commands.total ?? 0);
  const cmdFails = formatNumber(commands.failures ?? 0);

  const rawAvgMs = commands.avg_duration_ms;
  const cmdAvgSec =
    rawAvgMs != null && isFinite(rawAvgMs) && rawAvgMs > 0
      ? (rawAvgMs / 1000).toFixed(1)
      : '0.0';

  const rawNet = (cost.total ?? 0) - (cost.saved ?? 0);
  const netCost = formatDollars(isFinite(rawNet) ? rawNet : 0);

  return {
    sessionId,
    uptime,
    toolCalls,
    successRate,
    tokensUsed,
    tokensSaved,
    savings,
    cacheRate,
    agentsActive,
    agentsMax,
    filesRead,
    filesWritten,
    conflicts,
    cmdTotal,
    cmdFails,
    cmdAvgSec,
    netCost,
  };
}

/**
 * Validate that a DashboardState has the minimum fields required for rendering.
 * Returns true if the state is safe to render, false if malformed.
 */
function isValidState(state: unknown): state is DashboardState {
  if (state == null || typeof state !== 'object') return false;
  const s = state as Record<string, unknown>;
  if (typeof s['health_status'] !== 'string') return false;
  if (s['metrics'] == null || typeof s['metrics'] !== 'object') return false;
  const m = s['metrics'] as Record<string, unknown>;
  return (
    m['tokens'] != null &&
    m['cost'] != null &&
    m['cache'] != null &&
    m['agents'] != null &&
    m['files'] != null &&
    m['commands'] != null
  );
}

/**
 * Render a minimal "no data" fallback box when state is malformed or unavailable.
 */
function renderFallback(width: number): string {
  const borderColor = colorForHealth('warning');
  const innerWidth = width - 2;
  const msg = ' no data — dashboard state unavailable';
  const line1 = `${borderColor}${ansi.box.topLeft}${ansi.box.horizontal.repeat(innerWidth)}${ansi.box.topRight}${ansi.reset}`;
  const line2 = buildRow(msg, borderColor, width);
  const line3 = buildRow('', borderColor, width);
  const line4 = `${borderColor}${ansi.box.bottomLeft}${ansi.box.horizontal.repeat(innerWidth)}${ansi.box.bottomRight}${ansi.reset}`;
  return [line1, line2, line3, line4].join('\n');
}

/**
 * Compact 4-line, auto-width ANSI mini dashboard renderer.
 *
 * @example
 * const renderer = new MiniRenderer();
 * const output = renderer.render(state);
 * process.stdout.write(output);
 */
export class MiniRenderer {
  private loopHandle: ReturnType<typeof setInterval> | null = null;
  private resizeHandler: (() => void) | null = null;

  /** Create a new MiniRenderer. Zero-config — width auto-detects from terminal. */
  constructor() {}

  /**
   * Render the mini dashboard to a 4-line ANSI string.
   * Reads process.stdout.columns on each call for auto-width sizing.
   * Returns a fallback "no data" box if state is malformed.
   *
   * @param state - Current aggregated dashboard state
   * @returns 4-line string with ANSI color codes
   */
  render(state: DashboardState): string {
    const w = getTerminalWidth();

    if (!isValidState(state)) {
      return renderFallback(w);
    }

    const health = determineHealth(state);
    const borderColor = colorForHealth(health);
    const innerWidth = w - 2;

    // ── Derived values ────────────────────────────────────────────────────────
    const m = computeMetrics(state);

    // ── Line 1: Header ────────────────────────────────────────────────────────
    // Budget header or standard header
    let headerContent: string;
    if (state.budget !== null) {
      const b = state.budget;
      const budgetUsed = formatDollars(b.used ?? 0);
      const budgetTotal = formatDollars(b.amount ?? 0);
      const rawPct = b.percentage;
      const budgetPct = rawPct != null && isFinite(rawPct) ? rawPct.toFixed(0) : '?';
      headerContent =
        ` analytics ${ansi.dim}─${ansi.reset} ${m.sessionId} ${ansi.dim}─${ansi.reset}` +
        ` ${m.uptime} ${ansi.dim}─${ansi.reset}` +
        ` budget: ${budgetUsed}/${budgetTotal} (${budgetPct}%) `;
    } else {
      headerContent =
        ` analytics ${ansi.dim}─${ansi.reset} ${m.sessionId} ${ansi.dim}─${ansi.reset}` +
        ` ${m.uptime} ${ansi.dim}─${ansi.reset}` +
        ` ${m.toolCalls} calls ${ansi.dim}─${ansi.reset} ${m.successRate} `;
    }

    // Build the header line: ┌ {content} {filler dashes} ┐
    const headerVisible = visibleLength(headerContent);
    const dashCount = Math.max(0, innerWidth - headerVisible);
    const dashes = ansi.box.horizontal.repeat(dashCount);
    const line1 =
      `${borderColor}${ansi.box.topLeft}${ansi.reset}` +
      headerContent +
      `${borderColor}${dashes}${ansi.box.topRight}${ansi.reset}`;

    // ── Line 2: Tokens / cache / agents ───────────────────────────────────────
    const row2Content = buildSections([
      `tokens ${ansi.bold}${m.tokensUsed}${ansi.reset} used`,
      `${m.tokensSaved} saved (${m.savings})`,
      `cache ${m.cacheRate}`,
      `agents ${m.agentsActive}/${m.agentsMax}`,
    ]);
    const line2 = buildRow(row2Content, borderColor, w);

    // ── Line 3: Files / commands / net cost ───────────────────────────────────
    const conflictStr = m.conflicts > 0
      ? `${ansi.yellow}${m.conflicts}\u26a1${ansi.reset}`  // ⚡ highlighted
      : `${m.conflicts}\u26a1`;
    const row3Content = buildSections([
      `files ${m.filesRead}r ${m.filesWritten}w ${conflictStr}`,
      `cmds ${m.cmdTotal} (${m.cmdFails}\u2717 ${m.cmdAvgSec}s avg)`,  // ✗
      `cost ${m.netCost}`,
    ]);
    const line3 = buildRow(row3Content, borderColor, w);

    // ── Line 4: Footer ────────────────────────────────────────────────────────
    const footerDashes = ansi.box.horizontal.repeat(innerWidth);
    const line4 =
      `${borderColor}${ansi.box.bottomLeft}${footerDashes}${ansi.box.bottomRight}${ansi.reset}`;

    return [line1, line2, line3, line4].join('\n');
  }

  /**
   * Start the render loop.
   * Clears the terminal and re-renders on each interval tick.
   *
   * @param getState - Callback that returns the latest dashboard state
   * @param intervalMs - Refresh interval in milliseconds (default: 2000)
   */
  startLoop(
    getState: () => DashboardState,
    intervalMs: number = 2000,
  ): void {
    if (this.loopHandle !== null) {
      this.stopLoop();
    }

    const draw = (): void => {
      try {
        const state = getState();
        const output = this.render(state);
        // Move cursor to top-left, clear screen, write 4 lines
        process.stdout.write('\x1b[H\x1b[2J' + output);
      } catch {
        const w = getTerminalWidth();
        process.stdout.write('\x1b[H\x1b[2J' + renderFallback(w));
      }
    };

    // Draw immediately, then on interval
    draw();
    this.loopHandle = setInterval(draw, intervalMs);

    // Re-render immediately on terminal resize (SIGWINCH)
    this.resizeHandler = draw;
    process.stdout.on('resize', this.resizeHandler);
  }

  /**
   * Stop the render loop.
   * Safe to call even if the loop is not running.
   */
  stopLoop(): void {
    if (this.resizeHandler !== null) {
      process.stdout.removeListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.loopHandle !== null) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
  }
}
