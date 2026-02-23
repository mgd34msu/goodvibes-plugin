/**
 * Directive Builder
 *
 * Functions that construct system message strings for Claude. These messages
 * are injected into the hook's system prompt to instruct Claude to spawn
 * the appropriate next agent in the WRFC chain.
 */

/**
 * Context supplied to the spawn directive builder. All fields are optional;
 * missing fields are omitted from the generated message.
 */
export interface SpawnDirectiveContext {
  /** Paths of files modified during the previous phase. */
  files_modified?: string[];
  /** Score from the most recent review (0–10). */
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
 * Build a system message instructing Claude to spawn an agent of the given type.
 *
 * @param agentType  - Short agent type label (e.g. `'reviewer'`, `'engineer'`).
 * @param task       - Human-readable task description for the spawned agent.
 * @param budget     - Token and turn budget for the spawned agent.
 * @param context    - Optional WRFC context (files, score, issues, attempts).
 * @returns Formatted system message string.
 */
export function buildSpawnDirectiveMessage(
  agentType: string,
  task: string,
  budget: { max_tokens: number; max_turns: number },
  context?: SpawnDirectiveContext,
): string {
  const lines: string[] = [
    `[GoodVibes WRFC Orchestrator] ACTION REQUIRED: Spawn a ${agentType} agent.`,
    '',
    `TASK: ${task}`,
    `BUDGET: ${budget.max_tokens} tokens, ${budget.max_turns} turns`,
  ];

  if (context?.files_modified && context.files_modified.length > 0) {
    lines.push(`FILES TO REVIEW: ${context.files_modified.join(', ')}`);
  }

  if (context?.review_score !== undefined) {
    lines.push(`PREVIOUS REVIEW SCORE: ${context.review_score}/10`);
  }

  if (context?.review_issues && context.review_issues.length > 0) {
    lines.push('ISSUES TO ADDRESS:');
    for (const issue of context.review_issues) {
      lines.push(`  - [${issue.severity}] ${issue.dimension}: ${issue.description}`);
    }
  }

  if (context?.fix_attempts !== undefined && context.max_fix_attempts !== undefined) {
    lines.push(`FIX ATTEMPT: ${context.fix_attempts + 1} of ${context.max_fix_attempts}`);
  }

  lines.push('');
  lines.push(
    `Use the Task tool to spawn a goodvibes:${agentType} agent with the task description above.`,
  );
  lines.push(
    'Run it in the background. Do NOT do the work yourself -- delegate to the agent.',
  );

  return lines.join('\n');
}

/**
 * Build a system message indicating that a workflow has completed.
 *
 * @param workflowId - ID of the completed workflow instance.
 * @param state      - Terminal state name (e.g. `'completed'`).
 * @returns Formatted system message string.
 */
export function buildWorkflowCompleteMessage(workflowId: string, state: string): string {
  return [
    '[GoodVibes WRFC Orchestrator] WORKFLOW COMPLETE.',
    '',
    `Workflow ${workflowId} has reached terminal state: ${state}.`,
    'The WRFC chain has finished. No further agent spawning is required.',
  ].join('\n');
}

/**
 * Build a system message indicating that the fix loop has been exhausted
 * and human intervention is required.
 *
 * @param workflowId  - ID of the workflow that exhausted its fix budget.
 * @param fixAttempts - Number of fix attempts that were made.
 * @param lastScore   - The review score from the final attempt.
 * @returns Formatted system message string.
 */
export function buildEscalationMessage(
  workflowId: string,
  fixAttempts: number,
  lastScore: number,
): string {
  return [
    '[GoodVibes WRFC Orchestrator] ESCALATION: Fix loop exhausted.',
    '',
    `Workflow ${workflowId} has made ${fixAttempts} fix attempts without achieving a passing review score.`,
    `Last review score: ${lastScore}/10`,
    '',
    'Human intervention is required. Please review the outstanding issues manually.',
  ].join('\n');
}
