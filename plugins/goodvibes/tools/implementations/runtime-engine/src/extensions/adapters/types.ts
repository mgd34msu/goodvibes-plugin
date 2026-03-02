/**
 * EventSourceAdapter — L2 Adapter Interface
 *
 * Defines the contract for all event source adapters.
 * Adapters bridge external or system event sources (hooks, time, external)
 * into the unified RuntimeEvent stream consumed by the runtime engine.
 */

import type { RuntimeEvent } from '../../shared/events.js';

// ─── TimeTickResult ────────────────────────────────────────────────────────────

/**
 * Result returned by TimeSourceAdapter.onTick().
 */
export interface TimeTickResult {
  /** Whether a heartbeat event was emitted this tick. */
  heartbeat_emitted: boolean;
  /** Number of scheduled events emitted this tick. */
  scheduled_emitted: number;
}

// ─── ExternalTickResult ───────────────────────────────────────────────────────

/**
 * Result returned by ExternalSourceAdapter.onTick().
 */
export interface ExternalTickResult {
  /** Number of external events ingested this tick. */
  events_ingested: number;
}

// ─── SchedulerAccessor ────────────────────────────────────────────────────────

/**
 * Interface-only view of an EventScheduler, exposed via TimeSourceAdapter.getScheduler().
 * Restricts TickDriver to the operations it actually needs.
 */
export interface SchedulerAccessor {
  /** Returns a scheduled item by ID, or undefined if not found. */
  getItem(id: string): { interval_ms?: number } | undefined;
  /** Cancels a scheduled item. Returns true if removed, false if not found. */
  cancel(id: string): boolean;
  /** Schedules a recurring heartbeat event. */
  scheduleHeartbeat(params: {
    id: string;
    event_type: string;
    interval_ms: number;
  }): void;
}

// ─── TimeSourceAdapter ────────────────────────────────────────────────────────

/**
 * L2 interface for time tick sources.
 * Used by TickDriver to process time-based events without importing L3 directly.
 */
export interface TimeSourceAdapter {
  /** Discriminator for the adapter kind. */
  readonly kind: string;
  /** Process one time tick — emit heartbeat and/or scheduled events. */
  onTick(): TimeTickResult;
  /** Returns a restricted view of the EventScheduler. */
  getScheduler(): SchedulerAccessor;
}

// ─── ExternalSourceAdapter ────────────────────────────────────────────────────

/**
 * L2 interface for external event sources.
 * Used by TickDriver to scan for external file-drop events without importing L3 directly.
 */
export interface ExternalSourceAdapter {
  /** Discriminator for the adapter kind. */
  readonly kind: string;
  /** Optional initialization step (e.g., create directories before first tick). */
  initialize?(): Promise<void>;
  /** Scan for and ingest external events on this tick. */
  onTick(): Promise<ExternalTickResult>;
}

// ─── AdapterStatus ────────────────────────────────────────────────────────────

/**
 * Runtime status reported by an EventSourceAdapter.
 */
export interface AdapterStatus {
  /** Whether the adapter is actively receiving events. */
  running: boolean;
  /** Total number of events successfully processed since start. */
  eventsProcessed: number;
  /** Unix epoch ms of the most recently processed event, if any. */
  lastEventAt?: number;
  /** Total number of errors encountered during event processing. */
  errors: number;
}

// ─── EventSourceAdapter ───────────────────────────────────────────────────────

/**
 * Contract for all L2 event source adapters.
 *
 * An adapter wraps a specific event source (e.g., hook callbacks, timers,
 * external webhooks) and normalises raw inputs into unified RuntimeEvents.
 * The runtime engine manages adapters via the AdapterRegistry.
 *
 * Lifecycle:
 *   1. `start()` — begin accepting events from the source.
 *   2. `normalize(raw)` — called on each incoming payload to produce a RuntimeEvent.
 *   3. `stop()` — gracefully stop event reception.
 */
export interface EventSourceAdapter {
  /**
   * Unique adapter name (e.g., 'hook', 'time', 'external').
   * Used as a key in the AdapterRegistry.
   */
  readonly name: string;

  /**
   * Start receiving events from this source.
   * Idempotent — calling start on an already-running adapter is a no-op.
   */
  start(): Promise<void>;

  /**
   * Stop receiving events.
   * Idempotent — calling stop on an already-stopped adapter is a no-op.
   */
  stop(): Promise<void>;

  /**
   * Returns the current adapter status snapshot.
   */
  status(): AdapterStatus;

  /**
   * Normalise a raw input payload into a unified RuntimeEvent.
   *
   * Called by the runtime engine (or the adapter itself) for each incoming
   * event payload. Returns null if the input cannot be normalised (e.g.,
   * unknown event type or malformed payload).
   */
  normalize(rawInput: unknown): RuntimeEvent | null;
}
