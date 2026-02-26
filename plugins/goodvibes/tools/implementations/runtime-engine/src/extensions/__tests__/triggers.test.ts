/**
 * triggers.test.ts — Layer 2 Trigger Extension Tests
 *
 * Covers all 3 trigger types: WRFCTrigger, CronTrigger, WebhookTrigger.
 * Tests factory functions, type guards, discriminant fields, optional extension
 * fields, base trigger defaults, and cross-type guard rejection.
 */

import { describe, it, expect } from 'vitest';
import { createWRFCTrigger, isWRFCTrigger } from '../triggers/wrfc-trigger.js';
import { createCronTrigger, isCronTrigger } from '../triggers/cron-trigger.js';
import { createWebhookTrigger, isWebhookTrigger } from '../triggers/webhook-trigger.js';
import type { Trigger } from '../../core/types.js';

// ─── Shared Test Fixtures ─────────────────────────────────────────────────────

/** Minimal required base trigger params shared by all factories. */
const BASE_PARAMS = {
  id: 'trigger-test',
  event_match: { type: 'agent:completed' },
  actions: [{ type: 'emit_event' as const, params: { type: 'wrfc:start' } }],
} satisfies Pick<Trigger, 'id' | 'event_match' | 'actions'>;

/** A plain Trigger object (no trigger_type) for guard rejection tests. */
const PLAIN_TRIGGER: Trigger = {
  id: 'plain',
  event_match: { type: 'test:event' },
  actions: [],
  enabled: true,
};

// ─── WRFCTrigger ──────────────────────────────────────────────────────────────

describe('WRFCTrigger', () => {
  describe('createWRFCTrigger', () => {
    it('sets trigger_type to "wrfc"', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS });
      expect(trigger.trigger_type).toBe('wrfc');
    });

    it('sets id from params', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS, id: 'my-wrfc-trigger' });
      expect(trigger.id).toBe('my-wrfc-trigger');
    });

    it('sets event_match from params', () => {
      const matcher = { type: 'agent:reviewed', source: 'agent' as const };
      const trigger = createWRFCTrigger({ ...BASE_PARAMS, event_match: matcher });
      expect(trigger.event_match).toEqual(matcher);
    });

    it('sets actions from params', () => {
      const actions = [{ type: 'spawn_agent' as const, params: { role: 'fixer' } }];
      const trigger = createWRFCTrigger({ ...BASE_PARAMS, actions });
      expect(trigger.actions).toEqual(actions);
    });

    it('defaults enabled to true', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS });
      expect(trigger.enabled).toBe(true);
    });

    it('respects enabled: false', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS, enabled: false });
      expect(trigger.enabled).toBe(false);
    });

    it('sets score_threshold when provided', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS, score_threshold: 7.5 });
      expect(trigger.score_threshold).toBe(7.5);
    });

    it('does not set score_threshold when not provided', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS });
      expect('score_threshold' in trigger).toBe(false);
    });

    it('sets max_fix_attempts when provided', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS, max_fix_attempts: 3 });
      expect(trigger.max_fix_attempts).toBe(3);
    });

    it('does not set max_fix_attempts when not provided', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS });
      expect('max_fix_attempts' in trigger).toBe(false);
    });

    it('sets workflow_state_filter when provided', () => {
      const filter = ['reviewing', 'fixing'];
      const trigger = createWRFCTrigger({ ...BASE_PARAMS, workflow_state_filter: filter });
      expect(trigger.workflow_state_filter).toEqual(filter);
    });

    it('does not set workflow_state_filter when not provided', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS });
      expect('workflow_state_filter' in trigger).toBe(false);
    });

    it('sets max_fires when provided', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS, max_fires: 5 });
      expect(trigger.max_fires).toBe(5);
    });

    it('sets cooldown_ms when provided', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS, cooldown_ms: 1000 });
      expect(trigger.cooldown_ms).toBe(1000);
    });

    it('sets chain_depth_limit when provided', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS, chain_depth_limit: 10 });
      expect(trigger.chain_depth_limit).toBe(10);
    });

    it('sets retry policy when provided', () => {
      const retry = { max_attempts: 3, backoff: 'exponential' as const, delay_ms: 500 };
      const trigger = createWRFCTrigger({ ...BASE_PARAMS, retry });
      expect(trigger.retry).toEqual(retry);
    });

    it('sets priority when provided', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS, priority: 100 });
      expect(trigger.priority).toBe(100);
    });

    it('sets all optional WRFC fields together', () => {
      const trigger = createWRFCTrigger({
        ...BASE_PARAMS,
        score_threshold: 8,
        max_fix_attempts: 2,
        workflow_state_filter: ['reviewing'],
      });
      expect(trigger.score_threshold).toBe(8);
      expect(trigger.max_fix_attempts).toBe(2);
      expect(trigger.workflow_state_filter).toEqual(['reviewing']);
    });

    it('sets conditions when provided', () => {
      const conditions = [{ field: 'session.phase', op: 'eq' as const, value: 'review' }];
      const trigger = createWRFCTrigger({ ...BASE_PARAMS, conditions });
      expect(trigger.conditions).toEqual(conditions);
    });

    it('throws RangeError for score_threshold -1 (below minimum)', () => {
      expect(() => createWRFCTrigger({ ...BASE_PARAMS, score_threshold: -1 })).toThrow(RangeError);
    });

    it('throws RangeError for score_threshold 11 (above maximum)', () => {
      expect(() => createWRFCTrigger({ ...BASE_PARAMS, score_threshold: 11 })).toThrow(RangeError);
    });

    it('does not throw for score_threshold 0 (boundary minimum)', () => {
      expect(() => createWRFCTrigger({ ...BASE_PARAMS, score_threshold: 0 })).not.toThrow();
    });

    it('does not throw for score_threshold 10 (boundary maximum)', () => {
      expect(() => createWRFCTrigger({ ...BASE_PARAMS, score_threshold: 10 })).not.toThrow();
    });
  });

  describe('isWRFCTrigger', () => {
    it('returns true for a valid WRFCTrigger', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS });
      expect(isWRFCTrigger(trigger)).toBe(true);
    });

    it('returns false for a plain Trigger without trigger_type', () => {
      expect(isWRFCTrigger(PLAIN_TRIGGER)).toBe(false);
    });

    it('returns false for CronTrigger', () => {
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '0 * * * *' });
      expect(isWRFCTrigger(trigger)).toBe(false);
    });

    it('returns false for WebhookTrigger', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS });
      expect(isWRFCTrigger(trigger)).toBe(false);
    });

    it('returns false when trigger_type is not "wrfc"', () => {
      const trigger = { ...PLAIN_TRIGGER, trigger_type: 'other' };
      expect(isWRFCTrigger(trigger as Trigger)).toBe(false);
    });
  });
});

