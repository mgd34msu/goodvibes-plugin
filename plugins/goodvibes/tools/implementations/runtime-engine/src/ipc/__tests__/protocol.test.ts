/**
 * Unit tests for IPC protocol validation.
 *
 * Covers validateIPCMessage — the runtime type guard that validates all
 * inbound IPC messages before they are dispatched to the handler.
 *
 * Note on MAX_MESSAGE_SIZE:
 * The 1 MB size limit in ipc-server.ts is enforced inside the 'data' event
 * handler on a live Unix socket. Testing it in isolation would require
 * spinning up a real socket server, which is integration-test territory.
 * See the integration test plan in TASK-009 for that coverage.
 */

import { describe, it, expect } from 'vitest';
import { validateIPCMessage } from '../protocol.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHookEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'hook_event',
    id: 'msg-001',
    hook_name: 'pre_tool_use',
    hook_input: { tool_name: 'Bash' },
    timestamp: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeQuery(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'query',
    id: 'msg-002',
    query: { kind: 'get_directives' },
    ...overrides,
  };
}

function makeStateUpdate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'state_update',
    id: 'msg-003',
    updates: { last_tool: 'Bash' },
    ...overrides,
  };
}

function makeHeartbeat(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'heartbeat',
    id: 'msg-004',
    ...overrides,
  };
}

// ─── Envelope-level validation ────────────────────────────────────────────────

describe('validateIPCMessage — envelope', () => {
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

  it('rejects a boolean', () => {
    expect(validateIPCMessage(true)).toBe(false);
  });

  it('rejects a top-level array', () => {
    expect(validateIPCMessage([])).toBe(false);
  });

  it('rejects an object with a missing type field', () => {
    expect(validateIPCMessage({ id: 'msg-001' })).toBe(false);
  });

  it('rejects an object with a non-string type field', () => {
    expect(validateIPCMessage({ type: 42, id: 'msg-001' })).toBe(false);
  });

  it('rejects an object with an unrecognised type string', () => {
    expect(validateIPCMessage({ type: 'unknown_type', id: 'msg-001' })).toBe(false);
  });

  it('rejects an object with a missing id field', () => {
    expect(validateIPCMessage({ type: 'heartbeat' })).toBe(false);
  });

  it('rejects an object with a non-string id field', () => {
    expect(validateIPCMessage({ type: 'heartbeat', id: 99 })).toBe(false);
  });

  it('rejects an object with an empty string id', () => {
    expect(validateIPCMessage({ type: 'heartbeat', id: '' })).toBe(false);
  });
});

// ─── hook_event ───────────────────────────────────────────────────────────────

describe('validateIPCMessage — hook_event', () => {
  it('accepts a fully-formed hook_event message', () => {
    expect(validateIPCMessage(makeHookEvent())).toBe(true);
  });

  it('accepts hook_input with multiple nested fields', () => {
    expect(
      validateIPCMessage(
        makeHookEvent({ hook_input: { tool_name: 'Bash', tool_input: { command: 'ls' } } }),
      ),
    ).toBe(true);
  });

  it('rejects when hook_name is missing', () => {
    const msg = makeHookEvent();
    delete msg['hook_name'];
    expect(validateIPCMessage(msg)).toBe(false);
  });

  it('rejects when hook_name is an empty string', () => {
    expect(validateIPCMessage(makeHookEvent({ hook_name: '' }))).toBe(false);
  });

  it('rejects when hook_name is not a string', () => {
    expect(validateIPCMessage(makeHookEvent({ hook_name: 123 }))).toBe(false);
  });

  it('rejects when hook_input is missing', () => {
    const msg = makeHookEvent();
    delete msg['hook_input'];
    expect(validateIPCMessage(msg)).toBe(false);
  });

  it('rejects when hook_input is null', () => {
    expect(validateIPCMessage(makeHookEvent({ hook_input: null }))).toBe(false);
  });

  it('rejects when hook_input is an array (Array.isArray guard)', () => {
    expect(validateIPCMessage(makeHookEvent({ hook_input: ['tool_name', 'Bash'] }))).toBe(false);
  });

  it('rejects when hook_input is a string', () => {
    expect(validateIPCMessage(makeHookEvent({ hook_input: 'Bash' }))).toBe(false);
  });

  it('rejects when timestamp is missing', () => {
    const msg = makeHookEvent();
    delete msg['timestamp'];
    expect(validateIPCMessage(msg)).toBe(false);
  });

  it('rejects when timestamp is not a string', () => {
    expect(validateIPCMessage(makeHookEvent({ timestamp: Date.now() }))).toBe(false);
  });
});

