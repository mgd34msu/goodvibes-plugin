/**
 * Hook I/O
 *
 * Functions for reading hook input from stdin and responding with hook output.
 */
/** Timeout in ms for waiting on stdin input before using defaults. */
const STDIN_TIMEOUT_MS = 100;
/**
 * Read hook input from stdin
 */
export async function readHookInput() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => {
            data += chunk;
        });
        process.stdin.on('end', () => {
            try {
                resolve(JSON.parse(data));
            }
            catch (error) {
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
export function allowTool(hookEventName, systemMessage) {
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
export function blockTool(hookEventName, reason) {
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
export function respond(response, block = false) {
    console.log(JSON.stringify(response));
    process.exit(block ? 2 : 0);
}
