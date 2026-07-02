/* v8 ignore file */
/**
 * Prompt-chain installer CLI — the only consented write path for the
 * GoodVibes prompt chain besides the Setup hook (`claude init`).
 *
 * Invoked by the /goodvibes:plugin command:
 *   node dist/prompt-installer.js install   [projectDir]  — install the chain
 *   node dist/prompt-installer.js uninstall [projectDir]  — clean removal
 *   node dist/prompt-installer.js status    [projectDir]  — read-only state
 *
 * SessionStart never calls this; it only detects and reports install state.
 */

import {
  ensureClaudeMdImports,
  removeClaudeMdImports,
  detectPromptInstallation,
} from './session-start/claude-md-manager.js';

async function main(): Promise<number> {
  const command = process.argv[2] ?? '';
  const projectDir = process.argv[3] ?? process.cwd();

  switch (command) {
    case 'install': {
      await ensureClaudeMdImports(projectDir);
      const state = await detectPromptInstallation(projectDir);
      process.stdout.write(JSON.stringify({ action: 'install', ...state }, null, 2) + '\n');
      return state.installed ? 0 : 1;
    }
    case 'uninstall': {
      const result = await removeClaudeMdImports(projectDir);
      process.stdout.write(JSON.stringify({ action: 'uninstall', ...result }, null, 2) + '\n');
      return 0;
    }
    case 'status': {
      const state = await detectPromptInstallation(projectDir);
      process.stdout.write(JSON.stringify({ action: 'status', ...state }, null, 2) + '\n');
      return 0;
    }
    default: {
      process.stderr.write('Usage: prompt-installer <install|uninstall|status> [projectDir]\n');
      return 2;
    }
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(
      `prompt-installer failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exitCode = 1;
  });