// ─── query ────────────────────────────────────────────────────────────────────

describe('validateIPCMessage — query', () => {
  it('accepts a fully-formed query message', () => {
    expect(validateIPCMessage(makeQuery())).toBe(true);
  });

  it('accepts a query with additional fields on the query object', () => {
    expect(
      validateIPCMessage(makeQuery({ query: { kind: 'get_workflow_state', workflow_id: 'wf-1' } })),
    ).toBe(true);
  });

  it('rejects when query field is missing', () => {
    const msg = makeQuery();
    delete msg['query'];
    expect(validateIPCMessage(msg)).toBe(false);
  });

  it('rejects when query field is null', () => {
    expect(validateIPCMessage(makeQuery({ query: null }))).toBe(false);
  });

  it('rejects when query field is an array (Array.isArray guard)', () => {
    expect(validateIPCMessage(makeQuery({ query: [{ kind: 'get_directives' }] }))).toBe(false);
  });

  it('rejects when query field is a string', () => {
    expect(validateIPCMessage(makeQuery({ query: 'get_directives' }))).toBe(false);
  });

  it('rejects when query.kind is missing', () => {
    expect(validateIPCMessage(makeQuery({ query: { workflow_id: 'wf-1' } }))).toBe(false);
  });

  it('rejects when query.kind is not a string', () => {
    expect(validateIPCMessage(makeQuery({ query: { kind: 42 } }))).toBe(false);
  });
});

// ─── state_update ─────────────────────────────────────────────────────────────

describe('validateIPCMessage — state_update', () => {
  it('accepts a fully-formed state_update message', () => {
    expect(validateIPCMessage(makeStateUpdate())).toBe(true);
  });

  it('accepts state_update with an empty updates object', () => {
    expect(validateIPCMessage(makeStateUpdate({ updates: {} }))).toBe(true);
  });

  it('rejects when updates field is missing', () => {
    const msg = makeStateUpdate();
    delete msg['updates'];
    expect(validateIPCMessage(msg)).toBe(false);
  });

  it('rejects when updates field is null', () => {
    expect(validateIPCMessage(makeStateUpdate({ updates: null }))).toBe(false);
  });

  it('rejects when updates field is an array (Array.isArray guard)', () => {
    expect(
      validateIPCMessage(makeStateUpdate({ updates: [{ last_tool: 'Bash' }] })),
    ).toBe(false);
  });

  it('rejects when updates field is a string', () => {
    expect(validateIPCMessage(makeStateUpdate({ updates: 'last_tool=Bash' }))).toBe(false);
  });

  it('rejects when updates field is a number', () => {
    expect(validateIPCMessage(makeStateUpdate({ updates: 0 }))).toBe(false);
  });
});

// ─── heartbeat ────────────────────────────────────────────────────────────────

describe('validateIPCMessage — heartbeat', () => {
  it('accepts a minimal heartbeat (type + id only)', () => {
    expect(validateIPCMessage(makeHeartbeat())).toBe(true);
  });

  it('accepts a heartbeat with extra fields (ignored)', () => {
    expect(validateIPCMessage(makeHeartbeat({ extra: 'data', seq: 5 }))).toBe(true);
  });

  it('rejects a heartbeat with a missing id', () => {
    const msg = makeHeartbeat();
    delete msg['id'];
    expect(validateIPCMessage(msg)).toBe(false);
  });

  it('rejects a heartbeat with an empty id', () => {
    expect(validateIPCMessage(makeHeartbeat({ id: '' }))).toBe(false);
  });
});
