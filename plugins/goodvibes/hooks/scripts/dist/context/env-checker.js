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
// Re-export the quick check API as checkEnvironment for backwards compatibility
// (Original env-checker.ts exported checkEnvironment returning EnvStatus)
export { checkEnvStatus as checkEnvironment } from './environment.js';
// Re-export formatting function
export { formatEnvStatus } from './environment.js';
