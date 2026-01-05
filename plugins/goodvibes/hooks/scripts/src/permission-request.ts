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
  HookResponse,
} from './shared.js';

/** Creates a hook response with permission decision. */
function createResponse(decision: 'allow' | 'deny' | 'ask' = 'allow'): HookResponse {
  return {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      permissionDecision: decision,
    },
  };
}

/** Main entry point for permission-request hook. Auto-approves GoodVibes MCP tool permissions. */
async function main(): Promise<void> {
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
    } else {
      // Let user decide for non-GoodVibes tools
      respond(createResponse('ask'));
    }

  } catch (error: unknown) {
    logError('PermissionRequest main', error);
    respond(createResponse('ask'));
  }
}

main();
