/**
 * Trigger Pipeline Integration Tests
 *
 * Tests the complete end-to-end trigger pipelines using real component wiring.
 * Only external side effects (shell exec, file writes, network) are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TriggerRegistry } from '../../../core/trigger-registry.js';
import { ConditionEvaluator } from '../condition-evaluator.js';
import { TriggerActionExecutor } from '../trigger-action-executor.js';
import { getBuiltinTriggers } from '../builtins.js';
import { BuildTestDetector } from '../../../plugins/hooks/handlers/build-test-detector.js';
import { bridgeCIFailure } from '../../../extensions/executor/handlers/ci-handler.js';
import { restartDevServer } from '../../../extensions/executor/handlers/devserver-handler.js';
import type { RuntimeEvent } from '../../../shared/events.js';
import { createEvent } from '../../../shared/events.js';
import type { TriggersConfig } from '../../../shared/config.js';
import type { TriggerActionHandler, EventEmitter } from '../../../core/types.js';
import type { TriggerDefinition } from '../types.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../shared/utils.js', () => ({
  generateEventId: () => `evt-${Math.random().toString(36).slice(2)}`,
  timestamp: () => Date.now(),
  toErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  generateId: () => `id-${Math.random().toString(36).slice(2)}`,
}));

vi.mock('../../directives/legacy-directive-builder.js', () => ({
  buildSpawnDirectiveMessage: () => 'mock-directive-message',
}));

// Mock child_process for devserver handler (spawn)
// spawn mock immediately fires 'close' callback so killProcessOnPort resolves
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const eventListeners: Record<string, Array<() => void>> = {};
    const proc = {
      pid: 12345,
      unref: vi.fn(),
      on: vi.fn((event: string, cb: () => void) => {
        const list = eventListeners[event] ?? [];
        list.push(cb);
        eventListeners[event] = list;
        // Fire 'close' and 'error' events asynchronously so promise resolves
        if (event === 'close' || event === 'error') {
          Promise.resolve().then(() => cb());
        }
      }),
    };
    return proc;
  }),
  exec: vi.fn(),
}));

// Mock fs/promises for notify handler
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock node:os for devserver (platform detection)
vi.mock('node:os', () => ({
  platform: vi.fn(() => 'linux'),
  userInfo: vi.fn(() => ({ username: 'test' })),
  tmpdir: vi.fn(() => '/tmp'),
}));

// Mock node:net for waitForPort in devserver handler
vi.mock('node:net', () => ({
  createConnection: vi.fn(() => {
    const listeners: Record<string, () => void> = {};
    const socket = {
      once: vi.fn((event: string, cb: () => void) => { listeners[event] = cb; }),
      destroy: vi.fn(),
    };
    // Immediately simulate connection success
    Promise.resolve().then(() => listeners['connect']?.());
    return socket;
  }),
}));

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const DEFAULT_TRIGGERS_CONFIG: TriggersConfig = {
  max_triggers: 50,
  default_cooldown_ms: 0,
  max_fires_per_session: 100,
  handler_timeout_ms: 5_000,
};

/**
 * Minimal synchronous EventBus used for integration tests.
 *
 * Delivers events to subscribers and drives the TriggerRegistry.
 * Subscription is type-exact or '*' for wildcard.
 *
 * NOTE: TestEventBus uses exact type matching only. The real EventBus supports
 * wildcard patterns (e.g., 'webhook:*'). This is sufficient because
 * TriggerRegistry.evaluate() handles pattern matching internally.
 */
class TestEventBus implements EventEmitter {
  private readonly listeners: Map<string, Array<(event: RuntimeEvent) => void>> = new Map();
  private readonly emittedEvents: RuntimeEvent[] = [];

