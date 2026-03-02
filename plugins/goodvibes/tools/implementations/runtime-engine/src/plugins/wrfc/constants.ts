/**
 * WRFC Agent Type Constants — WRFC Plugin (Layer 3)
 *
 * Canonical definitions for all WRFC-related agent type sets.
 * These constants are WRFC-domain-specific and belong in L3.
 * Do NOT define these constants locally in any other file.
 */

/** Agent types that produce code and must be reviewed */
export const ENGINEER_AGENT_TYPES = new Set<string>([
  'engineer', 'goodvibes:engineer',
  'goodvibes:tester',
  'goodvibes:integrator-ai',
  'goodvibes:integrator-services',
  'goodvibes:integrator-state',
]);

/** Agent types that perform reviews */
export const REVIEWER_AGENT_TYPES = new Set<string>(['reviewer', 'goodvibes:reviewer']);

/** Agent types that auto-complete without review (utility/exploration agents) */
export const AUTO_COMPLETE_AGENT_TYPES = new Set<string>([
  'Explore', 'explore',
  'Plan', 'plan',
  'Bash', 'bash',
  'general-purpose',
  'goodvibes:architect',
  'goodvibes:planner',
  'goodvibes:deployer',
  ...REVIEWER_AGENT_TYPES,
]);

/** Case-insensitive agent type matching helper */
export function matchesAgentType(agentType: string | undefined, typeSet: Set<string>): boolean {
  if (!agentType) return false;
  if (typeSet.has(agentType)) return true;
  const lower = agentType.toLowerCase();
  for (const entry of typeSet) {
    if (entry.toLowerCase() === lower) return true;
  }
  return false;
}

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
