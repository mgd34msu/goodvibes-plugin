/**
 * Hook I/O
 *
 * Functions for reading hook input from stdin and responding with hook output.
 */

import { stdin } from 'process';

/**
 * Checks if the current process is running in a test environment.
 */
export function isTestEnvironment(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.VITEST === 'true' ||
    typeof (globalThis as { __vitest_worker__?: unknown }).__vitest_worker__ !==
      'undefined'
  );
}

/**
 * Type guard to validate hook input structure at runtime
 */
function isValidHookInput(value: unknown): value is HookInput {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.session_id === 'string' &&
    typeof obj.cwd === 'string' &&
    typeof obj.hook_event_name === 'string'
  );
}

/** Hook input from stdin (provided by Claude Code). */
export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

/** Hook-specific output for PreToolUse/PermissionRequest events. */
export interface HookSpecificOutput {
  hookEventName: string;
  permissionDecision?: 'allow' | 'deny' | 'ask';
  permissionDecisionReason?: string;
  additionalContext?: string;
  updatedInput?: Record<string, unknown>;
}

/** Hook response type (official Claude Code schema). */
export interface HookResponse {
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  hookSpecificOutput?: HookSpecificOutput;
}

/**
 * Reads and parses hook input from stdin provided by Claude Code.
 */
export async function readHookInput(): Promise<HookInput> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(chunk);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString());
  if (!isValidHookInput(parsed)) {
    throw new Error('Invalid hook input structure');
  }
  return parsed;
}

/**
 * Creates a hook response that allows the tool to proceed with execution.
 */
export function allowTool(
  hookEventName: string,
  additionalContext?: string,
  updatedInput?: Record<string, unknown>
): HookResponse {
  return {
    continue: true,
    hookSpecificOutput: {
      hookEventName,
      permissionDecision: 'allow',
      additionalContext,
      updatedInput,
    },
  };
}

/**
 * Creates a hook response that blocks the tool from executing.
 */
export function blockTool(hookEventName: string, reason: string): HookResponse {
  return {
    continue: false,
    hookSpecificOutput: {
      hookEventName,
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

/**
 * Formats a hook response as JSON string.
 */
export function formatResponse(response: HookResponse | ExtendedHookResponse): string {
  return JSON.stringify(response);
}

/**
 * Outputs the hook response as JSON to stdout and exits.
 */
export function respond(response: ExtendedHookResponse, _block: boolean = false): never {
  console.log(formatResponse(response));
  process.exit(0);
}

/**
 * Options for creating a hook response.
 */
export interface CreateResponseOptions {
  systemMessage?: string;
  additionalContext?: string;
}

/**
 * Extended hook response that includes additionalContext for session-start.
 */
export interface ExtendedHookResponse extends HookResponse {
  additionalContext?: string;
}

/**
 * Creates a standard hook response that allows the hook to continue.
 */
export function createResponse(
  options: CreateResponseOptions = {}
): ExtendedHookResponse {
  const response: ExtendedHookResponse = {
    continue: true,
  };

  if (options.systemMessage !== undefined) {
    response.systemMessage = options.systemMessage;
  }

  if (options.additionalContext !== undefined) {
    response.additionalContext = options.additionalContext;
  }

  return response;
}

/**
 * Permission decision type for permission-request hooks.
 */
export type PermissionDecision = 'allow' | 'deny' | 'ask';

/**
 * Creates a hook response for permission request hooks.
 */
export function createPermissionResponse(
  decision: PermissionDecision = 'allow',
  reason?: string
): HookResponse {
  const response: HookResponse = {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      permissionDecision: decision,
    },
  };

  if (reason && response.hookSpecificOutput) {
    response.hookSpecificOutput.permissionDecisionReason = reason;
  }

  return response;
}