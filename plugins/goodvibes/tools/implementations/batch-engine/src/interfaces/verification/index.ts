/**
 * Verification interfaces index
 * @see SPEC-v2 Sections 13-15, Appendices
 *
 * Re-exports all verification interfaces for convenient importing.
 * Each module covers a specific SPEC-v2 section:
 *
 * - tools-files: Sections 13-15 (Tools, Files, Examples)
 * - architecture: Sections 4-6 (Architecture, Precision Engine)
 * - batch-operations: Sections 5-6 (Batch Operations)
 * - lifecycle-context: Sections 7-8 (Lifecycle, Context)
 * - telemetry-recovery: Sections 9-11 (Telemetry, Recovery)
 */

// Tools, Files, Examples verification (Sections 13-15)
export * from './tools-files.js';

// Architecture verification (Sections 4-6)
export * from './architecture.js';

// Batch operations verification (Sections 5-6)
export * from './batch-operations.js';

// Lifecycle and context verification (Sections 7-8)
export * from './lifecycle-context.js';

// Telemetry and recovery verification (Sections 9-11)
export * from './telemetry-recovery.js';

// Philosophy verification (Appendix)
export * from './philosophy.js';
