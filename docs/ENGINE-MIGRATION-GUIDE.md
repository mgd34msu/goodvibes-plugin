# Engine Architecture Migration Guide

Convert all engines to the runtime engine's layered architecture: decompose everything to its most atomic form across 4 layers.

---

## The Pattern

```
src/
├── shared/          Layer 0: Cross-cutting infrastructure
├── core/            Layer 1: Types, interfaces, pure utilities
├── extensions/      Layer 2: Domain logic (one dir per atomic concern)
└── plugins/         Layer 3: External surface (MCP handlers, entry points)
```

**Dependencies flow down only.** Plugins → Extensions → Core → Shared. Never upward.

### Layer 0: `shared/`
Cross-cutting concerns used by all layers. Config loading, structured logging, constants, base types. Candidates for extraction to a shared package across engines.

### Layer 1: `core/`
Foundational types and interfaces. Pure utility functions. No side effects, no I/O, no state. This layer defines the contracts that extensions implement.

### Layer 2: `extensions/`
Domain logic broken into atomic, single-responsibility modules. Each subdirectory owns one concern completely. This is where the bulk of the engine lives. Each extension should be independently testable.

### Layer 3: `plugins/`
External-facing surface. MCP tool handlers, server entry points, CLI entry points. Thin wrappers that delegate to extensions. The `index.ts` handler registry lives here.

---

## Runtime Engine Reference (The Target)

```
runtime-engine/src/
├── index.ts                              # Barrel exports
├── bootstrap.ts                          # Initialization sequence
├── server.ts                             # MCP server entry
│
├── shared/                               # LAYER 0
│   ├── config.ts                         # Schema + load/save
│   ├── constants.ts                      # Engine constants
│   ├── logger.ts                         # createLogger factory
│   ├── types.ts                          # Utility types
│   ├── utils.ts                          # ID gen, timestamps
│   ├── index.ts
│   └── ipc/                              # IPC protocol (runtime-specific)
│       ├── client.ts
│       ├── ipc-router.ts
│       ├── ipc-server.ts
│       ├── protocol.ts
│       └── index.ts
│
├── core/                                 # LAYER 1
│   ├── types.ts                          # Event, Trigger, Condition, Action interfaces
│   ├── index.ts
│   ├── queues/                           # Queue abstractions
│   │   ├── event-queue.ts
│   │   ├── dead-letter.ts
│   │   └── index.ts
│   ├── state/                            # State store abstractions
│   │   ├── state-store.ts
│   │   ├── file-io.ts
│   │   ├── file-fallback.ts
│   │   ├── stream-reader.ts
│   │   └── index.ts
│   ├── processing/                       # Event processing primitives
│   │   ├── event-processor.ts
│   │   ├── executor-mode.ts
│   │   ├── lifecycle.ts
│   │   ├── signals.ts
│   │   └── index.ts
│   ├── matching/                         # Pattern matching primitives
│   │   ├── trigger-registry.ts
│   │   ├── error-handler.ts
│   │   └── index.ts
│   ├── observability/                    # Health/metrics interfaces
│   │   ├── health.ts
│   │   ├── metrics.ts
│   │   ├── timer.ts
│   │   └── index.ts
│   └── utils/                            # Pure utility functions
│       ├── fs-utils.ts
│       ├── pid-file.ts
│       ├── poll.ts
│       ├── retry.ts
│       └── index.ts
│
├── extensions/                           # LAYER 2
│   ├── index.ts
│   ├── events/                           # One atomic concern per directory
│   │   ├── event-bus.ts
│   │   ├── event-log.ts
│   │   ├── event-queue.ts
│   │   ├── factories.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── workflow/
│   │   ├── workflow-engine.ts
│   │   ├── watchdog.ts
│   │   ├── types.ts
│   │   ├── definitions/
│   │   │   ├── wrfc-loop.ts
│   │   │   ├── fix-loop.ts
│   │   │   ├── test-then-fix.ts
│   │   │   ├── review-only.ts
│   │   │   ├── custom-loader.ts
│   │   │   ├── chain-types.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── triggers/
│   │   ├── trigger-registry.ts
│   │   ├── condition-evaluator.ts
│   │   ├── action-executor.ts
│   │   ├── builtins.ts
│   │   ├── factories.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── agents/
│   │   ├── agent-coordinator.ts
│   │   ├── budget-tracker.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── directives/
│   │   ├── directive-queue.ts
│   │   ├── directive-builder.ts
│   │   ├── wrfc-handlers.ts
│   │   ├── test-fix-handlers.ts
│   │   ├── review-only-handlers.ts
│   │   ├── gv-tag-parser.ts
│   │   ├── agent-workflow-map.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── executor/
│   │   ├── executor-budget.ts
│   │   ├── daemon-tick-handler.ts
│   │   ├── tick-driver.ts
│   │   ├── context-clearer.ts
│   │   └── index.ts
│   └── persistence/
│       ├── checkpoint-manager.ts
│       ├── snapshot-manager.ts
│       ├── replay-engine.ts
│       ├── startup-recovery.ts
│       ├── state-store.ts
│       ├── types.ts
│       └── index.ts
│
└── plugins/                              # LAYER 3
    ├── index.ts
    ├── mcp/                              # MCP tool handlers
    │   ├── mcp-server.ts
    │   ├── tool-handlers.ts
    │   ├── handlers/
    │   │   ├── status.ts
    │   │   ├── config.ts
    │   │   ├── workflow.ts
    │   │   ├── triggers.ts
    │   │   ├── agents.ts
    │   │   ├── events.ts
    │   │   ├── emit.ts
    │   │   ├── schemas.ts
    │   │   ├── shared.ts
    │   │   ├── types.ts
    │   │   └── index.ts
    │   └── index.ts
    ├── hooks/
    │   ├── hook-registry.ts
    │   ├── hook-processor.ts
    │   ├── handlers/
    │   │   ├── pre-tool-use.ts
    │   │   ├── post-tool-use.ts
    │   │   ├── session-start.ts
    │   │   ├── session-end.ts
    │   │   ├── subagent-start.ts
    │   │   ├── subagent-stop.ts
    │   │   ├── pre-compact.ts
    │   │   ├── user-prompt-submit.ts
    │   │   └── index.ts
    │   └── index.ts
    ├── time/
    │   ├── time-plugin.ts
    │   ├── heartbeat.ts
    │   ├── scheduler.ts
    │   └── index.ts
    ├── external/
    │   ├── external-plugin.ts
    │   ├── file-watcher.ts
    │   ├── http-listener.ts
    │   ├── normalizers/
    │   │   ├── generic.ts
    │   │   ├── github.ts
    │   │   └── index.ts
    │   └── index.ts
    └── wrfc/
        ├── wrfc-plugin.ts
        ├── directive-builder.ts
        ├── handlers.ts
        ├── score-evaluator.ts
        └── index.ts
```

