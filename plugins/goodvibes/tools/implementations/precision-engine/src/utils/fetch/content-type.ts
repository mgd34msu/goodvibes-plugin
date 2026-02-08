/**
 * Content-Type header detection and classification for web fetch operations.
 */

/**
 * Information about detected content type from HTTP headers, URL, or body sniffing.
 */
export interface ContentTypeInfo {
  /** MIME type (e.g., 'text/html', 'application/json') */
  mime: string;
  /** Character encoding (e.g., 'utf-8', 'iso-8859-1') */
  charset: string;
  /** True if content is HTML */
  isHtml: boolean;
  /** True if content is JSON */
  isJson: boolean;
  /** True if content is XML */
  isXml: boolean;
  /** True if content is PDF */
  isPdf: boolean;
  /** True if content is an image (jpg, png, gif, webp, svg) */
  isImage: boolean;
  /** True if content is binary (images, PDFs, or unknown binary types) */
  isBinary: boolean;
}

interface MimeClassification {
  isHtml: boolean;
  isJson: boolean;
  isXml: boolean;
  isPdf: boolean;
  isImage: boolean;
  isBinary: boolean;
}

/**
 * Parse Content-Type header to extract MIME type and charset.
 */
function parseContentTypeHeader(headerValue: string): { mime: string; charset: string } {
  // Default values
  let mime = 'text/plain';
  let charset = 'utf-8';

  if (!headerValue || typeof headerValue !== 'string') {
    return { mime, charset };
  }

  // Split on semicolon to separate MIME type from parameters
  const parts = headerValue.split(';').map((p) => p.trim());

  if (parts.length > 0 && parts[0]) {
    mime = parts[0].toLowerCase();
  }

  // Look for charset parameter
  for (let i = 1; i < parts.length; i++) {
    const param = parts[i];
    if (param.toLowerCase().startsWith('charset=')) {
      const value = param.substring(8).trim();
      // Remove quotes if present
      charset = value.replace(/^["']|["']$/g, '');
      break;
    }
  }

  return { mime, charset };
}

/**
 * Detect MIME type from URL file extension.
 */
function detectMimeFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();

    // PDF
    if (pathname.endsWith('.pdf')) {
      return 'application/pdf';
    }

    // JSON
    if (pathname.endsWith('.json')) {
      return 'application/json';
    }

    // XML
    if (pathname.endsWith('.xml')) {
      return 'application/xml';
    }

    // HTML
    if (pathname.endsWith('.html') || pathname.endsWith('.htm')) {
      return 'text/html';
    }

    // Images
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (pathname.endsWith('.png')) {
      return 'image/png';
    }
    if (pathname.endsWith('.gif')) {
      return 'image/gif';
    }
    if (pathname.endsWith('.webp')) {
      return 'image/webp';
    }
    if (pathname.endsWith('.svg')) {
      return 'image/svg+xml';
    }

    return null;
  } catch {
    // Invalid URL, ignore
    return null;
  }
}

/**
 * Detect MIME type from body content using magic bytes.
 */
function detectMimeFromBody(bodySniff: string): string | null {
  if (!bodySniff || bodySniff.length < 4) {
    return null;
  }

  const trimmed = bodySniff.trim();

  // PDF magic bytes
  if (trimmed.startsWith('%PDF-')) {
    return 'application/pdf';
  }

  // JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'application/json';
  }

  // XML
  if (trimmed.startsWith('<?xml')) {
    return 'application/xml';
  }

  // HTML
  if (
    trimmed.toLowerCase().startsWith('<!doctype html') ||
    trimmed.toLowerCase().startsWith('<html')
  ) {
    return 'text/html';
  }

  return null;
}

/**
 * Classify a MIME type into boolean flags.
 */
function classifyMime(mime: string): MimeClassification {
  const lower = mime.toLowerCase();

  // XHTML is both HTML and XML
  const isXhtml = lower === 'application/xhtml+xml';
  const isHtml = lower.includes('html');
  const isJson = lower.includes('json');
  const isXml = (lower.includes('xml') && !lower.includes('svg')) || isXhtml; // SVG is image/svg+xml
  const isPdf = lower.includes('pdf');
  const isImage = lower.startsWith('image/');

  // Binary: images, PDFs, or non-text types
  // Exclude known text-based application/* types
  const isTextBasedApp =
    lower === 'application/javascript' ||
    lower === 'application/x-javascript' ||
    lower === 'application/typescript' ||
    lower === 'application/x-www-form-urlencoded' ||
    lower === 'application/graphql' ||
    lower === 'application/x-yaml' ||
    lower === 'application/yaml' ||
    lower.startsWith('application/vnd.api+json') ||
    lower.endsWith('+xml') || // e.g., application/atom+xml, application/rss+xml
    lower.endsWith('+json'); // e.g., application/vnd.api+json

  const isBinary =
    isImage ||
    isPdf ||
    lower.startsWith('application/octet-stream') ||
    (lower.startsWith('application/') && !isJson && !isXml && !isTextBasedApp) ||
    lower.startsWith('video/') ||
    lower.startsWith('audio/');

  return { isHtml, isJson, isXml, isPdf, isImage, isBinary };
}

/**
 * Detect content type from HTTP headers, URL extension, and optional body sniffing.
 *
 * @param headers - HTTP headers object (either Headers instance or plain object)
 * @param url - The URL being fetched
 * @param bodySniff - Optional: first few bytes of response body for magic byte detection
 * @returns Detailed content type information
 *
 * @example
 * ```typescript
 * const info = detectContentType(
 *   { 'content-type': 'text/html; charset=utf-8' },
 *   'https://example.com/page.html'
 * );
 * // => { mime: 'text/html', charset: 'utf-8', isHtml: true, ... }
 * ```
 */
export function detectContentType(
  headers: Headers | Record<string, string>,
  url: string,
  bodySniff?: string
): ContentTypeInfo {
  let headerMime: string | null = null;
  let charset = 'utf-8';

  // Extract Content-Type header
  if (headers instanceof Headers) {
    const contentType = headers.get('content-type');
    if (contentType) {
      const parsed = parseContentTypeHeader(contentType);
      headerMime = parsed.mime;
      charset = parsed.charset;
    }
  } else if (headers && typeof headers === 'object') {
    // Plain object - case-insensitive lookup
    const key = Object.keys(headers).find(k => k.toLowerCase() === 'content-type');
    const contentType = key ? (headers as Record<string, string>)[key] : undefined;
    if (contentType) {
      const parsed = parseContentTypeHeader(contentType);
      headerMime = parsed.mime;
      charset = parsed.charset;
    }
  }

  // Priority: header > body sniff > URL extension
  let detectedMime: string;

  if (headerMime) {
    detectedMime = headerMime;
  } else {
    const bodyMime = bodySniff ? detectMimeFromBody(bodySniff) : null;
    const urlMime = detectMimeFromUrl(url);

    detectedMime = bodyMime || urlMime || 'text/plain';
  }

  const classification = classifyMime(detectedMime);

  return {
    mime: detectedMime,
    charset,
    ...classification,
  };
}
