import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentTrackerPlugin } from '../agent-tracker-plugin.js';
import type { RuntimeServices } from '../../../shared/plugin.js';
import type { RuntimeEvent } from '../../../shared/events.js';

// Mock logger
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock createAgentEvent — return a simple RuntimeEvent-shaped object
vi.mock('../../../extensions/events/factories.js', () => ({
  createAgentEvent: vi.fn((opts: Record<string, unknown>) => ({
    id: 'mock-agent-event-id',
    type: opts['type'],
    source: { kind: 'agent', agent_id: opts['agent_id'] },
    payload: opts['payload'] ?? {},
    timestamp: Date.now(),
    metadata: {},
    priority: 5,
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SubscribeCallback = (event: RuntimeEvent) => void;
type HeartbeatCallback = () => void;

interface MockServices {
  emit: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  getState: ReturnType<typeof vi.fn>;
  setState: ReturnType<typeof vi.fn>;
  deleteState: ReturnType<typeof vi.fn>;
  listStateKeys: ReturnType<typeof vi.fn>;
  getConfig: ReturnType<typeof vi.fn>;
  registerTrigger: ReturnType<typeof vi.fn>;
  unregisterTrigger: ReturnType<typeof vi.fn>;
  getLogger: ReturnType<typeof vi.fn>;
  _subscriptions: Map<string, SubscribeCallback | HeartbeatCallback>;
}

/**
 * Build a MockServices that captures subscribe callbacks by event type
 * and returns an unsubscribe fn. State is backed by a simple Map.
 */
function makeServices(): MockServices {
  const state = new Map<string, unknown>();
  const subscriptions = new Map<string, SubscribeCallback | HeartbeatCallback>();

  const services: MockServices = {
    _subscriptions: subscriptions,
    emit: vi.fn(),
    subscribe: vi.fn((eventType: string, cb: SubscribeCallback | HeartbeatCallback) => {
      subscriptions.set(eventType, cb);
      return vi.fn(); // unsubscribe fn
    }),
    getState: vi.fn((key: string) => state.get(key) ?? null),
    setState: vi.fn((key: string, value: unknown) => { state.set(key, value); }),
    deleteState: vi.fn((key: string) => { state.delete(key); }),
    listStateKeys: vi.fn(() => [...state.keys()]),
    getConfig: vi.fn(() => ({})),
    registerTrigger: vi.fn(),
    unregisterTrigger: vi.fn(),
    getLogger: vi.fn(() => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    })),
  };

  return services;
}

/** Build a minimal RuntimeEvent for agent lifecycle events. */
function makeAgentEvent(opts: {
  type: string;
  agent_id: string;
  agent_type?: string;
  workflow_id?: string;
  source_kind?: RuntimeEvent['source']['kind'];
}): RuntimeEvent {
  return {
    id: `evt-${opts.agent_id}`,
    type: opts.type,
    source: { kind: opts.source_kind ?? 'internal' } as RuntimeEvent['source'],
    payload: {
      type: opts.type,
      data: {
        agent_id: opts.agent_id,
        agent_type: opts.agent_type ?? 'goodvibes:test-agent',
        workflow_id: opts.workflow_id ?? null,
      },
    },
    timestamp: Date.now(),
    metadata: {},
    priority: 5,
    context: {},
  } as unknown as RuntimeEvent;
}

/** Register and start the plugin, returning services and the plugin. */
function setupPlugin() {
  const services = makeServices();
  const plugin = new AgentTrackerPlugin();
  plugin.register(services as unknown as RuntimeServices);
  plugin.start();
  return { plugin, services };
}

/** Simulate an agent:spawned event through the subscription. */
function spawnAgent(services: MockServices, agentId: string, agentType = 'goodvibes:engineer') {
  const cb = services._subscriptions.get('agent:spawned') as SubscribeCallback;
  if (!cb) throw new Error('agent:spawned subscription not found');
  cb(makeAgentEvent({ type: 'agent:spawned', agent_id: agentId, agent_type: agentType }));
}

/** Fire the tick:heartbeat subscription. */
function fireHeartbeat(services: MockServices) {
  const cb = services._subscriptions.get('tick:heartbeat') as HeartbeatCallback;
  if (!cb) throw new Error('tick:heartbeat subscription not found');
  cb();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AgentTrackerPlugin', () => {
  // ─── register / start / stop lifecycle ──────────────────────────────────────

  describe('lifecycle', () => {
    it('state is registered before register() is called', () => {
      const plugin = new AgentTrackerPlugin();
      expect(plugin.state).toBe('registered');
    });

    it('state transitions to starting after register()', () => {
      const { plugin } = setupPlugin();
      expect(plugin.state).toBe('running'); // start() was also called
    });

    it('state is running after start()', () => {
      const { plugin } = setupPlugin();
      expect(plugin.state).toBe('running');
    });

    it('state is stopped after stop()', () => {
      const { plugin } = setupPlugin();
      plugin.stop();
      expect(plugin.state).toBe('stopped');
    });

    it('start() throws if register() was not called first', () => {
      const plugin = new AgentTrackerPlugin();
      expect(() => plugin.start()).toThrow();
    });

    it('subscribes to agent:spawned, agent:completed, agent:failed, tick:heartbeat on register()', () => {
      const { services } = setupPlugin();
      expect(services._subscriptions.has('agent:spawned')).toBe(true);
      expect(services._subscriptions.has('agent:completed')).toBe(true);
      expect(services._subscriptions.has('agent:failed')).toBe(true);
      expect(services._subscriptions.has('tick:heartbeat')).toBe(true);
    });
  });

  // ─── emitProgressForActiveAgents — active agents ────────────────────────────

  describe('emitProgressForActiveAgents — with active agents', () => {
    it('emits agent:progress for each active (spawned) agent', () => {
      const { services } = setupPlugin();

      spawnAgent(services, 'agent-001', 'goodvibes:engineer');
      spawnAgent(services, 'agent-002', 'goodvibes:reviewer');

      // Reset emit count after the spawn events (agent re-emissions)
      services.emit.mockClear();

      fireHeartbeat(services);

      // One agent:progress per active agent
      const progressCalls = services.emit.mock.calls.filter(
        (call: unknown[]) => (call[0] as { type: string }).type === 'agent:progress',
      );
      expect(progressCalls).toHaveLength(2);
    });

    it('emits agent:progress containing agent_id field in payload', () => {
      const { services } = setupPlugin();

      spawnAgent(services, 'agent-001', 'goodvibes:engineer');
      services.emit.mockClear();

      fireHeartbeat(services);

      const progressCall = services.emit.mock.calls.find(
        (call: unknown[]) => (call[0] as { type: string }).type === 'agent:progress',
      );
      expect(progressCall).toBeDefined();
      const payload = (progressCall![0] as { payload: Record<string, unknown> }).payload;
      expect(payload['agent_id']).toBe('agent-001');
    });

    it('emits agent:progress containing agent_type field in payload', () => {
      const { services } = setupPlugin();

      spawnAgent(services, 'agent-001', 'goodvibes:engineer');
      services.emit.mockClear();

      fireHeartbeat(services);

      const progressCall = services.emit.mock.calls.find(
        (call: unknown[]) => (call[0] as { type: string }).type === 'agent:progress',
      );
      const payload = (progressCall![0] as { payload: Record<string, unknown> }).payload;
      expect(payload['agent_type']).toBe('goodvibes:engineer');
    });

    it('emits agent:progress containing elapsed_ms field as a number', () => {
      const { services } = setupPlugin();

      spawnAgent(services, 'agent-001', 'goodvibes:engineer');
      services.emit.mockClear();

      fireHeartbeat(services);

      const progressCall = services.emit.mock.calls.find(
        (call: unknown[]) => (call[0] as { type: string }).type === 'agent:progress',
      );
      const payload = (progressCall![0] as { payload: Record<string, unknown> }).payload;
      expect(typeof payload['elapsed_ms']).toBe('number');
      expect(payload['elapsed_ms'] as number).toBeGreaterThanOrEqual(0);
    });

    it('emits agent:progress containing status=spawned', () => {
      const { services } = setupPlugin();

      spawnAgent(services, 'agent-001', 'goodvibes:engineer');
      services.emit.mockClear();

      fireHeartbeat(services);

      const progressCall = services.emit.mock.calls.find(
        (call: unknown[]) => (call[0] as { type: string }).type === 'agent:progress',
      );
      const payload = (progressCall![0] as { payload: Record<string, unknown> }).payload;
      expect(payload['status']).toBe('spawned');
    });

    it('emits multiple heartbeats, each producing progress events for each active agent', () => {
      const { services } = setupPlugin();

      spawnAgent(services, 'agent-001', 'goodvibes:engineer');
      services.emit.mockClear();

      fireHeartbeat(services);
      fireHeartbeat(services);

      const progressCalls = services.emit.mock.calls.filter(
        (call: unknown[]) => (call[0] as { type: string }).type === 'agent:progress',
      );
      expect(progressCalls).toHaveLength(2); // 1 per heartbeat
    });
  });

  // ─── emitProgressForActiveAgents — no active agents ────────────────────────

  describe('emitProgressForActiveAgents — no active agents', () => {
    it('does not emit when there are no tracked agents', () => {
      const { services } = setupPlugin();

      fireHeartbeat(services);

      expect(services.emit).not.toHaveBeenCalled();
    });

    it('does not emit after all agents have completed', () => {
      const { services } = setupPlugin();

      // Spawn then complete
      spawnAgent(services, 'agent-001', 'goodvibes:engineer');

      const completedCb = services._subscriptions.get('agent:completed') as SubscribeCallback;
      completedCb(makeAgentEvent({ type: 'agent:completed', agent_id: 'agent-001', agent_type: 'goodvibes:engineer' }));

      services.emit.mockClear();
      fireHeartbeat(services);

      const progressCalls = services.emit.mock.calls.filter(
        (call: unknown[]) => (call[0] as { type: string }).type === 'agent:progress',
      );
      expect(progressCalls).toHaveLength(0);
    });

    it('does not emit for agents that have failed', () => {
      const { services } = setupPlugin();

      spawnAgent(services, 'agent-001', 'goodvibes:engineer');

      const failedCb = services._subscriptions.get('agent:failed') as SubscribeCallback;
      failedCb(makeAgentEvent({ type: 'agent:failed', agent_id: 'agent-001', agent_type: 'goodvibes:engineer' }));

      services.emit.mockClear();
      fireHeartbeat(services);

      const progressCalls = services.emit.mock.calls.filter(
        (call: unknown[]) => (call[0] as { type: string }).type === 'agent:progress',
      );
      expect(progressCalls).toHaveLength(0);
    });
  });

  // ─── getStats ────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns zero stats when no agents have been tracked', () => {
      const { plugin } = setupPlugin();
      const stats = plugin.getStats();
      expect(stats).toEqual({ total: 0, active: 0, completed: 0, failed: 0, workflows: 0 });
    });

    it('counts active agent after spawn', () => {
      const { plugin, services } = setupPlugin();
      spawnAgent(services, 'agent-001');
      const stats = plugin.getStats();
      expect(stats.active).toBe(1);
      expect(stats.total).toBe(1);
    });
  });

  // ─── skips re-emitted AgentEvents (source.kind === agent) ───────────────────

  describe('source.kind === agent guard', () => {
    it('does not re-process events that originated from the plugin itself', () => {
      const { services } = setupPlugin();
      // Clear all mocks after register/start side-effects
      services.emit.mockClear();
      services.setState.mockClear();

      // Inject a re-emitted agent event (source.kind = 'agent') directly
      const reEmittedEvent = makeAgentEvent({
        type: 'agent:spawned',
        agent_id: 'agent-re',
        agent_type: 'goodvibes:engineer',
        source_kind: 'agent',
      });
      const cb = services._subscriptions.get('agent:spawned') as SubscribeCallback;
      cb(reEmittedEvent);

      // State should not have been updated for this agent
      expect(services.setState).not.toHaveBeenCalled();
    });
  });
});
