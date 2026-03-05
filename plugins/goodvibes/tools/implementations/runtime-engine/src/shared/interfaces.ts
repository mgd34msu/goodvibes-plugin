/**
 * Reconfigurable Interface — Shared Layer (L0)
 *
 * Implemented by subsystems that support runtime config changes.
 * Allows bootstrap.ts to iterate over reconfigurable components generically
 * instead of hardcoding each subsystem.
 */

/**
 * A subsystem that can accept new configuration at runtime.
 * Throw on validation failure to trigger rollback in the caller.
 */
export interface Reconfigurable {
  /** Apply new config. Throw on validation failure (triggers rollback). */
  reconfigure(config: Record<string, unknown>): void;
}