// ─── CronTrigger ──────────────────────────────────────────────────────────────

describe('CronTrigger', () => {
  describe('createCronTrigger', () => {
    it('sets trigger_type to "cron"', () => {
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '0 9 * * 1-5' });
      expect(trigger.trigger_type).toBe('cron');
    });

    it('sets id from params', () => {
      const trigger = createCronTrigger({ ...BASE_PARAMS, id: 'my-cron', schedule: '0 * * * *' });
      expect(trigger.id).toBe('my-cron');
    });

    it('sets schedule (required) from params', () => {
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '*/5 * * * *' });
      expect(trigger.schedule).toBe('*/5 * * * *');
    });

    it('defaults enabled to true', () => {
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '0 * * * *' });
      expect(trigger.enabled).toBe(true);
    });

    it('respects enabled: false', () => {
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '0 * * * *', enabled: false });
      expect(trigger.enabled).toBe(false);
    });

    it('sets active_hours when provided', () => {
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '0 9 * * *', active_hours: '9am-5pm' });
      expect(trigger.active_hours).toBe('9am-5pm');
    });

    it('does not set active_hours when not provided', () => {
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '0 9 * * *' });
      expect('active_hours' in trigger).toBe(false);
    });

    it('sets timezone when provided', () => {
      const trigger = createCronTrigger({
        ...BASE_PARAMS,
        schedule: '0 9 * * *',
        timezone: 'America/New_York',
      });
      expect(trigger.timezone).toBe('America/New_York');
    });

    it('does not set timezone when not provided', () => {
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '0 9 * * *' });
      expect('timezone' in trigger).toBe(false);
    });

    it('sets active_hours and timezone together', () => {
      const trigger = createCronTrigger({
        ...BASE_PARAMS,
        schedule: '0 9 * * 1-5',
        active_hours: '9am-10pm',
        timezone: 'Europe/London',
      });
      expect(trigger.active_hours).toBe('9am-10pm');
      expect(trigger.timezone).toBe('Europe/London');
    });

    it('sets max_fires when provided', () => {
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '0 * * * *', max_fires: 100 });
      expect(trigger.max_fires).toBe(100);
    });

    it('sets cooldown_ms when provided', () => {
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '0 * * * *', cooldown_ms: 60000 });
      expect(trigger.cooldown_ms).toBe(60000);
    });

    it('sets chain_depth_limit when provided', () => {
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '0 * * * *', chain_depth_limit: 5 });
      expect(trigger.chain_depth_limit).toBe(5);
    });

    it('sets retry policy when provided', () => {
      const retry = { max_attempts: 2, backoff: 'fixed' as const, delay_ms: 1000 };
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '0 * * * *', retry });
      expect(trigger.retry).toEqual(retry);
    });

    it('sets conditions when provided', () => {
      const conditions = [{ field: 'system.healthy', op: 'eq' as const, value: true }];
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '0 * * * *', conditions });
      expect(trigger.conditions).toEqual(conditions);
    });

    it('sets priority when provided', () => {
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '0 * * * *', priority: 50 });
      expect(trigger.priority).toBe(50);
    });
  });

  describe('isCronTrigger', () => {
    it('returns true for a valid CronTrigger', () => {
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '0 * * * *' });
      expect(isCronTrigger(trigger)).toBe(true);
    });

    it('returns false for a plain Trigger without trigger_type', () => {
      expect(isCronTrigger(PLAIN_TRIGGER)).toBe(false);
    });

    it('returns false for WRFCTrigger', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS });
      expect(isCronTrigger(trigger)).toBe(false);
    });

    it('returns false for WebhookTrigger', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS });
      expect(isCronTrigger(trigger)).toBe(false);
    });

    it('returns false when trigger_type is not "cron"', () => {
      const trigger = { ...PLAIN_TRIGGER, trigger_type: 'wrfc' };
      expect(isCronTrigger(trigger as Trigger)).toBe(false);
    });
  });
});

