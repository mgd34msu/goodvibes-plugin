# Engine Migration Guide: Adopting the Runtime Engine Architecture

This document provides an exhaustive blueprint for migrating all GoodVibes engines (precision-engine, analytics-engine, frontend-engine, project-engine, registry-engine) to the layered, event-driven, plugin-based architecture established by the runtime engine.

---

## Table of Contents

1. [Runtime Engine Architecture Reference](#1-runtime-engine-architecture-reference)
2. [Architecture Gap Analysis by Engine](#2-architecture-gap-analysis-by-engine)
3. [Migration Strategy: Universal Patterns](#3-migration-strategy-universal-patterns)
4. [Engine-Specific Migration Plans](#4-engine-specific-migration-plans)
5. [Shared Infrastructure](#5-shared-infrastructure)
6. [Migration Sequencing](#6-migration-sequencing)

---

## 1. Runtime Engine Architecture Reference

The runtime engine establishes 10 architectural pillars that define the target state for all engines.

### 1.1 Three-Layer Module Hierarchy

```
┌─────────────────────────────────────────────────┐
│ Layer 3: Plugins (Additive, Optional)           │
│ - Hook handlers, MCP tools, time, external      │
│ - Register with Layer 2 extensions              │
│ - Can be disabled without breaking the engine   │
└────────────────┬────────────────────────────────┘
                 │ depends on
┌────────────────▼────────────────────────────────┐
│ Layer 2: Extensions (Domain Logic)              │
│ - Events, workflow, agents, triggers,           │
│   directives, executor, persistence             │
│ - Concrete implementations of domain concerns   │
│ - Singleton-per-session                         │
└────────────────┬────────────────────────────────┘
                 │ depends on
┌────────────────▼────────────────────────────────┐
│ Layer 1: Core (Foundational, Immutable)         │
│ - Types, interfaces, queues, state abstractions │
│ - NEVER changes after stabilization             │
│ - Zero external dependencies                    │
└─────────────────────────────────────────────────┘
```

**Key properties:**
- Dependencies flow downward only (Layer 3 → 2 → 1)
- Layer 1 defines contracts; Layer 2 implements them; Layer 3 extends them
- Each layer has its own `index.ts` barrel export

### 1.2 Bootstrap Sequence

The runtime engine initializes in a strict 15-step sequence organized into 6 phases:

| Phase | Steps | Purpose |
|-------|-------|---------|
| 1. Config & State | 1-5 | Load config, create state store, init event system, crash recovery, PID lock |
| 2. Workflow & Triggers | 6-7 | Register workflow definitions + built-in triggers |
| 3. Agents & Directives | 8-9 | Agent coordinator, budget tracker, WRFC handlers |
| 4. Persistence & Recovery | 10 | Snapshot manager, startup recovery, periodic snapshots |
| 5. Executor & Plugins | 11-12 | Executor mode, hook registry, time plugin, external plugin |
| 6. IPC & Startup | 13-15 | IPC server, tick driver, `system:startup` event |

**Pattern:** Each step creates a subsystem, injects dependencies from prior steps, and optionally registers listeners on the EventBus.

### 1.3 Extension Lifecycle Contract

Every Layer 2 extension follows this interface:

```typescript
interface EngineExtension {
  // Phase 1: Lightweight construction (no I/O)
  constructor(config: SectionConfig): void;
  
  // Phase 2: Async initialization (I/O allowed)
  initialize(): Promise<void>;
  
  // Phase 3: Late-binding dependency injection
  setDependencies(...deps): void;
  
  // Phase 4: Core API (domain-specific)
  // register(), evaluate(), get(), list(), etc.
  
  // Phase 5: Persistence hooks
  snapshot(): Serializable;
  restore(snap: Serializable): void;
  
  // Phase 6: Graceful shutdown
  shutdown(): Promise<void>;
}
```

### 1.4 Event-Driven Communication

All subsystem communication flows through the EventBus:

```
Source → EventBus.emit(event)
  → EventLog (persist to disk)
  → Ring buffer (in-memory history)
  → Listeners (handlers registered via .on())
  → TriggerRegistry.evaluate(event)
    → ConditionEvaluator (match conditions)
    → ActionExecutor (fire actions)
      → emit_event | spawn_agent | invoke_handler | advance_workflow | enqueue_directive
```

**65+ event types** across namespaces: `session:*`, `hook:*`, `workflow:*`, `wrfc:*`, `agent:*`, `trigger:*`, `system:*`, `executor:*`.

### 1.5 IPC Protocol

Unix domain socket with newline-delimited JSON. Four message types:
- `hook_event` — fire-and-forget event emission
- `query` — request/response (9 query kinds)
- `state_update` — lightweight state merge
- `heartbeat` — connection keep-alive

Hold-and-release pattern for atomic directive delivery.

### 1.6 State Management

Two-tier state hierarchy:
- **In-memory** (fast path): EventBus history, trigger fire counts, workflow instances, agent registry, directive queue
- **Disk** (persistent): runtime-config.json, runtime.json (checkpoint), events.jsonl, snapshot-*.json

Recovery: Snapshot → Event replay → Cold start (cascading fallback).

### 1.7 Configuration System

```
DEFAULT_CONFIG (hardcoded) ← deepMerge ← .goodvibes/state/runtime-config.json
```

- All sections have sensible defaults
- Missing keys fall back to defaults
- Errors logged, never thrown (graceful degradation)
- Runtime-modifiable via `runtime_config` MCP tool (get/set/reset)

### 1.8 Plugin Architecture

Plugins are Layer 3 additive processors:

```typescript
interface EnginePlugin {
  id: string;
  initialize(): Promise<void>;
  process?(event: RuntimeEvent): void;
  shutdown(): Promise<void>;
}
```

Registered via the engine's plugin manager during bootstrap Phase 5.

### 1.9 Observability

- **Health checks** — periodic (60s), memory thresholds (256MB warn, 512MB critical), queue depth warnings
- **Metrics** — event counts, processing times, queue depths, trigger fire counts
- **Structured logging** — `createLogger(namespace)` with severity levels

### 1.10 Graceful Degradation

- Extensions accept nullable dependencies (`DirectiveQueue | null`)
- Features can be disabled via config (`features.workflows_enabled: false`)
- Subsystem failures are isolated — other subsystems continue operating
- PID file + crash recovery detect and restore from unclean shutdowns

---

## 2. Architecture Gap Analysis by Engine

### Gap Matrix

| Architectural Pillar | Runtime | Precision | Analytics | Frontend | Project | Registry |
|---------------------|---------|-----------|-----------|----------|---------|----------|
| 3-Layer hierarchy | ✅ | ⚠️ Partial | ⚠️ Partial | ❌ Flat | ❌ Flat | ❌ Flat |
| Bootstrap sequence | ✅ 15-step | ⚠️ Lazy init | ⚠️ Library class | ❌ None | ❌ None | ⚠️ Lazy load |
| Extension lifecycle | ✅ Full | ❌ Singletons | ❌ Aggregator | ❌ None | ❌ None | ❌ None |
| EventBus | ✅ Full | ❌ Hooks only | ❌ Watchers | ❌ None | ❌ None | ❌ None |
| IPC | ✅ Unix socket | ❌ In-process | ❌ JSONL watch | ❌ None | ❌ None | ❌ None |
| State management | ✅ 2-tier | ⚠️ Multi-singleton | ⚠️ SQLite+memory | ❌ Stateless | ❌ Stateless | ⚠️ Fuse cache |
| Configuration | ✅ Full | ⚠️ Runtime config | ⚠️ File-based | ❌ Hardcoded | ❌ Hardcoded | ❌ Hardcoded |
| Plugin system | ✅ Full | ⚠️ Hooks only | ❌ None | ❌ None | ❌ None | ❌ None |
| Observability | ✅ Health+metrics | ⚠️ Telemetry | ⚠️ Anomaly detect | ❌ None | ❌ None | ❌ None |
| Graceful degradation | ✅ Full | ⚠️ Partial | ❌ None | ❌ None | ❌ None | ❌ None |
| Persistence/Recovery | ✅ Checkpoint+Snapshot | ⚠️ Telemetry DB | ✅ SQLite | ❌ None | ❌ None | ❌ None |
| Type safety | ✅ Full | ✅ Zod schemas | ✅ Interfaces | ⚠️ Per-tool | ⚠️ Per-domain | ⚠️ Basic |

### 2.1 Precision Engine Gaps

**Current state:** Most mature of the non-runtime engines. Has a hook system (Phase 4G), PrecisionRuntime singleton, telemetry, project index, and session state. But architecture is **singleton-heavy and tightly coupled**.

**Critical gaps:**
1. **No layered module hierarchy** — state/, handlers/, core/, utils/ are organized by technical concern, not by layer contract
2. **No EventBus** — hooks system is the only communication channel, and it's request/response (not pub/sub)
3. **No extension lifecycle** — singletons initialize lazily via `.initialize()` but have no snapshot/restore/shutdown contract
4. **No IPC** — in-process only; other engines cannot query precision engine state
5. **No graceful degradation** — if PrecisionRuntime fails to init, features silently degrade but there's no recovery path
6. **Singleton sprawl** — 8+ singletons (PrecisionRuntime, KVState, FileStateCache, SearchCache, SessionState, HooksManager, ProcessManager, Telemetry, ProjectIndex) with implicit ordering dependencies

### 2.2 Analytics Engine Gaps

**Current state:** Second most mature. Has a library-class pattern (AnalyticsEngine), SQLite persistence, JSONL watchers, daemon aggregator, budget tracking, and TUI renderers.

**Critical gaps:**
1. **No layered hierarchy** — handlers/, daemon/, data/, tui/ are domain-organized but not layer-separated
2. **No EventBus** — communication is via direct method calls on Aggregator
3. **No extension lifecycle** — Aggregator manages everything; no snapshot/restore contract
4. **No IPC** — cannot be queried by other engines in real-time
5. **No plugin system** — handler registry is the only extension point
6. **SQLite bottleneck** — single-threaded database blocks on schema migrations
7. **Tight TUI coupling** — renderers depend directly on DashboardState shape

### 2.3 Frontend Engine Gaps

**Current state:** Completely stateless. Each tool call reads from the file system, analyzes, and returns. No session state, no caching, no configuration.

**Critical gaps:**
1. **No architecture** — flat handler files with domain subdirectories
2. **No state of any kind** — repeated analysis on the same files wastes compute
3. **No configuration** — all thresholds hardcoded in analyzers
4. **No extension points** — cannot add custom rules or analyzers
5. **No observability** — no logging, no metrics, no health checks
6. **No error recovery** — parse errors cascade through the call stack

### 2.4 Project Engine Gaps

**Current state:** Stateless with domain-organized handlers (8 domains, 29 tools). Spawns external processes for analysis.

**Critical gaps:**
1. **No architecture** — flat handler dispatch with domain subfolders
2. **No caching** — recomputes TypeScript language service per call (partially cached)
3. **No configuration** — hardcoded paths and thresholds
4. **No rate limiting** — expensive operations (git history, TSC compilation) unbounded
5. **No observability** — minimal logging
6. **No dependency injection** — hardcoded service instantiation
7. **No streaming** — all results buffered in memory

### 2.5 Registry Engine Gaps

**Current state:** Minimal architecture with lazy-loading Fuse.js indexes. Reads YAML registry files.

**Critical gaps:**
1. **No layered hierarchy** — 4 files total (index, handlers, utils, config)
2. **No incremental sync** — full registry reload on initialization
3. **No hot reloading** — server restart required for new registries
4. **No version management** — no semantic versioning for skills/agents
5. **No IPC** — cannot notify other engines of registry changes
6. **No observability** — no logging of search patterns or usage metrics

---

## 3. Migration Strategy: Universal Patterns

These patterns apply to ALL engines being migrated.

### 3.1 Directory Structure Template

Every engine should adopt this directory structure:

```
{engine-name}/
├── src/
│   ├── index.ts                    # Public barrel exports
│   ├── bootstrap.ts                # Engine initialization sequence
│   │
│   ├── shared/                     # Cross-cutting concerns
│   │   ├── config.ts              # Configuration schema + loading
│   │   ├── constants.ts           # Engine constants
│   │   ├── logger.ts              # Structured logging (import from shared lib)
│   │   ├── types.ts               # Shared type definitions
│   │   └── ipc/                   # IPC client (for inter-engine comms)
│   │       ├── client.ts          # Connect to runtime engine
│   │       └── protocol.ts        # Engine-specific message types
│   │
│   ├── core/                       # Layer 1: Foundational interfaces
│   │   ├── types.ts               # Core domain types
│   │   ├── index.ts               # Layer 1 barrel
│   │   ├── state/                 # State abstractions
│   │   │   ├── store.ts           # StateStore interface
│   │   │   └── index.ts
│   │   └── utils/                 # Pure utility functions
│   │       └── index.ts
│   │
│   ├── extensions/                 # Layer 2: Domain logic
│   │   ├── index.ts               # Layer 2 barrel
│   │   ├── {domain-a}/           # One directory per domain
│   │   │   ├── {domain-a}.ts     # Main implementation
│   │   │   ├── types.ts          # Domain-specific types
│   │   │   └── index.ts          # Domain barrel
│   │   ├── {domain-b}/
│   │   │   └── ...
│   │   ├── cache/                 # Caching extension (if applicable)
│   │   │   ├── cache-manager.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── persistence/           # State persistence (if applicable)
│   │       ├── state-store.ts
│   │       ├── types.ts
│   │       └── index.ts
│   │
│   └── plugins/                    # Layer 3: External integrations
│       ├── index.ts               # Layer 3 barrel
│       ├── mcp/                   # MCP tool handlers
│       │   ├── handlers/          # One file per tool
│       │   │   ├── {tool-a}.ts
│       │   │   ├── {tool-b}.ts
│       │   │   └── index.ts       # Handler registry
│       │   └── index.ts
│       └── hooks/                 # Hook integrations (if applicable)
│           └── index.ts
│
├── dist/                           # Compiled output
└── tsconfig.json
```

### 3.2 Bootstrap Pattern

Every engine needs a `bootstrap.ts` that follows this template:

```typescript
import { loadConfig, type EngineConfig } from './shared/config.js';
import { createLogger } from './shared/logger.js';

const log = createLogger('bootstrap');

export interface EngineContext {
  config: EngineConfig;
  state: StateStore;           // Layer 1 interface
  cache?: CacheManager;        // Layer 2 extension
  // ... other extensions
}

export async function bootstrap(projectRoot: string): Promise<EngineContext> {
  // Phase 1: Configuration
  const config = loadConfig(projectRoot);
  log.info('Configuration loaded', { projectRoot });

  // Phase 2: State
  const state = new StateStore(config.persistence);
  await state.initialize();

  // Phase 3: Extensions (domain-specific)
  const cache = new CacheManager(config.cache);
  await cache.initialize();
  cache.setDependencies(state);

  // Phase 4: Plugins (MCP handlers, hooks)
  const handlers = registerHandlers({ config, state, cache });

  // Phase 5: Health & observability
  const health = new HealthChecker(config.health);
  health.register('state', () => state.isHealthy());
  health.register('cache', () => cache.isHealthy());

  log.info('Engine bootstrapped successfully');

  return { config, state, cache, handlers, health };
}

export async function shutdown(ctx: EngineContext): Promise<void> {
  // Reverse order of initialization
  await ctx.cache?.shutdown();
  await ctx.state.shutdown();
  log.info('Engine shutdown complete');
}
```

### 3.3 Extension Lifecycle Contract

Every Layer 2 extension MUST implement:

```typescript
export abstract class EngineExtension<TConfig, TSnapshot> {
  protected config: TConfig;
  protected initialized = false;

  constructor(config: TConfig) {
    this.config = config;
    // No I/O here — construction must be synchronous and lightweight
  }

  /** Async initialization. Called once during bootstrap. */
  abstract initialize(): Promise<void>;

  /** Inject dependencies from other extensions. Called after all extensions are constructed. */
  abstract setDependencies(...deps: unknown[]): void;

  /** Serialize extension state for persistence. */
  abstract snapshot(): TSnapshot;

  /** Restore extension state from a persisted snapshot. */
  abstract restore(snap: TSnapshot): void;

  /** Health check. Returns true if extension is operating normally. */
  abstract isHealthy(): boolean;

  /** Graceful shutdown. Release resources, flush buffers. */
  abstract shutdown(): Promise<void>;
}
```

### 3.4 Configuration Pattern

Every engine needs a typed configuration with defaults and deep-merge loading:

```typescript
// shared/config.ts

export interface EngineConfig {
  schema_version: string;
  // Engine-specific sections
  cache: CacheConfig;
  persistence: PersistenceConfig;
  health: HealthConfig;
  features: FeaturesConfig;
}

export const DEFAULT_CONFIG: EngineConfig = {
  schema_version: '1.0.0',
  cache: {
    enabled: true,
    max_entries: 1000,
    ttl_ms: 300_000,  // 5 minutes
  },
  persistence: {
    enabled: true,
    checkpoint_interval_ms: 30_000,
    state_dir: '.goodvibes/state',
  },
  health: {
    check_interval_ms: 60_000,
    memory_warn_mb: 256,
  },
  features: {
    cache_enabled: true,
    persistence_enabled: true,
  },
};

export function loadConfig(projectRoot: string): EngineConfig {
  const configPath = join(projectRoot, '.goodvibes', 'state', '{engine}-config.json');
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return deepMerge(DEFAULT_CONFIG, parsed);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
```

### 3.5 Handler Registry Pattern

MCP tool handlers should be registered through a typed registry:

```typescript
// plugins/mcp/handlers/index.ts

import type { EngineContext } from '../../../bootstrap.js';

export type ToolHandler = (
  ctx: EngineContext,
  args: Record<string, unknown>,
) => Promise<ToolResponse>;

const HANDLERS = new Map<string, ToolHandler>();

export function registerHandlers(ctx: EngineContext): Map<string, ToolHandler> {
  // Import and register each handler
  HANDLERS.set('tool_name', createToolHandler(ctx));
  // ...
  return HANDLERS;
}

export function getHandler(name: string): ToolHandler | undefined {
  return HANDLERS.get(name);
}
```

**Key difference from current pattern:** Handlers receive `EngineContext` (with state, cache, config) instead of raw args. This enables dependency injection.

### 3.6 Observability Pattern

Every engine should have structured logging and health checks:

```typescript
// Import shared logger factory
import { createLogger } from './shared/logger.js';
const log = createLogger('extension-name');

// Health check interface
interface HealthCheck {
  name: string;
  check(): Promise<{ healthy: boolean; details?: Record<string, unknown> }>;
}

class HealthChecker {
  private checks: HealthCheck[] = [];
  register(name: string, check: () => boolean): void { ... }
  async runAll(): Promise<HealthReport> { ... }
}
```

### 3.7 Graceful Degradation Pattern

Extensions should accept nullable dependencies and operate in degraded mode:

```typescript
class MyExtension {
  private cache: CacheManager | null = null;

  setDependencies(cache: CacheManager | null): void {
    this.cache = cache;
  }

  async doWork(key: string): Promise<Result> {
    // Try cache first, fall back to computation
    if (this.cache) {
      const cached = this.cache.get(key);
      if (cached) return cached;
    }
    
    const result = await this.compute(key);
    
    // Cache if available
    this.cache?.set(key, result);
    
    return result;
  }
}
```

---

## 4. Engine-Specific Migration Plans

### 4.1 Precision Engine Migration

**Effort:** Large (most complex engine, most state to reorganize)
**Priority:** High (most-used engine, most benefit from architecture)

#### Phase 1: Layer Separation (Directory Restructure)

Current flat structure → layered:

```
CURRENT:                          TARGET:
src/                              src/
├── index.ts                      ├── index.ts (barrel)
├── config.ts                     ├── bootstrap.ts
├── handlers/                     ├── shared/
│   ├── precision-read.ts         │   ├── config.ts (from config.ts)
│   ├── precision-write.ts        │   ├── constants.ts
│   ├── precision-edit.ts         │   ├── logger.ts
│   ├── precision-exec.ts         │   └── types.ts
│   ├── precision-fetch.ts        ├── core/
│   ├── precision-grep.ts         │   ├── types.ts (interfaces)
│   ├── precision-glob.ts         │   ├── state/
│   ├── precision-symbols.ts      │   │   └── store-interface.ts
│   ├── discover.ts               │   └── utils/
│   ├── precision-config.ts       │       ├── path-validation.ts
│   ├── precision-notebook.ts     │       └── file-type-detection.ts
│   └── precision-agent.ts        ├── extensions/
├── state/                        │   ├── cache/
│   ├── precision-runtime.ts      │   │   ├── file-cache.ts (from state/file-cache.ts)
│   ├── file-cache.ts             │   │   ├── search-cache.ts (from state/search-cache.ts)
│   ├── session-state.ts          │   │   └── index.ts
│   ├── kv-state.ts               │   ├── telemetry/
│   ├── project-index.ts          │   │   ├── telemetry.ts (from state/telemetry.ts)
│   ├── telemetry.ts              │   │   ├── project-index.ts (from state/project-index.ts)
│   ├── search-cache.ts           │   │   └── index.ts
│   ├── hooks.ts                  │   ├── session/
│   ├── mode-manager.ts           │   │   ├── session-state.ts (from state/session-state.ts)
│   ├── dossier.ts                │   │   ├── kv-state.ts (from state/kv-state.ts)
│   └── process-manager.ts        │   │   └── index.ts
├── core/                         │   ├── hooks/
│   ├── ast-grep.ts               │   │   ├── hooks-manager.ts (from state/hooks.ts)
│   ├── ripgrep.ts                │   │   └── index.ts
│   ├── tree-sitter.ts            │   └── persistence/
│   └── languages.ts              │       └── state-store.ts
└── utils/                        └── plugins/
    ├── fetch/                        ├── mcp/
    ├── grep/                         │   └── handlers/ (from handlers/)
    └── ...                           └── backends/
                                          ├── ast-grep.ts (from core/)
                                          ├── ripgrep.ts
                                          ├── tree-sitter.ts
                                          └── languages.ts
```

#### Phase 2: Replace Singletons with Bootstrap Injection

Current: 8+ singletons with implicit ordering.

```typescript
// CURRENT (anti-pattern)
class FileStateCache {
  private static instance: FileStateCache;
  static getInstance(): FileStateCache { ... }
}

// TARGET (bootstrap injection)
export async function bootstrap(projectRoot: string): Promise<PrecisionContext> {
  const config = loadConfig(projectRoot);
  const stateStore = new StateStore(config.persistence);
  const fileCache = new FileCache(config.cache);
  const searchCache = new SearchCache(config.cache);
  const telemetry = new Telemetry(config.telemetry);
  const projectIndex = new ProjectIndex(config.index);
  const hooksManager = new HooksManager(config.hooks);
  const sessionState = new SessionState();
  const processManager = new ProcessManager();

  // Initialize in dependency order
  await stateStore.initialize();
  await telemetry.initialize();
  await projectIndex.initialize();
  fileCache.setDependencies(stateStore);
  searchCache.setDependencies(stateStore);

  return {
    config, stateStore, fileCache, searchCache,
    telemetry, projectIndex, hooksManager,
    sessionState, processManager,
  };
}
```

#### Phase 3: Add Extension Lifecycle

Wrap each subsystem in the extension contract:

```typescript
export class FileCache extends EngineExtension<CacheConfig, FileCacheSnapshot> {
  private entries = new Map<string, CachedFile>();
  private stateStore: StateStore | null = null;

  async initialize(): Promise<void> {
    // Load persisted cache entries if configured
  }

  setDependencies(stateStore: StateStore | null): void {
    this.stateStore = stateStore;
  }

  snapshot(): FileCacheSnapshot {
    return { entries: Array.from(this.entries.entries()) };
  }

  restore(snap: FileCacheSnapshot): void {
    this.entries = new Map(snap.entries);
  }

  isHealthy(): boolean {
    return this.entries.size < this.config.max_entries * 1.5;
  }

  async shutdown(): Promise<void> {
    this.entries.clear();
  }
}
```

#### Phase 4: Configuration System

Replace scattered config with unified schema:

```typescript
export interface PrecisionConfig {
  schema_version: string;
  sandbox: { enabled: boolean; allowed_paths: string[] };
  cache: { enabled: boolean; max_entries: number; ttl_ms: number };
  telemetry: { enabled: boolean; db_path: string; retention_days: number };
  index: { enabled: boolean; auto_refresh: boolean };
  exec: { default_timeout_ms: number; max_background: number };
  hooks: { enabled: boolean; timeout_ms: number };
  health: { check_interval_ms: number; memory_warn_mb: number };
  features: { cache_enabled: boolean; telemetry_enabled: boolean; hooks_enabled: boolean };
}
```

#### Phase 5: Observability

Add structured logging and health checks to every extension.

---

### 4.2 Analytics Engine Migration

**Effort:** Medium-Large
**Priority:** Medium (important for monitoring, but less critical path)

#### Phase 1: Layer Separation

```
CURRENT:                          TARGET:
src/                              src/
├── index.ts (library class)      ├── index.ts (barrel)
├── config.ts                     ├── bootstrap.ts
├── handlers/                     ├── shared/
│   ├── dashboard.ts              │   ├── config.ts
│   ├── query.ts                  │   ├── logger.ts
│   ├── budget.ts                 │   └── types.ts
│   ├── tag.ts                    ├── core/
│   ├── export.ts                 │   ├── types.ts (metrics interfaces)
│   ├── config.ts                 │   ├── state/
│   └── sync.ts                   │   │   └── store-interface.ts
├── daemon/                       │   └── utils/
│   ├── aggregator.ts             ├── extensions/
│   ├── watcher.ts                │   ├── aggregation/
│   ├── memory-updater.ts         │   │   ├── aggregator.ts
│   ├── budget-tracker.ts         │   │   ├── watcher.ts
│   ├── anomaly-detector.ts       │   │   └── index.ts
│   ├── report-generator.ts       │   ├── budget/
│   ├── session-archiver.ts       │   │   ├── budget-tracker.ts
│   └── index-reader.ts           │   │   └── index.ts
├── data/                         │   ├── anomaly/
│   ├── global-db.ts              │   │   ├── anomaly-detector.ts
│   ├── db-schema.ts              │   │   └── index.ts
│   ├── jsonl-reader.ts           │   ├── reporting/
│   ├── sync-engine.ts            │   │   ├── report-generator.ts
│   └── ...                       │   │   ├── session-archiver.ts
└── tui/                          │   │   └── index.ts
    ├── mini/                     │   └── persistence/
    ├── full/                     │       ├── global-db.ts
    └── tmux/                     │       ├── db-schema.ts
                                  │       ├── jsonl-reader.ts
                                  │       ├── sync-engine.ts
                                  │       └── index.ts
                                  └── plugins/
                                      ├── mcp/
                                      │   └── handlers/
                                      └── tui/
                                          ├── mini/
                                          ├── full/
                                          └── tmux/
```

#### Phase 2: Replace AnalyticsEngine Class with Bootstrap

Current: Monolithic `AnalyticsEngine` class that owns everything.

```typescript
// CURRENT
class AnalyticsEngine {
  constructor(goodvibesDir) { this.aggregator = new Aggregator(...) }
  async initialize() { this.globalDb = await initializeGlobalDb() }
  async handleToolCall(name, args) { ... }
}

// TARGET
export async function bootstrap(projectRoot: string): Promise<AnalyticsContext> {
  const config = loadConfig(projectRoot);
  
  // Phase 1: Persistence
  const db = new GlobalDatabase(config.persistence);
  await db.initialize();
  
  // Phase 2: Extensions
  const aggregator = new Aggregator(config.aggregation);
  const budgetTracker = new BudgetTracker(config.budget);
  const anomalyDetector = new AnomalyDetector(config.anomaly);
  const reportGenerator = new ReportGenerator(config.reporting);
  
  // Phase 3: Wire dependencies
  aggregator.setDependencies(db);
  budgetTracker.setDependencies(db, aggregator);
  anomalyDetector.setDependencies(aggregator);
  reportGenerator.setDependencies(db, aggregator);
  
  // Phase 4: Initialize
  await aggregator.initialize();
  await budgetTracker.initialize();
  
  return { config, db, aggregator, budgetTracker, anomalyDetector, reportGenerator };
}
```

#### Phase 3: Decouple TUI from State

TUI renderers should consume a `DashboardViewModel` interface, not the raw `DashboardState`:

```typescript
interface DashboardViewModel {
  tokens: { input: number; output: number; cache_read: number; total: number };
  cost: { session: number; hourly_rate: number };
  agents: { active: number; completed: number; failed: number };
  tools: { calls: number; top: Array<{ name: string; count: number }> };
  budget: { used: number; limit: number; percent: number } | null;
}

// Adapter transforms internal state to view model
function toViewModel(state: AggregatorState): DashboardViewModel { ... }
```

#### Phase 4: Add Event-Based Communication

Replace direct method calls with an internal EventBus:

```typescript
// Instead of: aggregator.onSessionEnd(data)
// Use: eventBus.emit({ type: 'analytics:session_end', payload: data })

// Budget tracker subscribes:
eventBus.on('analytics:session_end', (event) => {
  budgetTracker.recordSession(event.payload);
});
```

---

### 4.3 Frontend Engine Migration

**Effort:** Medium (stateless → stateful is the biggest change)
**Priority:** Low-Medium (works fine stateless, but caching would help performance)

#### Phase 1: Layer Separation

```
CURRENT:                          TARGET:
src/                              src/
├── index.ts                      ├── index.ts (barrel)
├── config.ts                     ├── bootstrap.ts
├── handlers/                     ├── shared/
│   ├── analyze-render-triggers.ts│   ├── config.ts
│   ├── analyze-stacking-context/ │   ├── logger.ts
│   ├── analyze-layout-hierarchy/ │   └── types.ts
│   ├── ... (14 tools)            ├── core/
│   ├── react.ts (shared)         │   ├── types.ts
│   └── jsx-class-utils.ts        │   ├── parsers/
│                                 │   │   ├── jsx-parser.ts (from react.ts)
│                                 │   │   ├── css-parser.ts
│                                 │   │   └── index.ts
│                                 │   └── utils/
│                                 │       ├── jsx-class-utils.ts
│                                 │       └── index.ts
│                                 ├── extensions/
│                                 │   ├── analysis/
│                                 │   │   ├── render-triggers.ts
│                                 │   │   ├── stacking-context.ts
│                                 │   │   ├── layout-hierarchy.ts
│                                 │   │   ├── ... (14 analyzers)
│                                 │   │   └── index.ts
│                                 │   ├── cache/
│                                 │   │   ├── parse-cache.ts
│                                 │   │   └── index.ts
│                                 │   └── rules/
│                                 │       ├── rule-registry.ts
│                                 │       └── index.ts
│                                 └── plugins/
│                                     └── mcp/
│                                         └── handlers/
```

#### Phase 2: Add Parse Cache

The biggest performance win — cache parsed ASTs:

```typescript
export class ParseCache extends EngineExtension<CacheConfig, ParseCacheSnapshot> {
  private cache = new Map<string, { ast: ParsedAST; mtime: number }>();

  async get(filePath: string): Promise<ParsedAST | null> {
    const entry = this.cache.get(filePath);
    if (!entry) return null;
    
    // Check if file changed (mtime comparison)
    const stat = await fs.stat(filePath);
    if (stat.mtimeMs > entry.mtime) {
      this.cache.delete(filePath);
      return null;
    }
    
    return entry.ast;
  }

  set(filePath: string, ast: ParsedAST, mtime: number): void {
    if (this.cache.size >= this.config.max_entries) {
      // LRU eviction
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(filePath, { ast, mtime });
  }
}
```

#### Phase 3: Add Configuration System

```typescript
export interface FrontendConfig {
  schema_version: string;
  cache: { enabled: boolean; max_entries: number; ttl_ms: number };
  analysis: {
    max_depth: number;              // Component tree depth limit
    max_files: number;              // Max files per analysis
    z_index_warn_threshold: number; // Stacking context warning
    a11y_standard: 'WCAG_2_1_AA' | 'WCAG_2_1_AAA';
  };
  rules: {
    custom_rules_dir?: string;      // Path to custom rule files
    disabled_rules: string[];       // Rules to skip
  };
  features: { cache_enabled: boolean };
}
```

#### Phase 4: Add Rule Registry (Extensibility)

```typescript
export interface AnalysisRule {
  id: string;
  name: string;
  category: 'accessibility' | 'performance' | 'correctness' | 'style';
  severity: 'error' | 'warning' | 'info';
  analyze(context: AnalysisContext): Promise<RuleResult[]>;
}

export class RuleRegistry {
  private rules = new Map<string, AnalysisRule>();
  
  register(rule: AnalysisRule): void { ... }
  getByCategory(category: string): AnalysisRule[] { ... }
  evaluate(context: AnalysisContext): Promise<RuleResult[]> { ... }
}
```

---

### 4.4 Project Engine Migration

**Effort:** Medium-Large (29 tools, many external process dependencies)
**Priority:** Medium (rate limiting and caching are important for expensive operations)

#### Phase 1: Layer Separation

```
CURRENT:                          TARGET:
src/                              src/
├── index.ts                      ├── index.ts (barrel)
├── config.ts                     ├── bootstrap.ts
├── handlers/                     ├── shared/
│   ├── code-intelligence/ (6)    │   ├── config.ts
│   ├── security/ (3)             │   ├── logger.ts
│   ├── database/ (3)             │   └── types.ts
│   ├── api/ (4)                  ├── core/
│   ├── deps/ (3)                 │   ├── types.ts
│   ├── runtime/ (3)              │   ├── process/
│   ├── test/ (2)                 │   │   ├── executor.ts (shared process spawning)
│   └── standalone/ (2)           │   │   └── rate-limiter.ts
├── schemas/                      │   └── utils/
└── types.ts                      ├── extensions/
                                  │   ├── code-intelligence/
                                  │   │   ├── language-service.ts (cached TSC)
                                  │   │   ├── analyzers/ (6 tools)
                                  │   │   └── index.ts
                                  │   ├── security/
                                  │   ├── database/
                                  │   ├── api/
                                  │   ├── deps/
                                  │   ├── runtime/
                                  │   ├── test/
                                  │   ├── standalone/
                                  │   ├── cache/
                                  │   │   └── analysis-cache.ts
                                  │   └── rate-limiter/
                                  │       └── rate-limiter.ts
                                  └── plugins/
                                      └── mcp/
                                          └── handlers/
```

#### Phase 2: Add Rate Limiter

The most critical addition — prevent unbounded expensive operations:

```typescript
export class RateLimiter extends EngineExtension<RateLimiterConfig, RateLimiterSnapshot> {
  private windows = new Map<string, { count: number; reset_at: number }>();

  async acquire(operation: string): Promise<boolean> {
    const limit = this.config.limits[operation] ?? this.config.default_limit;
    const window = this.windows.get(operation);
    
    if (!window || Date.now() > window.reset_at) {
      this.windows.set(operation, { count: 1, reset_at: Date.now() + limit.window_ms });
      return true;
    }
    
    if (window.count >= limit.max_per_window) {
      return false; // Rate limited
    }
    
    window.count++;
    return true;
  }
}
```

#### Phase 3: Centralize Process Execution

Replace scattered `child_process.exec` calls with a managed executor:

```typescript
export class ProcessExecutor {
  private active = new Map<string, ChildProcess>();
  private rateLimiter: RateLimiter;

  async execute(opts: {
    command: string;
    args: string[];
    timeout_ms: number;
    operation: string;  // For rate limiting
  }): Promise<ProcessResult> {
    if (!await this.rateLimiter.acquire(opts.operation)) {
      throw new RateLimitError(opts.operation);
    }
    // Spawn, track, timeout, cleanup
  }
}
```

#### Phase 4: Add Analysis Cache

```typescript
export class AnalysisCache extends EngineExtension<CacheConfig, CacheSnapshot> {
  private cache = new Map<string, { result: unknown; hash: string; expires: number }>();

  async getOrCompute<T>(
    key: string,
    inputHash: string,
    compute: () => Promise<T>,
  ): Promise<T> {
    const entry = this.cache.get(key);
    if (entry && entry.hash === inputHash && Date.now() < entry.expires) {
      return entry.result as T;
    }
    const result = await compute();
    this.cache.set(key, {
      result,
      hash: inputHash,
      expires: Date.now() + this.config.ttl_ms,
    });
    return result;
  }
}
```

---

### 4.5 Registry Engine Migration

**Effort:** Small-Medium (simplest engine, fewest files)
**Priority:** Low (works well for its purpose, but hot reload would be valuable)

#### Phase 1: Layer Separation

```
CURRENT:                          TARGET:
src/                              src/
├── index.ts                      ├── index.ts (barrel)
├── config.ts                     ├── bootstrap.ts
├── handlers/                     ├── shared/
│   ├── search.ts                 │   ├── config.ts
│   ├── content.ts                │   ├── logger.ts
│   ├── dependencies.ts           │   └── types.ts
│   └── index.ts                  ├── core/
├── types.ts                      │   ├── types.ts
└── utils.ts                      │   └── utils/
                                  ├── extensions/
                                  │   ├── indexing/
                                  │   │   ├── index-manager.ts (replaces LazyRegistryLoader)
                                  │   │   ├── fuse-adapter.ts
                                  │   │   └── index.ts
                                  │   ├── watcher/
                                  │   │   ├── registry-watcher.ts (new: hot reload)
                                  │   │   └── index.ts
                                  │   └── versioning/
                                  │       ├── version-resolver.ts (new)
                                  │       └── index.ts
                                  └── plugins/
                                      └── mcp/
                                          └── handlers/
```

#### Phase 2: Replace LazyRegistryLoader with IndexManager

```typescript
export class IndexManager extends EngineExtension<IndexConfig, IndexSnapshot> {
  private indexes = new Map<RegistryType, Fuse<RegistryEntry>>();
  private registries = new Map<RegistryType, Registry>();
  private watcher: RegistryWatcher | null = null;

  async initialize(): Promise<void> {
    await this.loadAllRegistries();
  }

  setDependencies(watcher: RegistryWatcher | null): void {
    this.watcher = watcher;
    if (watcher) {
      watcher.on('change', (type) => this.reloadRegistry(type));
    }
  }

  private async reloadRegistry(type: RegistryType): Promise<void> {
    // Hot reload: re-read YAML, rebuild Fuse index
  }
}
```

#### Phase 3: Add Registry Watcher (Hot Reload)

```typescript
export class RegistryWatcher extends EngineExtension<WatcherConfig, never> {
  private watchers = new Map<string, FSWatcher>();
  private callbacks: Array<(type: RegistryType) => void> = [];

  on(event: 'change', callback: (type: RegistryType) => void): void {
    this.callbacks.push(callback);
  }

  async initialize(): Promise<void> {
    // Watch skills/_registry.yaml, agents/_registry.yaml, tools/_registry.yaml
    for (const type of ['skills', 'agents', 'tools']) {
      const path = join(this.config.plugin_root, type, '_registry.yaml');
      this.watchers.set(type, fs.watch(path, () => {
        this.callbacks.forEach(cb => cb(type as RegistryType));
      }));
    }
  }
}
```

---

## 5. Shared Infrastructure

To avoid duplicating infrastructure across all 6 engines, extract shared modules into a `shared/` package.

### 5.1 Shared Package Structure

```
plugins/goodvibes/tools/implementations/shared/
├── src/
│   ├── config/
│   │   ├── loader.ts            # loadConfig, saveConfig, deepMerge
│   │   └── index.ts
│   ├── logger/
│   │   ├── logger.ts            # createLogger factory
│   │   └── index.ts
│   ├── state/
│   │   ├── store-interface.ts   # StateStore interface
│   │   ├── json-store.ts        # JSON file-backed implementation
│   │   └── index.ts
│   ├── health/
│   │   ├── health-checker.ts    # HealthChecker class
│   │   └── index.ts
│   ├── extensions/
│   │   ├── base-extension.ts    # EngineExtension abstract class
│   │   └── index.ts
│   ├── ipc/
│   │   ├── client.ts            # RuntimeClient (connect to runtime engine)
│   │   └── index.ts
│   └── types/
│       ├── tool-response.ts     # ToolResponse, ToolHandler types
│       └── index.ts
├── package.json
└── tsconfig.json
```

### 5.2 What Each Engine Imports

| Shared Module | Precision | Analytics | Frontend | Project | Registry |
|---------------|-----------|-----------|----------|---------|----------|
| config/loader | ✅ | ✅ | ✅ | ✅ | ✅ |
| logger | ✅ | ✅ | ✅ | ✅ | ✅ |
| state/store | ✅ | ✅ | ❌ | ❌ | ⚠️ |
| health | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| extensions/base | ✅ | ✅ | ✅ | ✅ | ✅ |
| ipc/client | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| types | ✅ | ✅ | ✅ | ✅ | ✅ |

(✅ = required, ⚠️ = optional/future)

---

## 6. Migration Sequencing

### Phase Order (by dependency and priority)

```
Phase 0: Shared Infrastructure                    [1 week]
  └── Extract shared/ package (config, logger, state, health, base extension)

Phase 1: Precision Engine                         [2-3 weeks]
  ├── Layer separation (directory restructure)
  ├── Replace singletons with bootstrap
  ├── Add extension lifecycle to all subsystems
  ├── Unified configuration system
  └── Observability (structured logging, health checks)

Phase 2: Analytics Engine                         [2 weeks]
  ├── Layer separation
  ├── Replace AnalyticsEngine class with bootstrap
  ├── Decouple TUI from state (ViewModel pattern)
  ├── Add internal EventBus
  └── Extension lifecycle for aggregator, budget, anomaly

Phase 3: Project Engine                           [2 weeks]
  ├── Layer separation
  ├── Add rate limiter
  ├── Centralize process execution
  ├── Add analysis cache
  └── Configuration system

Phase 4: Frontend Engine                          [1-2 weeks]
  ├── Layer separation
  ├── Add parse cache
  ├── Configuration system
  └── Rule registry (extensibility)

Phase 5: Registry Engine                          [1 week]
  ├── Layer separation
  ├── Replace LazyRegistryLoader with IndexManager
  ├── Add registry watcher (hot reload)
  └── Configuration system

Phase 6: Inter-Engine Communication               [1-2 weeks]
  ├── All engines can query runtime engine state via IPC client
  ├── Runtime engine emits cross-engine events
  └── Registry changes broadcast to all engines
```

### Migration Rules

1. **No big-bang rewrites** — each phase is incremental and independently deployable
2. **Tests first** — write tests for existing behavior before restructuring
3. **Barrel exports are the API contract** — internal restructuring must not change `index.ts` exports
4. **Feature flags** — new subsystems (cache, rate limiter) default to disabled until verified
5. **One engine at a time** — complete one engine's migration before starting the next
6. **Backward compatibility** — MCP tool interfaces (input schemas, response shapes) MUST NOT change

### Validation Criteria

An engine migration is complete when:

- [ ] Directory structure matches the template (Section 3.1)
- [ ] Bootstrap sequence exists and follows the pattern (Section 3.2)
- [ ] All stateful subsystems implement the extension lifecycle (Section 3.3)
- [ ] Configuration uses typed schema with defaults and deep-merge (Section 3.4)
- [ ] MCP handlers receive `EngineContext`, not raw singletons (Section 3.5)
- [ ] Structured logging via `createLogger()` in all modules
- [ ] Health checks registered for all critical subsystems
- [ ] Graceful degradation for optional dependencies (Section 3.7)
- [ ] All existing tests pass without modification
- [ ] No singleton pattern remains (all injection via bootstrap)

---

## Appendix: Runtime Engine Patterns Quick Reference

| Pattern | Runtime Implementation | Apply To All Engines |
|---------|----------------------|---------------------|
| Layer hierarchy | `core/` → `extensions/` → `plugins/` | Same structure |
| Bootstrap | `bootstrap.ts` with phased init | Same pattern |
| Extension contract | constructor → initialize → setDeps → API → snapshot → shutdown | Abstract base class |
| Configuration | `DEFAULT_CONFIG` + deepMerge + disk | Shared loader |
| Structured logging | `createLogger(namespace)` | Shared logger |
| Health checks | `HealthChecker` with registered checks | Shared checker |
| Nullable deps | `dep: T | null` in setDependencies | Same pattern |
| Barrel exports | Layer-level `index.ts` re-exports | Same pattern |
| Handler registry | `Map<string, Handler>` with context injection | Same pattern |
| State persistence | In-memory + periodic checkpoint to disk | Where applicable |

---

*This document was generated from a deep analysis of the runtime engine source code (bootstrap.ts, all extensions, IPC layer, hook system) and all 5 non-runtime engine architectures. All patterns described are derived from working production code in the runtime engine.*