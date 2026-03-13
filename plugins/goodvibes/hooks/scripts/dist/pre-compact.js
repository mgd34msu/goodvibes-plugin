/* Bundled with esbuild */
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/shared/gitignore.ts
var gitignore_exports = {};
__export(gitignore_exports, {
  SECURITY_GITIGNORE_ENTRIES: () => SECURITY_GITIGNORE_ENTRIES,
  ensureSecureGitignore: () => ensureSecureGitignore
});
import * as fs from "fs/promises";
import * as path2 from "path";
async function ensureSecureGitignore(cwd) {
  const gitignorePath = path2.join(cwd, ".gitignore");
  let content = "";
  try {
    await fs.access(gitignorePath);
    content = await fs.readFile(gitignorePath, "utf-8");
  } catch {
  }
  const entriesToAdd = [];
  for (const [section, patterns] of Object.entries(
    SECURITY_GITIGNORE_ENTRIES
  )) {
    const missing = patterns.filter((pattern) => !content.includes(pattern));
    if (missing.length > 0) {
      entriesToAdd.push(`
# ${section}`);
      entriesToAdd.push(...missing);
    }
  }
  if (entriesToAdd.length > 0) {
    const newContent = content.trimEnd() + "\n" + entriesToAdd.join("\n") + "\n";
    await fs.writeFile(gitignorePath, newContent);
  }
}
var SECURITY_GITIGNORE_ENTRIES;
var init_gitignore = __esm({
  "src/shared/gitignore.ts"() {
    "use strict";
    SECURITY_GITIGNORE_ENTRIES = {
      "GoodVibes plugin state": [".goodvibes/"],
      "Environment files": [".env", ".env.local", ".env.*.local", "*.env"],
      "Secret files": [
        "*.pem",
        "*.key",
        "credentials.json",
        "secrets.json",
        "service-account*.json"
      ],
      "Cloud credentials": [".aws/", ".gcp/", "kubeconfig"],
      "Database files": ["*.db", "*.sqlite", "*.sqlite3", "prisma/*.db"],
      "Log files": ["*.log", "logs/"]
    };
  }
});

// src/pre-compact/index.ts
import * as fs7 from "fs/promises";
import * as path6 from "path";

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
import * as fs2 from "fs/promises";
import * as path3 from "path";
import { promisify } from "util";

// src/shared/constants.ts
import * as path from "path";
function resolvePluginRootFromDirname(dirname2) {
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return process.env.CLAUDE_PLUGIN_ROOT;
  }
  if (dirname2 !== void 0 && dirname2.includes("hooks")) {
    const hooksIndex = dirname2.indexOf("hooks");
    if (hooksIndex > 0) {
      return dirname2.substring(0, hooksIndex - 1);
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
    await fs2.access(filePath);
    return true;
  } catch (error) {
    debug(`File access check failed for ${filePath}: ${error}`);
    return false;
  }
}
async function ensureGoodVibesDir(cwd) {
  const goodvibesDir = path3.join(cwd, ".goodvibes");
  if (!await fileExists(goodvibesDir)) {
    await fs2.mkdir(goodvibesDir, { recursive: true });
    await fs2.mkdir(path3.join(goodvibesDir, "memory"), { recursive: true });
    await fs2.mkdir(path3.join(goodvibesDir, "state"), { recursive: true });
    await fs2.mkdir(path3.join(goodvibesDir, "logs"), { recursive: true });
    await fs2.mkdir(path3.join(goodvibesDir, "telemetry"), { recursive: true });
    const { ensureSecureGitignore: ensureSecureGitignore2 } = await Promise.resolve().then(() => (init_gitignore(), gitignore_exports));
    await ensureSecureGitignore2(cwd);
  }
  const configFile = path3.join(goodvibesDir, "goodvibes.json");
  if (!await fileExists(configFile)) {
    await fs2.writeFile(configFile, "{}\n", "utf-8");
  }
  return goodvibesDir;
}

// src/shared/config.ts
var STDIN_TIMEOUT_MS = parseInt(
  process.env.GOODVIBES_STDIN_TIMEOUT_MS ?? "1000",
  10
);
var CHECKPOINT_TRIGGERS = {
  fileCountThreshold: 5,
  afterAgentComplete: true,
  afterMajorChange: true
};

// src/shared/index.ts
init_gitignore();

