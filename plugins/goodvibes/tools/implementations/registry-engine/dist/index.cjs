#!/usr/bin/env node
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

// src/index.ts
var import_server = require("@modelcontextprotocol/sdk/server/index.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_types = require("@modelcontextprotocol/sdk/types.js");

// src/config.ts
var path = __toESM(require("path"), 1);
var import_url = require("url");
var import_path = require("path");
var import_meta = {};
var SERVER_NAME = "registry-engine";
var SERVER_VERSION = "1.0.0";
var getEsmDir = /* @__PURE__ */ __name(() => {
  return (0, import_path.dirname)((0, import_url.fileURLToPath)(import_meta.url));
}, "getEsmDir");
var getConfigDir = /* @__PURE__ */ __name(() => {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }
  try {
    return getEsmDir();
  } catch {
    return process.cwd();
  }
}, "getConfigDir");
var PLUGIN_ROOT = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || path.resolve(getConfigDir(), "../../../..");
var PROJECT_ROOT = process.env.PROJECT_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();
var FUSE_OPTIONS = {
  keys: [
    { name: "name", weight: 0.3 },
    { name: "description", weight: 0.4 },
    { name: "keywords", weight: 0.3 }
  ],
  threshold: 0.4,
  includeScore: true,
  ignoreLocation: true
};

// src/logging.ts
function formatLog(entry) {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
  if (entry.data !== void 0) {
    return `${prefix} ${entry.message} ${JSON.stringify(entry.data)}`;
  }
  return `${prefix} ${entry.message}`;
}
__name(formatLog, "formatLog");
function log(level, message, data) {
  const entry = {
    level,
    message,
    data,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  console.error(formatLog(entry));
}
__name(log, "log");
var logger = {
  debug: (message, data) => log("debug", message, data),
  info: (message, data) => log("info", message, data),
  warn: (message, data) => log("warn", message, data),
  error: (message, data) => log("error", message, data),
  tool: (name, args) => log("tool", `Calling ${name}`, args)
};

// src/schemas/index.ts
var DISCOVERY_SCHEMAS = [
  // Core search tools
  {
    name: "search_skills",
    description: "Search the skill registry for relevant skills based on keywords or task description",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language query or keywords" },
        category: { type: "string", description: "Optional category filter" },
        limit: { type: "integer", description: "Max results (default: 5)", default: 5 }
      },
      required: ["query"]
    }
  },
  {
    name: "search_agents",
    description: "Search for specialized agents by expertise area",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords describing expertise needed" },
        limit: { type: "integer", description: "Max results (default: 5)", default: 5 }
      },
      required: ["query"]
    }
  },
  {
    name: "search_tools",
    description: "Search for available tools by functionality",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords describing tool functionality" },
        limit: { type: "integer", description: "Max results (default: 5)", default: 5 }
      },
      required: ["query"]
    }
  },
  {
    name: "recommend_skills",
    description: "Analyze task and recommend relevant skills",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Natural language task description" },
        max_results: { type: "integer", description: "Max recommendations (default: 5)", default: 5 }
      },
      required: ["task"]
    }
  },
  // Content retrieval
  {
    name: "get_skill_content",
    description: "Load full content of a skill by path",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Skill path from registry" }
      },
      required: ["path"]
    }
  },
  {
    name: "get_agent_content",
    description: "Load full content of an agent by path",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Agent path from registry" }
      },
      required: ["path"]
    }
  },
  {
    name: "skill_dependencies",
    description: "Show skill relationships and dependencies",
    inputSchema: {
      type: "object",
      properties: {
        skill: { type: "string", description: "Skill to analyze" },
        depth: { type: "integer", description: "Dependency tree depth (default: 2)", default: 2 },
        include_optional: { type: "boolean", description: "Include optional deps", default: true }
      },
      required: ["skill"]
    }
  }
];

