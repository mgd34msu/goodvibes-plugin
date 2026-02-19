/* v8 ignore file */
/**
 * Setup Hook Entry Point
 *
 * Runs during `claude init` to pre-write CLAUDE.md chain files.
 * This ensures all import chain files exist before any session starts,
 * avoiding race conditions where SessionStart isn't fast enough.
 */

import { runHook, createResponse, debug, PROJECT_ROOT } from './shared/index.js';
import { ensureClaudeMdImports } from './session-start/claude-md-manager.js';

runHook('Setup', async (input) => {
  const projectDir = input.cwd || PROJECT_ROOT;
  debug(`Setup: ensuring CLAUDE.md imports in ${projectDir}`);
  await ensureClaudeMdImports(projectDir);
  return createResponse({
    systemMessage: 'GoodVibes: Setup complete - CLAUDE.md chain files installed.',
  });
});
