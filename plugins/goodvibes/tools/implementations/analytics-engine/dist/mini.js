#!/usr/bin/env node
#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/daemon/aggregator.ts
import { join as join8 } from "node:path";

// src/data/telemetry-reader.ts
import initSqlJs from "sql.js";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
var COL = {
  id: 0,
  session_id: 1,
  tool: 2,
  status: 3,
  tokens_in: 4,
  tokens_out: 5,
  cache_hit: 6,
  cache_bytes_saved: 7,
  duration_ms: 8,
  error: 9,
  metadata: 10,
  created_at: 11
};
var SELECT_COLS = `
  id, session_id, tool, status,
  tokens_in, tokens_out, cache_hit, cache_bytes_saved,
  duration_ms, error, metadata, created_at
`;
var BYTES_PER_TOKEN = 4;
var TelemetryReader = class _TelemetryReader {
  static {
    __name(this, "TelemetryReader");
  }
  db = null;
  _SQL = null;
  dbPath;
  _available = false;
  constructor(goodvibesDir2) {
    this.dbPath = path.join(goodvibesDir2, "telemetry", "telemetry.db");
  }
  /**
   * Initialize sql.js WASM and open the database from the file on disk.
   *
   * Safe to call multiple times — subsequent calls are no-ops if already
   * initialized. If the DB file does not exist, marks as unavailable and
   * returns without error (callers get empty results).
   */
  async initialize() {
    if (this.db !== null) {
      return;
    }
    if (!existsSync(this.dbPath)) {
      this._available = false;
      return;
    }
    try {
      const bundleDir = path.dirname(new URL(import.meta.url).pathname);
      const wasmBesideBundle = path.join(bundleDir, "sql-wasm.wasm");
      const sqlConfig = existsSync(wasmBesideBundle) ? { locateFile: /* @__PURE__ */ __name((file) => path.join(bundleDir, file), "locateFile") } : {};
      this._SQL = await initSqlJs(sqlConfig);
      const buffer = readFileSync(this.dbPath);
      this.db = new this._SQL.Database(buffer);
      this._available = true;
    } catch (err) {
      console.warn("[TelemetryReader] Failed to open database:", String(err));
      this.db = null;
      this._available = false;
    }
  }
  /**
   * Returns true if the DB was opened successfully and is queryable.
   */
  isAvailable() {
    return this._available && this.db !== null;
  }
  // ───────────────────────────────────────────────────────────────────────────
  // Query methods
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * Get records with optional filters.
   * Returns records in ascending chronological order.
   * Returns [] if the database is unavailable.
   */
  getRecords(filter) {
    if (!this.db) return [];
    try {
      const conditions = [];
      const params = [];
      if (filter?.tool) {
        conditions.push("tool = ?");
        params.push(filter.tool);
      }
      if (filter?.status) {
        conditions.push("status = ?");
        params.push(filter.status);
      }
      if (filter?.since) {
        conditions.push("created_at >= ?");
        params.push(filter.since);
      }
      if (filter?.session_id) {
        conditions.push("session_id = ?");
        params.push(filter.session_id);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      let sql = `SELECT ${SELECT_COLS} FROM calls ${where} ORDER BY created_at ASC`;
      if (filter?.limit !== void 0 && filter.limit > 0) {
        sql += " LIMIT ?";
        params.push(Math.floor(filter.limit));
      }
      const results = this.db.exec(sql, params.length > 0 ? params : void 0);
      return this.resultsToRecords(results);
    } catch (err) {
      console.warn("[TelemetryReader] getRecords error:", String(err));
      return [];
    }
  }
  /**
   * Get a summary for the specified session (defaults to current/most recent).
   * Returns null if the database is unavailable or the session has no records.
   */
  getSessionSummary(sessionId) {
    if (!this.db) return null;
    const sid = sessionId ?? this.getCurrentSessionId();
    if (!sid) return null;
    try {
      const results = this.db.exec(
        `SELECT ${SELECT_COLS} FROM calls WHERE session_id = ? ORDER BY created_at ASC`,
        [sid]
      );
      const records = this.resultsToRecords(results);
      if (records.length === 0) return null;
      const byTool = {};
      let totalTokensIn = 0;
      let totalTokensOut = 0;
      let totalCacheHits = 0;
      let totalDurationMs = 0;
      let successCount = 0;
      for (const rec of records) {
        if (!byTool[rec.tool]) {
          byTool[rec.tool] = { calls: 0, tokens_in: 0, tokens_out: 0, cache_hits: 0, total_ms: 0, success: 0 };
        }
        const t = byTool[rec.tool];
        t.calls++;
        const ti = rec.tokens_in ?? 0;
        const to = rec.tokens_out ?? 0;
        t.tokens_in += ti;
        t.tokens_out += to;
        totalTokensIn += ti;
        totalTokensOut += to;
        if (rec.cache_hit) {
          t.cache_hits++;
          totalCacheHits++;
        }
        const ms = rec.duration_ms ?? 0;
        t.total_ms += ms;
        totalDurationMs += ms;
        if (rec.status === "success") {
          t.success++;
          successCount++;
        }
      }
      const byToolOut = {};
      for (const [tool, s] of Object.entries(byTool)) {
        byToolOut[tool] = {
          calls: s.calls,
          avg_ms: s.calls > 0 ? Math.round(s.total_ms / s.calls) : 0,
          cache_hit_rate: s.calls > 0 ? s.cache_hits / s.calls : 0,
          tokens_in: s.tokens_in,
          tokens_out: s.tokens_out,
          success_rate: s.calls > 0 ? s.success / s.calls : 1
        };
      }
      return {
        session_id: sid,
        total_calls: records.length,
        by_tool: byToolOut,
        total_tokens_in: totalTokensIn,
        total_tokens_out: totalTokensOut,
        total_cache_hits: totalCacheHits,
        total_duration_ms: totalDurationMs,
        success_rate: records.length > 0 ? successCount / records.length : 1
      };
    } catch (err) {
      console.warn("[TelemetryReader] getSessionSummary error:", String(err));
      return null;
    }
  }
  /**
   * Get the most recent session ID in the database (highest created_at).
   * Returns null if unavailable or DB is empty.
   */
  getCurrentSessionId() {
    if (!this.db) return null;
    try {
      const results = this.db.exec(
        `SELECT session_id FROM calls ORDER BY created_at DESC LIMIT 1`
      );
      if (!results.length || !results[0].values.length) return null;
      return results[0].values[0][0];
    } catch (err) {
      console.warn("[TelemetryReader] getCurrentSessionId error:", String(err));
      return null;
    }
  }
  /**
   * List all distinct session IDs in the database, ordered by first appearance.
   */
  listSessionIds() {
    if (!this.db) return [];
    try {
      const results = this.db.exec(
        `SELECT session_id FROM calls GROUP BY session_id ORDER BY MIN(created_at) ASC`
      );
      if (!results.length) return [];
      return results[0].values.map((row) => row[0]);
    } catch (err) {
      console.warn("[TelemetryReader] listSessionIds error:", String(err));
      return [];
    }
  }
  /**
   * Get all records created within the last `windowMs` milliseconds.
   * Useful for anomaly detection on recent activity.
   */
  getRecordsInWindow(windowMs) {
    const since = new Date(Date.now() - windowMs).toISOString();
    return this.getRecords({ since });
  }
  /**
   * Compute token metrics from recorded calls.
   *
   * Returns the TokenMetrics shape from types.ts:
   *   { input, output, total, saved, efficiency }
   *
   * If `sessionId` is provided, filters to that session; otherwise uses all records.
   */
  getTokenMetrics(sessionId) {
    const empty = {
      input: 0,
      output: 0,
      total: 0,
      saved: 0,
      efficiency: 0,
      api_input: 0,
      api_output: 0,
      cache_read: 0,
      cache_write: 0
    };
    if (!this.db) return empty;
    try {
      const where = sessionId ? "WHERE session_id = ?" : "";
      const params = sessionId ? [sessionId] : void 0;
      const results = this.db.exec(
        `SELECT tokens_in, tokens_out, cache_bytes_saved FROM calls ${where}`,
        params
      );
      if (!results.length) return empty;
      let totalIn = 0;
      let totalOut = 0;
      let totalSavedBytes = 0;
      for (const row of results[0].values) {
        totalIn += row[0] ?? 0;
        totalOut += row[1] ?? 0;
        totalSavedBytes += row[2] ?? 0;
      }
      const total = totalIn + totalOut;
      const saved = Math.round(totalSavedBytes / BYTES_PER_TOKEN);
      const efficiency = total + saved > 0 ? saved / (total + saved) : 0;
      return {
        input: totalIn,
        output: totalOut,
        total,
        saved,
        efficiency: Math.round(efficiency * 1e4) / 1e4,
        // 4 decimal places
        // API-level token counts (Phase 2 will populate from JSONL sync)
        api_input: 0,
        api_output: 0,
        cache_read: 0,
        cache_write: 0
      };
    } catch (err) {
      console.warn("[TelemetryReader] getTokenMetrics error:", String(err));
      return empty;
    }
  }
  /**
   * Get the most recent N records in ascending chronological order.
   * Returns [] if unavailable.
   */
  getRecentRecords(limit) {
    if (!this.db) return [];
    try {
      const n = Math.max(1, Math.floor(limit));
      const results = this.db.exec(
        `SELECT * FROM (SELECT ${SELECT_COLS} FROM calls ORDER BY created_at DESC LIMIT ?) sub ORDER BY created_at ASC`,
        [n]
      );
      return this.resultsToRecords(results);
    } catch (err) {
      console.warn("[TelemetryReader] getRecentRecords error:", String(err));
      return [];
    }
  }
  /**
   * Reload the database from disk synchronously.
   *
   * Closes the current in-memory DB and re-reads the file. Use this to pick up
   * records written by precision-engine after the initial `initialize()` call.
   * If the file no longer exists, marks the reader as unavailable.
   *
   * Requires `initialize()` to have been called first (to cache the SqlJsStatic
   * instance). If called before initialize(), this is a no-op.
   */
  reload() {
    if (this.db) {
      try {
        this.db.close();
      } catch {
      }
      this.db = null;
      this._available = false;
    }
    if (!existsSync(this.dbPath)) return;
    if (!this._SQL) return;
    try {
      const buffer = readFileSync(this.dbPath);
      this.db = new this._SQL.Database(buffer);
      this._available = true;
    } catch (err) {
      console.warn("[TelemetryReader] reload error:", String(err));
    }
  }
  /**
   * Close the database and release resources.
   */
  close() {
    if (this.db) {
      try {
        this.db.close();
      } catch {
      }
      this.db = null;
      this._available = false;
    }
  }
  // ───────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * Convert sql.js exec() results to TelemetryRecord[].
   * sql.js returns rows as value arrays, not objects.
   */
  resultsToRecords(results) {
    if (!results || results.length === 0) return [];
    const { values } = results[0];
    return values.map((row) => _TelemetryReader.rowToRecord(row));
  }
  /**
   * Map a raw row array to a typed TelemetryRecord.
   * Column indices are defined in the COL constant.
   *
   * NOTE: The database stores `metadata` as a JSON string (written by precision-engine).
   * The `TelemetryRecord.metadata` field is typed as `string` to match the stored
   * representation. Consumers needing a structured object should call
   * `JSON.parse(record.metadata)` — the interface intentionally does not auto-parse
   * to avoid the cost on paths that don't need it.
   */
  static rowToRecord(row) {
    const rec = {
      id: row[COL.id],
      session_id: row[COL.session_id],
      tool: row[COL.tool],
      status: row[COL.status],
      created_at: row[COL.created_at]
    };
    if (row[COL.tokens_in] !== null && row[COL.tokens_in] !== void 0) {
      rec.tokens_in = row[COL.tokens_in];
    }
    if (row[COL.tokens_out] !== null && row[COL.tokens_out] !== void 0) {
      rec.tokens_out = row[COL.tokens_out];
    }
    if (row[COL.cache_hit] !== null && row[COL.cache_hit] !== void 0) {
      rec.cache_hit = row[COL.cache_hit] !== 0;
    }
    if (row[COL.cache_bytes_saved] !== null && row[COL.cache_bytes_saved] !== void 0) {
      rec.cache_bytes_saved = row[COL.cache_bytes_saved];
    }
    if (row[COL.duration_ms] !== null && row[COL.duration_ms] !== void 0) {
      rec.duration_ms = row[COL.duration_ms];
    }
    if (row[COL.error] !== null && row[COL.error] !== void 0) {
      rec.error = row[COL.error];
    }
    if (row[COL.metadata] !== null && row[COL.metadata] !== void 0) {
      rec.metadata = row[COL.metadata];
    }
    return rec;
  }
};

// src/data/session-reader.ts
import { readFileSync as readFileSync2, readdirSync, statSync } from "node:fs";
import * as path2 from "node:path";
var SessionReader = class {
  static {
    __name(this, "SessionReader");
  }
  stateDir;
  constructor(goodvibesDir2) {
    this.stateDir = path2.join(goodvibesDir2, "state");
  }
  /**
   * Find the most recent session file by filesystem mtime.
   * Returns null if the state directory does not exist or is empty.
   */
  getCurrentSessionFile() {
    const files = this.listSessionFiles();
    if (files.length === 0) return null;
    const sorted = files.map((f) => {
      try {
        const fullPath = path2.join(this.stateDir, f);
        const mtime = statSync(fullPath).mtimeMs;
        return { file: f, mtime };
      } catch {
        return null;
      }
    }).filter((x) => x !== null).sort((a, b) => b.mtime - a.mtime);
    return sorted.length > 0 ? path2.join(this.stateDir, sorted[0].file) : null;
  }
  /**
   * Read and parse a session file by session ID.
   * Returns null if the file does not exist or cannot be parsed.
   */
  readSession(sessionId) {
    const filePath = path2.join(this.stateDir, `session_${sessionId}.json`);
    return this.parseSessionFile(filePath);
  }
  /**
   * Read and parse the most recent (current) session file.
   * Returns null if no session files exist.
   */
  readCurrentSession() {
    const filePath = this.getCurrentSessionFile();
    if (!filePath) return null;
    return this.parseSessionFile(filePath);
  }
  /**
   * List all available session IDs derived from filenames in the state directory.
   * Returns an empty array if the directory does not exist.
   */
  listSessionIds() {
    return this.listSessionFiles().map((f) => {
      const match = f.match(/^session_([0-9a-f]{8})\.json$/);
      return match ? match[1] : null;
    }).filter((id) => id !== null);
  }
  /**
   * Retrieve specific KV values from a session file by key name.
   * Missing keys are present in the result with value `undefined`.
   */
  getValues(sessionId, keys) {
    const session = this.readSession(sessionId);
    const result = {};
    if (!session) {
      for (const key of keys) result[key] = void 0;
      return result;
    }
    for (const key of keys) {
      result[key] = session.values[key];
    }
    return result;
  }
  /**
   * Read the auto-populated session counters from a session file.
   * Uses the current session when no sessionId is provided.
   */
  getSessionCounters(sessionId) {
    const session = sessionId ? this.readSession(sessionId) : this.readCurrentSession();
    const values = session?.values ?? {};
    return {
      tokens_used: toNumber(values["session.tokens_used"]),
      files_modified: toStringArray(values["session.files_modified"]),
      commands_run: toNumber(values["session.commands_run"]),
      agents_spawned: toNumber(values["session.agents_spawned"])
    };
  }
  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------
  /**
   * List raw session filenames from the state directory.
   */
  listSessionFiles() {
    try {
      return readdirSync(this.stateDir).filter(
        (f) => /^session_[0-9a-f]{8}\.json$/.test(f)
      );
    } catch {
      return [];
    }
  }
  /**
   * Parse a session JSON file into SessionData.
   * The raw file shape is { id, started_at, ...kvPairs }.
   * We normalise it by pulling id/started_at out and placing the rest in values.
   */
  parseSessionFile(filePath) {
    try {
      const raw = readFileSync2(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      const id = typeof parsed["id"] === "string" ? parsed["id"] : "";
      const started_at = typeof parsed["started_at"] === "string" ? parsed["started_at"] : "";
      const values = {};
      for (const [key, val] of Object.entries(parsed)) {
        if (key !== "id" && key !== "started_at") {
          values[key] = val;
        }
      }
      return { id, started_at, values };
    } catch {
      return null;
    }
  }
};
function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}
__name(toNumber, "toNumber");
function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === "string");
  }
  return [];
}
__name(toStringArray, "toStringArray");