// src/utils.ts
var import_fuse = __toESM(require("fuse.js"), 1);
var yaml = __toESM(require("js-yaml"), 1);
var fsPromises = __toESM(require("fs/promises"), 1);
var path2 = __toESM(require("path"), 1);
async function fileExists(filePath) {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}
__name(fileExists, "fileExists");
async function loadRegistry(registryPath) {
  try {
    const fullPath = path2.join(PLUGIN_ROOT, registryPath);
    if (!await fileExists(fullPath)) {
      logger.error(`Registry not found: ${fullPath}`);
      return null;
    }
    const content = await fsPromises.readFile(fullPath, "utf-8");
    return yaml.load(content);
  } catch (error) {
    logger.error(`Error loading registry ${registryPath}`, error);
    return null;
  }
}
__name(loadRegistry, "loadRegistry");
function createIndex(registry) {
  if (!registry || !registry.search_index)
    return null;
  return new import_fuse.default(registry.search_index, FUSE_OPTIONS);
}
__name(createIndex, "createIndex");
function search(index, query, limit = 5) {
  if (!index)
    return [];
  const results = index.search(query, { limit });
  return results.map((r) => ({
    name: r.item.name,
    path: r.item.path,
    description: r.item.description,
    relevance: Math.round((1 - (r.score || 0)) * 100) / 100
  }));
}
__name(search, "search");
async function parseSkillMetadata(skillPath) {
  const attempts = [
    path2.join(PLUGIN_ROOT, "skills", skillPath, "SKILL.md"),
    path2.join(PLUGIN_ROOT, "skills", skillPath + ".md"),
    path2.join(PLUGIN_ROOT, "skills", skillPath)
  ];
  for (const filePath of attempts) {
    if (!await fileExists(filePath)) {
      continue;
    }
    try {
      const content = await fsPromises.readFile(filePath, "utf-8");
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const frontmatter = yaml.load(frontmatterMatch[1]);
        return {
          requires: Array.isArray(frontmatter.requires) ? frontmatter.requires : void 0,
          complements: Array.isArray(frontmatter.complements) ? frontmatter.complements : Array.isArray(frontmatter.related) ? frontmatter.related : void 0,
          conflicts: Array.isArray(frontmatter.conflicts) ? frontmatter.conflicts : void 0,
          category: typeof frontmatter.category === "string" ? frontmatter.category : void 0,
          technologies: Array.isArray(frontmatter.technologies) ? frontmatter.technologies : Array.isArray(frontmatter.tech) ? frontmatter.tech : void 0,
          difficulty: typeof frontmatter.difficulty === "string" ? frontmatter.difficulty : void 0
        };
      }
      const metadata = {};
      const requiresMatch = content.match(/(?:Requires|Prerequisites|Dependencies):\s*\n((?:\s*-\s*.+\n)+)/i);
      if (requiresMatch) {
        const items = requiresMatch[1].match(/-\s*(.+)/g);
        if (items) {
          metadata.requires = items.map((m) => m.replace(/^-\s*/, "").trim());
        } else {
          metadata.requires = [];
        }
      }
      const relatedMatch = content.match(/(?:Related|See also|Complements):\s*\n((?:\s*-\s*.+\n)+)/i);
      if (relatedMatch) {
        const items = relatedMatch[1].match(/-\s*(.+)/g);
        if (items) {
          metadata.complements = items.map((m) => m.replace(/^-\s*/, "").trim());
        } else {
          metadata.complements = [];
        }
      }
      const techKeywords = ["react", "next", "nextjs", "prisma", "drizzle", "tailwind", "typescript", "node", "express", "vite", "vitest", "jest", "zustand", "zod", "trpc"];
      const contentLower = content.toLowerCase();
      metadata.technologies = techKeywords.filter((t) => contentLower.includes(t));
      return metadata;
    } catch {
      continue;
    }
  }
  return {};
}
__name(parseSkillMetadata, "parseSkillMetadata");
function success(data) {
  return {
    content: [{
      type: "text",
      text: typeof data === "string" ? data : JSON.stringify(data, null, 2)
    }]
  };
}
__name(success, "success");

