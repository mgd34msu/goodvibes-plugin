/**
 * Redirect tracking for fetch operations
 * Tracks redirect chains and follows them manually to preserve full history
 */

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface RedirectHop {
  from: string;
  to: string;
  status: number;
}

export interface RedirectResult {
  response: Response;
  final_url: string;
  redirects: RedirectHop[];
}

/**
 * Fetch with manual redirect tracking
 * @param url - URL to fetch
 * @param options - Fetch options + maxRedirects
 * @returns RedirectResult with response, final URL, and redirect chain
 */
export async function fetchWithRedirectTracking(
  url: string,
  options?: RequestInit & { maxRedirects?: number }
): Promise<RedirectResult> {
  const maxRedirects = Math.max(1, Math.min(50, options?.maxRedirects ?? 10));
  const redirects: RedirectHop[] = [];
  const visitedUrls = new Set<string>();
  let currentUrl = url;
  let currentOptions = options ? { ...options } : {};
  
  // Track redirects manually
  for (let i = 0; i < maxRedirects; i++) {
    // Check for redirect loop
    if (visitedUrls.has(currentUrl)) {
      throw new Error(`Redirect loop detected: ${currentUrl} was already visited`);
    }
    visitedUrls.add(currentUrl);
    
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        ...currentOptions,
        redirect: 'manual',
      });
    } catch (error) {
      throw new Error(
        `Network error fetching ${currentUrl} (hop ${redirects.length + 1}): ${error instanceof Error ? error.message : String(error)}`
      );
    }
    
    // Check if this is a redirect (3xx status)
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        // No Location header, treat as final response
        return { response, final_url: currentUrl, redirects };
      }
      
      // Resolve relative URLs
      const nextUrl = new URL(location, currentUrl).toString();
      redirects.push({ from: currentUrl, to: nextUrl, status: response.status });
      
      // For 301/302/303, switch to GET and remove body + body-related headers
      if ([301, 302, 303].includes(response.status)) {
        const newHeaders: Record<string, string> = {};
        if (currentOptions.headers) {
          const headerObj = currentOptions.headers instanceof Headers 
            ? Object.fromEntries(currentOptions.headers.entries())
            : currentOptions.headers as Record<string, string>;
          for (const [key, value] of Object.entries(headerObj)) {
            const lowerKey = key.toLowerCase();
            if (!['content-type', 'content-length', 'content-encoding', 'transfer-encoding'].includes(lowerKey)) {
              newHeaders[key] = value;
            }
          }
        }
        currentOptions = {
          ...currentOptions,
          method: 'GET',
          body: undefined,
          headers: Object.keys(newHeaders).length > 0 ? newHeaders : undefined,
        };
      }
      // For 307/308, preserve method and body
      
      currentUrl = nextUrl;
      continue;
    }
    
    // Not a redirect — this is the final response
    return { response, final_url: currentUrl, redirects };
  }
  
  // If we exhausted redirects, throw error
  throw new Error(`Too many redirects (>${maxRedirects}) fetching ${url}`);
}
