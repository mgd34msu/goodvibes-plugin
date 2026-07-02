/**
 * `api_request` — the HTTP half of the v1 precision-fetch split (§4.4.4).
 *
 * REBUILT (not straight-ported): the page-reading stack retired (WebFetch won),
 * so this is a lean, honest HTTP client under the connect trust boundary. The
 * §1.8 fixes are wired in:
 *  - per-entry error isolation: one malformed spec fails only its own entry;
 *  - the 401-retry carries its OWN timeout (a fresh AbortController), so a stuck
 *    retry can never hang the batch;
 *  - response capping via the shared token budget;
 *  - honest extract names — json | text | headers | status, nothing called
 *    "summary";
 *  - a `mode: restricted|open` envelope stamp and a redaction pass that strips
 *    known secret values from echoed responses.
 *  - F8 lesson: a body carrying BOTH plain and base64 forms is accepted (base64
 *    preferred with a warning), never rejected.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  successEnvelope,
  toCallToolResult,
  startTimer,
  estimatePayloadTokens,
  utf8SafeSlice,
  type Envelope,
} from '@goodvibes/core/envelope';
import { loadConfig } from '@goodvibes/core/config';
import { withBudget } from '@goodvibes/core/proc';
import { buildRequest, type RequestSpec, type RequestAuth } from '../fetch/request-builder.js';
import { rateLimitedFetch } from '../fetch/rate-limiter.js';
import { applyAuth, handleAuthFailure } from '../fetch/auth/auth-orchestrator.js';
import { getFetchServices } from '../fetch/service-registry.js';
import { getAllowlist } from '../fetch/service-registry.js';
import {
  originOf,
  isDestinationAllowed,
  isMethodAllowed,
  isCredentialAttachAllowed,
  collectSecretValues,
  redactValue,
  type TrustMode,
} from '../trust.js';

/** Honest extract modes — each named for exactly what it returns. */
export type ExtractMode = 'json' | 'text' | 'headers' | 'status';

/** Body forms accepted for a request entry. */
export interface BodySpec {
  type: 'json' | 'form' | 'text' | 'multipart';
  data: Record<string, unknown> | string;
}

/** A single request entry in the batch. */
export interface RequestEntry {
  /** Result key. Falls back to the entry's array index when omitted. */
  id?: string;
  /** Registered service name (credentials pin to its origin). */
  service?: string;
  /** Path relative to the service base_url. */
  path?: string;
  /** Absolute URL for an unregistered target (allowlist applies). */
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  /** Structured body ({ type, data }). */
  body?: BodySpec;
  /** Legacy plain string body (F8 alternate of body_base64). */
  body_plain?: string;
  /** Base64 body (F8 alternate; preferred when both are present). */
  body_base64?: string;
  /** Per-request auth override (caller-supplied; not origin-pinned). */
  auth?: RequestAuth;
  timeout_ms?: number;
  extract?: ExtractMode;
}

/** The input to `api_request`. */
export interface ApiRequestInput {
  requests: RequestEntry[];
  output?: { max_tokens?: number };
}

/** A single per-entry result. */
interface RequestOutcome {
  status: number | null;
  resolved_url: string | null;
  body?: unknown;
  headers?: Record<string, string>;
  truncated: boolean;
  error: string | null;
  /** Advisory (e.g. the F8 both-body-forms notice). */
  warning?: string;
}

/** The tool descriptor (schema deferred by the client). */
export const apiRequestTool = {
  name: 'api_request',
  description:
    'Make one or more HTTP requests under the connect trust boundary. Credentials ' +
    'attach only to their registered service origin; unregistered destinations are ' +
    'gated by a default-on allowlist; write methods require a per-service opt-in. ' +
    'Results are keyed per entry with error isolation; extract is json | text | ' +
    'headers | status.',
  inputSchema: {
    type: 'object',
    properties: {
      requests: {
        type: 'array',
        description: 'The batch of requests. Each result is keyed by id (or array index).',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Result key (defaults to the array index).' },
            service: { type: 'string', description: 'Registered service name.' },
            path: { type: 'string', description: 'Path relative to the service base_url.' },
            url: { type: 'string', description: 'Absolute URL for an unregistered target.' },
            method: { type: 'string', description: 'HTTP method (default GET).' },
            headers: { type: 'object', additionalProperties: { type: 'string' } },
            params: { type: 'object', description: 'Query parameters.' },
            body: {
              type: 'object',
              description: 'Structured body.',
              properties: {
                type: { type: 'string', enum: ['json', 'form', 'text', 'multipart'] },
                data: {},
              },
              required: ['type', 'data'],
            },
            body_plain: { type: 'string', description: 'Plain body (alternate of body_base64).' },
            body_base64: {
              type: 'string',
              description: 'Base64 body (alternate of body_plain; preferred when both present).',
            },
            timeout_ms: { type: 'number' },
            extract: { type: 'string', enum: ['json', 'text', 'headers', 'status'] },
          },
        },
      },
      output: {
        type: 'object',
        properties: { max_tokens: { type: 'number' } },
      },
    },
    required: ['requests'],
  },
} as const;

