/**
 * Signal handler setup for graceful shutdown and operational signals.
 *
 * Registers OS signal handlers that integrate with the RuntimeEngine
 * shutdown sequence, ensuring state is persisted and resources are freed
 * before the process exits.
 */

import { toErrorMessage } from '../../shared/utils.js';

/** Grace period in milliseconds before a forced exit after SIGTERM. */
const SIGTERM_GRACE_MS = 10_000;

/** Grace period in milliseconds before a forced exit after SIGINT. */
const SIGINT_GRACE_MS = 5_000;

/**
 * Set up OS signal and process event handlers for the runtime engine.
 *
 * Registered signals:
 * - SIGTERM  — graceful shutdown with a 10-second timeout
 * - SIGINT   — graceful shutdown with a 5-second timeout (Ctrl+C)
 * - SIGUSR1  — trigger a state checkpoint (logs intent; no-op in Phase 1)
 * - SIGUSR2  — dump current health status to stderr
 * - uncaughtException   — log error then gracefully shut down
 * - unhandledRejection  — log rejection then gracefully shut down
 *
 * A forced exit timer is started whenever graceful shutdown is triggered.
 * The timer is unref'd so it does not prevent the process from exiting
 * naturally if shutdown completes before the timeout.
 *
 * Note: `process.stderr.write` is used intentionally throughout this module.
 * Signal handlers execute in a synchronous, restricted context where async
 * operations (including the structured logger) cannot be safely awaited.
 * Direct stderr writes are the only safe output mechanism in signal handlers.
 *
 * @param onShutdown - Async callback invoked on shutdown signals. Should
 *   persist state and close transports. Must not throw.
 */
export function setupSignalHandlers(
  onShutdown: () => Promise<void>
): void {
  let shuttingDown = false;

  /**
   * Initiate a graceful shutdown with the given timeout.
   *
   * @param signal  - Signal name for logging.
   * @param graceMs - Milliseconds before forced exit.
   */
  async function gracefulShutdown(
    signal: string,
    graceMs: number
  ): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    process.stderr.write(
      `[runtime-engine] Received ${signal} — initiating graceful shutdown (${graceMs / 1000}s grace)\n`
    );

    // Start a forced-exit watchdog that fires if shutdown hangs.
    const watchdog = setTimeout(() => {
      process.stderr.write(
        `[runtime-engine] Shutdown timed out after ${graceMs / 1000}s — forcing exit\n`
      );
      process.exit(1);
    }, graceMs);
    watchdog.unref();

    let exitCode = 0;
    try {
      await onShutdown();
      process.stderr.write('[runtime-engine] Graceful shutdown complete\n');
    } catch (err) {
      process.stderr.write(
        `[runtime-engine] Error during shutdown: ${toErrorMessage(err)}\n`
      );
      exitCode = 1;
    } finally {
      clearTimeout(watchdog);
      process.exit(exitCode);
    }
  }

  // SIGTERM — standard process termination (e.g. systemd, Docker stop)
  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM', SIGTERM_GRACE_MS);
  });

  // SIGINT — interactive interrupt (Ctrl+C)
  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT', SIGINT_GRACE_MS);
  });

  // SIGUSR1 — trigger a manual state checkpoint
  //
  // @todo Implement checkpoint persistence when RuntimeEngine exposes a
  //   checkpoint() method (planned for Phase 3 persistence integration).
  //   The handler should call: await runtimeEngine.checkpoint() to flush
  //   the current StateStore snapshot to disk without a full shutdown.
  //   Deferred because the StateStore persistence layer is not yet wired
  //   into RuntimeEngine at the signal-handler registration site.
  process.on('SIGUSR1', () => {
    process.stderr.write(
      '[runtime-engine] Received SIGUSR1 — checkpoint requested (not yet implemented; see @todo in signals.ts)\n'
    );
  });

  // SIGUSR2 — dump health status to stderr for operational inspection
  process.on('SIGUSR2', () => {
    const mem = process.memoryUsage();
    process.stderr.write(
      JSON.stringify({
        signal: 'SIGUSR2',
        pid: process.pid,
        uptime_ms: Math.round(process.uptime() * 1000),
        memory_rss_mb: Math.round(mem.rss / 1024 / 1024),
        memory_heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
        memory_heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
        timestamp: new Date().toISOString(),
      }) + '\n'
    );
  });

  // Uncaught exceptions — log and attempt graceful shutdown
  process.on('uncaughtException', (error: Error) => {
    process.stderr.write(
      `[runtime-engine] Uncaught exception: ${error.stack ?? error.message}\n`
    );
    void gracefulShutdown('uncaughtException', SIGTERM_GRACE_MS);
  });

  // Unhandled promise rejections — log and attempt graceful shutdown
  process.on('unhandledRejection', (reason: unknown) => {
    const message =
      reason instanceof Error ? reason.stack ?? reason.message : String(reason);
    process.stderr.write(
      `[runtime-engine] Unhandled promise rejection: ${message}\n`
    );
    void gracefulShutdown('unhandledRejection', SIGTERM_GRACE_MS);
  });
}
