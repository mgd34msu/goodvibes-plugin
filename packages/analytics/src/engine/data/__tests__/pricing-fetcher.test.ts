/**
 * First-party pricing fetcher tests. The fixture is a verbatim trim of the
 * live platform.claude.com pricing.md as of 2026-07-02, the exact shapes the
 * parser must survive: markdown links, parentheticals, date-qualified rows,
 * and the Claude 5 family that v1's parser silently skipped.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  parsePricingMarkdown,
  cacheAgeHours,
  refreshPricingIfStale,
} from '../pricing-fetcher.js';

const FIXTURE = `# Pricing

## Model pricing

The following table shows pricing for all Claude models:

| Model                                                                                                         | Base Input Tokens | 5m Cache Writes | 1h Cache Writes | Cache Hits & Refreshes | Output Tokens |
| ------------------------------------------------------------------------------------------------------------- | ----------------- | --------------- | --------------- | ---------------------- | ------------- |
| Claude Fable 5                                                                                                | $10 / MTok        | $12.50 / MTok   | $20 / MTok      | $1 / MTok              | $50 / MTok    |
| Claude Mythos 5 ([limited availability](https://anthropic.com/glasswing))                                     | $10 / MTok        | $12.50 / MTok   | $20 / MTok      | $1 / MTok              | $50 / MTok    |
| Claude Opus 4.8                                                                                               | $5 / MTok         | $6.25 / MTok    | $10 / MTok      | $0.50 / MTok           | $25 / MTok    |
| Claude Opus 4.1 ([deprecated](/docs/en/about-claude/model-deprecations))                                      | $15 / MTok        | $18.75 / MTok   | $30 / MTok      | $1.50 / MTok           | $75 / MTok    |
| Claude Sonnet 5 [through August 31, 2026](/docs/en/about-claude/pricing#claude-sonnet-5-introductory-pricing) | $2 / MTok         | $2.50 / MTok    | $4 / MTok       | $0.20 / MTok           | $10 / MTok    |
| Claude Sonnet 5 starting September 1, 2026                                                                    | $3 / MTok         | $3.75 / MTok    | $6 / MTok       | $0.30 / MTok           | $15 / MTok    |
| Claude Haiku 4.5                                                                                              | $1 / MTok         | $1.25 / MTok    | $2 / MTok       | $0.10 / MTok           | $5 / MTok     |

## Feature pricing

Other things, not models.
`;

const JULY = new Date('2026-07-02T12:00:00Z');
const OCTOBER = new Date('2026-10-01T12:00:00Z');

describe('parsePricingMarkdown', () => {
  it('parses every family including Claude 5 (the v1 parser regression)', () => {
    const models = parsePricingMarkdown(FIXTURE, JULY);
    expect(Object.keys(models).sort()).toEqual([
      'claude-fable-5',
      'claude-haiku-4-5',
      'claude-mythos-5',
      'claude-opus-4-1',
      'claude-opus-4-8',
      'claude-sonnet-5',
    ]);
  });

  it('maps the columns correctly (fable row)', () => {
    const fable = parsePricingMarkdown(FIXTURE, JULY)['claude-fable-5'];
    expect(fable).toEqual({
      name: 'Claude Fable 5',
      inputPrice: 10,
      cacheWrite5Min: 12.5,
      cacheWrite1Hour: 20,
      cacheHits: 1,
      outputPrice: 50,
    });
  });

  it('resolves date-qualified rows to the rate effective NOW', () => {
    const july = parsePricingMarkdown(FIXTURE, JULY)['claude-sonnet-5'];
    expect(july.inputPrice).toBe(2); // introductory pricing through Aug 31
    expect(july.outputPrice).toBe(10);

    const october = parsePricingMarkdown(FIXTURE, OCTOBER)['claude-sonnet-5'];
    expect(october.inputPrice).toBe(3); // standard pricing from Sept 1
    expect(october.outputPrice).toBe(15);
  });

  it('strips markdown links and parentheticals from names', () => {
    const models = parsePricingMarkdown(FIXTURE, JULY);
    expect(models['claude-mythos-5'].name).toBe('Claude Mythos 5');
    expect(models['claude-opus-4-1'].name).toBe('Claude Opus 4.1');
  });

  it('throws when the table parses to zero models (layout drift alarm)', () => {
    expect(() => parsePricingMarkdown('## Model pricing\n\nnothing here', JULY)).toThrow(/zero models/);
  });
});

describe('cacheAgeHours', () => {
  it('is Infinity for a missing file and ~0 for a fresh one', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gv-pricing-'));
    try {
      const file = path.join(dir, 'model-pricing.json');
      expect(cacheAgeHours(file)).toBe(Infinity);
      writeFileSync(file, JSON.stringify({ fetchedAt: new Date().toISOString(), models: {} }));
      expect(cacheAgeHours(file)).toBeLessThan(0.1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('refreshPricingIfStale', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOODVIBES_NO_PRICING_FETCH;
  });

  it('is inert under the kill switch and (by default) under the test runner', async () => {
    process.env.GOODVIBES_NO_PRICING_FETCH = '1';
    expect(await refreshPricingIfStale({ force: true })).toBe(false);
    delete process.env.GOODVIBES_NO_PRICING_FETCH;
    // No force: the VITEST guard applies, so no fetch even when stale.
    expect(await refreshPricingIfStale({ cachePath: '/nonexistent/nope.json' })).toBe(false);
  });

  it('fetches, parses, and atomically writes the cache when stale', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gv-pricing-'));
    const file = path.join(dir, 'model-pricing.json');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(FIXTURE, { status: 200 })));
    try {
      const wrote = await refreshPricingIfStale({ cachePath: file, force: true });
      expect(wrote).toBe(true);
      const cache = JSON.parse(readFileSync(file, 'utf-8'));
      expect(cache.source).toContain('platform.claude.com');
      expect(cache.models['claude-fable-5'].outputPrice).toBe(50);
      expect(new Date(cache.fetchedAt).getTime()).toBeGreaterThan(0);
      // Fresh now: a second call is a no-op.
      expect(await refreshPricingIfStale({ cachePath: file, force: true })).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves the previous cache untouched when the fetch fails', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gv-pricing-'));
    const file = path.join(dir, 'model-pricing.json');
    const previous = { fetchedAt: '2020-01-01T00:00:00Z', source: 'old', models: { keep: true } };
    writeFileSync(file, JSON.stringify(previous));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    try {
      expect(await refreshPricingIfStale({ cachePath: file, force: true })).toBe(false);
      expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual(previous);
      expect(existsSync(file)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
