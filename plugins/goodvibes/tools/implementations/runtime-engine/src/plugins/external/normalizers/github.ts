/**
 * GitHub Normalizer — External Events Plugin (Layer 3)
 *
 * Normalizes GitHub webhook payloads into ExternalEvents.
 * Determines event type from the X-GitHub-Event header or payload structure.
 */

import { ExternalEvent, createExternalEvent } from '../../../extensions/events/factories.js';

// ─── GitHub Event Type Mapping ────────────────────────────────────────────────

/**
 * Maps GitHub event names + action combos to canonical type strings.
 * Falls back to 'webhook:github:<event>' when action is not present.
 */
function resolveGithubEventType(githubEvent: string, action?: string): string {
  const base = `webhook:github:${githubEvent}`;
  if (action !== undefined && action.length > 0) {
    // Sanitize action (GitHub uses underscores and lowercase already, but be safe)
    const sanitized = action.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    return `${base}:${sanitized}`;
  }
  return base;
}

// ─── GitHub Normalizer ────────────────────────────────────────────────────────

/**
 * Narrows GitHub webhook payload structure.
 * GitHub sends: { action?: string, repository?: {...}, sender?: {...}, ... }
 */
interface GithubPayload {
  action?: string;
  repository?: {
    full_name?: string;
    name?: string;
    html_url?: string;
  };
  sender?: {
    login?: string;
    type?: string;
  };
  issue?: {
    number?: number;
    title?: string;
    body?: string;
    state?: string;
    html_url?: string;
    labels?: Array<{ name?: string }>;
  };
  comment?: {
    id?: number;
    body?: string;
    html_url?: string;
  };
  pull_request?: {
    number?: number;
    title?: string;
    state?: string;
    html_url?: string;
  };
  commits?: unknown[];
  ref?: string;
  head_commit?: {
    id?: string;
    message?: string;
  };
  installation?: { id?: number };
  organization?: { login?: string };
  [key: string]: unknown;
}

/**
 * Normalizes a GitHub webhook payload into an ExternalEvent.
 *
 * Reads X-GitHub-Event header to determine event category.
 * Reads payload.action for sub-type (e.g. opened, closed, merged).
 * Extracts canonical fields into payload for easy trigger matching.
 */
export function normalizeGithub(
  rawPayload: unknown,
  headers?: Record<string, string>,
): ExternalEvent {
  const normalizedHeaders = headers ?? {};

  // GitHub event type comes from the X-GitHub-Event header
  // Node.js lowercases all incoming headers, so only the lowercase key is needed.
  const githubEvent = normalizedHeaders['x-github-event'] ?? 'unknown';

  // Safely extract structured payload
  const payload: GithubPayload =
    rawPayload !== null && typeof rawPayload === 'object'
      ? (rawPayload as GithubPayload)
      : {};

  const action = typeof payload.action === 'string' ? payload.action : undefined;
  const eventType = resolveGithubEventType(githubEvent, action);

  // Build a canonical normalized payload for trigger matching
  const normalizedPayload: Record<string, unknown> = {
    event: githubEvent,
    ...(action !== undefined && { action }),
    ...(payload.repository !== undefined && {
      repository: {
        full_name: payload.repository.full_name,
        name: payload.repository.name,
        html_url: payload.repository.html_url,
      },
    }),
    ...(payload.sender !== undefined && {
      sender: {
        login: payload.sender.login,
        type: payload.sender.type,
      },
    }),
    // Issue-specific fields
    ...(payload.issue !== undefined && {
      issue: {
        number: payload.issue.number,
        title: payload.issue.title,
        body: payload.issue.body,
        state: payload.issue.state,
        html_url: payload.issue.html_url,
        ...(Array.isArray(payload.issue.labels) && {
          labels: payload.issue.labels.map(l => l.name).filter(Boolean),
        }),
      },
    }),
    // Comment-specific fields
    ...(payload.comment !== undefined && {
      comment: {
        id: payload.comment.id,
        body: payload.comment.body,
        html_url: payload.comment.html_url,
      },
    }),
    // PR-specific fields
    ...(payload.pull_request !== undefined && {
      pull_request: {
        number: payload.pull_request.number,
        title: payload.pull_request.title,
        state: payload.pull_request.state,
        html_url: payload.pull_request.html_url,
      },
    }),
    // Push-specific fields
    ...(payload.ref !== undefined && { ref: payload.ref }),
    ...(Array.isArray(payload.commits) && { commit_count: payload.commits.length }),
    ...(payload.head_commit !== undefined && {
      head_commit: {
        id: payload.head_commit.id,
        message: payload.head_commit.message,
      },
    }),
    // Delivery ID for deduplication (from header)
    ...(normalizedHeaders['x-github-delivery'] !== undefined && {
      delivery_id: normalizedHeaders['x-github-delivery'],
    }),
  };

  return createExternalEvent({
    external_source: 'github',
    type: eventType,
    raw_payload: rawPayload,
    payload: normalizedPayload,
    normalized: true,
  });
}
