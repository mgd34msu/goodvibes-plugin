/**
 * Tests for subagent-start Phase 6 behaviors
 *
 * Covers the three new behaviors added to the SubagentStart / SubagentStop
 * hooks via pure helper functions in subagent-start/wrfc-utils.ts:
 *
 *   1. extractWorkflowId  - WRFC regex extraction
 *   2. normalizeAgentFields - field normalization (agent_id ?? subagent_id, etc.)
 *   3. mergeSystemMessages  - runtime + hook system message merge
 */

import { describe, it, expect } from 'vitest';

import {
  extractWorkflowId,
  normalizeAgentFields,
  mergeSystemMessages,
} from '../subagent-start/wrfc-utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. extractWorkflowId
// ─────────────────────────────────────────────────────────────────────────────

describe('extractWorkflowId', () => {
  describe('successful extraction', () => {
    it('extracts a simple alphanumeric workflow id', () => {
      expect(extractWorkflowId('Review code [WRFC:wrfc_abc123] for quality')).toBe('wrfc_abc123');
    });

    it('extracts a short workflow id', () => {
      expect(extractWorkflowId('Fix issues [WRFC:wf_456]')).toBe('wf_456');
    });

    it('extracts an id containing dashes, underscores, and dots', () => {
      expect(
        extractWorkflowId('[WRFC:with-dashes_and_underscores.123]')
      ).toBe('with-dashes_and_underscores.123');
    });

    it('extracts the first match when multiple WRFC tags are present', () => {
      expect(
        extractWorkflowId('Multiple [WRFC:first] and [WRFC:second]')
      ).toBe('first');
    });

    it('handles a tag at the very start of the string', () => {
      expect(extractWorkflowId('[WRFC:start_id] rest of description')).toBe('start_id');
    });

    it('handles a tag at the very end of the string', () => {
      expect(extractWorkflowId('description at the end [WRFC:end_id]')).toBe('end_id');
    });

    it('extracts id when the tag is the entire string', () => {
      expect(extractWorkflowId('[WRFC:solo_id]')).toBe('solo_id');
    });

    it('extracts id containing numeric characters only', () => {
      expect(extractWorkflowId('[WRFC:123456]')).toBe('123456');
    });
  });

  describe('no match cases', () => {
    it('returns null when there is no WRFC tag', () => {
      expect(extractWorkflowId('No WRFC tag here')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(extractWorkflowId('')).toBeNull();
    });

    it('returns null for [WRFC:] with empty id (+ quantifier requires 1+ chars)', () => {
      expect(extractWorkflowId('[WRFC:]')).toBeNull();
    });

    it('returns null when the closing bracket is missing', () => {
      // [WRFC:no_close never terminates the capture group
      expect(extractWorkflowId('[WRFC:no_close')).toBeNull();
    });

    it('returns null when only the prefix is present without brackets', () => {
      expect(extractWorkflowId('WRFC:bare_id')).toBeNull();
    });

    it('returns null when case does not match (regex is case-sensitive)', () => {
      expect(extractWorkflowId('[wrfc:lowercase_id]')).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. normalizeAgentFields
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeAgentFields', () => {
  describe('agent_id normalization', () => {
    it('uses agent_id when only agent_id is provided', () => {
      const result = normalizeAgentFields({ agent_id: 'agent-primary' });
      expect(result.agent_id).toBe('agent-primary');
    });

    it('uses subagent_id as fallback when agent_id is absent', () => {
      const result = normalizeAgentFields({ subagent_id: 'subagent-fallback' });
      expect(result.agent_id).toBe('subagent-fallback');
    });

    it('prefers agent_id over subagent_id when both are present', () => {
      const result = normalizeAgentFields({
        agent_id: 'primary',
        subagent_id: 'secondary',
      });
      expect(result.agent_id).toBe('primary');
    });

    it('returns undefined for agent_id when neither field is provided', () => {
      const result = normalizeAgentFields({});
      expect(result.agent_id).toBeUndefined();
    });
  });

  describe('agent_type normalization', () => {
    it('uses agent_type when only agent_type is provided', () => {
      const result = normalizeAgentFields({ agent_type: 'goodvibes:engineer' });
      expect(result.agent_type).toBe('goodvibes:engineer');
    });

    it('uses subagent_type as fallback when agent_type is absent', () => {
      const result = normalizeAgentFields({ subagent_type: 'goodvibes:tester' });
      expect(result.agent_type).toBe('goodvibes:tester');
    });

    it('prefers agent_type over subagent_type when both are present', () => {
      const result = normalizeAgentFields({
        agent_type: 'goodvibes:reviewer',
        subagent_type: 'unknown',
      });
      expect(result.agent_type).toBe('goodvibes:reviewer');
    });

    it('returns undefined for agent_type when neither field is provided', () => {
      const result = normalizeAgentFields({});
      expect(result.agent_type).toBeUndefined();
    });
  });

  describe('combined field normalization', () => {
    it('normalizes both fields independently when all four are provided', () => {
      const result = normalizeAgentFields({
        agent_id: 'id-primary',
        subagent_id: 'id-fallback',
        agent_type: 'type-primary',
        subagent_type: 'type-fallback',
      });
      expect(result.agent_id).toBe('id-primary');
      expect(result.agent_type).toBe('type-primary');
    });

    it('uses fallback for both when primary fields are absent', () => {
      const result = normalizeAgentFields({
        subagent_id: 'sub-id',
        subagent_type: 'sub-type',
      });
      expect(result.agent_id).toBe('sub-id');
      expect(result.agent_type).toBe('sub-type');
    });

    it('returns both as undefined for completely empty input', () => {
      const result = normalizeAgentFields({});
      expect(result.agent_id).toBeUndefined();
      expect(result.agent_type).toBeUndefined();
    });

    it('does not include unexpected keys in the result', () => {
      const result = normalizeAgentFields({ agent_id: 'x', agent_type: 'y' });
      expect(Object.keys(result)).toEqual(['agent_id', 'agent_type']);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. mergeSystemMessages
// ─────────────────────────────────────────────────────────────────────────────

describe('mergeSystemMessages', () => {
  describe('both messages present', () => {
    it('concatenates runtime and hook messages with double newline separator', () => {
      expect(mergeSystemMessages('runtime', 'hook')).toBe('runtime\n\nhook');
    });

    it('preserves content of both messages verbatim', () => {
      const runtime = '[Runtime] You are a GoodVibes agent.';
      const hook = '[GoodVibes] Agent goodvibes:engineer starting. Project: my-app';
      expect(mergeSystemMessages(runtime, hook)).toBe(`${runtime}\n\n${hook}`);
    });

    it('handles multi-line runtime message', () => {
      const runtime = 'Line 1\nLine 2';
      const hook = 'hook message';
      expect(mergeSystemMessages(runtime, hook)).toBe('Line 1\nLine 2\n\nhook message');
    });

    it('handles multi-line hook message', () => {
      const runtime = 'runtime message';
      const hook = 'Hook Line 1\nHook Line 2';
      expect(mergeSystemMessages(runtime, hook)).toBe('runtime message\n\nHook Line 1\nHook Line 2');
    });
  });

  describe('runtime message only', () => {
    it('returns runtime message as-is when hook message is undefined', () => {
      expect(mergeSystemMessages('runtime only', undefined)).toBe('runtime only');
    });

    it('returns runtime message as-is when hook message is empty string (falsy)', () => {
      // empty string is falsy; behaves like hook-only absent branch
      // runtime is truthy, hook is falsy -> returns runtime alone
      expect(mergeSystemMessages('runtime only', '')).toBe('runtime only');
    });
  });

  describe('hook message only', () => {
    it('returns hook message when runtime message is undefined', () => {
      expect(mergeSystemMessages(undefined, 'hook only')).toBe('hook only');
    });

    it('returns hook message when runtime message is empty string (falsy)', () => {
      // empty string is falsy; falls through to hookMessage
      expect(mergeSystemMessages('', 'hook only')).toBe('hook only');
    });
  });

  describe('neither message present', () => {
    it('returns undefined when both are undefined', () => {
      expect(mergeSystemMessages(undefined, undefined)).toBeUndefined();
    });

    it('returns undefined when both are empty strings (falsy)', () => {
      // both falsy: runtimeMessage ('') is falsy -> returns hookMessage ('') which is falsy
      // the function returns '' here, which is falsy but not undefined
      expect(mergeSystemMessages('', '')).toBe('');
    });

    it('returns undefined when runtime is undefined and hook is undefined', () => {
      const result = mergeSystemMessages(undefined, undefined);
      expect(result).toBeUndefined();
    });
  });
});
