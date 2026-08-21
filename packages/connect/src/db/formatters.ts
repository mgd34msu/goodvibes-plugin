/**
 * Query-result formatters, ported from v1 project-engine
 * `core/database/formatters.ts` (ASCII table + cell formatting). The
 * schema-result formatter is dropped (schema lives in intel's `db_schema`).
 */

import type { ColumnInfo } from './types.js';

/** Maximum column display width in ASCII table output. */
export const MAX_COLUMN_DISPLAY_WIDTH = 50;

/** Format a single cell value for display. */
export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {return 'NULL';}
  if (typeof value === 'object') {return JSON.stringify(value);}
  return String(value);
}

/**
 * Format query rows as an ASCII table (column widths capped at 50 chars).
 * @param rows - result rows
 * @param columns - column metadata
 */
export function formatQueryResult(rows: unknown[], columns: ColumnInfo[]): string {
  if (rows.length === 0) {return '(no rows)';}

  const colWidths: Record<string, number> = {};
  for (const col of columns) {colWidths[col.name] = col.name.length;}

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

  const headerCells = columns.map((col) => col.name.padEnd(colWidths[col.name]));
  const headerLine = '| ' + headerCells.join(' | ') + ' |';

  const separatorCells = columns.map((col) => '-'.repeat(colWidths[col.name]));
  const separatorLine = '|-' + separatorCells.join('-|-') + '-|';

  const rowLines = rows.map((row) => {
    const rowObj = row as RowData;
    const cells = columns.map((col) => {
      const value = formatCellValue(rowObj[col.name]);
      return value.slice(0, colWidths[col.name]).padEnd(colWidths[col.name]);
    });
    return '| ' + cells.join(' | ') + ' |';
  });

  return [headerLine, separatorLine, ...rowLines].join('\n');
}
