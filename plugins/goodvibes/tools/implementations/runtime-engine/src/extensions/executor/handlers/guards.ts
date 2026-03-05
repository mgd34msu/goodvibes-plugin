/**
 * Executor Guard Functions
 *
 * Named guard functions for use with workflow definitions that involve
 * build and test outcomes. Registered via WorkflowEngine.registerGuard().
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '../../../shared/logger.js';
import { toErrorMessage } from '../../../shared/utils.js';
import type { StateStoreInterface } from '../../../core/types.js';
import type { RuntimeEvent } from '../../../shared/events.js';
import type { WorkflowContext, GuardFunction } from '../../workflow/types.js';

const log = createLogger('handler:guards');

/** The default npm test script placeholder that indicates no real tests exist. */
const DEFAULT_NPM_TEST_SCRIPT = 'echo "Error: no test specified"';

/**
 * Factory that creates a GuardFunction checking whether the project has a
 * real test suite.
 *
 * Reads `package.json` synchronously and checks for a `"test"` script that
 * is not the npm default placeholder. Returns `false` if package.json is
 * missing, malformed, or the test script is absent or is the default stub.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns A GuardFunction.
 */
export function hasTestSuite(projectRoot: string): GuardFunction {
  return (_context: WorkflowContext, _event: RuntimeEvent): boolean => {
    const pkgPath = join(projectRoot, 'package.json');
    try {
      const raw = readFileSync(pkgPath, 'utf-8');
      const pkg: unknown = JSON.parse(raw);
      if (typeof pkg !== 'object' || pkg === null) return false;
      const scripts = (pkg as Record<string, unknown>)['scripts'];
      if (typeof scripts !== 'object' || scripts === null) return false;
      const testScript = (scripts as Record<string, unknown>)['test'];
      if (typeof testScript !== 'string') return false;
      return testScript.trim() !== '' && !testScript.includes(DEFAULT_NPM_TEST_SCRIPT);
    } catch (err) {
      log.debug('hasTestSuite: could not read package.json', { error: toErrorMessage(err), projectRoot });
      return false;
    }
  };
}

/**
 * Factory that creates a GuardFunction checking whether the last build passed.
 *
 * Reads `build.last_result` from the state store and returns `true` only when
 * the value is `'success'`.
 *
 * @param stateStore - The runtime state store instance.
 * @returns A GuardFunction.
 */
export function buildPassing(stateStore: StateStoreInterface): GuardFunction {
  return (_context: WorkflowContext, _event: RuntimeEvent): boolean => {
    const result = stateStore.get<string>('build.last_result');
    return result === 'success';
  };
}
