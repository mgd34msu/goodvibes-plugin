/**
 * PDF response handling for fetch operations
 */

/** Maximum number of pages allowed per PDF request */
const MAX_PAGES_PER_REQUEST = 20;

export interface PdfFetchResult {
  text: string;           // Extracted text content
  pages: number;          // Total page count
  page_range?: string;    // If specific pages were requested
  error?: string;         // Error message if parsing failed
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
  };
}

/**
 * Check if a response is a PDF based on content-type header
 */
export function isPdfResponse(contentType: string | null): boolean {
  if (!contentType) return false;
  return contentType.toLowerCase().startsWith('application/pdf');
}

/**
 * Parse page range string into start and end numbers
 */
function parsePageRange(pages: string): { start: number; end: number } {
  const trimmed = pages.trim();
  if (trimmed.includes('-')) {
    const parts = trimmed.split('-').map(s => s.trim());
    if (parts.length !== 2) {
      throw new Error(`Invalid page range: "${pages}". Use format like "1-5" or "3".`);
    }
    const [startStr, endStr] = parts;
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
      throw new Error(`Invalid page range: "${pages}". Use format like "1-5" or "3".`);
    }
    return { start, end };
  }
  const page = parseInt(trimmed, 10);
  if (isNaN(page) || page < 1) {
    throw new Error(`Invalid page number: "${pages}". Use format like "1-5" or "3".`);
  }
  return { start: page, end: page };
}

/**
 * Format page texts with separators
 */
function formatPageTexts(pageTexts: string[], startPage: number = 1): string {
  return pageTexts
    .map((text, i) => `--- Page ${startPage + i} ---\n${text}`)
    .join('\n\n');
}

/**
 * Parse PDF buffer and extract text content with optional page filtering
 */
/** pdf-parse module result type */
interface PdfParseResult {
  numpages: number;
  info?: {
    Title?: string;
    Author?: string;
    Subject?: string;
    Creator?: string;
  };
}

export async function parsePdfBuffer(
  buffer: Buffer,
  pages?: string
): Promise<PdfFetchResult> {
  try {
    // Dynamic import for pdf-parse
    // Note: pdf-parse@1.x exports a function via module.exports
    // CJS/ESM interop: in CJS bundle context, mod.default may not be the expected function.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParseModule = await import('pdf-parse') as any;
    const pdfParse = typeof pdfParseModule.default === 'function' ? pdfParseModule.default
                   : typeof pdfParseModule === 'function' ? pdfParseModule
                   : null;
    if (!pdfParse) {
      throw new Error('Failed to load pdf-parse: module does not export a callable function');
    }

    // Collect text per page using custom renderer
    const pageTexts: string[] = [];

    const options: Record<string, unknown> = {
      pagerender: async function(pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) {
        const textContent = await pageData.getTextContent();
        const text = textContent.items.map((item: { str: string }) => item.str).join(' ');
        pageTexts.push(text);
        return text;
      }
    };

    const pdfData = await pdfParse(buffer, options);
    const totalPages = pdfData.numpages;

    // Extract metadata with null checks
    const info = pdfData.info;
    const hasMetadata = info && (info.Title || info.Author || info.Subject || info.Creator);
    const metadata = hasMetadata ? {
      title: info?.Title,
      author: info?.Author,
      subject: info?.Subject,
      creator: info?.Creator,
    } : undefined;

    let text: string;
    let pageRange: string | undefined;

    if (pages) {
      const range = parsePageRange(pages);
      const requestedPages = range.end - range.start + 1;
      
      if (requestedPages > MAX_PAGES_PER_REQUEST) {
        throw new Error(`Requested ${requestedPages} pages but maximum is ${MAX_PAGES_PER_REQUEST} per request. Use a smaller range.`);
      }
      
      if (range.end > totalPages) {
        throw new Error(`Requested pages ${range.start}-${range.end} but PDF only has ${totalPages} pages.`);
      }
      
      // Filter to requested page range (1-indexed)
      const selectedPages = pageTexts.slice(range.start - 1, range.end);
      text = formatPageTexts(selectedPages, range.start);
      
      pageRange = pages;
    } else {
      // Return all pages with separators
      text = formatPageTexts(pageTexts);
    }

    return {
      text,
      pages: totalPages,
      page_range: pageRange,
      metadata,
    };
  } catch (err) {
    // Return descriptive error text in the result
    const errorMessage = `Failed to parse PDF: ${(err as Error).message}`;
    return {
      text: errorMessage,
      pages: 0,
      error: errorMessage,
      metadata: undefined,
    };
  }
}
