/* Bundled with esbuild */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// src/shared/gitignore.ts
var init_gitignore = __esm({
  "src/shared/gitignore.ts"() {
    "use strict";
  }
});

// src/session-end/index.ts
import { execFileSync } from "node:child_process";
import { readFileSync as readFileSync2, writeFileSync, existsSync as existsSync3, unlinkSync as unlinkSync2 } from "node:fs";
import { writeFile as writeFile3 } from "node:fs/promises";
import { basename, join as join4 } from "node:path";

// src/shared/hook-io.ts
import process2 from "process";
function isTestEnvironment() {
  return process2.env.NODE_ENV === "test" || process2.env.VITEST === "true" || typeof globalThis.__vitest_worker__ !== "undefined";
}
function isValidHookInput(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value;
  return typeof obj.session_id === "string" && typeof obj.cwd === "string" && typeof obj.hook_event_name === "string";
}
async function readHookInput() {
  const chunks = [];
  for await (const chunk of process2.stdin) {
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString());
  if (!isValidHookInput(parsed)) {
    throw new Error("Invalid hook input structure");
  }
  return parsed;
}
function formatResponse(response) {
  return JSON.stringify(response);
}
function respond(response, _block = false) {
  console.log(formatResponse(response));
  process2.exit(0);
}
function createResponse(options = {}) {
  const response = {
    continue: true
  };
  if (options.systemMessage !== void 0) {
    response.systemMessage = options.systemMessage;
  }
  if (options.additionalContext !== void 0) {
    response.additionalContext = options.additionalContext;
  }
  return response;
}

// src/shared/logging.ts
function debug(message, data) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  if (data !== void 0) {
    console.error(
      `[GoodVibes ${timestamp}] ${message}:`,
      JSON.stringify(data, null, 2)
    );
  } else {
    console.error(`[GoodVibes ${timestamp}] ${message}`);
  }
}
function logError(context, error) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : void 0;
  console.error(`[GoodVibes ${timestamp}] ERROR in ${context}: ${message}`);
  if (stack) {
    console.error(stack);
  }
}

// src/shared/file-utils.ts
import { exec as execCallback } from "child_process";
import * as fs from "fs/promises";
import { promisify } from "util";

// src/shared/constants.ts
import * as path from "path";
function resolvePluginRootFromDirname(dirname) {
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return process.env.CLAUDE_PLUGIN_ROOT;
  }
  if (dirname !== void 0 && dirname.includes("hooks")) {
    const hooksIndex = dirname.indexOf("hooks");
    if (hooksIndex > 0) {
      return dirname.substring(0, hooksIndex - 1);
    }
  }
  const devPluginPath = path.join(process.cwd(), "plugins", "goodvibes");
  return devPluginPath;
}
function resolvePluginRoot() {
  const currentDirname = typeof __dirname !== "undefined" ? __dirname : void 0;
  return resolvePluginRootFromDirname(currentDirname);
}
var PLUGIN_ROOT = resolvePluginRoot();
var PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
var CACHE_DIR = path.join(PLUGIN_ROOT, ".cache");
var ANALYTICS_FILE = path.join(CACHE_DIR, "analytics.json");

// src/shared/file-utils.ts
var exec = promisify(execCallback);
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    debug(`File access check failed for ${filePath}: ${error}`);
    return false;
  }
}

// src/shared/config.ts
var STDIN_TIMEOUT_MS = parseInt(
  process.env.GOODVIBES_STDIN_TIMEOUT_MS ?? "1000",
  10
);

// src/shared/index.ts
init_gitignore();

// src/shared/analytics-dir.ts
import { mkdirSync, existsSync } from "fs";
import { join as join2 } from "path";
import { homedir } from "os";
function ensureGlobalAnalyticsDir() {
  try {
    const analyticsDir = join2(homedir(), ".claude", ".goodvibes", "analytics");
    if (!existsSync(analyticsDir)) {
      mkdirSync(analyticsDir, { recursive: true });
      debug("Global analytics directory created");
    }
  } catch (err) {
    logError("ensureGlobalAnalyticsDir", err);
  }
}

