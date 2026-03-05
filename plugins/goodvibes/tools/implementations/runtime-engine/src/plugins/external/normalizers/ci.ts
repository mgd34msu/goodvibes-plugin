/**
 * CI Normalizer — External Events Plugin (Layer 3)
 *
 * Normalizes CI/CD webhook payloads from various providers
 * (GitHub Actions, GitLab CI, CircleCI, Jenkins, etc.) into ExternalEvents.
 */

import { ExternalEvent, createExternalEvent } from '../../../extensions/events/factories.js';

interface CIPayload {
  // Common fields across providers
  status?: string;
  state?: string;
  conclusion?: string;
  result?: string;
  // Branch/commit info
  branch?: string;
  ref?: string;
  commit?: string;
  sha?: string;
  head_sha?: string;
  // Provider-specific
  workflow_run?: { conclusion?: string; head_branch?: string; head_sha?: string; name?: string };
  build?: { status?: string; branch?: { name?: string }; vcs_revision?: string };
  object_attributes?: { status?: string; ref?: string; sha?: string };
  [key: string]: unknown;
}

function detectProvider(payload: CIPayload, headers?: Record<string, string>): string {
  if (headers?.['x-github-event'] === 'workflow_run') return 'github_actions';
  if (headers?.['x-gitlab-event'] !== undefined) return 'gitlab_ci';
  if (payload.build !== undefined && typeof payload.build === 'object') return 'circleci';
  return 'generic_ci';
}

function resolveStatus(payload: CIPayload): string {
  // GitHub Actions
  if (payload.workflow_run?.conclusion) return payload.workflow_run.conclusion;
  // GitLab CI
  if (payload.object_attributes?.status) return payload.object_attributes.status;
  // CircleCI
  if (payload.build?.status) return payload.build.status;
  // Generic
  return payload.conclusion ?? payload.status ?? payload.state ?? payload.result ?? 'unknown';
}

function resolveBranch(payload: CIPayload): string | undefined {
  return payload.workflow_run?.head_branch
    ?? payload.object_attributes?.ref
    ?? payload.build?.branch?.name
    ?? payload.branch
    ?? payload.ref;
}

function resolveCommit(payload: CIPayload): string | undefined {
  return payload.workflow_run?.head_sha
    ?? payload.object_attributes?.sha
    ?? payload.build?.vcs_revision
    ?? payload.head_sha
    ?? payload.sha
    ?? payload.commit;
}

export function normalizeCI(
  rawPayload: unknown,
  headers?: Record<string, string>,
): ExternalEvent {
  const payload: CIPayload =
    rawPayload !== null && typeof rawPayload === 'object'
      ? (rawPayload as CIPayload)
      : {};

  const provider = detectProvider(payload, headers);
  const status = resolveStatus(payload);
  const canonicalType = `webhook:ci:${provider}:${status}`;

  const branch = resolveBranch(payload);
  const commit = resolveCommit(payload);
  const normalizedPayload: Record<string, unknown> = {
    provider,
    status,
    ...(branch !== undefined && { branch }),
    ...(commit !== undefined && { commit }),
    ...(payload.workflow_run?.name !== undefined && { workflow_name: payload.workflow_run.name }),
  };

  return createExternalEvent({
    external_source: `ci_${provider}`,
    type: canonicalType,
    raw_payload: rawPayload,
    payload: normalizedPayload,
    normalized: true,
  });
}
