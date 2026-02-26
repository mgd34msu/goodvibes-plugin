/**
 * events.test.ts — Layer 2 Event Extension Tests
 *
 * Covers all 5 event types: HookEvent, TimeEvent, AgentEvent, HumanEvent, ExternalEvent.
 * Tests factory functions, type guards, source fields, priority defaults, optional fields,
 * and cross-type guard rejection.
 */

import { describe, it, expect } from 'vitest';
import { createHookEvent, isHookEvent } from '../events/hook-event.js';
import { createTimeEvent, isTimeEvent } from '../events/time-event.js';
import { createAgentEvent, isAgentEvent } from '../events/agent-event.js';
import { createHumanEvent, isHumanEvent } from '../events/human-event.js';
import { createExternalEvent, isExternalEvent } from '../events/external-event.js';
import type { HookType } from '../events/hook-event.js';
import type { TimeType } from '../events/time-event.js';
import type { RuntimeEvent } from '../../core/types.js';

// ─── Shared Minimal Trigger Fixture ──────────────────────────────────────────

/** Build a minimal RuntimeEvent-shaped object for type guard rejection tests. */
function makeMinimalEvent(overrides: Record<string, unknown>): RuntimeEvent {
  return {
    id: 'test-id',
    source: 'internal',
    type: 'test:event',
    payload: {},
    timestamp: Date.now(),
    priority: 0,
    ...overrides,
  };
}

// ─── HookEvent ────────────────────────────────────────────────────────────────

