/**
 * Normalizer Registry — External Events Plugin (Layer 3)
 *
 * Manages payload normalizers keyed by source name.
 * Falls back to 'generic' when no specific normalizer is registered.
 */

import { ExternalEvent } from '../../../extensions/events/factories.js';
import { normalizeGithub } from './github.js';
import { normalizeGeneric } from './generic.js';
import { normalizeSlack } from './slack.js';
import { normalizeCI } from './ci.js';

// ─── Normalizer Type ──────────────────────────────────────────────────────────

/**
 * A function that converts a raw payload into an ExternalEvent.
 * The headers parameter carries HTTP headers (for webhook sources).
 */
export type Normalizer = (
  rawPayload: unknown,
  headers?: Record<string, string>,
) => ExternalEvent;

// ─── NormalizerRegistry Class ─────────────────────────────────────────────────

/**
 * Registry for payload normalizers keyed by source name.
 */
export class NormalizerRegistry {
  private normalizers = new Map<string, Normalizer>();

  /**
   * Register a normalizer for a given source name.
   * Overwrites any existing normalizer for that source.
   */
  register(source: string, normalizer: Normalizer): void {
    this.normalizers.set(source, normalizer);
  }

  /**
   * Retrieve a normalizer by source name. Returns undefined if not found.
   */
  get(source: string): Normalizer | undefined {
    return this.normalizers.get(source);
  }

  /**
   * Unregister a normalizer. Returns true if it existed.
   */
  unregister(source: string): boolean {
    return this.normalizers.delete(source);
  }

  /**
   * Normalize a payload using the registered normalizer for the given source.
   * Falls back to 'generic' if no source-specific normalizer is registered.
   * The generic normalizer is always available as a fallback.
   */
  normalize(
    source: string,
    rawPayload: unknown,
    headers?: Record<string, string>,
  ): ExternalEvent {
    const normalizer = this.normalizers.get(source);
    if (normalizer !== undefined) {
      return normalizer(rawPayload, headers);
    }
    // No source-specific normalizer registered — fall back to generic,
    // preserving the original source identity.
    return normalizeGeneric(rawPayload, source, headers);
  }

  /**
   * Returns all registered source names.
   */
  sources(): string[] {
    return Array.from(this.normalizers.keys());
  }

  /**
   * Alias for `sources()`. Returns all registered source names.
   */
  listNormalizers(): string[] {
    return this.sources();
  }
}

// ─── Default Registry Factory ─────────────────────────────────────────────────

/**
 * Creates a NormalizerRegistry pre-populated with built-in normalizers.
 *
 * Registered normalizers:
 * - 'github'  — GitHub webhook normalization
 * - 'slack'   — Slack event API / webhook normalization
 * - 'ci'      — CI/CD provider normalization (GitHub Actions, GitLab CI, CircleCI, etc.)
 * - 'generic' — Passthrough fallback for unknown sources
 */
export function createDefaultRegistry(): NormalizerRegistry {
  const registry = new NormalizerRegistry();
  registry.register('github', normalizeGithub);
  registry.register('slack', normalizeSlack);
  registry.register('ci', (rawPayload, headers) => normalizeCI(rawPayload, headers));
  // Wrap normalizeGeneric to match the Normalizer signature (source is implicit from registry key)
  registry.register('generic', (rawPayload, headers) =>
    normalizeGeneric(rawPayload, 'generic', headers),
  );
  return registry;
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { normalizeGithub } from './github.js';
export { normalizeGeneric } from './generic.js';
export { normalizeSlack } from './slack.js';
export { normalizeCI } from './ci.js';
