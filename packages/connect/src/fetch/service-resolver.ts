/**
 * connect service resolver, combines registry config with stored credentials.
 *
 * Ported verbatim from v1 precision-engine `utils/fetch/service-resolver.ts`
 * (only import paths change). Produces a fully resolved service ready for
 * request building; `$env` refs in auth are resolved here.
 */

import {
  getService,
  matchServiceByUrl,
  getFetchGlobalDefaults,
  type ServiceConfig,
} from './service-registry.js';
import { getServiceSecrets, resolveAuthConfig, type ServiceAuth } from './secrets-store.js';

/** A fully resolved service (config + resolved auth). */
export interface ResolvedService {
  name: string;
  config: ServiceConfig;
  auth?: ServiceAuth;
  has_auth: boolean;
}

/**
 * Resolve a service by name or by URL-pattern match.
 * @param nameOrUrl - a service name or a full URL
 * @returns the resolved service, or undefined when unknown
 */
export async function resolveService(nameOrUrl: string): Promise<ResolvedService | undefined> {
  let serviceName: string | undefined;
  let config: ServiceConfig | undefined;

  config = getService(nameOrUrl);
  if (config) {serviceName = nameOrUrl;}

  if (!serviceName) {
    serviceName = matchServiceByUrl(nameOrUrl);
    if (serviceName) {config = getService(serviceName);}
  }

  if (!serviceName || !config) {return undefined;}

  const rawAuth = await getServiceSecrets(serviceName);
  const auth = rawAuth ? resolveAuthConfig(rawAuth) : undefined;

  return {
    name: serviceName,
    config,
    auth,
    has_auth: auth !== undefined && auth.type !== 'none',
  };
}

/**
 * Build request headers, merging global defaults → service defaults → request.
 * @param service - the resolved service (or undefined)
 * @param requestHeaders - per-request header overrides
 */
export function buildServiceHeaders(
  service: ResolvedService | undefined,
  requestHeaders?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {};

  const globalDefaults = getFetchGlobalDefaults();
  if (globalDefaults?.headers) {Object.assign(headers, globalDefaults.headers);}
  if (globalDefaults?.user_agent) {headers['User-Agent'] = globalDefaults.user_agent;}

  if (service?.config.default_headers) {Object.assign(headers, service.config.default_headers);}
  if (requestHeaders) {Object.assign(headers, requestHeaders);}

  return headers;
}

/**
 * Resolve a possibly-relative URL against a service's base_url.
 * @param service - the resolved service (or undefined)
 * @param urlOrPath - a full URL or a relative path
 * @returns the absolute URL
 * @throws when a relative path is given without a service base_url
 */
export function resolveBaseUrl(service: ResolvedService | undefined, urlOrPath: string): string {
  try {
    new URL(urlOrPath);
    return urlOrPath;
  } catch {
    // Not absolute, fall through to base_url resolution.
  }

  if (!service?.config.base_url) {
    throw new Error(`Cannot resolve relative URL "${urlOrPath}" without a service base_url`);
  }

  const base = service.config.base_url.replace(/\/+$/, '');
  const relativePath = urlOrPath.replace(/^\/+/, '');
  return `${base}/${relativePath}`;
}
