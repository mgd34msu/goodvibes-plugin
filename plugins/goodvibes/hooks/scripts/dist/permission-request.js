/**
 * Permission Request Hook (GoodVibes)
 *
 * Handles permission dialogs for MCP tools.
 * Auto-approves GoodVibes MCP tool permissions.
 */
import { respond, readHookInput, debug, logError, createPermissionResponse, } from './shared/index.js';
/** Main entry point for permission-request hook. Auto-approves GoodVibes MCP tool permissions. */
async function runPermissionRequestHook() {
    try {
        debug('PermissionRequest hook starting');
        const input = await readHookInput();
        debug('PermissionRequest received', {
            tool_name: input.tool_name,
        });
        // Auto-approve GoodVibes MCP tool permissions
        if (input.tool_name?.includes('goodvibes')) {
            debug('Auto-approving GoodVibes tool permission');
            respond(createPermissionResponse('allow'));
        }
        else {
            // Let user decide for non-GoodVibes tools
            respond(createPermissionResponse('ask'));
        }
    }
    catch (error) {
        logError('PermissionRequest main', error);
        respond(createPermissionResponse('ask'));
    }
}
runPermissionRequestHook();
