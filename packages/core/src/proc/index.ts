/**
 * `@goodvibes/core/proc` — process-hygiene layer (field issue 9).
 *
 * BUILT NEW: v1 shipped only a non-firing stdin-close path, so orphaned servers
 * spun at 100% CPU after a session died. Every v2 server calls
 * `installProcessHygiene()` in `main()`. It provides:
 *
 *  (a) Parent-liveness watchdog — exits on stdin close AND on a `ppid` poll that
 *      catches reparent-to-init/systemd (the case stdin-close alone misses).
 *  (b) Idle self-exit after `idleExitMinutes` (default 30) with no request.
 *  (c) Per-request time budget via `withBudget(ms, task)` — a handler returns a
 *      partial result with honest `budget_exceeded` accounting instead of
 *      hanging the client forever.
 *  (d) Plain SIGTERM/SIGINT death — NO keep-alive exception handlers, NO blocking
 *      sync loops. Every watchdog timer is `unref()`ed so it never holds the
 *      event loop open on its own.
 */

/** A cooperative abort signal handed to a budgeted task. */
export interface BudgetSignal {
  /** Flips to true when the time budget expires; the task should return a partial. */
  aborted: boolean;
}

/** The outcome of a budgeted task. */
export interface BudgetOutcome<T> {
  /** Whatever the task produced (a partial result when the budget expired). */
  value: T;
  /** True when the budget expired before the task finished normally. */
  budget_exceeded: boolean;
  /** Wall-clock time the task ran, in milliseconds. */
  elapsed_ms: number;
}

const BUDGET_EXPIRED = Symbol('budget-expired');

/**
 * Run `task` under a time budget. The task receives a `BudgetSignal` it should
 * poll; when the budget expires the signal flips and the task is expected to
 * return promptly with whatever partial result it has. A lost result degrades to
 * a partial, never an infinite client wait.
 *
 * JavaScript cannot preempt a running function, so cancellation is cooperative:
 * a task that never checks `signal.aborted` and never yields will still block —
 * that is the task's contract to honour, and the analyzers/HTTP loops do.
 *
 * @param ms - the budget in milliseconds
 * @param task - the work, receiving an abort signal
 */
export async function withBudget<T>(
  ms: number,
  task: (signal: BudgetSignal) => Promise<T>,
): Promise<BudgetOutcome<T>> {
  const start = Date.now();
  const signal: BudgetSignal = { aborted: false };
  let timer: ReturnType<typeof setTimeout> | undefined;

  const budgetHit = new Promise<typeof BUDGET_EXPIRED>((resolve) => {
    timer = setTimeout(() => {
      signal.aborted = true;
      resolve(BUDGET_EXPIRED);
    }, ms);
    timer.unref?.();
  });

  const taskP = task(signal);
  const first = await Promise.race([
    taskP.then((value) => ({ value })),
    budgetHit,
  ]);

  if (first !== BUDGET_EXPIRED) {
    if (timer) clearTimeout(timer);
    return { value: (first as { value: T }).value, budget_exceeded: false, elapsed_ms: Date.now() - start };
  }

  // Budget expired: the task has seen `aborted` and should resolve promptly with
  // its partial. Await it to collect that partial.
  const value = await taskP;
  if (timer) clearTimeout(timer);
  return { value, budget_exceeded: true, elapsed_ms: Date.now() - start };
}

/** Options for `installProcessHygiene`. */
export interface ProcHygieneOptions {
  /** Idle self-exit threshold in minutes (default 30). */
  idleExitMinutes?: number;
  /** Parent-liveness poll interval in ms (default 5000). */
  ppidPollMs?: number;
  /** How often to check idleness in ms (default min(idle, 60000)). */
  idleCheckMs?: number;
  /** Watch stdin close (default true). Disable in unit tests. */
  watchStdin?: boolean;
  /** Install SIGTERM/SIGINT handlers (default true). Disable in unit tests. */
  watchSignals?: boolean;
  /** Optional hook run before exit (must not block; errors are swallowed). */
  onShutdown?: (reason: string) => void | Promise<void>;
  /** Exit function (default process.exit) — injectable for tests. */
  exit?: (code: number) => void;
  /** Clock (default Date.now) — injectable for tests. */
  now?: () => number;
}

/** Handle returned by `installProcessHygiene`. */
export interface ProcHygiene {
  /** Reset the idle timer — call on every incoming request. */
  noteActivity(): void;
  /** Tear down all timers and listeners (shutdown / test cleanup). */
  stop(): void;
  /** The parent pid captured at install time. */
  readonly initialPpid: number;
}

/**
 * Install the process-hygiene watchdogs on the current process.
 * @param options - overrides for the hygiene thresholds and injectable hooks
 * @returns a handle to note activity and tear down
 */
export function installProcessHygiene(options: ProcHygieneOptions = {}): ProcHygiene {
  const idleMs = (options.idleExitMinutes ?? 30) * 60_000;
  const ppidPollMs = options.ppidPollMs ?? 5000;
  const idleCheckMs = options.idleCheckMs ?? Math.min(idleMs, 60_000);
  const watchStdin = options.watchStdin ?? true;
  const watchSignals = options.watchSignals ?? true;
  const now = options.now ?? (() => Date.now());
  const exit = options.exit ?? ((code: number) => process.exit(code));

  const initialPpid = process.ppid;
  let lastActivity = now();
  let stopped = false;
  let shuttingDown = false;
  const timers: Array<ReturnType<typeof setInterval>> = [];

  function stop(): void {
    if (stopped) return;
    stopped = true;
    for (const t of timers) clearInterval(t);
    if (watchStdin) {
      try {
        process.stdin.off('end', onStdinEnd);
        process.stdin.off('close', onStdinEnd);
      } catch {
        /* stdin may be unavailable */
      }
    }
    if (watchSignals) {
      process.off('SIGTERM', onSignal);
      process.off('SIGINT', onSignal);
    }
  }

  async function shutdown(reason: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    stop();
    try {
      await options.onShutdown?.(reason);
    } catch {
      // Never let a shutdown hook block or cancel the exit.
    }
    exit(0);
  }

  function onStdinEnd(): void {
    void shutdown('stdin-closed');
  }
  function onSignal(): void {
    void shutdown('signal');
  }

  // (b) idle self-exit
  const idleTimer = setInterval(() => {
    if (now() - lastActivity >= idleMs) void shutdown('idle');
  }, idleCheckMs);
  idleTimer.unref?.();
  timers.push(idleTimer);

  // (a) ppid poll — catches reparent-to-init that stdin-close alone misses
  const ppidTimer = setInterval(() => {
    const p = process.ppid;
    if (p !== initialPpid || p === 1) void shutdown('reparented');
  }, ppidPollMs);
  ppidTimer.unref?.();
  timers.push(ppidTimer);

  // (a) stdin close
  if (watchStdin) {
    try {
      process.stdin.on('end', onStdinEnd);
      process.stdin.on('close', onStdinEnd);
    } catch {
      /* stdin may be unavailable */
    }
  }

  // (d) plain signal death
  if (watchSignals) {
    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);
  }

  return {
    noteActivity() {
      lastActivity = now();
    },
    stop,
    initialPpid,
  };
}
