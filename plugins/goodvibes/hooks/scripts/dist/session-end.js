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
import { readFileSync, writeFileSync, existsSync as existsSync2 } from "node:fs";
import * as fs3 from "fs/promises";
import { join as join3 } from "path";

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

// src/session-end/index.ts
var MS_PER_MINUTE = 6e4;
function cleanupDashboardPanes(sessionId) {
  try {
    const goodvibesDir = process.env.GOODVIBES_DIR || join3(process.env.CLAUDE_PROJECT_DIR || process.cwd(), ".goodvibes");
    const stateFile = join3(goodvibesDir, "active-panes.json");
    if (!existsSync2(stateFile)) return;
    let allState = {};
    try {
      allState = JSON.parse(readFileSync(stateFile, "utf-8"));
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
    debug("SessionEnd received input", {
      session_id: input.session_id
    });
    cleanupDashboardPanes(input.session_id);
    const analytics = await loadAnalytics();
    if (analytics) {
      analytics.ended_at = (/* @__PURE__ */ new Date()).toISOString();
      const started = new Date(analytics.started_at).getTime();
      const ended = new Date(analytics.ended_at).getTime();
      const durationMinutes = Math.round((ended - started) / MS_PER_MINUTE);
      await saveAnalytics(analytics);
      const summaryFile = join3(
        CACHE_DIR,
        `session-${analytics.session_id}.json`
      );
      await fs3.writeFile(
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
