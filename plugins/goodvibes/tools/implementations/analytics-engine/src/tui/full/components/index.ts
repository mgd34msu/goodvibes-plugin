/**
 * Barrel export for all full TUI dashboard components.
 *
 * Import from this module to access all reusable Ink components used across
 * the three pages of the analytics-engine full TUI dashboard.
 *
 * @module
 */

export { MetricBox } from './metric-box.js';
export type { MetricBoxProps, MetricRow } from './metric-box.js';

export { BarChart } from './bar-chart.js';
export type { BarChartProps, BarChartItem } from './bar-chart.js';

export { Table } from './table.js';
export type { TableProps } from './table.js';

export { TimelineFeed } from './timeline-feed.js';
export type { TimelineFeedProps } from './timeline-feed.js';

export { Heatmap } from './heatmap.js';
export type { HeatmapProps } from './heatmap.js';

export { TrendLine } from './trend-line.js';
export type { TrendLineProps } from './trend-line.js';