// src/shared/analytics.ts
import * as fs3 from "fs/promises";
async function ensureCacheDir() {
  if (!await fileExists(CACHE_DIR)) {
    await fs3.mkdir(CACHE_DIR, { recursive: true });
  }
}
async function loadAnalytics() {
  await ensureCacheDir();
  if (await fileExists(ANALYTICS_FILE)) {
    try {
      const content = await fs3.readFile(ANALYTICS_FILE, "utf-8");
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

// src/shared/transcript.ts
import * as fs4 from "fs/promises";
var TRANSCRIPT_SUMMARY_MAX_LENGTH = 500;
async function parseTranscript(transcriptPath) {
  const toolsUsed = /* @__PURE__ */ new Set();
  const filesModified = [];
  let lastAssistantMessage = "";
  try {
    const content = await fs4.readFile(transcriptPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (typeof event !== "object" || event === null) {
          continue;
        }
        const eventObj = event;
        if (eventObj.type === "tool_use" && typeof eventObj.name === "string") {
          toolsUsed.add(eventObj.name);
          if (["Write", "Edit"].includes(eventObj.name)) {
            const input = eventObj.input;
            if (input?.file_path && typeof input.file_path === "string") {
              filesModified.push(input.file_path);
            }
          }
        }
        if (eventObj.role === "assistant" && eventObj.content) {
          lastAssistantMessage = typeof eventObj.content === "string" ? eventObj.content : JSON.stringify(eventObj.content);
        }
      } catch (error) {
        debug("parseTranscript line parse failed", { error: String(error) });
      }
    }
  } catch (error) {
    debug("parseTranscript read failed", { error: String(error) });
  }
  return {
    toolsUsed: Array.from(toolsUsed),
    filesModified: [...new Set(filesModified)],
    summary: lastAssistantMessage.slice(0, TRANSCRIPT_SUMMARY_MAX_LENGTH)
  };
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
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join as join4 } from "node:path";
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
    this.stateDir = join4(cwd, ".goodvibes", "state");
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
    return new Promise((resolve2) => {
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve2(false);
      }, 100);
      const socket = net.createConnection(socketPath, () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve2(true);
      });
      socket.on("error", () => {
        clearTimeout(timeout);
        resolve2(false);
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
    return this._socketPath !== null && existsSync(this._socketPath);
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
    if (!this.isAvailable() && !await this.isAvailableAsync()) return null;
    const message = {
      type: "hook_event",
      id: generateId(),
      hook_name: hookName,
      hook_input: hookInput,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    let response = await this.sendMessage(message, HOOK_EVENT_TIMEOUT_MS);
    if (!response) {
      if (await this.isAvailableAsync()) {
        response = await this.sendMessage(message, HOOK_EVENT_TIMEOUT_MS);
      }
    }
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
    if (!this.isAvailable() && !await this.isAvailableAsync()) return null;
    const message = {
      type: "query",
      id: generateId(),
      query
    };
    let response = await this.sendMessage(message, QUERY_TIMEOUT_MS);
    if (!response) {
      if (await this.isAvailableAsync()) {
        response = await this.sendMessage(message, QUERY_TIMEOUT_MS);
      }
    }
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
          const pointerPath = join4(this.stateDir, entry);
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
      if (process.env["GOODVIBES_DEBUG"]) {
        console.error("[RuntimeClient] tryCleanStaleSocket failed silently");
      }
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
    if (!this._socketPath) return Promise.resolve(null);
    const socketPath = this._socketPath;
    return new Promise((resolve2) => {
      let resolved = false;
      const done = (result) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve2(result);
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
    const stateDirExists = existsSync(stateDir);
    if (sessionId && stateDirExists) {
      try {
        const sessionPointer = join4(stateDir, `runtime-${sessionId}.socket`);
        const socketPath = readFileSync(sessionPointer, "utf-8").trim();
        if (socketPath && existsSync(socketPath)) return socketPath;
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
              const mtimeMs = statSync(join4(stateDir, entry)).mtimeMs;
              pointerFiles.push({ entry, mtimeMs });
            } catch {
            }
          }
        }
        pointerFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
        for (const { entry } of pointerFiles) {
          const pointerPath = join4(stateDir, entry);
          try {
            const socketPath = readFileSync(pointerPath, "utf-8").trim();
            if (!socketPath || !existsSync(socketPath)) continue;
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
    const legacyPointerFile = join4(stateDir, "runtime.socket");
    if (existsSync(legacyPointerFile)) {
      try {
        const socketPath = readFileSync(legacyPointerFile, "utf-8").trim();
        if (socketPath && existsSync(socketPath)) return socketPath;
      } catch {
      }
    }
    const defaultPath = join4(tmpdir(), "goodvibes-runtime", "runtime.sock");
    if (existsSync(defaultPath)) {
      return defaultPath;
    }
    return null;
  }
};

// src/state/persistence.ts
import * as fs5 from "fs/promises";
import * as path4 from "path";

// src/types/state.ts
function createDefaultState() {
  return {
    session: {
      id: "",
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      mode: "default",
      featureDescription: null
    },
    errors: {},
    tests: {
      lastFullRun: null,
      lastQuickRun: null,
      passingFiles: [],
      failingFiles: [],
      pendingFixes: []
    },
    build: {
      lastRun: null,
      status: "unknown",
      errors: [],
      fixAttempts: 0
    },
    git: {
      mainBranch: "main",
      currentBranch: "main",
      featureBranch: null,
      featureStartedAt: null,
      featureDescription: null,
      checkpoints: [],
      pendingMerge: false
    },
    files: {
      modifiedSinceCheckpoint: [],
      modifiedThisSession: [],
      createdThisSession: []
    },
    devServers: {}
  };
}

// src/state/persistence.ts
var STATE_FILE = "state/hooks-state.json";
async function loadState(cwd, options = {}) {
  const { throwOnError = false } = options;
  const goodvibesDir = path4.join(cwd, ".goodvibes");
  const statePath = path4.join(goodvibesDir, STATE_FILE);
  if (!await fileExists(statePath)) {
    return createDefaultState();
  }
  try {
    const content = await fs5.readFile(statePath, "utf-8");
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && "session" in parsed) {
      return parsed;
    }
    return createDefaultState();
  } catch (error) {
    debug("Failed to load state, using defaults", error);
    if (throwOnError) {
      throw error;
    }
    return createDefaultState();
  }
}
async function saveState(cwd, state, options = {}) {
  const { throwOnError = false } = options;
  await ensureGoodVibesDir(cwd);
  const statePath = path4.join(cwd, ".goodvibes", STATE_FILE);
  const stateDir = path4.dirname(statePath);
  if (!await fileExists(stateDir)) {
    await fs5.mkdir(stateDir, { recursive: true });
  }
  try {
    const tempPath = statePath + ".tmp";
    await fs5.writeFile(tempPath, JSON.stringify(state, null, 2));
    await fs5.rename(tempPath, statePath);
  } catch (error) {
    debug("Failed to save state", error);
    if (throwOnError) {
      throw error;
    }
  }
}

// src/pre-compact/state-preservation.ts
import * as fs6 from "fs/promises";
import * as path5 from "path";

// src/automation/git-operations.ts
import { exec as exec2 } from "child_process";
import { promisify as promisify2 } from "util";

// src/automation/spawn-utils.ts
import { spawn } from "child_process";
function spawnAsync(command, args, options) {
  return new Promise((resolve2) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    const timeoutId = options.timeout ? setTimeout(() => {
      child.kill("SIGTERM");
      resolve2({
        code: null,
        stdout,
        stderr: stderr + "\nProcess timed out"
      });
    }, options.timeout) : (
      /* v8 ignore next -- @preserve defensive: all exported functions always provide timeout */
      null
    );
    child.on("close", (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve2({ code, stdout, stderr });
    });
    child.on("error", (err) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve2({ code: null, stdout, stderr: err.message });
    });
  });
}
function sanitizeForGit(input) {
  return input.replace(/[`$\\;"'|&<>(){}[\]!#*?~]/g, "");
}

// src/automation/git-operations.ts
var execAsync = promisify2(exec2);
async function execGit(command, cwd) {
  try {
    const { stdout } = await execAsync(command, {
      cwd,
      encoding: "utf-8",
      timeout: 3e4
    });
    return stdout.trim();
  } catch (error) {
    debug("execGit failed", { command, error: String(error) });
    return null;
  }
}
async function hasUncommittedChanges(cwd) {
  const status = await execGit("git status --porcelain", cwd);
  return status !== null && status.length > 0;
}
async function createCheckpoint(cwd, message) {
  if (!await hasUncommittedChanges(cwd)) {
    return false;
  }
  try {
    const safeMessage = sanitizeForGit(message);
    const commitMessage = `checkpoint: ${safeMessage}

 Auto-checkpoint by GoodVibes`;
    await execAsync("git add -A", { cwd, timeout: 3e4 });
    const result = await spawnAsync("git", ["commit", "-m", commitMessage], {
      cwd,
      timeout: 3e4
    });
    return result.code === 0;
  } catch (error) {
    debug("createCheckpoint failed", { error: String(error) });
    return false;
  }
}

// src/post-tool-use/file-tracker.ts
function clearCheckpointTracking(state) {
  return {
    ...state,
    files: {
      ...state.files,
      modifiedSinceCheckpoint: []
    }
  };
}
function getModifiedFileCount(state) {
  return state.files.modifiedSinceCheckpoint.length;
}

// src/post-tool-use/checkpoint-manager.ts
function shouldCheckpoint(state, _cwd) {
  const fileCount = getModifiedFileCount(state);
  if (fileCount >= CHECKPOINT_TRIGGERS.fileCountThreshold) {
    return { triggered: true, reason: `${fileCount} files modified` };
  }
  return { triggered: false, reason: "" };
}
async function createCheckpointIfNeeded(state, cwd, forcedReason) {
  const trigger = forcedReason ? { triggered: true, reason: forcedReason } : shouldCheckpoint(state, cwd);
  if (!trigger.triggered) {
    return { created: false, message: "", state };
  }
  if (!await hasUncommittedChanges(cwd)) {
    return { created: false, message: "No changes to checkpoint", state };
  }
  const success = await createCheckpoint(cwd, trigger.reason);
  if (success) {
    const updatedState = clearCheckpointTracking(state);
    const finalState = {
      ...updatedState,
      git: {
        ...updatedState.git,
        checkpoints: [
          {
            hash: "",
            // Would need to get from git
            message: trigger.reason,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          },
          ...updatedState.git.checkpoints
        ]
      }
    };
    return {
      created: true,
      message: `Checkpoint: ${trigger.reason}`,
      state: finalState
    };
  }
  return { created: false, message: "Checkpoint failed", state };
}

// src/pre-compact/state-preservation.ts
async function getActiveAgentsSummary(cwd, sessionId) {
  const AGENT_DESC_MAX_LENGTH = 80;
  try {
    const trackingPath = path5.join(cwd, ".goodvibes", "state", "agent-tracking.json");
    if (!await fileExists(trackingPath)) return "";
    const content = await fs6.readFile(trackingPath, "utf-8");
    const trackings = JSON.parse(content);
    let entries = Object.values(trackings);
    if (sessionId) {
      entries = entries.filter((entry) => entry.session_id === sessionId);
    }
    if (entries.length === 0) return "";
    const agentDescriptions = entries.map((entry) => {
      const desc = entry.task_description ? entry.task_description.substring(0, AGENT_DESC_MAX_LENGTH).replace(/\n/g, " ").trim() : entry.agent_type || "unknown";
      return `${entry.agent_id} - ${desc}`;
    });
    return `agents running during compact: ${agentDescriptions.join(", ")}`;
  } catch {
    return "";
  }
}
async function createPreCompactCheckpoint(cwd) {
  try {
    if (!await hasUncommittedChanges(cwd)) {
      debug("No uncommitted changes, skipping pre-compact checkpoint");
      return;
    }
    const state = await loadState(cwd);
    const agentsSummary = await getActiveAgentsSummary(cwd, state.session.id);
    const commitMessage = agentsSummary ? `pre-compact: saving work before context compaction
${agentsSummary}` : "pre-compact: saving work before context compaction";
    const result = await createCheckpointIfNeeded(
      state,
      cwd,
      commitMessage
    );
    if (result.created) {
      debug("Pre-compact checkpoint created", { message: result.message });
      await saveState(cwd, state);
    } else {
      debug("Pre-compact checkpoint skipped", { reason: result.message });
    }
  } catch (error) {
    logError("createPreCompactCheckpoint", error);
  }
}
async function saveSessionSummary(cwd, summary) {
  try {
    await ensureGoodVibesDir(cwd);
    const stateDir = path5.join(cwd, ".goodvibes", "state");
    if (!await fileExists(stateDir)) {
      await fs6.mkdir(stateDir, { recursive: true });
    }
    const summaryPath = path5.join(stateDir, "last-session-summary.md");
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const content = `# Session Summary

Generated: ${timestamp}

## Context Before Compaction

${summary}

---
*This summary was automatically saved before context compaction by GoodVibes.*
`;
    await fs6.writeFile(summaryPath, content, "utf-8");
    debug("Saved session summary", { path: summaryPath });
  } catch (error) {
    logError("saveSessionSummary", error);
  }
}
function getFilesModifiedThisSession(state) {
  const files = /* @__PURE__ */ new Set();
  if (state.files.modifiedThisSession) {
    for (const file of state.files.modifiedThisSession) {
      files.add(file);
    }
  }
  if (state.files.createdThisSession) {
    for (const file of state.files.createdThisSession) {
      files.add(file);
    }
  }
  return Array.from(files);
}

// src/pre-compact/index.ts
function generateSessionSummary(analytics, modifiedFiles, transcriptSummary) {
  const lines = [];
  if (analytics) {
    lines.push(`Session ID: ${analytics.session_id}`);
    lines.push(`Started: ${analytics.started_at}`);
    lines.push(`Tools used: ${analytics.tool_usage.length}`);
    lines.push(`Validations run: ${analytics.validations_run}`);
    lines.push(`Issues found: ${analytics.issues_found}`);
    if (analytics.skills_recommended.length > 0) {
      lines.push(
        `Skills recommended: ${analytics.skills_recommended.join(", ")}`
      );
    }
  }
  const MAX_FILES_IN_SUMMARY = 20;
  if (modifiedFiles.length > 0) {
    lines.push("");
    lines.push("## Files Modified This Session");
    for (const file of modifiedFiles.slice(0, MAX_FILES_IN_SUMMARY)) {
      lines.push(`- ${file}`);
    }
    if (modifiedFiles.length > MAX_FILES_IN_SUMMARY) {
      lines.push(
        `- ... and ${modifiedFiles.length - MAX_FILES_IN_SUMMARY} more files`
      );
    }
  }
  if (transcriptSummary) {
    lines.push("");
    lines.push("## Last Context");
    lines.push(transcriptSummary);
  }
  return lines.join("\n");
}
async function runPreCompactHook() {
  try {
    debug("PreCompact hook starting");
    const input = await readHookInput();
    debug("PreCompact received input", {
      hook_event_name: input.hook_event_name
    });
    try {
      const runtimeClient = new RuntimeClient(input.session_id);
      if (runtimeClient.isAvailable()) {
        debug("Phase 6: runtime engine available, sending session:compact event");
        await runtimeClient.sendHookEvent(
          "session:compact",
          input
        );
        const queryResult = await runtimeClient.query({ kind: "get_system_message" });
        if (queryResult?.kind === "system_message") {
          debug("Phase 6: runtime returned system message for compact, using it");
          respond(createResponse({ systemMessage: queryResult.message }));
          return;
        }
      }
    } catch {
      debug("Phase 6: runtime integration error, falling through to existing logic");
    }
    const cwd = input.cwd || process.cwd();
    await createPreCompactCheckpoint(cwd);
    const state = await loadState(cwd);
    const analytics = await loadAnalytics();
    const modifiedFiles = getFilesModifiedThisSession(state);
    let transcriptSummary = "";
    if (input.transcript_path && await fileExists(input.transcript_path)) {
      const transcriptData = await parseTranscript(input.transcript_path);
      transcriptSummary = transcriptData.summary;
    }
    const summary = generateSessionSummary(
      analytics,
      modifiedFiles,
      transcriptSummary
    );
    await saveSessionSummary(cwd, summary);
    if (analytics) {
      const compactBackup = path6.join(CACHE_DIR, "pre-compact-backup.json");
      await fs7.writeFile(
        compactBackup,
        JSON.stringify(
          {
            ...analytics,
            compact_at: (/* @__PURE__ */ new Date()).toISOString(),
            files_modified: modifiedFiles
          },
          null,
          2
        )
      );
      debug(`Saved pre-compact backup to ${compactBackup}`);
    }
    respond(createResponse());
  } catch (error) {
    logError("PreCompact main", error);
    respond(createResponse());
  }
}
if (!isTestEnvironment()) {
  runPreCompactHook().catch((error) => {
    logError("PreCompact uncaught", error);
    respond(createResponse());
  });
}
/* v8 ignore next 2 -- @preserve __dirname is always defined in Node.js CJS */
/* v8 ignore else -- @preserve defensive: all exported functions always provide timeout */
