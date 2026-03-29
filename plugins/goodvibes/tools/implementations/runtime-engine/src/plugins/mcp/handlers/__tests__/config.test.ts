/**
 * runtime_config Handler Tests
 *
 * Tests key allowlist validation, type validation, executor.mode value-level
 * validation (invalid mode rejection), and the happy-path set + warning path.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleRuntimeConfig } from '../config.js';
import type { HandlerContext } from '../types.js';
import { DEFAULT_CONFIG } from '../../../../shared/config.js';

vi.mock('../../../../shared/config.js', async () => {
  const actual = await vi.importActual<typeof import('../../../../shared/config.js')>('../../../../shared/config.js');
  return { ...actual, saveConfig: vi.fn() };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
  const mockStateStore = {
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
    delete: vi.fn(),
    keys: vi.fn().mockReturnValue([]),
  };
  return {
    getUptime: vi.fn().mockReturnValue(500),
    getConfig: vi.fn().mockReturnValue(DEFAULT_CONFIG),
    getHealth: vi.fn(),
    updateConfig: vi.fn(),
    projectRoot: '/project',
    version: '1.0.0',
    getEventBus: vi.fn().mockReturnValue(null),
    getEventLog: vi.fn().mockReturnValue(null),
    getEventQueue: vi.fn().mockReturnValue(null),
    getWorkflowEngine: vi.fn().mockReturnValue(null),
    getTriggerRegistry: vi.fn().mockReturnValue(null),
    getAgentCoordinator: vi.fn().mockReturnValue(null),
    getDirectiveQueue: vi.fn().mockReturnValue(null),
    getCoreStateStore: vi.fn().mockReturnValue(mockStateStore),
    transport: undefined,
    ...overrides,
  } as HandlerContext;
}

/** Parse the JSON body from a CallToolResult — returns the envelope root */
function parseResult(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ text: string }> };
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

