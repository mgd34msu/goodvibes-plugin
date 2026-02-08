# Precision Engine Tool Updates

Tracking planned improvements identified from native vs precision_engine gap analysis.

## Design Principle

**Make the tools do what we know agents won't.**

Agents won't track versions. Agents won't remember what they read 15 turns ago. Agents won't coordinate with each other about file access. Agents won't estimate their own token waste. Agents won't pass extra parameters for safety features they don't understand.

So the tools handle it — silently, automatically, transparently. The agent's job is to think about the problem. The tool's job is everything else. Only surface information when there's something the agent actually needs to act on.

---

## 1. FileStateCache — In-Memory Content Cache & State Tracking

**Problem:** Native Read tool sends full content into context on every call, wasting tokens on unchanged files. Its `readFileState` system tracks what's been read (59 references across 12 files), but the tracking is purely passive — no caching, no duplicate prevention, no diffs. Precision_read currently has no state tracking at all.

**Solution:** Shared in-memory FileStateCache module used by precision_read, precision_write, and precision_edit. Actively prevents token waste, provides diffs on change, handles concurrent agent access with optimistic concurrency.

### Cache Structure

```typescript
interface CacheEntry {
  // Identity & content
  contentHash:     string;      // sha256 of file content
  content:         string;      // stored content for diff generation
  contentBytes:    number;      // tracked for memory budget
  lineCount:       number;
  byteSize:        number;

  // Timing
  firstReadAt:     number;      // timestamp of first read this session
  lastReadAt:      number;      // timestamp of most recent read
  lastExtract:     string;      // extraction mode used (content/outline/symbols/etc)
  offset?:         number;      // if partial read
  limit?:          number;      // if partial read

  // Analytics
  readCount:       number;      // total reads this session
  tokenCost:       number;      // estimated tokens per full read
  tokensSaved:     number;      // accumulated tokens saved from cache hits

  // Concurrency
  version:         number;      // incrementing counter, bumped on every mutation
  lastModifiedBy?: string;      // agent ID or tool name that last changed the file
  lastModifiedAt?: number;      // timestamp of last modification
  modificationLog: ModEntry[];  // recent modification history (bounded)
}

interface ModEntry {
  version:    number;
  agentId?:   string;
  tool:       string;           // "precision_edit" | "precision_write" | "external"
  timestamp:  number;
  summary?:   string;           // e.g. "replaced 4 lines near line 42"
}
```

### Behavior on Read

1. **Always read from disk** (fast, needed to check for changes)
2. Hash content → compare to cache
3. **Cache miss** (first read): Store entry, return full content normally
4. **Cache hit, unchanged**: Return short response:
   ```json
   {
     "status": "unchanged",
     "path": "src/main.ts",
     "lines": 247,
     "bytes": 8432,
     "last_read": "12s ago",
     "read_count": 3,
     "tokens_saved": 1850,
     "hash": "a1b2c3...",
     "hint": "Use force: true to get full content"
   }
   ```
5. **Cache hit, changed** (file modified since last read): Return diff:
   ```json
   {
     "status": "modified",
     "path": "src/main.ts",
     "lines": 249,
     "previous_lines": 247,
     "changes": {
       "added": 4,
       "removed": 2,
       "modified_ranges": ["42-45", "118"]
     },
     "diff": "--- previous\n+++ current\n@@ -42,4 +42,6 @@\n...",
     "modified_by": "precision_edit",
     "tokens_saved": 1200,
     "hint": "Use force: true for full content"
   }
   ```
6. **Force read** (`force: true`): Bypass cache, return full content, update cache entry

### Cross-Tool Cache Invalidation

When precision_write or precision_edit modifies a file:
- Update cache entry: new `contentHash`, `content`, `version++`
- Set `lastModifiedBy` (agent ID if available, else tool name)
- Append to `modificationLog` (bounded to last 10 entries)
- On next precision_read, diff is computed against pre-modification content
- Agent sees exactly what changed and who changed it

