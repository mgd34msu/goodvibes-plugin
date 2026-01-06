/**
 * Environment Checker (Backwards Compatibility Module)
 *
 * This module provides backwards compatibility for consumers that import from env-checker.ts.
 * All functionality has been consolidated into environment.ts.
 *
 * **Migration Guide:**
 * - `checkEnvironment` (EnvStatus) -> Use `checkEnvStatus` from './environment.js'
 * - `EnvStatus` type -> Import from './environment.js'
 * - `formatEnvStatus` -> Import from './environment.js'
 *
 * @deprecated Import from './environment.js' instead for new code.
 */

import {
  checkEnvStatus,
  formatEnvStatus as formatEnvStatusImpl,
  type EnvStatus,
} from './environment.js';

// Re-export types
export type { EnvStatus };

/**
 * Check environment status (backwards compatible alias for checkEnvStatus).
 * @deprecated Use checkEnvStatus from './environment.js' instead.
 */
export const checkEnvironment = checkEnvStatus;

/**
 * Format environment status for display.
 * @deprecated Use formatEnvStatus from './environment.js' instead.
 */
export const formatEnvStatus = formatEnvStatusImpl;
