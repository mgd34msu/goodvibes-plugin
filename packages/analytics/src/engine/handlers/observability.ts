/**
 * Shared glue for the lane-9 observability modes.
 *
 * These are MODES of `query` / `dashboard` (not new tools). This module wires
 * the pure observability engine (`../observability/*`) to the runtime inputs a
 * handler has: the live Aggregator (for the active transcript path + cost
 * config) and the project state dir (for the host-health state file the
 * background sampler maintains). Everything degrades honestly.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Aggregator } from '../daemon/aggregator.js';
import { loadModelPricing } from '../config.js';
import {
  computeLiveSessionCost,
  renderLiveCostReport,
  renderDoctorReport,
  renderAgentLiveness,
  scanAgentLiveness,
  HostHealthSampler,
  HEALTH_STATE_SEGMENTS,
  type HealthState,
} from '../observability/index.js';
import { basename, dirname } from 'node:path';

/** Price the current session's live transcript, split main-loop vs subagents. */
export async function runLiveCost(aggregator: Aggregator): Promise<string> {
  const cfg = aggregator.getConfig();
  const report = await computeLiveSessionCost({
    transcriptPath: aggregator.getActiveJsonlPath(),
    pricingMap: loadModelPricing(),
    costConfig: {
      cost_per_1k_input_tokens: cfg.cost_per_1k_input_tokens,
      cost_per_1k_output_tokens: cfg.cost_per_1k_output_tokens,
    },
  });
  return renderLiveCostReport(report);
}

/**
 * Host-health doctor view. Primary source is the background sampler's persisted
 * state file (sustained-CPU orphan detection needs its multi-sample history).
 * When that file is absent, fall back to a best-effort one-shot sample and say
 * so, a single read cannot know a process is *stuck* busy.
 */
export function runDoctor(goodvibesDir: string): string {
  const stateFile = join(goodvibesDir, ...HEALTH_STATE_SEGMENTS);
  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf8')) as HealthState;
    if (state && typeof state.sampled_at === 'number') {
      const staleMs = Date.now() - state.sampled_at;
      return renderDoctorReport(state, { stale_ms: staleMs });
    }
  } catch {
    /* no persisted state, fall through to a one-shot sample */
  }

  // Fallback: one-shot sample. CPU deltas need two reads, so orphan detection
  // is offline here; report load + children and say the sampler is needed.
  const sampler = new HostHealthSampler({ goodvibesDir });
  const state = sampler.sampleOnce();
  const rendered = renderDoctorReport(state);
  return (
    rendered +
    '\nNote: sustained-CPU orphan detection needs the background sampler ' +
    '(it writes health-state.json every 60s); showing a one-shot snapshot only.'
  );
}

/** Background-agent liveness for the current session. */
export function runAgents(aggregator: Aggregator): string {
  const transcript = aggregator.getActiveJsonlPath();
  // Subagent transcripts live under <projectDir>/<session-id>/{subagents,tasks}.
  const sessionDir = transcript
    ? join(dirname(transcript), basename(transcript, '.jsonl'))
    : null;
  const report = scanAgentLiveness({ sessionDir });
  return renderAgentLiveness(report);
}