Implementation: shared singleton module imported by read/write/edit handlers.

### Configuration (via config_engine + goodvibes.json)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `cache_mode` | `"hash_only"` \| `"with_content"` | `"with_content"` | Hash-only uses ~50 bytes/entry. With-content stores file content for diff generation. |
| `cache_max_mb` | number | 200 | Maximum memory budget for content cache. LRU eviction when exceeded. |

Values tracked at runtime by config_engine, persisted in `goodvibes.json`, read at session start.

### Parallel Agent Isolation & Concurrency

**Problem:** Goodvibes runs up to 6 parallel agents. Multiple agents may read and modify the same file. Native Claude Code handles this with deep cloning of readFileState per tool execution — but that's because their state is conversation-scoped. Our cache is server-scoped (shared singleton), which is better for cross-agent awareness but needs concurrency handling.

**Approach: Optimistic Concurrency Control (OCC)**

Modeled after git's push model — detect conflicts at write time, not read time. Reads are always safe. Writes check for staleness.

#### How It Works

1. **Every cache entry has a `version` counter** (starts at 1, increments on every mutation)
2. **precision_read returns the version** in its response metadata transparently — agents don't need to track it
3. **precision_edit and precision_write check the cache automatically** — no parameters needed from the agent
4. **On write, the cache checks internally:**
   - Look up the file's cache entry
   - If the file was modified since the last read by this path (version changed) → **conflict detected**
   - If no prior read exists in cache, or version matches → apply normally, bump version
   - Agents never pass version numbers — the cache tracks everything transparently

#### Conflict Response

When a conflict is detected:
```json
{
  "status": "conflict",
  "path": "src/main.ts",
  "your_version": 3,
  "current_version": 5,
  "modified_by": "agent-abc123",
  "modified_at": "8s ago",
  "modifications_since_your_read": [
    { "version": 4, "tool": "precision_edit", "agent": "agent-def456", "summary": "replaced 4 lines near line 42" },
    { "version": 5, "tool": "precision_edit", "agent": "agent-abc123", "summary": "added import on line 3" }
  ],
  "diff_since_your_read": "--- v3\n+++ v5\n@@ ...",
  "options": {
    "force": "Set force: true to apply your edit on top of current version",
    "re_read": "Read the file again with force: true to get current content, then retry",
    "abort": "Do nothing"
  }
}
```

#### Why Optimistic Over Pessimistic

- **No locks** — reads never block, writes only fail on actual conflict
- **Rare conflicts** — agents working on different files 99% of the time
- **Informative failures** — conflict response tells the agent exactly what happened and who did it
- **Fully transparent** — agents don't pass version numbers or opt into anything. The cache handles everything internally and only surfaces conflicts when they actually occur.
- **No deadlocks** — pessimistic locking with 6 parallel agents is a deadlock factory

#### External File Changes

