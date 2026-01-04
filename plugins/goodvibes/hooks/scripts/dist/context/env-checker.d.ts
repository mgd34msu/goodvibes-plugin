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
export type { EnvStatus } from './environment.js';
export { checkEnvStatus as checkEnvironment } from './environment.js';
export { formatEnvStatus } from './environment.js';
