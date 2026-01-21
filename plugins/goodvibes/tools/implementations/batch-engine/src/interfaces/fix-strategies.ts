/**
 * Fix Loop Strategy interfaces for Batch Engine
 * @see SPEC-v2 Section 11.3
 */

import type { FixableError, FixAction, FixContext, FixStrategy } from './fix-loop.js';

/**
 * Strategy executor interface
 * Defines how a fix strategy is executed and when it should be used
 */
export interface StrategyExecutor {
  /** The strategy type this executor handles */
  strategy: FixStrategy;
  /** Execute the strategy for the given context */
  execute(context: FixContext): Promise<StrategyResult>;
  /** Determine if this strategy should be used for the given context */
  shouldUse(context: FixContext): boolean;
}

/**
 * Result of executing a strategy
 */
export interface StrategyResult {
  /** Whether the strategy fixed all errors */
  success: boolean;
  /** Actions taken during this strategy execution */
  actions: FixAction[];
  /** Errors that remain after this strategy */
  remaining_errors: FixableError[];
  /** Tokens consumed during this strategy execution */
  tokens_used: number;
  /** Duration of strategy execution in milliseconds */
  duration_ms: number;
  /** Recommended next strategy if this one failed */
  next_strategy?: FixStrategy;
}

/**
 * Auto-fix strategy (Attempt 1)
 * Uses built-in fixers like eslint --fix, prettier --write
 */
export interface AutoFixStrategy extends StrategyExecutor {
  strategy: 'auto_fix';
  /** Map of fixer name to fixer definition */
  fixers: Map<string, AutoFixerDefinition>;
  /** Run a specific fixer for an error */
  runFixer(type: string, error: FixableError): Promise<FixAction[]>;
}

/**
 * Auto-fixer definition
 * Defines a command or transform to automatically fix specific error types
 */
export interface AutoFixerDefinition {
  /** Name of the auto-fixer */
  name: string;
  /** Error types this fixer can handle */
  error_types: string[];
  /** Shell command to run (supports {{file}} template) */
  command?: string;
  /** Programmatic fix function */
  transform?: (error: FixableError) => Promise<FixAction[]>;
  /** Required tools/binaries that must be available */
  requires?: string[];
}

/**
 * Agent-fix strategy (Attempt 2)
 * Spawns code-architect agent to fix errors
 */
export interface AgentFixStrategy extends StrategyExecutor {
  strategy: 'agent_fix';
  /** The agent type to spawn */
  agent_type: 'code-architect';
  /** Build the prompt for the agent based on context */
  buildPrompt(context: FixContext): string;
  /** Parse the agent's result into fix actions */
  parseAgentResult(result: unknown): FixAction[];
}

/**
 * Targeted-fix strategy (Attempt 3)
 * Spawns specialized agent based on error type with detailed context
 */
export interface TargetedFixStrategy extends StrategyExecutor {
  strategy: 'targeted_fix';
  /** Select the best agent for the given error type */
  selectAgent(error: FixableError): string;
  /** Build a detailed prompt with prior attempts and context */
  buildDetailedPrompt(context: FixContext): string;
  /** Inject additional context for the agent */
  injectContext(context: FixContext): Record<string, unknown>;
}

/**
 * Agent selection for targeted fix
 * Maps error types to specialized agents
 */
export const TARGETED_AGENTS: Record<string, string> = {
  typescript_error: 'goodvibes:backend-engineer',
  lint_error: 'goodvibes:code-architect',
  format_error: 'goodvibes:code-architect',
  import_error: 'goodvibes:backend-engineer',
  test_failure: 'goodvibes:test-engineer',
  build_error: 'goodvibes:devops-deployer',
  runtime_error: 'goodvibes:backend-engineer',
};

/**
 * Built-in auto-fixers
 * Default fixers for common error types
 */
export const BUILTIN_FIXERS: AutoFixerDefinition[] = [
  {
    name: 'eslint-fix',
    error_types: ['lint_error'],
    command: 'npx eslint --fix {{file}}',
    requires: ['eslint'],
  },
  {
    name: 'prettier-fix',
    error_types: ['format_error'],
    command: 'npx prettier --write {{file}}',
    requires: ['prettier'],
  },
  {
    name: 'import-organizer',
    error_types: ['import_error'],
    command: 'npx organize-imports-cli {{file}}',
    requires: ['organize-imports-cli'],
  },
];

/**
 * Strategy chain configuration
 * Defines the order and behavior of fix strategies
 */
export interface StrategyChain {
  /** Order in which strategies are tried */
  order: FixStrategy[];
  /** Strategy to use if all others fail */
  fallback_strategy?: FixStrategy;
  /** Maximum attempts per strategy before moving to next */
  max_attempts_per_strategy: number;
  /** Continue to next strategy if current partially succeeded */
  continue_on_partial_success: boolean;
}

/**
 * Default strategy chain
 * Standard order: auto_fix -> agent_fix -> targeted_fix
 */
export const DEFAULT_STRATEGY_CHAIN: StrategyChain = {
  order: ['auto_fix', 'agent_fix', 'targeted_fix'],
  max_attempts_per_strategy: 1,
  continue_on_partial_success: true,
};

/**
 * Strategy registry
 * Manages available fix strategies and their configuration
 */
export interface StrategyRegistry {
  /** Map of strategy type to executor */
  strategies: Map<FixStrategy, StrategyExecutor>;
  /** Register a strategy executor */
  register(executor: StrategyExecutor): void;
  /** Get the executor for a strategy type */
  get(strategy: FixStrategy): StrategyExecutor | undefined;
  /** Get the current strategy chain configuration */
  getChain(): StrategyChain;
  /** Update the strategy chain configuration */
  setChain(chain: StrategyChain): void;
}
