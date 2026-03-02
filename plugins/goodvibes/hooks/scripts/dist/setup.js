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

// src/shared/hook-runner.ts
function createErrorResponse(hookName, error) {
  const message = error instanceof Error ? error.message : String(error);
  return createResponse({
    systemMessage: `${hookName} error: ${message}`
  });
}
async function runHook(hookName, handler, options = {}) {
  const { onError, catchUncaught = true } = options;
  const handleError = (context, error) => {
    logError(`${hookName} ${context}`, error);
    const response = onError ? onError(error) : createErrorResponse(hookName, error);
    respond(response);
  };
  const execute = async () => {
    try {
      debug(`${hookName} hook starting`);
      const input = await readHookInput();
      debug(`${hookName} received input`, {
        hook_event_name: input.hook_event_name,
        session_id: input.session_id,
        tool_name: input.tool_name
      });
      const response = await handler(input);
      respond(response);
    } catch (error) {
      handleError("main", error);
    }
  };
  if (catchUncaught) {
    execute().catch((error) => {
      handleError("uncaught", error);
    });
  } else {
    await execute();
  }
}

// src/shared/runtime-client.ts
import * as net from "node:net";
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join as join2 } from "node:path";
import { tmpdir } from "node:os";
var DEBUG = process.env["GOODVIBES_DEBUG"] === "1";

