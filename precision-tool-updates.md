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