// src/data/index-reader.ts
import { readFileSync as readFileSync3, statSync as statSync2, existsSync as existsSync2 } from "fs";
import * as path3 from "path";
var IndexReader = class {
  static {
    __name(this, "IndexReader");
  }
  indexPath;
  /** Parsed index, null if unread or unavailable. */
  cache = null;
  /** Mtime (ms) of the file when it was last parsed. */
  cacheMtime = -1;
  constructor(goodvibesDir2) {
    this.indexPath = path3.join(goodvibesDir2, "project-index.json");
  }
  /**
   * Read the current project index, using a cached copy when the file
   * has not been modified since the last read.
   * Returns null if the index file does not exist or cannot be parsed.
   */
  read() {
    if (!existsSync2(this.indexPath)) {
      this.cache = null;
      this.cacheMtime = -1;
      return null;
    }
    try {
      const mtime = statSync2(this.indexPath).mtimeMs;
      if (this.cache !== null && mtime === this.cacheMtime) {
        return this.cache;
      }
      const raw = readFileSync3(this.indexPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 4) {
        this.cache = null;
        this.cacheMtime = mtime;
        return null;
      }
      this.cache = parsed;
      this.cacheMtime = mtime;
      return this.cache;
    } catch {
      this.cache = null;
      return null;
    }
  }
  /**
   * Returns true when the project-index.json file exists on disk.
   */
  isAvailable() {
    return existsSync2(this.indexPath);
  }
  /**
   * Total file count from the index stats block.
   * Returns 0 if the index is unavailable.
   */
  getTotalFiles() {
    return this.read()?.stats.total_files ?? 0;
  }
  /**
   * Total estimated token count, summed across all files in the tree.
   * Returns 0 if the index is unavailable.
   */
  getTotalTokens() {
    const index = this.read();
    if (!index) return 0;
    let total = 0;
    for (const files of Object.values(index.tree)) {
      for (const tokens of Object.values(files)) {
        total += tokens;
      }
    }
    return total;
  }
  /**
   * File count broken down by extension category.
   * Extension categories match the precision-engine's categorizeFileType output:
   * ts, js, json, md, css, html, py, go, rs, yaml, other.
   *
   * Returns an empty object if the index is unavailable.
   */
  getTypeCounts() {
    const index = this.read();
    if (!index) return {};
    const counts = {};
    for (const files of Object.values(index.tree)) {
      for (const filename of Object.keys(files)) {
        const ext = path3.extname(filename).toLowerCase().slice(1);
        const type = extToCategory(ext);
        counts[type] = (counts[type] ?? 0) + 1;
      }
    }
    return counts;
  }
  /**
   * Return the top N files sorted descending by token count.
   * Each entry contains the full relative path and its token count.
   * Returns an empty array if the index is unavailable or n <= 0.
   */
  getLargestFiles(n) {
    if (n <= 0) return [];
    const index = this.read();
    if (!index) return [];
    const entries = [];
    for (const [dir, files] of Object.entries(index.tree)) {
      for (const [filename, tokens] of Object.entries(files)) {
        const filePath = dir ? `${dir}/${filename}` : filename;
        entries.push({ path: filePath, tokens });
      }
    }
    entries.sort((a, b) => b.tokens - a.tokens || a.path.localeCompare(b.path));
    return entries.slice(0, n);
  }
};
function extToCategory(ext) {
  switch (ext) {
    case "ts":
    case "tsx":
      return "ts";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "js";
    case "json":
      return "json";
    case "md":
    case "mdx":
      return "md";
    case "css":
    case "scss":
    case "less":
      return "css";
    case "html":
    case "htm":
      return "html";
    case "py":
      return "py";
    case "go":
      return "go";
    case "rs":
      return "rs";
    case "yaml":
    case "yml":
      return "yaml";
    default:
      return "other";
  }
}
__name(extToCategory, "extToCategory");

// src/daemon/anomaly-detector.ts
var DEFAULT_LOGGER = {
  warn: /* @__PURE__ */ __name((msg) => console.warn(`[analytics] ${msg}`), "warn")
};
var MIN_RECORDS_THRESHOLD = 10;
var BUILD_CMD_RE = /npm\s+run\s+(build|test|lint|typecheck)|npx\s+tsc|jest|vitest/i;
function windowKey(type, windowMs, now = Date.now()) {
  const bucket = Math.floor(now / windowMs);
  return `${type}:${bucket}`;
}
__name(windowKey, "windowKey");
function anomalyId(type) {
  return `anomaly_${type}_${Date.now()}`;
}
__name(anomalyId, "anomalyId");
function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
__name(average, "average");
var WINDOW_5_MIN = 5 * 60 * 1e3;
var WINDOW_10_MIN = 10 * 60 * 1e3;
var cacheDegradationRule = {
  type: "cache_degradation",
  severity: "warning",
  windowMs: WINDOW_5_MIN,
  description: "Cache hit rate dropped >15% vs session average in a 5-min window",
  check(telemetry, state) {
    const windowRecords = telemetry.getRecordsInWindow(WINDOW_5_MIN);
    if (windowRecords.length === 0) return null;
    const windowHits = windowRecords.filter((r) => r.cache_hit).length;
    const windowRate = windowHits / windowRecords.length;
    const sessionRate = state.metrics.cache.hit_rate;
    const drop = sessionRate - windowRate;
    if (drop >= 0.15) {
      return {
        id: anomalyId("cache_degradation"),
        type: "cache_degradation",
        severity: "warning",
        message: `Cache hit rate degraded: ${(windowRate * 100).toFixed(1)}% in last 5m vs ${(sessionRate * 100).toFixed(1)}% session avg (drop: ${(drop * 100).toFixed(1)}pp)`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: {
          window_rate: windowRate,
          session_rate: sessionRate,
          drop_pp: drop,
          window_records: windowRecords.length
        }
      };
    }
    return null;
  }
};
var errorSpikeRule = {
  type: "error_spike",
  severity: "alert",
  windowMs: WINDOW_5_MIN,
  description: "Error rate exceeds 25% in a 5-min window",
  check(telemetry, _state) {
    const windowRecords = telemetry.getRecordsInWindow(WINDOW_5_MIN);
    if (windowRecords.length === 0) return null;
    const failed = windowRecords.filter((r) => r.status === "failed").length;
    const errorRate = failed / windowRecords.length;
    if (errorRate > 0.25) {
      return {
        id: anomalyId("error_spike"),
        type: "error_spike",
        severity: "alert",
        message: `Error spike detected: ${(errorRate * 100).toFixed(1)}% failure rate in last 5m (${failed}/${windowRecords.length} calls)`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: {
          error_rate: errorRate,
          failed_calls: failed,
          total_calls: windowRecords.length
        }
      };
    }
    return null;
  }
};
var tokenBurnRule = {
  type: "token_burn",
  severity: "warning",
  windowMs: WINDOW_5_MIN,
  description: "Token consumption rate >2x session average in a 5-min window",
  check(telemetry, state) {
    const windowRecords = telemetry.getRecordsInWindow(WINDOW_5_MIN);
    if (windowRecords.length === 0) return null;
    const windowTokens = windowRecords.reduce(
      (sum, r) => sum + (r.tokens_in ?? 0) + (r.tokens_out ?? 0),
      0
    );
    const earliest = Math.min(...windowRecords.map((r) => new Date(r.created_at).getTime()));
    const span = Math.max(Date.now() - earliest, 1);
    const windowRate = windowTokens / span;
    const sessionTotalTokens = state.metrics.tokens.total;
    const sessionUptimeMs = state.uptime_ms;
    if (sessionUptimeMs <= 0 || sessionTotalTokens <= 0) return null;
    const sessionRate = sessionTotalTokens / sessionUptimeMs;
    if (sessionRate <= 0) return null;
    const ratio = windowRate / sessionRate;
    if (ratio > 2) {
      return {
        id: anomalyId("token_burn"),
        type: "token_burn",
        severity: "warning",
        message: `Token burn rate is ${ratio.toFixed(1)}x session average (${Math.round(windowTokens).toLocaleString()} tokens in last 5m)`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: {
          window_tokens: windowTokens,
          window_rate_per_ms: windowRate,
          session_rate_per_ms: sessionRate,
          ratio
        }
      };
    }
    return null;
  }
};
var buildRegressionRule = {
  type: "build_regression",
  severity: "warning",
  windowMs: WINDOW_5_MIN,
  description: "Build/test duration >2x session average in a 5-min window",
  check(telemetry, _state) {
    const allRecords = telemetry.getRecords();
    const buildRecords = allRecords.filter(
      (r) => r.tool === "exec" && r.metadata !== void 0 && isBuildCommand(r.metadata)
    );
    if (buildRecords.length < 2) return null;
    const windowSince = Date.now() - WINDOW_5_MIN;
    const windowBuildRecords = buildRecords.filter(
      (r) => new Date(r.created_at).getTime() >= windowSince
    );
    if (windowBuildRecords.length === 0) return null;
    const sessionAvg = average(
      buildRecords.map((r) => r.duration_ms ?? 0).filter((d) => d > 0)
    );
    if (sessionAvg <= 0) return null;
    const windowAvg = average(
      windowBuildRecords.map((r) => r.duration_ms ?? 0).filter((d) => d > 0)
    );
    if (windowAvg <= 0) return null;
    const ratio = windowAvg / sessionAvg;
    if (ratio > 2) {
      return {
        id: anomalyId("build_regression"),
        type: "build_regression",
        severity: "warning",
        message: `Build regression: avg ${Math.round(windowAvg)}ms in last 5m vs ${Math.round(sessionAvg)}ms session avg (${ratio.toFixed(1)}x slower)`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: {
          window_avg_ms: windowAvg,
          session_avg_ms: sessionAvg,
          ratio,
          window_build_count: windowBuildRecords.length
        }
      };
    }
    return null;
  }
};
var conflictStormRule = {
  type: "conflict_storm",
  severity: "alert",
  windowMs: WINDOW_5_MIN,
  description: ">3 file conflicts detected in a 5-min window",
  check(telemetry, state) {
    if (state.metrics.files.conflicts === 0) return null;
    const windowRecords = telemetry.getRecordsInWindow(WINDOW_5_MIN);
    const conflictRecords = windowRecords.filter((r) => isConflictRecord(r));
    if (conflictRecords.length > 3) {
      return {
        id: anomalyId("conflict_storm"),
        type: "conflict_storm",
        severity: "alert",
        message: `Conflict storm: ${conflictRecords.length} file conflicts in last 5m`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: {
          conflict_count: conflictRecords.length,
          window_ms: WINDOW_5_MIN
        }
      };
    }
    return null;
  }
};
var agentStallRule = {
  type: "agent_stall",
  severity: "warning",
  windowMs: WINDOW_10_MIN,
  description: "Agent running >10min without tool call",
  check(_telemetry, state) {
    const now = Date.now();
    const stalledAgents = [];
    for (const profile of state.agent_profiles) {
      if (profile.status !== "active") continue;
      const agentActivity = state.recent_activity.filter(
        (a) => a.agent_id === profile.agent_id
      );
      let lastActivityTime;
      if (agentActivity.length > 0) {
        const latest = agentActivity.reduce(
          (a, b) => new Date(a.timestamp).getTime() > new Date(b.timestamp).getTime() ? a : b
        );
        lastActivityTime = new Date(latest.timestamp).getTime();
      } else {
        lastActivityTime = now - profile.duration_ms;
      }
      const idleMs = now - lastActivityTime;
      if (idleMs > WINDOW_10_MIN) {
        stalledAgents.push(profile.agent_id);
      }
    }
    if (stalledAgents.length > 0) {
      return {
        id: anomalyId("agent_stall"),
        type: "agent_stall",
        severity: "warning",
        message: `Agent stall: ${stalledAgents.length} agent(s) inactive >10min: ${stalledAgents.slice(0, 3).join(", ")}${stalledAgents.length > 3 ? "..." : ""}`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: {
          stalled_agents: stalledAgents,
          stall_threshold_ms: WINDOW_10_MIN
        }
      };
    }
    return null;
  }
};
function isBuildCommand(metadata) {
  try {
    const parsed = JSON.parse(metadata);
    const meta = typeof parsed === "object" && parsed !== null ? parsed : {};
    const cmd = typeof meta["cmd"] === "string" ? meta["cmd"] : "";
    return BUILD_CMD_RE.test(cmd);
  } catch {
    return BUILD_CMD_RE.test(metadata);
  }
}
__name(isBuildCommand, "isBuildCommand");
function isConflictRecord(record) {
  if (record.tool === "conflict") return true;
  if (!record.metadata) return false;
  try {
    const parsed = JSON.parse(record.metadata);
    const meta = typeof parsed === "object" && parsed !== null ? parsed : {};
    return meta["conflict"] === true || meta["type"] === "conflict" || typeof meta["conflict_file"] === "string";
  } catch {
    return false;
  }
}
__name(isConflictRecord, "isConflictRecord");
var BUILT_IN_RULES = [
  cacheDegradationRule,
  errorSpikeRule,
  tokenBurnRule,
  buildRegressionRule,
  conflictStormRule,
  agentStallRule
];
var AnomalyDetector = class {
  static {
    __name(this, "AnomalyDetector");
  }
  telemetry;
  config;
  rules;
  logger;
  /**
   * In-memory list of detected anomalies (newest last).
   * Pruned on demand via `pruneStale()`.
   */
  anomalies = [];
  /**
   * Deduplication map: windowKey(type, windowMs) → timestamp of last fire.
   * Prevents the same type from firing more than once per window bucket.
   */
  fired = /* @__PURE__ */ new Map();
  /**
   * @param telemetry - Initialized TelemetryReader (may be unavailable).
   * @param config    - Analytics configuration (detection can be disabled).
   * @param logger    - Optional structured logger; defaults to prefixed console.warn.
   */
  constructor(telemetry, config, logger = DEFAULT_LOGGER) {
    this.telemetry = telemetry;
    this.config = config;
    this.rules = BUILT_IN_RULES;
    this.logger = logger;
  }
  /**
   * Evaluate all rules against the current state and return any new anomalies.
   *
   * Rules that have already fired within their window are skipped (deduplicated).
   * Anomalies are also appended to the internal list returned by
   * `getActiveAnomalies()`.
   *
   * Returns an empty array if:
   *   - `config.anomaly_detection` is false, or
   *   - fewer than 10 total tool-call records exist (early-session protection), or
   *   - the telemetry reader is unavailable.
   *
   * @param state - Current aggregated dashboard state.
   * @returns Newly detected anomalies (may be empty).
   */
  detect(state) {
    if (!this.config.anomaly_detection) return [];
    if (!this.telemetry.isAvailable()) return [];
    const allRecords = this.telemetry.getRecords();
    if (allRecords.length < MIN_RECORDS_THRESHOLD) return [];
    this.pruneStale(30 * 60 * 1e3);
    const newAnomalies = [];
    const now = Date.now();
    for (const rule of this.rules) {
      const key = windowKey(rule.type, rule.windowMs, now);
      if (this.fired.has(key)) {
        continue;
      }
      let anomaly = null;
      try {
        anomaly = rule.check(this.telemetry, state);
      } catch (err) {
        this.logger.warn(`Rule '${rule.type}' threw an error: ${String(err)}`);
        continue;
      }
      if (anomaly !== null) {
        this.fired.set(key, now);
        this.anomalies.push(anomaly);
        newAnomalies.push(anomaly);
      }
    }
    return newAnomalies;
  }
  /**
   * Return all anomalies currently held in memory.
   *
   * The list includes all anomalies since the last `pruneStale()` call.
   * Ordered chronologically (oldest first).
   *
   * @returns Shallow copy of the active anomaly list.
   */
  getActiveAnomalies() {
    return [...this.anomalies];
  }
  /**
   * Remove anomalies older than `maxAgeMs` milliseconds from the in-memory
   * list, and clean up stale deduplication entries.
   *
   * Safe to call during or between `detect()` cycles. Keys to delete are
   * collected first to avoid mutating the Map during iteration.
   *
   * @param maxAgeMs - Maximum age in milliseconds. Anomalies older than this
   *                   are discarded.
   */
  pruneStale(maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    this.anomalies = this.anomalies.filter(
      (a) => new Date(a.timestamp).getTime() > cutoff
    );
    const toDelete = [];
    for (const [key, ts] of this.fired.entries()) {
      if (ts < cutoff) toDelete.push(key);
    }
    for (const key of toDelete) this.fired.delete(key);
  }
};

