/**
 * Hook Processing Plugin — Barrel Exports
 *
 * Layer 3 plugin that bridges Claude Code's hook system to the event loop.
 * Main entry point: HookProcessor. Use HookRegistry to register handlers.
 */

export { HookProcessor } from './hook-processor.js';
export type { ClaudeHookResponse, HookProcessorDeps } from './hook-processor.js';
export { HookRegistry } from './hook-registry.js';
export type { HookHandler, RegisteredHandler } from './hook-registry.js';
export {
  registerDefaultHandlers,
  handlePreToolUse,
  createSubagentStartHandler,
  createSubagentStopHandler,
  createSessionStartHandler,
  createSessionEndHandler,
  createPreCompactHandler,
  createPostToolUseHandler,
  createUserPromptSubmitHandler,
} from './handlers/index.js';
export type {
  DefaultHandlerDeps,
  SubagentStartDeps,
  SubagentStopDeps,
  SessionStartDeps,
  SessionEndDeps,
  PreCompactDeps,
  PostToolUseDeps,
  UserPromptSubmitDeps,
} from './handlers/index.js';

// ─── Hook subsystem factory ──────────────────────────────────────────────────

import type { DefaultHandlerDeps } from './handlers/index.js';

/** Bundle of L3 hook components. */
export interface HookSubsystem {
  hookProcessor: HookProcessor;
  hookRegistry: HookRegistry;
}

/**
 * Create the hook subsystem: registry + processor with default handlers.
 */
export function createHookSubsystem(deps: DefaultHandlerDeps): HookSubsystem {
  const hookRegistry = new HookRegistry();
  const hookProcessor = new HookProcessor({
    registry: hookRegistry,
    sessionId: '',
  });
  registerDefaultHandlers(hookRegistry, deps);
  return { hookProcessor, hookRegistry };
}
