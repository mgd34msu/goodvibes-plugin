/**
 * lifecycle.test.ts
 * Tests for LoopLifecycleManager — Layer 1 state machine.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoopLifecycleManager } from '../lifecycle.js';
import type { LoopStatus } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLCM(options?: Parameters<typeof LoopLifecycleManager>[0]) {
  return new LoopLifecycleManager(options);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LoopLifecycleManager', () => {
  // ── Initial state ──────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts in stopped state', () => {
      const lcm = makeLCM();
      expect(lcm.status()).toBe('stopped');
    });

    it('does not accept events when stopped', () => {
      expect(makeLCM().acceptsEvents()).toBe(false);
    });

    it('is not processing when stopped', () => {
      expect(makeLCM().isProcessing()).toBe(false);
    });
  });

  // ── Valid transitions ──────────────────────────────────────────────────────

  describe('stopped → running (start)', () => {
    it('transitions to running', () => {
      const lcm = makeLCM();
      lcm.start();
      expect(lcm.status()).toBe('running');
    });

    it('isProcessing() returns true in running', () => {
      const lcm = makeLCM();
      lcm.start();
      expect(lcm.isProcessing()).toBe(true);
    });

    it('acceptsEvents() returns true in running', () => {
      const lcm = makeLCM();
      lcm.start();
      expect(lcm.acceptsEvents()).toBe(true);
    });
  });

  describe('running → paused (pause)', () => {
    it('transitions to paused', () => {
      const lcm = makeLCM();
      lcm.start();
      lcm.pause();
      expect(lcm.status()).toBe('paused');
    });

    it('isProcessing() returns false in paused', () => {
      const lcm = makeLCM();
      lcm.start();
      lcm.pause();
      expect(lcm.isProcessing()).toBe(false);
    });

    it('acceptsEvents() returns true in paused', () => {
      const lcm = makeLCM();
      lcm.start();
      lcm.pause();
      expect(lcm.acceptsEvents()).toBe(true);
    });
  });

  describe('paused → running (resume)', () => {
    it('transitions from paused to running', () => {
      const lcm = makeLCM();
      lcm.start();
      lcm.pause();
      lcm.resume();
      expect(lcm.status()).toBe('running');
    });

    it('isProcessing() returns true after resume', () => {
      const lcm = makeLCM();
      lcm.start();
      lcm.pause();
      lcm.resume();
      expect(lcm.isProcessing()).toBe(true);
    });
  });

  describe('running → draining → stopped (drain)', () => {
    it('transitions to draining then stopped', async () => {
      const statuses: LoopStatus[] = [];
      // Capture intermediate state via onTransition
      const lcm2 = new LoopLifecycleManager({
        onTransition: (_, to) => statuses.push(to),
      });
      lcm2.start();
      await lcm2.drain();
      expect(statuses).toContain('draining');
      expect(statuses).toContain('stopped');
      expect(lcm2.status()).toBe('stopped');
    });

    it('calls onDrain callback', async () => {
      const onDrain = vi.fn().mockResolvedValue(undefined);
      const lcm = makeLCM({ onDrain });
      lcm.start();
      await lcm.drain();
      expect(onDrain).toHaveBeenCalledTimes(1);
    });

    it('transitions to stopped even if onDrain throws', async () => {
      const onDrain = vi.fn().mockRejectedValue(new Error('drain error'));
      const lcm = makeLCM({ onDrain });
      lcm.start();
      await expect(lcm.drain()).rejects.toThrow('drain error');
      // Even on throw, the finally block runs
      expect(lcm.status()).toBe('stopped');
    });

    it('is not processing while draining', async () => {
      let statusWhileDraining: LoopStatus | undefined;
      const onDrain = vi.fn().mockImplementation(async () => {
        statusWhileDraining = lcm.status();
      });
      const lcm = makeLCM({ onDrain });
      lcm.start();
      await lcm.drain();
      expect(statusWhileDraining).toBe('draining');
      expect(lcm.isProcessing()).toBe(false);
    });
  });

  describe('shutdown from various states', () => {
    it('shutdowns from running state', async () => {
      const lcm = makeLCM();
      lcm.start();
      await lcm.shutdown();
      expect(lcm.status()).toBe('stopped');
    });

    it('shutdowns from paused state', async () => {
      const lcm = makeLCM();
      lcm.start();
      lcm.pause();
      await lcm.shutdown();
      expect(lcm.status()).toBe('stopped');
    });

    it('shutdowns from draining state via forceTransition', async () => {
      // Shutdown from draining state: forceTransition sets status to 'stopped'.
      // Drain's finally block then attempts transition('stopped')→'stopped' which throws
      // because stopped is not a valid target from stopped. This confirms forceTransition
      // bypassed the normal table and shutdown succeeded.
      let resolveDrain!: () => void;
      const drainDone = new Promise<void>((resolve) => { resolveDrain = resolve; });
      const onDrain = vi.fn().mockImplementation(() => drainDone);
      const lcm = new LoopLifecycleManager({ onDrain });
      lcm.start();

      // Start drain (will block at onDrain)
      const drainPromise = lcm.drain();

      // Shutdown while draining — uses forceTransition to force to 'stopped'
      await lcm.shutdown();
      expect(lcm.status()).toBe('stopped');

      // Unblock drain — drain's finally block tries transition('stopped')→'stopped'
      // which throws since stopped→stopped is invalid (already forceTransitioned).
      resolveDrain();
      await expect(drainPromise).rejects.toThrow(/Invalid lifecycle transition/);
    });

    it('shutdown is a no-op when already stopped', async () => {
      const onShutdown = vi.fn().mockResolvedValue(undefined);
      const lcm = makeLCM({ onShutdown });
      await lcm.shutdown(); // already stopped
      expect(onShutdown).not.toHaveBeenCalled();
      expect(lcm.status()).toBe('stopped');
    });

    it('calls onShutdown callback', async () => {
      const onShutdown = vi.fn().mockResolvedValue(undefined);
      const lcm = makeLCM({ onShutdown });
      lcm.start();
      await lcm.shutdown();
      expect(onShutdown).toHaveBeenCalledTimes(1);
    });

    it('still transitions to stopped even if onShutdown throws', async () => {
      const onShutdown = vi.fn().mockRejectedValue(new Error('shutdown failure'));
      const lcm = makeLCM({ onShutdown });
      lcm.start();
      // Should NOT rethrow (it swallows the error and still stops)
      await lcm.shutdown();
      expect(lcm.status()).toBe('stopped');
    });
  });

  // ── Invalid transitions ────────────────────────────────────────────────────

  describe('invalid transitions', () => {
    it('throws when starting from running', () => {
      const lcm = makeLCM();
      lcm.start();
      expect(() => lcm.start()).toThrow(/Invalid lifecycle transition/);
    });

    it('throws when starting from draining', async () => {
      // paused→running is actually valid per the transition table,
      // but draining→running is not.
      let resolveDrain!: () => void;
      const drainDone = new Promise<void>((resolve) => { resolveDrain = resolve; });
      const onDrain = vi.fn().mockImplementation(() => drainDone);
      const lcm = new LoopLifecycleManager({ onDrain });
      lcm.start();
      const drainPromise = lcm.drain(); // now in 'draining'
      expect(() => lcm.start()).toThrow(/Invalid lifecycle transition/);
      resolveDrain();
      await drainPromise;
    });

    it('throws when pausing from stopped', () => {
      const lcm = makeLCM();
      expect(() => lcm.pause()).toThrow(/Invalid lifecycle transition/);
    });

    it('throws when pausing from draining', async () => {
      // Start drain but intercept before completion
      const drainStarted = vi.fn();
      const drainDone = new Promise<void>((resolve) => setTimeout(resolve, 0));
      const onDrain = vi.fn().mockImplementation(async () => {
        drainStarted();
        await drainDone;
      });
      const lcm2 = new LoopLifecycleManager({ onDrain });
      lcm2.start();
      const drainPromise = lcm2.drain();
      // At this point lcm2 is draining — pause should throw
      expect(() => lcm2.pause()).toThrow(/Invalid lifecycle transition/);
      await drainPromise;
    });

    it('throws when resuming from stopped', () => {
      const lcm = makeLCM();
      expect(() => lcm.resume()).toThrow(/Cannot resume from status/);
    });

    it('throws when resuming from running', () => {
      const lcm = makeLCM();
      lcm.start();
      expect(() => lcm.resume()).toThrow(/Cannot resume from status/);
    });

    it('throws when draining from stopped', async () => {
      const lcm = makeLCM();
      await expect(lcm.drain()).rejects.toThrow(/Invalid lifecycle transition/);
    });

    it('throws when draining from paused', async () => {
      const lcm = makeLCM();
      lcm.start();
      lcm.pause();
      await expect(lcm.drain()).rejects.toThrow(/Invalid lifecycle transition/);
    });
  });

  // ── onTransition callback ──────────────────────────────────────────────────

  describe('onTransition callback', () => {
    it('fires on every valid transition with correct from/to', () => {
      const transitions: Array<[LoopStatus, LoopStatus]> = [];
      const lcm = makeLCM({
        onTransition: (from, to) => transitions.push([from, to]),
      });
      lcm.start();
      lcm.pause();
      lcm.resume();
      expect(transitions).toEqual([
        ['stopped', 'running'],
        ['running', 'paused'],
        ['paused', 'running'],
      ]);
    });

    it('fires during drain (draining and stopped)', async () => {
      const transitions: LoopStatus[] = [];
      const lcm = makeLCM({
        onTransition: (_, to) => transitions.push(to),
      });
      lcm.start();
      await lcm.drain();
      expect(transitions).toEqual(['running', 'draining', 'stopped']);
    });
  });

  // ── forceTransition used by shutdown ───────────────────────────────────────

  describe('forceTransition (shutdown bypass)', () => {
    it('shutdown uses forceTransition when running (normal allowed path)', async () => {
      const transitions: Array<[LoopStatus, LoopStatus]> = [];
      const lcm = makeLCM({
        onTransition: (from, to) => transitions.push([from, to]),
      });
      lcm.start();
      await lcm.shutdown();
      // running→stopped is not in VALID_TRANSITIONS but forceTransition proceeds
      expect(transitions).toContainEqual(['running', 'stopped']);
      expect(lcm.status()).toBe('stopped');
    });
  });
});