**Key observations:**
- Every directory has an `index.ts` barrel
- Every extension has a `types.ts` for its domain types
- Files are atomic: one class/concern per file
- No file exceeds ~500 lines
- shared/ is 6 files + ipc/; core/ is types + 5 subdirs; extensions/ is 7 domains; plugins/ is 5 integration points

---

## Engine Migrations

### 1. Precision Engine (49,505 lines, 154 files)

#### Current Structure
```
src/
├── index.ts                    # MCP server + handler dispatch (455 lines)
├── config.ts                   # Defaults, excludes
├── logging.ts                  # Logger
├── runtime-config.ts           # Runtime config tool
├── types.ts                    # Shared types
├── schemas/index.ts            # Zod schemas
│
├── handlers/                   # FLAT: 12 tool handlers
│   ├── index.ts
│   ├── discover.ts
│   ├── precision-agent.ts
│   ├── precision-config.ts
│   ├── precision-edit.ts
│   ├── precision-exec.ts
│   ├── precision-fetch.ts
│   ├── precision-glob.ts
│   ├── precision-grep.ts
│   ├── precision-notebook.ts
│   ├── precision-read.ts
│   ├── precision-symbols.ts
│   └── precision-write.ts
│
├── state/                      # FLAT: 13 singletons dumped together
│   ├── index.ts
│   ├── precision-runtime.ts    # God-object orchestrator
│   ├── command-history.ts
│   ├── dossier.ts
│   ├── file-cache.ts
│   ├── hooks.ts
│   ├── kv-state.ts
│   ├── mode-manager.ts
│   ├── process-manager.ts
│   ├── project-index.ts
│   ├── project-indexer.ts
│   ├── search-cache.ts
│   ├── session-state.ts
│   └── telemetry.ts
│
├── core/                       # Search backends (misnamed — not "core" in the layer sense)
│   ├── index.ts
│   ├── ast-grep.ts
│   ├── languages.ts
│   ├── ripgrep.ts
│   └── tree-sitter.ts
│
└── utils/                      # FLAT: 30+ utility files
    ├── index.ts
    ├── context-intelligence.ts
    ├── deprecation.ts
    ├── errors.ts
    ├── exit-codes.ts
    ├── file-suggestions.ts
    ├── file-type-detection.ts
    ├── fuzzy.ts
    ├── grep-negation.ts
    ├── grep-pagination.ts
    ├── grep-ranking.ts
    ├── grep-relationships.ts
    ├── grep-replace-preview.ts
    ├── grep-stats.ts
    ├── lock-detection.ts
    ├── overflow-handler.ts
    ├── path-validation.ts
    ├── progress-collector.ts
    ├── retry-engine.ts
    ├── safe-overwrite.ts
    └── fetch/                  # Nested but still flat within
        ├── index.ts
        ├── auth/
        │   ├── auth-orchestrator.ts
        │   ├── index.ts
        │   ├── oauth2-browser.ts
        │   ├── oauth2-refresh.ts
        │   ├── session-auth.ts
        │   └── static-auth.ts
        ├── code-blocks.ts
        ├── content-fingerprint.ts
        ├── content-type.ts
        ├── cookie-jar.ts
        ├── css-selectors.ts
        ├── format-negotiation.ts
        ├── html-utils.ts
        ├── links.ts
        ├── pdf-routing.ts
        ├── rate-limiter.ts
        ├── readability.ts
        ├── redirect-tracker.ts
        ├── request-builder.ts
        ├── secrets-guard.ts
        ├── secrets-store.ts
        ├── service-registry.ts
        ├── service-resolver.ts
        ├── structured-data.ts
        ├── tables.ts
        └── turndown.ts
```

**Problems:**
1. `state/` is a dumping ground — 13 unrelated singletons with no grouping
2. `precision-runtime.ts` is a god-object that orchestrates all singletons
3. `core/` is actually search backends, not foundational types
4. `utils/` is flat with 30+ files — grep utils, fetch utils, file utils all mixed
5. `handlers/` are Layer 3 (MCP surface) but live at the same level as everything else
6. `index.ts` (455 lines) mixes server bootstrap, handler dispatch, and hook integration

