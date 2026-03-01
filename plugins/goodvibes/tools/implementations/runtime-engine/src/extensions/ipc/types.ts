/**
 * extensions/ipc/types.ts — Shared IPC type definitions.
 *
 * Provides shared interfaces used by both ipc-router.ts and setup.ts
 * to avoid duplication of the hook processor interface.
 */

/** Minimal interface for the hook processor — decouples the IPC layer from the L3 plugin layer. */
export interface IHookProcessor {
  process(hookName: string, hookInput: Record<string, unknown>): Promise<unknown>;
}
