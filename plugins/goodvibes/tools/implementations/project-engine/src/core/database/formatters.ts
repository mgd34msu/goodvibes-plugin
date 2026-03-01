/**
 * Database output formatters
 *
 * Formats query results as ASCII tables or JSON, and database schema
 * results as structured JSON responses.
 *
 * @module core/database/formatters
 */

import type { ColumnInfo, DatabaseSchemaResult } from './types.js';

/**
 * Maximum column display width in ASCII table output.
 * Truncates cell values wider than this threshold for readability.
 */
export const MAX_COLUMN_DISPLAY_WIDTH = 50;

// =============================================================================
// Query Result Formatters
// =============================================================================

/**
 * Format a cell value for ASCII table display.
 *
 * @param value - Cell value from query result
 * @returns Formatted string representation
 */
export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Format query rows as an ASCII table.
 *
 * Column widths are calculated from data, capped at 50 characters.
 *
 * @param rows - Query result rows
 * @param columns - Column metadata
 * @returns Formatted ASCII table string, or '(no rows)' if empty
 *
 * @example
 * formatQueryResult([{ id: 1, name: 'Alice' }], [{ name: 'id', type: 'integer' }, { name: 'name', type: 'text' }])
 * // Returns ASCII table with header and data rows
 */
export function formatQueryResult(rows: unknown[], columns: ColumnInfo[]): string {
  if (rows.length === 0) {
    return '(no rows)';
  }

  const colWidths: Record<string, number> = {};
  for (const col of columns) {
    colWidths[col.name] = col.name.length;
  }

  type RowData = Record<string, unknown>;

  for (const row of rows) {
    const rowObj = row as RowData;
    for (const col of columns) {
      const value = formatCellValue(rowObj[col.name]);
      colWidths[col.name] = Math.max(colWidths[col.name], value.length);
    }
  }

  for (const col of columns) {
    colWidths[col.name] = Math.min(colWidths[col.name], MAX_COLUMN_DISPLAY_WIDTH);
  }

  const headerCells = columns.map(col => col.name.padEnd(colWidths[col.name]));
  const headerLine = '| ' + headerCells.join(' | ') + ' |';

  const separatorCells = columns.map(col => '-'.repeat(colWidths[col.name]));
  const separatorLine = '|-' + separatorCells.join('-|-') + '-|';

  const rowLines = rows.map(row => {
    const rowObj = row as RowData;
    const cells = columns.map(col => {
      const value = formatCellValue(rowObj[col.name]);
      return value.slice(0, colWidths[col.name]).padEnd(colWidths[col.name]);
    });
    return '| ' + cells.join(' | ') + ' |';
  });

  return [headerLine, separatorLine, ...rowLines].join('\n');
}

// =============================================================================
// Schema Result Formatter
// =============================================================================

/**
 * Format a DatabaseSchemaResult as a JSON string.
 *
 * @param result - The schema extraction result
 * @returns Pretty-printed JSON string
 */
export function formatSchemaResult(result: DatabaseSchemaResult): string {
  return JSON.stringify(result, null, 2);
}
