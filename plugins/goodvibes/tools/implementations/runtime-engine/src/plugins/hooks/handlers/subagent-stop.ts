/**
 * SubagentStop Handler
 *
 * Applies quality gates for reviewer agents and emits agent:completed events
 * to advance WRFC workflow state.
 */

import type { HookEvent } from '../../../extensions/events/hook-event.js';
import type { ClaudeHookResponse } from '../hook-processor.js';
import type { EventBus } from '../../../events/event-bus.js';
import type { AgentWorkflowMap } from '../../../directives/agent-workflow-map.js';
import { createLogger } from '../../../shared/logger.js';

const logger = createLogger('handler:subagent-stop');

/**
 * Minimum review score required to pass the quality gate.
 * TODO: Import from shared WRFC config when integration layer is wired.
 */
const DEFAULT_MIN_REVIEW_SCORE = 9.5;

/** Agent types that produce reviewable scores. */
const REVIEWER_AGENT_TYPES = new Set(['reviewer', 'goodvibes:reviewer']);

export interface SubagentStopDeps {
  eventBus: EventBus | null;
  agentWorkflowMap: AgentWorkflowMap | null;
  /** Minimum review score from WRFC config. Defaults to DEFAULT_MIN_REVIEW_SCORE. */
  minReviewScore?: number;
}

/**
 * Creates a SubagentStop handler.
 *
 * For reviewer agents: checks the review score from the <gv> output tag.
 * If below threshold, blocks the stop (forces the reviewer to redo).
 *
 * For all agents: emits agent:completed to the event bus so WRFC triggers fire.
 */
export function createSubagentStopHandler(
  deps: SubagentStopDeps,
): (event: HookEvent, input: Record<string, unknown>) => Promise<ClaudeHookResponse | null> {
  return async function handleSubagentStop(
    _event: HookEvent,
    input: Record<string, unknown>,
  ): Promise<ClaudeHookResponse | null> {
    const agentId = typeof input['agent_id'] === 'string' ? input['agent_id'] : 'unknown';
    const agentType = typeof input['agent_type'] === 'string' ? input['agent_type'] : 'unknown';
    const output = typeof input['output'] === 'string' ? input['output'] : '';

    logger.debug('SubagentStop', { agentId, agentType });

    // ── Quality gate for reviewers ──────────────────────────────────────────
    if (REVIEWER_AGENT_TYPES.has(agentType)) {
      const score = extractReviewScore(output);
      const minScore = deps.minReviewScore ?? DEFAULT_MIN_REVIEW_SCORE;

      if (score !== null && score < minScore) {
        logger.info('Quality gate: review score below threshold', {
          agentId,
          agentType,
          score,
          minScore,
        });
        return {
          decision: 'block',
          reason: `Review score ${score} is below minimum required score of ${minScore}. The reviewer must re-evaluate.`,
        };
      }
    }

    // ── Emit agent:completed ────────────────────────────────────────────────
    if (deps.eventBus) {
      try {
        deps.eventBus.emit({
          id: `evt_subagent_stop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          type: 'agent:completed',
          source: { kind: 'hook', hook_name: 'subagent_stop' },
          payload: {
            type: 'agent:completed',
            data: {
              agent_id: agentId,
              agent_type: agentType,
              output,
              workflow_id: deps.agentWorkflowMap?.lookup(agentId) ?? null,
            },
          },
          metadata: { session_id: _event.session_id },
        });
      } catch (err) {
        logger.warn('Failed to emit agent:completed', {
          agentId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return null;
  };
}

/**
 * Extract the numeric review score from a <gv> tag in agent output.
 * Returns null if no score is found.
 */
function extractReviewScore(output: string): number | null {
  try {
    // Look for <gv>{..."score":N...}</gv> pattern
    const match = output.match(/<gv>([\s\S]*?)<\/gv>/);
    if (!match || !match[1]) return null;
    const data = JSON.parse(match[1]) as Record<string, unknown>;
    const score = data['score'];
    if (typeof score === 'number') return score;
    return null;
  } catch {
    return null;
  }
}
