/**
 * Request builder for precision_fetch.
 * Constructs fetch-ready request configurations from FetchSpec + service context.
 */

import { resolveService, buildServiceHeaders, resolveBaseUrl, type ResolvedService } from './service-resolver.js';

/** Auth config for a single request */
export type RequestAuth = 
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'api-key'; header: string; key: string }
  | { type: 'custom-headers'; headers: Record<string, string> };

/** Spec for a single fetch request (matches handler interface) */
export interface RequestSpec {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  body_base64?: string;
  params?: Record<string, string | number | boolean>;
  body_type?: 'json' | 'form' | 'multipart' | 'raw';
  body_data?: Record<string, unknown> | string;
  service?: string;
  auth?: RequestAuth;
  timeout_ms?: number;
}

/** Built request ready for fetch() */
export interface BuiltRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeout_ms: number;
  service?: ResolvedService;
}

const DEFAULT_TIMEOUT = 30000;

/**
 * Build the full URL with query parameters.
 */
export function buildRequestUrl(spec: RequestSpec, service?: ResolvedService): string {
  // Resolve relative URLs against service base_url
  let url = resolveBaseUrl(service ?? undefined, spec.url);
  
  // Append query params
  if (spec.params && Object.keys(spec.params).length > 0) {
    const urlObj = new URL(url);
    for (const [key, value] of Object.entries(spec.params)) {
      urlObj.searchParams.set(key, String(value));
    }
    url = urlObj.toString();
  }
  
  return url;
}

/**
 * Build the request body based on body_type.
 * Returns [body string, content-type header] or [undefined, undefined] if no body.
 */
export function buildRequestBody(spec: RequestSpec): [string | undefined, string | undefined] {
  // Priority: body_data + body_type > body_base64 > body
  if (spec.body_data !== undefined) {
    const bodyType = spec.body_type ?? 'json';
    
    switch (bodyType) {
      case 'json': {
        const jsonBody = typeof spec.body_data === 'string' 
          ? spec.body_data 
          : JSON.stringify(spec.body_data);
        return [jsonBody, 'application/json'];
      }
      case 'form': {
        if (typeof spec.body_data === 'string') {
          return [spec.body_data, 'application/x-www-form-urlencoded'];
        }
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(spec.body_data)) {
          params.set(key, String(value));
        }
        return [params.toString(), 'application/x-www-form-urlencoded'];
      }
      case 'multipart': {
        // For multipart, we use a boundary-based approach
        // Simple key-value multipart (no file uploads)
        if (typeof spec.body_data === 'string') {
          return [spec.body_data, 'multipart/form-data'];
        }
        const boundary = `----PrecisionFetch${Date.now()}`;
        const parts: string[] = [];
        for (const [key, value] of Object.entries(spec.body_data)) {
          parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${String(value)}`);
        }
        parts.push(`--${boundary}--`);
        return [parts.join('\r\n'), `multipart/form-data; boundary=${boundary}`];
      }
      case 'raw': {
        const rawBody = typeof spec.body_data === 'string'
          ? spec.body_data
          : JSON.stringify(spec.body_data);
        return [rawBody, undefined]; // No auto content-type for raw
      }
      default:
        return [undefined, undefined];
    }
  }
  
  // Legacy body support
  if (spec.body_base64) {
    return [Buffer.from(spec.body_base64, 'base64').toString('utf-8'), undefined];
  }
  
  if (spec.body) {
    return [spec.body, undefined];
  }
  
  return [undefined, undefined];
}

/**
 * Build headers merging all sources.
 */
export function buildRequestHeaders(
  spec: RequestSpec,
  service?: ResolvedService,
  autoContentType?: string
): Record<string, string> {
  // Start with service headers (includes global defaults)
  const headers = buildServiceHeaders(service, spec.headers);
  
  // Add auto content-type if not already set
  if (autoContentType && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = autoContentType;
  }
  
  // Apply per-request auth
  if (spec.auth) {
    applyRequestAuth(headers, spec.auth);
  }
  
  return headers;
}

/**
 * Apply per-request auth to headers.
 */
function applyRequestAuth(headers: Record<string, string>, auth: RequestAuth): void {
  switch (auth.type) {
    case 'none':
      break;
    case 'bearer':
      headers['Authorization'] = `Bearer ${auth.token}`;
      break;
    case 'basic': {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
      break;
    }
    case 'api-key':
      headers[auth.header] = auth.key;
      break;
    case 'custom-headers':
      Object.assign(headers, auth.headers);
      break;
  }
}

/**
 * Build a complete request from spec + service context.
 */
export async function buildRequest(spec: RequestSpec): Promise<BuiltRequest> {
  // Resolve service if specified or via URL pattern
  let service: ResolvedService | undefined;
  if (spec.service) {
    service = await resolveService(spec.service);
  } else {
    // Try URL pattern matching
    service = await resolveService(spec.url);
  }
  
  // Build URL
  const url = buildRequestUrl(spec, service);
  
  // Build body
  const [body, autoContentType] = buildRequestBody(spec);
  
  // Build headers
  const headers = buildRequestHeaders(spec, service, autoContentType);
  
  return {
    url,
    method: spec.method ?? 'GET',
    headers,
    body,
    timeout_ms: spec.timeout_ms ?? service?.config.timeout_ms ?? DEFAULT_TIMEOUT,
    service,
  };
}