// src/daemon/budget-tracker.ts
var BudgetTracker = class {
  static {
    __name(this, "BudgetTracker");
  }
  /** Active budget configuration, or null if no budget is set. */
  budgetAmount = null;
  budgetUnit = null;
  /** Sorted ascending warn thresholds (fractions, e.g. [0.5, 0.8, 1.0]). */
  warnThresholds = [];
  /** Thresholds (as percentage fractions) that have already been reported. */
  crossedThresholds = /* @__PURE__ */ new Set();
  /** Most recently computed BudgetState. */
  currentState = null;
  /**
   * @param config - AnalyticsConfig to read initial budget and thresholds from.
   */
  constructor(config) {
    this.applyConfig(config);
  }
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  /**
   * Override or set a budget amount and unit.
   * Resets all crossed-threshold tracking when the budget changes.
   *
   * @param amount - Budget limit in the given unit.
   * @param unit   - Either 'dollars' or 'tokens'.
   */
  setBudget(amount, unit) {
    this.budgetAmount = amount;
    this.budgetUnit = unit;
    this.crossedThresholds.clear();
    this.currentState = null;
  }
  /**
   * Clear the active budget. All methods will return null after this call.
   */
  clearBudget() {
    this.budgetAmount = null;
    this.budgetUnit = null;
    this.crossedThresholds.clear();
    this.currentState = null;
  }
  /**
   * Recompute BudgetState from the provided metrics and config.
   *
   * @param metrics - Current session metrics snapshot.
   * @param config  - Current analytics configuration.
   * @returns The newly computed BudgetState, or null if no budget is configured.
   */
  update(metrics, config) {
    this.warnThresholds = [...config.budget_warn_thresholds].sort((a, b) => a - b);
    const amount = this.budgetAmount ?? config.budget?.amount ?? null;
    const unit = this.budgetUnit ?? config.budget?.unit ?? null;
    if (amount === null || unit === null) {
      this.currentState = null;
      return null;
    }
    const used = unit === "dollars" ? metrics.cost.total : metrics.tokens.total;
    const remaining = Math.max(0, amount - used);
    const percentage = amount > 0 ? used / amount : 0;
    const currentThreshold = this.resolveCurrentThreshold(percentage);
    this.currentState = {
      amount,
      unit,
      used,
      remaining,
      percentage,
      warn_thresholds: [...this.warnThresholds],
      current_threshold: currentThreshold
    };
    return this.currentState;
  }
  /**
   * Return the current BudgetState without recomputing.
   * Returns null if update() has not been called or no budget is configured.
   */
  getState() {
    return this.currentState;
  }
  /**
   * Check whether any new thresholds have been crossed since the last call.
   *
   * A threshold is "crossed" when the current usage percentage equals or
   * exceeds the threshold fraction. Each threshold is returned at most once
   * per session — subsequent calls return null for already-reported thresholds.
   *
   * @returns The lowest newly-crossed threshold or null if none.
   */
  checkThresholds() {
    if (this.currentState === null) return null;
    const { percentage } = this.currentState;
    for (const threshold of this.warnThresholds) {
      if (percentage >= threshold && !this.crossedThresholds.has(threshold)) {
        this.crossedThresholds.add(threshold);
        return { crossed: true, threshold };
      }
    }
    return null;
  }
  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------
  /**
   * Apply budget and threshold settings from a config object.
   */
  applyConfig(config) {
    if (config.budget) {
      this.budgetAmount = config.budget.amount;
      this.budgetUnit = config.budget.unit;
    }
    this.warnThresholds = [...config.budget_warn_thresholds].sort((a, b) => a - b);
  }
  /**
   * Find the highest threshold that the current percentage has reached.
   * Returns null if no threshold has been crossed.
   */
  resolveCurrentThreshold(percentage) {
    let highest = null;
    for (const threshold of this.warnThresholds) {
      if (percentage >= threshold) {
        highest = threshold;
      }
    }
    return highest;
  }
};

