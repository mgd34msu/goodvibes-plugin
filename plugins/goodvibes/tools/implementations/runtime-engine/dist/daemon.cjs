"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/transport/daemon.ts
var import_node_fs17 = require("node:fs");
var import_node_path17 = require("node:path");

// src/bootstrap.ts
var import_node_path15 = require("node:path");
var import_node_fs15 = require("node:fs");

// src/shared/config.ts
var import_node_fs2 = require("node:fs");

// src/shared/file-io.ts
var import_node_fs = require("node:fs");

// src/shared/errors.ts
var RuntimeEngineError = class extends Error {
  constructor(message, code, cause) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
  static {
    __name(this, "RuntimeEngineError");
  }
};
var ConfigError = class extends RuntimeEngineError {
  static {
    __name(this, "ConfigError");
  }
  constructor(message, cause) {
    super(message, "CONFIG_ERROR", cause);
  }
};
var StateError = class extends RuntimeEngineError {
  static {
    __name(this, "StateError");
  }
  constructor(message, cause) {
    super(message, "STATE_ERROR", cause);
  }
};
var QueueError = class extends RuntimeEngineError {
  static {
    __name(this, "QueueError");
  }
  constructor(message, cause) {
    super(message, "QUEUE_ERROR", cause);
  }
};
var ProcessingError = class extends RuntimeEngineError {
  static {
    __name(this, "ProcessingError");
  }
  constructor(message, cause) {
    super(message, "PROCESSING_ERROR", cause);
  }
};
var IPCError = class extends RuntimeEngineError {
  static {
    __name(this, "IPCError");
  }
  constructor(message, cause) {
    super(message, "IPC_ERROR", cause);
  }
};
var WorkflowError = class extends RuntimeEngineError {
  static {
    __name(this, "WorkflowError");
  }
  constructor(message, cause) {
    super(message, "WORKFLOW_ERROR", cause);
  }
};
var WorkflowTimeoutError = class extends RuntimeEngineError {
  /** The timeout value in milliseconds that was exceeded. */
  constructor(message, timeoutMs, cause) {
    super(message, "WORKFLOW_TIMEOUT_ERROR", cause);
    this.timeoutMs = timeoutMs;
  }
  static {
    __name(this, "WorkflowTimeoutError");
  }
};

// src/shared/file-io.ts
var import_node_path = require("node:path");
function writeAtomicSync(filePath, content) {
  const dir = (0, import_node_path.dirname)(filePath);
  (0, import_node_fs.mkdirSync)(dir, { recursive: true });
  const tmpPath = (0, import_node_path.join)(dir, `.tmp_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  try {
    (0, import_node_fs.writeFileSync)(tmpPath, content, "utf-8");
    (0, import_node_fs.renameSync)(tmpPath, filePath);
  } catch (err) {
    try {
      (0, import_node_fs.unlinkSync)(tmpPath);
    } catch {
    }
    throw err;
  }
}
__name(writeAtomicSync, "writeAtomicSync");
function writeJsonSync(filePath, data) {
  writeAtomicSync(filePath, JSON.stringify(data, null, 2) + "\n");
}
__name(writeJsonSync, "writeJsonSync");

// src/shared/utils.ts
var import_node_crypto = require("node:crypto");
function generateId() {
  return (0, import_node_crypto.randomUUID)();
}
__name(generateId, "generateId");
function timestamp() {
  return Date.now();
}
__name(timestamp, "timestamp");
function generateEventId() {
  return `evt_${(0, import_node_crypto.randomUUID)()}`;
}
__name(generateEventId, "generateEventId");
function generateWorkflowId() {
  return `wf_${(0, import_node_crypto.randomUUID)()}`;
}
__name(generateWorkflowId, "generateWorkflowId");
function toErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
__name(toErrorMessage, "toErrorMessage");
function safeJsonParse(input, fallback, logError) {
  try {
    return JSON.parse(input);
  } catch (err) {
    if (logError) {
      logError(err instanceof Error ? err.message : String(err));
    }
    return fallback;
  }
}
__name(safeJsonParse, "safeJsonParse");

// src/shared/constants.ts
var ENGINE_VERSION = "1.0.0";
var MAX_OUTPUT_PREVIEW_LENGTH = 200;
var DEFAULT_HTTP_LISTENER_PORT = 3847;

// src/shared/config.ts
var import_node_path2 = require("node:path");
var import_node_os = require("node:os");
var DEFAULT_CONFIG = {
  ipc: {
    socket_dir: (() => {
      try {
        const xdg = process.env["XDG_RUNTIME_DIR"];
        if (xdg) return `${xdg}/goodvibes`;
        const uid = process.getuid?.() ?? (() => {
          try {
            return (0, import_node_os.userInfo)().uid;
          } catch {
            return 0;
          }
        })();
        return `${(0, import_node_os.tmpdir)()}/goodvibes-${uid}`;
      } catch {
        return `${(0, import_node_os.tmpdir)()}/goodvibes`;
      }
    })(),
    connect_timeout_ms: 500,
    query_timeout_ms: 200
  },
  queue: {
    max_size: 1e4,
    max_attempts: 3,
    backoff_base_ms: 1e3,
    backoff_multiplier: 2,
    process_interval_ms: 10
  },
  persistence: {
    checkpoint_interval_ms: 3e4,
    event_log_max_size_mb: 50,
    compact_after_hours: 24,
    state_dir: ".goodvibes/state"
  },
  workflows: {
    max_active: 10,
    max_transitions_per_workflow: 100,
    wrfc_max_fix_iterations: 3,
    fix_loop_max_attempts: 5,
    action_timeout_ms: 3e4,
    max_transition_queue_depth: 10
  },
  triggers: {
    max_triggers: 100,
    default_cooldown_ms: 5e3,
    max_fires_per_session: 50,
    handler_timeout_ms: 3e4
  },
  health: {
    check_interval_ms: 6e4,
    memory_warn_mb: 256,
    memory_critical_mb: 512,
    queue_depth_warn: 100
  },
  features: {
    ipc_enabled: true,
    workflows_enabled: true,
    agents_enabled: true,
    full_integration: true
  },
  agents: {
    max_concurrent: 6,
    session_budget: 0,
    // 0 = unlimited
    budget_thresholds: [50, 80, 95],
    default_budget: 2e5,
    // tokens
    max_review_iterations: 3
  },
  executor: {
    mode: "engaged",
    daemon: {
      clear_context_after_batch: true,
      tmux_session_name: "claude-daemon",
      tick_command: "tick",
      tick_interval_ms: 3e4,
      auto_tick: true,
      eval_interval_ms: 1e4
    },
    budget: {
      flat_cap_usd: void 0,
      daily_cap_usd: void 0,
      warning_threshold: 0.8,
      daily_reset_hour: 0
    },
    transport: {
      auto_start: false,
      rpc_timeout_ms: 5e3,
      migrate_state_on_join: false,
      reconnect: {
        enabled: true,
        max_attempts: 10,
        base_delay_ms: 100,
        max_delay_ms: 1e4
      }
    }
  },
  time: {
    heartbeat: {
      interval_ms: 6e4,
      enabled: true
    },
    scheduler: {
      max_scheduled_items: 100,
      persist_schedules: true
    }
  },
  external: {
    file_watcher: {
      incoming_dir: ".goodvibes/events/incoming",
      processed_dir: ".goodvibes/events/processed",
      error_dir: ".goodvibes/events/errors",
      max_files_per_scan: 50
    },
    http_listener: {
      enabled: false,
      port: DEFAULT_HTTP_LISTENER_PORT,
      bind_mode: "localhost",
      address: "127.0.0.1",
      max_payload_bytes: 1 * 1024 * 1024
      // 1MB
    }
  }
};
function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const baseVal = base[key];
    const overrideVal = override[key];
    if (overrideVal !== void 0 && overrideVal !== null && typeof overrideVal === "object" && !Array.isArray(overrideVal) && typeof baseVal === "object" && baseVal !== null) {
      result[key] = deepMerge(baseVal, overrideVal);
    } else if (overrideVal !== void 0) {
      result[key] = overrideVal;
    }
  }
  return result;
}
__name(deepMerge, "deepMerge");
function validateConfig(config) {
  const nums = [
    ["persistence.checkpoint_interval_ms", config.persistence.checkpoint_interval_ms],
    ["health.memory_warn_mb", config.health.memory_warn_mb],
    ["health.memory_critical_mb", config.health.memory_critical_mb],
    ["executor.daemon.tick_interval_ms", config.executor.daemon.tick_interval_ms],
    ["executor.transport.rpc_timeout_ms", config.executor.transport.rpc_timeout_ms]
  ];
  for (const [name, val] of nums) {
    if (typeof val !== "number" || val < 0 || !Number.isFinite(val)) {
      throw new ConfigError(`Invalid config: ${name} must be a non-negative finite number, got ${val}`);
    }
  }
}
__name(validateConfig, "validateConfig");
function resolveRoot(projectRoot) {
  return projectRoot ?? process.cwd();
}
__name(resolveRoot, "resolveRoot");
function loadConfig(projectRoot) {
  const root = resolveRoot(projectRoot);
  const goodvibesPath = (0, import_node_path2.join)(root, ".goodvibes", "goodvibes.json");
  try {
    const raw = (0, import_node_fs2.readFileSync)(goodvibesPath, "utf-8");
    const parsed = safeJsonParse(raw, null);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) && "runtime" in parsed) {
      const runtimeSection = parsed.runtime;
      if (typeof runtimeSection === "object" && runtimeSection !== null && !Array.isArray(runtimeSection)) {
        const knownKeys = Object.keys(DEFAULT_CONFIG);
        const filtered = {};
        for (const key of knownKeys) {
          if (key in runtimeSection) {
            filtered[key] = runtimeSection[key];
          }
        }
        const merged = deepMerge(DEFAULT_CONFIG, filtered);
        validateConfig(merged);
        process.stderr.write(
          `[runtime-engine] Config loaded from ${goodvibesPath} (http_listener.enabled=${merged.external.http_listener.enabled})
`
        );
        return merged;
      }
      process.stderr.write(
        `[runtime-engine] Warning: goodvibes.json has no valid "runtime" object \u2014 trying legacy config
`
      );
    } else {
      process.stderr.write(
        `[runtime-engine] Warning: goodvibes.json has no "runtime" key \u2014 trying legacy config
`
      );
    }
  } catch (err) {
    if (!(err instanceof Error && "code" in err && err.code === "ENOENT")) {
      process.stderr.write(
        `[runtime-engine] Warning: failed to read goodvibes.json at "${goodvibesPath}": ${toErrorMessage(err)} \u2014 trying legacy config
`
      );
    }
  }
  const configPath = (0, import_node_path2.join)(root, ".goodvibes", "state", "runtime-config.json");
  try {
    const raw = (0, import_node_fs2.readFileSync)(configPath, "utf-8");
    const parsed = safeJsonParse(raw, null);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      process.stderr.write(
        `[runtime-engine] Warning: config at "${configPath}" is not an object \u2014 using defaults
`
      );
      return { ...DEFAULT_CONFIG };
    }
    const merged = deepMerge(DEFAULT_CONFIG, parsed);
    validateConfig(merged);
    process.stderr.write(
      `[runtime-engine] Config loaded from legacy ${configPath} (http_listener.enabled=${merged.external.http_listener.enabled})
`
    );
    return merged;
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
    } else {
      process.stderr.write(
        `[runtime-engine] Warning: failed to load config at "${configPath}": ${toErrorMessage(err)} \u2014 using defaults
`
      );
    }
    return { ...DEFAULT_CONFIG };
  }
}
__name(loadConfig, "loadConfig");
function saveConfig(projectRoot, config) {
  const goodvibesPath = (0, import_node_path2.join)(projectRoot, ".goodvibes", "goodvibes.json");
  let existing = {};
  try {
    const raw = (0, import_node_fs2.readFileSync)(goodvibesPath, "utf-8");
    existing = safeJsonParse(raw, {}) ?? {};
  } catch {
  }
  const existingRuntime = typeof existing.runtime === "object" && existing.runtime !== null ? existing.runtime : {};
  const configKeys = Object.keys(DEFAULT_CONFIG);
  const updatedRuntime = { ...existingRuntime };
  for (const key of configKeys) {
    updatedRuntime[key] = config[key];
  }
  existing.runtime = updatedRuntime;
  writeJsonSync(goodvibesPath, existing);
}
__name(saveConfig, "saveConfig");

// src/shared/logger.ts
var LEVEL_ORDER = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
var _cachedLevel;
var _cacheExpiresAt = 0;
var LOG_LEVEL_CACHE_TTL_MS = 5e3;
function resolveActiveLevel() {
  const now = Date.now();
  if (_cachedLevel !== void 0 && now < _cacheExpiresAt) return _cachedLevel;
  const raw = (process.env["GOODVIBES_LOG_LEVEL"] ?? "info").toLowerCase();
  _cachedLevel = raw in LEVEL_ORDER ? raw : "info";
  _cacheExpiresAt = now + LOG_LEVEL_CACHE_TTL_MS;
  return _cachedLevel;
}
__name(resolveActiveLevel, "resolveActiveLevel");
function createLogger(component) {
  function write(level, message, metadata) {
    const activeLevel = resolveActiveLevel();
    if (LEVEL_ORDER[level] < LEVEL_ORDER[activeLevel]) return;
    const entry = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      component,
      message,
      ...metadata !== void 0 ? { metadata } : {}
    };
    process.stderr.write(JSON.stringify(entry) + "\n");
  }
  __name(write, "write");
  return {
    debug: /* @__PURE__ */ __name((msg, meta) => write("debug", msg, meta), "debug"),
    info: /* @__PURE__ */ __name((msg, meta) => write("info", msg, meta), "info"),
    warn: /* @__PURE__ */ __name((msg, meta) => write("warn", msg, meta), "warn"),
    error: /* @__PURE__ */ __name((msg, meta) => write("error", msg, meta), "error")
  };
}
__name(createLogger, "createLogger");

// src/core/utils/pid-file.ts
var import_node_fs3 = require("node:fs");
var import_node_crypto2 = require("node:crypto");
var import_node_path3 = require("node:path");
var import_node_os2 = require("node:os");
var logger = createLogger("pid-file");
function getPidFilePath(projectRoot) {
  const hash = (0, import_node_crypto2.createHash)("sha256").update(projectRoot).digest("hex").slice(0, 8);
  return (0, import_node_path3.join)((0, import_node_os2.tmpdir)(), `goodvibes-runtime-engine-${hash}-${process.pid}.pid`);
}
__name(getPidFilePath, "getPidFilePath");
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
__name(isProcessRunning, "isProcessRunning");
function writePidFile(projectRoot) {
  const pidFilePath = getPidFilePath(projectRoot);
  try {
    (0, import_node_fs3.writeFileSync)(pidFilePath, String(process.pid), { encoding: "utf-8", mode: 384 });
    logger.debug("PID file written", { path: pidFilePath, pid: process.pid });
  } catch (err) {
    logger.warn("Could not write PID file", {
      err: toErrorMessage(err)
    });
  }
}
__name(writePidFile, "writePidFile");
function removePidFile(projectRoot) {
  const pidFilePath = getPidFilePath(projectRoot);
  try {
    (0, import_node_fs3.unlinkSync)(pidFilePath);
    logger.debug("PID file removed", { path: pidFilePath });
  } catch (err) {
    if (err.code !== "ENOENT") {
      logger.warn("Could not remove PID file", { err: toErrorMessage(err) });
    }
  }
}
__name(removePidFile, "removePidFile");
async function checkCrashRecovery(projectRoot) {
  const pidFilePath = getPidFilePath(projectRoot);
  if (!(0, import_node_fs3.existsSync)(pidFilePath)) return;
  try {
    const stalePid = (0, import_node_fs3.readFileSync)(pidFilePath, "utf-8").trim();
    const currentPid = String(process.pid);
    if (stalePid !== currentPid) {
      const pid = Number(stalePid);
      if (Number.isNaN(pid) || pid <= 0 || !Number.isInteger(pid)) {
        logger.warn("Stale PID file contains invalid data \u2014 removing", {
          content: stalePid.slice(0, 20),
          pid_file: pidFilePath
        });
        removePidFile(projectRoot);
        return;
      }
      const staleProcessAlive = isProcessRunning(pid);
      if (staleProcessAlive) {
        logger.warn("Stale PID file points to a running process \u2014 another instance may be active", {
          stale_pid: stalePid,
          pid_file: pidFilePath
        });
      } else {
        logger.warn("Stale PID file detected \u2014 possible crash recovery", {
          stale_pid: stalePid
        });
      }
      removePidFile(projectRoot);
    }
  } catch (err) {
    logger.warn("Could not read stale PID file", {
      err: toErrorMessage(err)
    });
  }
}
__name(checkCrashRecovery, "checkCrashRecovery");

// src/core/observability/health.ts
var MIN_HEALTHY_UPTIME_MS = 1e3;
var MEMORY_CACHE_TTL_MS = 5e3;
var HealthChecker = class {
  static {
    __name(this, "HealthChecker");
  }
  config;
  startTime;
  cachedMemoryMb = 0;
  memoryCachedAt = 0;
  /**
   * @param config - Runtime configuration (used for feature flags and version).
   * @param startTime - Engine start time as a Unix epoch millisecond timestamp.
   */
  constructor(config, startTime) {
    this.config = config;
    this.startTime = startTime;
  }
  /**
   * Update the runtime configuration held by this checker.
   *
   * Must be called whenever RuntimeEngine.updateConfig() is invoked so
   * that memory thresholds and feature flags stay in sync.
   *
   * @param config - The new {@link RuntimeConfig} to apply.
   */
  updateConfig(config) {
    this.config = config;
  }
  /**
   * Run all health checks and return the aggregated HealthStatus.
   *
   * The overall status is:
   * - 'healthy'   — all checks pass
   * - 'degraded'  — at least one check warns, none fail
   * - 'unhealthy' — at least one check fails
   *
   * @returns Current health status with individual check results.
   */
  check() {
    const uptime_ms = Date.now() - this.startTime;
    const pid = process.pid;
    const now = Date.now();
    if (now - this.memoryCachedAt > MEMORY_CACHE_TTL_MS) {
      this.cachedMemoryMb = process.memoryUsage().rss / (1024 * 1024);
      this.memoryCachedAt = now;
    }
    const memoryMb = this.cachedMemoryMb;
    const checks = [
      this.checkMemory(memoryMb),
      this.checkUptime(uptime_ms)
    ];
    const status = this.aggregateStatus(checks);
    return {
      status,
      uptime_ms,
      pid,
      memory_usage_mb: Math.round(memoryMb * 100) / 100,
      event_queue_depth: 0,
      active_workflows: 0,
      active_agents: 0,
      ipc_clients: 0,
      last_event_at: null,
      checks,
      features: this.getFeatureFlags(),
      version: ENGINE_VERSION
    };
  }
  /**
   * Check current RSS memory usage against warning/critical thresholds.
   *
   * @param memoryMb - Current RSS memory in megabytes.
   * @returns HealthCheck result for memory.
   */
  checkMemory(memoryMb) {
    const start = Date.now();
    const warnMb = this.config.health.memory_warn_mb;
    const criticalMb = this.config.health.memory_critical_mb;
    if (memoryMb > criticalMb) {
      return {
        name: "memory",
        status: "fail",
        message: `RSS memory ${memoryMb.toFixed(1)} MB exceeds critical threshold of ${criticalMb} MB`,
        duration_ms: Date.now() - start
      };
    }
    if (memoryMb > warnMb) {
      return {
        name: "memory",
        status: "warn",
        message: `RSS memory ${memoryMb.toFixed(1)} MB exceeds warning threshold of ${warnMb} MB`,
        duration_ms: Date.now() - start
      };
    }
    return {
      name: "memory",
      status: "pass",
      message: `RSS memory ${memoryMb.toFixed(1)} MB within limits`,
      duration_ms: Date.now() - start
    };
  }
  /**
   * Check that the engine has been running for at least the minimum healthy
   * uptime window, indicating a stable startup.
   *
   * @param uptime_ms - Milliseconds since engine startup.
   * @returns HealthCheck result for uptime.
   */
  checkUptime(uptime_ms) {
    const start = Date.now();
    if (uptime_ms < MIN_HEALTHY_UPTIME_MS) {
      return {
        name: "uptime",
        status: "warn",
        message: `Engine started ${uptime_ms} ms ago \u2014 still in startup window`,
        duration_ms: Date.now() - start
      };
    }
    return {
      name: "uptime",
      status: "pass",
      message: `Engine running for ${Math.round(uptime_ms / 1e3)} s`,
      duration_ms: Date.now() - start
    };
  }
  /**
   * Build the feature flag map from runtime configuration.
   *
   * @returns Record of feature flag names to boolean enabled states.
   */
  getFeatureFlags() {
    const flags = {};
    if (this.config.features) {
      for (const [key, value] of Object.entries(this.config.features)) {
        flags[key] = Boolean(value);
      }
    }
    return flags;
  }
  /**
   * Aggregate individual check statuses into a single overall status.
   *
   * @param checks - Array of completed health check results.
   * @returns 'healthy', 'degraded', or 'unhealthy'.
   */
  aggregateStatus(checks) {
    if (checks.some((c) => c.status === "fail")) return "unhealthy";
    if (checks.some((c) => c.status === "warn")) return "degraded";
    return "healthy";
  }
};

// src/extensions/events/subsystem.ts
var import_node_path5 = require("node:path");

// src/core/utils/fs-utils.ts
var import_node_fs4 = require("node:fs");
function ensureDirSync(dirPath) {
  (0, import_node_fs4.mkdirSync)(dirPath, { recursive: true });
}
__name(ensureDirSync, "ensureDirSync");

// src/extensions/events/event-bus.ts
var logger2 = createLogger("event-bus");
var TimeoutError = class extends Error {
  static {
    __name(this, "TimeoutError");
  }
  code = "HANDLER_TIMEOUT";
  constructor(timeoutMs) {
    super(`Handler timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
};
function semaphoreAcquire(sem) {
  if (sem.running < sem.max) {
    sem.running++;
    return Promise.resolve();
  }
  return new Promise((resolve2) => {
    sem.queue.push(resolve2);
  });
}
__name(semaphoreAcquire, "semaphoreAcquire");
function semaphoreRelease(sem) {
  const next = sem.queue.shift();
  if (next) {
    next();
  } else {
    sem.running--;
  }
}
__name(semaphoreRelease, "semaphoreRelease");
function invokeWithTimeout(handler, event, timeoutMs) {
  let resultPromise;
  try {
    const result = handler(event);
    resultPromise = result instanceof Promise ? result : Promise.resolve();
  } catch (err) {
    return Promise.reject(err);
  }
  if (timeoutMs === void 0 || timeoutMs <= 0) {
    return resultPromise;
  }
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs);
  });
  return Promise.race([resultPromise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}
__name(invokeWithTimeout, "invokeWithTimeout");
function dispatchToEntry(entry, event, pattern) {
  const { handler, options } = entry;
  const handleError = /* @__PURE__ */ __name((err) => {
    const error = err instanceof Error ? err : new Error(String(err));
    if (options.onError) {
      try {
        options.onError(error, event);
      } catch (cbErr) {
        logger2.warn("onError callback threw", { pattern, error: toErrorMessage(cbErr) });
      }
    } else {
      logger2.warn("Async handler error", { pattern, error: toErrorMessage(err) });
    }
  }, "handleError");
  const execute = /* @__PURE__ */ __name(async () => {
    const sem = entry.semaphore;
    if (sem) {
      await semaphoreAcquire(sem);
    }
    try {
      await invokeWithTimeout(handler, event, options.timeout);
    } catch (err) {
      handleError(err);
    } finally {
      if (sem) {
        semaphoreRelease(sem);
      }
    }
  }, "execute");
  if (options.ordered) {
    const prev = entry.orderedTail ?? Promise.resolve();
    const current = prev.then(execute).catch(() => {
    });
    entry.orderedTail = current;
    current.then(() => {
      if (entry.orderedTail === current) {
        entry.orderedTail = void 0;
      }
    });
  } else {
    execute().catch(() => {
    });
  }
}
__name(dispatchToEntry, "dispatchToEntry");
var EventBus = class {
  static {
    __name(this, "EventBus");
  }
  /**
   * Registered handlers keyed by subscription pattern.
   * Each pattern maps to a Map of (unique symbol → SubscriptionEntry).
   * Using a symbol key preserves insertion order and supports O(1) deletion.
   */
  handlers;
  /** Monotonically increasing sequence counter. Starts at 1 for the first event. */
  sequence = 0;
  /** Ring buffer storage for history events. */
  historyBuffer;
  /** Write index into the circular history buffer. */
  historyWriteIndex = 0;
  /** Number of events currently in the history buffer. */
  historyCount = 0;
  /** Maximum events to retain in the history ring buffer. */
  maxHistorySize;
  /** Optional persistent event log. Set by the process-manager after construction. */
  eventLog;
  /**
   * Creates a new EventBus instance.
   *
   * @param maxHistorySize - Maximum number of events to retain in the in-memory
   *   ring buffer. Older events are evicted when the buffer is full.
   *   Defaults to 10,000.
   *
   * @remarks
   * When `maxHistorySize` is `0`, the ring buffer is disabled entirely: events
   * are still emitted and dispatched to subscribers, but no history is retained.
   * `getHistory()` will always return an empty array. This is a valid
   * configuration when in-memory history is not needed.
   *
   * Negative values are treated identically to `0` (no history). Passing a
   * fractional value is coerced to an integer via `Math.max(0, Math.floor(...))`.
   */
  constructor(maxHistorySize = 1e4) {
    this.handlers = /* @__PURE__ */ new Map();
    const safeSize = Math.max(0, Math.floor(maxHistorySize));
    this.historyBuffer = safeSize > 0 ? new Array(safeSize) : [];
    this.maxHistorySize = safeSize;
  }
  /**
   * Injects a persistent event log.
   *
   * Called by the process-manager once the persistence layer is initialised.
   * After this point every emitted event is also appended to the log.
   *
   * @param log - An object with an `append` method.
   */
  setEventLog(log9) {
    this.eventLog = log9;
  }
  /**
   * Emits a runtime event.
   *
   * Automatically fills in missing metadata fields and assigns the next
   * sequence number. Matching handlers execute synchronously in registration
   * order; async handlers are fire-and-forget with errors logged via structured logger.
   *
   * @param event - Partial event. The `id`, `timestamp`, and full `metadata`
   *   may be omitted — the bus will generate or backfill them.
   * @returns The fully-formed RuntimeEvent as stored in history.
   */
  emit(event) {
    const seq = ++this.sequence;
    const full = {
      id: event.id ?? generateEventId(),
      timestamp: event.timestamp ?? timestamp(),
      priority: event.priority ?? 0,
      source: event.source,
      type: event.type,
      payload: event.payload,
      metadata: {
        session_id: event.metadata?.session_id ?? process.env["CLAUDE_SESSION_ID"] ?? process.env["SESSION_ID"] ?? "unknown",
        correlation_id: event.metadata?.correlation_id,
        causation_id: event.metadata?.causation_id,
        sequence: seq,
        version: 1
      }
    };
    if (this.eventLog) {
      try {
        this.eventLog.append(full);
      } catch (err) {
        logger2.error("Event log append failed", { error: toErrorMessage(err) });
      }
    }
    if (this.maxHistorySize > 0) {
      this.historyBuffer[this.historyWriteIndex % this.maxHistorySize] = full;
      this.historyWriteIndex++;
      if (this.historyWriteIndex >= Number.MAX_SAFE_INTEGER - this.maxHistorySize) {
        this.historyWriteIndex = this.historyWriteIndex % this.maxHistorySize;
      }
      if (this.historyCount < this.maxHistorySize) this.historyCount++;
    }
    for (const [pattern, entryMap] of this.handlers) {
      if (this.matchPattern(full.type, pattern)) {
        for (const entry of entryMap.values()) {
          dispatchToEntry(entry, full, pattern);
        }
      }
    }
    return full;
  }
  /**
   * Subscribes to events matching `pattern`.
   *
   * @param pattern - Exact event type, namespace wildcard (`hook:*`), or global wildcard (`*`).
   * @param handler - Callback invoked for each matching event.
   * @param options - Optional subscription options (backpressure, timeout, dead-letter, ordering).
   * @returns An unsubscribe function; call it to stop receiving events.
   */
  on(pattern, handler, options) {
    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, /* @__PURE__ */ new Map());
    }
    const key = /* @__PURE__ */ Symbol();
    const opts = options ?? {};
    const entry = {
      handler,
      options: opts,
      semaphore: opts.maxConcurrent !== void 0 && opts.maxConcurrent > 0 ? { running: 0, max: opts.maxConcurrent, queue: [] } : void 0
    };
    this.handlers.get(pattern)?.set(key, entry);
    return () => {
      const entryMap = this.handlers.get(pattern);
      if (entryMap) {
        entryMap.delete(key);
        if (entryMap.size === 0) {
          this.handlers.delete(pattern);
        }
      }
    };
  }
  /**
   * Subscribes to the next single event matching `pattern`.
   *
   * The subscription is automatically removed after the first delivery.
   *
   * @param pattern - Exact event type, namespace wildcard, or global wildcard.
   * @param handler - Callback invoked once for the next matching event.
   * @param options - Optional subscription options (backpressure, timeout, dead-letter, ordering).
   * @returns An unsubscribe function; call it to cancel before the event fires.
   */
  once(pattern, handler, options) {
    const off = this.on(
      pattern,
      (event) => {
        off();
        return handler(event);
      },
      options
    );
    return off;
  }
  /**
   * Returns a snapshot of the in-memory event history, optionally filtered.
   *
   * This operates on the ring buffer only — events evicted from the buffer
   * are not available here. For full historical replay, use the persistent
   * event log via the process-manager.
   *
   * @param filter - Optional filter criteria.
   * @returns Filtered and (optionally) limited array of events in emission order.
   */
  getHistory(filter) {
    const events = [];
    if (this.historyCount > 0) {
      const startIndex = this.historyCount < this.maxHistorySize ? 0 : this.historyWriteIndex % this.maxHistorySize;
      for (let i = 0; i < this.historyCount; i++) {
        const entry = this.historyBuffer[(startIndex + i) % this.maxHistorySize];
        if (entry !== void 0) events.push(entry);
      }
    }
    let filteredEvents = events;
    if (filter) {
      if (filter.types && filter.types.length > 0) {
        const typeSet = new Set(filter.types);
        filteredEvents = filteredEvents.filter((e) => typeSet.has(e.type));
      }
      if (filter.source) {
        const src = filter.source;
        filteredEvents = filteredEvents.filter((e) => {
          for (const key of Object.keys(src)) {
            if (src[key] !== void 0 && e.source[key] !== src[key]) {
              return false;
            }
          }
          return true;
        });
      }
      if (filter.since) {
        const since = new Date(filter.since).getTime();
        filteredEvents = filteredEvents.filter((e) => new Date(e.timestamp).getTime() >= since);
      }
      if (filter.until) {
        const until = new Date(filter.until).getTime();
        filteredEvents = filteredEvents.filter((e) => new Date(e.timestamp).getTime() <= until);
      }
      if (filter.correlation_id) {
        const cid = filter.correlation_id;
        filteredEvents = filteredEvents.filter((e) => e.metadata.correlation_id === cid);
      }
      if (filter.limit && filter.limit > 0) {
        filteredEvents = filteredEvents.slice(-filter.limit);
      }
    }
    return filteredEvents;
  }
  /**
   * Returns the total number of registered handler functions.
   *
   * @param pattern - If provided, returns the count only for that pattern.
   *   If omitted, returns the total across all patterns.
   * @returns Handler count.
   */
  listenerCount(pattern) {
    if (pattern !== void 0) {
      return this.handlers.get(pattern)?.size ?? 0;
    }
    let total = 0;
    for (const entryMap of this.handlers.values()) {
      total += entryMap.size;
    }
    return total;
  }
  /**
   * Removes all registered handlers.
   *
   * Should be called during engine shutdown to prevent memory leaks.
   */
  removeAllListeners() {
    this.handlers.clear();
    this.historyBuffer = new Array(this.maxHistorySize);
    this.historyWriteIndex = 0;
    this.historyCount = 0;
  }
  /**
   * Tests whether `eventType` matches the given subscription `pattern`.
   *
   * Rules:
   * - `'*'` matches any event type
   * - `'namespace:*'` matches any event whose type starts with `namespace:`
   * - An exact string matches only that specific type
   *
   * @param eventType - The event type to test (e.g. `'hook:pre_tool_use'`).
   * @param pattern - The subscription pattern to test against.
   * @returns `true` if the event type matches the pattern.
   */
  matchPattern(eventType, pattern) {
    if (pattern === "*") {
      return true;
    }
    if (pattern.endsWith(":*")) {
      const namespace = pattern.slice(0, -2);
      return eventType.startsWith(`${namespace}:`);
    }
    return eventType === pattern;
  }
};

// src/extensions/events/event-log.ts
var import_node_fs5 = require("node:fs");
var readline = __toESM(require("node:readline"), 1);
var import_node_path4 = require("node:path");
var logger3 = createLogger("event-log");
var FLUSH_INTERVAL_MS = 100;
var FLUSH_THRESHOLD_BYTES = 64 * 1024;
var EventLog = class {
  static {
    __name(this, "EventLog");
  }
  /** Absolute path to the active JSONL log file. */
  logPath;
  /** Directory for archived JSONL files. */
  archiveDir;
  /** The most recently seen sequence number (recovered on init). */
  latestSeq = 0;
  /** Count of events in the current log file. */
  eventCount = 0;
  /** Cached per-type event counts (updated on every append). */
  typeCountCache = {};
  /** Timestamp of the oldest event (recovered on init). */
  oldestEvent;
  /** Timestamp of the newest event (updated on every append). */
  newestEvent;
  /** Maximum log file size in megabytes before rotation is needed. */
  maxSizeMb;
  /** Events older than this many hours are eligible for compaction. */
  compactAfterHours;
  // ─── Async write state ──────────────────────────────────────────────────────
  /** Active write stream for non-blocking appends. Created lazily. */
  writeStream = null;
  /** Pending write buffer (not yet flushed to disk). */
  writeBuffer = "";
  /** Size of writeBuffer in bytes. */
  writeBufferBytes = 0;
  /** NodeJS timer handle for the periodic flush. */
  flushTimer = null;
  /** Whether the stream has been closed (post-shutdown). */
  closed = false;
  /** Whether we are currently draining the buffer to disk (prevents re-entry). */
  flushing = false;
  /** Queue of flush waiters (resolve/reject pairs). */
  flushWaiters = [];
  /**
   * Creates a new EventLog instance.
   *
   * @param stateDir - Absolute path to the directory where the JSONL log file
   *   and archive subdirectory will be stored. Created on first write if absent.
   * @param config - Configuration for log size and compaction:
   *   - `event_log_max_size_mb`: Informational threshold for triggering log
   *     rotation. Currently not actively enforced inside `append()` — it is
   *     the caller's responsibility to call `compact()` or rotate when the
   *     reported `file_size_bytes` exceeds this value. Passing `0` does not
   *     cause errors; it simply means no size-based rotation threshold is set.
   *   - `compact_after_hours`: Events older than this many hours are eligible
   *     for archival when `compact()` is called. Passing `0` means the cutoff
   *     is `now`, so **every** existing event will be archived on the next
   *     `compact()` call, leaving the main log empty. This is valid but
   *     aggressive — use with care in production.
   */
  constructor(stateDir, config) {
    this.logPath = (0, import_node_path4.join)(stateDir, "events.jsonl");
    this.archiveDir = (0, import_node_path4.join)(stateDir, "event-archives");
    this.maxSizeMb = config.event_log_max_size_mb;
    this.compactAfterHours = config.compact_after_hours;
  }
  /**
   * Initialises the event log by streaming the existing file (if any) to recover
   * the latest sequence number, event count, and oldest/newest timestamps.
   *
   * Safe to call on a fresh (non-existent) log file.
   */
  async initialize() {
    try {
      let skippedLines = 0;
      await this.streamLines(this.logPath, (line) => {
        try {
          const event = safeJsonParse(line, null);
          if (event === null) {
            skippedLines++;
            return;
          }
          if (typeof event.metadata?.sequence === "number" && event.metadata.sequence > this.latestSeq) {
            this.latestSeq = event.metadata.sequence;
          }
          if (event.type) {
            this.typeCountCache[event.type] = (this.typeCountCache[event.type] ?? 0) + 1;
          }
          const ts = event.timestamp;
          if (ts) {
            if (!this.oldestEvent || ts < this.oldestEvent) this.oldestEvent = ts;
            if (!this.newestEvent || ts > this.newestEvent) this.newestEvent = ts;
          }
          this.eventCount++;
        } catch {
          skippedLines++;
        }
      });
      if (skippedLines > 0) {
        logger3.warn("Skipped malformed lines during initialize", { count: skippedLines, file: this.logPath });
      }
      logger3.info("Event log initialised", {
        events: this.eventCount,
        latest_seq: this.latestSeq
      });
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        logger3.debug("Event log file not found, starting fresh");
      } else {
        logger3.warn("Error reading event log on init", { error: toErrorMessage(err) });
      }
    }
    this.openWriteStream();
  }
  /**
   * Appends an event to the write buffer.
   *
   * This method is synchronous from the caller's perspective — it adds
   * the serialised event to an in-memory buffer and triggers a background
   * flush if the buffer exceeds the threshold. Actual disk I/O is async.
   *
   * @param event - The event to persist.
   */
  append(event) {
    if (this.closed) return;
    const line = JSON.stringify(event) + "\n";
    this.writeBuffer += line;
    this.writeBufferBytes += Buffer.byteLength(line, "utf-8");
    if (typeof event.metadata?.sequence === "number" && event.metadata.sequence > this.latestSeq) {
      this.latestSeq = event.metadata.sequence;
    }
    this.eventCount++;
    if (event.type) {
      this.typeCountCache[event.type] = (this.typeCountCache[event.type] ?? 0) + 1;
    }
    if (event.timestamp) {
      if (!this.oldestEvent) this.oldestEvent = event.timestamp;
      this.newestEvent = event.timestamp;
    }
    if (this.writeBufferBytes >= FLUSH_THRESHOLD_BYTES) {
      this.scheduleFlush();
    }
    this.ensureFlushTimer();
  }
  /**
   * Explicitly flushes the write buffer to disk.
   *
   * Call before checkpoint saves or shutdown to guarantee durability.
   *
   * @returns A Promise that resolves once the buffer has been written.
   */
  async flush() {
    if (this.writeBuffer.length === 0) return;
    return new Promise((resolve2, reject) => {
      this.flushWaiters.push({ resolve: resolve2, reject });
      this.scheduleFlush();
    });
  }
  /**
   * Flushes the buffer and closes the write stream.
   *
   * Should be called during engine shutdown after all appends are complete.
   *
   * @returns A Promise that resolves once the stream is fully closed.
   */
  async close() {
    this.closed = true;
    this.stopFlushTimer();
    if (this.writeBuffer.length > 0) {
      await this.drainBuffer();
    }
    if (this.writeBuffer.length > 0) {
      try {
        const { appendFileSync } = await import("fs");
        appendFileSync(this.logPath, this.writeBuffer, "utf-8");
        this.writeBuffer = "";
        this.writeBufferBytes = 0;
      } catch (syncErr) {
        logger3.debug("Sync fallback write failed during close", { error: toErrorMessage(syncErr) });
      }
    }
    if (this.writeStream) {
      const stream = this.writeStream;
      await new Promise((resolve2) => {
        stream.end(() => {
          this.writeStream = null;
          resolve2();
        });
      });
    }
  }
  /**
   * Queries the log using streaming reads, applying filters during streaming.
   *
   * Supports early termination when `limit` is reached without reading the
   * full file.
   *
   * @param filter - Optional filter criteria.
   * @returns Array of matching events in chronological order.
   */
  async query(filter = {}) {
    if (this.writeBuffer.length > 0) {
      await this.drainBuffer();
    }
    const results = [];
    const limit = filter.limit;
    let skippedLines = 0;
    try {
      await this.streamLines(this.logPath, (line) => {
        if (limit !== void 0 && results.length >= limit) {
          return false;
        }
        try {
          const event = safeJsonParse(line, null);
          if (event === null) {
            skippedLines++;
            return true;
          }
          if (this.matchesFilter(event, filter)) {
            results.push(event);
          }
        } catch {
          skippedLines++;
        }
        return true;
      });
      if (skippedLines > 0) {
        logger3.warn("Skipped malformed lines during query", { count: skippedLines, file: this.logPath });
      }
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return [];
      }
      throw err;
    }
    return results;
  }
  /**
   * Returns events with a sequence number greater than `sequence`.
   *
   * @param sequence - The last sequence number the caller has seen.
   * @param limit - Maximum number of events to return.
   */
  async since(sequence, limit) {
    return this.query({
      since_sequence: sequence,
      limit
    });
  }
  /**
   * Returns the latest sequence number seen in the log.
   */
  getLatestSequence() {
    return this.latestSeq;
  }
  /**
   * Compacts the event log by archiving events older than the configured
   * threshold to a per-day archive file.
   *
   * The main log is atomically replaced with only the retained events
   * (tmp write + rename, matching the state-store pattern).
   *
   * @param beforeTimestamp - Optional epoch ms cutoff; events before this
   *   timestamp are archived. Defaults to `compactAfterHours` ago.
   * @returns Counts of archived and remaining events.
   */
  async compact(beforeTimestamp) {
    if (this.writeBuffer.length > 0) {
      await this.drainBuffer();
    }
    const cutoff = beforeTimestamp ?? Date.now() - this.compactAfterHours * 60 * 60 * 1e3;
    const toArchive = [];
    const toKeep = [];
    let skippedLines = 0;
    try {
      await this.streamLines(this.logPath, (line) => {
        try {
          const event = safeJsonParse(line, null);
          if (event === null) {
            toKeep.push(line);
            skippedLines++;
            return true;
          }
          const ts = event.timestamp ?? 0;
          if (ts < cutoff) {
            toArchive.push(line);
          } else {
            toKeep.push(line);
          }
        } catch {
          toKeep.push(line);
          skippedLines++;
        }
        return true;
      });
      if (skippedLines > 0) {
        logger3.warn("Skipped malformed lines during compact", { count: skippedLines, file: this.logPath });
      }
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return { archived: 0, remaining: 0 };
      }
      throw err;
    }
    if (toArchive.length === 0) {
      logger3.debug("Compaction: no events to archive");
      return { archived: 0, remaining: toKeep.length };
    }
    await this.closeWriteStream();
    ensureDirSync(this.archiveDir);
    const archiveDate = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const archivePath = (0, import_node_path4.join)(
      this.archiveDir,
      `events-archive-${archiveDate}.jsonl`
    );
    try {
      const { appendFileSync } = await import("fs");
      appendFileSync(archivePath, toArchive.join("\n") + "\n", "utf-8");
    } catch (archiveErr) {
      logger3.debug("Archive append failed, creating new archive file", { error: toErrorMessage(archiveErr) });
      (0, import_node_fs5.writeFileSync)(archivePath, toArchive.join("\n") + "\n", "utf-8");
    }
    writeAtomicSync(this.logPath, toKeep.join("\n") + (toKeep.length > 0 ? "\n" : ""));
    if (!this.closed) {
      this.openWriteStream();
    }
    this.eventCount = toKeep.length;
    this.rebuildCacheFromLines(toKeep);
    logger3.info("Compaction complete", {
      archived: toArchive.length,
      remaining: toKeep.length,
      archive_file: archivePath
    });
    return { archived: toArchive.length, remaining: toKeep.length };
  }
  /**
   * Returns a statistics snapshot for the event log.
   *
   * Uses cached in-memory values where available; stats the file for size.
   */
  getStats() {
    let fileSizeBytes = 0;
    try {
      fileSizeBytes = (0, import_node_fs5.statSync)(this.logPath).size;
    } catch {
    }
    fileSizeBytes += this.writeBufferBytes;
    return {
      total_events: this.eventCount,
      file_size_bytes: fileSizeBytes,
      oldest_event: this.oldestEvent,
      newest_event: this.newestEvent,
      events_per_type: { ...this.typeCountCache }
    };
  }
  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------
  /**
   * Opens (or re-opens) the write stream in append mode.
   * Silently ignores errors so appends remain safe even if the stream fails.
   */
  openWriteStream() {
    try {
      ensureDirSync((0, import_node_path4.dirname)(this.logPath));
      this.writeStream = (0, import_node_fs5.createWriteStream)(this.logPath, { flags: "a", encoding: "utf-8" });
      this.writeStream.on("error", (err) => {
        logger3.error("Write stream error", { error: err.message });
        this.writeStream = null;
      });
    } catch (err) {
      logger3.error("Failed to open event log write stream", { error: toErrorMessage(err) });
      this.writeStream = null;
    }
  }
  /**
   * Closes the write stream without closing the EventLog itself.
   * Used before compaction to safely replace the underlying file.
   */
  async closeWriteStream() {
    if (!this.writeStream) return;
    const stream = this.writeStream;
    this.writeStream = null;
    await new Promise((resolve2) => {
      stream.end(() => resolve2());
    });
  }
  /**
   * Ensures the periodic flush timer is running.
   */
  ensureFlushTimer() {
    if (this.flushTimer !== null || this.closed) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.scheduleFlush();
    }, FLUSH_INTERVAL_MS);
    this.flushTimer.unref();
  }
  /**
   * Stops the periodic flush timer.
   */
  stopFlushTimer() {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
  /**
   * Schedules an async flush of the write buffer.
   * If a flush is already in progress, it will drain again when done.
   */
  scheduleFlush() {
    if (this.flushing || this.writeBuffer.length === 0) {
      if (this.writeBuffer.length === 0 && this.flushWaiters.length > 0) {
        const waiters = this.flushWaiters.splice(0);
        for (const { resolve: resolve2 } of waiters) resolve2();
      }
      return;
    }
    this.drainBuffer().catch((err) => {
      logger3.warn("Event log flush error", { error: toErrorMessage(err) });
    });
  }
  /**
   * Drains the write buffer to disk.
   * Resolves all queued flush waiters once complete.
   */
  async drainBuffer() {
    if (this.flushing || this.writeBuffer.length === 0) return;
    this.flushing = true;
    const data = this.writeBuffer;
    this.writeBuffer = "";
    this.writeBufferBytes = 0;
    let drainError;
    try {
      if (this.writeStream) {
        const stream = this.writeStream;
        await new Promise((resolve2, reject) => {
          stream.write(data, (err) => {
            if (err) reject(err);
            else resolve2();
          });
        });
      } else {
        const { appendFileSync } = await import("fs");
        appendFileSync(this.logPath, data, "utf-8");
      }
    } catch (err) {
      drainError = err instanceof Error ? err : new Error(toErrorMessage(err));
      logger3.error("Failed to flush event log buffer", { error: toErrorMessage(err) });
      this.writeBuffer = data + this.writeBuffer;
      this.writeBufferBytes = Buffer.byteLength(this.writeBuffer, "utf-8");
    } finally {
      this.flushing = false;
      if (this.flushWaiters.length > 0) {
        const waiters = this.flushWaiters.splice(0);
        if (drainError) {
          for (const { reject } of waiters) reject(drainError);
        } else {
          for (const { resolve: resolve2 } of waiters) resolve2();
        }
      }
      if (this.writeBuffer.length > 0) {
        this.scheduleFlush();
      }
    }
  }
  /**
   * Streams a JSONL file line by line, invoking `onLine` for each non-empty line.
   *
   * If `onLine` returns `false`, streaming stops early (for limit support).
   * Rejects if the file cannot be opened.
   *
   * @param filePath - Absolute path to the JSONL file.
   * @param onLine   - Callback for each non-empty line. Return false to stop early.
   */
  streamLines(filePath, onLine) {
    return new Promise((resolve2, reject) => {
      const stream = (0, import_node_fs5.createReadStream)(filePath, { encoding: "utf-8" });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      let done = false;
      const cleanup = /* @__PURE__ */ __name(() => {
        if (!done) {
          done = true;
          rl.close();
          stream.destroy();
        }
      }, "cleanup");
      const onError = /* @__PURE__ */ __name((err) => {
        if (!done) {
          cleanup();
          reject(err);
        }
      }, "onError");
      rl.on("line", (line) => {
        if (done) return;
        const trimmed = line.trim();
        if (trimmed.length === 0) return;
        const result = onLine(trimmed);
        if (result === false) {
          cleanup();
          resolve2();
        }
      });
      rl.on("close", () => {
        if (!done) {
          done = true;
          resolve2();
        }
      });
      rl.on("error", onError);
      stream.on("error", onError);
    });
  }
  /** Returns true when `event` matches all criteria in `filter`. */
  matchesFilter(event, filter) {
    if (filter.types && filter.types.length > 0) {
      if (!filter.types.includes(event.type)) return false;
    }
    if (filter.since && event.timestamp && event.timestamp < filter.since) return false;
    if (filter.until && event.timestamp && event.timestamp > filter.until) return false;
    if (filter.since_sequence !== void 0 && (typeof event.metadata?.sequence !== "number" || event.metadata.sequence <= filter.since_sequence)) return false;
    if (filter.correlation_id && event.metadata?.correlation_id !== filter.correlation_id) return false;
    if (filter.source) {
      const src = filter.source;
      if (src.kind && event.source.kind !== src.kind) return false;
      if ("hook_name" in src && src.hook_name) {
        if (event.source.kind !== "internal" || event.source.hook_name !== src.hook_name) return false;
      }
      if ("workflow_id" in src && src.workflow_id) {
        if (event.source.kind !== "workflow" || event.source.workflow_id !== src.workflow_id) return false;
      }
      if ("agent_id" in src && src.agent_id) {
        if (event.source.kind !== "agent" || event.source.agent_id !== src.agent_id) return false;
      }
      if ("trigger_id" in src && src.trigger_id) {
        if (event.source.kind !== "trigger" || event.source.trigger_id !== src.trigger_id) return false;
      }
      if ("tool_name" in src && src.tool_name) {
        if (event.source.kind !== "mcp_tool" || event.source.tool_name !== src.tool_name) return false;
      }
      if ("client_id" in src && src.client_id) {
        if (event.source.kind !== "ipc" || event.source.client_id !== src.client_id) return false;
      }
    }
    return true;
  }
  /** Rebuilds the in-memory type/oldest/newest cache from a set of raw JSONL lines. */
  rebuildCacheFromLines(lines) {
    const typeCount = {};
    let oldest;
    let newest;
    let skippedLines = 0;
    for (const line of lines) {
      try {
        const event = safeJsonParse(line, null);
        if (event === null) {
          skippedLines++;
          continue;
        }
        if (event.type) {
          typeCount[event.type] = (typeCount[event.type] ?? 0) + 1;
        }
        const ts = event.timestamp;
        if (ts) {
          if (!oldest || ts < oldest) oldest = ts;
          if (!newest || ts > newest) newest = ts;
        }
      } catch {
        skippedLines++;
      }
    }
    if (skippedLines > 0) {
      logger3.warn("Skipped malformed lines during cache rebuild", { count: skippedLines, file: this.logPath });
    }
    this.typeCountCache = typeCount;
    this.oldestEvent = oldest;
    this.newestEvent = newest;
  }
};

// src/extensions/events/subsystem.ts
var logger4 = createLogger("events-subsystem");
async function createEventSubsystem(config, projectRoot) {
  const eventBus = new EventBus();
  const stateDir = (0, import_node_path5.join)(projectRoot, config.persistence.state_dir);
  ensureDirSync(stateDir);
  const eventLog = new EventLog(stateDir, config.persistence);
  await eventLog.initialize();
  eventBus.setEventLog(eventLog);
  logger4.debug("Event subsystem created");
  return {
    eventBus,
    eventLog,
    async shutdown() {
      eventBus.removeAllListeners();
      await eventLog.flush();
      await eventLog.close();
      logger4.debug("Event subsystem shut down");
    }
  };
}
__name(createEventSubsystem, "createEventSubsystem");

// src/extensions/workflow/workflow-engine.ts
var log = createLogger("workflow-engine");
var WorkflowEngine = class {
  static {
    __name(this, "WorkflowEngine");
  }
  definitions = /* @__PURE__ */ new Map();
  instances = /* @__PURE__ */ new Map();
  guards = /* @__PURE__ */ new Map();
  actionHandlers = /* @__PURE__ */ new Map();
  maxActive;
  maxTransitions;
  actionTimeoutMs;
  maxQueueDepth;
  /**
   * Per-workflow in-flight promise for the cooperative mutex.
   *
   * Keyed by workflow ID. The value is a Promise that resolves when the
   * current in-flight transition (and all previously queued transitions)
   * have completed. New callers chain onto this promise.
   */
  _inFlight = /* @__PURE__ */ new Map();
  /**
   * Per-workflow transition queue.
   *
   * Holds pending sendEvent() calls that arrived while a transition was
   * already in-flight for the same workflow. Drained in FIFO order after
   * each transition completes.
   */
  _queue = /* @__PURE__ */ new Map();
  eventBus;
  directiveQueue;
  /**
   * @param config - Workflow-specific configuration from the runtime config.
   */
  constructor(config) {
    this.maxActive = config.max_active;
    this.maxTransitions = config.max_transitions_per_workflow;
    this.actionTimeoutMs = config.action_timeout_ms ?? 3e4;
    this.maxQueueDepth = config.max_transition_queue_depth ?? 10;
  }
  // ─── Public API ────────────────────────────────────────────────────────
  /**
   * Injects an EventBus for emitting workflow lifecycle events.
   *
   * This dependency is optional. When not set, no external events are emitted
   * but the engine functions correctly for state management.
   *
   * @param bus - The EventBus instance to use for event emission.
   */
  setEventBus(bus) {
    this.eventBus = bus;
  }
  /**
   * Injects a DirectiveQueue for purging stale directives when a workflow
   * reaches a terminal state (completed, cancelled, failed).
   *
   * This dependency is optional. When not set, purge calls are no-ops.
   *
   * @param queue - Object with a `purge(workflowId)` method.
   */
  setDirectiveQueue(queue) {
    this.directiveQueue = queue;
  }
  /**
   * Registers a workflow definition so instances can be created from it.
   *
   * @param def - The WorkflowDefinition to register.
   * @throws {Error} If a definition with the same `id` is already registered.
   */
  registerDefinition(def) {
    if (this.definitions.has(def.id)) {
      throw new WorkflowError(`WorkflowDefinition '${def.id}' is already registered`);
    }
    this.definitions.set(def.id, def);
    log.info("Registered workflow definition", { id: def.id, name: def.name, version: def.version });
  }
  /**
   * Retrieves a registered WorkflowDefinition by its ID.
   *
   * @param id - The definition ID to look up.
   * @returns The definition, or `undefined` if not registered.
   */
  getDefinition(id) {
    return this.definitions.get(id);
  }
  /**
   * Creates a new workflow instance from a registered definition.
   *
   * The instance starts in `initial_state` and executes any `on_enter`
   * actions for that state. A `workflow:created` event is emitted via
   * the EventBus if one is set.
   *
   * @param definitionId    - ID of the WorkflowDefinition to instantiate.
   * @param initialContext  - Optional initial context values.
   * @param instanceId      - Optional custom instance ID (e.g. `wrfc_<agent_id>` for
   *                          deterministic WRFC chain binding). Defaults to a
   *                          randomly-generated `wf_<uuid>` when omitted.
   * @returns The new WorkflowInstance in its initial state.
   * @throws {Error} If the definition is not found or max active limit is reached.
   */
  create(definitionId, initialContext = {}, instanceId) {
    const def = this.definitions.get(definitionId);
    if (!def) {
      throw new WorkflowError(`WorkflowDefinition '${definitionId}' is not registered`);
    }
    const activeCount = this.listActive().length;
    if (activeCount >= this.maxActive) {
      throw new WorkflowError(
        `Cannot create workflow: max_active limit (${this.maxActive}) reached`
      );
    }
    const now = timestamp();
    const instance = {
      id: instanceId ?? generateWorkflowId(),
      definition_id: definitionId,
      current_state: def.initial_state,
      context: { ...initialContext },
      history: [],
      created_at: now,
      updated_at: now,
      status: "active"
    };
    this.instances.set(instance.id, instance);
    log.info("Workflow instance created", {
      id: instance.id,
      definition_id: definitionId,
      initial_state: def.initial_state
    });
    const initialState = def.states[def.initial_state];
    if (initialState?.on_enter) {
      void this.executeActions(initialState.on_enter, instance.context);
    }
    this.emitWorkflowEvent("workflow:created", instance, { initial_state: def.initial_state, context: { ...instance.context } });
    return instance;
  }
  /**
   * Sends a RuntimeEvent to a specific workflow instance, potentially
   * triggering a state transition.
   *
   * **Concurrency:** `sendEvent()` is async and serialises concurrent
   * transition requests for the same workflow via a cooperative per-workflow
   * mutex (promise chain). If a transition is already in-flight, the new
   * request is queued. If the queue is full (max_transition_queue_depth), the
   * request is dropped and `null` is returned.
   *
   * **Action execution:** All actions (on_exit, transition, on_enter) are
   * awaited in sequence. If any action exceeds `action_timeout_ms`, a
   * WorkflowTimeoutError is thrown. If any action throws, the transition is
   * rolled back to its pre-transition state.
   *
   * Transition selection:
   * 1. Find all transitions in the current state matching `event.type`
   * 2. For each, evaluate the guard condition (if any)
   * 3. Execute the first transition whose guard passes
   * 4. Await on_exit actions → transition actions → on_enter actions
   * 5. Update history and emit `workflow:state_changed`
   *
   * @param workflowId - ID of the workflow instance to send the event to.
   * @param event      - The RuntimeEvent that may trigger a transition.
   * @returns A Promise resolving to the WorkflowTransition that was applied,
   *          or `null` if no matching transition was found, the instance is
   *          not active, or the queue is full.
   */
  async sendEvent(workflowId, event) {
    const instanceCheck = this.instances.get(workflowId);
    if (!instanceCheck) {
      log.warn("sendEvent: workflow instance not found", { workflowId });
      return null;
    }
    if (instanceCheck.status !== "active") {
      log.warn("sendEvent: workflow is not active", { workflowId, status: instanceCheck.status });
      return null;
    }
    if (this._inFlight.has(workflowId)) {
      const queue = this._queue.get(workflowId) ?? [];
      if (queue.length >= this.maxQueueDepth) {
        log.warn("sendEvent: transition queue full; dropping event", {
          workflowId,
          event: event.type,
          queue_depth: queue.length,
          max_queue_depth: this.maxQueueDepth
        });
        return null;
      }
      return new Promise((resolve2, reject) => {
        queue.push({ event, resolve: resolve2, reject });
        this._queue.set(workflowId, queue);
      });
    }
    return this._acquireAndRun(workflowId, event);
  }
  /**
   * Acquires the per-workflow mutex, executes the transition, then drains
   * the queue for this workflow.
   *
   * @param workflowId - The workflow to run.
   * @param event      - The event to process.
   * @returns The result of the transition.
   */
  _acquireAndRun(workflowId, event) {
    let resolveInFlight;
    const inFlight = new Promise((res) => {
      resolveInFlight = res;
    });
    this._inFlight.set(workflowId, inFlight);
    const runAndDrain = /* @__PURE__ */ __name(async () => {
      let result = null;
      try {
        result = await this._executeTransition(workflowId, event);
      } finally {
        const queue = this._queue.get(workflowId);
        if (queue && queue.length > 0) {
          const next = queue.shift();
          if (queue.length === 0) this._queue.delete(workflowId);
          const nextResult = this._executeTransition(workflowId, next.event).then(next.resolve, next.reject).finally(() => {
            return this._drainQueue(workflowId).then(() => {
              resolveInFlight();
              this._inFlight.delete(workflowId);
            });
          });
          void nextResult;
          return result;
        } else {
          resolveInFlight();
          this._inFlight.delete(workflowId);
        }
      }
      return result;
    }, "runAndDrain");
    return runAndDrain();
  }
  /**
   * Recursively drains the per-workflow transition queue after a queued
   * transition completes. Each drained item runs as a chained promise,
   * serialised in FIFO order.
   *
   * @param workflowId - The workflow whose queue to drain.
   */
  _drainQueue(workflowId) {
    const queue = this._queue.get(workflowId);
    if (!queue || queue.length === 0) return Promise.resolve();
    const next = queue.shift();
    if (queue.length === 0) this._queue.delete(workflowId);
    return this._executeTransition(workflowId, next.event).then(next.resolve, next.reject).then(() => this._drainQueue(workflowId));
  }
  /**
   * Executes a single state transition for the given workflow instance.
   *
   * This method performs the full transition sequence:
   * 1. Guard evaluation and transition matching
   * 2. Context snapshot (for rollback)
   * 3. Await on_exit actions (with timeout)
   * 4. Update state
   * 5. Await transition actions (with timeout)
   * 6. Await on_enter actions for the new state (with timeout)
   * 7. Record history and emit events
   *
   * On action failure or timeout, the transition is rolled back by restoring
   * the pre-transition state, updated_at, and removing the history entry.
   *
   * **Must be called only while holding the per-workflow mutex** (`_inFlight`).
   *
   * @param workflowId - ID of the workflow instance.
   * @param event      - The RuntimeEvent being processed.
   * @returns The recorded WorkflowTransition, or `null` if no matching
   *          transition was found or preconditions failed.
   */
  async _executeTransition(workflowId, event) {
    const instance = this.instances.get(workflowId);
    if (!instance) {
      log.warn("_executeTransition: workflow instance not found", { workflowId });
      return null;
    }
    if (instance.status !== "active") {
      log.warn("_executeTransition: workflow is not active", { workflowId, status: instance.status });
      return null;
    }
    const def = this.definitions.get(instance.definition_id);
    if (!def) {
      log.error("_executeTransition: definition not found for instance", {
        workflowId,
        definition_id: instance.definition_id
      });
      return null;
    }
    const maxTransitions = def.max_transitions ?? this.maxTransitions;
    if (instance.history.length >= maxTransitions) {
      log.warn("Workflow exceeded max transitions; halting", {
        workflowId,
        transitions: instance.history.length,
        max: maxTransitions
      });
      instance.status = "failed";
      instance.error = `Exceeded max transitions (${maxTransitions})`;
      instance.updated_at = timestamp();
      this.emitWorkflowEvent("workflow:failed", instance, { error: instance.error });
      this.directiveQueue?.purge(workflowId);
      return null;
    }
    const currentStateDef = def.states[instance.current_state];
    if (!currentStateDef) {
      log.error("_executeTransition: current state not found in definition", {
        workflowId,
        current_state: instance.current_state
      });
      return null;
    }
    const matchingTransition = currentStateDef.transitions.find((t) => {
      if (t.event !== event.type) return false;
      if (!t.guard) return true;
      return this.evaluateGuard(t.guard, instance.context, event);
    });
    if (!matchingTransition) {
      log.debug("No matching transition found", {
        workflowId,
        state: instance.current_state,
        event: event.type
      });
      return null;
    }
    const fromState = instance.current_state;
    const toState = matchingTransition.target;
    const transitionTimestamp = timestamp();
    const preTransitionState = instance.current_state;
    const preTransitionUpdatedAt = instance.updated_at;
    const contextBefore = JSON.parse(JSON.stringify(instance.context));
    try {
      if (currentStateDef.on_exit) {
        await this.executeActionsWithTimeout(
          currentStateDef.on_exit,
          instance.context,
          { workflowId, fromState, toState, phase: "on_exit" }
        );
      }
      instance.current_state = toState;
      instance.updated_at = transitionTimestamp;
      if (matchingTransition.actions) {
        await this.executeActionsWithTimeout(
          matchingTransition.actions,
          instance.context,
          { workflowId, fromState, toState, phase: "transition" }
        );
      }
      const targetStateDef = def.states[toState];
      if (targetStateDef?.on_enter) {
        await this.executeActionsWithTimeout(
          targetStateDef.on_enter,
          instance.context,
          { workflowId, fromState, toState, phase: "on_enter" }
        );
      }
    } catch (err) {
      const isTimeout = err instanceof WorkflowTimeoutError;
      log.error(isTimeout ? "Action timeout \u2014 rolling back transition" : "Action failure \u2014 rolling back transition", {
        workflow_id: workflowId,
        from_state: fromState,
        to_state: toState,
        error: toErrorMessage(err)
      });
      instance.current_state = preTransitionState;
      instance.updated_at = preTransitionUpdatedAt;
      for (const key of Object.keys(instance.context)) {
        if (!(key in contextBefore)) delete instance.context[key];
      }
      Object.assign(instance.context, contextBefore);
      return null;
    }
    const contextChanges = {};
    for (const key of Object.keys(instance.context)) {
      if (instance.context[key] !== contextBefore[key]) {
        contextChanges[key] = instance.context[key];
      }
    }
    const transition = {
      from_state: fromState,
      to_state: toState,
      event: event.type,
      timestamp: transitionTimestamp,
      context_changes: contextChanges
    };
    instance.history.push(transition);
    log.info("Workflow state transition", {
      id: workflowId,
      from: fromState,
      to: toState,
      event: event.type
    });
    this.emitWorkflowEvent("workflow:state_changed", instance, {
      previous_state: fromState,
      current_state: toState,
      context: { ...instance.context }
    });
    if (def.terminal_states.includes(toState)) {
      instance.status = "completed";
      instance.completed_at = transitionTimestamp;
      log.info("Workflow completed", { id: workflowId, terminal_state: toState });
      this.emitWorkflowEvent("workflow:completed", instance, {});
      this.directiveQueue?.purge(workflowId);
    }
    return transition;
  }
  /**
   * Retrieves a workflow instance by its ID.
   *
   * @param workflowId - The instance ID to look up.
   * @returns The WorkflowInstance, or `undefined` if not found.
   */
  get(workflowId) {
    return this.instances.get(workflowId);
  }
  /**
   * Lists all currently active (non-terminal) workflow instances.
   *
   * @returns Array of WorkflowInstances with status 'active'.
   */
  listActive() {
    return Array.from(this.instances.values()).filter((i) => i.status === "active");
  }
  /**
   * Lists all workflow instances, including completed and cancelled ones.
   *
   * @returns Array of all WorkflowInstances sorted by creation time (oldest first).
   */
  listAll() {
    return Array.from(this.instances.values()).sort(
      (a, b) => a.created_at - b.created_at
    );
  }
  /**
   * Directly restores a workflow instance into the instances map.
   *
   * Used during startup recovery to re-populate engine state without
   * triggering on_enter actions or emitting events. If an instance with the
   * same ID already exists it is silently overwritten (last-write wins).
   *
   * @param instance - The WorkflowInstance to restore.
   */
  restoreInstance(instance) {
    this.instances.set(instance.id, instance);
    log.debug("Workflow instance restored", {
      id: instance.id,
      definition_id: instance.definition_id,
      current_state: instance.current_state,
      status: instance.status
    });
  }
  /**
   * Returns all active (non-terminal) workflow instances.
   *
   * Alias for `listActive()` with a more descriptive name for use in
   * snapshotting and recovery code.
   *
   * @returns Array of WorkflowInstances with status 'active'.
   */
  getActiveInstances() {
    return this.listActive();
  }
  /**
   * Returns all workflow instances regardless of status.
   *
   * Alias for `listAll()` with a more descriptive name for use in
   * snapshotting and recovery code.
   *
   * @returns Array of all WorkflowInstances.
   */
  getAllInstances() {
    return this.listAll();
  }
  /**
   * Cancels an active workflow instance.
   *
   * The instance status is set to 'cancelled' and a `workflow:cancelled`
   * event is emitted via the EventBus if one is set.
   *
   * @param workflowId - ID of the workflow instance to cancel.
   * @param reason     - Human-readable reason for cancellation.
   */
  cancel(workflowId, reason) {
    const instance = this.instances.get(workflowId);
    if (!instance) {
      log.warn("cancel: workflow instance not found", { workflowId });
      return;
    }
    if (instance.status !== "active") {
      log.warn("cancel: workflow is not active", { workflowId, status: instance.status });
      return;
    }
    instance.status = "cancelled";
    instance.error = reason;
    instance.updated_at = timestamp();
    log.info("Workflow cancelled", { id: workflowId, reason });
    this.emitWorkflowEvent("workflow:cancelled", instance, { reason });
    this.directiveQueue?.purge(workflowId);
  }
  /**
   * Removes completed workflow instances older than `maxAge` ms.
   *
   * Only instances with status `'completed'` are eligible for removal.
   * Active, failed, or cancelled instances are retained regardless of age.
   *
   * @param maxAge - Maximum age in milliseconds for completed instances
   *   before they are pruned. Defaults to 3 600 000 ms (1 hour).
   * @returns The number of instances removed.
   */
  prune(maxAge = 36e5) {
    const cutoff = Date.now() - maxAge;
    let pruned = 0;
    for (const [id, instance] of this.instances) {
      if (instance.status === "completed") {
        const completedAt = instance.completed_at ? new Date(instance.completed_at).getTime() : new Date(instance.updated_at).getTime();
        if (completedAt < cutoff) {
          this.instances.delete(id);
          pruned++;
        }
      }
    }
    if (pruned > 0) {
      log.debug("Pruned completed workflow instances", { pruned });
    }
    return pruned;
  }
  /**
   * Registers a named guard function for use in workflow definitions.
   *
   * @param name - The function name referenced in GuardCondition.function.
   * @param fn   - The guard implementation.
   */
  registerGuard(name, fn) {
    this.guards.set(name, fn);
    log.debug("Registered guard function", { name });
  }
  /**
   * Registers a named action handler for use in workflow definitions.
   *
   * @param name - The handler name referenced in ActionDefinition.config.
   * @param fn   - The async action implementation.
   */
  registerAction(name, fn) {
    this.actionHandlers.set(name, fn);
    log.debug("Registered action handler", { name });
  }
  // ─── Private Helpers ───────────────────────────────────────────────────
  /**
   * Evaluates a guard condition against the current context and triggering event.
   *
   * @param guard   - The guard condition to evaluate.
   * @param context - Current workflow context.
   * @param event   - The event that triggered the transition check.
   * @returns `true` if the guard passes; `false` otherwise.
   */
  evaluateGuard(guard, context, event) {
    try {
      if (guard.type === "function") {
        const fn = this.guards.get(guard.function ?? "");
        if (!fn) {
          log.warn("Guard function not registered", { name: guard.function });
          return false;
        }
        return fn(context, event);
      }
      if (guard.type === "expression" && guard.expression) {
        return this.evaluateExpression(guard.expression, context);
      }
      log.warn("Guard has no valid evaluation strategy", { guard });
      return false;
    } catch (err) {
      log.error("Guard evaluation error", {
        guard,
        error: toErrorMessage(err)
      });
      return false;
    }
  }
  /**
   * Wraps a list of ActionDefinitions in a timeout and delegates to
   * `executeActions`. If the actions exceed `actionTimeoutMs`, a
   * `WorkflowTimeoutError` is thrown, which causes the caller to roll back
   * the transition.
   *
   * @param actions  - Ordered list of ActionDefinitions to execute.
   * @param context  - Workflow context (mutated in-place by update_context).
   * @param logCtx   - Contextual information for rollback/warning log messages.
   * @throws {WorkflowTimeoutError} When actions exceed the configured timeout.
   * @throws {Error} When an individual action throws.
   */
  async executeActionsWithTimeout(actions, context, logCtx) {
    const timeout = this.actionTimeoutMs;
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new WorkflowTimeoutError(
          `Action phase '${logCtx.phase}' exceeded ${timeout} ms timeout`,
          timeout
        ));
      }, timeout);
    });
    try {
      await Promise.race([this.executeActions(actions, context), timeoutPromise]);
    } catch (err) {
      if (err instanceof WorkflowTimeoutError) {
        log.warn("Action execution timeout", {
          ...logCtx,
          timeout_ms: timeout
        });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  /**
   * Executes a list of ActionDefinitions against the current context.
   *
   * Actions run sequentially. Failures are propagated to the caller
   * (which handles rollback).
   *
   * Supported action types:
   * - `emit_event`     — emits a runtime event via the injected EventBus
   * - `update_context` — shallow-merges config into the workflow context
   * - `invoke_handler` — calls a registered action handler by name
   * - `spawn_agent`    — placeholder; logs a warning (Phase 5)
   *
   * @param actions - Ordered list of ActionDefinitions to execute.
   * @param context - Workflow context (mutated in-place by update_context).
   */
  async executeActions(actions, context) {
    for (const action of actions) {
      try {
        switch (action.type) {
          case "emit_event": {
            const eventType = action.config["event_type"];
            if (eventType && this.eventBus) {
              this.eventBus.emit({
                id: generateEventId(),
                timestamp: timestamp(),
                type: eventType,
                source: { kind: "system" },
                priority: 0,
                payload: { type: eventType, data: { ...action.config } }
              });
            }
            break;
          }
          case "update_context": {
            const { type: _type, ...values } = action.config;
            Object.assign(context, values);
            break;
          }
          case "invoke_handler": {
            const handlerName = action.config["handler"];
            if (!handlerName) {
              log.warn("invoke_handler action missing handler name", { config: action.config });
              break;
            }
            const handler = this.actionHandlers.get(handlerName);
            if (!handler) {
              log.warn("Action handler not registered", { name: handlerName });
              break;
            }
            await handler(context, action.config);
            break;
          }
          case "spawn_agent": {
            log.warn("spawn_agent action type is not yet implemented (Phase 5 stub)", {
              action_type: action.type,
              workflow_id: context.workflow_id ?? "unknown"
            });
            break;
          }
          default: {
            log.warn("Unknown action type", { type: action.type });
          }
        }
      } catch (err) {
        log.error("Action execution error", {
          action_type: action.type,
          error: toErrorMessage(err)
        });
        throw err;
      }
    }
  }
  /**
   * Safe expression evaluator for guard conditions.
   *
   * Supports the pattern: `context.field op value` or
   * `context.field op context.otherField`.
   *
   * Operators: `>=`, `<=`, `>`, `<`, `===`, `!==`
   *
   * Value types recognized on the right-hand side:
   * - Numeric literals: `9.5`, `0`, `-1`
   * - Boolean literals: `true`, `false`
   * - Null literal: `null`
   * - Context references: `context.someField`
   * - Unquoted strings (fallback)
   *
   * NO eval(), NO Function() — all parsing is explicit string manipulation.
   *
   * @param expr    - Expression string to evaluate.
   * @param context - Workflow context to read values from.
   * @returns Boolean result of the expression.
   * @throws {Error} If the expression format is not recognized.
   */
  evaluateExpression(expr, context) {
    const trimmed = expr.trim();
    const operatorRegex = /\s+(>=|<=|===|!==|>|<)\s+/;
    const opMatch = trimmed.match(operatorRegex);
    if (!opMatch || opMatch.index === void 0) {
      log.warn("Guard expression has no recognized operator", { expression: trimmed });
      return false;
    }
    const operator = opMatch[1];
    const lhsRaw = trimmed.slice(0, opMatch.index).trim();
    const rhsRaw = trimmed.slice(opMatch.index + opMatch[0].length).trim();
    if (!lhsRaw || !rhsRaw) {
      throw new WorkflowError(`Unrecognised guard expression format: "${expr}"`);
    }
    const lhsValue = this.resolveValue(lhsRaw, context);
    const rhsValue = this.resolveValue(rhsRaw, context);
    switch (operator) {
      case ">=":
        return lhsValue >= rhsValue;
      case "<=":
        return lhsValue <= rhsValue;
      case ">":
        return lhsValue > rhsValue;
      case "<":
        return lhsValue < rhsValue;
      case "===":
        return lhsValue === rhsValue;
      case "!==":
        return lhsValue !== rhsValue;
      default: {
        log.warn("Unrecognized guard expression operator", { operator, expression: expr });
        return false;
      }
    }
  }
  /**
   * Resolves a raw expression token to its runtime value.
   *
   * Handles:
   * - `context.field` — reads from the workflow context
   * - `true` / `false` — boolean literals
   * - `null` — null literal
   * - Numeric strings — parsed as float
   * - Everything else — returned as-is (string)
   *
   * @param raw     - Raw string token from the expression.
   * @param context - Workflow context for context.field lookups.
   * @returns The resolved value.
   */
  resolveValue(raw, context) {
    if (raw.startsWith("context.")) {
      const fieldPath = raw.slice("context.".length);
      const parts = fieldPath.split(".");
      let value = context;
      for (const part of parts) {
        if (value === null || value === void 0) return void 0;
        value = value[part];
      }
      return value;
    }
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw === "null") return null;
    const asNumber = Number(raw);
    if (!isNaN(asNumber) && raw !== "") return asNumber;
    return raw;
  }
  /**
   * Emits a workflow lifecycle event via the injected EventBus.
   *
   * If no EventBus has been set, this is a no-op.
   *
   * @param type     - The workflow EventType to emit.
   * @param instance - The workflow instance the event relates to.
   * @param extra    - Additional data to include in the event payload.
   */
  emitWorkflowEvent(type, instance, extra) {
    if (!this.eventBus) return;
    try {
      this.eventBus.emit({
        id: generateEventId(),
        timestamp: timestamp(),
        type,
        source: { kind: "workflow", workflow_id: instance.id },
        priority: 0,
        payload: {
          type,
          data: {
            workflow_id: instance.id,
            workflow_type: instance.definition_id,
            current_state: instance.current_state,
            status: instance.status,
            ...extra
          }
        }
      });
    } catch (err) {
      log.error("Failed to emit workflow event", {
        type,
        workflowId: instance.id,
        error: toErrorMessage(err)
      });
    }
  }
};

// src/extensions/workflow/definitions/chain-types.ts
var CHAIN_MAX_TRANSITIONS = {
  wrfc_loop: 20,
  fix_loop: 30,
  test_then_fix: 15,
  review_only: 10
};

// src/extensions/workflow/definitions/wrfc-loop.ts
var WRFC_LOOP_DEFINITION = {
  id: "wrfc_loop",
  name: "Write-Review-Fix-Check Loop",
  version: 1,
  initial_state: "IDLE",
  terminal_states: ["COMPLETE", "ESCALATED"],
  max_transitions: CHAIN_MAX_TRANSITIONS.wrfc_loop,
  states: {
    IDLE: {
      name: "IDLE",
      transitions: [
        {
          event: "workflow:created",
          target: "GATHERING"
        }
      ]
    },
    GATHERING: {
      name: "GATHERING",
      on_enter: [
        {
          type: "emit_event",
          config: { event_type: "wrfc:gathering_started" }
        }
      ],
      transitions: [
        {
          event: "wrfc:plan_submitted",
          target: "PLANNING"
        }
      ]
    },
    PLANNING: {
      name: "PLANNING",
      transitions: [
        {
          event: "wrfc:writing_started",
          target: "WRITING"
        }
      ]
    },
    WRITING: {
      name: "WRITING",
      transitions: [
        {
          event: "wrfc:review_started",
          target: "REVIEWING"
        }
      ]
    },
    REVIEWING: {
      name: "REVIEWING",
      on_enter: [
        {
          type: "emit_event",
          config: { event_type: "wrfc:review_started" }
        }
      ],
      transitions: [
        {
          // Perfect score — work is done
          event: "wrfc:review_completed",
          target: "COMPLETE",
          guard: {
            type: "expression",
            expression: "context.review_score >= context.min_review_score"
          }
        },
        {
          // Score below threshold — enter fix cycle
          event: "wrfc:review_completed",
          target: "FIXING",
          guard: {
            type: "expression",
            expression: "context.review_score < context.min_review_score"
          }
        }
      ]
    },
    FIXING: {
      name: "FIXING",
      on_enter: [
        {
          type: "emit_event",
          config: { event_type: "wrfc:fix_started" }
        }
      ],
      transitions: [
        {
          // Still have fix budget — return to review
          event: "wrfc:fix_completed",
          target: "REVIEWING",
          guard: {
            type: "expression",
            expression: "context.fix_attempts < context.max_fix_attempts"
          }
        },
        {
          // Budget exhausted — escalate
          event: "wrfc:fix_completed",
          target: "ESCALATED",
          guard: {
            type: "expression",
            expression: "context.fix_attempts >= context.max_fix_attempts"
          }
        }
      ]
    },
    ESCALATED: {
      name: "ESCALATED",
      on_enter: [
        {
          type: "emit_event",
          config: { event_type: "wrfc:escalated" }
        }
      ],
      transitions: []
    },
    COMPLETE: {
      name: "COMPLETE",
      on_enter: [
        {
          type: "emit_event",
          config: { event_type: "wrfc:completed" }
        }
      ],
      transitions: []
    }
  }
};

// src/extensions/workflow/definitions/fix-loop.ts
var FIX_LOOP_DEFINITION = {
  id: "fix_loop",
  name: "Fix Loop",
  version: 1,
  initial_state: "IDLE",
  terminal_states: ["RESOLVED", "FAILED"],
  max_transitions: CHAIN_MAX_TRANSITIONS.fix_loop,
  states: {
    IDLE: {
      name: "IDLE",
      transitions: [
        {
          event: "fix:diagnosing",
          target: "DIAGNOSING"
        }
      ]
    },
    DIAGNOSING: {
      name: "DIAGNOSING",
      transitions: [
        {
          event: "fix:applying",
          target: "APPLYING"
        }
      ]
    },
    APPLYING: {
      name: "APPLYING",
      transitions: [
        {
          event: "fix:verifying",
          target: "VERIFYING"
        }
      ]
    },
    VERIFYING: {
      name: "VERIFYING",
      transitions: [
        {
          // Verification passed — fix is done
          event: "fix:resolved",
          target: "RESOLVED"
        },
        {
          // Verification failed, still have budget — retry
          event: "fix:retrying",
          target: "RETRYING",
          guard: {
            type: "expression",
            expression: "context.fix_attempts < context.max_fix_attempts"
          }
        },
        {
          // Budget exhausted after failure
          event: "fix:failed",
          target: "FAILED",
          guard: {
            type: "expression",
            expression: "context.fix_attempts >= context.max_fix_attempts"
          }
        }
      ]
    },
    RETRYING: {
      name: "RETRYING",
      transitions: [
        {
          // Loop back to diagnosis with updated context
          event: "fix:diagnosing",
          target: "DIAGNOSING"
        }
      ]
    },
    RESOLVED: {
      name: "RESOLVED",
      transitions: []
    },
    FAILED: {
      name: "FAILED",
      transitions: []
    }
  }
};

// src/extensions/workflow/definitions/test-then-fix.ts
var TEST_THEN_FIX_DEFINITION = {
  id: "test_then_fix",
  name: "Test-Then-Fix Loop",
  version: 1,
  initial_state: "IDLE",
  terminal_states: ["COMPLETE", "ESCALATED"],
  max_transitions: CHAIN_MAX_TRANSITIONS.test_then_fix,
  states: {
    IDLE: {
      name: "IDLE",
      transitions: [
        {
          event: "workflow:created",
          target: "TESTING"
        }
      ]
    },
    TESTING: {
      name: "TESTING",
      on_enter: [
        {
          type: "emit_event",
          config: { event_type: "test_fix:testing_started" }
        }
      ],
      transitions: [
        {
          // Tests passed — work is done
          event: "test_fix:tests_passed",
          target: "COMPLETE"
        },
        {
          // Tests failed — enter fix cycle
          event: "test_fix:tests_failed",
          target: "FIXING"
        }
      ]
    },
    FIXING: {
      name: "FIXING",
      on_enter: [
        {
          type: "emit_event",
          config: { event_type: "test_fix:fix_started" }
        }
      ],
      transitions: [
        {
          // Still have fix budget — re-run tests
          event: "test_fix:fix_completed",
          target: "RE_TESTING",
          guard: {
            type: "expression",
            expression: "context.fix_attempts < context.max_fix_attempts"
          }
        },
        {
          // Budget exhausted — escalate
          event: "test_fix:fix_completed",
          target: "ESCALATED",
          guard: {
            type: "expression",
            expression: "context.fix_attempts >= context.max_fix_attempts"
          }
        }
      ]
    },
    RE_TESTING: {
      name: "RE_TESTING",
      on_enter: [
        {
          type: "emit_event",
          config: { event_type: "test_fix:retesting_started" }
        }
      ],
      transitions: [
        {
          // Tests pass after fix — complete
          event: "test_fix:tests_passed",
          target: "COMPLETE"
        },
        {
          // Tests still failing, still have budget — fix again
          event: "test_fix:tests_failed",
          target: "FIXING",
          guard: {
            type: "expression",
            expression: "context.fix_attempts < context.max_fix_attempts"
          }
        },
        {
          // Tests still failing, budget exhausted — escalate
          event: "test_fix:tests_failed",
          target: "ESCALATED",
          guard: {
            type: "expression",
            expression: "context.fix_attempts >= context.max_fix_attempts"
          }
        }
      ]
    },
    COMPLETE: {
      name: "COMPLETE",
      on_enter: [
        {
          type: "emit_event",
          config: { event_type: "test_fix:completed" }
        }
      ],
      transitions: []
    },
    ESCALATED: {
      name: "ESCALATED",
      on_enter: [
        {
          type: "emit_event",
          config: { event_type: "test_fix:escalated" }
        }
      ],
      transitions: []
    }
  }
};

// src/extensions/workflow/definitions/review-only.ts
var REVIEW_ONLY_DEFINITION = {
  id: "review_only",
  name: "Review Only",
  version: 1,
  initial_state: "IDLE",
  terminal_states: ["COMPLETE"],
  max_transitions: CHAIN_MAX_TRANSITIONS.review_only,
  states: {
    IDLE: {
      name: "IDLE",
      transitions: [
        {
          event: "workflow:created",
          target: "REVIEWING"
        }
      ]
    },
    REVIEWING: {
      name: "REVIEWING",
      on_enter: [
        {
          type: "emit_event",
          config: { event_type: "review_only:review_started" }
        }
      ],
      transitions: [
        {
          event: "review_only:review_completed",
          target: "COMPLETE"
        }
      ]
    },
    COMPLETE: {
      name: "COMPLETE",
      on_enter: [
        {
          type: "emit_event",
          config: { event_type: "review_only:completed" }
        }
      ],
      transitions: []
    }
  }
};

// src/extensions/workflow/definitions/custom-loader.ts
var import_node_fs6 = require("node:fs");
var import_node_path6 = require("node:path");
var log2 = createLogger("custom-loader");
function validateWorkflowDefinition(def) {
  const errors = [];
  if (typeof def !== "object" || def === null || Array.isArray(def)) {
    return ["definition must be a non-null object"];
  }
  const d = def;
  if (typeof d["id"] !== "string" || d["id"].length === 0) {
    errors.push("id must be a non-empty string");
  } else if (d["id"].startsWith("builtin_")) {
    errors.push(`id "${d["id"]}" must not use the reserved "builtin_" prefix`);
  }
  if (typeof d["name"] !== "string" || d["name"].length === 0) {
    errors.push("name must be a non-empty string");
  }
  if (typeof d["version"] !== "number") {
    errors.push("version must be a number");
  }
  if (typeof d["states"] !== "object" || d["states"] === null || Array.isArray(d["states"])) {
    errors.push("states must be a non-null object map");
    return errors;
  }
  const states = d["states"];
  const stateNames = new Set(Object.keys(states));
  if (typeof d["initial_state"] !== "string" || d["initial_state"].length === 0) {
    errors.push("initial_state must be a non-empty string");
  } else if (!stateNames.has(d["initial_state"])) {
    errors.push(`initial_state "${d["initial_state"]}" is not present in states`);
  }
  if (!Array.isArray(d["terminal_states"])) {
    errors.push("terminal_states must be an array");
  } else {
    for (const ts of d["terminal_states"]) {
      if (typeof ts !== "string") {
        errors.push(`terminal_states entry "${String(ts)}" must be a string`);
      } else if (!stateNames.has(ts)) {
        errors.push(`terminal_state "${ts}" is not present in states`);
      }
    }
  }
  for (const [stateName, stateDef] of Object.entries(states)) {
    if (typeof stateDef !== "object" || stateDef === null) {
      errors.push(`state "${stateName}" must be an object`);
      continue;
    }
    const sd = stateDef;
    if (!Array.isArray(sd["transitions"])) {
      errors.push(`state "${stateName}" must have a transitions array`);
      continue;
    }
    for (const transition of sd["transitions"]) {
      if (typeof transition !== "object" || transition === null) {
        errors.push(`state "${stateName}" has a non-object transition`);
        continue;
      }
      const t = transition;
      if (typeof t["target"] !== "string" || t["target"].length === 0) {
        errors.push(`state "${stateName}" has a transition with missing or empty target`);
      } else if (!stateNames.has(t["target"])) {
        errors.push(`state "${stateName}" transition target "${t["target"]}" is not present in states`);
      }
    }
  }
  return errors;
}
__name(validateWorkflowDefinition, "validateWorkflowDefinition");
async function loadCustomWorkflows(configPath) {
  const configFile = (0, import_node_path6.join)(configPath, "goodvibes.json");
  let raw;
  try {
    raw = await import_node_fs6.promises.readFile(configFile, "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") {
      log2.debug("loadCustomWorkflows: no goodvibes.json found, skipping custom workflow loading", {
        config_file: configFile
      });
    } else {
      log2.warn("loadCustomWorkflows: failed to read goodvibes.json", {
        config_file: configFile,
        error: String(err)
      });
    }
    return [];
  }
  const parsed = safeJsonParse(
    raw,
    null,
    (msg) => log2.warn("loadCustomWorkflows: failed to parse goodvibes.json as JSON", {
      config_file: configFile,
      error: msg
    })
  );
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    log2.warn("loadCustomWorkflows: goodvibes.json root must be an object");
    return [];
  }
  const root = parsed;
  const runtimeSection = root["runtime"];
  if (typeof runtimeSection !== "object" || runtimeSection === null) {
    log2.debug('loadCustomWorkflows: no "runtime" section in goodvibes.json');
    return [];
  }
  const workflowsArray = runtimeSection["workflows"];
  if (!Array.isArray(workflowsArray)) {
    log2.debug('loadCustomWorkflows: no "runtime.workflows" array in goodvibes.json');
    return [];
  }
  const definitions = [];
  for (const candidate of workflowsArray) {
    const errors = validateWorkflowDefinition(candidate);
    if (errors.length > 0) {
      log2.warn("loadCustomWorkflows: skipping invalid workflow definition", {
        errors,
        candidate_id: typeof candidate?.["id"] === "string" ? candidate["id"] : "<unknown>"
      });
      continue;
    }
    definitions.push(candidate);
    log2.info("loadCustomWorkflows: loaded custom workflow definition", {
      id: candidate.id,
      name: candidate.name
    });
  }
  log2.debug("loadCustomWorkflows: loaded custom workflows", {
    count: definitions.length,
    total_candidates: workflowsArray.length
  });
  return definitions;
}
__name(loadCustomWorkflows, "loadCustomWorkflows");

// src/extensions/workflow/guards.ts
function checkReviewScoreGuard(context) {
  const threshold = typeof context.min_review_score === "number" && Number.isFinite(context.min_review_score) ? context.min_review_score : 9.5;
  return typeof context.review_score === "number" && context.review_score >= threshold;
}
__name(checkReviewScoreGuard, "checkReviewScoreGuard");

// src/extensions/workflow/subsystem.ts
var logger5 = createLogger("workflow-subsystem");
async function createWorkflowSubsystem(config, projectRoot) {
  const workflowEngine = new WorkflowEngine(config.workflows);
  workflowEngine.registerDefinition(WRFC_LOOP_DEFINITION);
  workflowEngine.registerDefinition(FIX_LOOP_DEFINITION);
  workflowEngine.registerDefinition(TEST_THEN_FIX_DEFINITION);
  workflowEngine.registerDefinition(REVIEW_ONLY_DEFINITION);
  workflowEngine.registerGuard("checkReviewScore", checkReviewScoreGuard);
  try {
    const customDefinitions = await loadCustomWorkflows(projectRoot);
    for (const def of customDefinitions) {
      workflowEngine.registerDefinition(def);
      logger5.info("Custom workflow definition registered", { id: def.id, name: def.name });
    }
    logger5.debug("Custom workflow definitions loaded", { count: customDefinitions.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger5.warn("Failed to load custom workflow definitions \u2014 continuing without them", {
      err: message
    });
  }
  logger5.debug("Workflow subsystem created");
  return {
    workflowEngine,
    shutdown() {
      for (const instance of workflowEngine.getActiveInstances()) {
        workflowEngine.cancel(instance.id, "subsystem shutdown");
      }
      logger5.debug("Workflow subsystem shut down");
    }
  };
}
__name(createWorkflowSubsystem, "createWorkflowSubsystem");

// src/core/trigger-registry.ts
var log3 = createLogger("trigger-registry");
var TriggerRegistry = class {
  static {
    __name(this, "TriggerRegistry");
  }
  /** All registered trigger definitions, keyed by trigger ID. */
  triggers = /* @__PURE__ */ new Map();
  /** Stateful condition evaluator with recent-event O(1) ring buffer. */
  evaluator;
  /** Action executor with handler registry. */
  executor;
  /** Named action handlers — mirrored here so they survive executor replacement. */
  actionHandlers = /* @__PURE__ */ new Map();
  /** Resolved triggers configuration. */
  config;
  /**
   * Cached sorted trigger list for evaluate(). Invalidated on any structural
   * mutation (register, unregister, replace, setEnabled) so we only re-sort
   * when the set or priority order has actually changed.
   */
  sortedTriggerCache = null;
  /** Guards against repeated _store warning spam — log once per instance. */
  storeWarningLogged = false;
  /**
   * @param config - Triggers section of the resolved {@link RuntimeConfig}.
   * @param evaluator - Condition evaluator implementation.
   * @param executor - Action executor implementation.
   */
  constructor(config, evaluator, executor) {
    this.config = config;
    this.evaluator = evaluator;
    this.executor = executor;
  }
  // ─── L1 TriggerRegistryInterface — Compatibility Shims ────────────────────
  /**
   * L1 compatibility: match an event against all enabled triggers, returning
   * triggers whose `EventCondition` fires (condition met, guards passed).
   *
   * This is a synchronous approximation — it evaluates EventCondition types
   * only (no threshold/sequence, no action execution). For full L2 evaluation
   * with action dispatch, use `evaluate(event)` instead.
   *
   * @param event - Incoming runtime event.
   * @param _store - State store (used by L1 `Condition` evaluation; not used
   *   by L2 TriggerDefinition — provided for interface compatibility).
   * @returns L1 `Trigger[]` stubs for each fired TriggerDefinition.
   */
  match(event, _store) {
    if (!this.storeWarningLogged) {
      this.storeWarningLogged = true;
      log3.warn(
        "State-store condition evaluation not supported in unified registry \u2014 L1 Condition[] guards ignored"
      );
    }
    const now = Date.now();
    const matched = [];
    for (const trigger of this.triggers.values()) {
      if (this.passesGuards(trigger, now) !== true) continue;
      const conditionMet = this.evaluator.evaluate(trigger.condition, event);
      if (!conditionMet) continue;
      matched.push(this.toL1Trigger(trigger));
    }
    return matched;
  }
  /**
   * L1 compatibility: record that a trigger has fired (increments fire count).
   *
   * @param trigger_id - ID of the trigger that fired.
   */
  recordFire(trigger_id) {
    const trigger = this.triggers.get(trigger_id);
    if (trigger) {
      trigger.fires_count++;
      trigger.last_fired = Date.now();
    }
  }
  /**
   * L1 compatibility: enable a trigger by ID.
   *
   * @param id - Trigger ID to enable.
   */
  enable(id) {
    this.setEnabled(id, true);
  }
  /**
   * L1 compatibility: disable a trigger without removing it.
   *
   * @param id - Trigger ID to disable.
   */
  disable(id) {
    this.setEnabled(id, false);
  }
  // ─── L2 Full-Featured Interface ───────────────────────────────────────────
  /**
   * Registers a trigger definition.
   *
   * Rejects registration if the `max_triggers` limit would be exceeded.
   *
   * @param trigger - The trigger definition to register.
   * @throws {QueueError} If the trigger limit is reached.
   */
  register(trigger) {
    if (this.triggers.size >= this.config.max_triggers) {
      throw new QueueError(
        `TriggerRegistry: max_triggers limit reached (${this.config.max_triggers}). Cannot register '${trigger.id}'.`
      );
    }
    this.triggers.set(trigger.id, trigger);
    this.sortedTriggerCache = null;
    log3.debug("Trigger registered", {
      id: trigger.id,
      name: trigger.name,
      priority: trigger.priority
    });
  }
  /**
   * Atomically replaces an existing trigger definition, preserving runtime state.
   *
   * Unlike `unregister` + `register`, this is a single Map operation with no gap
   * during which the trigger is absent.
   *
   * @param trigger - The replacement definition. Must share the same `id`.
   * @throws {QueueError} If no trigger with the given ID is currently registered.
   */
  replace(trigger) {
    const existing = this.triggers.get(trigger.id);
    if (!existing) {
      throw new QueueError(`Cannot replace trigger '${trigger.id}': not registered`);
    }
    const partial = trigger;
    if (!("fires_count" in partial)) trigger.fires_count = existing.fires_count;
    if (!("last_fired" in partial)) trigger.last_fired = existing.last_fired;
    this.triggers.set(trigger.id, trigger);
    this.sortedTriggerCache = null;
    log3.info("Trigger replaced", { trigger_id: trigger.id });
  }
  /**
   * Removes a trigger by ID. No-op if the trigger does not exist.
   *
   * @param triggerId - ID of the trigger to remove.
   * @returns `true` if the trigger existed, `false` otherwise.
   */
  unregister(triggerId) {
    const existed = this.triggers.delete(triggerId);
    if (existed) {
      this.sortedTriggerCache = null;
      log3.debug("Trigger unregistered", { id: triggerId });
    }
    return existed;
  }
  /**
   * Enables or disables a trigger.
   *
   * @param triggerId - ID of the trigger to update.
   * @param enabled - `true` to enable, `false` to disable.
   */
  setEnabled(triggerId, enabled) {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) {
      log3.warn("setEnabled: trigger not found", { id: triggerId });
      return;
    }
    trigger.enabled = enabled;
    this.sortedTriggerCache = null;
    log3.debug("Trigger enabled state updated", { id: triggerId, enabled });
  }
  /**
   * Evaluates all enabled triggers against the incoming event.
   *
   * Processing order:
   * 1. Record the event in the condition evaluator (needed for threshold/sequence).
   * 2. Sort enabled triggers by priority (ascending — lower number = first).
   * 3. Evaluate all enabled triggers in parallel (guards + condition + action).
   * 4. Collect results; log any unexpected rejections.
   *
   * @param event - The event to evaluate against all triggers.
   * @returns Results for every trigger that was checked (fired or skipped).
   */
  async evaluate(event) {
    this.evaluator.recordEvent(event);
    const results = [];
    if (this.sortedTriggerCache === null) {
      this.sortedTriggerCache = [...this.triggers.values()].filter((t) => t.enabled).sort((a, b) => a.priority - b.priority);
    }
    const sorted = this.sortedTriggerCache;
    const settled = await Promise.allSettled(
      sorted.map((trigger) => this.evaluateTrigger(trigger, event))
    );
    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
      } else {
        log3.error("Unexpected error evaluating trigger", { error: outcome.reason });
      }
    }
    return results;
  }
  /**
   * Retrieves a trigger definition by ID.
   *
   * @param triggerId - The trigger ID to look up.
   * @returns The trigger definition, or `undefined` if not found.
   */
  get(triggerId) {
    return this.triggers.get(triggerId);
  }
  /**
   * Lists all registered triggers in registration order.
   *
   * @returns An array of all trigger definitions.
   */
  list() {
    return [...this.triggers.values()];
  }
  /**
   * Returns the action executor instance.
   *
   * Exposed for external handler registration.
   *
   * @returns The internal action executor.
   */
  getActionExecutor() {
    return this.executor;
  }
  /**
   * Registers a named action handler delegate.
   *
   * Handlers are mirrored in `actionHandlers` for book-keeping.
   *
   * @param name - The handler name used in `InvokeHandlerAction.handler`.
   * @param handler - The async handler function.
   */
  registerHandler(name, handler) {
    this.actionHandlers.set(name, handler);
    this.executor.registerHandler(name, handler);
    log3.debug("Action handler registered", { name });
  }
  /**
   * Restores trigger fire counts and last-fired timestamps from a previous
   * session. Only updates triggers that are already registered; unknown
   * trigger IDs are silently ignored.
   *
   * @param state - Array of trigger state entries to restore.
   */
  restoreTriggerState(state) {
    let restored = 0;
    for (const entry of state) {
      const trigger = this.triggers.get(entry.triggerId);
      if (trigger) {
        trigger.fires_count = entry.firesCount;
        if (entry.lastFired !== void 0) {
          trigger.last_fired = entry.lastFired;
        }
        restored++;
      } else {
        log3.debug("restoreTriggerState: trigger not found, skipping", {
          id: entry.triggerId
        });
      }
    }
    log3.info("Trigger states restored", { restored, total: state.length });
  }
  /**
   * Returns a snapshot of the current fire counts and last-fired timestamps
   * for all registered triggers. Used by the snapshot/persistence subsystem.
   *
   * @returns Array of trigger state snapshots.
   */
  getTriggerStates() {
    return Array.from(this.triggers.values()).map((trigger) => ({
      triggerId: trigger.id,
      firesCount: trigger.fires_count,
      lastFired: trigger.last_fired
    }));
  }
  /**
   * Resets fire counts and last-fired timestamps for all registered triggers.
   *
   * Called at session start to ensure trigger budgets are per-session, not
   * accumulated across snapshot recoveries.
   */
  resetAllFireCounts() {
    let reset = 0;
    for (const trigger of this.triggers.values()) {
      trigger.fires_count = 0;
      trigger.last_fired = void 0;
      reset++;
    }
    log3.info("All trigger fire counts reset", { count: reset });
  }
  /**
   * Removes events older than `maxAgeMs` from the evaluator's ring buffer.
   *
   * Delegates to the ConditionEvaluator's pruneOldEvents method. Call
   * periodically on low-traffic triggers to prevent unbounded buffer growth.
   *
   * @param maxAgeMs - Maximum event age to retain in milliseconds.
   */
  pruneOldEvents(maxAgeMs) {
    this.evaluator.pruneOldEvents(maxAgeMs);
  }
  // ─── Private Helpers ──────────────────────────────────────────────────────
  /**
   * Returns `true` if the trigger passes all guard checks, or a string
   * discriminant identifying which guard blocked it.
   *
   * Extracted from both `match()` and `evaluateTrigger()` to eliminate the
   * duplicate guard logic that previously re-checked the same conditions to
   * determine `skippedReason`. Guards are stateless checks against trigger
   * fields only — no event context needed.
   *
   * @param trigger - The trigger to check.
   * @param now - Current epoch ms (pass Date.now() from the caller to avoid
   *   multiple clock reads per evaluation batch).
   * @returns `true` when all guards pass, or `'cooldown'` / `'max_fires'` /
   *   `'disabled'` to identify the first failing guard.
   */
  passesGuards(trigger, now) {
    if (!trigger.enabled) return "disabled";
    if (trigger.last_fired !== void 0 && trigger.cooldown_ms !== void 0) {
      if (now - trigger.last_fired < trigger.cooldown_ms) return "cooldown";
    }
    const effectiveMax = trigger.max_fires ?? this.config.max_fires_per_session;
    if (trigger.fires_count >= effectiveMax) return "max_fires";
    return true;
  }
  /**
   * Evaluates a single trigger against an event, applying guards and
   * recording fires.
   *
   * Re-entrant safe: all mutations to trigger state happen AFTER the
   * condition/action results are known (no Map mutations during evaluation).
   */
  async evaluateTrigger(trigger, event) {
    const now = Date.now();
    const guardResult = this.passesGuards(trigger, now);
    if (guardResult !== true) {
      return {
        trigger_id: trigger.id,
        trigger_name: trigger.name,
        fired: false,
        skipped_reason: guardResult
      };
    }
    const conditionMet = this.evaluator.evaluate(trigger.condition, event);
    if (!conditionMet) {
      return {
        trigger_id: trigger.id,
        trigger_name: trigger.name,
        fired: false
      };
    }
    log3.info("Trigger condition met, executing action", {
      trigger_id: trigger.id,
      trigger_name: trigger.name,
      event_type: event.type,
      event_id: event.id
    });
    const actionResult = await this.executor.execute(trigger.action, event);
    trigger.fires_count++;
    trigger.last_fired = Date.now();
    if (!actionResult.success) {
      log3.warn("Trigger action failed", {
        trigger_id: trigger.id,
        error: actionResult.error
      });
    }
    return {
      trigger_id: trigger.id,
      trigger_name: trigger.name,
      fired: true,
      action_result: actionResult
    };
  }
  /**
   * Converts a TriggerDefinition (L2) to a minimal L1 Trigger stub.
   *
   * Used by the `match()` compatibility shim. Only the fields that L1
   * consumers actually use are populated; others use safe defaults.
   */
  toL1Trigger(trigger) {
    return {
      id: trigger.id,
      enabled: trigger.enabled,
      priority: trigger.priority,
      max_fires: trigger.max_fires,
      cooldown_ms: trigger.cooldown_ms,
      // L2 uses TriggerCondition; L1 uses EventMatcher. Bridge:
      // Synthesise an EventMatcher from EventCondition if possible,
      // otherwise use a catch-all that matches any event.
      event_match: this.toEventMatcher(trigger),
      // L2 uses TriggerAction union; L1 uses Action[]. Bridge:
      // Synthesise a single emit_event Action as a stub.
      actions: [{
        type: "emit_event",
        params: { trigger_id: trigger.id, source: "trigger-registry" }
      }]
    };
  }
  /**
   * Derives an L1 EventMatcher from a TriggerDefinition's condition.
   *
   * For EventCondition: uses event_type directly.
   * For all others: returns a wildcard matcher (any event).
   */
  toEventMatcher(trigger) {
    const cond = trigger.condition;
    if (cond.type === "event") {
      const pattern = cond.event_type;
      if (pattern === "*") {
        return { type: /.*/ };
      }
      if (typeof pattern === "string" && pattern.endsWith(":*")) {
        const prefix = pattern.slice(0, -1);
        return { type: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) };
      }
      if (typeof pattern === "string") {
        return { type: pattern };
      }
    }
    return { type: /.*/ };
  }
};

// src/extensions/triggers/condition-evaluator.ts
var ConditionEvaluator = class {
  static {
    __name(this, "ConditionEvaluator");
  }
  /** Pre-allocated ring buffer storage for recent events. */
  recentEventsBuffer;
  /** Next write index into the circular buffer (monotonically increasing). */
  recentEventsHead = 0;
  /** Number of events currently stored in the buffer. */
  recentEventsCount = 0;
  /** Maximum number of recent events to retain. */
  maxRecentEvents;
  /**
   * @param maxRecentEvents - Maximum events to retain in the buffer (default: 1000).
   */
  constructor(maxRecentEvents = 1e3) {
    this.maxRecentEvents = maxRecentEvents;
    this.recentEventsBuffer = new Array(maxRecentEvents);
  }
  /**
   * Records an event in the recent-events buffer.
   *
   * Must be called before `evaluate` so threshold and sequence conditions
   * have access to the full event history including the current event.
   *
   * @param event - The event to record.
   */
  recordEvent(event) {
    this.recentEventsBuffer[this.recentEventsHead % this.maxRecentEvents] = {
      event,
      timestamp: Date.now()
    };
    this.recentEventsHead++;
    if (this.recentEventsHead >= Number.MAX_SAFE_INTEGER - this.maxRecentEvents) {
      this.recentEventsHead = this.recentEventsHead % this.maxRecentEvents;
    }
    if (this.recentEventsCount < this.maxRecentEvents) {
      this.recentEventsCount++;
    }
  }
  /**
   * Evaluates a condition against the given event.
   *
   * @param condition - The condition to evaluate.
   * @param event - The triggering event.
   * @returns `true` if the condition is satisfied.
   */
  evaluate(condition, event) {
    switch (condition.type) {
      case "event":
        return this.evaluateEvent(condition, event);
      case "and":
        return condition.conditions.every((c) => this.evaluate(c, event));
      case "or":
        return condition.conditions.some((c) => this.evaluate(c, event));
      case "not": {
        const first = condition.conditions[0];
        return first !== void 0 ? !this.evaluate(first, event) : false;
      }
      case "threshold":
        return this.evaluateThreshold(condition, event);
      case "sequence":
        return this.evaluateSequence(condition, event);
      default:
        return false;
    }
  }
  /**
   * Tests whether `eventType` matches `pattern`.
   *
   * - `'*'` matches any event type
   * - `'namespace:*'` matches any event whose type starts with `namespace:`
   * - An exact string matches only that specific type
   */
  matchEventType(eventType, pattern) {
    if (pattern === "*") return true;
    if (pattern.endsWith(":*")) {
      return eventType.startsWith(pattern.slice(0, -1));
    }
    return eventType === pattern;
  }
  /**
   * Evaluates a simple event condition: type match + optional payload filter.
   */
  evaluateEvent(cond, event) {
    if (!this.matchEventType(event.type, cond.event_type)) return false;
    if (cond.filter) {
      const data = event.payload.data ?? {};
      for (const [key, expected] of Object.entries(cond.filter)) {
        if (data[key] !== expected) return false;
      }
    }
    return true;
  }
  /**
   * Returns the contents of the ring buffer in chronological order (oldest first).
   */
  getRecentEventsInOrder() {
    if (this.recentEventsCount === 0) return [];
    const capacity = this.maxRecentEvents;
    const startIndex = this.recentEventsCount < capacity ? 0 : this.recentEventsHead % capacity;
    const result = [];
    for (let i = 0; i < this.recentEventsCount; i++) {
      const entry = this.recentEventsBuffer[(startIndex + i) % capacity];
      if (entry !== void 0) result.push(entry);
    }
    return result;
  }
  /**
   * Evaluates a threshold condition: at least `count` matching events
   * within the last `window_ms` milliseconds (including the current event).
   */
  evaluateThreshold(cond, event) {
    if (!this.matchEventType(event.type, cond.event_type)) return false;
    const now = Date.now();
    const windowStart = now - cond.window_ms;
    let matchCount = 0;
    for (const entry of this.getRecentEventsInOrder()) {
      if (entry.timestamp < windowStart) continue;
      if (!this.matchEventType(entry.event.type, cond.event_type)) continue;
      matchCount++;
      if (matchCount >= cond.count) return true;
    }
    return false;
  }
  /**
   * Evaluates a sequence condition: all events in `cond.events` must have
   * occurred in order within the last `window_ms` milliseconds, with the
   * current event matching the final pattern in the sequence.
   */
  evaluateSequence(cond, event) {
    if (cond.events.length === 0) return false;
    const lastPattern = cond.events[cond.events.length - 1];
    if (!this.matchEventType(event.type, lastPattern)) return false;
    if (cond.events.length === 1) return true;
    const now = Date.now();
    const windowStart = now - cond.window_ms;
    const windowEvents = this.getRecentEventsInOrder().filter(
      (e) => e.timestamp >= windowStart
    );
    let patternIndex = 0;
    const patternsToMatch = cond.events.slice(0, -1);
    for (const entry of windowEvents) {
      if (patternIndex >= patternsToMatch.length) break;
      const pattern = patternsToMatch[patternIndex];
      if (this.matchEventType(entry.event.type, pattern)) {
        patternIndex++;
      }
    }
    return patternIndex >= patternsToMatch.length;
  }
  /**
   * Removes events older than `maxAgeMs` from the buffer.
   *
   * Called periodically to prevent unbounded growth when the trigger
   * registry evaluates infrequently-fired triggers.
   *
   * @param maxAgeMs - Maximum age in milliseconds. Events older than this are removed.
   */
  pruneOldEvents(maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    const capacity = this.maxRecentEvents;
    let pruned = 0;
    while (pruned < this.recentEventsCount) {
      const oldestSlot = ((this.recentEventsHead - this.recentEventsCount + pruned) % capacity + capacity) % capacity;
      const entry = this.recentEventsBuffer[oldestSlot];
      if (entry === void 0 || entry.timestamp < cutoff) {
        this.recentEventsBuffer[oldestSlot] = void 0;
        pruned++;
      } else {
        break;
      }
    }
    this.recentEventsCount -= pruned;
    if (this.recentEventsCount === 0) {
      this.recentEventsHead = 0;
    }
  }
};

// src/extensions/directives/legacy-directive-builder.ts
function buildSpawnDirectiveMessage(agentType, task, context) {
  const directive = {
    action: "spawn",
    wid: context?.workflow_id ?? "unknown",
    type: agentType,
    task
  };
  return "<gv>" + JSON.stringify(directive) + "</gv>";
}
__name(buildSpawnDirectiveMessage, "buildSpawnDirectiveMessage");
function buildWorkflowCompleteMessage(workflowId) {
  const directive = {
    action: "complete",
    wid: workflowId
  };
  return "<gv>" + JSON.stringify(directive) + "</gv>";
}
__name(buildWorkflowCompleteMessage, "buildWorkflowCompleteMessage");
function buildEscalationMessage(workflowId, fixAttempts, lastScore) {
  const directive = {
    action: "escalate",
    wid: workflowId,
    reason: fixAttempts + " fix attempts failed, last score " + lastScore + "/10"
  };
  return "<gv>" + JSON.stringify(directive) + "</gv>";
}
__name(buildEscalationMessage, "buildEscalationMessage");

// src/extensions/triggers/trigger-action-executor.ts
var log4 = createLogger("action-executor");
var DENIED_PATH_SEGMENTS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
function resolveStringTemplate(value, event) {
  return value.replace(/\$event\.([\w.]+)/g, (_match, path3) => {
    const parts = path3.split(".");
    if (parts.some((part) => DENIED_PATH_SEGMENTS.has(part))) {
      log4.warn("Blocked prototype chain traversal attempt in template", { path: path3, template: value });
      return "";
    }
    let current = event;
    for (const part of parts) {
      if (current === null || current === void 0 || typeof current !== "object") {
        return "";
      }
      current = current[part];
    }
    if (current === void 0 || current === null) {
      log4.debug("Template reference resolved to null/undefined", { path: path3, template: value });
      return "";
    }
    if (typeof current === "object") {
      log4.debug("Template reference resolved to object (not serializable)", { path: path3, template: value });
      return "";
    }
    return String(current);
  });
}
__name(resolveStringTemplate, "resolveStringTemplate");
function resolveTemplate(template, event) {
  const result = {};
  for (const [key, value] of Object.entries(template)) {
    result[key] = resolveValue(value, event);
  }
  return result;
}
__name(resolveTemplate, "resolveTemplate");
function resolveValue(value, event) {
  if (typeof value === "string") {
    return resolveStringTemplate(value, event);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, event));
  }
  if (value !== null && typeof value === "object") {
    return resolveTemplate(value, event);
  }
  return value;
}
__name(resolveValue, "resolveValue");
var TriggerActionExecutor = class {
  static {
    __name(this, "TriggerActionExecutor");
  }
  /** Named handler registry. */
  handlers = /* @__PURE__ */ new Map();
  /** Event emitter for emit_event actions. Only .emit() is called — EventEmitter (L1) suffices over EventBus (L2). */
  eventBus;
  /** Directive queue for spawn_agent and workflow actions. */
  directiveQueue;
  /** Workflow engine for start_workflow and send_workflow_event actions. */
  workflowEngine;
  /** Triggers configuration for timeout and other settings. */
  config;
  /** Optional provider for workflow context defaults — plugins register their own. */
  contextProvider;
  /**
   * @param eventBus - The shared EventBus instance, or null if not available.
   * @param directiveQueue - The shared DirectiveQueue instance, or null if not available.
   * @param workflowEngine - The shared WorkflowEngine instance, or null if not available.
   * @param config - The triggers configuration, or null to use built-in defaults.
   * @param contextProvider - Optional provider for workflow context defaults.
   */
  constructor(eventBus = null, directiveQueue = null, workflowEngine = null, config = null, contextProvider) {
    this.eventBus = eventBus;
    this.directiveQueue = directiveQueue;
    this.workflowEngine = workflowEngine;
    this.config = config;
    this.contextProvider = contextProvider;
  }
  /**
   * Registers a named action handler.
   *
   * @param name - The handler name used in `InvokeHandlerAction.handler`.
   * @param handler - The async function to invoke.
   */
  registerHandler(name, handler) {
    this.handlers.set(name, handler);
  }
  /**
   * Executes a trigger action.
   *
   * All errors are caught and returned as `{ success: false, error }` rather
   * than thrown, so a failing action does not propagate to the registry.
   *
   * @param action - The action to execute.
   * @param event - The event that triggered this action.
   * @returns Execution result.
   */
  async execute(action, event) {
    try {
      switch (action.type) {
        case "emit_event":
          return await this.executeEmitEvent(action, event);
        case "spawn_agent":
          return await this.executeSpawnAgent(action, event);
        case "invoke_handler":
          return await this.executeInvokeHandler(action, event);
        case "start_workflow":
        case "send_workflow_event":
          return await this.executeWorkflowAction(action, event);
        case "parallel":
          return await this.executeParallel(action, event);
        case "sequence":
          return await this.executeSequence(action, event);
        default: {
          const exhaustiveCheck = action;
          return { success: false, error: `Unknown action type: ${String(exhaustiveCheck.type)}` };
        }
      }
    } catch (err) {
      const message = toErrorMessage(err);
      log4.error("Action execution threw unexpected error", { error: message });
      return { success: false, error: message };
    }
  }
  /**
   * Emits a runtime event via the EventBus with resolved template payload.
   */
  async executeEmitEvent(action, event) {
    if (!this.eventBus) {
      return { success: false, error: "EventBus not provided \u2014 pass it via the constructor" };
    }
    const resolvedPayload = resolveTemplate(action.payload_template, event);
    this.eventBus.emit({
      id: generateEventId(),
      timestamp: timestamp(),
      priority: 0,
      type: action.event_type,
      source: { kind: "trigger", trigger_id: event.id },
      payload: {
        type: action.event_type,
        data: resolvedPayload
      },
      metadata: {
        causation_id: event.id,
        correlation_id: event.metadata?.correlation_id,
        session_id: event.metadata?.session_id ?? "",
        sequence: 0,
        // Will be overwritten by EventBus
        version: 1
      }
    });
    log4.debug("emit_event action executed", { event_type: action.event_type });
    return { success: true };
  }
  /**
   * Enqueues a spawn-agent directive into the DirectiveQueue so a hook can
   * inject the system message into Claude's context.
   */
  async executeSpawnAgent(action, event) {
    const resolvedTask = resolveStringTemplate(action.task_template, event);
    if (!this.directiveQueue) {
      log4.warn("spawn_agent action: directiveQueue not set \u2014 logging intent only", {
        agent_type: action.agent_type,
        task: resolvedTask,
        triggered_by: event.id
      });
      return { success: true };
    }
    const message = buildSpawnDirectiveMessage(
      action.agent_type,
      resolvedTask
    );
    this.directiveQueue.enqueue("subagent_stop", {
      type: "inject_system_message",
      content: message,
      priority: 10,
      source: "action-executor:spawn_agent",
      workflow_id: void 0
    });
    log4.info("spawn_agent action: directive enqueued", {
      agent_type: action.agent_type,
      task: resolvedTask,
      triggered_by: event.id
    });
    return { success: true };
  }
  /**
   * Invokes a named handler registered via `registerHandler`.
   *
   * Wraps the handler call in a timeout race so a hung handler does not block
   * the trigger evaluation pipeline indefinitely. The timeout duration is read
   * from `config.handler_timeout_ms` (default: 30 000 ms). A value of 0 disables
   * the timeout entirely.
   */
  async executeInvokeHandler(action, event) {
    const handler = this.handlers.get(action.handler);
    if (!handler) {
      return { success: false, error: `Handler '${action.handler}' not registered` };
    }
    const resolvedArgs = resolveTemplate(action.args_template, event);
    const handlerName = action.handler;
    const timeoutMs = this.config?.handler_timeout_ms ?? 3e4;
    if (timeoutMs === 0) {
      await handler(resolvedArgs, event);
    } else {
      let timeoutHandle;
      try {
        await Promise.race([
          handler(resolvedArgs, event),
          new Promise((_resolve, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error(`Handler '${handlerName}' timed out after ${timeoutMs}ms`)),
              timeoutMs
            );
          })
        ]);
      } finally {
        clearTimeout(timeoutHandle);
      }
    }
    log4.debug("invoke_handler action executed", { handler: action.handler });
    return { success: true };
  }
  /**
   * Executes a workflow action — starts a workflow or sends an event to active workflows.
   */
  async executeWorkflowAction(action, event) {
    const resolvedContext = action.context_template ? resolveTemplate(action.context_template, event) : {};
    if (!this.workflowEngine) {
      log4.info("workflow action: workflowEngine not set \u2014 logging intent only", {
        action_type: action.type,
        workflow_definition: action.workflow_definition,
        context: resolvedContext,
        triggered_by: event.id
      });
      return { success: true };
    }
    if (action.type === "start_workflow") {
      if (!action.workflow_definition) {
        return { success: false, error: "start_workflow: workflow_definition is required" };
      }
      try {
        const contextDefaults = this.contextProvider?.(action.workflow_definition ?? "") ?? {};
        const instance = this.workflowEngine.create(
          action.workflow_definition,
          { ...contextDefaults, ...resolvedContext }
        );
        log4.info("start_workflow action: workflow created", {
          definition: action.workflow_definition,
          instance_id: instance.id,
          triggered_by: event.id
        });
      } catch (err) {
        const message = toErrorMessage(err);
        log4.error("start_workflow action: failed to create workflow", { error: message });
        return { success: false, error: message };
      }
      return { success: true };
    }
    if (action.type === "send_workflow_event") {
      const activeWorkflows = this.workflowEngine.listActive();
      let sentCount = 0;
      for (const instance of activeWorkflows) {
        try {
          await this.workflowEngine.sendEvent(instance.id, event);
          sentCount++;
        } catch (err) {
          log4.warn("send_workflow_event: failed to send to workflow", {
            workflow_id: instance.id,
            error: toErrorMessage(err)
          });
        }
      }
      log4.info("send_workflow_event action: sent to active workflows", {
        count: sentCount,
        triggered_by: event.id
      });
      return { success: true };
    }
    return { success: false, error: `Unknown workflow action type: ${String(action.type)}` };
  }
  /**
   * Executes all actions in parallel via `Promise.all`.
   * Returns success only if all actions succeed.
   */
  async executeParallel(action, event) {
    const results = await Promise.all(
      action.actions.map((a) => this.execute(a, event))
    );
    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      return {
        success: false,
        error: `${failed.length} of ${results.length} parallel actions failed: ${failed.map((r) => r.error).join("; ")}`
      };
    }
    return { success: true };
  }
  /**
   * Executes actions sequentially, stopping on the first failure.
   */
  async executeSequence(action, event) {
    for (const subAction of action.actions) {
      const result = await this.execute(subAction, event);
      if (!result.success) {
        return result;
      }
    }
    return { success: true };
  }
};

// src/extensions/triggers/builtins.ts
function getBuiltinTriggers() {
  return [
    // ─── 1. Auto Fix Build ────────────────────────────────────────────────────
    {
      id: "builtin_auto_fix_build",
      name: "auto_fix_build",
      description: "Start fix loop when build fails 2 times within 60 seconds",
      enabled: true,
      priority: 10,
      condition: {
        type: "threshold",
        event_type: "build:failed",
        count: 2,
        window_ms: 6e4
      },
      action: {
        type: "start_workflow",
        workflow_definition: "fix_loop",
        context_template: {
          trigger: "build_failure",
          event_id: "$event.id",
          event_type: "$event.type"
        }
      },
      cooldown_ms: 12e4,
      max_fires: 5,
      fires_count: 0
    },
    // ─── 2. Auto Fix Test ─────────────────────────────────────────────────────
    {
      id: "builtin_auto_fix_test",
      name: "auto_fix_test",
      description: "Start fix loop when a test fails after an agent completes",
      enabled: true,
      priority: 20,
      condition: {
        type: "sequence",
        events: ["agent:completed", "test:failed"],
        window_ms: 12e4
      },
      action: {
        type: "start_workflow",
        workflow_definition: "fix_loop",
        context_template: {
          trigger: "test_failure",
          event_id: "$event.id",
          event_type: "$event.type"
        }
      },
      cooldown_ms: 12e4,
      max_fires: 5,
      fires_count: 0
    },
    // ─── 3. Budget Warning ────────────────────────────────────────────────────
    {
      id: "builtin_budget_warning",
      name: "budget_warning",
      description: "Fire on any agent:progress event. NOTE: this trigger fires on every agent:progress event regardless of cost level \u2014 actual budget threshold checks (cost > 80%) must be implemented in the invoke_handler action or by filtering payload fields in the handler, not in this condition.",
      enabled: true,
      priority: 30,
      condition: {
        type: "event",
        event_type: "agent:progress"
        // Note: deep payload filtering is not supported in EventCondition —
        // the TriggerRegistry/ConditionEvaluator filter checks top-level data fields.
        // Budget threshold logic requires the invoke_handler approach for real use;
        // here we demonstrate a basic field match.
      },
      action: {
        type: "emit_event",
        event_type: "agent:budget_warning",
        payload_template: {
          source_event_id: "$event.id",
          agent_id: "$event.payload.data.agent_id",
          triggered_by: "budget_warning_trigger"
        }
      },
      cooldown_ms: 3e4,
      max_fires: 20,
      fires_count: 0
    },
    // ─── 4. Sequential Spawn Alert ────────────────────────────────────────────
    {
      id: "builtin_sequential_spawn_alert",
      name: "sequential_spawn_alert",
      description: "Emit system:error (warning severity) when 3 or more agents are spawned within 30 seconds",
      enabled: true,
      priority: 40,
      condition: {
        type: "threshold",
        event_type: "agent:spawned",
        count: 3,
        window_ms: 3e4
      },
      action: {
        type: "emit_event",
        event_type: "system:error",
        payload_template: {
          error: "High agent spawn rate detected: 3+ agents spawned within 30 seconds",
          component: "trigger-registry",
          severity: "warning",
          triggered_by_event: "$event.id"
        }
      },
      cooldown_ms: 6e4,
      max_fires: 10,
      fires_count: 0
    },
    // ─── 5. Dev Server Recovery ───────────────────────────────────────────────
    {
      id: "builtin_devserver_recovery",
      name: "devserver_recovery",
      description: "Invoke the restartDevServer handler when the dev server reports an error",
      enabled: true,
      priority: 15,
      condition: {
        type: "event",
        event_type: "devserver:error"
      },
      action: {
        type: "invoke_handler",
        handler: "restartDevServer",
        args_template: {
          event_id: "$event.id",
          error: "$event.payload.data.error",
          pid: "$event.payload.data.pid",
          port: "$event.payload.data.port",
          command: "$event.payload.data.command"
        }
      },
      cooldown_ms: 3e4,
      max_fires: 10,
      fires_count: 0
    }
  ];
}
__name(getBuiltinTriggers, "getBuiltinTriggers");

// src/extensions/triggers/subsystem.ts
var logger6 = createLogger("triggers-subsystem");
function createTriggerSubsystem(config, deps) {
  const evaluator = new ConditionEvaluator();
  const executor = new TriggerActionExecutor(
    deps.eventBus,
    deps.directiveQueue,
    deps.workflowEngine,
    config.triggers,
    deps.contextProvider
  );
  const triggerRegistry = new TriggerRegistry(config.triggers, evaluator, executor);
  for (const trigger of getBuiltinTriggers()) {
    triggerRegistry.register(trigger);
  }
  logger6.debug("Trigger subsystem created");
  return { triggerRegistry };
}
__name(createTriggerSubsystem, "createTriggerSubsystem");

// src/extensions/agents/budget-tracker.ts
var logger7 = createLogger("budget-tracker");
var BudgetTracker = class {
  static {
    __name(this, "BudgetTracker");
  }
  eventBus;
  config;
  records = /* @__PURE__ */ new Map();
  /**
   * Running total of spent tokens across all tracked agents.
   * Updated incrementally on every `updateAgentBudget` and `removeAgent` call
   * to avoid O(n) iteration in `getTotalSpent()` / `hasBudget()`.
   */
  runningTotal = 0;
  constructor(eventBus, config) {
    this.eventBus = eventBus;
    this.config = config;
    logger7.debug("BudgetTracker initialised", {
      session_budget: config.session_budget,
      thresholds: config.budget_thresholds
    });
  }
  // ─── Public API ─────────────────────────────────────────────────────────────
  /**
   * Register a new agent for budget tracking.
   *
   * @param agentId - Unique agent identifier.
   * @param agentType - Agent type string (e.g. "engineer").
   * @param workflowId - Optional workflow the agent belongs to.
   */
  registerAgent(agentId, agentType, workflowId) {
    if (this.records.has(agentId)) return;
    this.records.set(agentId, {
      agentId,
      workflowId,
      agentType,
      status: "pending",
      budget: {
        allocated: this.config.default_budget,
        spent: 0,
        remaining: this.config.default_budget,
        exhausted: false,
        usage_percent: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_tokens: 0,
        cost_usd: 0
      },
      firedThresholds: /* @__PURE__ */ new Set()
    });
    logger7.debug("Agent registered for budget tracking", { agentId, agentType, workflowId });
  }
  /**
   * Update the budget snapshot for an agent and fire threshold alerts as needed.
   *
   * @param agentId - Agent whose budget changed.
   * @param budget  - New budget snapshot.
   */
  updateAgentBudget(agentId, budget) {
    const record = this.records.get(agentId);
    if (!record) {
      logger7.warn("updateAgentBudget called for unregistered agent", { agentId });
      return;
    }
    const previousSpent = record.budget.spent;
    record.budget = budget;
    this.runningTotal += budget.spent - previousSpent;
    for (const threshold of this.config.budget_thresholds) {
      if (!record.firedThresholds.has(threshold) && budget.usage_percent >= threshold) {
        this.emitBudgetWarning(record, threshold);
        record.firedThresholds.add(threshold);
      }
    }
  }
  /**
   * Remove an agent's budget record (called after completion / pruning).
   *
   * @param agentId - Agent to remove.
   */
  removeAgent(agentId) {
    const record = this.records.get(agentId);
    if (record) {
      this.runningTotal -= record.budget.spent;
    }
    this.records.delete(agentId);
  }
  /**
   * Update the status of a tracked agent. Used to populate per-workflow
   * agents_completed and agents_active counts in budget summaries.
   *
   * @param agentId - Agent whose status changed.
   * @param status  - New agent status.
   */
  updateAgentStatus(agentId, status) {
    const record = this.records.get(agentId);
    if (record) record.status = status;
  }
  /**
   * Check whether sufficient session budget remains to spawn a new agent.
   *
   * A session_budget of 0 means unlimited — always returns true.
   *
   * @param requiredAmount - Additional tokens the new agent is expected to use.
   *   Defaults to the configured default_budget.
   * @returns True if the session budget allows spawning.
   */
  hasBudget(requiredAmount) {
    if (this.config.session_budget === 0) return true;
    const needed = requiredAmount ?? this.config.default_budget;
    const spent = this.getTotalSpent();
    return spent + needed <= this.config.session_budget;
  }
  /**
   * Build a full budget summary across the session, by workflow, and by agent type.
   *
   * @returns BudgetSummary snapshot.
   */
  getBudgetSummary() {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCache = 0;
    let totalCost = 0;
    const byWorkflow = {};
    const byAgentType = {};
    for (const record of this.records.values()) {
      const b = record.budget;
      totalInput += b.input_tokens;
      totalOutput += b.output_tokens;
      totalCache += b.cache_tokens;
      totalCost += b.cost_usd;
      if (record.workflowId) {
        if (!byWorkflow[record.workflowId]) {
          byWorkflow[record.workflowId] = {
            tokens: { input: 0, output: 0, cache: 0 },
            cost_usd: 0,
            agents_completed: 0,
            agents_active: 0
          };
        }
        const wf = byWorkflow[record.workflowId];
        wf.tokens.input += b.input_tokens;
        wf.tokens.output += b.output_tokens;
        wf.tokens.cache += b.cache_tokens;
        wf.cost_usd += b.cost_usd;
        if (record.status === "completed") wf.agents_completed += 1;
        if (record.status === "running") wf.agents_active += 1;
      }
      if (!byAgentType[record.agentType]) {
        byAgentType[record.agentType] = {
          count: 0,
          total_tokens: 0,
          total_cost_usd: 0,
          avg_tokens_per_agent: 0
        };
      }
      const at = byAgentType[record.agentType];
      at.count += 1;
      at.total_tokens += b.input_tokens + b.output_tokens;
      at.total_cost_usd += b.cost_usd;
      at.avg_tokens_per_agent = at.count > 0 ? at.total_tokens / at.count : 0;
    }
    const remaining = this.config.session_budget > 0 ? Math.max(0, this.config.session_budget - this.getTotalSpent()) : void 0;
    return {
      session: {
        total_tokens: { input: totalInput, output: totalOutput, cache: totalCache },
        total_cost_usd: totalCost,
        budget_remaining_tokens: remaining
      },
      by_workflow: byWorkflow,
      by_agent_type: byAgentType
    };
  }
  /**
   * Return the budget record for a specific agent, or undefined.
   *
   * @param agentId - Agent to look up.
   */
  getAgentBudget(agentId) {
    return this.records.get(agentId)?.budget;
  }
  /**
   * Update the config used by this tracker (e.g. after a live config reload).
   *
   * @param config - New agents configuration.
   */
  updateConfig(config) {
    this.config = config;
    logger7.debug("BudgetTracker config updated", {
      session_budget: config.session_budget
    });
  }
  // ─── Private helpers ────────────────────────────────────────────────────────
  /**
   * Returns the cached running total of spent tokens across all tracked agents.
   * O(1) — maintained incrementally via `updateAgentBudget` and `removeAgent`.
   */
  getTotalSpent() {
    return this.runningTotal;
  }
  /**
   * Emit an `agent:budget_warning` event onto the EventBus.
   *
   * @param record    - The agent record that crossed the threshold.
   * @param threshold - The threshold percentage that was crossed.
   */
  emitBudgetWarning(record, threshold) {
    try {
      this.eventBus.emit({
        id: generateEventId(),
        timestamp: timestamp(),
        type: "agent:budget_warning",
        source: { kind: "system" },
        payload: {
          type: "agent:budget_warning",
          data: {
            agent_id: record.agentId,
            agent_type: record.agentType,
            workflow_id: record.workflowId,
            threshold_percent: threshold,
            usage_percent: record.budget.usage_percent,
            spent: record.budget.spent,
            allocated: record.budget.allocated,
            cost_usd: record.budget.cost_usd
          }
        }
      });
      logger7.warn("Budget threshold crossed", {
        agentId: record.agentId,
        threshold,
        usage_percent: record.budget.usage_percent
      });
    } catch (err) {
      logger7.error("Failed to emit budget warning event", {
        error: toErrorMessage(err),
        agentId: record.agentId,
        threshold
      });
    }
  }
};

// src/extensions/agents/agent-coordinator.ts
var logger8 = createLogger("agent-coordinator");
var DEFAULT_COST_PER_TOKEN = 3e-6;
var VALID_TRANSITIONS = {
  pending: /* @__PURE__ */ new Set(["running", "cancelled"]),
  running: /* @__PURE__ */ new Set(["completed", "failed", "cancelled"]),
  completed: /* @__PURE__ */ new Set(),
  failed: /* @__PURE__ */ new Set(),
  cancelled: /* @__PURE__ */ new Set()
};
var AgentCoordinator = class {
  static {
    __name(this, "AgentCoordinator");
  }
  eventBus;
  budgetTracker;
  config;
  agents = /* @__PURE__ */ new Map();
  workflowChains = /* @__PURE__ */ new Map();
  /** Timer for periodic cleanup of terminated agents. */
  cleanupTimer = null;
  /**
   * @param eventBus      - EventBus instance for emitting agent lifecycle events.
   * @param budgetTracker - BudgetTracker for session-level token budget accounting.
   * @param config        - Agent-specific runtime configuration.
   */
  constructor(eventBus, budgetTracker, config) {
    this.eventBus = eventBus;
    this.budgetTracker = budgetTracker;
    this.config = config;
    logger8.debug("AgentCoordinator initialised", {
      max_concurrent: config.max_concurrent,
      session_budget: config.session_budget
    });
  }
  // ─── Spawn ──────────────────────────────────────────────────────────────────
  /**
   * Register a new coordinated agent entry.
   *
   * Validates budget availability and concurrent agent limits before
   * creating the registry entry. Emits `agent:spawned` on the EventBus.
   *
   * @param options - Spawn configuration.
   * @returns The generated agent ID.
   * @throws If budget is insufficient or concurrency limit is reached.
   */
  spawn(options) {
    const budgetNeeded = options.budget ?? this.config.default_budget;
    if (!this.budgetTracker.hasBudget(budgetNeeded)) {
      throw new ProcessingError(
        `Session budget exhausted \u2014 cannot spawn agent (type=${options.type}, needed=${budgetNeeded})`
      );
    }
    const activeCount = this.listActive().length;
    if (activeCount >= this.config.max_concurrent) {
      throw new ProcessingError(
        `Concurrency limit reached (max=${this.config.max_concurrent}, active=${activeCount})`
      );
    }
    const id = `agent_${generateId()}`;
    const agent = {
      id,
      type: options.type,
      task: options.task,
      status: "pending",
      budget: {
        allocated: budgetNeeded,
        spent: 0,
        remaining: budgetNeeded,
        exhausted: false,
        usage_percent: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_tokens: 0,
        cost_usd: 0
      },
      workflow_id: options.workflow_id,
      workflow_phase: options.workflow_phase,
      depends_on: options.depends_on ?? [],
      depended_by: [],
      files_modified: [],
      tools_called: 0
    };
    for (const depId of agent.depends_on) {
      const dep = this.agents.get(depId);
      if (dep) {
        dep.depended_by.push(id);
      }
    }
    this.agents.set(id, agent);
    this.budgetTracker.registerAgent(id, options.type, options.workflow_id);
    if (options.workflow_id && options.workflow_phase) {
      this.addAgentToWorkflowChain(id, options.workflow_id, options.workflow_phase, options.task);
    }
    this.emitEvent("agent:spawned", id, {
      type: options.type,
      task: options.task,
      workflow_id: options.workflow_id,
      workflow_phase: options.workflow_phase,
      depends_on: agent.depends_on
    });
    logger8.info("Agent spawned", { id, type: options.type, workflow_id: options.workflow_id });
    return id;
  }
  // ─── Status updates ─────────────────────────────────────────────────────────
  /**
   * Update an agent's status, validate the transition, and emit the
   * appropriate lifecycle event.
   *
   * @param agentId - Target agent.
   * @param status  - New status.
   * @param details - Optional result, error, and telemetry details.
   */
  updateStatus(agentId, status, details) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      logger8.warn("updateStatus called for unknown agent", { agentId });
      return;
    }
    const allowed = VALID_TRANSITIONS[agent.status];
    if (!allowed.has(status)) {
      logger8.warn("Invalid status transition ignored", {
        agentId,
        from: agent.status,
        to: status
      });
      return;
    }
    const prev = agent.status;
    agent.status = status;
    if (details?.files_modified) agent.files_modified = details.files_modified;
    if (details?.tools_called !== void 0) agent.tools_called = details.tools_called;
    if (status === "running" && !agent.started_at) {
      agent.started_at = timestamp();
    }
    if (status === "completed" || status === "failed" || status === "cancelled") {
      agent.completed_at = timestamp();
      if (agent.started_at) {
        agent.duration_ms = Date.now() - agent.started_at;
      }
    }
    this.budgetTracker.updateAgentStatus(agentId, status);
    const eventType = statusToEventType(status);
    this.emitEvent(eventType, agentId, {
      previous_status: prev,
      result: details?.result,
      error: details?.error,
      files_modified: agent.files_modified,
      tools_called: agent.tools_called,
      duration_ms: agent.duration_ms
    });
    if (status === "completed") {
      this.resolveDependencies(agentId);
      this.updateWorkflowPhaseOnCompletion(agentId);
    }
    logger8.info("Agent status updated", { agentId, from: prev, to: status });
  }
  // ─── Budget ──────────────────────────────────────────────────────────────────
  /**
   * Update the budget snapshot for an agent.
   *
   * @param agentId - Target agent.
   * @param budget  - Updated budget snapshot.
   */
  updateBudget(agentId, budget) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      logger8.warn("updateBudget called for unknown agent", { agentId });
      return;
    }
    agent.budget = budget;
    this.budgetTracker.updateAgentBudget(agentId, budget);
  }
  // ─── Cancel ──────────────────────────────────────────────────────────────────
  /**
   * Cancel an agent.
   *
   * @param agentId - Agent to cancel.
   * @param reason  - Human-readable reason for cancellation.
   */
  cancel(agentId, reason) {
    this.updateStatus(agentId, "cancelled", { error: reason });
  }
  // ─── Queries ─────────────────────────────────────────────────────────────────
  /**
   * Retrieve a single agent by ID.
   *
   * @param id - Agent ID.
   * @returns The agent or undefined.
   */
  getAgent(id) {
    return this.agents.get(id);
  }
  /**
   * List all agents that are currently pending or running.
   *
   * @returns Array of active agents.
   */
  listActive() {
    return Array.from(this.agents.values()).filter(
      (a) => a.status === "pending" || a.status === "running"
    );
  }
  /**
   * List all agents registered with a given workflow ID.
   *
   * @param workflowId - Workflow to filter by.
   * @returns Array of matching agents.
   */
  listByWorkflow(workflowId) {
    return Array.from(this.agents.values()).filter(
      (a) => a.workflow_id === workflowId
    );
  }
  /**
   * Build an execution plan for a workflow by analysing its agents
   * and their dependency relationships.
   *
   * @param workflowId - Workflow to plan.
   * @returns ExecutionPlan with critical path and cost estimates.
   */
  getExecutionPlan(workflowId) {
    const workflowAgents = this.listByWorkflow(workflowId);
    const phaseMap = /* @__PURE__ */ new Map();
    for (const agent of workflowAgents) {
      const phase = agent.workflow_phase ?? "unknown";
      if (!phaseMap.has(phase)) phaseMap.set(phase, []);
      const phaseList = phaseMap.get(phase);
      if (phaseList) phaseList.push(agent);
    }
    const phases = [];
    let maxParallelism = 1;
    let totalTokens = 0;
    for (const [phaseName, phaseAgents] of phaseMap) {
      const agentsInPhase = phaseAgents.map((a) => ({
        id: a.id,
        type: a.type,
        task: a.task,
        parallel: a.depends_on.length === 0,
        depends_on: a.depends_on
      }));
      const parallelAgents = agentsInPhase.filter((a) => a.parallel).length;
      if (parallelAgents > maxParallelism) maxParallelism = parallelAgents;
      const phaseTokens = phaseAgents.reduce(
        (sum, a) => sum + a.budget.allocated,
        0
      );
      totalTokens += phaseTokens;
      phases.push({
        name: phaseName,
        agents: agentsInPhase,
        estimated_tokens: phaseTokens
      });
    }
    const criticalPath = this.computeCriticalPath(workflowAgents);
    const estimatedCostUsd = totalTokens * DEFAULT_COST_PER_TOKEN;
    return {
      workflow_id: workflowId,
      phases,
      critical_path: criticalPath,
      estimated_tokens: totalTokens,
      estimated_cost_usd: estimatedCostUsd,
      max_parallelism: maxParallelism
    };
  }
  /**
   * Get budget summary from the BudgetTracker.
   *
   * @returns BudgetSummary snapshot.
   */
  getBudgetSummary() {
    return this.budgetTracker.getBudgetSummary();
  }
  /**
   * Update the runtime configuration for this coordinator and its BudgetTracker.
   *
   * @param config - New agents configuration.
   */
  updateConfig(config) {
    this.config = config;
    this.budgetTracker.updateConfig(config);
    logger8.debug("AgentCoordinator config updated", {
      max_concurrent: config.max_concurrent,
      session_budget: config.session_budget
    });
  }
  /**
   * Get aggregate coordinator statistics.
   *
   * @returns CoordinatorStats snapshot.
   */
  getStats() {
    let pending = 0, running = 0, completed = 0, failed = 0, cancelled = 0;
    let totalTokensSpent = 0;
    let totalCostUsd = 0;
    const workflowIds = /* @__PURE__ */ new Set();
    for (const agent of this.agents.values()) {
      switch (agent.status) {
        case "pending":
          pending++;
          break;
        case "running":
          running++;
          break;
        case "completed":
          completed++;
          break;
        case "failed":
          failed++;
          break;
        case "cancelled":
          cancelled++;
          break;
      }
      totalTokensSpent += agent.budget.spent;
      totalCostUsd += agent.budget.cost_usd;
      if (agent.workflow_id) workflowIds.add(agent.workflow_id);
    }
    return {
      total_agents: this.agents.size,
      pending,
      running,
      completed,
      failed,
      cancelled,
      active_workflows: workflowIds.size,
      total_tokens_spent: totalTokensSpent,
      total_cost_usd: totalCostUsd
    };
  }
  /**
   * Returns all agents tracked by the coordinator, regardless of status.
   *
   * Used for snapshotting to capture a full picture of agent state.
   *
   * @returns Array of all CoordinatedAgent instances.
   */
  getAllAgents() {
    return Array.from(this.agents.values());
  }
  /**
   * Start periodic cleanup of terminated agent entries to prevent unbounded Map growth.
   *
   * @param intervalMs - How often to run cleanup (default: 5 minutes).
   * @param maxAgeMs   - Remove terminated agents older than this (default: 1 hour).
   */
  startPeriodicCleanup(intervalMs = 3e5, maxAgeMs = 36e5) {
    this.stopPeriodicCleanup();
    this.cleanupTimer = setInterval(() => {
      const pruned = this.prune(maxAgeMs);
      const chainsRemoved = this.pruneStaleWorkflowChains();
      if (pruned > 0 || chainsRemoved > 0) {
        logger8.debug("Periodic cleanup completed", { agents_pruned: pruned, chains_removed: chainsRemoved });
      }
    }, intervalMs);
    if (this.cleanupTimer && typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
    logger8.debug("Periodic cleanup started", { intervalMs, maxAgeMs });
  }
  /**
   * Stop periodic cleanup.
   */
  stopPeriodicCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
  /**
   * Retrieve the workflow chain for a workflow, or undefined.
   *
   * @param workflowId - Workflow ID.
   * @returns WorkflowChain or undefined.
   */
  getWorkflowChain(workflowId) {
    return this.workflowChains.get(workflowId);
  }
  /**
   * Advance the active phase of a workflow chain.
   *
   * Marks the current phase as completed and activates the next phase
   * with the given name. Emits `workflow:phase_changed` on the EventBus.
   *
   * @param workflowId - Workflow whose chain to advance.
   * @param phase      - Name of the phase to transition to.
   */
  advanceWorkflowPhase(workflowId, phase) {
    const chain = this.workflowChains.get(workflowId);
    if (!chain) {
      logger8.warn("advanceWorkflowPhase: no chain found", { workflowId });
      return;
    }
    if (chain.current_phase < chain.phases.length) {
      const current = chain.phases[chain.current_phase];
      if (current) {
        current.status = "completed";
        current.completed_at = timestamp();
      }
    }
    let targetIdx = chain.phases.findIndex((p) => p.name === phase);
    if (targetIdx === -1) {
      chain.phases.push({
        name: phase,
        agent_ids: [],
        status: "active",
        started_at: timestamp()
      });
      targetIdx = chain.phases.length - 1;
    } else {
      chain.phases[targetIdx].status = "active";
      chain.phases[targetIdx].started_at = timestamp();
    }
    const prevPhase = chain.phases[chain.current_phase]?.name;
    chain.current_phase = targetIdx;
    if (phase === "review") {
      chain.review_iterations++;
    }
    this.emitEvent("workflow:phase_changed", workflowId, {
      from_phase: prevPhase,
      to_phase: phase,
      review_iterations: chain.review_iterations
    });
    logger8.info("Workflow phase advanced", { workflowId, from: prevPhase, to: phase });
  }
  /**
   * Remove agents that completed or failed before a given age threshold.
   *
   * @param olderThanMs - Maximum age in ms of retained agents.
   * @returns Number of agents pruned.
   */
  prune(olderThanMs = 36e5) {
    const cutoff = Date.now() - olderThanMs;
    let count = 0;
    for (const [id, agent] of this.agents) {
      if ((agent.status === "completed" || agent.status === "failed" || agent.status === "cancelled") && agent.completed_at !== void 0 && agent.completed_at < cutoff) {
        this.agents.delete(id);
        this.budgetTracker.removeAgent(id);
        for (const remaining of this.agents.values()) {
          remaining.depends_on = remaining.depends_on.filter((d) => d !== id);
          remaining.depended_by = remaining.depended_by.filter((d) => d !== id);
        }
        count++;
      }
    }
    if (count > 0) {
      logger8.debug("Pruned old agent records", { count, olderThanMs });
    }
    return count;
  }
  // ─── Private helpers ────────────────────────────────────────────────────────
  /**
   * Remove workflow chains whose workflows have no active agents.
   *
   * @returns Number of chains removed.
   */
  pruneStaleWorkflowChains() {
    let removed = 0;
    for (const [workflowId, chain] of this.workflowChains) {
      const hasActiveAgents = chain.phases.some(
        (phase) => phase.agent_ids.some((aid) => {
          const agent = this.agents.get(aid);
          return agent && (agent.status === "pending" || agent.status === "running");
        })
      );
      if (!hasActiveAgents) {
        this.workflowChains.delete(workflowId);
        removed++;
      }
    }
    return removed;
  }
  /**
   * Emit a RuntimeEvent on the EventBus with source kind 'system'.
   *
   * @param type    - Event type string.
   * @param subject - Agent ID or workflow ID, used as correlation subject.
   * @param data    - Additional payload data.
   */
  emitEvent(type, subject, data) {
    try {
      this.eventBus.emit({
        id: generateEventId(),
        timestamp: timestamp(),
        type,
        source: { kind: "system" },
        payload: {
          type,
          data: { subject, ...data }
        },
        metadata: { correlation_id: subject }
      });
    } catch (err) {
      logger8.error("Failed to emit agent event", {
        type,
        subject,
        error: toErrorMessage(err)
      });
    }
  }
  /**
   * Check if any pending agents become runnable after agentId completes.
   * An agent is runnable when all its dependencies are completed.
   *
   * @param completedAgentId - The agent that just completed.
   */
  resolveDependencies(completedAgentId) {
    const completed = this.agents.get(completedAgentId);
    if (!completed) return;
    for (const waitingId of completed.depended_by) {
      const waiting = this.agents.get(waitingId);
      if (!waiting || waiting.status !== "pending") continue;
      const allDepsComplete = waiting.depends_on.every((depId) => {
        const dep = this.agents.get(depId);
        return dep?.status === "completed";
      });
      if (allDepsComplete) {
        this.emitEvent("agent:dependency_resolved", waitingId, {
          resolved_by: completedAgentId,
          agent_id: waitingId
        });
        logger8.debug("Agent dependencies resolved \u2014 ready to run", {
          agentId: waitingId,
          resolvedBy: completedAgentId
        });
      }
    }
  }
  /**
   * Register an agent with its workflow chain, creating the chain if needed.
   *
   * @param agentId    - Agent to register.
   * @param workflowId - Parent workflow.
   * @param phase      - Workflow phase the agent is in.
   * @param task       - Task description (used for chain initialisation).
   */
  addAgentToWorkflowChain(agentId, workflowId, phase, task) {
    let chain = this.workflowChains.get(workflowId);
    if (!chain) {
      chain = {
        id: `workflow_${generateId()}`,
        workflow_id: workflowId,
        task,
        phases: [],
        current_phase: 0,
        review_iterations: 0,
        max_review_iterations: this.config.max_review_iterations
      };
      this.workflowChains.set(workflowId, chain);
    }
    let phaseEntry = chain.phases.find((p) => p.name === phase);
    if (!phaseEntry) {
      phaseEntry = {
        name: phase,
        agent_ids: [],
        status: "pending"
      };
      chain.phases.push(phaseEntry);
    }
    phaseEntry.agent_ids.push(agentId);
  }
  /**
   * When an agent completes, check if all agents in its workflow phase
   * are done and mark the phase complete.
   *
   * @param completedAgentId - The agent that just completed.
   */
  updateWorkflowPhaseOnCompletion(completedAgentId) {
    const agent = this.agents.get(completedAgentId);
    if (!agent?.workflow_id || !agent.workflow_phase) return;
    const chain = this.workflowChains.get(agent.workflow_id);
    if (!chain) return;
    const phase = chain.phases.find((p) => p.name === agent.workflow_phase);
    if (!phase || phase.status === "completed") return;
    const allDone = phase.agent_ids.every((aid) => {
      const a = this.agents.get(aid);
      return a?.status === "completed" || a?.status === "failed" || a?.status === "cancelled";
    });
    if (allDone) {
      phase.status = "completed";
      phase.completed_at = timestamp();
      logger8.debug("Workflow phase auto-completed", {
        workflowId: agent.workflow_id,
        phase: agent.workflow_phase
      });
    }
  }
  /**
   * Compute the critical path through an agent dependency graph.
   * Returns agent IDs on the longest dependency chain.
   *
   * @param agentList - Agents to analyse.
   * @returns Ordered list of agent IDs on the critical path.
   */
  computeCriticalPath(agentList) {
    if (agentList.length === 0) return [];
    const agentMap = new Map(agentList.map((a) => [a.id, a]));
    const depths = /* @__PURE__ */ new Map();
    const getDepth = /* @__PURE__ */ __name((id, visited = /* @__PURE__ */ new Set()) => {
      if (depths.has(id)) return depths.get(id);
      if (visited.has(id)) return 0;
      visited.add(id);
      const agent = agentMap.get(id);
      if (!agent || agent.depends_on.length === 0) {
        depths.set(id, 0);
        return 0;
      }
      const maxDepDepth = Math.max(...agent.depends_on.map((d) => getDepth(d, new Set(visited))));
      const depth = maxDepDepth + 1;
      depths.set(id, depth);
      return depth;
    }, "getDepth");
    for (const agent of agentList) {
      getDepth(agent.id);
    }
    let maxDepth = -1;
    let endNode = "";
    for (const [id, depth] of depths) {
      if (depth > maxDepth) {
        maxDepth = depth;
        endNode = id;
      }
    }
    if (!endNode) return [];
    const path3 = [];
    let current = endNode;
    while (current) {
      path3.unshift(current);
      const agent = agentMap.get(current);
      if (!agent || agent.depends_on.length === 0) break;
      current = agent.depends_on.reduce((best, depId) => {
        const bd = depths.get(best) ?? -1;
        const dd = depths.get(depId) ?? -1;
        return dd > bd ? depId : best;
      }, agent.depends_on[0]);
    }
    return path3;
  }
};
function statusToEventType(status) {
  switch (status) {
    case "running":
      return "agent:started";
    case "completed":
      return "agent:completed";
    case "failed":
      return "agent:failed";
    case "cancelled":
      return "agent:cancelled";
    default:
      return "agent:spawned";
  }
}
__name(statusToEventType, "statusToEventType");

// src/extensions/agents/subsystem.ts
function createAgentSubsystem(config, eventBus) {
  const budgetTracker = new BudgetTracker(eventBus, config.agents);
  const agentCoordinator = new AgentCoordinator(eventBus, budgetTracker, config.agents);
  return { agentCoordinator, budgetTracker };
}
__name(createAgentSubsystem, "createAgentSubsystem");

// src/extensions/directives/directive-queue.ts
var import_node_crypto3 = require("node:crypto");
var logger9 = createLogger("directive-queue");
var HOLD_TTL_MS = 3e3;
var MAX_QUEUE_DEPTH = 100;
var DirectiveQueue = class {
  static {
    __name(this, "DirectiveQueue");
  }
  /** Per-target FIFO queues. */
  queues = /* @__PURE__ */ new Map();
  /** Held batches awaiting write confirmation. */
  held = /* @__PURE__ */ new Map();
  /**
   * Add a directive to the end of the queue for `target`.
   *
   * @param target - Hook target name (e.g. `'subagent_stop'`).
   * @param directive - The directive to enqueue.
   */
  enqueue(target, directive) {
    const queue = this.queues.get(target);
    if (queue) {
      if (queue.length >= MAX_QUEUE_DEPTH) {
        queue.shift();
        logger9.warn("DirectiveQueue at capacity: oldest directive evicted", { target, max: MAX_QUEUE_DEPTH });
      }
      queue.push(directive);
    } else {
      this.queues.set(target, [directive]);
    }
  }
  /**
   * Return and remove directives for `target`.
   *
   * @param target - Hook target name.
   * @param workflowId - Optional workflow ID. When provided, only directives
   *   matching this workflow_id are returned and removed; the rest remain in
   *   the queue. When omitted, ALL directives for the target are returned and
   *   the queue is cleared (backward-compatible behaviour).
   * @returns Array of directives in FIFO order (may be empty).
   */
  drain(target, workflowId) {
    const queue = this.queues.get(target);
    if (!queue || queue.length === 0) return [];
    if (workflowId === void 0) {
      const items = [...queue];
      this.queues.delete(target);
      return items;
    }
    const matching = [];
    const remaining = [];
    for (const d of queue) {
      if (d.workflow_id === workflowId) {
        matching.push(d);
      } else {
        remaining.push(d);
      }
    }
    if (remaining.length === 0) {
      this.queues.delete(target);
    } else {
      this.queues.set(target, remaining);
    }
    return matching;
  }
  /**
   * Drain directives into a held state instead of permanently removing them.
   * Held directives can be released (confirmed delivered) or re-enqueued (delivery failed).
   */
  holdDrain(target, workflowId) {
    const directives = this.drain(target, workflowId);
    if (directives.length === 0) {
      return { holdId: "", directives: [] };
    }
    const holdId = `hold-${(0, import_node_crypto3.randomUUID)()}`;
    this.held.set(holdId, {
      id: holdId,
      directives,
      target,
      heldAt: Date.now(),
      workflowId
    });
    logger9.debug("DirectiveQueue holdDrain", { holdId, target, count: directives.length });
    return { holdId, directives };
  }
  /**
   * Release a held batch — directives confirmed delivered. No-op for unknown holdId.
   */
  releaseHold(holdId) {
    if (!holdId) return;
    const deleted = this.held.delete(holdId);
    if (deleted) {
      logger9.debug("DirectiveQueue hold released", { holdId });
    }
  }
  /**
   * Re-enqueue a held batch back to the front of the target queue.
   * Used when IPC write fails and directives need to be retried.
   */
  reEnqueueHold(holdId) {
    const batch = this.held.get(holdId);
    if (!batch) return 0;
    this.held.delete(holdId);
    const queue = this.queues.get(batch.target) ?? [];
    const merged = [...batch.directives, ...queue];
    while (merged.length > MAX_QUEUE_DEPTH) {
      merged.pop();
      logger9.warn("DirectiveQueue re-enqueue overflow: directive evicted", { target: batch.target });
    }
    this.queues.set(batch.target, merged);
    logger9.info("DirectiveQueue hold re-enqueued", {
      holdId,
      target: batch.target,
      count: batch.directives.length
    });
    return batch.directives.length;
  }
  /**
   * Re-enqueue any held batches older than ttlMs. Returns total directives re-enqueued.
   */
  sweepStaleHolds(ttlMs = HOLD_TTL_MS) {
    const now = Date.now();
    let reEnqueued = 0;
    const staleIds = [];
    for (const [holdId, batch] of this.held) {
      if (now - batch.heldAt >= ttlMs) {
        staleIds.push(holdId);
      }
    }
    for (const holdId of staleIds) {
      reEnqueued += this.reEnqueueHold(holdId);
    }
    if (reEnqueued > 0) {
      logger9.warn("DirectiveQueue swept stale holds", { count: reEnqueued, ttlMs });
    }
    return reEnqueued;
  }
  /**
   * Return the number of directives currently in held state (diagnostic).
   */
  heldSize() {
    let total = 0;
    for (const batch of this.held.values()) {
      total += batch.directives.length;
    }
    return total;
  }
  /**
   * Remove ALL directives across ALL targets that belong to a specific workflow.
   *
   * Used when a workflow reaches a terminal state to prevent stale directives
   * from being delivered to a future run.
   *
   * @param workflowId - The workflow ID whose directives should be purged.
   * @returns Total number of directives removed.
   */
  purge(workflowId) {
    let count = 0;
    const queuesToDelete = [];
    const queuesToUpdate = [];
    for (const [target, queue] of this.queues.entries()) {
      const before = queue.length;
      const remaining = queue.filter((d) => d.workflow_id !== workflowId);
      count += before - remaining.length;
      if (remaining.length === 0) {
        queuesToDelete.push(target);
      } else if (remaining.length !== before) {
        queuesToUpdate.push([target, remaining]);
      }
    }
    for (const target of queuesToDelete) {
      this.queues.delete(target);
    }
    for (const [target, remaining] of queuesToUpdate) {
      this.queues.set(target, remaining);
    }
    const heldToRemove = [];
    for (const [holdId, batch] of this.held) {
      if (batch.workflowId === workflowId) {
        heldToRemove.push(holdId);
        count += batch.directives.length;
      }
    }
    for (const holdId of heldToRemove) {
      this.held.delete(holdId);
    }
    if (count > 0) {
      logger9.info("DirectiveQueue purged", { workflowId, count });
    }
    return count;
  }
  /**
   * Return directives for `target` without removing them.
   *
   * @param target - Hook target name.
   * @param workflowId - Optional workflow ID. When provided, only directives
   *   matching this workflow_id are included in the snapshot.
   * @returns Snapshot of the queue (may be empty).
   */
  peek(target, workflowId) {
    const queue = this.queues.get(target) ?? [];
    if (workflowId === void 0) {
      return [...queue];
    }
    return queue.filter((d) => d.workflow_id === workflowId);
  }
  /** Clear all directive queues and held batches. */
  clear() {
    this.queues.clear();
    this.held.clear();
  }
  /**
   * Return the number of pending directives, optionally scoped to a target.
   *
   * @param target - Optional hook target name. If omitted, counts across all targets.
   * @returns Total pending directive count.
   */
  size(target) {
    if (target !== void 0) {
      return this.queues.get(target)?.length ?? 0;
    }
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }
};

// src/extensions/directives/agent-workflow-map.ts
var log5 = createLogger("agent-workflow-map");
var AgentWorkflowMap = class _AgentWorkflowMap {
  static {
    __name(this, "AgentWorkflowMap");
  }
  map = /* @__PURE__ */ new Map();
  /** Pending binds queue: agentType → workflowId, stored FIFO with timestamp. */
  pendingBinds = [];
  /** Stale pending bind TTL in milliseconds. */
  static PENDING_BIND_TTL_MS = 6e4;
  /**
   * Binds an agent_id to a workflow_id.
   *
   * If the agent_id is already bound (duplicate spawn event), the existing
   * binding is preserved and a warning is logged.
   *
   * @param agentId    - The agent identifier from the spawn event.
   * @param workflowId - The workflow instance ID this agent belongs to.
   */
  bind(agentId, workflowId) {
    if (this.map.has(agentId)) {
      log5.warn("AgentWorkflowMap.bind: agent already bound, ignoring duplicate", {
        agent_id: agentId,
        existing_workflow_id: this.map.get(agentId),
        new_workflow_id: workflowId
      });
      return;
    }
    this.map.set(agentId, workflowId);
    log5.debug("AgentWorkflowMap.bind: bound agent to workflow", {
      agent_id: agentId,
      workflow_id: workflowId
    });
  }
  /**
   * Looks up the workflow_id for a given agent_id.
   *
   * @param agentId - The agent identifier to look up.
   * @returns The workflow_id, or undefined if not bound.
   */
  lookup(agentId) {
    return this.map.get(agentId);
  }
  /**
   * Removes the binding for an agent_id.
   *
   * Called after a workflow completes or escalates — the mapping is no longer
   * needed and should be removed to prevent unbounded memory growth.
   *
   * @param agentId - The agent identifier to unbind.
   */
  unbind(agentId) {
    const had = this.map.delete(agentId);
    if (had) {
      log5.debug("AgentWorkflowMap.unbind: removed binding", { agent_id: agentId });
    }
  }
  /**
   * Returns true if the agent_id has a binding.
   *
   * @param agentId - The agent identifier to check.
   */
  has(agentId) {
    return this.map.has(agentId);
  }
  /** Returns the current number of active bindings. */
  size() {
    return this.map.size;
  }
  /** Returns all current bindings as a plain object (for debugging/logging). */
  snapshot() {
    return Object.fromEntries(this.map.entries());
  }
  /**
   * Restores bindings from a snapshot. Existing bindings are preserved;
   * entries in the snapshot are added or overwrite existing entries.
   *
   * Used during startup recovery to repopulate the map from a persisted snapshot.
   *
   * @param bindings - Map of agentId → workflowId to restore.
   */
  restoreBindings(bindings) {
    let count = 0;
    for (const [agentId, workflowId] of Object.entries(bindings)) {
      if (agentId && workflowId) {
        this.map.set(agentId, workflowId);
        count++;
      }
    }
    log5.debug("Agent-workflow bindings restored", { count });
  }
  /**
   * Enqueues a pending bind so that when a reviewer/fixer agent spawns, it can
   * query the runtime to get the workflow_id it should bind to.
   *
   * Called immediately after enqueuing a spawn directive so the bind is ready
   * before SubagentStart fires for the spawned agent.
   *
   * @param agentType  - The agent type to expect (e.g. 'reviewer', 'engineer').
   * @param workflowId - The workflow this agent should bind to.
   * @param sessionId  - The session this pending bind belongs to (default: 'default').
   */
  addPendingBind(agentType, workflowId, sessionId = "default") {
    this.pendingBinds.push({ agentType, workflowId, sessionId, timestamp: Date.now() });
    log5.debug("AgentWorkflowMap.addPendingBind: enqueued pending bind", {
      agent_type: agentType,
      workflow_id: workflowId,
      session_id: sessionId,
      queue_length: this.pendingBinds.length
    });
  }
  /**
   * Resolves a pending bind for the given agent type (FIFO).
   *
   * Removes the first matching entry from the queue, prunes stale entries
   * older than 60 seconds, and returns the workflow_id or null.
   *
   * Complexity: O(n) on the pending-bind queue length per call (filter + findIndex).
   * In practice the queue is small (typically 1-4 entries per WRFC cycle) so this
   * is not a concern. If queue growth becomes an issue, consider maintaining a
   * separate Set indexed by workflowId for O(1) sibling cleanup.
   *
   * @param agentType - The agent type queried by SubagentStart.
   * @param sessionId - Optional session ID to scope the lookup. When provided, only
   *   pending binds from that session are considered. When omitted, all sessions are searched.
   * @returns The workflow_id if a pending bind exists, or null.
   */
  resolvePendingBind(agentType, sessionId) {
    const now = Date.now();
    if (this.pendingBinds.length > 0) {
      this.pendingBinds = this.pendingBinds.filter(
        (entry) => now - entry.timestamp < _AgentWorkflowMap.PENDING_BIND_TTL_MS
      );
    }
    const idx = this.pendingBinds.findIndex(
      (entry) => entry.agentType === agentType && (sessionId === void 0 || entry.sessionId === sessionId)
    );
    if (idx === -1) {
      log5.debug("AgentWorkflowMap.resolvePendingBind: no pending bind found", { agent_type: agentType });
      return null;
    }
    const [resolved] = this.pendingBinds.splice(idx, 1);
    log5.info("AgentWorkflowMap.resolvePendingBind: resolved pending bind", {
      agent_type: agentType,
      workflow_id: resolved.workflowId,
      session_id: resolved.sessionId,
      remaining_queue_length: this.pendingBinds.length
    });
    const siblingCount = this.pendingBinds.filter(
      (entry) => entry.workflowId === resolved.workflowId
    ).length;
    if (siblingCount > 0) {
      this.pendingBinds = this.pendingBinds.filter(
        (entry) => entry.workflowId !== resolved.workflowId
      );
      log5.debug("AgentWorkflowMap.resolvePendingBind: removed sibling pending bind entries", {
        workflow_id: resolved.workflowId,
        siblings_removed: siblingCount,
        remaining_queue_length: this.pendingBinds.length
      });
    }
    return resolved.workflowId;
  }
  /**
   * Removes all pending bind entries for a specific workflow.
   *
   * Called when a deterministic binding is established via [WRFC:wid] tag,
   * making the type-keyed pending bind entries redundant. This prevents
   * stale entries from being consumed by the wrong agent in concurrent chains.
   *
   * @param workflowId - The workflow ID whose pending binds should be consumed.
   * @returns The number of entries removed.
   */
  /**
   * Clears all bindings and pending binds.
   * Called on session:started to prevent stale cross-session state.
   */
  clear() {
    const mapSize = this.map.size;
    const pendingCount = this.pendingBinds.length;
    this.map.clear();
    this.pendingBinds = [];
    log5.info("AgentWorkflowMap.clear: all bindings and pending binds cleared", {
      bindings_cleared: mapSize,
      pending_cleared: pendingCount
    });
  }
  /**
   * Clears all pending binds and map entries associated with the given session.
   *
   * Called on `session:started` to prevent stale pending binds from a previous
   * session being consumed by agents in the new session.
   *
   * Map bindings (agentId → workflowId) are not session-scoped in the map itself
   * because agentIds are unique per session. However, we still clear any pending
   * binds so stale type-keyed entries don't cross sessions.
   *
   * @param sessionId - The session whose pending binds should be removed.
   * @returns The number of pending bind entries removed.
   */
  clearForSession(sessionId) {
    const before = this.pendingBinds.length;
    this.pendingBinds = this.pendingBinds.filter((entry) => entry.sessionId !== sessionId);
    const removed = before - this.pendingBinds.length;
    if (removed > 0) {
      log5.info("AgentWorkflowMap.clearForSession: cleared pending binds for session", {
        session_id: sessionId,
        pending_cleared: removed,
        remaining_queue_length: this.pendingBinds.length
      });
    }
    return removed;
  }
  consumePendingBindsForWorkflow(workflowId) {
    const before = this.pendingBinds.length;
    this.pendingBinds = this.pendingBinds.filter(
      (entry) => entry.workflowId !== workflowId
    );
    const removed = before - this.pendingBinds.length;
    if (removed > 0) {
      log5.debug("AgentWorkflowMap.consumePendingBindsForWorkflow: removed entries", {
        workflow_id: workflowId,
        entries_removed: removed,
        remaining_queue_length: this.pendingBinds.length
      });
    }
    return removed;
  }
};

// src/extensions/directives/subsystem.ts
function createDirectiveSubsystem() {
  const directiveQueue = new DirectiveQueue();
  const agentWorkflowMap = new AgentWorkflowMap();
  return { directiveQueue, agentWorkflowMap };
}
__name(createDirectiveSubsystem, "createDirectiveSubsystem");

// src/extensions/persistence/state-store.ts
var import_node_fs7 = require("node:fs");
var import_node_path7 = require("node:path");
var logger10 = createLogger("state-store");
var JsonStateStore = class {
  static {
    __name(this, "JsonStateStore");
  }
  stateDir;
  initialised = false;
  /**
   * @param config - Runtime configuration. The `persistence.state_dir` field
   *   specifies the base directory for state files (relative to projectRoot).
   * @param projectRoot - Absolute path to the project root. Used to resolve
   *   the state directory relative to the project rather than the process CWD.
   *   Defaults to `process.cwd()` when omitted.
   */
  constructor(config, projectRoot = process.cwd()) {
    this.stateDir = (0, import_node_path7.isAbsolute)(config.persistence.state_dir) ? config.persistence.state_dir : (0, import_node_path7.join)(projectRoot, config.persistence.state_dir);
  }
  /**
   * {@inheritdoc StateStore.initialize}
   *
   * Creates the state directory (and any parent directories) if it does not
   * already exist. Safe to call multiple times; subsequent calls are no-ops.
   */
  async initialize() {
    if (this.initialised) return;
    ensureDirSync(this.stateDir);
    this.initialised = true;
    logger10.debug("State store initialised", { stateDir: this.stateDir });
  }
  /**
   * Ensures the state directory exists. Called before every I/O operation as
   * a defensive guard in case {@link initialize} was not called first.
   */
  ensureDir() {
    ensureDirSync(this.stateDir);
  }
  /**
   * Resolves the canonical path for a given key.
   *
   * @param key - Storage key.
   * @returns Path to the corresponding `.json` file.
   */
  keyPath(key) {
    return (0, import_node_path7.join)(this.stateDir, `${key}.json`);
  }
  /**
   * Resolves the advisory lock path for a given state file path.
   *
   * @param statePath - Path to the `.json` state file.
   * @returns Path to the corresponding `.lock` file.
   */
  lockPath(statePath) {
    return `${statePath}.lock`;
  }
  /**
   * Acquires an advisory lockfile for the given path.
   *
   * Uses `writeFileSync` with the exclusive-create (`wx`) flag so that only
   * one process can create the file at a time. Retries up to `maxAttempts`
   * times with `backoffMs` delay between attempts.
   *
   * @param lockFilePath - Path to the lockfile to create.
   * @param maxAttempts  - Maximum number of acquisition attempts (default 3).
   * @param backoffMs    - Delay in ms between attempts (default 50).
   * @throws {Error} If the lock cannot be acquired after all retries.
   */
  async acquireLock(lockFilePath, maxAttempts = 3, backoffMs = 50) {
    const content = String(process.pid);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        (0, import_node_fs7.writeFileSync)(lockFilePath, content, { flag: "wx" });
        return;
      } catch (err) {
        const isLockHeld = err instanceof Error && "code" in err && err.code === "EEXIST";
        if (!isLockHeld) {
          throw err;
        }
        if (attempt < maxAttempts) {
          logger10.debug("Lock contention \u2014 retrying", {
            lockFilePath,
            attempt,
            backoffMs
          });
          await new Promise((resolve2) => setTimeout(resolve2, backoffMs));
        }
      }
    }
    throw new StateError(
      `StateStore: could not acquire lock at "${lockFilePath}" after ${maxAttempts} attempts`
    );
  }
  /**
   * Releases an advisory lockfile by deleting it.
   *
   * Silently ignores ENOENT (lock already gone). Any other error is swallowed
   * to ensure `finally` blocks never mask the original exception.
   *
   * @param lockFilePath - Path to the lockfile to delete.
   */
  releaseLock(lockFilePath) {
    try {
      (0, import_node_fs7.unlinkSync)(lockFilePath);
    } catch {
    }
  }
  /**
   * {@inheritdoc StateStore.set}
   *
   * Writes atomically via {@link writeJsonSync} (tmp + rename).
   *
   * @throws {Error} If the write operation fails.
   */
  async set(key, state) {
    this.ensureDir();
    const dest = this.keyPath(key);
    try {
      writeJsonSync(dest, state);
      logger10.debug("Saved state", { key });
    } catch (err) {
      const message = toErrorMessage(err);
      logger10.error("Failed to save state", { key, error: message });
      throw new StateError(`StateStore.set failed for key "${key}": ${message}`);
    }
  }
  /**
   * {@inheritdoc StateStore.get}
   *
   * Returns `null` (not an error) when the key does not exist. Throws on
   * unexpected I/O errors or JSON parse failures.
   *
   * @throws {Error} If a non-ENOENT I/O error or JSON parse failure occurs.
   */
  async get(key) {
    const path3 = this.keyPath(key);
    try {
      const content = (0, import_node_fs7.readFileSync)(path3, "utf-8");
      const result = safeJsonParse(content, null);
      if (result === null) throw new SyntaxError("Failed to parse JSON");
      return result;
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return null;
      }
      const message = toErrorMessage(err);
      logger10.error("Failed to load state", { key, error: message });
      throw new StateError(`StateStore.get failed for key "${key}": ${message}`);
    }
  }
  /**
   * {@inheritdoc StateStore.delete}
   *
   * Silently succeeds if the key does not exist (ENOENT is not an error).
   *
   * @throws {Error} If a non-ENOENT I/O error occurs.
   */
  async delete(key) {
    const path3 = this.keyPath(key);
    try {
      (0, import_node_fs7.unlinkSync)(path3);
      logger10.debug("Deleted state", { key });
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return;
      }
      const message = toErrorMessage(err);
      logger10.error("Failed to delete state", { key, error: message });
      throw new StateError(`StateStore.delete failed for key "${key}": ${message}`);
    }
  }
  /**
   * {@inheritdoc StateStore.keys}
   *
   * Lists all `.json` files in the state directory (excluding `.tmp` files)
   * and strips the `.json` extension to return the key names.
   *
   * @throws {Error} If the directory cannot be read.
   */
  async keys() {
    this.ensureDir();
    try {
      const entries = (0, import_node_fs7.readdirSync)(this.stateDir);
      return entries.filter((f) => f.endsWith(".json") && !f.endsWith(".json.tmp")).map((f) => (0, import_node_path7.basename)(f, ".json"));
    } catch (err) {
      const message = toErrorMessage(err);
      logger10.error("Failed to list state keys", { error: message });
      throw new StateError(`StateStore.keys failed: ${message}`);
    }
  }
  /**
   * {@inheritdoc StateStore.update}
   *
   * Loads the current value, passes it to `updater`, then saves the result
   * atomically. An advisory lockfile (`{statePath}.lock`) is acquired before
   * the read-modify-write cycle and released in a `finally` block, guarding
   * against concurrent updates from multiple processes sharing the same state
   * directory. The lock is acquired exclusively via `writeFileSync` with the
   * `wx` flag; if another process holds the lock, up to 3 retries are made
   * with a 50 ms backoff before an error is thrown.
   *
   * Note: the write itself is separately atomic (tmp + rename); this lock
   * protects the full read-modify-write cycle.
   */
  async update(key, updater) {
    const statePath = this.keyPath(key);
    const lockFilePath = this.lockPath(statePath);
    await this.acquireLock(lockFilePath);
    try {
      const current = await this.get(key);
      const next = updater(current);
      await this.set(key, next);
    } finally {
      this.releaseLock(lockFilePath);
    }
  }
};

// src/core/observability/timer.ts
var logger11 = createLogger("timer");
var Timer = class {
  static {
    __name(this, "Timer");
  }
  handle = null;
  intervalMs;
  callback;
  label;
  constructor(opts) {
    this.callback = opts.callback;
    this.intervalMs = opts.intervalMs;
    this.label = opts.label ?? "timer";
  }
  /** Start the timer. Idempotent — no-op if already running. */
  start() {
    if (this.handle) return;
    if (this.intervalMs <= 0) {
      logger11.warn("cannot start timer \u2014 intervalMs must be > 0", {
        label: this.label,
        intervalMs: this.intervalMs
      });
      return;
    }
    this.handle = setInterval(() => {
      try {
        this.callback();
      } catch (err) {
        logger11.warn("timer callback threw", {
          label: this.label,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }, this.intervalMs);
    this.handle.unref();
    logger11.debug("timer started", { label: this.label, intervalMs: this.intervalMs });
  }
  /** Stop the timer. Idempotent — no-op if not running. */
  stop() {
    if (!this.handle) return;
    clearInterval(this.handle);
    this.handle = null;
    logger11.debug("timer stopped", { label: this.label });
  }
  /** Returns true if the timer is currently running. */
  isRunning() {
    return this.handle !== null;
  }
  /**
   * Update the interval. If the timer was running, it is stopped and
   * restarted with the new interval atomically.
   */
  reconfigure(intervalMs) {
    const wasRunning = this.isRunning();
    if (wasRunning) this.stop();
    this.intervalMs = intervalMs;
    if (wasRunning) this.start();
    logger11.debug("timer reconfigured", {
      label: this.label,
      intervalMs,
      restarted: this.isRunning()
    });
  }
  /** Returns the current interval in milliseconds. */
  getIntervalMs() {
    return this.intervalMs;
  }
};

// src/extensions/persistence/checkpoint-manager.ts
var logger12 = createLogger("checkpoint-manager");
var CHECKPOINT_INTERVAL_MS = 3e4;
var MIN_CHECKPOINT_INTERVAL_MS = 1e3;
var CheckpointManager = class {
  static {
    __name(this, "CheckpointManager");
  }
  checkpointTimer = null;
  deps;
  constructor(deps) {
    this.deps = deps;
  }
  /**
   * Start the periodic checkpoint timer.
   * The timer is unref'd so it does not prevent natural process exit.
   */
  start() {
    const interval = Math.max(
      this.deps.config.persistence.checkpoint_interval_ms ?? CHECKPOINT_INTERVAL_MS,
      MIN_CHECKPOINT_INTERVAL_MS
    );
    this.checkpointTimer = new Timer({
      callback: /* @__PURE__ */ __name(() => {
        this.saveCheckpoint().catch((err) => {
          logger12.warn("Periodic checkpoint failed", {
            err: toErrorMessage(err)
          });
        });
        try {
          this.deps.workflowEngine?.prune();
          this.deps.agentCoordinator?.prune();
        } catch (err) {
          logger12.warn("Periodic prune failed", { err: toErrorMessage(err) });
        }
      }, "callback"),
      intervalMs: interval,
      label: "checkpoint"
    });
    this.checkpointTimer.start();
    logger12.debug("Checkpoint timer started", { interval_ms: interval });
  }
  /**
   * Stop the periodic checkpoint timer, preventing any further automatic saves.
   */
  stop() {
    if (this.checkpointTimer) {
      this.checkpointTimer.stop();
      this.checkpointTimer = null;
      logger12.debug("Checkpoint timer stopped");
    }
  }
  /**
   * Save a state checkpoint to the persistent state store.
   *
   * Writes lightweight runtime metadata (pid, uptime, timestamp) so the
   * next startup can detect abnormal termination. Also compacts the event log.
   */
  async saveCheckpoint() {
    const { stateStore, eventLog, healthChecker } = this.deps;
    if (!stateStore) return;
    const health = healthChecker.check();
    await stateStore.set("runtime.checkpoint", {
      pid: process.pid,
      uptime_ms: health.uptime_ms,
      status: health.status,
      memory_usage_mb: health.memory_usage_mb,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (eventLog) {
      try {
        await eventLog.compact();
      } catch (err) {
        logger12.warn("Event log compaction failed during checkpoint", {
          err: toErrorMessage(err)
        });
      }
    }
  }
};

// src/extensions/persistence/snapshot-manager.ts
var logger13 = createLogger("snapshot-manager");
var SNAPSHOT_KEY = "runtime_snapshot";
var SNAPSHOT_VERSION = 1;
var SnapshotManager = class {
  static {
    __name(this, "SnapshotManager");
  }
  stateStore;
  periodicTimer = null;
  constructor(stateStore) {
    this.stateStore = stateStore;
  }
  /**
   * Captures a full snapshot of the current runtime state and persists it
   * to the StateStore.
   *
   * Agent state is intentionally excluded from snapshots. Agents are
   * ephemeral — they are bound to a Claude Code session and do not
   * survive process restarts. There is no meaningful state to restore;
   * agents re-register themselves on the next startup. Workflow state
   * (which does survive restarts) is captured in the `workflows` field.
   *
   * @param deps          - The subsystems to snapshot.
   * @param eventSequence - The current event log sequence number.
   */
  async takeSnapshot(deps, eventSequence) {
    const startMs = Date.now();
    try {
      const snapshot = {
        version: SNAPSHOT_VERSION,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        lastEventSequence: eventSequence,
        workflows: captureWorkflowState(deps.workflowEngine),
        agentWorkflowBindings: captureAgentWorkflowBindings(deps.agentWorkflowMap),
        triggerState: captureTriggerState(deps.triggerRegistry)
      };
      await this.stateStore.set(SNAPSHOT_KEY, snapshot);
      logger13.info("Runtime snapshot saved", {
        version: snapshot.version,
        lastEventSequence: snapshot.lastEventSequence,
        workflows: snapshot.workflows.length,
        agentBindings: Object.keys(snapshot.agentWorkflowBindings).length,
        triggers: snapshot.triggerState.length,
        durationMs: Date.now() - startMs
      });
    } catch (err) {
      logger13.error("Failed to take runtime snapshot", { error: toErrorMessage(err) });
      throw err;
    }
  }
  /**
   * Loads the most recent snapshot from the StateStore.
   *
   * Returns null if no snapshot exists or if the snapshot fails version
   * validation (allowing fallback to full event replay).
   *
   * @returns The snapshot, or null if not available / incompatible.
   */
  async loadSnapshot() {
    try {
      const raw = await this.stateStore.get(SNAPSHOT_KEY);
      if (!raw) {
        logger13.debug("No snapshot found in state store");
        return null;
      }
      if (raw.version !== SNAPSHOT_VERSION) {
        logger13.warn("Snapshot version mismatch \u2014 discarding", {
          stored: raw.version,
          expected: SNAPSHOT_VERSION
        });
        return null;
      }
      if (typeof raw.lastEventSequence !== "number" || !Array.isArray(raw.workflows) || typeof raw.agentWorkflowBindings !== "object" || raw.agentWorkflowBindings === null || !Array.isArray(raw.triggerState)) {
        logger13.warn("Snapshot failed structural validation \u2014 discarding");
        return null;
      }
      logger13.info("Snapshot loaded", {
        timestamp: raw.timestamp,
        lastEventSequence: raw.lastEventSequence,
        workflows: raw.workflows.length,
        triggers: raw.triggerState.length
      });
      return raw;
    } catch (err) {
      logger13.warn("Failed to load snapshot \u2014 will fall back to full replay", {
        error: toErrorMessage(err)
      });
      return null;
    }
  }
  /**
   * Starts a periodic snapshot timer that takes a snapshot every `intervalMs`.
   *
   * Uses the core Timer class which auto-unrefs, so it does not prevent natural process exit.
   * Call stopPeriodicSnapshots() to cancel.
   *
   * @param deps        - Subsystem dependencies for snapshotting.
   * @param getSequence - Callback that returns the current event sequence number.
   * @param intervalMs  - Interval between snapshots in ms. Defaults to 60,000 (1 min).
   */
  startPeriodicSnapshots(deps, getSequence, intervalMs = 6e4) {
    if (this.periodicTimer) {
      logger13.warn("Periodic snapshots already running \u2014 call stopPeriodicSnapshots() first");
      return;
    }
    const safeInterval = Math.max(intervalMs, 5e3);
    this.periodicTimer = new Timer({
      callback: /* @__PURE__ */ __name(() => {
        const seq = getSequence();
        this.takeSnapshot(deps, seq).catch((err) => {
          logger13.warn("Periodic snapshot failed", { error: toErrorMessage(err) });
        });
      }, "callback"),
      intervalMs: safeInterval,
      label: "snapshot"
    });
    this.periodicTimer.start();
    logger13.debug("Periodic snapshots started", { intervalMs: safeInterval });
  }
  /**
   * Stops the periodic snapshot timer.
   */
  stopPeriodicSnapshots() {
    if (this.periodicTimer) {
      this.periodicTimer.stop();
      this.periodicTimer = null;
      logger13.debug("Periodic snapshots stopped");
    }
  }
  /**
   * Restores runtime subsystem state from a snapshot.
   *
   * This populates WorkflowEngine, AgentWorkflowMap, TriggerRegistry, and
   * AgentCoordinator from the snapshot data without replaying any events.
   *
   * @param snapshot - The snapshot to restore from.
   * @param deps     - The subsystems to populate.
   */
  restoreFromSnapshot(snapshot, deps) {
    logger13.info("Restoring from snapshot", {
      timestamp: snapshot.timestamp,
      lastEventSequence: snapshot.lastEventSequence
    });
    if (deps.workflowEngine && snapshot.workflows.length > 0) {
      let restoredCount = 0;
      for (const instance of snapshot.workflows) {
        try {
          deps.workflowEngine.restoreInstance(instance);
          restoredCount++;
        } catch (err) {
          logger13.warn("Failed to restore workflow instance from snapshot", {
            id: instance.id,
            error: toErrorMessage(err)
          });
        }
      }
      logger13.debug("Workflow instances restored from snapshot", { count: restoredCount });
    }
    if (deps.agentWorkflowMap) {
      const bindingEntries = Object.entries(snapshot.agentWorkflowBindings);
      if (bindingEntries.length > 0) {
        deps.agentWorkflowMap.restoreBindings(snapshot.agentWorkflowBindings);
        logger13.debug("Agent-workflow bindings restored from snapshot", { count: bindingEntries.length });
      }
    }
    if (deps.triggerRegistry && snapshot.triggerState.length > 0) {
      try {
        deps.triggerRegistry.restoreTriggerState(snapshot.triggerState);
        logger13.debug("Trigger states restored from snapshot", { count: snapshot.triggerState.length });
      } catch (err) {
        logger13.warn("Failed to restore trigger states from snapshot", { error: toErrorMessage(err) });
      }
    }
    logger13.info("Snapshot restoration complete");
  }
};
function captureWorkflowState(engine) {
  if (!engine) return [];
  try {
    return engine.getAllInstances();
  } catch (err) {
    logger13.warn("Failed to capture workflow state", { error: toErrorMessage(err) });
    return [];
  }
}
__name(captureWorkflowState, "captureWorkflowState");
function captureAgentWorkflowBindings(map) {
  if (!map) return {};
  try {
    return map.snapshot();
  } catch (err) {
    logger13.warn("Failed to capture agent-workflow bindings", { error: toErrorMessage(err) });
    return {};
  }
}
__name(captureAgentWorkflowBindings, "captureAgentWorkflowBindings");
function captureTriggerState(registry) {
  if (!registry) return [];
  try {
    return registry.getTriggerStates();
  } catch (err) {
    logger13.warn("Failed to capture trigger state", { error: toErrorMessage(err) });
    return [];
  }
}
__name(captureTriggerState, "captureTriggerState");

// src/extensions/persistence/replay-engine.ts
var logger14 = createLogger("replay-engine");
async function replayEvents(eventLog, deps, options = {}) {
  const startMs = Date.now();
  const { skipActions = true, afterSequence, eventTypes, maxReplayErrors = 10 } = options;
  let eventsReplayed = 0;
  let workflowsRestored = 0;
  let agentBindingsRestored = 0;
  let triggerCountsRestored = 0;
  let lastSequence = afterSequence ?? 0;
  let skippedEvents = 0;
  const replayErrors = [];
  const restoredWorkflows = /* @__PURE__ */ new Map();
  const restoredAgentBindings = /* @__PURE__ */ new Set();
  const triggerStateMap = /* @__PURE__ */ new Map();
  logger14.info("Starting event replay", {
    afterSequence: afterSequence ?? 0,
    skipActions,
    maxReplayErrors
  });
  let events;
  try {
    if (afterSequence !== void 0) {
      events = await eventLog.since(afterSequence);
    } else {
      events = await eventLog.query({});
    }
  } catch (err) {
    logger14.error("Failed to read events from event log", { error: toErrorMessage(err) });
    return {
      eventsReplayed: 0,
      workflowsRestored: 0,
      agentBindingsRestored: 0,
      triggerCountsRestored: 0,
      replayDurationMs: Date.now() - startMs,
      lastSequence: afterSequence ?? 0,
      skippedEvents: 0,
      aborted: false,
      errors: []
    };
  }
  events.sort((a, b) => {
    const seqA = a.metadata?.sequence ?? 0;
    const seqB = b.metadata?.sequence ?? 0;
    return seqA - seqB;
  });
  const warnThreshold = Math.floor(maxReplayErrors * 0.8);
  let aborted = false;
  for (const event of events) {
    const seq = event.metadata?.sequence;
    if (typeof seq === "number" && seq > lastSequence) {
      lastSequence = seq;
    }
    if (eventTypes && eventTypes.length > 0) {
      const typeMatches = eventTypes.some((prefix) => event.type.startsWith(prefix));
      if (!typeMatches) continue;
    }
    try {
      const processed = processEvent(event, deps, restoredWorkflows, restoredAgentBindings, triggerStateMap, skipActions);
      if (processed) {
        eventsReplayed++;
      }
    } catch (err) {
      const errMsg = toErrorMessage(err);
      logger14.warn("Skipping event during replay due to error", {
        event_id: event.id,
        event_type: event.type,
        sequence: seq,
        error: errMsg
      });
      skippedEvents++;
      replayErrors.push(errMsg);
      if (replayErrors.length === warnThreshold) {
        logger14.warn("Replay error count approaching threshold \u2014 replay may be aborted", {
          errorCount: replayErrors.length,
          maxReplayErrors
        });
      }
      if (replayErrors.length >= maxReplayErrors) {
        logger14.warn("Replay aborted: error threshold exceeded", {
          errorCount: replayErrors.length,
          maxReplayErrors
        });
        aborted = true;
        break;
      }
    }
  }
  if (deps.workflowEngine && restoredWorkflows.size > 0) {
    for (const instance of restoredWorkflows.values()) {
      try {
        deps.workflowEngine.restoreInstance(instance);
        workflowsRestored++;
      } catch (err) {
        logger14.warn("Failed to restore workflow instance", {
          id: instance.id,
          error: toErrorMessage(err)
        });
        skippedEvents++;
      }
    }
  }
  if (deps.agentWorkflowMap && restoredAgentBindings.size > 0) {
    for (const binding of restoredAgentBindings) {
      const [agentId, workflowId] = binding.split("::", 2);
      if (agentId && workflowId) {
        try {
          deps.agentWorkflowMap.bind(agentId, workflowId);
          agentBindingsRestored++;
        } catch (err) {
          logger14.warn("Failed to restore agent binding", { agentId, workflowId, error: toErrorMessage(err) });
        }
      }
    }
  }
  if (deps.triggerRegistry && triggerStateMap.size > 0) {
    const triggerStates = Array.from(triggerStateMap.entries()).map(([triggerId, state]) => ({
      triggerId,
      firesCount: state.firesCount,
      lastFired: state.lastFired
    }));
    try {
      deps.triggerRegistry.restoreTriggerState(triggerStates);
      triggerCountsRestored = triggerStates.length;
    } catch (err) {
      logger14.warn("Failed to restore trigger states", { error: toErrorMessage(err) });
    }
  }
  const replayDurationMs = Date.now() - startMs;
  logger14.info("Event replay complete", {
    eventsReplayed,
    workflowsRestored,
    agentBindingsRestored,
    triggerCountsRestored,
    skippedEvents,
    replayDurationMs,
    lastSequence,
    aborted
  });
  return {
    eventsReplayed,
    workflowsRestored,
    agentBindingsRestored,
    triggerCountsRestored,
    replayDurationMs,
    lastSequence,
    skippedEvents,
    aborted,
    errors: aborted ? replayErrors : []
  };
}
__name(replayEvents, "replayEvents");
function processEvent(event, _deps, restoredWorkflows, restoredAgentBindings, triggerStateMap, _skipActions) {
  const { type } = event;
  if (type === "workflow:created") {
    const payload = event.payload;
    const data = payload?.data ?? {};
    const instanceId = data.workflow_id;
    const definitionId = data.workflow_type;
    const initialState = data.current_state;
    const context = data.context ?? {};
    const createdAt = event.timestamp;
    if (instanceId && definitionId && initialState) {
      const existing = restoredWorkflows.get(instanceId);
      if (!existing) {
        restoredWorkflows.set(instanceId, {
          id: instanceId,
          definition_id: definitionId,
          current_state: initialState,
          context,
          history: [],
          created_at: createdAt,
          updated_at: createdAt,
          status: "active"
        });
      }
      return true;
    }
    return false;
  }
  if (type === "workflow:state_changed") {
    const payload = event.payload;
    const data = payload?.data ?? {};
    const instanceId = data.workflow_id;
    const newState = data.current_state;
    const contextChanges = data.context ?? {};
    if (instanceId && newState) {
      const instance = restoredWorkflows.get(instanceId);
      if (instance) {
        const transition = {
          from_state: instance.current_state,
          to_state: newState,
          event: event.type,
          timestamp: event.timestamp,
          context_changes: contextChanges
        };
        instance.history.push(transition);
        instance.current_state = newState;
        instance.updated_at = event.timestamp;
        Object.assign(instance.context, contextChanges);
      }
      return true;
    }
    return false;
  }
  if (type === "workflow:completed") {
    const payload = event.payload;
    const data = payload?.data ?? {};
    const instanceId = data.workflow_id;
    if (instanceId) {
      const instance = restoredWorkflows.get(instanceId);
      if (instance) {
        instance.status = "completed";
        instance.completed_at = event.timestamp;
        instance.updated_at = event.timestamp;
      }
      return true;
    }
    return false;
  }
  if (type === "workflow:failed") {
    const payload = event.payload;
    const data = payload?.data ?? {};
    const instanceId = data.workflow_id;
    const errorMsg = data.error;
    if (instanceId) {
      const instance = restoredWorkflows.get(instanceId);
      if (instance) {
        instance.status = "failed";
        instance.error = errorMsg;
        instance.updated_at = event.timestamp;
      }
      return true;
    }
    return false;
  }
  if (type === "workflow:cancelled") {
    const payload = event.payload;
    const data = payload?.data ?? {};
    const instanceId = data.workflow_id;
    if (instanceId) {
      const instance = restoredWorkflows.get(instanceId);
      if (instance) {
        instance.status = "cancelled";
        instance.updated_at = event.timestamp;
      }
      return true;
    }
    return false;
  }
  if (type === "agent:spawned") {
    const payload = event.payload;
    const data = payload?.data ?? {};
    const agentId = event.source.kind === "agent" ? event.source.agent_id : data.agent_id;
    const workflowId = data.workflow_id;
    if (agentId && workflowId) {
      restoredAgentBindings.add(`${agentId}::${workflowId}`);
      return true;
    }
    return false;
  }
  if (type === "trigger:fired") {
    const payload = event.payload;
    const data = payload?.data ?? {};
    const triggerId = data.trigger_id ?? (event.source.kind === "trigger" ? event.source.trigger_id : void 0);
    if (triggerId) {
      const existing = triggerStateMap.get(triggerId);
      const lastFiredTs = event.timestamp ? new Date(event.timestamp).getTime() : void 0;
      if (existing) {
        existing.firesCount++;
        if (lastFiredTs !== void 0) existing.lastFired = lastFiredTs;
      } else {
        triggerStateMap.set(triggerId, {
          firesCount: 1,
          lastFired: lastFiredTs
        });
      }
      return true;
    }
    return false;
  }
  return false;
}
__name(processEvent, "processEvent");

// src/extensions/persistence/startup-recovery.ts
var logger15 = createLogger("startup-recovery");
async function recoverState(eventLog, snapshotManager, deps) {
  const startMs = Date.now();
  logger15.info("Starting startup recovery");
  const latestSequence = eventLog.getLatestSequence();
  if (latestSequence === 0) {
    const stats = eventLog.getStats();
    if (stats.file_size_bytes > 0) {
      const warnMsg = "EventLog reports sequence=0 but log file is non-empty \u2014 EventLog may not be initialized. Attempting full replay to avoid skipping recovery.";
      logger15.warn(warnMsg, { file_size_bytes: stats.file_size_bytes });
      const replayResultWithWarning = await _doFullReplay(eventLog, deps, startMs);
      return { ...replayResultWithWarning, warnings: [warnMsg] };
    } else {
      const result = {
        method: "cold_start",
        recoveryDurationMs: Date.now() - startMs
      };
      logger15.info("Cold start \u2014 no events to replay", { recoveryDurationMs: result.recoveryDurationMs });
      return result;
    }
  }
  let snapshot = null;
  try {
    snapshot = await snapshotManager.loadSnapshot();
  } catch (err) {
    logger15.warn("Snapshot load failed \u2014 will attempt full replay", { error: toErrorMessage(err) });
  }
  if (snapshot) {
    logger15.info("Recovering from snapshot + delta replay", {
      snapshotTimestamp: snapshot.timestamp,
      snapshotSequence: snapshot.lastEventSequence,
      currentSequence: latestSequence
    });
    snapshotManager.restoreFromSnapshot(snapshot, deps);
    const snapshotInfo = {
      timestamp: snapshot.timestamp,
      lastEventSequence: snapshot.lastEventSequence,
      workflowsRestored: snapshot.workflows.length,
      agentBindingsRestored: Object.keys(snapshot.agentWorkflowBindings).length,
      triggerStatesRestored: snapshot.triggerState.length
    };
    let replayInfo;
    if (snapshot.lastEventSequence < latestSequence) {
      try {
        const replayResult = await replayEvents(eventLog, deps, {
          skipActions: true,
          afterSequence: snapshot.lastEventSequence
        });
        replayInfo = {
          eventsReplayed: replayResult.eventsReplayed,
          workflowsRestored: replayResult.workflowsRestored,
          agentBindingsRestored: replayResult.agentBindingsRestored,
          triggerCountsRestored: replayResult.triggerCountsRestored,
          lastSequence: replayResult.lastSequence,
          skippedEvents: replayResult.skippedEvents
        };
      } catch (err) {
        logger15.warn("Delta replay failed after snapshot restore", { error: toErrorMessage(err) });
      }
    } else {
      logger15.debug("Snapshot is up-to-date \u2014 no delta events to replay");
    }
    const result = {
      method: "snapshot_plus_replay",
      snapshot: snapshotInfo,
      replay: replayInfo,
      recoveryDurationMs: Date.now() - startMs
    };
    logger15.info("Recovery complete (snapshot + replay)", {
      method: result.method,
      snapshotWorkflows: snapshotInfo.workflowsRestored,
      deltaEventsReplayed: replayInfo?.eventsReplayed ?? 0,
      recoveryDurationMs: result.recoveryDurationMs
    });
    return result;
  }
  logger15.info("No snapshot available \u2014 performing full event replay", {
    totalEvents: latestSequence
  });
  return _doFullReplay(eventLog, deps, startMs);
}
__name(recoverState, "recoverState");
async function _doFullReplay(eventLog, deps, startMs) {
  let replayInfo;
  try {
    const replayResult = await replayEvents(eventLog, deps, { skipActions: true });
    replayInfo = {
      eventsReplayed: replayResult.eventsReplayed,
      workflowsRestored: replayResult.workflowsRestored,
      agentBindingsRestored: replayResult.agentBindingsRestored,
      triggerCountsRestored: replayResult.triggerCountsRestored,
      lastSequence: replayResult.lastSequence,
      skippedEvents: replayResult.skippedEvents
    };
  } catch (err) {
    logger15.error("Full event replay failed", { error: toErrorMessage(err) });
  }
  const result = {
    method: "full_replay",
    replay: replayInfo,
    recoveryDurationMs: Date.now() - startMs
  };
  logger15.info("Recovery complete (full replay)", {
    method: result.method,
    eventsReplayed: replayInfo?.eventsReplayed ?? 0,
    workflowsRestored: replayInfo?.workflowsRestored ?? 0,
    recoveryDurationMs: result.recoveryDurationMs
  });
  return result;
}
__name(_doFullReplay, "_doFullReplay");

// src/extensions/persistence/subsystem.ts
var logger16 = createLogger("persistence-subsystem");
async function createPersistenceSubsystem(deps) {
  const { config, projectRoot, eventLog, healthChecker, workflowEngine, agentCoordinator, getSnapshotDeps } = deps;
  const stateStore = new JsonStateStore(config, projectRoot);
  await stateStore.initialize();
  logger16.debug("State store initialised");
  const checkpointManager = new CheckpointManager({
    stateStore,
    eventLog,
    healthChecker,
    workflowEngine,
    agentCoordinator,
    config
  });
  checkpointManager.start();
  logger16.debug("Checkpoint timer started");
  const snapshotManager = new SnapshotManager(stateStore);
  try {
    const recoveryResult = await recoverState(
      eventLog,
      snapshotManager,
      getSnapshotDeps()
    );
    logger16.info("Startup recovery complete", {
      method: recoveryResult.method,
      durationMs: recoveryResult.recoveryDurationMs
    });
  } catch (err) {
    logger16.warn("Startup recovery failed \u2014 continuing with cold start", {
      err: toErrorMessage(err)
    });
  }
  snapshotManager.startPeriodicSnapshots(
    getSnapshotDeps(),
    () => eventLog.getLatestSequence(),
    6e4
  );
  async function shutdown() {
    checkpointManager.stop();
    snapshotManager.stopPeriodicSnapshots();
    try {
      await snapshotManager.takeSnapshot(
        getSnapshotDeps(),
        eventLog.getLatestSequence()
      );
      logger16.debug("Final snapshot saved");
    } catch (err) {
      logger16.warn("Final snapshot failed", { err: toErrorMessage(err) });
    }
    try {
      await checkpointManager.saveCheckpoint();
      logger16.debug("Final checkpoint saved");
    } catch (err) {
      logger16.warn("Final checkpoint failed", { err: toErrorMessage(err) });
    }
  }
  __name(shutdown, "shutdown");
  return { stateStore, checkpointManager, snapshotManager, shutdown };
}
__name(createPersistenceSubsystem, "createPersistenceSubsystem");

// src/extensions/directives/wrfc-config-store.ts
var logger17 = createLogger("wrfc-config-store");
function validateWRFCConfig(raw) {
  const validated = {};
  if (typeof raw.min_review_score === "number" && raw.min_review_score >= 0 && raw.min_review_score <= 10) {
    validated.min_review_score = raw.min_review_score;
  } else if (raw.min_review_score !== void 0) {
    logger17.warn("Invalid min_review_score rejected", { value: raw.min_review_score, expected: "number 0-10" });
  }
  if (typeof raw.max_fix_attempts === "number" && Number.isInteger(raw.max_fix_attempts) && raw.max_fix_attempts > 0) {
    validated.max_fix_attempts = raw.max_fix_attempts;
  } else if (raw.max_fix_attempts !== void 0) {
    logger17.warn("Invalid max_fix_attempts rejected", { value: raw.max_fix_attempts, expected: "positive integer" });
  }
  if (typeof raw.auto_commit === "boolean") {
    validated.auto_commit = raw.auto_commit;
  } else if (raw.auto_commit !== void 0) {
    logger17.warn("Invalid auto_commit rejected", { value: raw.auto_commit, expected: "boolean" });
  }
  if (Array.isArray(raw.require_review_types) && raw.require_review_types.every((t) => typeof t === "string" && t.length > 0)) {
    validated.require_review_types = raw.require_review_types;
  } else if (raw.require_review_types !== void 0) {
    logger17.warn("Invalid require_review_types rejected", { value: raw.require_review_types, expected: "string[]" });
  }
  return validated;
}
__name(validateWRFCConfig, "validateWRFCConfig");
var WRFCConfigStore = class {
  static {
    __name(this, "WRFCConfigStore");
  }
  config = {};
  /** Store validated WRFC config from config:loaded hook event. */
  set(config) {
    this.config = config;
    logger17.debug("WRFC config stored", { keys: Object.keys(config) });
  }
  /** Get the current WRFC config. */
  get() {
    return this.config;
  }
};

// src/extensions/directives/gv-tag-parser.ts
var GV_TAG_REGEX = /<gv>([^<]*)<\/gv>/;
var KNOWN_FIELDS = /* @__PURE__ */ new Set(["score", "files", "count", "minimum_score", "agent-type"]);
function parseRawJson(raw) {
  const parsed = safeJsonParse(raw, null);
  try {
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { found: true, data: null, raw };
    }
    const data = {};
    if (typeof parsed.score === "number") {
      data.score = Math.max(0, Math.min(10, parsed.score));
    }
    if (Array.isArray(parsed.files)) {
      data.files = parsed.files.filter((f) => typeof f === "string");
    }
    if (typeof parsed.count === "number") data.count = parsed.count;
    if (typeof parsed.minimum_score === "number") {
      data.minimum_score = Math.max(0, Math.min(10, parsed.minimum_score));
    } else if (parsed.minimum_score === null) {
      data.minimum_score = null;
    }
    if (typeof parsed["agent-type"] === "object" && parsed["agent-type"] !== null && !Array.isArray(parsed["agent-type"])) {
      data["agent-type"] = parsed["agent-type"];
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (!KNOWN_FIELDS.has(key)) {
        data[key] = value;
      }
    }
    return { found: true, data, raw };
  } catch {
    return { found: true, data: null, raw };
  }
}
__name(parseRawJson, "parseRawJson");
function parseGvTag(text) {
  if (!text) return { found: false, data: null };
  const match = text.match(GV_TAG_REGEX);
  if (!match) return { found: false, data: null };
  const raw = match[1].trim();
  return parseRawJson(raw);
}
__name(parseGvTag, "parseGvTag");
function extractFiles(text) {
  const result = parseGvTag(text);
  if (result.found && result.data?.files) {
    return result.data.files;
  }
  return [];
}
__name(extractFiles, "extractFiles");

// src/extensions/workflow/watchdog.ts
var import_node_fs8 = require("node:fs");
var import_node_path8 = require("node:path");

// src/extensions/workflow/wrfc-fields.ts
function getWRFCFields(ctx) {
  return {
    review_score: ctx["review_score"],
    review_issues: ctx["review_issues"],
    min_review_score: ctx["min_review_score"],
    fix_attempts: ctx["fix_attempts"],
    max_fix_attempts: ctx["max_fix_attempts"],
    files_modified: ctx["files_modified"]
  };
}
__name(getWRFCFields, "getWRFCFields");

// src/extensions/workflow/watchdog.ts
var logger18 = createLogger("watchdog");
var WATCHDOG_STALE_MS = 12e4;
var WATCHDOG_COOLDOWN_MS = 12e4;
var MAX_TRACKED_WORKFLOWS = 500;
var RECOVERY_EVICTION_AGE_MS = 6e5;
function isDirectiveForWorkflow(d, workflowId) {
  return typeof d.content === "string" && d.content.includes(workflowId);
}
__name(isDirectiveForWorkflow, "isDirectiveForWorkflow");
var WatchdogCoordinator = class {
  static {
    __name(this, "WatchdogCoordinator");
  }
  /** Consecutive drain-stuck detection counts per workflow. */
  drainStuckCounts = /* @__PURE__ */ new Map();
  /** Tracks last watchdog recovery timestamp per workflow to prevent duplicate re-enqueues. */
  watchdogRecovery = /* @__PURE__ */ new Map();
  deps;
  constructor(deps) {
    this.deps = deps;
  }
  /**
   * Evict old entries from internal tracking Maps to prevent unbounded growth.
   * Called automatically at the start of checkStaleWorkflows.
   */
  evictStaleEntries() {
    const now = Date.now();
    for (const [wid, ts] of this.watchdogRecovery) {
      if (now - ts > RECOVERY_EVICTION_AGE_MS) {
        this.watchdogRecovery.delete(wid);
      }
    }
    if (this.drainStuckCounts.size > MAX_TRACKED_WORKFLOWS) {
      const entries = Array.from(this.drainStuckCounts.entries()).sort((a, b) => a[1] - b[1]);
      const toRemove = entries.length - MAX_TRACKED_WORKFLOWS;
      for (let i = 0; i < toRemove; i++) {
        this.drainStuckCounts.delete(entries[i][0]);
      }
    }
    if (this.watchdogRecovery.size > MAX_TRACKED_WORKFLOWS) {
      const entries = Array.from(this.watchdogRecovery.entries()).sort((a, b) => a[1] - b[1]);
      const toRemove = entries.length - MAX_TRACKED_WORKFLOWS;
      for (let i = 0; i < toRemove; i++) {
        this.watchdogRecovery.delete(entries[i][0]);
      }
    }
  }
  /**
   * Detect active workflows stuck in transitional states (REVIEWING, FIXING)
   * and re-enqueue lost directives.
   *
   * Only intervenes after WATCHDOG_STALE_MS (2 minutes) with a
   * WATCHDOG_COOLDOWN_MS (2 minute) cooldown between recovery attempts
   * for the same workflow.
   */
  checkStaleWorkflows() {
    const { workflowEngine, directiveQueue } = this.deps;
    if (!workflowEngine || !directiveQueue) return;
    this.evictStaleEntries();
    directiveQueue.sweepStaleHolds();
    const now = Date.now();
    const activeWorkflows = workflowEngine.listActive();
    for (const wid of this.watchdogRecovery.keys()) {
      if (!activeWorkflows.some((w) => w.id === wid)) {
        this.watchdogRecovery.delete(wid);
      }
    }
    for (const wid of this.drainStuckCounts.keys()) {
      if (!activeWorkflows.some((w) => w.id === wid)) {
        this.drainStuckCounts.delete(wid);
      }
    }
    const pendingDirectives = directiveQueue.peek("subagent_stop");
    for (const workflow of activeWorkflows) {
      const rawState = workflow.current_state.toUpperCase();
      if (rawState !== "REVIEWING" && rawState !== "FIXING") continue;
      const state = rawState;
      const stateAge = now - new Date(workflow.updated_at).getTime();
      if (stateAge < WATCHDOG_STALE_MS) continue;
      const lastRecovery = this.watchdogRecovery.get(workflow.id);
      if (lastRecovery && now - lastRecovery < WATCHDOG_COOLDOWN_MS) continue;
      const hasPendingForWorkflow = pendingDirectives.some(
        (d) => isDirectiveForWorkflow(d, workflow.id)
      );
      if (hasPendingForWorkflow) {
        const stuckCount = (this.drainStuckCounts.get(workflow.id) ?? 0) + 1;
        this.drainStuckCounts.set(workflow.id, stuckCount);
        if (stuckCount >= 3) {
          logger18.warn("Watchdog: drain-stuck escalation \u2014 writing urgent directive file", {
            workflow_id: workflow.id,
            current_state: state,
            state_age_ms: stateAge,
            stuck_ticks: stuckCount
          });
          this.writeUrgentDirectives(workflow.id);
          this.drainStuckCounts.delete(workflow.id);
        } else {
          logger18.warn("Watchdog: stale workflow with pending directive \u2014 drain may be stuck", {
            workflow_id: workflow.id,
            current_state: state,
            state_age_ms: stateAge,
            pending_directives: pendingDirectives.length,
            stuck_ticks: stuckCount
          });
        }
        continue;
      }
      logger18.warn("Watchdog: recovering stale workflow \u2014 re-enqueueing directive", {
        workflow_id: workflow.id,
        current_state: state,
        state_age_ms: stateAge
      });
      this.recoverStaleWorkflow(workflow, state);
      this.watchdogRecovery.set(workflow.id, now);
    }
  }
  /**
   * Re-enqueue the appropriate directive for a stale workflow.
   *
   * - REVIEWING: spawn a reviewer
   * - FIXING: spawn an engineer (or escalate if fix budget exhausted)
   */
  recoverStaleWorkflow(workflow, state) {
    const { directiveQueue, agentWorkflowMap } = this.deps;
    if (!directiveQueue) return;
    const wrfc = getWRFCFields(workflow.context);
    const filesModified = Array.isArray(wrfc.files_modified) ? wrfc.files_modified : [];
    if (state === "REVIEWING") {
      const task = `Review the work completed in workflow ${workflow.id}. Current state: ${workflow.current_state}. ` + (filesModified.length > 0 ? `Files modified: ${filesModified.join(", ")}.` : "Check all recently modified files.");
      const message = buildSpawnDirectiveMessage("reviewer", task, {
        files_modified: filesModified,
        workflow_id: workflow.id
      });
      directiveQueue.enqueue("subagent_stop", {
        type: "inject_system_message",
        content: message,
        priority: 25,
        source: "watchdog",
        workflow_id: workflow.id
      });
      if (agentWorkflowMap) {
        agentWorkflowMap.addPendingBind("reviewer", workflow.id);
        agentWorkflowMap.addPendingBind("goodvibes:reviewer", workflow.id);
      }
      logger18.info("Watchdog: reviewer spawn directive re-enqueued", {
        workflow_id: workflow.id
      });
    } else if (state === "FIXING") {
      const fixAttempts = typeof wrfc.fix_attempts === "number" ? wrfc.fix_attempts : 0;
      const maxFixAttempts = typeof wrfc.max_fix_attempts === "number" ? wrfc.max_fix_attempts : 3;
      const lastScore = typeof wrfc.review_score === "number" ? wrfc.review_score : 0;
      if (fixAttempts >= maxFixAttempts) {
        const escalationMessage = buildEscalationMessage(workflow.id, fixAttempts, lastScore);
        directiveQueue.enqueue("subagent_stop", {
          type: "inject_system_message",
          content: escalationMessage,
          priority: 30,
          source: "watchdog",
          workflow_id: workflow.id
        });
        logger18.warn("Watchdog: escalation directive re-enqueued (fix budget exhausted)", {
          workflow_id: workflow.id,
          fix_attempts: fixAttempts,
          max_fix_attempts: maxFixAttempts
        });
      } else {
        const reviewIssues = Array.isArray(wrfc.review_issues) ? wrfc.review_issues : [];
        const issuesSummary = reviewIssues.length > 0 ? reviewIssues.map((i) => `[${i.severity}] ${i.dimension}: ${i.description}`).join("; ") : "See previous review output for details.";
        const fixTask = `Fix the issues identified in the code review for workflow ${workflow.id}. Review score: ${lastScore}/10. Issues: ${issuesSummary}` + (filesModified.length > 0 ? ` Files: ${filesModified.join(", ")}.` : "");
        const fixMessage = buildSpawnDirectiveMessage("engineer", fixTask, {
          files_modified: filesModified,
          review_score: lastScore,
          review_issues: reviewIssues,
          fix_attempts: fixAttempts,
          max_fix_attempts: maxFixAttempts,
          workflow_id: workflow.id
        });
        directiveQueue.enqueue("subagent_stop", {
          type: "inject_system_message",
          content: fixMessage,
          priority: 25,
          source: "watchdog",
          workflow_id: workflow.id
        });
        if (agentWorkflowMap) {
          agentWorkflowMap.addPendingBind("engineer", workflow.id);
          agentWorkflowMap.addPendingBind("goodvibes:engineer", workflow.id);
        }
        logger18.info("Watchdog: engineer fix directive re-enqueued", {
          workflow_id: workflow.id,
          fix_attempts: fixAttempts,
          max_fix_attempts: maxFixAttempts
        });
      }
    }
  }
  /**
   * Write pending directives to a file-based fallback channel.
   *
   * When the IPC-based directive queue has directives that aren't being drained
   * (orchestrator idle — no hooks firing), this method writes them to a JSON file
   * that hook scripts check as an alternative delivery channel.
   *
   * @param workflowId - The workflow whose directives are stuck.
   */
  writeUrgentDirectives(workflowId) {
    const { directiveQueue, stateDir } = this.deps;
    if (!directiveQueue) return;
    const matching = directiveQueue.drain("subagent_stop", workflowId);
    if (matching.length === 0) {
      return;
    }
    const urgentPath = (0, import_node_path8.join)(stateDir, "urgent-directives.json");
    let writeSucceeded = false;
    try {
      ensureDirSync(stateDir);
      let existingDirectives = [];
      try {
        const existing = (0, import_node_fs8.readFileSync)(urgentPath, "utf-8");
        const parsed = safeJsonParse(existing, {});
        if (Array.isArray(parsed.directives)) {
          existingDirectives = parsed.directives;
        }
      } catch (readErr) {
        logger18.debug("Watchdog: no existing urgent-directives file (expected on first write)", {
          workflow_id: workflowId,
          error: readErr instanceof Error ? readErr.message : String(readErr)
        });
      }
      const merged = [...existingDirectives, ...matching];
      writeJsonSync(urgentPath, {
        written_at: (/* @__PURE__ */ new Date()).toISOString(),
        directives: merged
      });
      logger18.info("Watchdog: urgent directives written to file", {
        workflow_id: workflowId,
        directive_count: matching.length,
        total_in_file: merged.length,
        path: urgentPath
      });
      writeSucceeded = true;
    } catch (err) {
      logger18.error("Watchdog: failed to write urgent directives file", {
        workflow_id: workflowId,
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      if (!writeSucceeded) {
        for (const d of matching) {
          directiveQueue.enqueue("subagent_stop", d);
        }
      }
    }
  }
};

// src/core/types.ts
function createTrigger(overrides) {
  return {
    enabled: true,
    priority: 0,
    ...overrides
  };
}
__name(createTrigger, "createTrigger");

// src/core/queues/event-queue.ts
var logger19 = createLogger("core:event-queue");
var DEFAULT_MAX_DEPTH = 1e3;
var DEFAULT_DEDUP_TTL_MS = 6e4;
var EventQueue = class _EventQueue {
  static {
    __name(this, "EventQueue");
  }
  maxDepth;
  dedupTtlMs;
  /** Binary min-heap of queue entries. */
  heap = [];
  /** Logical size (excludes lazily-cancelled entries). */
  _size = 0;
  /** Map from event_id → seen_at timestamp for deduplication. */
  dedupCache = /* @__PURE__ */ new Map();
  /** Monotonically increasing insertion counter for stable FIFO. */
  seq = 0;
  /** Timestamp of the last dedup-cache cleanup. */
  lastDedupClean = Date.now();
  /** How often to sweep the dedup cache (ms). */
  static DEDUP_CLEAN_INTERVAL_MS = 3e4;
  constructor(options = {}) {
    this.maxDepth = options.max_depth ?? DEFAULT_MAX_DEPTH;
    this.dedupTtlMs = options.dedup_ttl_ms ?? DEFAULT_DEDUP_TTL_MS;
  }
  /**
   * Enqueue an event.
   * Performs dedup check and backpressure check before inserting.
   * @throws {Error} if max_depth is exceeded.
   */
  enqueue(event) {
    if (this.deduplicate(event)) {
      logger19.debug("Dropped duplicate event", { id: event.id, type: event.type });
      return;
    }
    if (this._size >= this.maxDepth) {
      const msg = `EventQueue backpressure: depth ${this._size} >= max ${this.maxDepth}`;
      logger19.warn(msg, { type: event.type, id: event.id });
      throw new QueueError(msg);
    }
    const entry = { event, seq: this.seq++, cancelled: false };
    this.heap.push(entry);
    this._size++;
    this.siftUp(this.heap.length - 1);
    this.maybeCleanDedup();
  }
  /**
   * Re-enqueue events bypassing deduplication.
   * Used when events are cut from an oversized batch and must be returned
   * to the queue — they were already recorded in the dedup cache during
   * their original enqueue and would be silently dropped by enqueue().
   *
   * Does NOT bypass the backpressure limit.
   */
  requeue(events) {
    for (const event of events) {
      if (this._size >= this.maxDepth) {
        const msg = `EventQueue backpressure on requeue: depth ${this._size} >= max ${this.maxDepth}`;
        logger19.warn(msg, { type: event.type, id: event.id });
        throw new QueueError(msg);
      }
      const entry = { event, seq: this.seq++, cancelled: false };
      this.heap.push(entry);
      this._size++;
      this.siftUp(this.heap.length - 1);
    }
  }
  /**
   * Drain all pending events in processing order.
   * Returns all non-cancelled events and clears the heap.
   *
   * Complexity: O(n log n) total — n heapPop calls each O(log n).
   * This is optimal for a priority queue drain; no additional sort is applied.
   * The heap maintains priority ordering intrinsically, so no O(n log n) sort
   * is needed on top of the drain itself.
   */
  drain() {
    const result = [];
    while (this.heap.length > 0) {
      const entry = this.heapPop();
      if (entry && !entry.cancelled) {
        result.push(entry.event);
      }
    }
    this._size = 0;
    return result;
  }
  /**
   * Peek at the next non-cancelled event without removing it.
   */
  peek() {
    while (this.heap.length > 0 && this.heap[0]?.cancelled) {
      this.heapPop();
    }
    return this.heap[0]?.event ?? null;
  }
  /**
   * Current number of pending (non-cancelled) events.
   */
  depth() {
    return this._size;
  }
  /**
   * Returns summary stats about the queue's current state.
   */
  getStats() {
    return {
      pending: this._size,
      max_depth: this.maxDepth,
      dedup_cache_size: this.dedupCache.size
    };
  }
  /**
   * Check whether an event is a duplicate.
   * If not seen before, records the event ID and returns false.
   * If already seen within the TTL window, returns true.
   */
  deduplicate(event) {
    const now = Date.now();
    const record = this.dedupCache.get(event.id);
    if (record !== void 0) {
      const age = now - record.seen_at;
      if (age <= this.dedupTtlMs) {
        return true;
      }
    }
    this.dedupCache.set(event.id, { seen_at: now });
    return false;
  }
  /**
   * Remove a single pending event by ID (lazy deletion).
   * @returns true if the event was found and marked cancelled.
   */
  cancel(event_id) {
    for (const entry of this.heap) {
      if (entry.event.id === event_id && !entry.cancelled) {
        entry.cancelled = true;
        this._size--;
        logger19.debug("Cancelled event", { event_id });
        return true;
      }
    }
    return false;
  }
  /**
   * Remove all pending events whose context.ref matches the given string (lazy deletion).
   * @returns The number of events cancelled.
   */
  cancelByRef(ref) {
    let count = 0;
    for (const entry of this.heap) {
      if (!entry.cancelled && entry.event.context?.ref === ref) {
        entry.cancelled = true;
        this._size--;
        count++;
      }
    }
    if (count > 0) {
      logger19.debug("Cancelled events by ref", { ref, count });
    }
    return count;
  }
  // ─── Heap Helpers ─────────────────────────────────────────────────────────
  // Non-null assertions in heap operations are safe: indices are always bounds-checked
  /**
   * Returns true if entry `a` should be higher in priority than entry `b`.
   * Higher priority number = drain first. For equal priority: lower seq = drain first.
   */
  higher(a, b) {
    if (a.event.priority !== b.event.priority) {
      return a.event.priority > b.event.priority;
    }
    return a.seq < b.seq;
  }
  parent(i) {
    return i - 1 >> 1;
  }
  left(i) {
    return 2 * i + 1;
  }
  right(i) {
    return 2 * i + 2;
  }
  swap(i, j) {
    const tmp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = tmp;
  }
  /** Move entry at index `i` up until the heap property is restored. */
  siftUp(i) {
    while (i > 0) {
      const p = this.parent(i);
      if (this.higher(this.heap[i], this.heap[p])) {
        this.swap(i, p);
        i = p;
      } else {
        break;
      }
    }
  }
  /** Move entry at index `i` down until the heap property is restored. */
  siftDown(i) {
    const n = this.heap.length;
    for (; ; ) {
      let best = i;
      const l = this.left(i);
      const r = this.right(i);
      if (l < n && this.higher(this.heap[l], this.heap[best])) best = l;
      if (r < n && this.higher(this.heap[r], this.heap[best])) best = r;
      if (best === i) break;
      this.swap(i, best);
      i = best;
    }
  }
  /** Remove and return the root (highest-priority) entry from the heap. */
  heapPop() {
    if (this.heap.length === 0) return void 0;
    const root = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    if (!root.cancelled) this._size--;
    return root;
  }
  // ─── Dedup Helpers ────────────────────────────────────────────────────────
  /**
   * Sweep expired dedup-cache entries every DEDUP_CLEAN_INTERVAL_MS.
   * Skips the sweep entirely when the cache is empty (no entries to expire).
   */
  maybeCleanDedup() {
    const now = Date.now();
    if (now - this.lastDedupClean < _EventQueue.DEDUP_CLEAN_INTERVAL_MS) return;
    if (this.dedupCache.size === 0) return;
    this.lastDedupClean = now;
    const cutoff = now - this.dedupTtlMs;
    for (const [id, record] of this.dedupCache) {
      if (record.seen_at < cutoff) {
        this.dedupCache.delete(id);
      }
    }
  }
};

// src/core/queues/dead-letter.ts
var import_node_fs9 = require("node:fs");
var import_node_path9 = require("node:path");
var logger20 = createLogger("core:dead-letter");
var DeadLetterQueue = class {
  static {
    __name(this, "DeadLetterQueue");
  }
  entries = [];
  maxSize;
  filePath;
  persistEnabled;
  constructor(options = {}) {
    this.maxSize = options.max_size ?? 500;
    this.persistEnabled = options.persist !== false;
    const cwd = process.cwd();
    const defaultPath = (0, import_node_path9.join)(cwd, ".goodvibes", "memory", "dead-letter.json");
    this.filePath = options.file_path ? (0, import_node_path9.isAbsolute)(options.file_path) ? options.file_path : (0, import_node_path9.join)(cwd, options.file_path) : defaultPath;
    if (this.persistEnabled) {
      this.load();
    }
  }
  /**
   * Store a failed event in the dead-letter queue.
   * If max_size is exceeded, the oldest entry is evicted.
   *
   * Note on eviction: we use Array.shift() which is O(n). This is intentional
   * — the DLQ is bounded to max_size (default 500) and eviction is rare.
   * A circular buffer or deque would reduce eviction cost to O(1), but adds
   * complexity that is not justified given the expected usage pattern.
   * If the DLQ ever grows significantly larger, reconsider this choice.
   */
  add(entry) {
    while (this.entries.length >= this.maxSize) {
      this.entries.shift();
    }
    this.entries.push(entry);
    logger20.warn("Event dead-lettered", {
      event_id: entry.event.id,
      event_type: entry.event.type,
      trigger_id: entry.trigger_id,
      attempts: entry.attempt_count,
      error: entry.error
    });
    if (this.persistEnabled) {
      this.persist();
    }
  }
  /**
   * Retrieve a dead-letter entry by event ID.
   */
  getById(event_id) {
    return this.entries.find((e) => e.event.id === event_id);
  }
  /**
   * Retrieve all dead-letter entries for a given event type.
   */
  getByType(event_type) {
    return this.entries.filter((e) => e.event.type === event_type);
  }
  /**
   * Retrieve all dead-letter entries.
   * Returns a shallow copy of the internal array so callers cannot mutate
   * the queue's internal state (e.g. push/splice). Note that the individual
   * {@link DeadLetterEntry} objects within the array are still shared
   * references — callers should not mutate entry properties directly.
   */
  getAll() {
    return [...this.entries];
  }
  /**
   * Number of dead-letter entries.
   */
  size() {
    return this.entries.length;
  }
  /**
   * Remove a dead-letter entry by event ID.
   * @returns true if found and removed.
   */
  remove(event_id) {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.event.id !== event_id);
    const removed = this.entries.length < before;
    if (removed && this.persistEnabled) this.persist();
    return removed;
  }
  /**
   * Clear all dead-letter entries.
   */
  clear() {
    this.entries = [];
    if (this.persistEnabled) this.persist();
  }
  /**
   * Replay a dead-letter entry: calls the re-enqueue callback with the event,
   * and only removes it from the DLQ after the callback succeeds.
   * If the callback throws, the entry remains in the DLQ.
   * @returns The re-enqueued event, or null if not found or callback failed.
   */
  async replay(event_id, reenqueue) {
    const entry = this.getById(event_id);
    if (!entry) return null;
    try {
      await reenqueue(entry.event);
    } catch (err) {
      logger20.warn("Replay re-enqueue callback failed; keeping entry in DLQ", {
        event_id,
        event_type: entry.event.type,
        error: toErrorMessage(err)
      });
      return null;
    }
    this.remove(event_id);
    logger20.info("Replaying dead-letter event", {
      event_id,
      event_type: entry.event.type
    });
    return entry.event;
  }
  // ─── Private Helpers ──────────────────────────────────────────────────────
  load() {
    try {
      const content = (0, import_node_fs9.readFileSync)(this.filePath, "utf-8");
      const parsed = safeJsonParse(content, null);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((item) => {
          if (typeof item !== "object" || item === null) return false;
          const entry = item;
          return typeof entry["error"] === "string" && typeof entry["trigger_id"] === "string" && typeof entry["dead_lettered_at"] === "number" && typeof entry["attempt_count"] === "number" && typeof entry["event"] === "object" && entry["event"] !== null && typeof entry["event"]["id"] === "string";
        });
        const skipped = parsed.length - valid.length;
        if (skipped > 0) {
          logger20.warn("Skipped invalid dead-letter entries during load", {
            path: this.filePath,
            skipped,
            loaded: valid.length
          });
        }
        this.entries = valid;
        logger20.debug("Loaded dead-letter queue from disk", {
          path: this.filePath,
          count: this.entries.length
        });
      }
    } catch (err) {
      const code = err.code;
      if (code !== "ENOENT") {
        logger20.warn("Failed to load dead-letter file; starting empty", {
          path: this.filePath,
          error: toErrorMessage(err)
        });
      }
    }
  }
  persist() {
    try {
      writeJsonSync(this.filePath, this.entries);
    } catch (err) {
      logger20.error("Failed to persist dead-letter queue", {
        path: this.filePath,
        error: toErrorMessage(err)
      });
    }
  }
};

// src/core/utils/retry.ts
var logger21 = createLogger("core:retry");
function computeDelay(backoff, baseMs, attempt) {
  if (backoff === "exponential") {
    return baseMs * Math.pow(2, attempt);
  }
  return baseMs;
}
__name(computeDelay, "computeDelay");

// src/core/matching/error-handler.ts
var logger22 = createLogger("core:error-handler");
function sleep(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
__name(sleep, "sleep");
function buildErrorEvent(trigger_id, error, original_event) {
  return {
    id: generateEventId(),
    source: { kind: "internal" },
    type: "core:handler_error",
    payload: {
      type: "core:handler_error",
      data: {
        trigger_id,
        error_message: error.message,
        original_event_id: original_event.id,
        original_event_type: original_event.type
      }
    },
    timestamp: Date.now(),
    priority: -1,
    // low priority — processed after normal events
    metadata: { session_id: "", sequence: 0, version: 1 },
    context: {
      workflow_id: original_event.context?.workflow_id,
      parent_event_id: original_event.id,
      chain_depth: (original_event.context?.chain_depth ?? 0) + 1
    }
  };
}
__name(buildErrorEvent, "buildErrorEvent");
var ErrorHandler = class {
  static {
    __name(this, "ErrorHandler");
  }
  deadLetter;
  constructor(options) {
    this.deadLetter = options.deadLetter;
  }
  /**
   * Execute a handler with retry logic.
   *
   * - If no retry policy: single attempt.
   * - If retry policy: up to `max_attempts` total attempts with configured backoff.
   * - On final failure: move to dead-letter queue and produce an error event.
   * - Never throws.
   */
  async execute(trigger_id, handler, event, retry) {
    const maxAttempts = retry?.max_attempts ?? 1;
    let lastError;
    const error_events = [];
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0 && retry) {
        const delay = computeDelay(retry.backoff, retry.delay_ms, attempt - 1);
        logger22.debug("Retrying handler", { trigger_id, attempt, delay_ms: delay });
        await sleep(delay);
      }
      try {
        const result = await handler(event);
        if (result.error) {
          lastError = result.error;
          logger22.warn("Handler returned error result", {
            trigger_id,
            attempt: attempt + 1,
            error: result.error.message
          });
          if (attempt < maxAttempts - 1) {
            continue;
          }
        } else {
          logger22.debug("Handler executed successfully", {
            trigger_id,
            attempts: attempt + 1
          });
          return { success: true, result, attempts: attempt + 1, error_events };
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger22.warn("Handler threw exception", {
          trigger_id,
          attempt: attempt + 1,
          maxAttempts,
          error: lastError.message
        });
      }
    }
    const finalError = lastError ?? new Error("Handler failed with unknown error");
    logger22.error("Handler exhausted retries; dead-lettering event", {
      trigger_id,
      event_id: event.id,
      event_type: event.type,
      attempts: maxAttempts,
      error: finalError.message
    });
    this.deadLetter.add({
      event,
      error: finalError.message,
      dead_lettered_at: Date.now(),
      attempt_count: maxAttempts,
      trigger_id
    });
    error_events.push(buildErrorEvent(trigger_id, finalError, event));
    return {
      success: false,
      error: finalError,
      attempts: maxAttempts,
      error_events
    };
  }
  /**
   * Build the set of actions from a failed execution.
   * Returns cancel_event action and any handler-provided actions.
   */
  buildFailureActions(trigger_id) {
    return [
      {
        type: "cancel_event",
        params: { trigger_id, reason: "handler_exhausted" }
      }
    ];
  }
};

// src/core/processing/event-processor.ts
var logger23 = createLogger("core:event-processor");
var MAX_EVENTS_PER_BATCH = 100;
var MAX_CHAIN_DEPTH = 10;
var RATE_LIMIT_WINDOW_MS = 1e3;
var STALE_LOCK_TIMEOUT_MS = 3e4;
var INTERNAL_EVENT_PRIORITY = 5;
function chainEvent(child, parent) {
  return {
    ...child,
    context: {
      ...child.context,
      parent_event_id: parent.id,
      chain_depth: (parent.context?.chain_depth ?? 0) + 1,
      workflow_id: child.context?.workflow_id ?? parent.context?.workflow_id
    }
  };
}
__name(chainEvent, "chainEvent");
function applyStateUpdates(store, updates) {
  for (const update of updates) {
    switch (update.op) {
      case "set":
        store.set(update.key, update.value);
        break;
      case "delete":
        store.delete(update.key);
        break;
      case "merge":
        if (typeof update.value === "object" && update.value !== null && !Array.isArray(update.value)) {
          store.merge(update.key, update.value);
        } else {
          store.set(update.key, update.value);
        }
        break;
    }
  }
}
__name(applyStateUpdates, "applyStateUpdates");
function buildChainDepthExceededEvent(event, maxDepth) {
  return {
    id: generateEventId(),
    source: { kind: "internal" },
    type: "core:chain_depth_exceeded",
    payload: {
      type: "core:chain_depth_exceeded",
      data: {
        original_event_id: event.id,
        original_event_type: event.type,
        depth: event.context?.chain_depth ?? 0,
        max_depth: maxDepth
      }
    },
    timestamp: Date.now(),
    priority: INTERNAL_EVENT_PRIORITY,
    metadata: { session_id: "", sequence: 0, version: 1 }
  };
}
__name(buildChainDepthExceededEvent, "buildChainDepthExceededEvent");
function buildQueueDepthWarningEvent(depth, threshold) {
  return {
    id: generateEventId(),
    source: { kind: "internal" },
    type: "core:queue_depth_warning",
    payload: { type: "core:queue_depth_warning", data: { depth, threshold } },
    timestamp: Date.now(),
    priority: INTERNAL_EVENT_PRIORITY,
    metadata: { session_id: "", sequence: 0, version: 1 }
  };
}
__name(buildQueueDepthWarningEvent, "buildQueueDepthWarningEvent");
var EventProcessor = class {
  static {
    __name(this, "EventProcessor");
  }
  queue;
  registry;
  store;
  lifecycle;
  metrics;
  errorHandler;
  // DeadLetterQueueInterface is satisfied by EventProcessor itself not using it directly;
  // the ErrorHandler holds the DLQ reference. Kept here for inspection/testing.
  deadLetter;
  options;
  budget;
  handlers;
  priorityFloor;
  rateLimit;
  queueDepthWarning;
  actionExecutor;
  /**
   * Workflow-level processing lock: workflow_id → lock_acquired_at (epoch ms).
   * A lock is considered stale when its age exceeds lock_timeout_ms.
   */
  workflowLocks = /* @__PURE__ */ new Map();
  /** Count of tokens consumed (for budget tracking). */
  tokensConsumed = 0;
  /** True once the budget warning has been sent; reset when tokens are replenished. */
  budgetWarningSent = false;
  /** Rate limiter state: events processed in the current window. */
  rateLimitCount = 0;
  rateLimitWindowStart = 0;
  /** True once the "no actionExecutor" warning has been logged; prevents log spam. */
  actionExecutorWarningLogged = false;
  /**
   * Re-entrancy guard for processBatch().
   * Set to true while a batch is actively being processed; prevents concurrent
   * invocations from overlapping when handlers emit events synchronously or
   * when the external scheduler calls processBatch() before the current run
   * has resolved.
   */
  processing = false;
  /**
   * Guards against unbounded microtask scheduling under sustained load.
   * When true, a follow-up processBatch() microtask is already queued;
   * additional re-entrancy deflections are coalesced into the pending one.
   */
  pendingRetry = false;
  constructor(queue, registry, store, lifecycle, metrics, errorHandler, deadLetter, options = {}) {
    this.queue = queue;
    this.registry = registry;
    this.store = store;
    this.lifecycle = lifecycle;
    this.metrics = metrics;
    this.errorHandler = errorHandler;
    this.deadLetter = deadLetter;
    this.options = {
      max_events_per_batch: options.max_events_per_batch ?? MAX_EVENTS_PER_BATCH,
      max_chain_depth: options.max_chain_depth ?? MAX_CHAIN_DEPTH,
      lock_timeout_ms: options.lock_timeout_ms ?? STALE_LOCK_TIMEOUT_MS
    };
    this.budget = options.budget;
    this.handlers = options.handlers ?? /* @__PURE__ */ new Map();
    this.priorityFloor = options.priority_floor;
    this.rateLimit = options.rate_limit ? { max_per_window: options.rate_limit.max_per_window, window_ms: options.rate_limit.window_ms ?? RATE_LIMIT_WINDOW_MS } : void 0;
    this.queueDepthWarning = options.queue_depth_warning;
    this.actionExecutor = options?.action_executor;
    this.rateLimitWindowStart = Date.now();
  }
  /**
   * Register a handler for a trigger.
   */
  registerHandler(trigger_id, handler) {
    this.handlers.set(trigger_id, handler);
  }
  /** Start the event processing lifecycle. Must be called before processBatch() will process events. */
  start() {
    this.lifecycle.start();
  }
  /** Stop the event processing lifecycle gracefully. */
  async stop() {
    await this.lifecycle.shutdown();
  }
  /**
   * Process a single batch of events from the queue.
   * Only runs when the lifecycle is in 'running' state.
   * Returns the number of events processed.
   *
   * Re-entrancy: if this method is called while a batch is already in flight,
   * it schedules another pass via queueMicrotask and returns 0 immediately.
   * This prevents recursive or overlapping batch processing when handlers
   * emit events synchronously or when an external scheduler fires early.
   *
   * Batch size: at most `max_events_per_batch` events are processed per call.
   * If the queue contains more events, the remainder are re-queued and another
   * pass is scheduled automatically via queueMicrotask.
   */
  async processBatch() {
    if (!this.lifecycle.isProcessing()) {
      return 0;
    }
    if (this.processing) {
      if (!this.pendingRetry) {
        this.pendingRetry = true;
        queueMicrotask(() => {
          this.pendingRetry = false;
          void this.processBatch();
        });
      }
      return 0;
    }
    this.processing = true;
    try {
      if (this.budget && this.budget.total > 0) {
        const fraction = this.tokensConsumed / this.budget.total;
        if (fraction >= this.budget.pause_threshold) {
          logger23.warn("Budget pause threshold exceeded; pausing loop", {
            consumed: this.tokensConsumed,
            total: this.budget.total,
            fraction
          });
          this.lifecycle.pause();
          return 0;
        }
      }
      const currentDepth = this.queue.depth();
      if (this.queueDepthWarning !== void 0 && currentDepth >= this.queueDepthWarning) {
        logger23.warn("Queue depth warning threshold reached", {
          depth: currentDepth,
          threshold: this.queueDepthWarning
        });
        const warning = buildQueueDepthWarningEvent(currentDepth, this.queueDepthWarning);
        try {
          this.queue.enqueue(warning);
        } catch (err) {
          logger23.debug("Failed to enqueue queue depth warning event", { error: err instanceof Error ? err.message : String(err) });
        }
      }
      const now = Date.now();
      for (const [workflowId, acquiredAt] of this.workflowLocks) {
        if (now - acquiredAt >= this.options.lock_timeout_ms) {
          this.workflowLocks.delete(workflowId);
          logger23.warn("Stale workflow lock swept during batch start", {
            workflow_id: workflowId,
            lock_age_ms: now - acquiredAt,
            timeout_ms: this.options.lock_timeout_ms
          });
        }
      }
      const events = this.queue.drain();
      if (events.length === 0) {
        return 0;
      }
      this.metrics.onQueueDepthChange(0);
      const toProcess = events.slice(0, this.options.max_events_per_batch);
      if (events.length > this.options.max_events_per_batch) {
        try {
          this.queue.requeue(events.slice(this.options.max_events_per_batch));
          queueMicrotask(() => {
            void this.processBatch();
          });
        } catch (err) {
          logger23.debug("Failed to requeue overflow batch events", { error: err instanceof Error ? err.message : String(err) });
        }
      }
      let processed = 0;
      for (const event of toProcess) {
        if (this.priorityFloor !== void 0 && event.priority < this.priorityFloor) {
          logger23.debug("Skipping event below priority floor", {
            event_id: event.id,
            event_type: event.type,
            priority: event.priority,
            floor: this.priorityFloor
          });
          continue;
        }
        if (this.rateLimit) {
          const rateLimitNow = Date.now();
          if (rateLimitNow - this.rateLimitWindowStart >= this.rateLimit.window_ms) {
            this.rateLimitWindowStart = rateLimitNow;
            this.rateLimitCount = 0;
          }
          if (this.rateLimitCount >= this.rateLimit.max_per_window) {
            logger23.debug("Rate limit reached; re-queuing remaining events", {
              max_per_window: this.rateLimit.max_per_window,
              window_ms: this.rateLimit.window_ms
            });
            const remaining = toProcess.slice(toProcess.indexOf(event));
            try {
              this.queue.requeue(remaining);
            } catch (err) {
              logger23.debug("Failed to requeue rate-limited events", { error: err instanceof Error ? err.message : String(err) });
            }
            break;
          }
          this.rateLimitCount++;
        }
        const depth = event.context?.chain_depth ?? 0;
        if (depth > this.options.max_chain_depth) {
          logger23.warn("Chain depth exceeded; dropping event", {
            event_id: event.id,
            event_type: event.type,
            depth,
            max: this.options.max_chain_depth
          });
          const exceeded = buildChainDepthExceededEvent(event, this.options.max_chain_depth);
          try {
            this.queue.enqueue(exceeded);
          } catch (err) {
            logger23.debug("Failed to enqueue chain_depth_exceeded event", { error: err instanceof Error ? err.message : String(err) });
          }
          continue;
        }
        const workflowId = event.context?.workflow_id;
        if (workflowId) {
          const lockAcquiredAt = this.workflowLocks.get(workflowId);
          if (lockAcquiredAt !== void 0) {
            const lockAge = Date.now() - lockAcquiredAt;
            if (lockAge < this.options.lock_timeout_ms) {
              try {
                this.queue.requeue([event]);
              } catch (err) {
                logger23.debug("Failed to requeue workflow-locked event", { event_id: event.id, error: err instanceof Error ? err.message : String(err) });
              }
              continue;
            }
            logger23.warn("Releasing stale workflow lock", {
              workflow_id: workflowId,
              lock_age_ms: lockAge,
              timeout_ms: this.options.lock_timeout_ms
            });
          }
          this.workflowLocks.set(workflowId, Date.now());
        }
        try {
          await this.processEvent(event);
          processed++;
        } finally {
          if (workflowId) {
            this.workflowLocks.delete(workflowId);
          }
        }
      }
      this.metrics.onQueueDepthChange(this.queue.depth());
      return processed;
    } finally {
      this.processing = false;
    }
  }
  /**
   * Consume tokens against the budget.
   * At the warning threshold, emits a budget warning event.
   */
  consumeTokens(count) {
    if (!this.budget || this.budget.total === 0) return;
    this.tokensConsumed += count;
    const fraction = this.tokensConsumed / this.budget.total;
    if (!this.budgetWarningSent && fraction >= this.budget.warn_threshold) {
      this.budgetWarningSent = true;
      logger23.warn("Budget warning threshold reached", {
        consumed: this.tokensConsumed,
        total: this.budget.total,
        fraction
      });
    }
  }
  /**
   * Replenish the token budget and reset the warning flag.
   * Call this when tokens are added back to the budget.
   */
  replenishTokens(count) {
    if (!this.budget || this.budget.total === 0) return;
    this.tokensConsumed = Math.max(0, this.tokensConsumed - count);
    const fraction = this.tokensConsumed / this.budget.total;
    if (fraction < this.budget.warn_threshold) {
      this.budgetWarningSent = false;
    }
  }
  /**
   * Get count of active workflow locks.
   */
  activeWorkflowCount() {
    return this.workflowLocks.size;
  }
  /**
   * Process a single event immediately, bypassing the queue.
   * Used for hook-originated events where the directive must be available
   * before the IPC response returns (e.g. WRFC agent:completed → spawn reviewer).
   */
  async processImmediate(event) {
    await this.processEvent(event);
  }
  // ─── Private ────────────────────────────────────────────────────────────────────────
  async processEvent(event) {
    const startMs = Date.now();
    logger23.debug("Processing event", { id: event.id, type: event.type });
    const matchedTriggers = this.registry.match(event, this.store);
    const chainedEvents = [];
    for (const trigger of matchedTriggers) {
      this.registry.recordFire(trigger.id);
      this.metrics.onTriggerFired(trigger.id, event);
      const handler = this.handlers.get(trigger.id);
      let result;
      if (handler) {
        const execResult = await this.errorHandler.execute(
          trigger.id,
          handler,
          event,
          trigger.retry
        );
        if (!execResult.success) {
          this.metrics.onHandlerError(trigger.id, execResult.error, event);
          for (const errEvt of execResult.error_events) {
            try {
              this.queue.enqueue(errEvt);
            } catch (err) {
              logger23.debug("Failed to enqueue error event", { error: err instanceof Error ? err.message : String(err) });
            }
          }
          continue;
        }
        result = execResult.result;
      } else {
        result = { actions: trigger.actions };
      }
      if (result.state_updates && result.state_updates.length > 0) {
        applyStateUpdates(this.store, result.state_updates);
      }
      if (result.events && result.events.length > 0) {
        for (const newEvt of result.events) {
          chainedEvents.push(chainEvent(newEvt, event));
        }
      }
      if (result.actions && result.actions.length > 0) {
        if (!this.actionExecutor) {
          if (!this.actionExecutorWarningLogged) {
            logger23.warn("Actions produced but no actionExecutor configured \u2014 actions will be dropped", {
              action_count: result.actions.length,
              action_types: result.actions.map((a) => a.type),
              handler_id: trigger.id ?? "unknown",
              event_type: event.type,
              workflow_id: event.context?.workflow_id
            });
            this.actionExecutorWarningLogged = true;
          }
        } else {
          for (const action of result.actions) {
            try {
              await this.actionExecutor.execute(action, {
                handler_id: trigger.id ?? "unknown",
                event_type: event.type,
                workflow_id: event.context?.workflow_id,
                session_id: event.metadata?.session_id
              });
            } catch (err) {
              logger23.error("Action execution failed", {
                action_type: action.type,
                handler_id: trigger.id ?? "unknown",
                error: err instanceof Error ? err.message : String(err)
              });
            }
          }
        }
      }
    }
    for (const chained of chainedEvents) {
      try {
        this.queue.enqueue(chained);
      } catch (err) {
        logger23.warn("Failed to enqueue chained event (backpressure)", {
          event_id: chained.id,
          event_type: chained.type,
          queue_depth: this.queue.depth(),
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    const duration = Date.now() - startMs;
    this.metrics.onEventProcessed(event, duration);
  }
};

// src/core/processing/lifecycle.ts
var logger24 = createLogger("core:lifecycle");
var VALID_TRANSITIONS2 = {
  stopped: ["running"],
  /**
   * 'stopped' is included here to support forceTransition() during shutdown
   * (which bypasses this table). It is NOT reachable via the public API —
   * the only public path to 'stopped' is through drain() or shutdown().
   * Reserved for future use if a direct stop() method is added.
   */
  running: ["paused", "draining", "stopped"],
  paused: ["running", "stopped"],
  draining: ["stopped"]
};
var LoopLifecycleManager = class {
  static {
    __name(this, "LoopLifecycleManager");
  }
  _status = "stopped";
  options;
  constructor(options = {}) {
    this.options = options;
  }
  /**
   * Current loop status.
   */
  status() {
    return this._status;
  }
  /**
   * Transition to 'running'.
   * @throws if the current state does not allow this transition.
   */
  start() {
    this.transition("running");
  }
  /**
   * Transition to 'paused'.
   * Events continue to be accepted but are not processed.
   * @throws if the current state does not allow this transition.
   */
  pause() {
    this.transition("paused");
  }
  /**
   * Resume from 'paused' → 'running'.
   * @throws if the current state is not 'paused'.
   */
  resume() {
    if (this._status !== "paused") {
      throw new ProcessingError(`Cannot resume from status '${this._status}': must be 'paused'`);
    }
    this.transition("running");
  }
  /**
   * Drain: process all remaining events then transition to 'stopped'.
   * Calls options.onDrain() if provided.
   * @throws if the current state does not allow transitioning to 'draining'.
   */
  async drain() {
    this.transition("draining");
    try {
      if (this.options.onDrain) {
        await this.options.onDrain();
      }
    } finally {
      this.transition("stopped");
    }
  }
  /**
   * Graceful shutdown: run onShutdown callback then transition to 'stopped'.
   * May be called from any non-stopped state.
   *
   * Shutdown bypasses the normal transition table because it must always
   * succeed regardless of the current state (running, paused, or draining).
   * Rather than adding 'stopped' as a valid target from every state — which
   * would undermine the state machine's purpose — we use forceTransition()
   * which logs a warning when it bypasses the table.
   */
  async shutdown() {
    if (this._status === "stopped") {
      logger24.debug("Shutdown called but already stopped");
      return;
    }
    logger24.info("Shutting down event loop", { current: this._status });
    try {
      if (this.options.onShutdown) {
        await this.options.onShutdown();
      }
    } catch (err) {
      logger24.error("Error during shutdown callback", {
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      this.forceTransition("stopped");
    }
  }
  /**
   * Returns true if events should be accepted (any state except stopped).
   */
  acceptsEvents() {
    return this._status !== "stopped";
  }
  /**
   * Returns true if events should be processed (only 'running').
   */
  isProcessing() {
    return this._status === "running";
  }
  // ─── Private Helpers ──────────────────────────────────────────────────────
  transition(to) {
    const from = this._status;
    const allowed = VALID_TRANSITIONS2[from];
    if (!allowed.includes(to)) {
      throw new ProcessingError(
        `Invalid lifecycle transition: '${from}' \u2192 '${to}'. Allowed from '${from}': [${allowed.join(", ")}]`
      );
    }
    this._status = to;
    logger24.info("Lifecycle transition", { from, to });
    this.options.onTransition?.(from, to);
  }
  /**
   * Force a state transition regardless of the transition table.
   *
   * **INTENTIONALLY UNSAFE** — bypasses all state validation.
   * This method exists solely for error recovery during shutdown, where the loop
   * must always reach 'stopped' regardless of its current state. It MUST NOT be
   * called in normal flow; add new call sites only with explicit justification.
   *
   * A `logger.warn` is emitted whenever the transition bypasses the table so
   * that forced transitions are always visible in production logs.
   */
  forceTransition(to) {
    const from = this._status;
    const allowed = VALID_TRANSITIONS2[from];
    if (!allowed.includes(to)) {
      logger24.warn("Forcing lifecycle transition outside transition table", { from, to });
    }
    this._status = to;
    logger24.info("Lifecycle transition (forced)", { from, to });
    this.options.onTransition?.(from, to);
  }
};

// src/core/processing/executor-mode.ts
var logger25 = createLogger("executor-mode");
var ExecutorModeManager = class {
  static {
    __name(this, "ExecutorModeManager");
  }
  currentMode;
  detectionMethod;
  config;
  eventBus;
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus ?? null;
    this.detectionMethod = "default";
    this.currentMode = "engaged";
    this.currentMode = this.detectMode();
  }
  /**
   * Determine mode using priority order:
   * 1. GOODVIBES_EXECUTOR_MODE env var (explicit override)
   * 2. config.executor.mode != 'engaged' (explicit config)
   * 3. Default: 'engaged'
   */
  detectMode() {
    const envMode = process.env["GOODVIBES_EXECUTOR_MODE"];
    if (envMode === "daemon" || envMode === "hybrid" || envMode === "engaged") {
      this.detectionMethod = "explicit";
      this.currentMode = envMode;
      logger25.info("Executor mode set from env var", { mode: this.currentMode });
      return this.currentMode;
    }
    if (this.config.mode !== "engaged") {
      this.detectionMethod = "explicit";
      this.currentMode = this.config.mode;
      logger25.info("Executor mode set from config", { mode: this.currentMode });
      return this.currentMode;
    }
    this.detectionMethod = "default";
    this.currentMode = "engaged";
    logger25.debug("Executor mode defaulting to engaged");
    return this.currentMode;
  }
  /** Get the current resolved mode. */
  getMode() {
    return this.currentMode;
  }
  /** Get the detection method used. */
  getDetectionMethod() {
    return this.detectionMethod;
  }
  /** Explicitly switch mode at runtime. Emits executor:mode_set. */
  setMode(mode) {
    const previousMode = this.currentMode;
    this.currentMode = mode;
    this.detectionMethod = "explicit";
    logger25.info("Executor mode changed", { from: previousMode, to: mode });
    if (this.eventBus) {
      this.eventBus.emit({
        id: generateEventId(),
        timestamp: timestamp(),
        priority: 0,
        type: "executor:mode_set",
        source: { kind: "system" },
        payload: {
          type: "executor:mode_set",
          data: {
            mode,
            previous_mode: previousMode,
            detection_method: "explicit"
          }
        },
        metadata: { session_id: "", sequence: 0, version: 1 }
      });
    }
  }
  /**
   * Check if the current mode processes queued events.
   * daemon and hybrid modes process the queue; engaged does not.
   */
  shouldProcessQueue() {
    return this.currentMode === "daemon" || this.currentMode === "hybrid";
  }
  /**
   * Check if context should be cleared after a batch.
   * Only daemon mode with clear_context_after_batch clears context.
   */
  shouldClearContext() {
    return this.currentMode === "daemon" && this.config.daemon.clear_context_after_batch;
  }
  /**
   * Update the config reference for hot-reload support.
   * Called by RuntimeEngine.updateConfig() when runtime_config changes.
   */
  updateConfig(config) {
    this.config = config;
  }
};

// src/core/state/state-store.ts
var import_node_fs10 = require("node:fs");
var import_node_path10 = require("node:path");
var logger26 = createLogger("core:state-store");
var FORBIDDEN_PATH_SEGMENTS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
function validateDotPath(path3) {
  const segments = path3.split(".");
  for (const seg of segments) {
    if (FORBIDDEN_PATH_SEGMENTS.has(seg)) {
      throw new TypeError(
        `Prototype pollution guard: key path segment '${seg}' is forbidden in state paths`
      );
    }
  }
}
__name(validateDotPath, "validateDotPath");
function setPath(obj, path3, value) {
  const segments = path3.split(".");
  let current = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (typeof current[seg] !== "object" || current[seg] === null) {
      current[seg] = {};
    }
    current = current[seg];
  }
  const lastSeg = segments[segments.length - 1];
  current[lastSeg] = value;
}
__name(setPath, "setPath");
function getPath(obj, path3) {
  const segments = path3.split(".");
  let current = obj;
  for (const seg of segments) {
    if (current === null || typeof current !== "object") return void 0;
    current = current[seg];
  }
  return current;
}
__name(getPath, "getPath");
function deletePath(obj, path3) {
  const segments = path3.split(".");
  let current = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (typeof current !== "object" || current === null) return;
    current = current[seg];
  }
  if (typeof current === "object" && current !== null) {
    const lastSeg = segments[segments.length - 1];
    delete current[lastSeg];
  }
}
__name(deletePath, "deletePath");
var DEEP_MERGE_MAX_DEPTH = 20;
function deepMerge2(base, override, depth = 0) {
  if (depth >= DEEP_MERGE_MAX_DEPTH) {
    logger26.warn("deepMerge depth limit exceeded; using override value as-is", { depth });
    return { ...base, ...override };
  }
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value) && typeof result[key] === "object" && result[key] !== null && !Array.isArray(result[key])) {
      result[key] = deepMerge2(
        result[key],
        value,
        depth + 1
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}
__name(deepMerge2, "deepMerge");
var CoreStateStore = class {
  static {
    __name(this, "CoreStateStore");
  }
  data = {};
  filePath;
  saveDebounceMs;
  saveTimer = null;
  changeListener;
  constructor(options = {}) {
    const cwd = process.cwd();
    const defaultPath = (0, import_node_path10.join)(cwd, ".goodvibes", "memory", "runtime-state.json");
    this.filePath = options.file_path ? (0, import_node_path10.isAbsolute)(options.file_path) ? options.file_path : (0, import_node_path10.join)(cwd, options.file_path) : defaultPath;
    this.saveDebounceMs = options.save_debounce_ms ?? 1e3;
    this.load();
  }
  /**
   * Get a value at a dot-separated key path.
   * Returns null if not found or if path traversal fails.
   * Throws TypeError if the path contains a forbidden segment (`__proto__`,
   * `constructor`, or `prototype`) to prevent prototype pollution.
   */
  get(key) {
    validateDotPath(key);
    const value = getPath(this.data, key);
    return value === void 0 ? null : value;
  }
  /**
   * Set a value at a dot-separated key path.
   * Schedules a debounced auto-save.
   * Throws TypeError if the path contains a forbidden segment (`__proto__`,
   * `constructor`, or `prototype`) to prevent prototype pollution.
   */
  set(key, value) {
    validateDotPath(key);
    const oldValue = this.get(key);
    setPath(this.data, key, value);
    this.scheduleSave();
    if (this.changeListener) {
      this.changeListener({
        key,
        operation: "set",
        namespace: key.split(".")[0] || key,
        oldValue,
        newValue: value
      });
    }
  }
  /**
   * Delete a key (dot-separated path). No-op if not found.
   * Throws TypeError if the path contains a forbidden segment (`__proto__`,
   * `constructor`, or `prototype`) to prevent prototype pollution.
   */
  delete(key) {
    validateDotPath(key);
    const oldValue = this.get(key);
    deletePath(this.data, key);
    this.scheduleSave();
    if (this.changeListener) {
      this.changeListener({
        key,
        operation: "delete",
        namespace: key.split(".")[0] || key,
        oldValue,
        newValue: null
      });
    }
  }
  /**
   * Apply a merge at a dot-separated path.
   * The existing value at the path is deep-merged with the provided value.
   * If there is no existing value, this is equivalent to set().
   */
  merge(key, value) {
    validateDotPath(key);
    const oldValue = this.get(key);
    const existing = oldValue;
    const merged = existing !== null && typeof existing === "object" && !Array.isArray(existing) ? deepMerge2(existing, value) : value;
    setPath(this.data, key, merged);
    this.scheduleSave();
    if (this.changeListener) {
      this.changeListener({
        key,
        operation: "merge",
        namespace: key.split(".")[0] || key,
        oldValue,
        newValue: this.get(key)
      });
    }
  }
  /**
   * Take a deep-copy snapshot of all state.
   */
  snapshot() {
    return structuredClone(this.data);
  }
  /**
   * Replace all state with the given snapshot.
   * Schedules a debounced auto-save.
   */
  restore(snapshot) {
    this.data = structuredClone(snapshot);
    this.scheduleSave();
  }
  /**
   * Flush any pending auto-save immediately.
   * Useful for graceful shutdown.
   */
  flush() {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.persist();
  }
  /**
   * Dispose the store: flush pending writes and release resources.
   * Call this on graceful shutdown to prevent timer leaks.
   */
  dispose() {
    this.flush();
  }
  /**
   * List all dot-path keys in the store.
   * If prefix is provided, only return keys that start with `${prefix}.` or equal prefix exactly.
   */
  /** Register a listener that is called on every state mutation. Only one listener supported. */
  onStateChange(listener) {
    this.changeListener = listener;
  }
  keys(prefix) {
    const allKeys = this.collectKeys(this.data, "");
    if (!prefix) return allKeys;
    return allKeys.filter((k) => k === prefix || k.startsWith(prefix + "."));
  }
  /**
   * Recursively collect all leaf dot-path keys from a nested object.
   * Empty objects ({}) have no leaves and are therefore not enumerated.
   * Recursion is limited to {@link DEEP_MERGE_MAX_DEPTH} levels.
   */
  collectKeys(obj, parentPath, depth = 0) {
    if (depth >= DEEP_MERGE_MAX_DEPTH) {
      logger26.warn("collectKeys depth limit exceeded; treating as leaf", { depth, path: parentPath });
      if (parentPath) return [parentPath];
      return [];
    }
    const result = [];
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = parentPath ? `${parentPath}.${key}` : key;
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        result.push(...this.collectKeys(value, fullPath, depth + 1));
      } else {
        result.push(fullPath);
      }
    }
    return result;
  }
  // ─── Private Helpers ──────────────────────────────────────────────────────
  /** Load from disk on construction. Missing file is not an error. */
  load() {
    try {
      const content = (0, import_node_fs10.readFileSync)(this.filePath, "utf-8");
      const parsed = safeJsonParse(content, null);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        this.data = parsed;
        logger26.debug("Loaded state from disk", { path: this.filePath });
      } else {
        logger26.warn("State file contained non-object; starting fresh", { path: this.filePath });
      }
    } catch (err) {
      const code = err.code;
      if (code === "ENOENT") {
        logger26.debug("No state file found; starting fresh", { path: this.filePath });
      } else {
        logger26.warn("Failed to load state file; starting fresh", {
          path: this.filePath,
          error: toErrorMessage(err)
        });
      }
    }
  }
  /** Schedule a debounced save. */
  scheduleSave() {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persist();
    }, this.saveDebounceMs);
  }
  /** Atomically write state to disk (write tmp then rename). */
  persist() {
    try {
      writeJsonSync(this.filePath, this.data);
      logger26.debug("Persisted state to disk", { path: this.filePath });
    } catch (err) {
      logger26.error("Failed to persist state", {
        path: this.filePath,
        error: toErrorMessage(err)
      });
    }
  }
};

// src/core/state/stream-reader.ts
function readStreamBody(stream, maxBytes) {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let limitExceeded = false;
    let resolved = false;
    stream.on("data", (chunk) => {
      if (limitExceeded) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        limitExceeded = true;
        stream.removeAllListeners("data");
        stream.resume();
        if (!resolved) {
          resolved = true;
          resolve2(null);
        }
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => {
      if (limitExceeded) return;
      if (!resolved) {
        resolved = true;
        resolve2(Buffer.concat(chunks).toString("utf-8"));
      }
    });
    stream.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });
}
__name(readStreamBody, "readStreamBody");

// src/core/utils/poll.ts
var logger27 = createLogger("core:poll");

// src/core/state/file-fallback.ts
var logger28 = createLogger("file-fallback");

// src/core/observability/metrics.ts
var logger29 = createLogger("core:metrics");
var RollingWindow = class {
  constructor(capacity) {
    this.capacity = capacity;
    this.buffer = Array.from({ length: capacity }, () => 0);
  }
  static {
    __name(this, "RollingWindow");
  }
  /** Fixed-size circular buffer. */
  buffer;
  /** Index of the oldest element (write head). */
  head = 0;
  /**
   * Number of valid samples currently in the buffer (0 <= count <= capacity).
   * Tracks filled slots so average() and max() iterate only valid entries,
   * avoiding divide-by-zero and inaccurate results when the window is partial.
   */
  count = 0;
  push(value) {
    this.buffer[(this.head + this.count) % this.capacity] = value;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
  }
  average() {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) {
      sum += this.buffer[(this.head + i) % this.capacity];
    }
    return sum / this.count;
  }
  max() {
    if (this.count === 0) return 0;
    let best = -Infinity;
    for (let i = 0; i < this.count; i++) {
      const v = this.buffer[(this.head + i) % this.capacity];
      if (v > best) best = v;
    }
    return best;
  }
  size() {
    return this.count;
  }
  reset() {
    this.head = 0;
    this.count = 0;
  }
};
var EventMetrics = class {
  static {
    __name(this, "EventMetrics");
  }
  eventsProcessed = 0;
  eventsFailed = 0;
  eventsDeadLettered = 0;
  triggersFired = 0;
  currentQueueDepth = 0;
  currentActiveChains = 0;
  currentActiveWorkflows = 0;
  latency;
  chainDepth;
  /** Per-trigger fire counts. */
  triggerFireCounts = /* @__PURE__ */ new Map();
  /** Per-trigger error counts. */
  triggerErrorCounts = /* @__PURE__ */ new Map();
  /** Per-type event counts. */
  eventTypeCounts = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    this.latency = new RollingWindow(options.latency_window_size ?? 100);
    this.chainDepth = new RollingWindow(options.chain_depth_window_size ?? 100);
  }
  /**
   * Record a successfully processed event.
   */
  onEventProcessed(event, duration_ms) {
    this.eventsProcessed++;
    this.latency.push(duration_ms);
    const depth = event.context?.chain_depth ?? 0;
    this.chainDepth.push(depth);
    const current = this.eventTypeCounts.get(event.type) ?? 0;
    this.eventTypeCounts.set(event.type, current + 1);
    logger29.debug("Event processed", { type: event.type, duration_ms, chain_depth: depth });
  }
  /**
   * Record a handler execution error.
   */
  onHandlerError(trigger_id, error, event) {
    this.eventsFailed++;
    const current = this.triggerErrorCounts.get(trigger_id) ?? 0;
    this.triggerErrorCounts.set(trigger_id, current + 1);
    logger29.warn("Handler error recorded", {
      trigger_id,
      event_type: event.type,
      error: error.message
    });
  }
  /**
   * Record a queue depth change.
   */
  onQueueDepthChange(depth) {
    this.currentQueueDepth = depth;
  }
  /**
   * Record a trigger fire.
   */
  onTriggerFired(trigger_id, event) {
    this.triggersFired++;
    const current = this.triggerFireCounts.get(trigger_id) ?? 0;
    this.triggerFireCounts.set(trigger_id, current + 1);
    logger29.debug("Trigger fired", { trigger_id, event_type: event.type });
  }
  /**
   * Record an event moved to the dead-letter queue.
   */
  onEventDeadLettered(event, reason) {
    this.eventsDeadLettered++;
    logger29.warn("Event dead-lettered", { event_id: event.id, type: event.type, reason });
  }
  /**
   * Generate a current stats snapshot.
   */
  getStats() {
    return {
      events_processed: this.eventsProcessed,
      events_failed: this.eventsFailed,
      events_dead_lettered: this.eventsDeadLettered,
      avg_latency_ms: Math.round(this.latency.average() * 100) / 100,
      queue_depth: this.currentQueueDepth,
      active_chains: this.currentActiveChains,
      active_workflows: this.currentActiveWorkflows,
      triggers_fired: this.triggersFired
    };
  }
  /**
   * Update the count of active event chains.
   */
  setActiveChains(count) {
    this.currentActiveChains = count;
  }
  /**
   * Update the count of active workflows.
   */
  setActiveWorkflows(count) {
    this.currentActiveWorkflows = count;
  }
  /**
   * Get the fire count for a specific trigger.
   */
  getTriggerFireCount(trigger_id) {
    return this.triggerFireCounts.get(trigger_id) ?? 0;
  }
  /**
   * Get the error count for a specific trigger.
   */
  getTriggerErrorCount(trigger_id) {
    return this.triggerErrorCounts.get(trigger_id) ?? 0;
  }
  /**
   * Get the processed count for a specific event type.
   */
  getEventTypeCount(type) {
    return this.eventTypeCounts.get(type) ?? 0;
  }
  /**
   * Maximum observed chain depth.
   */
  maxChainDepth() {
    return this.chainDepth.max();
  }
  /**
   * Average observed chain depth.
   */
  avgChainDepth() {
    return this.chainDepth.average();
  }
  /**
   * Reset all counters and rolling windows.
   */
  reset() {
    this.eventsProcessed = 0;
    this.eventsFailed = 0;
    this.eventsDeadLettered = 0;
    this.triggersFired = 0;
    this.currentQueueDepth = 0;
    this.currentActiveChains = 0;
    this.currentActiveWorkflows = 0;
    this.latency.reset();
    this.chainDepth.reset();
    this.triggerFireCounts.clear();
    this.triggerErrorCounts.clear();
    this.eventTypeCounts.clear();
    logger29.debug("Metrics reset");
  }
};

// src/core/runtime.ts
function createCoreRuntime(actionExecutor, triggerRegistry) {
  const eventQueue = new EventQueue();
  const stateStore = new CoreStateStore();
  const registry = triggerRegistry ?? {
    match: /* @__PURE__ */ __name(() => [], "match"),
    recordFire: /* @__PURE__ */ __name(() => void 0, "recordFire"),
    register: /* @__PURE__ */ __name(() => void 0, "register"),
    unregister: /* @__PURE__ */ __name(() => false, "unregister"),
    enable: /* @__PURE__ */ __name(() => void 0, "enable"),
    disable: /* @__PURE__ */ __name(() => void 0, "disable"),
    get: /* @__PURE__ */ __name(() => void 0, "get")
  };
  const lifecycle = new LoopLifecycleManager();
  const metrics = new EventMetrics();
  const deadLetter = new DeadLetterQueue();
  const errorHandler = new ErrorHandler({ deadLetter });
  const eventProcessor = new EventProcessor(
    eventQueue,
    registry,
    stateStore,
    lifecycle,
    metrics,
    errorHandler,
    deadLetter,
    { action_executor: actionExecutor }
  );
  return { eventQueue, triggerRegistry: registry, stateStore, eventProcessor };
}
__name(createCoreRuntime, "createCoreRuntime");

// src/extensions/triggers/factories.ts
function createWRFCTrigger(params) {
  if (params.score_threshold !== void 0 && (params.score_threshold < 0 || params.score_threshold > 10)) {
    throw new RangeError(`score_threshold must be between 0 and 10, got ${params.score_threshold}`);
  }
  const base = createTrigger({
    id: params.id,
    event_match: params.event_match,
    actions: params.actions,
    conditions: params.conditions,
    max_fires: params.max_fires,
    cooldown_ms: params.cooldown_ms,
    chain_depth_limit: params.chain_depth_limit,
    retry: params.retry,
    enabled: params.enabled ?? true,
    priority: params.priority
  });
  return {
    ...base,
    trigger_type: "wrfc",
    ...params.score_threshold !== void 0 && { score_threshold: params.score_threshold },
    ...params.max_fix_attempts !== void 0 && { max_fix_attempts: params.max_fix_attempts },
    ...params.workflow_state_filter !== void 0 && { workflow_state_filter: params.workflow_state_filter }
  };
}
__name(createWRFCTrigger, "createWRFCTrigger");

// src/plugins/wrfc/constants.ts
var ENGINEER_AGENT_TYPES = /* @__PURE__ */ new Set([
  "engineer",
  "goodvibes:engineer",
  "goodvibes:tester",
  "goodvibes:integrator-ai",
  "goodvibes:integrator-services",
  "goodvibes:integrator-state"
]);
var REVIEWER_AGENT_TYPES = /* @__PURE__ */ new Set(["reviewer", "goodvibes:reviewer"]);
var AUTO_COMPLETE_AGENT_TYPES = /* @__PURE__ */ new Set([
  "Explore",
  "explore",
  "Plan",
  "plan",
  "Bash",
  "bash",
  "general-purpose",
  "goodvibes:architect",
  "goodvibes:planner",
  "goodvibes:deployer",
  ...REVIEWER_AGENT_TYPES
]);
function matchesAgentType(agentType, typeSet) {
  if (!agentType) return false;
  if (typeSet.has(agentType)) return true;
  const lower = agentType.toLowerCase();
  for (const entry of typeSet) {
    if (entry.toLowerCase() === lower) return true;
  }
  return false;
}
__name(matchesAgentType, "matchesAgentType");
var REQUIRE_REVIEW_AGENT_TYPES = /* @__PURE__ */ new Set([...ENGINEER_AGENT_TYPES]);
var DEFAULT_MIN_REVIEW_SCORE = 9.5;
var EARLY_WORKFLOW_STATES = /* @__PURE__ */ new Set(["IDLE", "GATHERING", "PLANNING"]);

// src/shared/events.ts
function createEvent(overrides) {
  return {
    id: generateEventId(),
    timestamp: Date.now(),
    priority: 0,
    ...overrides,
    metadata: {
      version: 1,
      session_id: "",
      sequence: 0,
      ...overrides.metadata
    }
  };
}
__name(createEvent, "createEvent");

// src/plugins/wrfc/score-evaluator.ts
function extractScore(text) {
  if (!text) return null;
  const result = parseGvTag(text);
  if (result.found && result.data?.score !== void 0) {
    return Math.max(0, Math.min(10, result.data.score));
  }
  const SCORE_REGEX = /SCORE:\s*(\d+(?:\.\d+)?)\/10/i;
  const match = text.match(SCORE_REGEX);
  return match ? parseFloat(match[1]) : null;
}
__name(extractScore, "extractScore");

// src/plugins/wrfc/directive-builder.ts
function buildSpawnAction(params) {
  const context = {
    workflow_id: params.wid,
    ...params.files && params.files.length > 0 && { files_modified: params.files }
  };
  const content = buildSpawnDirectiveMessage(params.type, params.task, context);
  return {
    type: "send_message",
    params: { content, priority: 20, target: "subagent_stop", agent_type: params.type }
  };
}
__name(buildSpawnAction, "buildSpawnAction");
function buildCompleteAction(wid) {
  const content = buildWorkflowCompleteMessage(wid);
  return {
    type: "send_message",
    params: { content, priority: 20, target: "subagent_stop" }
  };
}
__name(buildCompleteAction, "buildCompleteAction");
function buildEscalateAction(wid, reason, params) {
  let fixAttempts;
  let lastScore;
  if (params !== void 0) {
    fixAttempts = params.fix_attempts ?? 0;
    lastScore = params.last_score ?? 0;
  } else {
    const fixMatch = reason.match(/(\d+)\s+fix/i);
    const scoreMatch = reason.match(/score[:\s]*(\d+(?:\.\d+)?)\/10/i);
    fixAttempts = fixMatch ? parseInt(fixMatch[1], 10) : 0;
    lastScore = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
  }
  const content = buildEscalationMessage(wid, fixAttempts, lastScore);
  return {
    type: "send_message",
    params: { content, priority: 30, target: "subagent_stop" }
  };
}
__name(buildEscalateAction, "buildEscalateAction");

// src/plugins/wrfc/handlers.ts
var log6 = createLogger("wrfc-plugin:handlers");
var FALLBACK_NO_REVIEW_OUTPUT = "No review output captured.";
var FALLBACK_SEE_PAYLOAD = "See the wrfc:review_completed event payload for review details.";
var DEFAULT_MAX_FIX_ATTEMPTS = 3;
var _cachedRequireReviewTypes = null;
var _cachedConfigSnapshot = "";
function getEffectiveRequireReviewTypes(store) {
  const configTypes = storeGet(store, "wrfc.config.require_review_types", []);
  if (configTypes.length === 0) {
    return REQUIRE_REVIEW_AGENT_TYPES;
  }
  const snapshot = configTypes.join(",");
  if (_cachedRequireReviewTypes && snapshot === _cachedConfigSnapshot) {
    return _cachedRequireReviewTypes;
  }
  _cachedRequireReviewTypes = /* @__PURE__ */ new Set([...REQUIRE_REVIEW_AGENT_TYPES, ...configTypes]);
  _cachedConfigSnapshot = snapshot;
  return _cachedRequireReviewTypes;
}
__name(getEffectiveRequireReviewTypes, "getEffectiveRequireReviewTypes");
var WS = /* @__PURE__ */ __name((sid, wid, field) => `wrfc.sessions.${sid}.workflows.${wid}.${field}`, "WS");
var AM = /* @__PURE__ */ __name((sid, agentId) => `wrfc.sessions.${sid}.agent_map.${agentId}`, "AM");
function eventSessionId(event) {
  const sid = event.metadata?.["session_id"];
  if (!sid || sid.length === 0) {
    log6.warn("eventSessionId: missing session_id in event metadata, using default", {
      event_type: event.type,
      event_id: event.id
    });
    return "default";
  }
  return sid;
}
__name(eventSessionId, "eventSessionId");
function storeGet(store, key, defaultVal) {
  const val = store.get(key);
  return val !== null ? val : defaultVal;
}
__name(storeGet, "storeGet");
function makeChainEvent(type, wid, parentEvent) {
  return createEvent({
    source: { kind: "internal" },
    type,
    payload: { type, data: { workflow_id: wid } },
    priority: 70,
    context: {
      workflow_id: wid,
      parent_event_id: parentEvent.id,
      chain_depth: (parentEvent.context?.chain_depth ?? 0) + 1
    }
  });
}
__name(makeChainEvent, "makeChainEvent");
function phaseUpdate(sid, wid, phase) {
  return [{ key: WS(sid, wid, "phase"), value: phase, op: "set" }];
}
__name(phaseUpdate, "phaseUpdate");
function handleWorkflowCreated(event, _trigger, store) {
  const payload = event.payload;
  const data = typeof payload["data"] === "object" && payload["data"] !== null ? payload["data"] : payload;
  const agentId = typeof data["agent_id"] === "string" ? data["agent_id"] : null;
  if (!agentId) {
    log6.debug("handleWorkflowCreated: no agent_id in payload, skipping");
    return {};
  }
  const sid = eventSessionId(event);
  const agentType = typeof data["agent_type"] === "string" ? data["agent_type"] : "";
  const incomingWid = typeof data["workflow_id"] === "string" && data["workflow_id"].length > 0 ? data["workflow_id"] : null;
  const task = typeof data["task"] === "string" ? data["task"] : "";
  if (!incomingWid && agentType && matchesAgentType(agentType, AUTO_COMPLETE_AGENT_TYPES)) {
    log6.debug("handleWorkflowCreated: skipping auto-complete agent type", { agent_type: agentType });
    return {};
  }
  let wid;
  if (incomingWid) {
    wid = incomingWid;
  } else {
    const effectiveRequireReview = getEffectiveRequireReviewTypes(store);
    if (!agentType) {
      log6.warn("handleWorkflowCreated: agent_type is empty/missing, cannot determine if review is required", { agent_id: agentId });
    }
    if (agentType && matchesAgentType(agentType, effectiveRequireReview)) {
      wid = `wrfc_auto_${Date.now()}_${agentId.slice(0, 8)}_${Math.random().toString(36).slice(2, 6)}`;
      log6.info("handleWorkflowCreated: auto-creating workflow for require-review agent type", {
        wid,
        agent_id: agentId,
        agent_type: agentType
      });
    } else {
      wid = `wrfc_${agentId}`;
    }
  }
  const state_updates = [
    { key: AM(sid, agentId), value: wid, op: "set" }
  ];
  if (!incomingWid) {
    const minScore = storeGet(store, "wrfc.config.min_review_score", DEFAULT_MIN_REVIEW_SCORE);
    const maxFix = storeGet(store, "wrfc.config.max_fix_attempts", DEFAULT_MAX_FIX_ATTEMPTS);
    state_updates.push(
      { key: WS(sid, wid, "phase"), value: "WRITING", op: "set" },
      { key: WS(sid, wid, "agent_id"), value: agentId, op: "set" },
      { key: WS(sid, wid, "agent_type"), value: agentType, op: "set" },
      { key: WS(sid, wid, "task"), value: task, op: "set" },
      { key: WS(sid, wid, "min_review_score"), value: minScore, op: "set" },
      { key: WS(sid, wid, "max_fix_attempts"), value: maxFix, op: "set" },
      { key: WS(sid, wid, "fix_attempts"), value: 0, op: "set" },
      { key: WS(sid, wid, "files_modified"), value: [], op: "set" }
    );
    log6.info("handleWorkflowCreated: initialised workflow", { wid, agent_id: agentId, agent_type: agentType });
  } else {
    log6.info("handleWorkflowCreated: bound chain agent to existing workflow", { wid, agent_id: agentId });
  }
  return { state_updates };
}
__name(handleWorkflowCreated, "handleWorkflowCreated");
function handleAgentCompleted(event, _trigger, store) {
  const payload = event.payload;
  const dataPayload = typeof payload["data"] === "object" && payload["data"] !== null ? payload["data"] : null;
  const hookInputForId = payload["hook_input"];
  const agentId = (typeof payload["agent_id"] === "string" ? payload["agent_id"] : null) ?? (typeof dataPayload?.["agent_id"] === "string" ? dataPayload["agent_id"] : null) ?? (typeof hookInputForId?.["agent_id"] === "string" ? hookInputForId["agent_id"] : null);
  const hookInput = typeof payload["hook_input"] === "object" && payload["hook_input"] !== null ? payload["hook_input"] : payload;
  const agentType = hookInput["agent_type"] ?? hookInput["subagent_type"] ?? (typeof dataPayload?.["agent_type"] === "string" ? dataPayload["agent_type"] : null) ?? (typeof dataPayload?.["subagent_type"] === "string" ? dataPayload["subagent_type"] : null) ?? "";
  const agentOutput = hookInput["last_assistant_message"] ?? hookInput["task_output"] ?? hookInput["result"] ?? (typeof dataPayload?.["last_assistant_message"] === "string" ? dataPayload["last_assistant_message"] : null) ?? (typeof dataPayload?.["task_output"] === "string" ? dataPayload["task_output"] : null) ?? (typeof dataPayload?.["result"] === "string" ? dataPayload["result"] : null) ?? (typeof dataPayload?.["output"] === "string" ? dataPayload["output"] : null) ?? void 0;
  const sid = eventSessionId(event);
  let wid = agentId ? storeGet(store, AM(sid, agentId), null) : null;
  if (!wid) {
    wid = typeof payload["workflow_id"] === "string" ? payload["workflow_id"] : null;
  }
  if (!wid) {
    wid = typeof dataPayload?.["workflow_id"] === "string" ? dataPayload["workflow_id"] : null;
  }
  if (!wid) {
    const isExpectedInWorkflow = agentType && (matchesAgentType(agentType, REQUIRE_REVIEW_AGENT_TYPES) || matchesAgentType(agentType, ENGINEER_AGENT_TYPES) || matchesAgentType(agentType, REVIEWER_AGENT_TYPES));
    if (isExpectedInWorkflow) {
      log6.warn("handleAgentCompleted: no workflow binding found for expected agent type", {
        agent_id: agentId,
        agent_type: agentType
      });
    } else {
      log6.debug("handleAgentCompleted: no workflow binding found, skipping", { agent_id: agentId });
    }
    return {};
  }
  const phase = storeGet(store, WS(sid, wid, "phase"), "WRITING").toUpperCase();
  const minScore = storeGet(store, WS(sid, wid, "min_review_score"), DEFAULT_MIN_REVIEW_SCORE);
  const maxFix = storeGet(store, WS(sid, wid, "max_fix_attempts"), DEFAULT_MAX_FIX_ATTEMPTS);
  const fixAttempts = storeGet(store, WS(sid, wid, "fix_attempts"), 0);
  const filesModified = storeGet(store, WS(sid, wid, "files_modified"), []);
  const effectivePhase = EARLY_WORKFLOW_STATES.has(phase) ? "WRITING" : phase;
  if (EARLY_WORKFLOW_STATES.has(phase)) {
    log6.warn("handleAgentCompleted: workflow stuck in early state, treating as WRITING", {
      wid,
      actual_phase: phase
    });
  }
  if (effectivePhase === "WRITING") {
    const effectiveRequireReview = getEffectiveRequireReviewTypes(store);
    if (!agentType) {
      log6.warn("handleAgentCompleted: agent_type is empty/missing, cannot determine if review is required", { wid, agent_id: agentId });
    }
    if (agentType && matchesAgentType(agentType, effectiveRequireReview)) {
      const task2 = `[WRFC:${wid}] Review the work completed in workflow ${wid}. Minimum score: ${minScore}. ` + (filesModified.length > 0 ? `Files modified: ${filesModified.join(", ")}.` : "No files recorded yet.");
      const actions2 = [buildSpawnAction({ wid, type: "reviewer", task: task2, files: filesModified })];
      const state_updates2 = phaseUpdate(sid, wid, "REVIEWING");
      const events2 = [makeChainEvent("wrfc:review_started", wid, event)];
      log6.info("handleAgentCompleted: force-review for require-review agent type", {
        wid,
        agent_type: agentType
      });
      return { actions: actions2, state_updates: state_updates2, events: events2 };
    }
    if (agentType && matchesAgentType(agentType, AUTO_COMPLETE_AGENT_TYPES)) {
      const actions2 = [buildCompleteAction(wid)];
      const state_updates2 = [
        ...phaseUpdate(sid, wid, "COMPLETED"),
        { key: AM(sid, agentId), value: null, op: "delete" }
      ];
      log6.info("handleAgentCompleted: auto-complete (whitelisted agent type)", {
        wid,
        agent_type: agentType
      });
      return { actions: actions2, state_updates: state_updates2 };
    }
    const task = `[WRFC:${wid}] Review the work completed in workflow ${wid}. Minimum score: ${minScore}. ` + (filesModified.length > 0 ? `Files modified: ${filesModified.join(", ")}.` : "No files recorded yet.");
    const actions = [buildSpawnAction({ wid, type: "reviewer", task, files: filesModified })];
    const state_updates = phaseUpdate(sid, wid, "REVIEWING");
    const events = [makeChainEvent("wrfc:review_started", wid, event)];
    log6.info("handleAgentCompleted: spawning reviewer, advancing to REVIEWING", { wid });
    return { actions, state_updates, events };
  }
  if (effectivePhase === "REVIEWING") {
    if (!matchesAgentType(agentType, REVIEWER_AGENT_TYPES)) {
      log6.debug("handleAgentCompleted: REVIEWING phase but not a reviewer, skipping", {
        wid,
        agent_type: agentType
      });
      return {};
    }
    const score = extractScore(agentOutput);
    if (score === null) {
      log6.warn("handleAgentCompleted: could not parse review score", {
        wid,
        output_preview: agentOutput?.slice(0, MAX_OUTPUT_PREVIEW_LENGTH)
      });
      const errorEvent = createEvent({
        source: { kind: "internal" },
        type: "wrfc:review_parse_failed",
        payload: { type: "wrfc:review_parse_failed", data: {
          workflow_id: wid,
          agent_id: agentId,
          output_preview: agentOutput?.slice(0, MAX_OUTPUT_PREVIEW_LENGTH) ?? null,
          attempt_count: fixAttempts
        } },
        priority: 80,
        context: { workflow_id: wid }
      });
      const state_updates = phaseUpdate(sid, wid, "ESCALATED");
      const actions = [buildEscalateAction(wid, `review score parse failed after ${fixAttempts} attempts`)];
      return { state_updates, actions, events: [errorEvent] };
    }
    if (score >= minScore) {
      const actions = [buildCompleteAction(wid)];
      const state_updates = [
        ...phaseUpdate(sid, wid, "COMPLETED"),
        { key: WS(sid, wid, "review_score"), value: score, op: "set" },
        { key: AM(sid, agentId), value: null, op: "delete" }
      ];
      const events = [makeChainEvent("wrfc:review_completed", wid, event)];
      log6.info("handleAgentCompleted: review passed, completing workflow", {
        wid,
        score,
        threshold: minScore
      });
      return { actions, state_updates, events };
    } else {
      const issuesSummary = agentOutput?.trim() || FALLBACK_NO_REVIEW_OUTPUT;
      const task = `[WRFC:${wid}] Fix the issues identified in the code review for workflow ${wid}. Review score: ${score}/10 (threshold: ${minScore}). Issues:
${issuesSummary}` + (filesModified.length > 0 ? `
Files: ${filesModified.join(", ")}.` : "");
      const actions = [buildSpawnAction({ wid, type: "engineer", task, files: filesModified })];
      const state_updates = [
        ...phaseUpdate(sid, wid, "FIXING"),
        { key: WS(sid, wid, "review_score"), value: score, op: "set" }
      ];
      log6.info("handleAgentCompleted: review failed, spawning fixer", {
        wid,
        score,
        threshold: minScore
      });
      return { actions, state_updates };
    }
  }
  if (effectivePhase === "FIXING") {
    if (!matchesAgentType(agentType, ENGINEER_AGENT_TYPES)) {
      log6.debug("handleAgentCompleted: FIXING phase but not an engineer, skipping", {
        wid,
        agent_type: agentType
      });
      return {};
    }
    const engineerFiles = extractFiles(agentOutput);
    const mergedFiles = engineerFiles.length > 0 ? [.../* @__PURE__ */ new Set([...filesModified, ...engineerFiles])] : filesModified;
    const newFixAttempts = fixAttempts + 1;
    if (newFixAttempts >= maxFix) {
      const lastScore = storeGet(store, WS(sid, wid, "review_score"), 0);
      const reason = `${newFixAttempts} fix attempts failed, last score ${lastScore}/10`;
      const actions = [buildEscalateAction(wid, reason)];
      const state_updates = [
        ...phaseUpdate(sid, wid, "ESCALATED"),
        { key: WS(sid, wid, "fix_attempts"), value: newFixAttempts, op: "set" },
        { key: WS(sid, wid, "files_modified"), value: mergedFiles, op: "set" },
        { key: AM(sid, agentId), value: null, op: "delete" }
      ];
      log6.warn("handleAgentCompleted: fix budget exhausted, escalating", {
        wid,
        fix_attempts: newFixAttempts,
        max_fix: maxFix
      });
      return { actions, state_updates };
    } else {
      const task = `[WRFC:${wid}] Re-review the code after fix attempt ${newFixAttempts} of ${maxFix} for workflow ${wid}. Minimum score: ${minScore}. ` + (mergedFiles.length > 0 ? `Files modified: ${mergedFiles.join(", ")}.` : "Check all recently modified files.");
      const actions = [buildSpawnAction({ wid, type: "reviewer", task, files: mergedFiles })];
      const state_updates = [
        ...phaseUpdate(sid, wid, "REVIEWING"),
        { key: WS(sid, wid, "fix_attempts"), value: newFixAttempts, op: "set" },
        { key: WS(sid, wid, "files_modified"), value: mergedFiles, op: "set" }
      ];
      const events = [makeChainEvent("wrfc:fix_completed", wid, event)];
      log6.info("handleAgentCompleted: fix complete, re-reviewing", {
        wid,
        fix_attempts: newFixAttempts,
        max_fix: maxFix
      });
      return { actions, state_updates, events };
    }
  }
  log6.debug("handleAgentCompleted: unhandled phase", { wid, phase: effectivePhase });
  return {};
}
__name(handleAgentCompleted, "handleAgentCompleted");
function handleQualityGate(event, _trigger, store) {
  const payload = event.payload;
  const wid = typeof payload["workflow_id"] === "string" ? payload["workflow_id"] : null;
  if (!wid) {
    log6.debug("handleQualityGate: no workflow_id in payload, skipping");
    return {};
  }
  const sid = eventSessionId(event);
  const rawScore = payload["review_score"];
  const score = typeof rawScore === "number" ? rawScore : parseFloat(String(rawScore ?? ""));
  if (isNaN(score)) {
    log6.warn("handleQualityGate: invalid review_score", { wid, raw: rawScore });
    return {};
  }
  const phase = storeGet(store, WS(sid, wid, "phase"), "");
  if (phase === "COMPLETED" || phase === "ESCALATED") {
    log6.debug("handleQualityGate: workflow already terminal, skipping", { wid, phase });
    return {};
  }
  const minScore = storeGet(store, WS(sid, wid, "min_review_score"), DEFAULT_MIN_REVIEW_SCORE);
  const fixAttempts = storeGet(store, WS(sid, wid, "fix_attempts"), 0);
  const maxFix = storeGet(store, WS(sid, wid, "max_fix_attempts"), DEFAULT_MAX_FIX_ATTEMPTS);
  const filesModified = storeGet(store, WS(sid, wid, "files_modified"), []);
  const state_updates = [
    { key: WS(sid, wid, "review_score"), value: score, op: "set" }
  ];
  if (score >= minScore) {
    const actions2 = [buildCompleteAction(wid)];
    state_updates.push(...phaseUpdate(sid, wid, "COMPLETED"));
    log6.info("handleQualityGate: quality gate passed", { wid, score, threshold: minScore });
    return { actions: actions2, state_updates };
  }
  const newFixAttempts = fixAttempts + 1;
  state_updates.push({ key: WS(sid, wid, "fix_attempts"), value: newFixAttempts, op: "set" });
  if (newFixAttempts >= maxFix) {
    const reason = `${newFixAttempts} fix attempts failed, last score ${score}/10`;
    const actions2 = [buildEscalateAction(wid, reason)];
    state_updates.push(...phaseUpdate(sid, wid, "ESCALATED"));
    log6.warn("handleQualityGate: fix budget exhausted, escalating", { wid, fix_attempts: newFixAttempts });
    return { actions: actions2, state_updates };
  }
  const rawIssues = payload["issues"];
  const issuesSummary = typeof rawIssues === "string" && rawIssues.trim().length > 0 ? rawIssues.trim() : FALLBACK_SEE_PAYLOAD;
  const task = `[WRFC:${wid}] Fix the issues identified in the code review for workflow ${wid}. Review score: ${score}/10 (threshold: ${minScore}). Issues:
${issuesSummary}` + (filesModified.length > 0 ? `
Files: ${filesModified.join(", ")}.` : "");
  const actions = [buildSpawnAction({ wid, type: "engineer", task, files: filesModified })];
  state_updates.push(...phaseUpdate(sid, wid, "FIXING"));
  const events = [makeChainEvent("wrfc:fix_started", wid, event)];
  log6.info("handleQualityGate: quality gate failed, spawning fixer", {
    wid,
    score,
    threshold: minScore,
    fix_attempts: newFixAttempts
  });
  return { actions, state_updates, events };
}
__name(handleQualityGate, "handleQualityGate");
var HANDLER_IDS = {
  WORKFLOW_CREATED: "wrfc_plugin:workflow_created",
  AGENT_COMPLETED: "wrfc_plugin:agent_completed",
  QUALITY_GATE: "wrfc_plugin:quality_gate"
};
var TRIGGER_IDS = {
  AGENT_SPAWNED: "wrfc_plugin:trigger:agent_spawned",
  AGENT_COMPLETED: "wrfc_plugin:trigger:agent_completed",
  REVIEW_COMPLETED: "wrfc_plugin:trigger:review_completed"
};

// src/plugins/wrfc/workflows.ts
var COND_SCORE_PASSES = [
  { type: "expression", expression: "context.review_score >= context.min_review_score" }
];
var COND_SCORE_FAILS = [
  { type: "expression", expression: "context.review_score < context.min_review_score" }
];
var COND_TESTS_PASSED = [
  { type: "expression", expression: "context.tests_passed === true" }
];
var COND_TESTS_FAILED = [
  { type: "expression", expression: "context.tests_passed === false" }
];
var COND_VERIFICATION_PASSED = [
  { type: "expression", expression: "context.verification_result.passed === true" }
];
var COND_VERIFICATION_FAILED = [
  { type: "expression", expression: "context.verification_result.passed === false" }
];
function getWRFCWorkflowDefinitions() {
  return [
    {
      id: "wrfc_loop",
      name: "WRFC Loop",
      description: "Write-Review-Fix-Confirm quality loop: agents write code, reviewers score it, fixers address issues until the score threshold is met.",
      states: ["idle", "writing", "reviewing", "fixing", "completed", "failed", "escalated"],
      initial_state: "idle",
      transitions: [
        { from: "idle", to: "writing", event_type: "workflow:created" },
        { from: "writing", to: "reviewing", event_type: "agent:completed" },
        { from: "reviewing", to: "completed", event_type: "wrfc:review_completed", conditions: COND_SCORE_PASSES },
        { from: "reviewing", to: "fixing", event_type: "wrfc:review_completed", conditions: COND_SCORE_FAILS },
        { from: "fixing", to: "reviewing", event_type: "agent:completed" },
        { from: "fixing", to: "escalated", event_type: "wrfc:max_attempts_reached" },
        { from: "reviewing", to: "escalated", event_type: "wrfc:max_attempts_reached" }
      ]
    },
    {
      id: "fix_loop",
      name: "Fix Loop",
      description: "Diagnose-fix-verify loop: identifies issues, applies fixes, and verifies resolution.",
      states: ["idle", "diagnosing", "fixing", "verifying", "completed", "failed"],
      initial_state: "idle",
      transitions: [
        { from: "idle", to: "diagnosing", event_type: "workflow:created" },
        { from: "diagnosing", to: "fixing", event_type: "agent:completed" },
        { from: "fixing", to: "verifying", event_type: "agent:completed" },
        { from: "verifying", to: "completed", event_type: "agent:completed", conditions: COND_VERIFICATION_PASSED },
        { from: "verifying", to: "fixing", event_type: "agent:completed", conditions: COND_VERIFICATION_FAILED }
      ]
    },
    {
      id: "test_then_fix",
      name: "Test Then Fix",
      description: "Run tests and automatically fix failures.",
      states: ["idle", "testing", "fixing", "completed", "failed"],
      initial_state: "idle",
      transitions: [
        { from: "idle", to: "completed", event_type: "agent:completed", conditions: COND_TESTS_PASSED },
        { from: "idle", to: "testing", event_type: "workflow:created" },
        { from: "testing", to: "completed", event_type: "agent:completed", conditions: COND_TESTS_PASSED },
        { from: "testing", to: "fixing", event_type: "agent:completed", conditions: COND_TESTS_FAILED },
        { from: "fixing", to: "testing", event_type: "agent:completed" }
      ]
    },
    {
      id: "review_only",
      name: "Review Only",
      description: "Single-pass review without a fix loop.",
      states: ["idle", "reviewing", "completed", "failed"],
      initial_state: "idle",
      transitions: [
        { from: "idle", to: "reviewing", event_type: "workflow:created" },
        { from: "reviewing", to: "completed", event_type: "wrfc:review_completed" }
      ]
    }
  ];
}
__name(getWRFCWorkflowDefinitions, "getWRFCWorkflowDefinitions");

// src/plugins/wrfc/triggers.ts
function getWRFCTriggerDefinitions() {
  return [
    {
      id: "wrfc_agent_spawned",
      name: "wrfc_agent_spawned",
      description: "Initialise WRFC workflow state when a new agent is spawned",
      event_type: "agent:spawned",
      conditions: [{ source: ["agent", "internal"] }],
      actions: [],
      enabled: true,
      max_fires: 500
    },
    {
      id: "wrfc_agent_completed",
      name: "wrfc_agent_completed",
      description: "Route agent to review, fix, or complete when it finishes",
      event_type: "agent:completed",
      conditions: [{ source: ["agent", "internal"] }],
      actions: [],
      enabled: true,
      max_fires: 500
    },
    {
      id: "wrfc_review_completed",
      name: "wrfc_review_completed",
      description: "Quality gate evaluation when a review completes (event-driven path)",
      event_type: "wrfc:review_completed",
      conditions: [{ source: ["internal"] }],
      actions: [],
      enabled: true,
      max_fires: 500
    }
  ];
}
__name(getWRFCTriggerDefinitions, "getWRFCTriggerDefinitions");

// src/plugins/wrfc/wrfc-plugin.ts
var log7 = createLogger("wrfc-plugin");
function getDefaultWRFCConfig() {
  return {
    score_threshold: 9.5,
    max_fix_attempts: 3,
    enable_quality_gates: true
  };
}
__name(getDefaultWRFCConfig, "getDefaultWRFCConfig");
function makeStoreAdapter(services) {
  return {
    get(key) {
      const val = services.getState(key);
      return val !== void 0 && val !== null ? val : null;
    },
    set(key, value) {
      services.setState(key, value);
    },
    delete(key) {
      services.deleteState(key);
    },
    merge(_key, _value) {
    },
    snapshot() {
      return {};
    },
    restore(_snapshot) {
    },
    keys(prefix) {
      return services.listStateKeys(prefix);
    },
    onStateChange(_listener) {
    }
  };
}
__name(makeStoreAdapter, "makeStoreAdapter");
var WRFCPlugin = class {
  static {
    __name(this, "WRFCPlugin");
  }
  name = "wrfc";
  version = "1.0.0";
  state = "registered";
  config;
  /**
   * Captured event handlers, populated during register().
   * Returned by getHandlers() so callers can inspect registered handlers.
   */
  _handlers = [];
  constructor(config) {
    this.config = { ...getDefaultWRFCConfig(), ...config };
  }
  /**
   * Register plugin with runtime services.
   *
   * This is the canonical registration path. It:
   *   1. Seeds WRFC config into the state store via services.
   *   2. Registers the three WRFC triggers via services.registerTrigger().
   *   3. Wires the three event handlers via services.registerTrigger().
   *   4. Captures handler references for getHandlers().
   *
   * After this call, start() only transitions lifecycle state to 'running'.
   */
  register(services) {
    const store = makeStoreAdapter(services);
    store.set("wrfc.config.min_review_score", this.config.score_threshold);
    store.set("wrfc.config.max_fix_attempts", this.config.max_fix_attempts);
    store.set("wrfc.config.enable_quality_gates", this.config.enable_quality_gates);
    if (this.config.require_review_types && this.config.require_review_types.length > 0) {
      store.set("wrfc.config.require_review_types", this.config.require_review_types);
    }
    const nullTrigger = {};
    const workflowCreatedHandler = /* @__PURE__ */ __name((event) => Promise.resolve(handleWorkflowCreated(event, nullTrigger, store)), "workflowCreatedHandler");
    const agentCompletedHandler = /* @__PURE__ */ __name((event) => Promise.resolve(handleAgentCompleted(event, nullTrigger, store)), "agentCompletedHandler");
    const qualityGateHandler = /* @__PURE__ */ __name((event) => Promise.resolve(handleQualityGate(event, nullTrigger, store)), "qualityGateHandler");
    services.registerTrigger(
      TRIGGER_IDS.AGENT_SPAWNED,
      {
        id: TRIGGER_IDS.AGENT_SPAWNED,
        name: "wrfc_agent_spawned",
        description: "Initialise WRFC workflow state when a new agent is spawned",
        event_type: "agent:spawned",
        conditions: [{ source: ["agent", "internal"] }],
        actions: [],
        enabled: true,
        max_fires: 500
      },
      workflowCreatedHandler
    );
    services.registerTrigger(
      TRIGGER_IDS.AGENT_COMPLETED,
      {
        id: TRIGGER_IDS.AGENT_COMPLETED,
        name: "wrfc_agent_completed",
        description: "Route agent to review, fix, or complete when it finishes",
        event_type: "agent:completed",
        conditions: [{ source: ["agent", "internal"] }],
        actions: [],
        enabled: true,
        max_fires: 500
      },
      agentCompletedHandler
    );
    services.registerTrigger(
      TRIGGER_IDS.REVIEW_COMPLETED,
      {
        id: TRIGGER_IDS.REVIEW_COMPLETED,
        name: "wrfc_review_completed",
        description: "Quality gate evaluation when a review completes (event-driven path)",
        event_type: "wrfc:review_completed",
        conditions: [{ source: ["internal"] }],
        actions: [],
        enabled: true,
        max_fires: 500
      },
      qualityGateHandler
    );
    this._handlers = [
      {
        event_type: "agent:spawned",
        handler: workflowCreatedHandler,
        priority: 10
      },
      {
        event_type: "agent:completed",
        handler: agentCompletedHandler,
        priority: 10
      },
      {
        event_type: "wrfc:review_completed",
        handler: qualityGateHandler,
        priority: 10
      }
    ];
    this.state = "starting";
    log7.debug("WRFCPlugin registered with runtime services", {
      triggers: Object.values(TRIGGER_IDS),
      handlers: Object.values(HANDLER_IDS),
      config: this.config
    });
  }
  /**
   * Start the plugin.
   * All registration was performed in register(). This only advances the
   * lifecycle state to 'running'.
   */
  start() {
    if (this._handlers.length === 0) {
      throw new Error("WRFCPlugin: register() must be called before start()");
    }
    this.state = "running";
    log7.info("WRFCPlugin started", { config: this.config });
  }
  /** Stop the plugin and clean up. */
  stop() {
    this.state = "stopped";
    this._handlers = [];
    log7.debug("WRFCPlugin stopped");
  }
  /** Returns WRFC workflow definition metadata for plugin registration. */
  getWorkflowDefinitions() {
    return getWRFCWorkflowDefinitions();
  }
  /** Returns WRFC trigger definitions for plugin registration. */
  getTriggerDefinitions() {
    return getWRFCTriggerDefinitions();
  }
  /**
   * Returns the three WRFC event handler registrations.
   *
   * Handlers are captured during register() as closures over the state store
   * adapter. Returns an empty array before register() is called.
   */
  getHandlers() {
    return [...this._handlers];
  }
};

// src/extensions/events/factories.ts
var hookTypeSlugMap = {
  PreToolUse: "pre_tool_use",
  PostToolUse: "post_tool_use",
  PostToolUseFailure: "post_tool_use_failure",
  SubagentStart: "subagent_start",
  SubagentStop: "subagent_stop",
  SessionStart: "session_start",
  SessionEnd: "session_end",
  PreCompact: "pre_compact",
  UserPromptSubmit: "user_prompt_submit",
  Notification: "notification",
  Stop: "stop"
};
function hookTypeToSlug(hookType) {
  return hookTypeSlugMap[hookType];
}
__name(hookTypeToSlug, "hookTypeToSlug");
function createHookEvent(params) {
  const base = createEvent({
    source: { kind: "internal" },
    type: params.type ?? `hook:${hookTypeToSlug(params.hook_type)}`,
    payload: params.payload ?? params.hook_input,
    priority: params.priority ?? 50,
    context: params.context,
    metadata: { session_id: "", sequence: 0 }
  });
  return {
    ...base,
    source: { kind: "internal" },
    hook_type: params.hook_type,
    hook_input: params.hook_input,
    session_id: params.session_id
  };
}
__name(createHookEvent, "createHookEvent");
function createExternalEvent(params) {
  const base = createEvent({
    source: { kind: "external", origin: params.external_source },
    type: params.type,
    payload: params.payload ?? params.raw_payload,
    priority: params.priority ?? 30,
    context: params.context,
    metadata: { session_id: "", sequence: 0 }
  });
  return {
    ...base,
    source: { kind: "external", origin: params.external_source },
    external_source: params.external_source,
    raw_payload: params.raw_payload,
    normalized: params.normalized ?? false
  };
}
__name(createExternalEvent, "createExternalEvent");
function defaultTimeEventType(timeType) {
  switch (timeType) {
    case "heartbeat":
      return "tick:heartbeat";
    case "cron":
      return "cron:tick";
    case "scheduled":
      return "schedule:tick";
    case "one_shot":
      return "schedule:one_shot";
  }
}
__name(defaultTimeEventType, "defaultTimeEventType");
function createTimeEvent(params) {
  const base = createEvent({
    source: { kind: "time" },
    type: params.type ?? defaultTimeEventType(params.time_type),
    payload: params.payload ?? {},
    priority: params.priority ?? 10,
    context: params.context,
    metadata: { session_id: "", sequence: 0 }
  });
  return {
    ...base,
    source: { kind: "time" },
    time_type: params.time_type,
    ...params.interval_ms !== void 0 && { interval_ms: params.interval_ms },
    ...params.schedule !== void 0 && { schedule: params.schedule },
    ...params.ttl !== void 0 && { ttl: params.ttl },
    ...params.fires_remaining !== void 0 && { fires_remaining: params.fires_remaining },
    ...params.scheduled_at !== void 0 && { scheduled_at: params.scheduled_at }
  };
}
__name(createTimeEvent, "createTimeEvent");

// src/extensions/adapters/hook-adapter.ts
var logger30 = createLogger("hook-adapter");
var VALID_HOOK_TYPES = /* @__PURE__ */ new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "SubagentStart",
  "SubagentStop",
  "SessionStart",
  "SessionEnd",
  "PreCompact",
  "UserPromptSubmit",
  "Notification",
  "Stop"
]);
function normalizeHookName(raw) {
  if (VALID_HOOK_TYPES.has(raw)) return raw;
  const colonIdx = raw.indexOf(":");
  const withoutPrefix = colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
  if (VALID_HOOK_TYPES.has(withoutPrefix)) return withoutPrefix;
  const pascal = withoutPrefix.split("_").map((s) => (s[0]?.toUpperCase() ?? "") + s.slice(1)).join("");
  return VALID_HOOK_TYPES.has(pascal) ? pascal : null;
}
__name(normalizeHookName, "normalizeHookName");

// src/plugins/hooks/hook-processor.ts
var logger31 = createLogger("hook-processor");
var HookProcessor = class {
  static {
    __name(this, "HookProcessor");
  }
  registry;
  sessionId;
  constructor(deps) {
    this.registry = deps.registry;
    this.sessionId = deps.sessionId;
  }
  /**
   * Process a hook event from Claude Code.
   *
   * Steps:
   * 1. Normalise hook_name to HookType.
   * 2. Create HookEvent.
   * 3. Run registered handlers in priority order.
   * 4. Merge responses: block wins over allow, contexts concatenate.
   * 5. Return ClaudeHookResponse.
   */
  async process(hookName, hookInput) {
    const hookType = normalizeHookName(hookName);
    if (!hookType) {
      logger31.debug("Unknown hook name \u2014 no-op", { hookName });
      return {};
    }
    const event = createHookEvent({
      hook_type: hookType,
      hook_input: hookInput,
      session_id: this.sessionId
    });
    const handlers = this.registry.getHandlers(hookType);
    if (handlers.length === 0) {
      return {};
    }
    logger31.debug("Processing hook event", {
      hookType,
      handlerCount: handlers.length,
      eventId: event.id
    });
    const responses = [];
    for (const registered of handlers) {
      try {
        const result = await registered.handler(event, hookInput);
        if (result !== null) {
          responses.push(result);
        }
      } catch (err) {
        logger31.error("Handler threw an error", {
          handlerId: registered.id,
          hookType,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    return this.mergeResponses(responses);
  }
  /**
   * Merge multiple handler responses into one.
   *
   * Rules:
   * - 'block' decision wins over 'allow' (any block → block).
   * - reasons are concatenated ('; ' separated) when blocking.
   * - additionalContext values are concatenated with '\n\n'.
   *   The merged additionalContext is capped at 100 KB (102 400 bytes UTF-8).
   *   Content beyond the cap is silently truncated to prevent oversized hook
   *   payloads from destabilising Claude Code's conversation context.
   * - hookSpecificOutput: last non-null value wins.
   * - suppressOutput: true wins (any true → true).
   */
  mergeResponses(responses) {
    if (responses.length === 0) return {};
    if (responses.length === 1) return { ...responses[0] };
    const merged = {};
    const blockReasons = [];
    const contexts = [];
    let hasBlock = false;
    for (const r of responses) {
      if (r.decision === "block") {
        hasBlock = true;
        if (r.reason) blockReasons.push(r.reason);
      }
      if (r.additionalContext) {
        contexts.push(r.additionalContext);
      }
      if (r.hookSpecificOutput) {
        merged.hookSpecificOutput = r.hookSpecificOutput;
      }
      if (r.suppressOutput) {
        merged.suppressOutput = true;
      }
    }
    if (hasBlock) {
      merged.decision = "block";
      if (blockReasons.length > 0) {
        merged.reason = blockReasons.join("; ");
      }
    } else {
      const allowResp = responses.find((r) => r.decision === "allow");
      if (allowResp) {
        merged.decision = "allow";
        if (allowResp.reason) merged.reason = allowResp.reason;
      }
    }
    if (contexts.length > 0) {
      const joined = contexts.join("\n\n");
      const MAX_ADDITIONAL_CONTEXT_BYTES = 100 * 1024;
      if (Buffer.byteLength(joined, "utf8") > MAX_ADDITIONAL_CONTEXT_BYTES) {
        logger31.warn("additionalContext exceeds 100 KB cap; truncating", {
          original_bytes: Buffer.byteLength(joined, "utf8"),
          cap_bytes: MAX_ADDITIONAL_CONTEXT_BYTES
        });
        merged.additionalContext = Buffer.from(joined, "utf8").subarray(0, MAX_ADDITIONAL_CONTEXT_BYTES).toString("utf8").replace(/[\uFFFD\uD800-\uDFFF]?$/, "");
      } else {
        merged.additionalContext = joined;
      }
    }
    return merged;
  }
};

// src/plugins/hooks/hook-registry.ts
var logger32 = createLogger("hook-registry");
var HookRegistry = class {
  static {
    __name(this, "HookRegistry");
  }
  /** Per-hook-type handler lists. Maintained in priority-descending order by register(). */
  handlers = /* @__PURE__ */ new Map();
  /** Flat index of all handlers by ID for enable/disable/unregister. */
  byId = /* @__PURE__ */ new Map();
  /**
   * Register a new handler.
   * If a handler with the same ID already exists, it is replaced.
   */
  register(handler) {
    if (this.byId.has(handler.id)) {
      this.unregister(handler.id);
    }
    const list = this.handlers.get(handler.hook_type) ?? [];
    const insertIdx = list.findIndex((h) => h.priority < handler.priority);
    list.splice(insertIdx === -1 ? list.length : insertIdx, 0, handler);
    this.handlers.set(handler.hook_type, list);
    this.byId.set(handler.id, handler);
    logger32.debug("Handler registered", {
      id: handler.id,
      hook_type: handler.hook_type,
      priority: handler.priority
    });
  }
  /**
   * Remove a handler by ID.
   * Returns true if the handler was found and removed.
   */
  unregister(id) {
    const handler = this.byId.get(id);
    if (!handler) return false;
    const list = this.handlers.get(handler.hook_type);
    if (list) {
      const idx = list.findIndex((h) => h.id === id);
      if (idx !== -1) list.splice(idx, 1);
    }
    this.byId.delete(id);
    logger32.debug("Handler unregistered", { id });
    return true;
  }
  /**
   * Enable a previously disabled handler.
   * No-op if the handler does not exist.
   */
  enable(id) {
    const handler = this.byId.get(id);
    if (handler) {
      handler.enabled = true;
      logger32.debug("Handler enabled", { id });
    }
  }
  /**
   * Disable a handler without removing it.
   * Disabled handlers are skipped during processing.
   */
  disable(id) {
    const handler = this.byId.get(id);
    if (handler) {
      handler.enabled = false;
      logger32.debug("Handler disabled", { id });
    }
  }
  /**
   * Get all enabled handlers for a given hook type.
   * Order is already priority-descending — maintained by register().
   */
  getHandlers(hookType) {
    const list = this.handlers.get(hookType) ?? [];
    return list.filter((h) => h.enabled);
  }
  /**
   * Return the number of registered (not necessarily enabled) handlers
   * for a given hook type.
   */
  count(hookType) {
    if (hookType) {
      return this.handlers.get(hookType)?.length ?? 0;
    }
    return this.byId.size;
  }
};

// src/plugins/hooks/handlers/pre-tool-use.ts
var logger33 = createLogger("handler:pre-tool-use");
var BLOCKED_TOOLS = /* @__PURE__ */ new Set([
  "Read",
  "Write",
  "Edit",
  "Grep",
  "Glob",
  "WebFetch",
  "Update",
  "NotebookEdit"
]);
var REPLACEMENT_MAP = {
  Read: "precision_read",
  Write: "precision_write",
  Edit: "precision_edit",
  Grep: "precision_grep",
  Glob: "precision_glob",
  WebFetch: "precision_fetch",
  Update: "precision_edit",
  NotebookEdit: "precision_notebook"
};
async function handlePreToolUse(_event, input) {
  const toolName = typeof input["tool_name"] === "string" ? input["tool_name"] : null;
  if (!toolName) return null;
  if (BLOCKED_TOOLS.has(toolName)) {
    const replacement = REPLACEMENT_MAP[toolName] ?? "the precision_engine equivalent";
    logger33.info("Blocking deprecated native tool", { toolName, replacement });
    return {
      decision: "block",
      reason: `Tool '${toolName}' is deprecated. Use ${replacement} instead.`
    };
  }
  return null;
}
__name(handlePreToolUse, "handlePreToolUse");

// src/plugins/hooks/handlers/subagent-start.ts
var logger34 = createLogger("handler:subagent-start");
function createSubagentStartHandler(deps) {
  return /* @__PURE__ */ __name(async function handleSubagentStart(_event, input) {
    const agentId = typeof input["agent_id"] === "string" ? input["agent_id"] : null;
    const agentType = typeof input["agent_type"] === "string" ? input["agent_type"] : null;
    logger34.debug("SubagentStart", { agentId, agentType });
    if (!deps.agentWorkflowMap) {
      return null;
    }
    const rawWorkflowId = input["workflow_id"];
    const incomingWorkflowId = typeof rawWorkflowId === "string" && rawWorkflowId.length > 0 ? rawWorkflowId : null;
    let workflowId = incomingWorkflowId;
    if (!workflowId && agentType) {
      workflowId = deps.agentWorkflowMap.resolvePendingBind(agentType);
    }
    if (!workflowId) {
      return null;
    }
    if (agentId) {
      deps.agentWorkflowMap.bind(agentId, workflowId);
    }
    logger34.info("Resolved pending bind", { agentType, workflowId, agentId });
    const context = JSON.stringify({ action: "workflow_bind", workflow_id: workflowId });
    return {
      additionalContext: `<gv>${context}</gv>`
    };
  }, "handleSubagentStart");
}
__name(createSubagentStartHandler, "createSubagentStartHandler");

// src/plugins/hooks/handlers/subagent-stop.ts
var logger35 = createLogger("handler:subagent-stop");
function createSubagentStopHandler(deps) {
  return /* @__PURE__ */ __name(async function handleSubagentStop(_event, input) {
    const agentId = typeof input["agent_id"] === "string" ? input["agent_id"] : "unknown";
    const agentType = typeof input["agent_type"] === "string" ? input["agent_type"] : "unknown";
    const output = typeof input["output"] === "string" ? input["output"] : "";
    logger35.debug("SubagentStop", { agentId, agentType });
    if (matchesAgentType(agentType, REVIEWER_AGENT_TYPES)) {
      const score = extractReviewScore2(output);
      if (score !== null) {
        logger35.info("Reviewer completed with score", { agentId, agentType, score });
      }
    }
    if (deps.eventBus) {
      try {
        deps.eventBus.emit({
          id: `evt_subagent_stop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          type: "agent:completed",
          source: { kind: "internal", hook_name: "subagent_stop" },
          payload: {
            type: "agent:completed",
            data: {
              agent_id: agentId,
              agent_type: agentType,
              output,
              workflow_id: deps.agentWorkflowMap?.lookup(agentId) ?? null
            }
          },
          metadata: { session_id: _event.session_id }
        });
      } catch (err) {
        logger35.warn("Failed to emit agent:completed", {
          agentId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    return null;
  }, "handleSubagentStop");
}
__name(createSubagentStopHandler, "createSubagentStopHandler");
function extractReviewScore2(output) {
  const match = output.match(/<gv>([\s\S]*?)<\/gv>/);
  if (!match || !match[1]) return null;
  const data = safeJsonParse(match[1], {});
  const score = data["score"];
  if (typeof score === "number") return score;
  return null;
}
__name(extractReviewScore2, "extractReviewScore");

// src/plugins/hooks/handlers/session-start.ts
var logger36 = createLogger("handler:session-start");
function createSessionStartHandler(deps) {
  return /* @__PURE__ */ __name(async function handleSessionStart(event, input) {
    const sessionId = event.session_id;
    const cwd = typeof input["cwd"] === "string" ? input["cwd"] : process.cwd();
    logger36.info("Session started", { sessionId, cwd });
    if (deps.eventBus) {
      try {
        deps.eventBus.emit({
          id: `evt_session_start_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          type: "session:started",
          source: { kind: "internal", hook_name: "session_start" },
          payload: {
            type: "session:started",
            data: {
              session_id: sessionId,
              cwd,
              project_root: cwd,
              // Known modes: 'vibecoding' (default) and 'justvibes'.
              // Any unrecognised value falls back to 'vibecoding'.
              mode: input["mode"] === "justvibes" ? "justvibes" : "vibecoding"
            }
          },
          metadata: { session_id: sessionId }
        });
      } catch (err) {
        logger36.warn("Failed to emit session:started", {
          sessionId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    return null;
  }, "handleSessionStart");
}
__name(createSessionStartHandler, "createSessionStartHandler");

// src/plugins/hooks/handlers/session-end.ts
var logger37 = createLogger("handler:session-end");
function createSessionEndHandler(deps) {
  return /* @__PURE__ */ __name(async function handleSessionEnd(event, _input) {
    const sessionId = event.session_id;
    logger37.info("Session ended", { sessionId });
    if (deps.eventBus) {
      try {
        deps.eventBus.emit({
          id: `evt_session_end_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          type: "session:ended",
          source: { kind: "internal", hook_name: "session_end" },
          payload: {
            type: "session:ended",
            data: { session_id: sessionId }
          },
          metadata: { session_id: sessionId }
        });
      } catch (err) {
        logger37.warn("Failed to emit session:ended", {
          sessionId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    return null;
  }, "handleSessionEnd");
}
__name(createSessionEndHandler, "createSessionEndHandler");

// src/plugins/hooks/handlers/pre-compact.ts
var logger38 = createLogger("handler:pre-compact");
function createPreCompactHandler(deps) {
  return /* @__PURE__ */ __name(async function handlePreCompact(event, _input) {
    const sessionId = event.session_id;
    logger38.info("Pre-compact", { sessionId });
    if (deps.eventBus) {
      try {
        deps.eventBus.emit({
          id: `evt_pre_compact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          type: "session:compact",
          source: { kind: "internal", hook_name: "pre_compact" },
          payload: {
            type: "session:compact",
            data: { session_id: sessionId }
          },
          metadata: { session_id: sessionId }
        });
      } catch (err) {
        logger38.warn("Failed to emit session:compact", {
          sessionId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    const snapshot = deps.snapshotState?.();
    if (snapshot && Object.keys(snapshot).length > 0) {
      const context = JSON.stringify({ action: "state_snapshot", state: snapshot });
      return {
        additionalContext: `<gv>${context}</gv>`
      };
    }
    return null;
  }, "handlePreCompact");
}
__name(createPreCompactHandler, "createPreCompactHandler");

// src/plugins/hooks/handlers/post-tool-use.ts
var logger39 = createLogger("handler:post-tool-use");
var FILE_WRITE_TOOLS = /* @__PURE__ */ new Set([
  "precision_write",
  "precision_edit"
]);
function createPostToolUseHandler(deps) {
  return /* @__PURE__ */ __name(async function handlePostToolUse(event, input) {
    const toolName = typeof input["tool_name"] === "string" ? input["tool_name"] : null;
    if (!toolName || !deps.eventBus) return null;
    const sessionId = event.session_id;
    if (FILE_WRITE_TOOLS.has(toolName)) {
      const paths = extractModifiedPaths(input);
      for (const path3 of paths) {
        try {
          deps.eventBus.emit({
            id: `evt_file_modified_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            type: "file:modified",
            source: { kind: "internal", hook_name: "post_tool_use" },
            payload: {
              type: "file:modified",
              data: {
                path: path3,
                change_type: "modify"
              }
            },
            metadata: { session_id: sessionId }
          });
        } catch (err) {
          logger39.warn("Failed to emit file:modified", {
            path: path3,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
    }
    return null;
  }, "handlePostToolUse");
}
__name(createPostToolUseHandler, "createPostToolUseHandler");
function extractModifiedPaths(input) {
  const result = input["tool_result"];
  if (!result || typeof result !== "object") return [];
  const r = result;
  if (Array.isArray(r["files"])) {
    return r["files"].filter((f) => typeof f === "object" && f !== null && typeof f["path"] === "string").map((f) => f.path);
  }
  const toolInput = input["tool_input"];
  if (toolInput && typeof toolInput === "object") {
    const ti = toolInput;
    const inputPath = ti["path"] ?? ti["file_path"];
    if (typeof inputPath === "string") return [inputPath];
  }
  return [];
}
__name(extractModifiedPaths, "extractModifiedPaths");

// src/plugins/hooks/handlers/user-prompt-submit.ts
var logger40 = createLogger("handler:user-prompt-submit");
var TASK_NOTIFICATION_PATTERN = "<task-notification>";
function createUserPromptSubmitHandler(deps) {
  return /* @__PURE__ */ __name(async function handleUserPromptSubmit(_event, input) {
    const prompt = typeof input["prompt"] === "string" ? input["prompt"] : "";
    const mode = deps.executorMode?.getMode();
    if ((mode === "daemon" || mode === "hybrid") && deps.daemonTickHandler) {
      const tickCommand = deps.daemonTickHandler.getTickCommand();
      if (prompt.trim() === tickCommand) {
        logger40.info("Daemon tick received via UserPromptSubmit");
        const result = await deps.daemonTickHandler.handleTick();
        const tickContext = JSON.stringify({
          action: "daemon_tick",
          tick_number: result.tick_number,
          events_processed: result.events_processed,
          budget_status: result.budget_status
        });
        return {
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: `<gv>${tickContext}</gv>`
          }
        };
      }
    }
    if (!prompt.includes(TASK_NOTIFICATION_PATTERN)) {
      return null;
    }
    if (!deps.directiveQueue) {
      return null;
    }
    const directives = deps.directiveQueue.drain("subagent_stop");
    if (directives.length === 0) {
      return null;
    }
    logger40.info("Injecting directives via UserPromptSubmit", {
      count: directives.length
    });
    const directivePayload = JSON.stringify({
      action: "directives",
      directives
    });
    const gvTag = `<gv>${directivePayload}</gv>`;
    return {
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: gvTag
      }
    };
  }, "handleUserPromptSubmit");
}
__name(createUserPromptSubmitHandler, "createUserPromptSubmitHandler");

// src/plugins/hooks/handlers/index.ts
function registerDefaultHandlers(registry, deps) {
  registry.register({
    id: "default:pre-tool-use:native-tool-blocker",
    hook_type: "PreToolUse",
    handler: handlePreToolUse,
    priority: 100,
    enabled: true
  });
  registry.register({
    id: "default:user-prompt-submit:directive-delivery",
    hook_type: "UserPromptSubmit",
    handler: createUserPromptSubmitHandler({
      directiveQueue: deps.directiveQueue,
      daemonTickHandler: deps.daemonTickHandler ?? null,
      executorMode: deps.executorMode ?? null
    }),
    priority: 80,
    enabled: true
  });
  registry.register({
    id: "default:subagent-start:wrfc-binding",
    hook_type: "SubagentStart",
    handler: createSubagentStartHandler({ agentWorkflowMap: deps.agentWorkflowMap }),
    priority: 60,
    enabled: true
  });
  registry.register({
    id: "default:subagent-stop:quality-gate",
    hook_type: "SubagentStop",
    handler: createSubagentStopHandler({
      eventBus: deps.eventBus,
      agentWorkflowMap: deps.agentWorkflowMap,
      minReviewScore: deps.minReviewScore
    }),
    priority: 60,
    enabled: true
  });
  registry.register({
    id: "default:session-start:init",
    hook_type: "SessionStart",
    handler: createSessionStartHandler({ eventBus: deps.eventBus }),
    priority: 50,
    enabled: true
  });
  registry.register({
    id: "default:session-end:cleanup",
    hook_type: "SessionEnd",
    handler: createSessionEndHandler({ eventBus: deps.eventBus }),
    priority: 50,
    enabled: true
  });
  registry.register({
    id: "default:pre-compact:state-preservation",
    hook_type: "PreCompact",
    handler: createPreCompactHandler({
      eventBus: deps.eventBus,
      snapshotState: deps.snapshotState
    }),
    priority: 50,
    enabled: true
  });
  registry.register({
    id: "default:post-tool-use:file-tracking",
    hook_type: "PostToolUse",
    handler: createPostToolUseHandler({ eventBus: deps.eventBus }),
    priority: 40,
    enabled: true
  });
}
__name(registerDefaultHandlers, "registerDefaultHandlers");

// src/plugins/hooks/index.ts
function createHookSubsystem(deps) {
  const hookRegistry = new HookRegistry();
  const hookProcessor = new HookProcessor({
    registry: hookRegistry,
    sessionId: ""
  });
  registerDefaultHandlers(hookRegistry, deps);
  return { hookProcessor, hookRegistry };
}
__name(createHookSubsystem, "createHookSubsystem");

// src/plugins/time/heartbeat.ts
var HeartbeatManager = class {
  constructor(config) {
    this.config = config;
    this.now = config.now ?? (() => Date.now());
  }
  static {
    __name(this, "HeartbeatManager");
  }
  lastTickAt = 0;
  tickCount = 0;
  now;
  /**
   * Called on each external tick.
   * Returns a heartbeat TimeEvent if enough time has elapsed since the last tick,
   * or null if the interval has not yet elapsed (debounce guard).
   */
  tick() {
    if (!this.config.enabled) return null;
    const now = this.now();
    if (this.lastTickAt > 0 && now - this.lastTickAt < this.config.interval_ms * 0.8) {
      return null;
    }
    this.lastTickAt = now;
    this.tickCount++;
    return createTimeEvent({
      time_type: "heartbeat",
      type: "tick:heartbeat",
      interval_ms: this.config.interval_ms,
      payload: { tick_count: this.tickCount, timestamp: now },
      priority: this.config.priority ?? 10
    });
  }
  // ─── Accessors ───────────────────────────────────────────────────────────────
  getTickCount() {
    return this.tickCount;
  }
  getLastTickAt() {
    return this.lastTickAt;
  }
  isEnabled() {
    return this.config.enabled;
  }
  enable() {
    this.config.enabled = true;
  }
  disable() {
    this.config.enabled = false;
  }
  /** Update the heartbeat interval at runtime. */
  setInterval(interval_ms) {
    this.config.interval_ms = interval_ms;
  }
  /** Reset internal state (tick count and last fire time). */
  reset() {
    this.lastTickAt = 0;
    this.tickCount = 0;
  }
  /**
   * Stop the heartbeat manager and release any pending state.
   *
   * The debounce in this class is timestamp-based (no internal `setTimeout`
   * is held), so there is no timer handle to clear. This method disables the
   * heartbeat and resets state to ensure a clean shutdown when the parent
   * plugin stops.
   */
  stop() {
    this.config.enabled = false;
    this.lastTickAt = 0;
    this.tickCount = 0;
  }
};

// src/plugins/time/scheduler.ts
var PERSIST_KEY = "time_plugin.schedules";
var EventScheduler = class {
  constructor(config, store) {
    this.config = config;
    this.store = store;
  }
  static {
    __name(this, "EventScheduler");
  }
  items = /* @__PURE__ */ new Map();
  // ─── Scheduling API ──────────────────────────────────────────────────────────
  /**
   * Schedule a recurring heartbeat event with an optional TTL.
   * Example: "check CI every 10 seconds for 5 fires".
   */
  scheduleHeartbeat(params) {
    if (params.interval_ms <= 0) {
      throw new RangeError(`EventScheduler.scheduleHeartbeat: interval_ms must be > 0, got ${params.interval_ms}`);
    }
    this._assertCapacity();
    if (this.items.has(params.id)) {
      throw new QueueError(`EventScheduler: item with id '${params.id}' already exists`);
    }
    const now = Date.now();
    const item = {
      id: params.id,
      time_type: "heartbeat",
      event_type: params.event_type,
      interval_ms: params.interval_ms,
      next_fire_at: now + params.interval_ms,
      created_at: now,
      ...params.ttl !== void 0 && {
        ttl: params.ttl,
        fires_remaining: params.ttl,
        max_fires: params.ttl
      },
      ...params.payload !== void 0 && { payload: params.payload },
      ...params.ref !== void 0 && { ref: params.ref },
      ...params.priority !== void 0 && { priority: params.priority }
    };
    this.items.set(params.id, item);
    return item;
  }
  /**
   * Schedule a one-shot delayed event.
   * Example: "send a notification in 60 seconds".
   */
  scheduleOneShot(params) {
    if (params.delay_ms <= 0) {
      throw new RangeError(`EventScheduler.scheduleOneShot: delay_ms must be > 0, got ${params.delay_ms}`);
    }
    this._assertCapacity();
    if (this.items.has(params.id)) {
      throw new QueueError(`EventScheduler: item with id '${params.id}' already exists`);
    }
    const now = Date.now();
    const item = {
      id: params.id,
      time_type: "one_shot",
      event_type: params.event_type,
      next_fire_at: now + params.delay_ms,
      created_at: now,
      ttl: 1,
      fires_remaining: 1,
      max_fires: 1,
      ...params.payload !== void 0 && { payload: params.payload },
      ...params.ref !== void 0 && { ref: params.ref },
      ...params.priority !== void 0 && { priority: params.priority }
    };
    this.items.set(params.id, item);
    return item;
  }
  /**
   * Schedule a cron-like recurring event using a simple interval.
   * Supports an optional active-hours window (0–23 hour range).
   * Example: "ping every 5 minutes, only between 9am and 6pm".
   */
  scheduleCron(params) {
    if (params.interval_ms <= 0) {
      throw new RangeError(`EventScheduler.scheduleCron: interval_ms must be > 0, got ${params.interval_ms}`);
    }
    this._assertCapacity();
    if (this.items.has(params.id)) {
      throw new QueueError(`EventScheduler: item with id '${params.id}' already exists`);
    }
    const now = Date.now();
    const item = {
      id: params.id,
      time_type: "cron",
      event_type: params.event_type,
      interval_ms: params.interval_ms,
      next_fire_at: now + params.interval_ms,
      created_at: now,
      ...params.payload !== void 0 && { payload: params.payload },
      ...params.ref !== void 0 && { ref: params.ref },
      ...params.active_hours !== void 0 && { active_hours: params.active_hours },
      ...params.priority !== void 0 && { priority: params.priority }
    };
    this.items.set(params.id, item);
    return item;
  }
  // ─── Tick ────────────────────────────────────────────────────────────────────
  /**
   * Evaluate all scheduled items against the current time.
   * Returns TimeEvents for every item whose next_fire_at has elapsed.
   * Decrements fires_remaining and removes expired items automatically.
   */
  tick() {
    const now = Date.now();
    const events = [];
    const toRemove = [];
    for (const [id, item] of this.items) {
      if (item.next_fire_at > now) continue;
      if (item.active_hours !== void 0) {
        const { start, end, timezone_offset_hours } = item.active_hours;
        const utcHour = new Date(now).getUTCHours();
        const hour = timezone_offset_hours !== void 0 ? ((utcHour + timezone_offset_hours) % 24 + 24) % 24 : new Date(now).getHours();
        const inWindow = start === end ? true : start <= end ? hour >= start && hour < end : hour >= start || hour < end;
        if (!inWindow) {
          if (item.interval_ms !== void 0) {
            item.next_fire_at = now + item.interval_ms;
            this.dirty = true;
          }
          continue;
        }
      }
      const event = createTimeEvent({
        time_type: item.time_type,
        type: item.event_type,
        interval_ms: item.interval_ms,
        ...item.fires_remaining !== void 0 && { fires_remaining: item.fires_remaining },
        ...item.ttl !== void 0 && { ttl: item.ttl },
        scheduled_at: item.created_at,
        payload: item.payload ?? {},
        priority: item.priority ?? 10,
        context: item.ref !== void 0 ? { ref: item.ref } : void 0
      });
      events.push(event);
      item.last_fired_at = now;
      this.dirty = true;
      if (item.fires_remaining !== void 0) {
        item.fires_remaining--;
        if (item.fires_remaining <= 0) {
          toRemove.push(id);
          continue;
        }
      }
      if (item.interval_ms !== void 0) {
        item.next_fire_at = now + item.interval_ms;
      }
    }
    for (const id of toRemove) {
      this.items.delete(id);
    }
    return events;
  }
  // ─── Cancellation ────────────────────────────────────────────────────────────
  /** Cancel a single scheduled item by ID. Returns true if the item existed. */
  cancel(id) {
    return this.items.delete(id);
  }
  /**
   * Cancel all scheduled items that share a given ref tag.
   * Returns the number of items removed.
   */
  cancelByRef(ref) {
    const toDelete = [];
    for (const [id, item] of this.items) {
      if (item.ref === ref) toDelete.push(id);
    }
    for (const id of toDelete) this.items.delete(id);
    return toDelete.length;
  }
  // ─── Accessors ───────────────────────────────────────────────────────────────
  getItem(id) {
    return this.items.get(id);
  }
  getAllItems() {
    return Array.from(this.items.values());
  }
  size() {
    return this.items.size;
  }
  // ─── Persistence ─────────────────────────────────────────────────────────────
  /**
   * Persist all current schedules to the state store.
   * No-op if persist_schedules is false or no store was provided.
   */
  persist() {
    if (!this.config.persist_schedules || this.store === void 0) return;
    const snapshot = Array.from(this.items.values());
    this.store.set(PERSIST_KEY, snapshot);
  }
  /**
   * Restore schedules from the state store.
   * Stale items (next_fire_at in the past) are re-scheduled to fire immediately.
   * No-op if persist_schedules is false or no store was provided.
   */
  restore() {
    if (!this.config.persist_schedules || this.store === void 0) return;
    const snapshot = this.store.get(PERSIST_KEY);
    if (!Array.isArray(snapshot)) return;
    const now = Date.now();
    for (const item of snapshot) {
      if (this.items.has(item.id)) continue;
      if (item.next_fire_at < now) {
        item.next_fire_at = now;
      }
      this.items.set(item.id, item);
    }
  }
  // ─── Lifecycle ───────────────────────────────────────────────────────────────
  /**
   * Remove all scheduled items without destroying the scheduler.
   * The scheduler remains usable after clear() — new items may be added.
   */
  clear() {
    this.items.clear();
  }
  /**
   * Clear all scheduled items and mark the scheduler as destroyed.
   * Subsequent calls to any scheduling method will throw.
   */
  destroy() {
    this.items.clear();
    this.destroyed = true;
  }
  // ─── Internal ────────────────────────────────────────────────────────────────
  destroyed = false;
  dirty = false;
  /** Returns true if any item state has mutated since the last clearDirty() call. */
  isDirty() {
    return this.dirty;
  }
  /** Resets the dirty flag after persisting. */
  clearDirty() {
    this.dirty = false;
  }
  _assertCapacity() {
    if (this.destroyed) {
      throw new ProcessingError("EventScheduler: cannot schedule items on a destroyed scheduler");
    }
    if (this.items.size >= this.config.max_scheduled_items) {
      throw new QueueError(
        `EventScheduler capacity exceeded: max ${this.config.max_scheduled_items} items`
      );
    }
  }
};

// src/plugins/time/time-plugin.ts
var TimePlugin = class {
  static {
    __name(this, "TimePlugin");
  }
  heartbeat;
  scheduler;
  queue;
  constructor(ctx) {
    this.queue = ctx.queue;
    this.heartbeat = new HeartbeatManager(ctx.config.heartbeat);
    this.scheduler = new EventScheduler(ctx.config.scheduler, ctx.store);
    this.scheduler.restore();
  }
  /**
   * Called on each external tick (from system scheduler).
   *
   * Execution order:
   * 1. Emit heartbeat event (if interval has elapsed and heartbeat is enabled)
   * 2. Evaluate all scheduled items, emit events for those that are due
   * 3. Persist updated schedule state to the store
   *
   * Returns a summary of what was emitted this tick.
   */
  onTick() {
    let heartbeat_emitted = false;
    let scheduled_emitted = 0;
    const heartbeatEvent = this.heartbeat.tick();
    if (heartbeatEvent !== null) {
      this.queue.enqueue(heartbeatEvent);
      heartbeat_emitted = true;
    }
    const scheduledEvents = this.scheduler.tick();
    for (const event of scheduledEvents) {
      this.queue.enqueue(event);
      scheduled_emitted++;
    }
    if (this.scheduler.isDirty()) {
      this.scheduler.persist();
      this.scheduler.clearDirty();
    }
    return { heartbeat_emitted, scheduled_emitted };
  }
  // ─── Accessors ───────────────────────────────────────────────────────────────
  getHeartbeat() {
    return this.heartbeat;
  }
  getScheduler() {
    return this.scheduler;
  }
};

// src/plugins/external/file-watcher.ts
var crypto = __toESM(require("node:crypto"), 1);
var fs = __toESM(require("node:fs/promises"), 1);
var path = __toESM(require("node:path"), 1);
var logger41 = createLogger("file-watcher");
function isDropFilePayload(value) {
  if (typeof value !== "object" || value === null) return false;
  const v = value;
  return typeof v["source"] === "string" && v["source"].length > 0 && "payload" in v;
}
__name(isDropFilePayload, "isDropFilePayload");
var FileWatcher = class {
  constructor(queue, normalizers, config) {
    this.queue = queue;
    this.normalizers = normalizers;
    this.config = config;
  }
  static {
    __name(this, "FileWatcher");
  }
  /**
   * Persistent set of filenames that have been successfully enqueued.
   * Only cleared when a file is confirmed moved or deleted, preventing
   * re-ingestion if a rename fails and the file remains in incoming.
   */
  enqueuedFiles = /* @__PURE__ */ new Set();
  /**
   * Scan the incoming directory for .json files.
   *
   * For each file (up to max_files_per_scan):
   *   1. Read and parse JSON
   *   2. Validate structure (must have source + payload)
   *   3. Normalize via matching normalizer
   *   4. Enqueue to event queue
   *   5. Move to processed/ on success, errors/ on failure
   *
   * Never throws — individual file failures are isolated.
   */
  async scan() {
    let entries;
    try {
      const dirEntries = await fs.readdir(this.config.incoming_dir);
      entries = dirEntries.filter((f) => f.endsWith(".json"));
    } catch (err) {
      const code = err.code;
      if (code === "ENOENT") {
        await this.ensureDirs();
        return { events_ingested: 0 };
      }
      throw err;
    }
    const batch = entries.slice(0, this.config.max_files_per_scan);
    let events_ingested = 0;
    const confirmedRemoved = /* @__PURE__ */ new Set();
    for (const filename of batch) {
      const filepath = path.join(this.config.incoming_dir, filename);
      let succeeded = false;
      try {
        const raw = await fs.readFile(filepath, "utf-8");
        const parsed = safeJsonParse(raw, null);
        if (!isDropFilePayload(parsed)) {
          throw new ProcessingError(
            `Invalid drop file format: must have 'source' (string) and 'payload' fields`
          );
        }
        const event = this.normalizers.normalize(
          parsed.source,
          parsed.payload,
          parsed.headers
        );
        if (!this.enqueuedFiles.has(filename)) {
          this.queue.enqueue(event);
          this.enqueuedFiles.add(filename);
          events_ingested++;
        }
        succeeded = true;
      } catch (scanErr) {
        logger41.error(`Failed to process file '${filename}'`, { error: scanErr });
        const errorPath = path.join(this.config.error_dir, filename);
        try {
          await fs.rename(filepath, errorPath);
          confirmedRemoved.add(filename);
        } catch (moveErr) {
          try {
            await fs.unlink(filepath);
            confirmedRemoved.add(filename);
          } catch {
            logger41.debug(`Failed to remove error file '${filename}' after move failure`, { error: moveErr });
          }
        }
      }
      if (succeeded) {
        const processedName = `${crypto.randomUUID()}_${filename}`;
        const processedPath = path.join(this.config.processed_dir, processedName);
        try {
          await fs.rename(filepath, processedPath);
          confirmedRemoved.add(filename);
        } catch (moveErr) {
          logger41.error(`Failed to move processed file '${filename}'`, { error: moveErr });
        }
      }
    }
    for (const filename of confirmedRemoved) {
      this.enqueuedFiles.delete(filename);
    }
    return { events_ingested };
  }
  /**
   * Ensure all required directories exist.
   * Creates directories recursively if they don't exist.
   */
  async ensureDirs() {
    await Promise.all([
      fs.mkdir(this.config.incoming_dir, { recursive: true }),
      fs.mkdir(this.config.processed_dir, { recursive: true }),
      fs.mkdir(this.config.error_dir, { recursive: true })
    ]);
  }
};

// src/plugins/external/http-listener.ts
var http = __toESM(require("node:http"), 1);
var fs2 = __toESM(require("node:fs/promises"), 1);
var path2 = __toESM(require("node:path"), 1);
var crypto2 = __toESM(require("node:crypto"), 1);
var logger42 = createLogger("http-listener");
var DEFAULT_HTTP_LISTENER_CONFIG = {
  port: DEFAULT_HTTP_LISTENER_PORT,
  bind_mode: "localhost",
  address: "127.0.0.1",
  max_payload_bytes: 1 * 1024 * 1024
  // 1MB
};
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}
__name(sendJson, "sendJson");
var HttpListener = class {
  constructor(dropDir, config) {
    this.dropDir = dropDir;
    this.config = config;
  }
  static {
    __name(this, "HttpListener");
  }
  server = null;
  running = false;
  /**
   * Start the HTTP server.
   * Resolves when the server is listening.
   * Rejects if the server is already running or fails to bind.
   */
  async start() {
    if (this.running) {
      throw new ConfigError("HttpListener is already running");
    }
    await fs2.mkdir(this.dropDir, { recursive: true });
    return new Promise((resolve2, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch(() => {
          try {
            sendJson(res, 500, { error: "Internal server error" });
          } catch (innerErr) {
            logger42.debug("Failed to send 500 response after request handler error", { error: innerErr });
          }
        });
      });
      this.server.once("error", reject);
      const server = this.server;
      const bindAddress = this.config.bind_mode === "localhost" ? "127.0.0.1" : this.config.bind_mode === "local_network" ? "0.0.0.0" : this.config.address;
      server.listen(this.config.port, bindAddress, () => {
        server.removeListener("error", reject);
        server.on("error", (err) => {
          logger42.error("Server error", { error: err });
        });
        this.running = true;
        resolve2();
      });
    });
  }
  /**
   * Stop the HTTP server gracefully.
   * Resolves when all connections are closed.
   */
  async stop() {
    if (!this.running || this.server === null) {
      return;
    }
    const server = this.server;
    return new Promise((resolve2, reject) => {
      server.close((err) => {
        this.running = false;
        this.server = null;
        if (err) {
          reject(err);
        } else {
          resolve2();
        }
      });
    });
  }
  /** Returns true if the server is currently listening. */
  isRunning() {
    return this.running;
  }
  /** Returns the configured port number. */
  getPort() {
    return this.config.port;
  }
  // ─── Request Handler ──────────────────────────────────────────────────────
  async handleRequest(req, res) {
    const url = req.url ?? "/";
    const method = req.method?.toUpperCase() ?? "GET";
    if (url === "/health" && method === "GET") {
      sendJson(res, 200, { status: "ok", running: this.running });
      return;
    }
    const webhookMatch = /^\/webhook\/([a-zA-Z0-9_-]+)(?:\/.*)?$/.exec(url);
    if (webhookMatch !== null && method === "POST") {
      const source = webhookMatch[1];
      if (this.config.auth_token !== void 0) {
        const authHeader = req.headers["authorization"] ?? "";
        const expectedBearer = `Bearer ${this.config.auth_token}`;
        const hash = /* @__PURE__ */ __name((buf) => crypto2.createHash("sha256").update(buf).digest(), "hash");
        const isValid = crypto2.timingSafeEqual(
          hash(Buffer.from(authHeader)),
          hash(Buffer.from(expectedBearer))
        );
        if (!isValid) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
      }
      const body = await this.readBody(req);
      if (body === null) {
        sendJson(res, 413, { error: "Payload Too Large" });
        return;
      }
      const parsedPayload = safeJsonParse(body, void 0);
      if (parsedPayload === void 0) {
        logger42.debug("Failed to parse JSON body");
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const forwardedHeaders = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") {
          forwardedHeaders[key.toLowerCase()] = value;
        } else if (Array.isArray(value)) {
          forwardedHeaders[key.toLowerCase()] = value.join(", ");
        }
      }
      const fileId = crypto2.randomUUID();
      const filename = `${Date.now()}_${source}_${fileId}.json`;
      const filepath = path2.join(this.dropDir, filename);
      const dropPayload = {
        source,
        payload: parsedPayload,
        headers: forwardedHeaders,
        received_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      await fs2.writeFile(filepath, JSON.stringify(dropPayload, null, 2), "utf-8");
      sendJson(res, 202, { accepted: true, id: fileId });
      return;
    }
    sendJson(res, 404, { error: "Not Found" });
  }
  /**
   * Read the full request body up to max_payload_bytes.
   * Returns null if the limit is exceeded.
   */
  readBody(req) {
    return readStreamBody(req, this.config.max_payload_bytes);
  }
};

// src/plugins/external/normalizers/github.ts
function resolveGithubEventType(githubEvent, action) {
  const base = `webhook:github:${githubEvent}`;
  if (action !== void 0 && action.length > 0) {
    const sanitized = action.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    return `${base}:${sanitized}`;
  }
  return base;
}
__name(resolveGithubEventType, "resolveGithubEventType");
function normalizeGithub(rawPayload, headers) {
  const normalizedHeaders = headers ?? {};
  const githubEvent = normalizedHeaders["x-github-event"] ?? "unknown";
  const payload = rawPayload !== null && typeof rawPayload === "object" ? rawPayload : {};
  const action = typeof payload.action === "string" ? payload.action : void 0;
  const eventType = resolveGithubEventType(githubEvent, action);
  const normalizedPayload = {
    event: githubEvent,
    ...action !== void 0 && { action },
    ...payload.repository !== void 0 && {
      repository: {
        full_name: payload.repository.full_name,
        name: payload.repository.name,
        html_url: payload.repository.html_url
      }
    },
    ...payload.sender !== void 0 && {
      sender: {
        login: payload.sender.login,
        type: payload.sender.type
      }
    },
    // PR-specific fields
    ...payload.pull_request !== void 0 && {
      pull_request: {
        number: payload.pull_request.number,
        title: payload.pull_request.title,
        state: payload.pull_request.state,
        html_url: payload.pull_request.html_url
      }
    },
    // Push-specific fields
    ...payload.ref !== void 0 && { ref: payload.ref },
    ...Array.isArray(payload.commits) && { commit_count: payload.commits.length },
    ...payload.head_commit !== void 0 && {
      head_commit: {
        id: payload.head_commit.id,
        message: payload.head_commit.message
      }
    },
    // Delivery ID for deduplication (from header)
    ...normalizedHeaders["x-github-delivery"] !== void 0 && {
      delivery_id: normalizedHeaders["x-github-delivery"]
    }
  };
  return createExternalEvent({
    external_source: "github",
    type: eventType,
    raw_payload: rawPayload,
    payload: normalizedPayload,
    normalized: true
  });
}
__name(normalizeGithub, "normalizeGithub");

// src/plugins/external/normalizers/generic.ts
function normalizeGeneric(rawPayload, source, headers) {
  let eventType = `webhook:${source}:event`;
  if (rawPayload !== null && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    const p = rawPayload;
    const extracted = p["event"] ?? p["type"] ?? p["action"];
    if (typeof extracted === "string" && extracted.length > 0) {
      const sanitized = extracted.replace(/[^a-zA-Z0-9_:.-]/g, "_").toLowerCase();
      eventType = `webhook:${source}:${sanitized}`;
    }
  }
  const normalizedPayload = {
    data: rawPayload,
    ...headers !== void 0 && Object.keys(headers).length > 0 && { headers }
  };
  return createExternalEvent({
    external_source: source,
    type: eventType,
    raw_payload: rawPayload,
    payload: normalizedPayload,
    normalized: false
    // Generic normalizer does not perform deep normalization
  });
}
__name(normalizeGeneric, "normalizeGeneric");

// src/plugins/external/normalizers/index.ts
var NormalizerRegistry = class {
  static {
    __name(this, "NormalizerRegistry");
  }
  normalizers = /* @__PURE__ */ new Map();
  /**
   * Register a normalizer for a given source name.
   * Overwrites any existing normalizer for that source.
   */
  register(source, normalizer) {
    this.normalizers.set(source, normalizer);
  }
  /**
   * Retrieve a normalizer by source name. Returns undefined if not found.
   */
  get(source) {
    return this.normalizers.get(source);
  }
  /**
   * Unregister a normalizer. Returns true if it existed.
   */
  unregister(source) {
    return this.normalizers.delete(source);
  }
  /**
   * Normalize a payload using the registered normalizer for the given source.
   * Falls back to 'generic' if no source-specific normalizer is registered.
   * The generic normalizer is always available as a fallback.
   */
  normalize(source, rawPayload, headers) {
    const normalizer = this.normalizers.get(source);
    if (normalizer !== void 0) {
      return normalizer(rawPayload, headers);
    }
    return normalizeGeneric(rawPayload, source, headers);
  }
  /**
   * Returns all registered source names.
   */
  sources() {
    return Array.from(this.normalizers.keys());
  }
};
function createDefaultRegistry() {
  const registry = new NormalizerRegistry();
  registry.register("github", normalizeGithub);
  registry.register(
    "generic",
    (rawPayload, headers) => normalizeGeneric(rawPayload, "generic", headers)
  );
  return registry;
}
__name(createDefaultRegistry, "createDefaultRegistry");

// src/plugins/external/external-plugin.ts
var logger43 = createLogger("external-plugin");
var ExternalPlugin = class {
  constructor(queue, config) {
    this.queue = queue;
    this.config = config;
    this.normalizers = createDefaultRegistry();
    this.watcher = new FileWatcher(this.queue, this.normalizers, this.config.file_watcher);
    if (this.config.http_listener !== void 0) {
      this.listener = new HttpListener(
        this.config.file_watcher.incoming_dir,
        this.config.http_listener
      );
    }
  }
  static {
    __name(this, "ExternalPlugin");
  }
  watcher;
  listener = null;
  normalizers;
  /**
   * Initialize the plugin: ensure required directories exist.
   * Call this once at startup before the first tick.
   */
  async initialize() {
    await this.watcher.ensureDirs();
  }
  /**
   * Called on each runtime tick.
   * Scans the file drop directory for new events and enqueues them.
   */
  async onTick() {
    return this.watcher.scan();
  }
  /**
   * Start the HTTP listener (if configured).
   * No-op if http_listener was not included in config — HTTP ingestion is disabled
   * unless explicitly opted in via ExternalPluginConfig.http_listener.
   * Throws if the listener is already running.
   */
  async startHttpListener() {
    if (this.config.http_listener === void 0) {
      logger43.error(
        "startHttpListener called but http_listener is not configured \u2014 this is a bug; caller must set http_listener in config before calling startHttpListener()"
      );
      throw new Error("startHttpListener: http_listener config is undefined \u2014 cannot start listener");
    }
    if (this.listener === null) {
      this.listener = new HttpListener(
        this.config.file_watcher.incoming_dir,
        this.config.http_listener
      );
    }
    logger43.info("Starting HTTP webhook listener", {
      port: this.config.http_listener.port,
      address: this.config.http_listener.address,
      bind_mode: this.config.http_listener.bind_mode
    });
    await this.listener.start();
    logger43.info("HTTP webhook listener is running", { port: this.config.http_listener.port });
  }
  /**
   * Stop the HTTP listener gracefully.
   * No-op if the listener is not running.
   */
  async stopHttpListener() {
    if (this.listener === null || !this.listener.isRunning()) {
      return;
    }
    await this.listener.stop();
  }
  /**
   * Returns true if the HTTP listener is currently running.
   */
  isHttpListenerRunning() {
    return this.listener?.isRunning() ?? false;
  }
  /**
   * Update the plugin configuration at runtime.
   * The new config will be used for any subsequent startHttpListener() calls.
   * Does NOT restart a running listener — callers must stop/start explicitly.
   */
  updateConfig(config) {
    this.config = config;
    if (this.listener === null || !this.listener.isRunning()) {
      this.listener = config.http_listener !== void 0 ? new HttpListener(config.file_watcher.incoming_dir, config.http_listener) : null;
    }
  }
  /**
   * Expose the normalizer registry for external customization.
   * Callers can register additional normalizers before the first tick.
   */
  getNormalizerRegistry() {
    return this.normalizers;
  }
};

// src/plugins/agent-tracker/agent-tracker-plugin.ts
var log8 = createLogger("agent-tracker-plugin");
var AGENT_KEY = /* @__PURE__ */ __name((id) => `agent_tracker.agents.${id}`, "AGENT_KEY");
var INDEX_KEY = "agent_tracker.agent_ids";
var WRFC_MAP_KEY = /* @__PURE__ */ __name((sid, id) => `wrfc.sessions.${sid}.agent_map.${id}`, "WRFC_MAP_KEY");
function extractAgentData(event) {
  const payload = event.payload;
  const data = typeof payload["data"] === "object" && payload["data"] !== null ? payload["data"] : payload;
  const agent_id = typeof data["agent_id"] === "string" ? data["agent_id"] : null;
  const agent_type = typeof data["agent_type"] === "string" && data["agent_type"].length > 0 ? data["agent_type"] : "";
  const workflow_id = typeof data["workflow_id"] === "string" && data["workflow_id"].length > 0 ? data["workflow_id"] : null;
  return { agent_id, agent_type, workflow_id };
}
__name(extractAgentData, "extractAgentData");
var AgentTrackerPlugin = class {
  static {
    __name(this, "AgentTrackerPlugin");
  }
  name = "agent-tracker";
  version = "1.0.0";
  state = "registered";
  _handlers = [];
  _services = null;
  _unsubscribes = [];
  // ─── RuntimePlugin interface ──────────────────────────────────────────────
  register(services) {
    this._services = services;
    const existing = services.getState(INDEX_KEY);
    if (!existing) {
      services.setState(INDEX_KEY, []);
    }
    const unsubSpawned = services.subscribe("agent:spawned", (event) => {
      this.handleSpawned(event);
    });
    const unsubCompleted = services.subscribe("agent:completed", (event) => {
      this.handleFinished(event, "completed");
    });
    const unsubFailed = services.subscribe("agent:failed", (event) => {
      this.handleFinished(event, "failed");
    });
    this._unsubscribes = [unsubSpawned, unsubCompleted, unsubFailed];
    this._handlers = [
      { event_type: "agent:spawned", handler: /* @__PURE__ */ __name((e) => {
        this.handleSpawned(e);
      }, "handler"), priority: 5 },
      { event_type: "agent:completed", handler: /* @__PURE__ */ __name((e) => {
        this.handleFinished(e, "completed");
      }, "handler"), priority: 5 },
      { event_type: "agent:failed", handler: /* @__PURE__ */ __name((e) => {
        this.handleFinished(e, "failed");
      }, "handler"), priority: 5 }
    ];
    this.state = "starting";
    log8.debug("AgentTrackerPlugin registered with EventBus subscriptions");
  }
  start() {
    if (this._handlers.length === 0) {
      throw new Error("AgentTrackerPlugin: register() must be called before start()");
    }
    this.state = "running";
    log8.info("AgentTrackerPlugin started");
  }
  stop() {
    for (const unsub of this._unsubscribes) unsub();
    this._unsubscribes = [];
    this._handlers = [];
    this._services = null;
    this.state = "stopped";
    log8.debug("AgentTrackerPlugin stopped");
  }
  getWorkflowDefinitions() {
    return [];
  }
  getTriggerDefinitions() {
    return [];
  }
  getHandlers() {
    return [...this._handlers];
  }
  // ─── Event handlers ───────────────────────────────────────────────────────
  handleSpawned(event) {
    if (!this._services) {
      log8.warn("handleSpawned: plugin not registered, skipping");
      return;
    }
    const { agent_id, agent_type, workflow_id } = extractAgentData(event);
    if (!agent_id) {
      log8.debug("handleSpawned: no agent_id, skipping");
      return;
    }
    if (!agent_type) {
      log8.debug("handleSpawned: no agent_type, skipping", { agent_id });
      return;
    }
    const sessionId = typeof event.metadata?.["session_id"] === "string" ? event.metadata["session_id"] : "default";
    const resolvedWid = workflow_id ?? this.resolveWorkflowId(agent_id, sessionId);
    const tracked = {
      id: agent_id,
      type: agent_type,
      workflow_id: resolvedWid,
      status: "spawned",
      spawned_at: event.timestamp,
      finished_at: null,
      duration_ms: null
    };
    this._services.setState(AGENT_KEY(agent_id), tracked);
    this.addToIndex(agent_id);
    log8.info("Agent tracked: spawned", { agent_id, agent_type, workflow_id: resolvedWid });
  }
  handleFinished(event, status) {
    if (!this._services) {
      log8.warn(`handleFinished(${status}): plugin not registered, skipping`);
      return;
    }
    const { agent_id, agent_type, workflow_id } = extractAgentData(event);
    if (!agent_id) {
      log8.debug(`handleFinished(${status}): no agent_id, skipping`);
      return;
    }
    const existing = this._services.getState(AGENT_KEY(agent_id));
    if (!existing && !agent_type) {
      log8.debug(`handleFinished(${status}): untracked agent with no type, skipping`, { agent_id });
      return;
    }
    const now = event.timestamp;
    const sessionId = typeof event.metadata?.["session_id"] === "string" ? event.metadata["session_id"] : "default";
    const resolvedWid = existing?.workflow_id ?? workflow_id ?? this.resolveWorkflowId(agent_id, sessionId);
    const tracked = {
      id: agent_id,
      type: existing?.type ?? agent_type,
      workflow_id: resolvedWid,
      status,
      spawned_at: existing?.spawned_at ?? now,
      finished_at: now,
      duration_ms: existing ? now - existing.spawned_at : null
    };
    this._services.setState(AGENT_KEY(agent_id), tracked);
    this.addToIndex(agent_id);
    log8.info(`Agent tracked: ${status}`, {
      agent_id,
      agent_type: tracked.type,
      workflow_id: tracked.workflow_id,
      duration_ms: tracked.duration_ms
    });
  }
  // ─── Workflow ID resolution ────────────────────────────────────────────────
  resolveWorkflowId(agentId, sessionId) {
    if (!this._services) return null;
    const wid = this._services.getState(WRFC_MAP_KEY(sessionId, agentId));
    if (typeof wid === "string" && wid.length > 0) {
      log8.debug("Resolved workflow_id from WRFC state", { agent_id: agentId, workflow_id: wid });
      return wid;
    }
    return null;
  }
  // ─── Index management ─────────────────────────────────────────────────────
  addToIndex(agentId) {
    if (!this._services) return;
    const ids = this._services.getState(INDEX_KEY) ?? [];
    if (!ids.includes(agentId)) {
      this._services.setState(INDEX_KEY, [...ids, agentId]);
    }
  }
  // ─── Query methods ────────────────────────────────────────────────────────
  getAgent(agentId) {
    if (!this._services) return null;
    return this._services.getState(AGENT_KEY(agentId)) ?? null;
  }
  getAllAgents() {
    if (!this._services) return [];
    const ids = this._services.getState(INDEX_KEY) ?? [];
    const agents = [];
    for (const id of ids) {
      const agent = this._services.getState(AGENT_KEY(id));
      if (agent) agents.push(agent);
    }
    return agents;
  }
  getAgentsByStatus(status) {
    return this.getAllAgents().filter((a) => a.status === status);
  }
  getAgentsByWorkflow(workflowId) {
    return this.getAllAgents().filter((a) => a.workflow_id === workflowId);
  }
  getStats() {
    const agents = this.getAllAgents();
    const workflowIds = new Set(agents.map((a) => a.workflow_id).filter(Boolean));
    return {
      total: agents.length,
      active: agents.filter((a) => a.status === "spawned").length,
      completed: agents.filter((a) => a.status === "completed").length,
      failed: agents.filter((a) => a.status === "failed").length,
      workflows: workflowIds.size
    };
  }
};

// src/extensions/executor/tick-driver.ts
var import_node_child_process = require("node:child_process");
var logger44 = createLogger("tick-driver");
var TMUX_TIMEOUT_MS = 5e3;
var DAEMON_HEARTBEAT_ID = "daemon:auto_tick";
var DAEMON_HEARTBEAT_EVENT = "daemon:tick";
var TickDriver = class _TickDriver {
  static {
    __name(this, "TickDriver");
  }
  static SAFE_SESSION_NAME = /^[a-zA-Z0-9_.-]+$/;
  static SAFE_TICK_COMMAND = /^[a-zA-Z0-9\/_.-]+$/;
  timer;
  config;
  executorMode;
  timePlugin;
  externalPlugin;
  eventProcessor;
  staleWorkflowChecker;
  evalFailureCount = 0;
  constructor(deps) {
    this.config = deps.config;
    this.executorMode = deps.executorMode;
    this.timePlugin = deps.timePlugin;
    this.externalPlugin = deps.externalPlugin;
    this.eventProcessor = deps.eventProcessor;
    this.staleWorkflowChecker = deps.staleWorkflowChecker;
    this.timer = new Timer({
      callback: /* @__PURE__ */ __name(() => this.evaluate(), "callback"),
      intervalMs: deps.config.daemon.eval_interval_ms,
      label: "tick-driver"
    });
  }
  /**
   * Start the tick evaluation loop.
   *
   * In daemon mode:
   * - Requires auto_tick === true, tick_interval_ms > 0, tmux available
   * - Schedules daemon:auto_tick heartbeat in EventScheduler
   * - Returns early (no timer started) if guards fail
   *
   * In non-daemon mode:
   * - Starts unconditionally
   */
  start() {
    if (this.timer.isRunning()) return;
    const mode = this.executorMode.getMode();
    if (mode === "daemon") {
      if (!this.config.daemon.auto_tick) {
        logger44.info("tick driver disabled \u2014 auto_tick is false");
        return;
      }
      const intervalMs = this.config.daemon.tick_interval_ms;
      if (!intervalMs || intervalMs <= 0) {
        logger44.info("tick driver disabled \u2014 tick_interval_ms is 0 or unset");
        return;
      }
      if (!this.isTmuxAvailable()) {
        logger44.warn("tick driver not starting \u2014 tmux not available");
        return;
      }
      const sessionName = this.config.daemon.tmux_session_name;
      const tickCommand = this.config.daemon.tick_command;
      if (!_TickDriver.SAFE_SESSION_NAME.test(sessionName)) {
        logger44.warn("tick driver not starting \u2014 invalid tmux_session_name", { sessionName });
        return;
      }
      if (!_TickDriver.SAFE_TICK_COMMAND.test(tickCommand)) {
        logger44.warn("tick driver not starting \u2014 invalid tick_command", { tickCommand });
        return;
      }
      const scheduler = this.timePlugin.getScheduler();
      const existing = scheduler.getItem(DAEMON_HEARTBEAT_ID);
      if (existing && existing.interval_ms !== intervalMs) {
        scheduler.cancel(DAEMON_HEARTBEAT_ID);
        logger44.info("cancelled stale daemon heartbeat", {
          old_interval_ms: existing.interval_ms,
          new_interval_ms: intervalMs
        });
      }
      if (!scheduler.getItem(DAEMON_HEARTBEAT_ID)) {
        scheduler.scheduleHeartbeat({
          id: DAEMON_HEARTBEAT_ID,
          event_type: DAEMON_HEARTBEAT_EVENT,
          interval_ms: intervalMs
        });
      }
      logger44.info("tick driver starting in daemon mode", {
        eval_interval_ms: this.config.daemon.eval_interval_ms,
        tick_interval_ms: intervalMs,
        session: sessionName
      });
    } else {
      logger44.info("tick driver starting in engaged mode", {
        eval_interval_ms: this.config.daemon.eval_interval_ms
      });
    }
    this.timer.start();
  }
  /**
   * Stop the tick evaluation loop.
   * Cancels the timer and removes the daemon heartbeat from EventScheduler.
   */
  stop() {
    this.timer.stop();
    const removed = this.timePlugin.getScheduler().cancel(DAEMON_HEARTBEAT_ID);
    if (!removed) {
      logger44.debug("daemon heartbeat was already removed or never scheduled");
    }
    logger44.info("tick driver stopped");
  }
  /** Returns true if the eval timer is running. */
  isRunning() {
    return this.timer.isRunning();
  }
  /** Returns the cumulative number of evaluation failures for health monitoring. */
  getEvalFailureCount() {
    return this.evalFailureCount;
  }
  /**
   * Apply a new ExecutorConfig at runtime without restarting the process.
   *
   * Handles:
   * - auto_tick toggled off → stop (if running)
   * - auto_tick toggled on → start (if not running)
   * - tick_interval_ms changed while running → reschedule heartbeat
   * - eval_interval_ms changed → reconfigure timer
   */
  reconfigure(newConfig) {
    const wasRunning = this.isRunning();
    const oldAutoTick = this.config.daemon.auto_tick;
    const oldTickInterval = this.config.daemon.tick_interval_ms;
    const oldEvalInterval = this.config.daemon.eval_interval_ms;
    this.config = newConfig;
    const newAutoTick = newConfig.daemon.auto_tick;
    const newTickInterval = newConfig.daemon.tick_interval_ms;
    const newEvalInterval = newConfig.daemon.eval_interval_ms;
    if (newAutoTick && !wasRunning) {
      logger44.info("auto_tick enabled via reconfigure \u2014 starting");
      this.start();
    } else if (!newAutoTick && wasRunning) {
      logger44.info("auto_tick disabled via reconfigure \u2014 stopping");
      this.stop();
    } else if (wasRunning) {
      if (newTickInterval !== oldTickInterval) {
        this.rescheduleHeartbeat(newTickInterval);
      }
      if (newEvalInterval !== oldEvalInterval) {
        this.timer.reconfigure(newEvalInterval);
      }
    }
    logger44.debug("tick driver reconfigured", {
      old_auto_tick: oldAutoTick,
      new_auto_tick: newAutoTick,
      old_tick_interval_ms: oldTickInterval,
      new_tick_interval_ms: newTickInterval,
      old_eval_interval_ms: oldEvalInterval,
      new_eval_interval_ms: newEvalInterval
    });
  }
  /**
   * Cancel the existing daemon heartbeat and reschedule with a new interval.
   * Only called when the driver is already running in daemon mode.
   */
  rescheduleHeartbeat(intervalMs) {
    const scheduler = this.timePlugin.getScheduler();
    scheduler.cancel(DAEMON_HEARTBEAT_ID);
    scheduler.scheduleHeartbeat({
      id: DAEMON_HEARTBEAT_ID,
      event_type: DAEMON_HEARTBEAT_EVENT,
      interval_ms: intervalMs
    });
    logger44.info("daemon heartbeat rescheduled", { interval_ms: intervalMs });
  }
  /**
   * Called by the Timer on each eval cycle.
   *
   * Runs the full pipeline:
   * 1. timePlugin.onTick() — heartbeat + scheduled events
   * 2. externalPlugin.onTick() — file-drop scan
   * 3. eventProcessor.processBatch() — drain queue through triggers
   * 4. staleWorkflowChecker() — re-enqueue lost directives
   * 5. (daemon only) sendTick() if scheduled events fired
   */
  evaluate() {
    let timeResult = { heartbeat_emitted: false, scheduled_emitted: 0 };
    try {
      timeResult = this.timePlugin.onTick();
    } catch (err) {
      this.evalFailureCount++;
      const msg = err instanceof Error ? err.message : String(err);
      logger44.warn("timePlugin.onTick() error", { error: msg, eval_failures: this.evalFailureCount });
      if (this.evalFailureCount === 5 || this.evalFailureCount === 10) {
        logger44.warn("eval failure threshold crossed", { eval_failures: this.evalFailureCount });
      }
    }
    if (this.externalPlugin) {
      this.externalPlugin.onTick().catch((err) => {
        this.evalFailureCount++;
        const msg = err instanceof Error ? err.message : String(err);
        logger44.warn("externalPlugin.onTick() error", { error: msg, eval_failures: this.evalFailureCount });
        if (this.evalFailureCount === 5 || this.evalFailureCount === 10) {
          logger44.warn("eval failure threshold crossed", { eval_failures: this.evalFailureCount });
        }
      });
    }
    if (this.eventProcessor) {
      this.eventProcessor.processBatch().catch((err) => {
        this.evalFailureCount++;
        const msg = err instanceof Error ? err.message : String(err);
        logger44.warn("eventProcessor.processBatch() error", { error: msg, eval_failures: this.evalFailureCount });
        if (this.evalFailureCount === 5 || this.evalFailureCount === 10) {
          logger44.warn("eval failure threshold crossed", { eval_failures: this.evalFailureCount });
        }
      });
    }
    if (this.staleWorkflowChecker) {
      try {
        this.staleWorkflowChecker();
      } catch (err) {
        this.evalFailureCount++;
        const msg = err instanceof Error ? err.message : String(err);
        logger44.warn("staleWorkflowChecker error", { error: msg, eval_failures: this.evalFailureCount });
        if (this.evalFailureCount === 5 || this.evalFailureCount === 10) {
          logger44.warn("eval failure threshold crossed", { eval_failures: this.evalFailureCount });
        }
      }
    }
    if (timeResult.scheduled_emitted > 0 && this.executorMode.getMode() === "daemon") {
      logger44.debug("scheduled events fired \u2014 sending tmux tick", {
        scheduled_emitted: timeResult.scheduled_emitted
      });
      this.sendTick();
    }
  }
  /**
   * Send the tick command to the tmux session asynchronously.
   * Fire-and-forget — failures are logged as warnings without blocking the eval loop.
   */
  sendTick() {
    const sessionName = this.config.daemon.tmux_session_name;
    const tickCommand = this.config.daemon.tick_command;
    (0, import_node_child_process.execFile)(
      "tmux",
      ["send-keys", "-t", sessionName, tickCommand, "Enter"],
      { timeout: TMUX_TIMEOUT_MS },
      (err) => {
        if (err) {
          logger44.warn("failed to send tick via tmux", { error: err.message });
        } else {
          logger44.debug("tick sent via tmux", { session: sessionName });
        }
      }
    );
  }
  /**
   * Check whether tmux is available and has at least one active session.
   */
  isTmuxAvailable() {
    try {
      (0, import_node_child_process.execFileSync)("tmux", ["list-sessions"], { timeout: 2e3, stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }
};

// src/extensions/executor/executor-budget.ts
var logger45 = createLogger("executor-budget");
var BUDGET_STATE_KEY = "executor.budget.spending";
function checkCapThreshold(params) {
  let { warningFired } = params;
  let exceeded = false;
  const ratio = params.spent / params.cap;
  if (ratio >= params.warningThreshold && !warningFired) {
    warningFired = true;
    params.onWarning();
  }
  if (params.spent >= params.cap && !params.paused) {
    exceeded = true;
    params.onExceeded();
  }
  return { warningFired, exceeded };
}
__name(checkCapThreshold, "checkCapThreshold");
var ExecutorBudgetManager = class {
  static {
    __name(this, "ExecutorBudgetManager");
  }
  config;
  eventBus;
  spending;
  paused;
  warningFired;
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.paused = false;
    this.warningFired = { flat: false, daily: false };
    this.spending = {
      total_usd: 0,
      daily_usd: 0,
      daily_reset_at: timestamp(),
      last_updated: timestamp()
    };
  }
  /**
   * Record spending from an agent completion or progress report.
   * Adds to both total and daily accumulators, then checks thresholds and caps.
   */
  recordSpending(amount_usd) {
    if (amount_usd <= 0) return;
    this.spending.total_usd += amount_usd;
    this.spending.daily_usd += amount_usd;
    this.spending.last_updated = timestamp();
    logger45.debug("Spending recorded", {
      amount_usd,
      total_usd: this.spending.total_usd,
      daily_usd: this.spending.daily_usd
    });
    if (this.config.flat_cap_usd !== void 0 && this.config.flat_cap_usd > 0) {
      const flatResult = checkCapThreshold({
        spent: this.spending.total_usd,
        cap: this.config.flat_cap_usd,
        warningThreshold: this.config.warning_threshold,
        warningFired: this.warningFired.flat,
        capType: "flat",
        paused: this.paused,
        onWarning: /* @__PURE__ */ __name(() => {
          logger45.warn("Executor flat cap warning threshold reached", {
            spent_usd: this.spending.total_usd,
            cap_usd: this.config.flat_cap_usd,
            threshold: this.config.warning_threshold
          });
          this.eventBus.emit({
            id: generateEventId(),
            timestamp: timestamp(),
            type: "executor:budget_warning",
            source: { kind: "system" },
            payload: {
              type: "executor:budget_warning",
              data: {
                cap_type: "flat",
                spent_usd: this.spending.total_usd,
                cap_usd: this.config.flat_cap_usd ?? 0,
                threshold: this.config.warning_threshold
              }
            }
          });
        }, "onWarning"),
        onExceeded: /* @__PURE__ */ __name(() => {
          this.paused = true;
          logger45.warn("Executor flat cap exceeded \u2014 processing paused", {
            spent_usd: this.spending.total_usd,
            cap_usd: this.config.flat_cap_usd
          });
          this.eventBus.emit({
            id: generateEventId(),
            timestamp: timestamp(),
            type: "executor:budget_exceeded",
            source: { kind: "system" },
            payload: {
              type: "executor:budget_exceeded",
              data: {
                cap_type: "flat",
                spent_usd: this.spending.total_usd,
                cap_usd: this.config.flat_cap_usd ?? 0
              }
            }
          });
          this.eventBus.emit({
            id: generateEventId(),
            timestamp: timestamp(),
            type: "executor:paused",
            source: { kind: "system" },
            payload: {
              type: "executor:paused",
              data: { reason: "flat_cap_exceeded" }
            }
          });
        }, "onExceeded")
      });
      this.warningFired.flat = flatResult.warningFired;
      if (flatResult.exceeded) return;
    }
    if (this.config.daily_cap_usd !== void 0 && this.config.daily_cap_usd > 0) {
      const dailyResult = checkCapThreshold({
        spent: this.spending.daily_usd,
        cap: this.config.daily_cap_usd,
        warningThreshold: this.config.warning_threshold,
        warningFired: this.warningFired.daily,
        capType: "daily",
        paused: this.paused,
        onWarning: /* @__PURE__ */ __name(() => {
          logger45.warn("Executor daily cap warning threshold reached", {
            spent_usd: this.spending.daily_usd,
            cap_usd: this.config.daily_cap_usd,
            threshold: this.config.warning_threshold
          });
          this.eventBus.emit({
            id: generateEventId(),
            timestamp: timestamp(),
            type: "executor:budget_warning",
            source: { kind: "system" },
            payload: {
              type: "executor:budget_warning",
              data: {
                cap_type: "daily",
                spent_usd: this.spending.daily_usd,
                cap_usd: this.config.daily_cap_usd ?? 0,
                threshold: this.config.warning_threshold
              }
            }
          });
        }, "onWarning"),
        onExceeded: /* @__PURE__ */ __name(() => {
          this.paused = true;
          logger45.warn("Executor daily cap exceeded \u2014 processing paused", {
            spent_usd: this.spending.daily_usd,
            cap_usd: this.config.daily_cap_usd
          });
          this.eventBus.emit({
            id: generateEventId(),
            timestamp: timestamp(),
            type: "executor:budget_exceeded",
            source: { kind: "system" },
            payload: {
              type: "executor:budget_exceeded",
              data: {
                cap_type: "daily",
                spent_usd: this.spending.daily_usd,
                cap_usd: this.config.daily_cap_usd ?? 0
              }
            }
          });
          this.eventBus.emit({
            id: generateEventId(),
            timestamp: timestamp(),
            type: "executor:paused",
            source: { kind: "system" },
            payload: {
              type: "executor:paused",
              data: { reason: "daily_cap_exceeded" }
            }
          });
        }, "onExceeded")
      });
      this.warningFired.daily = dailyResult.warningFired;
    }
  }
  /**
   * Check if processing should continue.
   * Returns false if any cap is exceeded.
   */
  canProcess() {
    return !this.paused;
  }
  /** Get current spending state. */
  getSpending() {
    return { ...this.spending };
  }
  /**
   * Check and reset daily cap if reset_hour has passed.
   * Returns true if a reset occurred.
   */
  checkDailyReset() {
    const now = /* @__PURE__ */ new Date();
    const currentHour = now.getHours();
    const resetAt = new Date(this.spending.daily_reset_at);
    const lastResetDay = resetAt.toDateString();
    const today = now.toDateString();
    if (today !== lastResetDay && currentHour >= this.config.daily_reset_hour) {
      const previousDailySpent = this.spending.daily_usd;
      this.spending.daily_usd = 0;
      this.spending.daily_reset_at = timestamp();
      this.spending.last_updated = timestamp();
      this.warningFired.daily = false;
      if (this.paused) {
        const flatExceeded = this.config.flat_cap_usd !== void 0 && this.config.flat_cap_usd > 0 && this.spending.total_usd >= this.config.flat_cap_usd;
        if (!flatExceeded) {
          this.paused = false;
          this.eventBus.emit({
            id: generateEventId(),
            timestamp: timestamp(),
            type: "executor:resumed",
            source: { kind: "system" },
            payload: {
              type: "executor:resumed",
              data: { reason: "daily_budget_reset" }
            }
          });
        }
      }
      logger45.info("Daily budget reset", {
        previous_daily_spent: previousDailySpent,
        reset_hour: this.config.daily_reset_hour
      });
      this.eventBus.emit({
        id: generateEventId(),
        timestamp: timestamp(),
        type: "executor:budget_reset",
        source: { kind: "system" },
        payload: {
          type: "executor:budget_reset",
          data: {
            previous_daily_spent: previousDailySpent,
            reset_hour: this.config.daily_reset_hour
          }
        }
      });
      return true;
    }
    return false;
  }
  /**
   * Manually adjust budget configuration (operator override).
   * Can increase caps or change thresholds at runtime.
   */
  adjustBudget(adjustments) {
    const previousPaused = this.paused;
    Object.assign(this.config, adjustments);
    if (this.paused) {
      const flatOk = this.config.flat_cap_usd === void 0 || this.config.flat_cap_usd <= 0 || this.spending.total_usd < this.config.flat_cap_usd;
      const dailyOk = this.config.daily_cap_usd === void 0 || this.config.daily_cap_usd <= 0 || this.spending.daily_usd < this.config.daily_cap_usd;
      if (flatOk && dailyOk) {
        this.paused = false;
        this.eventBus.emit({
          id: generateEventId(),
          timestamp: timestamp(),
          type: "executor:resumed",
          source: { kind: "system" },
          payload: {
            type: "executor:resumed",
            data: { reason: "budget_adjusted" }
          }
        });
        logger45.info("Executor resumed after budget adjustment");
      }
    }
    logger45.info("Budget configuration adjusted", { adjustments, was_paused: previousPaused, now_paused: this.paused });
  }
  /** Persist spending state to the state store. */
  persist(stateStore) {
    stateStore.set(BUDGET_STATE_KEY, this.spending);
    logger45.debug("Budget state persisted");
  }
  /** Restore spending state from the state store. */
  restore(stateStore) {
    const stored = stateStore.get(BUDGET_STATE_KEY);
    if (stored && typeof stored === "object") {
      this.spending = {
        total_usd: typeof stored.total_usd === "number" ? stored.total_usd : 0,
        daily_usd: typeof stored.daily_usd === "number" ? stored.daily_usd : 0,
        daily_reset_at: typeof stored.daily_reset_at === "number" ? stored.daily_reset_at : timestamp(),
        last_updated: typeof stored.last_updated === "number" ? stored.last_updated : timestamp()
      };
      logger45.info("Budget state restored", {
        total_usd: this.spending.total_usd,
        daily_usd: this.spending.daily_usd
      });
      if (this.config.flat_cap_usd !== void 0 && this.config.flat_cap_usd > 0) {
        if (this.spending.total_usd >= this.config.flat_cap_usd) {
          this.paused = true;
          this.warningFired.flat = true;
          logger45.warn("Executor paused after state restore: flat cap exceeded");
        } else if (this.spending.total_usd >= this.config.flat_cap_usd * this.config.warning_threshold) {
          this.warningFired.flat = true;
        }
      }
      if (this.config.daily_cap_usd !== void 0 && this.config.daily_cap_usd > 0) {
        if (this.spending.daily_usd >= this.config.daily_cap_usd) {
          this.paused = true;
          this.warningFired.daily = true;
          logger45.warn("Executor paused after state restore: daily cap exceeded");
        } else if (this.spending.daily_usd >= this.config.daily_cap_usd * this.config.warning_threshold) {
          this.warningFired.daily = true;
        }
      }
    }
  }
};

// src/extensions/executor/context-clearer.ts
var import_node_child_process2 = require("node:child_process");
var logger46 = createLogger("context-clearer");
var TMUX_TIMEOUT_MS2 = 5e3;
var ContextClearer = class {
  static {
    __name(this, "ContextClearer");
  }
  config;
  constructor(config) {
    this.config = config;
  }
  /**
   * Clear context using the best available method.
   *
   * 1. Primary: tmux send-keys to inject /clear into the session
   * 2. Fallback: queue injection (handled on next tick)
   *
   * @returns Method used and success status.
   */
  async clearContext() {
    if (this.isTmuxAvailable()) {
      try {
        const success = await this.clearViaTmux();
        if (success) {
          logger46.info("Context cleared via tmux", { session: this.config.tmux_session_name });
          return { method: "tmux", success: true };
        }
        logger46.warn("tmux clear failed, falling back to queue injection");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger46.warn("tmux clear threw an error, falling back to queue injection", { error: msg });
      }
    } else {
      logger46.debug("tmux not available, using queue injection fallback");
    }
    logger46.info("Context clear queued via injection fallback");
    return { method: "queue_injection", success: true };
  }
  /**
   * Check if tmux is available.
   * Returns true if the TMUX environment variable is set (indicating we are
   * running inside a tmux session).
   */
  isTmuxAvailable() {
    return typeof process.env["TMUX"] === "string" && process.env["TMUX"].length > 0;
  }
  /**
   * Execute tmux send-keys to type /clear into the configured session.
   * Uses execSync with a 5-second timeout.
   *
   * @returns true if the command succeeded, false if it failed.
   */
  async clearViaTmux() {
    const sessionName = this.config.tmux_session_name;
    try {
      (0, import_node_child_process2.execFileSync)("tmux", ["send-keys", "-t", sessionName, "/clear"], { timeout: TMUX_TIMEOUT_MS2, stdio: "pipe" });
      (0, import_node_child_process2.execFileSync)("tmux", ["send-keys", "-t", sessionName, "Enter"], { timeout: TMUX_TIMEOUT_MS2, stdio: "pipe" });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger46.error("tmux send-keys failed", { session: sessionName, error: msg });
      return false;
    }
  }
};

// src/extensions/executor/daemon-tick-handler.ts
var logger47 = createLogger("daemon-tick-handler");
var DaemonTickHandler = class {
  static {
    __name(this, "DaemonTickHandler");
  }
  tickCount = 0;
  executorMode;
  budgetManager;
  eventBus;
  config;
  contextClearer;
  /** Returns the current core event queue depth. Wired after plugin init via setQueueDepthGetter(). */
  getQueueDepth = /* @__PURE__ */ __name(() => 0, "getQueueDepth");
  constructor(deps) {
    this.executorMode = deps.executorMode;
    this.budgetManager = deps.budgetManager;
    this.eventBus = deps.eventBus;
    this.config = deps.config;
    this.contextClearer = new ContextClearer(deps.config.daemon);
  }
  /**
   * Wire the live queue depth getter after the core event queue has been
   * initialised. Called from bootstrap after initializePlugins().
   */
  setQueueDepthGetter(getter) {
    this.getQueueDepth = getter;
  }
  /**
   * Process one daemon tick cycle.
   *
   * Flow:
   * 1. Check budget — abort if exceeded
   * 2. Check daily reset
   * 3. Emit executor:tick_received
   * 4. Build additionalContext with active workflows, pending events, memory state
   * 5. Emit executor:tick_completed
   * 6. If daemon mode: initiate context clearing
   */
  async handleTick() {
    const startMs = Date.now();
    this.tickCount++;
    const tickNumber = this.tickCount;
    logger47.info("Daemon tick received", { tick_number: tickNumber });
    if (!this.budgetManager.canProcess()) {
      logger47.warn("Tick aborted: budget exceeded", { tick_number: tickNumber });
      return {
        tick_number: tickNumber,
        events_processed: 0,
        duration_ms: Date.now() - startMs,
        context_cleared: false,
        budget_status: "exceeded"
      };
    }
    this.budgetManager.checkDailyReset();
    this.eventBus.emit({
      id: generateEventId(),
      timestamp: timestamp(),
      type: "executor:tick_received",
      source: { kind: "system" },
      payload: {
        type: "executor:tick_received",
        data: {
          tick_number: tickNumber,
          pending_events: this.getQueueDepth()
        }
      }
    });
    const spending = this.budgetManager.getSpending();
    let budgetStatus = "ok";
    if (this.config.budget.flat_cap_usd !== void 0 && this.config.budget.flat_cap_usd > 0 && spending.total_usd >= this.config.budget.flat_cap_usd * this.config.budget.warning_threshold || this.config.budget.daily_cap_usd !== void 0 && this.config.budget.daily_cap_usd > 0 && spending.daily_usd >= this.config.budget.daily_cap_usd * this.config.budget.warning_threshold) {
      budgetStatus = "warning";
    }
    const eventsProcessed = 0;
    const durationMs = Date.now() - startMs;
    this.eventBus.emit({
      id: generateEventId(),
      timestamp: timestamp(),
      type: "executor:tick_completed",
      source: { kind: "system" },
      payload: {
        type: "executor:tick_completed",
        data: {
          tick_number: tickNumber,
          events_processed: eventsProcessed,
          duration_ms: durationMs
        }
      }
    });
    let contextCleared = false;
    if (this.executorMode.shouldClearContext()) {
      try {
        const result = await this.contextClearer.clearContext();
        contextCleared = result.success;
        this.eventBus.emit({
          id: generateEventId(),
          timestamp: timestamp(),
          type: "executor:context_clearing",
          source: { kind: "system" },
          payload: {
            type: "executor:context_clearing",
            data: {
              method: result.method,
              success: result.success
            }
          }
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger47.error("Context clearing failed", { tick_number: tickNumber, error: msg });
      }
    }
    logger47.info("Daemon tick completed", {
      tick_number: tickNumber,
      events_processed: eventsProcessed,
      duration_ms: Date.now() - startMs,
      context_cleared: contextCleared,
      budget_status: budgetStatus
    });
    return {
      tick_number: tickNumber,
      events_processed: eventsProcessed,
      duration_ms: Date.now() - startMs,
      context_cleared: contextCleared,
      budget_status: budgetStatus
    };
  }
  /**
   * Build the additionalContext payload for daemon tick injection.
   * Includes: active workflows, pending events summary, memory state.
   *
   * Pending event count is wired via setQueueDepthGetter(). Active workflow
   * count remains 0 until WorkflowRegistry exposes activeCount().
   */
  buildTickContext() {
    const spending = this.budgetManager.getSpending();
    const canProcess = this.budgetManager.canProcess();
    const pendingEvents = this.getQueueDepth();
    const activeWorkflows = 0;
    return `--- Daemon Tick Context ---
Tick #${this.tickCount}
Mode: ${this.executorMode.getMode()}
Budget: total=$${spending.total_usd.toFixed(4)} daily=$${spending.daily_usd.toFixed(4)} (can_process=${canProcess})
Pending events: ${pendingEvents}
Active workflows: ${activeWorkflows}`;
  }
  /** Get cumulative tick count for metrics. */
  getTickCount() {
    return this.tickCount;
  }
  /**
   * Return the configured tick command string.
   * Used by the UserPromptSubmit handler to detect daemon ticks.
   */
  getTickCommand() {
    return this.config.daemon.tick_command;
  }
};

// src/extensions/executor/action-executor.ts
var logger48 = createLogger("action-executor");
var ActionExecutor = class {
  constructor(directiveQueue, agentWorkflowMap) {
    this.directiveQueue = directiveQueue;
    this.agentWorkflowMap = agentWorkflowMap;
  }
  static {
    __name(this, "ActionExecutor");
  }
  async execute(action, context) {
    switch (action.type) {
      case "send_message": {
        const params = action.params;
        const content = params.content;
        const target = typeof params.target === "string" ? params.target : "subagent_stop";
        const priority = typeof params.priority === "number" ? params.priority : 20;
        if (typeof content !== "string" || content.length === 0) {
          logger48.error("ActionExecutor: send_message action missing content", {
            action_type: action.type,
            params_keys: Object.keys(action.params || {}),
            context
          });
          return;
        }
        const workflowId = typeof context["workflow_id"] === "string" ? context["workflow_id"] : void 0;
        const sessionId = typeof context["session_id"] === "string" && context["session_id"].length > 0 ? context["session_id"] : "default";
        const directive = {
          type: "inject_system_message",
          content,
          priority,
          source: "wrfc",
          ...workflowId !== void 0 && { workflow_id: workflowId }
        };
        try {
          this.directiveQueue.enqueue(target, directive);
          logger48.info("ActionExecutor: directive enqueued successfully", {
            target,
            priority,
            workflow_id: workflowId,
            content_length: content.length
          });
          if (this.agentWorkflowMap && params.agent_type && workflowId) {
            const agentType = params.agent_type;
            this.agentWorkflowMap.addPendingBind(agentType, workflowId, sessionId);
            if (!agentType.startsWith("goodvibes:")) {
              this.agentWorkflowMap.addPendingBind(`goodvibes:${agentType}`, workflowId, sessionId);
            }
            logger48.info("ActionExecutor: pending binds registered for spawn", {
              agent_type: agentType,
              workflow_id: workflowId
            });
          }
        } catch (err) {
          logger48.error("ActionExecutor: failed to enqueue directive", {
            target,
            priority,
            workflow_id: workflowId,
            error: err instanceof Error ? err.message : String(err)
          });
        }
        break;
      }
      default: {
        logger48.warn("ActionExecutor: unhandled action type", {
          type: action.type,
          context
        });
        break;
      }
    }
  }
};

// src/extensions/executor/subsystem.ts
var logger49 = createLogger("executor-subsystem");
function createExecutorSubsystem(config, eventBus) {
  try {
    const executorMode = new ExecutorModeManager(config.executor, eventBus);
    const mode = executorMode.getMode();
    const executorBudget = new ExecutorBudgetManager(config.executor.budget, eventBus);
    const daemonTickHandler = new DaemonTickHandler({
      executorMode,
      budgetManager: executorBudget,
      eventBus,
      config: config.executor
    });
    eventBus.emit({
      id: generateEventId(),
      timestamp: timestamp(),
      type: "executor:mode_set",
      source: { kind: "system" },
      payload: {
        type: "executor:mode_set",
        data: {
          mode,
          previous_mode: mode,
          detection_method: executorMode.getDetectionMethod()
        }
      }
    });
    logger49.info("Executor subsystem created", {
      mode,
      detection_method: executorMode.getDetectionMethod()
    });
    return { executorMode, executorBudget, daemonTickHandler };
  } catch (err) {
    logger49.warn("Executor subsystem creation failed \u2014 continuing without executor", {
      err: toErrorMessage(err)
    });
    return null;
  }
}
__name(createExecutorSubsystem, "createExecutorSubsystem");

// src/extensions/adapters/registry.ts
var logger50 = createLogger("adapter-registry");

// src/extensions/adapters/time-adapter.ts
var TimeAdapter = class {
  constructor(plugin) {
    this.plugin = plugin;
  }
  static {
    __name(this, "TimeAdapter");
  }
  kind = "time";
  /**
   * Delegates to TimePlugin.onTick().
   * Heartbeat and scheduled events are enqueued by the plugin into the
   * shared event queue — no additional normalization is needed here since
   * TimePlugin already uses createTimeEvent() from extensions/events/factories.
   */
  onTick() {
    return this.plugin.onTick();
  }
  /**
   * Returns a SchedulerAccessor view of the underlying EventScheduler.
   * The TickDriver uses this to schedule/cancel the daemon heartbeat
   * without needing a direct reference to EventScheduler.
   */
  getScheduler() {
    const scheduler = this.plugin.getScheduler();
    return {
      getItem: /* @__PURE__ */ __name((id) => scheduler.getItem(id), "getItem"),
      cancel: /* @__PURE__ */ __name((id) => scheduler.cancel(id), "cancel"),
      scheduleHeartbeat: /* @__PURE__ */ __name((params) => {
        scheduler.scheduleHeartbeat(params);
      }, "scheduleHeartbeat")
    };
  }
};
function createTimeAdapter(plugin) {
  return new TimeAdapter(plugin);
}
__name(createTimeAdapter, "createTimeAdapter");

// src/extensions/adapters/external-adapter.ts
var ExternalAdapter = class {
  constructor(plugin) {
    this.plugin = plugin;
  }
  static {
    __name(this, "ExternalAdapter");
  }
  kind = "external";
  /**
   * Delegates to ExternalPlugin.initialize().
   * Ensures the file-drop directories exist before the first tick.
   */
  async initialize() {
    await this.plugin.initialize();
  }
  /**
   * Delegates to ExternalPlugin.onTick().
   * The plugin scans the incoming directory, normalizes JSON drop files via
   * the NormalizerRegistry, and enqueues ExternalEvents into the shared queue.
   * No additional normalization is needed here.
   */
  async onTick() {
    return this.plugin.onTick();
  }
};
function createExternalAdapter(plugin) {
  return new ExternalAdapter(plugin);
}
__name(createExternalAdapter, "createExternalAdapter");

// src/extensions/ipc/setup.ts
var import_node_fs13 = require("node:fs");
var import_node_crypto4 = require("node:crypto");
var import_node_path13 = require("node:path");

// src/shared/ipc/ipc-server.ts
var net = __toESM(require("node:net"), 1);
var import_node_fs11 = require("node:fs");
var import_node_path11 = require("node:path");

// src/shared/ipc/protocol.ts
var logger51 = createLogger("ipc-protocol");
var VALID_IPC_MESSAGE_TYPES = /* @__PURE__ */ new Set([
  "hook_event",
  "query",
  "state_update",
  "heartbeat"
]);
function validateIPCMessage(obj) {
  if (typeof obj !== "object" || obj === null) return false;
  const msg = obj;
  if (typeof msg["type"] !== "string" || !VALID_IPC_MESSAGE_TYPES.has(msg["type"])) return false;
  if (typeof msg["id"] !== "string" || msg["id"].length === 0) return false;
  switch (msg["type"]) {
    case "hook_event":
      return typeof msg["hook_name"] === "string" && msg["hook_name"].length > 0 && typeof msg["hook_input"] === "object" && msg["hook_input"] !== null && !Array.isArray(msg["hook_input"]) && typeof msg["timestamp"] === "string";
    case "query":
      return typeof msg["query"] === "object" && msg["query"] !== null && !Array.isArray(msg["query"]) && typeof msg["query"]["kind"] === "string";
    case "state_update":
      return typeof msg["updates"] === "object" && msg["updates"] !== null && !Array.isArray(msg["updates"]);
    case "heartbeat":
      return true;
    default:
      logger51.warn("Unrecognised IPC message type", {
        type: typeof msg["type"] === "string" ? msg["type"] : typeof msg["type"]
      });
      return false;
  }
}
__name(validateIPCMessage, "validateIPCMessage");

// src/shared/ipc/ipc-server.ts
var logger52 = createLogger("ipc-server");
var CONNECTION_TIMEOUT_MS = 5e3;
var MAX_MESSAGE_SIZE = 1048576;
var RATE_LIMIT_MAX = 100;
var RATE_LIMIT_WINDOW_MS2 = 1e3;
function isResponseEnvelope(r) {
  return r !== null && typeof r === "object" && "response" in r && !("status" in r);
}
__name(isResponseEnvelope, "isResponseEnvelope");
var IPCServer = class {
  static {
    __name(this, "IPCServer");
  }
  /** The underlying Node.js TCP/socket server. */
  server = null;
  /** Absolute path to the Unix domain socket file. */
  socketPath;
  /** Application-level handler for decoded IPC messages. */
  handler = null;
  /** Set of all currently open client sockets (for clean shutdown). */
  connections = /* @__PURE__ */ new Set();
  /** Optional callback invoked after each socket write with write success/failure. */
  writeResultCallback;
  /** Tracks in-flight holdIds per socket for async write confirmation and error recovery. */
  inFlightHolds = /* @__PURE__ */ new WeakMap();
  /** Circular buffer of recent message timestamps for O(1) rate limiting. */
  recentMessages = new Array(RATE_LIMIT_MAX).fill(0);
  /** Next write position in the circular buffer. */
  msgHead = 0;
  /** Current count of entries in the buffer. */
  msgCount = 0;
  /**
   * @param socketPath - Absolute path for the Unix domain socket file.
   *   The parent directory is created automatically if it does not exist.
   */
  constructor(socketPath) {
    this.socketPath = socketPath;
  }
  // ─── Public API ───────────────────────────────────────────────────────────
  /**
   * Register the message handler.
   *
   * Must be called before {@link listen}. Only one handler is supported;
   * subsequent calls replace the previous one.
   *
   * @param handler - Async function that receives a decoded {@link IPCMessage}
   *   and returns an {@link IPCResponse}.
   */
  onMessage(handler) {
    this.handler = handler;
  }
  /**
   * Register a callback to be notified after each socket write attempt.
   *
   * Used by the hold-and-release pattern: on success, call `releaseHold(holdId)`;
   * on failure, call `reEnqueueHold(holdId)` to recover the directives.
   *
   * @param cb - Callback receiving the holdId and write success flag.
   */
  setWriteResultCallback(cb) {
    this.writeResultCallback = cb;
  }
  /**
   * Start listening for incoming connections on the configured socket path.
   *
   * Steps:
   * 1. Create the socket directory if it does not exist.
   * 2. Remove any stale socket file left by a previous process.
   * 3. Bind and start listening.
   *
   * @throws If the server cannot bind to the socket path.
   */
  async listen() {
    const dir = (0, import_node_path11.dirname)(this.socketPath);
    (0, import_node_fs11.mkdirSync)(dir, { recursive: true, mode: 448 });
    (0, import_node_fs11.chmodSync)(dir, 448);
    if ((0, import_node_fs11.existsSync)(this.socketPath)) {
      try {
        (0, import_node_fs11.unlinkSync)(this.socketPath);
        logger52.debug("Removed stale socket file", { path: this.socketPath });
      } catch (err) {
        logger52.warn("Could not remove stale socket file", {
          path: this.socketPath,
          err: toErrorMessage(err)
        });
      }
    }
    this.server = net.createServer((socket) => this.handleConnection(socket));
    this.server.on("error", (err) => {
      logger52.error("IPC server error", { err: err.message });
    });
    return new Promise((resolve2, reject) => {
      const srv = this.server;
      if (!srv) {
        reject(new IPCError("IPC server was not created"));
        return;
      }
      srv.once("error", reject);
      srv.listen(this.socketPath, () => {
        (0, import_node_fs11.chmodSync)(this.socketPath, 384);
        logger52.info("IPC server listening", { path: this.socketPath });
        srv.removeListener("error", reject);
        resolve2();
      });
    });
  }
  /**
   * Stop accepting new connections and close all existing ones.
   *
   * Destroys all tracked sockets immediately, then waits for the server
   * to finish closing before resolving.
   */
  async close() {
    logger52.info("Closing IPC server", {
      path: this.socketPath,
      connections: this.connections.size
    });
    for (const socket of this.connections) {
      const holdId = this.inFlightHolds.get(socket);
      if (holdId && this.writeResultCallback) {
        this.inFlightHolds.delete(socket);
        this.writeResultCallback(holdId, false);
      }
    }
    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();
    return new Promise((resolve2) => {
      if (!this.server) {
        resolve2();
        return;
      }
      const srv = this.server;
      this.server = null;
      srv.close(() => {
        this.removeSocketFile();
        logger52.info("IPC server closed");
        resolve2();
      });
    });
  }
  /**
   * The number of currently open client connections.
   */
  get clientCount() {
    return this.connections.size;
  }
  /**
   * The absolute path of the Unix domain socket file.
   */
  getSocketPath() {
    return this.socketPath;
  }
  // ─── Private helpers ───────────────────────────────────────────────────────
  /**
   * Handle a new incoming client connection.
   *
   * Reads a complete newline-delimited JSON message, dispatches it to the
   * handler, writes the JSON response, then closes the socket.
   *
   * @param socket - The accepted client socket.
   */
  handleConnection(socket) {
    this.connections.add(socket);
    if (this.isRateLimited()) {
      logger52.warn("IPC rate limit exceeded \u2014 rejecting connection", {
        limit: RATE_LIMIT_MAX,
        window_ms: RATE_LIMIT_WINDOW_MS2
      });
      const rateLimitResponse = {
        id: "rate_limited",
        status: "error",
        error: `Rate limit exceeded: max ${RATE_LIMIT_MAX} messages per second`
      };
      try {
        socket.end(JSON.stringify(rateLimitResponse) + "\n", "utf-8");
      } catch {
        socket.destroy();
      }
      this.connections.delete(socket);
      return;
    }
    this.recordMessage();
    logger52.debug("IPC client connected", { connections: this.connections.size });
    let idleTimer;
    socket.once("close", () => {
      clearTimeout(idleTimer);
      this.connections.delete(socket);
      logger52.debug("IPC client disconnected", { connections: this.connections.size });
    });
    socket.on("error", (err) => {
      clearTimeout(idleTimer);
      logger52.warn("IPC socket error", { err: err.message });
      const holdId = this.inFlightHolds.get(socket);
      if (holdId && this.writeResultCallback) {
        this.inFlightHolds.delete(socket);
        this.writeResultCallback(holdId, false);
      }
      this.connections.delete(socket);
      socket.destroy();
    });
    idleTimer = setTimeout(() => {
      logger52.warn("IPC connection timed out \u2014 closing", { timeout_ms: CONNECTION_TIMEOUT_MS });
      socket.destroy();
    }, CONNECTION_TIMEOUT_MS);
    const chunks = [];
    let rawBytes = 0;
    socket.on("data", (chunk) => {
      rawBytes += chunk.length;
      if (rawBytes > MAX_MESSAGE_SIZE) {
        logger52.warn("IPC message size limit exceeded \u2014 closing connection", {
          size_bytes: rawBytes,
          max_bytes: MAX_MESSAGE_SIZE
        });
        socket.destroy();
        return;
      }
      const newlinePos = chunk.indexOf(10);
      if (newlinePos === -1) {
        chunks.push(chunk);
        return;
      }
      chunks.push(chunk.subarray(0, newlinePos));
      const line = Buffer.concat(chunks).toString("utf-8");
      clearTimeout(idleTimer);
      socket.pause();
      this.processMessage(socket, line);
    });
  }
  /**
   * Parse and dispatch a raw JSON line, then write the response.
   *
   * @param socket - The client socket to write the response to.
   * @param line   - Raw JSON string (without the trailing newline).
   */
  processMessage(socket, line) {
    let message;
    try {
      const parsed = safeJsonParse(line, null);
      if (!validateIPCMessage(parsed)) {
        logger52.warn("IPC message failed schema validation \u2014 dropping", {
          type: typeof parsed === "object" && parsed !== null ? parsed["type"] : typeof parsed
        });
        const validationErrorResponse = {
          id: typeof parsed === "object" && parsed !== null ? String(parsed["id"] ?? "unknown") : "unknown",
          status: "error",
          error: "Invalid message schema"
        };
        this.writeResponse(socket, validationErrorResponse);
        return;
      }
      message = parsed;
    } catch {
      return;
    }
    if (!this.handler) {
      logger52.warn("No IPC message handler registered", { msg_type: message.type });
      const noHandlerResponse = {
        id: message.id,
        status: "error",
        error: "No handler registered"
      };
      this.writeResponse(socket, noHandlerResponse);
      return;
    }
    logger52.debug("Dispatching IPC message", { id: message.id, type: message.type });
    this.handler(message).then((result) => {
      if (isResponseEnvelope(result)) {
        this.writeResponse(socket, result.response, result.holdId);
      } else {
        this.writeResponse(socket, result);
      }
    }).catch((err) => {
      logger52.error("IPC handler threw an error", {
        id: message.id,
        err: toErrorMessage(err)
      });
      const errResponse = {
        id: message.id,
        status: "error",
        error: toErrorMessage(err)
      };
      this.writeResponse(socket, errResponse);
    });
  }
  /**
   * Serialise and write an {@link IPCResponse} to the client socket, then
   * close the socket half (FIN).
   *
   * @param socket   - The client socket.
   * @param response - The response to send.
   */
  writeResponse(socket, response, holdId) {
    const payload = JSON.stringify(response) + "\n";
    if (holdId) {
      this.inFlightHolds.set(socket, holdId);
    }
    try {
      socket.end(payload, "utf-8", () => {
        if (holdId && this.writeResultCallback) {
          this.inFlightHolds.delete(socket);
          this.writeResultCallback(holdId, true);
        }
      });
    } catch (err) {
      logger52.warn("Failed to write IPC response", {
        id: response.id,
        err: toErrorMessage(err)
      });
      if (holdId && this.writeResultCallback) {
        this.inFlightHolds.delete(socket);
        this.writeResultCallback(holdId, false);
      }
      socket.destroy();
    }
  }
  /**
   * Check if the current message rate exceeds the limit.
   */
  isRateLimited() {
    if (this.msgCount < RATE_LIMIT_MAX) return false;
    const oldest = this.recentMessages[(this.msgHead - this.msgCount + RATE_LIMIT_MAX) % RATE_LIMIT_MAX];
    return Date.now() - oldest < RATE_LIMIT_WINDOW_MS2;
  }
  /**
   * Record a message timestamp and prune old entries.
   */
  recordMessage() {
    this.recentMessages[this.msgHead] = Date.now();
    this.msgHead = (this.msgHead + 1) % RATE_LIMIT_MAX;
    if (this.msgCount < RATE_LIMIT_MAX) this.msgCount++;
  }
  /**
   * Remove the socket file from the filesystem, ignoring errors.
   */
  removeSocketFile() {
    try {
      if ((0, import_node_fs11.existsSync)(this.socketPath)) {
        (0, import_node_fs11.unlinkSync)(this.socketPath);
        logger52.debug("Socket file removed", { path: this.socketPath });
      }
    } catch (err) {
      logger52.warn("Could not remove socket file", {
        path: this.socketPath,
        err: toErrorMessage(err)
      });
    }
  }
};

// src/extensions/ipc/ipc-router.ts
var import_node_fs12 = require("node:fs");
var import_node_path12 = require("node:path");
var logger53 = createLogger("ipc-router");
var IPCRouter = class {
  static {
    __name(this, "IPCRouter");
  }
  eventBus;
  triggerRegistry;
  workflowEngine;
  agentCoordinator;
  directiveQueue;
  socketPath;
  stateDir;
  agentWorkflowMap;
  /** Optional CoreStateStore for clearing stale WRFC state on session:started. */
  stateStore;
  /** Optional HookProcessor for bridging hook events to the plugin layer. */
  hookProcessor;
  /** Optional ExecutorModeManager for get_executor_mode queries. */
  executorMode;
  /** Optional ExecutorBudgetManager for get_executor_budget queries. */
  executorBudget;
  /** Optional DaemonTickHandler for process_tick queries. */
  daemonTickHandler;
  wrfcConfigStore;
  /** Optional callback for synchronous in-band hook event processing. */
  processHookEvent;
  /** Session IDs that have been registered via session:started events. */
  registeredSessions = /* @__PURE__ */ new Set();
  /**
   * Optional resolver that maps an agent_id to its bound workflow_id.
   * Injected after construction via {@link setAgentWorkflowResolver}.
   */
  agentWorkflowResolver;
  constructor(deps) {
    this.eventBus = deps.eventBus;
    this.triggerRegistry = deps.triggerRegistry;
    this.workflowEngine = deps.workflowEngine;
    this.agentCoordinator = deps.agentCoordinator;
    this.directiveQueue = deps.directiveQueue;
    this.socketPath = deps.socketPath;
    this.stateDir = deps.stateDir;
    this.agentWorkflowMap = deps.agentWorkflowMap ?? null;
    this.stateStore = deps.stateStore ?? null;
    this.hookProcessor = deps.hookProcessor ?? null;
    this.executorMode = deps.executorMode ?? null;
    this.executorBudget = deps.executorBudget ?? null;
    this.daemonTickHandler = deps.daemonTickHandler ?? null;
    this.wrfcConfigStore = deps.wrfcConfigStore ?? null;
    this.processHookEvent = deps.processHookEvent ?? null;
  }
  /**
   * Inject a resolver that maps agent_id → workflow_id.
   *
   * When set, `get_directives` queries that carry an `agent_id` will resolve
   * the corresponding workflow_id and use it to drain only that workflow's
   * directives, preventing cross-workflow directive delivery in parallel runs.
   *
   * @param resolver - Function returning the bound workflow_id or null.
   */
  setAgentWorkflowResolver(resolver) {
    this.agentWorkflowResolver = resolver;
  }
  /**
   * Remove all session-keyed pointer files written by this router.
   * Called during shutdown to prevent stale session pointers.
   */
  removeSessionPointers() {
    if (!this.stateDir) return;
    for (const sessionId of this.registeredSessions) {
      const pointerFile = (0, import_node_path12.join)(this.stateDir, `runtime-${sessionId}.socket`);
      try {
        (0, import_node_fs12.unlinkSync)(pointerFile);
        logger53.debug("Session pointer file removed", { sessionId });
      } catch (err) {
        if (err.code !== "ENOENT") {
          logger53.warn("Could not remove session pointer file", {
            sessionId,
            err: toErrorMessage(err)
          });
        }
      }
    }
    this.registeredSessions.clear();
  }
  /**
   * Drains directives from the queue and composes a system message string.
   *
   * Used by get_directives query handler via buildDirectivesResponse.
   * Returns both the joined message string and the raw directive array.
   *
   * @param workflowId - Optional workflow ID for per-workflow isolation.
   *   When provided, only directives with a matching workflow_id are drained.
   *   When omitted, all directives for the target are drained (backward compat).
   */
  drainDirectiveMessages(workflowId) {
    const result = this.directiveQueue?.holdDrain("subagent_stop", workflowId) ?? { holdId: "", directives: [] };
    const message = result.directives.filter((d) => d.type === "inject_system_message").sort((a, b) => b.priority - a.priority).map((d) => d.content).join("\n\n");
    return { message, directives: result.directives, holdId: result.holdId };
  }
  /**
   * Build the IPC response for get_directives queries.
   * This helper centralises the drain + response-envelope construction logic.
   *
   * @param msgId - The IPC message ID to correlate the response.
   * @param agentId - Optional agent ID from the query. When provided and a
   *   resolver is registered, it is used to scope the drain to that agent's
   *   workflow, preventing cross-workflow directive delivery.
   */
  buildDirectivesResponse(msgId, agentId) {
    let workflowId;
    if (agentId && this.agentWorkflowResolver) {
      const resolved = this.agentWorkflowResolver(agentId);
      if (typeof resolved === "string" && resolved.length > 0) {
        workflowId = resolved;
      } else {
        return {
          response: {
            id: msgId,
            status: "ok",
            data: { kind: "system_message", message: "", directives: [] }
          }
        };
      }
    }
    const { message, directives, holdId } = this.drainDirectiveMessages(workflowId);
    return {
      response: {
        id: msgId,
        status: "ok",
        data: { kind: "system_message", message, directives }
      },
      // Convert empty holdId (from empty drain) to undefined so writeResponse skips callback
      holdId: holdId || void 0
    };
  }
  /**
   * Handle hook_event messages: emit on EventBus, evaluate triggers, write
   * session pointers, store WRFC config, and optionally route through HookProcessor.
   */
  async handleHookEvent(msg) {
    const emittedEvent = {
      id: msg.id,
      timestamp: new Date(msg.timestamp).getTime(),
      type: msg.hook_name,
      source: { kind: "internal", hook_name: msg.hook_name },
      payload: {
        type: msg.hook_name,
        data: msg.hook_input
      },
      metadata: {
        session_id: msg.hook_input?.session_id ?? "",
        sequence: 0,
        version: 1
      },
      priority: 0
    };
    this.eventBus.emit(emittedEvent);
    if (this.processHookEvent) {
      try {
        await this.processHookEvent(emittedEvent);
      } catch (err) {
        logger53.warn("processHookEvent callback failed", { error: toErrorMessage(err) });
      }
    }
    if (msg.hook_name === "session:started" && this.triggerRegistry) {
      this.triggerRegistry.resetAllFireCounts();
    }
    if (msg.hook_name === "session:started") {
      const sessionId = msg.hook_input?.session_id;
      if (this.stateStore && typeof sessionId === "string" && sessionId.length > 0) {
        const sessionKeys = this.stateStore.keys(`wrfc.sessions.${sessionId}`);
        for (const key of sessionKeys) {
          this.stateStore.delete(key);
        }
        if (sessionKeys.length > 0) {
          logger53.info("Session cleanup: cleared stale WRFC state for session", {
            session_id: sessionId,
            keys_deleted: sessionKeys.length
          });
        }
        const defaultKeys = this.stateStore.keys("wrfc.sessions.default");
        for (const key of defaultKeys) {
          this.stateStore.delete(key);
        }
        if (defaultKeys.length > 0) {
          logger53.info("Session cleanup: cleared stale WRFC state from default namespace", {
            keys_deleted: defaultKeys.length
          });
        }
      }
      if (this.agentWorkflowMap && typeof sessionId === "string" && sessionId.length > 0) {
        this.agentWorkflowMap.clearForSession(sessionId);
      }
      this.directiveQueue?.clear();
      if (this.socketPath && this.stateDir && typeof sessionId === "string" && sessionId.length > 0) {
        try {
          const pointerFile = (0, import_node_path12.join)(this.stateDir, `runtime-${sessionId}.socket`);
          (0, import_node_fs12.writeFileSync)(pointerFile, this.socketPath, "utf-8");
          this.registeredSessions.add(sessionId);
          logger53.info("Session pointer file written", { sessionId, pointer: pointerFile });
        } catch (err) {
          logger53.warn("Failed to write session pointer file", {
            sessionId,
            err: toErrorMessage(err)
          });
        }
      }
    }
    if (msg.hook_name === "config:loaded" && this.directiveQueue) {
      const wrfcConfig = msg.hook_input?.wrfc;
      if (wrfcConfig && typeof wrfcConfig === "object" && !Array.isArray(wrfcConfig)) {
        const validated = validateWRFCConfig(wrfcConfig);
        if (Object.keys(validated).length > 0) {
          this.wrfcConfigStore?.set(validated);
          logger53.debug("WRFC config stored from config:loaded event", { validated });
        }
      }
    }
    if (this.hookProcessor) {
      try {
        const hookInput = typeof msg.hook_input === "object" && msg.hook_input !== null ? msg.hook_input : {};
        await this.hookProcessor.process(msg.hook_name, hookInput);
      } catch (err) {
        logger53.warn("IPC hook_event: HookProcessor error", {
          hookName: msg.hook_name,
          error: toErrorMessage(err)
        });
      }
    }
    return { id: msg.id, status: "ok", data: { kind: "ack" } };
  }
  /**
   * Handle query messages: dispatch to the appropriate query-kind handler
   * and return the typed response.
   */
  async handleQuery(msg) {
    const q = msg.query;
    if (q.kind === "get_directives") {
      return this.buildDirectivesResponse(msg.id, q.agent_id);
    }
    if (q.kind === "get_system_message") {
      return {
        response: {
          id: msg.id,
          status: "ok",
          data: { kind: "system_message", message: "", directives: [] }
        }
      };
    }
    if (q.kind === "get_workflow_state") {
      const instance = this.workflowEngine?.get(q.workflow_id);
      return {
        id: msg.id,
        status: "ok",
        data: { kind: "workflow_state", instance: instance ?? {} }
      };
    }
    if (q.kind === "get_agent_status") {
      const agentId = q.agent_id;
      const agent = agentId ? this.agentCoordinator?.getAgent(agentId) ?? null : null;
      return {
        id: msg.id,
        status: "ok",
        data: { kind: "agent_status", agent: agent ?? {} }
      };
    }
    if (q.kind === "should_block_tool") {
      return {
        id: msg.id,
        status: "ok",
        data: { kind: "tool_decision", allow: true }
      };
    }
    if (q.kind === "get_context_injection") {
      return {
        id: msg.id,
        status: "ok",
        data: { kind: "context_injection", context: "", priority: 0 }
      };
    }
    if (q.kind === "resolve_pending_bind") {
      const agentType = q.agent_type;
      if (!agentType) {
        return { id: msg.id, status: "ok", data: { kind: "pending_bind", workflow_id: null } };
      }
      const sessionId = typeof q.session_id === "string" && q.session_id.length > 0 ? q.session_id : void 0;
      const workflowId = this.agentWorkflowMap?.resolvePendingBind(agentType, sessionId) ?? null;
      return {
        id: msg.id,
        status: "ok",
        data: { kind: "pending_bind", workflow_id: workflowId }
      };
    }
    if (q.kind === "consume_pending_bind") {
      const workflowId = q.workflow_id;
      if (!workflowId) {
        return { id: msg.id, status: "ok", data: { kind: "pending_bind_consumed", removed: 0 } };
      }
      const removed = this.agentWorkflowMap?.consumePendingBindsForWorkflow(workflowId) ?? 0;
      return { id: msg.id, status: "ok", data: { kind: "pending_bind_consumed", removed } };
    }
    if (q.kind === "get_executor_mode") {
      const mode = this.executorMode?.getMode() ?? "engaged";
      return { id: msg.id, status: "ok", data: { kind: "executor_mode", mode } };
    }
    if (q.kind === "get_executor_budget") {
      const spending = this.executorBudget?.getSpending() ?? null;
      const canProcess = this.executorBudget?.canProcess() ?? true;
      return {
        id: msg.id,
        status: "ok",
        data: { kind: "executor_budget", spending, can_process: canProcess }
      };
    }
    if (q.kind === "process_tick") {
      const result = await this.daemonTickHandler?.handleTick();
      return {
        id: msg.id,
        status: "ok",
        // TickResult serialized to JSON for IPC transport — type erased intentionally
        data: { kind: "tick_result", result }
      };
    }
    logger53.warn("Unhandled query kind", { kind: q.kind });
    return { id: msg.id, status: "ok", data: { kind: "ack" } };
  }
  /**
   * Handle state_update messages.
   *
   * State updates are not yet implemented — returns an explicit error response
   * rather than silently acknowledging the message and discarding the updates.
   */
  handleStateUpdate(msg) {
    logger53.debug("IPC state_update received (not implemented)", { id: msg.id });
    return { id: msg.id, status: "error", error: "state_update not yet implemented" };
  }
  /**
   * Handle heartbeat messages: return a generic acknowledgement.
   */
  handleHeartbeat(msg) {
    return { id: msg.id, status: "ok", data: { kind: "ack" } };
  }
  /**
   * Route an incoming IPC message to the appropriate handler and return a
   * response. This method is bound and passed directly to IPCServer.onMessage().
   *
   * @param msg - The validated IPC message received from a hook script.
   * @returns A promise resolving to the IPCResponse to send back.
   */
  async route(msg) {
    logger53.debug("IPC message received", { id: msg.id, type: msg.type });
    this.directiveQueue?.sweepStaleHolds(HOLD_TTL_MS);
    switch (msg.type) {
      case "hook_event":
        return this.handleHookEvent(msg);
      case "query":
        return this.handleQuery(msg);
      case "state_update":
        return this.handleStateUpdate(msg);
      case "heartbeat":
        return this.handleHeartbeat(msg);
      default: {
        const anyMsg = msg;
        return { id: anyMsg.id ?? "", status: "error", error: `Unknown message type` };
      }
    }
  }
};

// src/extensions/ipc/setup.ts
var logger54 = createLogger("ipc-setup");
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
__name(isPidAlive, "isPidAlive");
function cleanStalePointerFiles(stateDir, log9) {
  try {
    let entries;
    try {
      entries = (0, import_node_fs13.readdirSync)(stateDir);
    } catch (err) {
      if (err.code === "ENOENT") return;
      throw err;
    }
    const pointerFiles = entries.filter((f) => /^runtime-\d+\.socket$/.test(f));
    for (const filename of pointerFiles) {
      const match = filename.match(/^runtime-(\d+)\.socket$/);
      if (!match) continue;
      const pid = parseInt(match[1], 10);
      if (isPidAlive(pid)) continue;
      const pointerPath = (0, import_node_path13.join)(stateDir, filename);
      let socketFilePath;
      try {
        socketFilePath = (0, import_node_fs13.readFileSync)(pointerPath, "utf-8").trim();
      } catch {
      }
      let socketCleaned = false;
      if (socketFilePath) {
        try {
          (0, import_node_fs13.unlinkSync)(socketFilePath);
          socketCleaned = true;
        } catch (err) {
          if (err.code !== "ENOENT") {
            log9.warn("Could not remove stale socket file", {
              path: socketFilePath,
              err: toErrorMessage(err)
            });
          }
        }
      }
      try {
        (0, import_node_fs13.unlinkSync)(pointerPath);
      } catch (err) {
        if (err.code !== "ENOENT") {
          log9.warn("Could not remove stale socket pointer file", {
            path: pointerPath,
            err: toErrorMessage(err)
          });
        }
      }
      log9.info("Cleaned stale socket pointer", { pid, pointer: pointerPath, socketCleaned });
    }
  } catch (err) {
    log9.warn("Stale pointer cleanup failed", { err: toErrorMessage(err) });
  }
}
__name(cleanStalePointerFiles, "cleanStalePointerFiles");
async function createIPCSubsystem(opts) {
  const { config, projectRoot, directiveQueue, agentWorkflowMap } = opts;
  const stateDir = (0, import_node_path13.join)(projectRoot, config.persistence.state_dir);
  const socketDir = config.ipc.socket_dir;
  const hash = (0, import_node_crypto4.createHash)("sha256").update(projectRoot).digest("hex").slice(0, 8);
  const socketPath = (0, import_node_path13.join)(socketDir, `goodvibes-runtime-${hash}-${process.pid}.sock`);
  try {
    const ipcServer = new IPCServer(socketPath);
    const ipcRouter = new IPCRouter({
      eventBus: opts.eventBus,
      triggerRegistry: opts.triggerRegistry,
      workflowEngine: opts.workflowEngine,
      agentCoordinator: opts.agentCoordinator,
      directiveQueue,
      wrfcConfigStore: opts.wrfcConfigStore,
      socketPath,
      stateDir,
      agentWorkflowMap,
      stateStore: opts.stateStore ?? null,
      hookProcessor: opts.hookProcessor,
      executorMode: opts.executorMode,
      executorBudget: opts.executorBudget,
      daemonTickHandler: opts.daemonTickHandler,
      processHookEvent: opts.processHookEvent
    });
    ipcServer.onMessage(ipcRouter.route.bind(ipcRouter));
    if (directiveQueue) {
      const dq = directiveQueue;
      ipcServer.setWriteResultCallback((holdId, success) => {
        if (success) {
          dq.releaseHold(holdId);
        } else {
          dq.reEnqueueHold(holdId);
        }
      });
    }
    if (agentWorkflowMap) {
      const awm = agentWorkflowMap;
      ipcRouter.setAgentWorkflowResolver((agentId) => {
        return awm.lookup(agentId) ?? null;
      });
    }
    cleanStalePointerFiles(stateDir, logger54);
    (0, import_node_fs13.mkdirSync)(socketDir, { recursive: true, mode: 448 });
    await ipcServer.listen();
    ensureDirSync(stateDir);
    const pointerFile = (0, import_node_path13.join)(stateDir, `runtime-${process.pid}.socket`);
    (0, import_node_fs13.writeFileSync)(pointerFile, socketPath, "utf-8");
    logger54.info("IPC subsystem created", { socket: socketPath });
    return { subsystem: { ipcServer, ipcRouter, socketPath }, socketPath };
  } catch (err) {
    logger54.error("Failed to create IPC subsystem", {
      socket: socketPath,
      err: toErrorMessage(err)
    });
    return null;
  }
}
__name(createIPCSubsystem, "createIPCSubsystem");

// src/extensions/ipc/teardown.ts
var import_node_fs14 = require("node:fs");
var import_node_path14 = require("node:path");
var logger55 = createLogger("ipc-teardown");
function removeSocketPointerFile(projectRoot, config) {
  const pointerFile = (0, import_node_path14.join)(
    projectRoot,
    config.persistence.state_dir,
    `runtime-${process.pid}.socket`
  );
  try {
    (0, import_node_fs14.unlinkSync)(pointerFile);
    logger55.debug("Socket pointer file removed", { path: pointerFile });
  } catch (err) {
    if (err.code !== "ENOENT") {
      logger55.warn("Could not remove socket pointer file", {
        path: pointerFile,
        err: toErrorMessage(err)
      });
    }
  }
}
__name(removeSocketPointerFile, "removeSocketPointerFile");
async function teardownIPC(subsystem, projectRoot, config) {
  try {
    await subsystem.ipcServer.close();
    removeSocketPointerFile(projectRoot, config);
    subsystem.ipcRouter.removeSessionPointers();
    logger55.debug("IPC teardown complete");
  } catch (err) {
    logger55.warn("IPC teardown failed", {
      err: toErrorMessage(err)
    });
  }
}
__name(teardownIPC, "teardownIPC");

// src/bootstrap.ts
var logger56 = createLogger("bootstrap");
function eventMatcherToCondition(eventMatch) {
  const eventType = eventMatch.type;
  const pattern = typeof eventType === "string" ? eventType : "*";
  return {
    type: "event",
    event_type: pattern
  };
}
__name(eventMatcherToCondition, "eventMatcherToCondition");
function toTriggerDefinitionBase(trigger) {
  const noopAction = {
    type: "sequence",
    actions: []
  };
  return {
    id: trigger.id,
    name: trigger.id,
    description: "Plugin trigger",
    enabled: trigger.enabled,
    priority: trigger.priority ?? 0,
    condition: eventMatcherToCondition(trigger.event_match),
    action: noopAction,
    cooldown_ms: trigger.cooldown_ms,
    max_fires: trigger.max_fires,
    fires_count: 0
  };
}
__name(toTriggerDefinitionBase, "toTriggerDefinitionBase");
function loggerToPluginLogger(log9) {
  return {
    debug: /* @__PURE__ */ __name((...args) => log9.debug(String(args[0]), args[1]), "debug"),
    info: /* @__PURE__ */ __name((...args) => log9.info(String(args[0]), args[1]), "info"),
    warn: /* @__PURE__ */ __name((...args) => log9.warn(String(args[0]), args[1]), "warn"),
    error: /* @__PURE__ */ __name((...args) => log9.error(String(args[0]), args[1]), "error")
  };
}
__name(loggerToPluginLogger, "loggerToPluginLogger");
var RuntimeEngine = class {
  static {
    __name(this, "RuntimeEngine");
  }
  startTime;
  config;
  healthChecker;
  running = false;
  projectRoot;
  // ─── Subsystems (non-null after startup) ───────────────────────────────────
  events = null;
  workflow = null;
  triggers = null;
  agents = null;
  directives = null;
  persistence = null;
  coreRuntime = null;
  executorSubsystem = null;
  tickDriver = null;
  hookProcessor = null;
  ipcSubsystem = null;
  wrfcConfigStore = null;
  watchdog = null;
  wrfcPlugin = null;
  externalPlugin = null;
  constructor(config, projectRoot = process.cwd()) {
    this.startTime = Date.now();
    this.config = config;
    this.projectRoot = projectRoot;
    this.healthChecker = new HealthChecker(this.config, this.startTime);
  }
  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  async startup() {
    logger56.info("Starting up");
    try {
      this.config = loadConfig(this.projectRoot);
      logger56.debug("Configuration loaded", { version: ENGINE_VERSION });
    } catch (err) {
      logger56.warn("Could not load config from disk \u2014 using defaults", { err: toErrorMessage(err) });
    }
    this.events = await createEventSubsystem(this.config, this.projectRoot);
    await checkCrashRecovery(this.projectRoot);
    writePidFile(this.projectRoot);
    if (this.config.features.workflows_enabled) {
      this.workflow = await createWorkflowSubsystem(this.config, this.projectRoot);
      this.workflow.workflowEngine.setEventBus(this.events.eventBus);
    }
    this.directives = createDirectiveSubsystem();
    this.wrfcConfigStore = new WRFCConfigStore();
    const wrfcContextProvider = /* @__PURE__ */ __name((type) => {
      if (type !== "wrfc") return {};
      const wrfcStore = this.wrfcConfigStore;
      if (!wrfcStore) return {};
      const config = wrfcStore.get();
      const defaults = {};
      if (typeof config.min_review_score === "number" && Number.isFinite(config.min_review_score)) {
        defaults.min_review_score = config.min_review_score;
      }
      if (typeof config.max_fix_attempts === "number" && Number.isFinite(config.max_fix_attempts)) {
        defaults.max_fix_attempts = config.max_fix_attempts;
      }
      return defaults;
    }, "wrfcContextProvider");
    const triggerDeps = {
      eventBus: this.events.eventBus,
      directiveQueue: this.directives.directiveQueue,
      workflowEngine: this.workflow?.workflowEngine ?? null,
      contextProvider: wrfcContextProvider
    };
    this.triggers = createTriggerSubsystem(this.config, triggerDeps);
    if (this.workflow) {
      this.workflow.workflowEngine.setDirectiveQueue(this.directives.directiveQueue);
    }
    this.events.eventBus.on("*", async (event) => {
      if (event.source?.kind === "internal" && event.source.hook_name) {
        return;
      }
      try {
        if (this.triggers) await this.triggers.triggerRegistry.evaluate(event);
      } catch (err) {
        logger56.warn("Trigger evaluation error", { error: toErrorMessage(err) });
      }
    });
    if (this.config.features.agents_enabled) {
      this.agents = createAgentSubsystem(this.config, this.events.eventBus);
    }
    if (this.workflow && this.directives) {
      this.watchdog = new WatchdogCoordinator({
        workflowEngine: this.workflow.workflowEngine,
        directiveQueue: this.directives.directiveQueue,
        agentWorkflowMap: this.directives.agentWorkflowMap,
        stateDir: (0, import_node_path15.join)(this.projectRoot, this.config.persistence.state_dir)
      });
    }
    this.persistence = await createPersistenceSubsystem({
      config: this.config,
      projectRoot: this.projectRoot,
      eventLog: this.events.eventLog,
      healthChecker: this.healthChecker,
      workflowEngine: this.workflow?.workflowEngine ?? null,
      agentCoordinator: this.agents?.agentCoordinator ?? null,
      getSnapshotDeps: /* @__PURE__ */ __name(() => ({
        workflowEngine: this.workflow?.workflowEngine ?? null,
        triggerRegistry: this.triggers?.triggerRegistry ?? null,
        agentCoordinator: this.agents?.agentCoordinator ?? null,
        agentWorkflowMap: this.directives?.agentWorkflowMap ?? null
      }), "getSnapshotDeps")
    });
    this.executorSubsystem = createExecutorSubsystem(this.config, this.events.eventBus);
    const actionExecutor = this.directives ? new ActionExecutor(this.directives.directiveQueue, this.directives.agentWorkflowMap) : void 0;
    this.coreRuntime = createCoreRuntime(
      actionExecutor,
      this.triggers?.triggerRegistry
    );
    const wrfcConfig = getDefaultWRFCConfig();
    try {
      const raw = (0, import_node_fs15.readFileSync)((0, import_node_path15.join)(this.projectRoot, ".goodvibes", "goodvibes.json"), "utf-8");
      const parsed = JSON.parse(raw);
      const wrfcOverrides = parsed?.runtime?.wrfc;
      if (wrfcOverrides && typeof wrfcOverrides === "object") {
        if (typeof wrfcOverrides.score_threshold === "number") {
          wrfcConfig.score_threshold = Math.max(0, Math.min(10, wrfcOverrides.score_threshold));
        }
        if (typeof wrfcOverrides.max_fix_attempts === "number") {
          wrfcConfig.max_fix_attempts = Math.max(1, wrfcOverrides.max_fix_attempts);
        }
        if (typeof wrfcOverrides.enable_quality_gates === "boolean") {
          wrfcConfig.enable_quality_gates = wrfcOverrides.enable_quality_gates;
        }
        if (Array.isArray(wrfcOverrides.require_review_types)) {
          wrfcConfig.require_review_types = wrfcOverrides.require_review_types;
        }
        logger56.info("WRFC config overrides applied from goodvibes.json", {
          score_threshold: wrfcConfig.score_threshold,
          max_fix_attempts: wrfcConfig.max_fix_attempts
        });
      }
    } catch {
    }
    const coreStore = this.coreRuntime.stateStore;
    const coreEventProcessor = this.coreRuntime.eventProcessor;
    const coreTriggerRegistry = this.triggers?.triggerRegistry;
    const eventBusRef = this.events.eventBus;
    coreStore.onStateChange((change) => {
      eventBusRef.emit({
        id: generateEventId(),
        timestamp: timestamp(),
        type: "state:changed",
        source: { kind: "system" },
        payload: {
          type: "state:changed",
          data: {
            key: change.key,
            operation: change.operation,
            namespace: change.namespace,
            old_value: change.oldValue,
            new_value: change.newValue
          }
        }
      });
    });
    const runtimeServices = {
      emit: /* @__PURE__ */ __name((event) => eventBusRef.emit(event), "emit"),
      subscribe: /* @__PURE__ */ __name((eventType, handler) => {
        return eventBusRef.on(
          eventType,
          handler
        );
      }, "subscribe"),
      getConfig: /* @__PURE__ */ __name(() => this.config, "getConfig"),
      getState: /* @__PURE__ */ __name((key) => coreStore.get(key), "getState"),
      setState: /* @__PURE__ */ __name((key, value) => coreStore.set(key, value), "setState"),
      deleteState: /* @__PURE__ */ __name((key) => coreStore.delete(key), "deleteState"),
      listStateKeys: /* @__PURE__ */ __name((prefix) => coreStore.keys(prefix), "listStateKeys"),
      registerTrigger: /* @__PURE__ */ __name((id, definition, handler) => {
        if (!coreTriggerRegistry) {
          logger56.warn("registerTrigger: trigger subsystem not available", { id });
          return;
        }
        const trigger = createWRFCTrigger({
          id: definition.id,
          event_match: {
            source: definition.conditions[0]?.["source"] ?? { kind: "internal" },
            type: definition.event_type
          },
          actions: [],
          max_fires: definition.max_fires,
          priority: 10
        });
        coreTriggerRegistry.register(toTriggerDefinitionBase(trigger));
        const registeredTrigger = coreTriggerRegistry.get(id);
        coreEventProcessor.registerHandler(id, async (event) => {
          if (!registeredTrigger) return {};
          return await Promise.resolve(handler(event)) ?? {};
        });
      }, "registerTrigger"),
      unregisterTrigger: /* @__PURE__ */ __name((id) => {
        coreTriggerRegistry?.unregister(id);
      }, "unregisterTrigger"),
      getLogger: /* @__PURE__ */ __name((name) => loggerToPluginLogger(createLogger(name)), "getLogger")
    };
    this.wrfcPlugin = new WRFCPlugin(wrfcConfig);
    this.wrfcPlugin.register(runtimeServices);
    this.wrfcPlugin.start();
    logger56.debug("WRFC plugin registered via RuntimePlugin interface", {
      name: this.wrfcPlugin.name,
      version: this.wrfcPlugin.version,
      state: this.wrfcPlugin.state
    });
    const agentTrackerPlugin = new AgentTrackerPlugin();
    agentTrackerPlugin.register(runtimeServices);
    agentTrackerPlugin.start();
    logger56.debug("AgentTracker plugin registered", {
      name: agentTrackerPlugin.name,
      version: agentTrackerPlugin.version,
      state: agentTrackerPlugin.state
    });
    this.coreRuntime.eventProcessor.start();
    const hookSubsystem = createHookSubsystem({
      eventBus: this.events.eventBus,
      directiveQueue: this.directives.directiveQueue,
      agentWorkflowMap: this.directives.agentWorkflowMap,
      daemonTickHandler: this.executorSubsystem?.daemonTickHandler ?? null,
      executorMode: this.executorSubsystem?.executorMode ?? null
    });
    this.hookProcessor = hookSubsystem.hookProcessor;
    logger56.debug("Hook subsystem created", { handlerCount: hookSubsystem.hookRegistry.count() });
    const timePlugin = new TimePlugin({
      queue: this.coreRuntime.eventQueue,
      store: this.coreRuntime.stateStore,
      config: this.config.time
    });
    const externalPluginConfig = this.buildExternalConfig(this.config);
    const httpEnabled = this.config.external.http_listener.enabled;
    this.externalPlugin = new ExternalPlugin(this.coreRuntime.eventQueue, externalPluginConfig);
    try {
      await this.externalPlugin.initialize();
    } catch (err) {
      logger56.warn("External plugin initialisation failed", { err: toErrorMessage(err) });
    }
    if (httpEnabled) {
      try {
        await this.externalPlugin.startHttpListener();
        logger56.info("HTTP webhook listener started", {
          port: this.config.external.http_listener.port,
          host: this.config.external.http_listener.address
        });
      } catch (err) {
        logger56.warn("Failed to start HTTP webhook listener", { err: toErrorMessage(err) });
      }
    }
    if (!this.executorSubsystem?.executorMode) {
      logger56.warn("Skipping tick driver \u2014 executorMode not available");
    } else {
      this.tickDriver = new TickDriver({
        config: this.config.executor,
        executorMode: this.executorSubsystem.executorMode,
        timePlugin: createTimeAdapter(timePlugin),
        externalPlugin: createExternalAdapter(this.externalPlugin),
        eventProcessor: this.coreRuntime.eventProcessor,
        staleWorkflowChecker: /* @__PURE__ */ __name(() => this.watchdog?.checkStaleWorkflows(), "staleWorkflowChecker")
      });
    }
    if (this.executorSubsystem?.executorBudget && this.coreRuntime.stateStore) {
      this.executorSubsystem.executorBudget.restore(this.coreRuntime.stateStore);
    }
    if (this.executorSubsystem?.daemonTickHandler && this.coreRuntime.eventQueue) {
      const queue = this.coreRuntime.eventQueue;
      this.executorSubsystem.daemonTickHandler.setQueueDepthGetter(() => queue.depth());
    }
    let ipcSocketPath = null;
    if (this.config.features.ipc_enabled) {
      const ipcResult = await createIPCSubsystem({
        config: this.config,
        projectRoot: this.projectRoot,
        eventBus: this.events.eventBus,
        triggerRegistry: this.triggers.triggerRegistry,
        workflowEngine: this.workflow?.workflowEngine ?? null,
        agentCoordinator: this.agents?.agentCoordinator ?? null,
        directiveQueue: this.directives.directiveQueue,
        wrfcConfigStore: this.wrfcConfigStore,
        agentWorkflowMap: this.directives.agentWorkflowMap,
        stateStore: this.coreRuntime?.stateStore ?? null,
        hookProcessor: this.hookProcessor,
        executorMode: this.executorSubsystem?.executorMode ?? null,
        executorBudget: this.executorSubsystem?.executorBudget ?? null,
        daemonTickHandler: this.executorSubsystem?.daemonTickHandler ?? null,
        processHookEvent: /* @__PURE__ */ __name(async (event) => {
          const processor = this.coreRuntime?.eventProcessor;
          if (processor) {
            try {
              await processor.processImmediate(event);
            } catch (err) {
              logger56.warn("Failed to process hook event immediately", { error: toErrorMessage(err) });
            }
          }
        }, "processHookEvent")
      });
      if (ipcResult) {
        this.ipcSubsystem = ipcResult.subsystem;
        ipcSocketPath = ipcResult.socketPath;
      }
    } else {
      logger56.debug("IPC server disabled by feature flag");
    }
    this.tickDriver?.start();
    this.events.eventBus.emit({
      id: generateEventId(),
      timestamp: timestamp(),
      type: "system:startup",
      source: { kind: "system" },
      payload: {
        type: "system:startup",
        data: {
          pid: process.pid,
          uptime_ms: 0,
          ipc_enabled: this.config.features.ipc_enabled,
          ipc_socket: ipcSocketPath ?? void 0
        }
      }
    });
    this.running = true;
    logger56.info("Startup complete", { pid: process.pid, uptime_ms: this.getUptime() });
  }
  async shutdown(timeout_ms = 1e4) {
    logger56.info("Shutting down", { timeout_ms });
    const shutdownTimer = setTimeout(() => {
      logger56.error("Shutdown timed out \u2014 forcing exit", { timeout_ms });
      process.exit(1);
    }, timeout_ms);
    shutdownTimer.unref();
    try {
      this.workflow?.shutdown();
      this.wrfcPlugin?.stop();
      this.wrfcPlugin = null;
      this.tickDriver?.stop();
      const coreStateStoreForShutdown = this.coreRuntime?.stateStore ?? null;
      if (this.events) {
        try {
          this.events.eventBus.emit({
            id: generateEventId(),
            timestamp: timestamp(),
            type: "system:shutdown",
            source: { kind: "system" },
            payload: { type: "system:shutdown", data: { uptime_ms: this.getUptime() } }
          });
        } catch (err) {
          logger56.warn("Failed to emit shutdown event", { err: toErrorMessage(err) });
        }
      }
      if (this.ipcSubsystem) {
        await teardownIPC(this.ipcSubsystem, this.projectRoot, this.config);
        this.ipcSubsystem = null;
      }
      if (this.executorSubsystem?.executorBudget && coreStateStoreForShutdown) {
        try {
          this.executorSubsystem.executorBudget.persist(coreStateStoreForShutdown);
        } catch (err) {
          logger56.warn("Executor budget persistence failed", { err: toErrorMessage(err) });
        }
      }
      if (this.persistence) await this.persistence.shutdown();
      if (this.events) await this.events.shutdown();
      removePidFile(this.projectRoot);
      this.running = false;
      logger56.info("Shutdown complete");
    } finally {
      clearTimeout(shutdownTimer);
    }
  }
  // ─── Accessors ──────────────────────────────────────────────────────────────
  getUptime() {
    return Date.now() - this.startTime;
  }
  getConfig() {
    return this.config;
  }
  getHealthChecker() {
    return this.healthChecker;
  }
  getProjectRoot() {
    return this.projectRoot;
  }
  isRunning() {
    return this.running;
  }
  getStateStore() {
    if (!this.persistence?.stateStore) throw new ProcessingError("getStateStore() called before startup()");
    return this.persistence.stateStore;
  }
  updateConfig(config) {
    const oldConfig = this.config;
    this.config = config;
    this.healthChecker.updateConfig(config);
    this.agents?.agentCoordinator?.updateConfig(config.agents);
    this.executorSubsystem?.executorMode?.updateConfig(config.executor);
    this.tickDriver?.reconfigure(config.executor);
    if (this.externalPlugin) {
      this.reconfigureExternalPlugins(oldConfig, config).catch((err) => {
        logger56.error("Failed to reconfigure external plugins", { error: toErrorMessage(err) });
        this.events?.eventBus.emit({
          id: generateEventId(),
          timestamp: timestamp(),
          type: "system:error",
          source: { kind: "system" },
          payload: {
            type: "system:error",
            data: {
              error: toErrorMessage(err),
              component: "RuntimeEngine.reconfigureExternalPlugins",
              severity: "error"
            }
          }
        });
      });
    }
  }
  /**
   * Reconfigure running external plugins based on config changes.
   * Handles HTTP listener enable/disable and port changes without a full restart.
   */
  async reconfigureExternalPlugins(oldConfig, newConfig) {
    if (!this.externalPlugin) return;
    const oldHttp = oldConfig.external.http_listener;
    const newHttp = newConfig.external.http_listener;
    const wasEnabled = oldHttp.enabled;
    const nowEnabled = newHttp.enabled;
    const portChanged = oldHttp.port !== newHttp.port;
    if (wasEnabled && !nowEnabled) {
      try {
        await this.externalPlugin.stopHttpListener();
        this.externalPlugin.updateConfig({ file_watcher: newConfig.external.file_watcher });
        logger56.info("HTTP webhook listener stopped (disabled by config change)");
      } catch (err) {
        logger56.warn("Failed to stop HTTP webhook listener", { error: toErrorMessage(err) });
      }
    } else if (!wasEnabled && nowEnabled) {
      try {
        const newExternalConfig = this.buildExternalConfig(newConfig);
        this.externalPlugin.updateConfig(newExternalConfig);
        await this.externalPlugin.startHttpListener();
        logger56.info("HTTP webhook listener started (enabled by config change)", {
          port: newHttp.port,
          host: newHttp.address
        });
      } catch (err) {
        logger56.error("Failed to start HTTP webhook listener after config change", {
          error: toErrorMessage(err),
          port: newHttp.port,
          address: newHttp.address
        });
        throw err;
      }
    } else if (wasEnabled && nowEnabled && portChanged) {
      const newExternalConfig = this.buildExternalConfig(newConfig);
      const oldExternalConfig = this.buildExternalConfig(oldConfig);
      try {
        await this.externalPlugin.stopHttpListener();
        this.externalPlugin.updateConfig(newExternalConfig);
        await this.externalPlugin.startHttpListener();
        logger56.info("HTTP webhook listener restarted (port change)", {
          oldPort: oldHttp.port,
          newPort: newHttp.port
        });
      } catch (err) {
        logger56.error("Failed to restart HTTP webhook listener on port change \u2014 attempting rollback", {
          error: toErrorMessage(err),
          oldPort: oldHttp.port,
          newPort: newHttp.port
        });
        try {
          this.externalPlugin.updateConfig(oldExternalConfig);
          await this.externalPlugin.startHttpListener();
          logger56.warn("HTTP webhook listener rolled back to previous port", { port: oldHttp.port });
        } catch (rollbackErr) {
          logger56.error("Rollback failed \u2014 HTTP webhook listener is permanently down", {
            error: toErrorMessage(rollbackErr)
          });
          this.events?.eventBus.emit({
            id: generateEventId(),
            timestamp: timestamp(),
            type: "system:error",
            source: { kind: "system" },
            payload: {
              type: "system:error",
              data: {
                error: `HTTP listener permanently down after failed port change rollback: ${toErrorMessage(rollbackErr)}`,
                component: "RuntimeEngine.reconfigureExternalPlugins",
                severity: "fatal"
              }
            }
          });
        }
      }
    }
  }
  /**
   * Build an ExternalPluginConfig from a RuntimeConfig, stripping the `enabled` flag
   * from http_listener. If http_listener is absent or disabled, omits it entirely.
   */
  buildExternalConfig(config) {
    const http2 = config.external.http_listener;
    if (http2.enabled) {
      const { enabled: _, ...httpListenerConfig } = http2;
      return { file_watcher: config.external.file_watcher, http_listener: httpListenerConfig };
    }
    return { file_watcher: config.external.file_watcher };
  }
  getEventBus() {
    if (!this.events?.eventBus) throw new ProcessingError("getEventBus() called before startup()");
    return this.events.eventBus;
  }
  getEventLog() {
    if (!this.events?.eventLog) throw new ProcessingError("getEventLog() called before startup()");
    return this.events.eventLog;
  }
  getEventQueue() {
    if (!this.coreRuntime?.eventQueue) throw new ProcessingError("getEventQueue() called before startup()");
    return this.coreRuntime.eventQueue;
  }
  getIPCServer() {
    return this.ipcSubsystem?.ipcServer ?? null;
  }
  getWorkflowEngine() {
    return this.workflow?.workflowEngine ?? null;
  }
  getTriggerRegistry() {
    return this.triggers?.triggerRegistry ?? null;
  }
  getAgentCoordinator() {
    return this.agents?.agentCoordinator ?? null;
  }
  getDirectiveQueue() {
    return this.directives?.directiveQueue ?? null;
  }
  getCoreStateStore() {
    if (!this.coreRuntime?.stateStore) throw new ProcessingError("getCoreStateStore() called before startup()");
    return this.coreRuntime.stateStore;
  }
  getHookProcessor() {
    return this.hookProcessor;
  }
  getEventProcessor() {
    return this.coreRuntime?.eventProcessor ?? null;
  }
  getExecutorMode() {
    return this.executorSubsystem?.executorMode ?? null;
  }
  getExecutorBudget() {
    return this.executorSubsystem?.executorBudget ?? null;
  }
  getDaemonTickHandler() {
    return this.executorSubsystem?.daemonTickHandler ?? null;
  }
};

// src/transport/daemon-server.ts
var import_node_net = require("node:net");

// src/transport/local-transport.ts
var LocalTransport = class {
  static {
    __name(this, "LocalTransport");
  }
  mode = "local";
  engine;
  constructor(engine) {
    this.engine = engine;
  }
  isReady() {
    return this.engine.isRunning();
  }
  async connect() {
  }
  async disconnect() {
  }
  // ─── Status ─────────────────────────────────────────────────
  async getUptime() {
    return this.engine.getUptime();
  }
  async getConfig() {
    return this.engine.getConfig();
  }
  async getHealth() {
    return this.engine.getHealthChecker().check();
  }
  async getVersion() {
    return ENGINE_VERSION;
  }
  async getProjectRoot() {
    return this.engine.getProjectRoot();
  }
  // ─── Configuration ──────────────────────────────────────────
  async updateConfig(config) {
    this.engine.updateConfig(config);
  }
  // ─── State ──────────────────────────────────────────────────
  async getState(key) {
    return this.engine.getCoreStateStore().get(key);
  }
  async setState(key, value) {
    this.engine.getCoreStateStore().set(key, value);
  }
  async deleteState(key) {
    this.engine.getCoreStateStore().delete(key);
  }
  async listStateKeys(prefix) {
    return this.engine.getCoreStateStore().keys(prefix);
  }
  async getStateSnapshot() {
    return this.engine.getCoreStateStore().snapshot();
  }
  // ─── Events ─────────────────────────────────────────────────
  async emitEvent(event) {
    this.engine.getEventBus().emit(event);
  }
  async queryEvents(filter) {
    return this.engine.getEventLog().query(filter);
  }
  async getQueueDepth() {
    return this.engine.getEventQueue().depth();
  }
  // ─── Workflows ──────────────────────────────────────────────
  async getWorkflow(workflowId) {
    const engine = this.engine.getWorkflowEngine();
    if (!engine) return null;
    const instance = engine.get(workflowId);
    return instance ? instance : null;
  }
  async listWorkflows() {
    const engine = this.engine.getWorkflowEngine();
    if (!engine) return [];
    return engine.listAll();
  }
  async startWorkflow(definitionId, context) {
    const engine = this.engine.getWorkflowEngine();
    if (!engine) throw new Error("Workflow engine not available");
    const instance = engine.create(definitionId, context ?? {});
    return { workflow_id: instance.id };
  }
  async transitionWorkflow(workflowId, event, data) {
    const engine = this.engine.getWorkflowEngine();
    if (!engine) throw new Error("Workflow engine not available");
    const runtimeEvent = createEvent({
      source: { kind: "internal" },
      type: event,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: { type: event, data: data ?? {} }
    });
    return engine.sendEvent(workflowId, runtimeEvent);
  }
  // ─── Triggers ───────────────────────────────────────────────
  async listTriggers() {
    const registry = this.engine.getTriggerRegistry();
    if (!registry) return [];
    return registry.list();
  }
  async getTrigger(triggerId) {
    const registry = this.engine.getTriggerRegistry();
    if (!registry) return null;
    const trigger = registry.get(triggerId);
    return trigger ? trigger : null;
  }
  async registerTrigger(definition) {
    const registry = this.engine.getTriggerRegistry();
    if (!registry) throw new Error("Trigger registry not available");
    registry.register(definition);
  }
  async unregisterTrigger(triggerId) {
    const registry = this.engine.getTriggerRegistry();
    if (!registry) return false;
    return registry.unregister(triggerId);
  }
  // ─── Agents ─────────────────────────────────────────────────
  async getAgent(agentId) {
    const coordinator = this.engine.getAgentCoordinator();
    if (!coordinator) return null;
    const agent = coordinator.getAgent(agentId);
    return agent ? agent : null;
  }
  async listAgents() {
    const coordinator = this.engine.getAgentCoordinator();
    if (!coordinator) return [];
    return coordinator.listActive();
  }
  // ─── Directives ─────────────────────────────────────────────
  async drainDirectives(target, workflowId) {
    const queue = this.engine.getDirectiveQueue();
    if (!queue) return { directives: [] };
    const result = await queue.holdDrain(target, workflowId);
    return { directives: result.directives };
  }
};

// src/transport/daemon-server.ts
var logger57 = createLogger("daemon-server");
var CONNECTION_TIMEOUT_MS2 = 1e4;
var DaemonServer = class {
  static {
    __name(this, "DaemonServer");
  }
  socketPath;
  engine;
  server = null;
  sessions = /* @__PURE__ */ new Map();
  localTransport;
  constructor(options) {
    this.socketPath = options.socketPath;
    this.engine = options.engine;
    this.localTransport = new LocalTransport(this.engine);
  }
  getSessionCount() {
    return this.sessions.size;
  }
  async start() {
    return new Promise((resolve2, reject) => {
      this.server = (0, import_node_net.createServer)((socket) => this.handleConnection(socket));
      this.server.once("error", reject);
      this.server.listen(this.socketPath, () => {
        this.server.removeListener("error", reject);
        this.server.on("error", (err) => logger57.error("Server error", { error: String(err) }));
        resolve2();
      });
    });
  }
  async stop() {
    for (const session of this.sessions.values()) {
      try {
        session.socket.destroy();
      } catch {
      }
    }
    this.sessions.clear();
    try {
      const { unlinkSync: unlinkSync10 } = await import("node:fs");
      unlinkSync10(this.socketPath);
    } catch {
    }
    if (!this.server) return;
    return new Promise((resolve2, reject) => {
      this.server.close((err) => err ? reject(err) : resolve2());
    });
  }
  handleConnection(socket) {
    const session = {
      sessionId: generateId(),
      // placeholder until session_join
      socket,
      buffer: ""
    };
    const idleTimer = setTimeout(() => {
      socket.destroy();
    }, CONNECTION_TIMEOUT_MS2);
    socket.on("data", (chunk) => {
      clearTimeout(idleTimer);
      session.buffer += chunk.toString();
      const lines = session.buffer.split("\n");
      session.buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          const resp = {
            id: "",
            status: "error",
            error: "Invalid JSON"
          };
          this.sendResponse(socket, resp);
          continue;
        }
        this.processMessage(session, msg);
      }
    });
    socket.on("close", () => {
      clearTimeout(idleTimer);
      this.sessions.delete(session.sessionId);
    });
    socket.on("error", (err) => {
      clearTimeout(idleTimer);
      logger57.error("Socket error", { error: String(err) });
    });
  }
  processMessage(session, msg) {
    if (msg.type === "session_join" || msg.type === "session_leave") {
      this.handleSessionMessage(session, msg);
    } else if (msg.type === "rpc_call") {
      this.handleRPCCall(session, msg);
    } else {
      const resp = {
        id: msg.id ?? "",
        status: "error",
        error: `Unknown message type: ${msg.type}`
      };
      this.sendResponse(session.socket, resp);
    }
  }
  handleSessionMessage(session, msg) {
    if (msg.type === "session_join") {
      this.sessions.delete(session.sessionId);
      session.sessionId = msg.session_id;
      this.sessions.set(session.sessionId, session);
    } else if (msg.type === "session_leave") {
      this.sessions.delete(session.sessionId);
    }
    const resp = { id: msg.id, status: "ok" };
    this.sendResponse(session.socket, resp);
  }
  handleRPCCall(session, req) {
    if (!this.sessions.has(session.sessionId) || req.session_id !== session.sessionId) {
      const resp = {
        id: req.id,
        status: "error",
        error: "Session not registered \u2014 call session_join first"
      };
      this.sendResponse(session.socket, resp);
      return;
    }
    this.dispatchRPC(req).then((result) => {
      const resp = { id: req.id, status: "ok", result };
      this.sendResponse(session.socket, resp);
    }).catch((err) => {
      const resp = {
        id: req.id,
        status: "error",
        error: err.message
      };
      this.sendResponse(session.socket, resp);
    });
  }
  sendResponse(socket, resp) {
    try {
      socket.write(JSON.stringify(resp) + "\n");
    } catch (err) {
      logger57.error("Send error", { error: String(err) });
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async dispatchRPC(req) {
    const { method, args } = req;
    const e = this.engine;
    switch (method) {
      case "getHealth": {
        return e.getHealthChecker().check();
      }
      case "getConfig": {
        return e.getConfig();
      }
      case "updateConfig": {
        const updatedConfig = args["config"];
        e.updateConfig(updatedConfig);
        saveConfig(e.getProjectRoot(), updatedConfig);
        return;
      }
      case "getVersion": {
        return ENGINE_VERSION;
      }
      case "getProjectRoot": {
        return e.getProjectRoot();
      }
      case "getUptime": {
        return this.localTransport.getUptime();
      }
      case "getStateSnapshot": {
        return e.getCoreStateStore().snapshot();
      }
      case "getState": {
        return e.getCoreStateStore().get(args["key"]);
      }
      case "setState": {
        e.getCoreStateStore().set(args["key"], args["value"]);
        return;
      }
      case "deleteState": {
        e.getCoreStateStore().delete(args["key"]);
        return;
      }
      case "listStateKeys": {
        return e.getCoreStateStore().keys(args["prefix"]);
      }
      case "emitEvent": {
        e.getEventBus().emit(args["event"]);
        return;
      }
      case "queryEvents": {
        return e.getEventLog().query(args["filter"]);
      }
      case "getQueueDepth": {
        return e.getEventQueue().depth();
      }
      case "getWorkflow": {
        const wf = e.getWorkflowEngine();
        if (!wf) throw new Error("WorkflowEngine not available");
        const instance = wf.get(args["workflowId"]);
        return instance ? instance : null;
      }
      case "listWorkflows": {
        const wf = e.getWorkflowEngine();
        if (!wf) throw new Error("WorkflowEngine not available");
        return wf.listAll().map((i) => i);
      }
      case "startWorkflow": {
        const wf = e.getWorkflowEngine();
        if (!wf) throw new Error("WorkflowEngine not available");
        const instance = wf.create(
          args["definitionId"],
          args["context"]
        );
        return { workflow_id: instance.id };
      }
      case "transitionWorkflow": {
        const wf = e.getWorkflowEngine();
        if (!wf) throw new Error("WorkflowEngine not available");
        const eventStr = args["event"];
        const data = args["data"];
        const syntheticEvent = {
          id: generateId(),
          type: eventStr,
          source: { kind: "mcp_tool", tool_name: "transitionWorkflow" },
          payload: { type: eventStr, data: data ?? {} },
          timestamp: Date.now(),
          priority: 0,
          metadata: { session_id: req.session_id, sequence: 0, version: 1 }
        };
        const result = await wf.sendEvent(args["workflowId"], syntheticEvent);
        return result;
      }
      case "listTriggers": {
        const tr = e.getTriggerRegistry();
        if (!tr) throw new Error("TriggerRegistry not available");
        return tr.list().map((t) => t);
      }
      case "getTrigger": {
        const tr = e.getTriggerRegistry();
        if (!tr) throw new Error("TriggerRegistry not available");
        const trigger = tr.get(args["triggerId"]);
        return trigger ? trigger : null;
      }
      case "registerTrigger": {
        const tr = e.getTriggerRegistry();
        if (!tr) throw new Error("TriggerRegistry not available");
        tr.register(args["definition"]);
        return;
      }
      case "unregisterTrigger": {
        const tr = e.getTriggerRegistry();
        if (!tr) throw new Error("TriggerRegistry not available");
        return tr.unregister(args["triggerId"]);
      }
      case "getAgent": {
        const ac = e.getAgentCoordinator();
        if (!ac) throw new Error("AgentCoordinator not available");
        const agent = ac.getAgent(args["agentId"]);
        return agent ? agent : null;
      }
      case "listAgents": {
        const ac = e.getAgentCoordinator();
        if (!ac) throw new Error("AgentCoordinator not available");
        return ac.listActive().map((a) => a);
      }
      case "drainDirectives": {
        const dq = e.getDirectiveQueue();
        if (!dq) throw new Error("DirectiveQueue not available");
        const result = await dq.holdDrain(
          args["target"],
          args["workflowId"]
        );
        return { directives: result.directives };
      }
      case "ping": {
        return { ok: true, pid: process.pid, uptime: process.uptime() };
      }
      case "listSessions": {
        const sessions = [];
        for (const [id] of this.sessions) {
          sessions.push({ sessionId: id });
        }
        return sessions;
      }
      default:
        throw new Error(`Unknown RPC method: ${method}`);
    }
  }
};

// src/transport/daemon-hook-server.ts
var import_node_fs16 = require("node:fs");
var import_node_path16 = require("node:path");
var import_node_crypto5 = require("node:crypto");
var logger58 = createLogger("daemon-hook-server");
var DaemonHookServer = class {
  static {
    __name(this, "DaemonHookServer");
  }
  engine;
  socketPath;
  stateDir;
  ipcServer = null;
  ipcRouter = null;
  constructor(options) {
    this.engine = options.engine;
    this.socketPath = options.socketPath;
    this.stateDir = options.stateDir;
  }
  /**
   * Start the hook IPC server and write the PID-keyed pointer file.
   */
  async start() {
    const socketDir = (0, import_node_path16.dirname)(this.socketPath);
    (0, import_node_fs16.mkdirSync)(socketDir, { recursive: true, mode: 448 });
    cleanStalePointerFiles(this.stateDir, logger58);
    const engine = this.engine;
    const directiveQueue = engine.getDirectiveQueue();
    const ipcRouter = new IPCRouter({
      eventBus: engine.getEventBus(),
      triggerRegistry: engine.getTriggerRegistry(),
      workflowEngine: engine.getWorkflowEngine(),
      agentCoordinator: engine.getAgentCoordinator(),
      directiveQueue,
      socketPath: this.socketPath,
      stateDir: this.stateDir,
      stateStore: engine.getCoreStateStore(),
      hookProcessor: engine.getHookProcessor(),
      executorMode: engine.getExecutorMode(),
      executorBudget: engine.getExecutorBudget(),
      daemonTickHandler: engine.getDaemonTickHandler(),
      // processHookEvent: run the event processor synchronously in-band so
      // WRFC directives are enqueued before the UPS hook queries get_directives.
      // Note: agentWorkflowMap and wrfcConfigStore are intentionally omitted.
      // Workflow-scoped directive draining and WRFC config queries are not yet
      // supported in daemon mode. Wire these when full daemon-mode WRFC is tested.
      processHookEvent: /* @__PURE__ */ __name(async (event) => {
        const processor = engine.getEventProcessor();
        if (processor) {
          try {
            await processor.processImmediate(event);
          } catch (err) {
            logger58.warn("processHookEvent failed", { error: toErrorMessage(err) });
          }
        }
      }, "processHookEvent")
    });
    const ipcServer = new IPCServer(this.socketPath);
    ipcServer.onMessage(ipcRouter.route.bind(ipcRouter));
    if (directiveQueue) {
      const dq = directiveQueue;
      ipcServer.setWriteResultCallback((holdId, success) => {
        if (success) {
          dq.releaseHold(holdId);
        } else {
          dq.reEnqueueHold(holdId);
        }
      });
    }
    ensureDirSync(this.stateDir);
    await ipcServer.listen();
    this.ipcServer = ipcServer;
    this.ipcRouter = ipcRouter;
    const pointerFile = (0, import_node_path16.join)(this.stateDir, `runtime-${process.pid}.socket`);
    try {
      (0, import_node_fs16.writeFileSync)(pointerFile, this.socketPath, "utf-8");
      logger58.info("Daemon hook server started", {
        socket: this.socketPath,
        pointer: pointerFile
      });
    } catch (err) {
      logger58.warn("Failed to write hook server pointer file", { err: toErrorMessage(err) });
    }
  }
  /**
   * Stop the hook IPC server and clean up pointer files.
   */
  async stop() {
    this.ipcRouter?.removeSessionPointers();
    const pointerFile = (0, import_node_path16.join)(this.stateDir, `runtime-${process.pid}.socket`);
    try {
      (0, import_node_fs16.unlinkSync)(pointerFile);
    } catch {
    }
    if (this.ipcServer) {
      try {
        await this.ipcServer.close();
      } catch (err) {
        logger58.warn("Hook IPC server close error", { err: toErrorMessage(err) });
      }
      this.ipcServer = null;
    }
    this.ipcRouter = null;
    logger58.info("Daemon hook server stopped");
  }
  /**
   * Generate a deterministic hook socket path for a given project root.
   *
   * The path includes a sha256 hash of the project root (same as
   * createIPCSubsystem) so multiple projects on the same host don't clash.
   *
   * @param socketDir - Directory to place the socket file.
   * @param projectRoot - Project root path (used for the hash segment).
   * @returns Absolute path for the hook socket.
   */
  static socketPath(socketDir, projectRoot) {
    const hash = (0, import_node_crypto5.createHash)("sha256").update(projectRoot).digest("hex").slice(0, 8);
    return (0, import_node_path16.join)(socketDir, `goodvibes-hook-${hash}-${process.pid}.sock`);
  }
};

// src/transport/daemon-constants.ts
var DAEMON_PID_FILE = "goodvibes-runtime.pid";
var DAEMON_SOCKET_POINTER = "daemon.socket";
var DAEMON_SOCKET_NAME = "goodvibes-runtime.sock";
var DAEMON_HOOK_SOCKET_NAME = "goodvibes-hook.sock";

// src/transport/daemon.ts
var logger59 = createLogger("daemon");
async function main() {
  const projectRoot = process.env["GV_PROJECT_ROOT"] ?? process.cwd();
  const goodvibesDir = (0, import_node_path17.resolve)(projectRoot, ".goodvibes");
  const socketPath = process.env["GV_DAEMON_SOCKET"] ? (0, import_node_path17.resolve)(process.env["GV_DAEMON_SOCKET"]) : (0, import_node_path17.resolve)(goodvibesDir, DAEMON_SOCKET_NAME);
  const hookSocketPath = process.env["GV_DAEMON_HOOK_SOCKET"] ? (0, import_node_path17.resolve)(process.env["GV_DAEMON_HOOK_SOCKET"]) : (0, import_node_path17.resolve)(goodvibesDir, DAEMON_HOOK_SOCKET_NAME);
  const stateDir = (0, import_node_path17.resolve)(goodvibesDir, "state");
  const pidFilePath = (0, import_node_path17.resolve)(goodvibesDir, DAEMON_PID_FILE);
  const socketPointerPath = (0, import_node_path17.resolve)(goodvibesDir, DAEMON_SOCKET_POINTER);
  if ((0, import_node_fs17.existsSync)(socketPath)) {
    try {
      (0, import_node_fs17.unlinkSync)(socketPath);
    } catch {
    }
  }
  if ((0, import_node_fs17.existsSync)(hookSocketPath)) {
    try {
      (0, import_node_fs17.unlinkSync)(hookSocketPath);
    } catch {
    }
  }
  const config = loadConfig(projectRoot);
  const engine = new RuntimeEngine(config, projectRoot);
  await engine.startup();
  const server = new DaemonServer({ socketPath, engine });
  await server.start();
  const hookServer = new DaemonHookServer({ socketPath: hookSocketPath, engine, stateDir });
  await hookServer.start();
  try {
    (0, import_node_fs17.writeFileSync)(pidFilePath, String(process.pid), "utf-8");
    (0, import_node_fs17.writeFileSync)(socketPointerPath, socketPath, "utf-8");
  } catch (err) {
    logger59.warn("Failed to write PID/socket files", { err: String(err) });
  }
  logger59.info("Daemon running", { pid: process.pid, socket: socketPath });
  const shutdown = /* @__PURE__ */ __name(async (signal) => {
    logger59.info("Received signal, shutting down", { signal });
    try {
      await hookServer.stop();
      await server.stop();
      await engine.shutdown();
    } catch (err) {
      logger59.error("Shutdown error", { err: String(err) });
    } finally {
      try {
        (0, import_node_fs17.unlinkSync)(pidFilePath);
      } catch {
      }
      try {
        (0, import_node_fs17.unlinkSync)(socketPointerPath);
      } catch {
      }
      process.exit(0);
    }
  }, "shutdown");
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
}
__name(main, "main");
main().catch((err) => {
  console.error("[daemon] Fatal startup error:", err);
  process.exit(1);
});
//# sourceMappingURL=daemon.cjs.map
