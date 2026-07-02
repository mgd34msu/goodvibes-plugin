/**
 * Live session-cost tests (lane 9) against a fixture transcript whose FINAL
 * line is truncated — exactly what the reader sees when it reads a file that
 * Claude Code is still appending to. The truncated tail must be skipped (not
 * fatal), valid records must still be priced, and cost must split main-loop vs
 * per-subagent using the per-model cache-aware table.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeLiveSessionCost, renderLiveCostReport } from '../live-cost.js';
import { FALLBACK_MODEL_PRICING } from '../../config.js';

let tmp: string;
let projectDir: string;
let transcriptPath: string;

const COST_CONFIG = { cost_per_1k_input_tokens: 0.003, cost_per_1k_output_tokens: 0.015 };

function assistant(model: string, input: number, output: number, cacheRead = 0, cacheWrite = 0) {
  return JSON.stringify({
    type: 'assistant',
    sessionId: 'sess-xyz',
    timestamp: new Date().toISOString(),
    message: {
      model,
      usage: {
        input_tokens: input,
        output_tokens: output,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cacheWrite,
      },
    },
  });
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-livecost-'));
  projectDir = path.join(tmp, '-home-u-proj');
  fs.mkdirSync(projectDir, { recursive: true });
  transcriptPath = path.join(projectDir, 'sess-xyz.jsonl');
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('computeLiveSessionCost', () => {
  it('prices valid records and skips a truncated final line', async () => {
    // Two complete assistant records, then a TRUNCATED final line (mid-JSON).
    const body =
      assistant('claude-opus-4-8', 1000, 500) + '\n' +
      assistant('claude-opus-4-8', 2000, 1000, 500) + '\n' +
      '{"type":"assistant","message":{"model":"claude-opus-4-8","usage":{"input_tokens":9999,"outp';
    fs.writeFileSync(transcriptPath, body);

    const report = await computeLiveSessionCost({
      transcriptPath,
      pricingMap: FALLBACK_MODEL_PRICING,
      costConfig: COST_CONFIG,
    });

    expect(report.degraded).toBeNull();
    expect(report.main).not.toBeNull();
    // Only the two complete records were priced (truncated tail dropped).
    expect(report.main!.api_calls).toBe(2);
    expect(report.main!.parse_warnings).toBeGreaterThanOrEqual(1);
    expect(report.main!.rows).toHaveLength(1);
    expect(report.main!.rows[0].model).toBe('claude-opus-4-8');
    // Opus 4.8: input $5/MTok, output $25/MTok. 3000 in → $0.015, 1500 out → $0.0375.
    expect(report.main!.rows[0].cost_usd).toBeGreaterThan(0.05);
  });

  it('splits main-loop vs per-subagent and totals them', async () => {
    fs.writeFileSync(transcriptPath, assistant('claude-opus-4-8', 1000, 500) + '\n');

    // Subagent transcript lives under <projectDir>/<session-id>/subagents/.
    const subDir = path.join(projectDir, 'sess-xyz', 'subagents');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(
      path.join(subDir, 'agent-abc123.jsonl'),
      assistant('claude-haiku-4-5', 4000, 2000) + '\n',
    );
    fs.writeFileSync(
      path.join(subDir, 'agent-abc123.meta.json'),
      JSON.stringify({ agentType: 'Explore', description: 'trace something' }),
    );

    const report = await computeLiveSessionCost({
      transcriptPath,
      pricingMap: FALLBACK_MODEL_PRICING,
      costConfig: COST_CONFIG,
    });

    expect(report.main!.total_usd).toBeGreaterThan(0);
    expect(report.subagents).toHaveLength(1);
    expect(report.subagents[0].label).toContain('Explore');
    expect(report.subagents[0].total_usd).toBeGreaterThan(0);

    const expectedGrand = report.main!.total_usd + report.subagents[0].total_usd;
    expect(report.grand_total_usd).toBeCloseTo(expectedGrand, 10);

    const rendered = renderLiveCostReport(report);
    expect(rendered).toContain('Live Session Cost');
    expect(rendered).toContain('Main loop');
    expect(rendered).toContain('Subagents');
    expect(rendered).toContain('Grand total');
  });

  it('degrades honestly with no transcript path', async () => {
    const report = await computeLiveSessionCost({
      transcriptPath: null,
      pricingMap: FALLBACK_MODEL_PRICING,
      costConfig: COST_CONFIG,
    });
    expect(report.main).toBeNull();
    expect(report.grand_total_usd).toBe(0);
    expect(report.degraded).toMatch(/no active session transcript/);
    expect(renderLiveCostReport(report)).toMatch(/no active session transcript/);
  });
});
