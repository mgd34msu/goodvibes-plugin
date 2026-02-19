# Project Engine Deep Analysis

## Tool Inventory (22 tools, all fully implemented)

The project_engine is production-ready code with zero stubs or placeholders. Every handler does real work.

**Location:** `plugins/goodvibes/tools/implementations/project-engine/src/`

| # | Tool | Lines | Description |
|---|------|-------|-------------|
| 1 | `scaffold_project` | 303 | Template-based project creation with variable substitution, npm install, git init |
| 2 | `list_templates` | ~100 | Lists templates from registry with category filtering |
| 3 | `plugin_status` | 132 | GoodVibes plugin health check (manifest, registries, hooks) |
| 4 | `project_issues` | 102+ | TODO/FIXME scanning, health checks, env validation |
| 5 | `explain_codebase` | ~300 | LLM-powered architecture analysis with diagrams |
| 6 | `get_database_schema` | ~400 | Parses Prisma/Drizzle/TypeORM/SQL schemas |
| 7 | `get_api_routes` | ~200 | Extracts routes from Next.js/Express/Fastify/Hono |
| 8 | `get_prisma_operations` | ~200 | Detects Prisma usage patterns, N+1 queries |
| 9 | `query_database` | 164+ | SQL execution on PostgreSQL/MySQL/SQLite with safety (readonly, LIMIT, EXPLAIN) |
| 10 | `generate_openapi` | ~250 | Generates OpenAPI 3.0.3 specs from discovered routes |
| 11 | `analyze_dependencies` | ~300 | Unused, missing, outdated package detection |
| 12 | `find_circular_deps` | ~200 | DFS-based circular import detection |
| 13 | `upgrade_package` | ~200 | Package upgrade with breaking change detection |
| 14 | `analyze_bundle` | 525 | Bundle size analysis, duplicates, tree-shaking impact |
| 15 | `generate_types` | ~200 | TypeScript type generation from JSON/API/database/runtime |
| 16 | `generate_fixture` | ~200 | Test fixture generation with @faker-js/faker |
| 17 | `sync_api_types` | ~200 | Type drift detection between backend and frontend |
| 18 | `find_tests_for_file` | 417 | Import-graph-based test file discovery with confidence scoring |
| 19 | `get_test_coverage` | 700 | lcov/istanbul coverage report parsing |
| 20 | `suggest_test_cases` | 808 | Function analysis + test case suggestion |
| 21 | `create_pull_request` | ~150 | PR creation via gh CLI with auto-generated descriptions |
| 22 | `resolve_merge_conflict` | ~200 | Conflict marker analysis with resolution suggestions |

### Stubs/Placeholders: **ZERO**

No `throw new Error('not implemented')`, no mock returns, no placeholder functions. All 22 tools are fully implemented with real logic, error handling, and edge cases.

---

## File Structure

