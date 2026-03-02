/**
 * Core Matching — Barrel Exports
 *
 * NOTE: TriggerRegistry is NOT re-exported from this barrel.
 * The canonical (unified) TriggerRegistry lives in core/trigger-registry.ts
 * and is exported from core/index.ts. Exporting it here would cause TS2308
 * (duplicate export) since core/index.ts exports both core/trigger-registry.js
 * and core/matching/index.js.
 */

export * from './error-handler.js';