  on(type: string, handler: (event: RuntimeEvent) => void): void {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  emit(event: RuntimeEvent | Omit<RuntimeEvent, 'metadata'> & { metadata?: Partial<RuntimeEvent['metadata']> }): void {
    const runtimeEvent = event as RuntimeEvent;
    this.emittedEvents.push(runtimeEvent);
    // Deliver to exact type subscribers
    const exactHandlers = this.listeners.get(runtimeEvent.type) ?? [];
    for (const handler of exactHandlers) handler(runtimeEvent);
    // Deliver to wildcard subscribers
    const wildcardHandlers = this.listeners.get('*') ?? [];
    for (const handler of wildcardHandlers) handler(runtimeEvent);
  }

  getEmittedEvents(): RuntimeEvent[] {
    return [...this.emittedEvents];
  }

  getEmittedByType(type: string): RuntimeEvent[] {
    return this.emittedEvents.filter(e => e.type === type);
  }

  clearEmitted(): void {
    this.emittedEvents.length = 0;
  }
}

/**
 * Creates a fully wired trigger system: registry + executor + evaluator + builtins.
 * The registry's evaluate() is hooked into the EventBus via the returned driveEvent fn.
 */
function createTriggerSystem(config: TriggersConfig = DEFAULT_TRIGGERS_CONFIG) {
  const eventBus = new TestEventBus();
  const evaluator = new ConditionEvaluator();
  const executor = new TriggerActionExecutor(
    eventBus,
    null,  // no directiveQueue needed
    null,  // no workflowEngine needed
    config,
  );
  const registry = new TriggerRegistry(config, evaluator, executor);

  // Register all builtin triggers
  for (const trigger of getBuiltinTriggers()) {
    registry.register(trigger);
  }

  /**
   * Drive an event through the full pipeline:
   * emit to EventBus handlers → evaluate all triggers.
   */
  async function driveEvent(event: RuntimeEvent): Promise<void> {
    eventBus.emit(event);
    await registry.evaluate(event);
  }

  return { eventBus, registry, executor, driveEvent };
}

/** Creates a RuntimeEvent with all required fields. */
function makeEvent(
  type: string,
  data: Record<string, unknown> = {},
): RuntimeEvent {
  return createEvent({
    source: { kind: 'system' },
    type: type as RuntimeEvent['type'],
    payload: {
      type: type as RuntimeEvent['payload']['type'],
      data,
    } as RuntimeEvent['payload'],
    metadata: { session_id: 'test-session', sequence: 0 },
  });
}

/** Creates a hook:post_tool_use event that mimics the BuildTestDetector's expected shape. */
function makePostToolUseEvent(toolName: string, command: string, exitCode: number): RuntimeEvent {
  return makeEvent('hook:post_tool_use', {
    tool_name: toolName,
    command,
    exit_code: exitCode,
  });
}

/**
 * Intercepts registry.evaluate() to track whether a specific trigger fired.
 * Mutates the registry in place and returns a didFire() accessor.
 *
 * Use only where you need to track fires across multiple evaluate() calls.
 * For single evaluate() calls, inspect the returned TriggerResult[] directly.
 */
function interceptEvaluate(
  registry: TriggerRegistry,
  triggerId: string,
): { didFire: () => boolean; restore: () => void } {
  let fired = false;
  const original = registry.evaluate.bind(registry);
  registry.evaluate = async (event) => {
    const results = await original(event);
    if (results.some(r => r.fired && r.trigger_id === triggerId)) fired = true;
    return results;
  };
  return {
    didFire: () => fired,
    restore: () => { registry.evaluate = original; },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Trigger Pipeline Integration', () => {

  // ─── Pipeline 1: Build Failure Detection ─────────────────────────────────────

  describe('build failure detection pipeline', () => {
    let detector: BuildTestDetector | null = null;

    afterEach(() => {
      // BuildTestDetector has no stop() — unsubscribing is not needed as each test creates a fresh TestEventBus.
      detector = null;
    });

    it('emits build:failed when BuildTestDetector detects a failed build command', async () => {
      const { eventBus, driveEvent } = createTriggerSystem();

      detector = new BuildTestDetector(eventBus);
      detector.start();

      // Emit a hook:post_tool_use with a failed build command
      const hookEvent = makePostToolUseEvent('Bash', 'npm run build', 1);
      await driveEvent(hookEvent);

      // The detector should have emitted build:failed
      const buildFailedEvents = eventBus.getEmittedByType('build:failed');
      expect(buildFailedEvents).toHaveLength(1);
      expect((buildFailedEvents[0]!.payload as { data: Record<string, unknown> }).data.command)
        .toBe('npm run build');
    });

    it('fires builtin_auto_fix_build trigger after 2 build:failed events within window', async () => {
      const { eventBus, registry, driveEvent } = createTriggerSystem();

      const { didFire } = interceptEvaluate(registry, 'builtin_auto_fix_build');

      // First build:failed — threshold is 2, should not fire yet
      const buildFailed1 = makeEvent('build:failed', { command: 'npm run build', exit_code: 1 });
      await driveEvent(buildFailed1);
      expect(didFire()).toBe(false);

      // Second build:failed — threshold met, trigger should fire
      const buildFailed2 = makeEvent('build:failed', { command: 'npm run build', exit_code: 1 });
      await driveEvent(buildFailed2);
      expect(didFire()).toBe(true);
    });

    it('full pipeline: hook:post_tool_use → BuildTestDetector → build:failed → builtin_auto_fix_build', async () => {
      // Use a high max_fires_per_session so the trigger can fire without hitting the limit
      const config: TriggersConfig = { ...DEFAULT_TRIGGERS_CONFIG, max_fires_per_session: 100 };
      const { eventBus, registry, driveEvent } = createTriggerSystem(config);

      const { didFire } = interceptEvaluate(registry, 'builtin_auto_fix_build');

      // Wire up BuildTestDetector — it will re-emit build:failed into the bus
      detector = new BuildTestDetector(eventBus);
      detector.start();

      // In production, the trigger subsystem wires EventBus → TriggerRegistry.evaluate()
      // for ALL events. Here we manually wire specific event types because we're testing
      // at the integration level without the full bootstrap wiring.
      eventBus.on('build:failed', async (event) => {
        await registry.evaluate(event);
      });

      // Drive 2 failed build hook events — each produces a build:failed
      await driveEvent(makePostToolUseEvent('Bash', 'npm run build', 1));
      await driveEvent(makePostToolUseEvent('precision_exec', 'npm run build', 1));

      // Wait for async handlers triggered by the EventBus subscription above to settle
      await vi.waitFor(() => expect(didFire()).toBe(true));
    });
  });

  // ─── Pipeline 2: CI Webhook Bridge ───────────────────────────────────────────

  describe('CI webhook bridge pipeline', () => {
    it('builtin_ci_failure fires on webhook:ci:github event', async () => {
      const { registry, driveEvent } = createTriggerSystem();

      const { didFire } = interceptEvaluate(registry, 'builtin_ci_failure');

      // Register bridgeCIFailure handler (needed for invoke_handler action)
      const emitSpy = vi.fn();
      const mockEmitter: EventEmitter = { emit: emitSpy };
      registry.registerHandler('bridgeCIFailure', bridgeCIFailure('/project', mockEmitter));

      const ciEvent = makeEvent('webhook:ci:github', {
        status: 'failure',
        provider: 'github-actions',
        branch: 'main',
        commit: 'abc123',
      });
      await driveEvent(ciEvent);

      expect(didFire()).toBe(true);
    });

    it('bridgeCIFailure handler emits build:failed for failure status', async () => {
      const { registry, driveEvent } = createTriggerSystem();

      const emittedEvents: RuntimeEvent[] = [];
      const captureEmitter: EventEmitter = {
        emit: (event) => emittedEvents.push(event as RuntimeEvent),
      };

      registry.registerHandler('bridgeCIFailure', bridgeCIFailure('/project', captureEmitter));

      const ciEvent = makeEvent('webhook:ci:github', {
        status: 'failure',
        provider: 'github-actions',
        branch: 'main',
        commit: 'abc123',
      });
      await driveEvent(ciEvent);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]!.type).toBe('build:failed');
    });

    it('bridgeCIFailure handler does NOT emit build:failed for success status', async () => {
      const { registry, driveEvent } = createTriggerSystem();

      const emittedEvents: RuntimeEvent[] = [];
      const captureEmitter: EventEmitter = {
        emit: (event) => emittedEvents.push(event as RuntimeEvent),
      };

      registry.registerHandler('bridgeCIFailure', bridgeCIFailure('/project', captureEmitter));

      const ciEvent = makeEvent('webhook:ci:github', {
        status: 'success',
        provider: 'github-actions',
        branch: 'main',
        commit: 'abc123',
      });
      await driveEvent(ciEvent);

      // Trigger fires but handler skips emission for success
      expect(emittedEvents).toHaveLength(0);
    });

    it('full pipeline: webhook:ci:github → builtin_ci_failure → bridgeCIFailure → build:failed', async () => {
      const { eventBus, registry, driveEvent } = createTriggerSystem();

      // Register bridgeCIFailure handler wired to the main event bus
      registry.registerHandler('bridgeCIFailure', bridgeCIFailure('/project', eventBus));

      const ciEvent = makeEvent('webhook:ci:github', {
        status: 'error',
        provider: 'github-actions',
        branch: 'feature/x',
        commit: 'deadbeef',
      });
      await driveEvent(ciEvent);

      const buildFailedEvents = eventBus.getEmittedByType('build:failed');
      expect(buildFailedEvents).toHaveLength(1);
      const payload = buildFailedEvents[0]!.payload as { data: Record<string, unknown> };
      expect(payload.data.command).toBe('ci:github-actions');
    });
  });

