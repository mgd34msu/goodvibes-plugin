/**
 * Directive Builder
 *
 * Functions that construct structured <gv> directive strings for the orchestrator.
 * These messages are injected into the hook's system prompt to instruct the
 * orchestrator to take the appropriate next action in the WRFC chain.
 *
 * Format: <gv>{"action":"...","wid":"...", ...}</gv>
 * The orchestrator parses these mechanically -- no LLM interpretation needed.
 */

/**
 * Context supplied to the spawn directive builder. All fields are optional;
 * missing fields are omitted from the generated message.
 */
export interface SpawnDirectiveContext {
  /** Paths of files modified during the previous phase. */
  files_modified?: string[];
  /** Score from the most recent review (0-10). */
  review_score?: number;
  /** Issues identified by the reviewer. */
  review_issues?: Array<{
    dimension: string;
    severity: string;
    description: string;
  }>;
  /** Number of fix attempts already made. */
  fix_attempts?: number;
  /** Maximum allowed fix attempts. */
  max_fix_attempts?: number;
  /** ID of the current workflow instance. */
  workflow_id?: string;
}

/**
 * Typed structure for a spawn directive emitted to the orchestrator.
 */
interface SpawnDirective {
  action: 'spawn';
  wid: string;
  type: string;
  task: string;
}

/**
 * Build a structured <gv> spawn directive instructing the orchestrator to
 * spawn an agent of the given type.
 *
 * @param agentType  - Short agent type label (e.g. "reviewer", "engineer").
 * @param task       - Task description/instructions for the spawned agent.
 * @param budget     - Token and turn budget. Not emitted in the directive.
 * @deprecated The `budget` parameter is unused and will be removed in v2.
 *   Pass `undefined` for new call sites.
 * @param context    - Optional WRFC context (files, score, issues, attempts).
 * @returns Structured <gv> directive string.
 */
export function buildSpawnDirectiveMessage(
  agentType: string,
  task: string,
  budget?: { max_tokens: number; max_turns: number },
  context?: SpawnDirectiveContext,
): string {
  // budget param kept for backward-compatible call signature
  void budget;

  const directive: SpawnDirective = {
    action: 'spawn',
    wid: context?.workflow_id ?? 'unknown',
    type: agentType,
    task,
  };

  return "<gv>" + JSON.stringify(directive) + "</gv>";
}

/**
 * Build a structured <gv> complete directive indicating that a workflow
 * has passed review and the WRFC chain is done.
 *
 * @param workflowId - ID of the completed workflow instance.
 * @param state      - Terminal state name. Not emitted in the directive.
 * @deprecated The `state` parameter is unused and will be removed in v2.
 *   Pass `undefined` for new call sites.
 * @returns Structured <gv> directive string.
 */
export function buildWorkflowCompleteMessage(workflowId: string, state?: string): string {
  // state param kept for backward-compatible call signature
  void state;

  const directive = {
    action: "complete",
    wid: workflowId,
  };

  return "<gv>" + JSON.stringify(directive) + "</gv>";
}

/**
 * Build a structured <gv> escalate directive indicating that the fix loop
 * has been exhausted and human intervention is required.
 *
 * @param workflowId  - ID of the workflow that exhausted its fix budget.
 * @param fixAttempts - Number of fix attempts that were made.
 * @param lastScore   - The review score from the final attempt.
 * @returns Structured <gv> directive string.
 */
export function buildEscalationMessage(
  workflowId: string,
  fixAttempts: number,
  lastScore: number,
): string {
  const directive = {
    action: "escalate",
    wid: workflowId,
    reason: fixAttempts + " fix attempts failed, last score " + lastScore + "/10",
  };

  return "<gv>" + JSON.stringify(directive) + "</gv>";
}
