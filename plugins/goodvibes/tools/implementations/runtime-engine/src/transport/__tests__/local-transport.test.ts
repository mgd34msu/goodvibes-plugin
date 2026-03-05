import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalTransport } from '../local-transport.js';
import { ENGINE_VERSION } from '../../shared/constants.js';
import type { RuntimeEngine } from '../../bootstrap.js';

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
    getHistory: vi.fn(),
  };

  const mockEventLog = {
    query: vi.fn(),
    getStats: vi.fn(),
  };

  const mockEventQueue = {
    depth: vi.fn(),
    getStats: vi.fn(),
  };

  const mockWorkflowEngine = {
    get: vi.fn(),
    listAll: vi.fn(),
    create: vi.fn(),
    sendEvent: vi.fn(),
    cancel: vi.fn(),
  };

  const mockHeartbeat = {
    isEnabled: vi.fn(),
    getTickCount: vi.fn(),
    getLastTickAt: vi.fn(),
    getInterval: vi.fn(),
    setInterval: vi.fn(),
    disable: vi.fn(),
    enable: vi.fn(),
  };

  const mockScheduler = {
    size: vi.fn(),
    getAllItems: vi.fn(),
    getItem: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    scheduleOneShot: vi.fn(),
    scheduleCron: vi.fn(),
    scheduleHeartbeat: vi.fn(),
  };

  const mockTimePlugin = {
    getHeartbeat: vi.fn(() => mockHeartbeat),
    getScheduler: vi.fn(() => mockScheduler),
  };

  const mockNormalizerRegistry = {
    sources: vi.fn(),
    normalize: vi.fn(),
  };

  const mockExternalPlugin = {
    isHttpListenerRunning: vi.fn(),
    getHttpPort: vi.fn(),
    getHttpAddress: vi.fn(),
    getNormalizerRegistry: vi.fn(() => mockNormalizerRegistry),
  };

  const mockTriggerRegistry = {
    list: vi.fn(),
    get: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    evaluate: vi.fn(),
  };

  const mockAgentCoordinator = {
    getAgent: vi.fn(),
    listActive: vi.fn(),
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
    getTimePlugin: vi.fn(() => mockTimePlugin),
    getExternalPlugin: vi.fn(() => mockExternalPlugin),
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
    mockTimePlugin,
    mockHeartbeat,
    mockScheduler,
    mockExternalPlugin,
    mockNormalizerRegistry,
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
    mocks.mockEngine.getTimePlugin.mockReturnValue(mocks.mockTimePlugin);
    mocks.mockEngine.getExternalPlugin.mockReturnValue(mocks.mockExternalPlugin);
    mocks.mockTimePlugin.getHeartbeat.mockReturnValue(mocks.mockHeartbeat);
    mocks.mockTimePlugin.getScheduler.mockReturnValue(mocks.mockScheduler);
    mocks.mockExternalPlugin.getNormalizerRegistry.mockReturnValue(mocks.mockNormalizerRegistry);
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

    it('listWorkflows() delegates to getWorkflowEngine().listAll()', async () => {
      const wfs = [{ id: 'wf-1' }, { id: 'wf-2' }];
      mocks.mockWorkflowEngine.listAll.mockReturnValue(wfs);
      const result = await transport.listWorkflows();
      expect(result).toBe(wfs);
      expect(mocks.mockWorkflowEngine.listAll).toHaveBeenCalledOnce();
    });

    it('startWorkflow() delegates to getWorkflowEngine().create() and wraps result', async () => {
      const instance = { id: 'new-wf', definition_id: 'def-1', current_state: 'initial', context: {}, history: [], created_at: 0, updated_at: 0, status: 'active' };
      mocks.mockWorkflowEngine.create.mockReturnValue(instance);
      const ctx = { input: 'data' };
      const result = await transport.startWorkflow('def-1', ctx);
      expect(result).toEqual({ workflow_id: 'new-wf' });
      expect(mocks.mockWorkflowEngine.create).toHaveBeenCalledWith('def-1', ctx);
    });

    it('startWorkflow() works without context argument, passes empty object to create()', async () => {
      const instance = { id: 'bare-wf', definition_id: 'def-2', current_state: 'initial', context: {}, history: [], created_at: 0, updated_at: 0, status: 'active' };
      mocks.mockWorkflowEngine.create.mockReturnValue(instance);
      const result = await transport.startWorkflow('def-2');
      expect(result).toEqual({ workflow_id: 'bare-wf' });
      expect(mocks.mockWorkflowEngine.create).toHaveBeenCalledWith('def-2', {});
    });

    it('transitionWorkflow() delegates to getWorkflowEngine().sendEvent() with a constructed RuntimeEvent', async () => {
      const updated = { id: 'wf-1', state: 'completed' };
      mocks.mockWorkflowEngine.sendEvent.mockResolvedValue(updated);
      const result = await transport.transitionWorkflow('wf-1', 'complete', { result: 'ok' });
      expect(result).toBe(updated);
      expect(mocks.mockWorkflowEngine.sendEvent).toHaveBeenCalledWith(
        'wf-1',
        expect.objectContaining({
          type: 'complete',
          source: { kind: 'internal' },
        }),
      );
    });

    it('getWorkflow() returns null when getWorkflowEngine() returns null', async () => {
      mocks.mockEngine.getWorkflowEngine.mockReturnValue(null as any);
      const result = await transport.getWorkflow('wf-1');
      expect(result).toBeNull();
    });

    it('listWorkflows() returns [] when getWorkflowEngine() returns null', async () => {
      mocks.mockEngine.getWorkflowEngine.mockReturnValue(null as any);
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
      mocks.mockTriggerRegistry.get.mockReturnValue(null as any);
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
      mocks.mockEngine.getTriggerRegistry.mockReturnValue(null as any);
      const result = await transport.listTriggers();
      expect(result).toEqual([]);
    });

    it('getTrigger() returns null when getTriggerRegistry() returns null', async () => {
      mocks.mockEngine.getTriggerRegistry.mockReturnValue(null as any);
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
      mocks.mockAgentCoordinator.getAgent.mockReturnValue(null as any);
      const result = await transport.getAgent('no-such');
      expect(result).toBeNull();
    });

    it('listAgents() delegates to getAgentCoordinator().listActive()', async () => {
      const agents = [{ id: 'ag-1' }, { id: 'ag-2' }];
      mocks.mockAgentCoordinator.listActive.mockReturnValue(agents);
      const result = await transport.listAgents();
      expect(result).toBe(agents);
      expect(mocks.mockAgentCoordinator.listActive).toHaveBeenCalledOnce();
    });

    it('getAgent() returns null when getAgentCoordinator() returns null', async () => {
      mocks.mockEngine.getAgentCoordinator.mockReturnValue(null as any);
      const result = await transport.getAgent('ag-1');
      expect(result).toBeNull();
    });

    it('listAgents() returns [] when getAgentCoordinator() returns null', async () => {
      mocks.mockEngine.getAgentCoordinator.mockReturnValue(null as any);
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
      mocks.mockEngine.getDirectiveQueue.mockReturnValue(null as any);
      const result = await transport.drainDirectives('subagent_stop');
      expect(result).toEqual({ directives: [] });
    });

    it('returns { directives: [] } when getDirectiveQueue() returns null with workflowId', async () => {
      mocks.mockEngine.getDirectiveQueue.mockReturnValue(null as any);
      const result = await transport.drainDirectives('subagent_stop', 'wf-xyz');
      expect(result).toEqual({ directives: [] });
    });
  });

  // ─── 11. cancelWorkflow ────────────────────────────────────────────────────

  describe('cancelWorkflow()', () => {
    it('delegates to getWorkflowEngine().cancel(workflowId, reason)', async () => {
      await transport.cancelWorkflow('wf-1', 'user request');
      expect(mocks.mockWorkflowEngine.cancel).toHaveBeenCalledWith('wf-1', 'user request');
    });

    it('uses default reason when none provided', async () => {
      await transport.cancelWorkflow('wf-2');
      expect(mocks.mockWorkflowEngine.cancel).toHaveBeenCalledWith('wf-2', 'cancelled via MCP');
    });

    it('throws when getWorkflowEngine() returns null', async () => {
      mocks.mockEngine.getWorkflowEngine.mockReturnValue(null as any);
      await expect(transport.cancelWorkflow('wf-1')).rejects.toThrow('Workflow engine not available');
    });
  });

  // ─── 12. getEventHistory ───────────────────────────────────────────────────

  describe('getEventHistory()', () => {
    it('delegates to getEventBus().getHistory(filter)', async () => {
      const events = [{ type: 'test:event', payload: {} }] as any;
      mocks.mockEventBus.getHistory.mockReturnValue(events);
      const filter = { type: 'test:*' } as any;
      const result = await transport.getEventHistory(filter);
      expect(result).toBe(events);
      expect(mocks.mockEventBus.getHistory).toHaveBeenCalledWith(filter);
    });

    it('passes undefined when no filter provided', async () => {
      mocks.mockEventBus.getHistory.mockReturnValue([]);
      await transport.getEventHistory();
      expect(mocks.mockEventBus.getHistory).toHaveBeenCalledWith(undefined);
    });
  });

  // ─── 13. getEventStats ────────────────────────────────────────────────────

  describe('getEventStats()', () => {
    it('delegates to getEventLog().getStats() and getEventQueue().getStats()', async () => {
      const logStats = { total_events: 42, file_size_bytes: 1024, events_per_type: {} };
      const queueStats = { pending: 3, max_depth: 100, dedup_cache_size: 10 };
      mocks.mockEventLog.getStats.mockReturnValue(logStats);
      mocks.mockEventQueue.getStats.mockReturnValue(queueStats);
      const result = await transport.getEventStats();
      expect(result).toEqual({ log: logStats, queue: queueStats });
      expect(mocks.mockEventLog.getStats).toHaveBeenCalledOnce();
      expect(mocks.mockEventQueue.getStats).toHaveBeenCalledOnce();
    });
  });

  // ─── 14. Heartbeat methods ─────────────────────────────────────────────────

  describe('heartbeat methods', () => {
    it('getHeartbeat() aggregates heartbeat and scheduler data', async () => {
      mocks.mockHeartbeat.isEnabled.mockReturnValue(true);
      mocks.mockHeartbeat.getTickCount.mockReturnValue(5);
      mocks.mockHeartbeat.getLastTickAt.mockReturnValue(1000);
      mocks.mockHeartbeat.getInterval.mockReturnValue(500);
      mocks.mockScheduler.size.mockReturnValue(3);
      const result = await transport.getHeartbeat();
      expect(result).toEqual({
        enabled: true,
        tick_count: 5,
        last_tick_at: 1000,
        scheduled_count: 3,
        interval_ms: 500,
      });
    });

    it('getHeartbeat() throws when TimePlugin not available', async () => {
      mocks.mockEngine.getTimePlugin.mockReturnValue(null as any);
      await expect(transport.getHeartbeat()).rejects.toThrow('TimePlugin not available');
    });

    it('setHeartbeatInterval() calls heartbeat.setInterval(intervalMs)', async () => {
      await transport.setHeartbeatInterval(2000);
      expect(mocks.mockHeartbeat.setInterval).toHaveBeenCalledWith(2000);
    });

    it('setHeartbeatInterval() throws when TimePlugin not available', async () => {
      mocks.mockEngine.getTimePlugin.mockReturnValue(null as any);
      await expect(transport.setHeartbeatInterval(1000)).rejects.toThrow('TimePlugin not available');
    });

    it('pauseHeartbeat() calls heartbeat.disable()', async () => {
      await transport.pauseHeartbeat();
      expect(mocks.mockHeartbeat.disable).toHaveBeenCalledOnce();
    });

    it('pauseHeartbeat() throws when TimePlugin not available', async () => {
      mocks.mockEngine.getTimePlugin.mockReturnValue(null as any);
      await expect(transport.pauseHeartbeat()).rejects.toThrow('TimePlugin not available');
    });

    it('resumeHeartbeat() calls heartbeat.enable()', async () => {
      await transport.resumeHeartbeat();
      expect(mocks.mockHeartbeat.enable).toHaveBeenCalledOnce();
    });

    it('resumeHeartbeat() throws when TimePlugin not available', async () => {
      mocks.mockEngine.getTimePlugin.mockReturnValue(null as any);
      await expect(transport.resumeHeartbeat()).rejects.toThrow('TimePlugin not available');
    });
  });

  // ─── 15. Schedule methods ──────────────────────────────────────────────────

  describe('schedule methods', () => {
    it('listSchedules() returns all items when no filter', async () => {
      const items = [{ id: 's1', time_type: 'cron' }, { id: 's2', time_type: 'one_shot' }];
      mocks.mockScheduler.getAllItems.mockReturnValue(items);
      const result = await transport.listSchedules();
      expect(result).toEqual(items);
      expect(mocks.mockScheduler.getAllItems).toHaveBeenCalledOnce();
    });

    it('listSchedules() filters by type when provided', async () => {
      const items = [{ id: 's1', time_type: 'cron' }, { id: 's2', time_type: 'one_shot' }];
      mocks.mockScheduler.getAllItems.mockReturnValue(items);
      const result = await transport.listSchedules({ type: 'cron' });
      expect(result).toEqual([{ id: 's1', time_type: 'cron' }]);
    });

    it('listSchedules() throws when TimePlugin not available', async () => {
      mocks.mockEngine.getTimePlugin.mockReturnValue(null as any);
      await expect(transport.listSchedules()).rejects.toThrow('TimePlugin not available');
    });

    it('getSchedule() delegates to scheduler.getItem(scheduleId)', async () => {
      const item = { id: 'sched-1', time_type: 'cron' };
      mocks.mockScheduler.getItem.mockReturnValue(item);
      const result = await transport.getSchedule('sched-1');
      expect(result).toEqual(item);
      expect(mocks.mockScheduler.getItem).toHaveBeenCalledWith('sched-1');
    });

    it('getSchedule() returns null when not found', async () => {
      mocks.mockScheduler.getItem.mockReturnValue(null);
      const result = await transport.getSchedule('no-such');
      expect(result).toBeNull();
    });

    it('getSchedule() throws when TimePlugin not available', async () => {
      mocks.mockEngine.getTimePlugin.mockReturnValue(null as any);
      await expect(transport.getSchedule('s1')).rejects.toThrow('TimePlugin not available');
    });

    it('createSchedule() calls scheduleOneShot for one_shot type', async () => {
      const item = { id: 'os-1', time_type: 'one_shot' };
      mocks.mockScheduler.scheduleOneShot.mockReturnValue(item);
      const result = await transport.createSchedule({
        schedule_id: 'os-1',
        event_type: 'my:event',
        schedule_type: 'one_shot',
        delay_ms: 5000,
      });
      expect(result).toEqual(item);
      expect(mocks.mockScheduler.scheduleOneShot).toHaveBeenCalledWith({
        id: 'os-1',
        event_type: 'my:event',
        delay_ms: 5000,
      });
    });

    it('createSchedule() throws for one_shot without delay_ms', async () => {
      await expect(transport.createSchedule({
        schedule_id: 'os-fail',
        event_type: 'my:event',
        schedule_type: 'one_shot',
      })).rejects.toThrow('delay_ms required for one_shot');
    });

    it('createSchedule() calls scheduleCron for cron type', async () => {
      const item = { id: 'cr-1', time_type: 'cron' };
      mocks.mockScheduler.scheduleCron.mockReturnValue(item);
      const result = await transport.createSchedule({
        schedule_id: 'cr-1',
        event_type: 'tick:event',
        schedule_type: 'cron',
        interval_ms: 60000,
        payload: { key: 'val' },
      });
      expect(result).toEqual(item);
      expect(mocks.mockScheduler.scheduleCron).toHaveBeenCalledWith({
        id: 'cr-1',
        event_type: 'tick:event',
        interval_ms: 60000,
        payload: { key: 'val' },
      });
    });

    it('createSchedule() calls scheduleHeartbeat for heartbeat type', async () => {
      const item = { id: 'hb-1', time_type: 'heartbeat' };
      mocks.mockScheduler.scheduleHeartbeat.mockReturnValue(item);
      const result = await transport.createSchedule({
        schedule_id: 'hb-1',
        event_type: 'hb:tick',
        schedule_type: 'heartbeat',
        interval_ms: 1000,
        ttl: 10,
      });
      expect(result).toEqual(item);
      expect(mocks.mockScheduler.scheduleHeartbeat).toHaveBeenCalledWith({
        id: 'hb-1',
        event_type: 'hb:tick',
        interval_ms: 1000,
        ttl: 10,
      });
    });

    it('createSchedule() throws when TimePlugin not available', async () => {
      mocks.mockEngine.getTimePlugin.mockReturnValue(null as any);
      await expect(transport.createSchedule({
        schedule_id: 'x',
        event_type: 'y',
        schedule_type: 'one_shot',
        delay_ms: 100,
      })).rejects.toThrow('TimePlugin not available');
    });

    it('cancelSchedule() delegates to scheduler.cancel(scheduleId)', async () => {
      mocks.mockScheduler.cancel.mockReturnValue(true);
      const result = await transport.cancelSchedule('sched-1');
      expect(result).toBe(true);
      expect(mocks.mockScheduler.cancel).toHaveBeenCalledWith('sched-1');
    });

    it('cancelSchedule() throws when TimePlugin not available', async () => {
      mocks.mockEngine.getTimePlugin.mockReturnValue(null as any);
      await expect(transport.cancelSchedule('s1')).rejects.toThrow('TimePlugin not available');
    });

    it('pauseSchedule() delegates to scheduler.pause(scheduleId)', async () => {
      mocks.mockScheduler.pause.mockReturnValue(true);
      const result = await transport.pauseSchedule('sched-1');
      expect(result).toBe(true);
      expect(mocks.mockScheduler.pause).toHaveBeenCalledWith('sched-1');
    });

    it('pauseSchedule() throws when TimePlugin not available', async () => {
      mocks.mockEngine.getTimePlugin.mockReturnValue(null as any);
      await expect(transport.pauseSchedule('s1')).rejects.toThrow('TimePlugin not available');
    });

    it('resumeSchedule() delegates to scheduler.resume(scheduleId)', async () => {
      mocks.mockScheduler.resume.mockReturnValue(true);
      const result = await transport.resumeSchedule('sched-1');
      expect(result).toBe(true);
      expect(mocks.mockScheduler.resume).toHaveBeenCalledWith('sched-1');
    });

    it('resumeSchedule() throws when TimePlugin not available', async () => {
      mocks.mockEngine.getTimePlugin.mockReturnValue(null as any);
      await expect(transport.resumeSchedule('s1')).rejects.toThrow('TimePlugin not available');
    });
  });

  // ─── 16. External methods ──────────────────────────────────────────────────

  describe('external methods', () => {
    it('getExternalStatus() returns aggregated http_listener and normalizer info', async () => {
      mocks.mockExternalPlugin.isHttpListenerRunning.mockReturnValue(true);
      mocks.mockExternalPlugin.getHttpPort.mockReturnValue(8080);
      mocks.mockExternalPlugin.getHttpAddress.mockReturnValue('127.0.0.1');
      mocks.mockNormalizerRegistry.sources.mockReturnValue(['github', 'generic']);
      const result = await transport.getExternalStatus();
      expect(result).toEqual({
        http_listener: { running: true, port: 8080, address: '127.0.0.1' },
        normalizer_count: 2,
        normalizer_sources: ['github', 'generic'],
      });
    });

    it('getExternalStatus() throws when ExternalPlugin not available', async () => {
      mocks.mockEngine.getExternalPlugin.mockReturnValue(null as any);
      await expect(transport.getExternalStatus()).rejects.toThrow('ExternalPlugin not available');
    });

    it('getExternalNormalizers() returns sources and count', async () => {
      mocks.mockNormalizerRegistry.sources.mockReturnValue(['github', 'generic', 'custom']);
      const result = await transport.getExternalNormalizers();
      expect(result).toEqual({ sources: ['github', 'generic', 'custom'], count: 3 });
    });

    it('getExternalNormalizers() throws when ExternalPlugin not available', async () => {
      mocks.mockEngine.getExternalPlugin.mockReturnValue(null as any);
      await expect(transport.getExternalNormalizers()).rejects.toThrow('ExternalPlugin not available');
    });

    it('testNormalize() delegates to normalizerRegistry.normalize()', async () => {
      const normalized = { type: 'push', data: {} };
      mocks.mockNormalizerRegistry.normalize.mockReturnValue(normalized);
      const payload = { action: 'push', ref: 'main' };
      const headers = { 'x-github-event': 'push' };
      const result = await transport.testNormalize('github', payload, headers);
      expect(result).toEqual({ normalized, source: 'github' });
      expect(mocks.mockNormalizerRegistry.normalize).toHaveBeenCalledWith('github', payload, headers);
    });

    it('testNormalize() throws when ExternalPlugin not available', async () => {
      mocks.mockEngine.getExternalPlugin.mockReturnValue(null as any);
      await expect(transport.testNormalize('github', {})).rejects.toThrow('ExternalPlugin not available');
    });

    it('getExternalStats() returns stats object with normalizers and http_listener info', async () => {
      mocks.mockNormalizerRegistry.sources.mockReturnValue(['github']);
      mocks.mockExternalPlugin.isHttpListenerRunning.mockReturnValue(false);
      const result = await transport.getExternalStats();
      expect(result).toMatchObject({
        action: 'stats',
        normalizers: ['github'],
        http_listener: { running: false },
      });
    });

    it('getExternalStats() throws when ExternalPlugin not available', async () => {
      mocks.mockEngine.getExternalPlugin.mockReturnValue(null as any);
      await expect(transport.getExternalStats()).rejects.toThrow('ExternalPlugin not available');
    });

    it('getExternalQueue() returns queue_depth from eventQueue.depth()', async () => {
      mocks.mockEventQueue.depth.mockReturnValue(5);
      mocks.mockStateStore.get.mockReturnValue(null);
      const result = await transport.getExternalQueue();
      expect(result.queue_depth).toBe(5);
    });

    it('getExternalQueue() returns null queue_depth when eventQueue is null', async () => {
      mocks.mockEngine.getEventQueue.mockReturnValue(null as any);
      const result = await transport.getExternalQueue();
      expect(result.queue_depth).toBeNull();
    });
  });

  // ─── 17. testTrigger ──────────────────────────────────────────────────────

  describe('testTrigger()', () => {
    it('delegates to triggerRegistry.evaluate() and returns matching result', async () => {
      const matchResult = { trigger_id: 't1', matched: true, actions: [] };
      const otherResult = { trigger_id: 't2', matched: false, actions: [] };
      mocks.mockTriggerRegistry.evaluate.mockResolvedValue([matchResult, otherResult]);
      const testEvent = { type: 'push:event', payload: { data: {} } };
      const result = await transport.testTrigger('t1', testEvent);
      expect(result.result).toEqual(matchResult);
      expect(result.all_results).toEqual([matchResult, otherResult]);
    });

    it('returns null result when no trigger matches triggerId', async () => {
      mocks.mockTriggerRegistry.evaluate.mockResolvedValue([]);
      const result = await transport.testTrigger('no-such', { type: 'test' });
      expect(result.result).toBeNull();
      expect(result.all_results).toEqual([]);
    });

    it('throws when getTriggerRegistry() returns null', async () => {
      mocks.mockEngine.getTriggerRegistry.mockReturnValue(null as any);
      await expect(transport.testTrigger('t1', { type: 'test' })).rejects.toThrow('Trigger registry not available');
    });
  });
});
