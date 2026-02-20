import React from 'react';
import { Box, Text } from 'ink';

/**
 * Props for the TrendLine component.
 */
export interface TrendLineProps {
  /** Metric name displayed on the left. */
  label: string;
  /** Current formatted value string displayed on the right, e.g. "12,345" or "$0.14". */
  value: string;
  /** Trend indicator string, e.g. "+2.1%", "-0.5%", or "stable". */
  trend: string;
  /**
   * Normalised bar fill value in the range [0, 1].
   * A value of 0 renders an empty bar; 1 renders a full bar.
   * Values outside the range are clamped.
   */
  barValue: number;
  /** Total width of the component in terminal columns. Defaults to 50. */
  width?: number;
}

/** Column widths for the fixed layout regions. */
const LABEL_COL = 18;
const VALUE_COL = 10;
const TREND_COL = 10;
const SEPARATOR = 3; // " | " separator between value and trend
const PADDING = 4; // two 2-space gaps ("  " before bar and "  " after bar)

/** Character used for the filled portion of the sparkline bar. */
const FILL_CHAR = '█';
/** Character used for the empty portion of the sparkline bar. */
const EMPTY_CHAR = '░';

/** Determine colour based on a trend string. */
function trendColor(trend: string): string {
  if (trend.startsWith('+')) return 'red'; // increasing = more expensive/used
  if (trend.startsWith('-')) return 'green'; // decreasing = better
  return 'gray'; // stable
}

/**
 * TrendLine — sparkline-style metric trend indicator.
 *
 * Renders a single row combining a metric label, a proportional fill bar, the
 * current value, a separator, and a trend direction string. Designed to be
 * stacked vertically for a quick comparative view of multiple metrics.
 *
 * Row format: `{label}  {bar}  {value} │ {trend}`
 *
 * Trend colour: rising metrics are shown in red, falling in green, stable in gray.
 * Bar fill is computed from `barValue` (0-1) clamped to the available bar width.
 *
 * Used on Page 3 of the full TUI dashboard for historical trend comparison.
 *
 * @example
 * ```tsx
 * <TrendLine
 *   label="Cache Hit Rate"
 *   value="84.2%"
 *   trend="+1.3%"
 *   barValue={0.842}
 *   width={60}
 * />
 * ```
 */
export function TrendLine({
  label,
  value,
  trend,
  barValue,
  width = 50,
}: TrendLineProps): React.ReactElement {
  const barWidth = Math.max(
    width - LABEL_COL - VALUE_COL - TREND_COL - SEPARATOR - PADDING,
    4,
  );

  const clamped = Math.min(Math.max(barValue, 0), 1);
  const filled = Math.round(clamped * barWidth);
  const empty = barWidth - filled;

  const labelStr = label.length > LABEL_COL
    ? label.slice(0, LABEL_COL - 1) + '…'
    : label.padEnd(LABEL_COL, ' ');

  const valueStr = value.padStart(VALUE_COL, ' ');
  const trendStr = trend.padStart(TREND_COL, ' ');
  const color = trendColor(trend);

  return (
    <Box flexDirection="row" width={width}>
      <Text color="white">{labelStr}</Text>
      <Text>{'  '}</Text>
      <Text color="green">{FILL_CHAR.repeat(filled)}</Text>
      <Text color="gray" dimColor>{EMPTY_CHAR.repeat(empty)}</Text>
      <Text>{'  '}</Text>
      <Text color="yellow" bold>{valueStr}</Text>
      <Text color="gray">{' \u2502'}</Text>
      <Text color={color} bold>{trendStr}</Text>
    </Box>
  );
}
