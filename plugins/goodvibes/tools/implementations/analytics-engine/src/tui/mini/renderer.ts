/**
 * Mini dashboard renderer — 4-line, auto-width ANSI box (default pane height: 5 lines for margin).
 *
 * Renders a compact analytics summary using raw ANSI escape codes.
 * Designed to run in a tmux pane refreshing every 2 seconds.
 * Auto-detects terminal width on each render tick.
 * Border is always green.
 *
 * Layout:
 *   Line 1 (header): session ID (8 chars), uptime, session cost
 *   Line 2: context bar, API tokens (In/Out/CacheRead/CacheWrite), total cost
 *   Line 3: commands, files, agents, tokens saved, cache hit rate
 *   Line 4 (footer): bottom border
 */

import type { AnalyticsConfig, DashboardState } from '../../types.js';
import {
  ansi,
  colorForHealth,
  formatNumber,
  formatUptimeProgressive,
  formatDollars,
  formatTokensSaved,
} from './format.js';

/** Minimum width of the rendered box (characters). */
const MIN_WIDTH = 160;

/** Uniform fixed width for each section column in mini dashboard lines 2–3 (characters). */
const SECTION_WIDTH = 32;

/** Fallback terminal width when process.stdout.columns is unavailable. */
const DEFAULT_WIDTH = 80;

/** Maximum visible length of a session ID in the header. */
const SESSION_ID_LENGTH = 8;

/** Get the current terminal width, with a minimum floor. */
function getTerminalWidth(minWidth: number = MIN_WIDTH): number {
  const cols = process.stdout?.columns;
  return Math.max(minWidth, (cols != null && cols > 0 ? cols : DEFAULT_WIDTH));
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
    .map((s, i) => (i === 0 ? ` ${s}` : `  ${ansi.dim}${ansi.box.vertical}${ansi.reset}  ${s}`))
    .join('') + ' ';
}

/**
 * Build a single row for the box interior.
 * Format: "│ {content padded to width-2} │"
 * The border chars use the supplied border color.
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
 * Pad/truncate a section string to EXACTLY `width` visible characters.
 * Shorter content is padded with spaces; longer content is truncated via fitToWidth.
 * Enforces fixed-width columns so sections never expand or misalign.
 */
function padSection(content: string, width: number): string {
  const visible = visibleLength(content);
  if (visible === width) return content;
  if (visible < width) return content + ' '.repeat(width - visible);
  // Truncate to exact width — fitToWidth handles ANSI-aware truncation
  return fitToWidth(content, width);
}

/**
 * Derived metrics object computed from raw DashboardState.
 * Separates data derivation from rendering logic.
 */
interface ComputedMetrics {
  sessionId: string;
  uptime: string;
  sessionCost: string;
  contextPercent: number;
  contextPercentStr: string;
  // API-level token counts (from JSONL)
  apiInputTokens: string;
  apiOutputTokens: string;
  cacheReadTokens: string;
  cacheWriteTokens: string;
  // Precision tool token counts
  tokensSaved: string;
  agentsActive: number;
  agentsMax: number;
  filesRead: string;
  filesWritten: string;
  conflicts: number;
  cmdTotal: string;
  cmdFails: string;
  cmdAvgSec: string;
  cacheHitRate: string;
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
    ? state.session_id.slice(0, SESSION_ID_LENGTH)
    : 'no-session';

  const uptime = formatUptimeProgressive(state.uptime_ms);

  // Session cost in dollars (from cost metrics)
  const sessionCost = formatDollars(cost.total ?? 0);

  // API-level token counts from JSONL (api_input, api_output, cache_read, cache_write)
  const apiInputTokens = formatNumber(tokens.api_input ?? 0);
  const apiOutputTokens = formatNumber(tokens.api_output ?? 0);
  const cacheReadTokens = formatNumber(tokens.cache_read ?? 0);
  const cacheWriteTokens = formatNumber(tokens.cache_write ?? 0);

  // Precision tool token metrics
  const tokensSaved = formatNumber(tokens.saved ?? 0);
  const agentsActive = agents.active ?? 0;
  const agentsMax = agents.max_concurrent ?? 0;  // fallback from observed peak when configured max not available

  const filesRead = formatNumber(files.unique_read ?? 0);
  const filesWritten = formatNumber(
    (files.modified ?? 0) + (files.created ?? 0),
  );
  const conflicts = files.conflicts ?? 0;

