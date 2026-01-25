# Schema Standardization Analysis

Comprehensive analysis of all precision-engine and batch-engine MCP tool schemas, identifying inconsistencies and opportunities for standardization.

**Generated:** 2026-01-25

---

## Table of Contents
1. [Tool Inventory](#tool-inventory)
2. [Output Mode Inconsistencies](#output-mode-inconsistencies)
3. [Path Parameter Inconsistencies](#path-parameter-inconsistencies)
4. [Pattern Parameter Inconsistencies](#pattern-parameter-inconsistencies)
5. [Base64/Alternative Input Support](#base64alternative-input-support)
6. [Other Parameter Inconsistencies](#other-parameter-inconsistencies)
7. [Recommendations](#recommendations)
8. [Proposed Unified Schema](#proposed-unified-schema)

---

## Tool Inventory

### Precision Engine (9 tools)

| Tool | Primary Purpose |
|------|-----------------|
| `precision_read` | Read files with extraction modes |
| `precision_write` | Create/write files with encoding |
| `precision_edit` | Atomic file editing with transactions |
| `precision_grep` | Pattern search with precise output |
| `precision_glob` | File finding with filters |
| `precision_symbols` | Code symbol search/analysis |
| `precision_exec` | Shell command execution |
| `precision_fetch` | URL fetching with extraction |
| `discover` | Lightweight parallel queries |

### Batch Engine (6 tools)

| Tool | Primary Purpose |
|------|-----------------|
| `batch` | Execute operation transactions |
| `batch_status` | Check batch execution status |
| `batch_list` | List batches with filters |
| `batch_recover` | Recovery operations |
| `batch_checkpoints` | List recovery checkpoints |
| `batch_state` | Persistent state management |

---

## Output Mode Inconsistencies

### Problem 1: Location Varies (Top-Level vs Nested)

| Tool | Location | Parameter |
|------|----------|-----------|
| precision_write | Top-level | `output_mode` |
| precision_exec | Top-level | `output_mode` |
| precision_fetch | Top-level | `output_mode` |
| discover | Top-level | `output_mode` |
| batch (all 6) | Top-level | `output_mode` |
| precision_read | **Nested** | `output.mode` |
| precision_symbols | **Nested** | `output.mode` |
| precision_edit | **Nested** | `output.mode` |
| precision_grep | **BOTH** | `output_mode` AND `output.mode` |
| precision_glob | **BOTH** | `output_mode` AND `output.mode` |

### Problem 2: Value Sets Differ Across Tools

**Standard verbosity modes (most tools):**
```
count_only | minimal | standard | verbose
```

**Tool-specific output modes:**

| Tool | `output.mode` Values | Purpose |
|------|---------------------|---------|
| discover | `count_only, files_only, locations` | File discovery |
| precision_grep | `count_only, files_only, locations, matches, context` | Search results |
| precision_glob | `count_only, paths_only, with_stats, with_preview` | File listing |
| precision_symbols | `count_only, names_only, locations, signatures, full` | Symbol data |
| precision_edit | `count_only, minimal, with_diff, verbose` | Edit results |

### Problem 3: Dual Mode Confusion

**precision_grep and precision_glob have TWO "mode" parameters:**

```
output_mode: count_only | minimal | standard | verbose   <- verbosity
output.mode: count_only | files_only | locations | ...   <- data format
```

These are conceptually different:
- `output_mode` = "How verbose should the response be?"
- `output.mode` = "What data should be included?"

Having both with overlapping names (`count_only`) is confusing.

---

## Path Parameter Inconsistencies

### Working Directory / Base Path

| Tool | Parameter | Description |
|------|-----------|-------------|
| discover | `base_path` | Base directory for searches |
| precision_glob | `cwd` | Working directory for glob patterns |
| precision_grep | `queries[].path` | Per-query search directory |
| precision_exec | `commands[].cwd` | Per-command working directory |

**Issue:** Three different names for the same concept: `base_path`, `cwd`, `path`

### File Path in Items

| Tool | Parameter | Description |
|------|-----------|-------------|
| precision_read | `files[].path` | File to read |
| precision_write | `files[].path` | File to write |
| precision_edit | `edits[].file` | File to edit |

**Issue:** `path` vs `file` for the same concept

---

## Pattern Parameter Inconsistencies

### Pattern Naming

| Tool | Parameter | Type |
|------|-----------|------|
| precision_grep | `queries[].pattern` | Single string |
| precision_grep | `queries[].pattern_base64` | Base64 alternative |
| precision_glob | `patterns` | Array of strings |
| discover (grep) | `pattern` | Single string |
| discover (glob) | `patterns` | Array of strings |

**Issues:**
- Sometimes `pattern` (singular), sometimes `patterns` (plural array)
- Only precision_grep has `pattern_base64` alternative

### Exclusion Patterns

| Tool | Parameter | Type |
|------|-----------|------|
| precision_grep | `queries[].exclude` | Array |
| precision_glob | `exclude` | Array (top-level) |
| discover | (none) | Not supported |

---

## Base64/Alternative Input Support

### Current State

| Tool | Content Param | Base64 Param | File Param |
|------|--------------|--------------|------------|
| precision_write | `content` | `content_base64` | `content_file` |
| precision_grep | `pattern` | `pattern_base64` | (none) |
| precision_edit | `find`, `replace` | (none) | (none) |
| precision_fetch | `body` | (none) | (none) |
| precision_exec | `cmd` | (none) | (none) |

**Issue:** Inconsistent support for complex content. precision_edit notably lacks base64 alternatives despite needing them for complex find/replace patterns.

---

## Other Parameter Inconsistencies

### Timeout Parameter

| Tool | Parameter | Default |
|------|-----------|---------|
| precision_exec | `commands[].timeout` | 60000 |
| precision_fetch | `urls[].timeout` | 30000 |
| batch | `timeout_ms` | (config) |

**Issue:** `timeout` vs `timeout_ms` naming

### Parallel Execution

| Tool | Parameter | Default |
|------|-----------|---------|
| precision_grep | `parallel` | true |
| precision_exec | `parallel` | false |
| precision_fetch | `parallel` | true |

**Issue:** Different defaults for `parallel` parameter

### Dry Run

| Tool | Parameter | Default |
|------|-----------|---------|
| precision_write | `dry_run` | false |
| precision_edit | `dry_run` | false |
| batch | `dry_run` | false |
| batch | `preview` | (also exists) |
| batch_recover.cleanup | `dry_run` | (nested) |

**Issue:** `dry_run` vs `preview` - do these mean the same thing?

### Max Results Limiting

| Tool | Parameters |
|------|------------|
| precision_grep | `output.max_files`, `output.max_matches_per_file`, `output.max_total_matches`, `output.max_tokens` |
| precision_glob | `output.max_files`, `output.max_tokens` |
| precision_symbols | `output.max_results`, `output.max_tokens` |
| precision_read | `output.max_lines_per_file`, `output.max_tokens` |

**Issue:** `max_files` vs `max_results` vs `max_lines_per_file` - inconsistent naming

---

## Recommendations

### 1. Standardize Output Modes

**Proposal:** Separate verbosity from data format:

```typescript
// Verbosity control (all tools, top-level)
output_verbosity: 'count_only' | 'minimal' | 'standard' | 'verbose'

// Data format control (tool-specific, nested if needed)
output.format: <tool-specific values>
```

Or rename to avoid confusion:

```typescript
verbosity: 'count_only' | 'minimal' | 'standard' | 'verbose'  // Was output_mode
output.detail: <tool-specific values>                          // Was output.mode
```

### 2. Standardize Path Parameters

```typescript
// Working directory / base path
base_path: string  // Use everywhere instead of cwd, path

// File path in array items
items[].path: string  // Use everywhere instead of .file
```

### 3. Standardize Pattern Parameters

```typescript
// Single pattern
pattern: string
pattern_base64?: string  // Always provide base64 alternative

// Multiple patterns
patterns: string[]
patterns_base64?: string[]
```

### 4. Add Missing Base64 Alternatives

Add to these tools:
- `precision_edit`: `find_base64`, `replace_base64`
- `precision_fetch`: `body_base64`
- `precision_exec`: `cmd_base64` or `args_base64`

### 5. Standardize Timeout

```typescript
timeout_ms: number  // Use everywhere (not timeout)
```

### 6. Standardize Max Limits

```typescript
output: {
  max_results?: number      // Total result cap (replaces max_files, max_results)
  max_per_item?: number     // Per-file/per-query cap (replaces max_matches_per_file)
  max_tokens?: number       // Token budget
  max_line_length?: number  // Line truncation
}
```

### 7. Clarify dry_run vs preview

Either:
- Remove `preview` and use only `dry_run`
- Or document the semantic difference

---

## Proposed Unified Schema

### Common Parameters (All Tools)

```typescript
interface CommonParams {
  // Verbosity control
  verbosity?: 'count_only' | 'minimal' | 'standard' | 'verbose';  // default: 'standard'

  // Output limits
  output?: {
    max_results?: number;
    max_tokens?: number;
    // Tool-specific fields...
  };

  // Execution control
  dry_run?: boolean;  // default: false
  timeout_ms?: number;
}
```

### Tool-Specific Output Formats

```typescript
// precision_grep
output?: {
  format?: 'count_only' | 'files_only' | 'locations' | 'matches' | 'context';
  context_before?: number;
  context_after?: number;
  max_results?: number;
  max_per_file?: number;
  max_tokens?: number;
  max_line_length?: number;
}

// precision_glob
output?: {
  format?: 'count_only' | 'paths_only' | 'with_stats' | 'with_preview';
  max_results?: number;
  max_tokens?: number;
  sort_by?: 'name' | 'size' | 'modified';
  sort_order?: 'asc' | 'desc';
  preview_lines?: number;
}

// precision_symbols
output?: {
  format?: 'count_only' | 'names_only' | 'locations' | 'signatures' | 'full';
  max_results?: number;
  max_tokens?: number;
  group_by?: 'file' | 'kind' | 'none';
}

// precision_edit
output?: {
  format?: 'count_only' | 'minimal' | 'with_diff' | 'verbose';
  diff_context?: number;
  max_tokens?: number;
}

// discover
output?: {
  format?: 'count_only' | 'files_only' | 'locations';
}
```

### Pattern Input with Base64 Support

```typescript
// Single pattern input (precision_grep, discover grep)
interface PatternInput {
  pattern?: string;
  pattern_base64?: string;  // Alternative for complex patterns
}

// Multi-pattern input (precision_glob, discover glob)
interface PatternsInput {
  patterns?: string[];
  patterns_base64?: string[];
}

// Content input (precision_write, precision_edit)
interface ContentInput {
  content?: string;
  content_base64?: string;
  content_file?: string;
}
```

---

## Summary Table

| Issue | Current State | Recommendation |
|-------|---------------|----------------|
| Output mode location | Mixed (top-level vs nested) | Separate verbosity (top) from format (nested) |
| Output mode values | Overlapping names | Rename: `verbosity` + `output.format` |
| Path parameter names | `base_path`, `cwd`, `path` | Standardize on `base_path` |
| File path in items | `path` vs `file` | Standardize on `path` |
| Pattern naming | `pattern` vs `patterns` | Keep both, add base64 variants everywhere |
| Base64 alternatives | Only some tools | Add to all tools that accept user content |
| Timeout naming | `timeout` vs `timeout_ms` | Standardize on `timeout_ms` |
| Max limits naming | `max_files`, `max_results`, etc. | Standardize: `max_results`, `max_per_item` |
| dry_run vs preview | Both exist in batch | Pick one or document difference |

---

## Implementation Priority

1. **High:** Add `pattern_base64` to precision_edit (find/replace fields) - fixes usability issue
2. **High:** Rename dual output modes to avoid confusion
3. **Medium:** Standardize path parameter names
4. **Medium:** Add base64 alternatives to remaining tools
5. **Low:** Standardize max limit parameter names
6. **Low:** Standardize timeout naming

---

*This document should be updated as changes are implemented.*