describe('HookEvent', () => {
  describe('createHookEvent', () => {
    it('sets source to "internal"', () => {
      const evt = createHookEvent({
        hook_type: 'PreToolUse',
        hook_input: { tool: 'bash' },
        session_id: 'sess-1',
      });
      expect(evt.source).toBe('internal');
    });

    it('sets hook_type and hook_input from params', () => {
      const hookInput = { tool: 'read', path: '/foo' };
      const evt = createHookEvent({
        hook_type: 'PostToolUse',
        hook_input: hookInput,
        session_id: 'sess-2',
      });
      expect(evt.hook_type).toBe('PostToolUse');
      expect(evt.hook_input).toEqual(hookInput);
    });

    it('sets session_id from params', () => {
      const evt = createHookEvent({
        hook_type: 'SessionStart',
        hook_input: {},
        session_id: 'my-session',
      });
      expect(evt.session_id).toBe('my-session');
    });

    it('defaults priority to 50', () => {
      const evt = createHookEvent({
        hook_type: 'SessionEnd',
        hook_input: {},
        session_id: 's1',
      });
      expect(evt.priority).toBe(50);
    });

    it('respects custom priority', () => {
      const evt = createHookEvent({
        hook_type: 'SubagentStop',
        hook_input: {},
        session_id: 's1',
        priority: 99,
      });
      expect(evt.priority).toBe(99);
    });

    it('uses hook_input as default payload when no payload provided', () => {
      const hookInput = { data: 42 };
      const evt = createHookEvent({
        hook_type: 'Notification',
        hook_input: hookInput,
        session_id: 's1',
      });
      expect(evt.payload).toEqual(hookInput);
    });

    it('uses explicit payload over hook_input', () => {
      const evt = createHookEvent({
        hook_type: 'Stop',
        hook_input: { raw: true },
        session_id: 's1',
        payload: { custom: 'payload' },
      });
      expect(evt.payload).toEqual({ custom: 'payload' });
    });

    it('generates an id string', () => {
      const evt = createHookEvent({
        hook_type: 'PreToolUse',
        hook_input: {},
        session_id: 's1',
      });
      expect(typeof evt.id).toBe('string');
      expect(evt.id.length).toBeGreaterThan(0);
    });

    it('generates a numeric timestamp', () => {
      const before = Date.now();
      const evt = createHookEvent({
        hook_type: 'PreToolUse',
        hook_input: {},
        session_id: 's1',
      });
      const after = Date.now();
      expect(evt.timestamp).toBeGreaterThanOrEqual(before);
      expect(evt.timestamp).toBeLessThanOrEqual(after);
    });

    it('attaches context when provided', () => {
      const ctx = { workflow_id: 'wf-1', chain_depth: 2 };
      const evt = createHookEvent({
        hook_type: 'UserPromptSubmit',
        hook_input: {},
        session_id: 's1',
        context: ctx,
      });
      expect(evt.context).toEqual(ctx);
    });

    describe('default type strings via hookTypeToSlug', () => {
      const cases: Array<[HookType, string]> = [
        ['PreToolUse', 'hook:pre_tool_use'],
        ['PostToolUse', 'hook:post_tool_use'],
        ['PostToolUseFailure', 'hook:post_tool_use_failure'],
        ['SubagentStart', 'hook:subagent_start'],
        ['SubagentStop', 'hook:subagent_stop'],
        ['SessionStart', 'hook:session_start'],
        ['SessionEnd', 'hook:session_end'],
        ['PreCompact', 'hook:pre_compact'],
        ['UserPromptSubmit', 'hook:user_prompt_submit'],
        ['Notification', 'hook:notification'],
        ['Stop', 'hook:stop'],
      ];

      it.each(cases)('%s → "%s"', (hookType, expectedType) => {
        const evt = createHookEvent({
          hook_type: hookType,
          hook_input: {},
          session_id: 'sess',
        });
        expect(evt.type).toBe(expectedType);
      });
    });

    it('allows overriding the default type string', () => {
      const evt = createHookEvent({
        hook_type: 'PreToolUse',
        hook_input: {},
        session_id: 's1',
        type: 'custom:hook:type',
      });
      expect(evt.type).toBe('custom:hook:type');
    });
  });

  describe('isHookEvent', () => {
    it('returns true for a valid HookEvent', () => {
      const evt = createHookEvent({
        hook_type: 'PreToolUse',
        hook_input: { tool: 'bash' },
        session_id: 's1',
      });
      expect(isHookEvent(evt)).toBe(true);
    });

    it('returns false when source is not "internal"', () => {
      const evt = makeMinimalEvent({ source: 'agent', hook_type: 'PreToolUse', hook_input: {} });
      expect(isHookEvent(evt)).toBe(false);
    });

    it('returns false when hook_type field is missing', () => {
      const evt = makeMinimalEvent({ source: 'internal' });
      expect(isHookEvent(evt)).toBe(false);
    });

    it('returns false when hook_input field is missing', () => {
      const evt = makeMinimalEvent({ source: 'internal', hook_type: 'PreToolUse' });
      expect(isHookEvent(evt)).toBe(false);
    });

    it('returns false for TimeEvent', () => {
      const evt = createTimeEvent({ time_type: 'heartbeat' });
      expect(isHookEvent(evt)).toBe(false);
    });

    it('returns false for AgentEvent', () => {
      const evt = createAgentEvent({ agent_id: 'a1', agent_type: 'engineer', type: 'agent:done' });
      expect(isHookEvent(evt)).toBe(false);
    });

    it('returns false for HumanEvent', () => {
      const evt = createHumanEvent({ type: 'human:prompt' });
      expect(isHookEvent(evt)).toBe(false);
    });

    it('returns false for ExternalEvent', () => {
      const evt = createExternalEvent({ external_source: 'github', type: 'webhook:github:push', raw_payload: {} });
      expect(isHookEvent(evt)).toBe(false);
    });
  });
});

// ─── TimeEvent ────────────────────────────────────────────────────────────────

