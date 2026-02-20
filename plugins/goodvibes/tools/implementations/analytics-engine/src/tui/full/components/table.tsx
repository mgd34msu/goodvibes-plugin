import React from 'react';
import { Box, Text } from 'ink';

/**
 * Props for the Table component.
 */
export interface TableProps {
  /** Column header labels. */
  headers: string[];
  /** Data rows — each inner array must have the same number of elements as `headers`. */
  rows: string[][];
  /**
   * Optional explicit column widths in terminal columns.
   * When omitted, widths are computed from the widest cell (header or data) in each column.
   */
  columnWidths?: number[];
}

/** Pad or truncate a cell string to a fixed column width. */
function cell(text: string, width: number): string {
  if (text.length > width) return text.slice(0, width - 1) + '…';
  return text.padEnd(width, ' ');
}

/**
 * Table — tabular data renderer with box-drawing borders.
 *
 * Renders a fully-bordered table using Unicode box-drawing characters.
 * Column widths are derived automatically from cell content or from the
 * optional `columnWidths` prop.
 *
 * Border characters used:
 * - Top:    `┌─┬─┐`
 * - Middle: `├─┼─┤`
 * - Bottom: `└─┴─┘`
 * - Sides:  `│`
 *
 * Used for the recent sessions list on Page 3 of the full TUI dashboard.
 *
 * @example
 * ```tsx
 * <Table
 *   headers={['Session', 'Duration', 'Tokens', 'Cost']}
 *   rows={[
 *     ['abc123', '12m', '45,000', '$0.14'],
 *   ]}
 * />
 * ```
 */
export function Table({ headers, rows, columnWidths }: TableProps): React.ReactElement {
  if (headers.length === 0) {
    return (
      <Box>
        <Text color="gray" dimColor>No data</Text>
      </Box>
    );
  }

  const colCount = headers.length;

  // Compute effective column widths.
  const widths: number[] = Array.from({ length: colCount }, (_, ci) => {
    if (columnWidths && columnWidths[ci] != null) return columnWidths[ci];
    const headerLen = headers[ci].length;
    const maxDataLen = rows.reduce((max, row) => {
      const cellLen = (row[ci] ?? '').length;
      return Math.max(max, cellLen);
    }, 0);
    return Math.max(headerLen, maxDataLen, 4);
  });

  /** Build a horizontal border line. */
  function borderLine(
    left: string,
    middle: string,
    right: string,
    fill: string,
  ): string {
    return left + widths.map((w) => fill.repeat(w + 2)).join(middle) + right;
  }

  const topBorder = borderLine('┌', '┬', '┐', '─');
  const midBorder = borderLine('├', '┼', '┤', '─');
  const btmBorder = borderLine('└', '┴', '┘', '─');

  /** Render a data row between `│` characters. */
  function dataRow(cells: string[], isHeader = false): React.ReactElement {
    return (
      <Box flexDirection="row">
        <Text color="gray">{'\u2502'}</Text>
        {widths.map((w, ci) => (
          <React.Fragment key={ci}>
            <Text
              bold={isHeader}
              color={isHeader ? 'cyan' : 'white'}
            >{` ${cell(cells[ci] ?? '', w)} `}</Text>
            <Text color="gray">{'\u2502'}</Text>
          </React.Fragment>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="gray">{topBorder}</Text>
      {dataRow(headers, true)}
      <Text color="gray">{midBorder}</Text>
      {rows.length === 0 ? (
        <Box>
          <Text color="gray">{'\u2502'}</Text>
          <Text color="gray" dimColor>{` ${'No data'.padEnd(widths.reduce((s, w) => s + w + 3, -1))} `}</Text>
          <Text color="gray">{'\u2502'}</Text>
        </Box>
      ) : (
        rows.map((row, idx) => (
          <React.Fragment key={idx}>
            {dataRow(row)}
            {idx < rows.length - 1 && <Text color="gray">{midBorder}</Text>}
          </React.Fragment>
        ))
      )}
      <Text color="gray">{btmBorder}</Text>
    </Box>
  );
}
