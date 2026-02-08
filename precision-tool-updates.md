# Precision Engine Tool Updates

Tracking planned improvements identified from native vs precision_engine gap analysis.

> **Implementation Note:** These items are NOT 1-item-per-agent tasks. Many items (especially Items 1, 3, 6, 7, 10) are large enough to require multiple sets of concurrent agents working through sub-parts. Plan implementation in phases — break each item into discrete, parallelizable units of work before assigning to agents.

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

## 4. Empty File Warning (Parity)

**Problem:** When precision_read encounters an empty file, it silently returns `line_count: 1` with a blank line. The agent has no indication the file is actually empty — it may think it read a one-line file with whitespace. Native Read returns a `<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>`. Native throws a hard error for empty images.

**Goal:** Reach parity with native. No intent guessing, no LLM interaction, no template generation. Just clear, structured feedback.

### Detection

```typescript
const stats = await fs.stat(validatedPath);
const isEmpty = stats.size === 0;
```

Using `stats.size === 0` (byte-level) rather than native's `totalLines === 0` (line-level). More accurate — catches true zero-byte files.

### Response Format

```json
{
  "status": "empty",
  "path": "src/config.ts",
  "exists": true,
  "size_bytes": 0,
  "warning": "File exists but is empty (0 bytes)"
}
```

