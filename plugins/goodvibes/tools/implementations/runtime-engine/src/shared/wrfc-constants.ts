/**
 * WRFC Agent Type Constants — Shared Layer
 *
 * Canonical definitions for all WRFC-related agent type sets.
 * Imported by extensions and plugins layers. Do NOT define these
 * constants locally in any other file.
 */

/** Agent types that produce code and must be reviewed */
export const ENGINEER_AGENT_TYPES = new Set<string>(['engineer', 'goodvibes:engineer']);

/** Agent types that perform reviews */
export const REVIEWER_AGENT_TYPES = new Set<string>(['reviewer', 'goodvibes:reviewer']);

/** Agent types that auto-complete without review (utility/exploration agents) */
export const AUTO_COMPLETE_AGENT_TYPES = new Set<string>([
  'Explore', 'Plan', 'Bash', 'general-purpose',
  ...REVIEWER_AGENT_TYPES,
]);

/**
 * Agent types that MUST always be reviewed (Layer 0 force-review).
 * Takes precedence over AUTO_COMPLETE_AGENT_TYPES.
 * Can be extended at runtime via config `wrfc.require_review_types`.
 */
export const REQUIRE_REVIEW_AGENT_TYPES = new Set<string>([...ENGINEER_AGENT_TYPES]);

/** Default minimum score a review must reach for auto-complete */
export const DEFAULT_MIN_REVIEW_SCORE = 9.5;

/**
 * Workflow states that are considered "early" / not yet processing.
 * Used to treat stuck workflows as WRITING for routing purposes.
 */
export const EARLY_WORKFLOW_STATES = new Set(['IDLE', 'GATHERING', 'PLANNING']);
