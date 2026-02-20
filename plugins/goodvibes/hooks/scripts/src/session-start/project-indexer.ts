/**
 * Project indexer — delegates to precision-engine's canonical implementation.
 *
 * The indexer source of truth lives in:
 *   precision-engine/src/state/project-indexer.ts
 *
 * This wrapper calls the pre-built CLI at runtime via subprocess,
 * avoiding cross-package TypeScript imports.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { debug, logError } from '../shared/index.js';

const execFileAsync = promisify(execFile);

/**
 * Build the project file index by delegating to precision-engine's CLI.
 * The CLI writes the index to .goodvibes/project-index.json atomically.
 */
export async function buildProjectIndex(projectDir: string): Promise<void> {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT
    || path.resolve(projectDir, '.claude', 'plugins', 'goodvibes');
  const cli = path.join(
    pluginRoot, 'tools', 'implementations',
    'precision-engine', 'dist', 'build-index.cjs'
  );

  try {
    // Verify the CLI exists before spawning to provide a clear error message
    await access(cli);
    const { stderr } = await execFileAsync('node', [cli, projectDir], {
      timeout: 35_000,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    if (stderr) {
      debug('Indexer output', { stderr: stderr.slice(0, 500) });
    }
  } catch (err) {
    logError('Project indexer CLI failed', err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}