#### Target Structure
```
src/
├── index.ts                              # Barrel exports only
├── server.ts                             # MCP server entry (from index.ts server logic)
├── bootstrap.ts                          # Init sequence (from precision-runtime.ts)
│
├── shared/                               # LAYER 0
│   ├── config.ts                         # ← from config.ts
│   ├── constants.ts                      # ← extracted from config.ts
│   ├── logger.ts                         # ← from logging.ts
│   ├── types.ts                          # ← from types.ts (OutputMode, PrecisionResult, etc.)
│   ├── errors.ts                         # ← from utils/errors.ts
│   └── index.ts
│
├── core/                                 # LAYER 1
│   ├── types.ts                          # Interfaces: FileReadResult, GrepMatch, EditSpec, etc.
│   ├── index.ts
│   ├── validation/                       # Pure validation logic
│   │   ├── path-validation.ts            # ← from utils/path-validation.ts
│   │   ├── schemas.ts                    # ← from schemas/index.ts
│   │   └── index.ts
│   └── utils/                            # Pure functions, no I/O, no state
│       ├── file-type-detection.ts        # ← from utils/file-type-detection.ts
│       ├── fuzzy.ts                      # ← from utils/fuzzy.ts
│       ├── exit-codes.ts                 # ← from utils/exit-codes.ts
│       ├── deprecation.ts               # ← from utils/deprecation.ts
│       └── index.ts
│
├── extensions/                           # LAYER 2
│   ├── index.ts
│   │
│   ├── cache/                            # File state caching
│   │   ├── file-cache.ts                 # ← from state/file-cache.ts
│   │   ├── search-cache.ts              # ← from state/search-cache.ts
│   │   └── index.ts
│   │
│   ├── session/                          # Session lifecycle
│   │   ├── session-state.ts             # ← from state/session-state.ts
│   │   ├── kv-state.ts                  # ← from state/kv-state.ts
│   │   ├── command-history.ts           # ← from state/command-history.ts
│   │   └── index.ts
│   │
│   ├── telemetry/                        # Token counting + cost tracking
│   │   ├── telemetry.ts                 # ← from state/telemetry.ts
│   │   ├── project-index.ts             # ← from state/project-index.ts
│   │   ├── project-indexer.ts           # ← from state/project-indexer.ts
│   │   └── index.ts
│   │
│   ├── hooks/                            # Phase 4G hook system
│   │   ├── hooks-manager.ts             # ← from state/hooks.ts
│   │   ├── mode-manager.ts              # ← from state/mode-manager.ts
│   │   └── index.ts
│   │
│   ├── process/                          # Background process management
│   │   ├── process-manager.ts           # ← from state/process-manager.ts
│   │   └── index.ts
│   │
│   ├── agent/                            # Agent dossier generation
│   │   ├── dossier.ts                   # ← from state/dossier.ts
│   │   └── index.ts
│   │
│   ├── search/                           # Search backends
│   │   ├── ripgrep.ts                   # ← from core/ripgrep.ts
│   │   ├── ast-grep.ts                  # ← from core/ast-grep.ts
│   │   ├── tree-sitter.ts              # ← from core/tree-sitter.ts
│   │   ├── languages.ts                # ← from core/languages.ts
│   │   └── index.ts
│   │
│   ├── grep/                             # Grep-specific processing
│   │   ├── pagination.ts               # ← from utils/grep-pagination.ts
│   │   ├── ranking.ts                  # ← from utils/grep-ranking.ts
│   │   ├── relationships.ts            # ← from utils/grep-relationships.ts
│   │   ├── replace-preview.ts          # ← from utils/grep-replace-preview.ts
│   │   ├── negation.ts                 # ← from utils/grep-negation.ts
│   │   ├── stats.ts                    # ← from utils/grep-stats.ts
│   │   └── index.ts
│   │
│   ├── file-ops/                         # File operation helpers
│   │   ├── safe-overwrite.ts            # ← from utils/safe-overwrite.ts
│   │   ├── lock-detection.ts            # ← from utils/lock-detection.ts
│   │   ├── overflow-handler.ts          # ← from utils/overflow-handler.ts
│   │   ├── file-suggestions.ts          # ← from utils/file-suggestions.ts
│   │   └── index.ts
│   │
│   ├── fetch/                            # HTTP fetch subsystem
│   │   ├── auth/                        # ← from utils/fetch/auth/ (unchanged)
│   │   │   ├── auth-orchestrator.ts
│   │   │   ├── oauth2-browser.ts
│   │   │   ├── oauth2-refresh.ts
│   │   │   ├── session-auth.ts
│   │   │   ├── static-auth.ts
│   │   │   └── index.ts
│   │   ├── content-type.ts              # ← from utils/fetch/
│   │   ├── content-fingerprint.ts
│   │   ├── code-blocks.ts
│   │   ├── cookie-jar.ts
│   │   ├── css-selectors.ts
│   │   ├── format-negotiation.ts
│   │   ├── html-utils.ts
│   │   ├── links.ts
│   │   ├── pdf-routing.ts
│   │   ├── rate-limiter.ts
│   │   ├── readability.ts
│   │   ├── redirect-tracker.ts
│   │   ├── request-builder.ts
│   │   ├── secrets-guard.ts
│   │   ├── secrets-store.ts
│   │   ├── service-registry.ts
│   │   ├── service-resolver.ts
│   │   ├── structured-data.ts
│   │   ├── tables.ts
│   │   ├── turndown.ts
│   │   └── index.ts
│   │
│   ├── context/                          # Context intelligence
│   │   ├── context-intelligence.ts      # ← from utils/context-intelligence.ts
│   │   ├── progress-collector.ts        # ← from utils/progress-collector.ts
│   │   └── index.ts
│   │
│   └── retry/                            # Retry logic
│       ├── retry-engine.ts              # ← from utils/retry-engine.ts
│       └── index.ts
│
└── plugins/                              # LAYER 3
    ├── index.ts
    └── mcp/
        ├── server.ts                     # ← from index.ts (server logic only)
        ├── handlers/
        │   ├── discover.ts              # ← from handlers/discover.ts
        │   ├── precision-agent.ts       # ← from handlers/precision-agent.ts
        │   ├── precision-config.ts      # ← from handlers/precision-config.ts
        │   ├── precision-edit.ts        # ← from handlers/precision-edit.ts
        │   ├── precision-exec.ts        # ← from handlers/precision-exec.ts
        │   ├── precision-fetch.ts       # ← from handlers/precision-fetch.ts
        │   ├── precision-glob.ts        # ← from handlers/precision-glob.ts
        │   ├── precision-grep.ts        # ← from handlers/precision-grep.ts
        │   ├── precision-notebook.ts    # ← from handlers/precision-notebook.ts
        │   ├── precision-read.ts        # ← from handlers/precision-read.ts
        │   ├── precision-symbols.ts     # ← from handlers/precision-symbols.ts
        │   ├── precision-write.ts       # ← from handlers/precision-write.ts
        │   └── index.ts                # ← from handlers/index.ts
        └── index.ts
```

**Migration summary:**
- `state/` explodes into 7 atomic extensions: cache, session, telemetry, hooks, process, agent, retry
- `precision-runtime.ts` god-object → `bootstrap.ts` initialization sequence
- `core/` (search backends) → `extensions/search/`
- `utils/` decomposes into 6 atomic extensions: grep, file-ops, fetch, context, retry + core/utils for pure functions
- `handlers/` → `plugins/mcp/handlers/`
- `index.ts` server logic → `plugins/mcp/server.ts`
- `utils/fetch/` → `extensions/fetch/` (already well-structured, just moves)

---

### 2. Analytics Engine (15,685 lines, 55 files)

