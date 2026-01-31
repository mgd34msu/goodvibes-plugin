/**
 * Post Tool Use Failure Hook (GoodVibes)
 *
 * Runs when a tool call fails.
 * Implements 3-phase fix loop with progressive research hints:
 *   Phase 1: Raw attempts with existing knowledge
 *   Phase 2: Include official documentation search hints
 *   Phase 3: Include community documentation search hints
 */

import {
  categorizeError,
  createErrorState,
  buildFixContext,
} from '../automation/fix-loop.js';
import { writeFailure } from '../memory/failures.js';
import {
  respond,
  readHookInput,
  loadAnalytics,
  saveAnalytics,
  debug,
  logError,
  createResponse,
  PROJECT_ROOT,
  isTestEnvironment,
} from '../shared/index.js';
import { loadState, saveState, trackError, getErrorState } from '../state/index.js';

import {
  findMatchingPattern,
  getSuggestedFix,
} from './pattern-matcher.js';
import { getResearchHints } from './research-hints.js';
import {
  buildResearchHintsMessage,
  buildFixLoopResponse,
} from './response-builder.js';
import {
  saveRetry,
  getRetryCount,
  getCurrentPhase,
  shouldEscalatePhase,
  hasExhaustedRetries,
  generateErrorSignature,
} from './retry-tracker.js';

import type { ErrorCategory } from '../types/errors.js';
import type { MemoryFailure } from '../types/memory.js';


/**
 * Type guard to check if a value is a non-null, non-array object.
 * Used to safely access properties on unknown values from hook input.
 *
 * @param value - The value to check
 * @returns True if value is a plain object (not null, not array)
 *
 * @example
 * if (isRecord(input)) {
 *   const error = input.error;  // Safe property access
 * }
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Main entry point for post-tool-use-failure hook.
 * Implements a 3-phase progressive fix loop with research hints:
 *   - Phase 1: Raw attempts with existing knowledge
 *   - Phase 2: Include official documentation search hints
 *   - Phase 3: Include community documentation search hints
 *
 * Tracks error state, retry counts, and logs failures to memory when exhausted.
 *
 * @returns Promise that resolves when hook processing completes
 */
