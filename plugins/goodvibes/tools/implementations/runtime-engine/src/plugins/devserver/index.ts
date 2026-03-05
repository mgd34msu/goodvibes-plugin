/**
 * Dev Server Monitor Plugin — Layer 3
 *
 * Monitors a configured dev server process and emits devserver:error events
 * when the process crashes or becomes unreachable.
 *
 * This plugin is opt-in via goodvibes.json:
 * { "runtime": { "devserver": { "enabled": false, "command": "npm run dev", "port": 3000 } } }
 */

import { createLogger } from '../../shared/logger.js';
import type { EventBus } from '../../extensions/events/event-bus.js';
import { createExternalEvent } from '../../extensions/events/factories.js';

const logger = createLogger('devserver-monitor');

export interface DevServerConfig {
  /** Whether the dev server monitor is enabled. Default: false. */
  enabled: boolean;
  /** The command used to start the dev server (informational). */
  command: string;
  /** Port to health-check. Default: 3000. */
  port: number;
  /** Optional URL override for health checks. Defaults to http://localhost:{port}. */
  health_url?: string;
  /** Interval in ms between health checks. Default: 15000. */
  check_interval_ms?: number;
}

export const DEFAULT_DEVSERVER_CONFIG: DevServerConfig = {
  enabled: false,
  command: 'npm run dev',
  port: 3000,
  check_interval_ms: 15_000,
};

export class DevServerMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastHealthy = true;

  constructor(
    private config: DevServerConfig,
    private readonly eventBus: EventBus,
  ) {}

  start(): void {
    if (!this.config.enabled) {
      logger.debug('Dev server monitor disabled');
      return;
    }
    const interval = this.config.check_interval_ms ?? 15_000;
    this.timer = setInterval(() => void this.checkHealth(), interval);
    logger.info('Dev server monitor started', { port: this.config.port, interval });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Dev server monitor stopped');
    }
  }

  private async checkHealth(): Promise<void> {
    const url = this.config.health_url ?? `http://localhost:${this.config.port}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const response = await fetch(url, { signal: controller.signal, method: 'HEAD' });
      clearTimeout(timeout);

      if (response.ok) {
        if (!this.lastHealthy) {
          logger.info('Dev server recovered', { port: this.config.port });
          this.lastHealthy = true;
        }
      } else {
        this.emitError(`HTTP ${response.status}`);
      }
    } catch (err) {
      this.emitError(err instanceof Error ? err.message : String(err));
    }
  }

  private emitError(error: string): void {
    if (this.lastHealthy) {
      logger.warn('Dev server unreachable', { port: this.config.port, error });
      this.lastHealthy = false;

      const event = createExternalEvent({
        external_source: 'devserver',
        type: 'devserver:error',
        raw_payload: { error, port: this.config.port, command: this.config.command },
        payload: { error, port: this.config.port, command: this.config.command },
        normalized: true,
      });
      this.eventBus.emit(event);
    }
  }

  reconfigure(config: Partial<DevServerConfig>): void {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    if (wasEnabled && !this.config.enabled) {
      this.stop();
    } else if (!wasEnabled && this.config.enabled) {
      this.start();
    } else if (this.config.enabled && this.timer !== null) {
      // Restart to pick up interval changes
      this.stop();
      this.start();
    }
  }
}