// src/handlers/search.ts
function search2(index, query, limit = 5) {
  if (!index)
    return [];
  const results = index.search(query, { limit });
  return results.map((r) => ({
    name: r.item.name,
    path: r.item.path,
    description: r.item.description,
    relevance: Math.round((1 - (r.score || 0)) * 100) / 100
  }));
}
__name(search2, "search");
function handleSearchSkills(skillsIndex, args) {
  const results = search2(skillsIndex, args.query, args.limit || 5);
  const filtered = args.category ? results.filter((r) => r.path.startsWith(args.category)) : results;
  return success({ skills: filtered, total_count: filtered.length, query: args.query });
}
__name(handleSearchSkills, "handleSearchSkills");
function handleSearchAgents(agentsIndex, args) {
  const results = search2(agentsIndex, args.query, args.limit || 5);
  return success({ agents: results, total_count: results.length, query: args.query });
}
__name(handleSearchAgents, "handleSearchAgents");
function handleSearchTools(toolsIndex, args) {
  const results = search2(toolsIndex, args.query, args.limit || 5);
  return success({ tools: results, total_count: results.length, query: args.query });
}
__name(handleSearchTools, "handleSearchTools");
function handleRecommendSkills(skillsIndex, args) {
  const keywords = args.task.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const results = search2(skillsIndex, args.task, args.max_results || 5);
  const taskLower = args.task.toLowerCase();
  let category = "general";
  if (taskLower.includes("auth") || taskLower.includes("login"))
    category = "authentication";
  else if (taskLower.includes("database") || taskLower.includes("prisma") || taskLower.includes("sql"))
    category = "database";
  else if (taskLower.includes("api") || taskLower.includes("endpoint"))
    category = "api";
  else if (taskLower.includes("style") || taskLower.includes("css") || taskLower.includes("tailwind"))
    category = "styling";
  else if (taskLower.includes("test"))
    category = "testing";
  else if (taskLower.includes("deploy") || taskLower.includes("build"))
    category = "deployment";
  const recommendations = results.map((r) => ({
    skill: r.name,
    path: r.path,
    relevance: r.relevance,
    reason: `Matches task keywords: ${keywords.slice(0, 3).join(", ")}`,
    prerequisites: [],
    complements: []
  }));
  return success({
    recommendations,
    task_analysis: {
      category,
      keywords: keywords.slice(0, 10),
      complexity: keywords.length > 10 ? "complex" : keywords.length > 5 ? "moderate" : "simple"
    }
  });
}
__name(handleRecommendSkills, "handleRecommendSkills");

// src/handlers/content.ts
var fs = __toESM(require("fs"), 1);
var path3 = __toESM(require("path"), 1);
function createTextResponse(text) {
  return {
    content: [{ type: "text", text }]
  };
}
__name(createTextResponse, "createTextResponse");
async function handleGetSkillContent(args) {
  const attempts = [
    path3.join(PLUGIN_ROOT, "skills", args.path, "SKILL.md"),
    path3.join(PLUGIN_ROOT, "skills", args.path + ".md"),
    path3.join(PLUGIN_ROOT, "skills", args.path)
  ];
  for (const skillPath of attempts) {
    if (fs.existsSync(skillPath)) {
      const content = await fs.promises.readFile(skillPath, "utf-8");
      return createTextResponse(content);
    }
  }
  throw new Error(`Skill not found: ${args.path}`);
}
__name(handleGetSkillContent, "handleGetSkillContent");
async function handleGetAgentContent(args) {
  const attempts = [
    path3.join(PLUGIN_ROOT, "agents", `${args.path}.md`),
    path3.join(PLUGIN_ROOT, "agents", args.path),
    path3.join(PLUGIN_ROOT, "agents", args.path, "index.md")
  ];
  for (const agentPath of attempts) {
    if (fs.existsSync(agentPath)) {
      const content = await fs.promises.readFile(agentPath, "utf-8");
      return createTextResponse(content);
    }
  }
  throw new Error(`Agent not found: ${args.path}`);
}
__name(handleGetAgentContent, "handleGetAgentContent");

