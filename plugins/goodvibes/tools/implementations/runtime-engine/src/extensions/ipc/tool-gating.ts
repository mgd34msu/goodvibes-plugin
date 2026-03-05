/**
 * Tool Gate Evaluator — evaluates ToolBlockRules to decide whether a tool
 * call should be allowed or blocked.
 *
 * Fail-open by design: any evaluation error returns { allow: true } so that
 * rule configuration bugs never silently break the agent's ability to run.
 */

import { createLogger } from '../../shared/logger.js';
import type { ExecutorBudgetManager } from '../executor/executor-budget.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import type { ToolBlockRule, ToolGatingConfig } from '../../shared/config.js';

export type { ToolBlockRule, ToolGatingConfig };

const logger = createLogger('tool-gating');

/** Result of evaluating a tool against the gate. */
export interface ToolGateResult {
  allow: boolean;
  /** Human-readable reason when allow is false. Matches protocol field name 'reason'. */
  reason?: string;
}

/** Optional dependencies for condition evaluation. */
interface ToolGateEvaluatorDeps {
  budgetManager?: ExecutorBudgetManager;
  workflowEngine?: WorkflowEngine;
}

/**
 * Evaluates ToolBlockRules against incoming tool calls.
 *
 * Rule evaluation: iterates rules in order, first match wins.
 * Fail-open: any exception during evaluation returns { allow: true }.
 */
export class ToolGateEvaluator {
  private readonly config: ToolGatingConfig;
  private readonly budgetManager: ExecutorBudgetManager | undefined;
  private readonly workflowEngine: WorkflowEngine | undefined;

  constructor(config: ToolGatingConfig, deps?: ToolGateEvaluatorDeps) {
    this.config = config;
    this.budgetManager = deps?.budgetManager;
    this.workflowEngine = deps?.workflowEngine;
  }

  /**
   * Evaluate whether the named tool should be allowed.
   *
   * @param toolName - The tool name to evaluate (e.g. 'Bash', 'precision_exec').
   * @returns { allow: true } unless a matching rule fires, in which case
   *   { allow: false, message? }. Always returns { allow: true } on error.
   */
  evaluate(toolName: string): ToolGateResult {
    try {
      // Fail-open: disabled or force-allow bypasses all rules
      if (!this.config.enabled || this.config.force_allow_all) {
        return { allow: true };
      }

      for (const rule of this.config.rules) {
        if (!this.matchesPattern(toolName, rule.tool_pattern)) {
          continue;
        }

        const fires = this.evaluateCondition(rule);
        if (fires) {
          logger.debug('Tool blocked by rule', {
            tool: toolName,
            pattern: rule.tool_pattern,
            condition: rule.condition,
          });
          return { allow: false, reason: rule.message };
        }
      }

      return { allow: true };
    } catch (err: unknown) {
      // Fail-open: any unexpected error allows the tool
      logger.warn('Tool gate evaluation error — failing open', {
        tool: toolName,
        error: err instanceof Error ? err.message : String(err),
      });
      return { allow: true };
    }
  }

  /**
   * Simple glob matching for tool patterns.
   * Supports '*' (match all), exact names, and '*' suffix/prefix wildcards.
   */
  private matchesPattern(toolName: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern === toolName) return true;
    // Support simple glob: 'prefix_*' or '*_suffix'
    if (pattern.endsWith('*')) {
      return toolName.startsWith(pattern.slice(0, -1));
    }
    if (pattern.startsWith('*')) {
      return toolName.endsWith(pattern.slice(1));
    }
    return false;
  }

  /** Evaluate whether a rule's condition is currently met. */
  private evaluateCondition(rule: ToolBlockRule): boolean {
    switch (rule.condition) {
      case 'always':
        return true;

      case 'budget_exceeded': {
        if (!this.budgetManager) {
          // No budget manager available — skip rule
          return false;
        }
        // canProcess() returns true when under budget; false when exceeded
        return !this.budgetManager.canProcess();
      }

      case 'workflow_phase': {
        if (!this.workflowEngine) {
          // No workflow engine available — skip rule
          return false;
        }
        // Block if any active workflow is in a reviewing state
        const activeInstances = this.workflowEngine.getActiveInstances();
        return activeInstances.some(
          (instance) =>
            typeof instance.current_state === 'string' &&
            instance.current_state.toLowerCase().includes('review'),
        );
      }

      case 'custom':
        // 'custom' conditions require a registered handler function.
        // Registration API will be added via ToolGateEvaluator.registerCustomCondition().
        // Until then, custom conditions are skipped with a warning.
        logger.warn('Custom tool block condition is not yet implemented', {
          pattern: rule.tool_pattern,
        });
        return false;

      default:
        return false;
    }
  }
}
