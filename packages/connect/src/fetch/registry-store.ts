/**
 * connect service-registry persistence.
 *
 * v1 stored the fetch registry inside precision-engine's mutable
 * `runtime-config` (`.goodvibes/goodvibes.json` under a `fetch` key). v2's
 * `core/config` is deliberately read-only (mode is human-only, no setters), so
 * the mutable registry gets its own file under the namespaced v2 state dir:
 * `.goodvibes/services.json`. This is the ONLY mutable connect state written
 * by the `service` tool; secrets and cookies live in their own 0600 files.
 *
 * The file is read fresh on every access (small, infrequent) so a write by one
 * call is visible to the next without cache-invalidation bugs, the same
 * property the v1 tests relied on.
 */

import * as fs from 'fs';
import * as path from 'path';
import { statePath } from '@goodvibes/core/config';
import { atomicWriteFile } from '@goodvibes/core/fsx';

/** HTTP methods considered non-mutating (always allowed under read-only default). */
export const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const;

/** Configuration for a single registered API service. */
export interface ServiceConfig {
  /** Base URL (e.g. "https://api.github.com"). Credentials pin to this origin. */
  base_url: string;
  /** Default headers applied to every request to this service. */
  default_headers?: Record<string, string>;
  /** Auth type configured for this service (references the secrets store). */
  auth_type?: 'bearer' | 'basic' | 'api-key' | 'oauth2' | 'session' | 'custom-headers' | 'none';
  /** Requests-per-second hint. */
  rate_limit_rps?: number;
  /** Request timeout in ms. */
  timeout_ms?: number;
  /** Display description. */
  description?: string;
  /**
   * Trust boundary (BUILD NEW): write methods this service is allowed to use.
   * Absent/empty means read-only, only SAFE_METHODS are permitted. Opting into
   * writes is explicit and per-service.
   */
  write_methods?: string[];
}

/** URL pattern mapping a hostname to a service name (exact match, no wildcards). */
export interface UrlPattern {
  hostname: string;
  service: string;
}

/**
 * A registered database connection (db_query trust model). Credentials are kept
 * out of this non-0600 file by preferring `url_env` (the name of an environment
 * variable holding the full connection URL); an inline `url` is meant for
 * secret-free targets like a local SQLite file path. Writes are read-only by
 * default and require an explicit per-connection `allow_writes` opt-in.
 */
export interface DbConnection {
  /** Literal connection URL (use only for secret-free targets, e.g. sqlite files). */
  url?: string;
  /** Name of an env var holding the full connection URL (preferred for networked DBs). */
  url_env?: string;
  /** Opt-in to write queries on this connection (default read-only). */
  allow_writes?: boolean;
  /** Display description. */
  description?: string;
}

/** The persisted connect registry. */
export interface FetchConfig {
  /** Named service configurations. */
  services?: Record<string, ServiceConfig>;
  /** Hostname → service resolution patterns. */
  url_patterns?: UrlPattern[];
  /**
   * Trust boundary (BUILD NEW): destination allowlist of extra hostnames
   * reachable with a bare `url` (no service) while in restricted mode.
   * Registered service origins are always reachable and need no entry here.
   */
  allowlist?: string[];
  /** Global defaults merged under service and request headers. */
  global_defaults?: {
    headers?: Record<string, string>;
    timeout_ms?: number;
    user_agent?: string;
  };
  /** Named database connections for `db_query` (registered-connection-only trust). */
  connections?: Record<string, DbConnection>;
}

/** The registry file path (namespaced under `.goodvibes/`, R15). */
export function registryPath(): string {
  return statePath('services.json');
}

/** Read the registry synchronously; returns `{}` when the file is absent/invalid. */
export function getRegistry(): FetchConfig {
  try {
    const content = fs.readFileSync(registryPath(), 'utf-8');
    return JSON.parse(content) as FetchConfig;
  } catch {
    return {};
  }
}

/**
 * Write the registry to disk (creates the state dir as needed). Temp-then-rename
 * so a crash mid-write cannot leave a truncated file that `getRegistry` would
 * silently read as an empty registry, dropping every registered service.
 */
export async function saveRegistry(config: FetchConfig): Promise<void> {
  const file = registryPath();
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await atomicWriteFile(file, JSON.stringify(config, null, 2) + '\n');
}
