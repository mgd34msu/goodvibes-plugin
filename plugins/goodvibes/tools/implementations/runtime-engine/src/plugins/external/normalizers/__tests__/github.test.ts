/**
 * Tests for normalizeGithub()
 *
 * Covers: GitHub event types, action extraction, field normalization,
 * header handling, missing fields, malformed payloads.
 */

import { describe, it, expect, vi } from 'vitest';
import { normalizeGithub } from '../github.js';

vi.mock('../../../../extensions/events/factories.js', () => ({
  createExternalEvent: vi.fn((opts: Record<string, unknown>) => ({
    id: 'test-id',
    timestamp: '2025-01-01T00:00:00.000Z',
    type: opts['type'],
    source: { kind: 'external', external_source: 'github' },
    external_source: opts['external_source'],
    raw_payload: opts['raw_payload'],
    payload: opts['payload'],
    normalized: opts['normalized'],
    priority: 50,
    context: {},
  })),
}));

describe('normalizeGithub()', () => {
  // ─── External source ────────────────────────────────────────────────────────

  describe('external_source', () => {
    it('always sets external_source to "github"', () => {
      const result = normalizeGithub({});
      expect(result.external_source).toBe('github');
    });

    it('sets normalized to true', () => {
      const result = normalizeGithub({});
      expect(result.normalized).toBe(true);
    });
  });

  // ─── Event type from header ──────────────────────────────────────────────────

  describe('event type resolution', () => {
    it('uses "unknown" when x-github-event header is missing', () => {
      const result = normalizeGithub({}, {});
      expect(result.type).toBe('webhook:github:unknown');
    });

    it('uses "unknown" when no headers provided', () => {
      const result = normalizeGithub({});
      expect(result.type).toBe('webhook:github:unknown');
    });

    it('uses x-github-event header value as event base', () => {
      const result = normalizeGithub({}, { 'x-github-event': 'push' });
      expect(result.type).toBe('webhook:github:push');
    });

    it('appends action when present in payload', () => {
      const result = normalizeGithub(
        { action: 'opened' },
        { 'x-github-event': 'pull_request' },
      );
      expect(result.type).toBe('webhook:github:pull_request:opened');
    });

    it('does not append action when action is missing', () => {
      const result = normalizeGithub({}, { 'x-github-event': 'push' });
      expect(result.type).toBe('webhook:github:push');
    });

    it('sanitizes action with special characters', () => {
      const result = normalizeGithub(
        { action: 're-opened' },
        { 'x-github-event': 'issue' },
      );
      expect(result.type).toBe('webhook:github:issue:re_opened');
    });

    it('lowercases sanitized action', () => {
      const result = normalizeGithub(
        { action: 'Opened' },
        { 'x-github-event': 'pull_request' },
      );
      expect(result.type).toBe('webhook:github:pull_request:opened');
    });

    it('ignores non-string action field', () => {
      const result = normalizeGithub(
        { action: 42 },
        { 'x-github-event': 'push' },
      );
      expect(result.type).toBe('webhook:github:push');
    });

    it('ignores empty string action field', () => {
      const result = normalizeGithub(
        { action: '' },
        { 'x-github-event': 'push' },
      );
      expect(result.type).toBe('webhook:github:push');
    });
  });

  // ─── Payload: push event ─────────────────────────────────────────────────────

  describe('push event fields', () => {
    it('includes ref field when present', () => {
      const result = normalizeGithub(
        { ref: 'refs/heads/main' },
        { 'x-github-event': 'push' },
      );
      expect(result.payload).toMatchObject({ ref: 'refs/heads/main' });
    });

    it('includes commit_count when commits array is present', () => {
      const result = normalizeGithub(
        { commits: [{ id: 'abc' }, { id: 'def' }] },
        { 'x-github-event': 'push' },
      );
      expect(result.payload).toMatchObject({ commit_count: 2 });
    });

    it('does not include commit_count when commits is not an array', () => {
      const result = normalizeGithub(
        { commits: 'not-array' },
        { 'x-github-event': 'push' },
      );
      expect(result.payload).not.toHaveProperty('commit_count');
    });

    it('includes head_commit id and message when present', () => {
      const result = normalizeGithub(
        { head_commit: { id: 'abc123', message: 'fix: bug' } },
        { 'x-github-event': 'push' },
      );
      expect(result.payload).toMatchObject({
        head_commit: { id: 'abc123', message: 'fix: bug' },
      });
    });

    it('excludes head_commit when not present', () => {
      const result = normalizeGithub({}, { 'x-github-event': 'push' });
      expect(result.payload).not.toHaveProperty('head_commit');
    });

    it('excludes ref when not present', () => {
      const result = normalizeGithub({}, { 'x-github-event': 'push' });
      expect(result.payload).not.toHaveProperty('ref');
    });
  });

  // ─── Payload: PR event ────────────────────────────────────────────────────────

  describe('pull_request event fields', () => {
    it('includes pull_request fields when present', () => {
      const result = normalizeGithub(
        {
          action: 'opened',
          pull_request: {
            number: 42,
            title: 'Add feature',
            state: 'open',
            html_url: 'https://github.com/owner/repo/pull/42',
          },
        },
        { 'x-github-event': 'pull_request' },
      );
      expect(result.payload).toMatchObject({
        pull_request: {
          number: 42,
          title: 'Add feature',
          state: 'open',
          html_url: 'https://github.com/owner/repo/pull/42',
        },
      });
    });

    it('excludes pull_request when not present', () => {
      const result = normalizeGithub({}, { 'x-github-event': 'push' });
      expect(result.payload).not.toHaveProperty('pull_request');
    });

    it('handles partial pull_request object', () => {
      const result = normalizeGithub(
        { pull_request: { number: 1 } },
        { 'x-github-event': 'pull_request' },
      );
      expect(result.payload).toMatchObject({
        pull_request: { number: 1 },
      });
    });
  });

  // ─── Payload: repository and sender ──────────────────────────────────────────

  describe('repository and sender fields', () => {
    it('includes repository when present', () => {
      const result = normalizeGithub(
        {
          repository: {
            full_name: 'owner/repo',
            name: 'repo',
            html_url: 'https://github.com/owner/repo',
          },
        },
        { 'x-github-event': 'push' },
      );
      expect(result.payload).toMatchObject({
        repository: {
          full_name: 'owner/repo',
          name: 'repo',
          html_url: 'https://github.com/owner/repo',
        },
      });
    });

    it('excludes repository when not present', () => {
      const result = normalizeGithub({}, { 'x-github-event': 'push' });
      expect(result.payload).not.toHaveProperty('repository');
    });

    it('includes sender when present', () => {
      const result = normalizeGithub(
        { sender: { login: 'octocat', type: 'User' } },
        { 'x-github-event': 'push' },
      );
      expect(result.payload).toMatchObject({
        sender: { login: 'octocat', type: 'User' },
      });
    });

    it('excludes sender when not present', () => {
      const result = normalizeGithub({}, { 'x-github-event': 'push' });
      expect(result.payload).not.toHaveProperty('sender');
    });
  });

  // ─── Delivery ID ──────────────────────────────────────────────────────────────

  describe('delivery_id from header', () => {
    it('includes delivery_id when x-github-delivery header present', () => {
      const result = normalizeGithub(
        {},
        { 'x-github-event': 'push', 'x-github-delivery': 'abc-123' },
      );
      expect(result.payload).toMatchObject({ delivery_id: 'abc-123' });
    });

    it('excludes delivery_id when x-github-delivery header is missing', () => {
      const result = normalizeGithub({}, { 'x-github-event': 'push' });
      expect(result.payload).not.toHaveProperty('delivery_id');
    });
  });

  // ─── event field in normalized payload ───────────────────────────────────────

  describe('normalized payload event field', () => {
    it('includes event field set to the github event name', () => {
      const result = normalizeGithub({}, { 'x-github-event': 'push' });
      expect(result.payload).toMatchObject({ event: 'push' });
    });

    it('includes action in payload when action is present', () => {
      const result = normalizeGithub(
        { action: 'opened' },
        { 'x-github-event': 'pull_request' },
      );
      expect(result.payload).toMatchObject({ action: 'opened' });
    });

    it('excludes action from payload when action is missing', () => {
      const result = normalizeGithub({}, { 'x-github-event': 'push' });
      expect(result.payload).not.toHaveProperty('action');
    });
  });

  // ─── Malformed / non-object payloads ─────────────────────────────────────────

  describe('malformed payloads', () => {
    it('handles null payload gracefully', () => {
      const result = normalizeGithub(null, { 'x-github-event': 'push' });
      expect(result.type).toBe('webhook:github:push');
      expect(result.raw_payload).toBeNull();
    });

    it('handles string payload gracefully', () => {
      const result = normalizeGithub('raw-string', { 'x-github-event': 'push' });
      expect(result.type).toBe('webhook:github:push');
    });

    it('handles number payload gracefully', () => {
      const result = normalizeGithub(42, { 'x-github-event': 'push' });
      expect(result.type).toBe('webhook:github:push');
    });

    it('handles array payload gracefully', () => {
      expect(() => normalizeGithub([1, 2], { 'x-github-event': 'push' })).not.toThrow();
    });

    it('stores raw payload unmodified', () => {
      const raw = { action: 'opened', extra: true };
      const result = normalizeGithub(raw, { 'x-github-event': 'pull_request' });
      expect(result.raw_payload).toBe(raw);
    });
  });

  // ─── Complex combined scenario ────────────────────────────────────────────────

  describe('full PR webhook scenario', () => {
    it('correctly normalizes a full PR opened payload', () => {
      const payload = {
        action: 'opened',
        pull_request: { number: 7, title: 'feat: new thing', state: 'open', html_url: 'https://github.com/o/r/pull/7' },
        repository: { full_name: 'o/r', name: 'r', html_url: 'https://github.com/o/r' },
        sender: { login: 'dev', type: 'User' },
      };
      const headers = {
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-uuid',
      };

      const result = normalizeGithub(payload, headers);

      expect(result.type).toBe('webhook:github:pull_request:opened');
      expect(result.external_source).toBe('github');
      expect(result.normalized).toBe(true);
      expect(result.payload).toMatchObject({
        event: 'pull_request',
        action: 'opened',
        delivery_id: 'delivery-uuid',
        pull_request: { number: 7, title: 'feat: new thing' },
        repository: { full_name: 'o/r' },
        sender: { login: 'dev' },
      });
    });
  });
});
