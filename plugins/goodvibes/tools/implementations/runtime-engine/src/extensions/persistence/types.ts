/**
 * Persistence Layer Types
 *
 * Core interfaces for the runtime engine persistence subsystem. These
 * abstractions allow the higher-level engine to remain decoupled from
 * the underlying storage mechanism.
 */

/**
 * Generic key-value state store interface.
 *
 * Keys are arbitrary strings; values are JSON-serialisable objects.
 * Implementations must ensure atomicity for writes to prevent partial
 * state corruption on process crash.
 */
export interface StateStore {
  /**
   * Initialises the store, creating any required directories or resources.
   * Must be called once before any read/write operations.
   */
  initialize(): Promise<void>;

  /**
   * Persists `state` under `key`, overwriting any existing value.
   *
   * @param key - Storage key (alphanumeric + hyphens/underscores recommended).
   * @param state - JSON-serialisable value to persist.
   */
  set(key: string, state: unknown): Promise<void>;

  /**
   * Retrieves the value stored under `key`.
   *
   * @param key - Storage key to look up.
   * @returns The stored value cast to `T`, or `null` if the key does not exist.
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Removes the entry for `key` if it exists. No-op if the key is absent.
   *
   * @param key - Storage key to remove.
   */
  delete(key: string): Promise<void>;

  /**
   * Lists all keys currently present in the store.
   *
   * @returns Array of key strings, order unspecified.
   */
  keys(): Promise<string[]>;

  /**
   * Atomically loads the current value for `key`, applies `updater`, and
   * saves the result. If the key does not exist, `updater` receives `null`.
   *
   * @param key - Storage key to update.
   * @param updater - Pure function that receives the current value (or null)
   *   and returns the new value to persist.
   */
  update<T>(key: string, updater: (current: T | null) => T): Promise<void>;
}

/** Aggregate statistics for a structured event log */
export interface EventLogStats {
  /** Total number of events recorded */
  total_events: number;
  /** Current file size in bytes */
  file_size_bytes: number;
  /** ISO-8601 timestamp of the oldest recorded event, or null if empty */
  oldest_event: string | null;
  /** ISO-8601 timestamp of the newest recorded event, or null if empty */
  newest_event: string | null;
  /** Count of events broken down by event type */
  events_per_type: Record<string, number>;
}

/**
 * Interface for crash recovery operations.
 *
 * Implementations are responsible for snapshotting in-flight state and
 * detecting + replaying that state on the next startup after an unclean exit.
 */
export interface CrashRecovery {
  /**
   * Takes a point-in-time snapshot of all in-flight state.
   * Should be called periodically (e.g. on a timer) and on clean shutdown.
   */
  checkpoint(): Promise<void>;

  /**
   * Attempts to recover state from the most recent checkpoint.
   *
   * @returns A {@link PersistenceRecoveryResult} describing what was restored.
   */
  recover(): Promise<PersistenceRecoveryResult>;

  /**
   * Determines whether the previous session ended uncleanly (i.e. whether
   * recovery should be attempted before normal operation begins).
   *
   * @returns `true` if a recovery checkpoint exists and was not cleanly closed.
   */
  needsRecovery(): Promise<boolean>;
}

/** Describes the outcome of a crash recovery operation */
export interface PersistenceRecoveryResult {
  /** Number of workflow instances that were successfully restored */
  recovered_workflows: number;
  /** Number of agent sessions that were successfully restored */
  recovered_agents: number;
  /** Number of queued messages that were replayed */
  recovered_queue_items: number;
  /** Number of events that were replayed from the event log */
  replayed_events: number;
  /** Whether any data could not be recovered (partial or total loss) */
  data_loss: boolean;
  /** Human-readable warnings generated during recovery (may be empty) */
  warnings: string[];
}