/** Parse the data payload from a successful CallToolResult */
function parseData(result: unknown): Record<string, unknown> {
  const envelope = parseResult(result);
  return (envelope['data'] ?? {}) as Record<string, unknown>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('handleRuntimeConfig', () => {
  let ctx: HandlerContext;

  beforeEach(() => {
    ctx = makeContext();
    vi.clearAllMocks();
  });

  // ── executor.mode value-level validation ────────────────────────────────────

  describe('executor.mode value validation', () => {
    it('rejects an invalid executor.mode value', async () => {
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'executor.mode', value: 'turbo' },
        ctx
      );
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('Invalid value for \'executor.mode\'');
      expect(parsed['error']).toContain('turbo');
      expect(parsed['error']).toContain('engaged');
      expect(parsed['error']).toContain('daemon');
      expect(parsed['error']).toContain('hybrid');
    });

    it('accepts a valid executor.mode value: engaged', async () => {
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'executor.mode', value: 'engaged' },
        ctx
      );
      expect(result.isError).toBeFalsy();
      const data = parseData(result);
      expect(data['key']).toBe('executor.mode');
      expect(data['value']).toBe('engaged');
    });

    it('accepts a valid executor.mode value: daemon', async () => {
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'executor.mode', value: 'daemon' },
        ctx
      );
      expect(result.isError).toBeFalsy();
    });

    it('accepts a valid executor.mode value: hybrid', async () => {
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'executor.mode', value: 'hybrid' },
        ctx
      );
      expect(result.isError).toBeFalsy();
    });

    it('includes restart warning when executor.mode is set', async () => {
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'executor.mode', value: 'daemon' },
        ctx
      );
      const data = parseData(result);
      expect(typeof data['warning']).toBe('string');
      expect(data['warning']).toContain('executor.mode change takes effect');
      expect(data['warning']).toContain('Most other config keys are hot-reloaded immediately');
    });
  });

  // ── key allowlist validation ────────────────────────────────────────────────

  describe('key allowlist validation', () => {
    it('rejects an unknown config key', async () => {
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'executor.nonexistent', value: 'foo' },
        ctx
      );
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('Invalid config key');
    });

    it('accepts executor.daemon.eval_interval_ms (recently added key)', async () => {
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'executor.daemon.eval_interval_ms', value: 5000 },
        ctx
      );
      expect(result.isError).toBeFalsy();
    });

    it('accepts executor.transport.auto_start (recently added key)', async () => {
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'executor.transport.auto_start', value: true },
        ctx
      );
      expect(result.isError).toBeFalsy();
    });

    it('accepts executor.transport.rpc_timeout_ms (recently added key)', async () => {
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'executor.transport.rpc_timeout_ms', value: 3000 },
        ctx
      );
      expect(result.isError).toBeFalsy();
    });

    it('accepts executor.transport.migrate_state_on_join (recently added key)', async () => {
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'executor.transport.migrate_state_on_join', value: true },
        ctx
      );
      expect(result.isError).toBeFalsy();
    });
  });

  // ── type validation ─────────────────────────────────────────────────────────

  describe('type validation', () => {
    it('rejects wrong type for a boolean key', async () => {
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'executor.transport.auto_start', value: 'yes' },
        ctx
      );
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('expected boolean');
    });

    it('rejects wrong type for a number key', async () => {
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'executor.daemon.eval_interval_ms', value: 'fast' },
        ctx
      );
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('expected number');
    });
  });

  // ── input validation ────────────────────────────────────────────────────────

  describe('input validation', () => {
    it('returns error for missing action', async () => {
      const result = await handleRuntimeConfig({}, ctx);
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('Missing required field: action');
    });

    it('returns error for missing key on set', async () => {
      const result = await handleRuntimeConfig({ action: 'set', value: 'foo' }, ctx);
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('Missing required field: key');
    });

    it('returns error for missing value on set', async () => {
      const result = await handleRuntimeConfig({ action: 'set', key: 'executor.mode' }, ctx);
      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed['error']).toContain('Missing required field: value');
    });
  });

  // ── wrfc.* key propagation to CoreStateStore ─────────────────────────────────

  describe('wrfc.* key propagation to CoreStateStore', () => {
    it('propagates wrfc.score_threshold to CoreStateStore when set', async () => {
      const mockStateStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn(), keys: vi.fn() };
      const storeCtx = makeContext({ getCoreStateStore: vi.fn().mockReturnValue(mockStateStore) });
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'wrfc.score_threshold', value: 10 },
        storeCtx
      );
      expect(result.isError).toBeFalsy();
      expect(mockStateStore.set).toHaveBeenCalledWith('wrfc.config.score_threshold', 10);
    });

    it('propagates wrfc.max_fix_attempts to CoreStateStore when set', async () => {
      const mockStateStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn(), keys: vi.fn() };
      const storeCtx = makeContext({ getCoreStateStore: vi.fn().mockReturnValue(mockStateStore) });
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'wrfc.max_fix_attempts', value: 5 },
        storeCtx
      );
      expect(result.isError).toBeFalsy();
      expect(mockStateStore.set).toHaveBeenCalledWith('wrfc.config.max_fix_attempts', 5);
    });

    it('propagates wrfc.auto_commit to CoreStateStore when set', async () => {
      const mockStateStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn(), keys: vi.fn() };
      const storeCtx = makeContext({ getCoreStateStore: vi.fn().mockReturnValue(mockStateStore) });
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'wrfc.auto_commit', value: false },
        storeCtx
      );
      expect(result.isError).toBeFalsy();
      expect(mockStateStore.set).toHaveBeenCalledWith('wrfc.config.auto_commit', false);
    });

    it('propagates wrfc.require_review_types to CoreStateStore when set', async () => {
      const mockStateStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn(), keys: vi.fn() };
      const storeCtx = makeContext({ getCoreStateStore: vi.fn().mockReturnValue(mockStateStore) });
      const result = await handleRuntimeConfig(
        { action: 'set', key: 'wrfc.require_review_types', value: ['security'] },
        storeCtx
      );
      expect(result.isError).toBeFalsy();
      expect(mockStateStore.set).toHaveBeenCalledWith('wrfc.config.require_review_types', ['security']);
    });
  });

  // ── transport (daemon) path ─────────────────────────────────────────────────

  describe('transport path', () => {
    it('set: delegates to transport.updateConfig when transport is present', async () => {
      const mockUpdateConfig = vi.fn().mockResolvedValue(undefined);
      const mockGetConfig = vi.fn().mockResolvedValue(DEFAULT_CONFIG);
      const transportCtx = makeContext({
        transport: {
          updateConfig: mockUpdateConfig,
          getConfig: mockGetConfig,
        } as unknown as HandlerContext['transport'],
      });

      const result = await handleRuntimeConfig(
        { action: 'set', key: 'health.check_interval_ms', value: 5000 },
        transportCtx
      );
      expect(result.isError).toBeFalsy();
      expect(mockUpdateConfig).toHaveBeenCalledOnce();
      const updatedConfig = mockUpdateConfig.mock.calls[0][0] as Record<string, unknown>;
      expect((updatedConfig as { health: { check_interval_ms: number } }).health.check_interval_ms).toBe(5000);
    });

    it('reset: delegates to transport.updateConfig with DEFAULT_CONFIG when transport is present', async () => {
      const mockUpdateConfig = vi.fn().mockResolvedValue(undefined);
      const transportCtx = makeContext({
        transport: {
          updateConfig: mockUpdateConfig,
          getConfig: vi.fn().mockResolvedValue(DEFAULT_CONFIG),
        } as unknown as HandlerContext['transport'],
      });

      const result = await handleRuntimeConfig({ action: 'reset' }, transportCtx);
      expect(result.isError).toBeFalsy();
      expect(mockUpdateConfig).toHaveBeenCalledWith(DEFAULT_CONFIG);
    });
  });
});
