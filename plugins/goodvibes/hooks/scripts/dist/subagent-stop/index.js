/**
 * Subagent Stop Hook (GoodVibes)
 *
 * Runs when a Claude Code subagent (Task tool) finishes.
 * Correlates with SubagentStart to calculate duration and capture telemetry.
 *
 * Actions:
 * - Look up stored entry by agent_id from agent-tracking.json
 * - Parse agent_transcript_path for files modified, tools used, final output
 * - Validate agent output (type check if TS files modified)
 * - Verify tests for modified files
 * - Build telemetry entry with keywords, files, tools, summary
 * - Write telemetry record to .goodvibes/telemetry/YYYY-MM.jsonl
 * - Remove tracking entry
 * - Return validation results in output
 */
import { respond, readHookInput, loadAnalytics, saveAnalytics, debug, logError, isTestEnvironment, } from '../shared/index.js';
import { loadState, saveState } from '../state/index.js';
import { buildOrchestratorContext } from './context-injection.js';
import { RuntimeClient } from '../shared/runtime-client.js';
import { normalizeAgentFields } from '../subagent-start/wrfc-utils.js';
import { validateAgentOutput } from './output-validation.js';
import { getAgentTracking, removeAgentTracking, writeTelemetryEntry, buildTelemetryEntry, } from './telemetry.js';
import { verifyAgentTests } from './test-verification.js';
/**
 * Creates a hook response with optional system message and output data.
 *
 * @param options - Optional configuration for the response
 * @param options.systemMessage - System message to include
 * @param options.output - Output data from processing
 * @returns SubagentStopResponse object with continue: true
 */
function createResponse(options) {
    const response = {
        continue: true,
    };
    if (options?.systemMessage) {
        response.systemMessage = options.systemMessage;
    }
    if (options?.output) {
        response.output = options.output;
    }
    return response;
}
/**
 * Extracts normalized input fields from raw hook input.
 * Handles field name variations (agent_id vs subagent_id, etc.).
 *
 * @param input - Raw hook input from Claude
 * @returns Normalized fields with consistent naming
 */
function extractInputFields(input) {
    return {
        agentId: input.agent_id ?? input.subagent_id ?? '',
        agentType: input.agent_type ?? input.subagent_type ?? 'unknown',
        transcriptPath: input.agent_transcript_path ?? input.subagent_transcript_path ?? '',
        cwd: input.cwd ?? process.cwd(),
    };
}
/**
 * Validates agent output and runs tests on modified files.
 * Performs type checking and test verification for modified TypeScript files.
 *
 * @param cwd - Current working directory
 * @param transcriptPath - Path to the agent transcript file
 * @param state - Current hooks state
 * @returns Object containing validation result, test result, and updated state
 */
async function validateAndTest(cwd, transcriptPath, state) {
    if (!transcriptPath) {
        return { validationResult: undefined, testResult: undefined, updatedState: state };
    }
    const validationOutput = await validateAgentOutput(cwd, transcriptPath, state);
    const validationResult = validationOutput;
    const updatedState = validationOutput.state;
    debug('Validation result', {
        valid: validationResult.valid,
        filesModified: validationResult.filesModified.length,
        errors: validationResult.errors.length,
    });
    let testResult;
    if (validationResult.filesModified.length > 0) {
        testResult = await verifyAgentTests(cwd, validationResult.filesModified, updatedState);
        debug('Test verification result', {
            ran: testResult.ran,
            passed: testResult.passed,
            summary: testResult.summary,
        });
    }
    return { validationResult, testResult, updatedState };
}
/**
 * Updates analytics with subagent completion info.
 * Marks the matching subagent entry with completion timestamp and status.
 *
 * @param tracking - Tracking data from agent start
 * @param status - Completion status ('completed' or 'failed')
 * @returns Promise that resolves when analytics are updated
 */
async function updateAnalytics(tracking, status) {
    const analytics = await loadAnalytics();
    if (!analytics?.subagents_spawned) {
        return;
    }
    const subagentEntry = analytics.subagents_spawned.find((s) => s.type === tracking.agent_type && s.started_at === tracking.started_at);
    if (subagentEntry) {
        subagentEntry.completed_at = new Date().toISOString();
        subagentEntry.success = status === 'completed';
        await saveAnalytics(analytics);
    }
}
/**
 * Determines the completion status based on validation and test results.
 * Returns 'failed' if there are validation errors or test failures.
 *
 * @param validationResult - Result of output validation, if performed
 * @param testResult - Result of test verification, if performed
 * @returns 'completed' if no issues, 'failed' otherwise
 */
function determineStatus(validationResult, testResult) {
    const hasValidationErrors = validationResult?.valid === false;
    const hasTestFailures = testResult?.passed === false;
    return hasValidationErrors || hasTestFailures ? 'failed' : 'completed';
}
/**
 * Builds a system message summarizing any issues found.
 * Combines validation errors and test failures into a single message.
 *
 * @param agentType - Type of agent that completed
 * @param validationResult - Result of output validation, if performed
 * @param testResult - Result of test verification, if performed
 * @returns Issue summary message, or undefined if no issues
 */
