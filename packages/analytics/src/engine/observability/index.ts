/**
 * Observability modes for the analytics engine (lane 9).
 *
 * These are MODES of the existing `query` / `dashboard` tools, not new tools.
 * Analytics stays at seven tools; the three capabilities here (live session
 * cost, host health / doctor, agent liveness) are surfaced through the existing
 * surface and share the transcript-reader + pricing base.
 */

export {
  computeLiveSessionCost,
  renderLiveCostReport,
  type LiveCostReport,
  type LiveCostOptions,
  type TranscriptCost,
  type ModelCostRow,
} from './live-cost.js';

export {
  HostHealthSampler,
  healthThresholdTripped,
  renderDoctorReport,
  SAMPLE_INTERVAL_MS,
  LOAD_PER_CORE_NUDGE,
  HEALTH_STATE_SEGMENTS,
  type HealthState,
  type OrphanProcess,
  type HostHealthOptions,
} from './host-health.js';

export {
  scanAgentLiveness,
  renderAgentLiveness,
  DEFAULT_WEDGED_MINUTES,
  type AgentLiveness,
  type AgentLivenessReport,
  type AgentLivenessOptions,
  type AgentState,
  type SizeSnapshot,
} from './agent-liveness.js';