// src/daemon/memory-updater.ts
import { readFileSync as readFileSync4, writeFileSync, renameSync, mkdirSync, unlinkSync } from "node:fs";
import { join as join4 } from "node:path";
var HIGH_READ_COUNT = 5;
var SLOW_COMMAND_MS = 2e4;
var GOOD_CACHE_RATE = 0.7;
var HIGH_CONFLICT_COUNT = 5;
var MemoryUpdater = class {
  static {
    __name(this, "MemoryUpdater");
  }
  memoryDir;
  /**
   * @param memoryDir - Absolute path to the .goodvibes/memory/ directory.
   */
  constructor(memoryDir) {
    this.memoryDir = memoryDir;
  }
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  /**
   * Analyse a dashboard state snapshot and produce pattern/preference updates.
   *
   * Does NOT write anything to disk — call apply() to persist the results.
   *
   * @param state - Current DashboardState from the analytics daemon.
   * @returns Object with `patterns` and `preferences` arrays.
   */
  analyze(state) {
    const patterns = [];
    const preferences = [];
    const hotFiles = state.file_hotspots.filter((h) => h.reads >= HIGH_READ_COUNT);
    if (hotFiles.length > 0) {
      patterns.push({
        id: "pat_analytics_outline_mode",
        name: "FrequentlyReadFilesOutlineMode",
        description: `${hotFiles.length} file(s) were read ${HIGH_READ_COUNT}+ times this session. Use extract: outline or extract: symbols for repeated reads to save tokens.`,
        when_to_use: "When reading the same file more than 5 times in a session to understand its structure.",
        example_files: hotFiles.slice(0, 3).map((h) => h.path),
        keywords: ["outline", "symbols", "frequent-reads", "token-efficiency", "precision_read"]
      });
      preferences.push({
        key: "precision.default_extract_mode",
        value: "outline",
        reason: `${hotFiles.length} file(s) were read ${HIGH_READ_COUNT}+ times. Defaulting repeated reads to outline mode reduces token consumption.`
      });
    }
    const { commands } = state.metrics;
    if (commands.avg_duration_ms > SLOW_COMMAND_MS) {
      patterns.push({
        id: "pat_analytics_slow_commands",
        name: "SlowCommandOptimisation",
        description: `Commands averaged ${Math.round(commands.avg_duration_ms / 1e3)}s this session. Consider caching results, parallelising steps, or using incremental builds.`,
        when_to_use: "When command execution is a bottleneck in the development loop.",
        example_files: [],
        keywords: ["slow", "commands", "performance", "build", "optimisation"]
      });
    }
    const { cache } = state.metrics;
    if (cache.hit_rate >= GOOD_CACHE_RATE) {
      patterns.push({
        id: "pat_analytics_cache_efficiency",
        name: "HighCacheHitRate",
        description: `Cache hit rate was ${Math.round(cache.hit_rate * 100)}% this session. Current precision_read usage patterns are token-efficient \u2014 maintain them.`,
        when_to_use: "When deciding whether to change file-reading patterns; current approach is working well.",
        example_files: [],
        keywords: ["cache", "hit-rate", "efficiency", "precision_read", "positive"]
      });
      preferences.push({
        key: "cache.strategy",
        value: "with_content",
        reason: `High cache hit rate (${Math.round(cache.hit_rate * 100)}%) observed. Keep content caching enabled.`
      });
    }
    const { files } = state.metrics;
    if (files.conflicts >= HIGH_CONFLICT_COUNT) {
      patterns.push({
        id: "pat_analytics_conflict_coordination",
        name: "HighConflictCoordination",
        description: `${files.conflicts} file conflicts detected this session. Use agent scoping (per-feature subdirectories) to reduce concurrent write contention.`,
        when_to_use: "When multiple agents are writing to overlapping file paths in the same session.",
        example_files: [],
        keywords: ["conflicts", "coordination", "agent", "concurrency", "scoping"]
      });
    }
    return { patterns, preferences };
  }
  /**
   * Persist the provided updates to .goodvibes/memory/patterns.json and
   * .goodvibes/memory/preferences.json.
   *
   * Merge semantics:
   *   - Existing entries with the same id/key are replaced.
   *   - New entries are appended.
   *   - Entries absent from the update are preserved unchanged.
   *
   * Writes are atomic: content goes to a .tmp sibling first, then renamed.
   *
   * @param updates - Output from analyze().
   */
  apply(updates) {
    try {
      mkdirSync(this.memoryDir, { recursive: true });
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code !== "EEXIST") {
        throw err;
      }
    }
    if (updates.patterns.length > 0) {
      this.mergeAndWrite(
        join4(this.memoryDir, "patterns.json"),
        updates.patterns,
        "id"
      );
    }
    if (updates.preferences.length > 0) {
      this.mergeAndWrite(
        join4(this.memoryDir, "preferences.json"),
        updates.preferences,
        "key"
      );
    }
  }
  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------
  /**
   * Read an existing JSON array file, merge new entries by key, and atomically
   * write the result back.
   *
   * @param filePath  - Absolute path to the target .json file.
   * @param updates   - Array of items to merge in.
   * @param mergeKey  - Property name used as the unique identifier for merging.
   */
  mergeAndWrite(filePath, updates, mergeKey) {
    const existing = this.readJsonArray(filePath);
    const byKey = /* @__PURE__ */ new Map();
    for (const entry of existing) {
      byKey.set(entry[mergeKey], entry);
    }
    for (const update of updates) {
      byKey.set(update[mergeKey], { ...byKey.get(update[mergeKey]), ...update });
    }
    const merged = [];
    for (const entry of existing) {
      const key = entry[mergeKey];
      const updated = byKey.get(key);
      if (updated !== void 0) {
        merged.push(updated);
      }
    }
    const existingKeys = new Set(existing.map((e) => e[mergeKey]));
    for (const update of updates) {
      if (!existingKeys.has(update[mergeKey])) {
        merged.push(update);
      }
    }
    this.atomicWriteJson(filePath, merged);
  }
  /**
   * Read a JSON array file. Returns an empty array on any read/parse error.
   */
  readJsonArray(filePath) {
    try {
      const raw = readFileSync4(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch {
      return [];
    }
  }
  /**
   * Atomically write a JSON-serialisable value to filePath.
   *
   * Writes to filePath + '.tmp' within the same directory, then renames.
   * rename() on the same filesystem is atomic on POSIX systems.
   *
   * @throws If the write or rename fails.
   */
  atomicWriteJson(filePath, data) {
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    const content = JSON.stringify(data, null, 2) + "\n";
    try {
      writeFileSync(tmpPath, content, { encoding: "utf-8" });
      renameSync(tmpPath, filePath);
    } catch (err) {
      try {
        unlinkSync(tmpPath);
      } catch {
      }
      throw err;
    }
  }
};

// src/daemon/watcher.ts
import { EventEmitter as EventEmitter2 } from "node:events";
import { watch as watch2, existsSync as existsSync4, statSync as statSync5 } from "node:fs";
import { join as join7, dirname as dirname2, basename as basename2 } from "node:path";

// src/data/jsonl-watcher.ts
import { EventEmitter } from "node:events";
import { watch, existsSync as existsSync3, statSync as statSync4 } from "node:fs";
import { join as join6 } from "node:path";
import { readdir } from "node:fs/promises";

// src/data/jsonl-reader.ts
import { createReadStream, statSync as statSync3 } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join as join5, basename } from "node:path";
var CACHE_READ_COST_RATIO = 0.1;
var CACHE_WRITE_COST_RATIO = 0.25;
var JSONLReader = class {
  static {
    __name(this, "JSONLReader");
  }
  costPer1kInput;
  costPer1kOutput;
  /**
   * @param config - Pricing config for cost calculation.
   * @param config.cost_per_1k_input_tokens  - USD cost per 1,000 input tokens.
   * @param config.cost_per_1k_output_tokens - USD cost per 1,000 output tokens.
   */
  constructor(config) {
    this.costPer1kInput = config.cost_per_1k_input_tokens;
    this.costPer1kOutput = config.cost_per_1k_output_tokens;
  }
  // -------------------------------------------------------------------------
  // Core parsing
  // -------------------------------------------------------------------------
  /**
   * Parse a JSONL file from an optional byte offset.
   *
   * Uses readline for memory-efficient line-by-line reading. The byte offset
   * enables incremental / tail-style reads: persist `result.newOffset` and
   * pass it as `fromOffset` on the next call to read only new content.
   *
   * @param filePath   - Absolute path to the JSONL file.
   * @param fromOffset - Byte offset to start reading from (default: 0).
   * @returns Parsed records, new byte offset, and parse statistics.
   */
  async parseFile(filePath, fromOffset = 0) {
    const errors = [];
    const records = [];
    let linesParsed = 0;
    let linesSkipped = 0;
    let byteOffset = fromOffset;
    let fileSize;
    try {
      const fileStat = await stat(filePath);
      fileSize = fileStat.size;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        records,
        newOffset: fromOffset,
        linesParsed: 0,
        linesSkipped: 0,
        errors: [`Failed to stat file "${filePath}": ${message}`]
      };
    }
    if (fromOffset >= fileSize) {
      return { records, newOffset: fromOffset, linesParsed: 0, linesSkipped: 0, errors };
    }
    const stream = createReadStream(filePath, { start: fromOffset, encoding: "utf8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let bytesConsumed = 0;
    let lastValidOffset = fromOffset;
    for await (const line of rl) {
      const lineByteLength = Buffer.byteLength(line, "utf8") + 1;
      const trimmed = line.trim();
      if (trimmed === "") {
        bytesConsumed += lineByteLength;
        linesSkipped++;
        continue;
      }
      linesParsed++;
      const record = this.parseLine(trimmed);
      if (record !== null) {
        records.push(record);
        bytesConsumed += lineByteLength;
        lastValidOffset = fromOffset + bytesConsumed;
      } else {
        errors.push(`Skipped malformed line at ~offset ${fromOffset + bytesConsumed}: ${trimmed.slice(0, 80)}...`);
        bytesConsumed += lineByteLength;
        linesSkipped++;
      }
    }
    rl.close();
    byteOffset = lastValidOffset;
    return {
      records,
      newOffset: byteOffset,
      linesParsed,
      linesSkipped,
      errors
    };
  }
  /**
   * Parse an array of pre-split text lines.
   *
   * Useful for testing or when the caller has already split content.
   * Skips empty lines silently.
   *
   * @param lines - Array of raw text lines (not yet JSON.parse'd).
   * @returns Successfully parsed records (malformed lines silently dropped).
   */
  parseLines(lines) {
    const records = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      const record = this.parseLine(trimmed);
      if (record !== null) records.push(record);
    }
    return records;
  }
  /**
   * Parse a single JSON line into a JSONLRecord.
   *
   * Returns null on any parse failure (invalid JSON, missing type field,
   * or unrecognised type value) — never throws.
   *
   * @param line - Single trimmed line of text from a JSONL file.
   * @returns Parsed record, or null if the line is malformed or unrecognised.
   */
  parseLine(line) {
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null) return null;
      const record = parsed;
      const type = record["type"];
      if (type === "assistant") return record;
      if (type === "user") return record;
      if (type === "progress") return record;
      if (type === "file-history-snapshot") return record;
      return null;
    } catch {
      return null;
    }
  }
  // -------------------------------------------------------------------------
  // Extraction: ApiCallRecord
  // -------------------------------------------------------------------------
  /**
   * Extract API call records from assistant JSONL records.
   *
   * Each assistant record represents one Claude API response. Token counts
   * and cost are extracted from message.usage. Cost is calculated from
   * configured rates (cost_usd is NOT present in the JSONL format).
   *
   * Cache tokens are costed at reduced rates:
   *   - cache_read:  10% of input token cost (reading from cache is cheap)
   *   - cache_write: 25% of input token cost (writing to cache has a premium)
   *
   * @param records - Parsed JSONL records to scan.
   * @returns One ApiCallRecord per assistant record with usage data.
   */
  extractApiCalls(records) {
    const results = [];
    for (const record of records) {
      if (record.type !== "assistant") continue;
      const assistant = record;
      const usage = assistant.message?.usage;
      if (usage === void 0) continue;
      const inputTokens = usage.input_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? 0;
      const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
      const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
      if (inputTokens === 0 && outputTokens === 0) continue;
      const inputCost = inputTokens / 1e3 * this.costPer1kInput;
      const outputCost = outputTokens / 1e3 * this.costPer1kOutput;
      const cacheReadCost = cacheReadTokens / 1e3 * this.costPer1kInput * CACHE_READ_COST_RATIO;
      const cacheWriteCost = cacheWriteTokens / 1e3 * this.costPer1kInput * CACHE_WRITE_COST_RATIO;
      const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;
      results.push({
        session_id: assistant.sessionId ?? "",
        timestamp: assistant.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
        model: assistant.message?.model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_tokens: cacheReadTokens,
        cache_write_tokens: cacheWriteTokens,
        cost_usd: totalCost,
        duration_ms: 0,
        // Not available in JSONL; may be filled in by progress record correlation.
        stop_reason: assistant.message?.stop_reason
      });
    }
    return results;
  }
  // -------------------------------------------------------------------------
  // Extraction: ToolCallInfo
  // -------------------------------------------------------------------------
  /**
   * Extract tool call information by correlating assistant tool_use blocks
   * with their corresponding user tool_result blocks.
   *
   * Correlation is by tool_use_id (present in both the tool_use block and
   * the tool_result block).
   *
   * @param records - Parsed JSONL records to scan.
   * @returns One ToolCallInfo per tool_use block found in assistant records.
   */
  extractToolCalls(records) {
    const results = [];
    const resultMap = /* @__PURE__ */ new Map();
    for (const record of records) {
      if (record.type !== "user") continue;
      const user = record;
      const content = user.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const b = block;
        if (b?.type === "tool_result" && b.tool_use_id !== void 0) {
          resultMap.set(b.tool_use_id, b);
        }
      }
    }
    for (const record of records) {
      if (record.type !== "assistant") continue;
      const assistant = record;
      const content = assistant.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const b = block;
        if (b?.type !== "tool_use") continue;
        if (b.id === void 0 || b.name === void 0) continue;
        const result = resultMap.get(b.id);
        results.push({
          id: b.id,
          name: b.name,
          input: b.input ?? {},
          sessionId: assistant.sessionId ?? "",
          timestamp: assistant.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
          assistantRecordUuid: assistant.uuid ?? "",
          resultContent: result?.content,
          isError: result?.is_error
        });
      }
    }
    return results;
  }
  // -------------------------------------------------------------------------
  // Extraction: AgentActivityInfo
  // -------------------------------------------------------------------------
  /**
   * Infer agent activity from JSONL records.
   *
   * Agent spawns are NOT explicit record types. They are inferred from assistant
   * records containing tool_use blocks with name === 'Task'. Completion is
   * inferred by the presence of a tool_result block for the Task tool_use_id.
   *
   * @param records - Parsed JSONL records to scan.
   * @returns One AgentActivityInfo per Task tool_use block found.
   */
  extractAgentActivity(records) {
    const taskCalls = this.extractToolCalls(records).filter((tc) => tc.name === "Task");
    return taskCalls.map((tc) => ({
      agentId: tc.id,
      parentSessionId: tc.sessionId,
      spawnedAt: tc.timestamp,
      taskInput: tc.input,
      completed: tc.resultContent !== void 0,
      exitStatus: tc.isError === true ? "error" : tc.resultContent !== void 0 ? "success" : void 0
    }));
  }
  // -------------------------------------------------------------------------
  // Extraction: SessionInfo
  // -------------------------------------------------------------------------
  /**
   * Extract session-level summary information from a set of JSONL records.
   *
   * Uses the first record for session ID, cwd, and git branch.
   * Scans all records to find the earliest and latest timestamps.
   * Model comes from the first assistant record.
   *
   * @param records - All parsed records for a session.
   * @returns Session summary, or a stub with empty strings if no records are provided.
   */
  extractSessionInfo(records) {
    if (records.length === 0) {
      return {
        sessionId: "",
        model: "unknown",
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastActivityAt: (/* @__PURE__ */ new Date()).toISOString(),
        cwd: "",
        gitBranch: "",
        version: ""
      };
    }
    const first = records[0];
    let model = "unknown";
    let startedAt = first.timestamp ?? (/* @__PURE__ */ new Date()).toISOString();
    let lastActivityAt = startedAt;
    for (const record of records) {
      if (record.timestamp !== void 0 && record.timestamp < startedAt) {
        startedAt = record.timestamp;
      }
      if (record.timestamp !== void 0 && record.timestamp > lastActivityAt) {
        lastActivityAt = record.timestamp;
      }
      if (model === "unknown" && record.type === "assistant") {
        const assistantRecord = record;
        const m = assistantRecord.message?.model;
        if (m !== void 0 && m !== "") model = m;
      }
    }
    return {
      sessionId: first.sessionId ?? "",
      model,
      startedAt,
      lastActivityAt,
      cwd: first.cwd ?? "",
      gitBranch: first.gitBranch ?? "",
      version: first.version ?? ""
    };
  }
  // -------------------------------------------------------------------------
  // Extraction: PrecisionToolTiming
  // -------------------------------------------------------------------------
  /**
   * Extract precision tool timing data from JSONL progress records.
   *
   * Only 'completed' progress records contain elapsedTimeMs — 'started'
   * records are ignored since we only need the total duration.
   *
   * @param records - Parsed JSONL records to scan.
   * @returns One PrecisionToolTiming per completed progress event.
   */
  extractPrecisionToolTimings(records) {
    const results = [];
    for (const record of records) {
      if (record.type !== "progress") continue;
      const progress = record;
      const data = progress.data;
      if (data?.status !== "completed") continue;
      if (data.elapsedTimeMs === void 0) continue;
      if (progress.toolUseID === void 0) continue;
      results.push({
        toolUseId: progress.toolUseID,
        serverName: data.serverName ?? "",
        toolName: data.toolName ?? "",
        elapsedTimeMs: data.elapsedTimeMs,
        sessionId: progress.sessionId ?? "",
        timestamp: progress.timestamp ?? (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return results;
  }
  // -------------------------------------------------------------------------
  // Cost calculation helper
  // -------------------------------------------------------------------------
  /**
   * Calculate the USD cost for a given token breakdown.
   *
   * Uses configured per-1k rates with reduced rates for cache operations:
   *   - Input tokens:       full input rate
   *   - Output tokens:      full output rate
   *   - Cache read tokens:  10% of input rate
   *   - Cache write tokens: 25% of input rate
   *
   * @param usage - Token counts to calculate cost for.
   * @returns Total estimated cost in USD.
   */
  calculateCost(usage) {
    const inputCost = (usage.input_tokens ?? 0) / 1e3 * this.costPer1kInput;
    const outputCost = (usage.output_tokens ?? 0) / 1e3 * this.costPer1kOutput;
    const cacheReadCost = (usage.cache_read_tokens ?? 0) / 1e3 * this.costPer1kInput * CACHE_READ_COST_RATIO;
    const cacheWriteCost = (usage.cache_write_tokens ?? 0) / 1e3 * this.costPer1kInput * CACHE_WRITE_COST_RATIO;
    return inputCost + outputCost + cacheReadCost + cacheWriteCost;
  }
};
async function findActiveJsonlFile(projectDir) {
  const { readdir: readdir2 } = await import("node:fs/promises");
  let entries;
  try {
    entries = await readdir2(projectDir);
  } catch {
    return null;
  }
  const jsonlFiles = entries.filter((e) => e.endsWith(".jsonl"));
  if (jsonlFiles.length === 0) return null;
  let latestPath = null;
  let latestMtime = 0;
  for (const file of jsonlFiles) {
    const fullPath = join5(projectDir, file);
    try {
      const s = statSync3(fullPath);
      if (s.mtimeMs > latestMtime) {
        latestMtime = s.mtimeMs;
        latestPath = fullPath;
      }
    } catch {
    }
  }
  return latestPath;
}
__name(findActiveJsonlFile, "findActiveJsonlFile");
function sessionIdFromPath(jsonlPath) {
  return basename(jsonlPath, ".jsonl");
}
__name(sessionIdFromPath, "sessionIdFromPath");

// src/data/jsonl-watcher.ts
var JSONLWatcher = class extends EventEmitter {
  static {
    __name(this, "JSONLWatcher");
  }
  projectDir;
  batchIntervalMs;
  pollIntervalMs;
  reader;
  /** Currently active session JSONL path. */
  activeSessionPath = null;
  /** Currently active session ID. */
  activeSessionId = null;
  /** All watched files (main session + subagents). */
  watchedFiles = /* @__PURE__ */ new Map();
  /** Pending records accumulated between batch flushes. */
  pendingRecords = [];
  /** Batch flush interval handle. */
  batchTimer = null;
  /** Active session rotation detection interval. */
  rotationTimer = null;
  /** Whether the watcher is running. */
  running = false;
  /**
   * @param projectDir - Absolute path to the Claude project directory
   *                     (e.g. ~/.claude/projects/<project-hash>/).
   * @param options    - Optional configuration overrides.
   */
  constructor(projectDir, options) {
    super();
    this.projectDir = projectDir;
    this.batchIntervalMs = options?.batchIntervalMs ?? 1e3;
    this.pollIntervalMs = options?.pollIntervalMs ?? 2e3;
    this.reader = new JSONLReader(
      options?.costConfig ?? { cost_per_1k_input_tokens: 3e-3, cost_per_1k_output_tokens: 0.015 }
    );
  }
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  /**
   * Start watching the project directory for JSONL activity.
   *
   * Finds the active session JSONL, begins watching it, sets up subagent
   * watching, and starts the batch flush interval. Safe to call multiple
   * times — subsequent calls are no-ops if already running.
   */
  start() {
    if (this.running) return;
    this.running = true;
    this.initSessionWatch().catch((err) => {
      this.emitError(err instanceof Error ? err : new Error(String(err)));
    });
    this.batchTimer = setInterval(() => {
      this.flushPendingRecords();
    }, this.batchIntervalMs);
    this.rotationTimer = setInterval(() => {
      this.checkSessionRotation().catch((err) => {
        this.emitError(err instanceof Error ? err : new Error(String(err)));
      });
    }, 5e3);
  }
  /**
   * Stop all watchers, flush any pending records, and clean up timers.
   * Safe to call multiple times.
   */
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.batchTimer !== null) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    if (this.rotationTimer !== null) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    this.flushPendingRecords();
    for (const watched of this.watchedFiles.values()) {
      try {
        watched.handle.close();
      } catch {
      }
    }
    this.watchedFiles.clear();
    this.activeSessionPath = null;
    this.activeSessionId = null;
    this.pendingRecords = [];
  }
  /**
   * Returns the currently active session ID, or null if none has been detected.
   */
  getActiveSessionId() {
    return this.activeSessionId;
  }
  // -------------------------------------------------------------------------
  // Typed emit overrides
  // -------------------------------------------------------------------------
  /** Type-safe emit. */
  emit(event, ...args) {
    return super.emit(event, ...args);
  }
  /** Type-safe on. */
  on(event, listener) {
    return super.on(event, listener);
  }
  /** Type-safe once. */
  once(event, listener) {
    return super.once(event, listener);
  }
  /** Type-safe off. */
  off(event, listener) {
    return super.off(event, listener);
  }
  // -------------------------------------------------------------------------
  // Session initialisation
  // -------------------------------------------------------------------------
  /**
   * Detect the active session JSONL file and begin watching it.
   */
  async initSessionWatch() {
    const activePath = await findActiveJsonlFile(this.projectDir);
    if (activePath === null) {
      this.watchDirectoryForNewSession();
      return;
    }
    await this.switchToSession(activePath);
  }
  /**
   * Switch to watching a new session JSONL file.
   * Stops watching the previous session file and subagents.
   */
  async switchToSession(jsonlPath) {
    const newSessionId = sessionIdFromPath(jsonlPath);
    if (this.activeSessionPath !== null && this.activeSessionPath !== jsonlPath) {
      for (const [path4, watched] of this.watchedFiles.entries()) {
        try {
          watched.handle.close();
        } catch {
        }
        this.watchedFiles.delete(path4);
      }
      this.emit("session-change", newSessionId);
    }
    this.activeSessionPath = jsonlPath;
    this.activeSessionId = newSessionId;
    if (!this.watchedFiles.has(jsonlPath)) {
      this.attachFileWatcher(jsonlPath, false);
    }
    await this.watchSubagentFiles(newSessionId);
  }
  // -------------------------------------------------------------------------
  // File watching
  // -------------------------------------------------------------------------
  /**
   * Attach a watcher on a specific JSONL file.
   * Uses fs.watch with a polling fallback.
   *
   * @param filePath   - Absolute path to the JSONL file.
   * @param isSubagent - Whether this file belongs to a subagent.
   */
  attachFileWatcher(filePath, isSubagent) {
    if (this.watchedFiles.has(filePath)) return;
    let initialOffset = 0;
    try {
      const s = statSync4(filePath);
      initialOffset = isSubagent ? 0 : 0;
      void s;
    } catch {
      initialOffset = 0;
    }
    const watched = {
      path: filePath,
      offset: initialOffset,
      handle: {},
      // placeholder; replaced below
      isSubagent
    };
    const onFileChange = /* @__PURE__ */ __name(() => {
      this.readNewLines(watched).catch((err) => {
        this.emitError(err instanceof Error ? err : new Error(String(err)));
      });
    }, "onFileChange");
    try {
      const fsWatcher = watch(filePath, { persistent: false }, onFileChange);
      fsWatcher.on("error", (_err) => {
        try {
          fsWatcher.close();
        } catch {
        }
        if (this.watchedFiles.has(filePath)) {
          const w = this.watchedFiles.get(filePath);
          w.handle = this.createPollingHandle(filePath, onFileChange);
        }
      });
      watched.handle = fsWatcher;
    } catch {
      watched.handle = this.createPollingHandle(filePath, onFileChange);
    }
    this.watchedFiles.set(filePath, watched);
    this.readNewLines(watched).catch((err) => {
      this.emitError(err instanceof Error ? err : new Error(String(err)));
    });
  }
  /**
   * Create a polling handle for filesystems that do not support inotify.
   *
   * @param filePath - Path to poll.
   * @param onChange - Callback to invoke when mtime changes.
   * @returns A { close() } compatible handle.
   */
  createPollingHandle(filePath, onChange) {
    let lastMtime = 0;
    try {
      lastMtime = statSync4(filePath).mtimeMs;
    } catch {
    }
    const interval = setInterval(() => {
      if (!this.running) {
        clearInterval(interval);
        return;
      }
      try {
        const s = statSync4(filePath);
        if (s.mtimeMs !== lastMtime) {
          lastMtime = s.mtimeMs;
          onChange();
        }
      } catch {
      }
    }, this.pollIntervalMs);
    return { close: /* @__PURE__ */ __name(() => clearInterval(interval), "close") };
  }
  /**
   * Watch the project directory itself for new JSONL files (before any session starts).
   */
  watchDirectoryForNewSession() {
    const dirPath = this.projectDir;
    if (!existsSync3(dirPath)) return;
    let handle;
    const onDirChange = /* @__PURE__ */ __name((_eventType, filename) => {
      if (filename === null || !filename.endsWith(".jsonl")) return;
      const fullPath = join6(dirPath, filename);
      if (!existsSync3(fullPath)) return;
      this.switchToSession(fullPath).catch((err) => {
        this.emitError(err instanceof Error ? err : new Error(String(err)));
      });
      try {
        handle.close();
      } catch {
      }
    }, "onDirChange");
    try {
      handle = watch(dirPath, { persistent: false }, onDirChange);
    } catch {
      handle = { close() {
      } };
    }
  }
  // -------------------------------------------------------------------------
  // Subagent watching
  // -------------------------------------------------------------------------
  /**
   * Discover and watch subagent JSONL files for a session.
   *
   * Subagent files live at: <projectDir>/<sessionId>/subagents/agent-*.jsonl
   *
   * @param sessionId - The parent session ID.
   */
  async watchSubagentFiles(sessionId) {
    const subagentDir = join6(this.projectDir, sessionId, "subagents");
    if (!existsSync3(subagentDir)) return;
    let entries;
    try {
      entries = await readdir(subagentDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.startsWith("agent-") || !entry.endsWith(".jsonl")) continue;
      const fullPath = join6(subagentDir, entry);
      if (!this.watchedFiles.has(fullPath)) {
        this.attachFileWatcher(fullPath, true);
      }
    }
    this.watchSubagentDirectory(subagentDir, sessionId);
  }
  /**
   * Watch a subagent directory for newly created agent JSONL files.
   *
   * @param subagentDir - Absolute path to the subagents/ directory.
   * @param sessionId   - Parent session ID (for validation).
   */
  watchSubagentDirectory(subagentDir, sessionId) {
    if (this.watchedFiles.has(subagentDir)) return;
    const onDirChange = /* @__PURE__ */ __name((_eventType, filename) => {
      if (this.activeSessionId !== sessionId) return;
      if (filename === null) return;
      if (!filename.startsWith("agent-") || !filename.endsWith(".jsonl")) return;
      const fullPath = join6(subagentDir, filename);
      if (!existsSync3(fullPath)) return;
      if (!this.watchedFiles.has(fullPath)) {
        this.attachFileWatcher(fullPath, true);
      }
    }, "onDirChange");
    let handle;
    try {
      handle = watch(subagentDir, { persistent: false }, onDirChange);
    } catch {
      handle = { close() {
      } };
    }
    this.watchedFiles.set(subagentDir, {
      path: subagentDir,
      offset: 0,
      handle,
      isSubagent: true
    });
  }
  // -------------------------------------------------------------------------
  // Incremental reading
  // -------------------------------------------------------------------------
  /**
   * Read new lines from a watched file starting at its current offset.
   * Parsed records are accumulated in pendingRecords for batch flush.
   *
   * @param watched - The watched file state to read from.
   */
  async readNewLines(watched) {
    if (!this.running) return;
    try {
      const result = await this.reader.parseFile(watched.path, watched.offset);
      watched.offset = result.newOffset;
      if (result.records.length > 0) {
        this.pendingRecords.push(...result.records);
      }
      for (const error of result.errors) {
        this.emitError(new Error(`[JSONLWatcher] ${error}`));
      }
    } catch (err) {
      this.emitError(err instanceof Error ? err : new Error(String(err)));
    }
  }
  // -------------------------------------------------------------------------
  // Batch flush
  // -------------------------------------------------------------------------
  /**
   * Emit and clear the accumulated pending records.
   * Called by the batch interval timer and on stop().
   */
  flushPendingRecords() {
    if (this.pendingRecords.length === 0) return;
    const batch = this.pendingRecords.splice(0);
    this.emit("records", batch);
  }
  // -------------------------------------------------------------------------
  // Session rotation detection
  // -------------------------------------------------------------------------
  /**
   * Check whether a newer JSONL file has appeared (new session started).
   * Called periodically by the rotation timer.
   */
  async checkSessionRotation() {
    if (!this.running) return;
    const activePath = await findActiveJsonlFile(this.projectDir);
    if (activePath === null) return;
    if (activePath === this.activeSessionPath) return;
    await this.switchToSession(activePath);
  }
  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  /**
   * Emit an error event. Per EventEmitter convention, error events must have
   * a listener or they throw. We guard against this by checking listeners.
   */
  emitError(err) {
    if (this.listenerCount("error") > 0) {
      this.emit("error", err);
    }
  }
};

// src/daemon/watcher.ts
var DEBOUNCE_MS = 100;
var DataWatcher = class extends EventEmitter2 {
  static {
    __name(this, "DataWatcher");
  }
  goodvibesDir;
  pollIntervalMs;
  /** Active FSWatcher handles, keyed by the logical target path. */
  watchers = /* @__PURE__ */ new Map();
  /** Debounce timer handles, keyed by no-arg event names (all except 'jsonl-records'). */
  debounceTimers = /* @__PURE__ */ new Map();
  /** Whether the watcher is currently running. */
  running = false;
  /**
   * Embedded JSONLWatcher for live JSONL tailing.
   * Created when jsonlProjectDir is provided in options.
   * Null if no JSONL project directory is configured.
   */
  jsonlWatcher = null;
  /**
   * @param goodvibesDir - Absolute path to the .goodvibes directory.
   * @param options      - Configuration options.
   */
  constructor(goodvibesDir2, options) {
    super();
    this.goodvibesDir = goodvibesDir2;
    this.pollIntervalMs = options?.pollIntervalMs ?? 1e3;
    if (options?.jsonlProjectDir !== void 0) {
      this.jsonlWatcher = new JSONLWatcher(options.jsonlProjectDir, {
        batchIntervalMs: options.jsonlBatchIntervalMs,
        pollIntervalMs: options.pollIntervalMs,
        costConfig: options.jsonlCostConfig
      });
    }
  }
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  /**
   * Start watching all tracked paths.
   * Safe to call multiple times — subsequent calls are no-ops if already running.
   */
  start() {
    if (this.running) return;
    this.running = true;
    this.attachWatchers();
    if (this.jsonlWatcher !== null) {
      this.jsonlWatcher.on("records", (records) => {
        if (this.running) this.emit("jsonl-records", records);
      });
      this.jsonlWatcher.on("error", (_err) => {
      });
      this.jsonlWatcher.start();
    }
  }
  /**
   * Stop all active watchers and cancel pending debounce timers.
   * Safe to call multiple times — subsequent calls on a stopped watcher are no-ops.
   */
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.jsonlWatcher !== null) {
      try {
        this.jsonlWatcher.stop();
      } catch {
      }
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    for (const watcher of this.watchers.values()) {
      try {
        watcher.close();
      } catch {
      }
    }
    this.watchers.clear();
  }
  /**
   * Returns true if the watcher is currently active.
   */
  isRunning() {
    return this.running;
  }
  // -------------------------------------------------------------------------
  // Typed emit overrides
  // -------------------------------------------------------------------------
  /** Type-safe emit. */
  emit(event, ...args) {
    return super.emit(event, ...args);
  }
  /** Type-safe on. */
  on(event, listener) {
    return super.on(event, listener);
  }
  /** Type-safe once. */
  once(event, listener) {
    return super.once(event, listener);
  }
  /** Type-safe off. */
  off(event, listener) {
    return super.off(event, listener);
  }
  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------
  /**
   * Attach FSWatcher instances for each tracked path.
   * Paths that do not yet exist are watched via their parent directory.
   */
  attachWatchers() {
    const entries = [
      {
        targetPath: join7(this.goodvibesDir, "telemetry", "telemetry.db"),
        event: "telemetry-change"
      },
      {
        targetPath: join7(this.goodvibesDir, "state"),
        event: "session-change"
      },
      {
        targetPath: join7(this.goodvibesDir, "project-index.json"),
        event: "index-change"
      },
      {
        targetPath: join7(this.goodvibesDir, "goodvibes.json"),
        event: "config-change"
      }
    ];
    for (const entry of entries) {
      this.watchPath(entry.targetPath, entry.event);
    }
  }
  /**
   * Attach a single FSWatcher for a path.
   *
   * If the target path does not yet exist, watches the parent directory instead
   * and fires the event when the target filename is created or changed.
   * For directory targets (e.g. state/), any change within the directory fires.
   *
   * Falls back to mtime polling when fs.watch throws (e.g. ENOSYS on some
   * container filesystems or network mounts).
   *
   * @param targetPath - Logical path we care about (file or directory).
   * @param event      - Watcher event name to emit on change.
   */
  watchPath(targetPath, event) {
    const targetBasename = basename2(targetPath);
    const isDir = this.pathIsDirectory(targetPath);
    const watchTarget = existsSync4(targetPath) ? targetPath : dirname2(targetPath);
    const handler = /* @__PURE__ */ __name((_eventType, filename) => {
      if (existsSync4(targetPath)) {
        if (!isDir && filename !== null && filename !== targetBasename) {
          return;
        }
      } else {
        if (filename !== targetBasename) return;
        if (existsSync4(targetPath)) {
          this.rewatchPath(targetPath, event);
          return;
        }
      }
      this.debounceEmit(event);
    }, "handler");
    try {
      const watcher = watch2(watchTarget, {
        persistent: false
        /* watcher won't keep the Node.js process alive */
      }, handler);
      watcher.on("error", (_err) => {
        try {
          watcher.close();
        } catch {
        }
        this.watchers.delete(targetPath);
        this.attachPollingFallback(targetPath, event);
      });
      this.watchers.set(targetPath, watcher);
    } catch {
      this.attachPollingFallback(targetPath, event);
    }
  }
  /**
   * Re-attach a direct watcher for a path that has just been created.
   * Replaces any existing parent-directory watcher and emits the event once.
   *
   * @param targetPath - The path that now exists.
   * @param event      - Event name to emit.
   */
  rewatchPath(targetPath, event) {
    const existing = this.watchers.get(targetPath);
    if (existing) {
      try {
        existing.close();
      } catch {
      }
      this.watchers.delete(targetPath);
    }
    this.debounceEmit(event);
    this.watchPath(targetPath, event);
  }
  /**
   * Polling-based fallback for filesystems that do not support inotify.
   * Uses setInterval to periodically check the target file's mtime.
   *
   * @param targetPath    - Path to poll.
   * @param event         - Event to emit on change.
   */
  attachPollingFallback(targetPath, event) {
    if (this.watchers.has(targetPath)) return;
    let lastMtime = 0;
    try {
      lastMtime = statSync5(targetPath).mtimeMs;
    } catch {
    }
    const interval = setInterval(() => {
      if (!this.running) {
        clearInterval(interval);
        return;
      }
      try {
        const stat2 = statSync5(targetPath);
        if (stat2.mtimeMs !== lastMtime) {
          lastMtime = stat2.mtimeMs;
          this.debounceEmit(event);
        }
      } catch {
      }
    }, this.pollIntervalMs);
    const closeableInterval = {
      close: /* @__PURE__ */ __name(() => {
        clearInterval(interval);
      }, "close")
    };
    this.watchers.set(targetPath, closeableInterval);
  }
  /**
   * Returns true if the given path is an existing directory.
   */
  pathIsDirectory(targetPath) {
    try {
      return statSync5(targetPath).isDirectory();
    } catch {
      return false;
    }
  }
  /**
   * Debounce-emit an event. Subsequent calls within DEBOUNCE_MS reset the timer.
   *
   * @param event - Event name to emit after the debounce delay.
   */
  debounceEmit(event) {
    const existing = this.debounceTimers.get(event);
    if (existing !== void 0) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.debounceTimers.delete(event);
      if (this.running) {
        this.emit(event);
      }
    }, DEBOUNCE_MS);
    this.debounceTimers.set(event, timer);
  }
};

