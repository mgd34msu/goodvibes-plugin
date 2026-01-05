/**
 * User Prompt Submit Hook (GoodVibes)
 *
 * Runs before Claude processes user input.
 * Can add context or validate prompts.
 */
import { respond, readHookInput, debug, logError, createResponse, } from './shared/index.js';
/** Main entry point for user-prompt-submit hook. Can add context or validate prompts. */
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
runUserPromptSubmitHook();