For all file types (text, image, PDF, notebook) — return the same structured warning. Non-fatal for all types (native throws on empty images; we don't).

### Integration with FileStateCache

- Empty files are cached with `contentHash` of the empty string's sha256
- On re-read: if still empty, return `"status": "still_empty"` (short response, no repeated warning)
- If content appears: return full content normally with `"note": "File was previously empty, now has content"`

### Implementation Notes

- Zero additional disk reads — `stats` is already available from the stat call shared with Item 6
- Token cost: ~15-20 tokens per empty file response. Prevents agent confusion on a 0-byte file.
- No file-type-specific suggestions, no git lookups — just the facts.

---

## 5. Slow Filesystem Detection & UNC Path Support

**Problem:** UNC paths (`\\server\share\file.txt` or `//server/share/file.txt`) are one specific case of a broader issue: **non-local filesystems**. Enterprise environments use network drives, but developers also hit slow I/O from WSL cross-filesystem mounts (`/mnt/c/...`), Docker volume mounts, NFS/CIFS shares, and FUSE filesystems. Native Read handles UNC paths implicitly through Node builtins but has no awareness of filesystem speed at all.

**Risk:** Our `normalizePath()` could mangle UNC paths by treating `//server/` as a Git Bash path. And for all slow-filesystem scenarios, re-reading files is expensive — cache priority should be higher.

**Solution:** Three things: (1) UNC-safe path normalization, (2) generic slow-filesystem detection via stat latency, (3) adaptive caching behavior.

### UNC Path Detection & Normalization

```typescript
function isUNCPath(p: string): boolean {
  // Windows-style: \\server\share or \\?\UNC\server\share
  if (p.startsWith('\\\\')) return true;
  // Unix-style UNC: //server/share
  if (p.startsWith('//') && !p.startsWith('///')) return true;
  return false;
}

function normalizePath(p: string): string {
  if (isUNCPath(p)) {
    // UNC paths: normalize but skip Git Bash conversion
    return path.normalize(p);
  }
  // existing Git Bash conversion logic...
}
```

Normalization rules:
1. **UNC paths**: Skip Git Bash conversion, apply `path.normalize()` only
2. **Git Bash paths** (`/c/Users/...`): Convert to `C:/Users/...` (existing behavior)
3. **Regular paths**: `path.normalize()` as normal

### Slow Filesystem Detection

We already call `fs.stat()` for Items 4 and 6. Measure how long it takes:

```typescript
const statStart = performance.now();
const stats = await fs.stat(validatedPath);
const statMs = performance.now() - statStart;

const isSlow = statMs > 50; // Local stat is <1ms; >50ms indicates non-local
```

**Detection heuristics (in order):**

| Signal | Threshold | What it catches |
|---|---|---|
| `stat()` latency | >50ms | Any slow filesystem (NFS, CIFS, FUSE, remote) |
| UNC path prefix | `\\` or `//` | Windows network drives |
| WSL cross-mount | `/mnt/[a-z]/` | WSL accessing Windows filesystem |
| Known slow prefixes | configurable list | Docker volumes, custom mounts |

### Adaptive Behavior for Slow Paths

When a path is detected as slow:

1. **Response metadata**: Include `"filesystem": "slow"` and `"stat_ms": 124` so agents know I/O is expensive
2. **Cache priority boost**: Slow-filesystem files get higher priority in FileStateCache LRU — evicted last, since re-reading is costly
3. **Timeout extension**: Automatic timeout increase for slow paths (e.g., 2x the normal timeout)
4. **Network-specific errors**: UNC/network path failures return `"is_network": true` with connectivity suggestions instead of generic ENOENT

### Response Metadata (added to normal read response)

```json
{
  "content": "...",
  "metadata": {
    "filesystem": "slow",
    "stat_ms": 124,
    "is_network": true,
    "note": "File is on a slow filesystem (124ms stat). Cached with high priority."
  }
}
```

For local files: `"filesystem"` key is omitted entirely (zero token cost on the common path).

### Path Translation Hints

For known cross-filesystem scenarios, suggest the canonical path:

| Detected Path | Suggestion |
|---|---|
| `/mnt/c/Users/...` (WSL) | "This is a WSL cross-mount. Native Windows path: `C:\Users\...`" |
| `C:\Users\...` in WSL context | "Use `/mnt/c/Users/...` for WSL-native access" |

These are regex-based detections — no external calls.

### What Exceeds Native

| Aspect | Native | Ours |
|---|---|---|
| UNC detection | Implicit via Node builtins | Explicit detection + `is_network` flag |
| Slow filesystem awareness | None | Stat latency measurement + adaptive behavior |
| Cache priority | Same for all files | Slow-filesystem files get LRU priority boost |
| Error messages | Generic ENOENT/EACCES | Network-specific errors with connectivity suggestions |
| Path normalization | `path.normalize()` only | UNC-aware + Git Bash-safe normalization |
| Cross-platform paths | Windows only (effectively) | WSL cross-mounts, Docker volumes, `//` Unix UNC |
| Path translation | None | Suggests canonical form for WSL/cross-mount paths |
| Timeout adaptation | Fixed | Auto-extended for slow filesystems |

### Implementation Notes

- **Zero overhead on local files**: `performance.now()` around an already-required `stat()` call. If stat is fast, skip all slow-path logic.
- `stat()` is shared with Items 4 and 6 — one call serves empty detection, size gating, and speed measurement
- Slow-path detection is configurable: custom prefix list in `goodvibes.json` for project-specific mounts
- Path translation hints are pure regex — no external calls, no LLM
- No new dependencies required

---

## 6. Pre-Read Size Gate with Automatic Pagination & Smart Preview

**Problem:** Both native Read and precision_read read the **entire file into memory** before checking if it's too large. For a 500MB log file or a massive build artifact, this means:
- Memory spike (Node reads full buffer)
- Wasted I/O (read then discard)
- Wasted time (large file reads can take seconds)

Native's limits: `maxSizeBytes = 262144` (256KB), `maxTokens = 25000`. Both checked AFTER read. When exceeded, returns a generic error telling the agent to use offset/limit. Agent gets zero useful data.

Precision_read's limits: `MAX_BINARY_SIZE = 5MB` for binaries only. No text file size gate. `max_per_item` and `max_tokens` are post-read truncation only.

**Solution:** Use `fs.stat()` to check file size BEFORE reading. When a file exceeds the threshold, **never return nothing** — always return useful data. Two modes: (1) paginated content for verbose/content requests, (2) smart auto-preview for unspecified extraction modes.

### Pre-Read Flow

```
stat() → size check → decide:
  ├─ Under threshold → read normally
  ├─ Over threshold, content/verbose requested → paginated read (first page)
  ├─ Over threshold, no extract specified → smart auto-preview by file type
  ├─ Over threshold, extract specified (outline/symbols/etc) → use that mode (no gate)
  ├─ Over threshold, binary → reject with suggestion
  └─ Over threshold, force: true → read full file with truncation warning
```

Key insight: if the agent explicitly requested `extract: "symbols"` or `extract: "outline"`, there's no reason to gate — those modes are already token-efficient. The gate only fires for full-content reads.

### Default Thresholds (Configurable)

| Threshold | Default | Native | Notes |
|---|---|---|---|
| `max_file_bytes` | 524288 (512KB) | 262144 (256KB) | Higher default — we handle large files better |
| `max_token_estimate` | 50000 | 25000 | Higher — our verbosity controls reduce output cost |
| `page_size_lines` | 200 | N/A | Lines per page for paginated reads |
| `max_binary_bytes` | 5242880 (5MB) | N/A | Existing, keep as-is |

Configurable via `precision_config` tool and `goodvibes.json`.

### Token Estimation Pre-Read

```typescript
const estimatedTokens = Math.ceil(stats.size / 4);  // ~4 bytes per token

if (estimatedTokens > maxTokenEstimate && !hasExplicitExtract) {
  // Trigger paginated read or smart preview
}
```

### Mode 1: Paginated Content Read

When the agent requests `extract: "content"` (or default) on a large file, return the **first page** of content automatically with pagination metadata:

```json
{
  "status": "paginated",
  "path": "src/large-module.ts",
  "page": 1,
  "lines_returned": "1-200",
  "total_lines": 4850,
  "total_pages": 25,
  "size_bytes": 245000,
  "size_human": "239.3 KB",
  "content": "    1 | import { foo } from './bar.js';\n    2 | import { baz } from './qux.js';\n    ...\n  200 | export function processData(input: DataInput): Result {",
  "next_page": {
    "hint": "To read the next page, use: range: {start: 201, end: 400}",
    "range": {"start": 201, "end": 400}
  },
  "alternatives": [
    {"extract": "symbols", "description": "Get function/class definitions only"},
    {"extract": "outline", "description": "Get structural overview"}
  ]
}
```

The agent naturally follows by calling precision_read again with `range: {start: 201, end: 400}`. No special pagination API — uses existing `range` parameter. Each subsequent page also includes `next_page` until the last page.

**Page calculation:**
```typescript
const pageSize = config.page_size_lines || 200;
const totalLines = countLines(stats.size);  // estimate from byte size, or fast line count
const totalPages = Math.ceil(totalLines / pageSize);
```

### Mode 2: Smart Auto-Preview

When the agent reads a large file **without specifying an extraction mode**, auto-select the most useful preview based on file type:

| File Type | Auto-Preview Strategy | What's Returned |
|---|---|---|
| Source code (`.ts`, `.js`, `.py`, etc.) | `symbols` extraction | Function/class definitions, exports |
| Log files (`.log`, `*.log.*`) | Last N lines (tail) | Most recent log entries |
| CSV/TSV data files | First N lines (head) | Headers + first few data rows |
| JSON files | Structural outline | Keys, nesting depth, array lengths (no values) |
| Minified/bundled JS | `outline` extraction | Structure without minified content |
| Lock files (`*.lock`) | Metadata only | "Lock file with X packages. Use precision_grep for specific packages." |
| Config files | First page (paginated) | Usually small enough, but paginate if huge |
| Unknown/other | First page (paginated) | Default fallback |

```json
{
  "status": "auto_preview",
  "path": "src/huge-module.ts",
  "preview_mode": "symbols",
  "size_bytes": 2097152,
  "size_human": "2.0 MB",
  "total_lines": 48500,
  "content": {
    "symbols": [
      {"name": "processData", "kind": "function", "line": 42, "exported": true},
      {"name": "DataInput", "kind": "interface", "line": 8, "exported": true},
      {"name": "Result", "kind": "type", "line": 15, "exported": true}
    ]
  },
  "full_content_hint": "File has 48,500 lines. Use range: {start: 1, end: 200} for paginated content read.",
  "alternatives": [
    {"extract": "content", "description": "Paginated full content (200 lines per page)"},
    {"extract": "outline", "description": "Structural overview"},
    {"action": "precision_grep", "description": "Search for specific content"}
  ]
}
```

For **log files**, the tail behavior is particularly useful:

```json
{
  "status": "auto_preview",
  "path": "logs/server.log",
  "preview_mode": "tail",
  "size_bytes": 15728640,
  "size_human": "15.0 MB",
  "total_lines": 125000,
  "lines_returned": "124801-125000",
  "content": "124801 | 2026-02-07 14:23:01 [INFO] Request processed in 42ms\n124802 | 2026-02-07 14:23:02 [WARN] Connection pool at 80%\n...",
  "full_content_hint": "File has 125,000 lines. Use range: {start: 1, end: 200} for first page."
}
```

### Force Override

When `force: true` is passed, the size gate is bypassed entirely:
- Full file is read into memory
- `max_per_item` truncation still applies
- Response includes a warning: `"warning": "Large file (15.0 MB) — output truncated to {max_per_item} lines"`
- Token cost is noted: `"estimated_tokens_returned": 8500`

### File-Type-Specific Suggestions (included in all gated responses)

| File Type | Additional Suggestion |
|---|---|
| Log files | "Use `range` with `start` near end of file to see recent entries" |
| Bundle/minified JS | "Use `symbols` to extract exports without reading minified content" |
| Generated files | "This appears to be a generated file — consider reading the source instead" |
| CSV/data files | "Use `range` to sample rows, or `precision_grep` to find specific records" |
| Lock files | "Lock files are rarely useful to read in full — use `precision_grep` for specific packages" |

### Integration with FileStateCache

- **Paginated reads**: Only the returned page is cached. Subsequent pages update the cache entry.
- **Auto-preview reads**: The preview data (symbols, outline, etc.) is cached. Full content is NOT cached (not read).
- **Full reads** (force or under threshold): Full content cached as normal.
- Size-gated files always store `stats` metadata: `{size, mtime, totalLines, gated: true, previewMode}`
- Re-reads of gated files: if file hasn't changed (same mtime + size), return same gate/preview response from cache

### What Exceeds Native

| Aspect | Native | Ours |
|---|---|---|
| When checked | After full read | Before read (via stat) |
| Memory impact | Full file loaded then discarded | Never loaded (or only one page) |
| Data returned on gate | Zero (just an error) | First page of content OR smart preview |
| Pagination | None (manual offset/limit) | Automatic with page metadata and next_page hint |
| File-type awareness | None | Auto-selects best preview mode per file type |
| Log file handling | Same as all files | Returns tail (most recent entries) |
| CSV handling | Same as all files | Returns headers + sample rows |
| JSON handling | Same as all files | Returns structural outline |
| Default thresholds | 256KB / 25K tokens | 512KB / 50K tokens |
| Configurable | Via env var only | Via precision_config + goodvibes.json |
| Force override | No | Yes — read anyway with truncation warning |
| Extraction bypass | N/A | outline/symbols requests skip the gate entirely |

### Implementation Notes

- `fs.stat()` is fast (~0.1ms for local files) — negligible overhead even when file is under threshold
- The stat call is shared with Items 4 and 5 — one `stat()` serves empty detection, size gating, and speed measurement
- **Paginated reads use streaming**: `fs.createReadStream()` with a line counter, stopping at `pageSize`. Never loads the full file.
- Smart preview file type detection reuses Item 3's file type detection — no additional logic
- The `force: true` parameter is shared with FileStateCache (Item 1) — same parameter, consistent behavior
- Token estimation from bytes is approximate but good enough for gating decisions
- Total line count estimation: `stats.size / avgBytesPerLine` (use 80 as default, or measure from first 4KB sample)

---

## 7. Token-Budgeted Batch Pagination

**Problem:** Batch reads (`files: [A, B, C, D, E]`) dump all content into a single response. Five medium-sized files at `extract: "content"` can easily produce 200K+ tokens. The MCP response becomes enormous, blowing past context limits and wasting tokens the agent can't use.

**Solution:** Token-budgeted pagination for batch reads. Include as many complete files as fit within the token budget, partial content for the file that straddles the boundary, and explicitly list what's pending. Uses FileStateCache (Item 1) as the intermediate buffer — no special storage area needed.

### When Pagination Applies

Only for verbose/content modes. Lighter extractions never need it:

| Mode | Paginated? | Why |
|---|---|---|
| `count_only` | No | A few numbers per file. Entire batch fits trivially. |
| `minimal` | No | File exists + line count + size. Tiny per file. |
| `symbols` | No | Function/class names + line numbers. Compact even for 50 files. |
| `outline` | No | Structural overview. Compact. |
| `lines` (with range) | No | Bounded by the range itself. |
| `content` (standard/verbose) | **Yes** | Full file text. Unbounded per file. |
| `ast` | Rarely | Can be large for complex files, but unlikely in batch. Apply if total exceeds budget. |

Gate logic:
```typescript
const needsPagination = 
  (extract === 'content' || extract === 'ast') &&
  estimatedBatchTokens > tokenBudget;
```

### Batch Read Flow

```
Agent requests: files: [A, B, C, D, E] with extract: "content"

1. Read all 5 from disk → store in FileStateCache
2. Calculate per-file token costs:
   A = 800, B = 12000, C = 25000, D = 18000, E = 3000
3. Token budget: 50000
4. Pack files in request order:
   A: complete (800)       running: 800
   B: complete (12000)     running: 12800
   C: complete (25000)     running: 37800
   D: partial, lines 1-120 of 350 (12200)  running: 50000
   E: pending
5. Return page 1 with pagination metadata
```

### Response Format

```json
{
  "status": "paginated_batch",
  "page": 1,
  "files_requested": 5,
  "files_complete": 3,
  "files_partial": 1,
  "files_pending": 1,
  "token_budget": 50000,
  "tokens_used": 49800,
  "results": {
    "src/main.ts":   {"status": "complete", "lines": 42, "content": "..."},
    "src/utils.ts":  {"status": "complete", "lines": 280, "content": "..."},
    "src/config.ts": {"status": "complete", "lines": 610, "content": "..."},
    "src/routes.ts": {"status": "partial", "lines_returned": "1-120",
                      "total_lines": 350, "content": "..."}
  },
  "pending": [
    {"path": "src/handlers.ts", "estimated_tokens": 3000}
  ],
  "next_page": {
    "hint": "Next page: lines 121-350 of src/routes.ts, then src/handlers.ts",
    "files": [
      {"path": "src/routes.ts", "range": {"start": 121}},
      {"path": "src/handlers.ts"}
    ]
  }
}
```

The agent gets a clear picture: "I got 3 full files, part of a 4th, and the 5th is waiting." The `next_page.files` array is exactly what they'd pass back to precision_read for page 2.

### Packing Rules

1. **Complete files first, then partial** — an agent can use a complete file immediately. A partially-included file mid-batch is confusing.
2. **Respect original request order** — files appear in the same order the agent asked for them.
3. **Partial file gets the remaining budget** — don't waste the gap. If there's room for 120 lines of file D, return those 120 lines.
4. **Pending files show estimated tokens** — agent can decide if it needs all of them or just specific ones.
5. **Large files trigger Item 6 individually** — a file exceeding the size gate gets auto-preview/pagination treatment, and that preview counts against the batch token budget.

### Page 2+ Retrieval (Cache-Backed)

When the agent requests the next page by passing back `next_page.files`:
- All files are already in FileStateCache from the initial batch read
- **Zero disk reads** — content served from cache
- If a file was modified between pages (detected via hash), the agent is notified (Item 1 cache-hit-changed behavior)
- Pagination continues until all requested files are fully returned

### Token Budget

| Setting | Default | Source |
|---|---|---|
| `batch_token_budget` | 50000 | precision_config + goodvibes.json |
| Per-file `max_per_item` | Infinity (for batch pagination, the budget is the constraint) | Existing parameter |
| `max_tokens` (explicit) | Overrides `batch_token_budget` if lower | Existing parameter |

If the agent passes `max_tokens: 20000`, the batch is paginated at 20K tokens regardless of the default budget.

### Interaction with Item 6 (Size Gate)

When a batch includes a file that exceeds the Item 6 size threshold:
- That file gets its auto-preview treatment (symbols for source, tail for logs, etc.)
- The preview's token cost counts against the batch budget
- The file is marked `"status": "auto_preview"` in the results, not `"complete"`
- The agent can force-read it in a subsequent call if needed

Example: batch of `[small.ts, huge.log, medium.ts]`:
```json
{
  "results": {
    "small.ts":  {"status": "complete", "lines": 50, "content": "..."},
    "huge.log":  {"status": "auto_preview", "preview_mode": "tail",
                  "total_lines": 125000, "lines_returned": "124801-125000",
                  "content": "..."},
    "medium.ts": {"status": "complete", "lines": 200, "content": "..."}
  }
}
```

### What Exceeds Native

Native Read doesn't have batch reads at all — it's one file per call. This is entirely additive.

| Aspect | Native | Ours |
|---|---|---|
| Batch reads | Not supported | Up to N files per call |
| Token budgeting | None | Configurable per-batch budget |
| Pagination across files | N/A | Automatic with clear metadata |
| Cache-backed continuation | N/A | Page 2+ served from cache (zero disk) |
| Partial file handling | N/A | Fills remaining budget with partial content |
| Mixed extraction in batch | N/A | Large files get auto-preview, small files get full content |

### Implementation Notes

- FileStateCache is the intermediate buffer — all files read to cache, pagination is a view over cached content
- Token estimation uses `Math.ceil(content.length / 4)` per file (same formula throughout)
- Batch reads with lighter extraction modes (`symbols`, `outline`, etc.) skip pagination entirely — the total is always small
- Page size is dynamic (token-budget-based), not fixed line counts
- `ast` extraction: paginate only if total exceeds budget. Rare in practice.

---

## Gap Analysis Reference

Status of all identified gaps from native Claude Code vs precision_engine comparison.

### precision_read
- ~~Missing: "Did you mean X?" suggestions on file-not-found~~ → **Item 2**
- ~~Missing: empty file warning~~ → **Item 4**
- ~~Missing: pre-read size gate~~ → **Item 6**
- ~~Missing: token budgeted batch pagination~~ → **Item 7**

### precision_write
- ~~Missing: read-before-write safety~~ → **Item 9** (safe overwrite, better than native's approach)

### precision_edit
- ~~Default verbosity wastes tokens~~ → **Item 8F**

### precision_exec
- ~~Output limit 10K vs native's 30K~~ → **Item 10A** (increased to 50K)
- ~~Default timeout 30s vs native's 120s~~ → **Item 10A** (increased to 120s)
- ~~Missing: background execution~~ → **Item 10E**
- ~~Missing: working directory persistence~~ → **Item 10B**
- ~~Missing: progress reporting~~ → **Item 10F**

### precision_fetch
- ~~AI-powered content extraction~~ → **Item 11** (replaced with Readability.js + Turndown + smart extraction — no LLM calls)
- ~~HTML-to-Markdown is regex-based~~ → **Item 11A** (Turndown)

### No precision equivalent
- **WebSearch** — Out of scope. Requires external search API (Google/Bing). Native WebSearch is always available alongside precision tools. Not a user-facing gap.
- ~~NotebookEdit~~ → **Item 13**

### New capabilities
- **analytics_engine** — Separate design doc: `analytics-engine.md`
- **FileStateCache** → **Item 1** (no native equivalent)
- **Contextual Intelligence** → **Item 3** (no native equivalent)
- **Slow Filesystem Detection** → **Item 5** (no native equivalent)

---

## 8. Remove TOKEN_MULTIPLIERS & Fix Token Estimation

**Problem:** `TOKEN_MULTIPLIERS` in `src/config.ts` applies a multiplier to the token estimate *after* the response data is already fully serialized. This makes the `token_estimate` in `meta` inaccurate — it reports a fraction of the actual tokens sent. For example, `count_only` mode uses multiplier `0.05`, so a 1000-token response is reported as 50 tokens. The agent (and any future analytics) sees a lie.

The actual token savings come from handlers returning less data in lighter modes. The multiplier doesn't reduce output — it just misreports what was sent.

Additional issues discovered during audit:
- **Meta field naming mismatch**: `PrecisionResult.meta` in `types.ts` defines `output_mode: OutputMode`, but `successResult()` in `utils/index.ts` writes `verbosity: outputMode`. The JSON output uses the wrong key.
- **OutputMode type is incomplete**: `types.ts` defines `OutputMode` as `'count_only' | 'minimal' | 'standard' | 'verbose' | 'with_preview' | 'exit_codes'`, but `parseOutputMode()` accepts 13+ modes including `paths_only`, `files_only`, `with_diff`, `signatures`, `locations`, `matches`, `context`. The type doesn't cover the tool-specific modes.
- **Duplicate error result functions**: `errorResult()` in `utils/index.ts` and `createErrorResult()` in `utils/errors.ts` both build error results with token estimates, using different shapes.

### Current Code (What's Wrong)

**config.ts:28** — The multiplier table:
```typescript
export const TOKEN_MULTIPLIERS: Record<OutputMode, number> = {
  count_only: 0.05,
  exit_codes: 0.1,
  minimal: 0.2,
  standard: 0.6,
  with_preview: 0.8,
  verbose: 1.0,
};
```

**utils/index.ts:52-70** — Where the lie happens:
```typescript
export function successResult<T>(
  data: T,
  outputMode: OutputMode,
  executionMs: number
): PrecisionResult<T> {
  const jsonStr = JSON.stringify(data);
  const baseTokens = estimateTokens(jsonStr);              // Correct: estimate based on actual data
  const adjustedTokens = Math.ceil(baseTokens * TOKEN_MULTIPLIERS[outputMode]); // Wrong: arbitrary reduction

  return {
    success: true,
    data,
    meta: {
      verbosity: outputMode,      // Wrong key name — type says 'output_mode'
      token_estimate: adjustedTokens,  // Inaccurate estimate
      execution_ms: executionMs,
    },
  };
}
```

### Solution

#### A. Remove TOKEN_MULTIPLIERS

Delete from `config.ts`. Remove import from `utils/index.ts`. The multiplier concept is fundamentally flawed — you can't retroactively discount tokens that were already sent.

#### B. Fix successResult() — Accurate Estimation

```typescript
export function successResult<T>(
  data: T,
  outputMode: OutputMode,
  executionMs: number
): PrecisionResult<T> {
  const jsonStr = JSON.stringify(data);
  const tokenEstimate = estimateTokens(jsonStr);

  return {
    success: true,
    data,
    meta: {
      output_mode: outputMode,       // Correct key name, matches PrecisionResult type
      token_estimate: tokenEstimate, // Actual estimate, no multiplier
      execution_ms: executionMs,
    },
  };
}
```

The estimate is now honest: it reflects the actual size of the `data` field that gets serialized into the MCP response. When an agent uses `count_only` mode, the data is small → the estimate is small. When they use `verbose`, the data is large → the estimate is large. The savings are real, not fabricated.

#### C. Fix OutputMode Type

Expand to include all tool-specific modes:
```typescript
export type OutputMode =
  // Universal modes
  | 'count_only' | 'minimal' | 'standard' | 'verbose' | 'with_preview' | 'exit_codes'
  // precision_grep / discover
  | 'files_only' | 'locations' | 'matches' | 'context'
  // precision_glob
  | 'paths_only'
  // precision_edit
  | 'with_diff'
  // precision_symbols
  | 'signatures';
```

#### D. Fix Meta Field Naming

Align `PrecisionResult.meta` to use `output_mode` consistently (matching the type definition). Audit all places that construct meta objects manually:
- `successResult()` in `utils/index.ts` → fix key from `verbosity` to `output_mode`
- `errorResult()` in `utils/index.ts` → verify key name
- `createErrorResult()` in `utils/errors.ts` → already uses `output_mode` (correct)
- Any handler that constructs `PrecisionResult` directly

#### E. Consolidate Error Result Functions

Merge `errorResult()` and `createErrorResult()` into a single function. Both do the same thing with slightly different signatures. Keep `errorResult()` (it's typed properly) and have `createErrorResult()` delegate to it or be removed.

### Impact

| File | Change |
|---|---|
| `src/config.ts` | Remove `TOKEN_MULTIPLIERS` export |
| `src/utils/index.ts` | Remove import, fix `successResult()`, fix meta key |
| `src/utils/errors.ts` | Consolidate with `errorResult()` |
| `src/types.ts` | Expand `OutputMode` type, verify `PrecisionResult.meta` |
| All 11 handler files | No changes needed — they all call `successResult()` which handles it |
| Tests | Update any tests that assert on `token_estimate` values or `verbosity` key |

### What This Fixes

- Token estimates become **accurate** — they reflect actual response size
- Meta field naming becomes **consistent** — `output_mode` everywhere
- OutputMode type becomes **complete** — no more untyped string literals
- Error result construction becomes **unified** — single path, typed properly
- Future analytics (Item 1, FileStateCache `tokensSaved`) can rely on honest numbers

#### F. Fix Default Verbosity — Stop Wasting Tokens on Echo

**This is the single highest-impact quick win in the entire document.**

Current defaults waste tokens by echoing content back to the agent that the agent already knows:

| Tool | Current Default | Tokens Wasted Per Call | Should Be |
|---|---|---|---|
| precision_edit | `with_diff` | ~1K-30K (full diff of every edit) | `minimal` |
| precision_write | `standard` | ~200-500 (file stats, content echo) | `minimal` |
| precision_read | `standard` | Appropriate — agent needs the content | `standard` (keep) |
| precision_exec | `standard` | Appropriate — agent needs command output | `standard` (keep) |
| precision_fetch | `standard` | Appropriate — agent needs fetched content | `standard` (keep) |
| precision_grep | `files_only` | Already efficient | `files_only` (keep) |
| precision_glob | `paths_only` | Already efficient | `paths_only` (keep) |
| precision_symbols | `signatures` | Already efficient | `signatures` (keep) |
| discover | `files_only` | Already efficient | `files_only` (keep) |

The worst offender is `precision_edit` with `with_diff`. Every edit echoes the full unified diff back to the agent that just provided the find/replace. For our 800-line append to a 2,700-line file, the diff was ~120K chars = **~30,000 tokens** burned on echo. The agent already knew every line.

**Fix `TOOL_SPECIFIC_DEFAULTS` in `utils/index.ts`:**
```typescript
export const TOOL_SPECIFIC_DEFAULTS: Record<string, Partial<typeof STANDARD_DEFAULTS & { verbosity: string }>> = {
  discover: { verbosity: 'files_only' },
  precision_symbols: { verbosity: 'signatures' },
  precision_edit: { verbosity: 'minimal' },     // was 'with_diff' — saves 1K-30K tokens per edit
  precision_write: { verbosity: 'minimal' },     // NEW — agent knows what it wrote
  precision_glob: { verbosity: 'paths_only' },
  precision_grep: { verbosity: 'files_only' },
};
```

Agents that need the diff explicitly request `verbosity: "with_diff"`. This is opt-in, not opt-out.

#### G. Per-Tool Verbosity Configuration in goodvibes.json

Users should be able to set their preferred default verbosity per tool in `goodvibes.json`:

```json
{
  "precision_engine": {
    "verbosity_defaults": {
      "precision_edit": "minimal",
      "precision_write": "minimal",
      "precision_read": "standard",
      "precision_exec": "standard",
      "precision_fetch": "standard",
      "precision_grep": "files_only",
      "precision_glob": "paths_only",
      "precision_symbols": "signatures",
      "discover": "files_only"
    }
  }
}
```

**Resolution order** (first match wins):
1. Explicit `verbosity` parameter in the request → use that
2. `output.format` in the request → use that
3. `goodvibes.json` per-tool default → use that
4. `TOOL_SPECIFIC_DEFAULTS` in code → use that
5. `STANDARD_DEFAULTS.verbosity` (`'standard'`) → fallback

This means users can tune their token efficiency per tool. A user doing heavy editing could set precision_edit to `count_only`. A user debugging could set precision_exec to `verbose`.

**Implementation:** `parseOutputMode()` in `utils/index.ts` already handles the resolution chain for steps 1-2 and 4-5. Adding step 3 means reading from runtime config (same pattern as `precision_config` tool).

#### H. Smart Diff Size Gate

For when `with_diff` IS explicitly requested: prevent overflow by capping diff size.

```typescript
const MAX_DIFF_CHARS = 10000; // ~2,500 tokens

if (diff.length > MAX_DIFF_CHARS) {
  return {
    diff_truncated: true,
    diff_lines_total: diffLines,
    diff_preview: diff.slice(0, MAX_DIFF_CHARS / 2) + '\n...\n' + diff.slice(-MAX_DIFF_CHARS / 2),
    hint: 'Diff truncated. Use precision_read with force: true to see full file.'
  };
}
```

Head + tail pattern (same as Item 10 Part C for exec output). Agent sees the beginning and end of the diff. Full content available via precision_read if needed.

Configurable via `goodvibes.json`:
```json
{
  "precision_engine": {
    "max_diff_chars": 10000
  }
}
```

### Updated Impact

| File | Change |
|---|---|
| `src/config.ts` | Remove `TOKEN_MULTIPLIERS` export |
| `src/utils/index.ts` | Remove import, fix `successResult()`, fix meta key, update `TOOL_SPECIFIC_DEFAULTS`, add goodvibes.json config resolution to `parseOutputMode()`, add diff size gate |
| `src/utils/errors.ts` | Consolidate with `errorResult()` |
| `src/types.ts` | Expand `OutputMode` type, verify `PrecisionResult.meta` |
| `src/runtime-config.ts` | Add `verbosity_defaults` and `max_diff_chars` to config schema |
| All 11 handler files | No changes needed — they all call `successResult()` / `parseOutputMode()` |
| Tests | Update any tests that assert on `token_estimate` values or `verbosity` key |

### Estimated Token Savings (Per Session)

| Scenario | Before (with_diff default) | After (minimal default) | Savings |
|---|---|---|---|
| 50 edits, avg 100-line file | ~200K tokens on diff echo | ~750 tokens (15/edit) | **~199K tokens** |
| 50 edits, avg 500-line file | ~500K tokens on diff echo | ~750 tokens | **~499K tokens** |
| 10 writes | ~5K tokens on echo | ~150 tokens | **~4.8K tokens** |
| **Typical session** | **~250K wasted** | **~1K** | **~249K saved** |

At current API pricing, ~249K tokens saved per session is meaningful — both in cost and in context window pressure.

---

## 9. Safe Overwrite — Automatic Backup on First-Time Overwrite

**Problem:** When `precision_write` is called with `mode: "overwrite"` on a file that has never been read this session (not in FileStateCache), the agent is blindly replacing content it's never seen. Native Write prevents this entirely with a read-before-write enforcement rule — but that's a blunt instrument that blocks legitimate workflows. Precision_write's `fail_if_exists` / `overwrite` / `backup` mode system is more flexible, but the `overwrite` path has no safety net for unread files.

**Solution:** Three-layer automatic safety system that fires only on first-time overwrites (file not in FileStateCache). Zero agent configuration needed — the tool handles it transparently.

**Depends on:** Item 1 (FileStateCache) for the in-memory snapshot layer.

### Detection

```typescript
const isFirstOverwrite = 
  mode === 'overwrite' && 
  fileExists && 
  !FileStateCache.has(resolvedPath);
```

This only fires when ALL three conditions are true:
- Agent explicitly chose `overwrite` mode
- The file already exists on disk
- The file has never been read (or written) in this session

If the file is in the cache, OCC (Item 1) already handles conflict detection. If the file doesn't exist, there's nothing to protect. If mode is `fail_if_exists` or `backup`, the existing behavior is already safe.

### Layer 1 — Cache Snapshot (In-Memory, Always)

Before overwriting, read the existing content into FileStateCache:

```typescript
const existingContent = await fs.readFile(resolvedPath, 'utf-8');
FileStateCache.set(resolvedPath, existingContent, { source: 'pre_overwrite_snapshot' });
```

Cost: one `fs.readFile()` — negligible. This immediately enables:
- Diff on next `precision_read` ("here's what the overwrite changed")
- OCC version tracking from this point forward
- Session-scoped recovery (content is in memory)

### Layer 2 — Persistent Backup (Filesystem, Conditional)

Copy the existing file to `.goodvibes/.backups/` — but only when git can't recover it:

```
.goodvibes/.backups/
  src/
    config.ts.20260207_143052.bak
    routes.ts.20260207_144510.bak
```

Backup path mirrors the source path structure under `.goodvibes/.backups/`, with a timestamp suffix. This directory is already gitignored (goodvibes creates `.gitignore` automatically).

**When to create the backup:**

| Git Status | Backup Created? | Reason |
|---|---|---|
| Clean (committed, no changes) | No | `git checkout -- path` can restore. Zero overhead. |
| Dirty (uncommitted changes) | **Yes** | Uncommitted work would be lost forever |
| Staged (changes in index) | **Yes** | Staged work would be lost forever |
| Untracked (not in git) | **Yes** | No git safety net at all |
| No git repo | **Yes** | No git safety net at all |

### Layer 3 — Git-Aware Warning (Informational)

When the file is in a git repo, check its status and include actionable information in the response:

```typescript
const gitStatus = await getFileGitStatus(resolvedPath); // 'clean' | 'dirty' | 'staged' | 'untracked' | null
```

The git check uses `git status --porcelain -- <path>` — single file, fast (<10ms).

### Response Format

**Dirty/staged file (highest risk):**
```json
{
  "status": "written",
  "path": "src/config.ts",
  "bytes_written": 2400,
  "safety": {
    "first_overwrite": true,
    "pre_snapshot": "cached (version 1)",
    "backup": ".goodvibes/.backups/src/config.ts.20260207_143052.bak",
    "git_status": "dirty",
    "warning": "File had uncommitted changes — backup created at .goodvibes/.backups/src/config.ts.20260207_143052.bak"
  }
}
```

**Clean git file (lowest risk):**
```json
{
  "status": "written",
  "path": "src/config.ts",
  "bytes_written": 2400,
  "safety": {
    "first_overwrite": true,
    "pre_snapshot": "cached (version 1)",
    "git_status": "clean",
    "recoverable_via": "git checkout -- src/config.ts"
  }
}
```

**No git / untracked:**
```json
{
  "status": "written",
  "path": "src/config.ts",
  "bytes_written": 2400,
  "safety": {
    "first_overwrite": true,
    "pre_snapshot": "cached (version 1)",
    "backup": ".goodvibes/.backups/src/config.ts.20260207_143052.bak",
    "git_status": null,
    "warning": "No git history for this file — backup created"
  }
}
```

**Normal overwrite (file already in cache):**
```json
{
  "status": "written",
  "path": "src/config.ts",
  "bytes_written": 2400
}
```

No `safety` block at all — the file was already known, OCC handles it.

### Backup Cleanup

Backups accumulate in `.goodvibes/.backups/`. Cleanup strategy:
- **Manual**: Agent or user can delete `.goodvibes/.backups/` at any time
- **Session-end hook**: Optional cleanup on MCP server shutdown (configurable)
- **Age-based**: Configurable max age (default: 7 days). Old backups pruned on next write.
- **Size-based**: Configurable max total size (default: 50MB). LRU eviction if exceeded.

Cleanup is best-effort — if it fails, the backups just stay. They're gitignored and harmless.

### Configuration (via precision_config + goodvibes.json)

| Key | Type | Default | Description |
|---|---|---|---|
| `safe_overwrite` | `boolean` | `true` | Enable/disable the entire safety system |
| `backup_dir` | `string` | `.goodvibes/.backups` | Where to store persistent backups |
| `backup_max_age_days` | `number` | 7 | Auto-prune backups older than this |
| `backup_max_mb` | `number` | 50 | Max total backup size before LRU eviction |
| `backup_git_clean_skip` | `boolean` | `true` | Skip filesystem backup for git-clean files |

### What Exceeds Native

| Aspect | Native | Ours |
|---|---|---|
| Safety approach | Blanket read-before-write rule | Targeted: only first-time overwrites of unread files |
| Agent experience | Hard block — must read first, no exceptions | Transparent — overwrite proceeds, safety happens automatically |
| Recovery options | None provided (just blocks the write) | Cache snapshot + filesystem backup + git recovery path |
| Git awareness | None | Checks git status, skips backup for recoverable files |
| Diff capability | None | Next read shows diff of what the overwrite changed |
| Persistent backup | None | `.goodvibes/.backups/` with timestamped copies |
| Configurable | No | Full control over backup behavior, location, cleanup |
| Overhead on safe paths | Same as unsafe (read-before-write always required) | Zero overhead when file is already cached |

### Implementation Notes

- **Zero overhead for cached files** — the `FileStateCache.has()` check is O(1). If the file is known, none of this fires.
- **One extra `readFile()` for uncached overwrites** — this is the cost of safety. Negligible for any file small enough to overwrite.
- **Git status check**: `git status --porcelain -- <path>` is fast (~5-10ms for a single file). Only runs for first-time overwrites.
- **Backup directory**: Created lazily on first backup. Uses `recursive: true` for nested paths.
- **Race condition**: Between the snapshot read and the overwrite write, another process could modify the file. This is a theoretical concern — in practice, the window is <1ms. If absolute safety is needed, the `backup` mode (existing) uses atomic rename.
- **Large files**: If the file to back up is very large (>50MB), skip the filesystem backup and log a warning. The cache snapshot still captures it (memory permitting).
- Depends on FileStateCache (Item 1) for the in-memory snapshot. Without Item 1, only Layers 2 and 3 function.

---

## 10. precision_exec Overhaul — Close the Biggest Gap

**Problem:** precision_exec is the widest gap vs native Bash. Current defaults are 3-4x more restrictive (10K output vs 30K, 30s timeout vs 120s), and it's missing critical capabilities: background execution, working directory persistence, progress reporting, large output handling, and semantic error interpretation. An agent running `npm test` or `npm run build` routinely hits both limits. Data gets truncated (lost forever) and builds get killed mid-run.

**Current state** (from `precision-exec.ts`):
```
DEFAULT_TIMEOUT = 30000        // 30s — builds/tests timeout
DEFAULT_MAX_OUTPUT_LINES = 100 // 100 lines — test output truncated
MAX_OUTPUT_CHARS = 10000       // 10K chars — stack traces cut off
```

**Solution:** Multi-part overhaul organized from quick wins to architectural changes.

### Part A — Defaults & Limits (Quick Wins)

**Output limit: 10K → 50K chars**

Native is 30K. We go to 50K because:
- Our verbosity controls can reduce output when agents want less
- 30K still truncates `npm test` output on medium projects
- 50K captures most build/test output completely
- When output exceeds 50K, Part C (overflow handling) kicks in — no data loss

```typescript
const MAX_OUTPUT_CHARS = 50000;       // was 10000
const DEFAULT_MAX_OUTPUT_LINES = 500; // was 100
```

**Timeout: 30s → 120s default**

Match native. Common operations that exceed 30s:
- `npm install` on a fresh project
- `npm run build` with TypeScript compilation
- `npx vitest run` on a full test suite
- Docker builds
- Database migrations

```typescript
const DEFAULT_TIMEOUT = 120000; // was 30000
```

Per-command `timeout_ms` still overrides the default. Configurable via `precision_config`.

### Part B — Working Directory Persistence

**Problem:** Each precision_exec call is isolated. If an agent runs `cd /some/path` then runs another command, the `cd` is lost. Native Bash persists working directory across calls. Agents habitually `cd` and expect it to stick — they waste tokens re-specifying `cwd` or constructing absolute paths.

**Solution:** Session-scoped working directory that persists across calls.

```typescript
// Server-scoped singleton
class SessionState {
  private _cwd: string = process.cwd();
  
  get cwd(): string { return this._cwd; }
  
  setCwd(newCwd: string): void {
    // Validate directory exists before accepting
    this._cwd = path.resolve(this._cwd, newCwd);
  }
}
```

**Resolution order:**
1. Per-command `cwd` field (explicit override) → use that
2. Request-level `working_dir` field (existing) → use that, update session cwd
3. Session cwd (persisted from previous calls) → use that
4. `process.cwd()` → initial default

**cd detection:**
```typescript
// After command execution, detect cd-like directory changes
function detectCdFromCommand(cmd: string, currentCwd: string): string | null {
  // Direct cd commands
  const cdMatch = cmd.match(/^cd\s+(.+?)\s*(?:[;&|]|$)/);
  if (cdMatch) return path.resolve(currentCwd, cdMatch[1].replace(/["']/g, ''));
  
  // pushd/popd — track the stack
  // Chained commands: cd foo && npm run build → detect the cd prefix
  return null;
}
```

After each command, if the command starts with `cd` (or uses `pushd`), update the session cwd. Include the current cwd in the response metadata:

```json
{
  "results": [...],
  "session": {
    "cwd": "/home/user/project/packages/core",
    "cwd_changed": true,
    "previous_cwd": "/home/user/project"
  }
}
```

### Part C — Large Output Handling (Overflow to File)

**Problem:** When output exceeds `MAX_OUTPUT_CHARS`, precision_exec truncates — data is lost forever. Native Bash truncates too (at 30K) but has an MCP temp file offload system. We should do better than both.

**Solution:** When output exceeds the limit, write full output to a temp file and return head + tail + file path. Agent reads the rest via `precision_read` if needed.

```typescript
const OVERFLOW_THRESHOLD = MAX_OUTPUT_CHARS; // 50K chars

if (stdout.length > OVERFLOW_THRESHOLD) {
  const overflowPath = await writeOverflowFile(stdout, cmdId);
  // Return head + tail, not just head
  truncatedStdout = {
    head: stdout.slice(0, OVERFLOW_THRESHOLD / 2),
    tail: stdout.slice(-OVERFLOW_THRESHOLD / 2),
    overflow_file: overflowPath,
    total_chars: stdout.length,
    total_lines: stdout.split('\n').length
  };
}
```

**Overflow file location:** `.goodvibes/.exec-output/<cmd-id>-<timestamp>.log`
- Gitignored (inside `.goodvibes/`)
- Auto-cleaned: files older than 1 hour pruned on next exec call
- Agent can read via `precision_read` with all its features (pagination, grep, etc.)

**Response format (overflow case):**
```json
{
  "exit_code": 0,
  "duration_ms": 45200,
  "stdout": {
    "status": "overflow",
    "head": "first 25K chars...",
    "tail": "...last 25K chars",
    "total_chars": 284000,
    "total_lines": 3420,
    "overflow_file": ".goodvibes/.exec-output/cmd1-20260207_143052.log",
    "hint": "Full output saved. Use precision_read to access."
  },
  "stderr": "..."
}
```

The **head + tail** pattern is critical: agents need the beginning (command startup, compilation start) AND the end (test results, error summary). Middle content is rarely needed immediately. If it is, the overflow file has everything.

### Part D — Exit Code Semantic Interpretation

**Problem:** precision_exec returns `exit_code: 137` and the agent has to figure out what that means. Often it can't, and wastes a round-trip asking or guessing wrong.

**Solution:** Lookup table mapping exit codes to human-readable explanations. Zero external calls.

```typescript
const EXIT_CODE_SEMANTICS: Record<number, { meaning: string; suggestion: string }> = {
  0:   { meaning: 'Success', suggestion: '' },
  1:   { meaning: 'General error', suggestion: 'Check stderr for details' },
  2:   { meaning: 'Misuse of shell command', suggestion: 'Check command syntax' },
  126: { meaning: 'Permission denied (not executable)', suggestion: 'Check file permissions, try chmod +x' },
  127: { meaning: 'Command not found', suggestion: 'Check if the command is installed and in PATH' },
  128: { meaning: 'Invalid exit argument', suggestion: '' },
  130: { meaning: 'Interrupted (SIGINT / Ctrl+C)', suggestion: 'Process was interrupted' },
  137: { meaning: 'Killed (SIGKILL)', suggestion: 'Process was killed — likely OOM or timeout. Check memory usage.' },
  139: { meaning: 'Segmentation fault (SIGSEGV)', suggestion: 'Memory access violation in the process' },
  143: { meaning: 'Terminated (SIGTERM)', suggestion: 'Process was terminated gracefully' },
};

// Signal-based exit codes: 128 + signal_number
function interpretExitCode(code: number): { meaning: string; suggestion: string } | null {
  if (EXIT_CODE_SEMANTICS[code]) return EXIT_CODE_SEMANTICS[code];
  if (code > 128 && code <= 192) {
    const signal = code - 128;
    return { meaning: `Killed by signal ${signal}`, suggestion: `Process received signal ${signal}` };
  }
  return null;
}
```

**Response addition (non-zero exit only):**
```json
{
  "exit_code": 137,
  "exit_interpretation": {
    "meaning": "Killed (SIGKILL)",
    "suggestion": "Process was killed — likely OOM or timeout. Check memory usage."
  },
  "duration_ms": 30012
}
```

For exit code 0: no interpretation added (zero tokens).

### Part E — Background Execution

**Problem:** precision_exec blocks until the command completes. For dev servers (`npm run dev`), watch modes (`npx vitest --watch`), or long builds, there's no way to start a process and check on it later. Native Bash has `run_in_background` parameter.

**Solution:** Process manager singleton that tracks background processes.

**New parameter:** `background: true`

When `background: true`:
1. Start process with `child_process.spawn()` (detached)
2. Pipe stdout/stderr to a log file: `.goodvibes/.exec-output/bg-<id>.log`
3. Return immediately with process metadata
4. Store process reference in `ProcessManager` singleton

**Immediate response:**
```json
{
  "status": "background",
  "process_id": "bg_20260207_143052",
  "pid": 48291,
  "command": "npm run dev",
  "log_file": ".goodvibes/.exec-output/bg-bg_20260207_143052.log",
  "hint": "Check status: precision_exec with commands: [{cmd: 'bg_status', args: ['bg_20260207_143052']}]"
}
```

**Built-in management commands:**

| Command | Description |
|---|---|
| `bg_status <id>` | Check if process is running, return last N lines of output |
| `bg_output <id>` | Return buffered output since last check (like `tail -f`) |
| `bg_stop <id>` | Send SIGTERM, wait 5s, SIGKILL if needed |
| `bg_list` | List all background processes with status |

These are detected as special commands by precision_exec — not actual shell commands. They route to the ProcessManager.

**bg_status response:**
```json
{
  "process_id": "bg_20260207_143052",
  "pid": 48291,
  "status": "running",
  "uptime_ms": 45200,
  "command": "npm run dev",
  "output_tail": "[vite] Dev server running at http://localhost:5173\n[vite] ready in 342ms",
  "output_lines_total": 28,
  "log_file": ".goodvibes/.exec-output/bg-bg_20260207_143052.log"
}
```

**Process cleanup:**
- Background processes are killed on MCP server shutdown (graceful SIGTERM → SIGKILL after 5s)
- Orphan detection: if a background process exits on its own, its status updates to `"exited"` with exit code
- Max background processes: configurable (default: 5). New bg request when at max returns error with list of running processes.

### Part F — Progress Reporting for Long-Running Commands

**Problem:** Commands that take 30+ seconds return nothing until completion. The agent (and user) has no idea if the process is stuck, progressing, or about to finish. Native Bash can report intermediate output.

**Solution:** For commands exceeding a time threshold, capture periodic output snapshots. MCP responses are atomic (no streaming), so we use a two-tier approach.

**Tier 1 — Inline progress markers (in final response):**

For completed commands that took >10s, include timing milestones in the response:
```json
{
  "exit_code": 0,
  "duration_ms": 45200,
  "progress": [
    {"at_ms": 0, "line": "$ npm run build"},
    {"at_ms": 2100, "line": "Compiling TypeScript..."},
    {"at_ms": 18400, "line": "Building 142 modules..."},
    {"at_ms": 38900, "line": "Build complete. 0 errors."},
    {"at_ms": 45200, "line": "Done in 45.2s."}
  ],
  "stdout": "full output..."
}
```

The `progress` array captures the first line that appears after each significant time gap (>2s silence). Shows the agent the timeline of the build. ~20-50 tokens.

**Tier 2 — Live output file (pollable):**

For commands with `timeout_ms > 30000` or when `progress_file: true` is set:
- Stream output to a progress file: `.goodvibes/.exec-output/progress-<id>.log`
- Return the progress file path immediately in the command's metadata
- Agent (or orchestrator) can poll the file via `precision_read` while waiting
- On command completion, the progress file becomes the overflow file (same file, dual purpose)

### Part G — Lock File Detection

**Problem:** When `git` commands fail because of `.git/index.lock`, or `npm install` fails because of stale lockfiles, the error message is buried in stderr. The agent retries blindly or gives up.

**Solution:** Post-execution stderr analysis for known lock patterns.

```typescript
const LOCK_PATTERNS: { pattern: RegExp; message: string; suggestion: string }[] = [
  {
    pattern: /Unable to create '.*\.git\/index\.lock'/,
    message: 'Git index is locked',
    suggestion: 'Another git process may be running. Wait for it to finish, or remove .git/index.lock if the process crashed.'
  },
  {
    pattern: /EEXIST.*package-lock\.json/,
    message: 'npm lock file conflict',
    suggestion: 'Delete node_modules and package-lock.json, then retry npm install.'
  },
  {
    pattern: /EADDRINUSE.*:(\d+)/,
    message: 'Port already in use',
    suggestion: 'Port $1 is occupied. Kill the existing process or use a different port.'
  },
  {
    pattern: /ENOSPC/,
    message: 'No space left on device',
    suggestion: 'Disk is full. Free up space and retry.'
  },
  {
    pattern: /ENOMEM/,
    message: 'Out of memory',
    suggestion: 'Process ran out of memory. Consider increasing available memory or reducing workload.'
  },
  {
    pattern: /EACCES|EPERM/,
    message: 'Permission denied',
    suggestion: 'Insufficient permissions. Check file ownership and permissions.'
  }
];
```

**Response addition (when a pattern matches):**
```json
{
  "exit_code": 128,
  "exit_interpretation": { "meaning": "Git error", "suggestion": "Check stderr" },
  "detected_issue": {
    "type": "git_index_lock",
    "message": "Git index is locked",
    "suggestion": "Another git process may be running. Wait for it to finish, or remove .git/index.lock if the process crashed."
  },
  "stderr": "fatal: Unable to create '/home/user/project/.git/index.lock': File exists..."
}
```

Only fires on non-zero exit codes. Zero overhead on success.

### Part H — Smart Retry

**Problem:** Transient failures (network timeouts, lock files, "resource busy") cause agents to waste full LLM round-trips retrying the same command manually. Each retry cycle costs input tokens + output tokens + latency.

**Solution:** Configurable automatic retry for known transient patterns.

**New parameter:** `retry: { max: 3, delay_ms: 1000, backoff: 'exponential', on: ['network', 'lock', 'busy'] }`

**Default retry patterns** (enabled when `retry` is specified):

| Pattern | Detects | Default Delay |
|---|---|---|
| `network` | DNS failures, connection refused, timeout | 2s exponential |
| `lock` | Git index lock, npm lock conflicts | 3s fixed (wait for other process) |
| `busy` | EBUSY, resource temporarily unavailable | 1s exponential |
| `oom` | ENOMEM, exit 137 | No retry (won't help) |

**Retry is OFF by default.** Agent must opt in with `retry: {}` (defaults) or `retry: { max: 3 }`. This prevents unexpected repeated execution of destructive commands.

**Response with retries:**
```json
{
  "exit_code": 0,
  "duration_ms": 8400,
  "retries": {
    "attempts": 2,
    "reason": "git index lock (attempt 1 failed, attempt 2 succeeded)",
    "delays": [3000]
  },
  "stdout": "..."
}
```

### Part I — Command History

**Problem:** When debugging build failures or investigating "why did this stop working," agents have no memory of what commands were run earlier in the session. They re-run commands unnecessarily or miss that a previous command changed something.

**Solution:** Session-scoped command history tracked in the ProcessManager singleton.

```typescript
interface CommandHistoryEntry {
  id: string;                  // auto-generated
  timestamp: number;
  command: string;
  cwd: string;
  exit_code: number;
  duration_ms: number;
  stdout_lines: number;
  stderr_lines: number;
  truncated: boolean;
  retries?: number;
  background?: boolean;
}
```

**Accessible via built-in command:** `exec_history`

```json
{
  "history": [
    {"id": "cmd_1", "command": "npm install", "exit_code": 0, "duration_ms": 12400, "cwd": "/project"},
    {"id": "cmd_2", "command": "npm run build", "exit_code": 1, "duration_ms": 8200, "cwd": "/project"},
    {"id": "cmd_3", "command": "npm run build", "exit_code": 0, "duration_ms": 7800, "cwd": "/project"}
  ],
  "session_stats": {
    "total_commands": 3,
    "total_duration_ms": 28400,
    "success_rate": "66.7%",
    "retries_total": 0
  }
}
```

**Inline context** (added to every response when history exists):
```json
{
  "exit_code": 1,
  "context": {
    "same_command_last_run": {
      "exit_code": 0,
      "duration_ms": 7800,
      "when": "2m ago"
    },
    "hint": "This command succeeded 2 minutes ago. Something changed."
  }
}
```

Only included when the same command was run before in the session. ~15-25 tokens when present.

### Part J — Pattern-Based Early Termination

**Problem:** Some commands run indefinitely until manually stopped (dev servers, watch modes), but the agent only needs to know when they're "ready." Without background execution, the agent waits until timeout.

**Solution:** New `until` parameter — stop capturing output when a pattern matches.

**New parameter:** `until: { pattern: "ready in", timeout_ms: 30000 }`

```typescript
interface UntilSpec {
  pattern: string;       // Regex pattern to watch for in stdout/stderr
  timeout_ms?: number;   // Max wait time (default: command timeout)
  kill_after?: boolean;  // Kill process after pattern match? (default: false — leave running in background)
}
```

**Use cases:**
- `npm run dev` + `until: { pattern: "ready in" }` → returns when Vite/Next.js reports ready
- `docker compose up` + `until: { pattern: "Started" }` → returns when services are up
- `npx vitest --watch` + `until: { pattern: "Waiting for file changes" }` → returns after first run

**Behavior:**
1. Start command normally
2. Stream output, watching for pattern match
3. On pattern match:
   - If `kill_after: true`: kill the process, return output up to match
   - If `kill_after: false` (default): promote to background process, return output up to match + bg process ID
4. On timeout without match: return whatever output was captured + timeout warning

**Response (pattern matched, process backgrounded):**
```json
{
  "status": "pattern_matched",
  "matched_line": "[vite] ready in 342ms",
  "matched_at_ms": 4200,
  "stdout": "output up to match...",
  "background": {
    "process_id": "bg_20260207_143052",
    "pid": 48291,
    "log_file": ".goodvibes/.exec-output/bg-bg_20260207_143052.log",
    "hint": "Process still running. Use bg_stop to terminate when done."
  }
}
```

This pairs perfectly with Part E (background execution): `until` is how you start a long-running process and know when it's ready, then Part E's management commands let you check on it or stop it later.

### Configuration Summary (via precision_config + goodvibes.json)

| Key | Type | Default | Description |
|---|---|---|---|
| `exec_max_output_chars` | `number` | 50000 | Max output before overflow to file |
| `exec_max_output_lines` | `number` | 500 | Max output lines in response |
| `exec_default_timeout_ms` | `number` | 120000 | Default command timeout |
| `exec_max_background` | `number` | 5 | Max concurrent background processes |
| `exec_overflow_dir` | `string` | `.goodvibes/.exec-output` | Overflow/background output directory |
| `exec_overflow_max_age_ms` | `number` | 3600000 | Auto-cleanup age (1 hour) |
| `exec_progress_threshold_ms` | `number` | 10000 | Include progress markers for commands longer than this |
| `exec_cwd_persistence` | `boolean` | `true` | Enable working directory persistence |
| `exec_history_max` | `number` | 100 | Max command history entries |

### What Exceeds Native

| Aspect | Native Bash | precision_exec (proposed) |
|---|---|---|
| Output limit | 30K chars, truncated | 50K chars, overflow to file (zero data loss) |
| Default timeout | 120s | 120s (match) + configurable |
| Working directory | Persists (shell state) | Persists (session singleton) + explicit `cwd` override |
| Background execution | Yes (run_in_background) | Yes + built-in management commands (status, output, stop, list) |
| Progress reporting | Streams intermediate output | Progress markers + pollable progress file |
| Large output | Truncated at 30K (lost) | Head + tail + overflow file (nothing lost) |
| Exit code interpretation | Raw number | Semantic meaning + actionable suggestion |
| Lock file detection | Git index lock only (telemetry) | Generalized pattern matching (git, npm, port, disk, memory, permissions) |
| Smart retry | No | Configurable auto-retry with backoff for transient failures |
| Command history | No | Session-scoped with same-command context |
| Early termination | No | Pattern-based `until` with auto-background promotion |
| AI path extraction | Yes (Haiku model) | No (by design — no LLM calls at tool level) |
| Batch execution | No | Yes (existing — parallel or sequential with assertions) |
| Output verbosity | Fixed | Configurable modes (count_only through verbose) |

### Implementation Architecture

```
src/state/
  session-state.ts       # SessionState singleton
                         #   - Working directory persistence
                         #   - Command history
  process-manager.ts     # ProcessManager singleton
                         #   - Background process tracking
                         #   - Output file management
                         #   - Cleanup on shutdown
                         #   - Built-in commands (bg_status, bg_output, bg_stop, bg_list, exec_history)

src/handlers/
  precision-exec.ts      # Updated handler
                         #   - New defaults (50K output, 120s timeout)
                         #   - Session cwd resolution
                         #   - Overflow handling
                         #   - Exit code interpretation
                         #   - Lock file detection
                         #   - Smart retry
                         #   - Progress markers
                         #   - Background execution
                         #   - Pattern-based early termination
                         #   - Built-in command routing
```

### Dependencies Between Parts

```
A (defaults)           — standalone, implement first
B (cwd persistence)    — needs SessionState singleton
C (overflow)           — standalone
D (exit codes)         — standalone
E (background)         — needs ProcessManager singleton
F (progress)           — needs C (shares output file)
G (lock detection)     — standalone, pairs with D
H (smart retry)        — needs G (uses same patterns to decide what's retryable)
I (command history)    — needs SessionState singleton (pairs with B)
J (early termination)  — needs E (promotes to background on match)
```

**Suggested implementation order:** A → C → D → G → B → I → E → F → H → J

### Implementation Notes

- **Parts A, C, D, G are standalone** — can be implemented immediately with no new architecture
- **Parts B and I share SessionState** — implement together
- **Parts E, F, J share ProcessManager** — implement together
- **Part H depends on G** — retry patterns reuse lock detection patterns
- `.goodvibes/.exec-output/` directory handles both overflow files and background process logs
- Background processes use `child_process.spawn()` with `detached: true` + `stdio: ['ignore', fileStream, fileStream]`
- Progress file streaming uses `fs.createWriteStream()` with `flags: 'a'` (append)
- Command history is bounded at 100 entries (configurable), FIFO eviction
- All file paths use `.goodvibes/` prefix — already gitignored

---

## 11. precision_fetch Overhaul — Intelligent Web Content Extraction

**Problem:** precision_fetch is more versatile than native WebFetch in some ways (POST/PUT/DELETE, CSS selectors, batch), but weaker in the area that matters most: content extraction quality. Native uses an AI model (Haiku) to process fetched content with a user-supplied prompt. Precision uses regex-based HTML tag stripping, which produces noisy, low-quality text. Redirect handling is silent. No structured data awareness.

**Design decision:** We will NOT add LLM calls at the tool level. Native's approach of calling Haiku per-fetch violates our design principle, adds latency, adds invisible cost, and requires API key configuration at the MCP server. Instead, we'll make non-AI extraction so good that the AI step is rarely needed. The calling agent already IS an LLM — it can reason over our clean extracted output.

### Part A — HTML-to-Markdown Quality (Parity Fix)

**Problem:** Current extraction uses regex-based tag stripping. Loses structure: nested lists flatten, code blocks lose language tags, tables become unreadable, links lose URLs.

**Solution:** Replace regex stripping with **Turndown** (npm package, 0 dependencies, well-maintained).

```typescript
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm'; // GitHub Flavored Markdown (tables, strikethrough)

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});
turndown.use(gfm);

function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}
```

Handles: nested lists, code blocks with language, tables, images with alt text, links, blockquotes, headings hierarchy. Output quality matches or exceeds native's converter.

### Part B — Readability.js Content Extraction

**Problem:** Most web pages are 80% chrome (nav, footer, sidebar, ads, scripts) and 20% content. Regex stripping keeps everything. Native's AI model implicitly filters, but we need a deterministic approach.

**Solution:** Mozilla's **Readability.js** — the same engine behind Firefox Reader View. Extracts the main article content, strips navigation, ads, and boilerplate. Battle-tested on millions of pages.

```typescript
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

function extractReadableContent(html: string, url: string): ReadabilityResult {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  
  return {
    title: article?.title,
    byline: article?.byline,
    content: article?.content,        // clean HTML
    textContent: article?.textContent, // plain text
    excerpt: article?.excerpt,
    siteName: article?.siteName,
    length: article?.length,           // character count
  };
}
```

New extraction mode: `extract: "readable"` (default for HTML pages). Falls back to Turndown if Readability can't identify an article (e.g., web apps, dashboards).

### Part C — Smart Content Type Detection

Auto-detect the type of page and apply the best extraction strategy:

| Page Type | Detection | Strategy |
|---|---|---|
| Documentation | URL patterns (`/docs/`, `/api/`, `/reference/`), presence of code blocks, nav structure | Code block extraction + Readability |
| API reference | OpenAPI/Swagger indicators, endpoint tables | Structured endpoint extraction |
| Blog/article | Article tags, byline, date, Readability confidence | Readability + metadata |
| JSON endpoint | Content-Type: application/json | Parse and return structured JSON |
| Error page | 4xx/5xx status, error-specific HTML patterns | Short summary: "404 Not Found" (save tokens) |
| Landing page | Hero sections, CTA buttons, marketing copy | Readability (strip marketing chrome) |
| Raw text | Content-Type: text/plain | Return as-is |
| PDF | Content-Type: application/pdf | Route to pdf-parse (already a dependency) |
| Login/auth wall | Login forms, "sign in" prompts | Detect and report: "Page requires authentication" |

```typescript
function detectPageType(url: string, headers: Headers, html: string): PageType {
  // Content-Type checks first (cheapest)
  const contentType = headers.get('content-type') || '';
  if (contentType.includes('application/json')) return 'json';
  if (contentType.includes('application/pdf')) return 'pdf';
  if (contentType.includes('text/plain')) return 'text';
  
  // Status code
  if (status >= 400) return 'error';
  
  // URL pattern matching
  if (/\/docs?\/|\/(api|reference|guide)\//i.test(url)) return 'documentation';
  if (/swagger|openapi/i.test(url)) return 'api_reference';
  
  // Content analysis (DOM-based)
  // ... login form detection, article detection, etc.
  
  return 'general';
}
```

Response includes the detected type:
```json
{
  "url": "https://docs.example.com/api/auth",
  "page_type": "documentation",
  "extraction": "readable + code_blocks",
  "content": "...",
  "code_blocks": [...]
}
```

### Part D — Code Block Extraction

Dedicated extraction mode for documentation pages. The #1 reason agents fetch docs — they want the code examples.

```json
{
  "extract": "code_blocks"
}
```

**Response:**
```json
{
  "url": "https://docs.example.com/api/auth",
  "code_blocks": [
    {
      "language": "typescript",
      "code": "const token = await auth.getToken({\n  clientId: 'your-id',\n  scope: ['read', 'write']\n});",
      "context": "Authentication — Getting a token",
      "line_in_page": 42
    },
    {
      "language": "bash",
      "code": "curl -H 'Authorization: Bearer $TOKEN' https://api.example.com/users",
      "context": "Authentication — Using the token",
      "line_in_page": 78
    }
  ],
  "total_code_blocks": 2,
  "page_title": "Authentication | Example API Docs"
}
```

Extraction logic: find all `<pre><code>`, `<code>` (with language class), and fenced markdown blocks. Include the nearest heading as `context`.

### Part E — Structured Data Harvesting

Parse machine-readable metadata that websites already embed:

```json
{
  "extract": "metadata"
}
```

**Sources parsed:**
- **JSON-LD** (`<script type="application/ld+json">`)
- **OpenGraph** (`<meta property="og:...">`)
- **Twitter Cards** (`<meta name="twitter:...">`)
- **Schema.org microdata** (`itemscope`, `itemprop`)
- **Standard meta tags** (description, author, canonical URL)
- **RSS/Atom feed links** (`<link rel="alternate" type="application/rss+xml">`)

**Response:**
```json
{
  "url": "https://docs.example.com/api/auth",
  "metadata": {
    "title": "Authentication | Example API Docs",
    "description": "Learn how to authenticate with the Example API",
    "canonical": "https://docs.example.com/api/auth",
    "json_ld": {
      "@type": "TechArticle",
      "version": "3.2",
      "dateModified": "2026-01-15"
    },
    "opengraph": {
      "type": "article",
      "site_name": "Example Docs"
    },
    "feeds": [
      {"type": "rss", "url": "https://docs.example.com/feed.xml"}
    ]
  }
}
```

Zero heuristics — this is data the site explicitly publishes for machine consumption.

### Part F — Table Extraction

HTML tables → structured JSON. Agents frequently fetch pages to read comparison tables, API parameter tables, compatibility matrices.

```json
{
  "extract": "tables"
}
```

**Response:**
```json
{
  "url": "https://docs.example.com/api/endpoints",
  "tables": [
    {
      "caption": "API Endpoints",
      "headers": ["Method", "Path", "Description"],
      "rows": [
        ["GET", "/users", "List all users"],
        ["POST", "/users", "Create a user"],
        ["GET", "/users/:id", "Get user by ID"]
      ],
      "context": "REST API Reference"
    }
  ],
  "total_tables": 1
}
```

Extraction: parse `<table>` elements, extract `<th>` as headers, `<td>` as rows. Include nearest heading as context. Handle `colspan`/`rowspan`.

### Part G — Link Extraction with Context

Extract all links with surrounding context. Agents exploring documentation need to find related pages.

```json
{
  "extract": "links",
  "links_filter": "auth"
}
```

**Response:**
```json
{
  "url": "https://docs.example.com/api",
  "links": [
    {
      "url": "https://docs.example.com/api/auth",
      "text": "Authentication",
      "context": "Getting Started section",
      "type": "internal"
    },
    {
      "url": "https://docs.example.com/api/oauth",
      "text": "OAuth 2.0 Guide",
      "context": "Authentication section",
      "type": "internal"
    }
  ],
  "total_links": 2,
  "filtered_from": 48
}
```

Optional `links_filter` parameter: regex/keyword filter to return only relevant links. `type` distinguishes internal vs external links.

### Part H — PDF URL Handling

If the URL serves a PDF (detected via Content-Type header before body read), automatically route to pdf-parse (already a precision_read dependency).

```typescript
const contentType = response.headers.get('content-type') || '';
if (contentType.includes('application/pdf')) {
  const buffer = await response.arrayBuffer();
  // Route to existing PDF extraction from precision_read
  return extractPdf(Buffer.from(buffer), pages);
}
```

The `pages` parameter from the request is passed through. Agent doesn't need to know or care that the URL points to a PDF.

### Part I — Content Fingerprinting & Diff-Aware Fetching

Same pattern as FileStateCache for reads. Hash extracted content on fetch. On re-fetch, return diff or "unchanged."

**FetchCache** (session-scoped singleton):
```typescript
interface FetchCacheEntry {
  url: string;
  contentHash: string;
  extractedContent: string;
  fetchedAt: number;
  ttl: number;              // 15 minutes default (match existing)
  pageType: string;
  headers: Record<string, string>;
}
```

**Cache hit (unchanged):**
```json
{
  "url": "https://docs.example.com/api/auth",
  "status": "unchanged",
  "cached_at": "8m ago",
  "hash": "a1b2c3...",
  "hint": "Content hasn't changed since last fetch. Use force: true to re-fetch."
}
```

**Cache hit (changed):**
```json
{
  "url": "https://docs.example.com/api/auth",
  "status": "content_changed",
  "diff": "--- previous\n+++ current\n@@ -12,3 +12,5 @@\n...",
  "content": "full updated content..."
}
```

### Part J — Response Format Negotiation

Automatically try `Accept: application/json` first for API-like URLs. Many endpoints serve clean JSON when asked properly.

```typescript
function shouldTryJson(url: string): boolean {
  return /\/api\/|\.(json)$|\/v[0-9]+\//i.test(url);
}

// If URL looks API-like and no explicit Accept header set:
if (shouldTryJson(url) && !headers['Accept']) {
  headers['Accept'] = 'application/json';
}
```

If the server returns JSON, skip HTML extraction entirely — parse and return structured data. If it returns HTML despite the header, fall back to normal extraction.

Response includes what happened:
```json
{
  "negotiation": {
    "requested": "application/json",
    "received": "application/json",
    "note": "Server returned JSON directly — no HTML extraction needed"
  }
}
```

### Part K — Rate-Limited Batch Fetching

Existing batch support + automatic per-domain rate limiting.

```json
{
  "urls": [
    {"url": "https://docs.example.com/page1"},
    {"url": "https://docs.example.com/page2"},
    {"url": "https://docs.example.com/page3"},
    {"url": "https://other-site.com/page1"}
  ],
  "rate_limit": {
    "per_domain": 2,     // max concurrent per domain
    "delay_ms": 500      // delay between requests to same domain
  }
}
```

Different domains fetch in parallel. Same-domain requests are staggered. Prevents getting 429'd when fetching 5 pages from the same docs site.

Default: 2 concurrent per domain, 500ms delay. Configurable per-request or via `precision_config`.

### Part L — Redirect Chain Transparency

Instead of silently following redirects, return the full chain:

```json
{
  "url": "https://example.com/docs",
  "final_url": "https://docs.example.com/v3/getting-started",
  "redirects": [
    {"from": "https://example.com/docs", "to": "https://docs.example.com/", "status": 301},
    {"from": "https://docs.example.com/", "to": "https://docs.example.com/v3/getting-started", "status": 302}
  ],
  "content": "..."
}
```

Agent knows: "this URL redirected twice, ending at a different domain." Useful for detecting stale links, domain migrations, and auth redirects.

### Part M — Archive Fallback

When a URL returns 404 or 503, automatically try the Wayback Machine:

```typescript
if (response.status === 404 || response.status === 503) {
  const archiveUrl = `https://web.archive.org/web/2/${url}`;
  const archiveResponse = await fetch(archiveUrl);
  if (archiveResponse.ok) {
    return {
      content: extract(archiveResponse),
      source: 'wayback_machine',
      archived_at: parseArchiveDate(archiveResponse),
      warning: 'Original URL returned 404. Showing archived version.',
      original_url: url,
    };
  }
}
```

Documentation links go stale constantly. This recovers them automatically. Only fires on 404/503 — no overhead on successful fetches.

### What Exceeds Native

| Aspect | Native WebFetch | precision_fetch (proposed) |
|---|---|---|
| Content extraction | AI model (Haiku) | Readability.js + Turndown + type detection |
| Code block extraction | Via AI prompt | Dedicated structured mode |
| Table extraction | Via AI prompt | Dedicated structured mode |
| Link extraction | No | With context and filtering |
| Structured data (JSON-LD, OG) | No | Automatic harvesting |
| Page type detection | No | Auto-detect and adapt strategy |
| PDF handling | No (separate tool) | Automatic detection and routing |
| Content diffing | No | Diff on re-fetch |
| Cache intelligence | 15-min TTL | 15-min TTL + fingerprinting + unchanged detection |
| Format negotiation | No | Auto-try JSON for API URLs |
| Rate limiting | No | Per-domain rate limiting for batch |
| Redirect transparency | Notifies of cross-host | Full redirect chain |
| Dead link recovery | No | Automatic Wayback Machine fallback |
| Batch fetching | No | Yes, with rate limiting |
| HTTP methods | GET only | GET/POST/PUT/DELETE |
| CSS selectors | No | Yes (existing) |
| Custom headers | No | Yes (existing) |

### New Dependencies

| Package | Purpose | Size |
|---|---|---|
| `turndown` | HTML to Markdown | ~30KB |
| `turndown-plugin-gfm` | GFM tables/strikethrough | ~5KB |
| `@mozilla/readability` | Article extraction | ~40KB |
| `jsdom` | DOM parsing for Readability | ~2MB (heavy, but standard) |

Total: ~2MB added, dominated by jsdom. Alternative: use `linkedom` (~100KB) as a lighter DOM implementation — compatible with Readability but much smaller.

### Configuration (via precision_config + goodvibes.json)

| Key | Type | Default | Description |
|---|---|---|---|
| `fetch_default_extract` | `string` | `"readable"` | Default extraction mode for HTML pages |
| `fetch_cache_ttl_ms` | `number` | 900000 | Cache TTL (15 minutes) |
| `fetch_rate_limit_per_domain` | `number` | 2 | Max concurrent fetches per domain |
| `fetch_rate_limit_delay_ms` | `number` | 500 | Delay between same-domain requests |
| `fetch_archive_fallback` | `boolean` | `true` | Enable Wayback Machine fallback on 404 |
| `fetch_json_negotiation` | `boolean` | `true` | Auto-try JSON for API-like URLs |

### Implementation Notes

- **Readability + Turndown pipeline**: Readability extracts article HTML → Turndown converts to Markdown. Two-stage produces much better results than either alone.
- **jsdom vs linkedom**: jsdom is the standard but heavy (~2MB). linkedom (~100KB) is a lightweight alternative that works with Readability. Recommend linkedom for production, jsdom for development/testing.
- **Code block extraction** works on the raw HTML (before Readability), since Readability may strip code blocks it considers non-article content.
- **Table extraction** also works on raw HTML for the same reason.
- **PDF routing** reuses precision_read's existing pdf-parse setup — no new dependency.
- **FetchCache** is separate from FileStateCache (different concerns: URLs vs file paths, TTL vs LRU).
- **Archive fallback** adds ~500ms latency on 404s only. Never fires on successful fetches.
- Part A (Turndown) should be implemented first — it improves all extraction modes.

### Dependencies Between Parts

```
A (Turndown)           — standalone, implement first (all other parts benefit)
B (Readability)        — needs A (Readability output → Turndown)
C (page type detect)   — standalone, but guides B/D/F strategy selection
D (code blocks)        — standalone
E (structured data)    — standalone
F (tables)             — standalone
G (links)              — standalone
H (PDF routing)        — standalone (reuses precision_read)
I (fingerprinting)     — standalone (new FetchCache singleton)
J (format negotiation) — standalone
K (rate limiting)      — standalone (enhances existing batch)
L (redirect chain)     — standalone
M (archive fallback)   — standalone
```

Almost everything is standalone. Implement A first, then parallelize B through M.

---

## 12. precision_grep Enhancements — Beyond Search

**Current state:** precision_grep is already superior to native Grep. The `expand_to` feature with tree-sitter (expand match to enclosing function/class) has no native equivalent. Highlight positions, max_tokens enforcement with early exit, and batch queries are all advantages.

**Remaining parity gap:** Offset-based pagination (`offset` + `max_results` for page-through-results).

**Beyond parity:** Transform precision_grep from a search tool into a code intelligence tool.

### Part A — Offset-Based Pagination (Parity Fix)

Native Grep has `head_limit` + `offset` for paginating through results. precision_grep has `max_results` and `max_per_item` but no offset.

**New parameter:** `offset: number` — skip the first N results before applying `max_results`.

```json
{
  "queries": [{"id": "q1", "pattern": "TODO"}],
  "output": {
    "format": "matches",
    "max_results": 10,
    "offset": 20
  }
}
```

Returns results 21-30. Response includes pagination metadata:
```json
{
  "pagination": {
    "offset": 20,
    "returned": 10,
    "total_matches": 47,
    "has_more": true,
    "next_offset": 30
  }
}
```

### Part B — Cross-File Relationship Mapping

When a match is found (e.g., a function definition), also show where it's imported, called, or referenced.

**New parameter:** `relationships: true`

```json
{
  "queries": [{"id": "q1", "pattern": "processUser", "whole_word": true}],
  "output": {"format": "matches"},
  "relationships": true
}
```

**Response:**
```json
{
  "queries": {
    "q1": {
      "files": [
        {
          "file": "src/handlers/user.ts",
          "matches": [{"line": 42, "content": "export function processUser(input: UserInput): Result {"}],
          "relationships": [
            {"file": "src/routes/api.ts", "line": 8, "type": "imports", "content": "import { processUser } from '../handlers/user.js'"},
            {"file": "src/routes/api.ts", "line": 34, "type": "calls", "content": "const result = await processUser(req.body)"},
            {"file": "tests/handlers/user.test.ts", "line": 12, "type": "imports", "content": "import { processUser } from '../../src/handlers/user.js'"}
          ]
        }
      ]
    }
  }
}
```

**Implementation:** For each match:
1. Check if it looks like a definition (export, function/class/const declaration)
2. Extract the symbol name
3. Grep for import statements referencing the file + symbol
4. Grep for direct usage of the symbol name in importing files
5. Deduplicate and return

Bounded: max 10 relationships per match, max 5 files scanned for relationships. This is a bonus feature — shouldn't slow down normal searches.

Only fires when `relationships: true` is explicitly set.

### Part C — Replace Preview

Show what a find-and-replace would look like without writing anything. Pairs with precision_edit.

**New parameter:** `preview_replace: string`

```json
{
  "queries": [{"id": "q1", "pattern": "handleUser"}],
  "preview_replace": "processUser",
  "output": {"format": "context", "context_before": 1, "context_after": 1}
}
```

**Response:**
```json
{
  "queries": {
    "q1": {
      "files": [
        {
          "file": "src/routes/api.ts",
          "replacements": [
            {
              "line": 34,
              "before": "const result = await handleUser(req.body)",
              "after": "const result = await processUser(req.body)",
              "diff": "-const result = await handleUser(req.body)\n+const result = await processUser(req.body)"
            }
          ]
        }
      ],
      "total_replacements": 8,
      "files_affected": 4,
      "hint": "To apply: use precision_edit with find: 'handleUser', replace: 'processUser', occurrence: 'all'"
    }
  }
}
```

The agent sees every change before committing. The `hint` tells them exactly how to apply it via precision_edit.

### Part D — Negation Search

Find files that DON'T contain a pattern. Useful for convention enforcement.

**New parameter:** `negate: true`

```json
{
  "queries": [{
    "id": "q1",
    "pattern": "import.*from.*\\.js",
    "glob": "src/**/*.ts",
    "negate": true
  }],
  "output": {"format": "files_only"}
}
```

**Response:** All `.ts` files in `src/` that don't have `.js` extension imports.

```json
{
  "queries": {
    "q1": {
      "files": [
        {"file": "src/legacy/old-module.ts"},
        {"file": "src/utils/compat.ts"}
      ],
      "total_files_without_match": 2,
      "total_files_scanned": 142
    }
  }
}
```

Use cases:
- Find files missing required imports (e.g., missing `.js` extensions for ESM)
- Find components not using a required pattern (e.g., missing error boundaries)
- Find test files without assertions
- Convention enforcement: "every handler file should import logger"

### Part E — Search Result Ranking

Instead of flat file-path ordering, rank results by likely relevance.

**Ranking factors (weighted):**

| Factor | Weight | Rationale |
|---|---|---|
| Exact match vs partial | High | `processUser` exact > `processUserData` |
| Exported symbol vs internal | Medium | Exports are more likely the "main" definition |
| In FileStateCache (read this session) | Medium | Files the agent is working with are more relevant |
| Recently modified (git) | Low | Active files more likely to be the target |
| File path depth | Low | Shallower files are often more important |

**New parameter:** `ranked: true` (default: false for backward compatibility)

When enabled, results include a `relevance` score and are sorted by it:
```json
{
  "files": [
    {"file": "src/handlers/user.ts", "relevance": 0.95, "reasons": ["exact match", "exported", "in cache"]},
    {"file": "src/routes/api.ts", "relevance": 0.72, "reasons": ["exact match", "in cache"]},
    {"file": "tests/handlers/user.test.ts", "relevance": 0.45, "reasons": ["exact match"]}
  ]
}
```

### Part F — Incremental Refinement

If the agent refines a search, only search within files that matched the previous query.

**New parameter:** `refine_from: "<query_id>"`

```json
{
  "queries": [{
    "id": "q2",
    "pattern": "handleUserAuth",
    "refine_from": "q1"
  }]
}
```

**Behavior:** Instead of searching the entire project, only search files that had matches in query `q1`. Much faster for iterative narrowing.

**Implementation:** Store query results in a session-scoped `SearchCache`:
```typescript
interface SearchCacheEntry {
  queryId: string;
  pattern: string;
  matchingFiles: string[];  // just file paths
  timestamp: number;
}
```

Bounded: last 20 queries cached. Old entries evicted FIFO.

Response includes refinement context:
```json
{
  "refinement": {
    "refined_from": "q1",
    "original_pattern": "handleUser",
    "original_files": 12,
    "searched_files": 12,
    "matches_in_refined": 3
  }
}
```

### Part G — Statistical Summary Mode

Beyond `count_only`: return per-file match counts, file type distribution, directory heatmap.

**New output format:** `"format": "stats"`

```json
{
  "queries": [{"id": "q1", "pattern": "TODO|FIXME|HACK"}],
  "output": {"format": "stats"}
}
```

**Response:**
```json
{
  "queries": {
    "q1": {
      "total_matches": 47,
      "total_files": 12,
      "by_directory": {
        "src/handlers/": {"matches": 18, "files": 4},
        "src/routes/": {"matches": 12, "files": 3},
        "src/utils/": {"matches": 8, "files": 2},
        "tests/": {"matches": 9, "files": 3}
      },
      "by_file_type": {
        ".ts": 38,
        ".tsx": 6,
        ".js": 3
      },
      "top_files": [
        {"file": "src/handlers/user.ts", "matches": 8},
        {"file": "src/routes/api.ts", "matches": 6},
        {"file": "src/handlers/auth.ts", "matches": 5}
      ],
      "by_pattern": {
        "TODO": 28,
        "FIXME": 14,
        "HACK": 5
      }
    }
  }
}
```

Helps agents decide where to focus without reading all matches. The `by_pattern` breakdown (when the query has alternation) shows which variant matched where.

### What Exceeds Native

| Aspect | Native Grep | precision_grep (current + proposed) |
|---|---|---|
| expand_to (function/class) | No | Yes (tree-sitter) — existing |
| Highlight positions | No | Yes — existing |
| max_tokens early exit | No | Yes — existing |
| Batch queries | No | Yes — existing |
| Offset pagination | Yes (head_limit + offset) | Yes (Part A) |
| Cross-file relationships | No | Shows imports/callers for definitions (Part B) |
| Replace preview | No | Dry-run replacement across files (Part C) |
| Negation search | No | Find files WITHOUT a pattern (Part D) |
| Result ranking | No | Relevance scoring with cache awareness (Part E) |
| Incremental refinement | No | Narrow search within previous results (Part F) |
| Statistical summary | Count only | Per-directory, per-type, per-pattern breakdown (Part G) |

### Dependencies Between Parts

```
A (offset pagination) — standalone, simple
B (relationships)     — standalone, uses existing grep + symbols
C (replace preview)   — standalone
D (negation)          — standalone
E (ranking)           — benefits from FileStateCache (Item 1) but works without
F (refinement)        — needs SearchCache (new, simple)
G (stats)             — standalone
```

All parts are independent. Can be parallelized fully.

### Implementation Notes

- **Part B (relationships)** is the most complex. Bound the search to prevent it from becoming a full call-graph analysis. Max 10 relationships, max 5 files deep.
- **Part C (replace preview)** is the highest-leverage for agents. They currently do find → manually check → edit. This cuts out the manual check step.
- **Part D (negation)** is implemented as: glob all files matching the glob pattern, grep each for the pattern, return files with zero matches. Efficient because grep's early-exit means it stops on first match per file.
- **Part E (ranking)** uses FileStateCache.has() as a signal — O(1) check. Git recency uses `git log --format=%at -1 -- <file>` cached per session.
- **Part F (refinement)** SearchCache is tiny (~20 entries × array of file paths). Negligible memory.
- **Part G (stats)** is essentially `count_only` with post-processing. No additional disk reads — just aggregation of match counts.

---

## 13. precision_notebook — Jupyter Notebook Cell Editing

**Problem:** Native Claude Code has a `NotebookEdit` tool for editing Jupyter notebook cells (replace, insert, delete). We have precision_read support for *reading* notebooks (parses JSON, returns structured cells with types and outputs), but no editing capability.

**Scope:** Trivial. Notebooks are JSON files with a known schema. Cell editing is array manipulation.

### .ipynb Structure (What We're Working With)

```json
{
  "cells": [
    {
      "cell_type": "code",
      "source": ["import pandas as pd\n", "df = pd.read_csv('data.csv')"],
      "metadata": {},
      "execution_count": 1,
      "outputs": [...]
    },
    {
      "cell_type": "markdown",
      "source": ["# Analysis\n", "This notebook analyzes..."],
      "metadata": {}
    }
  ],
  "metadata": { "kernelspec": {...}, "language_info": {...} },
  "nbformat": 4,
  "nbformat_minor": 5
}
```

### Operations

| Operation | Native NotebookEdit | precision_notebook |
|---|---|---|
| Replace cell content | By cell_number (0-indexed) | By cell_number or cell_id |
| Insert cell | After cell_number | After cell_number or cell_id, or at position |
| Delete cell | By cell_number | By cell_number or cell_id |
| Batch operations | One cell per call | Multiple cells per call |
| Cell type change | Via cell_type param | Via cell_type param |

### Schema

```json
{
  "path": "analysis.ipynb",
  "operations": [
    {
      "op": "replace",
      "cell": 2,
      "source": "import pandas as pd\nimport numpy as np",
      "cell_type": "code"
    },
    {
      "op": "insert",
      "after": 2,
      "source": "# New section\nThis cell was added.",
      "cell_type": "markdown"
    },
    {
      "op": "delete",
      "cell": 5
    }
  ]
}
```

### Response

```json
{
  "status": "applied",
  "path": "analysis.ipynb",
  "operations_applied": 3,
  "cells_before": 8,
  "cells_after": 8,
  "summary": [
    {"op": "replace", "cell": 2, "cell_type": "code"},
    {"op": "insert", "after": 2, "cell_type": "markdown"},
    {"op": "delete", "cell": 5}
  ]
}
```

### What Exceeds Native

| Aspect | Native NotebookEdit | precision_notebook |
|---|---|---|
| Batch operations | One cell per call | Multiple operations per call |
| Cell targeting | cell_number only (0-indexed) | cell_number or cell_id |
| Validation | None apparent | Validate nbformat, check cell bounds, preserve metadata |
| Integration with read | Separate tools | Same tool family, consistent schema |

### Implementation Notes

- **Trivial implementation**: Read JSON → modify `cells` array → write JSON. No new dependencies.
- Preserve `metadata`, `nbformat`, `nbformat_minor` untouched.
- Preserve cell `outputs` and `execution_count` on replace (unless explicitly cleared).
- Operations applied in order with index adjustment (delete shifts indices down, insert shifts up).
- Validate cell index bounds before applying. Return clear error if out of range.
- Could be a new tool (`precision_notebook`) or an extension of `precision_edit` with notebook detection.
- Integrate with FileStateCache (Item 1) — notebook file cached after edit, OCC applies.
