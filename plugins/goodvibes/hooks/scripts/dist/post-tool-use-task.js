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

// src/shared/hook-io.ts
import process2 from "process";
function isTestEnvironment() {
  return process2.env.NODE_ENV === "test" || process2.env.VITEST === "true" || typeof globalThis.__vitest_worker__ !== "undefined";
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

// src/shared/file-utils.ts
import { exec as execCallback } from "child_process";
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

// src/shared/config.ts
var STDIN_TIMEOUT_MS = parseInt(
  process.env.GOODVIBES_STDIN_TIMEOUT_MS ?? "1000",
  10
);

// src/shared/index.ts
init_gitignore();

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

// src/shared/directive-utils.ts
function buildGvDirectiveTag(message) {
  const gvPayload = JSON.stringify({
    action: "directive",
    message
  });
  return `<gv>${gvPayload}</gv>`;
}

// src/shared/runtime-client.ts
import * as net from "node:net";
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join as join2 } from "node:path";
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
  /** Absolute path to the Unix domain socket, or null if not discoverable. */
  socketPath;
  /** Resolved state directory (.goodvibes/state) used for stale-socket cleanup. */
  stateDir;
  /** Session ID stored for re-discovery in isAvailableAsync(). */
  _sessionId;
  /**
   * Active socket path — may be updated by isAvailableAsync() after
   * a self-heal rediscovery.
   */
  _socketPath;
  /**
   * @param sessionId - Optional Claude Code session ID for session-keyed
   *   socket pointer lookup. When provided, enables exact-match discovery
   *   via `runtime-{sessionId}.socket` pointer files.
   */
  constructor(sessionId) {
    const cwd = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
    this.stateDir = join2(cwd, ".goodvibes", "state");
    this._sessionId = sessionId;
    this.socketPath = this.discoverSocket(sessionId);
    this._socketPath = this.socketPath;
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
    return this.socketPath !== null && existsSync(this.socketPath);
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
          const pointerPath = join2(this.stateDir, entry);
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
    const socketPath = this.socketPath;
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
    const stateDirExists = existsSync(stateDir);
    if (sessionId && stateDirExists) {
      try {
        const sessionPointer = join2(stateDir, `runtime-${sessionId}.socket`);
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
              const mtimeMs = statSync(join2(stateDir, entry)).mtimeMs;
              pointerFiles.push({ entry, mtimeMs });
            } catch {
            }
          }
        }
        pointerFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
        for (const { entry } of pointerFiles) {
          const pointerPath = join2(stateDir, entry);
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
    const legacyPointerFile = join2(stateDir, "runtime.socket");
    if (existsSync(legacyPointerFile)) {
      try {
        const socketPath = readFileSync(legacyPointerFile, "utf-8").trim();
        if (socketPath && existsSync(socketPath)) return socketPath;
      } catch {
      }
    }
    const defaultPath = join2(tmpdir(), "goodvibes-runtime", "runtime.sock");
    if (existsSync(defaultPath)) {
      return defaultPath;
    }
    return null;
  }
};

// src/post-tool-use-task.ts
import { stdin } from "node:process";
async function runPostToolUseTaskHook() {
  try {
    stdin.resume();
    const runtimeClient = new RuntimeClient();
    if (!runtimeClient.isAvailable()) {
      respond(createResponse());
      return;
    }
    const result = await runtimeClient.query({ kind: "get_directives" });
    if (result?.kind === "system_message" && result.message) {
      const gvDirective = buildGvDirectiveTag(result.message);
      respond(createResponse({ additionalContext: { gv_directive: gvDirective } }));
      return;
    }
    respond(createResponse());
  } catch {
    respond(createResponse());
  }
}
if (!isTestEnvironment()) {
  runPostToolUseTaskHook().catch(() => {
    respond(createResponse());
  });
}
export {
  runPostToolUseTaskHook
};
/* v8 ignore next 2 -- @preserve __dirname is always defined in Node.js CJS */
