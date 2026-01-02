"use strict";
/**
 * Notification Hook (GoodVibes)
 *
 * Handles notifications from Claude Code:
 * - Validation failures
 * - Test failures
 * - Build errors
 */
function main() {
    // Read notification from stdin
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
        input += chunk;
    });
    process.stdin.on('end', () => {
        try {
            if (input) {
                const notification = JSON.parse(input);
                // Log notification for debugging
                console.error('GoodVibes notification:', notification.type || 'unknown');
                // Could send to external service, log file, etc.
                // For now, just acknowledge
            }
        }
        catch {
            // Ignore parse errors
        }
    });
    // For non-piped input, exit immediately
    if (process.stdin.isTTY) {
        process.exit(0);
    }
}
main();
