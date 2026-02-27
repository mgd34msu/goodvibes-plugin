/**
 * Hook Handlers — Barrel Exports + Default Registration
 *
 * Re-exports all handler factories and provides registerDefaultHandlers()
 * to configure the registry with the standard handler set.
 */

import { handlePreToolUse } from './pre-tool-use.js';
import { createSubagentStartHandler } from './subagent-start.js';
import type { SubagentStartDeps } from './subagent-start.js';
import { createSubagentStopHandler } from './subagent-stop.js';
import type { SubagentStopDeps } from './subagent-stop.js';
import { createSessionStartHandler } from './session-start.js';
import type { SessionStartDeps } from './session-start.js';
import { createSessionEndHandler } from './session-end.js';
import type { SessionEndDeps } from './session-end.js';
import { createPreCompactHandler } from './pre-compact.js';
import type { PreCompactDeps } from './pre-compact.js';
import { createPostToolUseHandler } from './post-tool-use.js';
import type { PostToolUseDeps } from './post-tool-use.js';
import { createUserPromptSubmitHandler } from './user-prompt-submit.js';
import type { UserPromptSubmitDeps } from './user-prompt-submit.js';

import type { HookRegistry } from '../hook-registry.js';
import type { EventBus } from '../../../extensions/events/event-bus.js';
import type { DirectiveQueue } from '../../../extensions/directives/directive-queue.js';
import type { AgentWorkflowMap } from '../../../extensions/directives/agent-workflow-map.js';
import type { DaemonTickHandler } from '../../../extensions/executor/daemon-tick-handler.js';
import type { ExecutorModeManager } from '../../../core/processing/executor-mode.js';

export {
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
  SubagentStartDeps,
  SubagentStopDeps,
  SessionStartDeps,
  SessionEndDeps,
  PreCompactDeps,
  PostToolUseDeps,
  UserPromptSubmitDeps,
};

/**
 * Dependencies for registering the full default handler set.
 */
export interface DefaultHandlerDeps {
  eventBus: EventBus | null;
  directiveQueue: DirectiveQueue | null;
  agentWorkflowMap: AgentWorkflowMap | null;
  minReviewScore?: number;
  snapshotState?: () => Record<string, unknown>;
  /** DaemonTickHandler for daemon tick detection in UserPromptSubmit. */
  daemonTickHandler?: DaemonTickHandler | null;
  /** ExecutorModeManager for mode-aware tick handling in UserPromptSubmit. */
  executorMode?: ExecutorModeManager | null;
}

/**
 * Register all default handlers into the registry.
 *
 * Priority scheme:
 * - Native tool blocker: 100 (must run before anything else)
 * - Directive delivery (UserPromptSubmit): 80 (high, needed for WRFC)
 * - Workflow-critical handlers (SubagentStop, SubagentStart): 60
 * - Session lifecycle: 50
 * - Observability (PostToolUse): 40
 */
export function registerDefaultHandlers(
  registry: HookRegistry,
  deps: DefaultHandlerDeps,
): void {
  // ── PreToolUse: native tool blocker ──────────────────────────────────────
  registry.register({
    id: 'default:pre-tool-use:native-tool-blocker',
    hook_type: 'PreToolUse',
    handler: handlePreToolUse,
    priority: 100,
    enabled: true,
  });

  // ── UserPromptSubmit: directive delivery ──────────────────────────────────
  registry.register({
    id: 'default:user-prompt-submit:directive-delivery',
    hook_type: 'UserPromptSubmit',
    handler: createUserPromptSubmitHandler({
      directiveQueue: deps.directiveQueue,
      daemonTickHandler: deps.daemonTickHandler ?? null,
      executorMode: deps.executorMode ?? null,
    }),
    priority: 80,
    enabled: true,
  });

  // ── SubagentStart: WRFC binding injection ─────────────────────────────────
  registry.register({
    id: 'default:subagent-start:wrfc-binding',
    hook_type: 'SubagentStart',
    handler: createSubagentStartHandler({ agentWorkflowMap: deps.agentWorkflowMap }),
    priority: 60,
    enabled: true,
  });

  // ── SubagentStop: quality gates + workflow advancement ────────────────────
  registry.register({
    id: 'default:subagent-stop:quality-gate',
    hook_type: 'SubagentStop',
    handler: createSubagentStopHandler({
      eventBus: deps.eventBus,
      agentWorkflowMap: deps.agentWorkflowMap,
      minReviewScore: deps.minReviewScore,
    }),
    priority: 60,
    enabled: true,
  });

  // ── SessionStart: session init ────────────────────────────────────────────
  registry.register({
    id: 'default:session-start:init',
    hook_type: 'SessionStart',
    handler: createSessionStartHandler({ eventBus: deps.eventBus }),
    priority: 50,
    enabled: true,
  });

  // ── SessionEnd: cleanup ───────────────────────────────────────────────────
  registry.register({
    id: 'default:session-end:cleanup',
    hook_type: 'SessionEnd',
    handler: createSessionEndHandler({ eventBus: deps.eventBus }),
    priority: 50,
    enabled: true,
  });

  // ── PreCompact: state preservation ───────────────────────────────────────
  registry.register({
    id: 'default:pre-compact:state-preservation',
    hook_type: 'PreCompact',
    handler: createPreCompactHandler({
      eventBus: deps.eventBus,
      snapshotState: deps.snapshotState,
    }),
    priority: 50,
    enabled: true,
  });

  // ── PostToolUse: file tracking ────────────────────────────────────────────
  registry.register({
    id: 'default:post-tool-use:file-tracking',
    hook_type: 'PostToolUse',
    handler: createPostToolUseHandler({ eventBus: deps.eventBus }),
    priority: 40,
    enabled: true,
  });
}
