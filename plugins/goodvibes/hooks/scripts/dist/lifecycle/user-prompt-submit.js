/**
 * User Prompt Submit Hook (GoodVibes)
 *
 * Runs before Claude processes user input.
 * Can add context or validate prompts.
 */
import { respond, readHookInput, debug, logError, createResponse, isTestEnvironment, } from '../shared/index.js';
/**
 * Main entry point for user-prompt-submit hook.
 *
 * Runs before Claude processes user input. Can be extended to add
 * context injection based on prompt content or validate prompts.
 *
 * @internal
 */
async function runUserPromptSubmitHook() {
    try {
        debug('UserPromptSubmit hook starting');
        const input = await readHookInput();
        debug('UserPromptSubmit received input', {
            session_id: input.session_id,
        });
        // Could add context injection here based on prompt content
        // For now, just continue
        respond(createResponse());
    }
    catch (error) {
        logError('UserPromptSubmit main', error);
        respond(createResponse());
    }
}
// Only run the hook if not in test mode
/* v8 ignore start - test environment guard */
if (!isTestEnvironment()) {
    runUserPromptSubmitHook().catch((error) => {
        logError('UserPromptSubmit uncaught', error);
        respond(createResponse());
    });
}
/* v8 ignore stop */
