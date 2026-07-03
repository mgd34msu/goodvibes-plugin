/**
 * connect request builder — assembles fetch-ready requests from a spec + service.
 *
 * Ported from v1 precision-engine `utils/fetch/request-builder.ts` (URL/query,
 * body encoding for json/form/multipart/raw, header merge, per-request auth all
 * intact). This is the request-assembly core the `api_request` tool builds on;
 * the trust boundary and per-entry error isolation wrap around it.
 */

import {
  resolveService,
  buildServiceHeaders,
  resolveBaseUrl,
  type ResolvedService,
} from './service-resolver.js';

/** Per-request auth override. */
export type RequestAuth =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'api-key'; header: string; key: string }
  | { type: 'custom-headers'; headers: Record<string, string> };

/** Spec for a single fetch request. */
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

/** A built request ready for `fetch()`. */
export interface BuiltRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeout_ms: number;
  service?: ResolvedService;
}

const DEFAULT_TIMEOUT = 30000;

/** Build the full URL, appending query params. */
export function buildRequestUrl(spec: RequestSpec, service?: ResolvedService): string {
  let url = resolveBaseUrl(service ?? undefined, spec.url);

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
 * Build the request body from `body_type`/`body_data` (or legacy fields).
 * @returns `[body, contentType]` or `[undefined, undefined]` when no body.
 */
export function buildRequestBody(spec: RequestSpec): [string | undefined, string | undefined] {
  if (spec.body_data !== undefined) {
    const bodyType = spec.body_type ?? 'json';

    switch (bodyType) {
      case 'json': {
        const jsonBody =
          typeof spec.body_data === 'string' ? spec.body_data : JSON.stringify(spec.body_data);
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
        if (typeof spec.body_data === 'string') {
          return [spec.body_data, 'multipart/form-data'];
        }
        const boundary = `----GoodvibesConnect${Date.now()}`;
        const parts: string[] = [];
        for (const [key, value] of Object.entries(spec.body_data)) {
          parts.push(
            `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${String(value)}`,
          );
        }
        parts.push(`--${boundary}--`);
        return [parts.join('\r\n'), `multipart/form-data; boundary=${boundary}`];
      }
      case 'raw': {
        const rawBody =
          typeof spec.body_data === 'string' ? spec.body_data : JSON.stringify(spec.body_data);
        return [rawBody, undefined];
      }
      default:
        return [undefined, undefined];
    }
  }

  if (spec.body_base64) {
    return [Buffer.from(spec.body_base64, 'base64').toString('utf-8'), undefined];
  }

  if (spec.body) {
    return [spec.body, undefined];
  }

  return [undefined, undefined];
}

/** Build headers merging service/global defaults, auto content-type, and auth. */
export function buildRequestHeaders(
  spec: RequestSpec,
  service?: ResolvedService,
  autoContentType?: string,
): Record<string, string> {
  const headers = buildServiceHeaders(service, spec.headers);

  const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
  if (autoContentType && !hasContentType) {
    headers['Content-Type'] = autoContentType;
  }

  if (spec.auth) {applyRequestAuth(headers, spec.auth);}

  return headers;
}

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

/** Build a complete request from a spec + resolved service context. */
export async function buildRequest(spec: RequestSpec): Promise<BuiltRequest> {
  let service: ResolvedService | undefined;
  if (spec.service) {
    service = await resolveService(spec.service);
  } else {
    service = await resolveService(spec.url);
  }

  const url = buildRequestUrl(spec, service);
  const [body, autoContentType] = buildRequestBody(spec);
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
