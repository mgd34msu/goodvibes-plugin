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
import { stdin } from "process";
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
function allowTool(hookEventName, systemMessage, updatedInput) {
  return {
    continue: true,
    systemMessage,
    hookSpecificOutput: {
      hookEventName,
      permissionDecision: "allow",
      updatedInput
    }
  };
}
function blockTool(reason) {
  console.error(reason);
  process.exit(2);
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

// src/shared/file-utils.ts
import { exec as execCallback } from "child_process";
import * as fs from "fs/promises";
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

// src/automation/git-operations.ts
import { exec as exec2 } from "child_process";
import { promisify as promisify2 } from "util";
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
async function getCurrentBranch(cwd) {
  return execGit("git branch --show-current", cwd);
}

// src/pre-tool-use/git-guards.ts
async function checkBranchGuard(command, cwd, state) {
  const currentBranch = await getCurrentBranch(cwd);
  const mainBranch = state.git.mainBranch;
  if (/git\s+push\s+.*--force/.test(command) || /git\s+push\s+-f/.test(command)) {
    if (currentBranch === mainBranch) {
      return {
        allowed: false,
        reason: `Force push to ${mainBranch} is not allowed`
      };
    }
    return {
      allowed: true,
      warning: "Force push detected - ensure this is intentional"
    };
  }
  if (/git\s+reset\s+--hard/.test(command) && currentBranch === mainBranch) {
    return {
      allowed: false,
      reason: `Hard reset on ${mainBranch} is not allowed`
    };
  }
  if (/git\s+rebase/.test(command) && currentBranch === mainBranch) {
    return {
      allowed: true,
      warning: `Rebasing ${mainBranch} - ensure this is intentional`
    };
  }
  return { allowed: true };
}
function checkMergeReadiness(_cwd, state) {
  if (state.tests.failingFiles.length > 0) {
    return {
      allowed: false,
      reason: `Cannot merge: ${state.tests.failingFiles.length} test files failing`
    };
  }
  if (state.build.status === "failing") {
    return {
      allowed: false,
      reason: "Cannot merge: build is failing"
    };
  }
  if (state.tests.pendingFixes.length > 0) {
    return {
      allowed: false,
      reason: `Cannot merge: ${state.tests.pendingFixes.length} pending test fixes`
    };
  }
  return { allowed: true };
}
function isGitCommand(command) {
  return /^\s*git\s+/.test(command);
}
function isMergeCommand(command) {
  return /git\s+merge/.test(command);
}

// src/state/persistence.ts
import * as fs2 from "fs/promises";
import * as path2 from "path";

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
  const goodvibesDir = path2.join(cwd, ".goodvibes");
  const statePath = path2.join(goodvibesDir, STATE_FILE);
  if (!await fileExists(statePath)) {
    return createDefaultState();
  }
  try {
    const content = await fs2.readFile(statePath, "utf-8");
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

// src/pre-tool-use/quality-gates.ts
import { exec as exec3 } from "child_process";
import * as fs3 from "fs/promises";
import * as path3 from "path";
import { promisify as promisify3 } from "util";
var execAsync2 = promisify3(exec3);
var QUALITY_GATES2 = [
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
  {
    name: "Tests",
    check: "npm test",
    autoFix: null,
    blocking: true
  }
];
async function toolExists(tool, cwd) {
  if (tool.startsWith("npx ")) {
    return fileExists(path3.join(cwd, "node_modules"));
  }
  if (tool.startsWith("npm ")) {
    const packageJson = path3.join(cwd, "package.json");
    if (!await fileExists(packageJson)) {
      return false;
    }
    const content = await fs3.readFile(packageJson, "utf-8");
    const pkg = JSON.parse(content);
    const scriptName = tool.replace("npm ", "").replace("run ", "");
    if (typeof pkg === "object" && pkg !== null && "scripts" in pkg) {
      const scripts = pkg.scripts;
      return !!scripts?.[scriptName];
    }
    return false;
  }
  return true;
}
async function runCheck(command, cwd) {
  try {
    await execAsync2(command, { cwd, timeout: 12e4 });
    return true;
  } catch (error) {
    debug(`Quality gate check failed: ${command} - ${error}`);
    return false;
  }
}
async function runQualityGates(cwd, gates = QUALITY_GATES2) {
  const results = [];
  let allPassed = true;
  let hasBlockingFailure = false;
  for (const gate of gates) {
    const checkTool = gate.check.split(" ")[0] + " " + gate.check.split(" ")[1];
    if (!await toolExists(checkTool, cwd)) {
      results.push({
        gate: gate.name,
        status: "skipped",
        message: "Tool not available"
      });
      continue;
    }
    const passed = await runCheck(gate.check, cwd);
    if (passed) {
      results.push({ gate: gate.name, status: "passed" });
    } else if (gate.autoFix) {
      try {
        await execAsync2(gate.autoFix, { cwd, timeout: 12e4 });
        const fixedPassed = await runCheck(gate.check, cwd);
        if (fixedPassed) {
          results.push({ gate: gate.name, status: "auto-fixed" });
        } else {
          results.push({
            gate: gate.name,
            status: "failed",
            message: "Auto-fix did not resolve issues"
          });
          allPassed = false;
          if (gate.blocking) {
            hasBlockingFailure = true;
          }
        }
      } catch (error) {
        logError(`Auto-fix for ${gate.name}`, error);
        results.push({
          gate: gate.name,
          status: "failed",
          message: "Auto-fix failed"
        });
        allPassed = false;
        if (gate.blocking) {
          hasBlockingFailure = true;
        }
      }
    } else {
      results.push({ gate: gate.name, status: "failed" });
      allPassed = false;
      if (gate.blocking) {
        hasBlockingFailure = true;
      }
    }
  }
  return { allPassed, blocking: hasBlockingFailure, results };
}
function isCommitCommand(command) {
  return /git\s+commit/.test(command);
}
function formatGateResults(results) {
  return results.map((result) => `${result.gate}: ${result.status}${result.message ? ` (${result.message})` : ""}`).join(", ");
}

// src/pre-tool-use/git-handlers.ts
function extractBashCommand(input) {
  if (input.tool_name !== "Bash" && !input.tool_name?.endsWith("__Bash")) {
    return null;
  }
  const toolInput = input.tool_input;
  return toolInput?.command ?? null;
}
async function handleGitCommit(input, command) {
  const cwd = input.cwd || process.cwd();
  const config = getDefaultConfig();
  debug("Git commit detected, running quality gates", { command });
  if (!config.automation.building.runBeforeCommit && !config.automation.testing.runBeforeCommit) {
    debug("Quality gates disabled for commits");
    respond(allowTool("PreToolUse"));
    return;
  }
  const gateResult = await runQualityGates(cwd);
  const resultSummary = formatGateResults(gateResult.results);
  debug("Quality gate results", {
    allPassed: gateResult.allPassed,
    blocking: gateResult.blocking,
    results: gateResult.results
  });
  if (gateResult.blocking) {
    blockTool(
      `Quality gates failed: ${resultSummary}. Fix issues before committing.`
    );
    return;
  }
  if (!gateResult.allPassed) {
    respond(
      allowTool(
        "PreToolUse",
        `Quality gates partially passed: ${resultSummary}. Proceeding with commit.`
      )
    );
    return;
  }
  respond(
    allowTool("PreToolUse", `All quality gates passed: ${resultSummary}`)
  );
}
async function handleGitCommand(input, command) {
  const cwd = input.cwd || process.cwd();
  const state = await loadState(cwd);
  debug("Git command detected, checking guards", { command });
  const branchGuard = await checkBranchGuard(command, cwd, state);
  if (!branchGuard.allowed) {
    blockTool(branchGuard.reason ?? "Git operation blocked");
    return;
  }
  if (isMergeCommand(command)) {
    const mergeGuard = checkMergeReadiness(cwd, state);
    if (!mergeGuard.allowed) {
      blockTool(mergeGuard.reason ?? "Merge blocked");
      return;
    }
    if (mergeGuard.warning) {
      respond(allowTool("PreToolUse", mergeGuard.warning));
      return;
    }
  }
  if (branchGuard.warning) {
    respond(allowTool("PreToolUse", branchGuard.warning));
    return;
  }
  respond(allowTool("PreToolUse"));
}

// src/pre-tool-use/subagent-blockers.ts
var TOOL_REPLACEMENTS = {
  Read: {
    replacement: "precision_read",
    usage: `mcp-cli call plugin_goodvibes_precision-engine/precision_read '{
  "files": ["path/to/file1.ts", "path/to/file2.ts"],
  "extract": "full",
  "output": {"mode": "minimal"}
}'`,
    capabilities: "Supports: extract modes (full/outline/lines), line ranges, output modes (minimal/standard/verbose)"
  },
  Edit: {
    replacement: "precision_edit",
    usage: `mcp-cli call plugin_goodvibes_precision-engine/precision_edit '{
  "edits": [
    {"file": "path/to/file.ts", "find": "original", "replace": "replacement"}
  ],
  "transaction": {"mode": "atomic", "rollback_on_fail": true},
  "output": {"mode": "minimal"}
}'`,
    capabilities: "Supports: atomic transactions, validation, hints, batch edits"
  },
  Write: {
    replacement: "precision_write",
    usage: `mcp-cli call plugin_goodvibes_precision-engine/precision_write '{
  "files": [
    {"path": "path/to/file.ts", "content": "file content here"}
  ],
  "transaction": {"mode": "atomic"},
  "output": {"mode": "minimal"}
}'`,
    capabilities: "Supports: create/overwrite operations, multiple files, atomic transactions, validation"
  },
  Glob: {
    replacement: "precision_glob",
    usage: `mcp-cli call plugin_goodvibes_precision-engine/precision_glob '{
  "patterns": ["**/*.ts", "**/*.tsx"],
  "exclude": ["**/*.test.ts"],
  "output": {"mode": "minimal"}
}'`,
    capabilities: "Supports: multiple patterns, exclusions, filters, output modes"
  },
  Grep: {
    replacement: "precision_grep",
    usage: `mcp-cli call plugin_goodvibes_precision-engine/precision_grep '{
  "queries": [
    {"pattern": "searchPattern", "glob": "**/*.ts"}
  ],
  "output": {"mode": "files_only"}
}'`,
    capabilities: "Supports: batch queries, regex patterns, file filtering, context control, output modes"
  }
};
var BLOCKED_NATIVE_TOOLS = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep"
];
function formatBlockMessage(toolName, replacement) {
  const toolPath = `plugin_goodvibes_precision-engine/${replacement.replacement}`;
  return `BLOCKED: '${toolName}' - MANDATORY: Use ${toolPath} instead.
CRITICAL: If multiple tool uses are planned, "discover -> batch" process is MANDATORY:
mcp-cli info plugin_goodvibes_precision-engine/discover
mcp-cli info plugin_goodvibes_batch-engine/batch

** ${toolPath} **TOOL INFO: 
${replacement.usage}

TOOL INFO: ${replacement.capabilities}
MORE INFO: mcp-cli info ${toolPath}

`;
}
function isBlockedNativeTool(toolName) {
  return BLOCKED_NATIVE_TOOLS.includes(toolName);
}
function handleNativeToolBlocking(input) {
  const toolName = input.tool_name ?? "";
  if (!isBlockedNativeTool(toolName)) {
    return false;
  }
  const replacement = TOOL_REPLACEMENTS[toolName];
  if (replacement) {
    const blockMessage = formatBlockMessage(toolName, replacement);
    debug(`Blocking native tool '${toolName}'`, {
      agent_type: input.agent_type,
      is_subagent: input.is_subagent,
      replacement: replacement.replacement
    });
    blockTool(blockMessage);
    return true;
  }
  return false;
}

// src/pre-tool-use/tool-validators.ts
import path4 from "node:path";
async function validateDetectStack(input) {
  const cwd = input.cwd || process.cwd();
  if (!await fileExists(path4.join(cwd, "package.json"))) {
    blockTool(
      "No package.json found in project root. Cannot detect stack."
    );
    return;
  }
  respond(allowTool("PreToolUse"));
}
async function validateGetSchema(input) {
  const cwd = input.cwd || process.cwd();
  const schemaFiles = [
    "prisma/schema.prisma",
    "drizzle.config.ts",
    "drizzle/schema.ts"
  ];
  const results = await Promise.all(
    schemaFiles.map((f) => fileExists(path4.join(cwd, f)))
  );
  const found = results.some(Boolean);
  if (!found) {
    respond(
      allowTool("PreToolUse", "No schema file detected. get_schema may fail.")
    );
    return;
  }
  respond(allowTool("PreToolUse"));
}
async function validateRunSmokeTest(input) {
  const cwd = input.cwd || process.cwd();
  if (!await fileExists(path4.join(cwd, "package.json"))) {
    blockTool("No package.json found. Cannot run smoke tests.");
    return;
  }
  const [hasPnpm, hasYarn, hasNpm] = await Promise.all([
    fileExists(path4.join(cwd, "pnpm-lock.yaml")),
    fileExists(path4.join(cwd, "yarn.lock")),
    fileExists(path4.join(cwd, "package-lock.json"))
  ]);
  if (!hasPnpm && !hasYarn && !hasNpm) {
    respond(
      allowTool(
        "PreToolUse",
        "No lockfile detected. Install dependencies first."
      )
    );
    return;
  }
  respond(allowTool("PreToolUse"));
}
async function validateCheckTypes(input) {
  const cwd = input.cwd || process.cwd();
  if (!await fileExists(path4.join(cwd, "tsconfig.json"))) {
    blockTool(
      "No tsconfig.json found. TypeScript not configured."
    );
    return;
  }
  respond(allowTool("PreToolUse"));
}
async function validateImplementation(_input) {
  respond(allowTool("PreToolUse"));
}
var TOOL_VALIDATORS = {
  detect_stack: validateDetectStack,
  get_schema: validateGetSchema,
  run_smoke_test: validateRunSmokeTest,
  check_types: validateCheckTypes,
  validate_implementation: validateImplementation
};

// src/pre-tool-use/hook.ts
async function handleBashTool(input) {
  const command = extractBashCommand(input);
  if (!command) {
    respond(allowTool("PreToolUse"));
    return;
  }
  if (isCommitCommand(command)) {
    await handleGitCommit(input, command);
    return;
  }
  if (isGitCommand(command)) {
    await handleGitCommand(input, command);
    return;
  }
  respond(allowTool("PreToolUse"));
}
async function runPreToolUseHook() {
  try {
    const rawInput = await readHookInput();
    const input = rawInput;
    if (input.tool_name === "Bash" || input.tool_name?.endsWith("__Bash")) {
      await handleBashTool(input);
      return;
    }
    if (isBlockedNativeTool(input.tool_name ?? "")) {
      const wasBlocked = handleNativeToolBlocking(input);
      if (wasBlocked) {
        return;
      }
    }
    const toolName = input.tool_name?.split("__").pop() ?? "";
    const validator = TOOL_VALIDATORS[toolName];
    if (validator) {
      await validator(input);
    } else {
      respond(allowTool("PreToolUse"));
    }
  } catch (error) {
    logError("PreToolUse main", error);
    respond(
      allowTool(
        "PreToolUse",
        `Hook error: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

// src/pre-tool-use.ts
void runPreToolUseHook();
/* v8 ignore next 2 -- @preserve __dirname is always defined in Node.js CJS */
