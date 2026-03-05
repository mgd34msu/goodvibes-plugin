/**
 * Context Injector — assembles dynamic runtime context for injection into
 * agent system messages.
 *
 * Gathers workflow state, agent roster, and budget status from available
 * subsystems and formats them as concise Markdown sections.
 *
 * Fail-safe: individual source failures return partial context rather than
 * propagating errors.
 */

import { createLogger } from '../../shared/logger.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import type { AgentCoordinator } from '../agents/agent-coordinator.js';
import type { ExecutorBudgetManager } from '../executor/executor-budget.js';
import type { ContextSource, ContextInjectionConfig } from '../../shared/config.js';

export type { ContextSource, ContextInjectionConfig };

const logger = createLogger('context-injector');

/** Result returned by getContext(). */
export interface ContextResult {
  /** Assembled Markdown context string. Empty when disabled or no sources. */
  context: string;
  /** Priority for ordering context relative to other injected content. */
  priority: number;
}

/** Optional dependencies for each context source. */
interface ContextInjectorDeps {
  workflowEngine?: WorkflowEngine;
  agentCoordinator?: AgentCoordinator;
  budgetManager?: ExecutorBudgetManager;
}

/**
 * Assembles dynamic runtime context from available subsystems.
 *
 * Each source is gathered independently; a failure in one source does not
 * prevent other sources from contributing context.
 */
export class ContextInjector {
  private static readonly DEFAULT_PRIORITY = 5;
  private readonly config: ContextInjectionConfig;
  private readonly workflowEngine: WorkflowEngine | undefined;
  private readonly agentCoordinator: AgentCoordinator | undefined;
  private readonly budgetManager: ExecutorBudgetManager | undefined;

  constructor(config: ContextInjectionConfig, deps?: ContextInjectorDeps) {
    this.config = config;
    this.workflowEngine = deps?.workflowEngine;
    this.agentCoordinator = deps?.agentCoordinator;
    this.budgetManager = deps?.budgetManager;
  }

  /**
   * Gather and assemble context from configured sources.
   *
   * @returns Assembled context string and its priority. Returns empty context
   *   when disabled or all sources are unavailable/empty.
   */
  getContext(): ContextResult {
    if (!this.config.enabled) {
      return { context: '', priority: 0 };
    }

    const sections: string[] = [];

    for (const source of this.config.include) {
      try {
        const section = this.gatherSource(source);
        if (section) {
          sections.push(section);
        }
      } catch (err: unknown) {
        logger.warn('Context source failed — skipping', {
          source,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const context = sections.join('\n\n');
    return { context, priority: context.length > 0 ? ContextInjector.DEFAULT_PRIORITY : 0 };
  }

  /** Gather a single context source and return a Markdown section string. */
  private gatherSource(source: ContextSource): string {
    switch (source) {
      case 'workflow_state':
        return this.gatherWorkflowState();
      case 'agent_roster':
        return this.gatherAgentRoster();
      case 'budget_status':
        return this.gatherBudgetStatus();
      default:
        return '';
    }
  }

  /** Gather active workflow state summary. */
  private gatherWorkflowState(): string {
    if (!this.workflowEngine) return '';

    const instances = this.workflowEngine.getActiveInstances();
    if (instances.length === 0) return '';

    const lines: string[] = ['## Active Workflows'];
    for (const inst of instances) {
      const ctx = inst.context as Record<string, unknown>;
      const score = typeof ctx['score'] === 'number' ? ` | score: ${ctx['score']}` : '';
      const attempts = typeof ctx['fix_attempts'] === 'number'
        ? ` | attempts: ${ctx['fix_attempts']}`
        : '';
      const maxAttempts = typeof ctx['max_fix_attempts'] === 'number'
        ? `/${ctx['max_fix_attempts']}`
        : '';
      lines.push(
        `- \`${inst.id}\` state: **${inst.current_state}** (${inst.definition_id})${score}${attempts}${maxAttempts}`,
      );
    }
    return lines.join('\n');
  }

  /** Gather running agent roster. */
  private gatherAgentRoster(): string {
    if (!this.agentCoordinator) return '';

    const agents = this.agentCoordinator.listActive();
    if (agents.length === 0) return '';

    const lines: string[] = ['## Active Agents'];
    for (const agent of agents) {
      const phase = agent.workflow_phase ? ` (${agent.workflow_phase})` : '';
      lines.push(`- \`${agent.id}\` type: ${agent.type} | status: **${agent.status}**${phase}`);
    }
    return lines.join('\n');
  }

  /** Gather executor budget status. */
  private gatherBudgetStatus(): string {
    if (!this.budgetManager) return '';

    const spending = this.budgetManager.getSpending();
    const canProcess = this.budgetManager.canProcess();
    const status = canProcess ? 'ok' : '**EXCEEDED**';

    const lines = [
      '## Budget Status',
      `- Total spent: $${spending.total_usd.toFixed(4)} | Daily: $${spending.daily_usd.toFixed(4)} | Status: ${status}`,
    ];
    return lines.join('\n');
  }
}
