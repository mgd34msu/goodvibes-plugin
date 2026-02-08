/**
 * Automatic JSON format negotiation for API-like URLs.
 */

/**
 * Information about content type negotiation.
 */
export interface NegotiationInfo {
  /** What Accept header was sent */
  requested_format: string;
  /** What Content-Type was received */
  received_format: string;
  /** Whether we auto-added the Accept header */
  auto_negotiated: boolean;
}

/**
 * Determines if a URL looks like an API endpoint.
 * API patterns: /api/, .json (at end of path), /v[0-9]+/
 */
function looksLikeApi(url: string): boolean {
  const apiPattern = /\/api\/|\.json(?:\?|$)|\/v\d+\//i;
  return apiPattern.test(url);
}

/**
 * Checks if headers already contain an Accept header (case-insensitive).
 */
function hasAcceptHeader(headers?: Record<string, string>): boolean {
  if (!headers) return false;
  return Object.keys(headers).some(k => k.toLowerCase() === 'accept');
}

/**
 * Determines whether to request JSON format for a given URL.
 * Returns true if:
 * - The URL looks like an API endpoint
 * - The request method is GET
 * - The user hasn't already set an Accept header
 *
 * @param url - The URL to check
 * @param method - The HTTP method
 * @param headers - Optional existing headers
 * @returns true if JSON should be requested
 */
export function shouldRequestJson(
  url: string,
  method: string,
  headers?: Record<string, string>
): boolean {
  // Only apply to GET requests
  if (method.toUpperCase() !== 'GET') {
    return false;
  }

  // If user set explicit Accept header, respect it
  if (hasAcceptHeader(headers)) {
    return false;
  }

  // Check if URL looks like an API
  return looksLikeApi(url);
}

/**
 * Returns headers with Accept: application/json added.
 * If existingHeaders is undefined, returns { Accept: 'application/json' }.
 * Otherwise, returns a copy of existingHeaders with the Accept header added.
 *
 * @param existingHeaders - Optional existing headers
 * @returns Headers with Accept: application/json
 */
export function getJsonHeaders(
  existingHeaders?: Record<string, string>
): Record<string, string> {
  if (!existingHeaders) {
    return { Accept: 'application/json' };
  }

  return {
    ...existingHeaders,
    Accept: 'application/json',
  };
}

/**
 * Factory function to create NegotiationInfo object.
 *
 * @param requestedAccept - The Accept header that was sent (if any)
 * @param receivedContentType - The Content-Type header that was received (if any)
 * @param wasAutoNegotiated - Whether we automatically added the Accept header
 * @returns NegotiationInfo object
 */
export function createNegotiationInfo(
  requestedAccept: string | undefined,
  receivedContentType: string | undefined,
  wasAutoNegotiated: boolean
): NegotiationInfo {
  return {
    requested_format: requestedAccept || 'none',
    received_format: receivedContentType || 'none',
    auto_negotiated: wasAutoNegotiated,
  };
}