// ─── WebhookTrigger ───────────────────────────────────────────────────────────

describe('WebhookTrigger', () => {
  describe('createWebhookTrigger', () => {
    it('sets trigger_type to "webhook"', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS });
      expect(trigger.trigger_type).toBe('webhook');
    });

    it('sets id from params', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS, id: 'my-webhook' });
      expect(trigger.id).toBe('my-webhook');
    });

    it('defaults enabled to true', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS });
      expect(trigger.enabled).toBe(true);
    });

    it('respects enabled: false', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS, enabled: false });
      expect(trigger.enabled).toBe(false);
    });

    it('sets url_pattern when provided', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS, url_pattern: '/webhooks/github' });
      expect(trigger.url_pattern).toBe('/webhooks/github');
    });

    it('does not set url_pattern when not provided', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS });
      expect('url_pattern' in trigger).toBe(false);
    });

    it('sets payload_schema when provided', () => {
      const schema = { type: 'object', properties: { action: { type: 'string' } } };
      const trigger = createWebhookTrigger({ ...BASE_PARAMS, payload_schema: schema });
      expect(trigger.payload_schema).toEqual(schema);
    });

    it('does not set payload_schema when not provided', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS });
      expect('payload_schema' in trigger).toBe(false);
    });

    it('sets normalize_with when provided', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS, normalize_with: 'github' });
      expect(trigger.normalize_with).toBe('github');
    });

    it('does not set normalize_with when not provided', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS });
      expect('normalize_with' in trigger).toBe(false);
    });

    it('sets all optional webhook fields together', () => {
      const schema = { type: 'object' };
      const trigger = createWebhookTrigger({
        ...BASE_PARAMS,
        url_pattern: '/webhooks/stripe',
        payload_schema: schema,
        normalize_with: 'generic',
      });
      expect(trigger.url_pattern).toBe('/webhooks/stripe');
      expect(trigger.payload_schema).toEqual(schema);
      expect(trigger.normalize_with).toBe('generic');
    });

    it('sets max_fires when provided', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS, max_fires: 1000 });
      expect(trigger.max_fires).toBe(1000);
    });

    it('sets cooldown_ms when provided', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS, cooldown_ms: 500 });
      expect(trigger.cooldown_ms).toBe(500);
    });

    it('sets chain_depth_limit when provided', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS, chain_depth_limit: 3 });
      expect(trigger.chain_depth_limit).toBe(3);
    });

    it('sets retry policy when provided', () => {
      const retry = { max_attempts: 5, backoff: 'exponential' as const, delay_ms: 2000 };
      const trigger = createWebhookTrigger({ ...BASE_PARAMS, retry });
      expect(trigger.retry).toEqual(retry);
    });

    it('sets actions correctly', () => {
      const actions = [
        { type: 'emit_event' as const, params: { type: 'webhook:received' } },
        { type: 'update_state' as const, params: { key: 'last_webhook', value: 'github' } },
      ];
      const trigger = createWebhookTrigger({ ...BASE_PARAMS, actions });
      expect(trigger.actions).toEqual(actions);
    });

    it('sets conditions when provided', () => {
      const conditions = [{ field: 'webhook.authenticated', op: 'eq' as const, value: true }];
      const trigger = createWebhookTrigger({ ...BASE_PARAMS, conditions });
      expect(trigger.conditions).toEqual(conditions);
    });

    it('sets priority when provided', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS, priority: 75 });
      expect(trigger.priority).toBe(75);
    });
  });

  describe('isWebhookTrigger', () => {
    it('returns true for a valid WebhookTrigger', () => {
      const trigger = createWebhookTrigger({ ...BASE_PARAMS });
      expect(isWebhookTrigger(trigger)).toBe(true);
    });

    it('returns false for a plain Trigger without trigger_type', () => {
      expect(isWebhookTrigger(PLAIN_TRIGGER)).toBe(false);
    });

    it('returns false for WRFCTrigger', () => {
      const trigger = createWRFCTrigger({ ...BASE_PARAMS });
      expect(isWebhookTrigger(trigger)).toBe(false);
    });

    it('returns false for CronTrigger', () => {
      const trigger = createCronTrigger({ ...BASE_PARAMS, schedule: '0 * * * *' });
      expect(isWebhookTrigger(trigger)).toBe(false);
    });

    it('returns false when trigger_type is not "webhook"', () => {
      const trigger = { ...PLAIN_TRIGGER, trigger_type: 'cron' };
      expect(isWebhookTrigger(trigger as Trigger)).toBe(false);
    });
  });
});