```
project-engine/
├── src/
│   ├── index.ts                          # Main MCP server entry point
│   ├── config.ts                         # Configuration
│   ├── context.ts                        # Context utilities
│   ├── logging.ts                        # Logging utilities
│   ├── handlers/
│   │   ├── index.ts                      # Handler registry (maps tool names to functions)
│   │   ├── scaffolding.ts                # scaffold_project, list_templates
│   │   ├── status.ts                     # plugin_status
│   │   ├── issues.ts                     # project_issues (facade)
│   │   ├── issues/
│   │   │   ├── index.ts                  # Main handler (real implementation)
│   │   │   ├── types.ts                  # Type definitions
│   │   │   ├── constants.ts              # Constants and patterns
│   │   │   ├── todo-scanner.ts           # TODO/FIXME scanning logic
│   │   │   ├── health-checker.ts         # Project health checks
│   │   │   ├── environment-checker.ts    # Environment validation
│   │   │   └── formatter.ts             # Result formatting
│   │   ├── database/
│   │   │   ├── index.ts                  # Re-exports
│   │   │   ├── query-database/
│   │   │   │   ├── handler.ts            # Main query handler (real work)
│   │   │   │   ├── executors/
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── postgres.ts       # PostgreSQL executor
│   │   │   │   │   ├── mysql.ts          # MySQL executor
│   │   │   │   │   └── sqlite.ts         # SQLite executor
│   │   │   │   ├── query-analysis.ts     # Write operation detection, LIMIT handling
│   │   │   │   ├── url-parser.ts         # Database URL parsing
│   │   │   │   ├── formatters.ts         # Output formatting (JSON/table)
│   │   │   │   └── errors.ts            # Error handling
│   │   │   ├── sqlite-connection.ts      # SQLite connection pooling
│   │   │   └── sqlite-schema.ts          # SQLite schema introspection
│   │   ├── docs/
│   │   │   ├── index.ts                  # Re-exports
│   │   │   ├── explain-codebase.ts       # Codebase explanation (LLM-powered)
│   │   │   ├── explain-codebase/
│   │   │   │   ├── index.ts
│   │   │   │   ├── analyzer.ts
│   │   │   │   ├── formatter.ts
│   │   │   │   ├── parser.ts
│   │   │   │   └── types.ts
│   │   │   └── generate-openapi.ts       # OpenAPI spec generation
│   │   ├── schema/
│   │   │   ├── index.ts                  # Handler dispatch
│   │   │   ├── database.ts              # Database schema extraction
│   │   │   ├── api-routes.ts             # API route extraction
│   │   │   ├── prisma-parser.ts          # Prisma schema parser
│   │   │   ├── drizzle-parser.ts         # Drizzle schema parser
│   │   │   ├── typeorm-parser.ts         # TypeORM schema parser
│   │   │   ├── sql-parser.ts             # Raw SQL schema parser
│   │   │   └── types.ts
│   │   ├── framework/
│   │   │   ├── index.ts
│   │   │   └── prisma.ts                # Prisma operations detector
│   │   ├── test/
│   │   │   ├── index.ts
│   │   │   ├── find-tests.ts            # Test discovery (417 lines)
│   │   │   ├── coverage.ts              # Coverage parsing (700 lines)
│   │   │   └── suggest-cases.ts         # Test case suggestion (808 lines)
│   │   ├── build/
│   │   │   ├── index.ts
│   │   │   └── bundle-analyzer.ts       # Bundle size analysis (525 lines)
│   │   ├── deps/
│   │   │   ├── index.ts
│   │   │   ├── analyze.ts               # Dependency analysis
│   │   │   └── circular.ts              # Circular dependency detection
│   │   ├── git/
│   │   │   ├── index.ts
│   │   │   ├── create-pull-request.ts   # PR creation (GitHub integration)
│   │   │   └── resolve-merge-conflict.ts # Merge conflict resolution
│   │   ├── package/
│   │   │   ├── index.ts
│   │   │   └── upgrade-package.ts       # Package upgrade
│   │   ├── fixtures/
│   │   │   ├── index.ts
│   │   │   └── generate-fixture.ts      # Test fixture generation
│   │   ├── sync/
│   │   │   ├── index.ts
│   │   │   └── sync-api-types.ts        # API type synchronization
│   │   └── response-utils.ts
│   └── schemas/
│       ├── index.ts                      # Schema aggregator
│       ├── project-schemas.ts            # Schemas for project tools
│       ├── test-schemas.ts               # Schemas for test tools
│       ├── types-schemas.ts              # Schemas for type tools
│       ├── git-schemas.ts                # Schemas for git tools
│       ├── build-schemas.ts              # Schemas for build tools
│       └── deps-schemas.ts              # Schemas for dependency tools
```

---

## Implementation Depth

### Handler Pattern

All handlers follow consistent async function exports:

```typescript
export async function handleXxx(args: XxxArgs): Promise<ToolResponse> {
  // Real implementation
  return success(result);  // or formatErrorResponse(message)
}
```

Registry in `handlers/index.ts`:
```typescript
export const handlerRegistry = new Map<string, ToolHandler>([
  ['tool_name', handleToolName],
]);
```

### Complexity Tiers

**Tier 1 - Simple (CRUD/read pattern):**
- `list_templates` - reads YAML registry files
- `plugin_status` - reads and validates manifest JSON
- `get_api_routes` - regex-based route pattern extraction

**Tier 2 - Medium (Analysis):**
- `generate_types` - type inference from runtime data
- `analyze_dependencies` - dep graph analysis via npm/yarn/pnpm
- `find_circular_deps` - DFS traversal on import graph
- `resolve_merge_conflict` - conflict marker parsing + suggestion
- `create_pull_request` - gh CLI wrapper with auto-description

**Tier 3 - Complex (Heavy lifting):**
- `find_tests_for_file` (417 lines) - TypeScript compiler API, import graph tracing
- `get_test_coverage` (700 lines) - multiple coverage format parsers, metric calculation
- `suggest_test_cases` (808 lines) - function signature analysis, test case generation
- `analyze_bundle` (525 lines) - bundle size analysis, duplicate detection, optimization suggestions
- `query_database` (164+ lines) - 3 database drivers, query safety, connection pooling
- `explain_codebase` - LLM integration, architecture diagram generation
- `get_database_schema` - 4 ORM parsers (Prisma/Drizzle/TypeORM/SQL)

