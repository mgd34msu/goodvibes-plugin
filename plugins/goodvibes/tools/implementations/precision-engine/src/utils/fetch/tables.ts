/**
 * Table extraction utility for HTML content.
 * Extracts tables from HTML strings with support for complex table structures.
 */

import { decodeHtmlEntities, stripHtmlTags } from './html-utils.js';

/**
 * Represents a single table extracted from HTML.
 */
export interface TableData {
  /** Column headers from <thead> or first <tr> */
  headers: string[];
  /** All data rows */
  rows: string[][];
  /** <caption> text if present */
  caption?: string;
}

/**
 * Extract text content from a table cell element.
 * Handles nested tags, HTML entities, and whitespace.
 *
 * @param cellHtml - HTML content of a <td> or <th> element
 * @returns Trimmed, decoded plain text
 */
function extractCellText(cellHtml: string): string {
  const stripped = stripHtmlTags(cellHtml);
  const decoded = decodeHtmlEntities(stripped);
  return decoded.trim();
}

/**
 * Extract rows from a table section (tbody or table).
 * Handles colspan by repeating cell content.
 *
 * @param sectionHtml - HTML content of table section
 * @param includeThCells - Whether to treat <th> cells as data cells
 * @returns Array of rows, where each row is an array of cell values
 */
function extractRows(sectionHtml: string, includeThCells: boolean): string[][] {
  const rows: string[][] = [];

  // Match all <tr> elements
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trRegex.exec(sectionHtml)) !== null) {
    const rowHtml = trMatch[1];
    const cells: string[] = [];

    // Match all <td> and optionally <th> elements
    const cellPattern = includeThCells ? /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi : /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;

    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      const cellHtml = cellMatch[1];

      // Check for nested tables and skip if found
      if (/<table[^>]*>/i.test(cellHtml)) {
        cells.push('[nested table]');
        continue;
      }

      const cellText = extractCellText(cellHtml);

      // Handle colspan attribute
      const colspanMatch = cellMatch[0].match(/colspan=["']?(\d+)["']?/i);
      const colspan = colspanMatch ? parseInt(colspanMatch[1], 10) : 1;

      // Add cell content for each column span
      for (let i = 0; i < colspan; i++) {
        cells.push(cellText);
      }
    }

    // Only add non-empty rows
    if (cells.length > 0 && cells.some((cell) => cell.length > 0)) {
      rows.push(cells);
    }
  }

  return rows;
}

/**
 * Extract headers from a table's <thead> section or first row.
 *
 * @param tableHtml - Full HTML content of the table
 * @returns Array of header strings
 */
function extractHeaders(tableHtml: string): string[] {
  // Try to find <thead> section
  const theadMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);

  if (theadMatch) {
    const theadHtml = theadMatch[1];
    const headerRows = extractRows(theadHtml, true);
    // Return first row of headers if found
    if (headerRows.length > 0) {
      return headerRows[0];
    }
  }

  // Fallback: try to find first <tr> with <th> elements
  const firstTrMatch = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
  if (firstTrMatch) {
    const rowHtml = firstTrMatch[1];
    const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    const headers: string[] = [];
    let thMatch;

    while ((thMatch = thRegex.exec(rowHtml)) !== null) {
      const cellHtml = thMatch[1];
      headers.push(extractCellText(cellHtml));
    }

    if (headers.length > 0) {
      return headers;
    }
  }

  // No headers found
  return [];
}

/**
 * Extract data rows from a table's <tbody> section or main table body.
 * Excludes the header row if it was in the table body.
 *
 * @param tableHtml - Full HTML content of the table
 * @param hasTheadHeaders - Whether headers were found in <thead>
 * @returns Array of data rows
 */