/** fetch with its OWN abort timeout — reused by the main call and the 401 retry. */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await rateLimitedFetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Map a request entry to the internal RequestSpec (F8 body handling). */
function toRequestSpec(entry: RequestEntry): { spec: RequestSpec; warning?: string } {
  const spec: RequestSpec = {
    url: entry.url ?? entry.path ?? '',
    method: entry.method,
    headers: entry.headers,
    params: entry.params,
    service: entry.service,
    auth: entry.auth,
    timeout_ms: entry.timeout_ms,
  };

  let warning: string | undefined;

  // F8 lesson: plain and encoded body forms are mutually-exclusive alternates,
  // not a required-plus-escape-hatch pair. Accept both; prefer base64, warn.
  const hasPlain = typeof entry.body_plain === 'string';
  const hasBase64 = typeof entry.body_base64 === 'string';
  if (hasPlain && hasBase64) {
    spec.body_base64 = entry.body_base64;
    warning =
      'Both body_plain and body_base64 were provided; using body_base64 (the two are ' +
      'mutually-exclusive alternates).';
  } else if (hasBase64) {
    spec.body_base64 = entry.body_base64;
  } else if (hasPlain) {
    spec.body = entry.body_plain;
  }

  if (entry.body) {
    // Structured body wins over the legacy plain/base64 fields.
    spec.body_type = entry.body.type === 'text' ? 'raw' : entry.body.type;
    spec.body_data = entry.body.data;
    spec.body_base64 = undefined;
    spec.body = undefined;
  }

  return { spec, warning };
}

/** Extract the response into the honest requested representation. */
async function extractResponse(
  response: Response,
  extract: ExtractMode,
): Promise<{ body?: unknown; headers?: Record<string, string> }> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  switch (extract) {
    case 'status':
      return {};
    case 'headers':
      return { headers };
    case 'text':
      return { body: await response.text() };
    case 'json':
    default: {
      const text = await response.text();
      try {
        return { body: JSON.parse(text) as unknown };
      } catch {
        return {
          body: {
            _parse_error: 'Response was not valid JSON; returning raw text.',
            text,
          },
        };
      }
    }
  }
}

/** Run one entry with full error isolation. Never throws. */
async function runEntry(entry: RequestEntry, mode: TrustMode): Promise<RequestOutcome> {
  const { spec, warning } = toRequestSpec(entry);

  if (!spec.url) {
    return {
      status: null,
      resolved_url: null,
      truncated: false,
      error: 'Each request needs a service+path or an absolute url.',
    };
  }

  let built;
  try {
    built = await buildRequest(spec);
  } catch (e) {
    return {
      status: null,
      resolved_url: null,
      truncated: false,
      error: e instanceof Error ? e.message : String(e),
      warning,
    };
  }

  const finalUrl = built.url;
  const method = built.method.toUpperCase();
  const hasService = !!built.service;

  // Trust rule 2 — destination allowlist (default-on in restricted mode).
  const services = getFetchServices();
  const registeredOrigins = Object.values(services)
    .map((s) => originOf(s.base_url))
    .filter((o): o is string => o !== null);
  const destDecision = isDestinationAllowed(finalUrl, {
    mode,
    registeredOrigins,
    allowlist: getAllowlist(),
  });
  if (!destDecision.allowed) {
    return { status: null, resolved_url: finalUrl, truncated: false, error: destDecision.reason ?? 'Destination denied.', warning };
  }

  // Trust rule 3 — per-service read-only default with write opt-in.
  const methodDecision = isMethodAllowed(method, {
    mode,
    hasService,
    writeMethods: built.service?.config.write_methods,
  });
  if (!methodDecision.allowed) {
    return { status: null, resolved_url: finalUrl, truncated: false, error: methodDecision.reason ?? 'Method denied.', warning };
  }

  // Trust rule 1 — attach service credentials ONLY on an origin match. Open mode
  // cannot loosen this; it only widens the destination allowlist.
  const pinnedOk = hasService && isCredentialAttachAllowed(finalUrl, built.service!.config.base_url);
  try {
    if (pinnedOk) {
      await applyAuth(built.headers, finalUrl, undefined, built.service!.name);
    } else {
      // No service credentials cross origins; cookies still follow their own domain rules.
      await applyAuth(built.headers, finalUrl, undefined, undefined);
    }
  } catch {
    // Auth application is best-effort; a failure must not abort the request.
  }

  const timeoutMs = built.timeout_ms;
  const extract = entry.extract ?? 'json';

  const fetchOptions: RequestInit = { method, headers: { ...built.headers } };
  if (method !== 'GET' && method !== 'HEAD' && built.body !== undefined) {
    fetchOptions.body = built.body;
  }

  try {
    let response = await fetchWithTimeout(finalUrl, fetchOptions, timeoutMs);

    // 401 recovery — bounded to one retry, with its OWN fresh timeout (§1.8).
    if (response.status === 401 && pinnedOk) {
      try {
        const recovery = await handleAuthFailure(response, built.service!.name);
        if (recovery.retry) {
          await applyAuth(built.headers, finalUrl, undefined, built.service!.name);
          response = await fetchWithTimeout(
            finalUrl,
            { ...fetchOptions, headers: { ...built.headers } },
            timeoutMs,
          );
        }
      } catch {
        // Recovery failed — keep the original 401 response.
      }
    }

    const extracted = await extractResponse(response, extract);

    // Trust rule 5 — redact known secret values from the echoed response.
    const secrets = collectSecretValues(built.service?.auth);
    const body = extracted.body !== undefined ? redactValue(extracted.body, secrets) : undefined;
    const headers = extracted.headers
      ? (redactValue(extracted.headers, secrets) as Record<string, string>)
      : undefined;

    return {
      status: response.status,
      resolved_url: finalUrl,
      ...(body !== undefined ? { body } : {}),
      ...(headers ? { headers } : {}),
      truncated: false,
      error: response.ok ? null : `HTTP ${response.status} ${response.statusText}`.trim(),
      warning,
    };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const isTimeout = err.name === 'AbortError';
    return {
      status: null,
      resolved_url: finalUrl,
      truncated: false,
      error: isTimeout ? `Request timed out after ${timeoutMs}ms` : err.message,
      warning,
    };
  }
}

