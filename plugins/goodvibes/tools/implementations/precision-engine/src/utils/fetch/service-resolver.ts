/**
 * Service resolver for precision_fetch.
 * Combines service configuration (from registry) with auth credentials (from secrets store).
 * Produces a fully resolved service ready for request building.
 */

import { getService, matchServiceByUrl, getFetchGlobalDefaults, type ServiceConfig } from './service-registry.js';
import { getServiceSecrets, resolveAuthConfig, type ServiceAuth } from './secrets-store.js';

/** A fully resolved service with config + auth, ready for use */
export interface ResolvedService {
  /** Service name */
  name: string;
  /** Service configuration (base_url, default_headers, etc.) */
  config: ServiceConfig;
  /** Resolved auth configuration (with $env refs resolved) */
  auth?: ServiceAuth;
  /** Whether auth credentials are available */
  has_auth: boolean;
}

/**
 * Resolve a service by name or URL.
 * 
 * @param nameOrUrl - Service name (e.g., "github") or full URL (e.g., "https://api.github.com/repos")
 * @returns ResolvedService if found, undefined otherwise
 */
export async function resolveService(nameOrUrl: string): Promise<ResolvedService | undefined> {
  let serviceName: string | undefined;
  let config: ServiceConfig | undefined;
  
  // Try as service name first
  config = getService(nameOrUrl);
  if (config) {
    serviceName = nameOrUrl;
  }
  
  // If not a known service name, try URL pattern matching
  if (!serviceName) {
    serviceName = matchServiceByUrl(nameOrUrl);
    if (serviceName) {
      config = getService(serviceName);
    }
  }
  
  if (!serviceName || !config) {
    return undefined;
  }
  
  // Load and resolve auth from secrets store
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
 * Build headers for a service request.
 * Merges: global defaults -> service default_headers -> request-specific headers
 * 
 * @param service - Resolved service (or undefined)
 * @param requestHeaders - Headers from the individual request
 * @returns Merged headers object
 */
export function buildServiceHeaders(
  service: ResolvedService | undefined,
  requestHeaders?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {};
  
  // Layer 1: Global defaults
  const globalDefaults = getFetchGlobalDefaults();
  if (globalDefaults?.headers) {
    Object.assign(headers, globalDefaults.headers);
  }
  if (globalDefaults?.user_agent) {
    headers['User-Agent'] = globalDefaults.user_agent;
  }
  
  // Layer 2: Service defaults
  if (service?.config.default_headers) {
    Object.assign(headers, service.config.default_headers);
  }
  
  // Layer 3: Request-specific headers (highest priority)
  if (requestHeaders) {
    Object.assign(headers, requestHeaders);
  }
  
  return headers;
}

/**
 * Resolve a potentially relative URL against a service's base_url.
 * 
 * @param service - Resolved service (or undefined)
 * @param urlOrPath - Full URL or relative path
 * @returns Resolved absolute URL
 */
export function resolveBaseUrl(service: ResolvedService | undefined, urlOrPath: string): string {
  // If it's already an absolute URL, return as-is
  try {
    new URL(urlOrPath);
    return urlOrPath;
  } catch {
    // Not an absolute URL — resolve against service base_url
  }
  
  if (!service?.config.base_url) {
    throw new Error(`Cannot resolve relative URL "${urlOrPath}" without a service base_url`);
  }
  
  // Join base_url and path
  const base = service.config.base_url.replace(/\/+$/, '');
  const relativePath = urlOrPath.replace(/^\/+/, '');
  return `${base}/${relativePath}`;
}