### External Dependencies

- **@modelcontextprotocol/sdk** - MCP protocol
- **js-yaml** - YAML parsing
- **typescript** - AST parsing for code analysis
- **pg** - PostgreSQL driver (optional)
- **mysql2** - MySQL driver (optional)
- **better-sqlite3** - SQLite driver (optional)
- Built-in Node APIs (fs, path, child_process)

---

## Overlap Analysis with Other Engines

### DIRECT DUPLICATE (100% overlap)

| Project Engine | Other Engine | Verdict |
|---------------|-------------|--------|
| `find_circular_deps` | `analysis_engine:find_circular_deps` | **Identical purpose.** Both do DFS cycle detection on import graphs. One should be removed. |

### HIGH OVERLAP (50-70%)

| Project Engine | Other Engine(s) | Overlap | Notes |
|---------------|----------------|---------|-------|
| `explain_codebase` | `analysis_engine:detect_stack` + `scan_patterns` + `get_conventions` | **~60%** | All analyze codebase structure. project_engine does it in one LLM call; analysis_engine splits into 3 focused tools. The analysis_engine tools are more precise/granular. |

### MODERATE OVERLAP (25-50%)

| Project Engine | Other Engine(s) | Overlap | Notes |
|---------------|----------------|---------|-------|
| `create_pull_request` | `precision_exec` (gh pr create) | **~40%** | project_engine adds auto-description generation, but an agent + precision_exec achieves the same |
| `analyze_dependencies` | `analysis_engine:check_versions` | **~40%** | project_engine finds unused/missing/outdated; analysis_engine checks versions. Different angles, same domain |
| `project_issues` | `analysis_engine:env_audit` + `scan_for_secrets` | **~30%** | Environment checking overlap; project_engine adds TODO scanning and health checks |
| `get_api_routes` | `analysis_engine:get_api_surface` | **~30%** | project_engine finds HTTP routes; analysis_engine finds exported API surface. Related but different focus |
| `find_tests_for_file` | `discover` + `precision_grep` | **~25%** | project_engine uses TypeScript compiler for import graph tracing; discover/grep can find test files by pattern but can't trace imports |

### LOW OVERLAP (<25%)

| Project Engine | Nearest Equivalent | Overlap | Notes |
|---------------|-------------------|---------|-------|
| `resolve_merge_conflict` | `precision_read` + `precision_edit` | ~20% | Could read conflicts and edit, but no analysis logic |
| `sync_api_types` | `analysis_engine:validate_api_contract` | ~20% | Both check API correctness but from different angles |
| `upgrade_package` | `analysis_engine:check_versions` + `precision_exec` | ~15% | Version check exists, but upgrade logic + breaking change detection is unique |
| `generate_types` | `precision_read extract:symbols` | ~10% | Symbols extracts existing types; generate_types creates new ones from data |
| `generate_openapi` | `analysis_engine:validate_api_contract` | ~10% | One generates specs, the other validates against them. Complementary |
| `query_database` | `precision_exec` (psql/mysql CLI) | ~5% | CLI execution is possible but no structured output, safety guards, or multi-driver support |

### ZERO OVERLAP (completely unique)

| Tool | Why It's Unique |
|------|----------------|
| `scaffold_project` / `list_templates` | No other engine does project scaffolding from templates |
| `plugin_status` | GoodVibes-specific internal health check |
| `get_database_schema` | Multi-ORM schema parsing (Prisma/Drizzle/TypeORM/SQL) |
| `get_prisma_operations` | Prisma-specific usage pattern detection |
| `get_test_coverage` | Coverage report format parsing (lcov/istanbul) |
| `suggest_test_cases` | LLM-powered test case generation from function signatures |
| `generate_fixture` | Faker-powered test data generation |
| `analyze_bundle` | Bundle size analysis with optimization suggestions |

---

## Replaceability Assessment

For each tool: can existing engines + agent intelligence achieve the same result?