// src/daemon/aggregator.ts
var DEFAULT_LOGGER2 = {
  warn: /* @__PURE__ */ __name((msg) => console.warn(`[analytics:aggregator] ${msg}`), "warn")
};
var RECENT_ACTIVITY_LIMIT = 50;
var MEMORY_UPDATER_INTERVAL = 5;
var MAX_HOTSPOTS = 20;
var MAX_ANOMALIES = 50;
function emptySessionMetrics() {
  return {
    tokens: { input: 0, output: 0, total: 0, saved: 0, efficiency: 0, api_input: 0, api_output: 0, cache_read: 0, cache_write: 0 },
    cache: { hit_rate: 0, hits: 0, misses: 0, memory_peak_mb: 0, evictions: 0 },
    cost: { input: 0, output: 0, total: 0, saved: 0 },
    commands: { total: 0, success_rate: 1, avg_duration_ms: 0, total_duration_ms: 0, failures: 0, slowest: null },
    agents: { spawned: 0, max_concurrent: 0, total_tokens: 0, active: 0, completed: 0 },
    files: { unique_read: 0, modified: 0, created: 0, conflicts: 0 }
  };
}
__name(emptySessionMetrics, "emptySessionMetrics");
function emptyDashboardState(sessionId, startedAt) {
  return {
    session_id: sessionId,
    started_at: startedAt,
    uptime_ms: 0,
    metrics: emptySessionMetrics(),
    tools_breakdown: {},
    recent_activity: [],
    file_hotspots: [],
    agent_profiles: [],
    anomalies: [],
    budget: null,
    health_status: "healthy"
  };
}
__name(emptyDashboardState, "emptyDashboardState");
function computeHealthStatus(anomalies, metrics) {
  const errorRate = 1 - metrics.commands.success_rate;
  const hasAlert = anomalies.some((a) => a.severity === "alert");
  const hasWarning = anomalies.some((a) => a.severity === "warning");
  if (hasAlert || errorRate > 0.25) return "alert";
  if (hasWarning || errorRate > 0.1) return "warning";
  return "healthy";
}
__name(computeHealthStatus, "computeHealthStatus");
var TOOL_TO_ACTIVITY_TYPE = {
  read: "read",
  write: "write",
  edit: "edit",
  exec: "exec",
  grep: "grep",
  glob: "glob",
  discover: "discover",
  conflict: "conflict",
  agent_spawn: "agent_spawn",
  agent_complete: "agent_complete",
  fetch: "fetch",
  symbols: "symbols",
  notebook: "notebook"
};
function toolToActivityType(tool) {
  return TOOL_TO_ACTIVITY_TYPE[tool] ?? "exec";
}
__name(toolToActivityType, "toolToActivityType");
var Aggregator = class {
  static {
    __name(this, "Aggregator");
  }
  goodvibesDir;
  config;
  logger;
  // Data readers
  telemetry;
  session;
  index;
  // Daemon components
  anomalyDetector;
  budgetTracker;
  memoryUpdater;
  watcher;
  /** Cached current state. Updated on every refresh. */
  state = emptyDashboardState("", (/* @__PURE__ */ new Date()).toISOString());
  /** Timestamp when the aggregator was initialized. */
  startedAt = (/* @__PURE__ */ new Date()).toISOString();
  /** Registered state-change callbacks. */
  callbacks = [];
  /** Counter tracking how many refresh cycles have run. */
  refreshCount = 0;
  /** Whether initialize() has completed. */
  initialized = false;
  /** Mutex: true while a refresh() call is in progress. */
  refreshing = false;
  /** Whether another refresh was requested while one was already running. */
  refreshQueued = false;
  /**
   * @param goodvibesDir - Absolute path to the .goodvibes directory.
   * @param config       - Analytics configuration.
   * @param logger       - Optional structured logger; defaults to prefixed console.warn.
   */
  constructor(goodvibesDir2, config, logger = DEFAULT_LOGGER2) {
    this.goodvibesDir = goodvibesDir2;
    this.config = config;
    this.logger = logger;
  }
  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * Initialize all readers and start watching for changes.
   *
   * Must be called before `getState()` returns meaningful data.
   * Subsequent calls are no-ops (idempotent).
   *
   * @returns Promise that resolves once initialization is complete.
   */
  async initialize() {
    if (this.initialized) return;
    this.startedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.telemetry = new TelemetryReader(this.goodvibesDir);
    this.session = new SessionReader(this.goodvibesDir);
    this.index = new IndexReader(this.goodvibesDir);
    await this.telemetry.initialize();
    this.anomalyDetector = new AnomalyDetector(this.telemetry, this.config, this.logger);
    this.budgetTracker = new BudgetTracker(this.config);
    this.memoryUpdater = new MemoryUpdater(join8(this.goodvibesDir, "memory"));
    this.watcher = new DataWatcher(this.goodvibesDir);
    this.watcher.on("telemetry-change", () => {
      void this.refresh();
    });
    this.watcher.on("session-change", () => {
      void this.refresh();
    });
    this.watcher.on("index-change", () => {
      void this.refresh();
    });
    this.watcher.on("config-change", () => {
      void this.refresh();
    });
    this.watcher.start();
    await this.refresh();
    this.initialized = true;
  }
  /**
   * Get the current dashboard state.
   *
   * Returns the last computed snapshot. Call `refresh()` to force a new
   * computation, or rely on DataWatcher to trigger automatic updates.
   *
   * @returns The current aggregated DashboardState.
   */
  getState() {
    return this.state;
  }
  /**
   * Force a full refresh of all data sources and recompute the state.
   *
   * Triggers state-change callbacks if the state was updated.
   *
   * @returns Promise that resolves once the refresh is complete.
   */
  async refresh() {
    if (!this.initialized) {
      this.logger.warn("refresh() called before initialize()");
      return;
    }
    if (this.refreshing) {
      this.refreshQueued = true;
      return;
    }
    this.refreshing = true;
    try {
      const newState = this.aggregate();
      this.state = newState;
      this.refreshCount++;
      if (this.refreshCount % MEMORY_UPDATER_INTERVAL === 0) {
        try {
          const updates = this.memoryUpdater.analyze(this.state);
          if (updates.patterns.length > 0 || updates.preferences.length > 0) {
            this.memoryUpdater.apply(updates);
          }
        } catch (err) {
          this.logger.warn(`MemoryUpdater analysis failed: ${String(err)}`);
        }
      }
      this.notifyCallbacks();
    } catch (err) {
      this.logger.warn(`Aggregation refresh failed: ${String(err)}`);
    } finally {
      this.refreshing = false;
      if (this.refreshQueued) {
        this.refreshQueued = false;
        return this.refresh();
      }
    }
  }
  /**
   * Register a callback to be invoked whenever the state changes.
   *
   * The callback is called synchronously after each refresh cycle with the
   * new DashboardState.
   *
   * @param callback - Function to call with the updated state.
   * @returns An unsubscribe function that removes the callback when called.
   */
  onStateChange(callback) {
    this.callbacks.push(callback);
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx >= 0) this.callbacks.splice(idx, 1);
    };
  }
  /**
   * Clean shutdown: stop the DataWatcher, close the TelemetryReader.
   *
   * Safe to call multiple times — subsequent calls are no-ops.
   *
   * Async for future extensibility — shutdown steps may become async
   * (e.g. flushing buffered writes, awaiting in-flight refreshes).
   *
   * @returns Promise that resolves once shutdown is complete.
   */
  async shutdown() {
    if (this.watcher) {
      this.watcher.stop();
    }
    if (this.telemetry) {
      this.telemetry.close();
    }
  }
  /**
   * Set a budget constraint for the current session.
   *
   * Delegates to BudgetTracker and triggers a state refresh.
   *
   * @param amount - Budget amount.
   * @param unit   - Unit of measurement ('dollars' or 'tokens').
   */
  setBudget(amount, unit) {
    if (!this.initialized) {
      this.logger.warn("setBudget() called before initialize()");
      return;
    }
    this.budgetTracker.setBudget(amount, unit);
    void this.refresh();
  }
  /**
   * Clear the current budget constraint.
   *
   * Delegates to BudgetTracker and triggers a state refresh.
   */
  clearBudget() {
    if (!this.initialized) {
      this.logger.warn("clearBudget() called before initialize()");
      return;
    }
    this.budgetTracker.clearBudget();
    void this.refresh();
  }
  // ───────────────────────────────────────────────────────────────────────────
  // Private: aggregation
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * Compute a fresh DashboardState from all data sources.
   *
   * All errors within individual data sources are caught and logged so that
   * a single reader failure does not crash the entire aggregation.
   */
  aggregate() {
    const now = Date.now();
    const startedAtMs = new Date(this.startedAt).getTime();
    const uptimeMs = now - startedAtMs;
    const sessionId = this.telemetry?.getCurrentSessionId() ?? this.session?.readCurrentSession()?.id ?? "unknown";
    const telemetrySummary = this.safeCall(() => this.telemetry.getSessionSummary(), null);
    const tokenMetrics = this.safeCall(() => this.telemetry.getTokenMetrics(), null);
    const tokens = tokenMetrics ? {
      ...tokenMetrics,
      api_input: tokenMetrics.api_input ?? 0,
      api_output: tokenMetrics.api_output ?? 0,
      cache_read: tokenMetrics.cache_read ?? 0,
      cache_write: tokenMetrics.cache_write ?? 0
    } : {
      input: 0,
      output: 0,
      total: 0,
      saved: 0,
      efficiency: 0,
      api_input: 0,
      api_output: 0,
      cache_read: 0,
      cache_write: 0
    };
    const cache = this.buildCacheMetrics(telemetrySummary);
    const cost = {
      input: tokens.input / 1e3 * this.config.cost_per_1k_input_tokens,
      output: tokens.output / 1e3 * this.config.cost_per_1k_output_tokens,
      total: tokens.input / 1e3 * this.config.cost_per_1k_input_tokens + tokens.output / 1e3 * this.config.cost_per_1k_output_tokens,
      saved: tokens.saved / 1e3 * this.config.cost_per_1k_input_tokens
    };
    const commands = (() => {
      const execBreakdown = telemetrySummary?.by_tool["exec"];
      if (!execBreakdown) {
        return { total: 0, success_rate: 1, avg_duration_ms: 0, total_duration_ms: 0, failures: 0, slowest: null };
      }
      const total = execBreakdown.calls;
      const failures = Math.round(total * (1 - execBreakdown.success_rate));
      return {
        total,
        success_rate: execBreakdown.success_rate,
        avg_duration_ms: execBreakdown.avg_ms,
        total_duration_ms: execBreakdown.avg_ms * total,
        failures,
        slowest: null
        // would require scanning individual records
      };
    })();
    const sessionCounters = this.safeCall(() => this.session.getSessionCounters(), null);
    const agents = {
      spawned: sessionCounters?.agents_spawned ?? 0,
      max_concurrent: 0,
      // Requires active session-state tracking
      total_tokens: 0,
      active: 0,
      // Requires active session-state tracking
      completed: 0
      // Requires completion tracking — not yet available
    };
    const files = {
      unique_read: 0,
      modified: sessionCounters?.files_modified.length ?? 0,
      created: 0,
      conflicts: 0
    };
    const metrics = { tokens, cache, cost, commands, agents, files };
    const toolsBreakdown = telemetrySummary?.by_tool ?? {};
    const recentActivity = this.buildRecentActivity();
    const fileHotspots = this.buildFileHotspots(toolsBreakdown);
    const agentProfiles = this.buildAgentProfiles();
    const partialState = {
      session_id: sessionId,
      started_at: this.startedAt,
      uptime_ms: uptimeMs,
      metrics,
      tools_breakdown: toolsBreakdown,
      recent_activity: recentActivity,
      file_hotspots: fileHotspots,
      agent_profiles: agentProfiles,
      anomalies: this.state.anomalies,
      // carry forward existing anomalies
      budget: this.state.budget,
      health_status: this.state.health_status
    };
    const newAnomalies = this.safeCall(
      () => this.anomalyDetector.detect(partialState),
      []
    );
    const allAnomalies = [
      ...this.anomalyDetector.getActiveAnomalies(),
      ...newAnomalies
    ].filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i).slice(-MAX_ANOMALIES);
    const budget = this.safeCall(
      () => this.budgetTracker.update(metrics, this.config),
      null
    );
    const healthStatus = computeHealthStatus(allAnomalies, metrics);
    return {
      session_id: sessionId,
      started_at: this.startedAt,
      uptime_ms: uptimeMs,
      metrics,
      tools_breakdown: toolsBreakdown,
      recent_activity: recentActivity,
      file_hotspots: fileHotspots,
      agent_profiles: agentProfiles,
      anomalies: allAnomalies,
      budget,
      health_status: healthStatus
    };
  }
  /**
   * Build the recent activity list from the most recent telemetry records.
   */
  buildRecentActivity() {
    const records = this.safeCall(
      () => this.telemetry.getRecentRecords(RECENT_ACTIVITY_LIMIT),
      []
    );
    return records.map((r) => ({
      timestamp: r.created_at,
      type: toolToActivityType(r.tool),
      tool: r.tool,
      description: r.error ?? (r.status === "success" ? "ok" : r.status),
      duration_ms: r.duration_ms,
      cache_hit: r.cache_hit,
      tokens: (r.tokens_in ?? 0) + (r.tokens_out ?? 0),
      details: {
        status: r.status,
        tokens_in: r.tokens_in,
        tokens_out: r.tokens_out,
        cache_bytes_saved: r.cache_bytes_saved
      }
    }));
  }
  /**
   * Build file hotspot data from the tools breakdown.
   *
   * Uses the write/edit/read breakdown to approximate per-file access counts.
   * Without per-file telemetry, returns a simplified top-level summary.
   */
  buildFileHotspots(_breakdown) {
    const counters = this.safeCall(() => this.session.getSessionCounters(), null);
    if (!counters || counters.files_modified.length === 0) return [];
    return counters.files_modified.slice(0, MAX_HOTSPOTS).map((path4) => ({
      path: path4,
      reads: 0,
      writes: 1,
      conflicts: 0,
      tokens_saved: 0,
      last_accessed: (/* @__PURE__ */ new Date()).toISOString()
    }));
  }
  /**
   * Build agent profile data.
   *
   * Currently returns an empty array — per-agent token/timing data requires
   * session-state entries keyed by agent ID, which the current SessionReader
   * API does not expose. Will be populated when agent tracking is added to
   * the precision-engine data surface.
   */
  buildAgentProfiles() {
    return [];
  }
  // ───────────────────────────────────────────────────────────────────────────
  // Private: utilities
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * Build cache metrics from the telemetry summary.
   *
   * memory_peak_mb and evictions are not tracked in the telemetry DB;
   * they are reported as 0 until a richer data source is available.
   */
  buildCacheMetrics(telemetrySummary) {
    if (!telemetrySummary) {
      return { hit_rate: 0, hits: 0, misses: 0, memory_peak_mb: 0, evictions: 0 };
    }
    const hits = telemetrySummary.total_cache_hits;
    const total = telemetrySummary.total_calls;
    const misses = total - hits;
    const hitRate = total > 0 ? hits / total : 0;
    return {
      hit_rate: hitRate,
      hits,
      misses,
      memory_peak_mb: 0,
      // not tracked in telemetry DB
      evictions: 0
      // not tracked in telemetry DB
    };
  }
  /**
   * Execute a function and return its result, or a fallback value on error.
   *
   * Errors are logged at warn level but do not propagate — a single reader
   * failure must not abort the full aggregation cycle.
   *
   * @param fn       - Function to execute.
   * @param fallback - Value returned if fn throws.
   */
  safeCall(fn, fallback) {
    try {
      return fn();
    } catch (err) {
      this.logger.warn(`safeCall error: ${String(err)}`);
      return fallback;
    }
  }
  /**
   * Invoke all registered state-change callbacks with the current state.
   * Errors in callbacks are caught and logged to avoid cascade failures.
   */
  notifyCallbacks() {
    for (const cb of this.callbacks) {
      try {
        cb(this.state);
      } catch (err) {
        this.logger.warn(`State-change callback threw: ${String(err)}`);
      }
    }
  }
};