// src/session-start/claude-md-manager.ts
import * as fs from "fs";
import * as path2 from "path";
import * as os from "os";
var CLAUDE_MD_IMPORT = `<!-- GOODVIBES IMPORTS -->
@.goodvibes/GOODVIBES.md
`;
var GOODVIBES_MD = `<!-- UPGRADE NOTIFICATIONS -->
@prompt/UPGRADE-NOTIFICATIONS.md

<!-- PRIMARY GOALS -->
@prompt/PRIMARY-GOALS.md

<!-- CORE PRINCIPLES -->
@prompt/CORE-PRINCIPLES.md

<!-- SUBAGENT PROTOCOL -->
@prompt/SUBAGENT-PROTOCOL.md
`;
var FALLBACK_PROMPT_FILES = {
  "UPGRADE-NOTIFICATIONS.md": `## IMPORTANT!

### TOOL UPGRADES NOW AVAILABLE:

Precision_engine tools are a superset of native tools, with transaction support, batching, and token-efficient output. Prioritize their use over the deprecated native tools (Read, Edit, Write, Glob, Grep, Update, WebFetch). Always use precision_engine equivalents. WebSearch has no replacement \u2014 use it directly.

### DEPRECATION NOTICE:

Native tools (Read, Edit, Write, Glob, Grep, Update, WebFetch) have been deprecated as of 2026-01-01. Use precision_engine tools as a replacement.
`,
  "PRIMARY-GOALS.md": `## MANDATORY

PRIMARY GOAL: Fully complete and functional code that meets or exceeds the minimum review score (provided in <gv> tags)
SECONDARY DIRECTIVE: ALWAYS prioritize achieving the primary goal, but aim to minimize token usage in all actions
`,
  "CORE-PRINCIPLES.md": `## MANDATORY

1. Directives are IMMEDIATE: NEVER defer, reorder, or condition a directive on another event
2. Execute directives BEFORE any other action. NO intervening tool calls or agent spawns
3. Orchestrator autonomy ends when directives begin. ONLY initial task decomposition is self-directed
4. Runtime workflow logic ALWAYS supersedes orchestrator judgment
5. ALWAYS Execute <gv> directives from the runtime engine and maintain goodvibes logging, memory, and state functions
6. MINIMIZE unnecessary token usage: use precision_engine verbosity settings, only request/send data necessary
7. NEVER block main conversation: ALL subagents run in background, Task Output only by explicit user request
8. ALWAYS think before you act. Time is cheap, tokens are expensive. Always have a plan.
`,
  "SUBAGENT-PROTOCOL.md": `## MANDATORY

ALWAYS provide reminders to subagents:
1. Use .goodvibes/ memory and logging
2. MANDATORY: Follow GPA Loops. GATHER: discover + reads (batch where possible). PLAN: zero tool calls, plan in text. APPLY: writes/edits/verification (batch where possible). Inconvenient does not mean impossible.
  - Preferred: precision_engine tool calls with built-in batching (files array, edits array, commands array)
  - Acceptable: precision_engine tool call without batching (sometimes necessary, still allowed)
  - Unacceptable: native tools for Read, Write, Edit, Glob, Grep, WebFetch, NotebookEdit
  - Unacceptable: using precision_exec to run grep, find, rg, cat, ls, or any file search/read command
3. precision_exec is for build/test/deploy ONLY (npm run, npx, git). NEVER use it to search files or read content
4. NEVER use Bash cat, echo, heredoc workarounds unless precision tools have failed multiple attempts
5. CRITICAL: NEVER set sandbox=true. Only user can activate sandbox.

---

<!-- PRECISION MASTERY -->
@PRECISION-MASTERY.md

<!-- GATHER-PLAN-APPLY -->
@GATHER-PLAN-APPLY.md

<!-- SKILL AWARENESS -->
@SKILLS.md
`,
  "SKILLS.md": `## SKILL AWARENESS

Skills load automatically when relevant to your task.

### Protocol Skills (Always Active)
- precision-mastery: Token-efficient file operations, extract modes, verbosity, batching
- gather-plan-apply: GPA execution loop (gather, plan, apply, batch aggressively)
- review-scoring: 10-dimension scoring rubric for WRFC review loops
- goodvibes-memory: Cross-session memory (decisions, patterns, failures, preferences)
- error-recovery: Tiered error recovery and escalation procedures

### Orchestration Skills
- task-orchestration: Parallel agent decomposition and WRFC coordination
- fullstack-feature: End-to-end multi-layer feature development

### Outcome Skills
- ai-integration, api-design, authentication, component-architecture, database-layer
- deployment, payment-integration, service-integration, state-management, styling-system, testing-strategy

### Quality Skills
- accessibility-audit, code-review, debugging, performance-audit
- project-onboarding, refactoring, security-audit

### Fallback: Manual Skill Loading
If a skill doesn't load automatically, use ToolSearch to find get_skill_content from registry-engine.
`,
  "PRECISION-MASTERY.md": `## PRECISION MASTERY (Auto-loaded for all subagents)

The precision engine replaces native tools (Read, Edit, Write, Grep, Glob, Update, WebFetch) with token-efficient equivalents. Correct usage saves 75-95% of tokens.

Verbosity: write/edit=count_only, read=standard, grep(discovery)=files_only, grep(content)=matches, glob=paths_only, exec=minimal.

Extract modes: outline (structure, 60-80% savings), symbols (exports, 70-90%), lines (ranges, 80-95%), content (full file, 0%).

Common mistakes: Don't read outline then re-read content. Don't skip memory checks. Don't make sequential same-tool calls. Don't use verbose for writes. NEVER use precision_exec to run grep, find, rg, cat, ls.

Escalation: Check error -> native tool for THAT task only -> return to precision -> log to failures.json.
`,
  "GATHER-PLAN-APPLY.md": `## GATHER-PLAN-APPLY (Auto-loaded for all subagents)

GATHER -> PLAN -> APPLY -> loop if needed. Batch where possible (inconvenient does not mean impossible).

GATHER: Collect context. Batch reads/greps into arrays. Use cheapest extract mode (see Precision Mastery). Check .goodvibes/memory/ first. Skip only for 1-2 known files.
PLAN: Zero tool calls. List exact paths, changes, dependencies, batch opportunities. Scale depth to task.
APPLY: precision_write (count_only), precision_edit (minimal), precision_exec (minimal). Fix only failed ops.

Hard Rules:
- Always check .goodvibes/memory/ before starting
- Never use deprecated native tools when precision equivalents work
- Never use precision_exec for file search -- use discover, precision_grep, precision_glob
- Never use verbose/standard verbosity for writes/edits
- Never make sequential single-item calls when arrays are available -- batch them
- Never re-read content you just wrote

Overflow: truncated results go to .goodvibes/.overflow/ -- paginate with precision_read line ranges. Aim below 7500 tokens per request, NEVER exceed 10000.
`
};
async function loadPromptFiles() {
  const templatesDir = path2.join(PLUGIN_ROOT, "templates", "prompt");
  const promptFiles = {};
  try {
    const files = await fs.promises.readdir(templatesDir);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    await Promise.all(
      mdFiles.map(async (filename) => {
        try {
          const filePath = path2.join(templatesDir, filename);
          const content = await fs.promises.readFile(filePath, "utf-8");
          promptFiles[filename] = content;
        } catch (err) {
          debug(`Failed to read template file ${filename}, using fallback`);
          if (filename in FALLBACK_PROMPT_FILES) {
            promptFiles[filename] = FALLBACK_PROMPT_FILES[filename];
          }
        }
      })
    );
    if (Object.keys(promptFiles).length > 0) {
      debug(`Loaded ${Object.keys(promptFiles).length} prompt files from templates`);
      return promptFiles;
    }
  } catch (err) {
    debug(`Failed to read templates directory: ${templatesDir}`);
  }
  debug("Using fallback prompt files");
  return FALLBACK_PROMPT_FILES;
}
async function writeIfChanged(filePath, content) {
  try {
    const existing = await fs.promises.readFile(filePath, "utf-8");
    if (existing.trimEnd() === content.trimEnd()) {
      debug(`Skipping write (content unchanged): ${filePath}`);
      return;
    }
  } catch (err) {
    debug(`Template file not found or unreadable, using fallback: ${filePath}`);
  }
  const dirname2 = path2.dirname(filePath);
  await fs.promises.mkdir(dirname2, { recursive: true });
  await fs.promises.writeFile(filePath, content, "utf-8");
  debug(`Wrote file: ${filePath}`);
}
async function tryClaudeHomeDir(projectDir) {
  try {
    const claudeHome = path2.join(os.homedir(), ".claude");
    const resolvedProject = path2.resolve(projectDir);
    const claudeHomeSep = claudeHome + path2.sep;
    if (resolvedProject === claudeHome || resolvedProject.startsWith(claudeHomeSep)) {
      debug("Project is inside ~/.claude/, skipping home directory strategy");
      return null;
    }
    await fs.promises.access(claudeHome, fs.constants.W_OK);
    debug(`Using ~/.claude/ directory: ${claudeHome}`);
    return claudeHome;
  } catch {
    debug("~/.claude/ directory not found or not writable");
    return null;
  }
}
async function findHighestAncestorClaudeMd(projectDir) {
  try {
    const resolved = path2.resolve(projectDir);
    const parsed = path2.parse(resolved);
    const root = parsed.root;
    const segments = resolved.substring(root.length).split(path2.sep).filter((s) => s.length > 0);
    let highestMatch = null;
    for (let i = 0; i < segments.length; i++) {
      const checkPath = path2.join(root, ...segments.slice(0, i + 1));
      if (checkPath === resolved) {
        continue;
      }
      const claudeMdPath = path2.join(checkPath, "CLAUDE.md");
      try {
        await fs.promises.access(claudeMdPath, fs.constants.R_OK);
        highestMatch = checkPath;
        break;
      } catch {
      }
    }
    if (highestMatch) {
      debug(`Found highest ancestor CLAUDE.md at: ${highestMatch}`);
    }
    return highestMatch;
  } catch {
    debug("Failed to search ancestor directories for CLAUDE.md");
    return null;
  }
}
async function resolveTargetDirectory(projectDir) {
  const claudeHome = await tryClaudeHomeDir(projectDir);
  if (claudeHome) {
    return claudeHome;
  }
  const ancestorDir = await findHighestAncestorClaudeMd(projectDir);
  if (ancestorDir) {
    return ancestorDir;
  }
  debug(`Using project directory: ${projectDir}`);
  return projectDir;
}
async function ensureClaudeMdImport(targetDir) {
  const claudeMdPath = path2.join(targetDir, "CLAUDE.md");
  try {
    const existing = await fs.promises.readFile(claudeMdPath, "utf-8");
    if (existing.includes("<!-- GOODVIBES IMPORTS -->")) {
      debug(`CLAUDE.md already has import: ${claudeMdPath}`);
      return;
    }
    const separator = existing.endsWith("\n") ? "\n" : "\n\n";
    const updated = existing + separator + CLAUDE_MD_IMPORT;
    await writeIfChanged(claudeMdPath, updated);
  } catch {
    await writeIfChanged(claudeMdPath, CLAUDE_MD_IMPORT);
  }
}
async function ensureGoodvibesMd(targetDir) {
  const goodvibesMdPath = path2.join(targetDir, ".goodvibes", "GOODVIBES.md");
  await writeIfChanged(goodvibesMdPath, GOODVIBES_MD);
}
async function ensurePromptFiles(targetDir) {
  const promptFiles = await loadPromptFiles();
  await Promise.all(
    Object.entries(promptFiles).map(([filename, content]) => {
      const filePath = path2.join(targetDir, ".goodvibes", "prompt", filename);
      return writeIfChanged(filePath, content);
    })
  );
}
async function ensureClaudeMdImports(projectDir) {
  try {
    const targetDir = await resolveTargetDirectory(projectDir);
    await ensureClaudeMdImport(targetDir);
    await Promise.all([
      ensureGoodvibesMd(targetDir),
      ensurePromptFiles(targetDir)
    ]);
  } catch (err) {
    logError("Failed to ensure CLAUDE.md imports", err instanceof Error ? err : new Error(String(err)));
  }
}

// src/setup.ts
runHook("Setup", async (input) => {
  const projectDir = input.cwd || PROJECT_ROOT;
  debug(`Setup: ensuring CLAUDE.md imports in ${projectDir}`);
  await ensureClaudeMdImports(projectDir);
  return createResponse({
    systemMessage: "GoodVibes: Setup complete - CLAUDE.md chain files installed."
  });
});
/* v8 ignore next 2 -- @preserve __dirname is always defined in Node.js CJS */