#### Current Structure
```
src/
├── index.ts                    # AnalyticsEngine class (library API)
├── config.ts                   # Config loading, model pricing
├── types.ts                    # 50+ interfaces (462 lines)
├── server.ts                   # MCP server wrapper
├── dashboard.ts                # Shared TUI logic
├── mini.ts                     # Mini TUI entry
├── full.ts                     # Full TUI entry
│
├── handlers/                   # FLAT: 7 tool handlers
│   ├── index.ts
│   ├── types.ts
│   ├── budget.ts
│   ├── config.ts
│   ├── dashboard.ts
│   ├── export.ts
│   ├── query.ts
│   ├── sync.ts
│   └── tag.ts
│
├── schemas/                    # Input schemas
│   ├── index.ts
│   └── tools.ts
│
├── daemon/                     # FLAT: 8 background workers mixed together
│   ├── index.ts
│   ├── aggregator.ts           # God-object orchestrator (366+ lines)
│   ├── anomaly-detector.ts
│   ├── budget-tracker.ts
│   ├── memory-updater.ts
│   ├── report-generator.ts
│   ├── session-archiver.ts
│   └── watcher.ts
│
├── data/                       # FLAT: 14 data access files mixed together
│   ├── index.ts
│   ├── global-db.ts
│   ├── db-init.ts
│   ├── db-schema.ts
│   ├── historical-store.ts
│   ├── index-reader.ts
│   ├── jsonl-reader.ts
│   ├── jsonl-scanner.ts
│   ├── jsonl-types.ts
│   ├── jsonl-watcher.ts
│   ├── session-reader.ts
│   ├── sync-engine.ts
│   ├── tag-store.ts
│   └── telemetry-reader.ts
│
├── tmux/                       # Tmux integration
│   ├── index.ts
│   ├── detect.ts
│   └── manager.ts
│
└── tui/                        # Terminal UI renderers
    ├── index.ts
    ├── mini/
    │   ├── index.ts
    │   ├── format.ts
    │   └── renderer.ts
    └── full/
        ├── index.ts
        ├── pages/index.ts
        └── components/
            ├── index.ts
            └── text-utils.ts
```

**Problems:**
1. `daemon/` mixes 7 unrelated workers (aggregation, budget, anomaly, archival, memory sync)
2. `data/` mixes 3 concerns: SQLite (db-*), JSONL parsing (jsonl-*), and sync/tags
3. `aggregator.ts` is a god-object that orchestrates all daemon workers
4. `types.ts` is a 462-line monolith with 50+ interfaces
5. `tui/` and `tmux/` are plugins but live at the same level as data/
6. No separation between core types and domain logic

#### Target Structure
```
src/
├── index.ts                              # Barrel exports
├── bootstrap.ts                          # ← from index.ts (AnalyticsEngine class → init function)
│
├── shared/                               # LAYER 0
│   ├── config.ts                         # ← from config.ts
│   ├── logger.ts
│   ├── constants.ts                      # Model pricing, fallback costs
│   └── index.ts
│
├── core/                                 # LAYER 1
│   ├── types.ts                          # ← from types.ts (split: only interfaces/enums)
│   ├── index.ts
│   ├── schemas/                          # ← from schemas/
│   │   ├── tools.ts
│   │   └── index.ts
│   └── utils/
│       └── index.ts
│
├── extensions/                           # LAYER 2
│   ├── index.ts
│   │
│   ├── aggregation/                      # Session data aggregation
│   │   ├── aggregator.ts               # ← from daemon/aggregator.ts
│   │   ├── watcher.ts                  # ← from daemon/watcher.ts
│   │   └── index.ts
│   │
│   ├── budget/                           # Budget tracking
│   │   ├── budget-tracker.ts            # ← from daemon/budget-tracker.ts
│   │   └── index.ts
│   │
│   ├── anomaly/                          # Anomaly detection
│   │   ├── anomaly-detector.ts          # ← from daemon/anomaly-detector.ts
│   │   └── index.ts
│   │
│   ├── reporting/                        # Report generation + archival
│   │   ├── report-generator.ts          # ← from daemon/report-generator.ts
│   │   ├── session-archiver.ts          # ← from daemon/session-archiver.ts
│   │   └── index.ts
│   │
│   ├── memory/                           # Memory sync
│   │   ├── memory-updater.ts            # ← from daemon/memory-updater.ts
│   │   └── index.ts
│   │
│   ├── persistence/                      # Database + storage
│   │   ├── sqlite/                      # SQLite subsystem
│   │   │   ├── global-db.ts            # ← from data/global-db.ts
│   │   │   ├── db-init.ts              # ← from data/db-init.ts
│   │   │   ├── db-schema.ts            # ← from data/db-schema.ts
│   │   │   └── index.ts
│   │   ├── jsonl/                       # JSONL parsing subsystem
│   │   │   ├── jsonl-reader.ts         # ← from data/jsonl-reader.ts
│   │   │   ├── jsonl-scanner.ts        # ← from data/jsonl-scanner.ts
│   │   │   ├── jsonl-watcher.ts        # ← from data/jsonl-watcher.ts
│   │   │   ├── jsonl-types.ts          # ← from data/jsonl-types.ts
│   │   │   └── index.ts
│   │   ├── historical-store.ts          # ← from data/historical-store.ts
│   │   ├── session-reader.ts            # ← from data/session-reader.ts
│   │   ├── index-reader.ts              # ← from data/index-reader.ts
│   │   ├── sync-engine.ts              # ← from data/sync-engine.ts
│   │   ├── tag-store.ts                # ← from data/tag-store.ts
│   │   ├── telemetry-reader.ts         # ← from data/telemetry-reader.ts
│   │   └── index.ts
│   │
│   └── tmux/                             # Tmux pane management
│       ├── detect.ts                    # ← from tmux/detect.ts
│       ├── manager.ts                   # ← from tmux/manager.ts
│       └── index.ts
│
└── plugins/                              # LAYER 3
    ├── index.ts
    ├── mcp/                              # MCP tool handlers
    │   ├── server.ts                    # ← from server.ts
    │   ├── handlers/                    # ← from handlers/
    │   │   ├── budget.ts
    │   │   ├── config.ts
    │   │   ├── dashboard.ts
    │   │   ├── export.ts
    │   │   ├── query.ts
    │   │   ├── sync.ts
    │   │   ├── tag.ts
    │   │   ├── types.ts
    │   │   └── index.ts
    │   └── index.ts
    └── tui/                              # Terminal UI (plugin, not core)
        ├── dashboard.ts                 # ← from dashboard.ts
        ├── mini/                        # ← from tui/mini/
        │   ├── index.ts
        │   ├── format.ts
        │   └── renderer.ts
        ├── full/                        # ← from tui/full/
        │   ├── index.ts
        │   ├── pages/index.ts
        │   └── components/
        │       ├── index.ts
        │       └── text-utils.ts
        ├── mini-entry.ts               # ← from mini.ts
        ├── full-entry.ts               # ← from full.ts
        └── index.ts
```

