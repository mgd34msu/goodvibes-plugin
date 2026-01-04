/**
 * Post Tool Use Failure Hook (GoodVibes)
 *
 * Runs when a tool call fails.
 * Implements 3-phase fix loop with progressive research hints:
 *   Phase 1: Raw attempts with existing knowledge
 *   Phase 2: Include official documentation search hints
 *   Phase 3: Include community documentation search hints
 */
import { respond, readHookInput, loadAnalytics, saveAnalytics, debug, logError, PROJECT_ROOT, } from './shared.js';
import { loadState, saveState, trackError, getErrorState } from './state.js';
import { generateErrorSignature, categorizeError, createErrorState, buildFixContext, } from './automation/fix-loop.js';
import { findMatchingPattern, getSuggestedFix, getResearchHints, } from './post-tool-use-failure/error-recovery.js';
import { saveRetry, getRetryCount, getCurrentPhase, shouldEscalatePhase, getPhaseDescription, getRemainingAttempts, hasExhaustedRetries, generateErrorSignature as generateRetrySignature, } from './post-tool-use-failure/retry-tracker.js';
import { writeFailure } from './memory/failures.js';
/** Creates a hook response with optional additional context for fix guidance. */
function createResponse(additionalContext) {
    return {
        continue: true,
        systemMessage: additionalContext,
    };
}
/**
 * Build research hints message based on phase
 */
