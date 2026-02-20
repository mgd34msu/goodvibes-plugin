# Analysis Engine Deep Analysis

## Tool Inventory (21 registered + 8 unregistered)

The analysis engine is mostly production-ready code, with a few notable gaps: 3 sub-stubs in `identify_tech_debt`, hardcoded naming conventions in `scan_patterns`, and 8 fully implemented handlers that are not wired into the MCP registry.

**Location:** `plugins/goodvibes/tools/implementations/analysis-engine/src/`

### Registered Tools (21)

| # | Tool | Lines | Description |
|---|------|-------|-------------|
| 1 | `detect_stack` | ~100 | Heuristic stack detection via package.json dependency name matching |
| 2 | `check_versions` | 216 | Reads package.json, optionally calls `npm view` for latest versions, detects outdated/major bumps |
| 3 | `scan_patterns` | ~100 | Barrel exports, folder structure heuristics, test/styling detection. **Naming conventions are hardcoded defaults** |
| 4 | `read_config` | 113 | Reads named config files (tsconfig, eslint, prettier, tailwind, next, vite, prisma, env) |
| 5 | `get_conventions` | 689 | LLM-powered convention inference via `claude` CLI subprocess, with static fallback |
| 6 | `find_dead_code` | 465 | AST walk + `getReferencesAtPosition()` to find exports with zero external references |
| 7 | `get_api_surface` | 637 | Auto-detects entry points, uses `checker.getExportsOfModule()` to enumerate and classify exports |
| 8 | `safe_delete_check` | 330 | Uses `getReferencesAtPosition()` to determine if a symbol can be safely removed |
| 9 | `detect_breaking_changes` | 560 | Git diff + TS symbol extraction + `claude` CLI for breaking change analysis |
| 10 | `semantic_diff` | 620 | Git diff + TS symbol extraction + `claude` CLI for semantic impact analysis |
| 11 | `validate_edits_preview` | 542 | Virtual FS with dual TS Language Service instances to preview edit impacts without disk writes |
| 12 | `validate_implementation` | 333 | Orchestrates 7 check modules (security, structure, error handling, TypeScript, naming, best practices, skill patterns) |
| 13 | `validate_api_contract` | 558 | Loads OpenAPI/Swagger spec, makes live HTTP requests, validates responses against schema with recursive `$ref` resolution |
| 14 | `env_audit` | 538 | Cross-references `.env`, `.env.example`, and source code `process.env` usage |
| 15 | `scan_for_secrets` | 743 | 20+ regex patterns for AWS keys, GitHub tokens, private keys, DB URLs, JWT, Stripe, etc. |
| 16 | `check_permissions` | 709 | 30+ API usage patterns across filesystem, network, process, and crypto categories with risk assessment |
| 17 | `parse_error_stack` | 375 | Multi-format stack trace parser (V8, Firefox, Safari) with source code preview |
| 18 | `explain_type_error` | 659 | Static lookup database of 17 TS error codes + 6 message patterns + context-aware suggestions |
| 19 | `find_circular_deps` | 514 | DFS-based cycle detection on import graph with canonical deduplication |
| 20 | `identify_tech_debt` | 644 | Aggregator tool running 6 sub-analyses. **3 of 6 are stubs** (coverage, type_errors, todos) |
| 21 | `get_conventions` | — | **Duplicate entry in registry** (same handler as #5) |

### Unregistered Tools (8 fully implemented, not reachable via MCP)

| # | Tool | Lines | Description |
|---|------|-------|-------------|
| U1 | `check_types` | ~50 | Runs `npx tsc --noEmit`, parses output. Exported but not in registry |
| U2 | `analyze_dependencies` | 387 | Dependency graph analysis. Fully implemented, never registered |
| U3 | `env_audit` (handleEnvAudit) | 651 | Alternate env auditor, more detailed than registered version. Dead code |
| U4 | `get_env_config` | 387 | Env config discovery and documentation. Fully implemented, never registered |
| U5 | `detect_memory_leaks` | 573 | RSS monitoring with linear regression, cross-platform. Fully implemented |
| U6 | `generate_types` | 602 | TypeScript interface generation from JSON data (URL, file, inline). Fully implemented |
| U7 | `log_analyzer` | 964 | Log file analysis with anomaly detection, rate analysis, deduplication. Largest handler |
| U8 | `profile_function` | 567 | Function profiling with warmup, stats (mean/median/p95/p99), memory tracking |

**Total unregistered code: ~4,350+ lines of fully implemented, inaccessible handlers.**

---

## Stubs/Placeholders

| File | Location | Description |
|------|----------|-------------|
| `analysis/identify-tech-debt.ts` | Lines 401-406 | `analyzeCoverage()` — stub returning `{uncoveredPercent: 0, issues: []}` with comment "stub - not yet migrated" |
| `analysis/identify-tech-debt.ts` | Lines 410-412 | `analyzeTypeErrors()` — stub returning `{count: 0, issues: []}` with comment "stub - not yet migrated" |
| `analysis/identify-tech-debt.ts` | Lines 416-418 | `analyzeTodos()` — stub returning `{high: 0, medium: 0, low: 0, issues: []}` with comment "stub - not yet migrated" |
| `handlers/context.ts` | ~lines 150-175 | `scan_patterns` naming convention fields (`component_naming`, `file_naming`) return hardcoded `'PascalCase'` / `'kebab-case'` instead of detected values |
| `schemas/index.ts` | Lines 37-44 | `analysis-schemas.ts` exists but is NOT imported into `ALL_SCHEMAS` — tools in the analysis/ group have no MCP schema advertised |

No `throw new Error('not implemented')` patterns exist anywhere. The stubs are explicit with inline comments.

---

## File Structure

```
analysis-engine/
├── package.json                         # ESM source, CJS bundle output
├── tsconfig.json                        # ES2022, strict, NodeNext
├── build.mjs                            # esbuild → dist/index.cjs (all deps bundled)
├── src/
│   ├── index.ts                         # MCP server entry point (137 lines)
│   ├── config.ts                        # Configuration, env vars, Fuse.js options (66 lines)
│   ├── types.ts                         # Shared types (ToolResponse)
│   ├── utils.ts                         # Shared utilities incl. deprecated success()/error() (393 lines)
│   ├── logging.ts                       # Structured stderr logger (61 lines)
│   ├── handlers/
│   │   ├── index.ts                     # Re-exports all handlers (62 lines)
│   │   ├── registry.ts                  # Handler registry — 21 tool mappings (96 lines)
│   │   ├── types.ts                     # HandlerContext, ToolHandler types (99 lines)
│   │   ├── response-utils.ts            # Preferred response helpers (205 lines)
│   │   ├── context.ts                   # detect_stack, scan_patterns (208 lines)
│   │   ├── config.ts                    # read_config (113 lines)
│   │   ├── npm.ts                       # check_versions (216 lines)
│   │   ├── lsp/
│   │   │   ├── index.ts                 # Re-exports
│   │   │   ├── language-service.ts      # TS Language Service singleton + cache (495 lines)
│   │   │   ├── utils.ts                 # Shared LSP utilities
│   │   │   ├── validation.ts            # LSP arg validation helpers (129 lines)
│   │   │   ├── dead-code.ts             # find_dead_code (465 lines)
│   │   │   ├── api-surface.ts           # get_api_surface (637 lines)
│   │   │   ├── safe-delete-check.ts     # safe_delete_check (330 lines)
│   │   │   ├── breaking-changes.ts      # detect_breaking_changes (560 lines)
│   │   │   ├── semantic-diff.ts         # semantic_diff (620 lines)
│   │   │   └── validate-edits-preview.ts # validate_edits_preview (542 lines)
│   │   ├── security/
│   │   │   ├── index.ts
│   │   │   ├── secrets-scanner.ts        # scan_for_secrets (743 lines)
│   │   │   └── permissions.ts           # check_permissions (709 lines)
│   │   ├── errors/
│   │   │   ├── index.ts
│   │   │   ├── stack-parser.ts          # parse_error_stack (375 lines)
│   │   │   └── type-explainer.ts        # explain_type_error (659 lines)
│   │   ├── deps/
│   │   │   ├── index.ts
│   │   │   ├── circular.ts              # find_circular_deps (514 lines)
│   │   │   └── analyze.ts              # analyze_dependencies — UNREGISTERED (387 lines)
│   │   ├── validation/
│   │   │   ├── index.ts                 # validate_implementation + check_types (333 lines)
│   │   │   ├── types.ts                 # Validation arg types
│   │   │   ├── api-contract.ts          # validate_api_contract (558 lines)
│   │   │   ├── best-practices-checks.ts # Best practices linting (104 lines)
│   │   │   ├── error-handling-checks.ts # Error handling checks (71 lines)
│   │   │   ├── naming-checks.ts         # Naming convention checks (77 lines)
│   │   │   ├── security-checks.ts       # Security pattern checks (122 lines)
│   │   │   ├── skill-pattern-checks.ts  # Skill verification checks (78 lines)
│   │   │   ├── structure-checks.ts      # Structural checks (103 lines)
│   │   │   └── typescript-checks.ts     # TypeScript-specific checks (67 lines)
│   │   ├── env/
│   │   │   ├── index.ts
│   │   │   ├── env-audit.ts             # Alternate env auditor — UNREGISTERED (651 lines)
│   │   │   └── validate-env-complete.ts # env_audit (registered) (538 lines)
│   │   ├── project/
│   │   │   ├── index.ts
│   │   │   ├── conventions.ts           # get_conventions (689 lines)
│   │   │   └── env-config.ts            # get_env_config — UNREGISTERED (387 lines)
│   │   └── analysis/
│   │       ├── index.ts                 # Re-exports (49 lines)
│   │       ├── identify-tech-debt.ts    # identify_tech_debt — PARTIALLY IMPLEMENTED (644 lines)
│   │       ├── detect-memory-leaks.ts   # detect_memory_leaks — UNREGISTERED (573 lines)
│   │       ├── generate-types.ts        # generate_types — UNREGISTERED (602 lines)
│   │       ├── log-analyzer.ts          # log_analyzer — UNREGISTERED (964 lines)
│   │       └── profile-function.ts      # profile_function — UNREGISTERED (567 lines)
│   └── schemas/
│       ├── index.ts                     # ALL_SCHEMAS aggregator (55 lines)
│       ├── context-schemas.ts           # Schemas for context tools (82 lines)
│       ├── lsp-schemas.ts               # Schemas for LSP tools (76 lines)
│       ├── validation-schemas.ts        # Schemas for validation tools (125 lines)
│       ├── security-schemas.ts          # Schemas for security tools (45 lines)
│       ├── error-schemas.ts             # Schemas for error tools (32 lines)
│       ├── deps-schemas.ts              # Schemas for dependency tools (18 lines)
│       └── analysis-schemas.ts          # Schemas for analysis tools — NOT IMPORTED (39 lines)
```

---

## Implementation Depth

### Handler Pattern

Flat async function exports with no dependency injection:

```typescript
export async function handleXxx(args: unknown): Promise<CallToolResult> {
  // Real implementation
  return createSuccessResponse(result);
}
```

Registry in `handlers/registry.ts`:
```typescript
export const handlerRegistry = new Map<string, ToolHandler>([
  ['tool_name', handleToolName],
]);
```

Two response utility systems exist (both produce MCP `CallToolResult`):
- **Preferred:** `createSuccessResponse()` / `createErrorResponse()` from `response-utils.ts`
- **Deprecated:** `success()` / `error()` from `utils.ts` (still used by newer analysis/ files)

### Complexity Tiers

**Tier 1 — Simple (Read/lookup pattern):**
- `detect_stack` — dependency name matching against package.json
- `scan_patterns` — folder structure heuristics (naming detection is hardcoded)
- `read_config` — synchronous file reads with JSON parse
- `explain_type_error` — static lookup database, no I/O
- `list_templates` equivalent: none (project_engine territory)

**Tier 2 — Medium (Analysis with I/O):**
- `check_versions` — npm CLI subprocess + output parsing
- `find_circular_deps` — import graph construction + DFS cycle detection
- `parse_error_stack` — multi-format regex parsing + source preview
- `env_audit` — multi-source env var reconciliation
- `check_permissions` — 30+ pattern table with risk scoring
- `validate_implementation` — orchestrates 7 check modules

**Tier 3 — Complex (TS compiler API / LLM / runtime):**
- `find_dead_code` (465 lines) — TS Language Service reference counting
- `get_api_surface` (637 lines) — TS type checker for export enumeration
- `safe_delete_check` (330 lines) — TS reference analysis
- `detect_breaking_changes` (560 lines) — git diff + TS symbols + `claude` CLI
- `semantic_diff` (620 lines) — git diff + TS symbols + `claude` CLI
- `validate_edits_preview` (542 lines) — dual virtual TS Language Service instances
- `validate_api_contract` (558 lines) — live HTTP testing against OpenAPI spec
- `scan_for_secrets` (743 lines) — 20+ regex patterns with recursive scanning
- `get_conventions` (689 lines) — LLM-powered with static fallback
- `log_analyzer` (964 lines) — largest handler, anomaly detection + rate analysis
- `detect_memory_leaks` (573 lines) — RSS monitoring + linear regression
- `profile_function` (567 lines) — dynamic import + statistical profiling
- `generate_types` (602 lines) — type inference engine from JSON samples

### Shared Infrastructure: LSP Language Service

All 6 LSP handlers share `lsp/language-service.ts` (495 lines) — a singleton `LanguageServiceManagerImpl` that:
- Caches TS Language Service instances keyed by tsconfig.json path
- Configurable TTL via `LSP_CACHE_TTL_MS` env var (default 5 min)
- Uses `ts.createDocumentRegistry()` for cross-project sharing
- Provides `getService(filePath)` which auto-discovers tsconfig

---

## External Dependencies

| Dependency | Type | Used By |
|------------|------|--------|
| `@modelcontextprotocol/sdk` | Runtime | MCP server protocol |
| `js-yaml` | Runtime | `validate_api_contract` (OpenAPI spec parsing) |
| `fuse.js` | Runtime | `utils.ts` search utilities |
| `typescript` compiler API | Runtime | All 6 LSP handlers |
| `claude` CLI binary | Subprocess | `get_conventions`, `detect_breaking_changes`, `semantic_diff` |
| `git` CLI | Subprocess | `detect_breaking_changes`, `semantic_diff` |
| `npm` CLI | Subprocess | `check_versions`, `analyze_dependencies` (unregistered) |
| `npx tsc` | Subprocess | `check_types` (unregistered) |
| `ps`/`tasklist` | Subprocess | `detect_memory_leaks` (unregistered, cross-platform) |
| Node built-ins | Runtime | All handlers (fs, path, child_process, http/https, url, perf_hooks) |

---

## Critical Discrepancies

### 1. 8 Fully Implemented Handlers Are Inaccessible

~4,350+ lines of production code cannot be called by any MCP client because the handlers are not in `registry.ts`. This includes sophisticated tools like `log_analyzer` (964 lines), `generate_types` (602 lines), `detect_memory_leaks` (573 lines), and `profile_function` (567 lines).

### 2. `analysis-schemas.ts` Not Wired Into `ALL_SCHEMAS`

The schema file exists but is not imported in `schemas/index.ts`. Even if the analysis/ handlers were registered, they would have no advertised schema.

### 3. Duplicate Registry Entry

`get_conventions` appears twice in the registry (entries #5 and #21 point to the same handler). The registry has 21 entries but only 20 unique tools.

### 4. Stale Documentation

`index.ts` comment says "20 total" but registry has 21 entries.

### 5. Deprecated Response Utilities Still in Use

Newer files (`validate-env-complete.ts`, `env-config.ts`, `detect-memory-leaks.ts`, `profile-function.ts`, `log-analyzer.ts`) use deprecated `success()`/`error()` from `utils.ts` instead of the preferred `createSuccessResponse()`/`createErrorResponse()` from `response-utils.ts`.

### 6. Duplicate Env Functionality

`env/validate-env-complete.ts` (registered as `env_audit`) and `env/env-audit.ts` (unregistered) overlap significantly — both scan source files for env var usage with the same regex patterns. Additionally, `project/env-config.ts` (also unregistered) covers similar ground.

### 7. `identify_tech_debt` Has 3 Stub Sub-Analyses

The aggregator runs 6 sub-analyses but only 3 are real (dead code, circular deps, security). Coverage, type errors, and TODO scanning return neutral placeholder scores with "stub - not yet migrated" comments.

---

## Overlap Analysis with Other Engines

### DIRECT DUPLICATE (100% overlap)

| Analysis Engine | Other Engine | Verdict |
|----------------|-------------|--------|
| `find_circular_deps` | `project_engine:find_circular_deps` | **Identical purpose.** Both do DFS cycle detection on import graphs. One should be removed. |
| `generate_types` (unregistered) | `project_engine:generate_types` | **Identical purpose.** Both generate TypeScript types from data. Analysis engine version is more sophisticated (multi-sample merging) but unreachable. |

### HIGH OVERLAP (50-70%)

| Analysis Engine | Other Engine(s) | Overlap | Notes |
|----------------|----------------|---------|-------|
| `detect_stack` + `scan_patterns` + `get_conventions` | `project_engine:explain_codebase` | **~60%** | Analysis engine splits into 3 focused tools; project_engine does it in one LLM call. Analysis engine is more precise/granular. |
| `env_audit` | `project_engine:project_issues` (env checking) | **~50%** | Both cross-reference env files with source code. Analysis engine is more comprehensive. |

### MODERATE OVERLAP (25-50%)

| Analysis Engine | Other Engine(s) | Overlap | Notes |
|----------------|----------------|---------|-------|
| `get_api_surface` | `project_engine:get_api_routes` | **~30%** | Analysis engine finds exported API surface; project_engine finds HTTP routes. Related but different focus. |
| `validate_api_contract` | `project_engine:sync_api_types` | **~25%** | Analysis engine validates live responses against OpenAPI spec; project_engine detects type drift between backend/frontend. Complementary. |
| `check_versions` | `project_engine:analyze_dependencies` | **~40%** | Analysis engine checks versions; project_engine finds unused/missing/outdated. Different angles, same domain. |
| `analyze_dependencies` (unregistered) | `project_engine:analyze_dependencies` | **~40%** | Both analyze dependency graphs. |
| `validate_implementation` | `precision_engine` validation features | **~30%** | Analysis engine runs 7 static check modules; precision_engine has typecheck/lint/test validation hooks. |

### LOW OVERLAP (<25%)

| Analysis Engine | Nearest Equivalent | Overlap | Notes |
|----------------|-------------------|---------|-------|
| `scan_for_secrets` | Security audit skill | ~20% | Skill may use this tool; pattern overlap possible |
| `identify_tech_debt` | Multiple tools combined | ~15% | Aggregator calling other analysis-engine handlers |

### ZERO OVERLAP (completely unique)

| Tool | Why It's Unique |
|------|----------------|
| `validate_edits_preview` | Virtual FS + dual TS Language Service — no other engine previews edit impacts without disk writes |
| `detect_breaking_changes` | LLM-powered breaking change analysis from git diffs with TS symbol extraction |
| `semantic_diff` | LLM-powered semantic impact analysis, distinct from textual diff |
| `safe_delete_check` | TS reference counting to determine if symbol removal is safe |
| `find_dead_code` | TS Language Service-based dead export detection |
| `check_permissions` | API usage pattern scanning with risk classification |
| `parse_error_stack` | Multi-format stack trace parser (V8/Firefox/Safari) |
| `explain_type_error` | Static TS error code database with context-aware suggestions |
| `detect_memory_leaks` (unregistered) | Runtime RSS monitoring with linear regression leak detection |
| `profile_function` (unregistered) | Dynamic import + statistical function profiling |
| `log_analyzer` (unregistered) | Log parsing with anomaly detection, rate analysis, deduplication |

---

## Replaceability Assessment

| Tool | Replaceable? | How | Effort |
|------|-------------|-----|--------|
| `detect_stack` | Yes | `precision_read` on package.json + agent heuristics | Low |
| `check_versions` | Mostly | `precision_exec` (npm outdated) + agent parsing | Low |
| `scan_patterns` | Yes | `precision_glob` + `precision_grep` + agent analysis | Low |
| `read_config` | Yes | `precision_read` on config files | Low |
| `get_conventions` | Mostly | Agent can analyze sampled files natively | Low |
| `find_dead_code` | No | Requires TS Language Service reference counting | High |
| `get_api_surface` | No | Requires TS type checker `getExportsOfModule()` | High |
| `safe_delete_check` | No | Requires TS Language Service reference analysis | High |
| `detect_breaking_changes` | Partially | `precision_exec` (git diff) + agent analysis, but loses TS symbol extraction | Medium-High |
| `semantic_diff` | Partially | Same as above | Medium-High |
| `validate_edits_preview` | No | Virtual FS + dual TS Language Service is unique infrastructure | Very High |
| `validate_implementation` | Mostly | Agent can run similar checks; 7 modules are mostly regex | Medium |
| `validate_api_contract` | No | Live HTTP testing + recursive OpenAPI schema validation | High |
| `env_audit` | Mostly | `precision_grep` for `process.env` + `precision_read` on .env files | Low-Medium |
| `scan_for_secrets` | Partially | `precision_grep` with secret patterns, but loses structured output/redaction | Medium |
| `check_permissions` | Partially | `precision_grep` for API patterns, but loses risk classification | Medium |
| `parse_error_stack` | Yes | Agent can parse stack traces natively | Low |
| `explain_type_error` | Yes | Agent has this knowledge built-in | Low |
| `find_circular_deps` | Yes | Already exists in project_engine | Zero |
| `identify_tech_debt` | Partially | Aggregator of other tools; 3/6 sub-analyses are stubs anyway | Low |

---

## Summary

### By the Numbers

- **21 registered tools** (20 unique — 1 duplicate registry entry for `get_conventions`)
- **8 unregistered tools** (~4,350+ lines of inaccessible production code)
- **3 explicit stubs** in `identify_tech_debt` sub-analyses
- **1 hardcoded shortcut** in `scan_patterns` naming detection
- **2 direct duplicates** with project_engine (`find_circular_deps`, `generate_types`)
- **11 zero-overlap tools** with no equivalent anywhere (6 registered + 5 unregistered)

### Key Findings

1. **The LSP group is the crown jewel.** 6 handlers (3,149 lines) providing TS compiler-powered analysis that no other engine can replicate. `validate_edits_preview` is the most sophisticated handler in the entire plugin.

2. **~4,350 lines of orphaned code.** The `analysis/` subdirectory contains 5 fully implemented handlers (including the 964-line `log_analyzer`) that are unreachable via MCP. This is the engine's biggest waste — not duplicated work, but hidden work.

3. **`find_circular_deps` is a literal duplicate** across analysis_engine and project_engine. Should be consolidated.

4. **`generate_types` exists in both engines** — analysis_engine's version (unregistered) is more sophisticated with multi-sample type merging.

5. **3 handlers depend on `claude` CLI** (`get_conventions`, `detect_breaking_changes`, `semantic_diff`). These fail hard if the CLI is not installed.

6. **Schema wiring is incomplete** — `analysis-schemas.ts` exists but is not imported into `ALL_SCHEMAS`.

7. **Response utility migration is incomplete** — newer files still use deprecated `success()`/`error()` helpers.

### Recommendation

The analysis engine's unique value is in **TS compiler-powered code intelligence** (LSP group) and **security scanning** (secrets + permissions). These tools provide capabilities that cannot be replicated by agent reasoning alone.

### Categorization by Value-Add

**High value (keep)** — unique capabilities no other engine provides:
- `find_dead_code`, `get_api_surface`, `safe_delete_check` (TS reference analysis)
- `validate_edits_preview` (virtual FS edit preview)
- `detect_breaking_changes`, `semantic_diff` (LLM + TS hybrid analysis)
- `validate_api_contract` (live OpenAPI validation)
- `scan_for_secrets`, `check_permissions` (security scanning)

**High value (should register)** — fully implemented but inaccessible:
- `detect_memory_leaks` (runtime leak detection)
- `log_analyzer` (log parsing + anomaly detection)
- `profile_function` (function profiling)
- `generate_types` (type inference from JSON — more capable than project_engine version)

**Medium value (consider merging)** — overlap with other engines but adds convenience:
- `detect_stack` + `scan_patterns` + `get_conventions` (merge with project_engine:explain_codebase)
- `check_versions` (consolidate with project_engine:analyze_dependencies)
- `env_audit` (consolidate duplicate env/ implementations)
- `validate_implementation` (7 check modules are useful but could be agent-driven)

**Low value (candidates for removal)** — easily replaced by existing primitives:
- `find_circular_deps` (direct duplicate with project_engine)
- `read_config` (precision_read on config files)
- `parse_error_stack` (agent can do natively)
- `explain_type_error` (agent has this knowledge built-in)
- `identify_tech_debt` (aggregator with 3/6 stubs)

### Action Items

1. **Register the 5 unregistered high-value handlers** and wire `analysis-schemas.ts` into `ALL_SCHEMAS`
2. **Remove `find_circular_deps`** from one engine (keep whichever is more capable)
3. **Consolidate `generate_types`** — analysis_engine version is superior, move it there and remove from project_engine
4. **Fix `identify_tech_debt` stubs** or remove the tool until sub-analyses are migrated
5. **Complete the response utility migration** — replace deprecated `success()`/`error()` calls
6. **Deduplicate env audit code** — consolidate `env-audit.ts`, `validate-env-complete.ts`, and `env-config.ts`
7. **Fix the duplicate `get_conventions` registry entry**
8. **Update stale comment** in `index.ts` (says "20 total" but registry has 21)
