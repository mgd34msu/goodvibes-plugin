/**
 * connect trust boundary (BUILD NEW, §4.3 service row).
 *
 * Everything the credential/destination policy needs is expressed here as pure,
 * side-effect-free functions so the whole boundary is unit-testable without a
 * network. The five rules, each non-negotiable at its stated point:
 *
 *  1. Credential pinning to registered origins, NEVER toggleable. Service
 *     credentials attach to a request ONLY when the request's final-URL origin
 *     equals the service's registered base_url origin. Open mode does NOT relax
 *     this: it widens where you may go, never where your secrets may travel.
 *  2. Destination allowlist, default-on. In restricted mode a destination is
 *     reachable only if its origin is a registered service origin or its host is
 *     on the explicit allowlist. Open mode lifts the allowlist (human-only).
 *  3. Per-service read-only default. Only SAFE_METHODS are permitted unless the
 *     service opted specific write methods in via `write_methods`. A bare `url`
 *     (no service) has no opt-in, so writes require open mode.
 *  4. Mode is a stamp, not a lever a tool can pull, it comes from `core/config`
 *     (human-only file edit); this module only reads it.
 *  5. Redaction, known secret values are stripped from echoed responses so a
 *     server that reflects a token back cannot leak it through the tool result.
 */

import type { ServiceAuth } from './fetch/secrets-store.js';

/** HTTP methods that never mutate server state (always allowed). */
export const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const;

/** Trust mode, mirrored from `core/config` (human-only). */
export type TrustMode = 'restricted' | 'open';

/** A single allow/deny ruling with a human-readable reason on denial. */
export interface TrustDecision {
  allowed: boolean;
  reason?: string;
}

/** The registry facts the destination policy consults. */
export interface DestinationPolicyInput {
  mode: TrustMode;
  /** Origins of every registered service (always reachable). */
  registeredOrigins: string[];
  /** Extra reachable hostnames while restricted. */
  allowlist: string[];
}

/**
 * The origin (`protocol//host[:port]`) of a URL, or null when unparseable.
 * @param url - a URL string
 */
export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** True when two URLs share an origin (protocol + host + port). */
export function isSameOrigin(a: string, b: string): boolean {
  const oa = originOf(a);
  const ob = originOf(b);
  return oa !== null && ob !== null && oa === ob;
}

/** True when a method is non-mutating. */
export function isSafeMethod(method: string): boolean {
  return (SAFE_METHODS as readonly string[]).includes(method.toUpperCase());
}

/**
 * Rule 2, is the destination reachable?
 * @param finalUrl - the fully resolved request URL
 * @param policy - mode + registered origins + allowlist
 */
export function isDestinationAllowed(finalUrl: string, policy: DestinationPolicyInput): TrustDecision {
  const origin = originOf(finalUrl);
  if (!origin) {
    return { allowed: false, reason: `Malformed URL: ${finalUrl}` };
  }

  let host: string;
  try {
    host = new URL(finalUrl).hostname;
  } catch {
    return { allowed: false, reason: `Malformed URL: ${finalUrl}` };
  }

  if (policy.registeredOrigins.includes(origin)) {
    return { allowed: true };
  }
  if (policy.allowlist.includes(host)) {
    return { allowed: true };
  }
  if (policy.mode === 'open') {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      `Destination '${host}' is not a registered service origin and is not on the ` +
      `allowlist. Register the service, add the host via the services command, or ` +
      `open the trust mode (human-only, out-of-band).`,
  };
}

/**
 * Rule 1, may this service's credentials travel to this URL?
 * Credentials attach only on an exact origin match with the registered
 * base_url. This holds in EVERY mode; open mode cannot loosen it.
 * @param finalUrl - the resolved request URL
 * @param serviceBaseUrl - the service's registered base_url
 */
export function isCredentialAttachAllowed(finalUrl: string, serviceBaseUrl: string): boolean {
  return isSameOrigin(finalUrl, serviceBaseUrl);
}

/**
 * Rule 3, is this method permitted for this target?
 * @param method - the HTTP method
 * @param opts - mode, and (for a registered target) the service's write opt-in
 */
export function isMethodAllowed(
  method: string,
  opts: { mode: TrustMode; hasService: boolean; writeMethods?: string[] },
): TrustDecision {
  if (isSafeMethod(method)) {return { allowed: true };}

  const upper = method.toUpperCase();

  if (opts.hasService) {
    const opted = (opts.writeMethods ?? []).map((m) => m.toUpperCase());
    if (opted.includes(upper)) {return { allowed: true };}
    return {
      allowed: false,
      reason:
        `Method ${upper} is a write and this service is read-only by default. Add ` +
        `${upper} to the service's write_methods to opt in.`,
    };
  }

  // Bare URL (no service): no per-service opt-in exists, so writes need open mode.
  if (opts.mode === 'open') {return { allowed: true };}
  return {
    allowed: false,
    reason:
      `Method ${upper} is a write to an unregistered URL. Register the target as a ` +
      `service with a write_methods opt-in, or open the trust mode (human-only).`,
  };
}

/**
 * Anything that can carry credential plaintext into a request: a registered
 * service's resolved auth, or a caller's per-request `auth` override. Both
 * reach the outgoing headers, so both must be redacted out of the response.
 */
export interface SecretBearingAuth {
  token?: unknown;
  key?: unknown;
  username?: unknown;
  password?: unknown;
  access_token?: unknown;
  refresh_token?: unknown;
  client_secret?: unknown;
  headers?: Record<string, unknown>;
}

/**
 * Rule 5, collect the secret plaintext values that must never be echoed.
 * Draws from every auth source ACTUALLY applied to the request: bearer/session/
 * oauth tokens, api keys, basic passwords (and the base64 pair), custom header
 * values, and client secrets. Only non-trivial values (length ≥ 4) are kept so
 * redaction can never blank out an empty string and eat the whole response.
 * @param auths - each auth applied to the request, service or per-request
 */
export function collectSecretValues(
  ...auths: Array<SecretBearingAuth | ServiceAuth | undefined>
): string[] {
  const out = new Set<string>();
  const add = (v: unknown): void => {
    if (typeof v === 'string' && v.trim().length >= 4) {out.add(v);}
  };

  for (const auth of auths) {
    if (!auth) {continue;}

    add(auth.token);
    add(auth.key);
    add(auth.password);
    add(auth.access_token);
    add(auth.refresh_token);
    add(auth.client_secret);

    if (typeof auth.username === 'string' && typeof auth.password === 'string') {
      add(Buffer.from(`${auth.username}:${auth.password}`, 'utf-8').toString('base64'));
    }

    if (auth.headers) {
      for (const value of Object.values(auth.headers)) {add(value);}
    }
  }

  return [...out];
}

const REDACTION = '***REDACTED***';

/** Redact every known secret substring from a single string. */
export function redactString(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret) {continue;}
    out = out.split(secret).join(REDACTION);
  }
  return out;
}

/**
 * Redact known secrets from an arbitrary echoed value (deep). Strings are
 * scrubbed; objects/arrays are walked; other primitives pass through.
 * @param value - the value about to be echoed in a response
 * @param secrets - the secret plaintexts to strip
 */
export function redactValue(value: unknown, secrets: string[]): unknown {
  if (secrets.length === 0) {return value;}
  if (typeof value === 'string') {return redactString(value, secrets);}
  if (Array.isArray(value)) {return value.map((v) => redactValue(v, secrets));}
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(v, secrets);
    }
    return out;
  }
  return value;
}