If a file is modified by something outside precision tools (user's editor, git, build process):
- Detected on next precision_read via hash comparison
- `lastModifiedBy` will be `"external"` (no agent ID)
- Diff still generated against cached content
- Version still bumped
- Agents working on that file will see the external change

### Session Analytics

Track per-session:
```json
{
  "session_stats": {
    "unique_files_read": 142,
    "total_reads": 387,
    "cache_hits": 245,
    "cache_hit_rate": "63.3%",
    "tokens_saved": 184000,
    "estimated_cost_saved": "$0.46",
    "memory_used_mb": 12.4,
    "memory_budget_mb": 200,
    "conflicts_detected": 2,
    "conflicts_resolved": 2,
    "most_read_files": [
      {"path": "src/main.ts", "reads": 12, "tokens_saved": 22000},
      {"path": "src/utils.ts", "reads": 8, "tokens_saved": 14000}
    ],
    "most_modified_files": [
      {"path": "src/main.ts", "modifications": 6, "by_agents": 2}
    ]
  }
}
```

Expose via future analytics_engine MCP server and/or a `precision_cache_stats` tool.

### Memory Budget

- **With-content mode**: Average file ~5KB. 200MB = ~40K files. LRU eviction when exceeded.
- **Hash-only mode**: ~50 bytes/entry. Effectively unlimited.
- Session-scoped: cache dies with MCP server restart.
- No TTL timers needed. Persist for full session. LRU handles pressure.

### Implementation Architecture

```
src/state/
  file-cache.ts          # FileStateCache class (singleton)
                         #   - Map<string, CacheEntry> storage
                         #   - LRU eviction at configurable budget
                         #   - sha256 hashing
                         #   - diff generation (using 'diff' npm package already in deps)
                         #   - version tracking + conflict detection
                         #   - modification log
                         #   - session analytics
                         #   - memory budget tracking

src/handlers/
  precision-read.ts      # Check cache → return unchanged/diff/full
                         # Accept force: true to bypass
                         # Return version in metadata
  precision-write.ts     # After write → cache.update(path, newContent, agentId)
                         # Cache checks version internally, surfaces conflict if needed
  precision-edit.ts      # After edit → cache.update(path, newContent, agentId)
                         # Cache checks version internally, surfaces conflict if needed
```

### What We Skip From Native (and why)

| Native Feature | Skip? | Reason |
|---|---|---|
| Read-before-write enforcement | Yes | precision_edit's find-match is a stronger guard |
| Deep clone per tool execution | Yes | OCC is better than cloning for shared server state |
| Conversation compaction hooks | Yes | Cache persists for session, no compaction needed |
| Agent activation by file type | Yes | Claude Code internal, not our concern |
| Nested memory attachment | Yes | Claude Code internal |
| Skill directory triggers | Yes | Claude Code internal |

### What We Add Beyond Native

| Feature | Native Has? | Our Version |
|---|---|---|
| Active duplicate prevention | No (just telemetry) | Return "unchanged" on cache hit, save tokens |
| Diff on change | No | Return diff instead of full content |
| Cross-tool invalidation | No | Write/edit update cache, read shows what changed |
| Optimistic concurrency control | No (uses deep clone) | Version tracking + conflict detection for parallel agents |
| Modification audit log | No | Track who changed what, when, with summaries |
| Session analytics | Telemetry only | Surface stats to user and goodvibes logging |
| Configurable memory budget | No | LRU eviction at user-defined limit |

---

## 2. Smart File-Not-Found: "Did You Mean X?"

**Problem:** When precision_read gets a file-not-found, it returns a raw error. The agent then guesses another path, tries again, maybe fails again. Each retry cycle wastes a full LLM round-trip (input tokens + output tokens + latency). Native Read suggests similar filenames, but only does basic same-directory matching.

**Solution:** Layered fuzzy suggestion system that fires only on file-not-found errors. 100% local computation, zero API calls.

### Suggestion Layers (checked in order, first match wins)

**Layer 1 — Cache lookup (fastest, highest confidence)**
- Fuzzy match the requested path against all FileStateCache keys
- Files already read this session are the most likely candidates
- Example: agent asks for `src/util.ts`, cache has `src/utils.ts` → instant suggestion
- Cross-agent awareness: if agent A read `src/components/Button.tsx`, agent B asking for `Button.tsx` gets the full path

**Layer 2 — Common mistake detection (pattern-based)**
- Missing extension: `main` → `main.ts`, `main.tsx`, `main.js`
- Wrong extension: `component.ts` → `component.tsx`
- Case mismatch: `README.md` vs `readme.md` (case-insensitive glob)
- Missing path prefix: `utils.ts` → `src/utils.ts`, `lib/utils.ts`
- Relative vs absolute confusion
- Pluralization: `util/` vs `utils/`

**Layer 3 — Filesystem fuzzy search**
- Extract basename, glob for `**/<basename>*` scoped to project root
- Rank results by Levenshtein distance to original path
- Return top 3-5 matches

**Layer 4 — Recently modified files**
- If git is available: `git diff --name-only` + `git status --short`
- Fuzzy match against recently changed files
- Useful when agent is looking for a file that was just created/renamed

### Response Format

```json
{
  "status": "not_found",
  "path": "src/util.ts",
  "error": "File not found",
  "suggestions": [
    { "path": "src/utils.ts", "reason": "similar name (cached, read 30s ago)", "confidence": "high" },
    { "path": "src/utils/index.ts", "reason": "directory match", "confidence": "medium" },
    { "path": "lib/util.ts", "reason": "basename match", "confidence": "low" }
  ],
  "hint": "Top suggestion: src/utils.ts (from cache)"
}
```

### What Exceeds Native

| Aspect | Native | Ours |
|---|---|---|
| Search scope | Same directory only (likely) | Entire project + cache |
| Cache awareness | No | Files read this session are top candidates |
| Cross-agent awareness | No | Agent A's reads help agent B find files |
| Common mistake patterns | Unknown | Extension, case, prefix, pluralization |
| Git integration | No | Recently modified files as candidates |
| Confidence ranking | No | Layered confidence (high/medium/low) |

### Implementation Notes

- Only fires on file-not-found errors — zero overhead on successful reads
- Suggestion generation should be fast (<50ms) — cache lookup is instant, filesystem glob is bounded
- Token cost: ~50-100 tokens per error response (vs ~0 tokens for raw error, but saves a full retry cycle of ~2000+ tokens)
- Net savings: preventing even one retry cycle pays for hundreds of suggestion responses

---

## 3. Contextual Intelligence — File Type Tagging + Goodvibes Memory + Registry Integration

**Problem:** Agents reading files have no automatic awareness of what kind of file they're looking at, what project conventions apply to it, or what skills are available to help. Native Claude Code only does one narrow thing here: trigger skill loading when reading skill directories. That's it.

**Solution:** Three-layer contextual intelligence system. All local computation — filesystem reads only, no API calls, no LLM generation. Surfaces pre-existing curated knowledge at the moment it's relevant.

### Layer 1 — File Type Detection

Pattern matching on the file path. ~2 tokens per response.

```
*.test.ts, *.spec.ts, __tests__/*      → "test"
*.config.ts, *.config.js, tsconfig.*   → "config"
*.schema.ts, *.schema.json             → "schema"
routes/*, api/*, endpoints/*           → "api"
components/*, pages/*, layouts/*       → "component"
*.md                                   → "documentation"
package.json, Cargo.toml, go.mod       → "manifest"
.github/*, .gitlab-ci.yml              → "ci"
Dockerfile*, docker-compose*           → "infrastructure"
.goodvibes/*                           → "goodvibes"
```

### Layer 2 — Goodvibes Memory Lookup

Local filesystem reads of `.goodvibes/memory/` JSON files. Match file type and path keywords against existing entries. Return pre-written descriptions — no generation, no API calls.

**Sources queried:**
- `patterns.json` — match `keywords` array against file type/path. Return `description` + `when_to_use`.
- `decisions.json` — match `scope` array against file path. Return `what` + `why` for active decisions.
- `preferences.json` — match `key` prefix against file type (e.g., `testing.*` for test files). Return `value` + `reason`.
- `failures.json` — match `keywords` against file type/path. Return `prevention` field for relevant past failures.

**Example response for a test file:**

```json
{
  "metadata": {
    "size": 8432,
    "modified": "2026-02-07T...",
    "file_type": "test"
  },
  "context": {
    "patterns": [
      {
        "id": "pat_testing_conventions",
        "description": "Vitest with 100% coverage, no skips, no auto-pass",
        "when_to_use": "Writing or reviewing test files"
      }
    ],
    "decisions": [
      {
        "id": "dec_20260201_143052",
        "what": "Use vitest over jest for all new tests",
        "why": "Better ESM support, faster execution"
      }
    ],
    "preferences": [
      {
        "key": "testing.coverage_target",
        "value": "100%",
        "reason": "Enterprise-grade quality requirement"
      }
    ],
    "past_failures": [
      {
        "id": "fail_20260205_091230",
        "prevention": "Always mock external APIs in test files, never call real endpoints"
      }
    ]
  }
}
```

### Layer 3 — Registry Engine Skill Lookup

Query registry_engine's local skill index for skills relevant to the detected file type. Registry already uses progressive disclosure — returns minimal metadata, not full skill content.

**Matching logic:**
- File type "test" → search registry for skills with trigger keywords matching "test", "vitest", "coverage"
- File type "api" → search for skills matching "api", "endpoint", "route"
- File type "infrastructure" → search for skills matching "docker", "deploy", "ci"

**Example addition to response:**

```json
{
  "context": {
    "available_skills": [
      {
        "name": "goodvibes:tester",
        "description": "Testing specialist for comprehensive test coverage"
      }
    ]
  }
}
```

### Progressive Loading

- **First read of a file type** in a session: include full context (patterns, decisions, preferences, failures, skills)
- **Subsequent reads of same file type**: include only `file_type` tag. Context already loaded.
- Track "context loaded for type X" in FileStateCache metadata
- Prevents the same patterns/decisions from being sent on every test file read

This follows the design principle: the tool tracks what context has been delivered so the agent doesn't have to.

### Token Cost Analysis

| Scenario | Tokens Added | When |
|---|---|---|
| File type tag only | ~2 | Every read (subsequent reads of same type) |
| Full context (first of type) | ~30-80 | First read of each file type per session |
| No context (no matches) | ~2 | When no patterns/decisions/skills match |
| Not-found with memory reference | ~10-15 | Only on file-not-found errors |

At ~30-80 tokens once per file type per session, this is negligible. A typical session touches maybe 5-8 file types = 150-640 total tokens for full contextual intelligence across the entire session.

### What Exceeds Native

| Aspect | Native | Ours |
|---|---|---|
| Trigger | Skill directory reads only | Any file type |
| Data sources | Skill files only | Patterns + decisions + preferences + failures + skills |
| Scope | Load one skill | Surface all relevant project knowledge |
| Progressive loading | No | First-of-type only, tracked automatically |
| Past failure awareness | No | Surfaces prevention tips from past mistakes |
| Decision awareness | No | Surfaces active architectural decisions |
| Preference awareness | No | Surfaces project conventions |
| Token efficiency | Loads full skill content | Progressive disclosure, minimal metadata |

### Implementation Notes

- **100% programmatic, zero LLM involvement at read time.** Every field in the context response is a direct copy from existing JSON files. The "intelligence" is: regex match on path → keyword search in arrays → copy matching fields. No generation, no summarization, no inference. The LLM work happened when the memory entries were *written* in a previous session — at read time it's pure data plumbing.
- All data sources are local JSON files — zero API calls
- Registry_engine queries are local index lookups — already progressively disclosed
- Goodvibes memory files are small (<100KB typically) — can be cached in FileStateCache
- File type detection is regex matching — sub-millisecond
- Context matching is keyword search in arrays — sub-millisecond
- Total overhead: <5ms per read for the full contextual intelligence pipeline

---

## Gap Analysis Reference

The following gaps were identified comparing native Claude Code tools to precision_engine:

### precision_exec
- Output limit is 10K chars vs native's 30K — consider increasing
- Default timeout is 30s vs native's 120s — consider increasing
- Missing: background execution, working directory persistence, progress reporting

### precision_read
- Missing: "Did you mean X?" suggestions on file-not-found

### precision_fetch
- Missing: AI-powered content extraction (native WebFetch's prompt parameter)
- HTML-to-Markdown is regex-based vs native's proper converter

### No precision equivalent
- WebSearch — no web search capability
- NotebookEdit — no Jupyter cell editing

### New capability: analytics_engine
- MCP server for cache stats, token savings, session analytics
