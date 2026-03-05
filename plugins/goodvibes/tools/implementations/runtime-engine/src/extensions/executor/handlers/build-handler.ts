/**
 * Build Handler
 *
 * Workflow ActionHandler implementation that executes a build command and
 * records the result in the workflow context. Designed for use as a
 * `invoke_handler` action in workflow definitions.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '../../../shared/logger.js';
import { toErrorMessage } from '../../../shared/utils.js';
import type { WorkflowContext } from '../../workflow/types.js';

const log = createLogger('handler:build');
const execAsync = promisify(exec);

/** Maximum characters of combined stdout/stderr to store in context. */
const MAX_OUTPUT_CHARS = 2000;

/**
 * Factory that creates a workflow ActionHandler for running build commands.
 *
 * The handler executes the configured build command (or `npm run build` by
 * default) and writes the following keys into the workflow context:
 * - `build_result` — `'success'` or `'failed'`.
 * - `build_output` — combined stdout/stderr, truncated to 2000 characters.
 *
 * Config keys:
 * - `command` (string) — build command to run. Defaults to `'npm run build'`.
 * - `cwd`     (string) — working directory. Defaults to `process.cwd()`.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns An ActionHandler compatible with WorkflowEngine.registerAction().
 */
export function runBuild(
  projectRoot: string,
): (context: WorkflowContext, config: Record<string, unknown>) => Promise<void> {
  return async (
    context: WorkflowContext,
    config: Record<string, unknown>,
  ): Promise<void> => {
    const command =
      typeof config['command'] === 'string' ? config['command'] : 'npm run build';
    const cwd =
      typeof config['cwd'] === 'string' ? config['cwd'] : projectRoot;

    log.info('Running build', { command, cwd });

    try {
      const { stdout, stderr } = await execAsync(command, { cwd });
      const combined = `${stdout}\n${stderr}`.trim().slice(0, MAX_OUTPUT_CHARS);
      context['build_result'] = 'success';
      context['build_output'] = combined;
      log.info('Build succeeded', { command });
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; message?: string };
      const combined = [
        execErr.stdout ?? '',
        execErr.stderr ?? '',
        execErr.message ?? toErrorMessage(err),
      ]
        .join('\n')
        .trim()
        .slice(0, MAX_OUTPUT_CHARS);
      context['build_result'] = 'failed';
      context['build_output'] = combined;
      log.warn('Build failed', { command, error: execErr.message ?? toErrorMessage(err) });
    }
  };
}