**Migration summary:**
- `daemon/` explodes into 5 atomic extensions: aggregation, budget, anomaly, reporting, memory
- `data/` splits into `extensions/persistence/` with sqlite/ and jsonl/ sub-groups
- `tui/` and `tmux/` move to their correct layers (plugins/ and extensions/)
- `types.ts` monolith → `core/types.ts` (interfaces only) + domain types in each extension
- `AnalyticsEngine` class → `bootstrap.ts` init function

---

### 3. Frontend Engine (19,074 lines, 98 files)

#### Current Structure
```
src/
├── index.ts                    # MCP server (126 lines)
├── config.ts                   # Minimal (14 lines)
├── logging.ts
├── schemas/index.ts
│
└── handlers/                   # EVERYTHING lives here
    ├── index.ts                # Handler registry
    ├── react.ts                # Shared JSX parsing
    ├── jsx-class-utils.ts      # Shared Tailwind class utils
    ├── response-utils.ts       # Shared response formatting
    │
    ├── analyze-render-triggers.ts         # Top-level handler
    ├── render-triggers/                   # Sub-modules for above
    │   ├── index.ts
    │   ├── trigger-analyzers.ts
    │   ├── memoization-detector.ts
    │   ├── suggestion-generator.ts
    │   ├── types.ts
    │   └── utils.ts
    │
    ├── analyze-stacking-context.ts
    ├── stacking-context/
    │   ├── index.ts
    │   ├── context-rules.ts
    │   ├── issue-detector.ts
    │   ├── jsx-analyzer.ts
    │   ├── portal-detector.ts
    │   ├── tree-builder.ts
    │   ├── types.ts
    │   └── utils.ts
    │
    ├── analyze-layout-hierarchy.ts
    ├── layout-hierarchy-analyzers.ts
    ├── layout-hierarchy-core.ts
    ├── layout-hierarchy-utils.ts
    │
    ├── analyze-responsive-breakpoints.ts
    ├── responsive-breakpoints/
    │   ├── index.ts
    │   ├── breakpoint-resolver.ts
    │   ├── class-parser.ts
    │   ├── constants.ts
    │   ├── issue-detector.ts
    │   ├── jsx-extractor.ts
    │   ├── types.ts
    │   └── utils.ts
    │
    ├── trace-component-state.ts
    ├── component-state/
    │   ├── index.ts
    │   ├── component-detector.ts
    │   ├── hook-analyzer.ts
    │   ├── issue-detector.ts
    │   ├── jsx-analyzer.ts
    │   ├── props-analyzer.ts
    │   ├── types.ts
    │   └── utils.ts
    │
    ├── analyze-event-flow.ts
    ├── event-flow-analyzers.ts
    ├── event-flow-core.ts
    ├── event-flow-utils.ts
    │
    ├── get-accessibility-tree.ts
    ├── accessibility-tree-analyzers.ts
    ├── accessibility-tree-core.ts
    ├── accessibility-tree-utils.ts
    │
    ├── get-sizing-strategy.ts
    ├── sizing-strategy-analyzers.ts
    ├── sizing-strategy-core.ts
    ├── sizing-strategy-utils.ts
    │
    ├── analyze-tailwind-conflicts.ts
    ├── tailwind-conflicts-analyzers.ts
    ├── tailwind-conflicts-core.ts
    ├── tailwind-conflicts-utils.ts
    │
    ├── diagnose-overflow.ts
    ├── overflow-diagnosis/
    │   ├── index.ts
    │   ├── constraint-builder.ts
    │   ├── fix-generator.ts
    │   ├── pattern-detector.ts
    │   ├── types.ts
    │   └── utils.ts
    │
    ├── analyze-client-boundary.ts
    ├── client-boundary/
    │   ├── index.ts
    │   ├── graph-builder.ts
    │   ├── issue-detector.ts
    │   ├── scanner.ts
    │   └── types.ts
    │
    ├── analyze-error-boundaries.ts
    ├── error-boundaries/
    │   ├── index.ts
    │   ├── coverage-analyzer.ts
    │   ├── issue-detector.ts
    │   ├── scanner.ts
    │   └── types.ts
    │
    └── audit-hook-dependencies.ts
        hook-dependencies/
        ├── index.ts
        ├── hook-extractor.ts
        ├── issue-detector.ts
        ├── stability-analyzer.ts
        └── types.ts
```

**Problems:**
1. EVERYTHING is in `handlers/` — shared parsers, domain logic, and MCP handlers all mixed
2. Inconsistent structure: some tools use subdirectories, others use `{name}-analyzers.ts` / `{name}-core.ts` / `{name}-utils.ts` flat files
3. No shared/core layer — `react.ts` and `jsx-class-utils.ts` are shared parsers but live alongside handlers
4. No configuration beyond `getProjectRoot()`
5. Handler files (e.g., `analyze-render-triggers.ts`) are thin dispatchers that call into subdirectories — the handler IS the plugin layer, but it's mixed with the extension layer