describe('TimeEvent', () => {
  describe('createTimeEvent', () => {
    it('sets source to "time"', () => {
      const evt = createTimeEvent({ time_type: 'heartbeat' });
      expect(evt.source).toBe('time');
    });

    it('sets time_type from params', () => {
      const evt = createTimeEvent({ time_type: 'cron' });
      expect(evt.time_type).toBe('cron');
    });

    it('defaults priority to 10', () => {
      const evt = createTimeEvent({ time_type: 'heartbeat' });
      expect(evt.priority).toBe(10);
    });

    it('respects custom priority', () => {
      const evt = createTimeEvent({ time_type: 'one_shot', priority: 5 });
      expect(evt.priority).toBe(5);
    });

    it('generates an id and numeric timestamp', () => {
      const evt = createTimeEvent({ time_type: 'scheduled' });
      expect(typeof evt.id).toBe('string');
      expect(typeof evt.timestamp).toBe('number');
    });

    describe('default type strings via defaultTimeEventType', () => {
      const cases: Array<[TimeType, string]> = [
        ['heartbeat', 'tick:heartbeat'],
        ['cron', 'cron:tick'],
        ['scheduled', 'schedule:tick'],
        ['one_shot', 'schedule:one_shot'],
      ];

      it.each(cases)('%s → "%s"', (timeType, expectedType) => {
        const evt = createTimeEvent({ time_type: timeType });
        expect(evt.type).toBe(expectedType);
      });
    });

    it('allows overriding the default type string', () => {
      const evt = createTimeEvent({ time_type: 'heartbeat', type: 'custom:tick' });
      expect(evt.type).toBe('custom:tick');
    });

    it('sets interval_ms when provided', () => {
      const evt = createTimeEvent({ time_type: 'heartbeat', interval_ms: 5000 });
      expect(evt.interval_ms).toBe(5000);
    });

    it('does not set interval_ms when not provided', () => {
      const evt = createTimeEvent({ time_type: 'heartbeat' });
      expect('interval_ms' in evt).toBe(false);
    });

    it('sets schedule when provided', () => {
      const evt = createTimeEvent({ time_type: 'cron', schedule: '0 9 * * 1-5' });
      expect(evt.schedule).toBe('0 9 * * 1-5');
    });

    it('does not set schedule when not provided', () => {
      const evt = createTimeEvent({ time_type: 'cron' });
      expect('schedule' in evt).toBe(false);
    });

    it('sets ttl when provided', () => {
      const evt = createTimeEvent({ time_type: 'one_shot', ttl: 3 });
      expect(evt.ttl).toBe(3);
    });

    it('does not set ttl when not provided', () => {
      const evt = createTimeEvent({ time_type: 'one_shot' });
      expect('ttl' in evt).toBe(false);
    });

    it('sets fires_remaining when provided', () => {
      const evt = createTimeEvent({ time_type: 'cron', fires_remaining: 10 });
      expect(evt.fires_remaining).toBe(10);
    });

    it('does not set fires_remaining when not provided', () => {
      const evt = createTimeEvent({ time_type: 'cron' });
      expect('fires_remaining' in evt).toBe(false);
    });

    it('sets scheduled_at when provided', () => {
      const ts = 1700000000000;
      const evt = createTimeEvent({ time_type: 'scheduled', scheduled_at: ts });
      expect(evt.scheduled_at).toBe(ts);
    });

    it('does not set scheduled_at when not provided', () => {
      const evt = createTimeEvent({ time_type: 'scheduled' });
      expect('scheduled_at' in evt).toBe(false);
    });

    it('defaults payload to empty object when not provided', () => {
      const evt = createTimeEvent({ time_type: 'heartbeat' });
      expect(evt.payload).toEqual({});
    });

    it('uses custom payload when provided', () => {
      const evt = createTimeEvent({ time_type: 'heartbeat', payload: { tick: 1 } });
      expect(evt.payload).toEqual({ tick: 1 });
    });

    it('attaches context when provided', () => {
      const ctx = { workflow_id: 'wf-2' };
      const evt = createTimeEvent({ time_type: 'heartbeat', context: ctx });
      expect(evt.context).toEqual(ctx);
    });
  });

  describe('isTimeEvent', () => {
    it('returns true for a valid TimeEvent', () => {
      const evt = createTimeEvent({ time_type: 'cron' });
      expect(isTimeEvent(evt)).toBe(true);
    });

    it('returns false when source is not "time"', () => {
      const evt = makeMinimalEvent({ source: 'internal', time_type: 'heartbeat' });
      expect(isTimeEvent(evt)).toBe(false);
    });

    it('returns false when time_type field is missing', () => {
      const evt = makeMinimalEvent({ source: 'time' });
      expect(isTimeEvent(evt)).toBe(false);
    });

    it('returns false for HookEvent', () => {
      const evt = createHookEvent({ hook_type: 'PreToolUse', hook_input: {}, session_id: 's1' });
      expect(isTimeEvent(evt)).toBe(false);
    });

    it('returns false for AgentEvent', () => {
      const evt = createAgentEvent({ agent_id: 'a1', agent_type: 'engineer', type: 'agent:done' });
      expect(isTimeEvent(evt)).toBe(false);
    });

    it('returns false for HumanEvent', () => {
      const evt = createHumanEvent({ type: 'human:prompt' });
      expect(isTimeEvent(evt)).toBe(false);
    });

    it('returns false for ExternalEvent', () => {
      const evt = createExternalEvent({ external_source: 'github', type: 'webhook:github:push', raw_payload: {} });
      expect(isTimeEvent(evt)).toBe(false);
    });
  });
});