async function runPostToolUseFailureHook(): Promise<void> {
  try {
    debug('PostToolUseFailure hook starting');

    const input = await readHookInput();
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall back to PROJECT_ROOT
    const cwd = input.cwd || PROJECT_ROOT;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall back to 'unknown'
    const toolName = input.tool_name || 'unknown';

    // Extract error message safely - the error field is passed by Claude Code but not in our type
    let errorMessage = 'Unknown error';
    if (isRecord(input)) {
      errorMessage =
        typeof input.error === 'string' ? input.error : 'Unknown error';
    }

    const ERROR_PREVIEW_LENGTH = 200;
    debug('PostToolUseFailure received input', {
      tool_name: toolName,
      error: errorMessage.slice(0, ERROR_PREVIEW_LENGTH),
    });

    // Step 1: Load state
    let state = await loadState(cwd);

    // Step 2: Generate error signature (unified function from retry-tracker)
    const signature = generateErrorSignature(errorMessage, toolName);
    debug('Error signature', { signature });

    // Step 3: Categorize the error
    const category = categorizeError(errorMessage);
    debug('Error category', { category });

    // Step 4: Load retry tracker to check current phase
    let errorState = getErrorState(state, signature);
    const currentPhase = await getCurrentPhase(cwd, signature);
    const retryCount = await getRetryCount(cwd, signature);

    if (!errorState) {
      // First time seeing this error in state
      errorState = createErrorState(signature, category);
      debug('Created new error state', { phase: errorState.phase });
    } else {
      // Sync phase from retry tracker (clamp to valid range 1-3)
      const clampedPhase = Math.max(1, Math.min(3, currentPhase)) as 1 | 2 | 3;
      errorState = {
        ...errorState,
        phase: clampedPhase,
      };
      debug('Existing error state', {
        phase: errorState.phase,
        attemptsThisPhase: errorState.attemptsThisPhase,
        totalAttempts: errorState.totalAttempts,
      });
    }

    // Check if we should escalate phase (max phase is 3)
    const shouldEscalate = await shouldEscalatePhase(errorState);
    if (shouldEscalate && errorState.phase < 3) {
      const nextPhase = (errorState.phase + 1) as 2 | 3;
      errorState = {
        ...errorState,
        phase: nextPhase,
        attemptsThisPhase: 0,
      };
      debug('Escalated to phase', { phase: errorState.phase });
    }

    // Step 5: Find matching recovery pattern
    const pattern = findMatchingPattern(category, errorMessage);
    debug('Matching pattern', {
      found: !!pattern,
      category: pattern?.category,
    });

        // Step 6: Get suggested fix based on pattern
    let suggestedFix = getSuggestedFix(category, errorMessage, errorState);

    // For shell escaping errors, detect which precision tool and give exact syntax
    if (pattern?.category === 'shell_escaping_error' && isRecord(input) && isRecord(input.tool_input)) {
      const command = typeof input.tool_input.command === 'string' ? input.tool_input.command : '';
      const toolMatch = command.match(/mcp-cli\s+call\s+\S+\/(precision_\w+|discover)/);
      if (toolMatch) {
        const tool = toolMatch[1];
        const syntaxMap: Record<string, string> = {
          precision_write: `SHELL ESCAPING ERROR in precision_write.

STEP 1: echo -n 'your content' | base64 -w0
STEP 2: mcp-cli call .../precision_write '{"files":[{"path":"file.ts","content_base64":"YOUR_BASE64_HERE"}]}'`,
          precision_edit: `SHELL ESCAPING ERROR in precision_edit.

STEP 1: echo -n 'find text' | base64 -w0
STEP 2: echo -n 'replace text' | base64 -w0
STEP 3: mcp-cli call .../precision_edit '{"edits":[{"path":"file.ts","find_base64":"FIND_BASE64","replace_base64":"REPLACE_BASE64"}]}'`,
          precision_grep: `SHELL ESCAPING ERROR in precision_grep.

STEP 1: echo -n 'pattern' | base64 -w0
STEP 2: mcp-cli call .../precision_grep '{"queries":[{"id":"q1","pattern_base64":"YOUR_BASE64_HERE"}]}'`,
          precision_exec: `SHELL ESCAPING ERROR in precision_exec.

STEP 1: echo -n 'command' | base64 -w0
STEP 2: mcp-cli call .../precision_exec '{"commands":[{"cmd_base64":"YOUR_BASE64_HERE"}]}'`,
          discover: `SHELL ESCAPING ERROR in discover.

STEP 1: echo -n 'pattern' | base64 -w0
STEP 2: mcp-cli call .../discover '{"queries":[{"id":"q1","type":"grep","pattern_base64":"YOUR_BASE64_HERE"}]}'`,
        };
        suggestedFix = syntaxMap[tool] || suggestedFix;
      }
    }


    // Step 7: Build fix context with research hints
    const _fixContext = buildFixContext(errorState, errorMessage);

    // Build research hints for current phase
    const effectiveCategory = (pattern?.category ?? category) as ErrorCategory;
    const hints = getResearchHints(effectiveCategory, errorMessage, errorState.phase);
    const researchHints = buildResearchHintsMessage(hints, errorState.phase);

    // Step 8: Save retry attempt (both to state and file-based tracker)
    errorState = {
      ...errorState,
      attemptsThisPhase: errorState.attemptsThisPhase + 1,
      totalAttempts: errorState.totalAttempts + 1,
    };
    state = trackError(state, signature, errorState);
    await saveRetry(cwd, signature, errorState.phase);

    // Step 9: Check if all phases exhausted
    const exhausted = await hasExhaustedRetries(errorState);

    if (exhausted) {
      debug('All phases exhausted, logging to memory');

      // Log failure to memory
      const ERROR_WHAT_LENGTH = 100;
      const failure: MemoryFailure = {
        date: new Date().toISOString().split('T')[0],
        approach: `${toolName} failed: ${errorMessage.slice(0, ERROR_WHAT_LENGTH)}`,
        reason: `Exhausted ${errorState.totalAttempts} attempts across 3 phases`,
        suggestion: 'Manual intervention required',
      };

      try {
        await writeFailure(cwd, failure);
      } catch (writeError) {
        debug('Failed to write failure to memory', {
          error: String(writeError),
        });
      }
    }

    // Save state
    await saveState(cwd, state);

    // Track the failure in analytics
    const analytics = await loadAnalytics();
    if (analytics) {
      analytics.tool_failures ??= [];
      analytics.tool_failures.push({
        tool: toolName,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
      analytics.issues_found++;
      await saveAnalytics(analytics);
    }

    // Step 10: Build response with fix suggestions and research hints
    const additionalContext = await buildFixLoopResponse({
      errorState,
      retryCount,
      pattern,
      category,
      suggestedFix,
      researchHints,
      exhausted,
    });

    respond(createResponse({ systemMessage: additionalContext }));
  } catch (error: unknown) {
    logError('PostToolUseFailure main', error);
    respond(createResponse());
  }
}

// Re-export utility functions and types for testing and external use
export type { ErrorSeverity, RecoveryPattern } from './recovery-types.js';
export { RECOVERY_PATTERNS } from './recovery-patterns.js';
export {
  findMatchingPattern,
  findAllMatchingPatterns,
  getHighestSeverity,
  getSuggestedFix,
} from './pattern-matcher.js';
export { getResearchHints } from './research-hints.js';
export {
  loadRetries,
  saveRetry,
  getRetryCount,
  getCurrentPhase,
  shouldEscalatePhase,
  escalatePhase,
  hasExhaustedRetries,
  getPhaseDescription,
  getRemainingAttempts,
  generateErrorSignature,
  clearRetry,
  pruneOldRetries,
  getRetryStats,
  type RetryEntry,
  type RetryData,
} from './retry-tracker.js';

// Export main hook function for testing
export { runPostToolUseFailureHook };

// Only run the hook if not in test mode
if (!isTestEnvironment()) {
  runPostToolUseFailureHook().catch((error: unknown) => {
    logError('PostToolUseFailure uncaught', error);
    respond(createResponse());
  });
}
