# Registry Engine — Deep Dive

## Overview

The registry-engine is the discovery and search layer for the GoodVibes plugin system. It exposes 7 MCP tools that allow Claude to search for and retrieve skills, agents, and tools from the plugin registries without having to know file paths or browse the filesystem manually.

Its primary role is to answer the question: *"What skills/agents/tools exist, and which ones are relevant to my current task?"* — serving as the indexing and query layer over a collection of YAML registry files.

---

## Architecture

### MCP Server Structure

The engine runs as a stdio-based MCP server built on the `@modelcontextprotocol/sdk`.

```
RegistryEngineServer
  ├── LazyRegistryLoader      — deferred loading of three registry indexes
  ├── DISCOVERY_SCHEMAS       — MCP tool input/output schema definitions
  └── Handler dispatch
        ├── handlers/search.ts       — search_skills, search_agents, search_tools, recommend_skills
        ├── handlers/content.ts      — get_skill_content, get_agent_content
        └── handlers/dependencies.ts — skill_dependencies
```

### Startup and Registry Loading

Registries are loaded **lazily** — the server starts immediately without waiting for disk I/O. The first call to any tool triggers the relevant registry load. Concurrent requests for the same registry share the same loading Promise (single-flight pattern) to avoid duplicate reads.

Eager loading can be enabled by setting `GOODVIBES_EAGER_LOAD=true`, which causes all three registries to be loaded in parallel at startup via `Promise.all`.

```
Environment variables:
  PLUGIN_ROOT          — root of the GoodVibes plugin (auto-detected from __dirname / import.meta.url)
  PROJECT_ROOT         — current project root (falls back to cwd)
  GOODVIBES_EAGER_LOAD — set to "true" for eager loading
```

### Request Lifecycle

```
MCP call → hasHandler(name) check
        → getHandlerContext()  [triggers lazy load if needed]
        → handler(ctx, args)
        → success(data) / throw McpError
```

All errors are caught and re-thrown as `McpError(InternalError)`. Logging goes to **stderr** to keep stdout clean for the MCP protocol.

---

## Search System

### Engine: Fuse.js (Fuzzy Search)