// ─── AgentEvent ───────────────────────────────────────────────────────────────

describe('AgentEvent', () => {
  describe('createAgentEvent', () => {
    it('sets source to "agent"', () => {
      const evt = createAgentEvent({ agent_id: 'a1', agent_type: 'engineer', type: 'agent:completed' });
      expect(evt.source).toBe('agent');
    });

    it('sets agent_id and agent_type from params', () => {
      const evt = createAgentEvent({ agent_id: 'agent-xyz', agent_type: 'goodvibes:reviewer', type: 'agent:spawned' });
      expect(evt.agent_id).toBe('agent-xyz');
      expect(evt.agent_type).toBe('goodvibes:reviewer');
    });

    it('sets type from params', () => {
      const evt = createAgentEvent({ agent_id: 'a1', agent_type: 'tester', type: 'agent:blocked' });
      expect(evt.type).toBe('agent:blocked');
    });

    it('defaults priority to 60', () => {
      const evt = createAgentEvent({ agent_id: 'a1', agent_type: 'tester', type: 'agent:done' });
      expect(evt.priority).toBe(60);
    });

    it('respects custom priority', () => {
      const evt = createAgentEvent({ agent_id: 'a1', agent_type: 'tester', type: 'agent:done', priority: 80 });
      expect(evt.priority).toBe(80);
    });

    it('defaults payload to { agent_id, agent_type } when not provided', () => {
      const evt = createAgentEvent({ agent_id: 'a1', agent_type: 'engineer', type: 'agent:done' });
      expect(evt.payload).toEqual({ agent_id: 'a1', agent_type: 'engineer' });
    });

    it('uses custom payload when provided', () => {
      const evt = createAgentEvent({
        agent_id: 'a1',
        agent_type: 'engineer',
        type: 'agent:done',
        payload: { output: 'done' },
      });
      expect(evt.payload).toEqual({ output: 'done' });
    });

    it('sets result when provided', () => {
      const evt = createAgentEvent({
        agent_id: 'a1',
        agent_type: 'engineer',
        type: 'agent:done',
        result: { files: ['foo.ts'] },
      });
      expect(evt.result).toEqual({ files: ['foo.ts'] });
    });

    it('does not set result when not provided', () => {
      const evt = createAgentEvent({ agent_id: 'a1', agent_type: 'engineer', type: 'agent:done' });
      expect('result' in evt).toBe(false);
    });

    it('sets score when provided', () => {
      const evt = createAgentEvent({ agent_id: 'a1', agent_type: 'reviewer', type: 'agent:reviewed', score: 8.5 });
      expect(evt.score).toBe(8.5);
    });

    it('does not set score when not provided', () => {
      const evt = createAgentEvent({ agent_id: 'a1', agent_type: 'reviewer', type: 'agent:reviewed' });
      expect('score' in evt).toBe(false);
    });

    it('sets artifacts when provided', () => {
      const files = ['src/foo.ts', 'src/bar.ts'];
      const evt = createAgentEvent({ agent_id: 'a1', agent_type: 'engineer', type: 'agent:done', artifacts: files });
      expect(evt.artifacts).toEqual(files);
    });

    it('does not set artifacts when not provided', () => {
      const evt = createAgentEvent({ agent_id: 'a1', agent_type: 'engineer', type: 'agent:done' });
      expect('artifacts' in evt).toBe(false);
    });

    it('attaches context when provided', () => {
      const ctx = { workflow_id: 'wf-3', chain_depth: 1 };
      const evt = createAgentEvent({
        agent_id: 'a1',
        agent_type: 'engineer',
        type: 'agent:done',
        context: ctx,
      });
      expect(evt.context).toEqual(ctx);
    });

    it('generates a unique id per call', () => {
      const e1 = createAgentEvent({ agent_id: 'a1', agent_type: 'eng', type: 'agent:done' });
      const e2 = createAgentEvent({ agent_id: 'a2', agent_type: 'eng', type: 'agent:done' });
      expect(e1.id).not.toBe(e2.id);
    });
  });

  describe('isAgentEvent', () => {
    it('returns true for a valid AgentEvent', () => {
      const evt = createAgentEvent({ agent_id: 'a1', agent_type: 'engineer', type: 'agent:done' });
      expect(isAgentEvent(evt)).toBe(true);
    });

    it('returns false when source is not "agent"', () => {
      const evt = makeMinimalEvent({ source: 'internal', agent_id: 'a1', agent_type: 'eng' });
      expect(isAgentEvent(evt)).toBe(false);
    });

    it('returns false when agent_id field is missing', () => {
      const evt = makeMinimalEvent({ source: 'agent', agent_type: 'eng' });
      expect(isAgentEvent(evt)).toBe(false);
    });

    it('returns false when agent_type field is missing', () => {
      const evt = makeMinimalEvent({ source: 'agent', agent_id: 'a1' });
      expect(isAgentEvent(evt)).toBe(false);
    });

    it('returns false for HookEvent', () => {
      const evt = createHookEvent({ hook_type: 'PreToolUse', hook_input: {}, session_id: 's1' });
      expect(isAgentEvent(evt)).toBe(false);
    });

    it('returns false for TimeEvent', () => {
      const evt = createTimeEvent({ time_type: 'heartbeat' });
      expect(isAgentEvent(evt)).toBe(false);
    });

    it('returns false for HumanEvent', () => {
      const evt = createHumanEvent({ type: 'human:prompt' });
      expect(isAgentEvent(evt)).toBe(false);
    });

    it('returns false for ExternalEvent', () => {
      const evt = createExternalEvent({ external_source: 'github', type: 'webhook:github:push', raw_payload: {} });
      expect(isAgentEvent(evt)).toBe(false);
    });
  });
});

