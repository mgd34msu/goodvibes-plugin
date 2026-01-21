/**
 * Fix Loop implementation for Batch Engine
 * @see SPEC-v2 Sections 11.2-11.3
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import type {
  FixLoop,
  FixLoopManager,
  FixContext,
  FixResult,
  FixAttempt,
  FixAction,
  FixableError,
  FixableErrorType,
  FixStrategy,
  FixLoopConfig,
  AutoFixer,
} from '../interfaces/fix-loop.js';
import type { StateManager } from '../interfaces/state-api.js';
import { getStateManager } from './state.js';

const execPromise = promisify(spawn);

/**
 * Error type to strategy mapping
 * Maps fixable error types to the sequence of strategies to try
 */
const ERROR_TO_STRATEGY: Record<FixableErrorType, FixStrategy[]> = {
  typescript_error: ['auto_fix', 'agent_fix', 'targeted_fix'],
  lint_error: ['auto_fix', 'targeted_fix'],
  format_error: ['auto_fix'],
  import_error: ['auto_fix', 'targeted_fix'],
  test_failure: ['agent_fix', 'targeted_fix'],
  build_error: ['auto_fix', 'agent_fix'],
  runtime_error: ['agent_fix', 'targeted_fix'],
};

/**
 * Default configuration for the fix loop
 */
const DEFAULT_CONFIG: FixLoopConfig = {
  max_attempts: 3,
  strategies: ['auto_fix', 'agent_fix', 'targeted_fix'],
  timeout_ms: 60000,
  auto_fixers: {} as Record<FixableErrorType, AutoFixer>,
};

/**
 * Built-in auto-fixers for common error types
 */