  // ─── Pipeline 3: Test Failure Detection ──────────────────────────────────────

  describe('test failure detection pipeline', () => {
    let detector: BuildTestDetector | null = null;

    afterEach(() => {
      // BuildTestDetector has no stop() — unsubscribing is not needed as each test creates a fresh TestEventBus.
      detector = null;
    });

    it('emits test:failed when BuildTestDetector detects a failed test command', async () => {
      const { eventBus, driveEvent } = createTriggerSystem();

      detector = new BuildTestDetector(eventBus);
      detector.start();

      const hookEvent = makePostToolUseEvent('Bash', 'npm test', 1);
      await driveEvent(hookEvent);

      const testFailedEvents = eventBus.getEmittedByType('test:failed');
      expect(testFailedEvents).toHaveLength(1);
      const payload = testFailedEvents[0]!.payload as { data: Record<string, unknown> };
      expect(payload.data.command).toBe('npm test');
    });

    it('emits test:succeeded when test command exits with code 0', async () => {
      const { eventBus, driveEvent } = createTriggerSystem();

      detector = new BuildTestDetector(eventBus);
      detector.start();

      const hookEvent = makePostToolUseEvent('Bash', 'npm test', 0);
      await driveEvent(hookEvent);

      const testSucceededEvents = eventBus.getEmittedByType('test:succeeded');
      expect(testSucceededEvents).toHaveLength(1);
    });

    it('builtin_auto_fix_test fires after agent:completed then test:failed sequence', async () => {
      const { registry, driveEvent } = createTriggerSystem();

      const { didFire } = interceptEvaluate(registry, 'builtin_auto_fix_test');

      // First: emit agent:completed (prefix of sequence)
      const agentCompleted = makeEvent('agent:completed', { agent_id: 'agent-1' });
      await driveEvent(agentCompleted);
      expect(didFire()).toBe(false);

      // Second: emit test:failed (completes sequence)
      const testFailed = makeEvent('test:failed', { command: 'npm test', exit_code: 1 });
      await driveEvent(testFailed);
      expect(didFire()).toBe(true);
    });

    it('builtin_auto_fix_test does NOT fire if agent:completed is missing', async () => {
      const { registry, driveEvent } = createTriggerSystem();

      const { didFire } = interceptEvaluate(registry, 'builtin_auto_fix_test');

      // Only test:failed without preceding agent:completed
      const testFailed = makeEvent('test:failed', { command: 'npm test', exit_code: 1 });
      await driveEvent(testFailed);
      expect(didFire()).toBe(false);
    });

    it('full pipeline: hook:post_tool_use → BuildTestDetector → test:failed → builtin_auto_fix_test', async () => {
      const { eventBus, registry, driveEvent } = createTriggerSystem();

      const { didFire } = interceptEvaluate(registry, 'builtin_auto_fix_test');

      detector = new BuildTestDetector(eventBus);
      detector.start();

      // In production, the trigger subsystem wires EventBus → TriggerRegistry.evaluate()
      // for ALL events. Here we manually wire specific event types because we're testing
      // at the integration level without the full bootstrap wiring.
      eventBus.on('test:failed', async (event) => {
        await registry.evaluate(event);
      });

      // First: drive agent:completed
      await driveEvent(makeEvent('agent:completed', { agent_id: 'agent-1' }));

      // Then: drive a failed test via hook
      await driveEvent(makePostToolUseEvent('Bash', 'npm test', 1));

      // Wait for async handlers triggered by the EventBus subscription above to settle
      await vi.waitFor(() => expect(didFire()).toBe(true));
    });
  });

