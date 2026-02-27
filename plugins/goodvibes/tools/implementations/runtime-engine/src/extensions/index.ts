/**
 * Extensions barrel — all domain extension modules.
 *
 * Re-exports events, workflow, agents, triggers, directives, executor,
 * and persistence from their respective sub-modules.
 */

// ─── Event Extensions ─────────────────────────────────────────────────────────

export * from './events/index.js';

// ─── Workflow Extensions ──────────────────────────────────────────────────────

export * from './workflow/index.js';

// ─── Agent Extensions ─────────────────────────────────────────────────────────

export * from './agents/index.js';

// ─── Trigger Extensions ───────────────────────────────────────────────────────

export * from './triggers/index.js';

// ─── Directive Extensions ─────────────────────────────────────────────────────

export * from './directives/index.js';

// ─── Executor Extensions ──────────────────────────────────────────────────────

export * from './executor/index.js';

// ─── Persistence Extensions ───────────────────────────────────────────────────

export * from './persistence/index.js';
