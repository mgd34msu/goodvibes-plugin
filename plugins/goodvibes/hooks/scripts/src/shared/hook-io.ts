/**
 * Hook I/O
 *
 * Functions for reading hook input from stdin and responding with hook output.
 */

/** Timeout in ms for waiting on stdin input before using defaults. */
const STDIN_TIMEOUT_MS = 100;

/**
 * Type guard to validate hook input structure at runtime
 */
function isValidHookInput(value: unknown): value is HookInput {
  if (typeof value !== 'object' || value === null) return false;
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
 *
 * Waits for JSON input on stdin, parses it, and validates the structure.
 * If no input is received within the timeout period, returns default values.
 *
 * @returns A promise that resolves to the parsed hook input
 * @throws Error if the JSON is malformed or doesn't match the HookInput structure
 *
 * @example
 * const input = await readHookInput();
 * console.log(input.hook_event_name); // 'PreToolUse'
 * console.log(input.tool_name); // 'Bash'
 */
export async function readHookInput(): Promise<HookInput> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (!isValidHookInput(parsed)) {
          reject(new Error('Invalid hook input structure'));
          return;
        }
        resolve(parsed);
      } catch (error) {
        reject(new Error('Failed to parse hook input from stdin'));
      }
    });
    process.stdin.on('error', reject);
    // Handle case where no stdin is provided (timeout after configured delay)
    setTimeout(() => {
      if (!data) {
        resolve({
          session_id: '',
          transcript_path: '',
          cwd: process.cwd(),
          permission_mode: 'default',
          hook_event_name: 'unknown',
        });
      }
    }, STDIN_TIMEOUT_MS);
  });
}

/**
 * Creates a hook response that allows the tool to proceed with execution.
 *
 * Use this when the hook determines the tool operation should be permitted.
 * Optionally includes a system message that will be shown to the AI.
 *
 * @param hookEventName - The name of the hook event (e.g., 'PreToolUse', 'PermissionRequest')
 * @param systemMessage - Optional message to inject into the conversation context
 * @returns A HookResponse object with continue=true and allow decision
 *
 * @example
 * // Allow a Bash command with no message
 * respond(allowTool('PreToolUse'));
 *
 * @example
 * // Allow with a helpful system message
 * respond(allowTool('PreToolUse', 'Remember to run tests after this change'));
 */
export function allowTool(hookEventName: string, systemMessage?: string): HookResponse {
  return {
    continue: true,
    systemMessage,
    hookSpecificOutput: {
      hookEventName,
      permissionDecision: 'allow',
    },
  };
}

/**
 * Creates a hook response that blocks the tool from executing.
 *
 * Use this when the hook determines the tool operation should be denied.
 * The reason is displayed to explain why the operation was blocked.
 *
 * @param hookEventName - The name of the hook event (e.g., 'PreToolUse', 'PermissionRequest')
 * @param reason - Human-readable explanation for why the tool was blocked
 * @returns A HookResponse object with continue=false and deny decision
 *
 * @example
 * // Block a dangerous command
 * respond(blockTool('PreToolUse', 'rm -rf commands are not permitted'), true);
 *
 * @example
 * // Block due to security policy
 * respond(blockTool('PermissionRequest', 'Access to .env files is restricted'));
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
 * Outputs the hook response as JSON to stdout and exits the process.
 *
 * This is the final call in any hook script. It serializes the response
 * to JSON and exits with the appropriate code:
 * - Exit 0: Success (tool proceeds or is allowed)
 * - Exit 2: Blocking error (tool is denied)
 *
 * @param response - The HookResponse object to output
 * @param block - If true, exits with code 2 to indicate a blocking action
 *
 * @example
 * // Allow the tool to proceed
 * respond(allowTool('PreToolUse'));
 *
 * @example
 * // Block the tool with exit code 2
 * respond(blockTool('PreToolUse', 'Operation not permitted'), true);
 */
export function respond(response: HookResponse, block: boolean = false): void {
  console.log(JSON.stringify(response));
  process.exit(block ? 2 : 0);
}
