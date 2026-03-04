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
});
