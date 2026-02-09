/**
 * Service registry for precision_fetch.
 * Manages named API service configurations stored in goodvibes.json.
 * 
 * Services define base URLs, default headers, auth type, and rate limit settings.
 * URL patterns map hostnames to services for automatic service resolution.
 */

import { getConfig, setConfigValue } from '../../runtime-config.js';
import { removeServiceSecret } from './secrets-store.js';

/** Configuration for a single API service */
export interface ServiceConfig {
  /** Base URL for the service (e.g., "https://api.github.com") */
  base_url: string;
  /** Default headers for all requests to this service */
  default_headers?: Record<string, string>;
  /** Auth type configured for this service (references secrets store) */
  auth_type?: 'bearer' | 'basic' | 'api-key' | 'oauth2' | 'session' | 'custom-headers' | 'none';
  /** Rate limit: requests per second */
  rate_limit_rps?: number;
  /** Request timeout in ms */
  timeout_ms?: number;
  /** Description for display purposes */
  description?: string;
}

/** URL pattern mapping hostname to service name */
export interface UrlPattern {
  /** Hostname pattern (exact match, no wildcards) */
  hostname: string;
  /** Service name to resolve to */
  service: string;
}

/** Fetch configuration section in goodvibes.json */
export interface FetchConfig {
  /** Named service configurations */
  services?: Record<string, ServiceConfig>;
  /** URL-to-service hostname mappings */
  url_patterns?: UrlPattern[];
  /** Global default settings for all fetch requests */
  global_defaults?: {
    /** Default headers for all requests */
    headers?: Record<string, string>;
    /** Default timeout in ms */
    timeout_ms?: number;
    /** Default User-Agent */
    user_agent?: string;
  };
}

/**
 * Get the full fetch configuration section.
 */
export function getFetchConfig(): FetchConfig {
  const config = getConfig();
  return (config.fetch as FetchConfig) ?? {};
}

/**
 * Get all registered services.
 */
export function getFetchServices(): Record<string, ServiceConfig> {
  const fetchConfig = getFetchConfig();
  return fetchConfig.services ?? {};
}

/**
 * Get a specific service by name.
 * Returns undefined if not found.
 */
export function getService(name: string): ServiceConfig | undefined {
  const services = getFetchServices();
  return services[name];
}

/**
 * Add or update a service configuration.
 * @param name - Service name (e.g., "github", "openai")
 * @param config - Service configuration
 * @param force - If false, throws on name collision. Default: false
 */
export async function addService(name: string, config: ServiceConfig, force = false): Promise<void> {
  const fetchConfig = { ...getFetchConfig() };
  const services = { ...(fetchConfig.services ?? {}) };
  
  if (!force && name in services) {
    throw new Error(`Service "${name}" already exists. Use force=true to overwrite.`);
  }
  
  services[name] = config;
  fetchConfig.services = services;
  await setConfigValue('fetch', fetchConfig);
}

/**
 * Remove a service configuration AND its secrets.
 * @param name - Service name to remove
 * @returns true if service was found and removed
 */
export async function removeService(name: string): Promise<boolean> {
  const fetchConfig = { ...getFetchConfig() };
  const services = { ...(fetchConfig.services ?? {}) };
  
  if (!(name in services)) {
    return false;
  }
  
  delete services[name];
  fetchConfig.services = services;
  
  // Also remove from URL patterns
  if (fetchConfig.url_patterns) {
    fetchConfig.url_patterns = fetchConfig.url_patterns.filter(p => p.service !== name);
  }
  
  await setConfigValue('fetch', fetchConfig);
  
  // Remove secrets (fire-and-forget, log but don't fail if no secrets exist)
  try {
    await removeServiceSecret(name);
  } catch (error) {
    // Log but don't fail — service may not have had secrets, or file may not exist
    // Error is swallowed intentionally to not block service removal
  }
  
  return true;
}

/**
 * Get all URL patterns.
 */
export function getUrlPatterns(): UrlPattern[] {
  const fetchConfig = getFetchConfig();
  return fetchConfig.url_patterns ?? [];
}

/**
 * Add a URL pattern mapping.
 * @param hostname - Hostname to match (e.g., "api.github.com")
 * @param serviceName - Service name to resolve to
 */
export async function addUrlPattern(hostname: string, serviceName: string): Promise<void> {
  const fetchConfig = { ...getFetchConfig() };
  const patterns = [...(fetchConfig.url_patterns ?? [])];
  
  // Check if service exists
  const services = fetchConfig.services ?? {};
  if (!(serviceName in services)) {
    throw new Error(`Service "${serviceName}" not found. Add the service first.`);
  }
  
  // Replace existing pattern for this hostname, or add new
  const existingIndex = patterns.findIndex(p => p.hostname === hostname);
  if (existingIndex >= 0) {
    patterns[existingIndex].service = serviceName;
  } else {
    patterns.push({ hostname, service: serviceName });
  }
  
  fetchConfig.url_patterns = patterns;
  await setConfigValue('fetch', fetchConfig);
}

/**
 * Match a URL to a service name via hostname patterns.
 * @param url - Full URL to match
 * @returns Service name if matched, undefined otherwise
 */
export function matchServiceByUrl(url: string): string | undefined {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return undefined;
  }
  
  const patterns = getUrlPatterns();
  const match = patterns.find(p => p.hostname === hostname);
  return match?.service;
}

/**
 * Get global fetch defaults.
 */
export function getFetchGlobalDefaults(): FetchConfig['global_defaults'] {
  const fetchConfig = getFetchConfig();
  return fetchConfig.global_defaults;
}

/**
 * Set global fetch defaults.
 */
export async function setFetchGlobalDefaults(defaults: FetchConfig['global_defaults']): Promise<void> {
  const fetchConfig = { ...getFetchConfig() };
  fetchConfig.global_defaults = defaults;
  await setConfigValue('fetch', fetchConfig);
}

/**
 * List all service names.
 */
export function listServiceNames(): string[] {
  return Object.keys(getFetchServices());
}

/**
 * Get service summary info (safe to display, no secrets).
 */
export function getServiceSummary(name: string): { name: string; base_url: string; auth_type?: string; description?: string } | undefined {
  const service = getService(name);
  if (!service) return undefined;
  return {
    name,
    base_url: service.base_url,
    auth_type: service.auth_type,
    description: service.description,
  };
}

/**
 * Get all service summaries (safe to display, no secrets).
 */
export function getAllServiceSummaries(): Array<{ name: string; base_url: string; auth_type?: string; description?: string }> {
  const services = getFetchServices();
  return Object.entries(services).map(([name, config]) => ({
    name,
    base_url: config.base_url,
    auth_type: config.auth_type,
    description: config.description,
  }));
}
