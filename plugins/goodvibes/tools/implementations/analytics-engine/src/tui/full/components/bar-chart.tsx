import React from 'react';
import { Box, Text } from 'ink';

/**
 * A single item in the BarChart dataset.
 */
export interface BarChartItem {
  /** Display label shown to the left of the bar. */
  label: string;
  /** Numeric value used to compute bar fill ratio. */
  value: number;
  /**
   * Optional explicit maximum value for scaling the bar.
   * When omitted the maximum of all item values in the array is used.
   */
  maxValue?: number;
  /** Optional suffix appended after the value, e.g. "ms" or "%". */
  suffix?: string;
}

/**
 * Props for the BarChart component.
 */
export interface BarChartProps {
  /** Dataset to render as horizontal bars. */
  items: BarChartItem[];
  /** Total width of the chart in terminal columns. Defaults to 50. */
  width?: number;
  /** Character used for the filled portion of the bar. Defaults to '█'. */
  barChar?: string;
  /** Character used for the empty portion of the bar. Defaults to '░'. */
  emptyChar?: string;
}

/** Truncate or pad a label to an exact column width. */
function fixedLabel(text: string, width: number): string {
  if (text.length > width) return text.slice(0, width - 1) + '…';
  return text.padEnd(width, ' ');
}

/**
 * BarChart — horizontal bar chart widget.
 *
 * Renders each item as a labeled row with a proportional horizontal bar and
 * the numeric value printed to the right. Bar fill is computed relative to
 * the maximum value across all items (or the per-item `maxValue` override).
 *
 * Row format: `{label}  {bar}{empty}  {value}{suffix}`
 *
 * Used for tool breakdown, file hotspots, and agent breakdown sections of
 * the full TUI dashboard.
 *
 * @example
 * ```tsx
 * <BarChart
 *   items={[
 *     { label: 'precision_read', value: 42, suffix: ' calls' },
 *     { label: 'precision_write', value: 18, suffix: ' calls' },
 *   ]}
 *   width={60}
 * />
 * ```
 */
export function BarChart({
  items,
  width = 50,
  barChar = '█',
  emptyChar = '░',
}: BarChartProps): React.ReactElement {
  if (items.length === 0) {
    return (
      <Box width={width}>
        <Text color="gray" dimColor>No data</Text>
      </Box>
    );
  }

  // Compute label column width from the longest label, capped at 20.
  const labelColWidth = Math.min(
    Math.max(...items.map((i) => i.label.length), 4),
    20,
  );

  // Compute value column width from the longest rendered value string.
  const valueStrings = items.map((i) => `${i.value}${i.suffix ?? ''}`);
  const valueColWidth = Math.max(...valueStrings.map((s) => s.length), 4);

  // Bar area: total width minus label col, two spaces of padding, value col, two spaces.
  const barAreaWidth = Math.max(width - labelColWidth - valueColWidth - 4, 4);

  // Global max value for items that don't specify their own maxValue.
  const globalMax = Math.max(...items.map((i) => i.value), 1);

  return (
    <Box flexDirection="column" width={width}>
      {items.map((item, idx) => {
        const max = item.maxValue ?? globalMax;
        const ratio = max > 0 ? Math.min(item.value / max, 1) : 0;
        const filled = Math.round(ratio * barAreaWidth);
        const empty = barAreaWidth - filled;
        const bar = barChar.repeat(filled) + emptyChar.repeat(empty);
        const valueStr = valueStrings[idx];

        return (
          <Box key={idx} flexDirection="row" width={width}>
            <Text color="white">{fixedLabel(item.label, labelColWidth)}</Text>
            <Text>{'  '}</Text>
            <Text color="green">{bar.slice(0, filled)}</Text>
            <Text color="gray" dimColor>{bar.slice(filled)}</Text>
            <Text>{'  '}</Text>
            <Text color="yellow" bold>{valueStr.padStart(valueColWidth)}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
