import React from 'react';
import { Box, Text } from 'ink';

/**
 * A single label/value row within a MetricBox.
 */
export interface MetricRow {
  /** Display label shown on the left side. */
  label: string;
  /** Display value shown on the right side. */
  value: string;
}

/**
 * Props for the MetricBox component.
 */
export interface MetricBoxProps {
  /** Title shown in the box header. */
  title: string;
  /** Total width of the box in terminal columns. Defaults to 40. */
  width?: number;
  /** Array of label/value rows to render inside the box. */
  rows: MetricRow[];
}

/**
 * MetricBox — a bordered display widget showing a title and aligned key-value rows.
 *
 * Renders a box with a `borderStyle="single"` border, a centered title in the
 * header, and each row with the label left-aligned and the value right-aligned
 * within the available inner width.
 *
 * Used throughout all pages of the full TUI dashboard to surface session
 * metrics in a consistent format.
 *
 * @example
 * ```tsx
 * <MetricBox
 *   title="Token Metrics"
 *   width={36}
 *   rows={[
 *     { label: 'Input', value: '12,345' },
 *     { label: 'Output', value: '3,210' },
 *   ]}
 * />
 * ```
 */
export function MetricBox({ title, width = 40, rows }: MetricBoxProps): React.ReactElement {
  // Inner width excludes the two border characters on left and right.
  const innerWidth = Math.max(width - 2, 10);

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="single"
      borderColor="cyan"
    >
      {/* Header row */}
      <Box width={innerWidth} justifyContent="center">
        <Text bold color="cyan">{title}</Text>
      </Box>

      {/* Divider */}
      <Box width={innerWidth}>
        <Text color="gray">{'─'.repeat(innerWidth)}</Text>
      </Box>

      {/* Data rows */}
      {rows.length === 0 ? (
        <Box width={innerWidth} justifyContent="center">
          <Text color="gray" dimColor>No data</Text>
        </Box>
      ) : (
        rows.map((row, idx) => (
          <Box key={idx} width={innerWidth} justifyContent="space-between">
            <Text color="white">{row.label}</Text>
            <Text color="yellow" bold>{row.value}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
