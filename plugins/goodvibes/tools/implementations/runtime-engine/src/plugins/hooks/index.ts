/**
 * Hook Processing Plugin — Barrel Exports
 *
 * Layer 3 plugin that bridges Claude Code's hook system to the v3 event loop.
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