// src/shared/analytics.ts
import * as fs2 from "fs/promises";
async function ensureCacheDir() {
  if (!await fileExists(CACHE_DIR)) {
    await fs2.mkdir(CACHE_DIR, { recursive: true });
  }
}
async function loadAnalytics() {
  await ensureCacheDir();
  if (await fileExists(ANALYTICS_FILE)) {
    try {
      const content = await fs2.readFile(ANALYTICS_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (typeof parsed === "object" && parsed !== null && "session_id" in parsed) {
        return parsed;
      }
      return null;
    } catch (error) {
      debug("loadAnalytics failed", { error: String(error) });
      return null;
    }
  }
  return null;
}
async function saveAnalytics(analytics) {
  await ensureCacheDir();
  await fs2.writeFile(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
}

// src/shared/keywords-data.json
var keywords_data_default = {
  stackKeywords: {
    frameworks_frontend: [
      "react",
      "nextjs",
      "next.js",
      "vue",
      "nuxt",
      "svelte",
      "sveltekit",
      "angular",
      "solid",
      "solidjs",
      "qwik",
      "astro",
      "remix",
      "gatsby"
    ],
    frameworks_backend: ["express", "fastify", "hono", "koa", "nest", "nestjs"],
    languages: ["typescript", "javascript", "python", "rust", "go", "golang"],
    databases: [
      "postgresql",
      "postgres",
      "mysql",
      "sqlite",
      "mongodb",
      "redis",
      "supabase",
      "firebase",
      "turso"
    ],
    orms: ["prisma", "drizzle", "typeorm", "sequelize", "knex", "kysely"],
    api: ["rest", "graphql", "trpc", "grpc", "websocket", "socket.io"],
    auth: ["clerk", "nextauth", "auth.js", "lucia", "auth0", "jwt", "oauth"],
    ui: [
      "tailwind",
      "tailwindcss",
      "shadcn",
      "radix",
      "chakra",
      "mantine",
      "mui"
    ],
    state: ["zustand", "redux", "jotai", "recoil", "mobx", "valtio"],
    testing: ["vitest", "jest", "playwright", "cypress", "testing-library"],
    build: ["vite", "webpack", "esbuild", "rollup", "turbopack", "bun"],
    devops: [
      "docker",
      "kubernetes",
      "vercel",
      "netlify",
      "cloudflare",
      "aws",
      "railway"
    ],
    ai: ["openai", "anthropic", "claude", "gpt", "llm", "langchain", "vercel-ai"]
  },
  transcriptKeywords: {
    frameworks: [
      "react",
      "next",
      "nextjs",
      "vue",
      "angular",
      "svelte",
      "remix",
      "astro",
      "express",
      "fastify",
      "hono",
      "koa",
      "nest",
      "nestjs",
      "django",
      "flask",
      "fastapi",
      "rails",
      "laravel",
      "spring",
      "springboot"
    ],
    databases: [
      "postgres",
      "postgresql",
      "mysql",
      "mariadb",
      "sqlite",
      "mongodb",
      "mongo",
      "redis",
      "dynamodb",
      "supabase",
      "planetscale",
      "turso",
      "neon",
      "prisma",
      "drizzle",
      "kysely",
      "typeorm",
      "sequelize"
    ],
    auth: [
      "auth",
      "authentication",
      "authorization",
      "oauth",
      "jwt",
      "session",
      "clerk",
      "auth0",
      "nextauth",
      "lucia",
      "passport",
      "login",
      "signup",
      "password",
      "token"
    ],
    testing: [
      "test",
      "testing",
      "jest",
      "vitest",
      "mocha",
      "chai",
      "playwright",
      "cypress",
      "puppeteer",
      "unit test",
      "integration test",
      "e2e",
      "coverage"
    ],
    api: [
      "api",
      "rest",
      "graphql",
      "trpc",
      "grpc",
      "endpoint",
      "route",
      "handler",
      "middleware",
      "openapi",
      "swagger",
      "apollo"
    ],
    devops: [
      "docker",
      "kubernetes",
      "k8s",
      "terraform",
      "ansible",
      "ci",
      "cd",
      "pipeline",
      "deploy",
      "deployment",
      "aws",
      "gcp",
      "azure",
      "vercel",
      "netlify",
      "railway",
      "github actions",
      "gitlab ci"
    ],
    frontend: [
      "css",
      "tailwind",
      "styled-components",
      "sass",
      "scss",
      "component",
      "ui",
      "ux",
      "responsive",
      "animation",
      "form",
      "modal",
      "table",
      "button",
      "input"
    ],
    state: [
      "state",
      "redux",
      "zustand",
      "jotai",
      "recoil",
      "mobx",
      "context",
      "provider",
      "store"
    ],
    typescript: [
      "typescript",
      "type",
      "interface",
      "generic",
      "enum",
      "zod",
      "yup",
      "io-ts",
      "validation",
      "schema"
    ],
    performance: [
      "performance",
      "optimization",
      "cache",
      "caching",
      "lazy",
      "bundle",
      "minify",
      "compress",
      "speed"
    ],
    security: [
      "security",
      "xss",
      "csrf",
      "sql injection",
      "sanitize",
      "encrypt",
      "hash",
      "ssl",
      "https",
      "cors"
    ],
    files: [
      "file",
      "upload",
      "download",
      "stream",
      "buffer",
      "read",
      "write",
      "create",
      "delete",
      "modify"
    ]
  }
};

// src/shared/keywords.ts
var STACK_KEYWORD_CATEGORIES = keywords_data_default.stackKeywords;
var TRANSCRIPT_KEYWORD_CATEGORIES = keywords_data_default.transcriptKeywords;
var ALL_STACK_KEYWORDS = Object.values(
  STACK_KEYWORD_CATEGORIES
).flat();
var ALL_TRANSCRIPT_KEYWORDS = Object.values(
  TRANSCRIPT_KEYWORD_CATEGORIES
).flat();
var ALL_KEYWORDS = [
  .../* @__PURE__ */ new Set([...ALL_STACK_KEYWORDS, ...ALL_TRANSCRIPT_KEYWORDS])
];
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var STACK_KEYWORD_REGEX_MAP = new Map(
  ALL_STACK_KEYWORDS.map((keyword) => [
    keyword,
    new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i")
  ])
);
var TRANSCRIPT_KEYWORD_REGEX_MAP = new Map(
  ALL_TRANSCRIPT_KEYWORDS.map((keyword) => [
    keyword,
    new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i")
  ])
);

// src/shared/runtime-client.ts
import * as net from "node:net";
import { existsSync as existsSync2, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join as join3 } from "node:path";
import { tmpdir } from "node:os";
var HOOK_EVENT_TIMEOUT_MS = 500;
var QUERY_TIMEOUT_MS = 500;
var DEBUG = process.env["GOODVIBES_DEBUG"] === "1";
function debug2(msg, ...args) {
  if (DEBUG) process.stderr.write(`[RuntimeClient] ${msg} ${args.map(String).join(" ")}
`);
}
function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
var RuntimeClient = class _RuntimeClient {
  /** Resolved state directory (.goodvibes/state) used for stale-socket cleanup. */
  stateDir;
  /** Session ID stored for re-discovery in isAvailableAsync(). */
  _sessionId;
  /**
   * Active socket path — single source of truth. May be updated by
   * isAvailableAsync() after a self-heal rediscovery.
   */
  _socketPath;
  /**
   * Public accessor for the resolved socket path. Returns the current
   * _socketPath value, which may be updated by isAvailableAsync() after
   * self-heal rediscovery.
   */
  get socketPath() {
    return this._socketPath;
  }
  /**
   * @param sessionId - Optional Claude Code session ID for session-keyed
   *   socket pointer lookup. When provided, enables exact-match discovery
   *   via `runtime-{sessionId}.socket` pointer files.
   */
  constructor(sessionId) {
    const cwd = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
    this.stateDir = join3(cwd, ".goodvibes", "state");
    this._sessionId = sessionId;
    this._socketPath = this.discoverSocket(sessionId);
  }
  // ─── Public API ─────────────────────────────────────────────────────────────
  /**
   * Checks whether a process is alive by sending signal 0.
   * Returns true if the process exists, false if it is dead or the PID is invalid.
   *
   * @param pid - OS process ID to probe.
   */
  static isProcessAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Probes a Unix domain socket by attempting a real connection with a 100 ms
   * timeout. Returns true only if the connection succeeds (i.e. a live process
   * is listening), false otherwise.
   *
   * @param socketPath - Absolute path to the Unix domain socket file.
   */
  static probeSocket(socketPath) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 100);
      const socket = net.createConnection(socketPath, () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }
  /**
   * Async liveness check: probes the socket with an actual connection attempt.
   *
   * Unlike the synchronous {@link isAvailable}, this method verifies that a
   * process is actively listening on the socket. If the probe fails, it
   * attempts a self-heal: cleans up the stale socket, re-runs discovery, and
   * probes the newly discovered path (if any).
   *
   * @returns `true` if a live runtime engine is reachable, `false` otherwise.
   */
  async isAvailableAsync() {
    if (!this._socketPath) return false;
    const alive = await _RuntimeClient.probeSocket(this._socketPath);
    if (!alive) {
      this.tryCleanStaleSocket(this._socketPath);
      this._socketPath = this.discoverSocket(this._sessionId);
      if (!this._socketPath) return false;
      return _RuntimeClient.probeSocket(this._socketPath);
    }
    return true;
  }
  /**
   * Returns true if the runtime engine socket path was discovered and the
   * socket file currently exists on disk.
   *
   * NOTE: This is a fast synchronous file-existence check only — it does NOT
   * attempt an actual socket connection. A stale socket file (from a dead
   * runtime process) will still return true. Use this as a fast-path guard;
   * actual connectivity is validated lazily on the first sendMessage call.
   * Strategy 3 of discoverSocket() sorts by mtime descending to prefer the
   * most recently written pointer file, reducing the chance of picking a stale
   * socket here.
   */
  isAvailable() {
    return this._socketPath !== null && existsSync2(this._socketPath);
  }
  /**
   * Notify the runtime engine of a hook event.
   *
   * Fire-and-forget semantics with a 500 ms timeout. Returns the response
   * data if the engine replies in time, or null otherwise. Errors are
   * swallowed — the hook must never fail because of this call.
   *
   * @param hookName  - Logical hook event name (e.g. 'session:started').
   * @param hookInput - Full hook input payload received from Claude Code.
   * @returns Response data from the engine, or null on timeout/error.
   */
  async sendHookEvent(hookName, hookInput) {
    if (!this.isAvailable()) return null;
    const message = {
      type: "hook_event",
      id: generateId(),
      hook_name: hookName,
      hook_input: hookInput,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    const response = await this.sendMessage(message, HOOK_EVENT_TIMEOUT_MS);
    if (!response || response.status === "error") return null;
    return response.data ?? null;
  }
  /**
   * Query the runtime engine for state or a decision.
   *
   * Times out after QUERY_TIMEOUT_MS milliseconds (default 500 ms). Returns null if the engine is unreachable or
   * the call fails for any reason. Errors are swallowed.
   *
   * @param query - The query to execute (discriminated by `kind`).
   * @returns Response data from the engine, or null on timeout/error.
   */
  async query(query) {
    if (!this.isAvailable()) return null;
    const message = {
      type: "query",
      id: generateId(),
      query
    };
    const response = await this.sendMessage(message, QUERY_TIMEOUT_MS);
    if (!response || response.status === "error") return null;
    return response.data ?? null;
  }
  // ─── Private helpers ────────────────────────────────────────────────────────
  /**
   * Best-effort cleanup of a confirmed-dead socket and its pointer file.
   *
   * Called from the sendMessage error handler when ECONNREFUSED is received
   * (the socket file exists but no process is listening). Scans the state
   * directory for pointer files that reference `deadSocketPath` and removes
   * both the pointer file and the dead socket file. Failures are ignored —
   * the cleanup is opportunistic and must never throw.
   *
   * @param deadSocketPath - Absolute path to the unresponsive socket file.
   */
  tryCleanStaleSocket(deadSocketPath) {
    try {
      debug2(`Cleaning stale socket: ${deadSocketPath}`);
      try {
        unlinkSync(deadSocketPath);
      } catch {
      }
      try {
        const entries = readdirSync(this.stateDir);
        for (const entry of entries) {
          if (!/^runtime-[a-zA-Z0-9_-]+\.socket$/.test(entry)) continue;
          const pointerPath = join3(this.stateDir, entry);
          try {
            const target = readFileSync(pointerPath, "utf-8").trim();
            if (target === deadSocketPath) {
              debug2(`Removing stale pointer file: ${pointerPath}`);
              unlinkSync(pointerPath);
            }
          } catch {
          }
        }
      } catch {
      }
    } catch {
    }
  }
  /**
   * Open a new Unix domain socket connection, write the JSON message
   * (newline-terminated), read the JSON response (newline-terminated),
   * then close. Returns null on timeout or any socket error.
   *
   * @param message   - The IPC message to send.
   * @param timeoutMs - Maximum milliseconds to wait before giving up.
   * @returns Parsed {@link IPCResponse}, or null on failure.
   */
  sendMessage(message, timeoutMs) {
    const socketPath = this._socketPath;
    return new Promise((resolve) => {
      let resolved = false;
      const done = (result) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => {
        socket.destroy();
        done(null);
      }, timeoutMs);
      const socket = net.createConnection({ path: socketPath });
      socket.once("error", (err) => {
        debug2(
          `Connection failed to ${socketPath}:`,
          `code=${err.code ?? "unknown"}`,
          `msg=${err.message}`
        );
        if (err.code === "ECONNREFUSED" || err.code === "ENOENT") {
          this.tryCleanStaleSocket(socketPath);
        }
        done(null);
      });
      socket.once("connect", () => {
        const payload = JSON.stringify(message) + "\n";
        socket.write(payload, "utf-8");
      });
      let rawData = "";
      socket.on("data", (chunk) => {
        rawData += chunk.toString("utf-8");
        const newlineIdx = rawData.indexOf("\n");
        if (newlineIdx === -1) return;
        const line = rawData.slice(0, newlineIdx);
        socket.destroy();
        try {
          const response = JSON.parse(line);
          done(response);
        } catch {
          done(null);
        }
      });
      socket.once("close", () => {
        done(null);
      });
    });
  }
  /**
   * Discover the runtime engine socket path using five strategies.
   *
   * Resolution order:
   * 1. `GOODVIBES_RUNTIME_SOCKET` env var — set by runtime engine at startup.
   * 2. Session-keyed pointer file `runtime-{sessionId}.socket` — exact match, no ambiguity.
   * 3. Pointer file scan `runtime-{id}.socket` (PID or UUID) — fallback for concurrent sessions.
   * 4. Legacy pointer file `runtime.socket` — backward compatibility with older engine versions.
   * 5. Well-known tmpdir path: `{os.tmpdir()}/goodvibes-runtime/runtime.sock`.
   *
   * @param sessionId - Optional Claude Code session ID for session-keyed lookup (Strategy 2).
   * @returns Absolute socket path string, or null if none is discoverable.
   */
  discoverSocket(sessionId) {
    const envPath = process.env["GOODVIBES_RUNTIME_SOCKET"];
    if (envPath) {
      return envPath;
    }
    const stateDir = this.stateDir;
    const stateDirExists = existsSync2(stateDir);
    if (sessionId && stateDirExists) {
      try {
        const sessionPointer = join3(stateDir, `runtime-${sessionId}.socket`);
        const socketPath = readFileSync(sessionPointer, "utf-8").trim();
        if (socketPath && existsSync2(socketPath)) return socketPath;
      } catch {
      }
    }
    if (stateDirExists) {
      try {
        const entries = readdirSync(stateDir);
        const pointerFiles = [];
        for (const entry of entries) {
          if (/^runtime-[a-zA-Z0-9_-]+\.socket$/.test(entry)) {
            try {
              const mtimeMs = statSync(join3(stateDir, entry)).mtimeMs;
              pointerFiles.push({ entry, mtimeMs });
            } catch {
            }
          }
        }
        pointerFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
        for (const { entry } of pointerFiles) {
          const pointerPath = join3(stateDir, entry);
          try {
            const socketPath = readFileSync(pointerPath, "utf-8").trim();
            if (!socketPath || !existsSync2(socketPath)) continue;
            const pidMatch = /^runtime-(\d+)\.socket$/.exec(entry);
            if (pidMatch) {
              const pid = parseInt(pidMatch[1], 10);
              if (!_RuntimeClient.isProcessAlive(pid)) {
                debug2(`Dead PID ${pid}, removing stale pointer ${entry}`);
                try {
                  unlinkSync(pointerPath);
                } catch {
                }
                try {
                  unlinkSync(socketPath);
                } catch {
                }
                continue;
              }
            }
            return socketPath;
          } catch {
          }
        }
      } catch {
      }
    }
    const legacyPointerFile = join3(stateDir, "runtime.socket");
    if (existsSync2(legacyPointerFile)) {
      try {
        const socketPath = readFileSync(legacyPointerFile, "utf-8").trim();
        if (socketPath && existsSync2(socketPath)) return socketPath;
      } catch {
      }
    }
    const defaultPath = join3(tmpdir(), "goodvibes-runtime", "runtime.sock");
    if (existsSync2(defaultPath)) {
      return defaultPath;
    }
    return null;
  }
};

// src/session-end/index.ts
var MS_PER_MINUTE = 6e4;
function cleanupDashboardPanes(sessionId) {
  try {
    const goodvibesDir = process.env.GOODVIBES_DIR || join4(process.env.CLAUDE_PROJECT_DIR || process.cwd(), ".goodvibes");
    const stateFile = join4(goodvibesDir, "active-panes.json");
    if (!existsSync3(stateFile)) return;
    let allState = {};
    try {
      allState = JSON.parse(readFileSync2(stateFile, "utf-8"));
    } catch {
      return;
    }
    const entry = allState[sessionId];
    if (!entry) return;
    for (const pane of [entry.mini, entry.full]) {
      if (pane !== null && pane !== void 0) {
        try {
          execFileSync("tmux", ["kill-pane", "-t", pane.paneId], { timeout: 5e3 });
        } catch {
        }
      }
    }
    delete allState[sessionId];
    writeFileSync(stateFile, JSON.stringify(allState, null, 2));
  } catch {
  }
}
async function runSessionEndHook() {
  try {
    debug("SessionEnd hook starting");
    ensureGlobalAnalyticsDir();
    const input = await readHookInput();
    try {
      const runtimeClient = new RuntimeClient(input.session_id);
      if (runtimeClient.isAvailable()) {
        debug("Phase 6: runtime engine available, sending session:ending event");
        void runtimeClient.sendHookEvent(
          "session:ending",
          input
        );
      }
    } catch {
    }
    try {
      const goodvibesDir = process.env.GOODVIBES_DIR || join4(process.env.CLAUDE_PROJECT_DIR || process.cwd(), ".goodvibes");
      const stateDir = join4(goodvibesDir, "state");
      const pointerFile = join4(stateDir, `runtime-${input.session_id}.socket`);
      if (existsSync3(pointerFile)) {
        unlinkSync2(pointerFile);
        debug(`Cleaned up session pointer file: ${pointerFile}`);
      }
    } catch {
    }
    debug("SessionEnd received input", {
      session_id: input.session_id
    });
    const jsonlSessionId = input.transcript_path ? basename(input.transcript_path, ".jsonl") : input.session_id;
    cleanupDashboardPanes(jsonlSessionId);
    const analytics = await loadAnalytics();
    if (analytics) {
      analytics.ended_at = (/* @__PURE__ */ new Date()).toISOString();
      const started = new Date(analytics.started_at).getTime();
      const ended = new Date(analytics.ended_at).getTime();
      const durationMinutes = Math.round((ended - started) / MS_PER_MINUTE);
      await saveAnalytics(analytics);
      const summaryFile = join4(
        CACHE_DIR,
        `session-${analytics.session_id}.json`
      );
      await writeFile3(
        summaryFile,
        JSON.stringify(
          {
            session_id: analytics.session_id,
            duration_minutes: durationMinutes,
            tools_used: analytics.tool_usage.length,
            unique_tools: [...new Set(analytics.tool_usage.map((u) => u.tool))],
            skills_recommended: analytics.skills_recommended.length,
            validations_run: analytics.validations_run,
            issues_found: analytics.issues_found,
            ended_reason: "session_end"
          },
          null,
          2
        )
      );
      debug(
        `Session ended. Duration: ${durationMinutes}m, Tools: ${analytics.tool_usage.length}`
      );
    }
    respond(createResponse());
  } catch (error) {
    logError("SessionEnd main", error);
    respond(createResponse());
  }
}
if (!isTestEnvironment()) {
  runSessionEndHook().catch((error) => {
    logError("SessionEnd uncaught", error);
    respond(createResponse());
  });
}
/* v8 ignore next 2 -- @preserve __dirname is always defined in Node.js CJS */