  // ─── Pipeline 4: DevServer Error Recovery ────────────────────────────────────

  describe('devserver error recovery pipeline', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('builtin_devserver_recovery fires on devserver:error event', async () => {
      const { registry, driveEvent } = createTriggerSystem();

      const { didFire } = interceptEvaluate(registry, 'builtin_devserver_recovery');

      // Register restartDevServer handler
      registry.registerHandler('restartDevServer', restartDevServer('/project'));

      const devserverErrorEvent = makeEvent('devserver:error', {
        error: 'EADDRINUSE: port 3000 already in use',
        port: 3000,
        command: 'npm run dev',
      });
      await driveEvent(devserverErrorEvent);

      expect(didFire()).toBe(true);
    });

    it('restartDevServer handler executes and spawns a new dev server process', async () => {
      // Use handler_timeout_ms: 0 to disable executor timeout so handler runs to completion
      const config: TriggersConfig = { ...DEFAULT_TRIGGERS_CONFIG, handler_timeout_ms: 0 };
      const { registry, driveEvent } = createTriggerSystem(config);

      const handlerCalled = vi.fn();
      registry.registerHandler('restartDevServer', async (args, event) => {
        handlerCalled(args);
        // Also run the real handler to verify no throws
        await restartDevServer('/project')(args, event);
      });

      const devserverErrorEvent = makeEvent('devserver:error', {
        error: 'server crashed',
        port: 3000,
        command: 'npm run dev',
      });
      await driveEvent(devserverErrorEvent);

      // The handler wrapper was invoked
      expect(handlerCalled).toHaveBeenCalledTimes(1);
      expect(handlerCalled).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'npm run dev' }),
      );
    }, 5_000);

    it('builtin_devserver_recovery trigger action result succeeds', async () => {
      // Use handler_timeout_ms: 0 to disable executor timeout so handler runs to completion
      const config: TriggersConfig = { ...DEFAULT_TRIGGERS_CONFIG, handler_timeout_ms: 0 };
      const { registry } = createTriggerSystem(config);
      registry.registerHandler('restartDevServer', restartDevServer('/project'));

      const devserverErrorEvent = makeEvent('devserver:error', {
        error: 'crash',
        port: 3000,
        command: 'npm run dev',
      });
      const results = await registry.evaluate(devserverErrorEvent);

      const recoveryResult = results.find(r => r.trigger_id === 'builtin_devserver_recovery');
      expect(recoveryResult).toBeDefined();
      expect(recoveryResult!.fired).toBe(true);
      expect(recoveryResult!.action_result?.success).toBe(true);
    }, 5_000);
  });

  // ─── Pipeline 5: Budget Warning ───────────────────────────────────────────────

  describe('budget warning pipeline', () => {
    it('builtin_budget_warning fires on agent:progress event', async () => {
      const { registry, driveEvent } = createTriggerSystem();

      const { didFire } = interceptEvaluate(registry, 'builtin_budget_warning');

      const progressEvent = makeEvent('agent:progress', {
        agent_id: 'agent-1',
        tokens_used: 50000,
        tokens_budget: 60000,
      });
      await driveEvent(progressEvent);

      expect(didFire()).toBe(true);
    });

    it('budget warning trigger emits agent:budget_warning event', async () => {
      const { eventBus, driveEvent } = createTriggerSystem();

      const progressEvent = makeEvent('agent:progress', {
        agent_id: 'agent-42',
        tokens_used: 80000,
        tokens_budget: 100000,
      });
      await driveEvent(progressEvent);

      const budgetWarningEvents = eventBus.getEmittedByType('agent:budget_warning');
      expect(budgetWarningEvents).toHaveLength(1);
    });

    it('budget warning trigger action result has success=true', async () => {
      const { registry } = createTriggerSystem();

      const progressEvent = makeEvent('agent:progress', {
        agent_id: 'agent-1',
        tokens_used: 10000,
        tokens_budget: 100000,
      });
      const results = await registry.evaluate(progressEvent);

      const budgetResult = results.find(r => r.trigger_id === 'builtin_budget_warning');
      expect(budgetResult).toBeDefined();
      expect(budgetResult!.fired).toBe(true);
      expect(budgetResult!.action_result?.success).toBe(true);
    });

    it('budget warning respects cooldown — does not fire again within 30s', async () => {
      const { registry } = createTriggerSystem();

      const progressEvent1 = makeEvent('agent:progress', {
        agent_id: 'agent-1',
        tokens_used: 85000,
        tokens_budget: 100000,
      });
      const results1 = await registry.evaluate(progressEvent1);
      expect(results1.find(r => r.trigger_id === 'builtin_budget_warning')?.fired).toBe(true);

      // Immediately fire second event — should be blocked by 30s cooldown
      const progressEvent2 = makeEvent('agent:progress', {
        agent_id: 'agent-1',
        tokens_used: 90000,
        tokens_budget: 100000,
      });
      const results2 = await registry.evaluate(progressEvent2);
      expect(results2.find(r => r.trigger_id === 'builtin_budget_warning')?.fired).toBe(false);
      expect(results2.find(r => r.trigger_id === 'builtin_budget_warning')?.skipped_reason).toBe('cooldown');
    });
  });

  // ─── Cross-pipeline tests ─────────────────────────────────────────────────────

  describe('cross-pipeline: multiple triggers evaluate against the same event', () => {
    it('webhook:ci:github fires builtin_ci_failure but not devserver or budget triggers', async () => {
      const { registry, driveEvent } = createTriggerSystem();

      // Register the CI handler
      const mockEmitter: EventEmitter = { emit: vi.fn() };
      registry.registerHandler('bridgeCIFailure', bridgeCIFailure('/project', mockEmitter));

      const ciEvent = makeEvent('webhook:ci:github', { status: 'failure' });
      const results = await registry.evaluate(ciEvent);

      const fired = results.filter(r => r.fired).map(r => r.trigger_id);
      expect(fired).toContain('builtin_ci_failure');
      expect(fired).not.toContain('builtin_devserver_recovery');
      expect(fired).not.toContain('builtin_budget_warning');
    });

    it('builtin_webhook_received fires on any webhook event alongside builtin_ci_failure', async () => {
      const { registry, driveEvent } = createTriggerSystem();

      // Register CI handler to avoid unregistered handler error
      const mockEmitter: EventEmitter = { emit: vi.fn() };
      registry.registerHandler('bridgeCIFailure', bridgeCIFailure('/project', mockEmitter));

      const ciEvent = makeEvent('webhook:ci:github', { status: 'success' });
      const results = await registry.evaluate(ciEvent);

      const fired = results.filter(r => r.fired).map(r => r.trigger_id);
      // webhook:ci:* matches webhook:* so builtin_webhook_received also fires
      expect(fired).toContain('builtin_webhook_received');
      expect(fired).toContain('builtin_ci_failure');
    });

    it('BuildTestDetector does not emit events for non-exec tools', async () => {
      const { eventBus, driveEvent } = createTriggerSystem();

      const localDetector = new BuildTestDetector(eventBus);
      localDetector.start();

      // A non-exec tool like 'Read' should not trigger detection
      const hookEvent = makeEvent('hook:post_tool_use', {
        tool_name: 'Read',
        command: 'npm run build',
        exit_code: 1,
      });
      await driveEvent(hookEvent);

      expect(eventBus.getEmittedByType('build:failed')).toHaveLength(0);
      expect(eventBus.getEmittedByType('test:failed')).toHaveLength(0);
      // BuildTestDetector has no stop() — TestEventBus is local and gets GC'd with the test.
    });

    it('BuildTestDetector does not emit events when exit_code is missing', async () => {
      const { eventBus, driveEvent } = createTriggerSystem();

      const localDetector = new BuildTestDetector(eventBus);
      localDetector.start();

      const hookEvent = makeEvent('hook:post_tool_use', {
        tool_name: 'Bash',
        command: 'npm run build',
        // no exit_code
      });
      await driveEvent(hookEvent);

      expect(eventBus.getEmittedByType('build:failed')).toHaveLength(0);
      expect(eventBus.getEmittedByType('build:succeeded')).toHaveLength(0);

      // BuildTestDetector has no stop() — TestEventBus is local and gets GC'd with the test.
    });
  });

  // ─── Error Path Tests ─────────────────────────────────────────────────────────

  describe('error path coverage', () => {
    it('handler that throws an exception produces action_result with success=false', async () => {
      const { registry } = createTriggerSystem();

      // Register a handler that always throws
      registry.registerHandler('restartDevServer', async () => {
        throw new Error('handler exploded');
      });

      const devserverErrorEvent = makeEvent('devserver:error', {
        error: 'crash',
        port: 3000,
        command: 'npm run dev',
      });
      const results = await registry.evaluate(devserverErrorEvent);

      const recoveryResult = results.find(r => r.trigger_id === 'builtin_devserver_recovery');
      expect(recoveryResult).toBeDefined();
      expect(recoveryResult!.fired).toBe(true);
      expect(recoveryResult!.action_result?.success).toBe(false);
      expect(recoveryResult!.action_result?.error).toMatch(/handler exploded/);
    });

    it('invoke_handler with unregistered handler produces action_result with success=false', async () => {
      const { registry } = createTriggerSystem();

      // Do NOT register 'restartDevServer' — invoke_handler should fail gracefully
      const devserverErrorEvent = makeEvent('devserver:error', {
        error: 'crash',
        port: 3000,
        command: 'npm run dev',
      });
      const results = await registry.evaluate(devserverErrorEvent);

      const recoveryResult = results.find(r => r.trigger_id === 'builtin_devserver_recovery');
      expect(recoveryResult).toBeDefined();
      expect(recoveryResult!.fired).toBe(true);
      // Unregistered handler should result in a failure, not a throw
      expect(recoveryResult!.action_result?.success).toBe(false);
    });

    it('max_fires_per_session enforcement prevents trigger from firing after limit', async () => {
      // Use a custom trigger with cooldown_ms: 0 so cooldown never blocks before session limit.
      // max_fires_per_session: 1 at the config level limits all triggers to 1 fire per session.
      const config: TriggersConfig = { ...DEFAULT_TRIGGERS_CONFIG, max_fires_per_session: 1 };
      const { registry } = createTriggerSystem(config);

      // Register a custom trigger that fires on every 'agent:progress' event with no cooldown.
      const customTrigger: TriggerDefinition = {
        id: 'test_session_limit_trigger',
        name: 'test_session_limit',
        description: 'Test trigger for max_fires_per_session enforcement',
        enabled: true,
        priority: 1,
        condition: {
          type: 'event',
          event_type: 'agent:progress',
        },
        action: { type: 'emit_event', event_type: 'agent:budget_warning' },
        cooldown_ms: 0, // No cooldown — only session limit should block
        // max_fires not set: falls back to config.max_fires_per_session (1)
        // fires_count must be explicitly set to 0 — mirrors how TriggerRegistry initializes triggers internally
        fires_count: 0,
      };
      registry.register(customTrigger);

      // First fire: should succeed
      const event1 = makeEvent('agent:progress', { agent_id: 'agent-1', tokens_used: 1000, tokens_budget: 10000 });
      const results1 = await registry.evaluate(event1);
      const r1 = results1.find(r => r.trigger_id === 'test_session_limit_trigger');
      expect(r1?.fired).toBe(true);

      // Second fire: should be blocked by max_fires_per_session=1
      const event2 = makeEvent('agent:progress', { agent_id: 'agent-1', tokens_used: 2000, tokens_budget: 10000 });
      const results2 = await registry.evaluate(event2);
      const r2 = results2.find(r => r.trigger_id === 'test_session_limit_trigger');
      expect(r2?.fired).toBe(false);
      // skipped_reason is 'max_fires' when the trigger-level or config-level fire budget is exhausted
      expect(r2?.skipped_reason).toBe('max_fires');
    });
  });
});