#### Target Structure
```
src/
├── index.ts                              # Barrel exports
├── server.ts                             # ← from index.ts (server logic)
│
├── shared/                               # LAYER 0
│   ├── config.ts                         # ← from config.ts (expanded)
│   ├── logger.ts                         # ← from logging.ts
│   └── index.ts
│
├── core/                                 # LAYER 1
│   ├── types.ts                          # Shared analysis types
│   ├── index.ts
│   ├── parsers/                          # Shared parsing infrastructure
│   │   ├── jsx-parser.ts               # ← from handlers/react.ts
│   │   ├── jsx-class-utils.ts           # ← from handlers/jsx-class-utils.ts
│   │   └── index.ts
│   ├── schemas/                          # ← from schemas/
│   │   └── index.ts
│   └── utils/
│       ├── response-utils.ts            # ← from handlers/response-utils.ts
│       └── index.ts
│
├── extensions/                           # LAYER 2 — one dir per analysis domain
│   ├── index.ts
│   │
│   ├── render-triggers/                  # ← from handlers/render-triggers/
│   │   ├── trigger-analyzers.ts
│   │   ├── memoization-detector.ts
│   │   ├── suggestion-generator.ts
│   │   ├── types.ts
│   │   ├── utils.ts
│   │   └── index.ts
│   │
│   ├── stacking-context/                 # ← from handlers/stacking-context/
│   │   ├── context-rules.ts
│   │   ├── issue-detector.ts
│   │   ├── jsx-analyzer.ts
│   │   ├── portal-detector.ts
│   │   ├── tree-builder.ts
│   │   ├── types.ts
│   │   ├── utils.ts
│   │   └── index.ts
│   │
│   ├── layout-hierarchy/                 # ← from handlers/layout-hierarchy-*.ts
│   │   ├── analyzers.ts                 # ← layout-hierarchy-analyzers.ts
│   │   ├── core.ts                      # ← layout-hierarchy-core.ts
│   │   ├── utils.ts                     # ← layout-hierarchy-utils.ts
│   │   └── index.ts
│   │
│   ├── responsive-breakpoints/           # ← from handlers/responsive-breakpoints/
│   │   ├── breakpoint-resolver.ts
│   │   ├── class-parser.ts
│   │   ├── constants.ts
│   │   ├── issue-detector.ts
│   │   ├── jsx-extractor.ts
│   │   ├── types.ts
│   │   ├── utils.ts
│   │   └── index.ts
│   │
│   ├── component-state/                  # ← from handlers/component-state/
│   │   ├── component-detector.ts
│   │   ├── hook-analyzer.ts
│   │   ├── issue-detector.ts
│   │   ├── jsx-analyzer.ts
│   │   ├── props-analyzer.ts
│   │   ├── types.ts
│   │   ├── utils.ts
│   │   └── index.ts
│   │
│   ├── event-flow/                       # ← from handlers/event-flow-*.ts
│   │   ├── analyzers.ts                 # ← event-flow-analyzers.ts
│   │   ├── core.ts                      # ← event-flow-core.ts
│   │   ├── utils.ts                     # ← event-flow-utils.ts
│   │   └── index.ts
│   │
│   ├── accessibility-tree/               # ← from handlers/accessibility-tree-*.ts
│   │   ├── analyzers.ts                 # ← accessibility-tree-analyzers.ts
│   │   ├── core.ts                      # ← accessibility-tree-core.ts
│   │   ├── utils.ts                     # ← accessibility-tree-utils.ts
│   │   └── index.ts
│   │
│   ├── sizing-strategy/                  # ← from handlers/sizing-strategy-*.ts
│   │   ├── analyzers.ts                 # ← sizing-strategy-analyzers.ts
│   │   ├── core.ts                      # ← sizing-strategy-core.ts
│   │   ├── utils.ts                     # ← sizing-strategy-utils.ts
│   │   └── index.ts
│   │
│   ├── tailwind-conflicts/               # ← from handlers/tailwind-conflicts-*.ts
│   │   ├── analyzers.ts                 # ← tailwind-conflicts-analyzers.ts
│   │   ├── core.ts                      # ← tailwind-conflicts-core.ts
│   │   ├── utils.ts                     # ← tailwind-conflicts-utils.ts
│   │   └── index.ts
│   │
│   ├── overflow-diagnosis/               # ← from handlers/overflow-diagnosis/
│   │   ├── constraint-builder.ts
│   │   ├── fix-generator.ts
│   │   ├── pattern-detector.ts
│   │   ├── types.ts
│   │   ├── utils.ts
│   │   └── index.ts
│   │
│   ├── client-boundary/                  # ← from handlers/client-boundary/
│   │   ├── graph-builder.ts
│   │   ├── issue-detector.ts
│   │   ├── scanner.ts
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── error-boundaries/                 # ← from handlers/error-boundaries/
│   │   ├── coverage-analyzer.ts
│   │   ├── issue-detector.ts
│   │   ├── scanner.ts
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   └── hook-dependencies/                # ← from handlers/hook-dependencies/
│       ├── hook-extractor.ts
│       ├── issue-detector.ts
│       ├── stability-analyzer.ts
│       ├── types.ts
│       └── index.ts
│
└── plugins/                              # LAYER 3
    ├── index.ts
    └── mcp/
        ├── server.ts
        ├── handlers/                     # Thin dispatchers only
        │   ├── render-triggers.ts       # ← from handlers/analyze-render-triggers.ts
        │   ├── stacking-context.ts      # ← from handlers/analyze-stacking-context.ts
        │   ├── layout-hierarchy.ts      # ← from handlers/analyze-layout-hierarchy.ts
        │   ├── responsive-breakpoints.ts# ← from handlers/analyze-responsive-breakpoints.ts
        │   ├── component-state.ts       # ← from handlers/trace-component-state.ts
        │   ├── event-flow.ts            # ← from handlers/analyze-event-flow.ts
        │   ├── accessibility-tree.ts    # ← from handlers/get-accessibility-tree.ts
        │   ├── sizing-strategy.ts       # ← from handlers/get-sizing-strategy.ts
        │   ├── tailwind-conflicts.ts    # ← from handlers/analyze-tailwind-conflicts.ts
        │   ├── overflow.ts              # ← from handlers/diagnose-overflow.ts
        │   ├── client-boundary.ts       # ← from handlers/analyze-client-boundary.ts
        │   ├── error-boundaries.ts      # ← from handlers/analyze-error-boundaries.ts
        │   ├── hook-dependencies.ts     # ← from handlers/audit-hook-dependencies.ts
        │   └── index.ts
        └── index.ts
```

**Migration summary:**
- `handlers/` explodes — domain logic moves to `extensions/`, thin dispatchers stay in `plugins/mcp/handlers/`
- Shared parsers (`react.ts`, `jsx-class-utils.ts`) → `core/parsers/`
- Flat `{name}-analyzers.ts` / `{name}-core.ts` / `{name}-utils.ts` files → `extensions/{name}/` directories
- Already-structured subdirectories (`stacking-context/`, `component-state/`, etc.) just move from `handlers/` to `extensions/`
- Result: clean separation between "what the tool does" (extensions) and "how it's exposed" (plugins)

---

### 4. Project Engine (18,914 lines, 72 files)