// src/tui/mini/format.ts
function formatNumber(n) {
  if (!isFinite(n)) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}
__name(formatNumber, "formatNumber");
function formatPercent(ratio) {
  if (!Number.isFinite(ratio)) return "0.0%";
  return `${(ratio * 100).toFixed(1)}%`;
}
__name(formatPercent, "formatPercent");
function formatDollars(amount) {
  if (!isFinite(amount)) return "$0.00";
  if (amount < 0) return `-$${Math.abs(amount).toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
__name(formatDollars, "formatDollars");
function formatUptime(ms) {
  if (!isFinite(ms) || ms < 0) return "0s";
  const totalSeconds = Math.floor(ms / 1e3);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
__name(formatUptime, "formatUptime");
function truncate(str, maxWidth) {
  if (maxWidth <= 0) return "";
  if (str.length <= maxWidth) return str;
  if (maxWidth <= 3) return str.slice(0, maxWidth);
  return str.slice(0, maxWidth - 3) + "...";
}
__name(truncate, "truncate");
var ansi = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  red: "\x1B[31m",
  cyan: "\x1B[36m",
  white: "\x1B[37m",
  bgGreen: "\x1B[42m",
  bgYellow: "\x1B[43m",
  bgRed: "\x1B[41m",
  box: {
    topLeft: "\u250C",
    // ┌
    topRight: "\u2510",
    // ┐
    bottomLeft: "\u2514",
    // └
    bottomRight: "\u2518",
    // ┘
    horizontal: "\u2500",
    // ─
    vertical: "\u2502",
    // │
    teeRight: "\u251C",
    // ├
    teeLeft: "\u2524"
    // ┤
  }
};
var BOX_CHARS = ansi.box;
function colorForHealth(status) {
  switch (status) {
    case "healthy":
      return ansi.green;
    case "warning":
      return ansi.yellow;
    case "alert":
      return ansi.red;
    default:
      status;
      return ansi.reset;
  }
}
__name(colorForHealth, "colorForHealth");

// src/tui/mini/renderer.ts
var MIN_WIDTH = 60;
var DEFAULT_WIDTH = 80;
var SESSION_ID_TRUNCATE_LENGTH = 16;
function getTerminalWidth() {
  const cols = process.stdout?.columns;
  return Math.max(MIN_WIDTH, cols != null && cols > 0 ? cols : DEFAULT_WIDTH);
}
__name(getTerminalWidth, "getTerminalWidth");
function visibleLength(str) {
  if (str == null) return 0;
  return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}
__name(visibleLength, "visibleLength");
function fitToWidth(str, width) {
  if (width <= 0) return "";
  const visible = visibleLength(str);
  if (visible === width) return str;
  if (visible < width) return str + " ".repeat(width - visible);
  let count = 0;
  let i = 0;
  const result = [];
  while (i < str.length && count < width) {
    if (str[i] === "\x1B" && str[i + 1] === "[") {
      const start = i;
      i += 2;
      while (i < str.length && str[i] !== "m") i++;
      i++;
      result.push(str.slice(start, i));
    } else {
      result.push(str[i]);
      count++;
      i++;
    }
  }
  result.push(ansi.reset);
  return result.join("");
}
__name(fitToWidth, "fitToWidth");
function buildSections(sections) {
  return sections.map((s, i) => i === 0 ? ` ${s}` : `  ${ansi.dim}\u2502${ansi.reset}  ${s}`).join("") + " ";
}
__name(buildSections, "buildSections");
function buildRow(content, borderColor, width) {
  const innerWidth = width - 2;
  const inner = fitToWidth(content, innerWidth);
  return `${borderColor}${ansi.box.vertical}${ansi.reset}${inner}${borderColor}${ansi.box.vertical}${ansi.reset}`;
}
__name(buildRow, "buildRow");
function determineHealth(state) {
  return state.health_status;
}
__name(determineHealth, "determineHealth");
function computeMetrics(state) {
  const metrics = state.metrics;
  const tokens = metrics.tokens;
  const cost = metrics.cost;
  const cache = metrics.cache;
  const agents = metrics.agents;
  const files = metrics.files;
  const commands = metrics.commands;
  const sessionId = state.session_id ? truncate(state.session_id, SESSION_ID_TRUNCATE_LENGTH) : "no-session";
  const uptime = formatUptime(state.uptime_ms);
  const toolCalls = formatNumber(
    (commands.total ?? 0) + (agents.spawned ?? 0)
  );
  const successRate = formatPercent(commands.success_rate ?? 0);
  const tokensUsed = formatNumber(tokens.total ?? 0);
  const tokensSaved = formatNumber(tokens.saved ?? 0);
  const savings = formatDollars(cost.saved ?? 0);
  const cacheRate = formatPercent(cache.hit_rate ?? 0);
  const agentsActive = agents.active ?? 0;
  const agentsMax = agents.max_concurrent ?? 0;
  const filesRead = formatNumber(files.unique_read ?? 0);
  const filesWritten = formatNumber(
    (files.modified ?? 0) + (files.created ?? 0)
  );
  const conflicts = files.conflicts ?? 0;
  const cmdTotal = formatNumber(commands.total ?? 0);
  const cmdFails = formatNumber(commands.failures ?? 0);
  const rawAvgMs = commands.avg_duration_ms;
  const cmdAvgSec = rawAvgMs != null && isFinite(rawAvgMs) && rawAvgMs > 0 ? (rawAvgMs / 1e3).toFixed(1) : "0.0";
  const rawNet = (cost.total ?? 0) - (cost.saved ?? 0);
  const netCost = formatDollars(isFinite(rawNet) ? rawNet : 0);
  return {
    sessionId,
    uptime,
    toolCalls,
    successRate,
    tokensUsed,
    tokensSaved,
    savings,
    cacheRate,
    agentsActive,
    agentsMax,
    filesRead,
    filesWritten,
    conflicts,
    cmdTotal,
    cmdFails,
    cmdAvgSec,
    netCost
  };
}
__name(computeMetrics, "computeMetrics");
function isValidState(state) {
  if (state == null || typeof state !== "object") return false;
  const s = state;
  if (typeof s["health_status"] !== "string") return false;
  if (s["metrics"] == null || typeof s["metrics"] !== "object") return false;
  const m = s["metrics"];
  return m["tokens"] != null && m["cost"] != null && m["cache"] != null && m["agents"] != null && m["files"] != null && m["commands"] != null;
}
__name(isValidState, "isValidState");
function renderFallback(width) {
  const borderColor = colorForHealth("warning");
  const innerWidth = width - 2;
  const msg = " no data \u2014 dashboard state unavailable";
  const line1 = `${borderColor}${ansi.box.topLeft}${ansi.box.horizontal.repeat(innerWidth)}${ansi.box.topRight}${ansi.reset}`;
  const line2 = buildRow(msg, borderColor, width);
  const line3 = buildRow("", borderColor, width);
  const line4 = `${borderColor}${ansi.box.bottomLeft}${ansi.box.horizontal.repeat(innerWidth)}${ansi.box.bottomRight}${ansi.reset}`;
  return [line1, line2, line3, line4].join("\n");
}
__name(renderFallback, "renderFallback");
var MiniRenderer = class {
  static {
    __name(this, "MiniRenderer");
  }
  loopHandle = null;
  resizeHandler = null;
  /** Create a new MiniRenderer. Zero-config — width auto-detects from terminal. */
  constructor() {
  }
  /**
   * Render the mini dashboard to a 4-line ANSI string.
   * Reads process.stdout.columns on each call for auto-width sizing.
   * Returns a fallback "no data" box if state is malformed.
   *
   * @param state - Current aggregated dashboard state
   * @returns 4-line string with ANSI color codes
   */
  render(state) {
    const w = getTerminalWidth();
    if (!isValidState(state)) {
      return renderFallback(w);
    }
    const health = determineHealth(state);
    const borderColor = colorForHealth(health);
    const innerWidth = w - 2;
    const m = computeMetrics(state);
    let headerContent;
    if (state.budget !== null) {
      const b = state.budget;
      const budgetUsed = formatDollars(b.used ?? 0);
      const budgetTotal = formatDollars(b.amount ?? 0);
      const rawPct = b.percentage;
      const budgetPct = rawPct != null && isFinite(rawPct) ? rawPct.toFixed(0) : "?";
      headerContent = ` analytics ${ansi.dim}\u2500${ansi.reset} ${m.sessionId} ${ansi.dim}\u2500${ansi.reset} ${m.uptime} ${ansi.dim}\u2500${ansi.reset} budget: ${budgetUsed}/${budgetTotal} (${budgetPct}%) `;
    } else {
      headerContent = ` analytics ${ansi.dim}\u2500${ansi.reset} ${m.sessionId} ${ansi.dim}\u2500${ansi.reset} ${m.uptime} ${ansi.dim}\u2500${ansi.reset} ${m.toolCalls} calls ${ansi.dim}\u2500${ansi.reset} ${m.successRate} `;
    }
    const headerVisible = visibleLength(headerContent);
    const dashCount = Math.max(0, innerWidth - headerVisible);
    const dashes = ansi.box.horizontal.repeat(dashCount);
    const line1 = `${borderColor}${ansi.box.topLeft}${ansi.reset}` + headerContent + `${borderColor}${dashes}${ansi.box.topRight}${ansi.reset}`;
    const row2Content = buildSections([
      `tokens ${ansi.bold}${m.tokensUsed}${ansi.reset} used`,
      `${m.tokensSaved} saved (${m.savings})`,
      `cache ${m.cacheRate}`,
      `agents ${m.agentsActive}/${m.agentsMax}`
    ]);
    const line2 = buildRow(row2Content, borderColor, w);
    const conflictStr = m.conflicts > 0 ? `${ansi.yellow}${m.conflicts}\u26A1${ansi.reset}` : `${m.conflicts}\u26A1`;
    const row3Content = buildSections([
      `files ${m.filesRead}r ${m.filesWritten}w ${conflictStr}`,
      `cmds ${m.cmdTotal} (${m.cmdFails}\u2717 ${m.cmdAvgSec}s avg)`,
      // ✗
      `cost ${m.netCost}`
    ]);
    const line3 = buildRow(row3Content, borderColor, w);
    const footerDashes = ansi.box.horizontal.repeat(innerWidth);
    const line4 = `${borderColor}${ansi.box.bottomLeft}${footerDashes}${ansi.box.bottomRight}${ansi.reset}`;
    return [line1, line2, line3, line4].join("\n");
  }
  /**
   * Start the render loop.
   * Clears the terminal and re-renders on each interval tick.
   *
   * @param getState - Callback that returns the latest dashboard state
   * @param intervalMs - Refresh interval in milliseconds (default: 2000)
   */
  startLoop(getState, intervalMs = 2e3) {
    if (this.loopHandle !== null) {
      this.stopLoop();
    }
    const draw = /* @__PURE__ */ __name(() => {
      try {
        const state = getState();
        const output = this.render(state);
        process.stdout.write("\x1B[H\x1B[2J" + output);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[analytics-mini] render error: ${msg}
`);
        const w = getTerminalWidth();
        process.stdout.write("\x1B[H\x1B[2J" + renderFallback(w));
      }
    }, "draw");
    draw();
    this.loopHandle = setInterval(draw, intervalMs);
    this.resizeHandler = draw;
    process.stdout.on("resize", this.resizeHandler);
  }
  /**
   * Stop the render loop.
   * Safe to call even if the loop is not running.
   */
  stopLoop() {
    if (this.resizeHandler !== null) {
      process.stdout.removeListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.loopHandle !== null) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
  }
};