function extractDataRows(tableHtml: string, hasTheadHeaders: boolean): string[][] {
  // Try to find <tbody> section
  const tbodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);

  if (tbodyMatch) {
    const tbodyHtml = tbodyMatch[1];
    return extractRows(tbodyHtml, true);
  }

  // Fallback: extract all rows from table
  // Remove <thead> section first to avoid duplication
  let bodyHtml = tableHtml.replace(/<thead[^>]*>[\s\S]*?<\/thead>/gi, '');
  // Also remove <tfoot> if present
  bodyHtml = bodyHtml.replace(/<tfoot[^>]*>[\s\S]*?<\/tfoot>/gi, '');

  const allRows = extractRows(bodyHtml, true);

  // If headers weren't in <thead>, skip the first row
  if (!hasTheadHeaders && allRows.length > 0) {
    return allRows.slice(1);
  }

  return allRows;
}

/**
 * Extract caption from a table if present.
 *
 * @param tableHtml - Full HTML content of the table
 * @returns Caption text or undefined
 */
function extractCaption(tableHtml: string): string | undefined {
  const captionMatch = tableHtml.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
  if (captionMatch) {
    const captionText = extractCellText(captionMatch[1]);
    return captionText.length > 0 ? captionText : undefined;
  }
  return undefined;
}

/**
 * Check if a table element contains nested tables.
 *
 * @param tableHtml - HTML content of the table
 * @returns true if nested tables are found
 */
function hasNestedTables(tableHtml: string): boolean {
  // Remove the opening <table> tag to avoid matching itself
  const withoutOpeningTag = tableHtml.replace(/^<table[^>]*>/, '');
  return /<table[^>]*>/i.test(withoutOpeningTag);
}

/**
 * Find all top-level <table> elements in HTML using balanced tag matching.
 * Handles nested tables correctly by tracking tag depth.
 *
 * @param html - HTML string containing tables
 * @returns Array of top-level table HTML strings
 */
function findTopLevelTables(html: string): string[] {
  const tables: string[] = [];
  const openTag = /<table[^>]*>/gi;
  let match;

  while ((match = openTag.exec(html)) !== null) {
    let depth = 1;
    let pos = openTag.lastIndex;

    while (depth > 0 && pos < html.length) {
      const nextOpen = html.indexOf('<table', pos);
      const nextClose = html.indexOf('</table>', pos);

      if (nextClose === -1) break; // No closing tag found

      if (nextOpen !== -1 && nextOpen < nextClose) {
        // Found nested opening tag
        depth++;
        pos = nextOpen + 6; // Skip past '<table'
      } else {
        // Found closing tag
        depth--;
        if (depth === 0) {
          // Found matching close tag for our top-level table
          tables.push(html.substring(match.index, nextClose + 8));
        }
        pos = nextClose + 8; // Skip past '</table>'
      }
    }
  }

  return tables;
}

/**
 * Extract all tables from HTML content.
 * Returns structured data for each table including headers, rows, and caption.
 *
 * @param html - HTML string containing one or more tables
 * @returns Array of extracted table data
 *
 * @example
 * ```typescript
 * const html = '<table><tr><th>Name</th><th>Age</th></tr><tr><td>Alice</td><td>30</td></tr></table>';
 * const tables = extractTables(html);
 * // [{ headers: ['Name', 'Age'], rows: [['Alice', '30']], caption: undefined }]
 * ```
 */
export function extractTables(html: string): TableData[] {
  const tables: TableData[] = [];

  // Find all top-level <table> elements using balanced tag matching
  const topLevelTables = findTopLevelTables(html);

  for (const tableHtml of topLevelTables) {
    // Extract caption
    const caption = extractCaption(tableHtml);

    // Extract headers
    const headers = extractHeaders(tableHtml);
    const hasTheadHeaders = tableHtml.includes('<thead');

    // Extract data rows
    const rows = extractDataRows(tableHtml, hasTheadHeaders);

    // Add tables with content (headers or rows)
    if (rows.length > 0 || headers.length > 0) {
      tables.push({
        headers,
        rows,
        caption,
      });
    }
  }

  return tables;
}
