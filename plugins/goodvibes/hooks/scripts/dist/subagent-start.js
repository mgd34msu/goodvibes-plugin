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

// src/subagent-start/index.ts
import * as path9 from "path";

// src/shared/hook-io.ts
import { stdin } from "process";
function isTestEnvironment() {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true" || typeof globalThis.__vitest_worker__ !== "undefined";
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
  for await (const chunk of stdin) {
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
  process.exit(0);
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

// src/shared/config.ts
import * as fs3 from "fs/promises";
import * as path4 from "path";

// src/shared/file-utils.ts
import { exec as execCallback } from "child_process";
import * as fs2 from "fs/promises";
import * as path3 from "path";
import { promisify } from "util";

// src/shared/constants.ts
import * as path from "path";
function resolvePluginRootFromDirname(dirname3) {
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return process.env.CLAUDE_PLUGIN_ROOT;
  }
  if (dirname3 !== void 0 && dirname3.includes("hooks")) {
    const hooksIndex = dirname3.indexOf("hooks");
    if (hooksIndex > 0) {
      return dirname3.substring(0, hooksIndex - 1);
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
var QUALITY_GATES = [
  {
    name: "TypeScript",
    check: "npx tsc --noEmit",
    autoFix: null,
    blocking: true
  },
  {
    name: "ESLint",
    check: "npx eslint . --max-warnings=0",
    autoFix: "npx eslint . --fix",
    blocking: true
  },
  {
    name: "Prettier",
    check: "npx prettier --check .",
    autoFix: "npx prettier --write .",
    blocking: false
  },
  { name: "Tests", check: "npm test", autoFix: null, blocking: true }
];
function getDefaultSharedConfig() {
  return {
    telemetry: {
      enabled: true,
      anonymize: true
    },
    quality: {
      gates: QUALITY_GATES,
      autoFix: true
    },
    memory: {
      enabled: true,
      maxEntries: 100
    },
    checkpoints: {
      enabled: true,
      triggers: CHECKPOINT_TRIGGERS
    }
  };
}
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(
        result[key],
        source[key]
      );
    } else if (source[key] !== void 0) {
      result[key] = source[key];
    }
  }
  return result;
}
async function loadSharedConfig(cwd) {
  const configPath = path4.join(cwd, ".goodvibes", "settings.json");
  const defaults = getDefaultSharedConfig();
  if (!await fileExists(configPath)) {
    return defaults;
  }
  try {
    const content = await fs3.readFile(configPath, "utf-8");
    const userConfig = JSON.parse(content);
    if (typeof userConfig === "object" && userConfig !== null) {
      const configObj = userConfig;
      const config = "goodvibes" in configObj && typeof configObj.goodvibes === "object" && configObj.goodvibes !== null ? configObj.goodvibes : configObj;
      return deepMerge(defaults, config);
    }
    return defaults;
  } catch (error) {
    debug("loadSharedConfig failed", { error: String(error) });
    return defaults;
  }
}

// src/shared/index.ts
init_gitignore();

// src/shared/analytics.ts
import * as fs4 from "fs/promises";
async function ensureCacheDir() {
  if (!await fileExists(CACHE_DIR)) {
    await fs4.mkdir(CACHE_DIR, { recursive: true });
  }
}
async function loadAnalytics() {
  await ensureCacheDir();
  if (await fileExists(ANALYTICS_FILE)) {
    try {
      const content = await fs4.readFile(ANALYTICS_FILE, "utf-8");
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
  await fs4.writeFile(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
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
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join as join5 } from "node:path";
import { tmpdir } from "node:os";
var HOOK_EVENT_TIMEOUT_MS = 500;
var QUERY_TIMEOUT_MS = 500;
function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
var RuntimeClient = class {
  /** Absolute path to the Unix domain socket, or null if not discoverable. */
  socketPath;
  constructor() {
    this.socketPath = this.discoverSocket();
  }
  // ─── Public API ─────────────────────────────────────────────────────────────
  /**
   * Returns true if the runtime engine socket path was discovered and the
   * socket file currently exists on disk.
   *
   * This is a fast synchronous check — it does NOT attempt a connection.
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
      socket.once("error", () => {
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
   * Discover the runtime engine socket path using three strategies.
   *
   * Resolution order:
   * 1. `GOODVIBES_RUNTIME_SOCKET` env var — set by runtime engine at startup.
   * 2. `.goodvibes/state/runtime.socket` pointer file in cwd — contains path.
   * 3. Well-known tmpdir path: `{os.tmpdir()}/goodvibes-runtime/runtime.sock`.
   *
   * @returns Absolute socket path string, or null if none is discoverable.
   */
  discoverSocket() {
    const envPath = process.env["GOODVIBES_RUNTIME_SOCKET"];
    if (envPath) {
      return envPath;
    }
    const cwd = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
    const stateDir = join5(cwd, ".goodvibes", "state");
    if (existsSync(stateDir)) {
      try {
        const entries = readdirSync(stateDir);
        for (const entry of entries) {
          if (/^runtime-\d+\.socket$/.test(entry)) {
            try {
              const socketPath = readFileSync(join5(stateDir, entry), "utf-8").trim();
              if (socketPath && existsSync(socketPath)) return socketPath;
            } catch {
            }
          }
        }
      } catch {
      }
    }
    const legacyPointerFile = join5(stateDir, "runtime.socket");
    if (existsSync(legacyPointerFile)) {
      try {
        const socketPath = readFileSync(legacyPointerFile, "utf-8").trim();
        if (socketPath) return socketPath;
      } catch {
      }
    }
    const defaultPath = join5(tmpdir(), "goodvibes-runtime", "runtime.sock");
    if (existsSync(defaultPath)) {
      return defaultPath;
    }
    return null;
  }
};

// src/state/persistence.ts
import * as fs5 from "fs/promises";
import * as path5 from "path";

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
  const goodvibesDir = path5.join(cwd, ".goodvibes");
  const statePath = path5.join(goodvibesDir, STATE_FILE);
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
  const statePath = path5.join(cwd, ".goodvibes", STATE_FILE);
  const stateDir = path5.dirname(statePath);
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

// src/subagent-stop/telemetry.ts
import * as fs6 from "fs/promises";
import * as path6 from "path";
function isTrackingsRecord(value) {
  return typeof value === "object" && value !== null;
}
var TRACKING_FILE = "state/agent-tracking.json";
async function saveAgentTracking(cwd, tracking) {
  await ensureGoodVibesDir(cwd);
  const trackingPath = path6.join(cwd, ".goodvibes", TRACKING_FILE);
  let trackings = {};
  if (await fileExists(trackingPath)) {
    try {
      const parsed = JSON.parse(await fs6.readFile(trackingPath, "utf-8"));
      if (isTrackingsRecord(parsed)) {
        trackings = parsed;
      }
    } catch (error) {
      debug("telemetry operation failed", { error: String(error) });
    }
  }
  trackings[tracking.agent_id] = tracking;
  await fs6.writeFile(trackingPath, JSON.stringify(trackings, null, 2));
}

// src/telemetry/agents.ts
import { exec as execCallback2 } from "child_process";
import * as fs7 from "fs/promises";
import * as path7 from "path";
import { promisify as promisify2 } from "util";
var exec2 = promisify2(execCallback2);
var STALE_AGENT_MAX_AGE_MS = 24 * 60 * 60 * 1e3;
function isActiveAgentsState(value) {
  return typeof value === "object" && value !== null && "agents" in value && "last_updated" in value && typeof value.agents === "object" && typeof value.last_updated === "string";
}
function getActiveAgentsFilePath(goodVibesDir, stateDir) {
  return path7.join(goodVibesDir, stateDir, "active-agents.json");
}
async function getGitInfo(cwd) {
  const result = {};
  try {
    const { stdout: branch } = await exec2("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf-8",
      timeout: 3e4,
      maxBuffer: 1024 * 1024
    });
    result.branch = branch.trim();
  } catch (error) {
    debug(
      "Git branch unavailable:",
      error instanceof Error ? error.message : "unknown"
    );
  }
  try {
    const { stdout: commit } = await exec2("git rev-parse --short HEAD", {
      cwd,
      encoding: "utf-8",
      timeout: 3e4,
      maxBuffer: 1024 * 1024
    });
    result.commit = commit.trim();
  } catch (error) {
    debug(
      "Git commit unavailable:",
      error instanceof Error ? error.message : "unknown"
    );
  }
  return result;
}
function deriveProjectName(cwd) {
  const dirName = path7.basename(cwd);
  if (dirName.match(/^[a-f0-9]{8,}$/i) || dirName === "tmp" || dirName === "temp") {
    const parentDir = path7.basename(path7.dirname(cwd));
    if (parentDir && parentDir !== "." && parentDir !== "/") {
      return parentDir;
    }
  }
  return dirName || "unknown-project";
}
async function loadActiveAgents(activeAgentsFile) {
  if (await fileExists(activeAgentsFile)) {
    try {
      const content = await fs7.readFile(activeAgentsFile, "utf-8");
      const parsed = JSON.parse(content);
      if (isActiveAgentsState(parsed)) {
        return parsed;
      }
    } catch (error) {
      logError("loadActiveAgents", error);
    }
  }
  return {
    agents: {},
    last_updated: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function saveActiveAgents(activeAgentsFile, state) {
  try {
    state.last_updated = (/* @__PURE__ */ new Date()).toISOString();
    await fs7.writeFile(activeAgentsFile, JSON.stringify(state, null, 2));
  } catch (error) {
    logError("saveActiveAgents", error);
  }
}
async function cleanupStaleAgents(activeAgentsFile) {
  const state = await loadActiveAgents(activeAgentsFile);
  const now = Date.now();
  let removed = 0;
  for (const [agentId, entry] of Object.entries(state.agents)) {
    const startedAt = new Date(entry.started_at).getTime();
    if (now - startedAt > STALE_AGENT_MAX_AGE_MS) {
      delete state.agents[agentId];
      removed++;
    }
  }
  if (removed > 0) {
    await saveActiveAgents(activeAgentsFile, state);
    debug("Cleaned up " + removed + " stale agent entries");
  }
  return removed;
}

// src/subagent-start/context-injection.ts
import * as path8 from "path";

// src/types/config.ts
function getDefaultConfig() {
  return {
    automation: {
      enabled: true,
      mode: "default",
      testing: {
        runAfterFileChange: true,
        runBeforeCommit: true,
        runBeforeMerge: true,
        testCommand: "npm test",
        maxRetries: 3
      },
      building: {
        runAfterFileThreshold: 5,
        runBeforeCommit: true,
        runBeforeMerge: true,
        buildCommand: "npm run build",
        typecheckCommand: "npx tsc --noEmit",
        maxRetries: 3
      },
      git: {
        autoFeatureBranch: true,
        autoCheckpoint: true,
        autoMerge: true,
        checkpointThreshold: 5,
        mainBranch: "main"
      },
      recovery: {
        maxRetriesPerError: 3,
        logFailures: true,
        skipAfterMaxRetries: true
      }
    }
  };
}

// src/subagent-start/context-injection.ts
var PROTOCOL_SKILLS = [
  "precision-mastery",
  "review-scoring",
  "gather-plan-apply",
  "goodvibes-memory",
  "error-recovery"
];
var AGENT_SKILL_MAP = {
  "engineer": ["authentication", "database-layer", "api-design", "component-architecture", "styling-system", "state-management", "payment-integration", "ai-integration", "service-integration", "refactoring", "debugging"],
  "reviewer": ["code-review", "security-audit", "performance-audit", "accessibility-audit"],
  "tester": ["testing-strategy"],
  "architect": ["project-onboarding"],
  // Loads outcome skills as needed per task; project-onboarding is the primary quality skill
  "deployer": ["deployment"],
  "integrator": ["ai-integration", "payment-integration", "service-integration", "state-management", "authentication"],
  // Generic integrator
  "integrator-ai": ["ai-integration"],
  "integrator-services": ["payment-integration", "service-integration", "authentication"],
  "integrator-state": ["state-management"],
  "planner": ["task-orchestration", "fullstack-feature"],
  "agent-factory": [],
  // Meta-agent, loads skills as needed
  "skill-factory": []
  // Meta-agent, loads skills as needed
};
var SKILL_CATALOG = {
  // Protocol
  "precision-mastery": { description: "Token-efficient file operations, extract modes, verbosity, batching", path: "protocol/precision-mastery", scripts: ["validate-precision-usage.sh"] },
  "review-scoring": { description: "10-dimension scoring rubric for WRFC review loops", path: "protocol/review-scoring", scripts: ["validate-review.sh", "validate-fix.sh"] },
  "gather-plan-apply": { description: "Strict 3-call GPA execution loop", path: "protocol/gather-plan-apply", scripts: ["validate-gpa-compliance.sh"] },
  "goodvibes-memory": { description: "Cross-session memory (decisions, patterns, failures, preferences)", path: "protocol/goodvibes-memory", scripts: ["validate-memory-usage.sh"] },
  "error-recovery": { description: "Tiered error recovery and escalation procedures", path: "protocol/error-recovery", scripts: ["validate-error-recovery.sh"] },
  // Orchestration
  "fullstack-feature": { description: "End-to-end multi-layer feature development", path: "orchestration/fullstack-feature", scripts: ["validate-feature-workflow.sh"] },
  "task-orchestration": { description: "Parallel agent decomposition and WRFC coordination", path: "orchestration/task-orchestration", scripts: ["validate-orchestration.sh"] },
  // Outcome
  "ai-integration": { description: "AI/LLM chat, streaming, RAG, embeddings", path: "outcome/ai-integration", scripts: ["validate-ai-integration.sh"] },
  "api-design": { description: "REST/GraphQL/tRPC endpoint design and validation", path: "outcome/api-design", scripts: ["api-checklist.sh"] },
  "authentication": { description: "Login, OAuth, JWT, sessions, RBAC", path: "outcome/authentication", scripts: ["auth-checklist.sh"] },
  "component-architecture": { description: "UI component composition, rendering, accessibility", path: "outcome/component-architecture", scripts: ["validate-components.sh"] },
  "database-layer": { description: "Schema design, ORM setup, migrations, query optimization", path: "outcome/database-layer", scripts: ["database-checklist.sh"] },
  "deployment": { description: "CI/CD, Docker, Vercel/Railway/Fly.io/AWS", path: "outcome/deployment", scripts: ["validate-deployment.sh"] },
  "payment-integration": { description: "Stripe/LemonSqueezy/Paddle checkout and subscriptions", path: "outcome/payment-integration", scripts: ["validate-payments.sh"] },
  "service-integration": { description: "Email, CMS, file uploads, analytics", path: "outcome/service-integration", scripts: ["validate-services.sh"] },
  "state-management": { description: "Server/client/form/URL state patterns", path: "outcome/state-management", scripts: ["validate-state.sh"] },
  "styling-system": { description: "Tailwind, design tokens, dark mode, responsive", path: "outcome/styling-system", scripts: ["validate-styling.sh"] },
  "testing-strategy": { description: "Vitest/Jest, Testing Library, Playwright, MSW", path: "outcome/testing-strategy", scripts: ["validate-tests.sh"] },
  // Quality
  "accessibility-audit": { description: "WCAG 2.1 AA compliance audit", path: "quality/accessibility-audit", scripts: ["validate-accessibility-audit.sh"] },
  "code-review": { description: "10-dimension weighted code review", path: "quality/code-review", scripts: ["validate-code-review.sh"] },
  "debugging": { description: "Error analysis, runtime debugging, root cause analysis", path: "quality/debugging", scripts: ["validate-debugging.sh"] },
  "performance-audit": { description: "Bundle, database, rendering, Core Web Vitals", path: "quality/performance-audit", scripts: ["validate-performance-audit.sh"] },
  "project-onboarding": { description: "Codebase analysis and architecture mapping", path: "quality/project-onboarding", scripts: ["validate-onboarding.sh"] },
  "refactoring": { description: "Safe structural improvements with validation", path: "quality/refactoring", scripts: ["validate-refactoring.sh"] },
  "security-audit": { description: "Auth, input validation, dependencies, infrastructure", path: "quality/security-audit", scripts: ["validate-security-audit.sh"] }
};
async function buildSubagentContext(cwd, agentType, _sessionId) {
  const _sharedConfig = await loadSharedConfig(cwd);
  const automationConfig = getDefaultConfig();
  const projectName = path8.basename(cwd);
  const contextParts = [];
  contextParts.push(`[GoodVibes] Project: ${projectName}`);
  contextParts.push(`Mode: ${automationConfig.automation.mode}`);
  contextParts.push(
    "MANDATORY: Always prefer GoodVibes skills and MCP tools over raw bash/shell commands.\nCRITICAL: Only use commands outside of MCP tools or skills when there is absolutely no other way to accomplish a specific part of the task. Even if the entire task cannot be completed with skills/MCP tools, use them for every part where they apply.\n\n"
  );
  contextParts.push(
    "MANDATORY: If multiple tool uses are planned, use GPA loops as defined in the System Prompt.\n\n"
  );
  if (agentType.includes("engineer")) {
    contextParts.push(
      "Remember: Write-local only. All changes must be in the project root or directories within the project root.\n\n"
    );
  }
  if (agentType.includes("test")) {
    contextParts.push(
      "Remember: Tests must actually verify behavior, not just exist.\n\n"
    );
  }
  if (agentType.includes("reviewer")) {
    contextParts.push(
      "Remember: Be completely honest, regardless of how harsh the truth would be. Never sugar coat or take feelings into account.\n\n"
    );
  }
  const agentSuffix = agentType.split(":").pop() ?? agentType;
  const outcomeSkills = AGENT_SKILL_MAP[agentSuffix] ?? [];
  const formatSkillList = (skillNames) => {
    return skillNames.map((name) => {
      const info = SKILL_CATALOG[name];
      return info ? `  - ${name}: ${info.description}` : `  - ${name}`;
    }).join("\n");
  };
  const protocolSection = [
    "Protocol skills (Always Active):",
    formatSkillList(PROTOCOL_SKILLS)
  ].join("\n");
  const roleSkillsSection = outcomeSkills.length > 0 ? ["Skills for your role:", formatSkillList(outcomeSkills)].join("\n") : "Skills for your role: none \u2014 load as needed";
  const loadInstruction = [
    "Your assigned skills load automatically based on task relevance. Protocol skills (precision-mastery, gather-plan-apply, review-scoring, goodvibes-memory, error-recovery) are always active.",
    "Skills contain workflows, checklists, and validation scripts that define quality standards.",
    "Fallback: If a skill does not load automatically, use ToolSearch to find get_skill_content from registry-engine."
  ].join("\n");
  const validationInstruction = [
    "AFTER completing work, validate with the relevant skill script:",
    '  precision_exec cmd: "bash plugins/goodvibes/skills/{tier}/{skill}/scripts/{script-name}"',
    "  Example: bash plugins/goodvibes/skills/outcome/api-design/scripts/api-checklist.sh",
    "Scripts verify work programmatically. Run BEFORE submitting for review."
  ].join("\n");
  contextParts.push(
    [protocolSection, roleSkillsSection, loadInstruction, validationInstruction].join("\n\n") + "\n\n"
  );
  return {
    additionalContext: contextParts.join("\n")
  };
}

// src/subagent-start/wrfc-utils.ts
var WRFC_REGEX = /\[WRFC:([^\]]+)\]/;
function extractWorkflowId(taskDescription) {
  const match = WRFC_REGEX.exec(taskDescription);
  return match ? match[1] : null;
}
function normalizeAgentFields(input) {
  return {
    agent_id: input.agent_id ?? input.subagent_id,
    agent_type: input.agent_type ?? input.subagent_type
  };
}
function mergeSystemMessages(runtimeMessage, hookMessage) {
  return runtimeMessage ? hookMessage ? runtimeMessage + "\n\n" + hookMessage : runtimeMessage : hookMessage;
}

// src/subagent-start/index.ts
function createResponse2(options) {
  const response = {
    continue: true
  };
  if (options?.systemMessage) {
    response.systemMessage = options.systemMessage;
  }
  if (options?.additionalContext) {
    response.additionalContext = options.additionalContext;
  }
  return response;
}
var GOODVIBES_AGENTS = /* @__PURE__ */ new Set([
  "goodvibes:agent-factory",
  "goodvibes:skill-factory",
  "goodvibes:engineer",
  "goodvibes:reviewer",
  "goodvibes:tester",
  "goodvibes:architect",
  "goodvibes:deployer",
  "goodvibes:integrator"
]);
function extractStartInputFields(input) {
  return {
    agentId: input.agent_id ?? input.subagent_id ?? "agent_" + Date.now(),
    agentType: input.agent_type ?? input.subagent_type ?? "unknown",
    taskDescription: input.task_description ?? input.task ?? "",
    cwd: input.cwd ?? process.cwd(),
    sessionId: input.session_id ?? ""
  };
}
function createTrackingEntry(agentId, agentType, sessionId, cwd, projectName, gitInfo, taskDescription) {
  return {
    agent_id: agentId,
    agent_type: agentType,
    session_id: sessionId,
    project: cwd,
    project_name: projectName,
    git_branch: gitInfo.branch,
    git_commit: gitInfo.commit,
    started_at: (/* @__PURE__ */ new Date()).toISOString(),
    task_description: taskDescription || void 0
  };
}
async function trackInAnalytics(agentType, taskDescription, startedAt) {
  const analytics = await loadAnalytics();
  if (!analytics) {
    return null;
  }
  const TASK_MAX_LENGTH = 200;
  analytics.subagents_spawned ??= [];
  analytics.subagents_spawned.push({
    type: agentType,
    task: taskDescription?.substring(0, TASK_MAX_LENGTH),
    started_at: startedAt
  });
  await saveAnalytics(analytics);
  return analytics;
}
function buildReminders(projectName, gitBranch, stackInfo) {
  const reminders = [];
  if (stackInfo) {
    reminders.push("Detected stack: " + JSON.stringify(stackInfo));
  }
  if (gitBranch) {
    reminders.push("Git branch: " + gitBranch);
  }
  reminders.push("Project: " + projectName);
  return reminders;
}
function buildAdditionalContext(subagentContext, reminders) {
  if (subagentContext.additionalContext) {
    return subagentContext.additionalContext + "\n\n" + reminders.join("\n");
  }
  return "[GoodVibes Project Context]\n" + reminders.join("\n");
}
function buildSystemMessage(agentType, projectName, gitBranch) {
  if (!GOODVIBES_AGENTS.has(agentType)) {
    debug("Non-GoodVibes agent started: " + agentType);
    return void 0;
  }
  return "[GoodVibes] Agent " + agentType + " starting. Project: " + projectName + (gitBranch ? ", Branch: " + gitBranch : "");
}
async function runSubagentStartHook() {
  try {
    debug("SubagentStart hook starting");
    const rawInput = await readHookInput();
    debug("Raw input shape:", Object.keys(rawInput || {}));
    const input = rawInput;
    let runtimeSystemMessage;
    try {
      const runtimeClient = new RuntimeClient();
      if (runtimeClient.isAvailable()) {
        debug("Phase 6: runtime engine available, sending agent:spawned event");
        const taskDesc = input.task_description ?? input.task ?? "";
        const workflowId = extractWorkflowId(taskDesc);
        const { agent_id, agent_type } = normalizeAgentFields(input);
        const spawnedData = {
          ...rawInput,
          agent_id,
          agent_type
        };
        if (workflowId) {
          spawnedData["workflow_id"] = workflowId;
          debug("Phase 6: extracted workflow_id from task description", { workflow_id: workflowId });
        }
        await runtimeClient.sendHookEvent("agent:spawned", spawnedData);
        const queryResult = await runtimeClient.query({ kind: "get_system_message" });
        if (queryResult?.kind === "system_message") {
          debug("Phase 6: runtime returned system message for subagent, storing for merge");
          runtimeSystemMessage = queryResult.message;
        }
      }
    } catch {
      debug("Phase 6: runtime integration error, falling through to existing logic");
    }
    const { agentId, agentType, taskDescription, cwd, sessionId } = extractStartInputFields(input);
    const TASK_PREVIEW_LENGTH = 100;
    debug("SubagentStart received input", {
      agent_id: agentId,
      agent_type: agentType,
      session_id: sessionId,
      task_preview: taskDescription?.substring(0, TASK_PREVIEW_LENGTH),
      cwd
    });
    const goodvibesDir = path9.join(cwd, ".goodvibes");
    const stateDir = path9.join(goodvibesDir, "state");
    const activeAgentsFile = getActiveAgentsFilePath(goodvibesDir, stateDir);
    await cleanupStaleAgents(activeAgentsFile);
    const gitInfo = await getGitInfo(cwd);
    debug("Git info", gitInfo);
    const projectName = deriveProjectName(cwd);
    debug("Project name", projectName);
    const tracking = createTrackingEntry(agentId, agentType, sessionId, cwd, projectName, gitInfo, taskDescription);
    await saveAgentTracking(cwd, tracking);
    debug("Saved agent tracking", { agent_id: agentId });
    const analytics = await trackInAnalytics(agentType, taskDescription, tracking.started_at);
    const state = await loadState(cwd);
    if (!state.session.id && sessionId) {
      state.session.id = sessionId;
      state.session.startedAt = (/* @__PURE__ */ new Date()).toISOString();
      await saveState(cwd, state);
    }
    const subagentContext = await buildSubagentContext(cwd, agentType, sessionId);
    const reminders = buildReminders(projectName, gitInfo.branch, analytics?.detected_stack);
    const additionalContext = buildAdditionalContext(subagentContext, reminders);
    const systemMessage = buildSystemMessage(agentType, projectName, gitInfo.branch);
    const mergedSystemMessage = mergeSystemMessages(runtimeSystemMessage, systemMessage);
    respond(createResponse2({ systemMessage: mergedSystemMessage, additionalContext }));
  } catch (error) {
    logError("SubagentStart main", error);
    respond(createResponse2());
  }
}
if (!isTestEnvironment()) {
  runSubagentStartHook().catch((error) => {
    logError("SubagentStart uncaught", error);
    respond(createResponse2());
  });
}
/* v8 ignore next 2 -- @preserve __dirname is always defined in Node.js CJS */