function buildResearchHintsMessage(category, errorMessage, phase) {
    if (phase === 1) {
        return '';
    }
    const hints = getResearchHints(category, errorMessage, phase);
    const parts = [];
    if (phase >= 2 && hints.official.length > 0) {
        parts.push('[Phase 2] Search official documentation:');
        for (const hint of hints.official) {
            parts.push(`  - ${hint}`);
        }
    }
    if (phase >= 3 && hints.community.length > 0) {
        parts.push('[Phase 3] Search community solutions:');
        for (const hint of hints.community) {
            parts.push(`  - ${hint}`);
        }
    }
    return parts.join('\n');
}
/** Main entry point for post-tool-use-failure hook. Implements progressive fix loop with research hints. */
async function main() {
    try {
        debug('PostToolUseFailure hook starting');
        const input = await readHookInput();
        const cwd = input.cwd || PROJECT_ROOT;
        const toolName = input.tool_name || 'unknown';
        // Extract error message safely - the error field is passed by Claude Code but not in our type
        const rawInput = input;
        const errorMessage = typeof rawInput.error === 'string' ? rawInput.error : 'Unknown error';
        const ERROR_PREVIEW_LENGTH = 200;
        debug('PostToolUseFailure received input', {
            tool_name: toolName,
            error: errorMessage.slice(0, ERROR_PREVIEW_LENGTH),
        });
        // Step 1: Load state
        const state = await loadState(cwd);
        // Step 2: Generate error signature (using fix-loop version for state tracking)
        const signature = generateErrorSignature(toolName, errorMessage);
        // Also generate retry-tracker signature for file-based tracking
        const retrySignature = generateRetrySignature(errorMessage, toolName);
        debug('Error signatures', { signature, retrySignature });
        // Step 3: Categorize the error
        const category = categorizeError(errorMessage);
        debug('Error category', { category });
        // Step 4: Load retry tracker to check current phase
        let errorState = getErrorState(state, signature);
        const currentPhase = await getCurrentPhase(cwd, retrySignature);
        const retryCount = await getRetryCount(cwd, retrySignature);
        if (!errorState) {
            // First time seeing this error in state
            errorState = createErrorState(signature, category);
            debug('Created new error state', { phase: errorState.phase });
        }
        else {
            // Sync phase from retry tracker (clamp to valid range 1-3)
            const clampedPhase = Math.max(1, Math.min(3, currentPhase));
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
            const nextPhase = (errorState.phase + 1);
            errorState = {
                ...errorState,
                phase: nextPhase,
                attemptsThisPhase: 0,
            };
            debug('Escalated to phase', { phase: errorState.phase });
        }
        // Step 5: Find matching recovery pattern
        const pattern = findMatchingPattern(category, errorMessage);
        debug('Matching pattern', { found: !!pattern, category: pattern?.category });
        // Step 6: Get suggested fix based on pattern
        const suggestedFix = getSuggestedFix(category, errorMessage, errorState);
        // Step 7: Build fix context with research hints
        const fixContext = buildFixContext(errorState, errorMessage);
        // Build research hints for current phase
        const effectiveCategory = (pattern?.category || category);
        const researchHints = buildResearchHintsMessage(effectiveCategory, errorMessage, errorState.phase);
        // Step 8: Save retry attempt (both to state and file-based tracker)
        errorState = {
            ...errorState,
            attemptsThisPhase: errorState.attemptsThisPhase + 1,
            totalAttempts: errorState.totalAttempts + 1,
        };
        trackError(state, signature, errorState);
        saveRetry(cwd, retrySignature, errorState.phase);
        // Step 9: Check if all phases exhausted
        const exhausted = await hasExhaustedRetries(errorState);
        if (exhausted) {
            debug('All phases exhausted, logging to memory');
            // Log failure to memory
            const ERROR_WHAT_LENGTH = 100;
            const failure = {
                date: new Date().toISOString().split('T')[0],
                approach: `${toolName} failed: ${errorMessage.slice(0, ERROR_WHAT_LENGTH)}`,
                reason: `Exhausted ${errorState.totalAttempts} attempts across 3 phases`,
                suggestion: 'Manual intervention required',
            };
            try {
                await writeFailure(cwd, failure);
            }
            catch (writeError) {
                debug('Failed to write failure to memory', { error: String(writeError) });
            }
        }
        // Save state
        await saveState(cwd, state);
        // Track the failure in analytics
        const analytics = loadAnalytics();
        if (analytics) {
            if (!analytics.tool_failures) {
                analytics.tool_failures = [];
            }
            analytics.tool_failures.push({
                tool: toolName,
                error: errorMessage,
                timestamp: new Date().toISOString(),
            });
            analytics.issues_found++;
            saveAnalytics(analytics);
        }
        // Step 10: Build response with fix suggestions and research hints
        const phaseDesc = getPhaseDescription(errorState.phase);
        const responseParts = [];
        // Header with phase info
        responseParts.push(`[GoodVibes Fix Loop - Phase ${errorState.phase}/3: ${phaseDesc}]`);
        const remaining = await getRemainingAttempts(errorState);
        responseParts.push(`Attempt ${retryCount + 1} (${remaining} remaining this phase)`);
        responseParts.push('');
        // Error category
        if (pattern) {
            responseParts.push(`Detected: ${pattern.category.replace(/_/g, ' ')}`);
        }
        else {
            responseParts.push(`Category: ${category}`);
        }
        responseParts.push('');
        // Suggested fix
        responseParts.push('Suggested fix:');
        responseParts.push(suggestedFix);
        // Research hints for phases 2 and 3
        if (researchHints) {
            responseParts.push('');
            responseParts.push(researchHints);
        }
        // Previous attempts warning
        const MAX_RECENT_ATTEMPTS = 3;
        if (errorState.fixStrategiesAttempted.length > 0) {
            responseParts.push('');
            responseParts.push('Previously attempted (failed):');
            for (const attempt of errorState.fixStrategiesAttempted.slice(-MAX_RECENT_ATTEMPTS)) {
                responseParts.push(`  - ${attempt.strategy}`);
            }
            responseParts.push('Try a DIFFERENT approach.');
        }
        // Exhaustion warning
        if (exhausted) {
            responseParts.push('');
            responseParts.push('[WARNING] All fix phases exhausted. Consider:');
            responseParts.push('  - Manual debugging');
            responseParts.push('  - Asking the user for help');
            responseParts.push('  - Reverting recent changes');
        }
        const additionalContext = responseParts.join('\n');
        respond(createResponse(additionalContext));
    }
    catch (error) {
        logError('PostToolUseFailure main', error);
        respond(createResponse());
    }
}
main();