| Tool | Replaceable? | How | Effort |
|------|-------------|-----|--------|
| `scaffold_project` | Yes | `precision_write` (batch files) + `precision_exec` (npm init/install) | Medium - agent needs template logic |
| `list_templates` | Yes | `precision_read` on registry YAMLs | Low |
| `plugin_status` | Yes | `precision_glob` + `precision_read` on manifest/hooks | Low |
| `project_issues` | Mostly | `precision_grep` (TODOs) + `analysis_engine:env_audit` | Low |
| `explain_codebase` | Mostly | `analysis_engine:detect_stack` + `scan_patterns` + `get_conventions` | Low - 3 calls vs 1 |
| `get_database_schema` | Partially | `precision_read` on schema files, but agent must parse ORM syntax | Medium-High |
| `get_api_routes` | Partially | `discover` (grep for route patterns) + agent parsing | Medium |
| `get_prisma_operations` | Yes | `precision_grep` for prisma patterns | Low |
| `query_database` | Partially | `precision_exec` with psql/mysql/sqlite3 CLI | Medium - loses safety guards |
| `generate_openapi` | No | Requires structured spec generation from route analysis | High |
| `analyze_dependencies` | Yes | `precision_exec` (npm ls, npm outdated) + agent analysis | Low-Medium |
| **`find_circular_deps`** | **Yes** | **Already exists in analysis_engine** | **Zero - just use it** |
| `upgrade_package` | Partially | `precision_exec` (npm install pkg@latest) + `analysis_engine:detect_breaking_changes` | Medium |
| `analyze_bundle` | Partially | `precision_exec` (build) + `precision_glob`/`precision_read` on dist/ | Medium - loses analysis |
| `generate_types` | Yes | Agent can infer types and `precision_write` them | Low |
| `generate_fixture` | Yes | Agent can generate fixtures and `precision_write` | Low |
| `sync_api_types` | Partially | `precision_grep` + `precision_read` + agent comparison | Medium-High |
| `find_tests_for_file` | Partially | `discover` + `precision_grep`, but loses import graph tracing | Medium |
| `get_test_coverage` | Yes | `precision_exec` (run coverage) + `precision_read` (parse output) | Low-Medium |
| `suggest_test_cases` | Yes | Agent can do this natively with function context | Low |
| `create_pull_request` | Yes | `precision_exec` with `gh pr create` | Low |
| `resolve_merge_conflict` | Partially | `precision_read` + `precision_edit` + agent reasoning | Medium |

---

## Summary

### By the numbers

- **1 direct duplicate**: `find_circular_deps` (exists in both project_engine and analysis_engine)
- **2 high-overlap tools** that could be consolidated with analysis_engine
- **5 moderate-overlap tools** with partial coverage elsewhere
- **6 low-overlap tools** that are mostly unique
- **8 zero-overlap tools** with no equivalent anywhere

### Key findings

1. **No stubs or placeholders** - everything is production code with real logic
2. **The biggest waste is `find_circular_deps`** - literal duplicate across two engines
3. **~10 of 22 tools (45%) could be reasonably replaced** by combining precision_engine primitives + analysis_engine + agent intelligence, though with more agent token cost per invocation
4. **~8 tools (36%) are genuinely unique** and provide capabilities no other engine offers (database schema parsing, coverage report parsing, bundle analysis, ORM-specific detection, scaffolding)
5. **~4 tools (18%) are in a gray zone** - technically replaceable but the project_engine versions add structured parsing/safety that would be expensive to replicate via agent prompting

### Recommendation

The project_engine is a "convenience + structure" layer. Its unique value is in **structured parsing** (coverage reports, ORM schemas, bundle analysis) and **safety guards** (query_database readonly mode, LIMIT injection). The tools that merely wrap CLI commands (`create_pull_request`, `analyze_dependencies`) or do what agents can do natively (`suggest_test_cases`, `generate_fixture`, `generate_types`) add less value. The `find_circular_deps` duplicate should be consolidated.

### Categorization by value-add

**High value (keep)** - unique structured parsing no other engine provides:
- `get_database_schema`, `query_database`, `get_prisma_operations`
- `get_test_coverage`, `analyze_bundle`
- `generate_openapi`, `sync_api_types`
- `scaffold_project`

**Medium value (consider merging)** - overlap with other engines but adds convenience:
- `explain_codebase` (merge with analysis_engine stack/patterns/conventions)
- `find_tests_for_file` (import graph tracing is unique, pattern matching is not)
- `analyze_dependencies` (consolidate with analysis_engine:check_versions)
- `project_issues` (consolidate with analysis_engine:env_audit)

**Low value (candidates for removal)** - easily replaced by existing primitives:
- `find_circular_deps` (direct duplicate)
- `create_pull_request` (precision_exec + gh CLI)
- `suggest_test_cases` (agent can do natively)
- `generate_types` (agent can do natively)
- `generate_fixture` (agent can do natively)
- `list_templates` (precision_read on registry)
- `plugin_status` (precision_glob + precision_read)