// src/handlers/dependencies.ts
async function handleSkillDependencies(skillsIndex, skillsRegistry, args) {
  const results = search(skillsIndex, args.skill, 1);
  if (results.length === 0) {
    throw new Error(`Skill not found: ${args.skill}`);
  }
  const skill = results[0];
  const depth = args.depth || 2;
  const includeOptional = args.include_optional !== false;
  const skillMetadata = await parseSkillMetadata(skill.path);
  const required = [];
  const optional = [];
  const conflicts = [];
  const dependents = [];
  if (skillMetadata.requires) {
    for (const req of skillMetadata.requires) {
      const reqResult = search(skillsIndex, req, 1);
      if (reqResult.length > 0) {
        required.push({
          skill: reqResult[0].name,
          path: reqResult[0].path,
          reason: "Listed as required dependency"
        });
        if (depth > 1) {
          const nestedMeta = await parseSkillMetadata(reqResult[0].path);
          if (nestedMeta.requires) {
            for (const nested of nestedMeta.requires.slice(0, 3)) {
              const nestedResult = search(skillsIndex, nested, 1);
              if (nestedResult.length > 0 && !required.find((r) => r.path === nestedResult[0].path)) {
                required.push({
                  skill: nestedResult[0].name,
                  path: nestedResult[0].path,
                  reason: `Required by ${reqResult[0].name}`
                });
              }
            }
          }
        }
      }
    }
  }
  if (includeOptional && skillMetadata.complements) {
    for (const comp of skillMetadata.complements) {
      const compResult = search(skillsIndex, comp, 1);
      if (compResult.length > 0) {
        optional.push({
          skill: compResult[0].name,
          path: compResult[0].path,
          reason: "Listed as complementary skill"
        });
      }
    }
  }
  if (skillMetadata.conflicts) {
    for (const conf of skillMetadata.conflicts) {
      const confResult = search(skillsIndex, conf, 1);
      if (confResult.length > 0) {
        conflicts.push({
          skill: confResult[0].name,
          path: confResult[0].path,
          reason: "Listed as conflicting skill"
        });
      }
    }
  }
  if (skillsRegistry?.search_index) {
    for (const entry of skillsRegistry.search_index) {
      if (entry.path === skill.path)
        continue;
      const entryMeta = await parseSkillMetadata(entry.path);
      if (entryMeta.requires?.some(
        (r) => r.toLowerCase().includes(skill.name.toLowerCase()) || skill.path.includes(r)
      )) {
        dependents.push({ skill: entry.name, path: entry.path });
      }
    }
  }
  const skillPath = skill.path;
  const category = skillPath.split("/")[0];
  if (optional.length < 3) {
    const related = search(skillsIndex, category, 10).filter((r) => r.path !== skillPath && !optional.find((o) => o.path === r.path)).slice(0, 5 - optional.length);
    for (const r of related) {
      optional.push({
        skill: r.name,
        path: r.path,
        reason: "Related skill in same category"
      });
    }
  }
  const suggestedBundle = [skill.path];
  for (const req of required.slice(0, 3)) {
    suggestedBundle.push(req.path);
  }
  for (const opt of optional.slice(0, 2)) {
    if (!suggestedBundle.includes(opt.path)) {
      suggestedBundle.push(opt.path);
    }
  }
  return success({
    skill: skill.name,
    path: skill.path,
    metadata: {
      category: skillMetadata.category || category,
      technologies: skillMetadata.technologies || [],
      difficulty: skillMetadata.difficulty
    },
    dependencies: {
      required,
      optional: optional.slice(0, 5),
      conflicts
    },
    dependents: dependents.slice(0, 5),
    suggested_bundle: suggestedBundle,
    analysis: {
      has_prerequisites: required.length > 0,
      has_conflicts: conflicts.length > 0,
      dependency_count: required.length + optional.length,
      is_foundational: dependents.length > 2
    }
  });
}
__name(handleSkillDependencies, "handleSkillDependencies");

