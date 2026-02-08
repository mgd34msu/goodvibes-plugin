/**
 * PDF response handling for fetch operations
 */

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
 * Parse PDF buffer and extract text content with optional page filtering
 */
export async function parsePdfBuffer(
  buffer: Buffer,
  pages?: string
): Promise<PdfFetchResult> {
  try {
    // Dynamic import for pdf-parse
    const pdfParse = (await import('pdf-parse') as any).default;

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

    // Extract metadata
    const metadata = pdfData.info ? {
      title: pdfData.info.Title,
      author: pdfData.info.Author,
      subject: pdfData.info.Subject,
      creator: pdfData.info.Creator,
    } : undefined;

    let text: string;
    let pageRange: string | undefined;

    if (pages) {
      const range = parsePageRange(pages);
      const requestedPages = range.end - range.start + 1;
      
      if (requestedPages > 20) {
        throw new Error(`Requested ${requestedPages} pages but maximum is 20 per request. Use a smaller range.`);
      }
      
      if (range.end > totalPages) {
        throw new Error(`Requested pages ${range.start}-${range.end} but PDF only has ${totalPages} pages.`);
      }
      
      // Filter to requested page range (1-indexed)
      const selectedPages = pageTexts.slice(range.start - 1, range.end);
      text = selectedPages.map((pageText, i) => {
        const pageNum = range.start + i;
        return `--- Page ${pageNum} ---\n${pageText}`;
      }).join('\n\n');
      
      pageRange = pages;
    } else {
      // Return all pages with separators
      text = pageTexts.map((pageText, i) => {
        return `--- Page ${i + 1} ---\n${pageText}`;
      }).join('\n\n');
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