const BUILTIN_AUTO_FIXERS: Partial<Record<FixableErrorType, AutoFixer>> = {
  lint_error: {
    name: 'eslint-fix',
    can_fix: (error) => error.type === 'lint_error',
    fix: async (error, context) => {
      const actions: FixAction[] = [];
      if (!error.file) {
        return actions;
      }

      try {
        const result = await executeCommand(`npx eslint --fix "${error.file}"`, 30000);
        actions.push({
          type: 'command',
          target: `eslint --fix ${error.file}`,
          description: `Auto-fix ESLint errors in ${error.file}`,
          success: result.exitCode === 0,
          error: result.exitCode !== 0 ? result.stderr : undefined,
        });
      } catch (err) {
        actions.push({
          type: 'command',
          target: `eslint --fix ${error.file}`,
          description: `Auto-fix ESLint errors in ${error.file}`,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      return actions;
    },
  },
  format_error: {
    name: 'prettier-fix',
    can_fix: (error) => error.type === 'format_error',
    fix: async (error, context) => {
      const actions: FixAction[] = [];
      if (!error.file) {
        return actions;
      }

      try {
        const result = await executeCommand(`npx prettier --write "${error.file}"`, 30000);
        actions.push({
          type: 'command',
          target: `prettier --write ${error.file}`,
          description: `Auto-format file ${error.file}`,
          success: result.exitCode === 0,
          error: result.exitCode !== 0 ? result.stderr : undefined,
        });
      } catch (err) {
        actions.push({
          type: 'command',
          target: `prettier --write ${error.file}`,
          description: `Auto-format file ${error.file}`,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      return actions;
    },
  },
};

/**
 * Execute a shell command with timeout
 */
async function executeCommand(
  command: string,
  timeoutMs: number
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      shell: true,
      timeout: timeoutMs,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number): number {
  // 1s, 2s, 4s
  return Math.pow(2, attempt - 1) * 1000;
}

/**
 * FixLoop implementation
 */
export class FixLoopImpl implements FixLoopManager {
  config: FixLoopConfig;
  private stateManager: StateManager;
  private customAutoFixers: Map<FixableErrorType, AutoFixer>;

  constructor(
    config: Partial<FixLoopConfig> = {},
    stateManager?: StateManager
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stateManager = stateManager || getStateManager();
    this.customAutoFixers = new Map();

    // Initialize built-in auto-fixers
    for (const [errorType, fixer] of Object.entries(BUILTIN_AUTO_FIXERS)) {
      this.config.auto_fixers[errorType as FixableErrorType] = fixer!;
    }
  }

  /**
   * Run the fix loop for the given context
   */
  async run(context: FixContext): Promise<FixResult> {
    const startTime = Date.now();
    const allActions: FixAction[] = [];
    let totalTokens = 0;
    let currentErrors = [context.error];

    console.log(`[FixLoop] Starting fix loop for error: ${context.error.type}`);

    // Run fix attempts up to max_attempts
    for (let attempt = 1; attempt <= context.max_attempts; attempt++) {
      // Apply exponential backoff between retries (skip for first attempt)
      if (attempt > 1) {
        const delay = getBackoffDelay(attempt);
        console.log(`[FixLoop] Waiting ${delay}ms before attempt ${attempt}`);
        await sleep(delay);
      }

      const strategy = this.getStrategy(attempt);
      console.log(`[FixLoop] Attempt ${attempt}/${context.max_attempts} using strategy: ${strategy}`);

      const attemptStart = new Date().toISOString();
      const attemptResult = await this.executeAttempt(
        {
          ...context,
          attempt,
          prior_attempts: context.prior_attempts,
        },
        strategy,
        currentErrors
      );
      const attemptEnd = new Date().toISOString();

      // Record the attempt
      const fixAttempt: FixAttempt = {
        strategy,
        started_at: attemptStart,
        completed_at: attemptEnd,
        success: attemptResult.success,
        actions: attemptResult.actions,
        remaining_errors: attemptResult.remaining_errors,
        tokens_used: attemptResult.tokens_used,
      };

      allActions.push(...attemptResult.actions);
      totalTokens += attemptResult.tokens_used;
      currentErrors = attemptResult.remaining_errors;

      console.log(
        `[FixLoop] Attempt ${attempt} ${attemptResult.success ? 'succeeded' : 'failed'}. ` +
        `Actions: ${attemptResult.actions.length}, Remaining errors: ${attemptResult.remaining_errors.length}`
      );

      // If successful, we're done
      if (attemptResult.success && currentErrors.length === 0) {
        const duration = Date.now() - startTime;
        return {
          success: true,
          attempts: attempt,
          final_strategy: strategy,
          actions_taken: allActions,
          remaining_errors: [],
          total_tokens_used: totalTokens,
          duration_ms: duration,
        };
      }
    }

    // All attempts exhausted
    const duration = Date.now() - startTime;
    console.log(`[FixLoop] All ${context.max_attempts} attempts exhausted. Fix failed.`);

    return {
      success: false,
      attempts: context.max_attempts,
      final_strategy: this.getStrategy(context.max_attempts),
      actions_taken: allActions,
      remaining_errors: currentErrors,
      total_tokens_used: totalTokens,
      duration_ms: duration,
    };
  }

  /**
   * Execute a single fix attempt
   */
  private async executeAttempt(
    context: FixContext,
    strategy: FixStrategy,
    errors: FixableError[]
  ): Promise<{
    success: boolean;
    actions: FixAction[];
    remaining_errors: FixableError[];
    tokens_used: number;
  }> {
    switch (strategy) {
      case 'auto_fix':
        return this.executeAutoFix(context, errors);
      case 'agent_fix':
        return this.executeAgentFix(context, errors);
      case 'targeted_fix':
        return this.executeTargetedFix(context, errors);
      default:
        return {
          success: false,
          actions: [],
          remaining_errors: errors,
          tokens_used: 0,
        };
    }
  }

  /**
   * Execute auto-fix strategy
   */
  private async executeAutoFix(
    context: FixContext,
    errors: FixableError[]
  ): Promise<{
    success: boolean;
    actions: FixAction[];
    remaining_errors: FixableError[];
    tokens_used: number;
  }> {
    const actions: FixAction[] = [];

    for (const error of errors) {
      // Check if we have an auto-fixer for this error type
      const fixer = this.config.auto_fixers[error.type] || this.customAutoFixers.get(error.type);

      if (fixer && fixer.can_fix(error)) {
        try {
          const fixActions = await fixer.fix(error, context);
          actions.push(...fixActions);
        } catch (err) {
          console.error(`[FixLoop] Auto-fixer failed for ${error.type}:`, err);
        }
      }
    }

    // Check if any actions succeeded
    const anySuccess = actions.some((a) => a.success);
    const allSuccess = actions.length > 0 && actions.every((a) => a.success);

    // If all succeeded, no remaining errors
    // If some succeeded, assume some errors remain
    // If none succeeded, all errors remain
    const remaining_errors = allSuccess ? [] : anySuccess ? errors.slice(0, Math.ceil(errors.length / 2)) : errors;

    return {
      success: allSuccess,
      actions,
      remaining_errors,
      tokens_used: 0, // Auto-fix doesn't use tokens
    };
  }

  /**
   * Execute agent-fix strategy (spawn code-architect agent)
   */
  private async executeAgentFix(
    context: FixContext,
    errors: FixableError[]
  ): Promise<{
    success: boolean;
    actions: FixAction[];
    remaining_errors: FixableError[];
    tokens_used: number;
  }> {
    const actions: FixAction[] = [];

    // Build prompt for agent
    const errorSummary = errors
      .map((e) => `${e.type}: ${e.message}${e.file ? ` (${e.file}:${e.line})` : ''}`)
      .join('\n');

    const prompt = `Fix the following errors in the batch operation:

Batch ID: ${context.batch.id}
Operation: ${context.operation.type}

Errors:
${errorSummary}

Previous attempts:
${context.prior_attempts.map((a, i) => `Attempt ${i + 1} (${a.strategy}): ${a.success ? 'succeeded' : 'failed'}`).join('\n')}

Please analyze and fix these errors. Focus on:
1. Understanding the root cause
2. Making surgical fixes
3. Validating the fix works
`;

    // In a real implementation, this would spawn an agent using the agent system
    // For now, we simulate the agent call
    console.log(`[FixLoop] Would spawn code-architect agent with prompt:\n${prompt}`);

    // Simulate agent execution
    // In reality, this would:
    // 1. Register agent with state manager
    // 2. Execute agent task
    // 3. Parse results
    // 4. Complete agent with result

    actions.push({
      type: 'command',
      target: 'agent:code-architect',
      description: 'Spawned code-architect agent to fix errors',
      success: false, // Simulated - would be determined by actual agent result
      error: 'Agent spawning not yet fully implemented',
    });

    return {
      success: false,
      actions,
      remaining_errors: errors,
      tokens_used: 1000, // Estimated tokens for agent call
    };
  }

  /**
   * Execute targeted-fix strategy (spawn specialized agent based on error type)
   */
  private async executeTargetedFix(
    context: FixContext,
    errors: FixableError[]
  ): Promise<{
    success: boolean;
    actions: FixAction[];
    remaining_errors: FixableError[];
    tokens_used: number;
  }> {
    const actions: FixAction[] = [];

    // Group errors by type
    const errorsByType = new Map<FixableErrorType, FixableError[]>();
    for (const error of errors) {
      const existing = errorsByType.get(error.type) || [];
      existing.push(error);
      errorsByType.set(error.type, existing);
    }

    // Select specialized agent for each error type
    const TARGETED_AGENTS: Record<FixableErrorType, string> = {
      typescript_error: 'goodvibes:backend-engineer',
      lint_error: 'goodvibes:code-architect',
      format_error: 'goodvibes:code-architect',
      import_error: 'goodvibes:backend-engineer',
      test_failure: 'goodvibes:test-engineer',
      build_error: 'goodvibes:devops-deployer',
      runtime_error: 'goodvibes:backend-engineer',
    };

    for (const [errorType, typeErrors] of errorsByType) {
      const agentType = TARGETED_AGENTS[errorType] || 'goodvibes:code-architect';

      const errorSummary = typeErrors
        .map((e) => `${e.message}${e.file ? ` (${e.file}:${e.line})` : ''}`)
        .join('\n');

      const prompt = `Fix these ${errorType} errors:

Batch ID: ${context.batch.id}
Operation: ${context.operation.type}
Attempt: ${context.attempt}/${context.max_attempts}

Errors:
${errorSummary}

Context from previous attempts:
${context.prior_attempts.map((a) => `- ${a.strategy}: ${a.actions.length} actions, ${a.success ? 'succeeded' : 'failed'}`).join('\n')}

This is a targeted fix with specialized knowledge of ${errorType} issues.
Please provide a detailed fix with validation.
`;

      // In a real implementation, this would spawn the targeted agent
      console.log(`[FixLoop] Would spawn ${agentType} agent with prompt:\n${prompt}`);

      actions.push({
        type: 'command',
        target: `agent:${agentType}`,
        description: `Spawned ${agentType} agent to fix ${errorType} errors`,
        success: false, // Simulated
        error: 'Targeted agent spawning not yet fully implemented',
      });
    }

    return {
      success: false,
      actions,
      remaining_errors: errors,
      tokens_used: 2000, // Estimated tokens for specialized agent
    };
  }

  /**
   * Check if an error can be fixed
   */
  canFix(error: FixableError): boolean {
    // Check if we have strategies for this error type
    const strategies = ERROR_TO_STRATEGY[error.type];
    if (!strategies || strategies.length === 0) {
      return false;
    }

    // Check if we have at least one applicable strategy
    return strategies.some((strategy) => {
      if (strategy === 'auto_fix') {
        const fixer = this.config.auto_fixers[error.type] || this.customAutoFixers.get(error.type);
        return fixer ? fixer.can_fix(error) : false;
      }
      // Agent-based strategies are always available
      return true;
    });
  }

  /**
   * Get the strategy to use for a given attempt number
   */
  getStrategy(attempt: number): FixStrategy {
    // Use configured strategy order
    const strategies = this.config.strategies;
    const index = Math.min(attempt - 1, strategies.length - 1);
    return strategies[index] || 'auto_fix'; // Fallback to auto_fix
  }

  /**
   * Register a custom auto-fixer for an error type
   */
  registerAutoFixer(type: FixableErrorType, fixer: AutoFixer): void {
    this.customAutoFixers.set(type, fixer);
    this.config.auto_fixers[type] = fixer;
  }

  /**
   * Parse an error into a FixableError structure
   */
  parseError(error: Error | string): FixableError {
    const message = typeof error === 'string' ? error : error.message;
    const stack = typeof error === 'string' ? undefined : error.stack;

    // Try to parse TypeScript errors
    const tsMatch = message.match(/^(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)$/);
    if (tsMatch && tsMatch[1] && tsMatch[2] && tsMatch[3] && tsMatch[4] && tsMatch[5]) {
      return {
        type: 'typescript_error',
        message: tsMatch[5],
        file: tsMatch[1],
        line: parseInt(tsMatch[2], 10),
        column: parseInt(tsMatch[3], 10),
        code: `TS${tsMatch[4]}`,
      };
    }

    // Try to parse ESLint errors
    const eslintMatch = message.match(/^(.+?):(\d+):(\d+): (.+?) \[(.+?)\]$/);
    if (eslintMatch && eslintMatch[1] && eslintMatch[2] && eslintMatch[3] && eslintMatch[4] && eslintMatch[5]) {
      return {
        type: 'lint_error',
        message: eslintMatch[4],
        file: eslintMatch[1],
        line: parseInt(eslintMatch[2], 10),
        column: parseInt(eslintMatch[3], 10),
        code: eslintMatch[5],
      };
    }

    // Try to parse test failures
    if (message.includes('FAIL') || message.includes('Test failed')) {
      return {
        type: 'test_failure',
        message,
      };
    }

    // Try to parse build errors
    if (message.includes('Build failed') || message.includes('Module not found')) {
      return {
        type: 'build_error',
        message,
      };
    }

    // Default to runtime error
    return {
      type: 'runtime_error',
      message,
    };
  }
}

/**
 * Create a new FixLoop instance
 */
export function createFixLoop(
  config?: Partial<FixLoopConfig>,
  stateManager?: StateManager
): FixLoopManager {
  return new FixLoopImpl(config, stateManager);
}

/**
 * Singleton fix loop instance
 */
let globalFixLoop: FixLoopManager | null = null;

/**
 * Get the global FixLoop instance
 */
export function getFixLoop(config?: Partial<FixLoopConfig>): FixLoopManager {
  if (!globalFixLoop) {
    globalFixLoop = createFixLoop(config);
  }
  return globalFixLoop;
}

/**
 * Reset the global FixLoop (useful for testing)
 */
export function resetGlobalFixLoop(): void {
  globalFixLoop = null;
}
