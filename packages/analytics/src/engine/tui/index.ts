/**
 * TUI barrel export — the always-on mini dashboard plus pure helpers.
 *
 * The full interactive ink/React dashboard (`tui/full/**`) is deferred in the
 * v2 alpha (no `@types/react` in the workspace, no install permitted for this
 * lane), so it is not re-exported here.
 */
export * as mini from './mini/index.js';
export { trendColor } from './trend-colors.js';
