/**
 * Hook I/O
 *
 * Functions for reading hook input from stdin and responding with hook output.
 */

/** Timeout in ms for waiting on stdin input before using defaults. */
const STDIN_TIMEOUT_MS = 100;

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
 * Read hook input from stdin
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
        resolve(JSON.parse(data) as HookInput);
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
 * Create a response that allows the tool to proceed
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
 * Create a response that blocks the tool
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
 * Output hook response as JSON and exit with appropriate code
 * Exit 0 = success, Exit 2 = blocking error
 */
export function respond(response: HookResponse, block: boolean = false): void {
  console.log(JSON.stringify(response));
  process.exit(block ? 2 : 0);
}