  const cmdTotal = formatNumber(commands.total ?? 0);
  const cmdFails = formatNumber(commands.failures ?? 0);
  const rawAvgMs = commands.avg_duration_ms ?? 0;
  const cmdAvgSec = (rawAvgMs / 1000).toFixed(1);

  // Precision engine cache hit rate (one decimal place)
  const cacheHitRate = `${((cache.hit_rate ?? 0) * 100).toFixed(1)}%`;

  // Context window usage
  const rawCtx = state.context_percent ?? 0;
  const contextPercent = isFinite(rawCtx) ? Math.max(0, Math.min(100, rawCtx)) : 0;
  const contextPercentStr = contextPercent.toFixed(1);

  return {
    sessionId,
    uptime,
    sessionCost,
    contextPercent,
    contextPercentStr,
    apiInputTokens,
    apiOutputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    tokensSaved,
    agentsActive,
    agentsMax,
    filesRead,
    filesWritten,
    conflicts,
    cmdTotal,
    cmdFails,
    cmdAvgSec,
    cacheHitRate,
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
 * Render a colored progress bar: `[\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2591\u2591]`
 *
 * @param value - Current value
 * @param max - Maximum value
 * @param width - Bar width in characters (not counting brackets)
 * @param thresholds - Fraction thresholds `{ warn, alert }` (0–1 range, default 0.5/0.8)
 * @param invertColor - When true, LOW ratio = bad (red), HIGH = good (green). Default false.
 * @returns Bracketed bar string with ANSI color on the filled portion.
 */
function renderBar(
  value: number,
  max: number,
  width: number,
  options?: { thresholds?: { warn: number; alert: number }; invertColor?: boolean },
): string {
  const ratio = (max > 0 && isFinite(value) && isFinite(max))
    ? Math.max(0, Math.min(1, value / max))
    : 0;
  const filledCount = Math.round(ratio * width);
  const filled = '\u2588'.repeat(filledCount);
  const empty = '\u2591'.repeat(width - filledCount);

  const warn = options?.thresholds?.warn ?? 0.5;
  const alert = options?.thresholds?.alert ?? 0.8;
  const invert = options?.invertColor ?? false;

  let color: string;
  if (invert) {
    // High ratio = good (green); low = bad (red)
    color = ratio >= alert ? ansi.green : ratio >= warn ? ansi.yellow : ansi.red;
  } else {
    // High ratio = bad (red); low = good (green)
    color = ratio >= alert ? ansi.red : ratio >= warn ? ansi.yellow : ansi.green;
  }
  return `[${color}${filled}${ansi.reset}${empty}]`;
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
  private config: AnalyticsConfig | undefined;

  /** Create a new MiniRenderer. Optionally pass config for feature flags. */
  constructor(config?: AnalyticsConfig) {
    this.config = config;
  }

  /**
   * Render the mini dashboard to a 4-line ANSI string.
   * Reads process.stdout.columns on each call for auto-width sizing.
   * Returns a fallback "no data" box if state is malformed.
   *
   * @param state - Current aggregated dashboard state
   * @returns 4-line string with ANSI color codes
   */
  render(state: DashboardState): string {
    const minWidth = this.config?.mini_min_width ?? MIN_WIDTH;
    const sectionWidth = this.config?.mini_section_width ?? SECTION_WIDTH;
    const w = getTerminalWidth(minWidth);

    if (!isValidState(state)) {
      return renderFallback(w);
    }

    const borderColor = ansi.green;
    const innerWidth = w - 2;

    // ── Derived values ────────────────────────────────────────────────────────────
    const m = computeMetrics(state);

    // ── Line 1: Header — session ID, uptime, session cost ──────────────────────────
    const headerContent =
      ` GoodVibes Analytics ${ansi.dim}\u2500${ansi.reset} Session ID: ${m.sessionId} ${ansi.dim}\u2500${ansi.reset}` +
      ` Uptime: ${m.uptime} ${ansi.dim}\u2500${ansi.reset}` +
      ` ${ansi.bold}${m.sessionCost}${ansi.reset} `;

    // Build the header line: \u250c {content} {filler dashes} \u2510
    const headerVisible = visibleLength(headerContent);
    const dashCount = Math.max(0, innerWidth - headerVisible);
    const dashes = `${ansi.dim}${ansi.box.horizontal.repeat(dashCount)}${ansi.reset}`;
    const line1 =
      `${borderColor}${ansi.box.topLeft}${ansi.reset}` +
      headerContent +
      `${borderColor}${dashes}${ansi.box.topRight}${ansi.reset}`;

    // ── Line 2: Claude API metrics — context % (bar), tokens (4 sections), cost ────
    // Context percentage: color escalates green -> yellow -> red
    const ctxColor = m.contextPercent >= 80
      ? ansi.red
      : m.contextPercent >= 50
        ? ansi.yellow
        : ansi.green;

    // Context section: bar + percentage. Label = "Context: " (9 chars), percent = " XX.X%" (6 chars)
    const ctxLabel = 'Context: ';
    const ctxPercentDisplay = `${m.contextPercentStr}%`.padStart(6);
    const ctxBarWidth = Math.max(1, sectionWidth - ctxLabel.length - 2 - ctxPercentDisplay.length - 1);
    const ctxBar = renderBar(m.contextPercent, 100, ctxBarWidth, { thresholds: { warn: 0.5, alert: 0.8 } });
    const ctxSection = padSection(
      `${ctxLabel}${ctxBar} ${ctxColor}${ctxPercentDisplay}${ansi.reset}`,
      sectionWidth,
    );
    const apiInSection = padSection(
      `API Input: ${ansi.bold}${m.apiInputTokens}${ansi.reset}`,
      sectionWidth,
    );
    const apiOutSection = padSection(
      `API Output: ${ansi.bold}${m.apiOutputTokens}${ansi.reset}`,
      sectionWidth,
    );
    const cacheReadSection = padSection(
      `API Cache Read: ${m.cacheReadTokens}`,
      sectionWidth,
    );
    const cacheWriteSection = padSection(
      `API Cache Write: ${m.cacheWriteTokens}`,
      sectionWidth,
    );
    const costSection = padSection(
      `API Cost: ${m.sessionCost}`,
      sectionWidth,
    );

    const row2Content = buildSections([ctxSection, apiInSection, apiOutSection, cacheReadSection, cacheWriteSection, costSection]);
    const line2 = buildRow(row2Content, borderColor, w);

    // ── Line 3: Precision + Operations — cmds, files, agents, prec savings ────────
    const conflictStr = m.conflicts > 0
      ? `${ansi.yellow}${m.conflicts}\u26a1${ansi.reset}`  // \u26a1 highlighted
      : '';

    const configuredMax = Math.max(1, state.max_agent_chains ?? m.agentsMax);
    const agentCountDisplay = `${m.agentsActive}/${configuredMax}`;
    const agentLabel = 'Agents: ';
    const agentBarWidth = Math.max(1, sectionWidth - agentLabel.length - 2 - agentCountDisplay.length - 1);
    const agentBar = renderBar(
      m.agentsActive, configuredMax, agentBarWidth,
      { thresholds: { warn: 0.5, alert: 0.84 } },
    );

    const cmdsSection = padSection(
      `Commands: ${m.cmdTotal} (${m.cmdFails}\u2717 ${m.cmdAvgSec}s)`,
      sectionWidth,
    );
    const filesSection = padSection(
      conflictStr
        ? `Files: ${m.filesRead} reads ${m.filesWritten} writes ${conflictStr}`
        : `Files: ${m.filesRead} reads ${m.filesWritten} writes`,
      sectionWidth,
    );
    const agentsSection = padSection(
      `${agentLabel}${agentBar} ${agentCountDisplay}`,
      sectionWidth,
    );
    const tokensSavedSection = padSection(
      `GoodVibes - Tokens Saved: ${formatTokensSaved(state.metrics.tokens.saved ?? 0)}`,
      sectionWidth,
    );
    const cacheHitSection = padSection(
      `GoodVibes Cache Hit: ${m.cacheHitRate}`,
      sectionWidth,
    );

    const row3Content = buildSections([cmdsSection, filesSection, agentsSection, tokensSavedSection, cacheHitSection]);
    const line3 = buildRow(row3Content, borderColor, w);

    // ── Line 4: Footer ───────────────────────────────────────────────────────────
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[analytics-mini] render error: ${msg}\n`);
        const w = getTerminalWidth(this.config?.mini_min_width ?? MIN_WIDTH);
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
