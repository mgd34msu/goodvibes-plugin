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

/** Get the current terminal width, with a minimum floor. */
function getTerminalWidth(): number {
  return Math.max(MIN_WIDTH, process.stdout.columns || DEFAULT_WIDTH);
}

/**
 * Compute the visible length of a string, stripping ANSI escape sequences.
 * Used to pad lines to exact terminal width.
 */
function visibleLength(str: string): number {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/**
 * Pad/truncate a string to exactly `width` visible characters.
 * If the string is shorter, pad with spaces on the right.
 * If longer, truncate (stripping trailing ANSI reset first, then re-appending).
 */
function fitToWidth(str: string, width: number): string {
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
 * Compact 4-line, auto-width ANSI mini dashboard renderer.
 *
 * @example
 * const renderer = new MiniRenderer();
 * const output = renderer.render(state);
 * process.stdout.write(output);
 */
export class MiniRenderer {
  private loopHandle: ReturnType<typeof setInterval> | null = null;

  /** Create a new MiniRenderer. Zero-config — width auto-detects from terminal. */
  constructor() {}

  /**
   * Render the mini dashboard to a 4-line ANSI string.
   * Reads process.stdout.columns on each call for auto-width sizing.
   *
   * @param state - Current aggregated dashboard state
   * @returns 4-line string with ANSI color codes
   */
  render(state: DashboardState): string {
    const health = determineHealth(state);
    const borderColor = colorForHealth(health);
    const w = getTerminalWidth();
    const innerWidth = w - 2;

    // ── Derived values ────────────────────────────────────────────────────────
    const sessionId = state.session_id
      ? truncate(state.session_id, 16)
      : 'no-session';
    const uptime = formatUptime(state.uptime_ms);
    // Use tool call count if available via commands + agents
    const toolCalls = formatNumber(
      state.metrics.commands.total +
      state.metrics.agents.spawned,
    );
    const successRate = formatPercent(state.metrics.commands.success_rate);

    const tokensUsed = formatNumber(state.metrics.tokens.total);
    const tokensSaved = formatNumber(state.metrics.tokens.saved);
    const savings = formatDollars(state.metrics.cost.saved);
    const cacheRate = formatPercent(state.metrics.cache.hit_rate);
    const agentsActive = state.metrics.agents.active;
    const agentsMax = state.metrics.agents.max_concurrent;

    const filesRead = formatNumber(state.metrics.files.unique_read);
    const filesWritten = formatNumber(
      state.metrics.files.modified + state.metrics.files.created,
    );
    const conflicts = state.metrics.files.conflicts;
    const cmdTotal = formatNumber(state.metrics.commands.total);
    const cmdFails = formatNumber(state.metrics.commands.failures);
    const cmdAvgSec = state.metrics.commands.avg_duration_ms > 0
      ? (state.metrics.commands.avg_duration_ms / 1000).toFixed(1)
      : '0.0';
    const netCost = formatDollars(
      state.metrics.cost.total - state.metrics.cost.saved,
    );

    // ── Line 1: Header ────────────────────────────────────────────────────────
    // Budget header or standard header
    let headerContent: string;
    if (state.budget !== null) {
      const b = state.budget;
      const budgetUsed = formatDollars(b.used);
      const budgetTotal = formatDollars(b.amount);
      const budgetPct = b.percentage.toFixed(0);
      headerContent =
        ` analytics ${ansi.dim}─${ansi.reset} ${sessionId} ${ansi.dim}─${ansi.reset}` +
        ` ${uptime} ${ansi.dim}─${ansi.reset}` +
        ` budget: ${budgetUsed}/${budgetTotal} (${budgetPct}%) `;
    } else {
      headerContent =
        ` analytics ${ansi.dim}─${ansi.reset} ${sessionId} ${ansi.dim}─${ansi.reset}` +
        ` ${uptime} ${ansi.dim}─${ansi.reset}` +
        ` ${toolCalls} calls ${ansi.dim}─${ansi.reset} ${successRate} `;
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
    const row2Content =
      ` tokens ${ansi.bold}${tokensUsed}${ansi.reset} used` +
      `  ${ansi.dim}│${ansi.reset}` +
      `  ${tokensSaved} saved (${savings})` +
      `  ${ansi.dim}│${ansi.reset}` +
      `  cache ${cacheRate}` +
      `  ${ansi.dim}│${ansi.reset}` +
      `  agents ${agentsActive}/${agentsMax} `;
    const line2 = buildRow(row2Content, borderColor, w);

    // ── Line 3: Files / commands / net cost ───────────────────────────────────
    const conflictStr = conflicts > 0
      ? `${ansi.yellow}${conflicts}\u26a1${ansi.reset}`  // ⚡ highlighted
      : `${conflicts}\u26a1`;
    const row3Content =
      ` files ${filesRead}r ${filesWritten}w ${conflictStr}` +
      ` ${ansi.dim}│${ansi.reset}` +
      ` cmds ${cmdTotal} (${cmdFails}\u2717 ${cmdAvgSec}s avg)` +  // ✗
      ` ${ansi.dim}│${ansi.reset}` +
      ` cost ${netCost} `;
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
      const state = getState();
      const output = this.render(state);
      // Move cursor to top-left, clear screen, write 4 lines
      process.stdout.write('\x1b[H\x1b[2J' + output + '\n');
    };

    // Draw immediately, then on interval
    draw();
    this.loopHandle = setInterval(draw, intervalMs);
  }

  /**
   * Stop the render loop.
   * Safe to call even if the loop is not running.
   */
  stopLoop(): void {
    if (this.loopHandle !== null) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
  }
}