function buildIssuesMessage(agentType, validationResult, testResult) {
    const issues = [];
    if (validationResult && !validationResult.valid) {
        issues.push('Validation errors: ' + validationResult.errors.join(', '));
    }
    if (testResult && !testResult.passed) {
        issues.push('Test failures: ' + testResult.summary);
    }
    if (issues.length === 0) {
        return undefined;
    }
    return '[GoodVibes] Agent ' + agentType + ' completed with issues: ' + issues.join('; ');
}
/**
 * Main entry point for subagent-stop hook.
 * Correlates with SubagentStart, validates output, and writes telemetry.
 *
 * @returns Promise that resolves when hook processing completes
 */
async function runSubagentStopHook() {
    try {
        debug('SubagentStop hook starting');
        const rawInput = await readHookInput();
        debug('Raw input shape:', Object.keys(rawInput || {}));
        const input = rawInput;
        // ─── Phase 6: Runtime engine integration (additive only) ───
        // Sends the completion event to the runtime engine (agent:completed or agent:failed).
        // This triggers the WRFC chain in the runtime engine.
        // NOTE: Directive delivery is handled by the PreToolUse directive-delivery hook, which queries
        // the runtime for pending directives on the next tool call.
        // ALWAYS falls through to existing logic — this hook has no early-return.
        try {
            const runtimeClient = new RuntimeClient();
            if (runtimeClient.isAvailable()) {
                const success = input.success !== false;
                const eventName = success ? 'agent:completed' : 'agent:failed';
                debug('Phase 6: runtime engine available, sending ' + eventName + ' event');
                // Normalize agent fields so the runtime trigger system can look up the workflow
                const { agent_id, agent_type } = normalizeAgentFields(input);
                const normalizedData = {
                    ...rawInput,
                    agent_id,
                    agent_type,
                };
                await runtimeClient.sendHookEvent(eventName, normalizedData);
            }
        }
        catch {
            // Runtime integration must never break the hook — always fall through
            debug('Phase 6: runtime integration error, falling through to existing logic');
        }
        // ─── End Phase 6 integration ───
        const { agentId, agentType, transcriptPath, cwd } = extractInputFields(input);
        debug('SubagentStop received input', {
            agent_id: agentId,
            agent_type: agentType,
            session_id: input.session_id,
            transcript_path: transcriptPath,
        });
        let state = await loadState(cwd);
        let validationResult;
        let testResult;
        let telemetryWritten = false;
        let durationMs = 0;
        const tracking = agentId ? await getAgentTracking(cwd, agentId) : null;
        if (tracking) {
            debug('Found matching tracking entry', {
                agent_id: tracking.agent_id,
                agent_type: tracking.agent_type,
                started_at: tracking.started_at,
            });
            durationMs = Date.now() - new Date(tracking.started_at).getTime();
            const validated = await validateAndTest(cwd, transcriptPath, state);
            validationResult = validated.validationResult;
            testResult = validated.testResult;
            state = validated.updatedState;
            const status = determineStatus(validationResult, testResult);
            const telemetryEntry = await buildTelemetryEntry(tracking, transcriptPath, status);
            await writeTelemetryEntry(cwd, telemetryEntry);
            telemetryWritten = true;
            debug('Telemetry entry written', {
                agent_id: telemetryEntry.agent_id,
                duration_ms: telemetryEntry.duration_ms,
                status: telemetryEntry.status,
            });
            await removeAgentTracking(cwd, agentId);
            debug('Removed agent tracking', { agent_id: agentId });
            await updateAnalytics(tracking, status);
            await saveState(cwd, state);
        }
        else {
            debug('No matching tracking entry found', { agent_id: agentId, agent_type: agentType });
            const validated = await validateAndTest(cwd, transcriptPath, state);
            validationResult = validated.validationResult;
            testResult = validated.testResult;
            state = validated.updatedState;
            if (transcriptPath) {
                await saveState(cwd, state);
            }
        }
        // Build orchestrator context reminders
        const status = determineStatus(validationResult, testResult);
        const orchestratorContext = buildOrchestratorContext(cwd, agentType, agentId || 'unknown', status === 'completed');
        // Combine issue warnings and orchestrator reminders
        const issuesMessage = buildIssuesMessage(agentType, validationResult, testResult);
        const baseSystemMessage = issuesMessage
            ? `${issuesMessage}\n\n${orchestratorContext.systemMessage}`
            : orchestratorContext.systemMessage;
        const systemMessage = baseSystemMessage;
        respond(createResponse({
            systemMessage,
            output: {
                validation: validationResult,
                tests: testResult,
                telemetryWritten,
                agentId: agentId || undefined,
                agentType,
                durationMs,
            },
        }));
    }
    catch (error) {
        logError('SubagentStop main', error);
        respond(createResponse());
    }
}
// Re-export utility functions for testing and external use
export { saveAgentTracking } from './telemetry.js';
export { getAgentTracking, removeAgentTracking, writeTelemetryEntry, buildTelemetryEntry } from './telemetry.js';
export { validateAgentOutput } from './output-validation.js';
export { verifyAgentTests } from './test-verification.js';
export { buildOrchestratorContext } from './context-injection.js';
// Only run the hook if not in test mode
if (!isTestEnvironment()) {
    runSubagentStopHook().catch((error) => {
        logError('SubagentStop uncaught', error);
        respond(createResponse());
    });
}
