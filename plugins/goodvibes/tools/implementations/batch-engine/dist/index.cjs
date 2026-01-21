"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  DEFAULTS: () => DEFAULTS,
  EMPTY_AGGREGATIONS: () => EMPTY_AGGREGATIONS,
  EMPTY_INDEX: () => EMPTY_INDEX,
  EMPTY_PREFERENCES: () => EMPTY_PREFERENCES,
  EMPTY_SESSION_METRICS: () => EMPTY_SESSION_METRICS,
  MEMORY_PATHS: () => MEMORY_PATHS,
  MemoryManagerImpl: () => MemoryManagerImpl,
  PHASE_ORDER: () => PHASE_ORDER2,
  SERVER_NAME: () => SERVER_NAME,
  STATE_PATHS: () => STATE_PATHS,
  StateManagerImpl: () => StateManagerImpl,
  TELEMETRY_PATHS: () => TELEMETRY_PATHS,
  TOKEN_COSTS: () => TOKEN_COSTS,
  TelemetryCollectorImpl: () => TelemetryCollectorImpl,
  VERSION: () => VERSION,
  createMemoryManager: () => createMemoryManager,
  createRuntimeContext: () => createRuntimeContext,
  createStateManager: () => createStateManager,
  createTelemetryCollector: () => createTelemetryCollector,
  getActiveBatch: () => getActiveBatch,
  getCheckpointPath: () => getCheckpointPath,
  getCompletedBatch: () => getCompletedBatch,
  getHandler: () => getHandler,
  getHistoryPath: () => getHistoryPath,
  getMemoryManager: () => getMemoryManager2,
  getStateManager: () => getStateManager2,
  getTelemetryCollector: () => getTelemetryCollector2,
  getTodayDateString: () => getTodayDateString,
  getToolDefinitions: () => getToolDefinitions,
  handleBatch: () => handleBatch,
  handleBatchRecover: () => handleBatchRecover,
  handleBatchState: () => handleBatchState,
  handleBatchStatus: () => handleBatchStatus,
  handleListBatches: () => handleListBatches,
  handleListCheckpoints: () => handleListCheckpoints,
  handlerRegistry: () => handlerRegistry,
  hasHandler: () => hasHandler,
  initializeRuntime: () => initializeRuntime,
  listActiveBatches: () => listActiveBatches,
  listCompletedBatches: () => listCompletedBatches,
  listHandlers: () => listHandlers,
  persistRuntime: () => persistRuntime,
  resetGlobalMemoryManager: () => resetGlobalMemoryManager2,
  resetGlobalStateManager: () => resetGlobalStateManager2,
  resetGlobalTelemetryCollector: () => resetGlobalTelemetryCollector2,
  resetRuntime: () => resetRuntime,
  toolDefinitions: () => toolDefinitions
});
module.exports = __toCommonJS(src_exports);

// src/handlers/batch.ts
var crypto4 = __toESM(require("crypto"), 1);

// src/runtime/state.ts
var fs = __toESM(require("fs/promises"), 1);
var path = __toESM(require("path"), 1);
var crypto = __toESM(require("crypto"), 1);

// src/interfaces/state-files.ts
var STATE_PATHS = {
  ROOT: ".goodvibes",
  STATE_DIR: ".goodvibes/state",
  SESSION_FILE: ".goodvibes/state/session.json",
  AGENTS_FILE: ".goodvibes/state/agents.json",
  LOCKS_FILE: ".goodvibes/state/locks.json",
  HEALTH_FILE: ".goodvibes/state/health.json",
  CHECKPOINTS_DIR: ".goodvibes/checkpoints",
  CACHE_DIR: ".goodvibes/cache",
  STACK_CACHE: ".goodvibes/cache/stack.json",
  SYMBOLS_CACHE: ".goodvibes/cache/symbols.json",
  DEPS_CACHE: ".goodvibes/cache/deps.json"
};
function getCheckpointPath(checkpointId) {
  const base = `${STATE_PATHS.CHECKPOINTS_DIR}/${checkpointId}`;
  return {
    manifest: `${base}/manifest.json`,
    files: `${base}/files`,
    state: `${base}/state.json`
  };
}

