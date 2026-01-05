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
  HookResponse,
} from './shared.js';

import {
  getAgentTracking,
  removeAgentTracking,
  writeTelemetryEntry,
  buildTelemetryEntry,
} from './subagent-stop/telemetry.js';

import { validateAgentOutput, ValidationResult } from './subagent-stop/output-validation.js';
import { verifyAgentTests, TestVerificationResult } from './subagent-stop/test-verification.js';
import { loadState, saveState } from './state.js';

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

/** Main entry point for subagent-stop hook. Correlates with start, validates output, writes telemetry. */
async function main(): Promise<void> {
  try {
    debug('SubagentStop hook starting');

    const rawInput = await readHookInput();
    debug('Raw input shape:', Object.keys(rawInput || {}));
    const input = rawInput as unknown as SubagentStopInput;

    // Extract subagent info (handle different field names)
    const agentId = input.agent_id || input.subagent_id || '';
    const agentType = input.agent_type || input.subagent_type || 'unknown';
    const transcriptPath = input.agent_transcript_path || input.subagent_transcript_path || '';
    const cwd = input.cwd || process.cwd();

    debug('SubagentStop received input', {
      agent_id: agentId,
      agent_type: agentType,
      session_id: input.session_id,
      transcript_path: transcriptPath,
    });

    // Load state for validation and test tracking
    const state = await loadState(cwd);

    // Initialize output results
    let validationResult: ValidationResult | undefined;
    let testResult: TestVerificationResult | undefined;
    let telemetryWritten = false;
    let durationMs = 0;

    // Get agent tracking from start
    const tracking = agentId ? await getAgentTracking(cwd, agentId) : null;

    if (tracking) {
      debug('Found matching tracking entry', {
        agent_id: tracking.agent_id,
        agent_type: tracking.agent_type,
        started_at: tracking.started_at,
      });

      // Calculate duration
      const startedAt = new Date(tracking.started_at).getTime();
      durationMs = Date.now() - startedAt;

      // Validate agent output (type check if TS files modified)
      if (transcriptPath) {
        validationResult = await validateAgentOutput(cwd, transcriptPath, state);
        debug('Validation result', {
          valid: validationResult.valid,
          filesModified: validationResult.filesModified.length,
          errors: validationResult.errors.length,
        });

        // Verify tests for modified files
        if (validationResult.filesModified.length > 0) {
          testResult = await verifyAgentTests(cwd, validationResult.filesModified, state);
          debug('Test verification result', {
            ran: testResult.ran,
            passed: testResult.passed,
            summary: testResult.summary,
          });
        }
      }

      // Build telemetry entry with keywords, files, tools, summary
      const status = (validationResult?.valid !== false && testResult?.passed !== false)
        ? 'completed'
        : 'failed';

      const telemetryEntry = await buildTelemetryEntry(
        tracking,
        transcriptPath,
        status
      );

      // Write telemetry to monthly JSONL file
      await writeTelemetryEntry(cwd, telemetryEntry);
      telemetryWritten = true;

      debug('Telemetry entry written', {
        agent_id: telemetryEntry.agent_id,
        duration_ms: telemetryEntry.duration_ms,
        status: telemetryEntry.status,
      });

      // Remove tracking entry
      await removeAgentTracking(cwd, agentId);
      debug('Removed agent tracking', { agent_id: agentId });

      // Update session analytics
      const analytics = await loadAnalytics();
      if (analytics && analytics.subagents_spawned) {
        // Find and update the matching subagent entry
        const subagentEntry = analytics.subagents_spawned.find(
          (s: { type: string; started_at: string }) => s.type === tracking.agent_type &&
               s.started_at === tracking.started_at
        );
        if (subagentEntry) {
          subagentEntry.completed_at = new Date().toISOString();
          subagentEntry.success = status === 'completed';
          await saveAnalytics(analytics);
        }
      }

      // Save updated state
      await saveState(cwd, state);

    } else {
      debug('No matching tracking entry found', {
        agent_id: agentId,
        agent_type: agentType,
      });

      // Even without a tracking entry, we can still validate if transcript exists
      if (transcriptPath) {
        validationResult = await validateAgentOutput(cwd, transcriptPath, state);

        if (validationResult.filesModified.length > 0) {
          testResult = await verifyAgentTests(cwd, validationResult.filesModified, state);
        }

        await saveState(cwd, state);
      }
    }

    // Build system message summarizing results
    let systemMessage: string | undefined;
    const issues: string[] = [];

    if (validationResult && !validationResult.valid) {
      issues.push('Validation errors: ' + validationResult.errors.join(', '));
    }

    if (testResult && !testResult.passed) {
      issues.push('Test failures: ' + testResult.summary);
    }

    if (issues.length > 0) {
      systemMessage = '[GoodVibes] Agent ' + agentType + ' completed with issues: ' + issues.join('; ');
    }

    // Return validation results in output
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

  } catch (error: unknown) {
    logError('SubagentStop main', error);
    respond(createResponse());
  }
}

main();
