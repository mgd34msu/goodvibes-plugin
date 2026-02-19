# Project Index v4 — Spec & Change Plan

## Current State (v3)

The project index (``.goodvibes/project-index.json``) stores a directory-grouped tree where each directory key maps to an array of file entry objects:

```json
{
  "version": 3,
  "tree": {
    "src/core": [
      { "name": "memory.ts", "size": 15789, "tokens": 3948 },
      { "name": "logs.ts", "size": 10815, "tokens": 2704 }
    ]
  }
}
```

**Problems:**
- `size` (bytes) is never used by any consumer — only `tokens` matters
- Three different representations across surfaces (disk, discover, dossier)
- Verbose: repeated `name`/`size`/`tokens` field names per entry
- Array-of-objects requires iteration to find a specific file

## Proposed Format (v4)

```json
{
  "version": 4,
  "tree": {
    "src/core": {
      "memory.ts": 3948,
      "logs.ts": 2704
    }
  }
}
```

**Type change:** `tree: Record<string, Record<string, number>>`

- Directory paths as outer keys (preserved)
- Filenames as inner keys (preserved)
- Token count as the value (the only metric consumers use)
- `size` removed entirely
- ~60% smaller on disk and in agent context
- Direct lookup: `tree["src/core"]["memory.ts"]` → `3948`

## Full Index Shape (v4)

```typescript
interface ProjectFileIndex {
  version: 4;
  created_at: string;
  updated_at: string;
  project_root: string;
  stats: {
    total_files: number;
    total_dirs: number;
    index_duration_ms: number;
    partial?: boolean;
  };
  tree: Record<string, Record<string, number>>;
}
```

## Internal In-Memory Representation

The flat `FileEntry` used for binary search drops `size`:

```typescript
// Before
interface FileEntry {
  p: string;      // relative path
  size: number;   // file size in bytes
  tokens: number; // estimated tokens
}

// After
interface FileEntry {
  p: string;      // relative path
  tokens: number; // estimated tokens
}
```

## Unified Agent-Facing Contract

After this change, all surfaces emit the same shape:

| Surface | Before | After |
|---------|--------|-------|
| Disk (project-index.json) | `{name, size, tokens}[]` per dir | `{filename: tokens}` per dir |
| discover `full` | `{path, type, size, tokens}` | `{path, type, tokens}` |
| discover `summary` | `{type_counts, dirs}` | `{type_counts, dirs}` (unchanged) |
| discover `paths_only` | `[path, ...]` | `[path, ...]` (unchanged) |
| dossier `key_files` | `{path, tokens, role}` | `{path, tokens, role}` (unchanged) |

---

## Files Requiring Changes

### 1. `plugins/goodvibes/tools/implementations/precision-engine/src/state/project-index.ts` (Core)

**Scope: Major**

| Change | Detail |
|--------|--------|
| `ProjectFileEntry` interface | **Remove entirely** — replaced by `Record<string, number>` |
| `ProjectFileIndex.tree` type | `Record<string, ProjectFileEntry[]>` → `Record<string, Record<string, number>>` |
| `FileEntry` interface | Drop `size` field → `{ p: string; tokens: number }` |
| `flattenTree()` | Update to iterate `Record<string, Record<string, number>>` |
| `flattenTreeV2()` | Unchanged (legacy v2 migration) |
| `entriesToTree()` | Return `Record<string, Record<string, number>>` instead of `Record<string, ProjectFileEntry[]>` |
| `load()` | Add v3 → v4 migration path (alongside existing v1→v3, v2→v3) |
| `flush()` | Writes v4 format (version: 4) |
| `upsertFile(path, size)` | Change to `upsertFile(path, tokens?)` — tokens directly, not derived from size |
| `touchFile()` | Minor: references `this.files[idx].size` → `this.files[idx].tokens` |

**Second-order risks:** None. All callers use `getFiles()`, `getFilesByPrefix()`, `getTypeCounts()` which are internal APIs that abstract the tree format.

### 2. `plugins/goodvibes/hooks/scripts/src/session-start/project-indexer.ts` (Builder)

**Scope: Moderate**

| Change | Detail |
|--------|--------|
| `ProjectFileEntry` interface (lines 112-116) | Remove — no longer needed |
| `ProjectFileIndex` interface (lines 122-134) | Update to v4: `tree: Record<string, Record<string, number>>` |
| `tree` variable (line 396) | `Record<string, ProjectFileEntry[]>` → `Record<string, Record<string, number>>` |
| Tree population (line 453-456) | `tree[key].push({name, size, tokens})` → `tree[key][filename] = Math.ceil(fileSize / 4)` |
| Sorting (lines 461-462) | Remove — object keys don't need sort (or sort keys if determinism desired) |
| Version field (line 469) | `version: 3` → `version: 4` |

**Second-order risks:** None. The indexer writes the file; the precision-engine reads it. They share no runtime dependency.

### 3. `plugins/goodvibes/tools/implementations/precision-engine/src/handlers/discover.ts`

**Scope: Minor**

| Change | Detail |
|--------|--------|
| Line 498/504: `dirs: Object.keys(index.tree).sort()` | **No change needed** — still works with v4 outer keys |
| Line 502: `full` detail output | Drop `size` from file map: `{path, type, size, tokens}` → `{path, type, tokens}` |

**Second-order risks:** Agents that parse discover `full` output and reference `.size` will get `undefined`. This is the intended breaking change — no agent should be using file bytes.

### 4. `plugins/goodvibes/tools/implementations/precision-engine/src/state/hooks.ts`

**Scope: Minimal**