// src/runtime/state.ts
function generateId(prefix) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const random = crypto.randomBytes(4).toString("hex");
  return `${prefix}_${timestamp}_${random}`;
}
function createDefaultHealthResult() {
  return {
    status: "unknown",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function createDefaultSessionState() {
  return {
    id: generateId("session"),
    started_at: (/* @__PURE__ */ new Date()).toISOString(),
    mode: "vibecoding",
    batches_completed: 0,
    operations_completed: 0,
    tokens_used: 0,
    last_typecheck: createDefaultHealthResult(),
    last_lint: createDefaultHealthResult(),
    last_test: createDefaultHealthResult(),
    last_build: createDefaultHealthResult(),
    git: {
      main_branch: "main",
      current_branch: "main",
      uncommitted_files: [],
      last_commit: ""
    },
    files: {
      modified_this_session: [],
      created_this_session: [],
      deleted_this_session: []
    }
  };
}
function createDefaultAgentState() {
  return {
    active: /* @__PURE__ */ new Map(),
    completed: [],
    total_spawned: 0,
    total_tokens: 0
  };
}
function createDefaultCheckpointState() {
  return {
    checkpoints: [],
    max_checkpoints: 10,
    cleanup_after_hours: 24
  };
}
function createDefaultLockState() {
  return {
    locks: []
  };
}
function createDefaultState() {
  return {
    session: createDefaultSessionState(),
    agents: createDefaultAgentState(),
    checkpoints: createDefaultCheckpointState(),
    locks: createDefaultLockState()
  };
}
var StateManagerImpl = class {
  state;
  projectRoot;
  changeCallbacks;
  persistLock = null;
  constructor(projectRoot = process.cwd()) {
    this.state = createDefaultState();
    this.projectRoot = projectRoot;
    this.changeCallbacks = /* @__PURE__ */ new Set();
  }
  // =========================================================================
  // StateManager Extended Methods
  // =========================================================================
  getState() {
    return this.state;
  }
  reset() {
    this.state = createDefaultState();
    this.notifyChange();
  }
  onStateChange(callback) {
    this.changeCallbacks.add(callback);
    return () => this.changeCallbacks.delete(callback);
  }
  notifyChange() {
    for (const callback of this.changeCallbacks) {
      try {
        callback(this.state);
      } catch {
      }
    }
  }
  // =========================================================================
  // Session Methods
  // =========================================================================
  getSession() {
    return this.state.session;
  }
  updateSession(updates) {
    this.state.session = { ...this.state.session, ...updates };
    this.notifyChange();
  }
  // =========================================================================
  // Agent Methods
  // =========================================================================
  registerAgent(agent) {
    this.state.agents.active.set(agent.id, agent);
    this.state.agents.total_spawned++;
    this.notifyChange();
  }
  updateAgent(id, updates) {
    const agent = this.state.agents.active.get(id);
    if (agent) {
      this.state.agents.active.set(id, { ...agent, ...updates });
      this.notifyChange();
    }
  }
  completeAgent(id, result) {
    const agent = this.state.agents.active.get(id);
    if (!agent)
      return;
    const completed = {
      id: agent.id,
      agent_type: agent.agent_type,
      task: agent.task,
      started_at: agent.started_at,
      completed_at: (/* @__PURE__ */ new Date()).toISOString(),
      status: result.status,
      tokens_used: result.tokens_used,
      turns_used: result.turns_used,
      files_modified: result.files_modified,
      summary: result.summary
    };
    this.state.agents.active.delete(id);
    this.state.agents.completed.push(completed);
    this.state.agents.total_tokens += result.tokens_used;
    this.notifyChange();
  }
  getActiveAgents() {
    return Array.from(this.state.agents.active.values());
  }
  // =========================================================================
  // Checkpoint Methods
  // =========================================================================
  createCheckpoint(batch_id, reason) {
    const id = generateId("cp");
    const now = /* @__PURE__ */ new Date();
    const expiresAt = new Date(now.getTime() + this.state.checkpoints.cleanup_after_hours * 60 * 60 * 1e3);
    const checkpoint = {
      id,
      created_at: now.toISOString(),
      batch_id,
      type: "auto",
      files: [],
      state_snapshot: JSON.stringify(this.state.session),
      reason,
      expires_at: expiresAt.toISOString()
    };
    this.state.checkpoints.checkpoints.push(checkpoint);
    while (this.state.checkpoints.checkpoints.length > this.state.checkpoints.max_checkpoints) {
      this.state.checkpoints.checkpoints.shift();
    }
    this.notifyChange();
    return checkpoint;
  }
  restoreCheckpoint(checkpoint_id) {
    const checkpoint = this.state.checkpoints.checkpoints.find((cp) => cp.id === checkpoint_id);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpoint_id}`);
    }
    try {
      const restoredSession = JSON.parse(checkpoint.state_snapshot);
      this.state.session = restoredSession;
      this.notifyChange();
    } catch {
      throw new Error(`Failed to restore checkpoint: ${checkpoint_id}`);
    }
  }
  cleanupCheckpoints() {
    const now = /* @__PURE__ */ new Date();
    this.state.checkpoints.checkpoints = this.state.checkpoints.checkpoints.filter((cp) => {
      if (!cp.expires_at)
        return true;
      return new Date(cp.expires_at) > now;
    });
    this.notifyChange();
  }
  // =========================================================================
  // Lock Methods
  // =========================================================================
  acquireLock(lock) {
    const existingLock = this.state.locks.locks.find((l) => l.target === lock.target);
    if (existingLock) {
      if (existingLock.mode === "exclusive") {
        return null;
      }
      if (lock.mode === "exclusive") {
        return null;
      }
    }
    const newLock = {
      ...lock,
      id: generateId("lock"),
      acquired_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.state.locks.locks.push(newLock);
    this.notifyChange();
    return newLock;
  }
  releaseLock(lock_id) {
    const index = this.state.locks.locks.findIndex((l) => l.id === lock_id);
    if (index !== -1) {
      this.state.locks.locks.splice(index, 1);
      this.notifyChange();
    }
  }
  isLocked(target) {
    return this.state.locks.locks.some((l) => l.target === target);
  }
  // =========================================================================
  // Persistence Methods
  // =========================================================================
  async persist() {
    if (this.persistLock) {
      await this.persistLock;
    }
    this.persistLock = this.doPersist();
    await this.persistLock;
    this.persistLock = null;
  }
  async doPersist() {
    await this.ensureDirectories();
    const agentsForStorage = {
      ...this.state.agents,
      active: Array.from(this.state.agents.active.entries())
    };
    await this.writeStateFile(
      STATE_PATHS.SESSION_FILE,
      this.state.session
    );
    await this.writeStateFile(
      STATE_PATHS.AGENTS_FILE,
      agentsForStorage
    );
    await this.writeStateFile(
      STATE_PATHS.LOCKS_FILE,
      this.state.locks
    );
    await this.writeStateFile(
      STATE_PATHS.HEALTH_FILE,
      {
        typecheck: this.state.session.last_typecheck,
        lint: this.state.session.last_lint,
        test: this.state.session.last_test,
        build: this.state.session.last_build
      }
    );
  }
  async load() {
    await this.ensureDirectories();
    const session = await this.readStateFile(STATE_PATHS.SESSION_FILE);
    if (session) {
      this.state.session = session;
    }
    const agentsData = await this.readStateFile(STATE_PATHS.AGENTS_FILE);
    if (agentsData) {
      this.state.agents = {
        active: new Map(agentsData.active || []),
        completed: agentsData.completed || [],
        total_spawned: agentsData.total_spawned || 0,
        total_tokens: agentsData.total_tokens || 0
      };
    }
    const locks = await this.readStateFile(STATE_PATHS.LOCKS_FILE);
    if (locks) {
      this.state.locks = locks;
    }
    const health = await this.readStateFile(STATE_PATHS.HEALTH_FILE);
    if (health) {
      this.state.session.last_typecheck = health.typecheck || createDefaultHealthResult();
      this.state.session.last_lint = health.lint || createDefaultHealthResult();
      this.state.session.last_test = health.test || createDefaultHealthResult();
      this.state.session.last_build = health.build || createDefaultHealthResult();
    }
    this.notifyChange();
  }
  // =========================================================================
  // File System Helpers
  // =========================================================================
  getAbsolutePath(relativePath) {
    return path.join(this.projectRoot, relativePath);
  }
  async ensureDirectories() {
    const dirs = [
      STATE_PATHS.ROOT,
      STATE_PATHS.STATE_DIR,
      STATE_PATHS.CHECKPOINTS_DIR,
      STATE_PATHS.CACHE_DIR
    ];
    for (const dir of dirs) {
      const absPath = this.getAbsolutePath(dir);
      try {
        await fs.mkdir(absPath, { recursive: true });
      } catch {
      }
    }
  }
  async readStateFile(relativePath) {
    const absPath = this.getAbsolutePath(relativePath);
    try {
      const content = await fs.readFile(absPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  async writeStateFile(relativePath, data) {
    const absPath = this.getAbsolutePath(relativePath);
    await fs.writeFile(absPath, JSON.stringify(data, null, 2), "utf-8");
  }
};
function createStateManager(projectRoot) {
  return new StateManagerImpl(projectRoot);
}
var globalStateManager = null;
function getStateManager2(projectRoot) {
  if (!globalStateManager) {
    globalStateManager = createStateManager(projectRoot);
  }
  return globalStateManager;
}
function resetGlobalStateManager2() {
  globalStateManager = null;
}

// src/runtime/memory.ts
var fs2 = __toESM(require("fs/promises"), 1);
var path2 = __toESM(require("path"), 1);
var crypto2 = __toESM(require("crypto"), 1);

// src/interfaces/memory-files.ts
var MEMORY_PATHS = {
  MEMORY_DIR: ".goodvibes/memory",
  DECISIONS_FILE: ".goodvibes/memory/decisions.md",
  PATTERNS_FILE: ".goodvibes/memory/patterns.md",
  FAILURES_FILE: ".goodvibes/memory/failures.md",
  PREFERENCES_FILE: ".goodvibes/memory/preferences.json",
  INDEX_FILE: ".goodvibes/memory/index.json"
};
var EMPTY_INDEX = {
  decisions: [],
  patterns: [],
  failures: [],
  last_updated: (/* @__PURE__ */ new Date()).toISOString()
};
var EMPTY_PREFERENCES = {
  preferences: [],
  last_updated: (/* @__PURE__ */ new Date()).toISOString()
};
var MEMORY_FILE_TYPES = {
  [MEMORY_PATHS.DECISIONS_FILE]: "decisions",
  [MEMORY_PATHS.PATTERNS_FILE]: "patterns",
  [MEMORY_PATHS.FAILURES_FILE]: "failures",
  [MEMORY_PATHS.PREFERENCES_FILE]: "preferences",
  [MEMORY_PATHS.INDEX_FILE]: "index"
};

// src/runtime/memory.ts
function generateId2(prefix) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const random = crypto2.randomBytes(4).toString("hex");
  return `${prefix}_${timestamp}_${random}`;
}
function extractKeywords(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 2).filter((word, i, arr) => arr.indexOf(word) === i);
}
function formatDecision(decision) {
  const lines = [
    `## Decision: ${decision.what}`,
    `- **ID**: ${decision.id}`,
    `- **Date**: ${decision.timestamp}`,
    `- **Category**: ${decision.category}`,
    `- **Confidence**: ${decision.confidence}`,
    `- **Status**: ${decision.status}`,
    "",
    "### What",
    decision.what,
    "",
    "### Why",
    decision.why
  ];
  if (decision.files && decision.files.length > 0) {
    lines.push("", "### Scope", `- Files: ${decision.files.join(", ")}`);
  }
  if (decision.symbols && decision.symbols.length > 0) {
    lines.push(`- Symbols: ${decision.symbols.join(", ")}`);
  }
  if (decision.superseded_by) {
    lines.push("", `### Superseded By`, decision.superseded_by);
  }
  lines.push("", "---", "");
  return lines.join("\n");
}
function formatPattern(pattern) {
  const lines = [
    `## Pattern: ${pattern.name}`,
    `- **ID**: ${pattern.id}`,
    `- **Date**: ${pattern.timestamp}`,
    `- **Usage Count**: ${pattern.usage_count}`,
    "",
    "### Description",
    pattern.description,
    "",
    "### When to Use",
    pattern.when_to_use
  ];
  if (pattern.when_not_to_use) {
    lines.push("", "### When NOT to Use", pattern.when_not_to_use);
  }
  if (pattern.examples.length > 0) {
    lines.push("", "### Examples");
    for (const example of pattern.examples) {
      lines.push(`- ${example.file}:${example.lines[0]}-${example.lines[1]}`);
      if (example.code) {
        lines.push("```", example.code, "```");
      }
    }
  }
  lines.push("", "---", "");
  return lines.join("\n");
}
function formatFailure(failure) {
  const lines = [
    `## Failure: ${failure.error_type}`,
    `- **ID**: ${failure.id}`,
    `- **Date**: ${failure.timestamp}`,
    `- **Resolved**: ${failure.resolved ? "Yes" : "No"}`,
    "",
    "### Error Message",
    failure.error_message
  ];
  if (failure.stack_trace) {
    lines.push("", "### Stack Trace", "```", failure.stack_trace, "```");
  }
  if (failure.operation) {
    lines.push("", "### Operation", failure.operation);
  }
  if (failure.files && failure.files.length > 0) {
    lines.push("", "### Files", failure.files.map((f) => `- ${f}`).join("\n"));
  }
  if (failure.root_cause) {
    lines.push("", "### Root Cause", failure.root_cause);
  }
  if (failure.resolution) {
    lines.push("", "### Resolution", failure.resolution);
  }
  if (failure.prevention) {
    lines.push("", "### Prevention", failure.prevention);
  }
  lines.push("", "---", "");
  return lines.join("\n");
}
function parseDecisions(content) {
  const decisions = [];
  const sections = content.split(/^## Decision:/gm).slice(1);
  for (const section of sections) {
    try {
      const idMatch = section.match(/\*\*ID\*\*:\s*(\S+)/);
      const dateMatch = section.match(/\*\*Date\*\*:\s*(\S+)/);
      const categoryMatch = section.match(/\*\*Category\*\*:\s*(\S+)/);
      const confidenceMatch = section.match(/\*\*Confidence\*\*:\s*(\S+)/);
      const statusMatch = section.match(/\*\*Status\*\*:\s*(\S+)/);
      const whatMatch = section.match(/^(.+?)\n/);
      const whyMatch = section.match(/### Why\n([\s\S]*?)(?=\n###|$)/);
      if (idMatch && whatMatch) {
        decisions.push({
          id: idMatch[1],
          timestamp: dateMatch?.[1] || (/* @__PURE__ */ new Date()).toISOString(),
          what: whatMatch[1].trim(),
          why: whyMatch?.[1]?.trim() || "",
          category: categoryMatch?.[1] || "architecture",
          confidence: confidenceMatch?.[1] || "medium",
          status: statusMatch?.[1] || "active"
        });
      }
    } catch {
    }
  }
  return decisions;
}
function parsePatterns(content) {
  const patterns = [];
  const sections = content.split(/^## Pattern:/gm).slice(1);
  for (const section of sections) {
    try {
      const idMatch = section.match(/\*\*ID\*\*:\s*(\S+)/);
      const dateMatch = section.match(/\*\*Date\*\*:\s*(\S+)/);
      const usageMatch = section.match(/\*\*Usage Count\*\*:\s*(\d+)/);
      const nameMatch = section.match(/^(.+?)\n/);
      const descMatch = section.match(/### Description\n([\s\S]*?)(?=\n###|$)/);
      const whenMatch = section.match(/### When to Use\n([\s\S]*?)(?=\n###|$)/);
      if (idMatch && nameMatch) {
        patterns.push({
          id: idMatch[1],
          timestamp: dateMatch?.[1] || (/* @__PURE__ */ new Date()).toISOString(),
          name: nameMatch[1].trim(),
          description: descMatch?.[1]?.trim() || "",
          examples: [],
          when_to_use: whenMatch?.[1]?.trim() || "",
          usage_count: parseInt(usageMatch?.[1] || "0", 10)
        });
      }
    } catch {
    }
  }
  return patterns;
}
function parseFailures(content) {
  const failures = [];
  const sections = content.split(/^## Failure:/gm).slice(1);
  for (const section of sections) {
    try {
      const idMatch = section.match(/\*\*ID\*\*:\s*(\S+)/);
      const dateMatch = section.match(/\*\*Date\*\*:\s*(\S+)/);
      const resolvedMatch = section.match(/\*\*Resolved\*\*:\s*(\S+)/);
      const typeMatch = section.match(/^(.+?)\n/);
      const messageMatch = section.match(/### Error Message\n([\s\S]*?)(?=\n###|$)/);
      const resolutionMatch = section.match(/### Resolution\n([\s\S]*?)(?=\n###|$)/);
      if (idMatch && typeMatch) {
        failures.push({
          id: idMatch[1],
          timestamp: dateMatch?.[1] || (/* @__PURE__ */ new Date()).toISOString(),
          error_type: typeMatch[1].trim(),
          error_message: messageMatch?.[1]?.trim() || "",
          resolved: resolvedMatch?.[1]?.toLowerCase() === "yes",
          resolution: resolutionMatch?.[1]?.trim()
        });
      }
    } catch {
    }
  }
  return failures;
}
var MemoryManagerImpl = class {
  memory;
  projectRoot;
  changeCallbacks;
  index;
  constructor(projectRoot = process.cwd()) {
    this.memory = {
      decisions: [],
      patterns: [],
      failures: [],
      preferences: []
    };
    this.projectRoot = projectRoot;
    this.changeCallbacks = /* @__PURE__ */ new Set();
    this.index = { ...EMPTY_INDEX };
  }
  // =========================================================================
  // MemoryManager Extended Methods
  // =========================================================================
  getMemory() {
    return this.memory;
  }
  reset() {
    this.memory = {
      decisions: [],
      patterns: [],
      failures: [],
      preferences: []
    };
    this.index = { ...EMPTY_INDEX, last_updated: (/* @__PURE__ */ new Date()).toISOString() };
    this.notifyChange();
  }
  onMemoryChange(callback) {
    this.changeCallbacks.add(callback);
    return () => this.changeCallbacks.delete(callback);
  }
  notifyChange() {
    for (const callback of this.changeCallbacks) {
      try {
        callback(this.memory);
      } catch {
      }
    }
  }
  // =========================================================================
  // Decision Methods
  // =========================================================================
  recordDecision(decision) {
    const newDecision = {
      ...decision,
      id: generateId2("dec"),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.memory.decisions.push(newDecision);
    this.updateIndex("decisions", newDecision);
    this.notifyChange();
    return newDecision;
  }
  getDecisions(filter) {
    let results = [...this.memory.decisions];
    if (filter) {
      if (filter.category) {
        const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
        results = results.filter((d) => categories.includes(d.category));
      }
      if (filter.status) {
        results = results.filter((d) => d.status === filter.status);
      }
      if (filter.confidence) {
        results = results.filter((d) => d.confidence === filter.confidence);
      }
      if (filter.files && filter.files.length > 0) {
        results = results.filter((d) => d.files?.some((f) => filter.files.includes(f)));
      }
      if (filter.symbols && filter.symbols.length > 0) {
        results = results.filter((d) => d.symbols?.some((s) => filter.symbols.includes(s)));
      }
      if (filter.since) {
        const sinceDate = new Date(filter.since);
        results = results.filter((d) => new Date(d.timestamp) >= sinceDate);
      }
      if (filter.batch_id) {
        results = results.filter((d) => d.batch_id === filter.batch_id);
      }
    }
    return results;
  }
  supersedDecision(id, new_decision_id) {
    const decision = this.memory.decisions.find((d) => d.id === id);
    if (decision) {
      decision.status = "superseded";
      decision.superseded_by = new_decision_id;
      this.notifyChange();
    }
  }
  // =========================================================================
  // Pattern Methods
  // =========================================================================
  recordPattern(pattern) {
    const newPattern = {
      ...pattern,
      id: generateId2("pat"),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      usage_count: 0
    };
    this.memory.patterns.push(newPattern);
    this.updateIndex("patterns", newPattern);
    this.notifyChange();
    return newPattern;
  }
  getPatterns(filter) {
    let results = [...this.memory.patterns];
    if (filter) {
      if (filter.name) {
        const nameLower = filter.name.toLowerCase();
        results = results.filter((p) => p.name.toLowerCase().includes(nameLower));
      }
      if (filter.min_usage !== void 0) {
        results = results.filter((p) => p.usage_count >= filter.min_usage);
      }
      if (filter.discovered_in) {
        results = results.filter((p) => p.discovered_in === filter.discovered_in);
      }
      if (filter.since) {
        const sinceDate = new Date(filter.since);
        results = results.filter((p) => new Date(p.timestamp) >= sinceDate);
      }
    }
    return results;
  }
  incrementPatternUsage(id) {
    const pattern = this.memory.patterns.find((p) => p.id === id);
    if (pattern) {
      pattern.usage_count++;
      this.notifyChange();
    }
  }
  // =========================================================================
  // Failure Methods
  // =========================================================================
  recordFailure(failure) {
    const newFailure = {
      ...failure,
      id: generateId2("fail"),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.memory.failures.push(newFailure);
    this.updateIndex("failures", newFailure);
    this.notifyChange();
    return newFailure;
  }
  getFailures(filter) {
    let results = [...this.memory.failures];
    if (filter) {
      if (filter.error_type) {
        results = results.filter((f) => f.error_type === filter.error_type);
      }
      if (filter.resolved !== void 0) {
        results = results.filter((f) => f.resolved === filter.resolved);
      }
      if (filter.files && filter.files.length > 0) {
        results = results.filter((f) => f.files?.some((file) => filter.files.includes(file)));
      }
      if (filter.since) {
        const sinceDate = new Date(filter.since);
        results = results.filter((f) => new Date(f.timestamp) >= sinceDate);
      }
      if (filter.operation) {
        results = results.filter((f) => f.operation === filter.operation);
      }
    }
    return results;
  }
  resolveFailure(id, resolution) {
    const failure = this.memory.failures.find((f) => f.id === id);
    if (failure) {
      failure.resolved = true;
      failure.resolution = resolution;
      this.notifyChange();
    }
  }
  // =========================================================================
  // Preference Methods
  // =========================================================================
  setPreference(key, value, scope = "project") {
    const existing = this.memory.preferences.findIndex((p) => p.key === key && p.scope === scope);
    const preference = {
      id: generateId2("pref"),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      key,
      value,
      source: "user",
      scope
    };
    if (existing >= 0) {
      this.memory.preferences[existing] = preference;
    } else {
      this.memory.preferences.push(preference);
    }
    this.notifyChange();
  }
  getPreference(key) {
    const session = this.memory.preferences.find((p) => p.key === key && p.scope === "session");
    if (session)
      return session.value;
    const project = this.memory.preferences.find((p) => p.key === key && p.scope === "project");
    if (project)
      return project.value;
    const global = this.memory.preferences.find((p) => p.key === key && p.scope === "global");
    return global?.value;
  }
  // =========================================================================
  // Search Methods
  // =========================================================================
  search(keywords, kinds) {
    const results = [];
    const keywordsLower = keywords.map((k) => k.toLowerCase());
    const shouldInclude = (kind) => !kinds || kinds.includes(kind);
    if (shouldInclude("decision")) {
      for (const decision of this.memory.decisions) {
        const text = `${decision.what} ${decision.why}`.toLowerCase();
        if (keywordsLower.some((kw) => text.includes(kw))) {
          results.push({ kind: "decision", entry: decision });
        }
      }
    }
    if (shouldInclude("pattern")) {
      for (const pattern of this.memory.patterns) {
        const text = `${pattern.name} ${pattern.description}`.toLowerCase();
        if (keywordsLower.some((kw) => text.includes(kw))) {
          results.push({ kind: "pattern", entry: pattern });
        }
      }
    }
    if (shouldInclude("failure")) {
      for (const failure of this.memory.failures) {
        const text = `${failure.error_type} ${failure.error_message}`.toLowerCase();
        if (keywordsLower.some((kw) => text.includes(kw))) {
          results.push({ kind: "failure", entry: failure });
        }
      }
    }
    if (shouldInclude("preference")) {
      for (const preference of this.memory.preferences) {
        if (keywordsLower.some((kw) => preference.key.toLowerCase().includes(kw))) {
          results.push({ kind: "preference", entry: preference });
        }
      }
    }
    return results;
  }
  getRelevant(context) {
    const files = context.affected_files || [];
    const symbols = context.affected_symbols || [];
    return {
      decisions: this.memory.decisions.filter(
        (d) => d.status === "active" && (d.files?.some((f) => files.includes(f)) || d.symbols?.some((s) => symbols.includes(s)))
      ),
      patterns: this.memory.patterns.filter(
        (p) => p.examples.some((e) => files.includes(e.file))
      ),
      failures: this.memory.failures.filter(
        (f) => !f.resolved && f.files?.some((file) => files.includes(file))
      ),
      preferences: this.memory.preferences.filter(
        (p) => p.scope === "session" || p.scope === "project"
      )
    };
  }
  // =========================================================================
  // Maintenance Methods
  // =========================================================================
  compact() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3);
    this.memory.decisions = this.memory.decisions.filter(
      (d) => d.status === "active" || new Date(d.timestamp) > thirtyDaysAgo
    );
    this.memory.failures = this.memory.failures.filter(
      (f) => !f.resolved || new Date(f.timestamp) > thirtyDaysAgo
    );
    this.memory.preferences = this.memory.preferences.filter((p) => p.scope !== "session");
    this.rebuildIndex();
    this.notifyChange();
  }
  export() {
    return JSON.stringify(this.memory, null, 2);
  }
  import(data) {
    try {
      const imported = JSON.parse(data);
      this.memory.decisions.push(...imported.decisions || []);
      this.memory.patterns.push(...imported.patterns || []);
      this.memory.failures.push(...imported.failures || []);
      this.memory.preferences.push(...imported.preferences || []);
      this.rebuildIndex();
      this.notifyChange();
    } catch {
      throw new Error("Failed to import memory data: Invalid JSON");
    }
  }
  // =========================================================================
  // Index Management
  // =========================================================================
  updateIndex(kind, entry) {
    const indexEntry = {
      id: entry.id,
      keywords: this.extractIndexKeywords(kind, entry),
      timestamp: entry.timestamp,
      category: "category" in entry ? entry.category : void 0
    };
    this.index[kind].push(indexEntry);
    this.index.last_updated = (/* @__PURE__ */ new Date()).toISOString();
  }
  extractIndexKeywords(kind, entry) {
    switch (kind) {
      case "decisions":
        return extractKeywords(`${entry.what} ${entry.why}`);
      case "patterns":
        return extractKeywords(`${entry.name} ${entry.description}`);
      case "failures":
        return extractKeywords(`${entry.error_type} ${entry.error_message}`);
      default:
        return [];
    }
  }
  rebuildIndex() {
    this.index = {
      decisions: this.memory.decisions.map((d) => ({
        id: d.id,
        keywords: this.extractIndexKeywords("decisions", d),
        timestamp: d.timestamp,
        category: d.category
      })),
      patterns: this.memory.patterns.map((p) => ({
        id: p.id,
        keywords: this.extractIndexKeywords("patterns", p),
        timestamp: p.timestamp
      })),
      failures: this.memory.failures.map((f) => ({
        id: f.id,
        keywords: this.extractIndexKeywords("failures", f),
        timestamp: f.timestamp
      })),
      last_updated: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  // =========================================================================
  // Persistence Methods
  // =========================================================================
  async persist() {
    await this.ensureMemoryDir();
    const decisionsContent = "# Decisions\n\n" + this.memory.decisions.map(formatDecision).join("\n");
    await this.writeMemoryFile(MEMORY_PATHS.DECISIONS_FILE, decisionsContent);
    const patternsContent = "# Patterns\n\n" + this.memory.patterns.map(formatPattern).join("\n");
    await this.writeMemoryFile(MEMORY_PATHS.PATTERNS_FILE, patternsContent);
    const failuresContent = "# Failures\n\n" + this.memory.failures.map(formatFailure).join("\n");
    await this.writeMemoryFile(MEMORY_PATHS.FAILURES_FILE, failuresContent);
    const preferencesFile = {
      preferences: this.memory.preferences,
      last_updated: (/* @__PURE__ */ new Date()).toISOString()
    };
    await this.writeMemoryFile(MEMORY_PATHS.PREFERENCES_FILE, JSON.stringify(preferencesFile, null, 2));
    await this.writeMemoryFile(MEMORY_PATHS.INDEX_FILE, JSON.stringify(this.index, null, 2));
  }
  async load() {
    await this.ensureMemoryDir();
    const decisionsContent = await this.readMemoryFile(MEMORY_PATHS.DECISIONS_FILE);
    if (decisionsContent) {
      this.memory.decisions = parseDecisions(decisionsContent);
    }
    const patternsContent = await this.readMemoryFile(MEMORY_PATHS.PATTERNS_FILE);
    if (patternsContent) {
      this.memory.patterns = parsePatterns(patternsContent);
    }
    const failuresContent = await this.readMemoryFile(MEMORY_PATHS.FAILURES_FILE);
    if (failuresContent) {
      this.memory.failures = parseFailures(failuresContent);
    }
    const preferencesContent = await this.readMemoryFile(MEMORY_PATHS.PREFERENCES_FILE);
    if (preferencesContent) {
      try {
        const preferencesFile = JSON.parse(preferencesContent);
        this.memory.preferences = preferencesFile.preferences || [];
      } catch {
        this.memory.preferences = [];
      }
    }
    const indexContent = await this.readMemoryFile(MEMORY_PATHS.INDEX_FILE);
    if (indexContent) {
      try {
        this.index = JSON.parse(indexContent);
      } catch {
        this.rebuildIndex();
      }
    } else {
      this.rebuildIndex();
    }
    this.notifyChange();
  }
  // =========================================================================
  // File System Helpers
  // =========================================================================
  getAbsolutePath(relativePath) {
    return path2.join(this.projectRoot, relativePath);
  }
  async ensureMemoryDir() {
    const absPath = this.getAbsolutePath(MEMORY_PATHS.MEMORY_DIR);
    try {
      await fs2.mkdir(absPath, { recursive: true });
    } catch {
    }
  }
  async readMemoryFile(relativePath) {
    const absPath = this.getAbsolutePath(relativePath);
    try {
      return await fs2.readFile(absPath, "utf-8");
    } catch {
      return null;
    }
  }
  async writeMemoryFile(relativePath, content) {
    const absPath = this.getAbsolutePath(relativePath);
    await fs2.writeFile(absPath, content, "utf-8");
  }
};
function createMemoryManager(projectRoot) {
  return new MemoryManagerImpl(projectRoot);
}
var globalMemoryManager = null;
function getMemoryManager2(projectRoot) {
  if (!globalMemoryManager) {
    globalMemoryManager = createMemoryManager(projectRoot);
  }
  return globalMemoryManager;
}
function resetGlobalMemoryManager2() {
  globalMemoryManager = null;
}

// src/runtime/telemetry.ts
var fs3 = __toESM(require("fs/promises"), 1);
var path3 = __toESM(require("path"), 1);
var crypto3 = __toESM(require("crypto"), 1);

// src/interfaces/telemetry-files.ts
var TELEMETRY_PATHS = {
  TELEMETRY_DIR: ".goodvibes/telemetry",
  CURRENT_SESSION: ".goodvibes/telemetry/current_session.json",
  HISTORY_DIR: ".goodvibes/telemetry/history",
  AGGREGATIONS: ".goodvibes/telemetry/aggregations.json"
};
function getHistoryPath(date) {
  return `${TELEMETRY_PATHS.HISTORY_DIR}/${date}.json`;
}
var EMPTY_SESSION_METRICS = {
  id: "",
  started_at: (/* @__PURE__ */ new Date()).toISOString(),
  mode: "interactive",
  total_batches: 0,
  total_operations: 0,
  total_agents: 0,
  total_tokens: 0,
  total_duration_ms: 0,
  operations_by_type: {},
  tokens_by_type: {},
  batch_success_rate: 0,
  operation_success_rate: 0,
  agent_success_rate: 0,
  rollbacks_triggered: 0,
  fix_loops_run: 0,
  retries_total: 0
};
var EMPTY_AGGREGATIONS = {
  hourly: [],
  daily: [],
  by_operation_type: {},
  by_agent_type: {},
  token_trend: { direction: "stable", change_percent: 0, period: "7d" },
  success_trend: { direction: "stable", change_percent: 0, period: "7d" },
  duration_trend: { direction: "stable", change_percent: 0, period: "7d" }
};
var TELEMETRY_FILE_TYPES = {
  [TELEMETRY_PATHS.CURRENT_SESSION]: "current_session",
  [TELEMETRY_PATHS.AGGREGATIONS]: "aggregations"
};
function getTodayDateString() {
  return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
}

// src/runtime/telemetry.ts
var TOKEN_COSTS_CONFIG = {
  input: {
    haiku: 0.25,
    sonnet: 3,
    opus: 15
  },
  output: {
    haiku: 1.25,
    sonnet: 15,
    opus: 75
  }
};
function generateId3(prefix) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const random = crypto3.randomBytes(4).toString("hex");
  return `${prefix}_${timestamp}_${random}`;
}
function calcSuccessRate(succeeded, total) {
  if (total === 0)
    return 0;
  return Math.round(succeeded / total * 100 * 100) / 100;
}
function aggregateByType(operations) {
  const byType = /* @__PURE__ */ new Map();
  for (const op of operations) {
    const existing = byType.get(op.type) || [];
    existing.push(op);
    byType.set(op.type, existing);
  }
  const result = {};
  for (const [type, ops] of byType) {
    const succeeded = ops.filter((o) => o.status === "success").length;
    result[type] = {
      count: ops.length,
      total_tokens: ops.reduce((sum, o) => sum + o.tokens_used, 0),
      avg_tokens: Math.round(ops.reduce((sum, o) => sum + o.tokens_used, 0) / ops.length),
      avg_duration_ms: Math.round(ops.reduce((sum, o) => sum + o.duration_ms, 0) / ops.length),
      success_rate: calcSuccessRate(succeeded, ops.length)
    };
  }
  return result;
}
function aggregateAgentsByType(agents) {
  const byType = /* @__PURE__ */ new Map();
  for (const agent of agents) {
    const existing = byType.get(agent.agent_type) || [];
    existing.push(agent);
    byType.set(agent.agent_type, existing);
  }
  const result = {};
  for (const [type, agts] of byType) {
    const succeeded = agts.filter((a) => a.status === "success").length;
    result[type] = {
      count: agts.length,
      total_tokens: agts.reduce((sum, a) => sum + a.tokens_total, 0),
      avg_tokens: Math.round(agts.reduce((sum, a) => sum + a.tokens_total, 0) / agts.length),
      avg_duration_ms: Math.round(agts.reduce((sum, a) => sum + a.duration_ms, 0) / agts.length),
      success_rate: calcSuccessRate(succeeded, agts.length)
    };
  }
  return result;
}
function calculateTrend(points, metric) {
  if (points.length < 2) {
    return { direction: "stable", change_percent: 0, period: "7d" };
  }
  const recent = points.slice(-7);
  if (recent.length < 2) {
    return { direction: "stable", change_percent: 0, period: "7d" };
  }
  const oldValue = recent[0][metric];
  const newValue = recent[recent.length - 1][metric];
  if (oldValue === 0) {
    return { direction: newValue > 0 ? "up" : "stable", change_percent: 0, period: "7d" };
  }
  const changePercent = (newValue - oldValue) / oldValue * 100;
  const direction = changePercent > 5 ? "up" : changePercent < -5 ? "down" : "stable";
  return {
    direction,
    change_percent: Math.round(changePercent * 100) / 100,
    period: "7d"
  };
}
var TelemetryCollectorImpl = class {
  telemetry;
  projectRoot;
  sessionStartTime;
  activeBatches;
  activeOperations;
  activeAgents;
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.sessionStartTime = Date.now();
    this.activeBatches = /* @__PURE__ */ new Map();
    this.activeOperations = /* @__PURE__ */ new Map();
    this.activeAgents = /* @__PURE__ */ new Map();
    this.telemetry = this.createEmptyTelemetry();
  }
  createEmptyTelemetry() {
    return {
      session: {
        ...EMPTY_SESSION_METRICS,
        id: generateId3("session"),
        started_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      batches: [],
      operations: [],
      agents: [],
      aggregations: { ...EMPTY_AGGREGATIONS }
    };
  }
  // =========================================================================
  // Recording Methods
  // =========================================================================
  recordBatchStart(batch) {
    this.activeBatches.set(batch.id, {
      batch,
      startTime: Date.now()
    });
  }
  recordBatchComplete(batch_id, result) {
    const active = this.activeBatches.get(batch_id);
    if (!active)
      return;
    const duration_ms = Date.now() - active.startTime;
    const tokens_used = result.summary.tokens_used;
    const batchMetrics = {
      id: batch_id,
      started_at: new Date(active.startTime).toISOString(),
      completed_at: (/* @__PURE__ */ new Date()).toISOString(),
      status: result.summary.status,
      operations_total: result.summary.operations_total,
      operations_succeeded: result.summary.operations_succeeded,
      operations_failed: result.summary.operations_failed,
      duration_ms,
      tokens_used,
      parallel_efficiency: this.calculateParallelEfficiency(result),
      validation_passed: result.validation.after.passed,
      validation_errors: result.validation.after.errors?.length || 0,
      checkpoint_created: !!result.recovery.checkpoint_id,
      rollback_triggered: result.recovery.rollback_triggered
    };
    this.telemetry.batches.push(batchMetrics);
    this.activeBatches.delete(batch_id);
    this.updateSessionMetrics(batchMetrics, result);
  }
  recordOperationStart(operation) {
    const batch_id = this.findBatchForOperation(operation.id);
    this.activeOperations.set(operation.id, {
      operation,
      startTime: Date.now(),
      batch_id
    });
  }
  recordOperationComplete(operation_id, result) {
    const active = this.activeOperations.get(operation_id);
    if (!active)
      return;
    const duration_ms = Date.now() - active.startTime;
    const operationMetrics = {
      id: operation_id,
      batch_id: active.batch_id,
      type: result.type,
      started_at: new Date(active.startTime).toISOString(),
      completed_at: (/* @__PURE__ */ new Date()).toISOString(),
      duration_ms,
      tokens_used: result.tokens_used,
      status: result.status,
      retries: 0,
      // TODO: Track retries
      details: result.data || {}
    };
    this.telemetry.operations.push(operationMetrics);
    this.activeOperations.delete(operation_id);
    this.telemetry.session.total_operations++;
    this.telemetry.session.total_tokens += result.tokens_used;
    this.telemetry.session.operations_by_type[result.type] = (this.telemetry.session.operations_by_type[result.type] || 0) + 1;
    this.telemetry.session.tokens_by_type[result.type] = (this.telemetry.session.tokens_by_type[result.type] || 0) + result.tokens_used;
  }
  recordAgentStart(agent) {
    const operation_id = agent.id;
    const batch_id = this.findBatchForAgent(agent.id);
    this.activeAgents.set(agent.id, {
      agent,
      startTime: Date.now(),
      batch_id,
      operation_id
    });
  }
  recordAgentComplete(agent_id, result) {
    const active = this.activeAgents.get(agent_id);
    if (!active)
      return;
    const duration_ms = Date.now() - active.startTime;
    const budget = active.agent.budget || {};
    const agentMetrics = {
      id: agent_id,
      batch_id: active.batch_id,
      operation_id: active.operation_id,
      agent_type: active.agent.agent,
      started_at: new Date(active.startTime).toISOString(),
      completed_at: (/* @__PURE__ */ new Date()).toISOString(),
      duration_ms,
      tokens_input: Math.round(result.tokens_used * 0.3),
      // Estimate 30% input
      tokens_output: Math.round(result.tokens_used * 0.7),
      // Estimate 70% output
      tokens_total: result.tokens_used,
      turns: result.turns_used,
      tool_calls: 0,
      // TODO: Track tool calls
      files_read: 0,
      // TODO: Track files read
      files_written: result.files_modified.length,
      status: result.status,
      budget_utilization: budget.max_tokens ? Math.round(result.tokens_used / budget.max_tokens * 100) : 0
    };
    this.telemetry.agents.push(agentMetrics);
    this.activeAgents.delete(agent_id);
    this.telemetry.session.total_agents++;
  }
  // =========================================================================
  // Querying Methods
  // =========================================================================
  getSessionMetrics() {
    this.updateSessionDuration();
    this.calculateSuccessRates();
    return this.telemetry.session;
  }
  getBatchMetrics(batch_id) {
    const batch = this.telemetry.batches.find((b) => b.id === batch_id);
    if (!batch) {
      throw new Error(`Batch not found: ${batch_id}`);
    }
    return batch;
  }
  getAggregations(period) {
    this.updateAggregations();
    return this.telemetry.aggregations;
  }
  // =========================================================================
  // Analysis Methods
  // =========================================================================
  estimateCost(tokens) {
    const model = "sonnet";
    const inputCost = tokens * 0.3 * TOKEN_COSTS_CONFIG.input[model] / 1e6;
    const outputCost = tokens * 0.7 * TOKEN_COSTS_CONFIG.output[model] / 1e6;
    return Math.round((inputCost + outputCost) * 100) / 100;
  }
  projectTokenUsage(batches) {
    if (this.telemetry.batches.length === 0)
      return 0;
    const avgTokensPerBatch = this.telemetry.batches.reduce(
      (sum, b) => sum + b.tokens_used,
      0
    ) / this.telemetry.batches.length;
    return Math.round(avgTokensPerBatch * batches);
  }
  identifyBottlenecks() {
    const bottlenecks = [];
    const sortedOps = [...this.telemetry.operations].sort(
      (a, b) => b.duration_ms - a.duration_ms
    );
    for (const op of sortedOps.slice(0, 3)) {
      if (op.duration_ms > 5e3) {
        bottlenecks.push({
          type: "operation",
          id: op.id,
          description: `Slow ${op.type} operation (${op.duration_ms}ms)`,
          impact_ms: op.duration_ms,
          suggestion: `Consider optimizing or parallelizing ${op.type} operations`
        });
      }
    }
    const validationFailures = this.telemetry.batches.filter((b) => !b.validation_passed);
    if (validationFailures.length > 0) {
      const avgRetryTime = validationFailures.reduce(
        (sum, b) => sum + b.duration_ms,
        0
      ) / validationFailures.length;
      bottlenecks.push({
        type: "validation",
        id: "validation_failures",
        description: `${validationFailures.length} batches failed validation`,
        impact_ms: avgRetryTime,
        suggestion: "Pre-validate operations before batch execution"
      });
    }
    const overBudgetAgents = this.telemetry.agents.filter((a) => a.budget_utilization > 80);
    for (const agent of overBudgetAgents) {
      bottlenecks.push({
        type: "agent",
        id: agent.id,
        description: `Agent ${agent.agent_type} used ${agent.budget_utilization}% of budget`,
        impact_ms: agent.duration_ms,
        suggestion: "Consider increasing agent budget or splitting task"
      });
    }
    return bottlenecks;
  }
  // =========================================================================
  // Export Methods
  // =========================================================================
  exportReport(format) {
    this.updateSessionDuration();
    this.calculateSuccessRates();
    this.updateAggregations();
    switch (format) {
      case "json":
        return JSON.stringify(this.telemetry, null, 2);
      case "markdown":
        return this.exportMarkdown();
      case "csv":
        return this.exportCsv();
      default:
        return JSON.stringify(this.telemetry, null, 2);
    }
  }
  exportMarkdown() {
    const session = this.telemetry.session;
    const lines = [
      "# Telemetry Report",
      "",
      "## Session Summary",
      "",
      `- **Session ID**: ${session.id}`,
      `- **Started**: ${session.started_at}`,
      `- **Duration**: ${Math.round(session.total_duration_ms / 1e3 / 60)} minutes`,
      `- **Mode**: ${session.mode}`,
      "",
      "### Metrics",
      "",
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total Batches | ${session.total_batches} |`,
      `| Total Operations | ${session.total_operations} |`,
      `| Total Agents | ${session.total_agents} |`,
      `| Total Tokens | ${session.total_tokens.toLocaleString()} |`,
      `| Estimated Cost | $${this.estimateCost(session.total_tokens)} |`,
      `| Batch Success Rate | ${session.batch_success_rate}% |`,
      `| Operation Success Rate | ${session.operation_success_rate}% |`,
      `| Agent Success Rate | ${session.agent_success_rate}% |`,
      `| Rollbacks | ${session.rollbacks_triggered} |`,
      `| Fix Loops | ${session.fix_loops_run} |`,
      "",
      "### Operations by Type",
      "",
      "| Type | Count | Tokens |",
      "|------|-------|--------|"
    ];
    for (const [type, count] of Object.entries(session.operations_by_type)) {
      const tokens = session.tokens_by_type[type] || 0;
      lines.push(`| ${type} | ${count} | ${tokens.toLocaleString()} |`);
    }
    lines.push("", "---", "", "*Generated by GoodVibes Batch Engine*");
    return lines.join("\n");
  }
  exportCsv() {
    const lines = [
      "batch_id,started_at,completed_at,status,operations_total,operations_succeeded,operations_failed,duration_ms,tokens_used,parallel_efficiency"
    ];
    for (const batch of this.telemetry.batches) {
      lines.push([
        batch.id,
        batch.started_at,
        batch.completed_at,
        batch.status,
        batch.operations_total,
        batch.operations_succeeded,
        batch.operations_failed,
        batch.duration_ms,
        batch.tokens_used,
        batch.parallel_efficiency
      ].join(","));
    }
    return lines.join("\n");
  }
  // =========================================================================
  // Persistence Methods
  // =========================================================================
  async persist() {
    await this.ensureTelemetryDir();
    await this.writeCurrentSession(this.getSessionMetrics());
    const today = getTodayDateString();
    const todayAggregations = this.calculateDailyAggregations(today);
    await this.writeHistory(today, todayAggregations);
    await this.writeAggregations(this.getAggregations());
  }
  async load() {
    await this.ensureTelemetryDir();
    const session = await this.readCurrentSession();
    if (session) {
      this.telemetry.session = session;
      this.sessionStartTime = new Date(session.started_at).getTime();
    }
    const aggregations = await this.readAggregations();
    if (aggregations) {
      this.telemetry.aggregations = aggregations;
    }
  }
  // =========================================================================
  // Helper Methods
  // =========================================================================
  findBatchForOperation(operation_id) {
    for (const [batch_id, data] of this.activeBatches) {
      const batch = data.batch;
      const allOps = [
        ...batch.operations.read || [],
        ...batch.operations.write || [],
        ...batch.operations.exec || [],
        ...batch.operations.query || [],
        ...batch.operations.state || []
      ];
      if (allOps.some((op) => op.id === operation_id)) {
        return batch_id;
      }
    }
    return "";
  }
  findBatchForAgent(agent_id) {
    for (const [batch_id, data] of this.activeBatches) {
      const batch = data.batch;
      const execOps = batch.operations.exec || [];
      for (const op of execOps) {
        if ("agents" in op && op.agents?.some((a) => a.id === agent_id)) {
          return batch_id;
        }
      }
    }
    return "";
  }
  calculateParallelEfficiency(result) {
    if (result.execution_graph.critical_path_ms === 0)
      return 100;
    const totalSerial = result.execution_graph.parallel_groups.reduce(
      (sum, group) => sum + group.length,
      0
    );
    if (totalSerial === 0)
      return 100;
    return Math.round(
      result.execution_graph.critical_path_ms / (result.summary.duration_ms || 1) * 100
    );
  }
  updateSessionMetrics(batchMetrics, result) {
    const session = this.telemetry.session;
    session.total_batches++;
    session.total_tokens += batchMetrics.tokens_used;
    session.total_duration_ms = Date.now() - this.sessionStartTime;
    if (batchMetrics.rollback_triggered) {
      session.rollbacks_triggered++;
    }
  }
  updateSessionDuration() {
    this.telemetry.session.total_duration_ms = Date.now() - this.sessionStartTime;
    if (!this.telemetry.session.ended_at) {
    }
  }
  calculateSuccessRates() {
    const session = this.telemetry.session;
    const batches = this.telemetry.batches;
    const operations = this.telemetry.operations;
    const agents = this.telemetry.agents;
    session.batch_success_rate = calcSuccessRate(
      batches.filter((b) => b.status === "success").length,
      batches.length
    );
    session.operation_success_rate = calcSuccessRate(
      operations.filter((o) => o.status === "success").length,
      operations.length
    );
    session.agent_success_rate = calcSuccessRate(
      agents.filter((a) => a.status === "success").length,
      agents.length
    );
  }
  updateAggregations() {
    const aggregations = this.telemetry.aggregations;
    aggregations.by_operation_type = aggregateByType(this.telemetry.operations);
    aggregations.by_agent_type = aggregateAgentsByType(this.telemetry.agents);
    aggregations.token_trend = calculateTrend(aggregations.daily, "tokens");
    aggregations.success_trend = calculateTrend(aggregations.daily, "success_rate");
    aggregations.duration_trend = { direction: "stable", change_percent: 0, period: "7d" };
  }
  calculateDailyAggregations(date) {
    const dayStart = new Date(date).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1e3;
    const batchesForDay = this.telemetry.batches.filter((b) => {
      const ts = new Date(b.started_at).getTime();
      return ts >= dayStart && ts < dayEnd;
    });
    const operationsForDay = this.telemetry.operations.filter((o) => {
      const ts = new Date(o.started_at).getTime();
      return ts >= dayStart && ts < dayEnd;
    });
    const point = {
      timestamp: date,
      batches: batchesForDay.length,
      operations: operationsForDay.length,
      tokens: operationsForDay.reduce((sum, o) => sum + o.tokens_used, 0),
      success_rate: calcSuccessRate(
        operationsForDay.filter((o) => o.status === "success").length,
        operationsForDay.length
      )
    };
    return {
      hourly: [],
      daily: [point],
      by_operation_type: aggregateByType(operationsForDay),
      by_agent_type: {},
      token_trend: { direction: "stable", change_percent: 0, period: "7d" },
      success_trend: { direction: "stable", change_percent: 0, period: "7d" },
      duration_trend: { direction: "stable", change_percent: 0, period: "7d" }
    };
  }
  // =========================================================================
  // File System Helpers
  // =========================================================================
  getAbsolutePath(relativePath) {
    return path3.join(this.projectRoot, relativePath);
  }
  async ensureTelemetryDir() {
    const dirs = [
      TELEMETRY_PATHS.TELEMETRY_DIR,
      TELEMETRY_PATHS.HISTORY_DIR
    ];
    for (const dir of dirs) {
      const absPath = this.getAbsolutePath(dir);
      try {
        await fs3.mkdir(absPath, { recursive: true });
      } catch {
      }
    }
  }
  async readCurrentSession() {
    const absPath = this.getAbsolutePath(TELEMETRY_PATHS.CURRENT_SESSION);
    try {
      const content = await fs3.readFile(absPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  async writeCurrentSession(metrics) {
    const absPath = this.getAbsolutePath(TELEMETRY_PATHS.CURRENT_SESSION);
    await fs3.writeFile(absPath, JSON.stringify(metrics, null, 2), "utf-8");
  }
  async readAggregations() {
    const absPath = this.getAbsolutePath(TELEMETRY_PATHS.AGGREGATIONS);
    try {
      const content = await fs3.readFile(absPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  async writeAggregations(aggregations) {
    const absPath = this.getAbsolutePath(TELEMETRY_PATHS.AGGREGATIONS);
    await fs3.writeFile(absPath, JSON.stringify(aggregations, null, 2), "utf-8");
  }
  async writeHistory(date, aggregations) {
    const absPath = this.getAbsolutePath(getHistoryPath(date));
    await fs3.writeFile(absPath, JSON.stringify(aggregations, null, 2), "utf-8");
  }
};
function createTelemetryCollector(projectRoot) {
  return new TelemetryCollectorImpl(projectRoot);
}
var globalTelemetryCollector = null;
function getTelemetryCollector2(projectRoot) {
  if (!globalTelemetryCollector) {
    globalTelemetryCollector = createTelemetryCollector(projectRoot);
  }
  return globalTelemetryCollector;
}
function resetGlobalTelemetryCollector2() {
  globalTelemetryCollector = null;
}

// src/runtime/index.ts
function createRuntimeContext(projectRoot) {
  return {
    state: getStateManager(projectRoot),
    memory: getMemoryManager(projectRoot),
    telemetry: getTelemetryCollector(projectRoot)
  };
}
async function initializeRuntime(context) {
  const stateManager = context.state;
  const memoryManager = context.memory;
  const telemetryCollector = context.telemetry;
  await Promise.all([
    stateManager.load(),
    memoryManager.load(),
    telemetryCollector.load()
  ]);
}
async function persistRuntime(context) {
  const stateManager = context.state;
  const memoryManager = context.memory;
  const telemetryCollector = context.telemetry;
  await Promise.all([
    stateManager.persist(),
    memoryManager.persist(),
    telemetryCollector.persist()
  ]);
}
function resetRuntime() {
  resetGlobalStateManager();
  resetGlobalMemoryManager();
  resetGlobalTelemetryCollector();
}

// src/handlers/batch.ts
function generateBatchId() {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const random = crypto4.randomBytes(4).toString("hex");
  return `batch_${timestamp}_${random}`;
}
function startTimer() {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function parseOutputMode(args) {
  if (typeof args === "object" && args !== null) {
    const obj = args;
    if (obj.output_mode && typeof obj.output_mode === "string") {
      if (["count_only", "minimal", "standard", "verbose"].includes(obj.output_mode)) {
        return obj.output_mode;
      }
    }
    if (obj.output && typeof obj.output === "object" && obj.output !== null) {
      const output = obj.output;
      if (output.mode && typeof output.mode === "string") {
        if (["count_only", "minimal", "standard", "verbose"].includes(output.mode)) {
          return output.mode;
        }
      }
    }
  }
  return "standard";
}
function successResult(data, outputMode, executionMs) {
  return {
    success: true,
    data,
    meta: {
      output_mode: outputMode,
      token_estimate: estimateTokens(JSON.stringify(data)),
      execution_ms: executionMs
    }
  };
}
function errorResult(error, outputMode, executionMs) {
  return {
    success: false,
    error,
    meta: {
      output_mode: outputMode,
      token_estimate: estimateTokens(error),
      execution_ms: executionMs
    }
  };
}
function toCallToolResult(result) {
  const content = {
    type: "text",
    text: JSON.stringify(result, null, 2)
  };
  return {
    content: [content],
    isError: !result.success
  };
}
var DEFAULT_BATCH_CONFIG = {
  transaction: {
    mode: "atomic",
    isolation: "strict",
    timeout_ms: 6e4
  },
  execution: {
    mode: "parallel",
    max_workers: 10,
    fail_fast: true,
    retry: {
      attempts: 3,
      backoff: "exponential",
      delay_ms: 1e3
    }
  },
  preview: {
    dry_run: false,
    diff: true,
    impact: true
  },
  validation: {
    before: ["typecheck"],
    after: ["typecheck", "lint"],
    on_fail: "rollback"
  },
  recovery: {
    checkpoint: true,
    rollback_on_fail: true,
    cleanup_on_success: true
  }
};
var activeBatches = /* @__PURE__ */ new Map();
var completedBatches = /* @__PURE__ */ new Map();
function countOperations(operations) {
  if (!operations)
    return 0;
  return (operations.read?.length || 0) + (operations.write?.length || 0) + (operations.exec?.length || 0) + (operations.query?.length || 0) + (operations.state?.length || 0);
}
function collectAffectedFiles(operations) {
  const files = /* @__PURE__ */ new Set();
  if (operations?.read) {
    for (const op of operations.read) {
      if ("files" in op && Array.isArray(op.files)) {
        for (const file of op.files) {
          if (typeof file === "string") {
            files.add(file);
          } else if (file && typeof file === "object" && "path" in file) {
            files.add(file.path);
          }
        }
      }
      if ("pattern" in op && op.pattern) {
      }
    }
  }
  if (operations?.write) {
    for (const op of operations.write) {
      if ("edits" in op && Array.isArray(op.edits)) {
        for (const edit of op.edits) {
          if ("file" in edit && edit.file) {
            files.add(edit.file);
          }
        }
      }
      if ("file" in op && op.file) {
        files.add(op.file);
      }
    }
  }
  return Array.from(files);
}
function collectCommands(operations) {
  const commands = [];
  if (operations?.exec) {
    for (const op of operations.exec) {
      if (op.type === "command" && "commands" in op) {
        for (const cmd of op.commands) {
          commands.push(cmd.cmd);
        }
      }
    }
  }
  return commands;
}
function assessRiskLevel(operations) {
  const factors = [];
  let riskScore = 0;
  const writeCount = operations?.write?.length || 0;
  if (writeCount > 0) {
    riskScore += writeCount * 2;
    factors.push(`${writeCount} file write operations`);
  }
  if (operations?.write) {
    const deleteOps = operations.write.filter((op) => op.type === "delete");
    if (deleteOps.length > 0) {
      riskScore += deleteOps.length * 5;
      factors.push(`${deleteOps.length} file delete operations`);
    }
  }
  if (operations?.exec) {
    const cmdOps = operations.exec.filter((op) => op.type === "command");
    if (cmdOps.length > 0) {
      riskScore += cmdOps.length * 3;
      factors.push(`${cmdOps.length} command executions`);
    }
    const agentOps = operations.exec.filter((op) => op.type === "agent");
    if (agentOps.length > 0) {
      riskScore += agentOps.length * 4;
      factors.push(`${agentOps.length} agent spawns`);
    }
  }
  if (operations?.state) {
    const modifyOps = operations.state.filter(
      (op) => op.type === "set" || op.type === "delete_state"
    );
    if (modifyOps.length > 0) {
      riskScore += modifyOps.length;
      factors.push(`${modifyOps.length} state modifications`);
    }
  }
  let level;
  if (riskScore >= 20) {
    level = "critical";
  } else if (riskScore >= 10) {
    level = "high";
  } else if (riskScore >= 5) {
    level = "medium";
  } else {
    level = "low";
  }
  return { level, factors };
}
function generatePreview(input) {
  const phases = [];
  const operations = input.operations;
  if (operations?.read && operations.read.length > 0) {
    phases.push({
      phase: "read",
      operations: operations.read.map((op) => ({
        id: op.id,
        type: op.type,
        description: describeOperation(op),
        targets: extractTargets(op),
        estimated_tokens: estimateOperationTokens(op)
      })),
      parallel_groups: [operations.read.map((op) => op.id)]
    });
  }
  if (operations?.write && operations.write.length > 0) {
    phases.push({
      phase: "write",
      operations: operations.write.map((op) => ({
        id: op.id,
        type: op.type,
        description: describeOperation(op),
        targets: extractTargets(op),
        estimated_tokens: estimateOperationTokens(op)
      })),
      parallel_groups: groupByDependencies(operations.write)
    });
  }
  if (operations?.exec && operations.exec.length > 0) {
    phases.push({
      phase: "exec",
      operations: operations.exec.map((op) => ({
        id: op.id,
        type: op.type,
        description: describeOperation(op),
        targets: extractTargets(op),
        estimated_tokens: estimateOperationTokens(op)
      })),
      parallel_groups: groupByDependencies(operations.exec)
    });
  }
  if (operations?.query && operations.query.length > 0) {
    phases.push({
      phase: "query",
      operations: operations.query.map((op) => ({
        id: op.id,
        type: op.type,
        description: describeOperation(op),
        targets: extractTargets(op),
        estimated_tokens: estimateOperationTokens(op)
      })),
      parallel_groups: [operations.query.map((op) => op.id)]
    });
  }
  if (operations?.state && operations.state.length > 0) {
    phases.push({
      phase: "state",
      operations: operations.state.map((op) => ({
        id: op.id,
        type: op.type,
        description: describeOperation(op),
        targets: extractTargets(op),
        estimated_tokens: estimateOperationTokens(op)
      })),
      parallel_groups: [operations.state.map((op) => op.id)]
    });
  }
  const totalOperations = countOperations(operations);
  const estimatedTokens = phases.reduce(
    (sum, p) => sum + p.operations.reduce((s, o) => s + o.estimated_tokens, 0),
    0
  );
  const risk = assessRiskLevel(operations);
  return {
    phases,
    total_operations: totalOperations,
    estimated_tokens: estimatedTokens,
    estimated_duration_ms: estimatedTokens * 10,
    // Rough estimate
    files_affected: collectAffectedFiles(operations),
    commands_to_run: collectCommands(operations),
    risk_level: risk.level,
    risk_factors: risk.factors
  };
}
function describeOperation(op) {
  switch (op.type) {
    case "files":
      return "Read files";
    case "search":
      return "Search content";
    case "glob":
      return "Find files by pattern";
    case "symbols":
      return "Get code symbols";
    case "create":
      return "Create new file";
    case "edit":
      return "Edit file";
    case "delete":
      return "Delete file";
    case "move":
      return "Move file";
    case "atomic":
      return "Atomic multi-file edit";
    case "command":
      return "Execute shell command";
    case "agent":
      return "Spawn background agent";
    case "script":
      return "Run script";
    case "lsp":
      return "LSP query";
    case "validate":
      return "Run validation";
    case "diagnose":
      return "Diagnose issue";
    case "get":
      return "Get state value";
    case "set":
      return "Set state value";
    case "delete_state":
      return "Delete state";
    case "list":
      return "List state keys";
    case "track":
      return "Track memory entry";
    case "query":
      return "Query memory";
    default:
      return `${op.type} operation`;
  }
}
function extractTargets(op) {
  const targets = [];
  const anyOp = op;
  if (anyOp.files && Array.isArray(anyOp.files)) {
    for (const f of anyOp.files) {
      if (typeof f === "string")
        targets.push(f);
      else if (f && typeof f === "object" && "path" in f)
        targets.push(f.path);
    }
  }
  if (anyOp.file && typeof anyOp.file === "string") {
    targets.push(anyOp.file);
  }
  if (anyOp.pattern && typeof anyOp.pattern === "string") {
    targets.push(anyOp.pattern);
  }
  if (anyOp.commands && Array.isArray(anyOp.commands)) {
    for (const cmd of anyOp.commands) {
      if (cmd && typeof cmd === "object" && "cmd" in cmd) {
        targets.push(cmd.cmd);
      }
    }
  }
  if (anyOp.keys && Array.isArray(anyOp.keys)) {
    targets.push(...anyOp.keys);
  }
  return targets;
}
function estimateOperationTokens(op) {
  let tokens = 100;
  const anyOp = op;
  switch (op.type) {
    case "files":
    case "search":
      tokens = 500;
      break;
    case "agent":
      tokens = 5e3;
      break;
    case "edit":
    case "atomic":
      tokens = 300;
      break;
    case "command":
      tokens = 200;
      break;
    default:
      tokens = 100;
  }
  if (anyOp.files && Array.isArray(anyOp.files)) {
    tokens *= Math.max(1, anyOp.files.length);
  }
  return tokens;
}
function groupByDependencies(operations) {
  const groups = [];
  const processed = /* @__PURE__ */ new Set();
  const dependencyMap = /* @__PURE__ */ new Map();
  for (const op of operations) {
    dependencyMap.set(op.id, new Set(op.depends_on || []));
  }
  while (processed.size < operations.length) {
    const currentGroup = [];
    for (const op of operations) {
      if (processed.has(op.id))
        continue;
      const deps = dependencyMap.get(op.id) || /* @__PURE__ */ new Set();
      const allDepsProcessed = Array.from(deps).every((d) => processed.has(d));
      if (allDepsProcessed) {
        currentGroup.push(op.id);
      }
    }
    if (currentGroup.length === 0) {
      const remaining = operations.filter((op) => !processed.has(op.id)).map((op) => op.id);
      groups.push(remaining);
      break;
    }
    groups.push(currentGroup);
    currentGroup.forEach((id) => processed.add(id));
  }
  return groups;
}
async function executePhase(phase, operations, context, runtime) {
  const startTime = Date.now();
  const results = [];
  let totalTokens = 0;
  const groups = groupByDependencies(operations);
  for (const group of groups) {
    const groupOps = operations.filter((op) => group.includes(op.id));
    const groupResults = await Promise.all(
      groupOps.map((op) => executeOperation(op, context, runtime))
    );
    results.push(...groupResults);
    totalTokens += groupResults.reduce((sum, r) => sum + r.tokens_used, 0);
    const config = context.batch.config;
    if (config.execution.fail_fast) {
      const failed2 = groupResults.find((r) => r.status === "failed");
      if (failed2) {
        break;
      }
    }
  }
  const duration_ms = Date.now() - startTime;
  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;
  let status;
  if (failed === 0) {
    status = "success";
  } else if (succeeded > 0) {
    status = "partial";
  } else {
    status = "failed";
  }
  return {
    status,
    results,
    duration_ms,
    tokens_used: totalTokens
  };
}
async function executeOperation(operation, context, runtime) {
  const startTime = Date.now();
  try {
    runtime.telemetry.recordOperationStart(operation);
    if (operation.skip_if) {
      for (const condition of operation.skip_if) {
        if (evaluateCondition(condition.expression, context)) {
          return {
            id: operation.id,
            type: operation.type,
            status: "skipped",
            data: { reason: `Skip condition met: ${condition.expression}` },
            duration_ms: Date.now() - startTime,
            tokens_used: 0
          };
        }
      }
    }
    if (operation.when) {
      for (const condition of operation.when) {
        if (!evaluateCondition(condition.expression, context)) {
          return {
            id: operation.id,
            type: operation.type,
            status: "skipped",
            data: { reason: `When condition not met: ${condition.expression}` },
            duration_ms: Date.now() - startTime,
            tokens_used: 0
          };
        }
      }
    }
    const data = await executeOperationByType(operation, context, runtime);
    const duration_ms = Date.now() - startTime;
    const tokens_used = estimateTokens(JSON.stringify(data));
    const result = {
      id: operation.id,
      type: operation.type,
      status: "success",
      data,
      duration_ms,
      tokens_used
    };
    if (operation.expect) {
      for (const expectation of operation.expect) {
        if (!evaluateExpectation(expectation.expression, data, context)) {
          result.status = "failed";
          result.error = {
            code: "EXPECTATION_FAILED",
            message: expectation.message || `Expectation failed: ${expectation.expression}`
          };
          break;
        }
      }
    }
    runtime.telemetry.recordOperationComplete(operation.id, result);
    return result;
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const result = {
      id: operation.id,
      type: operation.type,
      status: "failed",
      data: null,
      error: {
        code: "EXECUTION_ERROR",
        message: errorMessage,
        stack: error instanceof Error ? error.stack : void 0
      },
      duration_ms,
      tokens_used: 0
    };
    runtime.telemetry.recordOperationComplete(operation.id, result);
    return result;
  }
}
async function executeOperationByType(operation, context, runtime) {
  switch (operation.type) {
    case "files":
      return { files_read: 0, total_lines: 0 };
    case "search":
      return { matches: [], total: 0 };
    case "glob":
      return { files: [], total: 0 };
    case "symbols":
      return { symbols: [] };
    case "create":
      return { created: true };
    case "edit":
      return { edited: true };
    case "delete":
      return { deleted: true };
    case "move":
      return { moved: true };
    case "atomic":
      return { edits_applied: 0 };
    case "command":
      return { exit_code: 0, stdout: "", stderr: "" };
    case "agent":
      return { agent_id: "", status: "spawned" };
    case "script":
      return { exit_code: 0, output: "" };
    case "lsp":
      return { results: [] };
    case "validate":
      return { valid: true, errors: [] };
    case "diagnose":
      return { diagnosis: "", suggestions: [] };
    case "get":
      return { values: {} };
    case "set":
      return { set: true };
    case "delete_state":
      return { deleted: true };
    case "list":
      return { keys: [] };
    case "track":
      return { tracked: true };
    case "query":
      return { results: [] };
    default:
      return {};
  }
}
function evaluateCondition(expression, context) {
  if (expression === "true")
    return true;
  if (expression === "false")
    return false;
  const resultMatch = expression.match(/result\.(\w+)\.(\w+)\s*==\s*'(\w+)'/);
  if (resultMatch) {
    const [, opId, field, expectedValue] = resultMatch;
    const result = context.phase_results[context.current_phase];
    if (result && typeof result === "object" && opId in result) {
      const opResult = result[opId];
      return opResult[field] === expectedValue;
    }
  }
  return true;
}
function evaluateExpectation(expression, data, context) {
  if (expression === "true")
    return true;
  if (expression === "false")
    return false;
  if (expression.startsWith("data.") && data && typeof data === "object") {
    const match = expression.match(/data\.(\w+)\s*==\s*'(\w+)'/);
    if (match) {
      const [, field, expectedValue] = match;
      return data[field] === expectedValue;
    }
  }
  return true;
}
async function runValidation(checks, runtime) {
  const errors = [];
  for (const check of checks) {
  }
  return {
    check: checks.join(","),
    passed: errors.length === 0,
    errors: errors.length > 0 ? errors : void 0
  };
}
var handleBatch = async (args) => {
  const getElapsed = startTimer();
  const outputMode = parseOutputMode(args);
  const input = args;
  try {
    if (!input.operations && !input.discovery) {
      return toCallToolResult(errorResult(
        "Either operations or discovery must be provided",
        outputMode,
        getElapsed()
      ));
    }
    const batchId = generateBatchId();
    if (input.dry_run || input.preview) {
      const preview = generatePreview(input);
      const output2 = {
        batch_id: batchId,
        status: "dry_run",
        preview,
        duration_ms: getElapsed(),
        tokens_used: estimateTokens(JSON.stringify(preview))
      };
      return toCallToolResult(successResult(output2, outputMode, getElapsed()));
    }
    const runtime = createRuntimeContext();
    await initializeRuntime(runtime);
    const config = {
      ...DEFAULT_BATCH_CONFIG,
      ...input.config || {}
    };
    const batch = {
      id: batchId,
      operations: input.operations || {},
      config,
      lifecycle: {},
      output: {
        mode: outputMode,
        include: [],
        exclude: []
      }
    };
    const context = {
      batch,
      current_phase: "read",
      completed_phases: [],
      phase_results: {},
      start_time: (/* @__PURE__ */ new Date()).toISOString()
    };
    activeBatches.set(batchId, context);
    runtime.telemetry.recordBatchStart(batch);
    let checkpointId;
    if (config.recovery.checkpoint) {
      const checkpoint = runtime.state.createCheckpoint(batchId, "batch_start");
      checkpointId = checkpoint.id;
      context.checkpoint_id = checkpointId;
    }
    const beforeValidation = await runValidation(config.validation.before, runtime);
    if (!beforeValidation.passed && config.validation.on_fail === "rollback") {
      const output2 = {
        batch_id: batchId,
        status: "failed",
        errors: [{
          phase: "read",
          code: "VALIDATION_FAILED",
          message: `Before validation failed: ${beforeValidation.errors?.join(", ")}`,
          recoverable: true
        }],
        duration_ms: getElapsed(),
        tokens_used: 0
      };
      activeBatches.delete(batchId);
      completedBatches.set(batchId, output2);
      return toCallToolResult(successResult(output2, outputMode, getElapsed()));
    }
    const phaseResults = {};
    let totalOperations = 0;
    let succeededOperations = 0;
    let failedOperations = 0;
    let skippedOperations = 0;
    let totalTokens = 0;
    const errors = [];
    let rollbackTriggered = false;
    const operations = input.operations || {};
    for (const phase of PHASE_ORDER) {
      const phaseOps = getPhaseOperations(phase, operations);
      if (phaseOps.length === 0)
        continue;
      context.current_phase = phase;
      const phaseResult = await executePhase(phase, phaseOps, context, runtime);
      phaseResults[phase] = phaseResult;
      context.phase_results[phase] = phaseResult;
      context.completed_phases.push(phase);
      totalOperations += phaseResult.results.length;
      succeededOperations += phaseResult.results.filter((r) => r.status === "success").length;
      failedOperations += phaseResult.results.filter((r) => r.status === "failed").length;
      skippedOperations += phaseResult.results.filter((r) => r.status === "skipped").length;
      totalTokens += phaseResult.tokens_used;
      for (const result of phaseResult.results) {
        if (result.status === "failed" && result.error) {
          errors.push({
            phase,
            operation_id: result.id,
            code: result.error.code,
            message: result.error.message,
            recoverable: true
          });
        }
      }
      if (phaseResult.status === "failed" && config.execution.fail_fast) {
        break;
      }
    }
    const afterValidation = await runValidation(config.validation.after, runtime);
    let status;
    if (failedOperations === 0 && afterValidation.passed) {
      status = "success";
    } else if (succeededOperations > 0) {
      status = "partial";
      if (config.recovery.rollback_on_fail && checkpointId) {
        try {
          runtime.state.restoreCheckpoint(checkpointId);
          status = "rolled_back";
          rollbackTriggered = true;
        } catch {
        }
      }
    } else {
      status = "failed";
      if (config.recovery.rollback_on_fail && checkpointId) {
        try {
          runtime.state.restoreCheckpoint(checkpointId);
          status = "rolled_back";
          rollbackTriggered = true;
        } catch {
        }
      }
    }
    const executionGraph = {
      phases: context.completed_phases,
      parallel_groups: PHASE_ORDER.map((phase) => {
        const ops = getPhaseOperations(phase, operations);
        return ops.length > 0 ? groupByDependencies(ops) : [];
      }).flat(),
      critical_path_ms: getElapsed()
    };
    const batchResult = {
      summary: {
        status,
        operations_total: totalOperations,
        operations_succeeded: succeededOperations,
        operations_failed: failedOperations,
        operations_skipped: skippedOperations,
        duration_ms: getElapsed(),
        tokens_used: totalTokens
      },
      phases: phaseResults,
      validation: {
        before: beforeValidation,
        after: afterValidation
      },
      recovery: {
        checkpoint_id: checkpointId,
        rollback_available: !!checkpointId,
        rollback_triggered: rollbackTriggered
      },
      execution_graph: executionGraph
    };
    runtime.telemetry.recordBatchComplete(batchId, batchResult);
    await persistRuntime(runtime);
    if (status === "success" && config.recovery.cleanup_on_success) {
      runtime.state.cleanupCheckpoints();
    }
    const output = {
      batch_id: batchId,
      status,
      result: batchResult,
      errors: errors.length > 0 ? errors : void 0,
      duration_ms: getElapsed(),
      tokens_used: totalTokens
    };
    activeBatches.delete(batchId);
    completedBatches.set(batchId, output);
    let responseData;
    switch (outputMode) {
      case "count_only":
        responseData = {
          batch_id: batchId,
          status,
          operations_total: totalOperations,
          operations_succeeded: succeededOperations,
          operations_failed: failedOperations
        };
        break;
      case "minimal":
        responseData = {
          batch_id: batchId,
          status,
          summary: batchResult.summary,
          errors: errors.length > 0 ? errors.map((e) => e.message) : void 0
        };
        break;
      case "verbose":
        responseData = output;
        break;
      default:
        responseData = {
          batch_id: batchId,
          status,
          summary: batchResult.summary,
          validation: batchResult.validation,
          recovery: batchResult.recovery,
          errors: errors.length > 0 ? errors : void 0
        };
    }
    return toCallToolResult(successResult(responseData, outputMode, getElapsed()));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorResult(errorMessage, outputMode, getElapsed()));
  }
};
function getPhaseOperations(phase, operations) {
  if (!operations)
    return [];
  switch (phase) {
    case "read":
      return operations.read || [];
    case "write":
      return operations.write || [];
    case "exec":
      return operations.exec || [];
    case "query":
      return operations.query || [];
    case "state":
      return operations.state || [];
    default:
      return [];
  }
}
function getActiveBatch(batchId) {
  return activeBatches.get(batchId);
}
function getCompletedBatch(batchId) {
  return completedBatches.get(batchId);
}
function listActiveBatches() {
  return Array.from(activeBatches.keys());
}
function listCompletedBatches() {
  return Array.from(completedBatches.keys());
}

// src/handlers/batch-status.ts
function startTimer2() {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}
function estimateTokens2(text) {
  return Math.ceil(text.length / 4);
}
function parseOutputMode2(args) {
  if (typeof args === "object" && args !== null) {
    const obj = args;
    if (obj.output_mode && typeof obj.output_mode === "string") {
      if (["count_only", "minimal", "standard", "verbose"].includes(obj.output_mode)) {
        return obj.output_mode;
      }
    }
  }
  return "standard";
}
function successResult2(data, outputMode, executionMs) {
  return {
    success: true,
    data,
    meta: {
      output_mode: outputMode,
      token_estimate: estimateTokens2(JSON.stringify(data)),
      execution_ms: executionMs
    }
  };
}
function errorResult2(error, outputMode, executionMs) {
  return {
    success: false,
    error,
    meta: {
      output_mode: outputMode,
      token_estimate: estimateTokens2(error),
      execution_ms: executionMs
    }
  };
}
function toCallToolResult2(result) {
  const content = {
    type: "text",
    text: JSON.stringify(result, null, 2)
  };
  return {
    content: [content],
    isError: !result.success
  };
}
var PHASE_LIST = ["discovery", "read", "write", "exec", "query", "state"];
function mapToBatchStatus(status) {
  switch (status) {
    case "success":
      return "completed";
    case "partial":
      return "completed";
    case "failed":
      return "failed";
    case "rolled_back":
      return "rolled_back";
    case "dry_run":
      return "completed";
    default:
      return "running";
  }
}
function calculateProgress(context) {
  const completedPhases = context.completed_phases || [];
  const currentPhase = context.current_phase || "read";
  const pendingPhases = PHASE_LIST.filter(
    (p) => !completedPhases.includes(p) && p !== currentPhase
  );
  const batch = context.batch;
  const operations = batch.operations || {};
  const totalOps = (operations.read?.length || 0) + (operations.write?.length || 0) + (operations.exec?.length || 0) + (operations.query?.length || 0) + (operations.state?.length || 0);
  let completedOps = 0;
  for (const phase of completedPhases) {
    const phaseOps = getPhaseOperationCount(phase, operations);
    completedOps += phaseOps;
  }
  const percentComplete = totalOps > 0 ? Math.round(completedOps / totalOps * 100) : 0;
  const elapsed = Date.now() - new Date(context.start_time).getTime();
  const estimatedRemaining = percentComplete > 0 ? Math.round(elapsed / percentComplete * (100 - percentComplete)) : void 0;
  return {
    current_phase: currentPhase,
    completed_phases: completedPhases,
    pending_phases: pendingPhases,
    operations_total: totalOps,
    operations_completed: completedOps,
    operations_failed: 0,
    // Updated as phase results come in
    operations_pending: totalOps - completedOps,
    percent_complete: percentComplete,
    estimated_remaining_ms: estimatedRemaining
  };
}
function getPhaseOperationCount(phase, operations) {
  switch (phase) {
    case "read":
      return operations.read?.length || 0;
    case "write":
      return operations.write?.length || 0;
    case "exec":
      return operations.exec?.length || 0;
    case "query":
      return operations.query?.length || 0;
    case "state":
      return operations.state?.length || 0;
    default:
      return 0;
  }
}
function buildOperationStatuses(context) {
  const statuses = [];
  const phaseResults = context.phase_results || {};
  for (const [phase, result] of Object.entries(phaseResults)) {
    if (result && typeof result === "object" && "results" in result) {
      const phaseResult = result;
      for (const opResult of phaseResult.results) {
        statuses.push({
          id: opResult.id,
          type: opResult.type,
          phase,
          status: opResult.status,
          duration_ms: opResult.duration_ms,
          tokens_used: opResult.tokens_used,
          error: opResult.error?.message
        });
      }
    }
  }
  return statuses;
}
async function buildAgentStatuses() {
  const statuses = [];
  const runtime = createRuntimeContext();
  await initializeRuntime(runtime);
  const activeAgents = runtime.state.getActiveAgents();
  for (const agent of activeAgents) {
    statuses.push({
      agent_id: agent.id,
      operation_id: agent.operation_id,
      agent_type: agent.agent_type,
      status: "running",
      tokens_used: agent.budget.tokens_used,
      turns_used: agent.budget.turns_used,
      started_at: agent.started_at
    });
  }
  return statuses;
}
var handleBatchStatus = async (args) => {
  const getElapsed = startTimer2();
  const outputMode = parseOutputMode2(args);
  const input = args;
  try {
    const batchId = input.batch_id;
    if (!batchId) {
      return toCallToolResult2(errorResult2(
        "batch_id is required",
        outputMode,
        getElapsed()
      ));
    }
    const activeContext = getActiveBatch(batchId);
    if (activeContext) {
      const progress = calculateProgress(activeContext);
      const elapsed = Date.now() - new Date(activeContext.start_time).getTime();
      const output = {
        batch_id: batchId,
        status: "running",
        progress,
        duration_ms: elapsed,
        tokens_used: 0
      };
      if (input.include?.operations) {
        output.operations = buildOperationStatuses(activeContext);
      }
      if (input.include?.agents) {
        output.agents = await buildAgentStatuses();
      }
      let responseData;
      switch (outputMode) {
        case "count_only":
          responseData = {
            batch_id: batchId,
            status: "running",
            percent_complete: progress.percent_complete
          };
          break;
        case "minimal":
          responseData = {
            batch_id: batchId,
            status: "running",
            progress: {
              current_phase: progress.current_phase,
              percent_complete: progress.percent_complete
            }
          };
          break;
        case "verbose":
          responseData = output;
          break;
        default:
          responseData = {
            batch_id: batchId,
            status: "running",
            progress,
            duration_ms: elapsed
          };
      }
      return toCallToolResult2(successResult2(responseData, outputMode, getElapsed()));
    }
    const completedOutput = getCompletedBatch(batchId);
    if (completedOutput) {
      const status = mapToBatchStatus(completedOutput.status);
      const output = {
        batch_id: batchId,
        status,
        progress: {
          current_phase: "state",
          // Last phase
          completed_phases: PHASE_LIST,
          pending_phases: [],
          operations_total: completedOutput.result?.summary.operations_total || 0,
          operations_completed: completedOutput.result?.summary.operations_succeeded || 0,
          operations_failed: completedOutput.result?.summary.operations_failed || 0,
          operations_pending: 0,
          percent_complete: 100
        },
        duration_ms: completedOutput.duration_ms,
        tokens_used: completedOutput.tokens_used
      };
      if (input.include?.results && completedOutput.result) {
        output.results = completedOutput.result;
      }
      if (input.include?.telemetry) {
        const runtime = createRuntimeContext();
        await initializeRuntime(runtime);
        try {
          output.telemetry = runtime.telemetry.getBatchMetrics(batchId);
        } catch {
        }
      }
      let responseData;
      switch (outputMode) {
        case "count_only":
          responseData = {
            batch_id: batchId,
            status,
            operations_total: output.progress.operations_total,
            operations_succeeded: output.progress.operations_completed,
            operations_failed: output.progress.operations_failed
          };
          break;
        case "minimal":
          responseData = {
            batch_id: batchId,
            status,
            duration_ms: completedOutput.duration_ms,
            tokens_used: completedOutput.tokens_used
          };
          break;
        case "verbose":
          responseData = output;
          break;
        default:
          responseData = {
            batch_id: batchId,
            status,
            progress: output.progress,
            duration_ms: completedOutput.duration_ms,
            tokens_used: completedOutput.tokens_used
          };
      }
      return toCallToolResult2(successResult2(responseData, outputMode, getElapsed()));
    }
    return toCallToolResult2(errorResult2(
      `Batch not found: ${batchId}`,
      outputMode,
      getElapsed()
    ));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return toCallToolResult2(errorResult2(errorMessage, outputMode, getElapsed()));
  }
};
var handleListBatches = async (args) => {
  const getElapsed = startTimer2();
  const outputMode = parseOutputMode2(args);
  const input = args || {};
  try {
    const entries = [];
    const activeIds = listActiveBatches();
    for (const batchId of activeIds) {
      const context = getActiveBatch(batchId);
      if (context) {
        const elapsed = Date.now() - new Date(context.start_time).getTime();
        const operations = context.batch.operations || {};
        const opsCount = (operations.read?.length || 0) + (operations.write?.length || 0) + (operations.exec?.length || 0) + (operations.query?.length || 0) + (operations.state?.length || 0);
        entries.push({
          batch_id: batchId,
          started_at: context.start_time,
          status: "running",
          operations_count: opsCount,
          tokens_used: 0,
          duration_ms: elapsed
        });
      }
    }
    const completedIds = listCompletedBatches();
    for (const batchId of completedIds) {
      const output2 = getCompletedBatch(batchId);
      if (output2) {
        entries.push({
          batch_id: batchId,
          started_at: "",
          // Not stored in output
          completed_at: "",
          // Not stored in output
          status: mapToBatchStatus(output2.status),
          operations_count: output2.result?.summary.operations_total || 0,
          tokens_used: output2.tokens_used,
          duration_ms: output2.duration_ms
        });
      }
    }
    let filtered = entries;
    if (input.status && input.status.length > 0) {
      filtered = filtered.filter((e) => input.status.includes(e.status));
    }
    if (input.since) {
      const sinceDate = new Date(input.since);
      filtered = filtered.filter((e) => {
        if (!e.started_at)
          return true;
        return new Date(e.started_at) >= sinceDate;
      });
    }
    if (input.until) {
      const untilDate = new Date(input.until);
      filtered = filtered.filter((e) => {
        if (!e.started_at)
          return true;
        return new Date(e.started_at) <= untilDate;
      });
    }
    const limit = input.limit || 50;
    const hasMore = filtered.length > limit;
    const batches = filtered.slice(0, limit);
    const output = {
      batches,
      total: filtered.length,
      has_more: hasMore
    };
    let responseData;
    switch (outputMode) {
      case "count_only":
        responseData = {
          total: output.total,
          running: entries.filter((e) => e.status === "running").length,
          completed: entries.filter((e) => e.status === "completed").length,
          failed: entries.filter((e) => e.status === "failed").length
        };
        break;
      case "minimal":
        responseData = {
          batches: batches.map((b) => ({
            batch_id: b.batch_id,
            status: b.status
          })),
          total: output.total
        };
        break;
      case "verbose":
        responseData = output;
        break;
      default:
        responseData = {
          batches: batches.map((b) => ({
            batch_id: b.batch_id,
            status: b.status,
            operations_count: b.operations_count,
            duration_ms: b.duration_ms
          })),
          total: output.total,
          has_more: output.has_more
        };
    }
    return toCallToolResult2(successResult2(responseData, outputMode, getElapsed()));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return toCallToolResult2(errorResult2(errorMessage, outputMode, getElapsed()));
  }
};

// src/handlers/batch-recover.ts
var fs4 = __toESM(require("fs/promises"), 1);
var path4 = __toESM(require("path"), 1);
function startTimer3() {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}
function estimateTokens3(text) {
  return Math.ceil(text.length / 4);
}
function parseOutputMode3(args) {
  if (typeof args === "object" && args !== null) {
    const obj = args;
    if (obj.output_mode && typeof obj.output_mode === "string") {
      if (["count_only", "minimal", "standard", "verbose"].includes(obj.output_mode)) {
        return obj.output_mode;
      }
    }
  }
  return "standard";
}
function successResult3(data, outputMode, executionMs) {
  return {
    success: true,
    data,
    meta: {
      output_mode: outputMode,
      token_estimate: estimateTokens3(JSON.stringify(data)),
      execution_ms: executionMs
    }
  };
}
function errorResult3(error, outputMode, executionMs) {
  return {
    success: false,
    error,
    meta: {
      output_mode: outputMode,
      token_estimate: estimateTokens3(error),
      execution_ms: executionMs
    }
  };
}
function toCallToolResult3(result) {
  const content = {
    type: "text",
    text: JSON.stringify(result, null, 2)
  };
  return {
    content: [content],
    isError: !result.success
  };
}
function getProjectRoot() {
  return process.env.PROJECT_ROOT || process.cwd();
}
async function executeRollback(options, runtime) {
  const startTime = Date.now();
  const filesRestored = [];
  const filesFailed = [];
  const stateRestored = [];
  const stateFailed = [];
  const errors = [];
  try {
    let checkpointId = options.checkpoint_id;
    if (!checkpointId && options.batch_id) {
      const state = runtime.state.getState();
      const checkpoint = state.checkpoints.checkpoints.find(
        (cp) => cp.batch_id === options.batch_id
      );
      if (checkpoint) {
        checkpointId = checkpoint.id;
      }
    }
    if (!checkpointId) {
      const state = runtime.state.getState();
      const checkpoints = state.checkpoints.checkpoints;
      if (checkpoints.length > 0) {
        checkpointId = checkpoints[checkpoints.length - 1].id;
      }
    }
    if (!checkpointId) {
      return {
        success: false,
        scope: options.scope || "all",
        target: { type: "checkpoint", checkpoint_id: "" },
        files_restored: [],
        files_failed: [],
        state_restored: [],
        state_failed: [],
        duration_ms: Date.now() - startTime,
        errors: ["No checkpoint available for rollback"]
      };
    }
    runtime.state.restoreCheckpoint(checkpointId);
    stateRestored.push("session");
    if (options.files && options.files.length > 0) {
      const projectRoot = getProjectRoot();
      const checkpointPaths = getCheckpointPath(checkpointId);
      for (const file of options.files) {
        const backupPath = path4.join(projectRoot, checkpointPaths.files, file);
        const targetPath = path4.join(projectRoot, file);
        try {
          const backupContent = await fs4.readFile(backupPath, "utf-8");
          await fs4.writeFile(targetPath, backupContent, "utf-8");
          filesRestored.push(file);
        } catch {
          filesFailed.push(file);
          errors.push(`Failed to restore file: ${file}`);
        }
      }
    }
    return {
      success: errors.length === 0,
      scope: options.scope || "all",
      target: { type: "checkpoint", checkpoint_id: checkpointId },
      files_restored: filesRestored,
      files_failed: filesFailed,
      state_restored: stateRestored,
      state_failed: stateFailed,
      duration_ms: Date.now() - startTime,
      checkpoint_used: checkpointId,
      errors: errors.length > 0 ? errors : void 0
    };
  } catch (error) {
    return {
      success: false,
      scope: options.scope || "all",
      target: { type: "checkpoint", checkpoint_id: "" },
      files_restored: filesRestored,
      files_failed: filesFailed,
      state_restored: stateRestored,
      state_failed: stateFailed,
      duration_ms: Date.now() - startTime,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}
async function executeRestore(options, runtime) {
  const filesRestored = [];
  const filesFailed = [];
  const stateRestored = [];
  const stateFailed = [];
  try {
    const checkpointId = options.checkpoint_id;
    if (!options.files_only) {
      try {
        runtime.state.restoreCheckpoint(checkpointId);
        stateRestored.push("session");
      } catch {
        stateFailed.push("session");
      }
    }
    if (!options.state_only) {
      const projectRoot = getProjectRoot();
      const checkpointPaths = getCheckpointPath(checkpointId);
      const filesDir = path4.join(projectRoot, checkpointPaths.files);
      try {
        const files = await fs4.readdir(filesDir);
        for (const file of files) {
          const backupPath = path4.join(filesDir, file);
          const targetPath = path4.join(projectRoot, file);
          try {
            const stats = await fs4.stat(backupPath);
            if (stats.isFile()) {
              const content = await fs4.readFile(backupPath, "utf-8");
              await fs4.writeFile(targetPath, content, "utf-8");
              filesRestored.push(file);
            }
          } catch {
            filesFailed.push(file);
          }
        }
      } catch {
      }
    }
    return {
      checkpoint_id: checkpointId,
      files_restored: filesRestored,
      state_restored: stateRestored,
      files_failed: filesFailed,
      state_failed: stateFailed
    };
  } catch (error) {
    return {
      checkpoint_id: options.checkpoint_id,
      files_restored: filesRestored,
      state_restored: stateRestored,
      files_failed: filesFailed,
      state_failed: stateFailed
    };
  }
}
async function executeRetry(options, runtime) {
  return {
    batch_id: options.batch_id,
    operations_retried: 0,
    operations_succeeded: 0,
    operations_failed: 0,
    new_batch_id: void 0
  };
}
async function executeCleanup(options, runtime) {
  const errors = [];
  let checkpointsRemoved = 0;
  let bytesFreed = 0;
  try {
    const state = runtime.state.getState();
    const checkpoints = state.checkpoints.checkpoints;
    const keepLast = options.keep_last || 5;
    const olderThanHours = options.older_than_hours || 24;
    const olderThanMs = olderThanHours * 60 * 60 * 1e3;
    const now = Date.now();
    const sortedCheckpoints = [...checkpoints].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const toKeep = sortedCheckpoints.slice(0, keepLast);
    const candidates = sortedCheckpoints.slice(keepLast);
    const toRemove = candidates.filter((cp) => {
      const age = now - new Date(cp.created_at).getTime();
      return age > olderThanMs;
    });
    if (options.dry_run) {
      return {
        checkpoints_removed: toRemove.length,
        bytes_freed: 0,
        checkpoints_remaining: checkpoints.length - toRemove.length,
        items_skipped: candidates.length - toRemove.length
      };
    }
    const projectRoot = getProjectRoot();
    for (const cp of toRemove) {
      try {
        const checkpointPaths = getCheckpointPath(cp.id);
        const checkpointDir = path4.join(projectRoot, checkpointPaths.manifest).replace("/manifest.json", "");
        try {
          const stats = await fs4.stat(checkpointDir);
          bytesFreed += 1024;
        } catch {
        }
        await fs4.rm(checkpointDir, { recursive: true, force: true });
        checkpointsRemoved++;
      } catch (error) {
        errors.push(`Failed to remove checkpoint ${cp.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const removedIds = new Set(toRemove.map((cp) => cp.id));
    state.checkpoints.checkpoints = checkpoints.filter((cp) => !removedIds.has(cp.id));
    return {
      checkpoints_removed: checkpointsRemoved,
      bytes_freed: bytesFreed,
      checkpoints_remaining: state.checkpoints.checkpoints.length,
      items_skipped: candidates.length - toRemove.length,
      errors: errors.length > 0 ? errors : void 0
    };
  } catch (error) {
    return {
      checkpoints_removed: checkpointsRemoved,
      bytes_freed: bytesFreed,
      checkpoints_remaining: 0,
      items_skipped: 0,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}
async function executeFix(options, runtime) {
  return {
    success: false,
    attempts: 0,
    final_strategy: "auto_fix",
    actions_taken: [],
    remaining_errors: [],
    total_tokens_used: 0,
    duration_ms: 0
  };
}
var handleBatchRecover = async (args) => {
  const getElapsed = startTimer3();
  const outputMode = parseOutputMode3(args);
  const input = args;
  try {
    if (!input.operation) {
      return toCallToolResult3(errorResult3(
        "operation is required",
        outputMode,
        getElapsed()
      ));
    }
    const validOperations = ["rollback", "restore", "retry", "cleanup", "fix"];
    if (!validOperations.includes(input.operation)) {
      return toCallToolResult3(errorResult3(
        `Invalid operation: ${input.operation}. Must be one of: ${validOperations.join(", ")}`,
        outputMode,
        getElapsed()
      ));
    }
    const runtime = createRuntimeContext();
    await initializeRuntime(runtime);
    let output;
    switch (input.operation) {
      case "rollback": {
        const rollbackResult = await executeRollback(
          input.rollback || {},
          runtime
        );
        output = {
          operation: "rollback",
          success: rollbackResult.success,
          rollback_result: rollbackResult,
          duration_ms: getElapsed()
        };
        break;
      }
      case "restore": {
        if (!input.restore?.checkpoint_id) {
          return toCallToolResult3(errorResult3(
            "restore.checkpoint_id is required for restore operation",
            outputMode,
            getElapsed()
          ));
        }
        const restoreResult = await executeRestore(input.restore, runtime);
        output = {
          operation: "restore",
          success: restoreResult.files_failed.length === 0 && restoreResult.state_failed.length === 0,
          restore_result: restoreResult,
          duration_ms: getElapsed()
        };
        break;
      }
      case "retry": {
        if (!input.retry?.batch_id) {
          return toCallToolResult3(errorResult3(
            "retry.batch_id is required for retry operation",
            outputMode,
            getElapsed()
          ));
        }
        const retryResult = await executeRetry(input.retry, runtime);
        output = {
          operation: "retry",
          success: retryResult.operations_failed === 0,
          retry_result: retryResult,
          duration_ms: getElapsed()
        };
        break;
      }
      case "cleanup": {
        const cleanupResult = await executeCleanup(
          input.cleanup || {},
          runtime
        );
        output = {
          operation: "cleanup",
          success: !cleanupResult.errors || cleanupResult.errors.length === 0,
          cleanup_result: cleanupResult,
          duration_ms: getElapsed()
        };
        break;
      }
      case "fix": {
        if (!input.fix?.batch_id) {
          return toCallToolResult3(errorResult3(
            "fix.batch_id is required for fix operation",
            outputMode,
            getElapsed()
          ));
        }
        const fixResult = await executeFix(input.fix, runtime);
        output = {
          operation: "fix",
          success: fixResult.success,
          fix_result: fixResult,
          duration_ms: getElapsed()
        };
        break;
      }
      default:
        return toCallToolResult3(errorResult3(
          `Unknown operation: ${input.operation}`,
          outputMode,
          getElapsed()
        ));
    }
    await persistRuntime(runtime);
    let responseData;
    switch (outputMode) {
      case "count_only":
        responseData = {
          operation: output.operation,
          success: output.success
        };
        break;
      case "minimal":
        responseData = {
          operation: output.operation,
          success: output.success,
          duration_ms: output.duration_ms
        };
        break;
      case "verbose":
        responseData = output;
        break;
      default:
        responseData = {
          operation: output.operation,
          success: output.success,
          duration_ms: output.duration_ms,
          ...output.rollback_result && {
            files_restored: output.rollback_result.files_restored.length,
            state_restored: output.rollback_result.state_restored.length
          },
          ...output.restore_result && {
            files_restored: output.restore_result.files_restored.length,
            state_restored: output.restore_result.state_restored.length
          },
          ...output.cleanup_result && {
            checkpoints_removed: output.cleanup_result.checkpoints_removed,
            bytes_freed: output.cleanup_result.bytes_freed
          },
          ...output.error && { error: output.error }
        };
    }
    return toCallToolResult3(successResult3(responseData, outputMode, getElapsed()));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return toCallToolResult3(errorResult3(errorMessage, outputMode, getElapsed()));
  }
};
var handleListCheckpoints = async (args) => {
  const getElapsed = startTimer3();
  const outputMode = parseOutputMode3(args);
  const input = args || {};
  try {
    const runtime = createRuntimeContext();
    await initializeRuntime(runtime);
    const state = runtime.state.getState();
    let checkpoints = state.checkpoints.checkpoints;
    if (input.batch_id) {
      checkpoints = checkpoints.filter((cp) => cp.batch_id === input.batch_id);
    }
    if (!input.include_expired) {
      const now = Date.now();
      checkpoints = checkpoints.filter((cp) => {
        if (!cp.expires_at)
          return true;
        return new Date(cp.expires_at).getTime() > now;
      });
    }
    checkpoints = checkpoints.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const limit = input.limit || 50;
    const total = checkpoints.length;
    checkpoints = checkpoints.slice(0, limit);
    const summaries = checkpoints.map((cp) => ({
      id: cp.id,
      batch_id: cp.batch_id,
      created_at: cp.created_at,
      expires_at: cp.expires_at,
      size_bytes: 0,
      // Would need to calculate
      file_count: cp.files.length,
      reason: cp.reason
    }));
    const output = {
      checkpoints: summaries,
      total
    };
    let responseData;
    switch (outputMode) {
      case "count_only":
        responseData = { total };
        break;
      case "minimal":
        responseData = {
          checkpoints: summaries.map((cp) => ({
            id: cp.id,
            created_at: cp.created_at
          })),
          total
        };
        break;
      case "verbose":
        responseData = output;
        break;
      default:
        responseData = {
          checkpoints: summaries.map((cp) => ({
            id: cp.id,
            batch_id: cp.batch_id,
            created_at: cp.created_at,
            file_count: cp.file_count,
            reason: cp.reason
          })),
          total
        };
    }
    return toCallToolResult3(successResult3(responseData, outputMode, getElapsed()));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return toCallToolResult3(errorResult3(errorMessage, outputMode, getElapsed()));
  }
};

// src/handlers/batch-state.ts
function startTimer4() {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}
function estimateTokens4(text) {
  return Math.ceil(text.length / 4);
}
function parseOutputMode4(args) {
  if (typeof args === "object" && args !== null) {
    const obj = args;
    if (obj.output_mode && typeof obj.output_mode === "string") {
      if (["count_only", "minimal", "standard", "verbose"].includes(obj.output_mode)) {
        return obj.output_mode;
      }
    }
  }
  return "standard";
}
function successResult4(data, outputMode, executionMs) {
  return {
    success: true,
    data,
    meta: {
      output_mode: outputMode,
      token_estimate: estimateTokens4(JSON.stringify(data)),
      execution_ms: executionMs
    }
  };
}
function errorResult4(error, outputMode, executionMs) {
  return {
    success: false,
    error,
    meta: {
      output_mode: outputMode,
      token_estimate: estimateTokens4(error),
      execution_ms: executionMs
    }
  };
}
function toCallToolResult4(result) {
  const content = {
    type: "text",
    text: JSON.stringify(result, null, 2)
  };
  return {
    content: [content],
    isError: !result.success
  };
}
function getByPath(obj, path5) {
  const parts = path5.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === void 0) {
      return void 0;
    }
    if (typeof current !== "object") {
      return void 0;
    }
    current = current[part];
  }
  return current;
}
function setByPath(obj, path5, value) {
  const parts = path5.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}
async function executeGet(options, runtime) {
  const state = runtime.state.getState();
  const memory = runtime.memory.getMemory();
  const values = {};
  for (const key of options.keys) {
    if (key.startsWith("session.") || key === "session") {
      values[key] = getByPath(state, key);
    } else if (key.startsWith("agents.") || key === "agents") {
      values[key] = getByPath(state, key);
    } else if (key.startsWith("checkpoints.") || key === "checkpoints") {
      values[key] = getByPath(state, key);
    } else if (key.startsWith("locks.") || key === "locks") {
      values[key] = getByPath(state, key);
    } else if (key.startsWith("memory.") || key === "memory") {
      values[key] = getByPath({ memory }, key);
    } else {
      const stateValue = getByPath(state, key);
      if (stateValue !== void 0) {
        values[key] = stateValue;
      } else {
        values[key] = runtime.memory.getPreference(key);
      }
    }
  }
  return values;
}
async function executeSet(options, runtime) {
  const merge = options.merge !== false;
  for (const [key, value] of Object.entries(options.values)) {
    if (key.startsWith("session.")) {
      const sessionKey = key.slice("session.".length);
      const currentSession = runtime.state.getSession();
      const updates = {};
      setByPath(updates, sessionKey, value);
      runtime.state.updateSession(updates);
    } else if (key === "session") {
      if (merge) {
        runtime.state.updateSession(value);
      } else {
        runtime.state.updateSession(value);
      }
    } else {
      runtime.memory.setPreference(key, value, "session");
    }
  }
}
async function executeQuery(options, runtime) {
  const result = {};
  const filters = options.filters || {};
  if (options.type === "decisions" || options.type === "all") {
    result.decisions = runtime.memory.getDecisions({
      category: filters.category,
      files: filters.files,
      since: filters.since,
      status: filters.status
    });
    if (filters.limit) {
      result.decisions = result.decisions.slice(0, filters.limit);
    }
  }
  if (options.type === "patterns" || options.type === "all") {
    result.patterns = runtime.memory.getPatterns({
      since: filters.since
    });
    if (filters.limit) {
      result.patterns = result.patterns.slice(0, filters.limit);
    }
  }
  if (options.type === "failures" || options.type === "all") {
    result.failures = runtime.memory.getFailures({
      files: filters.files,
      since: filters.since
    });
    if (filters.limit) {
      result.failures = result.failures.slice(0, filters.limit);
    }
  }
  return result;
}
async function executeExport(options, runtime) {
  const includes = options.include || ["state", "memory"];
  const format = options.format;
  const snapshot = {
    version: 1,
    exported_at: (/* @__PURE__ */ new Date()).toISOString(),
    state: runtime.state.getState(),
    memory: runtime.memory.getMemory()
  };
  const data = {
    version: snapshot.version,
    exported_at: snapshot.exported_at
  };
  if (includes.includes("state")) {
    data.state = snapshot.state;
  }
  if (includes.includes("memory")) {
    data.memory = snapshot.memory;
  }
  if (includes.includes("telemetry")) {
    data.telemetry = runtime.telemetry.getSessionMetrics();
  }
  let exported;
  if (format === "json") {
    exported = JSON.stringify(data, null, 2);
  } else if (format === "markdown") {
    exported = formatAsMarkdown(data);
  } else {
    exported = data;
  }
  if (options.output_path) {
    const fs5 = await import("fs/promises");
    const path5 = await import("path");
    const projectRoot = process.env.PROJECT_ROOT || process.cwd();
    const outputPath = path5.isAbsolute(options.output_path) ? options.output_path : path5.join(projectRoot, options.output_path);
    await fs5.writeFile(
      outputPath,
      typeof exported === "string" ? exported : JSON.stringify(exported, null, 2),
      "utf-8"
    );
    return { exported, exported_path: outputPath };
  }
  return { exported };
}
function formatAsMarkdown(data) {
  const lines = [
    "# GoodVibes State Export",
    "",
    `Exported: ${data.exported_at}`,
    `Version: ${data.version}`,
    ""
  ];
  if (data.state) {
    const state = data.state;
    lines.push("## Session State", "");
    lines.push(`- **ID**: ${state.session.id}`);
    lines.push(`- **Mode**: ${state.session.mode}`);
    lines.push(`- **Started**: ${state.session.started_at}`);
    lines.push(`- **Batches Completed**: ${state.session.batches_completed}`);
    lines.push(`- **Operations Completed**: ${state.session.operations_completed}`);
    lines.push(`- **Tokens Used**: ${state.session.tokens_used}`);
    lines.push("");
    if (state.session.git) {
      lines.push("### Git Status", "");
      lines.push(`- **Branch**: ${state.session.git.current_branch}`);
      lines.push(`- **Last Commit**: ${state.session.git.last_commit}`);
      lines.push(`- **Uncommitted Files**: ${state.session.git.uncommitted_files.length}`);
      lines.push("");
    }
  }
  if (data.memory) {
    const memory = data.memory;
    lines.push("## Memory", "");
    lines.push(`- **Decisions**: ${memory.decisions.length}`);
    lines.push(`- **Patterns**: ${memory.patterns.length}`);
    lines.push(`- **Failures**: ${memory.failures.length}`);
    lines.push(`- **Preferences**: ${memory.preferences.length}`);
    lines.push("");
    if (memory.decisions.length > 0) {
      lines.push("### Recent Decisions", "");
      for (const decision of memory.decisions.slice(-5)) {
        lines.push(`- [${decision.category}] ${decision.what}`);
      }
      lines.push("");
    }
  }
  if (data.telemetry) {
    const telemetry = data.telemetry;
    lines.push("## Telemetry", "");
    lines.push(`- **Total Batches**: ${telemetry.total_batches}`);
    lines.push(`- **Total Operations**: ${telemetry.total_operations}`);
    lines.push(`- **Total Tokens**: ${telemetry.total_tokens}`);
    lines.push("");
  }
  return lines.join("\n");
}
async function executeImport(options, runtime) {
  let data;
  if (typeof options.source === "string") {
    if (options.source.startsWith("{") || options.source.startsWith("[")) {
      data = JSON.parse(options.source);
    } else {
      const fs5 = await import("fs/promises");
      const path5 = await import("path");
      const projectRoot = process.env.PROJECT_ROOT || process.cwd();
      const filePath = path5.isAbsolute(options.source) ? options.source : path5.join(projectRoot, options.source);
      const content = await fs5.readFile(filePath, "utf-8");
      data = JSON.parse(content);
    }
  } else {
    data = options.source;
  }
  let importedCount = 0;
  if (data && typeof data === "object") {
    const snapshot = data;
    if (snapshot.memory) {
      for (const decision of snapshot.memory.decisions || []) {
        runtime.memory.recordDecision({
          what: decision.what,
          why: decision.why,
          category: decision.category,
          confidence: decision.confidence,
          files: decision.files,
          symbols: decision.symbols,
          status: decision.status
        });
        importedCount++;
      }
      for (const pattern of snapshot.memory.patterns || []) {
        runtime.memory.recordPattern({
          name: pattern.name,
          description: pattern.description,
          examples: pattern.examples,
          when_to_use: pattern.when_to_use,
          when_not_to_use: pattern.when_not_to_use
        });
        importedCount++;
      }
      for (const failure of snapshot.memory.failures || []) {
        runtime.memory.recordFailure({
          error_type: failure.error_type,
          error_message: failure.error_message,
          stack_trace: failure.stack_trace,
          operation: failure.operation,
          files: failure.files,
          resolved: failure.resolved,
          resolution: failure.resolution,
          root_cause: failure.root_cause,
          prevention: failure.prevention
        });
        importedCount++;
      }
    }
  }
  return { imported_count: importedCount };
}
async function executeClear(options, runtime) {
  const cleared = [];
  for (const target of options.targets) {
    switch (target) {
      case "state":
        runtime.state.reset();
        cleared.push("state");
        break;
      case "memory":
        runtime.memory.reset();
        cleared.push("memory");
        break;
      case "telemetry":
        cleared.push("telemetry");
        break;
      case "checkpoints":
        runtime.state.cleanupCheckpoints();
        cleared.push("checkpoints");
        break;
    }
  }
  return { cleared };
}
var handleBatchState = async (args) => {
  const getElapsed = startTimer4();
  const outputMode = parseOutputMode4(args);
  const input = args;
  try {
    if (!input.operation) {
      return toCallToolResult4(errorResult4(
        "operation is required",
        outputMode,
        getElapsed()
      ));
    }
    const validOperations = ["get", "set", "query", "export", "import", "clear"];
    if (!validOperations.includes(input.operation)) {
      return toCallToolResult4(errorResult4(
        `Invalid operation: ${input.operation}. Must be one of: ${validOperations.join(", ")}`,
        outputMode,
        getElapsed()
      ));
    }
    const runtime = createRuntimeContext();
    await initializeRuntime(runtime);
    let output;
    switch (input.operation) {
      case "get": {
        if (!input.get?.keys || input.get.keys.length === 0) {
          return toCallToolResult4(errorResult4(
            "get.keys is required for get operation",
            outputMode,
            getElapsed()
          ));
        }
        const values = await executeGet(input.get, runtime);
        output = {
          operation: "get",
          success: true,
          values
        };
        break;
      }
      case "set": {
        if (!input.set?.values) {
          return toCallToolResult4(errorResult4(
            "set.values is required for set operation",
            outputMode,
            getElapsed()
          ));
        }
        await executeSet(input.set, runtime);
        output = {
          operation: "set",
          success: true
        };
        break;
      }
      case "query": {
        if (!input.query?.type) {
          return toCallToolResult4(errorResult4(
            "query.type is required for query operation",
            outputMode,
            getElapsed()
          ));
        }
        const queryResult = await executeQuery(input.query, runtime);
        output = {
          operation: "query",
          success: true,
          decisions: queryResult.decisions,
          patterns: queryResult.patterns,
          failures: queryResult.failures
        };
        break;
      }
      case "export": {
        if (!input.export?.format) {
          return toCallToolResult4(errorResult4(
            "export.format is required for export operation",
            outputMode,
            getElapsed()
          ));
        }
        const exportResult = await executeExport(input.export, runtime);
        output = {
          operation: "export",
          success: true,
          exported: exportResult.exported,
          exported_path: exportResult.exported_path
        };
        break;
      }
      case "import": {
        if (!input.import?.source) {
          return toCallToolResult4(errorResult4(
            "import.source is required for import operation",
            outputMode,
            getElapsed()
          ));
        }
        const importResult = await executeImport(input.import, runtime);
        output = {
          operation: "import",
          success: true,
          imported_count: importResult.imported_count
        };
        break;
      }
      case "clear": {
        if (!input.clear?.targets || input.clear.targets.length === 0) {
          return toCallToolResult4(errorResult4(
            "clear.targets is required for clear operation",
            outputMode,
            getElapsed()
          ));
        }
        if (input.clear.confirm !== true) {
          return toCallToolResult4(errorResult4(
            "clear.confirm must be true to clear state",
            outputMode,
            getElapsed()
          ));
        }
        const clearResult = await executeClear(input.clear, runtime);
        output = {
          operation: "clear",
          success: true,
          cleared: clearResult.cleared
        };
        break;
      }
      default:
        return toCallToolResult4(errorResult4(
          `Unknown operation: ${input.operation}`,
          outputMode,
          getElapsed()
        ));
    }
    await persistRuntime(runtime);
    let responseData;
    switch (outputMode) {
      case "count_only":
        responseData = {
          operation: output.operation,
          success: output.success,
          ...output.values && { value_count: Object.keys(output.values).length },
          ...output.decisions && { decision_count: output.decisions.length },
          ...output.patterns && { pattern_count: output.patterns.length },
          ...output.failures && { failure_count: output.failures.length },
          ...output.imported_count !== void 0 && { imported_count: output.imported_count },
          ...output.cleared && { cleared_count: output.cleared.length }
        };
        break;
      case "minimal":
        responseData = {
          operation: output.operation,
          success: output.success,
          ...output.values && { values: output.values },
          ...output.decisions && { decisions: output.decisions.length },
          ...output.patterns && { patterns: output.patterns.length },
          ...output.failures && { failures: output.failures.length }
        };
        break;
      case "verbose":
        responseData = output;
        break;
      default:
        responseData = {
          operation: output.operation,
          success: output.success,
          ...output.values && { values: output.values },
          ...output.decisions && { decisions: output.decisions },
          ...output.patterns && { patterns: output.patterns },
          ...output.failures && { failures: output.failures },
          ...output.exported && { exported: typeof output.exported === "string" ? "[string data]" : output.exported },
          ...output.exported_path && { exported_path: output.exported_path },
          ...output.imported_count !== void 0 && { imported_count: output.imported_count },
          ...output.cleared && { cleared: output.cleared },
          ...output.error && { error: output.error }
        };
    }
    return toCallToolResult4(successResult4(responseData, outputMode, getElapsed()));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return toCallToolResult4(errorResult4(errorMessage, outputMode, getElapsed()));
  }
};

// src/handlers/index.ts
var handlerRegistry = /* @__PURE__ */ new Map([
  ["batch", handleBatch],
  ["batch_status", handleBatchStatus],
  ["batch_list", handleListBatches],
  ["batch_recover", handleBatchRecover],
  ["batch_checkpoints", handleListCheckpoints],
  ["batch_state", handleBatchState]
]);
function getHandler(toolName) {
  return handlerRegistry.get(toolName);
}
function hasHandler(toolName) {
  return handlerRegistry.has(toolName);
}
function listHandlers() {
  return Array.from(handlerRegistry.keys());
}
var toolDefinitions = [
  {
    name: "batch",
    description: "Execute a batch of operations with transaction support, validation, and recovery. The heart of SPEC-v2 orchestration.",
    inputSchema: {
      type: "object",
      properties: {
        discovery: {
          type: "object",
          description: "Optional discovery phase to gather context before operations",
          properties: {
            queries: { type: "array", items: { type: "object" } },
            inject_results: { type: "boolean" }
          }
        },
        operations: {
          type: "object",
          description: "Operations grouped by phase: read, write, exec, query, state",
          properties: {
            read: { type: "array", items: { type: "object" } },
            write: { type: "array", items: { type: "object" } },
            exec: { type: "array", items: { type: "object" } },
            query: { type: "array", items: { type: "object" } },
            state: { type: "array", items: { type: "object" } }
          }
        },
        config: {
          type: "object",
          description: "Batch configuration for transaction, execution, preview, validation, and recovery"
        },
        dry_run: { type: "boolean", description: "Preview without executing" },
        preview: { type: "boolean", description: "Return preview of what would be done" },
        timeout_ms: { type: "number", description: "Timeout for batch execution" },
        output_mode: {
          type: "string",
          enum: ["count_only", "minimal", "standard", "verbose"],
          description: "Output verbosity level"
        }
      }
    }
  },
  {
    name: "batch_status",
    description: "Check the status of a batch execution, including progress, results, and agent status.",
    inputSchema: {
      type: "object",
      required: ["batch_id"],
      properties: {
        batch_id: { type: "string", description: "ID of the batch to check" },
        include: {
          type: "object",
          description: "What to include in the response",
          properties: {
            results: { type: "boolean" },
            telemetry: { type: "boolean" },
            operations: { type: "boolean" },
            agents: { type: "boolean" }
          }
        },
        output_mode: {
          type: "string",
          enum: ["count_only", "minimal", "standard", "verbose"]
        }
      }
    }
  },
  {
    name: "batch_list",
    description: "List all batches, optionally filtered by status or time range.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "array",
          items: {
            type: "string",
            enum: ["pending", "running", "paused", "completing", "completed", "failed", "rolled_back", "cancelled"]
          },
          description: "Filter by status"
        },
        limit: { type: "number", description: "Maximum number of batches to return" },
        since: { type: "string", description: "ISO timestamp - only batches after this time" },
        until: { type: "string", description: "ISO timestamp - only batches before this time" },
        output_mode: {
          type: "string",
          enum: ["count_only", "minimal", "standard", "verbose"]
        }
      }
    }
  },
  {
    name: "batch_recover",
    description: "Recovery operations: rollback, restore, retry, cleanup, or fix failed operations.",
    inputSchema: {
      type: "object",
      required: ["operation"],
      properties: {
        operation: {
          type: "string",
          enum: ["rollback", "restore", "retry", "cleanup", "fix"],
          description: "The recovery operation to perform"
        },
        rollback: {
          type: "object",
          description: "Options for rollback operation",
          properties: {
            batch_id: { type: "string" },
            checkpoint_id: { type: "string" },
            scope: { type: "string", enum: ["all", "files", "state", "selective"] },
            files: { type: "array", items: { type: "string" } },
            state_keys: { type: "array", items: { type: "string" } }
          }
        },
        restore: {
          type: "object",
          description: "Options for restore operation",
          properties: {
            checkpoint_id: { type: "string" },
            files_only: { type: "boolean" },
            state_only: { type: "boolean" }
          }
        },
        retry: {
          type: "object",
          description: "Options for retry operation",
          properties: {
            batch_id: { type: "string" },
            operation_ids: { type: "array", items: { type: "string" } },
            max_attempts: { type: "number" }
          }
        },
        cleanup: {
          type: "object",
          description: "Options for cleanup operation",
          properties: {
            older_than_hours: { type: "number" },
            keep_last: { type: "number" },
            dry_run: { type: "boolean" }
          }
        },
        fix: {
          type: "object",
          description: "Options for fix operation",
          properties: {
            batch_id: { type: "string" },
            operation_id: { type: "string" },
            strategy: { type: "string", enum: ["auto", "agent", "targeted"] },
            max_attempts: { type: "number" }
          }
        },
        output_mode: {
          type: "string",
          enum: ["count_only", "minimal", "standard", "verbose"]
        }
      }
    }
  },
  {
    name: "batch_checkpoints",
    description: "List available checkpoints for recovery.",
    inputSchema: {
      type: "object",
      properties: {
        batch_id: { type: "string", description: "Filter by batch ID" },
        limit: { type: "number", description: "Maximum number of checkpoints to return" },
        include_expired: { type: "boolean", description: "Include expired checkpoints" },
        output_mode: {
          type: "string",
          enum: ["count_only", "minimal", "standard", "verbose"]
        }
      }
    }
  },
  {
    name: "batch_state",
    description: "Manage persistent state and memory: get, set, query, export, import, or clear.",
    inputSchema: {
      type: "object",
      required: ["operation"],
      properties: {
        operation: {
          type: "string",
          enum: ["get", "set", "query", "export", "import", "clear"],
          description: "The state operation to perform"
        },
        get: {
          type: "object",
          description: "Options for get operation",
          properties: {
            keys: {
              type: "array",
              items: { type: "string" },
              description: "Dot-notation paths to retrieve (e.g., session.mode)"
            }
          }
        },
        set: {
          type: "object",
          description: "Options for set operation",
          properties: {
            values: {
              type: "object",
              description: "Key-value pairs to set"
            },
            merge: { type: "boolean", description: "Merge with existing values (default: true)" }
          }
        },
        query: {
          type: "object",
          description: "Options for memory query",
          properties: {
            type: {
              type: "string",
              enum: ["decisions", "patterns", "failures", "all"]
            },
            filters: {
              type: "object",
              properties: {
                category: { type: "string" },
                files: { type: "array", items: { type: "string" } },
                since: { type: "string" },
                limit: { type: "number" },
                status: { type: "string" }
              }
            }
          }
        },
        export: {
          type: "object",
          description: "Options for export operation",
          properties: {
            format: { type: "string", enum: ["json", "markdown"] },
            include: {
              type: "array",
              items: { type: "string", enum: ["state", "memory", "telemetry"] }
            },
            output_path: { type: "string", description: "File path to write (optional)" }
          }
        },
        import: {
          type: "object",
          description: "Options for import operation",
          properties: {
            format: { type: "string", enum: ["json"] },
            source: {
              oneOf: [
                { type: "string", description: "File path or JSON string" },
                { type: "object", description: "Inline data object" }
              ]
            },
            merge: { type: "boolean" }
          }
        },
        clear: {
          type: "object",
          description: "Options for clear operation",
          properties: {
            targets: {
              type: "array",
              items: { type: "string", enum: ["state", "memory", "telemetry", "checkpoints"] }
            },
            confirm: { type: "boolean", description: "Must be true to confirm clear" }
          }
        },
        output_mode: {
          type: "string",
          enum: ["count_only", "minimal", "standard", "verbose"]
        }
      }
    }
  }
];
function getToolDefinitions() {
  return toolDefinitions;
}

// src/index.ts
var VERSION = "1.0.0";
var SERVER_NAME = "batch-engine";
var DEFAULTS = {
  MAX_PARALLEL_OPERATIONS: 10,
  MAX_RETRY_ATTEMPTS: 3,
  TRANSACTION_TIMEOUT_MS: 6e4,
  CHECKPOINT_EXPIRY_HOURS: 24,
  MAX_CHECKPOINTS: 10
};
var PHASE_ORDER2 = ["discovery", "read", "write", "exec", "query", "state"];
var TOKEN_COSTS = {
  input: {
    haiku: 0.25,
    sonnet: 3,
    opus: 15
  },
  output: {
    haiku: 1.25,
    sonnet: 15,
    opus: 75
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULTS,
  EMPTY_AGGREGATIONS,
  EMPTY_INDEX,
  EMPTY_PREFERENCES,
  EMPTY_SESSION_METRICS,
  MEMORY_PATHS,
  MemoryManagerImpl,
  PHASE_ORDER,
  SERVER_NAME,
  STATE_PATHS,
  StateManagerImpl,
  TELEMETRY_PATHS,
  TOKEN_COSTS,
  TelemetryCollectorImpl,
  VERSION,
  createMemoryManager,
  createRuntimeContext,
  createStateManager,
  createTelemetryCollector,
  getActiveBatch,
  getCheckpointPath,
  getCompletedBatch,
  getHandler,
  getHistoryPath,
  getMemoryManager,
  getStateManager,
  getTelemetryCollector,
  getTodayDateString,
  getToolDefinitions,
  handleBatch,
  handleBatchRecover,
  handleBatchState,
  handleBatchStatus,
  handleListBatches,
  handleListCheckpoints,
  handlerRegistry,
  hasHandler,
  initializeRuntime,
  listActiveBatches,
  listCompletedBatches,
  listHandlers,
  persistRuntime,
  resetGlobalMemoryManager,
  resetGlobalStateManager,
  resetGlobalTelemetryCollector,
  resetRuntime,
  toolDefinitions
});
//# sourceMappingURL=index.cjs.map