// ─── HumanEvent ───────────────────────────────────────────────────────────────

describe('HumanEvent', () => {
  describe('createHumanEvent', () => {
    it('sets source to "human"', () => {
      const evt = createHumanEvent({ type: 'human:prompt' });
      expect(evt.source).toBe('human');
    });

    it('sets type from params', () => {
      const evt = createHumanEvent({ type: 'human:stop' });
      expect(evt.type).toBe('human:stop');
    });

    it('defaults priority to 100', () => {
      const evt = createHumanEvent({ type: 'human:prompt' });
      expect(evt.priority).toBe(100);
    });

    it('respects custom priority', () => {
      const evt = createHumanEvent({ type: 'human:prompt', priority: 50 });
      expect(evt.priority).toBe(50);
    });

    it('defaults payload to empty object when not provided', () => {
      const evt = createHumanEvent({ type: 'human:prompt' });
      expect(evt.payload).toEqual({});
    });

    it('uses custom payload when provided', () => {
      const evt = createHumanEvent({ type: 'human:prompt', payload: { text: 'hello' } });
      expect(evt.payload).toEqual({ text: 'hello' });
    });

    it('sets prompt when provided', () => {
      const evt = createHumanEvent({ type: 'human:prompt', prompt: 'do something' });
      expect(evt.prompt).toBe('do something');
    });

    it('does not set prompt when not provided', () => {
      const evt = createHumanEvent({ type: 'human:prompt' });
      expect('prompt' in evt).toBe(false);
    });

    it('sets command when provided', () => {
      const evt = createHumanEvent({ type: 'human:command', command: '/stop' });
      expect(evt.command).toBe('/stop');
    });

    it('does not set command when not provided', () => {
      const evt = createHumanEvent({ type: 'human:command' });
      expect('command' in evt).toBe(false);
    });

    it('sets approval to true when provided', () => {
      const evt = createHumanEvent({ type: 'human:approval', approval: true });
      expect(evt.approval).toBe(true);
    });

    it('sets approval to false when provided', () => {
      const evt = createHumanEvent({ type: 'human:approval', approval: false });
      expect(evt.approval).toBe(false);
    });

    it('does not set approval when not provided', () => {
      const evt = createHumanEvent({ type: 'human:approval' });
      expect('approval' in evt).toBe(false);
    });

    it('attaches context when provided', () => {
      const ctx = { workflow_id: 'wf-human', ref: 'cancel-me' };
      const evt = createHumanEvent({ type: 'human:prompt', context: ctx });
      expect(evt.context).toEqual(ctx);
    });

    it('generates a unique id per call', () => {
      const e1 = createHumanEvent({ type: 'human:prompt' });
      const e2 = createHumanEvent({ type: 'human:prompt' });
      expect(e1.id).not.toBe(e2.id);
    });
  });

  describe('isHumanEvent', () => {
    it('returns true for a valid HumanEvent', () => {
      const evt = createHumanEvent({ type: 'human:prompt' });
      expect(isHumanEvent(evt)).toBe(true);
    });

    it('returns true for HumanEvent with no optional fields (source check only)', () => {
      const evt = makeMinimalEvent({ source: 'human' });
      expect(isHumanEvent(evt)).toBe(true);
    });

    it('returns false when source is not "human"', () => {
      const evt = makeMinimalEvent({ source: 'internal' });
      expect(isHumanEvent(evt)).toBe(false);
    });

    it('returns false for HookEvent', () => {
      const evt = createHookEvent({ hook_type: 'PreToolUse', hook_input: {}, session_id: 's1' });
      expect(isHumanEvent(evt)).toBe(false);
    });

    it('returns false for TimeEvent', () => {
      const evt = createTimeEvent({ time_type: 'heartbeat' });
      expect(isHumanEvent(evt)).toBe(false);
    });

    it('returns false for AgentEvent', () => {
      const evt = createAgentEvent({ agent_id: 'a1', agent_type: 'engineer', type: 'agent:done' });
      expect(isHumanEvent(evt)).toBe(false);
    });

    it('returns false for ExternalEvent', () => {
      const evt = createExternalEvent({ external_source: 'github', type: 'webhook:github:push', raw_payload: {} });
      expect(isHumanEvent(evt)).toBe(false);
    });
  });
});

