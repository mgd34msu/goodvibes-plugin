/**
 * Table extraction utility for HTML content.
 * Extracts tables from HTML strings with support for complex table structures.
 */

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
 * HTML entity mappings for decoding.
 */
const HTML_ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&ndash;': '\u2013',
  '&mdash;': '\u2014',
  '&hellip;': '\u2026',
  '&copy;': '\u00a9',
  '&reg;': '\u00ae',
  '&trade;': '\u2122',
};

/**
 * Decode HTML entities in text.
 * Handles both named entities (&lt;) and numeric entities (&#39;).
 *
 * @param text - Text containing HTML entities
 * @returns Decoded text
 */
function decodeHtmlEntities(text: string): string {
  let decoded = text;

  // Decode named entities
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }

  // Decode numeric entities (&#123; or &#x7B;)
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => {
    return String.fromCharCode(parseInt(code, 10));
  });
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
    return String.fromCharCode(parseInt(code, 16));
  });

  return decoded;
}

/**
 * Strip HTML tags from text, keeping only inner content.
 *
 * @param html - HTML string
 * @returns Plain text content
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
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

  // Find all <table> elements
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[0];

    // Skip tables with nested tables (only extract top-level)
    if (hasNestedTables(tableHtml)) {
      continue;
    }

    // Extract caption
    const caption = extractCaption(tableHtml);

    // Extract headers
    const headers = extractHeaders(tableHtml);
    const hasTheadHeaders = tableHtml.includes('<thead');

    // Extract data rows
    const rows = extractDataRows(tableHtml, hasTheadHeaders);

    // Only add tables with content
    if (rows.length > 0) {
      tables.push({
        headers,
        rows,
        caption,
      });
    }
  }

  return tables;
}