#### Current Structure
```
src/
├── index.ts                    # MCP server (124 lines)
├── config.ts                   # Plugin/project root
├── logging.ts
├── types.ts
├── utils.ts
│
├── shared/                     # Exists but minimal
│   ├── constants.ts
│   ├── response.ts
│   └── utils.ts
│
├── schemas/                    # Per-domain schemas
│   ├── index.ts
│   ├── api.ts
│   ├── code-intelligence.ts
│   ├── database.ts
│   ├── deps.ts
│   ├── runtime.ts
│   ├── security.ts
│   ├── standalone.ts
│   └── testing.ts
│
└── handlers/                   # Domain-organized but all in handlers/
    ├── index.ts
    │
    ├── api/
    │   ├── index.ts
    │   ├── routes.ts
    │   ├── spec.ts
    │   ├── sync.ts
    │   └── validate.ts
    │
    ├── code-intelligence/
    │   ├── index.ts
    │   ├── api-surface.ts
    │   ├── breaking-changes.ts
    │   ├── dead-code.ts
    │   ├── preview-edits.ts
    │   ├── safe-delete.ts
    │   ├── semantic-diff.ts
    │   └── shared/
    │       ├── language-service.ts
    │       ├── lsp-utils.ts
    │       └── validation.ts
    │
    ├── database/
    │   ├── index.ts
    │   ├── prisma.ts
    │   ├── query.ts
    │   ├── schema.ts
    │   ├── query-database/
    │   │   ├── index.ts
    │   │   ├── handler.ts
    │   │   ├── drivers.ts
    │   │   ├── errors.ts
    │   │   ├── formatters.ts
    │   │   ├── query-analysis.ts
    │   │   ├── types.ts
    │   │   ├── url-parser.ts
    │   │   └── executors/
    │   │       ├── index.ts
    │   │       ├── mysql.ts
    │   │       ├── postgres.ts
    │   │       └── sqlite.ts
    │   └── shared/
    │       └── sqlite-connection.ts
    │
    ├── deps/
    │   ├── index.ts
    │   ├── analyze.ts
    │   ├── circular.ts
    │   └── upgrade.ts
    │
    ├── runtime/
    │   ├── index.ts
    │   ├── logs.ts
    │   ├── memory.ts
    │   └── profile.ts
    │
    ├── security/
    │   ├── index.ts
    │   ├── env-audit.ts
    │   ├── permissions.ts
    │   └── secrets.ts
    │
    ├── standalone/
    │   ├── index.ts
    │   ├── bundle.ts
    │   └── scaffold.ts
    │
    └── test/
        ├── index.ts
        ├── coverage.ts
        └── find-tests.ts
```

**Problems:**
1. Domain logic and MCP handler dispatch are merged — `handlers/api/routes.ts` does both argument parsing AND route discovery
2. `shared/` exists but is minimal (3 files) and not at the right layer
3. `schemas/` sits at the root level instead of in core/
4. `code-intelligence/shared/` has a `language-service.ts` that's really a reusable extension, not a handler utility
5. `database/query-database/executors/` is deeply nested but correctly atomic — just in the wrong layer

#### Target Structure
```
src/
├── index.ts                              # Barrel exports
├── server.ts                             # ← from index.ts (server logic)
│
├── shared/                               # LAYER 0
│   ├── config.ts                         # ← from config.ts
│   ├── constants.ts                      # ← from shared/constants.ts
│   ├── logger.ts                         # ← from logging.ts
│   ├── response.ts                       # ← from shared/response.ts
│   └── index.ts
│
├── core/                                 # LAYER 1
│   ├── types.ts                          # ← from types.ts
│   ├── index.ts
│   ├── schemas/                          # ← from schemas/ (moved into correct layer)
│   │   ├── api.ts
│   │   ├── code-intelligence.ts
│   │   ├── database.ts
│   │   ├── deps.ts
│   │   ├── runtime.ts
│   │   ├── security.ts
│   │   ├── standalone.ts
│   │   ├── testing.ts
│   │   └── index.ts
│   └── utils/
│       ├── utils.ts                     # ← from utils.ts + shared/utils.ts (merged)
│       └── index.ts
│
├── extensions/                           # LAYER 2
│   ├── index.ts
│   │
│   ├── code-intelligence/                # ← from handlers/code-intelligence/
│   │   ├── language-service.ts          # ← from shared/language-service.ts
│   │   ├── lsp-utils.ts                # ← from shared/lsp-utils.ts
│   │   ├── validation.ts              # ← from shared/validation.ts
│   │   ├── api-surface.ts
│   │   ├── breaking-changes.ts
│   │   ├── dead-code.ts
│   │   ├── preview-edits.ts
│   │   ├── safe-delete.ts
│   │   ├── semantic-diff.ts
│   │   └── index.ts
│   │
│   ├── api/                              # ← from handlers/api/
│   │   ├── routes.ts
│   │   ├── spec.ts
│   │   ├── sync.ts
│   │   ├── validate.ts
│   │   └── index.ts
│   │
│   ├── database/                         # ← from handlers/database/
│   │   ├── prisma.ts
│   │   ├── schema.ts
│   │   ├── query.ts
│   │   ├── sqlite-connection.ts         # ← from shared/sqlite-connection.ts
│   │   ├── query-engine/               # ← from query-database/ (renamed)
│   │   │   ├── handler.ts
│   │   │   ├── drivers.ts
│   │   │   ├── errors.ts
│   │   │   ├── formatters.ts
│   │   │   ├── query-analysis.ts
│   │   │   ├── types.ts
│   │   │   ├── url-parser.ts
│   │   │   ├── executors/
│   │   │   │   ├── mysql.ts
│   │   │   │   ├── postgres.ts
│   │   │   │   ├── sqlite.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── security/                         # ← from handlers/security/
│   │   ├── env-audit.ts
│   │   ├── permissions.ts
│   │   ├── secrets.ts
│   │   └── index.ts
│   │
│   ├── deps/                             # ← from handlers/deps/
│   │   ├── analyze.ts
│   │   ├── circular.ts
│   │   ├── upgrade.ts
│   │   └── index.ts
│   │
│   ├── runtime/                          # ← from handlers/runtime/
│   │   ├── logs.ts
│   │   ├── memory.ts
│   │   ├── profile.ts
│   │   └── index.ts
│   │
│   ├── test/                             # ← from handlers/test/
│   │   ├── coverage.ts
│   │   ├── find-tests.ts
│   │   └── index.ts
│   │
│   └── standalone/                       # ← from handlers/standalone/
│       ├── bundle.ts
│       ├── scaffold.ts
│       └── index.ts
│
└── plugins/                              # LAYER 3
    ├── index.ts
    └── mcp/
        ├── server.ts
        ├── handlers/                     # Thin dispatchers to extensions
        │   ├── code-intelligence.ts      # dispatches to extensions/code-intelligence/
        │   ├── api.ts
        │   ├── database.ts
        │   ├── security.ts
        │   ├── deps.ts
        │   ├── runtime.ts
        │   ├── test.ts
        │   ├── standalone.ts
        │   └── index.ts
        └── index.ts
```

