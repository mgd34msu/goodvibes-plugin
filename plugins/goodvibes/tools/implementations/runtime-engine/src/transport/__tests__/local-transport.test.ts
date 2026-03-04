import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalTransport } from '../local-transport.js';
import { ENGINE_VERSION } from '../../shared/constants.js';
import type { RuntimeEngine } from '../../index.js';

// ─── Mock factories ───────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockStateStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    keys: vi.fn(),
    snapshot: vi.fn(),
  };

  const mockHealthChecker = {
    check: vi.fn(),
  };

  const mockEventBus = {
    emit: vi.fn(),
  };

  const mockEventLog = {
    query: vi.fn(),
  };

  const mockEventQueue = {
    depth: vi.fn(),
  };

  const mockWorkflowEngine = {
    get: vi.fn(),
    list: vi.fn(),
    start: vi.fn(),
    transition: vi.fn(),
  };

  const mockTriggerRegistry = {
    list: vi.fn(),
    get: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
  };

  const mockAgentCoordinator = {
    getAgent: vi.fn(),
    list: vi.fn(),
  };

  const mockDirectiveQueue = {
    holdDrain: vi.fn(),
  };

  const mockEngine = {
    isRunning: vi.fn(),
    getUptime: vi.fn(),
    getConfig: vi.fn(),
    getHealthChecker: vi.fn(() => mockHealthChecker),
    getProjectRoot: vi.fn(),
    updateConfig: vi.fn(),
    getCoreStateStore: vi.fn(() => mockStateStore),
    getEventBus: vi.fn(() => mockEventBus),
    getEventLog: vi.fn(() => mockEventLog),
    getEventQueue: vi.fn(() => mockEventQueue),
    getWorkflowEngine: vi.fn(() => mockWorkflowEngine),
    getTriggerRegistry: vi.fn(() => mockTriggerRegistry),
    getAgentCoordinator: vi.fn(() => mockAgentCoordinator),
    getDirectiveQueue: vi.fn(() => mockDirectiveQueue),
  };

  return {
    mockEngine,
    mockStateStore,
    mockHealthChecker,
    mockEventBus,
    mockEventLog,
    mockEventQueue,
    mockWorkflowEngine,
    mockTriggerRegistry,
    mockAgentCoordinator,
    mockDirectiveQueue,
  };
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LocalTransport', () => {
  let transport: LocalTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default accessor return values after clearAllMocks
    mocks.mockEngine.getHealthChecker.mockReturnValue(mocks.mockHealthChecker);
    mocks.mockEngine.getCoreStateStore.mockReturnValue(mocks.mockStateStore);
    mocks.mockEngine.getEventBus.mockReturnValue(mocks.mockEventBus);
    mocks.mockEngine.getEventLog.mockReturnValue(mocks.mockEventLog);
    mocks.mockEngine.getEventQueue.mockReturnValue(mocks.mockEventQueue);
    mocks.mockEngine.getWorkflowEngine.mockReturnValue(mocks.mockWorkflowEngine);
    mocks.mockEngine.getTriggerRegistry.mockReturnValue(mocks.mockTriggerRegistry);
    mocks.mockEngine.getAgentCoordinator.mockReturnValue(mocks.mockAgentCoordinator);
    mocks.mockEngine.getDirectiveQueue.mockReturnValue(mocks.mockDirectiveQueue);
    transport = new LocalTransport(mocks.mockEngine as unknown as RuntimeEngine);
  });

  // ─── 1. mode property ──────────────────────────────────────────────────────

  describe('mode', () => {
    it('equals "local"', () => {
      expect(transport.mode).toBe('local');
    });
  });

  // ─── 2. isReady ────────────────────────────────────────────────────────────

  describe('isReady()', () => {
    it('returns true when engine.isRunning() is true', () => {
      mocks.mockEngine.isRunning.mockReturnValue(true);
      expect(transport.isReady()).toBe(true);
      expect(mocks.mockEngine.isRunning).toHaveBeenCalledOnce();
    });

    it('returns false when engine.isRunning() is false', () => {
      mocks.mockEngine.isRunning.mockReturnValue(false);
      expect(transport.isReady()).toBe(false);
      expect(mocks.mockEngine.isRunning).toHaveBeenCalledOnce();
    });
  });

  // ─── 3. connect / disconnect ───────────────────────────────────────────────

  describe('connect() and disconnect()', () => {
    it('connect() resolves without calling any engine method', async () => {
      await expect(transport.connect()).resolves.toBeUndefined();
      expect(mocks.mockEngine.isRunning).not.toHaveBeenCalled();
    });

    it('disconnect() resolves without calling any engine method', async () => {
      await expect(transport.disconnect()).resolves.toBeUndefined();
      expect(mocks.mockEngine.isRunning).not.toHaveBeenCalled();
    });
  });

  // ─── 4. Status methods ─────────────────────────────────────────────────────

  describe('status methods', () => {
    it('getUptime() delegates to engine.getUptime()', async () => {
      mocks.mockEngine.getUptime.mockReturnValue(42000);
      const result = await transport.getUptime();
      expect(result).toBe(42000);
      expect(mocks.mockEngine.getUptime).toHaveBeenCalledOnce();
    });

    it('getConfig() delegates to engine.getConfig()', async () => {
      const config = { project_root: '/test', log_level: 'info' };
      mocks.mockEngine.getConfig.mockReturnValue(config);
      const result = await transport.getConfig();
      expect(result).toBe(config);
      expect(mocks.mockEngine.getConfig).toHaveBeenCalledOnce();
    });

    it('getHealth() delegates to engine.getHealthChecker().check()', async () => {
      const healthStatus = { status: 'healthy', checks: [] };
      mocks.mockHealthChecker.check.mockResolvedValue(healthStatus);
      const result = await transport.getHealth();
      expect(result).toBe(healthStatus);
      expect(mocks.mockEngine.getHealthChecker).toHaveBeenCalledOnce();
      expect(mocks.mockHealthChecker.check).toHaveBeenCalledOnce();
    });

    it('getVersion() returns ENGINE_VERSION constant', async () => {
      const result = await transport.getVersion();
      expect(result).toBe(ENGINE_VERSION);
    });

    it('getProjectRoot() delegates to engine.getProjectRoot()', async () => {
      mocks.mockEngine.getProjectRoot.mockReturnValue('/my/project');
      const result = await transport.getProjectRoot();
      expect(result).toBe('/my/project');
      expect(mocks.mockEngine.getProjectRoot).toHaveBeenCalledOnce();
    });

    it('updateConfig() delegates to engine.updateConfig(config)', async () => {
      const config = { project_root: '/new', log_level: 'debug' } as any;
      mocks.mockEngine.updateConfig.mockResolvedValue(undefined);
      await transport.updateConfig(config);
      expect(mocks.mockEngine.updateConfig).toHaveBeenCalledWith(config);
    });
  });

  // ─── 5. State methods ──────────────────────────────────────────────────────

  describe('state methods', () => {
    it('getState() delegates to getCoreStateStore().get(key)', async () => {
      mocks.mockStateStore.get.mockReturnValue('stored-value');
      const result = await transport.getState('my.key');
      expect(result).toBe('stored-value');
      expect(mocks.mockStateStore.get).toHaveBeenCalledWith('my.key');
    });

    it('setState() delegates to getCoreStateStore().set(key, value)', async () => {
      await transport.setState('my.key', { nested: true });
      expect(mocks.mockStateStore.set).toHaveBeenCalledWith('my.key', { nested: true });
    });

    it('deleteState() delegates to getCoreStateStore().delete(key)', async () => {
      await transport.deleteState('my.key');
      expect(mocks.mockStateStore.delete).toHaveBeenCalledWith('my.key');
    });

    it('listStateKeys() delegates to getCoreStateStore().keys(prefix)', async () => {
      mocks.mockStateStore.keys.mockReturnValue(['a.b', 'a.c']);
      const result = await transport.listStateKeys('a');
      expect(result).toEqual(['a.b', 'a.c']);
      expect(mocks.mockStateStore.keys).toHaveBeenCalledWith('a');
    });

    it('listStateKeys() passes undefined prefix when none provided', async () => {
      mocks.mockStateStore.keys.mockReturnValue(['x', 'y']);
      const result = await transport.listStateKeys();
      expect(result).toEqual(['x', 'y']);
      expect(mocks.mockStateStore.keys).toHaveBeenCalledWith(undefined);
    });

    it('getStateSnapshot() delegates to getCoreStateStore().snapshot()', async () => {
      const snap = { 'k1': 'v1', 'k2': 42 };
      mocks.mockStateStore.snapshot.mockReturnValue(snap);
      const result = await transport.getStateSnapshot();
      expect(result).toBe(snap);
      expect(mocks.mockStateStore.snapshot).toHaveBeenCalledOnce();
    });
  });

  // ─── 6. Event methods ──────────────────────────────────────────────────────

  describe('event methods', () => {
    it('emitEvent() delegates to getEventBus().emit(event)', async () => {
      const event = { type: 'test:event', payload: { x: 1 } } as any;
      await transport.emitEvent(event);
      expect(mocks.mockEventBus.emit).toHaveBeenCalledWith(event);
    });

    it('queryEvents() delegates to getEventLog().query(filter)', async () => {
      const filter = { type: 'test:*' } as any;
      const events = [{ type: 'test:event', payload: {} }] as any;
      mocks.mockEventLog.query.mockReturnValue(events);
      const result = await transport.queryEvents(filter);
      expect(result).toBe(events);
      expect(mocks.mockEventLog.query).toHaveBeenCalledWith(filter);
    });

    it('getQueueDepth() delegates to getEventQueue().depth()', async () => {
      mocks.mockEventQueue.depth.mockReturnValue(7);
      const result = await transport.getQueueDepth();
      expect(result).toBe(7);
      expect(mocks.mockEventQueue.depth).toHaveBeenCalledOnce();
    });
  });

  // ─── 7. Workflow methods ───────────────────────────────────────────────────

  describe('workflow methods', () => {
    it('getWorkflow() delegates to getWorkflowEngine().get(id)', async () => {
      const wf = { id: 'wf-1', state: 'running' };
      mocks.mockWorkflowEngine.get.mockResolvedValue(wf);
      const result = await transport.getWorkflow('wf-1');
      expect(result).toBe(wf);
      expect(mocks.mockWorkflowEngine.get).toHaveBeenCalledWith('wf-1');
    });

    it('getWorkflow() returns null when not found', async () => {
      mocks.mockWorkflowEngine.get.mockResolvedValue(null);
      const result = await transport.getWorkflow('no-such');
      expect(result).toBeNull();
    });

    it('listWorkflows() delegates to getWorkflowEngine().list()', async () => {
      const wfs = [{ id: 'wf-1' }, { id: 'wf-2' }];
      mocks.mockWorkflowEngine.list.mockResolvedValue(wfs);
      const result = await transport.listWorkflows();
      expect(result).toBe(wfs);
      expect(mocks.mockWorkflowEngine.list).toHaveBeenCalledOnce();
    });

    it('startWorkflow() delegates to getWorkflowEngine().start()', async () => {
      mocks.mockWorkflowEngine.start.mockResolvedValue({ workflow_id: 'new-wf' });
      const ctx = { input: 'data' };
      const result = await transport.startWorkflow('def-1', ctx);
      expect(result).toEqual({ workflow_id: 'new-wf' });
      expect(mocks.mockWorkflowEngine.start).toHaveBeenCalledWith('def-1', ctx);
    });

    it('startWorkflow() works without context argument', async () => {
      mocks.mockWorkflowEngine.start.mockResolvedValue({ workflow_id: 'bare-wf' });
      const result = await transport.startWorkflow('def-2');
      expect(result).toEqual({ workflow_id: 'bare-wf' });
      expect(mocks.mockWorkflowEngine.start).toHaveBeenCalledWith('def-2', undefined);
    });

    it('transitionWorkflow() delegates to getWorkflowEngine().transition()', async () => {
      const updated = { id: 'wf-1', state: 'completed' };
      mocks.mockWorkflowEngine.transition.mockResolvedValue(updated);
      const result = await transport.transitionWorkflow('wf-1', 'complete', { result: 'ok' });
      expect(result).toBe(updated);
      expect(mocks.mockWorkflowEngine.transition).toHaveBeenCalledWith('wf-1', 'complete', { result: 'ok' });
    });

    it('getWorkflow() returns null when getWorkflowEngine() returns null', async () => {
      mocks.mockEngine.getWorkflowEngine.mockReturnValue(null);
      const result = await transport.getWorkflow('wf-1');
      expect(result).toBeNull();
    });

    it('listWorkflows() returns [] when getWorkflowEngine() returns null', async () => {
      mocks.mockEngine.getWorkflowEngine.mockReturnValue(null);
      const result = await transport.listWorkflows();
      expect(result).toEqual([]);
    });
  });

  // ─── 8. Trigger methods ────────────────────────────────────────────────────

  describe('trigger methods', () => {
    it('listTriggers() delegates to getTriggerRegistry().list()', async () => {
      const triggers = [{ id: 't1' }, { id: 't2' }];
      mocks.mockTriggerRegistry.list.mockReturnValue(triggers);
      const result = await transport.listTriggers();
      expect(result).toBe(triggers);
      expect(mocks.mockTriggerRegistry.list).toHaveBeenCalledOnce();
    });

    it('getTrigger() delegates to getTriggerRegistry().get(id)', async () => {
      const trigger = { id: 't1', type: 'event', condition: {} };
      mocks.mockTriggerRegistry.get.mockReturnValue(trigger);
      const result = await transport.getTrigger('t1');
      expect(result).toBe(trigger);
      expect(mocks.mockTriggerRegistry.get).toHaveBeenCalledWith('t1');
    });

    it('getTrigger() returns null when not found', async () => {
      mocks.mockTriggerRegistry.get.mockReturnValue(null);
      const result = await transport.getTrigger('no-such');
      expect(result).toBeNull();
    });

    it('registerTrigger() delegates to getTriggerRegistry().register(definition)', async () => {
      const def = { id: 'new-t', type: 'cron', schedule: '* * * * *' };
      await transport.registerTrigger(def);
      expect(mocks.mockTriggerRegistry.register).toHaveBeenCalledWith(def);
    });

    it('unregisterTrigger() delegates to getTriggerRegistry().unregister(id) and returns result', async () => {
      mocks.mockTriggerRegistry.unregister.mockReturnValue(true);
      const result = await transport.unregisterTrigger('t1');
      expect(result).toBe(true);
      expect(mocks.mockTriggerRegistry.unregister).toHaveBeenCalledWith('t1');
    });

    it('unregisterTrigger() returns false when trigger not found', async () => {
      mocks.mockTriggerRegistry.unregister.mockReturnValue(false);
      const result = await transport.unregisterTrigger('no-such');
      expect(result).toBe(false);
    });

    it('listTriggers() returns [] when getTriggerRegistry() returns null', async () => {
      mocks.mockEngine.getTriggerRegistry.mockReturnValue(null);
      const result = await transport.listTriggers();
      expect(result).toEqual([]);
    });

    it('getTrigger() returns null when getTriggerRegistry() returns null', async () => {
      mocks.mockEngine.getTriggerRegistry.mockReturnValue(null);
      const result = await transport.getTrigger('t1');
      expect(result).toBeNull();
    });
  });

  // ─── 9. Agent methods ──────────────────────────────────────────────────────

  describe('agent methods', () => {
    it('getAgent() delegates to getAgentCoordinator().getAgent(id)', async () => {
      const agent = { id: 'ag-1', status: 'running', type: 'tester' };
      mocks.mockAgentCoordinator.getAgent.mockReturnValue(agent);
      const result = await transport.getAgent('ag-1');
      expect(result).toBe(agent);
      expect(mocks.mockAgentCoordinator.getAgent).toHaveBeenCalledWith('ag-1');
    });

    it('getAgent() returns null when agent not found', async () => {
      mocks.mockAgentCoordinator.getAgent.mockReturnValue(null);
      const result = await transport.getAgent('no-such');
      expect(result).toBeNull();
    });

    it('listAgents() delegates to getAgentCoordinator().list()', async () => {
      const agents = [{ id: 'ag-1' }, { id: 'ag-2' }];
      mocks.mockAgentCoordinator.list.mockReturnValue(agents);
      const result = await transport.listAgents();
      expect(result).toBe(agents);
      expect(mocks.mockAgentCoordinator.list).toHaveBeenCalledOnce();
    });

    it('getAgent() returns null when getAgentCoordinator() returns null', async () => {
      mocks.mockEngine.getAgentCoordinator.mockReturnValue(null);
      const result = await transport.getAgent('ag-1');
      expect(result).toBeNull();
    });

    it('listAgents() returns [] when getAgentCoordinator() returns null', async () => {
      mocks.mockEngine.getAgentCoordinator.mockReturnValue(null);
      const result = await transport.listAgents();
      expect(result).toEqual([]);
    });
  });

  // ─── 10. Directives ────────────────────────────────────────────────────────

  describe('drainDirectives()', () => {
    it('delegates to getDirectiveQueue().holdDrain(target)', async () => {
      const directives = [{ id: 'd1', action: 'review' }];
      mocks.mockDirectiveQueue.holdDrain.mockResolvedValue({ directives });
      const result = await transport.drainDirectives('subagent_stop');
      expect(result).toEqual({ directives });
      expect(mocks.mockDirectiveQueue.holdDrain).toHaveBeenCalledWith('subagent_stop', undefined);
    });

    it('passes workflowId to holdDrain when provided', async () => {
      mocks.mockDirectiveQueue.holdDrain.mockResolvedValue({ directives: [] });
      await transport.drainDirectives('subagent_stop', 'wf-abc');
      expect(mocks.mockDirectiveQueue.holdDrain).toHaveBeenCalledWith('subagent_stop', 'wf-abc');
    });

    it('returns only { directives } from the holdDrain result', async () => {
      const directives = [{ id: 'd1' }, { id: 'd2' }];
      mocks.mockDirectiveQueue.holdDrain.mockResolvedValue({
        directives,
        internalMeta: 'should be stripped',
      });
      const result = await transport.drainDirectives('subagent_stop');
      expect(result).toEqual({ directives });
      expect(Object.keys(result)).toEqual(['directives']);
    });

    it('returns { directives: [] } when getDirectiveQueue() returns null', async () => {
      mocks.mockEngine.getDirectiveQueue.mockReturnValue(null);
      const result = await transport.drainDirectives('subagent_stop');
      expect(result).toEqual({ directives: [] });
    });

    it('returns { directives: [] } when getDirectiveQueue() returns null with workflowId', async () => {
      mocks.mockEngine.getDirectiveQueue.mockReturnValue(null);
      const result = await transport.drainDirectives('subagent_stop', 'wf-xyz');
      expect(result).toEqual({ directives: [] });
    });
  });
});
