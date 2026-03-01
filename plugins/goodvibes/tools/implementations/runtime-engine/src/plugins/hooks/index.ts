/**
 * Hook Processing Plugin — Barrel Exports
 *
 * Layer 3 plugin that bridges Claude Code's hook system to the event loop.
 * Main entry point: HookProcessor. Use HookRegistry to register handlers.
 */

// ─── Local imports (create local bindings) ───────────────────────────────────

import { HookProcessor } from './hook-processor.js';
import type { ClaudeHookResponse, HookProcessorDeps } from './hook-processor.js';
import { HookRegistry } from './hook-registry.js';
import type { HookHandler, RegisteredHandler } from './hook-registry.js';
import {
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
import type {
  DefaultHandlerDeps,
  SubagentStartDeps,
  SubagentStopDeps,
  SessionStartDeps,
  SessionEndDeps,
  PreCompactDeps,
  PostToolUseDeps,
  UserPromptSubmitDeps,
} from './handlers/index.js';

// ─── Re-exports from local bindings ──────────────────────────────────────────

export { HookProcessor };
export type { ClaudeHookResponse, HookProcessorDeps };
export { HookRegistry };
export type { HookHandler, RegisteredHandler };
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
};
export type {
  DefaultHandlerDeps,
  SubagentStartDeps,
  SubagentStopDeps,
  SessionStartDeps,
  SessionEndDeps,
  PreCompactDeps,
  PostToolUseDeps,
  UserPromptSubmitDeps,
};

// ─── Hook subsystem factory ──────────────────────────────────────────────────

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