All three registries (skills, agents, tools) are indexed with [Fuse.js v7](https://fusejs.io/) — a lightweight fuzzy-search library with no external dependencies beyond a JS runtime.

### Index Configuration

```typescript
// config.ts — FUSE_OPTIONS
const FUSE_OPTIONS: IFuseOptions<RegistryEntry> = {
  keys: [
    { name: 'name',        weight: 0.3 },
    { name: 'description', weight: 0.4 },
    { name: 'keywords',    weight: 0.3 },
  ],
  threshold: 0.4,      // 0 = exact, 1 = match anything
  includeScore: true,  // raw Fuse score included in results
  ignoreLocation: true, // match regardless of position in string
};
```

**Ranking:** Fuse.js uses a bitap algorithm internally. Description carries the highest weight (0.4), meaning a match in the description ranks higher than a match on the name or keywords alone.

**Relevance score:** Fuse returns scores in `[0, 1]` where 0 = perfect match. The engine inverts and rounds this: `relevance = round((1 - score) * 100) / 100`, so a relevance of `1.0` is perfect and `0.0` is no match.

### Registry → Fuse Index Pipeline

```
loadRegistry(path)           — reads YAML file from disk (js-yaml)
  → Registry { version, search_index: RegistryEntry[] }
createIndex(registry)        — wraps search_index in Fuse
  → Fuse<RegistryEntry>
search(index, query, limit)  — executes fuzzy search, maps to SearchResult[]
```

`RegistryEntry` fields indexed:

| Field | Weight | Notes |
|-------|--------|-------|
| `name` | 0.3 | Short identifier |
| `description` | 0.4 | Human-readable description |
| `keywords` / `triggers` | 0.3 | Keyword bag from registry |

---

## Registry Formats

### Skills Registry (`skills/_registry.yaml`)

```yaml
version: 1.0.0
generated: '2026-02-22T05:53:24.188Z'
total: 25
categories:
  orchestration:
    _items:
      - name: fullstack-feature
        path: orchestration/fullstack-feature
        description: >
          Load PROACTIVELY when task involves building a complete feature...
        triggers:
          - fullstack
          - feature
          - database
          # ... keyword bag
```

Skills are organized under `categories` with named sub-groups. Each entry has:
- `name` — short identifier
- `path` — relative path within `plugins/goodvibes/skills/`
- `description` — rich description used for search ranking
- `triggers` — keyword bag (used by Fuse as the `keywords` field)

**Skills total: 25** across categories including `orchestration`, `protocol`, `outcome`, and `quality`.

### Agents Registry (`agents/_registry.yaml`)

```yaml
version: 1.0.0
generated: '2026-02-22T05:53:24.181Z'
total: 11
categories:
  _items:
    - name: agent-factory
      path: agent-factory
      description: >
        Meta-agent that creates specialized Claude Code subagents...
      triggers:
        - agent
        - factory
        # ...
```

Flatter structure — all agents under `categories._items`. **Agents total: 11**.

### Tools Registry (`tools/_registry.yaml`)

```yaml
version: 2.0.0
generated: '2026-02-22T05:53:24.203Z'
total: 73
servers:
  - name: precision-engine
    count: 12
    tools:
      - name: precision_write
        path: precision-engine/precision-write.yaml
        description: Create or write files...
```

Grouped by MCP server. **Tools total: 73** across 6 servers (precision-engine, project-engine, frontend-engine, analytics-engine, registry-engine, runtime-engine). Each entry links to its YAML definition file.

### Tool Definition Files (`tools/definitions/registry-engine/*.yaml`)

Each tool has a standalone YAML definition file used for documentation and schema validation:

```yaml
name: search_skills
version: "1.0.0"
description: |
  Search the skill registry...
mcp:
  server: goodvibes-tools
  method: search_skills
  defer_loading: true       # loaded on-demand by ToolSearch
input_schema:               # JSON Schema for parameters
  ...
output_schema:              # JSON Schema for response shape
  ...
examples:                   # illustrative usage
  - description: ...
    input: ...
    output: ...
```

`defer_loading: true` tells the Claude plugin loader to not register the tool at session start — it must be explicitly activated via `ToolSearch`.

---

## Tools Reference

### 1. `search_skills`

**Purpose:** Keyword/semantic search over the 25-skill registry.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Natural language or keywords |
| `category` | string | — | Filter results by path prefix |
| `limit` | integer | 5 | Max results (1–20) |

**Implementation:**
- Runs Fuse search against `skillsIndex`
- If `category` is provided, post-filters results where `result.path.startsWith(category)`
- Returns `{ skills, total_count, query }`

**Note:** Category filtering is done in-memory after search — it narrows an already-ranked result set, not the index itself.

---

### 2. `search_agents`

**Purpose:** Search the 11-agent registry by expertise area.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Keywords describing expertise needed |
| `limit` | integer | 5 | Max results |

**Implementation:**
- Runs Fuse search against `agentsIndex`
- No category filtering (flat registry)
- Returns `{ agents, total_count, query }`

---

### 3. `search_tools`

**Purpose:** Search the 73-tool registry by functionality.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Keywords describing tool functionality |
| `limit` | integer | 5 | Max results |

**Implementation:**
- Runs Fuse search against `toolsIndex`
- Returns `{ tools, total_count, query }`
- The same tool used by ToolSearch to resolve deferred tool loading

---

### 4. `recommend_skills`

**Purpose:** Analyze a task description and recommend relevant skills with context classification.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `task` | string | required | Natural language task description |
| `max_results` | integer | 5 | Max recommendations |

**Implementation:**
1. Tokenizes the task string: `task.toLowerCase().split(/\s+/).filter(w => w.length > 3)`
2. Runs Fuse search using the full task string as query
3. Classifies the task into a category via keyword detection:

```typescript
if (taskLower.includes('auth') || taskLower.includes('login'))  → 'authentication'
if (taskLower.includes('database') || taskLower.includes('prisma') || taskLower.includes('sql')) → 'database'
if (taskLower.includes('api') || taskLower.includes('endpoint')) → 'api'
if (taskLower.includes('style') || taskLower.includes('css') || taskLower.includes('tailwind'))  → 'styling'
if (taskLower.includes('test'))   → 'testing'
if (taskLower.includes('deploy') || taskLower.includes('build')) → 'deployment'
// else: 'general'
```

4. Estimates complexity: `keywords.length > 10 → 'complex'`, `> 5 → 'moderate'`, else `'simple'`
5. Returns `{ recommendations[], task_analysis: { category, keywords, complexity } }`

Each recommendation includes `prerequisites: []` and `complements: []` (populated as empty arrays; detailed relationship data comes from `skill_dependencies`).

---

### 5. `get_skill_content`

**Purpose:** Retrieve the full markdown content of a skill file.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | Skill path from registry (e.g., `protocol/precision-mastery`) |

**Implementation:**
Tries three path resolution patterns in order:
```
plugins/goodvibes/skills/{path}/SKILL.md
plugins/goodvibes/skills/{path}.md
plugins/goodvibes/skills/{path}
```
Returns raw file content as MCP text response. Throws if none exist.

---

### 6. `get_agent_content`

**Purpose:** Retrieve the full markdown content of an agent definition.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | Agent path from registry (e.g., `engineer`) |

**Implementation:**
Tries three resolution patterns:
```
plugins/goodvibes/agents/{path}.md
plugins/goodvibes/agents/{path}
plugins/goodvibes/agents/{path}/index.md
```
Returns raw file content. Throws if none exist.

---

### 7. `skill_dependencies`

**Purpose:** Analyze a skill's dependency relationships — required skills, complementary skills, conflicts, reverse dependents, and a suggested bundle.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `skill` | string | required | Skill name or description to analyze |
| `depth` | integer | 2 | How many levels of transitive deps to resolve |
| `include_optional` | boolean | true | Include complementary/optional skills |

**Implementation — step by step:**

1. **Find the skill** — Fuse search with `limit: 1` to locate the target skill entry
2. **Parse skill metadata** — calls `parseSkillMetadata(skill.path)` which reads the skill's `SKILL.md` and extracts YAML frontmatter:
   ```yaml
   ---
   requires: [skill-a, skill-b]
   complements: [skill-c]
   conflicts: [skill-d]
   category: protocol
   technologies: [typescript, react]
   difficulty: intermediate
   ---
   ```
   If no YAML frontmatter is found, falls back to regex parsing of `Requires:`, `Related:`, `See also:` sections in the document body.
3. **Build required deps** — for each item in `requires`, runs a Fuse search to resolve it to a registry entry. If `depth > 1`, also reads the resolved skill's metadata and adds its own `requires` entries (up to 3 per level).
4. **Build optional deps** — for each item in `complements` (or `related`), runs a Fuse search to resolve.
5. **Build conflicts list** — same resolution for `conflicts`.
6. **Reverse lookup (dependents)** — iterates all skills in `skillsRegistry.search_index`, parses each one's metadata, and checks if that skill's `requires` references the target. Collects up to 5.
7. **Pad optional with category-similar skills** — if `optional.length < 3`, searches by the category portion of the skill's path to find related skills in the same area.
8. **Build suggested bundle** — the target skill + up to 3 required + up to 2 optional (deduped).

**Response shape:**
```json
{
  "skill": "precision-mastery",
  "path": "protocol/precision-mastery",
  "metadata": { "category": "protocol", "technologies": [], "difficulty": "..." },
  "dependencies": {
    "required": [{ "skill": "...", "path": "...", "reason": "Listed as required dependency" }],
    "optional": [{ "skill": "...", "path": "...", "reason": "Listed as complementary skill" }],
    "conflicts": []
  },
  "dependents": [{ "skill": "...", "path": "..." }],
  "suggested_bundle": ["protocol/precision-mastery", "protocol/gather-plan-apply"],
  "analysis": {
    "has_prerequisites": false,
    "has_conflicts": false,
    "dependency_count": 3,
    "is_foundational": true
  }
}
```

`is_foundational` is `true` when `dependents.length > 2`, indicating many skills depend on this one.

---

## Skill Metadata Parsing

`parseSkillMetadata()` in `utils.ts` is shared by both `skill_dependencies` (dependency tree) and any future metadata consumers.

**Resolution order:**
```
plugins/goodvibes/skills/{path}/SKILL.md   ← preferred
plugins/goodvibes/skills/{path}.md
plugins/goodvibes/skills/{path}
```

**Parsing strategy:**
1. Try YAML frontmatter: `^---\n([\s\S]*?)\n---`
2. If no frontmatter, try regex section headers: `Requires:`, `Related:`, `See also:`
3. Extract technology mentions by scanning for known keywords: `react`, `next`, `prisma`, `tailwind`, `typescript`, `zod`, `trpc`, etc.

This dual-mode parsing allows both structured frontmatter-equipped skills and plain-prose skills to participate in dependency resolution.

---

## Key Implementation Details

### Single-Flight Registry Loading

The `LazyRegistryLoader` uses a "loading promise" pattern to prevent duplicate reads:
```typescript
if (!this._skillsLoaded) {
  if (!this._skillsLoading) {
    this._skillsLoading = this.loadSkills();  // only created once
  }
  await this._skillsLoading;  // all concurrent waiters share the same promise
}
```
This means even 10 simultaneous calls during the first request will only read the YAML file once.

### Handler Dispatch

The `TOOL_HANDLERS` map in `handlers/index.ts` is a static Record — no dynamic resolution needed at call time. The server validates `hasHandler(name)` before accessing `getHandler(name)` to provide a clear error listing available tools.

### Content Resolution (Multi-Path Fallback)

Both content handlers and `parseSkillMetadata` use an ordered `attempts` array and try each path with `fs.existsSync` / `fileExists`. This accommodates skills stored as `SKILL.md` inside a directory (preferred convention), as a flat `.md` file, or as a bare path.

### Logging

All output goes to `stderr` via the `logger` singleton. Levels: `debug`, `info`, `warn`, `error`, `tool`. Each log line is `[ISO-timestamp] [LEVEL] message {json_data}`.

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|--------|
| `@modelcontextprotocol/sdk` | `^1.0.0` | MCP server/transport/types |
| `fuse.js` | `^7.1.0` | Fuzzy search indexing and querying |
| `js-yaml` | `^4.1.1` | YAML parsing for registry files and frontmatter |
| `typescript` | `^5.3.0` | (dev) Type checking |
| `esbuild` | `^0.20.0` | (dev) Bundling to CJS via `build.mjs` |
| `vitest` | `^2.0.0` | (dev) Test runner |

**Build output:** `dist/index.cjs` (CommonJS bundle, ESM source bundled via esbuild). The `type: module` in `package.json` means source files are treated as ESM; esbuild converts to CJS for the distributed artifact.

---

## Design Notes

- **No runtime code generation** — the registries are pre-generated YAML files (`generated:` timestamp field), not dynamically scanned at search time.
- **Fuse.js vs TF-IDF** — Fuse.js uses a bitap approximate string matching algorithm, not TF-IDF. It is simpler and works well for the small corpus sizes here (25 skills, 11 agents, 73 tools). It handles typos and partial matches via the `threshold: 0.4` setting.
- **Category filtering is post-search** — `search_skills` applies the `category` filter after Fuse ranking, not as a pre-filter on the index. This means ranked relevance is still computed over the full set; category only narrows the returned list.
- **Dependency depth is shallow by design** — the max useful depth is 2 (default), with the implementation capping nested deps at 3 per level to avoid explosive fan-out on larger skill graphs.
- **Tools are all deferred** — all 7 registry-engine tools use `defer_loading: true`, meaning they are not pre-loaded by the Claude plugin system. They must be discovered via `ToolSearch` before use.