| Change | Detail |
|--------|--------|
| Line 725: `index.upsertFile(relativePath)` | **No change needed** — already passes no size, default applies |
| Line 727: `index.touchFile(relativePath)` | **No change needed** |

**Second-order risks:** None.

### 5. `plugins/goodvibes/tools/implementations/precision-engine/src/handlers/precision-write.ts`

**Scope: Minimal**

| Change | Detail |
|--------|--------|
| Line 354: `projectIndex.upsertFile(relativePath)` | Optionally pass `Math.ceil(content.length / 4)` for accurate tokens |

**Second-order risks:** None. Currently defaults to 0, which is already inaccurate. Passing actual tokens is an improvement.

### 6. `plugins/goodvibes/tools/implementations/precision-engine/src/handlers/precision-edit.ts`

**Scope: None**

| Change | Detail |
|--------|--------|
| Line 1275: `projectIndex.touchFile(relativePath)` | **No change needed** — touchFile preserves existing tokens |

### 7. `plugins/goodvibes/tools/implementations/precision-engine/src/state/index.ts` (Barrel)

**Scope: Minimal**

| Change | Detail |
|--------|--------|
| Line 9 exports | `ProjectFileEntry` is NOT exported from barrel — no change needed |
| `FileEntry` export | Still exported, type updated (no `size` field) |

### 8. `plugins/goodvibes/tools/implementations/precision-engine/src/state/dossier.ts`

**Scope: None**

All access is via `getFiles()` and `getFilesByPrefix()` which return `FileEntry[]`. Accesses `.p` and `.tokens` only. Never touches `.size` or `.tree` directly.

---

## Files NOT Requiring Changes (Confirmed Safe)

| File | Why Safe |
|------|----------|
| `precision-glob.ts` | Uses `fs.stat().size` (filesystem), not index size |
| `precision-read.ts` | Uses `fs.stat().size` (filesystem), not index size |
| `precision-fetch.ts` | `r.size` is HTTP response size, unrelated |
| `dossier.ts` | All access via `getFiles()`/`getFilesByPrefix()` — no `.size`, no `.tree` |
| `precision-agent.ts` | Imports `ProjectIndex` but only calls `getIndexLoaded()` for dossier |
| `precision-runtime.ts` | No direct index usage (confirmed via grep: 0 matches) |
| All analysis-engine files | `.size` references are `Set.size`, `Map.size`, `fs.stat.size` — unrelated |
| All frontend-engine files | `.size` references are `Set.size`, `Array.size` — unrelated |
| All project-engine files | `.size` references are `Set.size`, `fs.stat.size` — unrelated |

---

## Test Files Requiring Updates

### 1. `src/__tests__/state/project-index.test.ts`

**Scope: Major**

- `makeV3Index()` helper → update to produce v4 tree format
- Add `makeV3IndexLegacy()` for v3 → v4 migration test
- All `entry.size` assertions (lines 106, 190, 356, 365, 434) → remove
- Tree shape assertions (lines 646-675) → update to `Record<string, number>` checks
- `version: 3` references → `version: 4`

### 2. `src/__tests__/state/dossier.test.ts`

**Scope: Minor**

- `makeFileEntry(p, tokens, size)` helper (line 53) → drop `size` param: `makeFileEntry(p, tokens)`
- `FileEntry` type references → updated automatically (no `size` field)

### 3. `src/__tests__/state/precision-runtime.test.ts`

**Scope: Check needed**

- Has 3 matches for `project-index` — likely test setup using mock index
- Need to verify if any assertions reference `.size`

---

## Migration Strategy

### Backward Compatibility

The `load()` method already handles v1 → v3 and v2 → v3 migration. Add v3 → v4:

```typescript
} else if (parsed.version === 3) {
  // Migrate v3 (array entries with size) to v4 (flat filename → tokens)
  const v3tree = parsed.tree || {};
  this.files = ProjectIndex.flattenTreeV3(v3tree); // new method
  const v4tree = ProjectIndex.entriesToTree(this.files);
  this.index = {
    version: 4,
    created_at: parsed.created_at,
    updated_at: parsed.updated_at,
    project_root: parsed.project_root,
    stats: parsed.stats,
    tree: v4tree,
  };
  this.markDirty(); // auto-flush to v4
}
```

Existing v1/v2 migrations can be updated to target v4 directly instead of going through v3.

### Rollout

1. On first session after update, existing v3 index is loaded and auto-migrated to v4 in memory
2. The debounced flush writes v4 to disk
3. Next `buildProjectIndex()` (session start) builds v4 natively
4. No manual migration step required

---

## Second-Order Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Agent code references `file.size` from discover output | Low | Low | Only internal agents; `size` was never useful for agent planning |
| Stale v3 index causes parse error | None | N/A | Migration handles this |
| `upsertFile` callers passing bytes instead of tokens | Low | Low | Current callers pass 0 anyway; param rename makes intent clear |
| Test failures from `.size` assertion removal | Certain | Low | Expected — update tests as part of this change |
| `touchFile` incorrectly preserves data | None | N/A | It accesses `.tokens`, which still exists |
| Third-party tools reading project-index.json | None | N/A | Internal format, not a public API |
| Performance regression from `Record<string, number>` vs array | None | N/A | Object property lookup is O(1) vs array scan O(n) — faster |

---

## Execution Order

1. **project-index.ts** — Core types, interfaces, migration logic, serialize/deserialize
2. **project-indexer.ts** — Builder produces v4 format
3. **discover.ts** — Drop `size` from `full` output
4. **precision-write.ts** — Optional: pass tokens to upsertFile
5. **Tests** — Update all test helpers and assertions
6. **Build & verify** — `npm run build` + `npm run test` in both packages
