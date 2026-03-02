/**
 * Core Matching — Barrel Exports
 *
 * NOTE: TriggerRegistry is NOT re-exported from this barrel.
 * The canonical (unified) TriggerRegistry lives in core/trigger-registry.ts
 * and is exported from core/index.ts. Exporting it here would cause TS2308
 * (duplicate export) since core/index.ts exports both core/trigger-registry.js
 * and core/matching/index.js.
 *
 * MatchResult (L1 match result type) is exported for consumers that need it.
 */

export type { MatchResult } from './trigger-registry.js';
export * from './error-handler.js';