// ─── ExternalEvent ────────────────────────────────────────────────────────────

describe('ExternalEvent', () => {
  describe('createExternalEvent', () => {
    it('sets source to "external"', () => {
      const evt = createExternalEvent({ external_source: 'github', type: 'webhook:github:push', raw_payload: {} });
      expect(evt.source).toBe('external');
    });

    it('sets external_source from params', () => {
      const evt = createExternalEvent({ external_source: 'stripe', type: 'webhook:stripe:payment', raw_payload: {} });
      expect(evt.external_source).toBe('stripe');
    });

    it('sets type from params', () => {
      const evt = createExternalEvent({ external_source: 'slack', type: 'webhook:slack:message', raw_payload: {} });
      expect(evt.type).toBe('webhook:slack:message');
    });

    it('sets raw_payload from params', () => {
      const raw = { action: 'opened', number: 42 };
      const evt = createExternalEvent({ external_source: 'github', type: 'webhook:github:pr', raw_payload: raw });
      expect(evt.raw_payload).toEqual(raw);
    });

    it('defaults normalized to false', () => {
      const evt = createExternalEvent({ external_source: 'github', type: 'webhook:github:push', raw_payload: {} });
      expect(evt.normalized).toBe(false);
    });

    it('sets normalized to true when provided', () => {
      const evt = createExternalEvent({
        external_source: 'github',
        type: 'webhook:github:push',
        raw_payload: {},
        normalized: true,
      });
      expect(evt.normalized).toBe(true);
    });

    it('defaults priority to 30', () => {
      const evt = createExternalEvent({ external_source: 'ci', type: 'webhook:ci:build', raw_payload: {} });
      expect(evt.priority).toBe(30);
    });

    it('respects custom priority', () => {
      const evt = createExternalEvent({
        external_source: 'ci',
        type: 'webhook:ci:build',
        raw_payload: {},
        priority: 15,
      });
      expect(evt.priority).toBe(15);
    });

    it('uses raw_payload as default payload when no payload provided', () => {
      const raw = { event: 'push' };
      const evt = createExternalEvent({ external_source: 'github', type: 'webhook:github:push', raw_payload: raw });
      expect(evt.payload).toEqual(raw);
    });

    it('uses explicit payload over raw_payload when provided', () => {
      const evt = createExternalEvent({
        external_source: 'github',
        type: 'webhook:github:push',
        raw_payload: { raw: true },
        payload: { normalized: 'data' },
      });
      expect(evt.payload).toEqual({ normalized: 'data' });
    });

    it('attaches context when provided', () => {
      const ctx = { workflow_id: 'wf-ext' };
      const evt = createExternalEvent({
        external_source: 'github',
        type: 'webhook:github:push',
        raw_payload: {},
        context: ctx,
      });
      expect(evt.context).toEqual(ctx);
    });

    it('accepts null as raw_payload', () => {
      const evt = createExternalEvent({ external_source: 'ci', type: 'webhook:ci:done', raw_payload: null });
      expect(evt.raw_payload).toBeNull();
    });

    it('generates an id string', () => {
      const evt = createExternalEvent({ external_source: 'github', type: 'webhook:github:push', raw_payload: {} });
      expect(typeof evt.id).toBe('string');
      expect(evt.id.length).toBeGreaterThan(0);
    });
  });

  describe('isExternalEvent', () => {
    it('returns true for a valid ExternalEvent', () => {
      const evt = createExternalEvent({ external_source: 'github', type: 'webhook:github:push', raw_payload: {} });
      expect(isExternalEvent(evt)).toBe(true);
    });

    it('returns false when source is not "external"', () => {
      const evt = makeMinimalEvent({ source: 'agent' });
      expect(isExternalEvent(evt)).toBe(false);
    });

    it('returns false when external_source field is missing', () => {
      const evt = makeMinimalEvent({ source: 'external', raw_payload: {} });
      expect(isExternalEvent(evt)).toBe(false);
    });

    it('returns false when raw_payload field is missing', () => {
      const evt = makeMinimalEvent({ source: 'external', external_source: 'github' });
      expect(isExternalEvent(evt)).toBe(false);
    });

    it('returns false for HookEvent', () => {
      const evt = createHookEvent({ hook_type: 'PreToolUse', hook_input: {}, session_id: 's1' });
      expect(isExternalEvent(evt)).toBe(false);
    });

    it('returns false for TimeEvent', () => {
      const evt = createTimeEvent({ time_type: 'heartbeat' });
      expect(isExternalEvent(evt)).toBe(false);
    });

    it('returns false for AgentEvent', () => {
      const evt = createAgentEvent({ agent_id: 'a1', agent_type: 'engineer', type: 'agent:done' });
      expect(isExternalEvent(evt)).toBe(false);
    });

    it('returns false for HumanEvent', () => {
      const evt = createHumanEvent({ type: 'human:prompt' });
      expect(isExternalEvent(evt)).toBe(false);
    });
  });
});
