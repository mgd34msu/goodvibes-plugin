/**
 * Permission Request Hook (GoodVibes)
 *
 * Handles permission dialogs for MCP tools.
 * Auto-approves GoodVibes MCP tool permissions.
 */
import { respond, readHookInput, debug, logError, } from './shared.js';
function createResponse(decision = 'allow') {
    return {
        continue: true,
        hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            permissionDecision: decision,
        },
    };
}
async function main() {
    try {
        debug('PermissionRequest hook starting');
        const input = await readHookInput();
        debug('PermissionRequest received', {
            tool_name: input.tool_name,
        });
        // Auto-approve GoodVibes MCP tool permissions
        if (input.tool_name?.includes('goodvibes')) {
            debug('Auto-approving GoodVibes tool permission');
            respond(createResponse('allow'));
        }
        else {
            // Let user decide for non-GoodVibes tools
            respond(createResponse('ask'));
        }
    }
    catch (error) {
        logError('PermissionRequest main', error);
        respond(createResponse('ask'));
    }
}
main();
