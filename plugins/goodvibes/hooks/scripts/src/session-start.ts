/**
 * Session Start Hook
 *
 * Initializes the GoodVibes plugin:
 * - Validates registries exist
 * - Creates cache directory
 * - Initializes analytics
 * - Gathers and injects project context (Smart Context Injection)
 */

import {
  respond,
  readHookInput,
  validateRegistries,
  ensureCacheDir,
  saveAnalytics,
  debug,
  logError,
  HookResponse,
  PROJECT_ROOT,
} from './shared.js';

import { gatherProjectContext, ContextInjectionResult } from './context/index.js';

interface SessionStartResponse extends HookResponse {
  additionalContext?: string;
}

function createResponse(systemMessage?: string, additionalContext?: string): SessionStartResponse {
  const response: SessionStartResponse = {
    continue: true,
    systemMessage,
  };

  if (additionalContext) {
    response.additionalContext = additionalContext;
  }

  return response;
}

async function main(): Promise<void> {
  try {
    debug('SessionStart hook starting');

    // Read hook input from stdin (contains session info)
    const input = await readHookInput();
    debug('SessionStart received input', { session_id: input.session_id, hook_event_name: input.hook_event_name });

    // Ensure cache directory exists
    ensureCacheDir();
    debug('Cache directory ensured');

    // Validate registries
    const { valid, missing } = validateRegistries();
    debug('Registry validation', { valid, missing });

    if (!valid) {
      respond(createResponse(`GoodVibes: Warning - Missing registries: ${missing.join(', ')}. Run build-registries script.`));
      return;
    }

    // Initialize analytics for this session
    const sessionId = input.session_id || `session_${Date.now()}`;

    // Gather project context (Smart Context Injection)
    // Uses the cwd from input, or falls back to PROJECT_ROOT
    const projectDir = input.cwd || PROJECT_ROOT;
    debug(`Gathering project context from: ${projectDir}`);

    let contextResult: ContextInjectionResult;
    try {
      contextResult = await gatherProjectContext(projectDir);
      debug(`Context gathered in ${contextResult.gatherTimeMs}ms`, {
        isEmptyProject: contextResult.isEmptyProject,
        hasIssues: contextResult.hasIssues,
        issueCount: contextResult.issueCount,
      });
    } catch (contextError) {
      // Context gathering failed - continue without context
      logError('Context gathering', contextError);
      contextResult = {
        additionalContext: '',
        summary: 'Context gathering failed',
        isEmptyProject: false,
        hasIssues: false,
        issueCount: 0,
        gatherTimeMs: 0,
      };
    }

    // Save analytics with detected stack info
    saveAnalytics({
      session_id: sessionId,
      started_at: new Date().toISOString(),
      tool_usage: [],
      skills_recommended: [],
      validations_run: 0,
      issues_found: contextResult.issueCount,
      detected_stack: {
        isEmptyProject: contextResult.isEmptyProject,
        hasIssues: contextResult.hasIssues,
        gatherTimeMs: contextResult.gatherTimeMs,
      },
    });
    debug(`Analytics initialized for session ${sessionId}`);

    // Build system message
    const systemMessage = buildSystemMessage(sessionId, contextResult);

    // Success response with context injection
    respond(createResponse(systemMessage, contextResult.additionalContext || undefined));

  } catch (error) {
    logError('SessionStart main', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    respond(createResponse(`GoodVibes: Init error - ${message}`));
  }
}

/**
 * Build the system message based on context gathering results
 */
function buildSystemMessage(sessionId: string, context: ContextInjectionResult): string {
  const parts: string[] = [];

  // Base message
  parts.push(`GoodVibes plugin v2.1.0 initialized.`);
  parts.push(`17 tools available.`);
  parts.push(`Session: ${sessionId.slice(-8)}`);

  // Context summary
  if (context.isEmptyProject) {
    parts.push('| Empty project detected - scaffolding tools available.');
  } else if (context.summary) {
    parts.push(`| ${context.summary}`);
  }

  // Performance note
  if (context.gatherTimeMs > 0) {
    parts.push(`(context: ${context.gatherTimeMs}ms)`);
  }

  return parts.join(' ');
}

main();