**Migration summary:**
- Already the closest to target — domains are well-separated within handlers/
- Primary change: `handlers/` domains → `extensions/` domains, thin handler shells remain in `plugins/mcp/handlers/`
- `schemas/` → `core/schemas/`
- `shared/` content redistributed to proper layers
- `code-intelligence/shared/language-service.ts` promoted to extension-level utility
- `database/query-database/` renamed to `database/query-engine/` for clarity

---

### 5. Registry Engine (1,196 lines, 10 files)

#### Current Structure
```
src/
├── index.ts                    # MCP server + LazyRegistryLoader (299 lines)
├── config.ts                   # Plugin root, Fuse options
├── logging.ts
├── types.ts
├── utils.ts                    # loadRegistry, createIndex
│
├── schemas/index.ts
│
└── handlers/
    ├── index.ts                # Handler dispatch
    ├── search.ts               # search_skills, search_agents, search_tools
    ├── content.ts              # get_skill_content, get_agent_content
    └── dependencies.ts         # skill_dependencies
```

**Problems:**
1. `index.ts` does too much — server setup, LazyRegistryLoader class, handler dispatch all in 299 lines
2. `utils.ts` has `loadRegistry` and `createIndex` which are extension-level concerns, not utilities
3. Only 10 files — barely any structure at all
4. No separation between indexing logic and search logic

#### Target Structure
```
src/
├── index.ts                              # Barrel exports
├── server.ts                             # ← from index.ts (server logic only)
│
├── shared/                               # LAYER 0
│   ├── config.ts                         # ← from config.ts
│   ├── logger.ts                         # ← from logging.ts
│   └── index.ts
│
├── core/                                 # LAYER 1
│   ├── types.ts                          # ← from types.ts
│   ├── index.ts
│   ├── schemas/                          # ← from schemas/
│   │   └── index.ts
│   └── utils/
│       └── index.ts
│
├── extensions/                           # LAYER 2
│   ├── index.ts
│   │
│   ├── indexing/                         # Registry loading + Fuse indexing
│   │   ├── registry-loader.ts           # ← from index.ts (LazyRegistryLoader)
│   │   ├── fuse-adapter.ts             # ← from utils.ts (createIndex)
│   │   └── index.ts
│   │
│   ├── search/                           # Search logic
│   │   ├── search.ts                    # ← search logic from handlers/search.ts
│   │   └── index.ts
│   │
│   ├── content/                          # Content retrieval
│   │   ├── content.ts                   # ← content logic from handlers/content.ts
│   │   └── index.ts
│   │
│   └── dependencies/                     # Dependency resolution
│       ├── resolver.ts                  # ← from handlers/dependencies.ts
│       └── index.ts
│
└── plugins/                              # LAYER 3
    ├── index.ts
    └── mcp/
        ├── server.ts
        ├── handlers/
        │   ├── search.ts                # Thin dispatcher
        │   ├── content.ts               # Thin dispatcher
        │   ├── dependencies.ts          # Thin dispatcher
        │   └── index.ts
        └── index.ts
```

**Migration summary:**
- `LazyRegistryLoader` extracted from `index.ts` → `extensions/indexing/registry-loader.ts`
- `loadRegistry`, `createIndex` from `utils.ts` → `extensions/indexing/`
- Handler business logic → `extensions/{domain}/`
- Handler dispatch (arg parsing, response formatting) → `plugins/mcp/handlers/`
- Small engine, but same pattern applies

---

## Decomposition Rules

These rules determine where a file belongs:

| Question | Answer → Layer |
|----------|----------------|
| Is it config, logging, or constants? | **shared/** (Layer 0) |
| Is it a type definition, interface, schema, or pure function with no I/O? | **core/** (Layer 1) |
| Does it own a specific domain concern with state, logic, or I/O? | **extensions/** (Layer 2) |
| Does it parse MCP args, format responses, or serve as an entry point? | **plugins/** (Layer 3) |
| Is it a god-object that orchestrates other modules? | **bootstrap.ts** (decompose it) |
| Is it a utility used by only one domain? | Inside that domain's **extensions/{domain}/** |
| Is it a utility used across multiple domains? | **core/utils/** |

### Atomic Decomposition Checklist

- [ ] No file exceeds ~500 lines
- [ ] Each file has one export (class, function set, or type set)
- [ ] Each `extensions/` directory owns exactly one concern
- [ ] Each `extensions/` directory has its own `types.ts` and `index.ts`
- [ ] `plugins/mcp/handlers/` files are thin dispatchers (< 50 lines each)
- [ ] `core/` has zero I/O, zero state, zero side effects
- [ ] `shared/` contains only cross-cutting infrastructure
- [ ] Dependencies only flow downward (Layer 3 → 2 → 1 → 0)
- [ ] No singleton pattern — use bootstrap injection or lazy initialization in the correct layer
- [ ] Every directory has an `index.ts` barrel

### What NOT to do

- Don't create `extensions/` dirs for things that are pure utilities → put those in `core/utils/`
- Don't mix handler dispatch with domain logic → split them across plugins/ and extensions/
- Don't create a god-object bootstrap that imports everything → keep it to initialization order
- Don't put schemas in a top-level `schemas/` dir → they belong in `core/schemas/`
- Don't nest domain logic inside `handlers/` → handlers are Layer 3, domain logic is Layer 2

---

## Execution Order

| # | Engine | Files | Effort | Rationale |
|---|--------|-------|--------|----------|
| 1 | **Registry** | 10 | Small | Simplest engine. Prove the pattern works. |
| 2 | **Project** | 72 | Small | Already domain-organized. Mostly a move from handlers/ to extensions/. |
| 3 | **Frontend** | 98 | Medium | 14 analysis domains already have subdirectories. Flat `{name}-*.ts` files need grouping. |
| 4 | **Analytics** | 55 | Medium | daemon/ and data/ need splitting. TUI moves to plugins/. |
| 5 | **Precision** | 154 | Large | state/ god-objects need full decomposition. Most files to move. |

---

*Generated from analysis of 566 source files across 6 engines (131,081 total lines).*