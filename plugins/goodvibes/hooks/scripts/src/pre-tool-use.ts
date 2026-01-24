/* v8 ignore file */
/**
 * Pre Tool Use Hook Entry Point
 *
 * This is a thin entry point that executes the pre-tool-use hook.
 * The actual implementation lives in src/pre-tool-use/hook.ts
 */

import { runPreToolUseHook } from './pre-tool-use/hook.js';

void runPreToolUseHook();