/**
 * Trim result bodies until the rendered envelope fits `maxTokens`. Over-budget
 * bodies collapse to a (truncated) string form with the entry's `truncated`
 * flag set; within-budget bodies keep their natural shape.
 */
function capToBudget(
  results: Record<string, RequestOutcome>,
  mode: TrustMode,
  maxTokens: number,
): { truncated: boolean } {
  const render = (): number =>
    estimatePayloadTokens(JSON.stringify({ mode, results }));

  if (render() <= maxTokens) return { truncated: false };

  let trimmedAny = false;
  for (let i = 0; i < 64; i++) {
    const est = render();
    if (est <= maxTokens) break;

    // Pick the entry whose serialized body is largest.
    let pickKey: string | null = null;
    let pickLen = 0;
    for (const [key, r] of Object.entries(results)) {
      if (r.body === undefined) continue;
      const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
      if (text.length > pickLen) {
        pickLen = text.length;
        pickKey = key;
      }
    }
    if (pickKey === null || pickLen === 0) break;

    const r = results[pickKey];
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    const over = est - maxTokens;
    const cutChars = Math.max(Math.ceil(over * 3.5), 16);
    const newLen = Math.max(0, text.length - cutChars);
    r.body = utf8SafeSlice(text, newLen);
    r.truncated = true;
    trimmedAny = true;
  }

  return { truncated: trimmedAny };
}

/** Execute the `api_request` batch and return an MCP result. */
export async function handleApiRequest(args: unknown): Promise<CallToolResult> {
  const elapsed = startTimer();
  const cfg = loadConfig();
  const mode = cfg.mode;
  const input = (args ?? {}) as Partial<ApiRequestInput>;

  if (!input.requests || !Array.isArray(input.requests) || input.requests.length === 0) {
    const env: Envelope = {
      success: false,
      error: 'api_request requires a non-empty `requests` array.',
      meta: { token_estimate: 0, mode, execution_ms: elapsed() },
    };
    return toCallToolResult(env);
  }

  const entries = input.requests;
  const maxTokens = input.output?.max_tokens ?? cfg.max_tokens_default;
  const budgetMs = cfg.budgets.http_max_ms + 5000;

  const outcome = await withBudget(budgetMs, async () => {
    // Each entry is isolated: a rejection in one cannot fail the batch.
    const settled = await Promise.all(
      entries.map((entry) =>
        runEntry(entry, mode).catch((e) => ({
          status: null,
          resolved_url: null,
          truncated: false,
          error: e instanceof Error ? e.message : String(e),
        })) as Promise<RequestOutcome>,
      ),
    );
    const results: Record<string, RequestOutcome> = {};
    settled.forEach((res, i) => {
      const key = entries[i].id ?? String(i);
      results[key] = res;
    });
    return results;
  });

  const results = outcome.value;
  const cap = capToBudget(results, mode, maxTokens);

  const env = successEnvelope(
    { mode, results },
    {
      mode,
      execution_ms: elapsed(),
      budget_exceeded: outcome.budget_exceeded || undefined,
      truncated: cap.truncated || undefined,
      effective_caps: cap.truncated ? { max_tokens: maxTokens } : undefined,
    },
  );
  return toCallToolResult(env);
}
