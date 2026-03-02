import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdapterRegistry } from '../registry.js';
import type { EventSourceAdapter, AdapterStatus } from '../types.js';
import type { RuntimeEvent } from '../../../shared/events.js';

// Suppress logger output
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAdapter(name: string, failStart = false, failStop = false): EventSourceAdapter {
  return {
    name,
    start: vi.fn().mockImplementation(() =>
      failStart ? Promise.reject(new Error(`${name} start failed`)) : Promise.resolve(),
    ),
    stop: vi.fn().mockImplementation(() =>
      failStop ? Promise.reject(new Error(`${name} stop failed`)) : Promise.resolve(),
    ),
    status: vi.fn().mockReturnValue({
      running: false,
      eventsProcessed: 0,
      errors: 0,
    } as AdapterStatus),
    normalize: vi.fn().mockReturnValue(null) as (rawInput: unknown) => RuntimeEvent | null,
  };
}

// ─── AdapterRegistry ─────────────────────────────────────────────────────────

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  // ─── register / deregister ───────────────────────────────────────────────────

  describe('register()', () => {
    it('registers an adapter by name', () => {
      const adapter = makeAdapter('hook');
      registry.register(adapter);
      expect(registry.get('hook')).toBe(adapter);
    });

    it('throws on duplicate registration', () => {
      const adapter = makeAdapter('hook');
      registry.register(adapter);
      expect(() => registry.register(adapter)).toThrow(
        "AdapterRegistry: adapter 'hook' is already registered.",
      );
    });

    it('allows registering adapters with different names', () => {
      registry.register(makeAdapter('hook'));
      registry.register(makeAdapter('time'));
      expect(registry.names()).toHaveLength(2);
    });

    it('error message mentions deregister instruction', () => {
      const adapter = makeAdapter('hook');
      registry.register(adapter);
      expect(() => registry.register(makeAdapter('hook'))).toThrow(
        'Deregister the existing adapter before registering a new one.',
      );
    });
  });

  describe('deregister()', () => {
    it('removes a registered adapter', async () => {
      registry.register(makeAdapter('hook'));
      await registry.deregister('hook');
      expect(registry.get('hook')).toBeUndefined();
    });

    it('calls stop() on the adapter before removing it', async () => {
      const adapter = makeAdapter('hook');
      registry.register(adapter);
      await registry.deregister('hook');
      expect(adapter.stop).toHaveBeenCalledOnce();
    });

    it('is a no-op for unknown adapter names', async () => {
      await expect(registry.deregister('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('get() / names()', () => {
    it('returns undefined for unregistered adapters', () => {
      expect(registry.get('missing')).toBeUndefined();
    });

    it('names() returns empty array when no adapters registered', () => {
      expect(registry.names()).toEqual([]);
    });

    it('names() returns all registered adapter names', () => {
      registry.register(makeAdapter('hook'));
      registry.register(makeAdapter('time'));
      registry.register(makeAdapter('external'));
      expect(registry.names()).toHaveLength(3);
      expect(registry.names()).toContain('hook');
      expect(registry.names()).toContain('time');
      expect(registry.names()).toContain('external');
    });
  });

  // ─── startAll / stopAll ───────────────────────────────────────────────────────

  describe('startAll()', () => {
    it('calls start() on all registered adapters', async () => {
      const a1 = makeAdapter('hook');
      const a2 = makeAdapter('time');
      registry.register(a1);
      registry.register(a2);
      await registry.startAll();
      expect(a1.start).toHaveBeenCalledOnce();
      expect(a2.start).toHaveBeenCalledOnce();
    });

    it('starts all adapters in parallel (Promise.allSettled)', async () => {
      const order: string[] = [];
      const a1: EventSourceAdapter = {
        ...makeAdapter('hook'),
        start: vi.fn().mockImplementation(async () => {
          order.push('hook');
        }),
      };
      const a2: EventSourceAdapter = {
        ...makeAdapter('time'),
        start: vi.fn().mockImplementation(async () => {
          order.push('time');
        }),
      };
      registry.register(a1);
      registry.register(a2);
      await registry.startAll();
      // Both should have been started (order may vary in parallel execution)
      expect(order).toHaveLength(2);
      expect(order).toContain('hook');
      expect(order).toContain('time');
    });

    it('continues starting remaining adapters when one fails', async () => {
      const failing = makeAdapter('hook', true);
      const succeeding = makeAdapter('time');
      registry.register(failing);
      registry.register(succeeding);
      // Should not throw
      await expect(registry.startAll()).resolves.toBeUndefined();
      expect(succeeding.start).toHaveBeenCalledOnce();
    });

    it('resolves successfully even when all adapters fail to start', async () => {
      registry.register(makeAdapter('hook', true));
      registry.register(makeAdapter('time', true));
      await expect(registry.startAll()).resolves.toBeUndefined();
    });

    it('is a no-op when no adapters are registered', async () => {
      await expect(registry.startAll()).resolves.toBeUndefined();
    });
  });

  describe('stopAll()', () => {
    it('calls stop() on all registered adapters', async () => {
      const a1 = makeAdapter('hook');
      const a2 = makeAdapter('time');
      registry.register(a1);
      registry.register(a2);
      await registry.stopAll();
      expect(a1.stop).toHaveBeenCalledOnce();
      expect(a2.stop).toHaveBeenCalledOnce();
    });

    it('continues stopping remaining adapters when one fails', async () => {
      const failing = makeAdapter('hook', false, true);
      const succeeding = makeAdapter('time');
      registry.register(failing);
      registry.register(succeeding);
      await expect(registry.stopAll()).resolves.toBeUndefined();
      expect(succeeding.stop).toHaveBeenCalledOnce();
    });

    it('resolves successfully even when all adapters fail to stop', async () => {
      registry.register(makeAdapter('hook', false, true));
      registry.register(makeAdapter('time', false, true));
      await expect(registry.stopAll()).resolves.toBeUndefined();
    });

    it('is a no-op when no adapters are registered', async () => {
      await expect(registry.stopAll()).resolves.toBeUndefined();
    });
  });

  // ─── getStatus ───────────────────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('returns empty map when no adapters registered', () => {
      const status = registry.getStatus();
      expect(status.size).toBe(0);
    });

    it('returns status for each registered adapter', () => {
      const a1 = makeAdapter('hook');
      const a2 = makeAdapter('time');
      registry.register(a1);
      registry.register(a2);

      const status = registry.getStatus();
      expect(status.size).toBe(2);
      expect(status.has('hook')).toBe(true);
      expect(status.has('time')).toBe(true);
    });

    it('calls status() on each adapter', () => {
      const adapter = makeAdapter('hook');
      registry.register(adapter);
      registry.getStatus();
      expect(adapter.status).toHaveBeenCalledOnce();
    });

    it('returns the status reported by each adapter', () => {
      const mockStatus: AdapterStatus = { running: true, eventsProcessed: 42, errors: 1 };
      const adapter: EventSourceAdapter = {
        ...makeAdapter('hook'),
        status: vi.fn().mockReturnValue(mockStatus),
      };
      registry.register(adapter);
      const result = registry.getStatus();
      expect(result.get('hook')).toEqual(mockStatus);
    });

    it('does not include deregistered adapters in status', async () => {
      registry.register(makeAdapter('hook'));
      registry.register(makeAdapter('time'));
      await registry.deregister('hook');
      const status = registry.getStatus();
      expect(status.has('hook')).toBe(false);
      expect(status.has('time')).toBe(true);
    });
  });
});
