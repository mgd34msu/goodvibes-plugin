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

import {
  respond,
  readHookInput,
  loadAnalytics,
  saveAnalytics,
  debug,
  logError,
  isTestEnvironment,
} from '../shared/index.js';
import { loadState, saveState } from '../state/index.js';

import { validateAgentOutput } from './output-validation.js';
import {
  getAgentTracking,
  removeAgentTracking,
  writeTelemetryEntry,
  buildTelemetryEntry,
} from './telemetry.js';
import { verifyAgentTests } from './test-verification.js';

import type { ValidationResult } from './output-validation.js';
import type { TestVerificationResult } from './test-verification.js';
import type { HookResponse } from '../shared/index.js';

// Extended hook input interface for SubagentStop
interface SubagentStopInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
  // Subagent-specific fields
  agent_id?: string;
  subagent_id?: string;
  agent_type?: string;
  subagent_type?: string;
  agent_transcript_path?: string;
  subagent_transcript_path?: string;
  task_output?: string;
  result?: string;
  success?: boolean;
}

interface SubagentStopResponse extends HookResponse {
  output?: {
    validation?: ValidationResult;
    tests?: TestVerificationResult;
    telemetryWritten?: boolean;
    agentId?: string;
    agentType?: string;
    durationMs?: number;
  };
}

/** Creates a hook response with optional system message and output data. */
function createResponse(options?: {
  systemMessage?: string;
  output?: SubagentStopResponse['output'];
}): SubagentStopResponse {
  const response: SubagentStopResponse = {
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

/** Extracts normalized input fields from raw hook input. */
function extractInputFields(input: SubagentStopInput): {
  agentId: string;
  agentType: string;
  transcriptPath: string;
  cwd: string;
} {
  return {
    agentId: input.agent_id ?? input.subagent_id ?? '',
    agentType: input.agent_type ?? input.subagent_type ?? 'unknown',
    transcriptPath: input.agent_transcript_path ?? input.subagent_transcript_path ?? '',
    cwd: input.cwd ?? process.cwd(),
  };
}

/** Validates agent output and runs tests on modified files. */
async function validateAndTest(
  cwd: string,
  transcriptPath: string,
  state: Awaited<ReturnType<typeof loadState>>
): Promise<{
  validationResult: ValidationResult | undefined;
  testResult: TestVerificationResult | undefined;
  updatedState: Awaited<ReturnType<typeof loadState>>;
}> {
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

  let testResult: TestVerificationResult | undefined;
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

/** Updates analytics with subagent completion info. */
async function updateAnalytics(
  tracking: NonNullable<Awaited<ReturnType<typeof getAgentTracking>>>,
  status: 'completed' | 'failed'
): Promise<void> {
  const analytics = await loadAnalytics();
  if (!analytics?.subagents_spawned) {
    return;
  }

  const subagentEntry = analytics.subagents_spawned.find(
    (s: { type: string; started_at: string }) =>
      s.type === tracking.agent_type && s.started_at === tracking.started_at
  );

  if (subagentEntry) {
    subagentEntry.completed_at = new Date().toISOString();
    subagentEntry.success = status === 'completed';
    await saveAnalytics(analytics);
  }
}

/** Determines the completion status based on validation and test results. */
function determineStatus(
  validationResult: ValidationResult | undefined,
  testResult: TestVerificationResult | undefined
): 'completed' | 'failed' {
  const hasValidationErrors = validationResult?.valid === false;
  const hasTestFailures = testResult?.passed === false;
  return hasValidationErrors || hasTestFailures ? 'failed' : 'completed';
}

/** Builds a system message summarizing any issues found. */
function buildIssuesMessage(
  agentType: string,
  validationResult: ValidationResult | undefined,
  testResult: TestVerificationResult | undefined
): string | undefined {
  const issues: string[] = [];

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

/** Main entry point for subagent-stop hook. Correlates with start, validates output, writes telemetry. */
async function runSubagentStopHook(): Promise<void> {
  try {
    debug('SubagentStop hook starting');

    const rawInput = await readHookInput();
    debug('Raw input shape:', Object.keys(rawInput || {}));
    const input = rawInput as unknown as SubagentStopInput;

    const { agentId, agentType, transcriptPath, cwd } = extractInputFields(input);

    debug('SubagentStop received input', {
      agent_id: agentId,
      agent_type: agentType,
      session_id: input.session_id,
      transcript_path: transcriptPath,
    });

    let state = await loadState(cwd);
    let validationResult: ValidationResult | undefined;
    let testResult: TestVerificationResult | undefined;
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
    } else {
      debug('No matching tracking entry found', { agent_id: agentId, agent_type: agentType });

      const validated = await validateAndTest(cwd, transcriptPath, state);
      validationResult = validated.validationResult;
      testResult = validated.testResult;
      state = validated.updatedState;

      if (transcriptPath) {
        await saveState(cwd, state);
      }
    }

    const systemMessage = buildIssuesMessage(agentType, validationResult, testResult);

    respond(
      createResponse({
        systemMessage,
        output: {
          validation: validationResult,
          tests: testResult,
          telemetryWritten,
          agentId: agentId || undefined,
          agentType,
          durationMs,
        },
      })
    );
  } catch (error: unknown) {
    logError('SubagentStop main', error);
    respond(createResponse());
  }
}

// Re-export utility functions for testing and external use
export { saveAgentTracking } from './telemetry.js';
export { getAgentTracking, removeAgentTracking, writeTelemetryEntry, buildTelemetryEntry } from './telemetry.js';
export { validateAgentOutput, type ValidationResult } from './output-validation.js';
export { verifyAgentTests, type TestVerificationResult } from './test-verification.js';

// Only run the hook if not in test mode
if (!isTestEnvironment()) {
  runSubagentStopHook().catch((error: unknown) => {
    logError('SubagentStop uncaught', error);
    respond(createResponse());
  });
}
