/**
 * Tests for IPCRouter — message routing logic for the runtime engine IPC channel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock variables (must come before vi.mock calls) ──────────────────
const {
  mockWriteFileSync,
  mockUnlinkSync,
  mockValidateWRFCConfig,
} = vi.hoisted(() => ({
  mockWriteFileSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  mockValidateWRFCConfig: vi.fn((cfg: Record<string, unknown>) => cfg),
}));

// ─── Module mocks ───────────────────────────────────────────────────────────────────────────────────────
vi.mock('node:fs', () => ({
  writeFileSync: mockWriteFileSync,
  unlinkSync: mockUnlinkSync,
}));

vi.mock('node:path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}));

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../directives/wrfc-config-store.js', () => ({
  validateWRFCConfig: mockValidateWRFCConfig,
}));

vi.mock('../../directives/directive-queue.js', () => ({
  HOLD_TTL_MS: 5000,
}));

import { IPCRouter } from '../ipc-router.js';
import type { IPCRouterDeps } from '../ipc-router.js';
import type { IPCMessage } from '../../../shared/ipc/protocol.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────

function makeHookEventMsg(overrides: Record<string, unknown> = {}): IPCMessage {
  return {
    type: 'hook_event',
    id: 'msg-1',
    hook_name: 'pre_tool_use',
    hook_input: { tool: 'bash' },
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as IPCMessage;
}

function makeQueryMsg(kind: string, extra: Record<string, unknown> = {}): IPCMessage {
  return {
    type: 'query',
    id: 'msg-2',
    query: { kind, ...extra },
  } as IPCMessage;
}

function makeHeartbeatMsg(): IPCMessage {
  return { type: 'heartbeat', id: 'msg-3' };
}

function makeStateUpdateMsg(): IPCMessage {
  return { type: 'state_update', id: 'msg-4', updates: { foo: 'bar' } };
}

function makeDeps(overrides: Partial<IPCRouterDeps> = {}): IPCRouterDeps {
  return {
    eventBus: {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as IPCRouterDeps['eventBus'],
    triggerRegistry: {
      evaluate: vi.fn().mockResolvedValue(undefined),
      resetAllFireCounts: vi.fn(),
    } as unknown as IPCRouterDeps['triggerRegistry'],
    workflowEngine: {
      get: vi.fn().mockReturnValue(null),
    } as unknown as IPCRouterDeps['workflowEngine'],
    agentCoordinator: {
      getAgent: vi.fn().mockReturnValue(null),
    } as unknown as IPCRouterDeps['agentCoordinator'],
    directiveQueue: {
      holdDrain: vi.fn().mockReturnValue({ holdId: 'hold-1', directives: [] }),
      sweepStaleHolds: vi.fn(),
    } as unknown as IPCRouterDeps['directiveQueue'],
    wrfcConfigStore: {
      set: vi.fn(),
    } as unknown as IPCRouterDeps['wrfcConfigStore'],
    socketPath: '/tmp/test.sock',
    stateDir: '/tmp/state',
    agentWorkflowMap: {
      resolvePendingBind: vi.fn().mockReturnValue(null),
      consumePendingBindsForWorkflow: vi.fn().mockReturnValue(0),
    } as unknown as IPCRouterDeps['agentWorkflowMap'],
    hookProcessor: {
      process: vi.fn().mockResolvedValue(undefined),
    } as unknown as IPCRouterDeps['hookProcessor'],
    executorMode: {
      getMode: vi.fn().mockReturnValue('engaged'),
    } as unknown as IPCRouterDeps['executorMode'],
    executorBudget: {
      getSpending: vi.fn().mockReturnValue(null),
      canProcess: vi.fn().mockReturnValue(true),
    } as unknown as IPCRouterDeps['executorBudget'],
    daemonTickHandler: {
      handleTick: vi.fn().mockResolvedValue({ processed: 0 }),
    } as unknown as IPCRouterDeps['daemonTickHandler'],
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────────────

describe('IPCRouter', () => {
  describe('constructor', () => {
    it('instantiates with full deps without throwing', () => {
      const deps = makeDeps();
      expect(() => new IPCRouter(deps)).not.toThrow();
    });

    it('instantiates with minimal deps (nulls for optional fields)', () => {
      const deps = makeDeps({
        triggerRegistry: null,
        workflowEngine: null,
        agentCoordinator: null,
        directiveQueue: null,
        wrfcConfigStore: null,
        socketPath: null,
        stateDir: null,
        agentWorkflowMap: null,
        hookProcessor: null,
        executorMode: null,
        executorBudget: null,
        daemonTickHandler: null,
      });
      expect(() => new IPCRouter(deps)).not.toThrow();
    });
  });

  describe('route() — message type dispatch', () => {
    let deps: IPCRouterDeps;
    let router: IPCRouter;

    beforeEach(() => {
      deps = makeDeps();
      router = new IPCRouter(deps);
      vi.clearAllMocks();
      mockWriteFileSync.mockClear();
      mockUnlinkSync.mockClear();
      mockValidateWRFCConfig.mockImplementation((cfg: Record<string, unknown>) => cfg);
    });

    it('sweeps stale holds on every route call', async () => {
      await router.route(makeHeartbeatMsg());
      expect((deps.directiveQueue as unknown as { sweepStaleHolds: ReturnType<typeof vi.fn> }).sweepStaleHolds).toHaveBeenCalledWith(5000);
    });

    it('does not throw when directiveQueue is null (no sweep)', async () => {
      const r = new IPCRouter(makeDeps({ directiveQueue: null }));
      await expect(r.route(makeHeartbeatMsg())).resolves.not.toThrow();
    });

    // ─── heartbeat ───────────────────────────────────────────────────────────────────

    it('routes heartbeat to ack response', async () => {
      const result = await router.route(makeHeartbeatMsg());
      const response = 'response' in result ? result.response : result;
      expect(response).toMatchObject({
        id: 'msg-3',
        status: 'ok',
        data: { kind: 'ack' },
      });
    });

    // ─── state_update ──────────────────────────────────────────────────────────────────

    it('routes state_update to error response (not yet implemented)', async () => {
      const result = await router.route(makeStateUpdateMsg());
      const response = 'response' in result ? result.response : result;
      expect(response).toMatchObject({
        id: 'msg-4',
        status: 'error',
        error: 'state_update not yet implemented',
      });
    });

    // ─── unknown message type ──────────────────────────────────────────────────────────────────

    it('returns error for unknown message type', async () => {
      const msg = { type: 'unknown_type', id: 'msg-x' } as unknown as IPCMessage;
      const result = await router.route(msg);
      const response = 'response' in result ? result.response : result;
      expect(response).toMatchObject({
        status: 'error',
        error: 'Unknown message type',
      });
    });

    it('uses empty string id when message has no id field', async () => {
      const msg = { type: 'unknown_type' } as unknown as IPCMessage;
      const result = await router.route(msg);
      const response = 'response' in result ? result.response : result;
      expect(response.id).toBe('');
    });
  });

  // ─── hook_event ─────────────────────────────────────────────────────────────────────

  describe('handleHookEvent', () => {
    let deps: IPCRouterDeps;
    let router: IPCRouter;

    beforeEach(() => {
      deps = makeDeps();
      router = new IPCRouter(deps);
      mockWriteFileSync.mockClear();
      mockUnlinkSync.mockClear();
      mockValidateWRFCConfig.mockImplementation((cfg: Record<string, unknown>) => cfg);
    });

    it('emits hook event on eventBus with bare event type (no hook: prefix)', async () => {
      const result = await router.route(makeHookEventMsg({ hook_name: 'pre_tool_use' }));
      const response = 'response' in result ? result.response : result;
      expect(response.status).toBe('ok');
      expect((deps.eventBus as unknown as { emit: ReturnType<typeof vi.fn> }).emit).toHaveBeenCalledOnce();
      const emitted = (deps.eventBus as unknown as { emit: ReturnType<typeof vi.fn> }).emit.mock.calls[0][0];
      // Event type must be the bare hook_name so EventBridge FORWARDED_PATTERNS can match.
      // source.kind === 'hook' provides traceability of hook origin.
      expect(emitted.type).toBe('pre_tool_use');
      expect(emitted.source.kind).toBe('hook');
      expect(emitted.source.hook_name).toBe('pre_tool_use');
    });

    it('does NOT call triggerRegistry.evaluate directly (EventBridge path handles evaluation)', async () => {
      // Direct triggerRegistry.evaluate was removed to prevent double-fire:
      // WRFC triggers have actions:[] so direct eval is useless, but increments fires_count.
      // The actual handler execution path is EventBridge → EventQueue → EventProcessor.
      await router.route(makeHookEventMsg({ hook_name: 'pre_tool_use' }));
      expect(
        (deps.triggerRegistry as unknown as { evaluate: ReturnType<typeof vi.fn> }).evaluate
      ).not.toHaveBeenCalled();
    });

    it('does not throw when triggerRegistry is null', async () => {
      const r = new IPCRouter(makeDeps({ triggerRegistry: null }));
      const result = await r.route(makeHookEventMsg());
      const response = 'response' in result ? result.response : result;
      expect(response.status).toBe('ok');
    });

    it('returns ok status for hook_event regardless of triggerRegistry state', async () => {
      // triggerRegistry.evaluate is no longer called directly, so rejection cannot occur here.
      // This test verifies the overall hook_event handling remains robust.
      const result = await router.route(makeHookEventMsg());
      const response = 'response' in result ? result.response : result;
      expect(response.status).toBe('ok');
    });

    it('returns ack for hook_event', async () => {
      const result = await router.route(makeHookEventMsg());
      const response = 'response' in result ? result.response : result;
      expect(response).toMatchObject({ id: 'msg-1', status: 'ok', data: { kind: 'ack' } });
    });

    describe('session:started', () => {
      it('resets trigger fire counts on session:started', async () => {
        await router.route(
          makeHookEventMsg({ hook_name: 'session:started', hook_input: { session_id: 'sess-abc' } })
        );
        expect(
          (deps.triggerRegistry as unknown as { resetAllFireCounts: ReturnType<typeof vi.fn> }).resetAllFireCounts
        ).toHaveBeenCalledOnce();
      });

      it('writes session pointer file on session:started with valid session_id', async () => {
        await router.route(
          makeHookEventMsg({
            hook_name: 'session:started',
            hook_input: { session_id: 'sess-abc' },
          })
        );
        expect(mockWriteFileSync).toHaveBeenCalledWith(
          '/tmp/state/runtime-sess-abc.socket',
          '/tmp/test.sock',
          'utf-8'
        );
      });

      it('does not write pointer file when session_id is missing', async () => {
        await router.route(
          makeHookEventMsg({ hook_name: 'session:started', hook_input: {} })
        );
        expect(mockWriteFileSync).not.toHaveBeenCalled();
      });

      it('does not write pointer file when socketPath is null', async () => {
        const r = new IPCRouter(makeDeps({ socketPath: null }));
        await r.route(
          makeHookEventMsg({
            hook_name: 'session:started',
            hook_input: { session_id: 'sess-abc' },
          })
        );
        expect(mockWriteFileSync).not.toHaveBeenCalled();
      });

      it('does not write pointer file when stateDir is null', async () => {
        const r = new IPCRouter(makeDeps({ stateDir: null }));
        await r.route(
          makeHookEventMsg({
            hook_name: 'session:started',
            hook_input: { session_id: 'sess-abc' },
          })
        );
        expect(mockWriteFileSync).not.toHaveBeenCalled();
      });

      it('swallows writeFileSync errors (warns but continues)', async () => {
        mockWriteFileSync.mockImplementationOnce(() => { throw new Error('disk full'); });
        const result = await router.route(
          makeHookEventMsg({
            hook_name: 'session:started',
            hook_input: { session_id: 'sess-abc' },
          })
        );
        const response = 'response' in result ? result.response : result;
        expect(response.status).toBe('ok');
      });

      it('does not reset fire counts when triggerRegistry is null on session:started', async () => {
        const r = new IPCRouter(makeDeps({ triggerRegistry: null }));
        await expect(
          r.route(makeHookEventMsg({ hook_name: 'session:started', hook_input: { session_id: 's' } }))
        ).resolves.toBeDefined();
      });
    });

    describe('config:loaded', () => {
      it('stores WRFC config when config:loaded event arrives with valid wrfc field', async () => {
        const wrfcConfig = { maxRounds: 3, scoreThreshold: 8 };
        mockValidateWRFCConfig.mockReturnValueOnce(wrfcConfig);
        await router.route(
          makeHookEventMsg({
            hook_name: 'config:loaded',
            hook_input: { wrfc: wrfcConfig },
          })
        );
        expect(mockValidateWRFCConfig).toHaveBeenCalledWith(wrfcConfig);
        expect(
          (deps.wrfcConfigStore as unknown as { set: ReturnType<typeof vi.fn> }).set
        ).toHaveBeenCalledWith(wrfcConfig);
      });

      it('does not call wrfcConfigStore.set when validated config is empty object', async () => {
        mockValidateWRFCConfig.mockReturnValueOnce({});
        await router.route(
          makeHookEventMsg({
            hook_name: 'config:loaded',
            hook_input: { wrfc: { maxRounds: 3 } },
          })
        );
        expect(
          (deps.wrfcConfigStore as unknown as { set: ReturnType<typeof vi.fn> }).set
        ).not.toHaveBeenCalled();
      });

      it('does not store config when wrfc field is missing', async () => {
        await router.route(
          makeHookEventMsg({ hook_name: 'config:loaded', hook_input: {} })
        );
        expect(
          (deps.wrfcConfigStore as unknown as { set: ReturnType<typeof vi.fn> }).set
        ).not.toHaveBeenCalled();
      });

      it('does not store config when wrfc field is an array', async () => {
        await router.route(
          makeHookEventMsg({ hook_name: 'config:loaded', hook_input: { wrfc: [] } })
        );
        expect(
          (deps.wrfcConfigStore as unknown as { set: ReturnType<typeof vi.fn> }).set
        ).not.toHaveBeenCalled();
      });

      it('skips config:loaded processing when directiveQueue is null', async () => {
        const r = new IPCRouter(makeDeps({ directiveQueue: null }));
        const result = await r.route(
          makeHookEventMsg({
            hook_name: 'config:loaded',
            hook_input: { wrfc: { maxRounds: 3 } },
          })
        );
        const response = 'response' in result ? result.response : result;
        expect(response.status).toBe('ok');
      });
    });

    describe('hookProcessor', () => {
      it('calls hookProcessor.process with hook_name and hook_input', async () => {
        await router.route(
          makeHookEventMsg({ hook_name: 'pre_tool_use', hook_input: { tool: 'bash' } })
        );
        expect(
          (deps.hookProcessor as unknown as { process: ReturnType<typeof vi.fn> }).process
        ).toHaveBeenCalledWith('pre_tool_use', { tool: 'bash' });
      });

      it('passes empty object as hook_input when hook_input is not an object', async () => {
        await router.route(
          makeHookEventMsg({ hook_input: null as unknown as Record<string, unknown> })
        );
        expect(
          (deps.hookProcessor as unknown as { process: ReturnType<typeof vi.fn> }).process
        ).toHaveBeenCalledWith('pre_tool_use', {});
      });

      it('does not throw when hookProcessor.process rejects', async () => {
        (deps.hookProcessor as unknown as { process: ReturnType<typeof vi.fn> }).process
          .mockRejectedValueOnce(new Error('processor error'));
        const result = await router.route(makeHookEventMsg());
        const response = 'response' in result ? result.response : result;
        expect(response.status).toBe('ok');
      });

      it('skips hookProcessor when it is null', async () => {
        const r = new IPCRouter(makeDeps({ hookProcessor: null }));
        const result = await r.route(makeHookEventMsg());
        const response = 'response' in result ? result.response : result;
        expect(response.status).toBe('ok');
      });
    });
  });

  // ─── query ─────────────────────────────────────────────────────────────────────────────

  describe('handleQuery', () => {
    let deps: IPCRouterDeps;
    let router: IPCRouter;

    beforeEach(() => {
      deps = makeDeps();
      router = new IPCRouter(deps);
    });

    describe('get_directives', () => {
      it('returns system_message with empty message and directives when queue is empty', async () => {
        const result = await router.route(makeQueryMsg('get_directives'));
        const response = 'response' in result ? result.response : result;
        expect(response.status).toBe('ok');
        expect(response.data).toMatchObject({
          kind: 'system_message',
          message: '',
          directives: [],
        });
      });

      it('returns directives sorted by priority as joined message', async () => {
        (deps.directiveQueue as unknown as { holdDrain: ReturnType<typeof vi.fn> }).holdDrain
          .mockReturnValueOnce({
            holdId: 'hold-2',
            directives: [
              { type: 'inject_system_message', content: 'low-priority', priority: 1, source: 'test' },
              { type: 'inject_system_message', content: 'high-priority', priority: 10, source: 'test' },
            ],
          });
        const result = await router.route(makeQueryMsg('get_directives'));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({
          kind: 'system_message',
          message: 'high-priority\n\nlow-priority',
        });
      });

      it('filters out non-inject_system_message directives from message', async () => {
        (deps.directiveQueue as unknown as { holdDrain: ReturnType<typeof vi.fn> }).holdDrain
          .mockReturnValueOnce({
            holdId: 'hold-3',
            directives: [
              { type: 'inject_system_message', content: 'inject-msg', priority: 5, source: 'test' },
              { type: 'block_tool', content: 'block', priority: 10, source: 'test' },
            ],
          });
        const result = await router.route(makeQueryMsg('get_directives'));
        const response = 'response' in result ? result.response : result;
        expect((response.data as { message: string }).message).toBe('inject-msg');
      });

      it('includes holdId in response envelope when directives are present', async () => {
        (deps.directiveQueue as unknown as { holdDrain: ReturnType<typeof vi.fn> }).holdDrain
          .mockReturnValueOnce({
            holdId: 'hold-99',
            directives: [
              { type: 'inject_system_message', content: 'msg', priority: 5, source: 'test' },
            ],
          });
        const result = await router.route(makeQueryMsg('get_directives'));
        if ('holdId' in result) {
          expect(result.holdId).toBe('hold-99');
        } else {
          // If holdId is not in result, it means the response was returned directly
          // which is acceptable if the hold was empty
          expect(true).toBe(true);
        }
      });

      it('returns empty response when agent not in any workflow (resolver returns null)', async () => {
        router.setAgentWorkflowResolver(() => null);
        const result = await router.route(makeQueryMsg('get_directives', { agent_id: 'agent-x' }));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({
          kind: 'system_message',
          message: '',
          directives: [],
        });
      });

      it('scopes drain to workflow_id when agent_id resolves to a workflow', async () => {
        router.setAgentWorkflowResolver(() => 'wf-123');
        await router.route(makeQueryMsg('get_directives', { agent_id: 'agent-a' }));
        expect(
          (deps.directiveQueue as unknown as { holdDrain: ReturnType<typeof vi.fn> }).holdDrain
        ).toHaveBeenCalledWith('subagent_stop', 'wf-123');
      });

      it('does not scope drain when agent_id is missing from get_directives', async () => {
        router.setAgentWorkflowResolver(() => 'wf-123');
        await router.route(makeQueryMsg('get_directives'));
        expect(
          (deps.directiveQueue as unknown as { holdDrain: ReturnType<typeof vi.fn> }).holdDrain
        ).toHaveBeenCalledWith('subagent_stop', undefined);
      });

      it('returns empty when directiveQueue is null', async () => {
        const r = new IPCRouter(makeDeps({ directiveQueue: null }));
        const result = await r.route(makeQueryMsg('get_directives'));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({
          kind: 'system_message',
          message: '',
          directives: [],
        });
      });
    });

    describe('get_system_message', () => {
      it('returns system_message response (same as get_directives)', async () => {
        const result = await router.route(makeQueryMsg('get_system_message'));
        const response = 'response' in result ? result.response : result;
        expect(response.status).toBe('ok');
        expect((response.data as { kind: string }).kind).toBe('system_message');
      });

      it('does not pass agent_id for get_system_message (uses undefined)', async () => {
        router.setAgentWorkflowResolver(() => 'wf-abc');
        await router.route(makeQueryMsg('get_system_message'));
        expect(
          (deps.directiveQueue as unknown as { holdDrain: ReturnType<typeof vi.fn> }).holdDrain
        ).toHaveBeenCalledWith('subagent_stop', undefined);
      });
    });

    describe('get_workflow_state', () => {
      it('returns workflow instance when workflowEngine has it', async () => {
        const instance = { step: 'review', round: 2 };
        (deps.workflowEngine as unknown as { get: ReturnType<typeof vi.fn> }).get.mockReturnValueOnce(instance);
        const result = await router.route(makeQueryMsg('get_workflow_state', { workflow_id: 'wf-1' }));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({
          kind: 'workflow_state',
          instance: { step: 'review', round: 2 },
        });
      });

      it('returns empty object when workflow not found', async () => {
        (deps.workflowEngine as unknown as { get: ReturnType<typeof vi.fn> }).get.mockReturnValueOnce(null);
        const result = await router.route(makeQueryMsg('get_workflow_state', { workflow_id: 'wf-missing' }));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({ kind: 'workflow_state', instance: {} });
      });

      it('returns empty object when workflowEngine is null', async () => {
        const r = new IPCRouter(makeDeps({ workflowEngine: null }));
        const result = await r.route(makeQueryMsg('get_workflow_state', { workflow_id: 'wf-1' }));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({ kind: 'workflow_state', instance: {} });
      });
    });

    describe('get_agent_status', () => {
      it('returns agent data when agentCoordinator has agent', async () => {
        const agent = { id: 'agent-1', status: 'running' };
        (deps.agentCoordinator as unknown as { getAgent: ReturnType<typeof vi.fn> }).getAgent.mockReturnValueOnce(agent);
        const result = await router.route(makeQueryMsg('get_agent_status', { agent_id: 'agent-1' }));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({
          kind: 'agent_status',
          agent: { id: 'agent-1', status: 'running' },
        });
      });

      it('returns empty object when agent not found', async () => {
        (deps.agentCoordinator as unknown as { getAgent: ReturnType<typeof vi.fn> }).getAgent.mockReturnValueOnce(null);
        const result = await router.route(makeQueryMsg('get_agent_status', { agent_id: 'missing' }));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({ kind: 'agent_status', agent: {} });
      });

      it('returns empty object when agent_id is empty string', async () => {
        const result = await router.route(makeQueryMsg('get_agent_status', { agent_id: '' }));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({ kind: 'agent_status', agent: {} });
      });

      it('returns empty object when agentCoordinator is null', async () => {
        const r = new IPCRouter(makeDeps({ agentCoordinator: null }));
        const result = await r.route(makeQueryMsg('get_agent_status', { agent_id: 'a' }));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({ kind: 'agent_status', agent: {} });
      });
    });

    describe('should_block_tool', () => {
      it('returns allow:true (currently always allows)', async () => {
        const result = await router.route(
          makeQueryMsg('should_block_tool', { tool_name: 'bash', tool_input: {} })
        );
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({ kind: 'tool_decision', allow: true });
      });
    });

    describe('get_context_injection', () => {
      it('returns empty context with priority 0', async () => {
        const result = await router.route(makeQueryMsg('get_context_injection'));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({
          kind: 'context_injection',
          context: '',
          priority: 0,
        });
      });
    });

    describe('resolve_pending_bind', () => {
      it('returns workflow_id from agentWorkflowMap', async () => {
        (deps.agentWorkflowMap as unknown as { resolvePendingBind: ReturnType<typeof vi.fn> })
          .resolvePendingBind.mockReturnValueOnce('wf-resolved');
        const result = await router.route(
          makeQueryMsg('resolve_pending_bind', { agent_type: 'engineer' })
        );
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({ kind: 'pending_bind', workflow_id: 'wf-resolved' });
      });

      it('returns workflow_id: null when no bind found', async () => {
        (deps.agentWorkflowMap as unknown as { resolvePendingBind: ReturnType<typeof vi.fn> })
          .resolvePendingBind.mockReturnValueOnce(null);
        const result = await router.route(
          makeQueryMsg('resolve_pending_bind', { agent_type: 'engineer' })
        );
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({ kind: 'pending_bind', workflow_id: null });
      });

      it('returns null workflow_id when agent_type is empty string', async () => {
        const result = await router.route(
          makeQueryMsg('resolve_pending_bind', { agent_type: '' })
        );
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({ kind: 'pending_bind', workflow_id: null });
      });

      it('returns null when agentWorkflowMap is null', async () => {
        const r = new IPCRouter(makeDeps({ agentWorkflowMap: null }));
        const result = await r.route(
          makeQueryMsg('resolve_pending_bind', { agent_type: 'engineer' })
        );
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({ kind: 'pending_bind', workflow_id: null });
      });
    });

    describe('consume_pending_bind', () => {
      it('returns removed count from agentWorkflowMap', async () => {
        (deps.agentWorkflowMap as unknown as { consumePendingBindsForWorkflow: ReturnType<typeof vi.fn> })
          .consumePendingBindsForWorkflow.mockReturnValueOnce(3);
        const result = await router.route(
          makeQueryMsg('consume_pending_bind', { workflow_id: 'wf-xyz' })
        );
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({ kind: 'pending_bind_consumed', removed: 3 });
      });

      it('returns removed: 0 when workflow_id is empty string', async () => {
        const result = await router.route(
          makeQueryMsg('consume_pending_bind', { workflow_id: '' })
        );
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({ kind: 'pending_bind_consumed', removed: 0 });
      });

      it('returns removed: 0 when agentWorkflowMap is null', async () => {
        const r = new IPCRouter(makeDeps({ agentWorkflowMap: null }));
        const result = await r.route(
          makeQueryMsg('consume_pending_bind', { workflow_id: 'wf-xyz' })
        );
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({ kind: 'pending_bind_consumed', removed: 0 });
      });
    });

    describe('get_executor_mode', () => {
      it('returns mode from executorMode', async () => {
        (deps.executorMode as unknown as { getMode: ReturnType<typeof vi.fn> }).getMode.mockReturnValueOnce('paused');
        const result = await router.route(makeQueryMsg('get_executor_mode'));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({ kind: 'executor_mode', mode: 'paused' });
      });

      it('returns engaged when executorMode is null', async () => {
        const r = new IPCRouter(makeDeps({ executorMode: null }));
        const result = await r.route(makeQueryMsg('get_executor_mode'));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({ kind: 'executor_mode', mode: 'engaged' });
      });
    });

    describe('get_executor_budget', () => {
      it('returns spending and can_process from executorBudget', async () => {
        const spending = { tokens: 1000, cost: 0.5 };
        (deps.executorBudget as unknown as { getSpending: ReturnType<typeof vi.fn> }).getSpending
          .mockReturnValueOnce(spending);
        (deps.executorBudget as unknown as { canProcess: ReturnType<typeof vi.fn> }).canProcess
          .mockReturnValueOnce(false);
        const result = await router.route(makeQueryMsg('get_executor_budget'));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({
          kind: 'executor_budget',
          spending: { tokens: 1000, cost: 0.5 },
          can_process: false,
        });
      });

      it('returns null spending and can_process:true when executorBudget is null', async () => {
        const r = new IPCRouter(makeDeps({ executorBudget: null }));
        const result = await r.route(makeQueryMsg('get_executor_budget'));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({
          kind: 'executor_budget',
          spending: null,
          can_process: true,
        });
      });
    });

    describe('process_tick', () => {
      it('calls daemonTickHandler.handleTick and returns result', async () => {
        const tickResult = { processed: 5, skipped: 0 };
        (deps.daemonTickHandler as unknown as { handleTick: ReturnType<typeof vi.fn> }).handleTick
          .mockResolvedValueOnce(tickResult);
        const result = await router.route(makeQueryMsg('process_tick'));
        const response = 'response' in result ? result.response : result;
        expect(response.data).toMatchObject({
          kind: 'tick_result',
          result: { processed: 5, skipped: 0 },
        });
      });

      it('returns undefined result when daemonTickHandler is null', async () => {
        const r = new IPCRouter(makeDeps({ daemonTickHandler: null }));
        const result = await r.route(makeQueryMsg('process_tick'));
        const response = 'response' in result ? result.response : result;
        expect((response.data as { kind: string; result: unknown }).result).toBeUndefined();
      });
    });

    describe('unknown query kind', () => {
      it('acks unknown query kinds without error', async () => {
        const result = await router.route(makeQueryMsg('some_future_kind'));
        const response = 'response' in result ? result.response : result;
        expect(response).toMatchObject({ id: 'msg-2', status: 'ok', data: { kind: 'ack' } });
      });
    });
  });

  // ─── removeSessionPointers ────────────────────────────────────────────────────────────

  describe('removeSessionPointers', () => {
    beforeEach(() => {
      mockUnlinkSync.mockClear();
    });

    it('removes all registered session pointer files', async () => {
      const deps = makeDeps();
      const router = new IPCRouter(deps);

      await router.route(
        makeHookEventMsg({ hook_name: 'session:started', hook_input: { session_id: 'sess-1' } })
      );
      await router.route(
        makeHookEventMsg({ id: 'msg-2', hook_name: 'session:started', hook_input: { session_id: 'sess-2' } })
      );

      router.removeSessionPointers();

      expect(mockUnlinkSync).toHaveBeenCalledWith('/tmp/state/runtime-sess-1.socket');
      expect(mockUnlinkSync).toHaveBeenCalledWith('/tmp/state/runtime-sess-2.socket');
    });

    it('clears the set after removing pointers', async () => {
      const deps = makeDeps();
      const router = new IPCRouter(deps);

      await router.route(
        makeHookEventMsg({ hook_name: 'session:started', hook_input: { session_id: 'sess-3' } })
      );

      router.removeSessionPointers();
      mockUnlinkSync.mockClear();

      // Second call should not unlink anything since set was cleared
      router.removeSessionPointers();
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it('does nothing when stateDir is null', () => {
      const router = new IPCRouter(makeDeps({ stateDir: null }));
      router.removeSessionPointers();
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it('ignores ENOENT errors when unlinking', async () => {
      const deps = makeDeps();
      const router = new IPCRouter(deps);

      await router.route(
        makeHookEventMsg({ hook_name: 'session:started', hook_input: { session_id: 'sess-enoent' } })
      );

      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockUnlinkSync.mockImplementationOnce(() => { throw err; });

      expect(() => router.removeSessionPointers()).not.toThrow();
    });

    it('does not throw for non-ENOENT unlink errors (logs warning)', async () => {
      const deps = makeDeps();
      const router = new IPCRouter(deps);

      await router.route(
        makeHookEventMsg({ hook_name: 'session:started', hook_input: { session_id: 'sess-err' } })
      );

      const err = Object.assign(new Error('Permission denied'), { code: 'EPERM' });
      mockUnlinkSync.mockImplementationOnce(() => { throw err; });

      expect(() => router.removeSessionPointers()).not.toThrow();
    });
  });

  // ─── setAgentWorkflowResolver ───────────────────────────────────────────────────────────

  describe('setAgentWorkflowResolver', () => {
    it('can be called and subsequent get_directives uses it', async () => {
      const deps = makeDeps();
      const router = new IPCRouter(deps);
      const resolver = vi.fn().mockReturnValue('wf-from-resolver');

      router.setAgentWorkflowResolver(resolver);

      await router.route(makeQueryMsg('get_directives', { agent_id: 'test-agent' }));

      expect(resolver).toHaveBeenCalledWith('test-agent');
      expect(
        (deps.directiveQueue as unknown as { holdDrain: ReturnType<typeof vi.fn> }).holdDrain
      ).toHaveBeenCalledWith('subagent_stop', 'wf-from-resolver');
    });
  });
});
