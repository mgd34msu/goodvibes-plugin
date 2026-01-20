/**
 * Output Formatters
 *
 * Functions for formatting query results as ASCII tables or other formats.
 */

import type { ColumnInfo } from './types.js';

/**
 * Format a cell value for table display
 */
export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Format rows as an ASCII table
 */
export function formatAsTable(rows: unknown[], columns: ColumnInfo[]): string {
  if (rows.length === 0) {
    return '(no rows)';
  }

  // Get column widths
  const colWidths: Record<string, number> = {};
  for (const col of columns) {
    colWidths[col.name] = col.name.length;
  }

  // Check row values for max width
  for (const row of rows) {
    const rowObj = row as Record<string, unknown>;
    for (const col of columns) {
      const value = formatCellValue(rowObj[col.name]);
      colWidths[col.name] = Math.max(colWidths[col.name], value.length);
    }
  }

  // Cap column widths at 50 chars
  for (const col of columns) {
    colWidths[col.name] = Math.min(colWidths[col.name], 50);
  }

  // Build header
  const headerCells = columns.map(col =>
    col.name.padEnd(colWidths[col.name]),
  );
  const headerLine = '| ' + headerCells.join(' | ') + ' |';

  // Build separator
  const separatorCells = columns.map(col =>
    '-'.repeat(colWidths[col.name]),
  );
  const separatorLine = '|-' + separatorCells.join('-|-') + '-|';

  // Build rows
  const rowLines = rows.map(row => {
    const rowObj = row as Record<string, unknown>;
    const cells = columns.map(col => {
      const value = formatCellValue(rowObj[col.name]);
      return value.slice(0, colWidths[col.name]).padEnd(colWidths[col.name]);
    });
    return '| ' + cells.join(' | ') + ' |';
  });

  return [headerLine, separatorLine, ...rowLines].join('\n');
}
