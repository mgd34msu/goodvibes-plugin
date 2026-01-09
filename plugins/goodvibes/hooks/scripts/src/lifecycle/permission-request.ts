/**
 * Permission Request Hook (GoodVibes)
 *
 * Handles permission dialogs for MCP tools.
 * Auto-approves GoodVibes MCP tool permissions.
 */

import {
  respond,
  readHookInput,
  debug,
  logError,
  createPermissionResponse,
  isTestEnvironment,
} from '../shared/index.js';

/** Main entry point for permission-request hook. Auto-approves GoodVibes MCP tool permissions. */
async function runPermissionRequestHook(): Promise<void> {
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
    } else {
      // Let user decide for non-GoodVibes tools
      respond(createPermissionResponse('ask'));
    }
  } catch (error: unknown) {
    logError('PermissionRequest main', error);
    respond(createPermissionResponse('ask'));
  }
}

// Only run the hook if not in test mode
/* v8 ignore start - test environment guard */
if (!isTestEnvironment()) {
  runPermissionRequestHook().catch((error: unknown) => {
    logError('PermissionRequest uncaught', error);
    respond(createPermissionResponse('ask'));
  });
}
/* v8 ignore stop */
