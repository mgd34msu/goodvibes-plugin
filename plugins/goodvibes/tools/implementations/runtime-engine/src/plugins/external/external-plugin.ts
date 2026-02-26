/**
 * ExternalPlugin — Layer 3
 *
 * Top-level plugin that wires together:
 *   - FileWatcher: scans .goodvibes/events/incoming/ for JSON event files
 *   - HttpListener (optional): receives webhooks over HTTP and drops files
 *   - NormalizerRegistry: maps source names to payload normalizers
 *
 * Usage:
 *   const plugin = new ExternalPlugin(queue, config);
 *   await plugin.initialize();
 *
 *   // Called on each runtime tick:
 *   const { events_ingested } = await plugin.onTick();
 *
 *   // Optionally enable HTTP ingestion:
 *   await plugin.startHttpListener();
 */

import { EventQueueInterface } from '../../core/types.js';
import { FileWatcher, FileWatcherConfig, DEFAULT_FILE_WATCHER_CONFIG } from './file-watcher.js';
import { HttpListener, HttpListenerConfig, DEFAULT_HTTP_LISTENER_CONFIG } from './http-listener.js';
import { NormalizerRegistry, createDefaultRegistry } from './normalizers/index.js';

// ─── Configuration ────────────────────────────────────────────────────────────

export interface ExternalPluginConfig {
  /** File watcher configuration. */
  file_watcher: FileWatcherConfig;
  /**
   * HTTP listener configuration.
   * When omitted, the HTTP listener is disabled (file-drop only mode).
   */
  http_listener?: HttpListenerConfig;
  /**
   * Names of additional normalizers to auto-register from custom factories.
   * The built-in normalizers ('github', 'generic') are always registered.
   * This field is a hook for future extension — currently informational only.
   */
  normalizers?: string[];
}

// ─── Default Config Factory ───────────────────────────────────────────────────

/**
 * Creates a default ExternalPluginConfig using conventional directory paths.
 */
export function createDefaultExternalPluginConfig(): ExternalPluginConfig {
  return {
    file_watcher: { ...DEFAULT_FILE_WATCHER_CONFIG },
    // http_listener intentionally omitted — disabled by default
  };
}

// ─── ExternalPlugin Class ──────────────────────────────────────────────────────────

export class ExternalPlugin {
  private readonly watcher: FileWatcher;
  private listener: HttpListener | null = null;
  private readonly normalizers: NormalizerRegistry;

  constructor(
    private readonly queue: EventQueueInterface,
    private readonly config: ExternalPluginConfig,
  ) {
    this.normalizers = createDefaultRegistry();
    this.watcher = new FileWatcher(this.queue, this.normalizers, this.config.file_watcher);

    if (this.config.http_listener !== undefined) {
      this.listener = new HttpListener(
        this.config.file_watcher.incoming_dir,
        this.config.http_listener,
      );
    }
  }

  /**
   * Initialize the plugin: ensure required directories exist.
   * Call this once at startup before the first tick.
   */
  async initialize(): Promise<void> {
    await this.watcher.ensureDirs();
  }

  /**
   * Called on each runtime tick.
   * Scans the file drop directory for new events and enqueues them.
   */
  async onTick(): Promise<{ events_ingested: number }> {
    return this.watcher.scan();
  }

  /**
   * Start the HTTP listener (if configured).
   * No-op if http_listener was not included in config.
   * Throws if the listener is already running.
   */
  async startHttpListener(): Promise<void> {
    if (this.listener === null) {
      // Fall back to default config when http_listener was omitted from constructor config.
      const listenerConfig = this.config.http_listener ?? DEFAULT_HTTP_LISTENER_CONFIG;
      this.listener = new HttpListener(
        this.config.file_watcher.incoming_dir,
        listenerConfig,
      );
    }
    await this.listener.start();
  }

  /**
   * Stop the HTTP listener gracefully.
   * No-op if the listener is not running.
   */
  async stopHttpListener(): Promise<void> {
    if (this.listener === null || !this.listener.isRunning()) {
      return;
    }
    await this.listener.stop();
  }

  /**
   * Returns true if the HTTP listener is currently running.
   */
  isHttpListenerRunning(): boolean {
    return this.listener?.isRunning() ?? false;
  }

  /**
   * Expose the normalizer registry for external customization.
   * Callers can register additional normalizers before the first tick.
   */
  getNormalizerRegistry(): NormalizerRegistry {
    return this.normalizers;
  }
}