// src/handlers/index.ts
var TOOL_HANDLERS = {
  search_skills: async (ctx, args) => handleSearchSkills(ctx.skillsIndex, args),
  search_agents: async (ctx, args) => handleSearchAgents(ctx.agentsIndex, args),
  search_tools: async (ctx, args) => handleSearchTools(ctx.toolsIndex, args),
  recommend_skills: async (ctx, args) => handleRecommendSkills(ctx.skillsIndex, args),
  get_skill_content: async (ctx, args) => handleGetSkillContent(args),
  get_agent_content: async (ctx, args) => handleGetAgentContent(args),
  skill_dependencies: async (ctx, args) => handleSkillDependencies(ctx.skillsIndex, ctx.skillsRegistry, args)
};
function getHandler(name) {
  return TOOL_HANDLERS[name];
}
__name(getHandler, "getHandler");
function hasHandler(name) {
  return name in TOOL_HANDLERS;
}
__name(hasHandler, "hasHandler");
function listHandlers() {
  return Object.keys(TOOL_HANDLERS);
}
__name(listHandlers, "listHandlers");

// src/index.ts
var LazyRegistryLoader = class {
  static {
    __name(this, "LazyRegistryLoader");
  }
  _skillsIndex = null;
  _agentsIndex = null;
  _toolsIndex = null;
  _skillsRegistry = null;
  _skillsLoading = null;
  _agentsLoading = null;
  _toolsLoading = null;
  _skillsLoaded = false;
  _agentsLoaded = false;
  _toolsLoaded = false;
  /**
   * Get skills index, loading it lazily if not already loaded.
   */
  async getSkillsIndex() {
    if (!this._skillsLoaded) {
      if (!this._skillsLoading) {
        this._skillsLoading = this.loadSkills();
      }
      await this._skillsLoading;
    }
    return this._skillsIndex;
  }
  /**
   * Get skills registry, loading it lazily if not already loaded.
   */
  async getSkillsRegistry() {
    if (!this._skillsLoaded) {
      if (!this._skillsLoading) {
        this._skillsLoading = this.loadSkills();
      }
      await this._skillsLoading;
    }
    return this._skillsRegistry;
  }
  /**
   * Get agents index, loading it lazily if not already loaded.
   */
  async getAgentsIndex() {
    if (!this._agentsLoaded) {
      if (!this._agentsLoading) {
        this._agentsLoading = this.loadAgents();
      }
      await this._agentsLoading;
    }
    return this._agentsIndex;
  }
  /**
   * Get tools index, loading it lazily if not already loaded.
   */
  async getToolsIndex() {
    if (!this._toolsLoaded) {
      if (!this._toolsLoading) {
        this._toolsLoading = this.loadTools();
      }
      await this._toolsLoading;
    }
    return this._toolsIndex;
  }
  /**
   * Preload all registries in parallel.
   * Call this to warm up the cache if you want eager loading behavior.
   */
  async preloadAll() {
    await Promise.all([
      this.getSkillsIndex(),
      this.getAgentsIndex(),
      this.getToolsIndex()
    ]);
  }
  /**
   * Get handler context with all registries loaded.
   */
  async getHandlerContext() {
    await Promise.all([
      this.getSkillsIndex(),
      this.getAgentsIndex(),
      this.getToolsIndex()
    ]);
    return {
      skillsIndex: this._skillsIndex,
      agentsIndex: this._agentsIndex,
      toolsIndex: this._toolsIndex,
      skillsRegistry: this._skillsRegistry
    };
  }
  async loadSkills() {
    logger.info("Loading skills registry lazily");
    this._skillsRegistry = await loadRegistry("skills/_registry.yaml");
    this._skillsIndex = createIndex(this._skillsRegistry);
    this._skillsLoaded = true;
    logger.info("Skills index loaded", {
      entries: this._skillsRegistry?.search_index?.length || 0
    });
  }
  async loadAgents() {
    logger.info("Loading agents registry lazily");
    const agentsRegistry = await loadRegistry("agents/_registry.yaml");
    this._agentsIndex = createIndex(agentsRegistry);
    this._agentsLoaded = true;
    logger.info("Agents index loaded", {
      entries: agentsRegistry?.search_index?.length || 0
    });
  }
  async loadTools() {
    logger.info("Loading tools registry lazily");
    const toolsRegistry = await loadRegistry("tools/_registry.yaml");
    this._toolsIndex = createIndex(toolsRegistry);
    this._toolsLoaded = true;
    logger.info("Tools index loaded", {
      entries: toolsRegistry?.search_index?.length || 0
    });
  }
};
var RegistryEngineServer = class {
  static {
    __name(this, "RegistryEngineServer");
  }
  server;
  registryLoader;
  constructor() {
    this.server = new import_server.Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } }
    );
    this.registryLoader = new LazyRegistryLoader();
    this.setupHandlers();
    this.setupErrorHandling();
  }
  /**
   * Initialize search indexes (optional - can be used for eager loading).
   * Set GOODVIBES_EAGER_LOAD=true to preload all registries at startup.
   */
  async initializeIndexes() {
    const eagerLoad = process.env.GOODVIBES_EAGER_LOAD === "true";
    if (eagerLoad) {
      logger.info("Eager loading indexes from", PLUGIN_ROOT);
      await this.registryLoader.preloadAll();
    } else {
      logger.info("Lazy loading enabled - indexes will be loaded on first access", {
        plugin_root: PLUGIN_ROOT
      });
    }
  }
  /**
   * Build handler context with lazy-loaded registries.
   */
  async getHandlerContext() {
    return this.registryLoader.getHandlerContext();
  }
  setupHandlers() {
    this.server.setRequestHandler(import_types.ListToolsRequestSchema, async () => {
      logger.debug("ListTools request");
      return { tools: DISCOVERY_SCHEMAS };
    });
    this.server.setRequestHandler(import_types.CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      logger.tool(name, args);
      if (!hasHandler(name)) {
        throw new import_types.McpError(
          import_types.ErrorCode.MethodNotFound,
          `Unknown tool: ${name}. Available: ${listHandlers().join(", ")}`
        );
      }
      const handler = getHandler(name);
      if (!handler) {
        throw new import_types.McpError(import_types.ErrorCode.InternalError, `Handler not found: ${name}`);
      }
      try {
        const ctx = await this.getHandlerContext();
        return await handler(ctx, args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Tool ${name} failed`, { error: message, args });
        throw new import_types.McpError(import_types.ErrorCode.InternalError, `Tool ${name} failed: ${message}`);
      }
    });
  }
  setupErrorHandling() {
    this.server.onerror = (error) => logger.error("MCP Server error", error);
    process.on("SIGINT", async () => {
      logger.info("Shutting down");
      await this.stop();
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      logger.info("Shutting down");
      await this.stop();
      process.exit(0);
    });
  }
  async start() {
    await this.initializeIndexes();
    const transport = new import_stdio.StdioServerTransport();
    await this.server.connect(transport);
    logger.info(`${SERVER_NAME} v${SERVER_VERSION} started`);
    logger.info(`Tools: ${listHandlers().join(", ")}`);
  }
  async stop() {
    await this.server.close();
  }
};
async function main() {
  const server = new RegistryEngineServer();
  await server.start();
}
__name(main, "main");
main().catch((error) => {
  logger.error("Failed to start", error);
  process.exit(1);
});
//# sourceMappingURL=index.cjs.map
