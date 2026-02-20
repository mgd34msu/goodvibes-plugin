/**
 * Mini dashboard barrel export.
 * Re-exports the MiniRenderer and all format utilities for external consumers.
 */

export { MiniRenderer } from './renderer.js';
export {
  formatNumber,
  formatBytes,
  formatDuration,
  formatPercent,
  formatDollars,
  formatBar,
  formatTime,
  formatUptime,
  truncate,
  pad,
  ansi,
  BOX_CHARS,
  colorForHealth,
  formatDelta,
} from './format.js';
