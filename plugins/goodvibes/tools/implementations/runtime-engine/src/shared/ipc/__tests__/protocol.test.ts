import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateIPCMessage } from '../protocol.js';

// Suppress console.warn from the default branch (only reachable via future version mismatch)
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
afterEach(() => warnSpy.mockClear());

describe('validateIPCMessage', () => {
  // ─── Non-object inputs ───────────────────────────────────────────────────────

  it('rejects null', () => {
    expect(validateIPCMessage(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(validateIPCMessage(undefined)).toBe(false);
  });

  it('rejects a string', () => {
    expect(validateIPCMessage('hook_event')).toBe(false);
  });

  it('rejects a number', () => {
    expect(validateIPCMessage(42)).toBe(false);
  });

  it('rejects an array', () => {
    expect(validateIPCMessage([])).toBe(false);
  });

  // ─── Missing / invalid envelope fields ──────────────────────────────────────

  it('rejects object with no type field', () => {
    expect(validateIPCMessage({ id: 'msg-1' })).toBe(false);
  });

  it('rejects object with numeric type', () => {
    expect(validateIPCMessage({ type: 123, id: 'msg-1' })).toBe(false);
  });

  it('rejects object with unknown type string', () => {
    // Unknown types are rejected by the Set check before the switch;
    // the default branch (which logs a warning) is only reached when the Set
    // is out of sync with the switch cases — not testable from valid inputs.
    expect(validateIPCMessage({ type: 'unknown_type', id: 'msg-1' })).toBe(false);
  });

  it('rejects object with missing id', () => {
    expect(validateIPCMessage({ type: 'heartbeat' })).toBe(false);
  });

  it('rejects object with empty id string', () => {
    expect(validateIPCMessage({ type: 'heartbeat', id: '' })).toBe(false);
  });

  it('rejects object with numeric id', () => {
    expect(validateIPCMessage({ type: 'heartbeat', id: 42 })).toBe(false);
  });

  // ─── hook_event ──────────────────────────────────────────────────────────────

  it('accepts a valid hook_event message', () => {
    expect(
      validateIPCMessage({
        type: 'hook_event',
        id: 'msg-1',
        hook_name: 'pre_tool_use',
        hook_input: { tool: 'bash' },
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('rejects hook_event with missing hook_name', () => {
    expect(
      validateIPCMessage({
        type: 'hook_event',
        id: 'msg-1',
        hook_input: { tool: 'bash' },
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('rejects hook_event with empty hook_name', () => {
    expect(
      validateIPCMessage({
        type: 'hook_event',
        id: 'msg-1',
        hook_name: '',
        hook_input: { tool: 'bash' },
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('rejects hook_event with null hook_input', () => {
    expect(
      validateIPCMessage({
        type: 'hook_event',
        id: 'msg-1',
        hook_name: 'pre_tool_use',
        hook_input: null,
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('rejects hook_event with array hook_input', () => {
    expect(
      validateIPCMessage({
        type: 'hook_event',
        id: 'msg-1',
        hook_name: 'pre_tool_use',
        hook_input: ['not', 'an', 'object'],
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('rejects hook_event with missing timestamp', () => {
    expect(
      validateIPCMessage({
        type: 'hook_event',
        id: 'msg-1',
        hook_name: 'pre_tool_use',
        hook_input: {},
      }),
    ).toBe(false);
  });

  it('rejects hook_event with numeric timestamp', () => {
    expect(
      validateIPCMessage({
        type: 'hook_event',
        id: 'msg-1',
        hook_name: 'pre_tool_use',
        hook_input: {},
        timestamp: 1234567890,
      }),
    ).toBe(false);
  });

  // ─── query ───────────────────────────────────────────────────────────────────

  it('accepts a valid query message', () => {
    expect(
      validateIPCMessage({
        type: 'query',
        id: 'msg-2',
        query: { kind: 'get_directives' },
      }),
    ).toBe(true);
  });

  it('accepts a query with all known kinds', () => {
    const kinds = [
      'get_system_message',
      'get_directives',
      'get_workflow_state',
      'get_agent_status',
      'should_block_tool',
      'get_context_injection',
      'resolve_pending_bind',
      'consume_pending_bind',
      'get_executor_mode',
      'get_executor_budget',
      'process_tick',
    ];
    for (const kind of kinds) {
      expect(
        validateIPCMessage({ type: 'query', id: 'q', query: { kind } }),
      ).toBe(true);
    }
  });

  it('accepts a query with an unrecognised kind string (kind is just a string)', () => {
    // The validator only checks that query.kind is a string — no whitelist
    expect(
      validateIPCMessage({
        type: 'query',
        id: 'msg-2',
        query: { kind: 'some_future_kind' },
      }),
    ).toBe(true);
  });

  it('rejects query with missing query field', () => {
    expect(validateIPCMessage({ type: 'query', id: 'msg-2' })).toBe(false);
  });

  it('rejects query with null query', () => {
    expect(validateIPCMessage({ type: 'query', id: 'msg-2', query: null })).toBe(false);
  });

  it('rejects query with array query', () => {
    expect(validateIPCMessage({ type: 'query', id: 'msg-2', query: [] })).toBe(false);
  });

  it('rejects query where query.kind is not a string', () => {
    expect(
      validateIPCMessage({ type: 'query', id: 'msg-2', query: { kind: 42 } }),
    ).toBe(false);
  });

  it('rejects query where query.kind is missing', () => {
    expect(
      validateIPCMessage({ type: 'query', id: 'msg-2', query: { notKind: 'foo' } }),
    ).toBe(false);
  });

  // ─── state_update ────────────────────────────────────────────────────────────

  it('accepts a valid state_update message', () => {
    expect(
      validateIPCMessage({
        type: 'state_update',
        id: 'msg-3',
        updates: { session_id: 'abc-123' },
      }),
    ).toBe(true);
  });

  it('accepts a state_update with empty updates object', () => {
    expect(
      validateIPCMessage({ type: 'state_update', id: 'msg-3', updates: {} }),
    ).toBe(true);
  });

  it('rejects state_update with missing updates', () => {
    expect(validateIPCMessage({ type: 'state_update', id: 'msg-3' })).toBe(false);
  });

  it('rejects state_update with null updates', () => {
    expect(
      validateIPCMessage({ type: 'state_update', id: 'msg-3', updates: null }),
    ).toBe(false);
  });

  it('rejects state_update with array updates', () => {
    expect(
      validateIPCMessage({ type: 'state_update', id: 'msg-3', updates: ['a'] }),
    ).toBe(false);
  });

  // ─── heartbeat ───────────────────────────────────────────────────────────────

  it('accepts a valid heartbeat message', () => {
    expect(validateIPCMessage({ type: 'heartbeat', id: 'msg-4' })).toBe(true);
  });

  it('accepts heartbeat with extra fields (duck-typed)', () => {
    expect(
      validateIPCMessage({ type: 'heartbeat', id: 'msg-4', extra: 'ignored' }),
    ).toBe(true);
  });
});