// src/config.ts
import {
  readFileSync as readFileSync5,
  writeFileSync as writeFileSync2,
  existsSync as existsSync5,
  watchFile,
  unwatchFile
} from "node:fs";
import { join as join9 } from "node:path";
import { homedir } from "node:os";

// src/types.ts
var DEFAULT_CONFIG = {
  enabled: true,
  auto_start_mini: true,
  auto_start_full: false,
  auto_start_dashboard: false,
  refresh_rate_ms: 2e3,
  full_tui_refresh_rate_ms: 5e3,
  dashboard_refresh_rate_ms: 5e3,
  cost_per_1k_input_tokens: 3e-3,
  cost_per_1k_output_tokens: 0.015,
  budget: null,
  budget_warn_thresholds: [0.5, 0.8, 1],
  anomaly_detection: true,
  auto_report_on_shutdown: true,
  webhook_url: null,
  webhook_events: ["session_end"],
  global_db_path: "~/.claude/.goodvibes/analytics/analytics.db",
  jsonl_base_path: "~/.claude/projects",
  tmux: {
    mini_pane_size: 5,
    mini_position: "bottom",
    full_pane_size: "60%",
    dashboard_pane_size: "60%",
    full_position: "right",
    dashboard_position: "right"
  }
};

// src/config.ts
var GLOBAL_CONFIG_PATH = join9(
  homedir(),
  ".claude",
  ".goodvibes",
  "analytics",
  "analytics.json"
);
function tryLoadFile(filePath) {
  if (!existsSync5(filePath)) return null;
  try {
    const raw = readFileSync5(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ...DEFAULT_CONFIG, ...parsed };
    }
    return { ...DEFAULT_CONFIG };
  } catch (err) {
    console.warn(
      `[analytics] Config load failed for ${filePath}, using defaults:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}
__name(tryLoadFile, "tryLoadFile");
function loadConfig(goodvibesDir2) {
  const globalConfig = tryLoadFile(GLOBAL_CONFIG_PATH);
  if (globalConfig) return globalConfig;
  const projectConfig = tryLoadFile(join9(goodvibesDir2, "analytics.json"));
  if (projectConfig) return projectConfig;
  return { ...DEFAULT_CONFIG };
}
__name(loadConfig, "loadConfig");

// src/mini.ts
var goodvibesDir = process.env["GOODVIBES_DIR"] ?? ".goodvibes";
async function main() {
  const config = loadConfig(goodvibesDir);
  const aggregator = new Aggregator(goodvibesDir, config);
  await aggregator.initialize();
  const renderer = new MiniRenderer();
  renderer.startLoop(
    () => aggregator.getState(),
    config.refresh_rate_ms
  );
  const shutdown = /* @__PURE__ */ __name(async () => {
    renderer.stopLoop();
    await aggregator.shutdown();
    process.exit(0);
  }, "shutdown");
  process.on("SIGINT", () => {
    shutdown().catch(console.error);
  });
  process.on("SIGTERM", () => {
    shutdown().catch(console.error);
  });
}
__name(main, "main");
main().catch((err) => {
  console.error("[analytics-mini] Fatal:", err);
  process.exit(1);
});
//# sourceMappingURL=mini.js.map
